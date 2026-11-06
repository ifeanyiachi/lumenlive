export interface Translation {
  id: number
  abbreviation: string
  title: string
  language: string
  is_copyrighted: boolean
  is_downloaded: boolean
}

export interface Book {
  id: number
  translation_id: number
  book_number: number
  name: string
  abbreviation: string
  testament: "OT" | "NT"
}

export interface Verse {
  id: number
  translation_id: number
  book_number: number
  book_name: string
  book_abbreviation: string
  chapter: number
  verse: number
  text: string
}

export interface CrossReference {
  from_ref: string
  to_ref: string
  votes: number
}

export interface OriginalWord {
  position: number
  word: string
  translit: string | null
  strong_number: string | null
  morph: string | null
  gloss: string | null
  /**
   * The English word this maps to in the verse (its in-context translation,
   * e.g. "God" for θεός). Present only when the word list was fetched with the
   * verse's English text; absent/undefined otherwise or when nothing aligned.
   */
  english_word?: string | null
}

export interface LexiconEntry {
  strong_number: string
  language: string
  lemma: string | null
  translit: string | null
  pronunciation: string | null
  definition: string | null
  kjv_usage: string | null
  /** Etymology / "Word Origin" (openscriptures `derivation`). Null in older DBs. */
  derivation: string | null
}
