import { ArrowLeftIcon, CheckIcon, MusicIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SongSectionsEditor } from "@/components/song/song-sections-editor"
import { SongArrangementBuilder } from "@/components/song/song-arrangement-builder"
import { SongSlidePreview } from "@/components/song/song-slide-preview"
import { SongProjectionOptions } from "@/components/song/song-projection-options"
import { Separator } from "@/components/ui/separator"
import { useSongStore } from "@/stores/song-store"
import type { Song } from "@/types/song"

/**
 * Full-screen song editor overlay — the Phase 2 lyric editor, mounted the same
 * way `PresentationEditor` is. All edits target the store's `editingDraft`
 * working copy: nothing touches the library (or disk) until Save commits the
 * draft, and Back/Cancel discards it — a brand-new song simply never appears.
 *
 * Layout mirrors §8 of the design doc: sections on the left, arrangement builder
 * on the right. The center live-slide preview and right-hand projection options
 * arrive with auto slide generation in Phase 3.
 */
export function SongEditor() {
  const editingSongId = useSongStore((s) => s.editingSongId)
  const song = useSongStore((s) => s.editingDraft)

  if (!editingSongId || !song) return null

  const update = (updates: Partial<Song>) =>
    useSongStore.getState().updateSong(song.id, updates)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back (discard changes)"
          title="Back (discard changes)"
          onClick={() => useSongStore.getState().cancelEdit()}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <MusicIcon className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={song.title}
          aria-label="Song title"
          placeholder="Song title"
          onChange={(e) => update({ title: e.target.value })}
          className="h-8 max-w-md text-sm font-medium"
        />
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => useSongStore.getState().cancelEdit()}
        >
          <XIcon className="size-3.5" />
          Cancel
        </Button>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => useSongStore.getState().saveEdit()}
        >
          <CheckIcon className="size-3.5" />
          Save
        </Button>
      </div>

      {/* Metadata row */}
      <div className="grid grid-cols-2 gap-2 border-b border-border px-4 py-2 md:grid-cols-4">
        <LabeledInput
          label="Authors"
          value={song.authors.join(", ")}
          placeholder="Comma separated"
          onChange={(v) =>
            update({
              authors: v
                .split(",")
                .map((a) => a.trim())
                .filter(Boolean),
            })
          }
        />
        <LabeledInput
          label="CCLI #"
          value={song.ccliNumber ?? ""}
          onChange={(v) => update({ ccliNumber: v || undefined })}
        />
        <LabeledInput
          label="Key"
          value={song.key ?? ""}
          onChange={(v) => update({ key: v || undefined })}
        />
        <LabeledInput
          label="Copyright"
          value={song.copyright ?? ""}
          onChange={(v) => update({ copyright: v || undefined })}
        />
      </div>

      {/* Body: sections | live preview | projection options + arrangement */}
      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: "1fr 360px 340px" }}
      >
        <ScrollArea className="min-h-0 border-r border-border">
          <SongSectionsEditor song={song} />
        </ScrollArea>
        <ScrollArea className="min-h-0 border-r border-border">
          <SongSlidePreview song={song} />
        </ScrollArea>
        <ScrollArea className="min-h-0">
          <SongProjectionOptions song={song} />
          <Separator />
          <SongArrangementBuilder song={song} />
        </ScrollArea>
      </div>
    </div>
  )
}

function LabeledInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.625rem] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs"
      />
    </label>
  )
}
