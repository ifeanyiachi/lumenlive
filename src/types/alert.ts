export type AlertStyle = "banner" | "lower-third" | "fullscreen"
export type AlertPosition = "top" | "bottom"
export type AlertAnimation = "fade" | "slide" | "none"

export interface AlertTemplate {
  id: string
  name: string
  style: AlertStyle
  position: AlertPosition
  backgroundColor: string
  textColor: string
  fontSize: number
  fontFamily?: string
  fontWeight?: number
  icon?: string
  iconUrl?: string
  duration: number
  animation: AlertAnimation
  textShadow?: {
    offsetX: number
    offsetY: number
    blur: number
    color: string
  }
  outline?: {
    width: number
    color: string
  }
}

export interface ActiveAlert {
  id: string
  templateId: string
  message: string
  startedAt: number
  duration: number
}

// ── Countdown Timer ──

export type CountdownFormat = "mm:ss" | "hh:mm:ss" | "minutes"

/**
 * How a timer's remaining time is derived:
 *  - "duration": counts down `durationSeconds` from when it was started.
 *  - "clock":    counts down to a wall-clock time-of-day (`targetTime`, "HH:MM"),
 *                the classic "service starts at 10:00 AM" pre-service screen.
 */
export type CountdownMode = "duration" | "clock"

/**
 * What happens when the timer reaches zero:
 *  - "flash":    pulse the box opacity, stay on screen.
 *  - "hide":     dismiss automatically.
 *  - "none":     freeze at 00:00, stay on screen.
 *  - "overtime": keep counting, now *upward* with a "-" prefix (how far over).
 */
export type CountdownEndAction = "flash" | "hide" | "none" | "overtime"

export interface CountdownTimer {
  id: string
  label: string
  mode: CountdownMode
  /** Duration-mode length in seconds. */
  durationSeconds: number
  /** Clock-mode target time-of-day, "HH:MM" (24h). Ignored in duration mode. */
  targetTime?: string
  format: CountdownFormat
  /**
   * How the timer is styled on output:
   *  - "custom" (default): the inline appearance fields below (colors, font,
   *    position) — the classic behaviour.
   *  - "theme":  render through a saved `countdown`-category broadcast theme
   *    (`themeId`), a full-frame composition. Falls back to custom when the theme
   *    is missing. Optional/undefined is treated as "custom" so timers persisted
   *    before this feature keep working.
   */
  styleMode?: "custom" | "theme"
  /** The `countdown`-category theme to render with when `styleMode === "theme"`. */
  themeId?: string
  backgroundColor: string
  textColor: string
  fontSize: number
  fontFamily: string
  position:
    | "top-left"
    | "top-center"
    | "top-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right"
    | "center"
    | "fullscreen"
  showLabel: boolean
  endAction: CountdownEndAction
  /**
   * Optional urgency thresholds (seconds remaining). When set, the time text
   * recolors to amber at/under `warnSeconds` and red at/under `dangerSeconds`
   * (see `lib/countdown`). Leave undefined to keep the timer a single color.
   */
  warnSeconds?: number
  dangerSeconds?: number
}

/**
 * A running countdown instance. Time is always derived from these fields plus an
 * injected `now` (see `lib/countdown`), never stored as a mutating "remaining"
 * value — so the operator preview and every broadcast output agree frame-to-frame.
 */
export interface ActiveCountdown {
  id: string
  timerId: string
  mode: CountdownMode
  /** Epoch ms when the timer was started (duration mode anchor). */
  startedAt: number
  /** Duration-mode length; `adjustCountdown` mutates this for ±time. */
  durationSeconds: number
  /** Clock-mode absolute target (epoch ms); `adjustCountdown` shifts this. */
  targetEpochMs?: number
  state: "running" | "paused"
  /** Epoch ms of the current pause, if `state === "paused"` (duration mode). */
  pausedAt?: number
  /** Total ms spent paused across completed pause/resume cycles. */
  accumulatedPausedMs: number
}

export const DEFAULT_COUNTDOWN: CountdownTimer = {
  id: "default-countdown",
  label: "Countdown",
  mode: "duration",
  durationSeconds: 300,
  format: "mm:ss",
  styleMode: "custom",
  backgroundColor: "rgba(0,0,0,0.7)",
  textColor: "#ffffff",
  fontSize: 64,
  fontFamily: "Inter",
  position: "center",
  showLabel: true,
  endAction: "flash",
}

export const DEFAULT_TEMPLATES: AlertTemplate[] = [
  {
    id: "nursery-call",
    name: "Nursery Call",
    style: "lower-third",
    position: "bottom",
    backgroundColor: "#dc2626",
    textColor: "#ffffff",
    fontSize: 36,
    duration: 10000,
    animation: "slide",
  },
  {
    id: "announcement",
    name: "Announcement",
    style: "banner",
    position: "top",
    backgroundColor: "#2563eb",
    textColor: "#ffffff",
    fontSize: 32,
    duration: 15000,
    animation: "fade",
  },
  {
    id: "prayer-request",
    name: "Prayer Request",
    style: "lower-third",
    position: "bottom",
    backgroundColor: "#7c3aed",
    textColor: "#ffffff",
    fontSize: 32,
    duration: 20000,
    animation: "slide",
  },
]
