//! Phase-A benchmark: measure real-time factor (RTF) and transcript quality for
//! candidate sherpa-onnx models on THIS machine, without touching the app audio
//! pipeline. Compares a streaming zipformer transducer against Moonshine.
//!
//! RTF = inference wall-clock / audio duration. RTF < 1 means faster than real
//! time. Each clip is run twice; the second (warm) run is reported so ONNX
//! Runtime graph init is excluded from the steady-state number.
//!
//! Run (from src-tauri/):
//! ```text
//! cargo run --release -p lumenlive-stt --example sherpa_bench --features sherpa -- \
//!     zipformer <encoder> <decoder> <joiner> <tokens> <wav>...
//! cargo run --release -p lumenlive-stt --example sherpa_bench --features sherpa -- \
//!     moonshine <preprocess> <encode> <uncached_decode> <cached_decode> <tokens> <wav>...
//! ```

use std::time::Instant;

type BoxErr = Box<dyn std::error::Error>;

fn main() -> Result<(), BoxErr> {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("zipformer") => run_zipformer(&args[2..]),
        Some("moonshine") => run_moonshine(&args[2..]),
        _ => {
            eprintln!(
                "usage:\n  sherpa_bench zipformer <encoder> <decoder> <joiner> <tokens> <wav>...\n  sherpa_bench moonshine <preprocess> <encode> <uncached_decode> <cached_decode> <tokens> <wav>..."
            );
            std::process::exit(2);
        }
    }
}

fn run_zipformer(a: &[String]) -> Result<(), BoxErr> {
    let [encoder, decoder, joiner, tokens, wavs @ ..] = a else {
        return Err("zipformer needs: <encoder> <decoder> <joiner> <tokens> <wav>...".into());
    };
    // Streaming zipformer must go through the ONLINE transducer recognizer.
    // (The offline `zipformer::ZipFormer` wrapper aborts on a streaming model:
    // its chunked, stateful encoder is incompatible with the offline API.)
    let cfg = sherpa_rs::transducer::TransducerConfig {
        encoder: encoder.clone(),
        decoder: decoder.clone(),
        joiner: joiner.clone(),
        tokens: tokens.clone(),
        num_threads: 2,
        sample_rate: 16000,
        feature_dim: 80,
        decoding_method: "greedy_search".into(),
        provider: Some("cpu".into()),
        ..Default::default()
    };
    let t = Instant::now();
    let mut rec = sherpa_rs::transducer::TransducerRecognizer::new(cfg)?;
    println!("== zipformer (online) ==  model loaded in {:?}", t.elapsed());
    for wav in wavs {
        let (samples, sr) = sherpa_rs::read_audio_file(wav)?;
        let dur = samples.len() as f64 / f64::from(sr).max(1.0);
        let _ = rec.transcribe(sr, &samples); // warm-up
        let t = Instant::now();
        let text = rec.transcribe(sr, &samples);
        report(wav, dur, t.elapsed(), text.trim());
    }
    Ok(())
}

fn run_moonshine(a: &[String]) -> Result<(), BoxErr> {
    let [preprocessor, encoder, uncached, cached, tokens, wavs @ ..] = a else {
        return Err(
            "moonshine needs: <preprocess> <encode> <uncached_decode> <cached_decode> <tokens> <wav>...".into(),
        );
    };
    let cfg = sherpa_rs::moonshine::MoonshineConfig {
        preprocessor: preprocessor.clone(),
        encoder: encoder.clone(),
        uncached_decoder: uncached.clone(),
        cached_decoder: cached.clone(),
        tokens: tokens.clone(),
        provider: Some("cpu".into()),
        num_threads: Some(2),
        ..Default::default()
    };
    let t = Instant::now();
    let mut rec = sherpa_rs::moonshine::MoonshineRecognizer::new(cfg)?;
    println!("== moonshine ==  model loaded in {:?}", t.elapsed());
    for wav in wavs {
        let (samples, sr) = sherpa_rs::read_audio_file(wav)?;
        let dur = samples.len() as f64 / f64::from(sr).max(1.0);
        let _ = rec.transcribe(sr, &samples); // warm-up
        let t = Instant::now();
        let res = rec.transcribe(sr, &samples);
        report(wav, dur, t.elapsed(), res.text.trim());
    }
    Ok(())
}

fn report(wav: &str, dur_s: f64, elapsed: std::time::Duration, text: &str) {
    let rtf = elapsed.as_secs_f64() / dur_s.max(0.001);
    let name = std::path::Path::new(wav)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(wav);
    println!("  {name}  audio={dur_s:.1}s  infer={elapsed:.2?}  RTF={rtf:.3}");
    println!("    => \"{text}\"");
}
