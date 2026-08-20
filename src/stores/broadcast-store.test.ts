import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Slide } from "@/types/slide"
import type { VerseRenderData } from "@/types"
import type { StageLayout } from "@/types/stage-layout"
import type { BroadcastProp } from "@/types/broadcast"
import type { LiveMedia } from "./broadcast-store"

const emitToMock = vi.fn()

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: emitToMock,
}))
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}))

// In-memory stand-in for the tauri-plugin-store persistence layer. `storeData`
// is seeded per-test to drive the hydrate/migrate path. Declared via vi.hoisted
// so the (hoisted) vi.mock factory below can close over it.
const { storeData, mockThemeStore } = vi.hoisted(() => {
  const data = new Map<string, unknown>()
  return {
    storeData: data,
    mockThemeStore: {
      get: (key: string) => Promise.resolve(data.get(key)),
      set: (key: string, value: unknown) => {
        data.set(key, value)
        return Promise.resolve()
      },
      delete: (key: string) => {
        data.delete(key)
        return Promise.resolve()
      },
      save: () => Promise.resolve(),
    },
  }
})
vi.mock("@tauri-apps/plugin-store", () => ({
  load: () => Promise.resolve(mockThemeStore),
}))

describe("broadcast store sync", () => {
  beforeEach(async () => {
    emitToMock.mockReset()
    emitToMock.mockResolvedValue(undefined)
    vi.resetModules()
  })

  it("syncBroadcastOutput emits the live verse as a presented scripture slide (RF2)", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const theme = useBroadcastStore.getState().themes[0]
    const outputs = useBroadcastStore.getState().outputs
    const mainOutput = outputs.find((o) => o.id === "main")!
    mainOutput.themeId = theme.id
    // syncBroadcastOutputFor only emits the live verse when live; otherwise it
    // emits verse: null (blank output). Go live so the verse is emitted.
    useBroadcastStore.setState({
      isLive: true,
      outputs: [...outputs],
      liveVerse: {
        reference: "John 3:16",
        segments: [{ text: "For God so loved the world", verseNumber: 16 }],
      },
    })

    emitToMock.mockClear()
    useBroadcastStore.getState().syncBroadcastOutput()

    // The renderer Theme-object flip (RF2): a live verse is presented as a slide
    // carrying the verse, resolved from the new typed theme store — not verse-update.
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast",
      "broadcast:slide-update",
      expect.objectContaining({
        slide: expect.objectContaining({ id: "live-scripture" }),
        verse: expect.objectContaining({ reference: "John 3:16" }),
      })
    )
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast-alt",
      "broadcast:slide-update",
      expect.objectContaining({
        slide: expect.objectContaining({ id: "live-scripture" }),
        verse: expect.objectContaining({ reference: "John 3:16" }),
      })
    )
  })

  it("toggleBlackout flips ephemeral state and emits output-visibility", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const outputs = useBroadcastStore
      .getState()
      .outputs.map((o) => ({ ...o, enabled: true }))
    useBroadcastStore.setState({ outputs })
    expect(useBroadcastStore.getState().blackout).toBe(false)

    emitToMock.mockClear()
    useBroadcastStore.getState().toggleBlackout()
    expect(useBroadcastStore.getState().blackout).toBe(true)
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast",
      "broadcast:output-visibility",
      {
        blackout: true,
        clear: false,
        logo: false,
        logoImagePath: null,
      }
    )

    // Toggling again restores the output.
    useBroadcastStore.getState().toggleBlackout()
    expect(useBroadcastStore.getState().blackout).toBe(false)
  })

  it("toggleLogo is a no-op until a logo image is configured, then toggles", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const outputs = useBroadcastStore
      .getState()
      .outputs.map((o) => ({ ...o, enabled: true }))
    useBroadcastStore.setState({ outputs })

    // No logo configured → no-op.
    useBroadcastStore.getState().toggleLogo()
    expect(useBroadcastStore.getState().showLogo).toBe(false)

    // Configure a logo, then it toggles and emits the path — and clears any
    // other active state (mutual exclusivity).
    useBroadcastStore.getState().setLogoImage("C:/logos/church.png")
    useBroadcastStore.setState({ clearForeground: true })
    emitToMock.mockClear()
    useBroadcastStore.getState().toggleLogo()
    expect(useBroadcastStore.getState().showLogo).toBe(true)
    expect(useBroadcastStore.getState().clearForeground).toBe(false)
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast",
      "broadcast:output-visibility",
      {
        blackout: false,
        clear: false,
        logo: true,
        logoImagePath: "C:/logos/church.png",
      }
    )

    // Clearing the image also drops the live logo.
    useBroadcastStore.getState().setLogoImage(null)
    expect(useBroadcastStore.getState().showLogo).toBe(false)
  })

  it("toggleClearForeground turns off Black — states are mutually exclusive", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const outputs = useBroadcastStore
      .getState()
      .outputs.map((o) => ({ ...o, enabled: true }))
    useBroadcastStore.setState({ outputs, blackout: true })

    emitToMock.mockClear()
    useBroadcastStore.getState().toggleClearForeground()
    expect(useBroadcastStore.getState().clearForeground).toBe(true)
    // Enabling Clear clears Black so the screen shows exactly one state.
    expect(useBroadcastStore.getState().blackout).toBe(false)
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast",
      "broadcast:output-visibility",
      {
        blackout: false,
        clear: true,
        logo: false,
        logoImagePath: null,
      }
    )
  })

  it("delivers the base theme (resolved from the new store) — the output's own by default, the override when set", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const { resolveLegacyThemeId } = await import(
      "@/lib/theme/migrate/legacy-id"
    )
    const themes = useBroadcastStore.getState().themes
    const outputs = useBroadcastStore
      .getState()
      .outputs.map((o) => ({ ...o, enabled: true }))
    const mainOutput = outputs.find((o) => o.id === "main")!
    mainOutput.themeId = themes[0].id
    useBroadcastStore.setState({ outputs: [...outputs], isLive: true })

    // Default (no override): base theme = the output's own theme, resolved in the new
    // typed store via the legacy-id alias (RF3a).
    emitToMock.mockClear()
    useBroadcastStore.getState().syncBroadcastOutputFor("main")
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast",
      "broadcast:base-theme",
      expect.objectContaining({
        theme: expect.objectContaining({
          id: resolveLegacyThemeId(themes[0].id),
        }),
      })
    )

    // Override: the global base theme wins (also alias-resolved).
    const other = themes[1] ?? themes[0]
    useBroadcastStore
      .getState()
      .setBaseBackground({ kind: "theme", themeId: other.id })
    emitToMock.mockClear()
    useBroadcastStore.getState().syncBroadcastOutputFor("main")
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast",
      "broadcast:base-theme",
      expect.objectContaining({
        theme: expect.objectContaining({ id: resolveLegacyThemeId(other.id) }),
      })
    )
  })

  it("syncBroadcastOutputFor re-pushes the active props to the output so a just-opened window shows a running marquee", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    // One active marquee + one inactive prop: only the active one ships.
    useBroadcastStore.setState({
      isLive: true,
      props: [
        {
          id: "m1",
          type: "marquee",
          active: true,
          text: "Welcome",
        } as unknown as BroadcastProp,
        {
          id: "t1",
          type: "text",
          active: false,
          text: "Hidden",
        } as unknown as BroadcastProp,
      ],
    })

    emitToMock.mockClear()
    useBroadcastStore.getState().syncBroadcastOutputFor("main")

    const propsCall = emitToMock.mock.calls.find(
      (c) => c[1] === "broadcast:props-update"
    )
    expect(propsCall).toBeTruthy()
    expect(propsCall![2].props).toEqual([
      expect.objectContaining({ id: "m1", type: "marquee" }),
    ])
  })

  it("a layer-filter output carries its filter on slide and media payloads too", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const layers = {
      showContent: true,
      showProps: true,
      showAlerts: false,
      showCountdowns: true,
      showMediaLayer: false,
    }
    const outputs = useBroadcastStore.getState().outputs
    const mainOutput = outputs.find((o) => o.id === "main")!
    mainOutput.contentSource = { type: "layer-filter", layers }
    useBroadcastStore.setState({ isLive: true, outputs: [...outputs] })

    // Slide live path.
    emitToMock.mockClear()
    useBroadcastStore.setState({
      liveSlide: { id: "s1" } as unknown as Slide,
      liveMedia: null,
    })
    useBroadcastStore.getState().syncBroadcastOutputFor("main")
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast",
      "broadcast:slide-update",
      expect.objectContaining({ layerFilter: layers })
    )

    // Media live path.
    emitToMock.mockClear()
    useBroadcastStore.setState({
      liveSlide: null,
      liveMedia: { filePath: "clip.mp4", mediaType: "video", name: "clip.mp4" },
    })
    useBroadcastStore.getState().syncBroadcastOutputFor("main")
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast",
      "broadcast:media-update",
      expect.objectContaining({
        filePath: "clip.mp4",
        layerFilter: layers,
      })
    )
  })

  it("a non-layer-filter output omits the filter (shows everything)", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    useBroadcastStore.setState({
      isLive: true,
      liveSlide: { id: "s1" } as unknown as Slide,
      liveMedia: null,
    })
    emitToMock.mockClear()
    // Default "main" output is not a layer-filter output.
    useBroadcastStore.getState().syncBroadcastOutputFor("main")
    const slideCall = emitToMock.mock.calls.find(
      (c) => c[1] === "broadcast:slide-update"
    )
    expect(slideCall).toBeTruthy()
    expect(slideCall![2].layerFilter).toBeUndefined()
  })

  it("a mirror output renders with its source's theme and layer filter", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const themes = useBroadcastStore.getState().themes
    const sourceTheme = themes[0]
    const layers = {
      showContent: true,
      showProps: true,
      showAlerts: false,
      showCountdowns: true,
      showMediaLayer: true,
    }
    const outputs = useBroadcastStore.getState().outputs
    const main = outputs.find((o) => o.id === "main")!
    const alt = outputs.find((o) => o.id === "alt")!
    // main is a layer-filter output with sourceTheme; alt mirrors main but keeps
    // its own (different) theme, which mirroring must override.
    main.themeId = sourceTheme.id
    main.contentSource = { type: "layer-filter", layers }
    alt.themeId = themes[1]?.id ?? sourceTheme.id
    alt.contentSource = { type: "mirror", sourceOutputId: "main" }
    useBroadcastStore.setState({
      isLive: true,
      outputs: [...outputs],
      liveSlide: null,
      liveMedia: null,
      liveVerse: {
        reference: "Ps 23:1",
        segments: [{ text: "The LORD is my shepherd" }],
      },
    })

    emitToMock.mockClear()
    useBroadcastStore.getState().syncBroadcastOutputFor("alt")

    // A live verse is emitted as a presented scripture slide (RF2); the mirror still
    // inherits the source output's layer filter.
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast-alt",
      "broadcast:slide-update",
      expect.objectContaining({
        slide: expect.objectContaining({ id: "live-scripture" }),
        verse: expect.objectContaining({ reference: "Ps 23:1" }),
        layerFilter: layers,
      })
    )
  })
})

