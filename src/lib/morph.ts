/**
 * Decodes morphology codes into a human-readable Part of Speech, matching the
 * style of BibleHub's "Part of Speech" line (e.g. "Noun Feminine", "Verb").
 *
 * Two schemes are supported:
 *   - Hebrew/Aramaic — OSHB (openscriptures/morphhb) codes, e.g. "HNcfsa",
 *     "HC/Vqw3ms" (leading language letter, "/"-separated prefix segments).
 *   - Greek — STEPBible TAGNT grammar codes, e.g. "N-NSF", "V-PAI3S", "PREP".
 *
 * The instance morph carries more than the lexeme POS (case, number, tense…);
 * we surface the base part of speech plus gender for nouns/adjectives, which is
 * what a word-study card needs. Returns null when the code can't be parsed, so
 * callers can omit the row rather than show a raw code.
 */

const GREEK_BASE: Record<string, string> = {
  N: "Noun",
  A: "Adjective",
  T: "Article",
  V: "Verb",
  P: "Personal Pronoun",
  R: "Relative Pronoun",
  D: "Demonstrative Pronoun",
  K: "Correlative Pronoun",
  I: "Interrogative Pronoun",
  X: "Indefinite Pronoun",
  F: "Reflexive Pronoun",
  S: "Possessive Pronoun",
  Q: "Correlative/Interrogative Pronoun",
  C: "Reciprocal Pronoun",
}

// Multi-letter Greek tokens take priority over the single-letter table above.
const GREEK_WORD_TOKENS: Record<string, string> = {
  ADV: "Adverb",
  CONJ: "Conjunction",
  COND: "Conditional",
  PRT: "Particle",
  PREP: "Preposition",
  INJ: "Interjection",
  ARAM: "Aramaic",
  HEB: "Hebrew Term",
  PRP: "Proper Noun",
  PRI: "Proper Noun",
}

const HEBREW_BASE: Record<string, string> = {
  A: "Adjective",
  C: "Conjunction",
  D: "Adverb",
  N: "Noun",
  P: "Pronoun",
  R: "Preposition",
  S: "Suffix",
  T: "Particle",
  V: "Verb",
}

const GENDER: Record<string, string> = {
  M: "Masculine",
  F: "Feminine",
  N: "Neuter",
}

function withGender(base: string, gender: string | undefined): string {
  if (!gender) return base
  const name = GENDER[gender.toUpperCase()]
  return name ? `${base} ${name}` : base
}

function decodeGreek(morph: string): string | null {
  const tokens = morph.split("-")
  const head = tokens[0]?.toUpperCase() ?? ""
  if (!head) return null

  const word = GREEK_WORD_TOKENS[head]
  if (word) return word

  const base = GREEK_BASE[head[0]]
  if (!base) return null

  // Nouns/adjectives/articles carry gender as the last letter of the inflection
  // token (e.g. "NSF" → Nominative Singular Feminine → gender F).
  if (base === "Noun" || base === "Adjective") {
    const infl = tokens[1] ?? ""
    const genderChar = [...infl].reverse().find((c) => GENDER[c.toUpperCase()])
    return withGender(base, genderChar)
  }
  return base
}

function decodeHebrew(morph: string): string | null {
  // Drop the leading language letter (H/A) and take the last "/"-separated
  // segment — prefixes (conjunction, article, preposition) come first; the
  // headword's part of speech is the final segment.
  const stripped = morph.replace(/^[HA]/, "")
  const segment = stripped.split("/").pop() ?? ""
  const baseChar = segment[0]?.toUpperCase() ?? ""
  const base = HEBREW_BASE[baseChar]
  if (!base) return null

  if (base === "Noun" || base === "Adjective") {
    // Noun: <type><gender><number><state>, e.g. "Ncfsa" → gender 'f'.
    // Find the first gender letter (m/f) after the base char.
    const genderChar = [...segment.slice(1)].find((c) => c === "m" || c === "f")
    return withGender(base, genderChar)
  }
  return base
}

export function decodePartOfSpeech(
  morph: string | null | undefined,
  isHebrew: boolean
): string | null {
  if (!morph) return null
  const trimmed = morph.trim()
  if (!trimmed) return null
  return isHebrew ? decodeHebrew(trimmed) : decodeGreek(trimmed)
}
