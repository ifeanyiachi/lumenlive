import { describe, expect, it } from "vitest"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import { validateTheme } from "@/lib/theme/model"
import type { BroadcastTheme } from "@/types/broadcast"
import type { SlideTheme } from "@/types/slide"
import type { Theme } from "@/types/theme"
import { ingestLegacyThemes } from "./ingest"

let counter = 0
const newId = () => `id-${counter++}`

const CLASSIC = BUILTIN_THEMES.find((t) => t.id === "builtin-classic-dark")!
const COUNTDOWN = BUILTIN_THEMES.find((t) => t.category === "countdown")!

const slideSong: SlideTheme = {
  id: "st-song",
  name: "Song Look",
  category: "song",
  builtin: false,
  variants: [
    {
      layout: "content-only",
      background: { type: "solid", color: "#111" },
      elements: [
        {
          type: "text",
          x: 10,
          y: 30,
          width: 80,
          height: 40,
          text: "",
          fontFamily: "Inter",
          fontSize: 48,
          fontWeight: 600,
          bold: false,
          italic: false,
          underline: false,
          color: "#fff",
          horizontalAlign: "center",
          verticalAlign: "middle",
          lineHeight: 1.4,
          textTransform: "none",
        },
      ],
    },
  ],
}

const existing: Theme[] = [
  {
    id: "already-there",
    name: "Existing",
    type: "song",
    builtin: false,
    pinned: false,
    createdAt: 0,
    updatedAt: 0,
    resolution: { width: 1920, height: 1080 },
    background: { type: "solid", color: "#000" },
    elements: [
      {
        id: "e",
        type: "text",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        role: "lyrics",
        text: "",
        fontFamily: "Inter",
        fontSize: 48,
        fontWeight: 600,
        bold: false,
        italic: false,
        underline: false,
        color: "#fff",
        horizontalAlign: "center",
        verticalAlign: "middle",
        lineHeight: 1.4,
        textTransform: "none",
      },
    ],
  },
]

describe("ingestLegacyThemes", () => {
  it("migrates both legacy surfaces and appends valid themes after existing", () => {
    const { themes, added } = ingestLegacyThemes(
      { broadcast: [CLASSIC, COUNTDOWN], slide: [slideSong] },
      existing,
      newId,
      42
    )
    expect(added).toBe(3)
    expect(themes).toHaveLength(existing.length + 3)
    // Existing themes are preserved, in place, at the front.
    expect(themes[0].id).toBe("already-there")
    // Every migrated theme validates for its type.
    for (const t of themes) expect(validateTheme(t).valid).toBe(true)
  })

  it("preserves each legacy theme's id so stored references survive the merge", () => {
    const { themes } = ingestLegacyThemes(
      { broadcast: [CLASSIC], slide: [slideSong] },
      existing,
      newId
    )
    const ids = themes.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain("already-there")
    expect(ids).toContain(CLASSIC.id)
    expect(ids).toContain(slideSong.id)
  })

  it("returns existing unchanged when there is nothing to ingest", () => {
    const { themes, added } = ingestLegacyThemes({}, existing, newId)
    expect(added).toBe(0)
    expect(themes).toEqual(existing)
  })

  it("drops a malformed legacy record instead of throwing", () => {
    const broken = { id: "x", name: "broken" } as unknown as BroadcastTheme
    const { themes, added } = ingestLegacyThemes(
      { broadcast: [broken, CLASSIC] },
      [],
      newId
    )
    // The broken record is skipped; the good one migrates.
    expect(added).toBe(1)
    expect(themes).toHaveLength(1)
    expect(validateTheme(themes[0]).valid).toBe(true)
  })
})
