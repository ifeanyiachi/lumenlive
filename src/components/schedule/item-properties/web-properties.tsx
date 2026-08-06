import { useEffect, useMemo, useCallback } from "react"
import {
  GlobeIcon,
  ExternalLinkIcon,
  PlayIcon,
  PauseIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useScheduleStore } from "@/stores/schedule-store"
import { useWebStore } from "@/stores/web-store"
import { useAppStore } from "@/stores/app-store"
import { isYouTubeUrl, extractVideoId } from "@/lib/youtube"
import { useYouTubePlayer } from "@/hooks/use-youtube-player"
import { cn } from "@/lib/utils"
import type { WebScheduleItem, MediaEndAction } from "@/types/schedule"
import { formatTimecode, END_ACTIONS } from "./shared"
import { TrimPoint } from "./trim-point"

/**
 * Off-air prep player for a YouTube schedule item. Mirrors {@link MediaTrimEditor}
 * but drives the YouTube IFrame Player API (via {@link useYouTubePlayer}) instead
 * of a `<video>`: scrub to find cue times, set the "Start at" entry point, mark
 * cue points, and — for a recorded VOD — choose an end action / skip the
 * end-screen grid. It does NOT touch the live overlay; it edits the schedule
 * item, which is honored when the item goes live.
 *
 * Live vs VOD (the church use cases): a *live* stream enters at a DVR offset and
 * has no meaningful end action, so those controls are hidden; a *VOD* is a
 * recorded past service with an absolute timeline, In/Out trim, and end action.
 */
