//! In-memory acceleration core for streaming UTF-8 JSON and manifest checks.
//!
//! The library never opens or writes payload files. Callers pass bytes and receive a result.

mod ffi;
mod gpu;
mod json_scan;
mod native;
mod sha256;
mod simd;
mod utf8;
mod verify;
mod wasm_api;

pub use json_scan::{JsonValue, ScanError, ScanSnapshot, ScanStatus, StreamScanner, MAX_DEPTH};
pub use sha256::{sha256_bytes, sha256_hex, sha256_padded_blocks};
pub use utf8::{Utf8Carry, Utf8DecodeError};
pub use verify::{
    verify_batch, verify_in_memory, BatchItem, PayloadObservation, VerifyFailure, VerifyManifest,
    VerifySuccess,
};

/// Inputs smaller than this stay on the pure interpreter path in `@adaptate/accel`.
pub const SMALL_THRESHOLD_BYTES: usize = 32 * 1024;

/// Parallel GPU hashing is considered only at or above this size.
pub const GPU_THRESHOLD_BYTES: usize = 4 * 1024 * 1024;

/// Compile-time view of optional acceleration features.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CompiledCapabilities {
    pub gpu: bool,
    pub native: bool,
    pub wasm_bindgen: bool,
}

pub fn compiled_capabilities() -> CompiledCapabilities {
    CompiledCapabilities {
        gpu: cfg!(feature = "gpu"),
        native: cfg!(feature = "native"),
        wasm_bindgen: cfg!(feature = "wasm"),
    }
}
