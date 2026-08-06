//! Utility to pre-compute embeddings for every Bible verse and persist
//! them to binary files that `HnswVectorIndex::load` can read.
//!
//! This module requires the `onnx` feature so it has access to
//! `OnnxEmbedder`.

#[cfg(feature = "onnx")]
use std::fs::OpenOptions;
#[cfg(feature = "onnx")]
use std::io::Write;
#[cfg(feature = "onnx")]
use std::path::Path;

#[cfg(feature = "onnx")]
use crate::error::DetectionError;
#[cfg(feature = "onnx")]
use super::embedder::TextEmbedder;
#[cfg(feature = "onnx")]
use super::onnx_embedder::OnnxEmbedder;

/// Pre-compute embeddings for a set of verses and write the results to
/// binary files.
///
/// # Arguments
///
/// * `embedder` -- an `OnnxEmbedder`. It applies no prompt prefix: Qwen3
///   uses a symmetric no-prefix contract, so these document embeddings live
///   in the same subspace as the runtime query embeddings.
/// * `verses` -- `(verse_id, verse_text)` pairs.
/// * `output_embeddings_path` -- destination for the raw `f32` embedding
///   matrix.
/// * `output_ids_path` -- destination for the raw `i64` verse-ID array.
///
/// Both files are written in the platform's native byte order.  The
/// embeddings file is a flat array of `f32` values (`dim * num_verses`
/// floats) and the IDs file is a flat array of `i64` values
/// (`num_verses` entries).
#[cfg(feature = "onnx")]
pub fn precompute_embeddings(
    embedder: &OnnxEmbedder,
    verses: &[(i64, String)],
    output_embeddings_path: &Path,
    output_ids_path: &Path,
) -> Result<(), DetectionError> {
    let total = verses.len();
    let dim = TextEmbedder::dimension(embedder);
    let emb_bytes_per_verse = dim as u64 * std::mem::size_of::<f32>() as u64;
    let id_bytes_per_verse = std::mem::size_of::<i64>() as u64;

    // Resume support: this runs for tens of minutes to hours and can be killed
    // mid-way (OS sleep, power loss, task reaping). Both outputs are flat raw
    // arrays written verse-by-verse in the fixed `verses` order, so a partial
    // file is a valid prefix. We keep the longest prefix that is *consistent*
    // across BOTH files (a kill can leave the two out of sync by one verse) and
    // append the remainder, rather than re-embedding from scratch.
    let done = completed_prefix_len(
        file_len(output_embeddings_path) / emb_bytes_per_verse,
        file_len(output_ids_path) / id_bytes_per_verse,
    );
    let done_usize = usize::try_from(done).unwrap_or(usize::MAX).min(total);

    if done_usize > 0 {
        // Trim any partial/over-long tail back to the consistent prefix so the
        // appended bytes line up exactly on verse boundaries.
        truncate_file(output_embeddings_path, done * emb_bytes_per_verse)?;
        truncate_file(output_ids_path, done * id_bytes_per_verse)?;
        log::info!("Resuming: {done_usize}/{total} verses already embedded; appending the rest.");
    } else {
        log::info!("Pre-computing embeddings for {total} verses ...");
    }

    // Append (creating if absent) so the retained prefix is preserved.
    let mut emb_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(output_embeddings_path)
        .map_err(|e| {
            DetectionError::Internal(format!("open {}: {e}", output_embeddings_path.display()))
        })?;

    let mut ids_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(output_ids_path)
        .map_err(|e| {
            DetectionError::Internal(format!("open {}: {e}", output_ids_path.display()))
        })?;

    for (i, (verse_id, text)) in verses.iter().enumerate().skip(done_usize) {
        let embedding = embedder.embed(text)?;

        // Write f32 vector as raw bytes (native byte order).
        // Safety: f32 has no padding and a well-defined repr.
        let emb_bytes: &[u8] = unsafe {
            std::slice::from_raw_parts(
                embedding.as_ptr().cast::<u8>(),
                embedding.len() * std::mem::size_of::<f32>(),
            )
        };
        emb_file.write_all(emb_bytes).map_err(|e| {
            DetectionError::Internal(format!("write embedding: {e}"))
        })?;

        // Write verse_id as raw i64 bytes (native byte order).
        let id_bytes = verse_id.to_ne_bytes();
        ids_file.write_all(&id_bytes).map_err(|e| {
            DetectionError::Internal(format!("write id: {e}"))
        })?;

        if (i + 1) % 1000 == 0 || i + 1 == total {
            log::info!("  embedded {}/{} verses", i + 1, total);
        }
    }

    log::info!("Pre-computation complete. Files written.");
    Ok(())
}

/// Size of `path` in bytes, or 0 if it does not exist / can't be stat'd.
#[cfg(feature = "onnx")]
fn file_len(path: &Path) -> u64 {
    std::fs::metadata(path).map_or(0, |m| m.len())
}

/// Longest verse prefix present in BOTH output files. A kill between the two
/// `write_all` calls can leave the embeddings and ids files differing by one
/// verse; the consistent (resumable) length is the smaller of the two counts.
#[cfg(feature = "onnx")]
fn completed_prefix_len(emb_verses: u64, id_verses: u64) -> u64 {
    emb_verses.min(id_verses)
}

/// Truncate `path` to exactly `len` bytes (used to trim a partial trailing
/// record back to a verse boundary before appending).
#[cfg(feature = "onnx")]
fn truncate_file(path: &Path, len: u64) -> Result<(), DetectionError> {
    let f = OpenOptions::new()
        .write(true)
        .open(path)
        .map_err(|e| DetectionError::Internal(format!("open for truncate {}: {e}", path.display())))?;
    f.set_len(len)
        .map_err(|e| DetectionError::Internal(format!("truncate {}: {e}", path.display())))
}

#[cfg(all(test, feature = "onnx"))]
mod tests {
    use super::completed_prefix_len;

    #[test]
    fn consistent_prefix_is_the_shorter_count() {
        // Fully in sync.
        assert_eq!(completed_prefix_len(100, 100), 100);
        // Embeddings written but id write was interrupted → resume from ids.
        assert_eq!(completed_prefix_len(101, 100), 100);
        // The reverse ordering.
        assert_eq!(completed_prefix_len(100, 101), 100);
        // Nothing done yet.
        assert_eq!(completed_prefix_len(0, 0), 0);
    }
}