describe("broadcast store theme designer", () => {
  beforeEach(async () => {
    emitToMock.mockReset()
    emitToMock.mockResolvedValue(undefined)
    vi.resetModules()
  })

  it("addElement appends an element, selects it, and can be undone/redone", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const store = useBroadcastStore.getState()
    store.startEditing(store.themes[0].id)

    const before = useBroadcastStore.getState().draftTheme!.elements.length
    useBroadcastStore.getState().addElement("shape")

    const afterAdd = useBroadcastStore.getState()
    expect(afterAdd.draftTheme!.elements).toHaveLength(before + 1)
    const newId = afterAdd.selectedElement!
    expect(afterAdd.draftTheme!.layerOrder[0]).toBe(newId)

    useBroadcastStore.getState().undo()
    expect(useBroadcastStore.getState().draftTheme!.elements).toHaveLength(
      before
    )

    useBroadcastStore.getState().redo()
    expect(useBroadcastStore.getState().draftTheme!.elements).toHaveLength(
      before + 1
    )
  })

  it("removeElement clears the selection when the removed element was selected", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const store = useBroadcastStore.getState()
    store.startEditing(store.themes[0].id)
    useBroadcastStore.getState().addElement("image")
    const id = useBroadcastStore.getState().selectedElement!

    useBroadcastStore.getState().removeElement(id)
    const after = useBroadcastStore.getState()
    expect(after.selectedElement).toBeNull()
    expect(after.draftTheme!.elements.find((e) => e.id === id)).toBeUndefined()
  })

  it("duplicateElement inserts an offset copy and selects it", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const store = useBroadcastStore.getState()
    store.startEditing(store.themes[0].id)
    useBroadcastStore.getState().addElement("shape")
    const srcId = useBroadcastStore.getState().selectedElement!
    const src = useBroadcastStore
      .getState()
      .draftTheme!.elements.find((e) => e.id === srcId)!

    useBroadcastStore.getState().duplicateElement(srcId)
    const after = useBroadcastStore.getState()
    const copyId = after.selectedElement!
    expect(copyId).not.toBe(srcId)
    const copy = after.draftTheme!.elements.find((e) => e.id === copyId)!
    expect(copy.x).toBe(src.x + 2)
    expect(copy.name).toBe(`${src.name} Copy`)
  })

  it("nudgeElement on the verse region shifts the layout offset", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const store = useBroadcastStore.getState()
    store.startEditing(store.themes[0].id)
    useBroadcastStore.getState().setSelectedElement("verse")
    const before = useBroadcastStore.getState().draftTheme!.layout.offsetX

    useBroadcastStore.getState().nudgeElement(7, 0)
    expect(useBroadcastStore.getState().draftTheme!.layout.offsetX).toBe(
      before + 7
    )
  })

  it("nudgeElement is a no-op for a locked element", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const store = useBroadcastStore.getState()
    store.startEditing(store.themes[0].id)
    useBroadcastStore.getState().addElement("shape")
    const id = useBroadcastStore.getState().selectedElement!
    useBroadcastStore.getState().toggleElementLocked(id)
    const snapshot = useBroadcastStore
      .getState()
      .draftTheme!.elements.find((e) => e.id === id)!

    useBroadcastStore.getState().nudgeElement(50, 50)
    const after = useBroadcastStore
      .getState()
      .draftTheme!.elements.find((e) => e.id === id)!
    expect(after.x).toBe(snapshot.x)
    expect(after.y).toBe(snapshot.y)
  })

  it("saving an edited built-in forks a custom theme without changing the active output theme", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const store = useBroadcastStore.getState()
    const activeBefore = store.outputs.find((o) => o.id === "main")!.themeId
    store.startEditing(store.themes[0].id) // a built-in
    useBroadcastStore.getState().addElement("shape")

    useBroadcastStore.getState().saveDraft()

    const after = useBroadcastStore.getState()
    // A new custom theme was forked and is now the one being edited...
    const forked = after.draftTheme!
    expect(forked.builtin).toBe(false)
    expect(after.editingThemeId).toBe(forked.id)
    // ...but the main output's theme is untouched — save never sets the default.
    expect(after.outputs.find((o) => o.id === "main")!.themeId).toBe(
      activeBefore
    )
    expect(after.defaultThemeId).toBe(activeBefore)
  })

  it("setDefaultTheme records the default and applies it to the main output", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const target = useBroadcastStore.getState().themes[1]

    useBroadcastStore.getState().setDefaultTheme(target.id)

    const after = useBroadcastStore.getState()
    expect(after.defaultThemeId).toBe(target.id)
    expect(after.outputs.find((o) => o.id === "main")!.themeId).toBe(target.id)
  })

  it("setDefaultTheme ignores an unknown theme id", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const before = useBroadcastStore.getState().defaultThemeId

    useBroadcastStore.getState().setDefaultTheme("does-not-exist")

    expect(useBroadcastStore.getState().defaultThemeId).toBe(before)
  })

  it("deleting the default theme falls back to the first built-in", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const store = useBroadcastStore.getState()
    store.duplicateTheme(store.themes[0].id)
    const custom = useBroadcastStore.getState().themes.find((t) => !t.builtin)!
    useBroadcastStore.getState().setDefaultTheme(custom.id)
    expect(useBroadcastStore.getState().defaultThemeId).toBe(custom.id)

    useBroadcastStore.getState().deleteTheme(custom.id)

    expect(useBroadcastStore.getState().defaultThemeId).toBe(
      useBroadcastStore.getState().themes[0].id
    )
  })
})

