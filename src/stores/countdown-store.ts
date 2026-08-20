import { create } from "zustand"
import { load, type Store } from "@tauri-apps/plugin-store"
import type { CountdownTimer, ActiveCountdown } from "@/types/alert"
import { DEFAULT_COUNTDOWN } from "@/types/alert"
import type { Theme } from "@/types/theme"
import {
  computeRemainingSeconds,
  resolveTargetEpoch,
} from "@/lib/countdown/timer"
import { resolveCountdownTheme } from "@/lib/theme/resolve"
import {
  broadcastOutputEvent,
  BROADCAST_EVENTS,
} from "@/services/broadcast-content-gateway"
import { useBroadcastStore } from "./broadcast-store"
import { useThemesStore } from "./themes"

/**
 * The countdown {@link Theme} a timer ships to the output with, resolved from the
 * one typed theme store via the shared pure {@link resolveCountdownTheme}
 * (themeredo.md, flip F3) — the operator overlay preview resolves it the same way,
 * so the two never disagree. Shipped with each countdown event so the output
 * window can paint the themed composition without reaching into the store itself.
 */
function resolveTimerTheme(timer: CountdownTimer): Theme | undefined {
  return resolveCountdownTheme(timer, useThemesStore.getState().allThemes())
}

interface CountdownState {
  timers: CountdownTimer[]
  activeCountdowns: ActiveCountdown[]

  createTimer: (timer: CountdownTimer) => void
  updateTimer: (id: string, updates: Partial<CountdownTimer>) => void
  deleteTimer: (id: string) => void

  startCountdown: (timerId: string) => void
  pauseCountdown: (countdownId: string) => void
  resumeCountdown: (countdownId: string) => void
  adjustCountdown: (countdownId: string, deltaSeconds: number) => void
  dismissCountdown: (countdownId: string) => void
  dismissAll: () => void
  resyncOutputs: () => void
}

const countdownIntervals = new Map<string, ReturnType<typeof setInterval>>()

/** Fan a single countdown's latest state out to every enabled broadcast output. */
function emitUpdate(countdown: ActiveCountdown, timer: CountdownTimer): void {
  broadcastOutputEvent(
    useBroadcastStore.getState().outputs,
    BROADCAST_EVENTS.countdownUpdate,
    { countdown, timer, theme: resolveTimerTheme(timer) }
  )
}

