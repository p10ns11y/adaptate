use crate::json_scan::{JsonValue, ScanError, ScanSnapshot, ScanStatus, StreamScanner};
use crate::sha256::sha256_hex;
use crate::verify::{
    verify_batch, verify_in_memory, BatchItem, PayloadObservation, VerifyFailure, VerifyManifest,
    VerifySuccess,
};

pub(crate) fn snapshot_to_json(snapshot: &ScanSnapshot) -> String {
    let mut output = String::from("{\"status\":");
    push_json_string(
        &mut output,
        match snapshot.status {
            ScanStatus::Pending => "pending",
            ScanStatus::Ready => "ready",
            ScanStatus::Error => "error",
        },
    );
    output.push_str(",\"reason\":");
    match snapshot.reason {
        Some(reason) => push_json_string(&mut output, scan_reason(reason)),
        None => output.push_str("null"),
    }
    output.push_str(",\"values\":[");
    for (index, value) in snapshot.values.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        push_json_value(&mut output, value);
    }
    output.push_str("]}");
    output
}

pub(crate) fn verify_payload_json(
    payload: &[u8],
    manifest_json: &str,
    observed_json: &str,
) -> String {
    let manifest = match parse_manifest_text(manifest_json) {
        Ok(manifest) => manifest,
        Err(failure) => return failure_json(&failure),
    };
    let observed = match parse_observed_text(observed_json) {
        Ok(observed) => observed,
        Err(failure) => return failure_json(&failure),
    };
    result_json(&verify_in_memory(payload, &manifest, &observed))
}

#[cfg_attr(not(feature = "native"), allow(dead_code))]
pub(crate) fn verify_many_json(
    payloads: &[&[u8]],
    manifest_json: &[String],
    observed_json: &[String],
) -> String {
    if payloads.len() != manifest_json.len() || payloads.len() != observed_json.len() {
        return format!("[{}]", failure_json(&VerifyFailure::InvalidManifest));
    }
    let mut manifests = Vec::with_capacity(payloads.len());
    let mut observations = Vec::with_capacity(payloads.len());
    for index in 0..payloads.len() {
        match parse_manifest_text(&manifest_json[index]) {
            Ok(manifest) => manifests.push(manifest),
            Err(failure) => return format!("[{}]", failure_json(&failure)),
        }
        match parse_observed_text(&observed_json[index]) {
            Ok(observed) => observations.push(observed),
            Err(failure) => return format!("[{}]", failure_json(&failure)),
        }
    }
    let items: Vec<BatchItem<'_>> = payloads
        .iter()
        .enumerate()
        .map(|(index, payload)| BatchItem {
            payload,
            manifest: &manifests[index],
            observed: &observations[index],
        })
        .collect();
    let results = verify_batch(&items);
    let mut output = String::from("[");
    for (index, result) in results.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        output.push_str(&result_json(result));
    }
    output.push(']');
    output
}

fn scan_reason(reason: ScanError) -> &'static str {
    match reason {
        ScanError::InvalidUtf8 => "invalid-utf8",
        ScanError::TruncatedUtf8 => "truncated-utf8",
        ScanError::InvalidJson => "invalid-json",
        ScanError::TruncatedJson => "truncated-json",
    }
}

fn result_json(result: &Result<VerifySuccess, VerifyFailure>) -> String {
    match result {
        Ok(success) => format!(
            "{{\"ok\":true,\"sha256\":\"{}\",\"byteLength\":{}}}",
            success.sha256, success.byte_length
        ),
        Err(failure) => failure_json(failure),
    }
}

fn failure_json(failure: &VerifyFailure) -> String {
    match failure {
        VerifyFailure::MissingDigest => "{\"ok\":false,\"reason\":\"missing-digest\"}".to_string(),
        VerifyFailure::InvalidDigest => "{\"ok\":false,\"reason\":\"invalid-digest\"}".to_string(),
        VerifyFailure::InvalidManifest => "{\"ok\":false,\"reason\":\"invalid-manifest\"}".to_string(),
        VerifyFailure::HashMismatch { expected, actual } => format!(
            "{{\"ok\":false,\"reason\":\"hash-mismatch\",\"expected\":\"{expected}\",\"actual\":\"{actual}\"}}"
        ),
        VerifyFailure::SizeMismatch { actual, expected } => format!(
            "{{\"ok\":false,\"reason\":\"size-mismatch\",\"actual\":{actual},\"expected\":{expected}}}"
        ),
        VerifyFailure::SizeBelowMin { actual, min } => format!(
            "{{\"ok\":false,\"reason\":\"size-below-min\",\"actual\":{actual},\"min\":{min}}}"
        ),
        VerifyFailure::SizeAboveMax { actual, max } => format!(
            "{{\"ok\":false,\"reason\":\"size-above-max\",\"actual\":{actual},\"max\":{max}}}"
        ),
        VerifyFailure::MimeMismatch { expected, actual } => {
            let mut output = String::from("{\"ok\":false,\"reason\":\"mime-mismatch\",\"expected\":");
            push_json_string(&mut output, expected);
            output.push_str(",\"actual\":");
            push_optional_string(&mut output, actual.as_deref());
            output.push('}');
            output
        }
        VerifyFailure::FilenameMismatch { expected, actual } => {
            let mut output = String::from("{\"ok\":false,\"reason\":\"filename-mismatch\",\"expected\":");
            push_json_string(&mut output, expected);
            output.push_str(",\"actual\":");
            push_optional_string(&mut output, actual.as_deref());
            output.push('}');
            output
        }
    }
}

