import { describe, it, expect } from "vitest"
import {
  buildLiveSessionPatch,
  liveSessionChanged,
  pickLiveSession,
  type LiveSessionData,
} from "./live-session"

function session(over: Partial<LiveSessionData> = {}): LiveSessionData {
  return {
    isLive: false,
    liveVerse: null,
    liveVersePages: null,
    liveVersePageIndex: 0,
    liveSlide: null,
    liveMedia: null,
    liveWeb: null,
    broadcastSource: null,
    interlinearText: null,
    broadcastMuted: false,
    blackout: false,
    clearForeground: false,
    showLogo: false,
    ...over,
  }
}

// A minimal stand-in for VerseRenderData — only object identity matters to the
// diff/round-trip logic under test, so the exact shape is irrelevant here.
const verse = {
  reference: "John 3:16",
} as unknown as LiveSessionData["liveVerse"]

describe("pickLiveSession", () => {
  it("round-trips every durable field", () => {
    const s = session({
      isLive: true,
      liveVerse: verse,
      liveVersePageIndex: 2,
      broadcastSource: "schedule",
      interlinearText: "greek",
      broadcastMuted: true,
    })
    expect(pickLiveSession(s)).toEqual(s)
  })

  it("captures the audience-visibility holds", () => {
    const s = session({ isLive: true, blackout: true, showLogo: true })
    const picked = pickLiveSession(s)
    expect(picked.blackout).toBe(true)
    expect(picked.showLogo).toBe(true)
  })

  it("drops fields outside the session subset (e.g. preview staging)", () => {
    const wide = {
      ...session({ isLive: true }),
      previewVerse: {},
      blackout: true,
    }
    const picked = pickLiveSession(wide)
    expect("previewVerse" in picked).toBe(false)
  })
})

describe("liveSessionChanged", () => {
  it("is false for identical snapshots", () => {
    const s = session({ isLive: true, liveVerse: verse })
    expect(liveSessionChanged(s, { ...s })).toBe(false)
  })

  it("detects an on-air toggle", () => {
    expect(liveSessionChanged(session(), session({ isLive: true }))).toBe(true)
  })

  it("detects a live-content swap by reference", () => {
    expect(
      liveSessionChanged(
        session({ liveVerse: verse }),
        session({ liveVerse: { ...(verse as object) } as typeof verse })
      )
    ).toBe(true)
  })

  it("detects a blackout toggle so the hold is saved", () => {
    expect(
      liveSessionChanged(
        session({ isLive: true }),
        session({ isLive: true, blackout: true })
      )
    ).toBe(true)
  })
})

describe("buildLiveSessionPatch", () => {
  it("restores an on-air session when an output window is open", () => {
    const raw = session({
      isLive: true,
      liveVerse: verse,
      liveVersePageIndex: 1,
      broadcastSource: "manual",
      broadcastMuted: true,
    })
    const patch = buildLiveSessionPatch(raw, true)
    expect(patch).not.toBeNull()
    expect(patch?.isLive).toBe(true)
    expect(patch?.liveVerse).toBe(verse)
    expect(patch?.liveVersePageIndex).toBe(1)
    expect(patch?.broadcastSource).toBe("manual")
    expect(patch?.broadcastMuted).toBe(true)
  })

  it("restores the audience-visibility holds when resuming", () => {
    const patch = buildLiveSessionPatch(
      session({ isLive: true, blackout: true, showLogo: true }),
      true
    )
    expect(patch?.blackout).toBe(true)
    expect(patch?.showLogo).toBe(true)
    expect(patch?.clearForeground).toBe(false)
  })

  it("does NOT restore on a cold launch (no output window open)", () => {
    // Even a blacked-out session stays clean on a cold start — the original
    // "never come back mysteriously black" rule holds when no window is open.
    const patch = buildLiveSessionPatch(
      session({ isLive: true, blackout: true }),
      false
    )
    expect(patch).toBeNull()
  })

  it("does NOT restore a session that was off-air", () => {
    expect(buildLiveSessionPatch(session({ isLive: false }), true)).toBeNull()
  })

  it("returns null for missing/corrupt data instead of throwing", () => {
    expect(buildLiveSessionPatch(null, true)).toBeNull()
    expect(buildLiveSessionPatch(undefined, true)).toBeNull()
    expect(buildLiveSessionPatch({}, true)).toBeNull()
  })

  it("defaults a corrupt page index to 0 and coerces muted", () => {
    const patch = buildLiveSessionPatch(
      {
        isLive: true,
        liveVersePageIndex: undefined,
        broadcastMuted: undefined,
      },
      true
    )
    expect(patch?.liveVersePageIndex).toBe(0)
    expect(patch?.broadcastMuted).toBe(false)
  })
})
