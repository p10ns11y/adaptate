use crate::simd::ascii_run_length;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Utf8DecodeError {
    InvalidSequence,
    TruncatedSequence,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Sequence {
    Done(char, usize),
    Incomplete,
    Invalid,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Utf8Carry {
    pending: Vec<u8>,
}

impl Utf8Carry {
    pub fn new() -> Self {
        Self {
            pending: Vec::new(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.pending.is_empty()
    }

    pub fn pending_octets(&self) -> &[u8] {
        &self.pending
    }

    /// Decode a chunk. Incomplete trailing octets stay in the carry.
    /// On an invalid sequence the previous carry is left unchanged.
    pub fn push_chunk(&mut self, chunk: &[u8]) -> Result<String, Utf8DecodeError> {
        let mut combined = Vec::with_capacity(self.pending.len() + chunk.len());
        combined.extend_from_slice(&self.pending);
        combined.extend_from_slice(chunk);
        let (text, rest) = decode_complete_prefix(&combined)?;
        self.pending = rest;
        Ok(text)
    }

    pub fn finish(self) -> Result<(), Utf8DecodeError> {
        if self.pending.is_empty() {
            Ok(())
        } else {
            Err(Utf8DecodeError::TruncatedSequence)
        }
    }
}

pub fn decode_complete_prefix(bytes: &[u8]) -> Result<(String, Vec<u8>), Utf8DecodeError> {
    let mut index = 0usize;
    let mut output = String::new();
    while index < bytes.len() {
        let ascii_width = ascii_run_length(&bytes[index..]);
        if ascii_width > 0 {
            let end = index + ascii_width;
            let ascii = std::str::from_utf8(&bytes[index..end])
                .map_err(|_| Utf8DecodeError::InvalidSequence)?;
            output.push_str(ascii);
            index = end;
            continue;
        }
        match read_sequence(&bytes[index..]) {
            Sequence::Done(character, width) => {
                output.push(character);
                index += width;
            }
            Sequence::Incomplete => {
                return Ok((output, bytes[index..].to_vec()));
            }
            Sequence::Invalid => return Err(Utf8DecodeError::InvalidSequence),
        }
    }
    Ok((output, Vec::new()))
}

fn read_sequence(bytes: &[u8]) -> Sequence {
    if bytes.is_empty() {
        return Sequence::Incomplete;
    }
    let lead = bytes[0];
    if lead < 0x80 {
        return Sequence::Done(lead as char, 1);
    }
    let width = if lead & 0xE0 == 0xC0 {
        2
    } else if lead & 0xF0 == 0xE0 {
        3
    } else if lead & 0xF8 == 0xF0 {
        4
    } else {
        return Sequence::Invalid;
    };
    if width == 2 && lead < 0xC2 {
        return Sequence::Invalid;
    }
    if width == 4 && lead > 0xF4 {
        return Sequence::Invalid;
    }
    if bytes.len() < width {
        if prefix_holds(lead, bytes) {
            Sequence::Incomplete
        } else {
            Sequence::Invalid
        }
    } else if !continuations_hold(bytes, width) || !ranges_hold(lead, bytes[1]) {
        Sequence::Invalid
    } else {
        let point = decode_point(lead, &bytes[..width]);
        match char::from_u32(point) {
            Some(character) => Sequence::Done(character, width),
            None => Sequence::Invalid,
        }
    }
}

fn continuations_hold(bytes: &[u8], width: usize) -> bool {
    let mut offset = 1usize;
    while offset < width {
        if bytes[offset] & 0xC0 != 0x80 {
            return false;
        }
        offset += 1;
    }
    true
}

fn prefix_holds(lead: u8, bytes: &[u8]) -> bool {
    if bytes.len() <= 1 {
        return true;
    }
    if bytes[1] & 0xC0 != 0x80 || !ranges_hold(lead, bytes[1]) {
        return false;
    }
    let mut offset = 2usize;
    while offset < bytes.len() {
        if bytes[offset] & 0xC0 != 0x80 {
            return false;
        }
        offset += 1;
    }
    true
}

fn ranges_hold(lead: u8, second: u8) -> bool {
    if second & 0xC0 != 0x80 {
        return false;
    }
    if lead == 0xE0 {
        return second >= 0xA0;
    }
    if lead == 0xED {
        return second <= 0x9F;
    }
    if lead == 0xF0 {
        return second >= 0x90;
    }
    if lead == 0xF4 {
        return second <= 0x8F;
    }
    true
}

fn decode_point(lead: u8, bytes: &[u8]) -> u32 {
    match bytes.len() {
        2 => ((lead as u32 & 0x1F) << 6) | (bytes[1] as u32 & 0x3F),
        3 => {
            ((lead as u32 & 0x0F) << 12)
                | ((bytes[1] as u32 & 0x3F) << 6)
                | (bytes[2] as u32 & 0x3F)
        }
        4 => {
            ((lead as u32 & 0x07) << 18)
                | ((bytes[1] as u32 & 0x3F) << 12)
                | ((bytes[2] as u32 & 0x3F) << 6)
                | (bytes[3] as u32 & 0x3F)
        }
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::{decode_complete_prefix, Utf8Carry, Utf8DecodeError};

    #[test]
    fn euro_sign_survives_every_split() {
        let euro = "€".as_bytes();
        assert_eq!(euro, &[0xE2, 0x82, 0xAC]);
        for split in 0..=euro.len() {
            let mut carry = Utf8Carry::new();
            let first = carry.push_chunk(&euro[..split]).expect("prefix");
            let second = carry.push_chunk(&euro[split..]).expect("suffix");
            assert!(carry.finish().is_ok());
            assert_eq!(format!("{first}{second}"), "€");
        }
    }

    #[test]
    fn emoji_survives_a_split_on_each_boundary() {
        let emoji = "😀".as_bytes();
        assert_eq!(emoji.len(), 4);
        for split in 0..=emoji.len() {
            let mut carry = Utf8Carry::new();
            let first = carry.push_chunk(&emoji[..split]).unwrap();
            let second = carry.push_chunk(&emoji[split..]).unwrap();
            assert_eq!(format!("{first}{second}"), "😀");
            assert!(carry.is_empty());
        }
    }

    #[test]
    fn invalid_and_overlong_sequences_fail_closed() {
        let samples: &[&[u8]] = &[
            &[0x80],
            &[0xC0, 0x80],
            &[0xC1, 0xBF],
            &[0xE0, 0x80, 0x80],
            &[0xED, 0xA0, 0x80],
            &[0xF5, 0x80, 0x80, 0x80],
            &[0xE2, 0x00],
            &[0xFF],
        ];
        for sample in samples {
            let error = decode_complete_prefix(sample).expect_err("invalid utf-8");
            assert_eq!(error, Utf8DecodeError::InvalidSequence);
        }
    }

    #[test]
    fn truncated_tail_is_reported_on_finish() {
        let mut carry = Utf8Carry::new();
        let text = carry.push_chunk(&[0xE2, 0x82]).unwrap();
        assert_eq!(text, "");
        assert_eq!(carry.pending_octets(), &[0xE2, 0x82]);
        assert_eq!(carry.finish(), Err(Utf8DecodeError::TruncatedSequence));
    }

    #[test]
    fn a_bad_second_byte_does_not_keep_a_partial_lead() {
        let mut carry = Utf8Carry::new();
        let error = carry
            .push_chunk(&[0xE2, 0x20])
            .expect_err("bad continuation");
        assert_eq!(error, Utf8DecodeError::InvalidSequence);
        assert!(carry.is_empty());
    }
}
