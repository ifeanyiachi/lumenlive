// Zone-driven stage renderer. `drawStageDisplay` walks a `StageLayout`'s zones
// in `layerOrder` and dispatches each one to a per-source renderer. This is the
// data-driven successor to the old fixed four-toggle renderer: the built-in
// Standard/Minimal layouts (migrated from the legacy config) land in exactly the
// same positions with the same content, but any zone can now be moved/resized
// and free-form layouts render the same way.
//
// Per-source drawing (verse/slide preview, clock, notes wrapping) is preserved
// from the previous renderer verbatim. The one intentional change from the old
// output: the bottom info row's clock and notes are now independent zones, each
// with its own rounded background, instead of a single shared container with a
// divider line — the zone model has no shared container, and this generalises to
// free-form placement.
//
// Pure over plain data + a Canvas2D context; no React/Zustand/Tauri.

import { renderVerse } from "@/lib/verse-renderer"
import { renderSlide } from "@/lib/slide-renderer"
import { buildScriptureContent } from "@/lib/broadcast-output/scripture-slide"
import { surfaceFontScale } from "@/lib/canvas-constants"
import { projectBoxToSurface } from "@/lib/canvas-box-projection"
import { STAGE_RESOLUTION } from "@/lib/stage-layout/migrate"
import {
  computeRemainingSeconds,
  formatCountdownTime,
  resolveTimeColor,
} from "@/lib/countdown/timer"
import type { BroadcastTheme, VerseRenderData } from "@/types/broadcast"
import type { Background, TextStyle } from "@/types/canvas"
import type { StageLayout, StageZone } from "@/types/stage-layout"
import type { ActiveCountdown, CountdownTimer } from "@/types/alert"
import type { Slide } from "@/types/slide"

/**
 * A running/paused countdown feed for a `timer` zone. Carries the raw
 * `ActiveCountdown` plus its `CountdownTimer` so the zone derives its time and
 * urgency colour from the SAME shared math (`lib/countdown/timer`) as the
 * operator preview and the audience overlay — a paused timer freezes, a
 * clock-mode timer counts to its wall-clock target, and the format / warn /
 * danger thresholds match the rest of the app exactly.
 */
export interface StageTimer {
  countdown: ActiveCountdown
  timer: CountdownTimer
}

export interface StageDisplayData {
  /** The resolved layout to render (see lib/stage-layout/resolve.ts). */
  layout: StageLayout
  currentTheme: BroadcastTheme
  currentVerse: VerseRenderData | null
  currentSlide: Slide | null
  notes: string | null
  // Live source feeds (Phase 4). Optional so older producers stay valid.
  timer?: StageTimer | null
  message?: string | null
  announcement?: string | null
  playlist?: string[] | null
}

const HEADER_H = 36
const BORDER_RADIUS = 8
const LIVE_DOT_RADIUS = 5

