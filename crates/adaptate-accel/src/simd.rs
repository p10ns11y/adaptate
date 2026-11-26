/// Longest prefix of bytes that are ASCII (`0x00..=0x7F`).
pub fn ascii_run_length(chunk: &[u8]) -> usize {
    #[cfg(target_arch = "x86_64")]
    {
        // SAFETY: every x86_64 CPU implements SSE2.
        return unsafe { ascii_run_length_sse2(chunk) };
    }
    #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
    {
        // SAFETY: this target was compiled with `simd128`.
        return unsafe { ascii_run_length_simd128(chunk) };
    }
    #[cfg(not(any(
        target_arch = "x86_64",
        all(target_arch = "wasm32", target_feature = "simd128")
    )))]
    {
        ascii_run_length_scalar(chunk)
    }
}

pub fn ascii_run_length_scalar(chunk: &[u8]) -> usize {
    match chunk.iter().position(|byte| *byte >= 0x80) {
        Some(position) => position,
        None => chunk.len(),
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse2")]
unsafe fn ascii_run_length_sse2(chunk: &[u8]) -> usize {
    use core::arch::x86_64::{
        __m128i, _mm_cmpgt_epi8, _mm_loadu_si128, _mm_movemask_epi8, _mm_set1_epi8,
    };

    let mut index = 0usize;
    let zero = _mm_set1_epi8(0);
    while index + 16 <= chunk.len() {
        // SAFETY: `index + 16` is inside `chunk`, so the 16-byte load stays in bounds.
        let vector = unsafe { _mm_loadu_si128(chunk.as_ptr().add(index) as *const __m128i) };
        let non_ascii = _mm_movemask_epi8(_mm_cmpgt_epi8(zero, vector));
        if non_ascii != 0 {
            return index + non_ascii.trailing_zeros() as usize;
        }
        index += 16;
    }
    index + ascii_run_length_scalar(&chunk[index..])
}

#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
#[target_feature(enable = "simd128")]
unsafe fn ascii_run_length_simd128(chunk: &[u8]) -> usize {
    use core::arch::wasm32::{u8x16_bitmask, u8x16_lt, u8x16_splat, v128_load};

    let mut index = 0usize;
    let ascii_limit = u8x16_splat(0x80);
    while index + 16 <= chunk.len() {
        // SAFETY: the 16-byte window is inside `chunk`.
        let vector = unsafe { v128_load(chunk.as_ptr().add(index) as *const _) };
        let ascii_mask = u8x16_bitmask(u8x16_lt(vector, ascii_limit));
        if ascii_mask != 0xffff {
            let first_non_ascii = (!ascii_mask).trailing_zeros() as usize;
            return index + first_non_ascii;
        }
        index += 16;
    }
    index + ascii_run_length_scalar(&chunk[index..])
}

#[cfg(test)]
mod tests {
    use super::{ascii_run_length, ascii_run_length_scalar};

    #[test]
    fn simd_run_matches_the_scalar_walk() {
        let samples: [&[u8]; 6] = [
            b"",
            b"abcdef",
            b"0123456789abcdef",
            b"0123456789abcdefG",
            b"\x80rest",
            &[0x20u8; 40],
        ];
        for sample in samples {
            assert_eq!(ascii_run_length(sample), ascii_run_length_scalar(sample));
        }
        let mut mixed = vec![0x41u8; 31];
        mixed.push(0xC3);
        mixed.extend_from_slice(&[0xA9, 0x21]);
        assert_eq!(ascii_run_length(&mixed), ascii_run_length_scalar(&mixed));
        assert_eq!(ascii_run_length(&mixed), 31);
    }
}
