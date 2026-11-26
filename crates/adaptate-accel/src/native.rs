#[cfg(feature = "native")]
mod addon {
    use crate::ffi::{snapshot_to_json, verify_many_json, verify_payload_json};
    #[cfg(not(test))]
    use crate::gpu::adapter_present;
    use crate::json_scan::StreamScanner;
    use crate::sha256::sha256_hex;
    #[cfg(not(test))]
    use napi::bindgen_prelude::AsyncTask;
    use napi::bindgen_prelude::Buffer;
    use napi::{Env, Result, Task};
    use napi_derive::napi;

    pub struct HashTask {
        payload: Vec<u8>,
    }

    impl Task for HashTask {
        type Output = String;
        type JsValue = String;

        fn compute(&mut self) -> Result<Self::Output> {
            Ok(sha256_hex(&self.payload))
        }

        fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
            Ok(output)
        }
    }

    pub struct VerifyTask {
        payload: Vec<u8>,
        manifest_json: String,
        observed_json: String,
    }

    impl Task for VerifyTask {
        type Output = String;
        type JsValue = String;

        fn compute(&mut self) -> Result<Self::Output> {
            Ok(verify_payload_json(
                &self.payload,
                &self.manifest_json,
                &self.observed_json,
            ))
        }

        fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
            Ok(output)
        }
    }

    pub struct BatchTask {
        payloads: Vec<Vec<u8>>,
        manifest_json: Vec<String>,
        observed_json: Vec<String>,
    }

    impl Task for BatchTask {
        type Output = String;
        type JsValue = String;

        fn compute(&mut self) -> Result<Self::Output> {
            let views: Vec<&[u8]> = self.payloads.iter().map(Vec::as_slice).collect();
            Ok(verify_many_json(
                &views,
                &self.manifest_json,
                &self.observed_json,
            ))
        }

        fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
            Ok(output)
        }
    }

    #[cfg(not(test))]
    #[napi]
    pub fn gpu_available() -> bool {
        adapter_present()
    }

    #[cfg(not(test))]
    #[napi]
    pub fn hash_large_buffer(payload: Buffer) -> AsyncTask<HashTask> {
        AsyncTask::new(HashTask {
            payload: payload.to_vec(),
        })
    }

    #[cfg(not(test))]
    #[napi]
    pub fn verify_payload(
        payload: Buffer,
        manifest_json: String,
        observed_json: String,
    ) -> AsyncTask<VerifyTask> {
        AsyncTask::new(VerifyTask {
            payload: payload.to_vec(),
            manifest_json,
            observed_json,
        })
    }

    #[cfg(not(test))]
    #[napi]
    pub fn verify_batch(
        payloads: Vec<Buffer>,
        manifest_json: Vec<String>,
        observed_json: Vec<String>,
    ) -> AsyncTask<BatchTask> {
        AsyncTask::new(BatchTask {
            payloads: payloads
                .into_iter()
                .map(|payload| payload.to_vec())
                .collect(),
            manifest_json,
            observed_json,
        })
    }

    #[napi]
    pub struct NativeScanner {
        inner: StreamScanner,
    }

    #[napi]
    impl NativeScanner {
        #[napi(constructor)]
        pub fn new() -> Self {
            Self {
                inner: StreamScanner::new(),
            }
        }

        #[napi]
        pub fn push(&mut self, chunk: Buffer) -> String {
            snapshot_to_json(&self.inner.push(&chunk))
        }

        #[napi]
        pub fn finish(&mut self) -> String {
            snapshot_to_json(&self.inner.finish())
        }
    }

    #[cfg(test)]
    mod tests {
        use super::{BatchTask, HashTask, VerifyTask};
        use crate::sha256::sha256_hex;
        use napi::Task;

        #[test]
        fn native_tasks_hash_and_verify_without_node() {
            let payload = b"synthetic-payload".to_vec();
            let digest = sha256_hex(&payload);
            let mut hash_task = HashTask {
                payload: payload.clone(),
            };
            assert_eq!(hash_task.compute().expect("hash task"), digest);

            let manifest_json = format!("{{\"sha256\":\"{digest}\"}}");
            let mut verify_task = VerifyTask {
                payload: payload.clone(),
                manifest_json: manifest_json.clone(),
                observed_json: String::new(),
            };
            let verified = verify_task.compute().expect("verify task");
            assert!(verified.contains("\"ok\":true"));
            assert!(verified.contains(&digest));

            let mut batch_task = BatchTask {
                payloads: vec![payload],
                manifest_json: vec![manifest_json],
                observed_json: vec![String::new()],
            };
            let batched = batch_task.compute().expect("batch task");
            assert!(batched.starts_with('['));
            assert!(batched.contains("\"ok\":true"));
        }
    }
}
