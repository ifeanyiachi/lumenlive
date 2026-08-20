import { useState, useEffect } from "react"
import { XIcon, PauseIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCountdownStore } from "@/stores/countdown-store"
import { useThemesStore } from "@/stores/themes"
import { buildThemeRegistry } from "@/lib/theme/registry"
import { resolveCountdownTheme } from "@/lib/theme/resolve"
import { countdownThemeColors } from "@/lib/countdown/theme-colors"
import {
  computeRemainingSeconds,
  formatCountdownTime,
  resolveTimeColor,
} from "@/lib/countdown/timer"

function CountdownDisplay({ countdownId }: { countdownId: string }) {
  // `now` is advanced by the interval below rather than read from Date.now()
  // during render, keeping render pure (a fresh Date.now() each render is
  // non-idempotent). The lazy initializer runs once, off the render path.
  const [now, setNow] = useState(() => Date.now())
  const activeCountdowns = useCountdownStore((s) => s.activeCountdowns)
  const timers = useCountdownStore((s) => s.timers)
  const customThemes = useThemesStore((s) => s.customThemes)

  const countdown = activeCountdowns.find((c) => c.id === countdownId)
  const timer = countdown
    ? timers.find((t) => t.id === countdown.timerId)
    : null

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [])

  if (!countdown || !timer) return null

  // The operator pill is a compact preview — it can't reproduce the full themed
  // composition (that renders on the broadcast output), so a themed timer just
  // borrows the theme's background/text colours to stay on-brand.
  const theme = resolveCountdownTheme(timer, buildThemeRegistry(customThemes))
  const colors = theme ? countdownThemeColors(theme) : null
  const bgColor = colors?.background ?? timer.backgroundColor
  const baseTextColor = colors?.text ?? timer.textColor

  const remaining = computeRemainingSeconds(countdown, now)
  const overtime = timer.endAction === "overtime"
  const isExpired = remaining <= 0
  const flashing = isExpired && timer.endAction === "flash"
  const paused = countdown.state === "paused"
  const timeColor = resolveTimeColor(remaining, {
    textColor: baseTextColor,
    warnSeconds: timer.warnSeconds,
    dangerSeconds: timer.dangerSeconds,
  })

  const timeText = formatCountdownTime(remaining, timer.format, overtime)

  return (
    <div
      role="timer"
      aria-label={`${timer.label}: ${timeText}${paused ? ", paused" : ""}`}
      className="pointer-events-auto flex items-center gap-2 rounded-lg px-3 py-1.5"
      style={{
        backgroundColor: bgColor,
        color: baseTextColor,
        opacity: flashing ? Math.abs(Math.sin(now / 300)) * 0.5 + 0.5 : 1,
      }}
    >
      {timer.showLabel && (
        <span className="text-xs opacity-70">{timer.label}</span>
      )}
      {paused && <PauseIcon className="size-3 opacity-70" />}
      <span
        className="font-mono text-sm font-bold tabular-nums"
        style={{ color: timeColor }}
      >
        {timeText}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss countdown"
        className="size-5 shrink-0 text-current hover:bg-white/20"
        onClick={() =>
          useCountdownStore.getState().dismissCountdown(countdown.id)
        }
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  )
}

export function CountdownOverlay() {
  const activeCountdowns = useCountdownStore((s) => s.activeCountdowns)

  if (activeCountdowns.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 bottom-14 z-40 flex flex-col gap-1">
      {activeCountdowns.map((c) => (
        <CountdownDisplay key={c.id} countdownId={c.id} />
      ))}
    </div>
  )
}
