use std::{env, fs, path::Path};

fn main() {
    // Bake the Aptabase analytics App Key into the binary at compile time.
    //
    // A packaged desktop app has no `.env` beside it at runtime, so the key
    // cannot be read at runtime for production builds. Instead we read it here
    // (from the process env, or a `.env` at the project root / `src-tauri/`) and
    // write it into a file under OUT_DIR that lib.rs pulls in with
    // `include_str!`.
    //
    // Why a file and not `cargo:rustc-env` + `option_env!`: a build-script env
    // change does NOT reliably re-fingerprint the crate that reads it, so
    // editing `.env` would leave a stale (often empty) key compiled in.
    // `include_str!` registers a real compile-time dependency on the file, so
    // changing its contents always forces lib.rs to recompile. The key is a
    // client-side ingest key, not a secret; the untracked `.env` just keeps it
    // out of source control.
    dotenvy::from_filename("../.env").ok();
    dotenvy::dotenv().ok();
    let key = env::var("APTABASE_KEY").unwrap_or_default();

    let out_dir = env::var("OUT_DIR").expect("OUT_DIR set by cargo");
    fs::write(Path::new(&out_dir).join("aptabase_key.txt"), key.trim())
        .expect("write aptabase_key.txt");

    // Re-run (and so re-derive the key) whenever the .env or the env var change.
    println!("cargo:rerun-if-changed=../.env");
    println!("cargo:rerun-if-changed=.env");
    println!("cargo:rerun-if-env-changed=APTABASE_KEY");

    tauri_build::build();
}