export const useCountdownStore = create<CountdownState>((set, get) => ({
  timers: [DEFAULT_COUNTDOWN],
  activeCountdowns: [],

  createTimer: (timer) => set((s) => ({ timers: [...s.timers, timer] })),

  updateTimer: (id, updates) =>
    set((s) => ({
      timers: s.timers.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  deleteTimer: (id) =>
    set((s) => ({ timers: s.timers.filter((t) => t.id !== id) })),

  startCountdown: (timerId) => {
    const timer = get().timers.find((t) => t.id === timerId)
    if (!timer) return

    const now = Date.now()
    const countdown: ActiveCountdown = {
      id: crypto.randomUUID(),
      timerId,
      mode: timer.mode,
      startedAt: now,
      durationSeconds: timer.durationSeconds,
      targetEpochMs:
        timer.mode === "clock" && timer.targetTime
          ? (resolveTargetEpoch(timer.targetTime, now) ?? undefined)
          : undefined,
      state: "running",
      accumulatedPausedMs: 0,
    }

    set((s) => ({ activeCountdowns: [...s.activeCountdowns, countdown] }))

    broadcastOutputEvent(
      useBroadcastStore.getState().outputs,
      BROADCAST_EVENTS.countdown,
      { countdown, timer, theme: resolveTimerTheme(timer) }
    )

    // The ticker only drives expiry side-effects (auto-hide). Rendering derives
    // its own time from `now` per frame, so a 1s poll here is plenty.
    const interval = setInterval(() => {
      const current = get().activeCountdowns.find((c) => c.id === countdown.id)
      if (!current) {
        clearInterval(interval)
        countdownIntervals.delete(countdown.id)
        return
      }
      const remaining = computeRemainingSeconds(current, Date.now())
      if (remaining > 0) return

      if (timer.endAction === "hide") {
        get().dismissCountdown(countdown.id)
      } else {
        // flash / none / overtime keep the timer on screen; the renderers own
        // the expired visuals, so this poll has nothing left to do.
        clearInterval(interval)
        countdownIntervals.delete(countdown.id)
      }
    }, 1000)
    countdownIntervals.set(countdown.id, interval)
  },

  pauseCountdown: (countdownId) => {
    const now = Date.now()
    let updated: ActiveCountdown | undefined
    set((s) => ({
      activeCountdowns: s.activeCountdowns.map((c) => {
        if (c.id !== countdownId || c.state === "paused") return c
        updated = { ...c, state: "paused", pausedAt: now }
        return updated
      }),
    }))
    const timer = updated && get().timers.find((t) => t.id === updated!.timerId)
    if (updated && timer) emitUpdate(updated, timer)
  },

  resumeCountdown: (countdownId) => {
    const now = Date.now()
    let updated: ActiveCountdown | undefined
    set((s) => ({
      activeCountdowns: s.activeCountdowns.map((c) => {
        if (c.id !== countdownId || c.state !== "paused") return c
        const pausedFor = c.pausedAt != null ? now - c.pausedAt : 0
        updated = {
          ...c,
          state: "running",
          pausedAt: undefined,
          accumulatedPausedMs: c.accumulatedPausedMs + pausedFor,
        }
        return updated
      }),
    }))
    const timer = updated && get().timers.find((t) => t.id === updated!.timerId)
    if (updated && timer) emitUpdate(updated, timer)
  },

  adjustCountdown: (countdownId, deltaSeconds) => {
    let updated: ActiveCountdown | undefined
    set((s) => ({
      activeCountdowns: s.activeCountdowns.map((c) => {
        if (c.id !== countdownId) return c
        if (c.mode === "clock" && c.targetEpochMs != null) {
          updated = {
            ...c,
            targetEpochMs: c.targetEpochMs + deltaSeconds * 1000,
          }
        } else {
          updated = {
            ...c,
            durationSeconds: Math.max(0, c.durationSeconds + deltaSeconds),
          }
        }
        return updated
      }),
    }))
    const timer = updated && get().timers.find((t) => t.id === updated!.timerId)
    if (updated && timer) emitUpdate(updated, timer)
  },

  dismissCountdown: (countdownId) => {
    const interval = countdownIntervals.get(countdownId)
    if (interval) {
      clearInterval(interval)
      countdownIntervals.delete(countdownId)
    }

    set((s) => ({
      activeCountdowns: s.activeCountdowns.filter((c) => c.id !== countdownId),
    }))

    broadcastOutputEvent(
      useBroadcastStore.getState().outputs,
      BROADCAST_EVENTS.countdownDismiss,
      { countdownId }
    )
  },

  dismissAll: () => {
    for (const [id, interval] of countdownIntervals) {
      clearInterval(interval)
      countdownIntervals.delete(id)
    }
    set({ activeCountdowns: [] })

    broadcastOutputEvent(
      useBroadcastStore.getState().outputs,
      BROADCAST_EVENTS.countdownDismissAll,
      {}
    )
  },

  resyncOutputs: () => {
    // Re-push the full active set so a newly-opened (or re-announced) output
    // window shows countdowns that started before it mounted. Output windows
    // treat this as a replace, so re-sending to already-synced windows is safe.
    const { activeCountdowns, timers } = get()
    const items = activeCountdowns
      .map((countdown) => {
        const timer = timers.find((t) => t.id === countdown.timerId)
        return timer
          ? { countdown, timer, theme: resolveTimerTheme(timer) }
          : null
      })
      .filter(
        (
          x
        ): x is {
          countdown: ActiveCountdown
          timer: CountdownTimer
          theme: Theme | undefined
        } => Boolean(x)
      )

    broadcastOutputEvent(
      useBroadcastStore.getState().outputs,
      BROADCAST_EVENTS.countdownSync,
      { items }
    )
  },
}))

// ── Persistence via tauri-plugin-store (saved timers only, not live runs) ──

let tauriStore: Store | null = null
let hydrationPromise: Promise<void> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<void> = Promise.resolve()
const SAVE_DEBOUNCE_MS = 500

async function getCountdownStore(): Promise<Store> {
  if (!tauriStore) {
    tauriStore = await load("countdown-timers.json", {
      autoSave: false,
      defaults: {},
    })
  }
  return tauriStore
}

/** Load persisted countdown timer presets. Idempotent; subsequent callers
 *  await the same promise. Attaches the save subscription only after a
 *  successful load so defaults are never written over saved presets. */
export function hydrateCountdownTimers(): Promise<void> {
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = (async () => {
    try {
      const store = await getCountdownStore()
      const timers = (await store.get("timers")) as CountdownTimer[] | undefined

      if (timers && Array.isArray(timers) && timers.length > 0) {
        useCountdownStore.setState({ timers })
      }

      useCountdownStore.subscribe((state, prevState) => {
        if (state.timers !== prevState.timers) {
          if (saveTimer) clearTimeout(saveTimer)
          saveTimer = setTimeout(() => {
            saveTimer = null
            pendingSave = pendingSave.then(() =>
              persistCountdownTimers(useCountdownStore.getState().timers)
            )
          }, SAVE_DEBOUNCE_MS)
        }
      })
    } catch {
      console.warn(
        "[countdown] Failed to load persisted timers, using defaults"
      )
    }
  })()
  return hydrationPromise
}

async function persistCountdownTimers(timers: CountdownTimer[]): Promise<void> {
  try {
    const store = await getCountdownStore()
    await store.set("timers", timers)
    await store.save()
  } catch {
    console.warn("[countdown] Failed to persist timers")
  }
}
