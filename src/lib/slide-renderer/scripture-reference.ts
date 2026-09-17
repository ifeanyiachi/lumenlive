/**
 * Compose the reference label a scripture slide draws (e.g. `John 3:16 (KJV)`).
 *
 * A {@link SlideScriptureElement} stores the passage reference and its
 * translation as two fields; the audience only ever sees the reference the
 * renderer draws, so the translation is appended here to make the source of the
 * passage visible on screen. This mirrors the live bible-verse path
 * (`toVerseRenderData` / `buildMultiVerseReference`), which already bakes the
 * `(ABBREV)` suffix into the rendered reference.
 *
 * The translation is optional: an empty/whitespace abbreviation (e.g. an
 * imported slide that never carried one) yields the bare reference with no
 * trailing parentheses. Kept pure and colocated so the suffix format stays a
 * single, testable fact.
 */
export function formatScriptureReference(
  reference: string,
  translation?: string | null
): string {
  const abbrev = translation?.trim()
  return abbrev ? `${reference} (${abbrev})` : reference
}
