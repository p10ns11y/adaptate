//! Manifest checks run on the caller's buffer. This module does not open or write files.

use crate::gpu::sha256_batch_accelerated;
use crate::sha256::{sha256_bytes, sha256_hex};
use crate::{GPU_THRESHOLD_BYTES, SMALL_THRESHOLD_BYTES};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifyManifest {
    pub sha256: String,
    pub min_bytes: Option<u64>,
    pub max_bytes: Option<u64>,
    pub exact_bytes: Option<u64>,
    pub mime: Option<String>,
    pub filename: Option<String>,
}

impl Default for VerifyManifest {
    fn default() -> Self {
        Self {
            sha256: String::new(),
            min_bytes: None,
            max_bytes: None,
            exact_bytes: None,
            mime: None,
            filename: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PayloadObservation {
    pub mime: Option<String>,
    pub filename: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifySuccess {
    pub sha256: String,
    pub byte_length: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VerifyFailure {
    MissingDigest,
    InvalidDigest,
    InvalidManifest,
    HashMismatch {
        expected: String,
        actual: String,
    },
    SizeMismatch {
        actual: u64,
        expected: u64,
    },
    SizeBelowMin {
        actual: u64,
        min: u64,
    },
    SizeAboveMax {
        actual: u64,
        max: u64,
    },
    MimeMismatch {
        expected: String,
        actual: Option<String>,
    },
    FilenameMismatch {
        expected: String,
        actual: Option<String>,
    },
}

pub struct BatchItem<'a> {
    pub payload: &'a [u8],
    pub manifest: &'a VerifyManifest,
    pub observed: &'a PayloadObservation,
}

pub fn verify_in_memory(
    payload: &[u8],
    manifest: &VerifyManifest,
    observed: &PayloadObservation,
) -> Result<VerifySuccess, VerifyFailure> {
    check_manifest_shape(manifest)?;
    check_metadata(payload.len() as u64, manifest, observed)?;
    let actual = sha256_hex(payload);
    compare_digest(&actual, manifest, payload.len() as u64)
}

pub(crate) fn verify_with_digest(
    payload: &[u8],
    manifest: &VerifyManifest,
    observed: &PayloadObservation,
    digest: [u8; 32],
) -> Result<VerifySuccess, VerifyFailure> {
    check_manifest_shape(manifest)?;
    check_metadata(payload.len() as u64, manifest, observed)?;
    compare_digest(&encode_hex(&digest), manifest, payload.len() as u64)
}

pub fn verify_batch(items: &[BatchItem<'_>]) -> Vec<Result<VerifySuccess, VerifyFailure>> {
    if items.is_empty() {
        return Vec::new();
    }
    let total_bytes = items.iter().map(|item| item.payload.len()).sum::<usize>();
    if total_bytes >= GPU_THRESHOLD_BYTES {
        let payloads: Vec<&[u8]> = items.iter().map(|item| item.payload).collect();
        if let Some(digests) = sha256_batch_accelerated(&payloads) {
            if digests.len() == items.len() {
                let canary = sha256_bytes(items[0].payload);
                if digests[0] == canary {
                    return items
                        .iter()
                        .zip(digests)
                        .map(|(item, digest)| {
                            verify_with_digest(item.payload, item.manifest, item.observed, digest)
                        })
                        .collect();
                }
            }
        }
    }
    if items.len() >= 2 && total_bytes >= SMALL_THRESHOLD_BYTES {
        return verify_batch_on_workers(items);
    }
    items
        .iter()
        .map(|item| verify_in_memory(item.payload, item.manifest, item.observed))
        .collect()
}

#[cfg(not(target_arch = "wasm32"))]
fn verify_batch_on_workers(items: &[BatchItem<'_>]) -> Vec<Result<VerifySuccess, VerifyFailure>> {
    let mut results = Vec::with_capacity(items.len());
    std::thread::scope(|scope| {
        let mut handles = Vec::with_capacity(items.len());
        for item in items {
            handles
                .push(scope.spawn(|| verify_in_memory(item.payload, item.manifest, item.observed)));
        }
        for handle in handles {
            results.push(match handle.join() {
                Ok(result) => result,
                Err(_panic_payload) => Err(VerifyFailure::InvalidManifest),
            });
        }
    });
    results
}

#[cfg(target_arch = "wasm32")]
fn verify_batch_on_workers(items: &[BatchItem<'_>]) -> Vec<Result<VerifySuccess, VerifyFailure>> {
    items
        .iter()
        .map(|item| verify_in_memory(item.payload, item.manifest, item.observed))
        .collect()
}

fn check_manifest_shape(manifest: &VerifyManifest) -> Result<(), VerifyFailure> {
    let digest = manifest.sha256.trim();
    if digest.is_empty() {
        return Err(VerifyFailure::MissingDigest);
    }
    if digest.len() != 64 || !digest.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(VerifyFailure::InvalidDigest);
    }
    if let (Some(min_bytes), Some(max_bytes)) = (manifest.min_bytes, manifest.max_bytes) {
        if min_bytes > max_bytes {
            return Err(VerifyFailure::InvalidManifest);
        }
    }
    if let Some(exact_bytes) = manifest.exact_bytes {
        if let Some(min_bytes) = manifest.min_bytes {
            if exact_bytes < min_bytes {
                return Err(VerifyFailure::InvalidManifest);
            }
        }
        if let Some(max_bytes) = manifest.max_bytes {
            if exact_bytes > max_bytes {
                return Err(VerifyFailure::InvalidManifest);
            }
        }
    }
    Ok(())
}

fn check_metadata(
    actual_length: u64,
    manifest: &VerifyManifest,
    observed: &PayloadObservation,
) -> Result<(), VerifyFailure> {
    if let Some(exact_bytes) = manifest.exact_bytes {
        if actual_length != exact_bytes {
            return Err(VerifyFailure::SizeMismatch {
                actual: actual_length,
                expected: exact_bytes,
            });
        }
    }
    if let Some(min_bytes) = manifest.min_bytes {
        if actual_length < min_bytes {
            return Err(VerifyFailure::SizeBelowMin {
                actual: actual_length,
                min: min_bytes,
            });
        }
    }
    if let Some(max_bytes) = manifest.max_bytes {
        if actual_length > max_bytes {
            return Err(VerifyFailure::SizeAboveMax {
                actual: actual_length,
                max: max_bytes,
            });
        }
    }
    if let Some(expected_mime) = &manifest.mime {
        match &observed.mime {
            Some(actual_mime) if mime_matches(expected_mime, actual_mime) => {}
            actual_mime => {
                return Err(VerifyFailure::MimeMismatch {
                    expected: expected_mime.clone(),
                    actual: actual_mime.clone(),
                });
            }
        }
    }
    if let Some(expected_filename) = &manifest.filename {
        match &observed.filename {
            Some(actual_filename) if actual_filename == expected_filename => {}
            actual_filename => {
                return Err(VerifyFailure::FilenameMismatch {
                    expected: expected_filename.clone(),
                    actual: actual_filename.clone(),
                });
            }
        }
    }
    Ok(())
}

fn compare_digest(
    actual: &str,
    manifest: &VerifyManifest,
    byte_length: u64,
) -> Result<VerifySuccess, VerifyFailure> {
    let expected = manifest.sha256.trim().to_ascii_lowercase();
    if !actual.eq_ignore_ascii_case(&expected) {
        return Err(VerifyFailure::HashMismatch {
            expected,
            actual: actual.to_string(),
        });
    }
    Ok(VerifySuccess {
        sha256: actual.to_string(),
        byte_length,
    })
}

fn mime_matches(expected: &str, actual: &str) -> bool {
    expected.trim().eq_ignore_ascii_case(actual.trim())
}

fn encode_hex(digest: &[u8; 32]) -> String {
    const HEX_DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(64);
    for byte in digest {
        encoded.push(HEX_DIGITS[(byte >> 4) as usize] as char);
        encoded.push(HEX_DIGITS[(byte & 0x0f) as usize] as char);
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::{
        verify_batch, verify_in_memory, BatchItem, PayloadObservation, VerifyFailure,
        VerifyManifest,
    };
    use crate::sha256::sha256_hex;
    use crate::GPU_THRESHOLD_BYTES;

    fn manifest_for(payload: &[u8]) -> VerifyManifest {
        VerifyManifest {
            sha256: sha256_hex(payload),
            ..VerifyManifest::default()
        }
    }

    #[test]
    fn matching_payload_passes_with_metadata() {
        let payload = b"synthetic-payload";
        let manifest = VerifyManifest {
            sha256: sha256_hex(payload).to_ascii_uppercase(),
            min_bytes: Some(1),
            max_bytes: Some(64),
            exact_bytes: Some(payload.len() as u64),
            mime: Some("application/json".to_string()),
            filename: Some("note.txt".to_string()),
        };
        let observed = PayloadObservation {
            mime: Some(" Application/JSON ".to_string()),
            filename: Some("note.txt".to_string()),
        };
        let success = verify_in_memory(payload, &manifest, &observed).expect("pass");
        assert_eq!(success.byte_length, payload.len() as u64);
        assert_eq!(success.sha256, sha256_hex(payload));
    }

    #[test]
    fn fail_closed_reasons_are_distinct() {
        let payload = b"synthetic-payload";
        let digest = sha256_hex(payload);
        let observed = PayloadObservation::default();

        let mut tampered = payload.to_vec();
        let last = tampered.len() - 1;
        tampered[last] ^= 0x01;
        let mismatch =
            verify_in_memory(&tampered, &manifest_for(payload), &observed).expect_err("tamper");
        assert!(matches!(mismatch, VerifyFailure::HashMismatch { .. }));

        let mut wrong_size = manifest_for(payload);
        wrong_size.exact_bytes = Some(3);
        assert!(matches!(
            verify_in_memory(payload, &wrong_size, &observed),
            Err(VerifyFailure::SizeMismatch { .. })
        ));

        let mut too_small = manifest_for(payload);
        too_small.min_bytes = Some(100);
        assert!(matches!(
            verify_in_memory(payload, &too_small, &observed),
            Err(VerifyFailure::SizeBelowMin { .. })
        ));

        let mut too_large = manifest_for(payload);
        too_large.max_bytes = Some(2);
        assert!(matches!(
            verify_in_memory(payload, &too_large, &observed),
            Err(VerifyFailure::SizeAboveMax { .. })
        ));

        let mut mime = manifest_for(payload);
        mime.mime = Some("text/plain".to_string());
        let observed_mime = PayloadObservation {
            mime: Some("application/json".to_string()),
            filename: None,
        };
        assert!(matches!(
            verify_in_memory(payload, &mime, &observed_mime),
            Err(VerifyFailure::MimeMismatch { .. })
        ));
        assert!(matches!(
            verify_in_memory(payload, &mime, &observed),
            Err(VerifyFailure::MimeMismatch { actual: None, .. })
        ));

        let mut filename = manifest_for(payload);
        filename.filename = Some("note.txt".to_string());
        let observed_name = PayloadObservation {
            mime: None,
            filename: Some("Note.txt".to_string()),
        };
        assert!(matches!(
            verify_in_memory(payload, &filename, &observed_name),
            Err(VerifyFailure::FilenameMismatch { .. })
        ));

        assert_eq!(
            verify_in_memory(payload, &VerifyManifest::default(), &observed).unwrap_err(),
            VerifyFailure::MissingDigest
        );
        let mut bad_digest = manifest_for(payload);
        bad_digest.sha256 = "abcd".to_string();
        assert_eq!(
            verify_in_memory(payload, &bad_digest, &observed).unwrap_err(),
            VerifyFailure::InvalidDigest
        );
        let mut inconsistent = manifest_for(payload);
        inconsistent.min_bytes = Some(8);
        inconsistent.max_bytes = Some(4);
        assert_eq!(
            verify_in_memory(payload, &inconsistent, &observed).unwrap_err(),
            VerifyFailure::InvalidManifest
        );
        let _ = digest;
    }

    #[test]
    fn batch_preserves_order_and_uses_workers_for_large_inputs() {
        assert!(verify_batch(&[]).is_empty());
        let first = vec![1u8; 16 * 1024];
        let second = vec![2u8; 16 * 1024];
        let first_manifest = manifest_for(&first);
        let mut second_manifest = manifest_for(&second);
        second_manifest.sha256 = "ab".repeat(32);
        let observed = PayloadObservation::default();
        let items = [
            BatchItem {
                payload: &first,
                manifest: &first_manifest,
                observed: &observed,
            },
            BatchItem {
                payload: &second,
                manifest: &second_manifest,
                observed: &observed,
            },
        ];
        let results = verify_batch(&items);
        assert!(results[0].is_ok());
        assert!(matches!(
            results[1],
            Err(VerifyFailure::HashMismatch { .. })
        ));
    }

    #[test]
    fn multi_megabyte_batch_falls_back_when_gpu_is_absent() {
        let payload = vec![9u8; GPU_THRESHOLD_BYTES];
        let manifest = manifest_for(&payload);
        let observed = PayloadObservation::default();
        let items = [BatchItem {
            payload: &payload,
            manifest: &manifest,
            observed: &observed,
        }];
        let results = verify_batch(&items);
        assert_eq!(results.len(), 1);
        assert!(results[0].is_ok());
    }
}
