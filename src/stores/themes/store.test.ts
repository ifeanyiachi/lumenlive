import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Theme } from "@/types/theme"

// Mock the persistence gateway so the store can run without a Tauri runtime and
// so we can assert what gets loaded/saved.
const loadStoredThemes = vi.fn(async (): Promise<Theme[] | null> => null)
const saveThemes = vi.fn(async (_themes: Theme[]): Promise<void> => {})
vi.mock("@/services/theme-store-gateway", () => ({
  loadStoredThemes: () => loadStoredThemes(),
  saveThemes: (t: Theme[]) => saveThemes(t),
}))

const mkTheme = (id: string, over: Partial<Theme> = {}): Theme => ({
  id,
  name: id,
  type: "song",
  builtin: false,
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  resolution: { width: 1920, height: 1080 },
  background: { type: "solid", color: "#000" },
  elements: [],
  ...over,
})

async function freshStore() {
  vi.resetModules()
  vi.clearAllMocks()
  return import("./store")
}

describe("themes store — CRUD", () => {
  beforeEach(() => vi.resetModules())

  it("upsertTheme inserts then replaces by id, forcing builtin:false", async () => {
    const { useThemesStore } = await freshStore()
    useThemesStore.getState().upsertTheme(mkTheme("a", { builtin: true }))
    expect(useThemesStore.getState().customThemes).toHaveLength(1)
    expect(useThemesStore.getState().customThemes[0].builtin).toBe(false)

    useThemesStore.getState().upsertTheme(mkTheme("a", { name: "a2" }))
    expect(useThemesStore.getState().customThemes).toHaveLength(1)
    expect(useThemesStore.getState().customThemes[0].name).toBe("a2")
  })

  it("updateTheme patches in place and cannot change id/builtin", async () => {
    const { useThemesStore } = await freshStore()
    useThemesStore.getState().upsertTheme(mkTheme("a"))
    useThemesStore
      .getState()
      .updateTheme("a", { name: "renamed", id: "hijack", builtin: true })
    const t = useThemesStore.getState().customThemes[0]
    expect(t.id).toBe("a")
    expect(t.name).toBe("renamed")
    expect(t.builtin).toBe(false)
  })

  it("renameTheme, setThemePinned, deleteTheme", async () => {
    const { useThemesStore } = await freshStore()
    useThemesStore.getState().upsertTheme(mkTheme("a"))
    useThemesStore.getState().renameTheme("a", "New")
    expect(useThemesStore.getState().customThemes[0].name).toBe("New")
    useThemesStore.getState().setThemePinned("a", true)
    expect(useThemesStore.getState().customThemes[0].pinned).toBe(true)
    useThemesStore.getState().deleteTheme("a")
    expect(useThemesStore.getState().customThemes).toHaveLength(0)
  })

  it("allThemes merges built-ins + customs; getThemeById spans both", async () => {
    const { useThemesStore } = await freshStore()
    const { BUILTIN_THEMES } = await import("@/lib/theme/builtins")
    useThemesStore.getState().upsertTheme(mkTheme("custom-x"))
    expect(useThemesStore.getState().allThemes()).toHaveLength(
      BUILTIN_THEMES.length + 1
    )
    expect(useThemesStore.getState().getThemeById("builtin-song")?.type).toBe(
      "song"
    )
    expect(useThemesStore.getState().getThemeById("custom-x")?.id).toBe(
      "custom-x"
    )
  })
})

describe("themes store — hydration + persistence", () => {
  beforeEach(() => vi.resetModules())

  it("hydrateThemes loads persisted themes into state", async () => {
    loadStoredThemes.mockResolvedValueOnce([mkTheme("persisted")])
    const { useThemesStore, hydrateThemes } = await freshStore()
    await hydrateThemes()
    expect(useThemesStore.getState().customThemes).toEqual([
      mkTheme("persisted"),
    ])
  })

  it("is idempotent — a second hydrate does not reload", async () => {
    const { hydrateThemes } = await freshStore()
    await hydrateThemes()
    await hydrateThemes()
    expect(loadStoredThemes).toHaveBeenCalledTimes(1)
  })

  it("persists (debounced) after a change once hydrated", async () => {
    vi.useFakeTimers()
    try {
      const { useThemesStore, hydrateThemes, flushThemes } = await freshStore()
      await hydrateThemes()
      useThemesStore.getState().upsertTheme(mkTheme("a"))
      await flushThemes()
      expect(saveThemes).toHaveBeenCalledWith([mkTheme("a")])
    } finally {
      vi.useRealTimers()
    }
  })
})