function fontFamilyOf(zone: StageZone): string {
  return zone.text?.fontFamily ?? "Inter"
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function drawZoneHeader(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  label: string,
  fontFamily: string,
  isLive?: boolean
) {
  ctx.fillStyle = "rgba(255,255,255,0.06)"
  ctx.beginPath()
  ctx.roundRect(x, y, w, HEADER_H, [BORDER_RADIUS, BORDER_RADIUS, 0, 0])
  ctx.fill()

  const textX = x + 12 + (isLive ? LIVE_DOT_RADIUS * 2 + 8 : 0)
  if (isLive) {
    ctx.beginPath()
    ctx.arc(
      x + 12 + LIVE_DOT_RADIUS,
      y + HEADER_H / 2,
      LIVE_DOT_RADIUS,
      0,
      Math.PI * 2
    )
    ctx.fillStyle = "#ef4444"
    ctx.fill()
  }

  ctx.font = `600 13px ${fontFamily}, sans-serif`
  ctx.fillStyle = "rgba(255,255,255,0.7)"
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.fillText(label, textX, y + HEADER_H / 2)
}

function renderContentPreview(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  theme: BroadcastTheme,
  verse: VerseRenderData | null,
  slide: Slide | null,
  imageCache: Map<string, HTMLImageElement>,
  videoCache: Map<string, HTMLVideoElement>
) {
  const offscreen = document.createElement("canvas")
  offscreen.width = theme.resolution.width
  offscreen.height = theme.resolution.height
  const offCtx = offscreen.getContext("2d")
  if (!offCtx) return

  if (slide) {
    // A presented scripture slide arrives with its verse alongside (RF3b): fill its
    // style-only placeholder through the slide renderer's scripture payload — the same
    // recipe the audience compositor uses — so the stage mirrors the output. Auto-fit
    // is off, matching the stage's prior `renderVerse` call. A real schedule slide has
    // no verse and renders plainly.
    const opts = verse
      ? {
          scriptureContent: buildScriptureContent(slide, verse, {
            verseAutoFit: false,
            maxVerseScale: 1,
            minVerseFontSize: 40,
          }),
        }
      : undefined
    renderSlide(
      offCtx,
      slide,
      offscreen.width,
      offscreen.height,
      imageCache,
      videoCache,
      opts
    )
  } else if (verse) {
    // Fallback: no scripture theme resolved in the new store — legacy verse path.
    renderVerse(offCtx, theme, verse, { imageCache })
  }

  ctx.drawImage(offscreen, x, y, w, h)
}

function drawClock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fontFamily: string,
  color: string,
  clockFormat: "12h" | "24h",
  now: Date
) {
  let hours = now.getHours()
  const minutes = now.getMinutes()
  const seconds = now.getSeconds()
  let suffix = ""

  if (clockFormat === "12h") {
    suffix = hours >= 12 ? " PM" : " AM"
    hours = hours % 12 || 12
  }

  const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${suffix}`

  ctx.font = `700 ${Math.round(h * 0.5)}px ${fontFamily}, sans-serif`
  ctx.fillStyle = color
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(timeStr, x + w / 2, y + h / 2)
}

function drawNotes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  notes: string,
  fontFamily: string,
  color: string,
  baseFontSize: number
) {
  const fontSize = Math.round(baseFontSize * 0.5)
  ctx.font = `400 ${fontSize}px ${fontFamily}, sans-serif`
  ctx.fillStyle = "rgba(255,255,255,0.5)"
  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  ctx.fillText("NOTES", x, y)

  const notesY = y + fontSize + 8
  const lineHeight = fontSize * 1.5
  ctx.font = `400 ${fontSize}px ${fontFamily}, sans-serif`
  ctx.fillStyle = color

  const words = notes.split(/\s+/)
  let line = ""
  let curY = notesY
  const maxW = w - 8

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word
    if (ctx.measureText(testLine).width > maxW && line) {
      ctx.fillText(line, x, curY)
      line = word
      curY += lineHeight
      if (curY + lineHeight > y + h) break
    } else {
      line = testLine
    }
  }
  if (line && curY + lineHeight <= y + h) {
    ctx.fillText(line, x, curY)
  }
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  zone: StageZone,
  label: string
) {
  ctx.fillStyle = "rgba(0,0,0,0.2)"
  drawRoundedRect(ctx, zone.x, zone.y, zone.width, zone.height, BORDER_RADIUS)
  ctx.fill()

  ctx.font = `400 14px ${fontFamilyOf(zone)}, sans-serif`
  ctx.fillStyle = "rgba(255,255,255,0.25)"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(label, zone.x + zone.width / 2, zone.y + zone.height / 2)
}

// ── Per-source zone renderers ──

function drawPreviewZone(
  ctx: CanvasRenderingContext2D,
  zone: StageZone,
  theme: BroadcastTheme,
  verse: VerseRenderData | null,
  slide: Slide | null,
  imageCache: Map<string, HTMLImageElement>,
  videoCache: Map<string, HTMLVideoElement>,
  opts: {
    bgAlpha: string
    isLive: boolean
    emptyLabel: string
    emptyFontSize: number
    emptyColor: string
  }
) {
  const { x, y, width: w, height: h } = zone

  ctx.fillStyle = opts.bgAlpha
  drawRoundedRect(ctx, x, y, w, h, BORDER_RADIUS)
  ctx.fill()

  const fontFamily = fontFamilyOf(zone)
  drawZoneHeader(ctx, x, y, w, zone.label ?? zone.name, fontFamily, opts.isLive)

  const previewY = y + HEADER_H
  const previewH = h - HEADER_H

  if (verse || slide) {
    renderContentPreview(
      ctx,
      x + 2,
      previewY + 2,
      w - 4,
      previewH - 4,
      theme,
      verse,
      slide,
      imageCache,
      videoCache
    )
  } else {
    ctx.font = `400 ${opts.emptyFontSize}px ${fontFamily}, sans-serif`
    ctx.fillStyle = opts.emptyColor
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(opts.emptyLabel, x + w / 2, previewY + previewH / 2)
  }
}

function drawClockZone(
  ctx: CanvasRenderingContext2D,
  zone: StageZone,
  now: Date
) {
  ctx.fillStyle = "rgba(0,0,0,0.2)"
  drawRoundedRect(ctx, zone.x, zone.y, zone.width, zone.height, BORDER_RADIUS)
  ctx.fill()

  const style: TextStyle | undefined = zone.text
  drawClock(
    ctx,
    zone.x,
    zone.y,
    zone.width,
    zone.height,
    fontFamilyOf(zone),
    style?.color ?? "#e0e0e0",
    zone.clockFormat ?? "12h",
    now
  )
}

function drawNotesZone(
  ctx: CanvasRenderingContext2D,
  zone: StageZone,
  notes: string
) {
  ctx.fillStyle = "rgba(0,0,0,0.2)"
  drawRoundedRect(ctx, zone.x, zone.y, zone.width, zone.height, BORDER_RADIUS)
  ctx.fill()

  const style: TextStyle | undefined = zone.text
  drawNotes(
    ctx,
    zone.x + 16,
    zone.y + 12,
    zone.width - 32,
    zone.height - 24,
    notes,
    fontFamilyOf(zone),
    style?.color ?? "#e0e0e0",
    style?.fontSize ?? 32
  )
}

/** Wrap `text` to `maxW` and draw each line; returns lines actually drawn. */
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  maxY: number,
  lineHeight: number
): void {
  const words = text.split(/\s+/)
  let line = ""
  let curY = y
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, curY)
      line = word
      curY += lineHeight
      if (curY + lineHeight > maxY) return
    } else {
      line = test
    }
  }
  if (line && curY + lineHeight <= maxY) ctx.fillText(line, x, curY)
}

function drawTimerZone(
  ctx: CanvasRenderingContext2D,
  zone: StageZone,
  timer: StageTimer | null,
  now: Date
) {
  ctx.fillStyle = "rgba(0,0,0,0.2)"
  drawRoundedRect(ctx, zone.x, zone.y, zone.width, zone.height, BORDER_RADIUS)
  ctx.fill()

  const fontFamily = fontFamilyOf(zone)
  // Prefer the countdown's own label; fall back to the zone's header label.
  const label = timer?.timer.label ?? zone.label
  let headerH = 0
  if (zone.showHeader && label) {
    drawZoneHeader(ctx, zone.x, zone.y, zone.width, label, fontFamily)
    headerH = HEADER_H
  }

  // Derive time + colour from the shared countdown math so the stage timer
  // stays byte-for-byte in step with the operator preview and audience overlay:
  // pause freezes it, clock-mode counts to its target, and warn/danger colours
  // and the display format come straight off the timer.
  const remaining = timer
    ? computeRemainingSeconds(timer.countdown, now.getTime())
    : null
  const text =
    timer && remaining != null
      ? formatCountdownTime(
          remaining,
          timer.timer.format,
          timer.timer.endAction === "overtime"
        )
      : "--:--"
  const color =
    timer && remaining != null
      ? resolveTimeColor(remaining, timer.timer)
      : (zone.text?.color ?? "#e0e0e0")

  const bodyH = zone.height - headerH
  ctx.font = `700 ${Math.round(bodyH * 0.5)}px ${fontFamily}, sans-serif`
  ctx.fillStyle = color
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(text, zone.x + zone.width / 2, zone.y + headerH + bodyH / 2)
}

function drawMessageZone(
  ctx: CanvasRenderingContext2D,
  zone: StageZone,
  message: string
) {
  // Stage messages are attention cues (from operator alerts): amber panel,
  // large centred text.
  ctx.fillStyle = "rgba(180,83,9,0.35)"
  drawRoundedRect(ctx, zone.x, zone.y, zone.width, zone.height, BORDER_RADIUS)
  ctx.fill()

  const fontFamily = fontFamilyOf(zone)
  const fontSize = zone.text?.fontSize ?? 32
  ctx.font = `700 ${fontSize}px ${fontFamily}, sans-serif`
  ctx.fillStyle = "#fbbf24"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(
    message,
    zone.x + zone.width / 2,
    zone.y + zone.height / 2,
    zone.width - 32
  )
}

function drawAnnouncementZone(
  ctx: CanvasRenderingContext2D,
  zone: StageZone,
  announcement: string
) {
  ctx.fillStyle = "rgba(0,0,0,0.2)"
  drawRoundedRect(ctx, zone.x, zone.y, zone.width, zone.height, BORDER_RADIUS)
  ctx.fill()

  const fontFamily = fontFamilyOf(zone)
  const fontSize = Math.round((zone.text?.fontSize ?? 32) * 0.6)
  ctx.font = `400 ${fontSize}px ${fontFamily}, sans-serif`
  ctx.fillStyle = "rgba(255,255,255,0.5)"
  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  ctx.fillText(zone.label ?? "ANNOUNCEMENT", zone.x + 16, zone.y + 12)

  ctx.font = `400 ${fontSize}px ${fontFamily}, sans-serif`
  ctx.fillStyle = zone.text?.color ?? "#e0e0e0"
  drawWrappedText(
    ctx,
    announcement,
    zone.x + 16,
    zone.y + 12 + fontSize + 8,
    zone.width - 32,
    zone.y + zone.height - 8,
    fontSize * 1.5
  )
}

function drawPlaylistZone(
  ctx: CanvasRenderingContext2D,
  zone: StageZone,
  items: string[]
) {
  ctx.fillStyle = "rgba(0,0,0,0.2)"
  drawRoundedRect(ctx, zone.x, zone.y, zone.width, zone.height, BORDER_RADIUS)
  ctx.fill()

  const fontFamily = fontFamilyOf(zone)
  const fontSize = Math.round((zone.text?.fontSize ?? 32) * 0.55)
  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  ctx.font = `600 ${fontSize}px ${fontFamily}, sans-serif`
  ctx.fillStyle = "rgba(255,255,255,0.5)"
  ctx.fillText(zone.label ?? "PLAYLIST", zone.x + 16, zone.y + 12)

  const lineHeight = fontSize * 1.6
  let curY = zone.y + 12 + fontSize + 10
  const maxY = zone.y + zone.height - 8
  ctx.font = `400 ${fontSize}px ${fontFamily}, sans-serif`
  for (let i = 0; i < items.length; i++) {
    if (curY + lineHeight > maxY) break
    // First upcoming item is the "on deck" one — brighten it.
    ctx.fillStyle =
      i === 0 ? (zone.text?.color ?? "#e0e0e0") : "rgba(255,255,255,0.55)"
    ctx.fillText(items[i], zone.x + 16, curY, zone.width - 32)
    curY += lineHeight
  }
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  background: Background
) {
  // Phase 2 ships solid backgrounds (what the migrated built-ins use). Gradient
  // / image / video stage backgrounds are a later phase; fall back to the solid
  // colour (or black for transparent) so nothing renders as a blank frame.
  if (background.type === "transparent") {
    ctx.fillStyle = "#000"
  } else {
    ctx.fillStyle = background.color
  }
  ctx.fillRect(0, 0, w, h)
}

export function drawStageDisplay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: StageDisplayData,
  imageCache: Map<string, HTMLImageElement>,
  videoCache: Map<string, HTMLVideoElement>
): void {
  const { layout } = data

  // Background fills the whole real surface (before the reflow transform).
  drawBackground(ctx, w, h, layout.background)

  // Reflow to the output surface with a single uniform scale: draw the whole
  // stage in an aspect-corrected "virtual" canvas (surface ÷ scale) so every
  // fixed constant (header height, label fonts, insets) scales automatically,
  // while zones are re-anchored for the extra space on non-16:9 surfaces. On a
  // 16:9 surface this is exactly the old uniform scaling; at 1920×1080 it is a
  // no-op (byte-identical).
  const scale = surfaceFontScale(w, h)
  const authored = layout.resolution ?? STAGE_RESOLUTION
  ctx.save()
  if (scale !== 1) ctx.scale(scale, scale)
  const virtual = { width: w / scale, height: h / scale }

  const byId = new Map(
    layout.zones.map((z) => [z.id, projectBoxToSurface(z, authored, virtual)])
  )
  const order =
    layout.layerOrder.length > 0
      ? layout.layerOrder
      : layout.zones.map((z) => z.id)

  // A shared clock instant so every clock zone in one frame agrees.
  const now = new Date()

  for (const id of order) {
    const zone = byId.get(id)
    if (!zone || !zone.visible) continue

    switch (zone.source) {
      case "current":
        drawPreviewZone(
          ctx,
          zone,
          data.currentTheme,
          data.currentVerse,
          data.currentSlide,
          imageCache,
          videoCache,
          {
            bgAlpha: "rgba(0,0,0,0.3)",
            isLive: true,
            emptyLabel: "No content",
            emptyFontSize: 16,
            emptyColor: "rgba(255,255,255,0.3)",
          }
        )
        break
      case "clock":
        drawClockZone(ctx, zone, now)
        break
      case "notes":
        if (data.notes) drawNotesZone(ctx, zone, data.notes)
        else drawPlaceholder(ctx, zone, zone.label ?? zone.name)
        break
      case "timer":
        drawTimerZone(ctx, zone, data.timer ?? null, now)
        break
      case "messages":
        if (data.message) drawMessageZone(ctx, zone, data.message)
        else drawPlaceholder(ctx, zone, zone.label ?? zone.name)
        break
      case "announcement":
        if (data.announcement)
          drawAnnouncementZone(ctx, zone, data.announcement)
        else drawPlaceholder(ctx, zone, zone.label ?? zone.name)
        break
      case "playlist":
        if (data.playlist && data.playlist.length > 0)
          drawPlaylistZone(ctx, zone, data.playlist)
        else drawPlaceholder(ctx, zone, zone.label ?? zone.name)
        break
      default:
        // `spacer` (and any future source) renders a labelled placeholder so a
        // layout referencing it is still legible in the designer and monitor.
        drawPlaceholder(ctx, zone, zone.label ?? zone.name)
        break
    }
  }

  ctx.restore()
}
