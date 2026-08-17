import { describe, it, expect, vi, beforeEach } from "vitest"

const emitToMock = vi.fn()
vi.mock("@tauri-apps/api/event", () => ({
  emitTo: (...args: unknown[]) => emitToMock(...args),
}))

import {
  outputWindowLabel,
  emitToOutput,
  emitToAllOutputs,
} from "./broadcast-routing"
import type { BroadcastOutput } from "@/types/broadcast"

function output(id: string, enabled: boolean): BroadcastOutput {
  return {
    id,
    name: id,
    themeId: "t",
    mode: "normal",
    contentSource: { type: "independent" },
    enabled,
  } as BroadcastOutput
}

describe("broadcast-routing", () => {
  beforeEach(() => {
    emitToMock.mockReset()
    emitToMock.mockResolvedValue(undefined)
  })

  it("maps output ids to window labels ('main' → 'broadcast')", () => {
    expect(outputWindowLabel("main")).toBe("broadcast")
    expect(outputWindowLabel("alt")).toBe("broadcast-alt")
  })

  it("emitToOutput targets the mapped window label", () => {
    emitToOutput("alt", "broadcast:mute", { muted: true })
    expect(emitToMock).toHaveBeenCalledWith("broadcast-alt", "broadcast:mute", {
      muted: true,
    })
  })

  // Fan-out reaches live outputs and skips the rest. This gate is only correct
  // while `enabled` faithfully tracks the real window state — the reason
  // `useOutputController` writes it as the built-in windows open/close. (If that
  // sync regresses, visibility/overlay events silently stop reaching an open
  // external monitor even though content still arrives.)
  it("emitToAllOutputs fans out to enabled outputs and skips disabled ones", () => {
    const outputs = [output("main", true), output("alt", false)]
    emitToAllOutputs(outputs, "broadcast:output-visibility", { clear: true })

    expect(emitToMock).toHaveBeenCalledTimes(1)
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast",
      "broadcast:output-visibility",
      { clear: true }
    )
    expect(emitToMock).not.toHaveBeenCalledWith(
      "broadcast-alt",
      "broadcast:output-visibility",
      { clear: true }
    )
  })
})