fn parse_manifest_text(text: &str) -> Result<VerifyManifest, VerifyFailure> {
    let value = one_json_value(text)?;
    let JsonValue::Object(fields) = value else {
        return Err(VerifyFailure::InvalidManifest);
    };
    let mut sha256 = None;
    let mut min_bytes = None;
    let mut max_bytes = None;
    let mut exact_bytes = None;
    let mut mime = None;
    let mut filename = None;
    for (key, field_value) in &fields {
        match key.as_str() {
            "sha256" => {
                sha256 = Some(match field_value {
                    JsonValue::String(digest) => digest.clone(),
                    JsonValue::Null => String::new(),
                    _ => return Err(VerifyFailure::InvalidDigest),
                });
            }
            "minBytes" => min_bytes = Some(json_size(field_value)?),
            "maxBytes" => max_bytes = Some(json_size(field_value)?),
            "exactBytes" => exact_bytes = Some(json_size(field_value)?),
            "mime" => mime = json_string_field(field_value)?,
            "filename" => filename = json_string_field(field_value)?,
            _ => return Err(VerifyFailure::InvalidManifest),
        }
    }
    let Some(digest) = sha256 else {
        return Err(VerifyFailure::MissingDigest);
    };
    Ok(VerifyManifest {
        sha256: digest,
        min_bytes,
        max_bytes,
        exact_bytes,
        mime,
        filename,
    })
}

fn parse_observed_text(text: &str) -> Result<PayloadObservation, VerifyFailure> {
    if text.trim().is_empty() {
        return Ok(PayloadObservation::default());
    }
    let value = one_json_value(text)?;
    let JsonValue::Object(fields) = value else {
        return Err(VerifyFailure::InvalidManifest);
    };
    let mut observed = PayloadObservation::default();
    for (key, field_value) in &fields {
        match key.as_str() {
            "mime" => observed.mime = json_string_field(field_value)?,
            "filename" => observed.filename = json_string_field(field_value)?,
            _ => return Err(VerifyFailure::InvalidManifest),
        }
    }
    Ok(observed)
}

fn json_string_field(value: &JsonValue) -> Result<Option<String>, VerifyFailure> {
    match value {
        JsonValue::Null => Ok(None),
        JsonValue::String(text) => Ok(Some(text.clone())),
        _ => Err(VerifyFailure::InvalidManifest),
    }
}

fn json_size(value: &JsonValue) -> Result<u64, VerifyFailure> {
    let JsonValue::Number(number) = value else {
        return Err(VerifyFailure::InvalidManifest);
    };
    if !number.is_finite() || *number < 0.0 || number.fract() != 0.0 {
        return Err(VerifyFailure::InvalidManifest);
    }
    if *number > (1u64 << 53) as f64 {
        return Err(VerifyFailure::InvalidManifest);
    }
    Ok(*number as u64)
}

fn one_json_value(text: &str) -> Result<JsonValue, VerifyFailure> {
    let mut scanner = StreamScanner::new();
    let pushed = scanner.push(text.as_bytes());
    let snapshot = if pushed.status == ScanStatus::Ready {
        pushed
    } else {
        scanner.finish()
    };
    if snapshot.status != ScanStatus::Ready || snapshot.values.len() != 1 {
        return Err(VerifyFailure::InvalidManifest);
    }
    Ok(snapshot
        .values
        .into_iter()
        .next()
        .unwrap_or(JsonValue::Null))
}

fn push_optional_string(output: &mut String, value: Option<&str>) {
    match value {
        Some(text) => push_json_string(output, text),
        None => output.push_str("null"),
    }
}

