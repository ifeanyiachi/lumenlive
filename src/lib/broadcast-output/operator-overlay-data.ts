import type {
  ActiveAlert,
  AlertTemplate,
  ActiveCountdown,
  CountdownTimer,
} from "@/types/alert"
import type { BroadcastProp, BroadcastTheme } from "@/types/broadcast"
import { resolveTimerTheme } from "@/lib/countdown/resolve-theme"
import {
  drawPropsOverlay,
  drawAlertOverlay,
  drawCountdownOverlay,
} from "./overlays"

/**
 * Operator-side assembly of the overlay layer (D2). The audience output builds
 * the very same three inputs — active props (via `syncProps`), `{ alert,
 * template }` alert entries, and `{ countdown, timer, theme }` countdown entries
 * — from its stores and hands them to the canvas painters in
 * `lib/broadcast-output/overlays`. The operator "Live display" mirror used to
 * re-derive and re-paint all of that in parallel DOM (its own marquee timing,
 * its own bar geometry), which drifted from the audience by construction.
 *
 * These pure functions reproduce the audience's exact assembly so the operator
 * preview can drive the *same painters* over the *same data* — one source of
 * truth, no second implementation to keep in sync. Each mirrors an emit-side
 * expression: {@link activeOverlayProps} == `syncProps`' `props.filter(active)`;
 * {@link activeAlertEntries} == the accumulated `{ alert, template }` from each
 * `alert` event; {@link activeCountdownEntries} == `resyncOutputs`' item build
 * (both using the shared {@link resolveTimerTheme}).
 */

/** One active alert joined to the template it renders with. */
export interface AlertEntry {
  alert: ActiveAlert
  template: AlertTemplate
}

/** One active countdown joined to its timer (and the theme it paints with). */
export interface CountdownEntry {
  countdown: ActiveCountdown
  timer: CountdownTimer
  theme?: BroadcastTheme
}

/** State snapshot the operator overlay draws from (read from the live stores). */
export interface OperatorOverlayState {
  props: BroadcastProp[]
  activeAlerts: ActiveAlert[]
  alertTemplates: AlertTemplate[]
  activeCountdowns: ActiveCountdown[]
  timers: CountdownTimer[]
  themes: BroadcastTheme[]
}

/** Only active props reach the audience (see `syncProps`); mirror that here. */
export function activeOverlayProps(props: BroadcastProp[]): BroadcastProp[] {
  return props.filter((p) => p.active)
}

/** Join each active alert to its template, dropping any whose template is gone. */
export function activeAlertEntries(
  activeAlerts: ActiveAlert[],
  templates: AlertTemplate[]
): AlertEntry[] {
  const entries: AlertEntry[] = []
  for (const alert of activeAlerts) {
    const template = templates.find((t) => t.id === alert.templateId)
    if (template) entries.push({ alert, template })
  }
  return entries
}

/** Join each active countdown to its timer + resolved theme, dropping orphans. */
export function activeCountdownEntries(
  activeCountdowns: ActiveCountdown[],
  timers: CountdownTimer[],
  themes: BroadcastTheme[]
): CountdownEntry[] {
  const entries: CountdownEntry[] = []
  for (const countdown of activeCountdowns) {
    const timer = timers.find((t) => t.id === countdown.timerId)
    if (timer) {
      entries.push({
        countdown,
        timer,
        theme: resolveTimerTheme(timer, themes),
      })
    }
  }
  return entries
}

/**
 * Whether the overlay layer needs a per-frame RAF: a marquee scrolls every
 * frame, and a live countdown ticks/flashes. Static text/image props and alert
 * bars are time-independent, so with none of these a single draw suffices.
 */
export function overlaysNeedAnimation(
  props: BroadcastProp[],
  countdownCount: number
): boolean {
  return countdownCount > 0 || props.some((p) => p.type === "marquee")
}

/**
 * Paint the operator overlay layer — the exact three painters, in the exact
 * order, that the audience compositor's `paintOverlays` runs with a null layer
 * filter (props → alerts → countdowns). `imageCache` is keyed by the raw
 * `prop.imageUrl` the painter looks up; `now` is epoch ms (marquee scroll +
 * countdown clock). Keeping this a single lib function means the operator draw
 * path is testable and provably parallel to the audience's.
 */
export function drawOperatorOverlays(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: OperatorOverlayState,
  imageCache: Map<string, HTMLImageElement>,
  now: number
): void {
  drawPropsOverlay(ctx, w, h, activeOverlayProps(state.props), imageCache, now)
  drawAlertOverlay(
    ctx,
    w,
    h,
    activeAlertEntries(state.activeAlerts, state.alertTemplates)
  )
  drawCountdownOverlay(
    ctx,
    w,
    h,
    activeCountdownEntries(state.activeCountdowns, state.timers, state.themes),
    now
  )
}
