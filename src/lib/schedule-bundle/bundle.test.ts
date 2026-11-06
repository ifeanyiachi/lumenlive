import { describe, it, expect } from "vitest"
import type { MediaAsset } from "@/types/media"
import type { Theme } from "@/types/theme"
import type { ServiceSchedule } from "@/types/schedule"
import {
  createDefaultPresentation,
  createDefaultShapeElement,
} from "@/lib/slide-defaults"
import { createDefaultSong } from "@/types/song"
import { DEFAULT_SONG_SLIDE_OPTIONS } from "@/lib/song/song-to-slides"
import { ScheduleParseError } from "@/lib/schedule-io"
import {
  buildScheduleBundle,
  parseScheduleBundle,
  type BundleSources,
  type ExtractedMedia,
} from "./bundle"

const assetUrl = (p: string) =>
  `http://asset.localhost/${encodeURIComponent(p)}`

function asset(
  id: string,
  filePath: string,
  type: MediaAsset["type"]
): MediaAsset {
  return { id, name: id, type, filePath, fileSize: 1, tags: [], addedAt: 0 }
}

function scenario() {
  const a1 = asset("a1", "C:\\media\\clip.mp4", "video")
  const a2 = asset("a2", "C:\\media\\bg.png", "image")
  const a3 = asset("a3", "C:\\media\\theme-bg.jpg", "image")

  // A deck whose one slide has a library-image background.
  const deck = createDefaultPresentation("Deck")
  deck.id = "p1"
  const editableText = deck.slides[0].elements[0]
  if (editableText.type === "text") {
    editableText.text = "Editable welcome"
    editableText.x = 18
    editableText.animation = {
      entry: {
        type: "fade",
        duration: 0.4,
        delay: 0.1,
        easing: "ease-out",
      },
    }
  }
  const mask = createDefaultShapeElement()
  mask.id = "mask-shape"
  mask.maskTargetId = editableText.id
  deck.slides[0].elements.push(mask)
  deck.slides[0].transition = { type: "fade", duration: 0.5 }
  deck.slides[0].background = {
    type: "image",
    mediaAssetId: "a2",
    imageUrl: assetUrl(a2.filePath),
  }

  // A song skinned by a custom theme.
  const song = createDefaultSong("My Song")
  song.slideOptions = { themeId: "custom-theme-1" }

  const theme: Theme = {
    id: "custom-theme-1",
    name: "Custom",
    type: "song",
    builtin: false,
    pinned: false,
    createdAt: 0,
    updatedAt: 0,
    resolution: { width: 1920, height: 1080 },
    background: {
      type: "image",
      mediaAssetId: "a3",
      imageUrl: assetUrl(a3.filePath),
    },
    elements: [],
  }

  const schedule: ServiceSchedule = {
    id: "sched-orig",
    name: "Sunday",
    createdAt: 0,
    updatedAt: 0,
    items: [
      {
        id: "m1",
        type: "media",
        label: "Clip",
        order: 0,
        mediaAssetId: "a1",
        cachedFilePath: "C:\\media\\clip.mp4",
        cachedMediaType: "video",
      },
      {
        id: "sl1",
        type: "slide",
        label: "Deck",
        order: 1,
        presentationId: "p1",
        slideIndex: 0,
      },
      {
        id: "sg1",
        type: "song",
        label: "My Song",
        order: 2,
        songId: song.id,
        arrangementId: song.arrangements[0].id,
        cachedTitle: "My Song",
        themeId: "custom-theme-1",
      },
    ],
  }

  const sources: BundleSources = {
    mediaAssets: [a1, a2, a3],
    presentations: [deck],
    songs: [song],
    songSlideDefaults: DEFAULT_SONG_SLIDE_OPTIONS,
    scriptureThemeId: "builtin-scripture",
    resolveTheme: (id) => (id === "custom-theme-1" ? theme : undefined),
  }
  return { schedule, sources, song, deck, theme }
}

/** Simulate the Rust extractor: each packaged file lands under /managed/<zipName>. */
function extract(
  mediaFiles: { srcPath: string; zipName: string }[]
): ExtractedMedia[] {
  return mediaFiles.map((m) => ({
    zipName: m.zipName,
    path: `/managed/${m.zipName}`,
  }))
}

