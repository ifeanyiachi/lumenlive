import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { usePresentationStore } from "@/stores/presentation-store"
import { preloadSlideImage } from "@/lib/slide-image-cache"
import { FolderOpenIcon, ImageIcon, FilmIcon } from "lucide-react"

export function BackgroundMediaLibrary({
  onApplyImage,
  onApplyVideo,
}: {
  onApplyImage: (url: string) => void
  onApplyVideo: (url: string) => void
}) {
  const [open, setOpen] = useState(false)
  const presentations = usePresentationStore((s) => s.presentations)

  const mediaItems = useMemo(() => {
    const seen = new Set<string>()
    const items: { url: string; type: "image" | "video" }[] = []

    for (const p of presentations) {
      for (const slide of p.slides) {
        const bg = slide.background
        if (bg.type === "image" && bg.imageUrl && !seen.has(bg.imageUrl)) {
          seen.add(bg.imageUrl)
          items.push({ url: bg.imageUrl, type: "image" })
        }
        if (bg.type === "video" && bg.videoUrl && !seen.has(bg.videoUrl)) {
          seen.add(bg.videoUrl)
          items.push({ url: bg.videoUrl, type: "video" })
        }
      }
    }

    return items
  }, [presentations])

  const handleSelect = (item: { url: string; type: "image" | "video" }) => {
    if (item.type === "image") {
      void preloadSlideImage(item.url)
      onApplyImage(item.url)
    } else {
      onApplyVideo(item.url)
    }
    setOpen(false)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs"
        onClick={() => setOpen(true)}
        disabled={mediaItems.length === 0}
      >
        <FolderOpenIcon className="mr-1.5 size-3" />
        {mediaItems.length === 0
          ? "No saved media"
          : `Library (${mediaItems.length})`}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Background Media Library</DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[400px]">
            <div className="grid grid-cols-3 gap-2 p-1">
              {mediaItems.map((item) => (
                <button
                  key={item.url}
                  type="button"
                  className="group relative aspect-video overflow-hidden rounded-md border border-border bg-muted transition-all hover:ring-2 hover:ring-primary"
                  onClick={() => handleSelect(item)}
                >
                  {item.type === "image" ? (
                    <img
                      src={item.url}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <video
                      src={item.url}
                      muted
                      playsInline
                      className="size-full object-cover"
                      onMouseEnter={(e) =>
                        void (e.target as HTMLVideoElement).play()
                      }
                      onMouseLeave={(e) => {
                        const v = e.target as HTMLVideoElement
                        v.pause()
                        v.currentTime = 0
                      }}
                    />
                  )}
                  <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5">
                    {item.type === "image" ? (
                      <ImageIcon className="size-2.5 text-white" />
                    ) : (
                      <FilmIcon className="size-2.5 text-white" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}
