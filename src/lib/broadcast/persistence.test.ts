import { describe, it, expect } from "vitest"
import { buildHydrationPatch } from "./persistence"
import type {
  BroadcastOutput,
  StageDisplayConfig,
} from "@/types/broadcast"

// A minimal stand-in for the legacy global config; only `enabled` and the
// spread-through fields matter to the migration.
const legacyStageConfig = { enabled: true } as unknown as StageDisplayConfig & {
  enabled?: boolean
}

const identity = <T>(x: T): T => x

const defaultOutputs = [
  { id: "main", themeId: "builtin", mode: "normal" },
  { id: "alt", themeId: "builtin", mode: "normal" },
] as unknown as BroadcastOutput[]

const current = {
  outputs: defaultOutputs,
}

describe("buildHydrationPatch", () => {
  it("returns an empty patch when nothing is persisted", () => {
    const { patch, deleteLegacyStageConfig } = buildHydrationPatch(
      {},
      current,
      defaultOutputs,
      identity
    )
    expect(patch).toEqual({})
    expect(deleteLegacyStageConfig).toBe(false)
  })

  it("migrates legacy active/alt theme ids onto default outputs", () => {
    const { patch } = buildHydrationPatch(
      { activeThemeId: "m", altActiveThemeId: "a" },
      current,
      defaultOutputs,
      identity
    )
    expect(patch.outputs?.find((o) => o.id === "main")?.themeId).toBe("m")
    expect(patch.outputs?.find((o) => o.id === "alt")?.themeId).toBe("a")
  })

  it("migrates an enabled global stage config onto alt and flags the legacy delete", () => {
    const { patch, deleteLegacyStageConfig } = buildHydrationPatch(
      { stageDisplayConfig: legacyStageConfig },
      current,
      defaultOutputs,
      identity
    )
    const alt = patch.outputs?.find((o) => o.id === "alt")
    expect(alt?.mode).toBe("stage")
    expect(alt?.stageConfig).toBeTruthy()
    expect(deleteLegacyStageConfig).toBe(true)
  })

  it("maps legacy baseThemeId to a base-background, but the new shape wins", () => {
    expect(
      buildHydrationPatch(
        { baseThemeId: "t" },
        current,
        defaultOutputs,
        identity
      ).patch.baseBackground
    ).toEqual({ kind: "theme", themeId: "t" })

    expect(
      buildHydrationPatch(
        { baseThemeId: "t", baseBackground: { kind: "theme", themeId: "new" } },
        current,
        defaultOutputs,
        identity
      ).patch.baseBackground
    ).toEqual({ kind: "theme", themeId: "new" })
  })

  it("never mutates its input outputs (stage migration clones)", () => {
    const snapshot = JSON.stringify(defaultOutputs)
    buildHydrationPatch(
      { stageDisplayConfig: legacyStageConfig },
      current,
      defaultOutputs,
      identity
    )
    expect(JSON.stringify(defaultOutputs)).toBe(snapshot)
  })
})
