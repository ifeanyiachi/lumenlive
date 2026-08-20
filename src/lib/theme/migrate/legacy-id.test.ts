import { describe, expect, it } from "vitest"
import { BUILTIN_THEMES as LEGACY_BROADCAST } from "@/lib/builtin-themes"
import { BUILTIN_SLIDE_THEMES } from "@/lib/slide-themes"
import { BUILTIN_THEMES as NEW_BUILTINS } from "@/lib/theme/builtins"
import { categoryToType } from "./broadcast-to-theme"
import { slideCategoryToType } from "./slide-theme-to-theme"
import { legacyThemeIdAlias, resolveLegacyThemeId } from "./legacy-id"

const newIdForType = (type: string) =>
  NEW_BUILTINS.find((t) => t.type === type)!.id

describe("legacyThemeIdAlias", () => {
  it("maps every legacy broadcast built-in to the new built-in of its type", () => {
    for (const t of LEGACY_BROADCAST) {
      expect(legacyThemeIdAlias(t.id)).toBe(
        newIdForType(categoryToType(t.category))
      )
    }
  })

  it("maps every legacy slide built-in to the new built-in of its type", () => {
    for (const t of BUILTIN_SLIDE_THEMES) {
      expect(legacyThemeIdAlias(t.id)).toBe(
        newIdForType(slideCategoryToType(t.category))
      )
    }
  })

  it("returns undefined for an unknown / custom id", () => {
    expect(legacyThemeIdAlias("custom-uuid-1234")).toBeUndefined()
    expect(legacyThemeIdAlias("builtin-song")).toBeUndefined()
  })

  it("aliases a countdown built-in to the new countdown built-in", () => {
    const cd = LEGACY_BROADCAST.find((t) => t.category === "countdown")!
    expect(legacyThemeIdAlias(cd.id)).toBe("builtin-countdown")
  })
})

describe("resolveLegacyThemeId", () => {
  it("aliases a legacy built-in and passes a custom id through", () => {
    const cd = LEGACY_BROADCAST.find((t) => t.category === "countdown")!
    expect(resolveLegacyThemeId(cd.id)).toBe("builtin-countdown")
    expect(resolveLegacyThemeId("custom-uuid-1234")).toBe("custom-uuid-1234")
  })
})
