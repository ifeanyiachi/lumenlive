import { describe, expect, it } from "vitest"
import {
  addSection,
  updateSection,
  removeSection,
  reorderSection,
  addArrangement,
  updateArrangement,
  removeArrangement,
  setDefaultArrangement,
  addSectionToArrangement,
  removeArrangementSlot,
  reorderArrangementSlot,
} from "./song-mutations"
import { createDefaultSong, type Song } from "@/types/song"

// Deterministic id/now for stable assertions.
let counter = 0
const nextId = () => `id-${++counter}`
const NOW = 1_000

function baseSong(): Song {
  counter = 0
  return {
    ...createDefaultSong(),
    id: "song-1",
    sections: [
      { id: "sec-a", type: "verse", label: "Verse 1", lyrics: "a" },
      { id: "sec-b", type: "chorus", label: "Chorus", lyrics: "b" },
    ],
    arrangements: [
      {
        id: "arr-1",
        name: "Default",
        sectionIds: ["sec-a", "sec-b"],
        isDefault: true,
      },
    ],
    updatedAt: 0,
  }
}

describe("section mutations", () => {
  it("appends a section with a numbered label and bumps updatedAt", () => {
    const song = addSection(baseSong(), "verse", NOW, nextId)
    expect(song.sections).toHaveLength(3)
    expect(song.sections[2]).toMatchObject({
      id: "id-1",
      type: "verse",
      label: "Verse 2",
    })
    expect(song.updatedAt).toBe(NOW)
  })

  it("appends the new section to the default arrangement so it projects", () => {
    const song = addSection(baseSong(), "bridge", NOW, nextId)
    expect(song.arrangements[0].sectionIds).toEqual(["sec-a", "sec-b", "id-1"])
  })

  it("does not touch non-default arrangements when adding a section", () => {
    let song = addArrangement(baseSong(), "Short", NOW, nextId) // id-1
    song = addSection(song, "verse", NOW, nextId) // id-2
    const short = song.arrangements.find((a) => a.id === "id-1")!
    expect(short.sectionIds).toEqual([])
    expect(song.arrangements[0].sectionIds).toContain("id-2")
  })

  it("updates a section's fields", () => {
    const song = updateSection(baseSong(), "sec-a", { lyrics: "new" }, NOW)
    expect(song.sections[0].lyrics).toBe("new")
    expect(song.sections[1].lyrics).toBe("b")
  })

  it("removes a section and prunes it from arrangements", () => {
    const song = removeSection(baseSong(), "sec-a", NOW)
    expect(song.sections.map((s) => s.id)).toEqual(["sec-b"])
    expect(song.arrangements[0].sectionIds).toEqual(["sec-b"])
  })

  it("reorders sections", () => {
    const song = reorderSection(baseSong(), 0, 1, NOW)
    expect(song.sections.map((s) => s.id)).toEqual(["sec-b", "sec-a"])
  })

  it("treats an out-of-range reorder as a no-op", () => {
    const original = baseSong()
    expect(reorderSection(original, 0, 5, NOW)).toBe(original)
  })
})

describe("arrangement mutations", () => {
  it("adds a non-default arrangement with an empty order", () => {
    const song = addArrangement(baseSong(), "Short", NOW, nextId)
    expect(song.arrangements).toHaveLength(2)
    expect(song.arrangements[1]).toMatchObject({
      name: "Short",
      sectionIds: [],
      isDefault: false,
    })
  })

  it("renames an arrangement without touching isDefault", () => {
    const song = updateArrangement(baseSong(), "arr-1", { name: "Full" }, NOW)
    expect(song.arrangements[0]).toMatchObject({
      name: "Full",
      isDefault: true,
    })
  })

  it("makes exactly one arrangement default", () => {
    let song = addArrangement(baseSong(), "Short", NOW, nextId)
    const shortId = song.arrangements[1].id
    song = setDefaultArrangement(song, shortId, NOW)
    expect(song.arrangements.filter((a) => a.isDefault)).toHaveLength(1)
    expect(song.arrangements[1].isDefault).toBe(true)
    expect(song.arrangements[0].isDefault).toBe(false)
  })

  it("won't remove the last arrangement", () => {
    const original = baseSong()
    expect(removeArrangement(original, "arr-1", NOW)).toBe(original)
  })

  it("promotes a survivor when the default is removed", () => {
    let song = addArrangement(baseSong(), "Short", NOW, nextId)
    song = removeArrangement(song, "arr-1", NOW)
    expect(song.arrangements).toHaveLength(1)
    expect(song.arrangements[0].isDefault).toBe(true)
  })

  it("appends (repeatable) section ids to an arrangement order", () => {
    let song = addSectionToArrangement(baseSong(), "arr-1", "sec-b", NOW)
    song = addSectionToArrangement(song, "arr-1", "sec-b", NOW)
    expect(song.arrangements[0].sectionIds).toEqual([
      "sec-a",
      "sec-b",
      "sec-b",
      "sec-b",
    ])
  })

  it("removes an arrangement slot by index", () => {
    const song = removeArrangementSlot(baseSong(), "arr-1", 0, NOW)
    expect(song.arrangements[0].sectionIds).toEqual(["sec-b"])
  })

  it("reorders arrangement slots", () => {
    const song = reorderArrangementSlot(baseSong(), "arr-1", 0, 1, NOW)
    expect(song.arrangements[0].sectionIds).toEqual(["sec-b", "sec-a"])
  })
})