/**
 * Locked-by-default staging: presenting an item always writes only the
 * `preview*` fields (the Program preview). The `live*` fields — what the output
 * windows mirror — change solely on {@link takeToLive} (the play icon, the Go
 * Live button, or Enter). Nothing reaches the audience without an explicit take.
 * Each test imports the store fresh (resetModules) so it starts from default.
 */
describe("broadcast store — staging (locked by default)", () => {
  const slide = (id: string) => ({ id }) as unknown as Slide
  const media = (filePath: string): LiveMedia => ({
    filePath,
    mediaType: "video",
    name: filePath,
  })

  beforeEach(async () => {
    emitToMock.mockReset()
    emitToMock.mockResolvedValue(undefined)
    vi.resetModules()
  })

  it("presenting while live stages preview only and leaves the audience untouched (no emit)", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const live = slide("live")
    useBroadcastStore.setState({
      isLive: true,
      liveSlide: live,
      previewSlide: live,
      previewPending: false,
    })
    emitToMock.mockClear()

    const staged = slide("staged")
    useBroadcastStore.getState().setLiveSlide(staged, "manual")

    expect(useBroadcastStore.getState().liveSlide).toBe(live) // audience untouched
    expect(useBroadcastStore.getState().previewSlide).toBe(staged)
    expect(useBroadcastStore.getState().previewPending).toBe(true)
    expect(emitToMock).not.toHaveBeenCalled()
  })

  it("presenting off-air also only stages — nothing is committed to live", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    useBroadcastStore.setState({ isLive: false })
    emitToMock.mockClear()

    const a = slide("a")
    useBroadcastStore.getState().setLiveSlide(a, "manual")

    expect(useBroadcastStore.getState().liveSlide).toBeNull()
    expect(useBroadcastStore.getState().previewSlide).toBe(a)
    expect(useBroadcastStore.getState().previewPending).toBe(true)
  })

  it("takeToLive: commits the staged item to the audience and emits", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const staged = slide("staged")
    useBroadcastStore.setState({
      isLive: true,
      liveSlide: slide("live"),
      previewSlide: staged,
      previewSource: "manual",
      previewPending: true,
    })
    emitToMock.mockClear()

    useBroadcastStore.getState().takeToLive()

    expect(useBroadcastStore.getState().liveSlide).toBe(staged)
    expect(useBroadcastStore.getState().previewPending).toBe(false)
    expect(emitToMock).toHaveBeenCalled()
  })

  it("takeToLive: no-op when nothing is pending", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const live = slide("live")
    useBroadcastStore.setState({
      isLive: true,
      liveSlide: live,
      previewSlide: live,
      previewPending: false,
    })
    emitToMock.mockClear()

    useBroadcastStore.getState().takeToLive()

    expect(useBroadcastStore.getState().liveSlide).toBe(live)
    expect(emitToMock).not.toHaveBeenCalled()
  })

  it("takeToLive commits the staged media by reference (no restart of a same item)", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const staged = media("clip.mp4")
    useBroadcastStore.setState({
      isLive: true,
      previewMedia: staged,
      previewSource: "manual",
      previewPending: true,
    })
    emitToMock.mockClear()

    useBroadcastStore.getState().takeToLive()

    expect(useBroadcastStore.getState().liveMedia).toBe(staged)
    expect(emitToMock).toHaveBeenCalled()
  })

  it("going off-air clears any pending stage", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    useBroadcastStore.setState({
      isLive: true,
      previewPending: true,
    })

    useBroadcastStore.getState().setLive(false)

    expect(useBroadcastStore.getState().previewPending).toBe(false)
  })
})