describe("buildScheduleBundle", () => {
  it("carries a scripture item's animated theme to the imported schedule", () => {
    const { schedule, sources } = scenario()
    const scriptureTheme: Theme = {
      id: "scripture-aurora",
      name: "Scripture Aurora",
      type: "scripture",
      builtin: false,
      pinned: false,
      createdAt: 0,
      updatedAt: 0,
      resolution: { width: 1920, height: 1080 },
      background: {
        type: "animated",
        animated: {
          preset: "aurora",
          palette: ["#315fa8", "#8cc9f5"],
          speed: 1,
          intensity: 0.7,
        },
      },
      elements: [],
    }
    sources.scriptureThemeId = scriptureTheme.id
    const previousResolveTheme = sources.resolveTheme
    sources.resolveTheme = (id) =>
      id === scriptureTheme.id ? scriptureTheme : previousResolveTheme(id)
    schedule.items.push({
      id: "verse-1",
      type: "scripture",
      label: "John 3:16",
      order: 3,
      translationId: 1,
      bookNumber: 43,
      chapter: 3,
      verseStart: 16,
      verseEnd: 16,
      cachedReference: "John 3:16 (KJV)",
      cachedText: "For God so loved the world",
    })

    const { manifest } = buildScheduleBundle(schedule, sources, 1)
    expect(manifest.themes).toContainEqual(scriptureTheme)
    expect(schedule.items[3]).not.toHaveProperty("themeId")
    let n = 0
    const parsed = parseScheduleBundle(manifest, [], {
      newId: () => `nid-${n++}`,
      now: 2,
      toAssetUrl: (path) => path,
    })
    const imported = parsed.schedule.items[3]
    expect(imported.type).toBe("scripture")
    if (imported.type === "scripture") {
      expect(imported.themeId).toBe(
        parsed.themes.find((theme) => theme.type === "scripture")?.id
      )
    }
  })

  it("preserves an animated theme inherited from the sender's song defaults", () => {
    const { schedule, sources, song } = scenario()
    song.slideOptions = undefined
    const item = schedule.items.find((entry) => entry.type === "song")!
    if (item.type !== "song") throw new Error("expected song item")
    item.themeId = undefined
    sources.songSlideDefaults = {
      ...DEFAULT_SONG_SLIDE_OPTIONS,
      themeId: "custom-theme-1",
      animatedBackground: { speed: 1.75 },
    }
    const theme = sources.resolveTheme("custom-theme-1")!
    theme.background = {
      type: "animated",
      animated: {
        preset: "aurora",
        palette: ["#315fa8", "#8cc9f5"],
        baseColor: "#071326",
        speed: 1,
        intensity: 0.7,
      },
    }

    const { manifest } = buildScheduleBundle(schedule, sources, 1)
    expect(song.slideOptions).toBeUndefined()
    expect(manifest.songs[0].slideOptions).toMatchObject({
      themeId: "custom-theme-1",
      animatedBackground: { speed: 1.75 },
    })
    expect(manifest.themes[0].background).toEqual(theme.background)

    let n = 0
    const parsed = parseScheduleBundle(manifest, [], {
      newId: () => `nid-${n++}`,
      now: 2,
      toAssetUrl: (path) => path,
    })
    expect(parsed.songs[0].slideOptions?.themeId).toBe(parsed.themes[0].id)
    expect(parsed.themes[0].background.type).toBe("animated")
  })

  it("packages referenced media, decks, songs, and custom themes", () => {
    const { schedule, sources } = scenario()
    const { manifest, mediaFiles, missingMedia } = buildScheduleBundle(
      schedule,
      sources,
      123
    )

    expect(missingMedia).toBe(0)
    expect(manifest.presentations.map((p) => p.id)).toEqual(["p1"])
    expect(manifest.songs).toHaveLength(1)
    expect(manifest.themes.map((t) => t.id)).toEqual(["custom-theme-1"])

    // Three unique files: the clip, the deck background, the theme background.
    expect(manifest.media).toHaveLength(3)
    expect(new Set(manifest.media.map((m) => m.srcPath))).toEqual(
      new Set([
        "C:\\media\\clip.mp4",
        "C:\\media\\bg.png",
        "C:\\media\\theme-bg.jpg",
      ])
    )
    expect(mediaFiles).toHaveLength(3)
    // Every packaged file here is asset-backed.
    expect(manifest.media.every((m) => m.asset)).toBe(true)
  })

  it("does not package built-in themes", () => {
    const { schedule, sources } = scenario()
    const builtinSources: BundleSources = {
      ...sources,
      resolveTheme: (id) =>
        id === "custom-theme-1"
          ? {
              id,
              name: "B",
              type: "song",
              builtin: true,
              pinned: false,
              createdAt: 0,
              updatedAt: 0,
              resolution: { width: 1920, height: 1080 },
              background: { type: "solid", color: "#000" },
              elements: [],
            }
          : undefined,
    }
    const { manifest } = buildScheduleBundle(schedule, builtinSources, 1)
    expect(manifest.themes).toHaveLength(0)
  })

  it("counts media whose source file is missing", () => {
    const { schedule, sources } = scenario()
    // Drop the asset the media item points at; its cachedFilePath is still absolute,
    // so it is still packaged (not counted missing). Remove cachedFilePath to miss.
    const noCache = {
      ...schedule,
      items: schedule.items.map((it) =>
        it.type === "media"
          ? { ...it, mediaAssetId: "gone", cachedFilePath: undefined }
          : it
      ),
    }
    const { missingMedia } = buildScheduleBundle(noCache, sources, 1)
    expect(missingMedia).toBe(1)
  })
})

