import { useState } from "react"
import {
  TimerIcon,
  PlayIcon,
  PauseIcon,
  SquareIcon,
  PlusIcon,
  MinusIcon,
  TrashIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCountdownStore } from "@/stores/countdown-store"
import type { CountdownTimer, CountdownFormat } from "@/types/alert"
import { cn } from "@/lib/utils"

/** Quick-pick durations (seconds) offered in the editor. */
const DURATION_PRESETS = [60, 300, 600, 900, 1200]

function TimerEditor({
  timer,
  onSave,
  onCancel,
}: {
  timer: CountdownTimer
  onSave: (timer: CountdownTimer) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(timer)
  const minutes = Math.floor(draft.durationSeconds / 60)
  const seconds = draft.durationSeconds % 60

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          Label
        </span>
        <Input
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          className="h-7 text-xs"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          Mode
        </span>
        <Select
          value={draft.mode}
          onValueChange={(value) =>
            setDraft({ ...draft, mode: value as CountdownTimer["mode"] })
          }
        >
          <SelectTrigger size="sm" className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="duration">Count down a duration</SelectItem>
            <SelectItem value="clock">Count down to a clock time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {draft.mode === "duration" ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            Duration
          </span>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={minutes}
              min={0}
              max={999}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  durationSeconds: Number(e.target.value) * 60 + seconds,
                })
              }
              className="h-7 w-16 text-xs"
            />
            <span className="text-xs text-muted-foreground">m</span>
            <Input
              type="number"
              value={seconds}
              min={0}
              max={59}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  durationSeconds: minutes * 60 + Number(e.target.value),
                })
              }
              className="h-7 w-16 text-xs"
            />
            <span className="text-xs text-muted-foreground">s</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {DURATION_PRESETS.map((secs) => (
              <button
                key={secs}
                type="button"
                onClick={() => setDraft({ ...draft, durationSeconds: secs })}
                className={cn(
                  "rounded border border-border px-1.5 py-0.5 text-[0.625rem] text-muted-foreground transition-colors hover:bg-accent",
                  draft.durationSeconds === secs &&
                    "border-emerald-500/50 bg-emerald-500/10 text-foreground"
                )}
              >
                {secs / 60}m
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            Target time
          </span>
          <Input
            type="time"
            value={draft.targetTime ?? "10:00"}
            onChange={(e) => setDraft({ ...draft, targetTime: e.target.value })}
            className="h-7 w-28 text-xs"
          />
          <span className="text-[0.625rem] text-muted-foreground">
            Counts down to this time today (or tomorrow if already past).
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          Format
        </span>
        <Select
          value={draft.format}
          onValueChange={(value) =>
            setDraft({ ...draft, format: value as CountdownFormat })
          }
        >
          <SelectTrigger size="sm" className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mm:ss">MM:SS</SelectItem>
            <SelectItem value="hh:mm:ss">HH:MM:SS</SelectItem>
            <SelectItem value="minutes">Minutes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          Position
        </span>
        <Select
          value={draft.position}
          onValueChange={(value) =>
            setDraft({
              ...draft,
              position: value as CountdownTimer["position"],
            })
          }
        >
          <SelectTrigger size="sm" className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fullscreen">
              Full screen (starting soon)
            </SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="top-left">Top Left</SelectItem>
            <SelectItem value="top-center">Top Center</SelectItem>
            <SelectItem value="top-right">Top Right</SelectItem>
            <SelectItem value="bottom-left">Bottom Left</SelectItem>
            <SelectItem value="bottom-center">Bottom Center</SelectItem>
            <SelectItem value="bottom-right">Bottom Right</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          Appearance
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[0.6875rem] text-muted-foreground">BG</span>
          <input
            type="color"
            value={
              draft.backgroundColor.startsWith("rgba")
                ? "#000000"
                : draft.backgroundColor
            }
            onChange={(e) =>
              setDraft({ ...draft, backgroundColor: e.target.value })
            }
            className="size-6 cursor-pointer rounded border border-border"
          />
          <span className="text-[0.6875rem] text-muted-foreground">Text</span>
          <input
            type="color"
            value={draft.textColor}
            onChange={(e) => setDraft({ ...draft, textColor: e.target.value })}
            className="size-6 cursor-pointer rounded border border-border"
          />
          <Input
            type="number"
            value={draft.fontSize}
            min={16}
            max={200}
            onChange={(e) =>
              setDraft({ ...draft, fontSize: Number(e.target.value) })
            }
            className="h-7 w-14 text-xs"
            title="Font size"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          Urgency colors
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[0.6875rem] text-amber-500">Warn ≤</span>
          <Input
            type="number"
            min={0}
            placeholder="off"
            value={draft.warnSeconds ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                warnSeconds:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            className="h-7 w-16 text-xs"
          />
          <span className="text-[0.6875rem] text-red-500">Danger ≤</span>
          <Input
            type="number"
            min={0}
            placeholder="off"
            value={draft.dangerSeconds ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                dangerSeconds:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            className="h-7 w-16 text-xs"
          />
          <span className="text-[0.6875rem] text-muted-foreground">s</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          When Finished
        </span>
        <Select
          value={draft.endAction}
          onValueChange={(value) =>
            setDraft({
              ...draft,
              endAction: value as CountdownTimer["endAction"],
            })
          }
        >
          <SelectTrigger size="sm" className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="flash">Flash</SelectItem>
            <SelectItem value="overtime">Count up (overtime)</SelectItem>
            <SelectItem value="hide">Hide</SelectItem>
            <SelectItem value="none">Stay</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={draft.showLabel}
            onChange={(e) =>
              setDraft({ ...draft, showLabel: e.target.checked })
            }
          />
          Show label
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(draft)}>
          Save
        </Button>
      </div>
    </div>
  )
}

export function CountdownTrigger() {
  const timers = useCountdownStore((s) => s.timers)
  const activeCountdowns = useCountdownStore((s) => s.activeCountdowns)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTimer, setEditingTimer] = useState<CountdownTimer | null>(null)

  const hasActive = activeCountdowns.length > 0

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Countdown Timer"
            data-tour="countdown"
            className="relative"
          >
            <TimerIcon className="size-3.5" />
            {hasActive && (
              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-500" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">
                Countdown Timer
              </span>
              {hasActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[0.625rem] text-red-400"
                  onClick={() => useCountdownStore.getState().dismissAll()}
                >
                  Stop All
                </Button>
              )}
            </div>
          </div>

          <div className="flex max-h-72 flex-col overflow-y-auto p-1.5">
            {timers.map((timer) => {
              const active = activeCountdowns.find(
                (c) => c.timerId === timer.id
              )
              const durationLabel =
                timer.mode === "clock"
                  ? (timer.targetTime ?? "--:--")
                  : `${Math.floor(timer.durationSeconds / 60)}:${String(
                      timer.durationSeconds % 60
                    ).padStart(2, "0")}`
              const paused = active?.state === "paused"
              return (
                <div
                  key={timer.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent",
                    active && "bg-emerald-500/10"
                  )}
                >
                  <TimerIcon className="size-3 shrink-0 text-muted-foreground" />
                  <button
                    type="button"
                    className="flex-1 text-left text-foreground"
                    onClick={() => {
                      setEditingTimer(timer)
                      setEditorOpen(true)
                    }}
                  >
                    <span className="truncate">{timer.label}</span>
                    <span className="ml-1 text-muted-foreground">
                      ({durationLabel})
                    </span>
                  </button>
                  <div className="flex items-center gap-0.5">
                    {active ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-5"
                          onClick={() =>
                            useCountdownStore
                              .getState()
                              .adjustCountdown(active.id, -60)
                          }
                          title="Subtract 1 minute"
                        >
                          <MinusIcon className="size-2.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-5"
                          onClick={() =>
                            useCountdownStore
                              .getState()
                              .adjustCountdown(active.id, 60)
                          }
                          title="Add 1 minute"
                        >
                          <PlusIcon className="size-2.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-5"
                          onClick={() => {
                            const store = useCountdownStore.getState()
                            if (paused) store.resumeCountdown(active.id)
                            else store.pauseCountdown(active.id)
                          }}
                          title={paused ? "Resume" : "Pause"}
                        >
                          {paused ? (
                            <PlayIcon className="size-2.5" />
                          ) : (
                            <PauseIcon className="size-2.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-5"
                          onClick={() =>
                            useCountdownStore
                              .getState()
                              .dismissCountdown(active.id)
                          }
                          title="Stop"
                        >
                          <SquareIcon className="size-2.5" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-5"
                        onClick={() =>
                          useCountdownStore.getState().startCountdown(timer.id)
                        }
                        title="Start"
                      >
                        <PlayIcon className="size-2.5" />
                      </Button>
                    )}
                    {timer.id !== "default-countdown" && !active && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-5 text-destructive"
                        onClick={() =>
                          useCountdownStore.getState().deleteTimer(timer.id)
                        }
                        title="Delete"
                      >
                        <TrashIcon className="size-2.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="border-t border-border p-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs text-muted-foreground"
              onClick={() => {
                setEditingTimer({
                  id: crypto.randomUUID(),
                  label: "New Timer",
                  mode: "duration",
                  durationSeconds: 300,
                  targetTime: "10:00",
                  format: "mm:ss",
                  backgroundColor: "rgba(0,0,0,0.7)",
                  textColor: "#ffffff",
                  fontSize: 64,
                  fontFamily: "Inter",
                  position: "center",
                  showLabel: true,
                  endAction: "flash",
                })
                setEditorOpen(true)
              }}
            >
              <PlusIcon className="mr-1.5 size-3" />
              New Timer
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {editingTimer && timers.some((t) => t.id === editingTimer.id)
                ? "Edit Timer"
                : "New Timer"}
            </DialogTitle>
          </DialogHeader>
          {editingTimer && (
            <TimerEditor
              timer={editingTimer}
              onSave={(updated) => {
                const store = useCountdownStore.getState()
                if (store.timers.some((t) => t.id === updated.id)) {
                  store.updateTimer(updated.id, updated)
                } else {
                  store.createTimer(updated)
                }
                setEditorOpen(false)
              }}
              onCancel={() => setEditorOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
