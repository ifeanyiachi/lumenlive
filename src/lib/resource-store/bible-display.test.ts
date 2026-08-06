import { describe, it, expect } from "vitest"
import { bibleDisplayMeta, languageLabel, formatBytes } from "./bible-display"

describe("bibleDisplayMeta", () => {
  it("returns full metadata for known translations", () => {
    const kjv = bibleDisplayMeta("KJV")
    expect(kjv.verses).toBe(31102)
    expect(kjv.description).toContain("1611")
    expect(kjv.badgeClass).toBe("bg-orange-500")
    expect(kjv.featured).toBe(true)
  })

  it("is case-insensitive on the abbreviation", () => {
    expect(bibleDisplayMeta("kjv")).toEqual(bibleDisplayMeta("KJV"))
    expect(bibleDisplayMeta("  Frejnd  ").verses).toBe(31172)
  })

  it("marks only designated translations as featured", () => {
    expect(bibleDisplayMeta("ESV").featured).toBe(true)
    expect(bibleDisplayMeta("NIV").featured).toBe(false)
  })

  it("degrades gracefully for unknown translations", () => {
    const meta = bibleDisplayMeta("XYZ")
    expect(meta.verses).toBeUndefined()
    expect(meta.description).toBeUndefined()
    expect(meta.featured).toBe(false)
    expect(meta.badgeClass).toMatch(/^bg-/)
  })

  it("gives a stable fallback color for the same unknown key", () => {
    expect(bibleDisplayMeta("XYZ").badgeClass).toBe(
      bibleDisplayMeta("xyz").badgeClass
    )
  })
})

describe("languageLabel", () => {
  it("maps known codes and passes through others", () => {
    expect(languageLabel("en")).toBe("English")
    expect(languageLabel("pt")).toBe("Portuguese")
    expect(languageLabel("Twi")).toBe("Twi")
  })
})

describe("formatBytes", () => {
  it("formats MB and KB, and guards zero", () => {
    expect(formatBytes(1_482_058)).toBe("1.4 MB")
    expect(formatBytes(500 * 1024)).toBe("500 KB")
    expect(formatBytes(0)).toBe("—")
  })
})
