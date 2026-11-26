use crate::utf8::{Utf8Carry, Utf8DecodeError};

pub const MAX_DEPTH: usize = 64;

#[derive(Debug, Clone, PartialEq)]
pub enum JsonValue {
    Null,
    Boolean(bool),
    Number(f64),
    String(String),
    Array(Vec<JsonValue>),
    Object(Vec<(String, JsonValue)>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScanStatus {
    Pending,
    Ready,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScanError {
    InvalidUtf8,
    TruncatedUtf8,
    InvalidJson,
    TruncatedJson,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScanSnapshot {
    pub status: ScanStatus,
    pub values: Vec<JsonValue>,
    pub reason: Option<ScanError>,
}

#[derive(Debug, Clone, PartialEq)]
enum ParseStep {
    NeedMore,
    Invalid,
    Value { value: JsonValue, next: usize },
}

enum HexRead {
    NeedMore,
    Invalid,
}

enum UnicodeRead {
    NeedMore,
    Invalid,
    Char { character: char, next: usize },
}

#[derive(Debug, Clone, PartialEq)]
pub struct StreamScanner {
    carry: Utf8Carry,
    text: String,
    consumed: usize,
    values: Vec<JsonValue>,
    error: Option<ScanError>,
}

impl Default for StreamScanner {
    fn default() -> Self {
        Self::new()
    }
}

impl StreamScanner {
    pub fn new() -> Self {
        Self {
            carry: Utf8Carry::new(),
            text: String::new(),
            consumed: 0,
            values: Vec::new(),
            error: None,
        }
    }

    pub fn push(&mut self, chunk: &[u8]) -> ScanSnapshot {
        if self.error.is_some() {
            return self.snapshot();
        }
        match self.carry.push_chunk(chunk) {
            Ok(text) => self.text.push_str(&text),
            Err(Utf8DecodeError::InvalidSequence) => {
                self.error = Some(ScanError::InvalidUtf8);
                return self.snapshot();
            }
            Err(Utf8DecodeError::TruncatedSequence) => {
                self.error = Some(ScanError::TruncatedUtf8);
                return self.snapshot();
            }
        }
        self.drain(false)
    }

    pub fn push_text(&mut self, text: &str) -> ScanSnapshot {
        self.push(text.as_bytes())
    }

    pub fn finish(&mut self) -> ScanSnapshot {
        if self.error.is_some() {
            return self.snapshot();
        }
        if !self.carry.is_empty() {
            self.error = Some(ScanError::TruncatedUtf8);
            return self.snapshot();
        }
        self.drain(true)
    }

    fn snapshot(&self) -> ScanSnapshot {
        let status = if self.error.is_some() {
            ScanStatus::Error
        } else if self.values.is_empty() {
            ScanStatus::Pending
        } else if self.consumed < self.text.len()
            && skip_whitespace(&self.text, self.consumed) < self.text.len()
        {
            ScanStatus::Pending
        } else {
            ScanStatus::Ready
        };
        ScanSnapshot {
            status,
            values: self.values.clone(),
            reason: self.error,
        }
    }

    fn drain(&mut self, end_of_stream: bool) -> ScanSnapshot {
        loop {
            if self.consumed > self.text.len() {
                self.error = Some(ScanError::InvalidJson);
                return self.snapshot();
            }
            let body_start = skip_whitespace(&self.text, self.consumed);
            if body_start >= self.text.len() {
                self.consumed = body_start;
                if self.values.is_empty() {
                    if end_of_stream {
                        self.error = Some(ScanError::TruncatedJson);
                    }
                    return self.snapshot();
                }
                return self.snapshot();
            }
            match parse_value(&self.text, body_start, end_of_stream, 0) {
                ParseStep::NeedMore => {
                    self.consumed = body_start;
                    if end_of_stream {
                        self.error = Some(ScanError::TruncatedJson);
                    }
                    return self.snapshot();
                }
                ParseStep::Invalid => {
                    self.error = Some(ScanError::InvalidJson);
                    return self.snapshot();
                }
                ParseStep::Value { value, next } => {
                    if next <= body_start {
                        self.error = Some(ScanError::InvalidJson);
                        return self.snapshot();
                    }
                    self.consumed = next;
                    self.values.push(value);
                }
            }
        }
    }
}

fn skip_whitespace(text: &str, start: usize) -> usize {
    let bytes = text.as_bytes();
    let mut index = start;
    while index < bytes.len() && matches!(bytes[index], b' ' | b'\n' | b'\r' | b'\t') {
        index += 1;
    }
    index
}

fn parse_value(text: &str, start: usize, end_of_stream: bool, depth: usize) -> ParseStep {
    let bytes = text.as_bytes();
    if start >= bytes.len() {
        return ParseStep::NeedMore;
    }
    match bytes[start] {
        b'n' => parse_literal(text, start, "null", JsonValue::Null),
        b't' => parse_literal(text, start, "true", JsonValue::Boolean(true)),
        b'f' => parse_literal(text, start, "false", JsonValue::Boolean(false)),
        b'"' => parse_string(text, start),
        b'[' => parse_array(text, start, end_of_stream, depth),
        b'{' => parse_object(text, start, end_of_stream, depth),
        b'-' | b'0'..=b'9' => parse_number(text, start, end_of_stream),
        _ => ParseStep::Invalid,
    }
}

fn parse_literal(text: &str, start: usize, literal: &str, value: JsonValue) -> ParseStep {
    let rest = &text[start..];
    if rest.starts_with(literal) {
        let next = start + literal.len();
        if next < text.len() {
            let byte = text.as_bytes()[next];
            if is_delimiter(byte) {
                return ParseStep::Value { value, next };
            }
            return ParseStep::Invalid;
        }
        return ParseStep::Value { value, next };
    }
    if literal.starts_with(rest) && rest.len() < literal.len() {
        return ParseStep::NeedMore;
    }
    ParseStep::Invalid
}

fn is_delimiter(byte: u8) -> bool {
    matches!(
        byte,
        b' ' | b'\n' | b'\r' | b'\t' | b',' | b']' | b'}' | b':'
    )
}

fn parse_number(text: &str, start: usize, end_of_stream: bool) -> ParseStep {
    let bytes = text.as_bytes();
    let mut index = start;
    if bytes.get(index) == Some(&b'-') {
        index += 1;
    }
    if index >= bytes.len() {
        return if end_of_stream {
            ParseStep::Invalid
        } else {
            ParseStep::NeedMore
        };
    }
    if !bytes[index].is_ascii_digit() {
        return ParseStep::Invalid;
    }
    if bytes[index] == b'0' {
        index += 1;
        if index < bytes.len() && bytes[index].is_ascii_digit() {
            return ParseStep::Invalid;
        }
    } else {
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
    }
    if index >= bytes.len() && !end_of_stream {
        return ParseStep::NeedMore;
    }
    if index < bytes.len() && bytes[index] == b'.' {
        index += 1;
        let fraction_start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if index == fraction_start {
            return if index >= bytes.len() && !end_of_stream {
                ParseStep::NeedMore
            } else {
                ParseStep::Invalid
            };
        }
    }
    if index >= bytes.len() && !end_of_stream {
        return ParseStep::NeedMore;
    }
    if index < bytes.len() && (bytes[index] == b'e' || bytes[index] == b'E') {
        index += 1;
        if index < bytes.len() && (bytes[index] == b'+' || bytes[index] == b'-') {
            index += 1;
        }
        if index >= bytes.len() && !end_of_stream {
            return ParseStep::NeedMore;
        }
        let exponent_start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if index == exponent_start {
            return if index >= bytes.len() && !end_of_stream {
                ParseStep::NeedMore
            } else {
                ParseStep::Invalid
            };
        }
    }
    if index >= bytes.len() && !end_of_stream {
        return ParseStep::NeedMore;
    }
    let token = &text[start..index];
    match token.parse::<f64>() {
        Ok(number) if number.is_finite() => ParseStep::Value {
            value: JsonValue::Number(number),
            next: index,
        },
        _ => ParseStep::Invalid,
    }
}

fn parse_string(text: &str, start: usize) -> ParseStep {
    let bytes = text.as_bytes();
    if bytes.get(start) != Some(&b'"') {
        return ParseStep::Invalid;
    }
    let mut index = start + 1;
    let mut output = String::new();
    while index < bytes.len() {
        let byte = bytes[index];
        if byte == b'"' {
            return ParseStep::Value {
                value: JsonValue::String(output),
                next: index + 1,
            };
        }
        if byte == b'\\' {
            if index + 1 >= bytes.len() {
                return ParseStep::NeedMore;
            }
            let escape = bytes[index + 1];
            match escape {
                b'"' | b'\\' | b'/' => {
                    output.push(escape as char);
                    index += 2;
                }
                b'b' => {
                    output.push('\u{0008}');
                    index += 2;
                }
                b'f' => {
                    output.push('\u{000c}');
                    index += 2;
                }
                b'n' => {
                    output.push('\n');
                    index += 2;
                }
                b'r' => {
                    output.push('\r');
                    index += 2;
                }
                b't' => {
                    output.push('\t');
                    index += 2;
                }
                b'u' => match read_unicode_escape(text, index) {
                    UnicodeRead::Char { character, next } => {
                        output.push(character);
                        index = next;
                    }
                    UnicodeRead::NeedMore => return ParseStep::NeedMore,
                    UnicodeRead::Invalid => return ParseStep::Invalid,
                },
                _ => return ParseStep::Invalid,
            }
            continue;
        }
        if byte < 0x20 {
            return ParseStep::Invalid;
        }
        let Some(character) = text[index..].chars().next() else {
            return ParseStep::Invalid;
        };
        output.push(character);
        index += character.len_utf8();
    }
    ParseStep::NeedMore
}

fn read_unicode_escape(text: &str, backslash: usize) -> UnicodeRead {
    let hex_start = backslash + 2;
    let code = match read_hex4(text, hex_start) {
        Ok(code) => code,
        Err(HexRead::NeedMore) => return UnicodeRead::NeedMore,
        Err(HexRead::Invalid) => return UnicodeRead::Invalid,
    };
    if (0xDC00..=0xDFFF).contains(&code) {
        return UnicodeRead::Invalid;
    }
    if (0xD800..=0xDBFF).contains(&code) {
        let pair_at = hex_start + 4;
        let bytes = text.as_bytes();
        if pair_at >= bytes.len() {
            return UnicodeRead::NeedMore;
        }
        if bytes[pair_at] != b'\\' {
            return UnicodeRead::Invalid;
        }
        if pair_at + 1 >= bytes.len() {
            return UnicodeRead::NeedMore;
        }
        if bytes[pair_at + 1] != b'u' {
            return UnicodeRead::Invalid;
        }
        let low = match read_hex4(text, pair_at + 2) {
            Ok(low) => low,
            Err(HexRead::NeedMore) => return UnicodeRead::NeedMore,
            Err(HexRead::Invalid) => return UnicodeRead::Invalid,
        };
        if !(0xDC00..=0xDFFF).contains(&low) {
            return UnicodeRead::Invalid;
        }
        let point = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
        return match char::from_u32(point) {
            Some(character) => UnicodeRead::Char {
                character,
                next: pair_at + 6,
            },
            None => UnicodeRead::Invalid,
        };
    }
    match char::from_u32(code) {
        Some(character) => UnicodeRead::Char {
            character,
            next: hex_start + 4,
        },
        None => UnicodeRead::Invalid,
    }
}

fn read_hex4(text: &str, start: usize) -> Result<u32, HexRead> {
    let bytes = text.as_bytes();
    if start + 4 > bytes.len() {
        let mut offset = start;
        while offset < bytes.len() {
            if hex_value(bytes[offset]).is_none() {
                return Err(HexRead::Invalid);
            }
            offset += 1;
        }
        return Err(HexRead::NeedMore);
    }
    let mut code = 0u32;
    for offset in 0..4 {
        match hex_value(bytes[start + offset]) {
            Some(digit) => code = (code << 4) | digit,
            None => return Err(HexRead::Invalid),
        }
    }
    Ok(code)
}

fn hex_value(byte: u8) -> Option<u32> {
    match byte {
        b'0'..=b'9' => Some((byte - b'0') as u32),
        b'a'..=b'f' => Some((byte - b'a' + 10) as u32),
        b'A'..=b'F' => Some((byte - b'A' + 10) as u32),
        _ => None,
    }
}

fn parse_array(text: &str, start: usize, end_of_stream: bool, depth: usize) -> ParseStep {
    if depth >= MAX_DEPTH {
        return ParseStep::Invalid;
    }
    let bytes = text.as_bytes();
    let mut index = start + 1;
    let mut items = Vec::new();
    loop {
        index = skip_whitespace(text, index);
        if index >= bytes.len() {
            return ParseStep::NeedMore;
        }
        if bytes[index] == b']' {
            if !items.is_empty() {
                return ParseStep::Invalid;
            }
            return ParseStep::Value {
                value: JsonValue::Array(items),
                next: index + 1,
            };
        }
        match parse_value(text, index, end_of_stream, depth + 1) {
            ParseStep::Value { value, next } => {
                items.push(value);
                index = skip_whitespace(text, next);
                if index >= bytes.len() {
                    return ParseStep::NeedMore;
                }
                if bytes[index] == b',' {
                    index += 1;
                    continue;
                }
                if bytes[index] == b']' {
                    return ParseStep::Value {
                        value: JsonValue::Array(items),
                        next: index + 1,
                    };
                }
                return ParseStep::Invalid;
            }
            other => return other,
        }
    }
}

fn parse_object(text: &str, start: usize, end_of_stream: bool, depth: usize) -> ParseStep {
    if depth >= MAX_DEPTH {
        return ParseStep::Invalid;
    }
    let bytes = text.as_bytes();
    let mut index = start + 1;
    let mut fields = Vec::new();
    loop {
        index = skip_whitespace(text, index);
        if index >= bytes.len() {
            return ParseStep::NeedMore;
        }
        if bytes[index] == b'}' {
            if !fields.is_empty() {
                return ParseStep::Invalid;
            }
            return ParseStep::Value {
                value: JsonValue::Object(fields),
                next: index + 1,
            };
        }
        let key = match parse_string(text, index) {
            ParseStep::Value {
                value: JsonValue::String(key),
                next,
            } => {
                index = next;
                key
            }
            ParseStep::Value { .. } => return ParseStep::Invalid,
            ParseStep::NeedMore => return ParseStep::NeedMore,
            ParseStep::Invalid => return ParseStep::Invalid,
        };
        index = skip_whitespace(text, index);
        if index >= bytes.len() {
            return ParseStep::NeedMore;
        }
        if bytes[index] != b':' {
            return ParseStep::Invalid;
        }
        index = skip_whitespace(text, index + 1);
        match parse_value(text, index, end_of_stream, depth + 1) {
            ParseStep::Value { value, next } => {
                upsert(&mut fields, key, value);
                index = skip_whitespace(text, next);
                if index >= bytes.len() {
                    return ParseStep::NeedMore;
                }
                if bytes[index] == b',' {
                    index += 1;
                    continue;
                }
                if bytes[index] == b'}' {
                    return ParseStep::Value {
                        value: JsonValue::Object(fields),
                        next: index + 1,
                    };
                }
                return ParseStep::Invalid;
            }
            other => return other,
        }
    }
}

fn upsert(fields: &mut Vec<(String, JsonValue)>, key: String, value: JsonValue) {
    if let Some(existing) = fields.iter_mut().find(|(field_key, _)| field_key == &key) {
        existing.1 = value;
        return;
    }
    fields.push((key, value));
}

#[cfg(test)]
mod tests {
    use super::{JsonValue, ScanError, ScanStatus, StreamScanner, MAX_DEPTH};

    fn finish_chunks(chunks: &[&[u8]]) -> super::ScanSnapshot {
        let mut scanner = StreamScanner::new();
        for chunk in chunks {
            let snapshot = scanner.push(chunk);
            if snapshot.status == ScanStatus::Error {
                return snapshot;
            }
        }
        scanner.finish()
    }

    fn object(fields: Vec<(&str, JsonValue)>) -> JsonValue {
        JsonValue::Object(
            fields
                .into_iter()
                .map(|(key, value)| (key.to_string(), value))
                .collect(),
        )
    }

    #[test]
    fn every_byte_split_matches_one_shot_parse() {
        let document = "{\"title\":\"caf\u{00e9} \u{20ac}\u{1F600}\",\"n\":1.5,\"ok\":true,\"tags\":[\"a\",null]}";
        let bytes = document.as_bytes();
        let full = finish_chunks(&[bytes]);
        assert_eq!(full.status, ScanStatus::Ready);
        assert_eq!(
            full.values,
            vec![object(vec![
                ("title", JsonValue::String("café €😀".to_string())),
                ("n", JsonValue::Number(1.5)),
                ("ok", JsonValue::Boolean(true)),
                (
                    "tags",
                    JsonValue::Array(vec![JsonValue::String("a".to_string()), JsonValue::Null])
                ),
            ])]
        );
        for split in 0..=bytes.len() {
            let (left, right) = bytes.split_at(split);
            let snapshot = finish_chunks(&[left, right]);
            assert_eq!(snapshot.status, full.status, "split {split}");
            assert_eq!(snapshot.values, full.values, "split {split}");
        }
        let pieces: Vec<&[u8]> = bytes.chunks(1).collect();
        let bytewise = finish_chunks(&pieces);
        assert_eq!(bytewise.values, full.values);
    }

    #[test]
    fn incomplete_json_stays_pending_until_finish_rejects_it() {
        let mut scanner = StreamScanner::new();
        let pending = scanner.push(br#"{"title":"Pas"#);
        assert_eq!(pending.status, ScanStatus::Pending);
        assert!(pending.values.is_empty());
        let finished = scanner.finish();
        assert_eq!(finished.reason, Some(ScanError::TruncatedJson));
    }

    #[test]
    fn keyword_and_number_fragments_resume() {
        let mut scanner = StreamScanner::new();
        assert_eq!(scanner.push(b"tru").status, ScanStatus::Pending);
        let ready = scanner.push(b"e");
        assert_eq!(ready.status, ScanStatus::Ready);
        assert_eq!(ready.values, vec![JsonValue::Boolean(true)]);

        let mut numbers = StreamScanner::new();
        assert_eq!(numbers.push(b"1").status, ScanStatus::Pending);
        let one = numbers.finish();
        assert_eq!(one.values, vec![JsonValue::Number(1.0)]);

        let mut dotted = StreamScanner::new();
        assert_eq!(dotted.push(b"1.").status, ScanStatus::Pending);
        assert_eq!(dotted.finish().reason, Some(ScanError::InvalidJson));

        let mut complete = StreamScanner::new();
        assert_eq!(complete.push(b"1.").status, ScanStatus::Pending);
        let value = complete.push(b"50 ");
        assert_eq!(value.status, ScanStatus::Ready);
        assert_eq!(value.values, vec![JsonValue::Number(1.5)]);
    }

    #[test]
    fn two_top_level_values_are_both_kept() {
        let snapshot = finish_chunks(&[br#"{"a":1}"#, br#"{"b":2}"#]);
        assert_eq!(snapshot.status, ScanStatus::Ready);
        assert_eq!(snapshot.values.len(), 2);
    }

    #[test]
    fn invalid_tokens_and_depth_fail_closed() {
        assert_eq!(finish_chunks(&[b"{]"]).reason, Some(ScanError::InvalidJson));
        assert_eq!(finish_chunks(&[b"01"]).reason, Some(ScanError::InvalidJson));
        assert_eq!(
            finish_chunks(&[b"[1,]"]).reason,
            Some(ScanError::InvalidJson)
        );
        assert_eq!(
            finish_chunks(&[b"trueX"]).reason,
            Some(ScanError::InvalidJson)
        );
        assert_eq!(
            finish_chunks(&[b"   "]).reason,
            Some(ScanError::TruncatedJson)
        );
        let mut nested = String::new();
        for _ in 0..=MAX_DEPTH {
            nested.push('[');
        }
        nested.push('1');
        for _ in 0..=MAX_DEPTH {
            nested.push(']');
        }
        assert_eq!(
            finish_chunks(&[nested.as_bytes()]).reason,
            Some(ScanError::InvalidJson)
        );
    }

    #[test]
    fn escapes_surrogates_and_controls() {
        let snapshot = finish_chunks(&[br#"{"s":"a\"b\\c\/d\n\u00e9\uD83D\uDE00"}"#]);
        assert_eq!(snapshot.status, ScanStatus::Ready);
        assert_eq!(
            snapshot.values,
            vec![object(vec![(
                "s",
                JsonValue::String("a\"b\\c/d\né😀".to_string())
            )])]
        );
        assert_eq!(
            finish_chunks(&[br#"{"s":"\uD800"#]).reason,
            Some(ScanError::TruncatedJson)
        );
        assert_eq!(
            finish_chunks(&[br#"{"s":"\uD800"}"#]).reason,
            Some(ScanError::InvalidJson)
        );
        assert_eq!(
            finish_chunks(&[br#"{"s":"\uD800x"}"#]).reason,
            Some(ScanError::InvalidJson)
        );
        assert_eq!(
            finish_chunks(&[br#"{"s":"\uDC00"}"#]).reason,
            Some(ScanError::InvalidJson)
        );
        assert_eq!(
            finish_chunks(&[b"\"\n\""]).reason,
            Some(ScanError::InvalidJson)
        );
        assert_eq!(
            finish_chunks(&[br#""\q""#]).reason,
            Some(ScanError::InvalidJson)
        );
    }

    #[test]
    fn duplicate_keys_keep_the_later_value_and_errors_stick() {
        let snapshot = finish_chunks(&[br#"{"a":1,"a":2}"#]);
        assert_eq!(
            snapshot.values,
            vec![object(vec![("a", JsonValue::Number(2.0))])]
        );
        let mut scanner = StreamScanner::new();
        assert_eq!(scanner.push(&[0xFF]).reason, Some(ScanError::InvalidUtf8));
        assert_eq!(scanner.push(b"true").reason, Some(ScanError::InvalidUtf8));
        assert_eq!(scanner.finish().reason, Some(ScanError::InvalidUtf8));
    }

    #[test]
    fn truncated_utf8_on_finish_is_distinct_from_json() {
        let mut scanner = StreamScanner::new();
        assert_eq!(scanner.push(&[0xE2, 0x82]).status, ScanStatus::Pending);
        assert_eq!(scanner.finish().reason, Some(ScanError::TruncatedUtf8));
    }
}
