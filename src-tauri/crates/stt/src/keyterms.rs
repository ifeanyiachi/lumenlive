use std::io::Write;
use std::path::{Path, PathBuf};

/// Returns Bible book names, spoken forms, reference cues, and spoken numerals
/// for use as Deepgram keyword boosting.
#[allow(clippy::too_many_lines)]
pub fn bible_keyterms() -> Vec<String> {
    let mut terms: Vec<String> = Vec::new();

    // 66 Bible book names
    let books = [
        "Genesis",
        "Exodus",
        "Leviticus",
        "Numbers",
        "Deuteronomy",
        "Joshua",
        "Judges",
        "Ruth",
        "1 Samuel",
        "2 Samuel",
        "1 Kings",
        "2 Kings",
        "1 Chronicles",
        "2 Chronicles",
        "Ezra",
        "Nehemiah",
        "Esther",
        "Job",
        "Psalms",
        "Proverbs",
        "Ecclesiastes",
        "Song of Solomon",
        "Isaiah",
        "Jeremiah",
        "Lamentations",
        "Ezekiel",
        "Daniel",
        "Hosea",
        "Joel",
        "Amos",
        "Obadiah",
        "Jonah",
        "Micah",
        "Nahum",
        "Habakkuk",
        "Zephaniah",
        "Haggai",
        "Zechariah",
        "Malachi",
        "Matthew",
        "Mark",
        "Luke",
        "John",
        "Acts",
        "Romans",
        "1 Corinthians",
        "2 Corinthians",
        "Galatians",
        "Ephesians",
        "Philippians",
        "Colossians",
        "1 Thessalonians",
        "2 Thessalonians",
        "1 Timothy",
        "2 Timothy",
        "Titus",
        "Philemon",
        "Hebrews",
        "James",
        "1 Peter",
        "2 Peter",
        "1 John",
        "2 John",
        "3 John",
        "Jude",
        "Revelation",
    ];
    terms.extend(books.iter().map(ToString::to_string));

    // Spoken forms for numbered books
    let spoken = [
        "First Samuel",
        "Second Samuel",
        "First Kings",
        "Second Kings",
        "First Chronicles",
        "Second Chronicles",
        "First Corinthians",
        "Second Corinthians",
        "First Thessalonians",
        "Second Thessalonians",
        "First Timothy",
        "Second Timothy",
        "First Peter",
        "Second Peter",
        "First John",
        "Second John",
        "Third John",
        "Song of Songs",
    ];
    terms.extend(spoken.iter().map(ToString::to_string));

    // Reference cues — natural phrases pastors and ministers use
    let cues = [
        "chapter",
        "verse",
        "verses",
        "open to",
        "turn to",
        "go to",
        "reading from",
        "look at",
        "go to the next verse",
        "go to the previous verse",
        "next chapter",
        "previous chapter",
        "the scripture says",
        "the word says",
        "the Bible says",
        "according to",
        "it is written",
        "as it says in",
        "let us read",
        "let's read",
        "I want to read",
    ];
    terms.extend(cues.iter().map(ToString::to_string));

    // Spoken numerals to help transcription accuracy
    let numerals = [
        "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
        "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
        "eighty", "ninety", "hundred",
    ];
    terms.extend(numerals.iter().map(ToString::to_string));

    terms
}

/// Write the Bible keyterms as a sherpa-onnx **hotwords** file for the offline
/// Zipformer transducer, and return its path.
///
/// The same list that boosts Deepgram's cloud recognizer ([`bible_keyterms`])
/// biases the on-device transducer's beam search toward scripture vocabulary —
/// the rare proper nouns (Habakkuk, Philemon, Zephaniah) and reference cues
/// ("turn to", "chapter", "verse") that a generic model mangles.
///
/// Format (one entry per line, sherpa-onnx hotwords syntax):
/// ```text
/// HABAKKUK :2.5
/// TURN TO :2.5
/// ```
/// Phrases are **upper-cased** to match the token casing of the English BPE
/// Zipformer models, and each carries an explicit boost. Hotwords are only
/// honored when the recognizer is built with `modeling_unit = "bpe"` and a
/// `bpe.vocab`, and decodes with `modified_beam_search` — greedy search ignores
/// them (see [`crate::sherpa::TransducerProvider`]).
///
/// # Errors
/// Returns any I/O error from creating or writing the file.
pub fn write_hotwords_file(dir: &Path) -> std::io::Result<PathBuf> {
    let path = dir.join("lumenlive-bible-hotwords.txt");
    let mut file = std::fs::File::create(&path)?;
    for term in bible_keyterms() {
        writeln!(file, "{} :2.5", term.to_uppercase())?;
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::{bible_keyterms, write_hotwords_file};

    #[test]
    fn hotwords_file_is_written_upper_cased_and_boosted() {
        let dir = std::env::temp_dir().join(format!(
            "lumenlive-hotwords-{}-{}",
            std::process::id(),
            "keyterms"
        ));
        std::fs::create_dir_all(&dir).unwrap();

        let path = write_hotwords_file(&dir).expect("hotwords file must write");
        let body = std::fs::read_to_string(&path).unwrap();

        // One boosted line per keyterm, all upper-cased.
        assert_eq!(body.lines().count(), bible_keyterms().len());
        assert!(
            body.contains("HABAKKUK :2.5"),
            "rare book names must be present and boosted"
        );
        assert!(
            body.contains("TURN TO :2.5"),
            "reference cues must be present and boosted"
        );
        assert!(
            !body.contains("Habakkuk :"),
            "entries must be upper-cased to match BPE token casing"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
