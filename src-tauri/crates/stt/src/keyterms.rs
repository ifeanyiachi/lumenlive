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