function WebPlaybackEditor({
  item,
  scheduleId,
}: {
  item: WebScheduleItem
  scheduleId: string
}) {
  const containerId = useMemo(() => `yt-prep-${item.id}`, [item.id])
  const { state, loadVideo, togglePlay, seekTo } = useYouTubePlayer(containerId)

  const update = useCallback(
    (updates: Partial<WebScheduleItem>) => {
      useScheduleStore.getState().updateItem(scheduleId, item.id, updates)
    },
    [scheduleId, item.id]
  )

  // (Re)load whenever the video changes. The prep player stays muted and paused
  // until the operator scrubs — it is a scouting tool, not the live output.
  useEffect(() => {
    if (item.videoId) void loadVideo(item.videoId, false)
  }, [item.videoId, loadVideo])

  const { currentTime, duration, isPlaying, isReady, isLoading } = state
  const isLive = item.isLive ?? false

  return (
    <FieldGroup label="Playback">
      <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-2">
        {/* Player surface — the YT API replaces this div with an iframe. */}
        <div className="relative aspect-video w-full overflow-hidden rounded bg-black">
          <div id={containerId} className="size-full" />
          {!isReady && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="text-[0.625rem] text-muted-foreground">
                {isLoading ? "Loading player…" : "No video"}
              </span>
            </div>
          )}
        </div>

        {/* Live / VOD toggle — auto-detected on the URL, overridable here. */}
        <label className="flex items-center justify-between">
          <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            Live stream
          </span>
          <Switch
            checked={isLive}
            onCheckedChange={(live) => update({ isLive: live })}
            className="scale-75"
          />
        </label>
        <p className="-mt-1 text-[0.625rem] text-muted-foreground">
          {isLive
            ? "Enters at a DVR offset; use Jump to Live on air. Markers are DVR offsets."
            : "Recorded service (VOD): absolute timeline with In/Out trim and end action."}
        </p>

        {/* Transport */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={togglePlay}
            disabled={!isReady}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
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
            value={Math.min(currentTime, duration || 0)}
            disabled={!isReady}
            onChange={(e) => seekTo(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer accent-primary disabled:opacity-50"
          />
          <span className="shrink-0 text-[0.625rem] text-muted-foreground tabular-nums">
            {formatTimecode(currentTime)} / {formatTimecode(duration)}
          </span>
        </div>

        {/* Start at (In) + Out trim (VOD only) */}
        <div
          className={cn("grid gap-2", isLive ? "grid-cols-1" : "grid-cols-2")}
        >
          <TrimPoint
            label={isLive ? "Start at" : "In"}
            value={item.startTime}
            fallback={isLive ? "Live edge" : "0:00"}
            onSet={() => update({ startTime: currentTime })}
            onClear={() => update({ startTime: undefined })}
          />
          {!isLive && (
            <TrimPoint
              label="Out"
              value={item.endTime}
              fallback="End"
              onSet={() => update({ endTime: currentTime })}
              onClear={() => update({ endTime: undefined })}
            />
          )}
        </div>

        {/* End action (VOD only — a live stream has no end to act on). */}
        {!isLive && (
          <FieldGroup label="When finished">
            <select
              className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
              value={item.endAction ?? "hold"}
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
        )}

        {/* Cue markers */}
        <FieldGroup
          label={isLive ? "Cue markers (DVR offsets)" : "Cue markers"}
        >
          <div className="flex flex-col gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={!isReady}
              onClick={() => {
                const existing = item.markers ?? []
                const marker = {
                  id: crypto.randomUUID(),
                  label: `Cue ${existing.length + 1}`,
                  time: currentTime,
                }
                update({
                  markers: [...existing, marker].sort(
                    (a, b) => a.time - b.time
                  ),
                })
              }}
            >
              <PlusIcon className="size-3.5" />
              Add marker at {formatTimecode(currentTime)}
            </Button>

            {(item.markers ?? [])
              .slice()
              .sort((a, b) => a.time - b.time)
              .map((m) => (
                <div key={m.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    className="shrink-0 rounded bg-muted px-1.5 py-1 text-[0.625rem] text-muted-foreground tabular-nums hover:text-foreground"
                    onClick={() => seekTo(m.time)}
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

export function WebProperties({
  item,
  scheduleId,
}: {
  item: WebScheduleItem
  scheduleId: string
}) {
  const update = (updates: Partial<WebScheduleItem>) => {
    useScheduleStore.getState().updateItem(scheduleId, item.id, updates)
  }

  const handleUrlChange = (url: string) => {
    const yt = isYouTubeUrl(url)
    const vid = yt ? (extractVideoId(url) ?? undefined) : undefined
    update({
      url,
      isYouTube: yt,
      videoId: vid,
      label: url
        ? yt
          ? `YouTube: ${vid}`
          : (() => {
              try {
                return new URL(url).hostname
              } catch {
                return "Web Page"
              }
            })()
        : "Web Page",
    })
  }

  const handleOpenInWebTab = () => {
    if (!item.url) return
    useWebStore.getState().navigate(item.url)
    useAppStore.getState().setView("youtube")
  }

  return (
    <>
      <div className="flex items-center gap-2 rounded-md bg-sky-500/10 p-2">
        <GlobeIcon className="size-3.5 text-sky-400" />
        <span className="text-xs font-medium text-sky-400">
          {item.isYouTube ? "YouTube Video" : "Web Page"}
        </span>
      </div>

      <FieldGroup label="URL">
        <Input
          type="url"
          className="h-7 text-xs"
          value={item.url}
          placeholder="https://..."
          onChange={(e) => handleUrlChange(e.target.value)}
        />
      </FieldGroup>

      <div className="flex flex-col gap-2">
        {item.isYouTube && (
          <>
            <label className="flex items-center justify-between">
              <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
                Autoplay
              </span>
              <Switch
                checked={item.autoplay}
                onCheckedChange={(autoplay) => update({ autoplay })}
                className="scale-75"
              />
            </label>
          </>
        )}
      </div>

      {item.isYouTube && item.videoId && (
        <WebPlaybackEditor item={item} scheduleId={scheduleId} />
      )}

      {item.url && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={handleOpenInWebTab}
        >
          <ExternalLinkIcon className="size-3" />
          Open in Web tab
        </Button>
      )}
    </>
  )
}
