# adaptate-accel

Shared Rust core for optional Adaptate acceleration.

Payload bytes stay in memory. SHA-256 and the manifest checks run on that buffer. This crate does not open files or write a payload to disk.

## Algorithms

- Streaming UTF-8 JSON chunk scanner. A multi-byte character may be split across chunks.
- Manifest verifier for SHA-256, minimum size, maximum size, exact size, MIME type, and filename. Any failed check rejects the payload.

## Features

`default = []`. Request a target only when you need it.

- `wasm` adds `wasm-bindgen` exports for `wasm-pack`.
- `native` builds a Node-API addon (`napi-rs`) with libuv tasks and a worker-thread batch.
- `gpu` hashes batches through `wgpu` only when the batch is at least 4 MiB. A missing adapter, a disabled feature, or a self-check mismatch uses the CPU SHA-256 path.

## Build

Host tests:

```text
cargo test
```

WASM C ABI with `wasm32-simd128`:

```text
rustup target add wasm32-unknown-unknown
cargo build --target wasm32-unknown-unknown --release
```

`wasm-pack`, when the tool is installed:

```text
wasm-pack build --target web --features wasm
```

Node addon:

```text
cargo build --release --features native
```

Copy `target/wasm32-unknown-unknown/release/adaptate_accel.wasm` to `packages/wasm/adaptate_accel.wasm`.

Copy the native shared library to `packages/native/adaptate-accel.node`.

`@adaptate/accel` still scans chunks and verifies manifests when this crate is not built for the host.
