use sha2::{Digest, Sha256};

const HEX_DIGITS: &[u8; 16] = b"0123456789abcdef";

pub fn sha256_bytes(payload: &[u8]) -> [u8; 32] {
    let digest = Sha256::digest(payload);
    let mut output = [0u8; 32];
    output.copy_from_slice(&digest);
    output
}

pub fn sha256_hex(payload: &[u8]) -> String {
    let digest = sha256_bytes(payload);
    let mut encoded = String::with_capacity(64);
    for byte in digest {
        encoded.push(HEX_DIGITS[(byte >> 4) as usize] as char);
        encoded.push(HEX_DIGITS[(byte & 0x0f) as usize] as char);
    }
    encoded
}

/// SHA-256 padding. The GPU path hashes these blocks. The CPU path uses `sha2`.
pub fn sha256_padded_blocks(payload: &[u8]) -> Vec<u8> {
    let bit_length = (payload.len() as u64).saturating_mul(8);
    let mut padded = Vec::with_capacity(payload.len() + 72);
    padded.extend_from_slice(payload);
    padded.push(0x80);
    while padded.len() % 64 != 56 {
        padded.push(0);
    }
    padded.extend_from_slice(&bit_length.to_be_bytes());
    padded
}

#[cfg(test)]
mod tests {
    use super::{sha256_hex, sha256_padded_blocks};

    #[test]
    fn empty_payload_matches_the_known_digest() {
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn abc_matches_the_known_digest() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn padding_places_the_marker_and_bit_length() {
        let empty = sha256_padded_blocks(b"");
        assert_eq!(empty.len(), 64);
        assert_eq!(empty[0], 0x80);
        assert!(empty[1..56].iter().all(|byte| *byte == 0));
        assert_eq!(&empty[56..], &[0, 0, 0, 0, 0, 0, 0, 0]);

        let abc = sha256_padded_blocks(b"abc");
        assert_eq!(abc.len(), 64);
        assert_eq!(&abc[0..4], b"abc\x80");
        assert_eq!(abc[63], 24);
    }
}
