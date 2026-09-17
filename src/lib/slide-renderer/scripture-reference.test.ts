import { describe, expect, it } from "vitest"
import { formatScriptureReference } from "./scripture-reference"

describe("formatScriptureReference", () => {
  it("appends the translation abbreviation in parentheses", () => {
    expect(formatScriptureReference("John 3:16", "KJV")).toBe(
      "John 3:16 (KJV)"
    )
  })

  it("returns the bare reference when no translation is given", () => {
    expect(formatScriptureReference("John 3:16", "")).toBe("John 3:16")
    expect(formatScriptureReference("John 3:16", undefined)).toBe("John 3:16")
    expect(formatScriptureReference("John 3:16", null)).toBe("John 3:16")
  })

  it("ignores a whitespace-only translation", () => {
    expect(formatScriptureReference("John 3:16", "   ")).toBe("John 3:16")
  })

  it("trims surrounding whitespace from the abbreviation", () => {
    expect(formatScriptureReference("Rom 8:28", " ESV ")).toBe(
      "Rom 8:28 (ESV)"
    )
  })

  it("preserves multi-verse and range references", () => {
    expect(formatScriptureReference("Psalm 23:1-6", "NIV")).toBe(
      "Psalm 23:1-6 (NIV)"
    )
  })
})