fn push_json_string(output: &mut String, text: &str) {
    output.push('"');
    for character in text.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\u{0008}' => output.push_str("\\b"),
            '\u{000c}' => output.push_str("\\f"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            other if (other as u32) < 0x20 => {
                output.push_str(&format!("\\u{:04x}", other as u32));
            }
            other => output.push(other),
        }
    }
    output.push('"');
}

fn push_json_value(output: &mut String, value: &JsonValue) {
    match value {
        JsonValue::Null => output.push_str("null"),
        JsonValue::Boolean(flag) => output.push_str(if *flag { "true" } else { "false" }),
        JsonValue::Number(number) => {
            if number.is_finite() {
                output.push_str(&format!("{number}"));
            } else {
                output.push_str("null");
            }
        }
        JsonValue::String(text) => push_json_string(output, text),
        JsonValue::Array(items) => {
            output.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                push_json_value(output, item);
            }
            output.push(']');
        }
        JsonValue::Object(fields) => {
            output.push('{');
            for (index, (key, field_value)) in fields.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                push_json_string(output, key);
                output.push(':');
                push_json_value(output, field_value);
            }
            output.push('}');
        }
    }
}

fn write_text(text: &str, out_ptr: *mut u8, out_cap: usize) -> i32 {
    let bytes = text.as_bytes();
    if bytes.len() > i32::MAX as usize || out_ptr.is_null() || out_cap < bytes.len() {
        return -1;
    }
    // SAFETY: `out_ptr` is non-null and `out_cap` covers `bytes.len()` bytes.
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), out_ptr, bytes.len());
    }
    bytes.len() as i32
}

fn read_bytes<'a>(ptr: *const u8, len: usize) -> Option<&'a [u8]> {
    if len == 0 {
        return Some(&[]);
    }
    if ptr.is_null() {
        return None;
    }
    // SAFETY: callers pass a pointer and length for one live allocation of at least `len` bytes.
    Some(unsafe { std::slice::from_raw_parts(ptr, len) })
}

fn read_text<'a>(ptr: *const u8, len: usize) -> Option<&'a str> {
    let bytes = read_bytes(ptr, len)?;
    std::str::from_utf8(bytes).ok()
}

#[no_mangle]
pub extern "C" fn adaptate_alloc(size: usize) -> *mut u8 {
    let capacity = size.max(1);
    let mut buffer = Vec::<u8>::with_capacity(capacity);
    let ptr = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    ptr
}

#[no_mangle]
pub extern "C" fn adaptate_dealloc(ptr: *mut u8, size: usize) {
    if ptr.is_null() {
        return;
    }
    let capacity = size.max(1);
    // SAFETY: `ptr` came from `adaptate_alloc` with the same size.
    unsafe {
        drop(Vec::from_raw_parts(ptr, 0, capacity));
    }
}

#[no_mangle]
pub extern "C" fn adaptate_sha256(ptr: *const u8, len: usize, out_ptr: *mut u8) -> i32 {
    let Some(payload) = read_bytes(ptr, len) else {
        return -1;
    };
    if out_ptr.is_null() {
        return -1;
    }
    let encoded = sha256_hex(payload);
    // SAFETY: the caller provides 64 writable bytes at `out_ptr`.
    unsafe {
        std::ptr::copy_nonoverlapping(encoded.as_ptr(), out_ptr, 64);
    }
    64
}

#[no_mangle]
pub extern "C" fn adaptate_verify(
    payload_ptr: *const u8,
    payload_len: usize,
    manifest_ptr: *const u8,
    manifest_len: usize,
    observed_ptr: *const u8,
    observed_len: usize,
    out_ptr: *mut u8,
    out_cap: usize,
) -> i32 {
    let Some(payload) = read_bytes(payload_ptr, payload_len) else {
        return -1;
    };
    let Some(manifest_json) = read_text(manifest_ptr, manifest_len) else {
        return -1;
    };
    let Some(observed_json) = read_text(observed_ptr, observed_len) else {
        return -1;
    };
    let encoded = verify_payload_json(payload, manifest_json, observed_json);
    write_text(&encoded, out_ptr, out_cap)
}

#[no_mangle]
pub extern "C" fn adaptate_scanner_new() -> *mut StreamScanner {
    Box::into_raw(Box::new(StreamScanner::new()))
}

#[no_mangle]
pub extern "C" fn adaptate_scanner_free(scanner: *mut StreamScanner) {
    if scanner.is_null() {
        return;
    }
    // SAFETY: `scanner` came from `adaptate_scanner_new` and is freed once.
    unsafe {
        drop(Box::from_raw(scanner));
    }
}

