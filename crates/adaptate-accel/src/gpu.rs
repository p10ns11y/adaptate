#[cfg(any(feature = "gpu", test))]
use crate::sha256::sha256_padded_blocks;
use crate::GPU_THRESHOLD_BYTES;

const GPU_PAYLOAD_CAP: usize = 32 * 1024 * 1024;

#[cfg(any(feature = "native", test))]
pub fn adapter_present() -> bool {
    #[cfg(feature = "gpu")]
    {
        return gpu_backend::ready();
    }
    #[cfg(not(feature = "gpu"))]
    {
        false
    }
}

/// CPU-only adapters (for example llvmpipe) are not treated as a GPU.
#[cfg(feature = "gpu")]
pub(crate) fn is_hardware_gpu(device_type: wgpu::DeviceType) -> bool {
    !matches!(device_type, wgpu::DeviceType::Cpu)
}

/// GPU hashing is attempted only for batches of at least 4 MiB.
/// Any probe, shader, or self-check failure returns `None` so the caller uses the CPU.
pub fn sha256_batch_accelerated(payloads: &[&[u8]]) -> Option<Vec<[u8; 32]>> {
    if payloads.is_empty() {
        return None;
    }
    let total_bytes = payloads.iter().map(|payload| payload.len()).sum::<usize>();
    if total_bytes < GPU_THRESHOLD_BYTES {
        return None;
    }
    if payloads
        .iter()
        .any(|payload| payload.len() > GPU_PAYLOAD_CAP)
    {
        return None;
    }
    #[cfg(feature = "gpu")]
    {
        if !gpu_backend::ready() {
            return None;
        }
        return gpu_backend::hash_payloads(payloads);
    }
    #[cfg(not(feature = "gpu"))]
    {
        None
    }
}

#[cfg(feature = "gpu")]
mod gpu_backend {
    use super::pack_messages;
    use crate::sha256::sha256_bytes;
    use std::sync::OnceLock;

    static GPU_READY: OnceLock<bool> = OnceLock::new();

    pub fn ready() -> bool {
        *GPU_READY.get_or_init(|| match hash_payloads(&[b"abc"]) {
            Some(digests) => digests.first().copied() == Some(sha256_bytes(b"abc")),
            None => false,
        })
    }

    pub fn hash_payloads(payloads: &[&[u8]]) -> Option<Vec<[u8; 32]>> {
        if payloads.is_empty() {
            return Some(Vec::new());
        }
        let packed = pack_messages(payloads);
        let (device, queue) = device_queue()?;
        let meta_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("adaptate-meta"),
            contents: &packed.meta_bytes,
            usage: wgpu::BufferUsages::STORAGE,
        });
        let byte_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("adaptate-bytes"),
            contents: &packed.word_bytes,
            usage: wgpu::BufferUsages::STORAGE,
        });
        let digest_size = (payloads.len() * 32) as u64;
        let digest_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("adaptate-digest"),
            size: digest_size,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });
        let staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("adaptate-staging"),
            size: digest_size,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("adaptate-sha256"),
            entries: &[
                storage_entry(0, true),
                storage_entry(1, true),
                storage_entry(2, false),
            ],
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("adaptate-sha256"),
            layout: &bind_group_layout,
            entries: &[
                buffer_entry(0, &meta_buffer),
                buffer_entry(1, &byte_buffer),
                buffer_entry(2, &digest_buffer),
            ],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("adaptate-sha256"),
            source: wgpu::ShaderSource::Wgsl(SHADER.into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("adaptate-sha256"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });
        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("adaptate-sha256"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: Some("main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            cache: None,
        });
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("adaptate-sha256"),
        });
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("adaptate-sha256"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            let groups = (payloads.len() as u32).div_ceil(64).max(1);
            pass.dispatch_workgroups(groups, 1, 1);
        }
        encoder.copy_buffer_to_buffer(&digest_buffer, 0, &staging_buffer, 0, digest_size);
        queue.submit(Some(encoder.finish()));
        let slice = staging_buffer.slice(..);
        let (sender, receiver) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result);
        });
        device.poll(wgpu::Maintain::Wait);
        receiver.recv().ok()?.ok()?;
        let mapped = slice.get_mapped_range();
        let mut digests = Vec::with_capacity(payloads.len());
        for digest_bytes in mapped.chunks_exact(32) {
            let mut digest = [0u8; 32];
            for word_index in 0..8 {
                let start = word_index * 4;
                let word = u32::from_le_bytes(digest_bytes[start..start + 4].try_into().ok()?);
                digest[start..start + 4].copy_from_slice(&word.to_be_bytes());
            }
            digests.push(digest);
        }
        drop(mapped);
        staging_buffer.unmap();
        if digests.len() == payloads.len() {
            Some(digests)
        } else {
            None
        }
    }

    fn device_queue() -> Option<(wgpu::Device, wgpu::Queue)> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::default());
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
        }))?;
        if !super::is_hardware_gpu(adapter.get_info().device_type) {
            return None;
        }
        pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("adaptate-accel"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                memory_hints: wgpu::MemoryHints::Performance,
            },
            None,
        ))
        .ok()
    }

    fn storage_entry(binding: u32, read_only: bool) -> wgpu::BindGroupLayoutEntry {
        wgpu::BindGroupLayoutEntry {
            binding,
            visibility: wgpu::ShaderStages::COMPUTE,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Storage { read_only },
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }
    }

    fn buffer_entry(binding: u32, buffer: &wgpu::Buffer) -> wgpu::BindGroupEntry<'_> {
        wgpu::BindGroupEntry {
            binding,
            resource: buffer.as_entire_binding(),
        }
    }

    use wgpu::util::DeviceExt;

    const SHADER: &str = r#"
