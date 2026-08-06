import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Slide } from "@/types/slide"
import type { VerseRenderData } from "@/types"
import type { LiveMedia } from "./broadcast-store"

const emitToMock = vi.fn()

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: emitToMock,
}))
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}))

describe("broadcast store sync", () => {
  beforeEach(async () => {
    emitToMock.mockReset()
    emitToMock.mockResolvedValue(undefined)
    vi.resetModules()
  })

  it("syncBroadcastOutput emits current theme and verse to all output windows", async () => {
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

    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast",
      "broadcast:verse-update",
      expect.objectContaining({
        theme: expect.objectContaining({ id: theme.id }),
        verse: expect.objectContaining({ reference: "John 3:16" }),
      })
    )
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast-alt",
      "broadcast:verse-update",
      expect.objectContaining({
        theme: expect.objectContaining({ id: theme.id }),
        verse: expect.objectContaining({ reference: "John 3:16" }),
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
})

/**
 * "Lock live" lets the operator audition items in the Program preview without
 * the audience seeing them. Presenting stages into `preview*`; the `live*`
 * fields (what the output windows mirror) only change on Take/unlock. Each test
 * imports the store fresh (resetModules) so it starts from default state.
 */
describe("broadcast store — live lock", () => {
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

  it("unlocked: presenting writes live and preview together and emits", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    useBroadcastStore.setState({ isLive: true })
    emitToMock.mockClear()

    const a = slide("a")
    useBroadcastStore.getState().setLiveSlide(a, "manual")

    expect(useBroadcastStore.getState().liveSlide).toBe(a)
    expect(useBroadcastStore.getState().previewSlide).toBe(a)
    expect(useBroadcastStore.getState().previewPending).toBe(false)
    expect(emitToMock).toHaveBeenCalled()
  })

  it("locked: presenting stages preview only and leaves live frozen (no emit)", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const live = slide("live")
    useBroadcastStore.setState({
      isLive: true,
      liveLocked: true,
      liveSlide: live,
      previewSlide: live,
    })
    emitToMock.mockClear()

    const staged = slide("staged")
    useBroadcastStore.getState().setLiveSlide(staged, "manual")

    expect(useBroadcastStore.getState().liveSlide).toBe(live) // audience untouched
    expect(useBroadcastStore.getState().previewSlide).toBe(staged)
    expect(useBroadcastStore.getState().previewPending).toBe(true)
    expect(emitToMock).not.toHaveBeenCalled()
  })

  it("takeToLive: commits the staged item and emits, staying locked", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const staged = slide("staged")
    useBroadcastStore.setState({
      isLive: true,
      liveLocked: true,
      liveSlide: slide("live"),
      previewSlide: staged,
      previewSource: "manual",
      previewPending: true,
    })
    emitToMock.mockClear()

    useBroadcastStore.getState().takeToLive()

    expect(useBroadcastStore.getState().liveSlide).toBe(staged)
    expect(useBroadcastStore.getState().liveLocked).toBe(true)
    expect(useBroadcastStore.getState().previewPending).toBe(false)
    expect(emitToMock).toHaveBeenCalled()
  })

  it("takeToLive: no-op when nothing is pending", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const live = slide("live")
    useBroadcastStore.setState({
      isLive: true,
      liveLocked: true,
      liveSlide: live,
      previewSlide: live,
      previewPending: false,
    })
    emitToMock.mockClear()

    useBroadcastStore.getState().takeToLive()

    expect(useBroadcastStore.getState().liveSlide).toBe(live)
    expect(emitToMock).not.toHaveBeenCalled()
  })

  it("unlock: takes the pending preview and returns to follow mode", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const staged = slide("staged")
    useBroadcastStore.setState({
      isLive: true,
      liveLocked: true,
      liveSlide: slide("live"),
      previewSlide: staged,
      previewSource: "manual",
      previewPending: true,
    })

    useBroadcastStore.getState().setLiveLocked(false)

    expect(useBroadcastStore.getState().liveLocked).toBe(false)
    expect(useBroadcastStore.getState().liveSlide).toBe(staged)
    expect(useBroadcastStore.getState().previewPending).toBe(false)
  })

  it("unlock: nothing staged does not re-commit (restart) the live item", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const liveMedia = media("clip.mp4")
    useBroadcastStore.setState({
      isLive: true,
      liveLocked: true,
      liveMedia,
      previewMedia: liveMedia,
      previewPending: false,
    })
    emitToMock.mockClear()

    useBroadcastStore.getState().setLiveLocked(false)

    expect(useBroadcastStore.getState().liveLocked).toBe(false)
    // Same reference — commitMediaLive would build a fresh object and restart
    // playback on the audience.
    expect(useBroadcastStore.getState().liveMedia).toBe(liveMedia)
    expect(emitToMock).not.toHaveBeenCalled()
  })

  it("lock only applies while live: presenting off-air commits normally", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    useBroadcastStore.setState({ isLive: false, liveLocked: true })

    const a = slide("a")
    useBroadcastStore.getState().setLiveSlide(a, "manual")

    expect(useBroadcastStore.getState().liveSlide).toBe(a)
  })

  it("going off-air clears the lock and any pending stage", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    useBroadcastStore.setState({
      isLive: true,
      liveLocked: true,
      previewPending: true,
    })

    useBroadcastStore.getState().setLive(false)

    expect(useBroadcastStore.getState().liveLocked).toBe(false)
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
    // Present a scheduled verse: the preview is pinned to the staged copy.
    useBroadcastStore.getState().setLiveVerse(verse("Ps 23:1"), "schedule")
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

  it("leaves the live output untouched (safe while locked)", async () => {
    const { useBroadcastStore } = await import("./broadcast-store")
    const live = verse("John 1:1")
    useBroadcastStore.setState({
      isLive: true,
      liveLocked: true,
      liveVerse: live,
      previewVerse: verse("Acts 2:1"),
      previewSource: "schedule",
    })
    emitToMock.mockClear()

    useBroadcastStore.getState().followManualSelection()

    // Audience stays on the locked verse; nothing is emitted to outputs.
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