#[no_mangle]
pub extern "C" fn adaptate_scanner_push(
    scanner: *mut StreamScanner,
    chunk_ptr: *const u8,
    chunk_len: usize,
    out_ptr: *mut u8,
    out_cap: usize,
) -> i32 {
    let Some(chunk) = read_bytes(chunk_ptr, chunk_len) else {
        return -1;
    };
    if scanner.is_null() {
        return -1;
    }
    // SAFETY: `scanner` is a live pointer from `adaptate_scanner_new`.
    let snapshot = unsafe { (*scanner).push(chunk) };
    write_text(&snapshot_to_json(&snapshot), out_ptr, out_cap)
}

#[no_mangle]
pub extern "C" fn adaptate_scanner_finish(
    scanner: *mut StreamScanner,
    out_ptr: *mut u8,
    out_cap: usize,
) -> i32 {
    if scanner.is_null() {
        return -1;
    }
    // SAFETY: `scanner` is a live pointer from `adaptate_scanner_new`.
    let snapshot = unsafe { (*scanner).finish() };
    write_text(&snapshot_to_json(&snapshot), out_ptr, out_cap)
}

#[no_mangle]
pub extern "C" fn adaptate_gpu_threshold() -> usize {
    crate::GPU_THRESHOLD_BYTES
}

#[cfg(test)]
mod tests {
    use super::{
        adaptate_alloc, adaptate_dealloc, adaptate_scanner_finish, adaptate_scanner_free,
        adaptate_scanner_new, adaptate_scanner_push, adaptate_sha256, adaptate_verify,
        verify_payload_json,
    };
    use crate::sha256::sha256_hex;

    #[test]
    fn c_abi_hashes_scans_and_rejects_a_bad_manifest() {
        let payload = b"synthetic-payload";
        let mut digest = [0u8; 64];
        let written = adaptate_sha256(payload.as_ptr(), payload.len(), digest.as_mut_ptr());
        assert_eq!(written, 64);
        let encoded = std::str::from_utf8(&digest).unwrap();
        assert_eq!(encoded, sha256_hex(payload));
        assert_eq!(
            adaptate_sha256(std::ptr::null(), 4, digest.as_mut_ptr()),
            -1
        );

        let manifest = format!("{{\"sha256\":\"{}\"}}", sha256_hex(payload));
        let mut output = vec![0u8; 256];
        let verify_len = adaptate_verify(
            payload.as_ptr(),
            payload.len(),
            manifest.as_ptr(),
            manifest.len(),
            std::ptr::null(),
            0,
            output.as_mut_ptr(),
            output.len(),
        );
        assert!(verify_len > 0);
        let verify_text = std::str::from_utf8(&output[..verify_len as usize]).unwrap();
        assert!(verify_text.contains("\"ok\":true"));
        assert!(verify_payload_json(payload, "{\"nope\":1}", "").contains("invalid-manifest"));
        assert!(verify_payload_json(payload, "{\"sha256\":1}", "").contains("invalid-digest"));
        assert!(
            verify_payload_json(payload, "{\"sha256\":\"aa\",\"minBytes\":1.5}", "")
                .contains("invalid-manifest")
        );

        let scanner = adaptate_scanner_new();
        let chunk = br#"{"title":"Pas"#;
        let mut scan_out = vec![0u8; 128];
        let pending_len = adaptate_scanner_push(
            scanner,
            chunk.as_ptr(),
            chunk.len(),
            scan_out.as_mut_ptr(),
            scan_out.len(),
        );
        let pending = std::str::from_utf8(&scan_out[..pending_len as usize]).unwrap();
        assert!(pending.contains("\"pending\""));
        let tiny = adaptate_scanner_finish(scanner, scan_out.as_mut_ptr(), 1);
        assert_eq!(tiny, -1);
        let finished_len = adaptate_scanner_finish(scanner, scan_out.as_mut_ptr(), scan_out.len());
        let finished = std::str::from_utf8(&scan_out[..finished_len as usize]).unwrap();
        assert!(finished.contains("truncated-json"));
        adaptate_scanner_free(scanner);
        adaptate_scanner_free(std::ptr::null_mut());
        assert_eq!(
            adaptate_scanner_push(
                std::ptr::null_mut(),
                chunk.as_ptr(),
                chunk.len(),
                scan_out.as_mut_ptr(),
                scan_out.len()
            ),
            -1
        );

        let allocated = adaptate_alloc(8);
        assert!(!allocated.is_null());
        adaptate_dealloc(allocated, 8);
        adaptate_dealloc(std::ptr::null_mut(), 0);
    }
}