describe("broadcast store — followManualSelection", () => {
  const verse = (reference: string): VerseRenderData => ({
    reference,
    segments: [{ text: reference, verseNumber: 1 }],
  })

  beforeEach(async () => {
    emitToMock.mockReset()
    emitToMock.mockResolvedValue(undefined)
    vi.resetModules()
  })

  it("releases a queue/schedule pin so the preview follows the selection", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    // Present a scheduled verse and take it live: the preview is pinned to the
    // schedule copy and the audience owns the schedule source.
    useBroadcastStore.getState().setLiveVerse(verse("Ps 23:1"), "schedule")
    useBroadcastStore.getState().takeToLive()
    expect(useBroadcastStore.getState().previewSource).toBe("schedule")
    expect(useBroadcastStore.getState().broadcastSource).toBe("schedule")

    useBroadcastStore.getState().followManualSelection()

    // Preview ownership is back to manual, so the panel renders the selected
    // verse (previewSource null) instead of the stale staged one.
    expect(useBroadcastStore.getState().previewSource).toBeNull()
    expect(useBroadcastStore.getState().broadcastSource).toBeNull()
    expect(useBroadcastStore.getState().previewVerse).toBeNull()
  })

  it("clears a staged slide/media/web so a stale non-verse preview can't win", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    useBroadcastStore.setState({
      previewSlide: { id: "s" } as unknown as Slide,
      previewMedia: { filePath: "x", mediaType: "video", name: "x" },
    })

    useBroadcastStore.getState().followManualSelection()

    expect(useBroadcastStore.getState().previewSlide).toBeNull()
    expect(useBroadcastStore.getState().previewMedia).toBeNull()
    expect(useBroadcastStore.getState().previewWeb).toBeNull()
  })

  it("leaves the live output untouched", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const live = verse("John 1:1")
    useBroadcastStore.setState({
      isLive: true,
      liveVerse: live,
      previewVerse: verse("Acts 2:1"),
      previewSource: "schedule",
    })
    emitToMock.mockClear()

    useBroadcastStore.getState().followManualSelection()

    // Audience stays on the live verse; nothing is emitted to outputs.
    expect(useBroadcastStore.getState().liveVerse).toBe(live)
    expect(emitToMock).not.toHaveBeenCalled()
  })
})

