//! CLI binary to pre-compute verse embeddings using the ONNX model.
//!
//! Usage:
//!   cargo run -p lumenlive-detection --features onnx,vector-search --bin precompute -- \
//!     --model models/qwen3-embedding-0.6b/model.onnx \
//!     --tokenizer models/qwen3-embedding-0.6b/tokenizer.json \
//!     --verses data/verses-for-embedding.json \
//!     --output-embeddings embeddings/kjv-qwen3-0.6b.bin \
//!     --output-ids embeddings/kjv-qwen3-0.6b-ids.bin

use std::path::PathBuf;

#[derive(serde::Deserialize)]
struct VerseEntry {
    id: i64,
    text: String,
    #[allow(dead_code)]
    r#ref: String,
}

fn main() {
    // Initialize logging
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let args: Vec<String> = std::env::args().collect();

    // Defaults point at the INT8 model — the same variant the app queries with
    // at runtime — so the index is embedded in the query subspace. The FP32
    // export is only the quantization source, never the embedding model.
    let model_path = get_arg(&args, "--model")
        .unwrap_or_else(|| "models/qwen3-embedding-0.6b-int8/model_quantized.onnx".to_string());
    let tokenizer_path = get_arg(&args, "--tokenizer")
        .unwrap_or_else(|| "models/qwen3-embedding-0.6b-int8/tokenizer.json".to_string());
    let verses_path = get_arg(&args, "--verses")
        .unwrap_or_else(|| "data/verses-for-embedding.json".to_string());
    let output_embeddings = get_arg(&args, "--output-embeddings")
        .unwrap_or_else(|| "embeddings/kjv-qwen3-0.6b.bin".to_string());
    let output_ids = get_arg(&args, "--output-ids")
        .unwrap_or_else(|| "embeddings/kjv-qwen3-0.6b-ids.bin".to_string());

    log::info!("=== LumenLive Verse Embedding Pre-computation ===");
    log::info!("Model: {model_path}");
    log::info!("Tokenizer: {tokenizer_path}");
    log::info!("Verses: {verses_path}");
    log::info!("Output embeddings: {output_embeddings}");
    log::info!("Output IDs: {output_ids}");

    // Create output directory
    if let Some(parent) = PathBuf::from(&output_embeddings).parent() {
        std::fs::create_dir_all(parent).expect("Failed to create output directory");
    }

    // Load the ONNX model. No prompt prefix is applied: Qwen3-Embedding uses a
    // symmetric no-prefix contract for both verses and runtime queries, matching
    // the Python generators (data/precompute-embeddings*.py). These outputs must
    // stay interchangeable with the runtime query embeddings.
    log::info!("Loading ONNX model...");
    let embedder = lumenlive_detection::OnnxEmbedder::load(
        &PathBuf::from(&model_path),
        &PathBuf::from(&tokenizer_path),
    )
    .expect("Failed to load ONNX model");

    log::info!(
        "Model loaded. Embedding dimension: {}",
        lumenlive_detection::semantic::embedder::TextEmbedder::dimension(&embedder)
    );

    // Read verses JSON
    log::info!("Reading verses from {verses_path}...");
    let verses_json = std::fs::read_to_string(&verses_path).expect("Failed to read verses JSON");

    let entries: Vec<VerseEntry> =
        serde_json::from_str(&verses_json).expect("Failed to parse verses JSON");

    log::info!("Loaded {} verses", entries.len());

    // Convert to (id, text) pairs
    let verses: Vec<(i64, String)> = entries.into_iter().map(|e| (e.id, e.text)).collect();

    // Run pre-computation
    lumenlive_detection::semantic::precompute::precompute_embeddings(
        &embedder,
        &verses,
        &PathBuf::from(&output_embeddings),
        &PathBuf::from(&output_ids),
    )
    .expect("Pre-computation failed");

    log::info!("=== Done! ===");
}

fn get_arg(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .cloned()
}
