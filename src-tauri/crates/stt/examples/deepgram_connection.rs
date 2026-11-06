//! Live smoke test of the desktop provider. Pass a credential on stdin and an
//! optional raw 16 kHz mono i16 PCM file as the first argument. Never logs keys.

use std::io::Read;
use std::time::Duration;

use lumenlive_stt::{DeepgramClient, SttProvider, TranscriptEvent};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut key = String::new();
    std::io::stdin().read_to_string(&mut key)?;
    let provider = DeepgramClient::new(key.trim().to_owned());
    #[expect(
        clippy::chunks_exact_to_as_chunks,
        reason = "as_chunks requires Rust 1.88; the workspace declares Rust 1.77"
    )]
    let samples: Vec<i16> = if let Some(path) = std::env::args().nth(1) {
        let bytes = std::fs::read(path)?;
        if bytes.len() % 2 != 0 {
            return Err("PCM input must contain complete 16-bit samples".into());
        }
        bytes
            .chunks_exact(2)
            .map(|b| i16::from_le_bytes([b[0], b[1]]))
            .collect()
    } else {
        vec![0; 16_000]
    };
    let (audio_tx, audio_rx) = crossbeam_channel::bounded(64);
    let (event_tx, mut event_rx) = tokio::sync::mpsc::channel(64);
    let audio_task = std::thread::spawn(move || {
        for chunk in samples.chunks(1600) {
            if audio_tx.send(chunk.to_vec()).is_err() {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        // Give endpoint detection enough trailing silence to commit the phrase.
        for _ in 0..20 {
            if audio_tx.send(vec![0; 1600]).is_err() {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    });
    let events = async {
        let mut connected = false;
        let mut final_text = String::new();
        while let Some(event) = event_rx.recv().await {
            match event {
                TranscriptEvent::Connected => connected = true,
                TranscriptEvent::Final { transcript, .. } => {
                    if !final_text.is_empty() {
                        final_text.push(' ');
                    }
                    final_text.push_str(&transcript);
                }
                _ => {}
            }
        }
        (connected, final_text)
    };
    let (result, (connected, transcript)) = tokio::time::timeout(Duration::from_secs(30), async {
        tokio::join!(provider.start(audio_rx, event_tx), events)
    })
    .await?;
    let _ = audio_task.join();
    println!(
        "{}",
        serde_json::json!({
            "provider": "deepgram", "model": "nova-3", "connected": connected,
            "completed": result.is_ok(), "transcript": transcript,
        })
    );
    result?;
    if !connected {
        return Err("Deepgram never connected".into());
    }
    Ok(())
}
