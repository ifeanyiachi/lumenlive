import { beforeEach, describe, expect, it } from "vitest"
import { useTranscriptStore } from "./transcript-store"
import type { TranscriptSegment } from "@/types"

function seg(id: number): TranscriptSegment {
  return {
    id: String(id),
    text: `segment ${id}`,
    timestamp: id,
  } as TranscriptSegment
}

describe("transcript store", () => {
  beforeEach(() => {
    useTranscriptStore.setState({ segments: [], currentPartial: "" })
  })

  it("appends segments and clears the current partial", () => {
    useTranscriptStore.setState({ currentPartial: "typing..." })
    useTranscriptStore.getState().addSegment(seg(1))
    const s = useTranscriptStore.getState()
    expect(s.segments).toHaveLength(1)
    expect(s.currentPartial).toBe("")
  })

  it("caps retained segments at 500, keeping the most recent", () => {
    const add = useTranscriptStore.getState().addSegment
    for (let i = 0; i < 650; i++) add(seg(i))
    const { segments } = useTranscriptStore.getState()
    expect(segments).toHaveLength(500)
    // Oldest 150 dropped; window is [150, 649].
    expect(segments[0].id).toBe("150")
    expect(segments[segments.length - 1].id).toBe("649")
  })

  it("clearTranscript empties segments and partial", () => {
    useTranscriptStore.getState().addSegment(seg(1))
    useTranscriptStore.getState().clearTranscript()
    expect(useTranscriptStore.getState().segments).toEqual([])
    expect(useTranscriptStore.getState().currentPartial).toBe("")
  })
})