describe("broadcast store — stage monitor targeting", () => {
  beforeEach(async () => {
    emitToMock.mockReset()
    emitToMock.mockResolvedValue(undefined)
    vi.resetModules()
  })

  // Two stage monitors sharing the default theme, plus the normal "main".
  const withTwoStageMonitors = (useBroadcastStore: {
    getState: () => {
      themes: { id: string }[]
    }
    setState: (patch: Record<string, unknown>) => void
  }) => {
    const themeId = useBroadcastStore.getState().themes[0].id
    useBroadcastStore.setState({
      outputs: [
        {
          id: "main",
          name: "Program",
          themeId,
          mode: "normal",
          contentSource: { type: "independent" },
          enabled: true,
        },
        {
          id: "stage-a",
          name: "Musicians",
          themeId,
          mode: "stage",
          contentSource: { type: "independent" },
          enabled: true,
        },
        {
          id: "stage-b",
          name: "Hosts",
          themeId,
          mode: "stage",
          contentSource: { type: "independent" },
          enabled: true,
        },
      ],
    })
  }

  it("setStageCue writes the cue to only the targeted monitors", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    withTwoStageMonitors(useBroadcastStore)

    useBroadcastStore.getState().setStageCue(["stage-a"], "WRAP UP", null)

    const s = useBroadcastStore.getState()
    expect(s.stageMessages["stage-a"]).toBe("WRAP UP")
    expect(s.stageMessages["stage-b"]).toBeUndefined()
    // The per-window emit carries each monitor's own value.
    expect(emitToMock).toHaveBeenCalledWith(
      expect.stringContaining("stage-a"),
      "broadcast:stage-update",
      expect.objectContaining({ message: "WRAP UP" })
    )
    expect(emitToMock).toHaveBeenCalledWith(
      expect.stringContaining("stage-b"),
      "broadcast:stage-update",
      expect.objectContaining({ message: null })
    )
  })

  it("clearStageCue removes both cues from the targeted monitors", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    withTwoStageMonitors(useBroadcastStore)
    useBroadcastStore.getState().setStageCue(["stage-a"], "HELLO", "note")

    useBroadcastStore.getState().clearStageCue(["stage-a"])

    const s = useBroadcastStore.getState()
    expect(s.stageMessages["stage-a"]).toBeUndefined()
    expect(s.stageAnnouncements["stage-a"]).toBeUndefined()
  })

  it("groups: add returns an id, update patches, remove deletes", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    withTwoStageMonitors(useBroadcastStore)

    const id = useBroadcastStore
      .getState()
      .addStageMonitorGroup("Band", ["stage-a"])
    expect(typeof id).toBe("string")
    expect(useBroadcastStore.getState().stageMonitorGroups).toHaveLength(1)

    useBroadcastStore
      .getState()
      .updateStageMonitorGroup(id, { outputIds: ["stage-a", "stage-b"] })
    expect(
      useBroadcastStore.getState().stageMonitorGroups[0].outputIds
    ).toEqual(["stage-a", "stage-b"])

    useBroadcastStore.getState().removeStageMonitorGroup(id)
    expect(useBroadcastStore.getState().stageMonitorGroups).toHaveLength(0)
  })

  it("removeOutput prunes the monitor's cue and its group membership", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    withTwoStageMonitors(useBroadcastStore)
    useBroadcastStore.getState().setStageCue(["stage-a", "stage-b"], "HI", null)
    const gid = useBroadcastStore
      .getState()
      .addStageMonitorGroup("All", ["stage-a", "stage-b"])

    useBroadcastStore.getState().removeOutput("stage-a")

    const s = useBroadcastStore.getState()
    expect(s.outputs.some((o) => o.id === "stage-a")).toBe(false)
    expect(s.stageMessages["stage-a"]).toBeUndefined()
    expect(s.stageMonitorGroups.find((g) => g.id === gid)?.outputIds).toEqual([
      "stage-b",
    ])
  })
})

