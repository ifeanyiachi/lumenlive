/**
 * True when an event target is a text-entry surface — an `<input>`,
 * `<textarea>`, `<select>`, or any `contentEditable` node.
 *
 * Global keyboard handlers use this to avoid hijacking keys (Space, arrows,
 * Enter) while the operator is typing in a field. Accepts a raw `EventTarget`
 * (or null) so callers can pass `event.target` directly; anything that isn't an
 * element — `document`, `window`, or null — is treated as not editable.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable === true
  )
}