const K: array<u32, 64> = array<u32, 64>(
  0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u, 0x3956c25bu, 0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u,
  0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u, 0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u,
  0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu, 0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
  0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u, 0xc6e00bf3u, 0xd5a79147u, 0x06ca6351u, 0x14292967u,
  0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u, 0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
  0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u, 0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
  0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u, 0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu, 0x682e6ff3u,
  0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u, 0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u
);

struct Meta {
  offset: u32,
  length: u32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<storage, read> metas: array<Meta>;
@group(0) @binding(1) var<storage, read> byte_words: array<u32>;
@group(0) @binding(2) var<storage, read_write> digests: array<u32>;

fn rotr(value: u32, shift: u32) -> u32 {
  return (value >> shift) | (value << (32u - shift));
}

fn load_byte(global_byte: u32) -> u32 {
  let word = byte_words[global_byte >> 2u];
  let shift = (global_byte & 3u) * 8u;
  return (word >> shift) & 255u;
}

fn hash_one(meta_index: u32) {
  var state: array<u32, 8>;
  state[0] = 0x6a09e667u;
  state[1] = 0xbb67ae85u;
  state[2] = 0x3c6ef372u;
  state[3] = 0xa54ff53au;
  state[4] = 0x510e527fu;
  state[5] = 0x9b05688cu;
  state[6] = 0x1f83d9abu;
  state[7] = 0x5be0cd19u;
  let byte_offset = metas[meta_index].offset;
  let byte_length = metas[meta_index].length;
  let block_count = byte_length / 64u;
  for (var block: u32 = 0u; block < block_count; block = block + 1u) {
    var schedule: array<u32, 64>;
    for (var word_index: u32 = 0u; word_index < 16u; word_index = word_index + 1u) {
      let base = byte_offset + block * 64u + word_index * 4u;
      let b0 = load_byte(base);
      let b1 = load_byte(base + 1u);
      let b2 = load_byte(base + 2u);
      let b3 = load_byte(base + 3u);
      schedule[word_index] = (b0 << 24u) | (b1 << 16u) | (b2 << 8u) | b3;
    }
    for (var word_index: u32 = 16u; word_index < 64u; word_index = word_index + 1u) {
      let earlier = schedule[word_index - 15u];
      let recent = schedule[word_index - 2u];
      let small = rotr(earlier, 7u) ^ rotr(earlier, 18u) ^ (earlier >> 3u);
      let large = rotr(recent, 17u) ^ rotr(recent, 19u) ^ (recent >> 10u);
      schedule[word_index] = schedule[word_index - 16u] + small + schedule[word_index - 7u] + large;
    }
    var a = state[0];
    var b = state[1];
    var c = state[2];
    var d = state[3];
    var e = state[4];
    var f = state[5];
    var g = state[6];
    var h = state[7];
    for (var round: u32 = 0u; round < 64u; round = round + 1u) {
      let sum1 = rotr(e, 6u) ^ rotr(e, 11u) ^ rotr(e, 25u);
      let choose = (e & f) ^ ((~e) & g);
      let temp1 = h + sum1 + choose + K[round] + schedule[round];
      let sum0 = rotr(a, 2u) ^ rotr(a, 13u) ^ rotr(a, 22u);
      let majority = (a & b) ^ (a & c) ^ (b & c);
      h = g;
      g = f;
      f = e;
      e = d + temp1;
      d = c;
      c = b;
      b = a;
      a = temp1 + sum0 + majority;
    }
    state[0] = state[0] + a;
    state[1] = state[1] + b;
    state[2] = state[2] + c;
    state[3] = state[3] + d;
    state[4] = state[4] + e;
    state[5] = state[5] + f;
    state[6] = state[6] + g;
    state[7] = state[7] + h;
  }
  for (var word_index: u32 = 0u; word_index < 8u; word_index = word_index + 1u) {
    digests[meta_index * 8u + word_index] = state[word_index];
  }
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let index = invocation.x;
  if (index >= arrayLength(&metas)) {
    return;
  }
  hash_one(index);
}
"#;
}