/**
 * YouTube plays inside each output window now (an embedded `OutputWebLayer`),
 * not a separate overlay window. `syncWebOutput` therefore fans the cue out over
 * the `broadcast:web-content` event to the ENABLED outputs, and teardown clears
 * every output. These guard the routing (and the enabled filter that a stray
 * unfiltered loop had been leaking through).
 */
describe("broadcast store — embedded web output routing", () => {
  beforeEach(() => {
    emitToMock.mockReset()
    emitToMock.mockResolvedValue(undefined)
    vi.resetModules()
  })

  it("routes a live YouTube item to every enabled output via web-content", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const outputs = useBroadcastStore
      .getState()
      .outputs.map((o) => ({ ...o, enabled: true }))
    useBroadcastStore.setState({
      isLive: true,
      outputs,
      liveWeb: {
        url: "https://youtu.be/abc123",
        isYouTube: true,
        videoId: "abc123",
        startTime: 12,
        endTime: 340,
        isLive: false,
        autoplay: false,
        nonce: 1,
      },
    })

    emitToMock.mockClear()
    useBroadcastStore.getState().syncWebOutput()

    const payload = expect.objectContaining({
      videoId: "abc123",
      start: 12,
      end: 340,
      muted: false,
      autoplay: false,
      nonce: 1,
    })
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast",
      "broadcast:web-content",
      payload
    )
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast-alt",
      "broadcast:web-content",
      payload
    )
  })

  it("skips a disabled output when routing web content", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const outputs = useBroadcastStore
      .getState()
      .outputs.map((o) => ({ ...o, enabled: o.id === "main" }))
    useBroadcastStore.setState({
      isLive: true,
      outputs,
      liveWeb: {
        url: "https://youtu.be/xyz",
        isYouTube: true,
        videoId: "xyz",
        isLive: false,
        autoplay: false,
        nonce: 2,
      },
    })

    emitToMock.mockClear()
    useBroadcastStore.getState().syncWebOutput()

    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast",
      "broadcast:web-content",
      expect.any(Object)
    )
    expect(emitToMock).not.toHaveBeenCalledWith(
      "broadcast-alt",
      "broadcast:web-content",
      expect.any(Object)
    )
  })

  it("clearLiveWeb tears down the embedded player on every output", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const outputs = useBroadcastStore.getState().outputs
    useBroadcastStore.setState({
      liveWeb: {
        url: "https://youtu.be/abc",
        isYouTube: true,
        videoId: "abc",
        nonce: 1,
      },
    })

    emitToMock.mockClear()
    useBroadcastStore.getState().clearLiveWeb()

    for (const o of outputs) {
      const label = o.id === "main" ? "broadcast" : `broadcast-${o.id}`
      expect(emitToMock).toHaveBeenCalledWith(
        label,
        "broadcast:web-content",
        null
      )
    }
    expect(useBroadcastStore.getState().liveWeb).toBeNull()
  })
})

// ── Split-sensitive coverage added in Wave 3 / S1 Phase 1 (audit gap-fill) ──
// These guard the paths the broadcast-store slicing will touch: the stage-layout
// designer's own undo stack (which S1 will fold into a generic `createDesignerSlice`
// alongside the theme designer) and the paginated-verse stepping (which moves into
// the `live-transport` slice).

