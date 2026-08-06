import { load, type Store } from "@tauri-apps/plugin-store"
import type { Presentation, Slide } from "@/types/slide"
import { migrateSlideElements } from "@/types/slide"

/**
 * Tauri plugin-store adapter for presentation persistence.
 *
 * All plugin-store I/O for presentations lives here, so the store never imports
 * `@tauri-apps/plugin-store` directly. Load helpers throw on hard failure (the
 * caller decides how to degrade); the legacy migration and save helpers swallow
 * their own errors to match the store's historical behaviour.
 */

let tauriStore: Store | null = null

async function getPresentationStore(): Promise<Store> {
  if (!tauriStore) {
    tauriStore = await load("presentations.json", {
      autoSave: false,
      defaults: {},
    })
  }
  return tauriStore
}

/**
 * Structural check for a single persisted presentation. Guards the shape that
 * the migration + renderers rely on (`slides[]`, each with an `elements[]` of
 * objects) so one truncated / hand-edited / foreign record can be dropped
 * rather than throwing and taking the whole library down with it.
 */
function isStructurallyValidPresentation(
  value: unknown
): value is Presentation {
  if (!value || typeof value !== "object") return false
  const p = value as Record<string, unknown>
  if (typeof p.id !== "string") return false
  if (!Array.isArray(p.slides)) return false
  return p.slides.every(
    (s) =>
      s != null &&
      typeof s === "object" &&
      Array.isArray((s as Record<string, unknown>).elements) &&
      (s as { elements: unknown[] }).elements.every(
        (el) => el != null && typeof el === "object"
      )
  )
}

/**
 * Load and migrate the persisted presentations, or `null` when there are none.
 * Individually malformed records are skipped (and logged) so a single corrupt
 * deck can't hide the rest of the user's library. May still throw if the
 * underlying store cannot be opened/read at all.
 */
export async function loadStoredPresentations(): Promise<
  Presentation[] | null
> {
  const store = await getPresentationStore()
  const raw = await store.get("presentations")
  if (!Array.isArray(raw) || raw.length === 0) return null

  const valid = raw.filter(isStructurallyValidPresentation)
  const dropped = raw.length - valid.length
  if (dropped > 0) {
    console.warn(
      `[presentations] Skipped ${dropped} malformed presentation record(s) while loading`
    )
  }
  if (valid.length === 0) return null
  return migrateSlideElements(valid)
}

/**
 * One-time migration of the legacy `slides.json` store into presentation form.
 * Deletes the legacy key on success. Returns `null` (and swallows errors) when
 * there is nothing to migrate.
 */
export async function loadLegacySlidePresentations(): Promise<
  Presentation[] | null
> {
  try {
    const legacyStore = await load("slides.json", {
      autoSave: false,
      defaults: {},
    })
    const legacySlides = (await legacyStore.get("slides")) as
      Slide[] | undefined
    if (
      legacySlides &&
      Array.isArray(legacySlides) &&
      legacySlides.length > 0
    ) {
      const migrated: Presentation[] = legacySlides.map((slide) => ({
        id: slide.id,
        name: slide.name,
        slides: [slide],
        createdAt: slide.createdAt,
        updatedAt: slide.updatedAt,
      }))
      const withTypes = migrateSlideElements(migrated)
      await legacyStore.delete("slides")
      await legacyStore.save()
      return withTypes
    }
    return null
  } catch {
    // No legacy data or failed to read — that's fine.
    return null
  }
}

/** Persist the current presentations, swallowing errors like the store always has. */
export async function savePresentations(
  presentations: Presentation[]
): Promise<void> {
  try {
    const store = await getPresentationStore()
    await store.set("presentations", presentations)
    await store.save()
  } catch {
    console.warn("[presentations] Failed to persist presentations")
  }
}
