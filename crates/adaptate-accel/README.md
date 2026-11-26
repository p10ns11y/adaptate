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

From the repository root, the package scripts compile the release artifacts and copy them next to the loaders:

```text
pnpm --filter @adaptate/wasm run build:wasm
pnpm --filter @adaptate/native run build:native
```

`build:wasm` runs `cargo build --manifest-path ../../crates/adaptate-accel/Cargo.toml --target wasm32-unknown-unknown --release` and copies `target/wasm32-unknown-unknown/release/adaptate_accel.wasm` to `packages/wasm/adaptate_accel.wasm`. It stops with a clear message when `cargo` is missing or the `wasm32-unknown-unknown` target is not installed (`rustup target add wasm32-unknown-unknown`).

`build:native` runs `cargo build --manifest-path ../../crates/adaptate-accel/Cargo.toml --release --features native` and copies the host cdylib to `packages/native/adaptate-accel.node` (`libadaptate_accel.dylib` on macOS, `libadaptate_accel.so` on Linux, `adaptate_accel.dll` on Windows). Pass `--gpu` to compile with `--features native,gpu`:

```text
pnpm --filter @adaptate/native run build:native -- --gpu
```

The package `build` scripts stay `vite build && tsc -p tsconfig.build.json`, so a Node build does not need Rust. Both copied artifacts are gitignored.

WASM C ABI with `wasm32-simd128`, when you call cargo yourself:

```text
rustup target add wasm32-unknown-unknown
cargo build --target wasm32-unknown-unknown --release
```

`wasm-pack`, when the tool is installed:

```text
wasm-pack build --target web --features wasm
```

Node addon, when you call cargo yourself:

```text
cargo build --release --features native
```

`@adaptate/accel` still scans chunks and verifies manifests when this crate is not built for the host.