describe("broadcast store stage-layout designer", () => {
  beforeEach(async () => {
    emitToMock.mockReset()
    emitToMock.mockResolvedValue(undefined)
    vi.resetModules()
  })

  it("addZone appends a zone and can be undone/redone (parity with the theme designer)", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const store = useBroadcastStore.getState()
    store.startEditingStageLayout(store.stageLayouts[0].id)

    const before = useBroadcastStore.getState().draftStageLayout!.zones.length
    useBroadcastStore.getState().addZone("clock")
    expect(useBroadcastStore.getState().draftStageLayout!.zones).toHaveLength(
      before + 1
    )

    useBroadcastStore.getState().stageUndo()
    expect(useBroadcastStore.getState().draftStageLayout!.zones).toHaveLength(
      before
    )

    useBroadcastStore.getState().stageRedo()
    expect(useBroadcastStore.getState().draftStageLayout!.zones).toHaveLength(
      before + 1
    )
  })

  it("discardStageDraft reverts in-progress changes to the pristine layout", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const store = useBroadcastStore.getState()
    store.startEditingStageLayout(store.stageLayouts[0].id)
    const original = useBroadcastStore.getState().draftStageLayout!.zones.length
    useBroadcastStore.getState().addZone("timer")
    expect(useBroadcastStore.getState().draftStageLayout!.zones).toHaveLength(
      original + 1
    )

    // Discard reloads the pristine layout (draft stays open, changes dropped).
    useBroadcastStore.getState().discardStageDraft()
    expect(useBroadcastStore.getState().draftStageLayout!.zones).toHaveLength(
      original
    )
  })
})

describe("broadcast store — verse pagination stepping", () => {
  beforeEach(async () => {
    emitToMock.mockReset()
    emitToMock.mockResolvedValue(undefined)
    vi.resetModules()
  })

  it("next/prevVersePage walk the pages and no-op at the bounds", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const pages: VerseRenderData[] = [
      { reference: "R", segments: [{ text: "p0" }] },
      { reference: "R", segments: [{ text: "p1" }] },
      { reference: "R", segments: [{ text: "p2" }] },
    ]
    useBroadcastStore.setState({
      liveVersePages: pages,
      liveVersePageIndex: 0,
      liveVerse: pages[0],
    })
    const s = () => useBroadcastStore.getState()

    expect(s().prevVersePage()).toBe(false) // already at first page
    expect(s().nextVersePage()).toBe(true)
    expect(s().liveVersePageIndex).toBe(1)
    expect(s().liveVerse).toBe(pages[1])
    expect(s().nextVersePage()).toBe(true)
    expect(s().liveVersePageIndex).toBe(2)
    expect(s().nextVersePage()).toBe(false) // already at last page
    expect(s().prevVersePage()).toBe(true)
    expect(s().liveVersePageIndex).toBe(1)
    expect(s().liveVerse).toBe(pages[1])
  })

  it("both stepping calls no-op for a single-page verse (no pages)", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    useBroadcastStore.setState({ liveVersePages: null, liveVersePageIndex: 0 })
    expect(useBroadcastStore.getState().nextVersePage()).toBe(false)
    expect(useBroadcastStore.getState().prevVersePage()).toBe(false)
  })
})

describe("broadcast store — persistence hydrate/migrate", () => {
  beforeEach(() => {
    emitToMock.mockReset()
    emitToMock.mockResolvedValue(undefined)
    storeData.clear()
    vi.resetModules()
  })

  it("migrates legacy activeThemeId/altActiveThemeId into per-output themeIds", async () => {
    storeData.set("activeThemeId", "custom-main")
    storeData.set("altActiveThemeId", "custom-alt")
    const { useBroadcastStore, hydrateBroadcastThemes } =
      await import("./broadcast-store")
    await hydrateBroadcastThemes()
    const outputs = useBroadcastStore.getState().outputs
    expect(outputs.find((o) => o.id === "main")?.themeId).toBe("custom-main")
    expect(outputs.find((o) => o.id === "alt")?.themeId).toBe("custom-alt")
  })

  it("migrates the legacy global stageDisplayConfig onto the alt output as stage mode", async () => {
    storeData.set("stageDisplayConfig", { enabled: true, showClock: true })
    const { useBroadcastStore, hydrateBroadcastThemes } =
      await import("./broadcast-store")
    await hydrateBroadcastThemes()
    const alt = useBroadcastStore.getState().outputs.find((o) => o.id === "alt")
    expect(alt?.mode).toBe("stage")
    expect(alt?.stageConfig).toBeTruthy()
    // The legacy global key is deleted once migrated to per-output config.
    expect(storeData.has("stageDisplayConfig")).toBe(false)
  })

  it("migrates legacy baseThemeId into the base-background shape", async () => {
    storeData.set("baseThemeId", "theme-xyz")
    const { useBroadcastStore, hydrateBroadcastThemes } =
      await import("./broadcast-store")
    await hydrateBroadcastThemes()
    expect(useBroadcastStore.getState().baseBackground).toEqual({
      kind: "theme",
      themeId: "theme-xyz",
    })
  })

  it("prefers the new base-background shape over the legacy baseThemeId", async () => {
    storeData.set("baseThemeId", "legacy")
    storeData.set("baseBackground", { kind: "black" })
    const { useBroadcastStore, hydrateBroadcastThemes } =
      await import("./broadcast-store")
    await hydrateBroadcastThemes()
    expect(useBroadcastStore.getState().baseBackground).toEqual({
      kind: "black",
    })
  })

  it("leaves the default outputs untouched when nothing is persisted", async () => {
    const { useBroadcastStore, hydrateBroadcastThemes } =
      await import("./broadcast-store")
    const before = useBroadcastStore.getState().outputs
    await hydrateBroadcastThemes()
    // Empty patch → no setState → same reference (no needless churn).
    expect(useBroadcastStore.getState().outputs).toBe(before)
  })

  it("drops a stale defaultThemeId whose theme no longer exists", async () => {
    storeData.set("defaultThemeId", "deleted-theme-id")
    const { useBroadcastStore, hydrateBroadcastThemes } =
      await import("./broadcast-store")
    const before = useBroadcastStore.getState().defaultThemeId
    await hydrateBroadcastThemes()
    expect(useBroadcastStore.getState().defaultThemeId).toBe(before)
  })
})