#[cfg(any(feature = "gpu", test))]
struct PackedMessages {
    meta_bytes: Vec<u8>,
    word_bytes: Vec<u8>,
}

#[cfg(any(feature = "gpu", test))]
fn pack_messages(payloads: &[&[u8]]) -> PackedMessages {
    let mut raw = Vec::new();
    let mut meta_words = Vec::new();
    for payload in payloads {
        let padded = sha256_padded_blocks(payload);
        let offset = raw.len() as u32;
        let length = padded.len() as u32;
        meta_words.extend_from_slice(&[offset, length, 0, 0]);
        raw.extend_from_slice(&padded);
    }
    let mut word_bytes = Vec::with_capacity(raw.len());
    let mut index = 0usize;
    while index < raw.len() {
        let first = raw[index] as u32;
        let second = raw.get(index + 1).copied().unwrap_or(0) as u32;
        let third = raw.get(index + 2).copied().unwrap_or(0) as u32;
        let fourth = raw.get(index + 3).copied().unwrap_or(0) as u32;
        let word = first | (second << 8) | (third << 16) | (fourth << 24);
        word_bytes.extend_from_slice(&word.to_le_bytes());
        index += 4;
    }
    let mut meta_bytes = Vec::with_capacity(meta_words.len() * 4);
    for word in meta_words {
        meta_bytes.extend_from_slice(&word.to_le_bytes());
    }
    PackedMessages {
        meta_bytes,
        word_bytes,
    }
}

#[cfg(test)]
mod tests {
    use super::sha256_batch_accelerated;

    #[test]
    fn small_batches_skip_the_gpu_path() {
        assert!(sha256_batch_accelerated(&[]).is_none());
        assert!(sha256_batch_accelerated(&[b"abc"]).is_none());
    }

    #[test]
    fn oversized_single_payload_skips_the_gpu_path() {
        let huge = vec![0u8; super::GPU_PAYLOAD_CAP + 1];
        assert!(sha256_batch_accelerated(&[&huge]).is_none());
    }

    #[test]
    fn adapter_present_reports_host_gpu_support() {
        let present = super::adapter_present();
        #[cfg(not(feature = "gpu"))]
        assert!(!present);
        #[cfg(feature = "gpu")]
        let _ = present;
    }

    #[test]
    fn pack_messages_records_block_offset_and_padded_words() {
        let packed = super::pack_messages(&[b"abc"]);
        let mut expected_meta = Vec::new();
        expected_meta.extend_from_slice(&0u32.to_le_bytes());
        expected_meta.extend_from_slice(&64u32.to_le_bytes());
        expected_meta.extend_from_slice(&0u32.to_le_bytes());
        expected_meta.extend_from_slice(&0u32.to_le_bytes());
        assert_eq!(packed.meta_bytes, expected_meta);
        assert_eq!(packed.word_bytes.len(), 64);
        assert_eq!(&packed.word_bytes[..4], b"abc\x80");
        assert_eq!(packed.word_bytes[63], 24);

        let pair = super::pack_messages(&[b"abc", b""]);
        assert_eq!(&pair.meta_bytes[..4], &0u32.to_le_bytes());
        assert_eq!(&pair.meta_bytes[4..8], &64u32.to_le_bytes());
        assert_eq!(&pair.meta_bytes[16..20], &64u32.to_le_bytes());
        assert_eq!(&pair.meta_bytes[20..24], &64u32.to_le_bytes());
        assert_eq!(pair.word_bytes.len(), 128);

        let empty = super::pack_messages(&[]);
        assert!(empty.meta_bytes.is_empty());
        assert!(empty.word_bytes.is_empty());
    }
}

#[cfg(all(test, feature = "gpu"))]
mod hardware_tests {
    #[test]
    fn cpu_adapters_are_rejected() {
        assert!(!super::is_hardware_gpu(wgpu::DeviceType::Cpu));
        assert!(super::is_hardware_gpu(wgpu::DeviceType::DiscreteGpu));
        assert!(super::is_hardware_gpu(wgpu::DeviceType::IntegratedGpu));
        assert!(super::is_hardware_gpu(wgpu::DeviceType::VirtualGpu));
        assert!(super::is_hardware_gpu(wgpu::DeviceType::Other));
    }
}
