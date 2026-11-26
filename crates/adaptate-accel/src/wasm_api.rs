#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
mod bindings {
    use crate::ffi::{snapshot_to_json, verify_payload_json};
    use crate::json_scan::StreamScanner;
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen(js_name = sha256_hex)]
    pub fn sha256_hex_export(payload: &[u8]) -> String {
        crate::sha256::sha256_hex(payload)
    }

    #[wasm_bindgen]
    pub fn verify_payload(payload: &[u8], manifest_json: &str, observed_json: &str) -> String {
        verify_payload_json(payload, manifest_json, observed_json)
    }

    #[wasm_bindgen]
    pub struct WasmScanner {
        inner: StreamScanner,
    }

    #[wasm_bindgen]
    impl WasmScanner {
        #[wasm_bindgen(constructor)]
        pub fn new() -> WasmScanner {
            WasmScanner {
                inner: StreamScanner::new(),
            }
        }

        pub fn push(&mut self, chunk: &[u8]) -> String {
            snapshot_to_json(&self.inner.push(chunk))
        }

        pub fn finish(&mut self) -> String {
            snapshot_to_json(&self.inner.finish())
        }
    }
}
