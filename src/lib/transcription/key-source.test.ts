import { describe, expect, it } from "vitest"

import { resolveKeySource } from "./key-source"

describe("resolveKeySource", () => {
  it("uses the local key when signed in, local is chosen, and a key is present", () => {
    expect(
      resolveKeySource({ source: "local", hasLocalKey: true, hasToken: true })
    ).toBe("local")
  })

  it("falls back to platform when local is chosen but no key is saved", () => {
    expect(
      resolveKeySource({ source: "local", hasLocalKey: false, hasToken: true })
    ).toBe("platform")
  })

  it("uses the platform key when platform is chosen, even with a local key present", () => {
    expect(
      resolveKeySource({ source: "platform", hasLocalKey: true, hasToken: true })
    ).toBe("platform")
  })

  it("uses the platform key when platform is chosen and no local key exists", () => {
    expect(
      resolveKeySource({
        source: "platform",
        hasLocalKey: false,
        hasToken: true,
      })
    ).toBe("platform")
  })

  it("always uses the local key when anonymous (no token), regardless of choice", () => {
    expect(
      resolveKeySource({ source: "platform", hasLocalKey: true, hasToken: false })
    ).toBe("local")
    expect(
      resolveKeySource({ source: "local", hasLocalKey: true, hasToken: false })
    ).toBe("local")
    expect(
      resolveKeySource({
        source: "platform",
        hasLocalKey: false,
        hasToken: false,
      })
    ).toBe("local")
  })
})
