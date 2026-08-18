import { useState } from "react"
import {
  TimerIcon,
  PlayIcon,
  PauseIcon,
  SquareIcon,
  PlusIcon,
  MinusIcon,
  TrashIcon,
  PencilIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
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
import type { CountdownTimer } from "@/types/alert"
import { cn } from "@/lib/utils"
import { formatTimerDuration } from "@/lib/countdown/timer"
import { TimerEditor } from "@/components/countdown/countdown-config"

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
                  : formatTimerDuration(timer.durationSeconds)
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
                  <div className="min-w-0 flex-1 text-left text-foreground">
                    <span className="truncate">{timer.label}</span>
                    <span className="ml-1 text-muted-foreground">
                      ({durationLabel})
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-5"
                      onClick={() => {
                        setEditingTimer(timer)
                        setEditorOpen(true)
                      }}
                      title="Edit"
                    >
                      <PencilIcon className="size-2.5" />
                    </Button>
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
                  styleMode: "custom",
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
        <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto">
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