// ── Split-sensitive coverage for S1 Phase 3 (before the generic factories) ──
// The undo debounce and stage-layout CRUD both get generalized in Phase 3
// (createDesignerSlice / createCrudSlice), so pin their behaviour first.

describe("broadcast store — undo debounce (theme designer)", () => {
  beforeEach(async () => {
    emitToMock.mockReset()
    emitToMock.mockResolvedValue(undefined)
    vi.resetModules()
  })

  it("coalesces rapid draft edits into a single undo snapshot", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1000)
      const store = useBroadcastStore.getState()
      store.startEditing(store.themes[0].id)
      const original = useBroadcastStore.getState().draftTheme!.name
      useBroadcastStore.getState().updateDraft({ name: "Edit A" })
      vi.setSystemTime(1100) // +100ms — within the 300ms window
      useBroadcastStore.getState().updateDraft({ name: "Edit B" })
      expect(useBroadcastStore.getState().draftTheme!.name).toBe("Edit B")
      // One snapshot for both rapid edits → a single undo reverts to original.
      useBroadcastStore.getState().undo()
      expect(useBroadcastStore.getState().draftTheme!.name).toBe(original)
    } finally {
      vi.useRealTimers()
    }
  })

  it("records a separate snapshot once the debounce window elapses", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1000)
      const store = useBroadcastStore.getState()
      store.startEditing(store.themes[0].id)
      useBroadcastStore.getState().updateDraft({ name: "Edit A" })
      vi.setSystemTime(1400) // +400ms — past the 300ms window
      useBroadcastStore.getState().updateDraft({ name: "Edit B" })
      // Two snapshots → the first undo reverts only the second edit.
      useBroadcastStore.getState().undo()
      expect(useBroadcastStore.getState().draftTheme!.name).toBe("Edit A")
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("broadcast store — stage-layout CRUD", () => {
  beforeEach(async () => {
    emitToMock.mockReset()
    emitToMock.mockResolvedValue(undefined)
    vi.resetModules()
  })

  it("saves (upsert), renames, pins, duplicates, and deletes a custom layout", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const s = () => useBroadcastStore.getState()
    const custom: StageLayout = {
      ...structuredClone(s().stageLayouts[0]),
      id: "custom-stage-1",
      name: "My Layout",
      builtin: false,
    }
    s().saveStageLayout(custom)
    expect(s().stageLayouts.find((l) => l.id === "custom-stage-1")?.name).toBe(
      "My Layout"
    )

    // Same id again → update in place, not append.
    const count = s().stageLayouts.length
    s().saveStageLayout({ ...custom, name: "Updated" })
    expect(s().stageLayouts.length).toBe(count)
    expect(s().stageLayouts.find((l) => l.id === "custom-stage-1")?.name).toBe(
      "Updated"
    )

    s().renameStageLayout("custom-stage-1", "Renamed")
    expect(s().stageLayouts.find((l) => l.id === "custom-stage-1")?.name).toBe(
      "Renamed"
    )

    s().togglePinStageLayout("custom-stage-1")
    expect(
      s().stageLayouts.find((l) => l.id === "custom-stage-1")?.pinned
    ).toBe(true)

    const before = s().stageLayouts.length
    s().duplicateStageLayout("custom-stage-1")
    expect(s().stageLayouts.length).toBe(before + 1)
    expect(s().stageLayouts.some((l) => l.name === "Renamed Copy")).toBe(true)

    s().deleteStageLayout("custom-stage-1")
    expect(
      s().stageLayouts.find((l) => l.id === "custom-stage-1")
    ).toBeUndefined()
  })

  it("never deletes a built-in layout", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const s = () => useBroadcastStore.getState()
    const builtin = s().stageLayouts.find((l) => l.builtin)!
    s().deleteStageLayout(builtin.id)
    expect(s().stageLayouts.some((l) => l.id === builtin.id)).toBe(true)
  })
})
