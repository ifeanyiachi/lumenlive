import { describe, expect, it } from "vitest"
import { legacyThemeIdAlias, resolveLegacyThemeId } from "./legacy-id"

describe("legacyThemeIdAlias", () => {
  it("maps legacy broadcast built-ins to the new built-in of their type", () => {
    expect(legacyThemeIdAlias("builtin-classic-dark")).toBe("builtin-scripture")
    expect(legacyThemeIdAlias("builtin-parchment")).toBe("builtin-scripture")
    expect(legacyThemeIdAlias("builtin-worship-night")).toBe("builtin-song")
    expect(legacyThemeIdAlias("builtin-sermon-clean")).toBe("builtin-sermon")
    expect(legacyThemeIdAlias("builtin-lower-third-dark")).toBe("builtin-overlay")
    expect(legacyThemeIdAlias("builtin-countdown-midnight")).toBe(
      "builtin-countdown"
    )
  })

  it("maps legacy slide built-ins (scripture → scripture, else → song)", () => {
    expect(legacyThemeIdAlias("theme-scripture-classic")).toBe(
      "builtin-scripture"
    )
    expect(legacyThemeIdAlias("theme-midnight")).toBe("builtin-song")
    expect(legacyThemeIdAlias("theme-aurora-worship")).toBe("builtin-song")
  })

  it("returns undefined for an unknown / custom / already-new id", () => {
    expect(legacyThemeIdAlias("custom-uuid-1234")).toBeUndefined()
    expect(legacyThemeIdAlias("builtin-song")).toBeUndefined()
  })
})

describe("resolveLegacyThemeId", () => {
  it("aliases a legacy built-in and passes a custom / new id through", () => {
    expect(resolveLegacyThemeId("builtin-countdown-midnight")).toBe(
      "builtin-countdown"
    )
    expect(resolveLegacyThemeId("custom-uuid-1234")).toBe("custom-uuid-1234")
    expect(resolveLegacyThemeId("builtin-scripture")).toBe("builtin-scripture")
  })
})
