fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    #[cfg(feature = "native")]
    napi_build::setup();
}
