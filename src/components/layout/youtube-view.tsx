import { useState, useCallback, useRef, useEffect } from "react"
import {
  PlayIcon,
  PauseIcon,
  StarIcon,
  StarOffIcon,
  TrashIcon,
  ListPlusIcon,
  Volume2Icon,
  VolumeXIcon,
  CastIcon,
  LoaderIcon,
  LinkIcon,
} from "lucide-react"
import { TransportBar } from "@/components/controls/transport-bar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useWebStore } from "@/stores/web-store"
import { useScheduleStore } from "@/stores/schedule-store"
import { presentWebUrl } from "@/hooks/use-broadcast"
import { isYouTubeUrl, extractVideoId, getThumbnailUrl } from "@/lib/youtube"
import { useYouTubePlayer } from "@/hooks/use-youtube-player"
import type { WebScheduleItem } from "@/types/schedule"

const PLAYER_CONTAINER_ID = "lumenlive-yt-player"

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function YouTubeView() {
  const bookmarks = useWebStore((s) => s.bookmarks)
  const activeScheduleId = useScheduleStore((s) => s.activeScheduleId)

  const [urlInput, setUrlInput] = useState("")
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)
  const [activeUrl, setActiveUrl] = useState("")
  const [error, setError] = useState("")
  const seekBarRef = useRef<HTMLDivElement>(null)
  const [isSeeking, setIsSeeking] = useState(false)

  const {
    state: player,
    loadVideo,
    togglePlay,
    seekTo,
    setVolume,
    toggleMute,
  } = useYouTubePlayer(PLAYER_CONTAINER_ID)

  const isBookmarked = activeUrl
    ? bookmarks.some((b) => b.url === activeUrl)
    : false

  const handleLoadUrl = useCallback(() => {
    const url = urlInput.trim()
    if (!url) return

    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`

    if (!isYouTubeUrl(normalized)) {
      setError("Please paste a YouTube URL")
      return
    }

    const videoId = extractVideoId(normalized)
    if (!videoId) {
      setError("Could not extract video ID")
      return
    }

    setError("")
    setActiveVideoId(videoId)
    setActiveUrl(normalized)
    void loadVideo(videoId, true)
  }, [urlInput, loadVideo])

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    handleLoadUrl()
  }

  const handleLoadBookmark = useCallback(
    (url: string, videoId: string) => {
      setUrlInput(url)
      setActiveVideoId(videoId)
      setActiveUrl(url)
      setError("")
      void loadVideo(videoId, true)
    },
    [loadVideo]
  )

  const handleToggleBookmark = () => {
    if (!activeUrl || !activeVideoId) return
    if (isBookmarked) {
      const bm = bookmarks.find((b) => b.url === activeUrl)
      if (bm) useWebStore.getState().removeBookmark(bm.id)
      toast("Video removed from saved")
    } else {
      const label = player.videoTitle || `Video: ${activeVideoId}`
      useWebStore.getState().addBookmark(activeUrl, label, true, activeVideoId)
      toast.success("Video saved")
    }
  }

  const handleGoLive = () => {
    if (!activeUrl) return
    void presentWebUrl(activeUrl)
    toast.success("YouTube sent to live output")
  }

  const handleAddToSchedule = () => {
    if (!activeUrl || !activeScheduleId || !activeVideoId) return
    const item: WebScheduleItem = {
      id: crypto.randomUUID(),
      type: "web",
      label: player.videoTitle || `YouTube: ${activeVideoId}`,
      order: 0,
      url: activeUrl,
      autoplay: true,
      isYouTube: true,
      videoId: activeVideoId,
    }
    if (useScheduleStore.getState().addItem(activeScheduleId, item)) {
      toast.success("Added to schedule")
    } else {
      toast.info("Already in the schedule")
    }
  }

  const handleSeekBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!player.duration) return
      const rect = e.currentTarget.getBoundingClientRect()
      const fraction = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      )
      seekTo(fraction * player.duration)
    },
    [player.duration, seekTo]
  )

  const handleSeekBarDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!player.duration) return
      setIsSeeking(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [player.duration]
  )

  const handleSeekBarMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isSeeking || !player.duration) return
      const rect = e.currentTarget.getBoundingClientRect()
      const fraction = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      )
      seekTo(fraction * player.duration)
    },
    [isSeeking, player.duration, seekTo]
  )

  const handleSeekBarUp = useCallback(() => {
    setIsSeeking(false)
  }, [])

  const progress =
    player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0

  // Update bookmark label with video title once loaded
  useEffect(() => {
    if (!player.videoTitle || !activeUrl) return
    const bm = bookmarks.find(
      (b) => b.url === activeUrl && b.label.startsWith("Video: ")
    )
    if (bm) {
      useWebStore.getState().updateBookmark(bm.id, { label: player.videoTitle })
    }
  }, [player.videoTitle, activeUrl, bookmarks])

  return (
    <div
      style={{
        position: "fixed",
        inset: "0px",
        display: "grid",
        gridTemplateRows: "56px minmax(0, 1fr)",
        overflow: "hidden",
      }}
      className="bg-background"
    >
      <div className="col-span-2">
        <TransportBar />
      </div>

      <div
        className="col-span-2 min-h-0"
        style={{
          display: "grid",
          gridTemplateColumns: "280px minmax(0, 1fr)",
          gap: "12px",
          padding: "12px",
          overflow: "hidden",
        }}
      >
        {/* Saved Videos sidebar */}
        <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold text-foreground">
              Saved Videos
            </span>
            <span className="text-[10px] text-muted-foreground">
              {bookmarks.length}
            </span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-1 p-1.5">
              {bookmarks.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <StarIcon className="size-6 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">
                    Save YouTube videos for quick access
                  </p>
                </div>
              )}
              {bookmarks.map((bm) => (
                <div
                  key={bm.id}
                  className={cn(
                    "group flex cursor-pointer gap-2 rounded-md p-1.5 transition-colors",
                    activeUrl === bm.url
                      ? "bg-primary/10 ring-1 ring-primary/20"
                      : "hover:bg-accent"
                  )}
                  onClick={() => {
                    if (bm.videoId) handleLoadBookmark(bm.url, bm.videoId)
                  }}
                >
                  {bm.videoId ? (
                    <img
                      src={getThumbnailUrl(bm.videoId)}
                      alt=""
                      className="size-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex size-12 shrink-0 items-center justify-center rounded bg-muted">
                      <PlayIcon className="size-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">
                      {bm.label}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {bm.videoId}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-5 shrink-0 self-start opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      useWebStore.getState().removeBookmark(bm.id)
                      toast("Video removed")
                    }}
                    title="Remove"
                  >
                    <TrashIcon className="size-2.5" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Player area */}
        <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
          {/* URL input */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-b border-border px-3 py-2"
          >
            <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              type="text"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value)
                setError("")
              }}
              placeholder="Paste a YouTube URL..."
              className="h-7 min-w-0 flex-1 text-xs"
            />
            <Button
              type="submit"
              size="sm"
              className="h-7 px-3 text-xs"
              disabled={!urlInput.trim()}
            >
              Load
            </Button>
          </form>

          {error && (
            <div className="border-b border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Player embed */}
          <div className="relative min-h-0 flex-1 bg-black">
            {activeVideoId ? (
              <>
                <div id={PLAYER_CONTAINER_ID} className="size-full" />
                {player.isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <LoaderIcon className="size-8 animate-spin text-white/60" />
                  </div>
                )}
              </>
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <div className="flex size-16 items-center justify-center rounded-full bg-red-500/10">
                  <PlayIcon className="size-8 text-red-500/40" />
                </div>
                <p className="text-sm">Paste a YouTube URL to start</p>
                <p className="text-xs text-muted-foreground/60">
                  Supports youtube.com/watch, youtu.be, and shorts links
                </p>
              </div>
            )}
          </div>

          {/* Playback controls */}
          <div className="border-t border-border">
            {/* Seek bar */}
            <div
              ref={seekBarRef}
              className="group relative h-5 cursor-pointer px-3"
              onClick={handleSeekBarClick}
              onPointerDown={handleSeekBarDrag}
              onPointerMove={handleSeekBarMove}
              onPointerUp={handleSeekBarUp}
            >
              <div className="absolute inset-x-3 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted-foreground/20 group-hover:h-1.5">
                <div
                  className="h-full rounded-full bg-red-500 transition-none"
                  style={{ width: `${progress}%` }}
                />
                <div
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 opacity-0 shadow transition-opacity group-hover:opacity-100"
                  style={{ left: `${progress}%` }}
                />
              </div>
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-2 px-3 pb-2">
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-8"
                aria-label={player.isPlaying ? "Pause" : "Play"}
                disabled={!player.isReady}
                onClick={togglePlay}
              >
                {player.isPlaying ? (
                  <PauseIcon className="size-4" />
                ) : (
                  <PlayIcon className="size-4" />
                )}
              </Button>

              {/* Volume */}
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7"
                aria-label={player.isMuted ? "Unmute" : "Mute"}
                disabled={!player.isReady}
                onClick={toggleMute}
              >
                {player.isMuted ? (
                  <VolumeXIcon className="size-3.5" />
                ) : (
                  <Volume2Icon className="size-3.5" />
                )}
              </Button>
              <Slider
                value={[player.isMuted ? 0 : player.volume]}
                max={100}
                step={1}
                className="w-20"
                onValueChange={([v]) => setVolume(v)}
                disabled={!player.isReady}
              />

              {/* Time */}
              <span className="min-w-[80px] text-xs text-muted-foreground tabular-nums">
                {formatTime(player.currentTime)} / {formatTime(player.duration)}
              </span>

              {/* Video title */}
              {player.videoTitle && (
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {player.videoTitle}
                </span>
              )}
              {!player.videoTitle && <div className="flex-1" />}

              {/* Actions */}
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7"
                disabled={!activeVideoId}
                onClick={handleToggleBookmark}
                title={isBookmarked ? "Remove from saved" : "Save video"}
              >
                {isBookmarked ? (
                  <StarOffIcon className="size-3.5 text-yellow-500" />
                ) : (
                  <StarIcon className="size-3.5" />
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={!activeVideoId || !activeScheduleId}
                onClick={handleAddToSchedule}
                title={
                  !activeScheduleId
                    ? "Select a schedule first"
                    : "Add to schedule"
                }
              >
                <ListPlusIcon className="size-3" />
                Schedule
              </Button>

              <Button
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={!activeVideoId}
                onClick={handleGoLive}
              >
                <CastIcon className="size-3" />
                Go Live
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
