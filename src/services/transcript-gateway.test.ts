import { beforeEach, describe, expect, it, vi } from "vitest"

const { invokeMock, saveMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  saveMock: vi.fn(),
}))
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: saveMock }))

import { exportTranscript, listRecentTranscripts } from "./transcript-gateway"

beforeEach(() => {
  invokeMock.mockReset().mockResolvedValue(undefined)
  saveMock.mockReset()
})

describe("transcript-gateway", () => {
  it("listRecentTranscripts passes the limit and maps rows", async () => {
    invokeMock.mockResolvedValue([
      {
        name: "transcript-20261019-143000Z.log",
        recordedAt: 1_792_420_200_000,
        sizeBytes: 4096,
      },
    ])
    const rows = await listRecentTranscripts(3)
    expect(invokeMock).toHaveBeenCalledWith("list_recent_transcripts", {
      limit: 3,
    })
    expect(rows).toEqual([
      {
        name: "transcript-20261019-143000Z.log",
        recordedAt: 1_792_420_200_000,
        sizeBytes: 4096,
      },
    ])
  })

  it("listRecentTranscripts defaults to the latest three", async () => {
    invokeMock.mockResolvedValue([])
    await listRecentTranscripts()
    expect(invokeMock).toHaveBeenCalledWith("list_recent_transcripts", {
      limit: 3,
    })
  })

  it("listRecentTranscripts normalizes a missing recordedAt to null", async () => {
    invokeMock.mockResolvedValue([
      { name: "transcript-bogus.log", recordedAt: null, sizeBytes: 0 },
    ])
    const [row] = await listRecentTranscripts()
    expect(row.recordedAt).toBeNull()
  })

  it("exportTranscript saves to the picked path and invokes the command", async () => {
    saveMock.mockResolvedValue("C:/exports/sunday.log")
    const saved = await exportTranscript("transcript-20261019-143000Z.log")
    expect(saveMock).toHaveBeenCalledWith({
      defaultPath: "transcript-20261019-143000Z.log",
      filters: [{ name: "Transcript log", extensions: ["log"] }],
    })
    expect(invokeMock).toHaveBeenCalledWith("export_transcript", {
      name: "transcript-20261019-143000Z.log",
      destPath: "C:/exports/sunday.log",
    })
    expect(saved).toBe("C:/exports/sunday.log")
  })

  it("exportTranscript returns null and skips the command when cancelled", async () => {
    saveMock.mockResolvedValue(null)
    const saved = await exportTranscript("transcript-20261019-143000Z.log")
    expect(saved).toBeNull()
    expect(invokeMock).not.toHaveBeenCalled()
  })
})
