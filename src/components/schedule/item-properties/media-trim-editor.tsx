import { useState, useRef, useMemo, useCallback } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import { PlayIcon, PauseIcon, PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useScheduleStore } from "@/stores/schedule-store"
import type { MediaScheduleItem, MediaEndAction } from "@/types/schedule"
import type { MediaAsset } from "@/types/media"
import { formatTimecode, END_ACTIONS } from "./shared"
import { TrimPoint } from "./trim-point"

export function MediaTrimEditor({
  item,
  scheduleId,
  asset,
}: {
  item: MediaScheduleItem
  scheduleId: string
  asset: MediaAsset
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)

  const src = useMemo(() => {
    try {
      return convertFileSrc(asset.filePath)
    } catch {
      return asset.filePath
    }
  }, [asset.filePath])

  const isVideo = asset.type === "video"

  const update = useCallback(
    (updates: Partial<MediaScheduleItem>) => {
      useScheduleStore.getState().updateItem(scheduleId, item.id, updates)
    },
    [scheduleId, item.id]
  )

  const handleLoaded = useCallback(() => {
    const el = mediaRef.current
    if (!el) return
    setDuration(Number.isFinite(el.duration) ? el.duration : 0)
    if (item.trimStart) {
      try {
        el.currentTime = item.trimStart
      } catch {
        /* not seekable yet */
      }
    }
  }, [item.trimStart])

  const handleTime = useCallback(() => {
    const el = mediaRef.current
    if (el) setCurrent(el.currentTime)
  }, [])

  const togglePlay = useCallback(() => {
    const el = mediaRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }, [])

  const seek = useCallback((t: number) => {
    const el = mediaRef.current
    if (!el) return
    try {
      el.currentTime = t
    } catch {
      /* not seekable yet */
    }
    setCurrent(t)
  }, [])

  const setRef = useCallback((el: HTMLMediaElement | null) => {
    mediaRef.current = el
  }, [])

  return (
    <FieldGroup label="Trim & Playback">
      <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-2">
        {isVideo ? (
          <video
            ref={setRef}
            src={src}
            className="aspect-video w-full rounded bg-black"
            playsInline
            onLoadedMetadata={handleLoaded}
            onTimeUpdate={handleTime}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        ) : (
          <audio
            ref={setRef}
            src={src}
            className="w-full"
            onLoadedMetadata={handleLoaded}
            onTimeUpdate={handleTime}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        )}

        {/* Transport */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={togglePlay}
            title={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <PauseIcon className="size-3.5" />
            ) : (
              <PlayIcon className="size-3.5" />
            )}
          </Button>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.05}
            value={Math.min(current, duration || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer accent-primary"
          />
          <span className="shrink-0 text-[0.625rem] text-muted-foreground tabular-nums">
            {formatTimecode(current)} / {formatTimecode(duration)}
          </span>
        </div>

        {/* In / Out trim */}
        <div className="grid grid-cols-2 gap-2">
          <TrimPoint
            label="In"
            value={item.trimStart}
            fallback="0:00"
            onSet={() => update({ trimStart: current })}
            onClear={() => update({ trimStart: undefined })}
          />
          <TrimPoint
            label="Out"
            value={item.trimEnd}
            fallback="End"
            onSet={() => update({ trimEnd: current })}
            onClear={() => update({ trimEnd: undefined })}
          />
        </div>

        {/* Loop + End action */}
        <label className="flex items-center justify-between">
          <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            Loop
          </span>
          <Switch
            checked={item.loop ?? false}
            onCheckedChange={(loop) => update({ loop })}
            className="scale-75"
          />
        </label>

        <FieldGroup label="When finished">
          <select
            className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:opacity-50"
            value={item.endAction ?? "hold"}
            disabled={item.loop ?? false}
            onChange={(e) =>
              update({ endAction: e.target.value as MediaEndAction })
            }
          >
            {END_ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </FieldGroup>

        {/* Cue markers */}
        <FieldGroup label="Cue markers">
          <div className="flex flex-col gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                const existing = item.markers ?? []
                const marker = {
                  id: crypto.randomUUID(),
                  label: `Cue ${existing.length + 1}`,
                  time: current,
                }
                update({
                  markers: [...existing, marker].sort(
                    (a, b) => a.time - b.time
                  ),
                })
              }}
            >
              <PlusIcon className="size-3.5" />
              Add marker at {formatTimecode(current)}
            </Button>

            {(item.markers ?? [])
              .slice()
              .sort((a, b) => a.time - b.time)
              .map((m) => (
                <div key={m.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    className="shrink-0 rounded bg-muted px-1.5 py-1 text-[0.625rem] text-muted-foreground tabular-nums hover:text-foreground"
                    onClick={() => seek(m.time)}
                    title="Jump to marker"
                  >
                    {formatTimecode(m.time)}
                  </button>
                  <Input
                    className="h-7 flex-1 text-xs"
                    value={m.label}
                    onChange={(e) =>
                      update({
                        markers: (item.markers ?? []).map((mk) =>
                          mk.id === m.id ? { ...mk, label: e.target.value } : mk
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      update({
                        markers: (item.markers ?? []).filter(
                          (mk) => mk.id !== m.id
                        ),
                      })
                    }
                    title="Delete marker"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ))}
          </div>
        </FieldGroup>
      </div>
    </FieldGroup>
  )
}