describe("parseScheduleBundle", () => {
  it("preserves editable slide data while refreshing element ids", () => {
    const { schedule, sources, deck } = scenario()
    const { manifest, mediaFiles } = buildScheduleBundle(schedule, sources, 1)

    let n = 0
    const parsed = parseScheduleBundle(manifest, extract(mediaFiles), {
      newId: () => `nid-${n++}`,
      now: 999,
      toAssetUrl: (p) => `converted://${p}`,
    })

    const sourceSlide = deck.slides[0]
    const importedSlide = parsed.presentations[0].slides[0]
    expect(importedSlide.name).toBe(sourceSlide.name)
    expect(importedSlide.transition).toEqual(sourceSlide.transition)

    const importedText = importedSlide.elements.find(
      (element) => element.type === "text"
    )
    expect(importedText).toMatchObject({
      type: "text",
      text: "Editable welcome",
      x: 18,
    })
    expect(importedText?.id).not.toBe(sourceSlide.elements[0].id)

    const importedMask = importedSlide.elements.find(
      (element) => element.type === "shape"
    )
    expect(importedMask?.id).not.toBe("mask-shape")
    expect(importedMask?.type === "shape" && importedMask.maskTargetId).toBe(
      importedText?.id
    )
  })

  it("round-trips with every reference re-pointed at imported copies", () => {
    const { schedule, sources } = scenario()
    const { manifest, mediaFiles } = buildScheduleBundle(schedule, sources, 1)

    let n = 0
    const parsed = parseScheduleBundle(manifest, extract(mediaFiles), {
      newId: () => `nid-${n++}`,
      now: 999,
      toAssetUrl: (p) => `converted://${p}`,
    })

    // Media assets rebuilt against managed paths, fresh ids, marked managed.
    expect(parsed.mediaAssets).toHaveLength(3)
    for (const a of parsed.mediaAssets) {
      expect(a.managed).toBe(true)
      expect(a.filePath.startsWith("/managed/")).toBe(true)
      expect(a.addedAt).toBe(999)
    }
    const byName = new Map(parsed.mediaAssets.map((a) => [a.name, a]))
    const clip = byName.get("a1")!
    const deckBg = byName.get("a2")!
    const themeBg = byName.get("a3")!

    // Schedule: fresh ids, references remapped.
    expect(parsed.schedule.id).not.toBe("sched-orig")
    const [media, slide, song] = parsed.schedule.items
    expect(media.id).not.toBe("m1")

    // Media item → new asset id + managed cached path.
    if (media.type === "media") {
      expect(media.mediaAssetId).toBe(clip.id)
      expect(media.cachedFilePath).toBe(clip.filePath)
    } else throw new Error("expected media item")

    // Slide item → new deck id.
    if (slide.type === "slide") {
      expect(slide.presentationId).toBe(parsed.presentations[0].id)
      expect(parsed.presentations[0].id).not.toBe("p1")
    } else throw new Error("expected slide item")

    // Song item → new song id, arrangement id, theme id.
    if (song.type === "song") {
      expect(song.songId).toBe(parsed.songs[0].id)
      expect(song.arrangementId).toBe(parsed.songs[0].arrangements[0].id)
      expect(song.themeId).toBe(parsed.themes[0].id)
    } else throw new Error("expected song item")

    // Deck background re-pointed to the imported asset + a fresh asset URL.
    const bg = parsed.presentations[0].slides[0].background
    expect(bg.mediaAssetId).toBe(deckBg.id)
    expect(bg.imageUrl).toBe(`converted://${deckBg.filePath}`)

    // Theme re-keyed, marked custom, background re-pointed.
    const theme = parsed.themes[0]
    expect(theme.builtin).toBe(false)
    expect(theme.id).not.toBe("custom-theme-1")
    expect(theme.background.mediaAssetId).toBe(themeBg.id)
    expect(theme.background.imageUrl).toBe(`converted://${themeBg.filePath}`)

    // Song deeply re-keyed and its slideOptions theme remapped.
    const parsedSong = parsed.songs[0]
    expect(parsedSong.slideOptions?.themeId).toBe(theme.id)
    expect(parsedSong.arrangements[0].sectionIds[0]).toBe(
      parsedSong.sections[0].id
    )
  })

  it("skips media whose bytes are absent from the archive", () => {
    const { schedule, sources } = scenario()
    const { manifest } = buildScheduleBundle(schedule, sources, 1)
    // Provide no extracted media at all.
    let n = 0
    const parsed = parseScheduleBundle(manifest, [], {
      newId: () => `nid-${n++}`,
      now: 1,
      toAssetUrl: (p) => p,
    })
    expect(parsed.mediaAssets).toHaveLength(0)
    // Schedule still imports; media item keeps a (non-remapped) reference.
    expect(parsed.schedule.items).toHaveLength(3)
  })

  it("rejects a non-bundle manifest", () => {
    expect(() =>
      parseScheduleBundle({ format: "something-else" }, [], {
        newId: () => "x",
        now: 0,
        toAssetUrl: (p) => p,
      })
    ).toThrow(ScheduleParseError)
  })

  it("rejects a newer bundle version", () => {
    const { schedule, sources } = scenario()
    const { manifest } = buildScheduleBundle(schedule, sources, 1)
    expect(() =>
      parseScheduleBundle({ ...manifest, version: 999 }, [], {
        newId: () => "x",
        now: 0,
        toAssetUrl: (p) => p,
      })
    ).toThrow(ScheduleParseError)
  })
})
