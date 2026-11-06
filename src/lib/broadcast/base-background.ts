import type { Background, BaseBackground } from "@/types/broadcast"

/**
 * Pure helpers for the "Clear & Idle Background" editor — the global
 * base/master background shown when text is cleared and behind transparent
 * content. Kept out of the component so the type-select mapping and the
 * field-preserving background construction are unit-tested in isolation.
 */

/**
 * The value the base-background type select should show for a stored config:
 * `"output"` (none — each output uses its own theme), `"theme"`, or the bare
 * background's own type (`solid`/`gradient`/`image`/`video`).
 */
export function baseSourceOf(bb: BaseBackground | null): string {
  if (!bb) return "output"
  if (bb.kind === "theme") return "theme"
  return bb.background.type
}

/**
 * Build a full `Background` for a chosen type, preserving any fields the previous
 * background already had (so switching solid→gradient→image and back doesn't lose
 * the user's colour/URL). Seeds sensible defaults for the newly-selected type
 * when the corresponding field is absent.
 */
export function makeBaseBackground(
  type: Background["type"],
  prev: Background | null
): Background {
  const bg: Background = {
    type,
    color: prev?.color ?? "#000000",
    gradient: prev?.gradient ?? null,
    image: prev?.image ?? null,
    video: prev?.video ?? null,
  }
  if (type === "gradient" && !bg.gradient) {
    bg.gradient = {
      type: "linear",
      angle: 180,
      stops: [
        { color: "#1e3a8a", position: 0 },
        { color: "#000000", position: 100 },
      ],
    }
  }
  if (type === "image" && !bg.image) {
    bg.image = { url: "", fit: "cover", blur: 0, brightness: 100, tint: null }
  }
  if (type === "video" && !bg.video) {
    bg.video = { url: "", fit: "cover", brightness: 100 }
  }
  return bg
}
