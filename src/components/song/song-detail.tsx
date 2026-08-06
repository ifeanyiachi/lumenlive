import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  MusicIcon,
  UserIcon,
  PencilIcon,
  CopyIcon,
  TrashIcon,
  ListPlusIcon,
  FileTextIcon,
  Wand2Icon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { SongSectionsEditor } from "@/components/song/song-sections-editor"
import { SongProjectionOptions } from "@/components/song/song-projection-options"
import { SongSlidePreview } from "@/components/song/song-slide-preview"
import { useSongStore } from "@/stores/song-store"
import { addSongToSchedule } from "@/lib/schedule-song"
import type { Song } from "@/types/song"

/**
 * The detail pane of the Songs view (right column). Shows the selected song with
 * two tabs — Lyrics (read view + inline edit) and Slides (projection config,
 * generated-slide preview, and Add to Schedule). Deep metadata/arrangement edits
 * still open the full-screen editor via the header "Edit" button.
 */
export function SongDetail() {
  const song = useSongStore((s) =>
    s.songs.find((x) => x.id === s.selectedSongId)
  )

  if (!song) {
    return (
      <div className="flex min-h-0 flex-col items-center justify-center rounded-lg border border-border bg-card">
        <MusicIcon className="size-10 text-muted-foreground/25" />
        <p className="mt-3 text-sm text-muted-foreground">
          Select a song to view its lyrics and slides
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Or create one with New, Import, or Online
        </p>
      </div>
    )
  }

  return (
    <div
      key={song.id}
      className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <SongDetailHeader song={song} />
      <Tabs defaultValue="lyrics" className="min-h-0 flex-1 gap-0">
        <div className="border-b border-border px-3 pt-2">
          <TabsList variant="line">
            <TabsTrigger value="lyrics">
              <FileTextIcon className="size-3.5" />
              Lyrics
            </TabsTrigger>
            <TabsTrigger value="slides">
              <Wand2Icon className="size-3.5" />
              Slides
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="lyrics" className="flex min-h-0 flex-col">
          <LyricsTab song={song} />
        </TabsContent>
        <TabsContent value="slides" className="flex min-h-0 flex-col">
          <SlidesTab song={song} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Title, author, and the Edit / Duplicate / Delete actions. */
function SongDetailHeader({ song }: { song: Song }) {
  return (
    <div className="flex items-start gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-semibold text-foreground">
          {song.title}
        </h2>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
          <UserIcon className="size-3.5 shrink-0" />
          {song.authors.length ? song.authors.join(", ") : "Unknown author"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => useSongStore.getState().openEditor(song.id)}
        >
          <PencilIcon className="size-3.5" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Duplicate song"
          title="Duplicate"
          onClick={() => useSongStore.getState().duplicateSong(song.id)}
        >
          <CopyIcon className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Delete song"
          title="Delete"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            useSongStore.getState().removeSong(song.id)
            toast(`Removed "${song.title}"`)
          }}
        >
          <TrashIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Lyrics tab: formatted read view with an inline edit toggle. Editing works on
 * the store's `editingDraft` copy — Save commits it to the library, Cancel
 * discards it — so lyrics are never autosaved mid-edit.
 */
function LyricsTab({ song }: { song: Song }) {
  const [editing, setEditing] = useState(false)
  const draft = useSongStore((s) => s.editingDraft)
  // The draft is ours only while it matches this song and the full-screen
  // editor isn't the one holding it.
  const editingDraft = editing && draft?.id === song.id ? draft : null

  // Switching tabs (or songs) unmounts this tab — discard an in-progress
  // inline draft so it can't silently swallow later edits. The full-screen
  // editor's draft is left alone (it owns `editingSongId`).
  useEffect(() => {
    return () => {
      const store = useSongStore.getState()
      if (store.editingDraft?.id === song.id && !store.editingSongId) {
        store.cancelEdit()
      }
    }
  }, [song.id])

  const stopEditing = (save: boolean) => {
    const store = useSongStore.getState()
    if (save) store.saveEdit()
    else store.cancelEdit()
    setEditing(false)
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[0.625rem] text-muted-foreground">
          {song.key && <MetaChip label="Key" value={song.key} />}
          {song.ccliNumber && <MetaChip label="CCLI" value={song.ccliNumber} />}
          {song.copyright && <MetaChip label="©" value={song.copyright} />}
        </div>
        {editingDraft ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => stopEditing(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => stopEditing(true)}
            >
              Save
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => {
              useSongStore.getState().beginEdit(song.id)
              setEditing(true)
            }}
          >
            <PencilIcon className="size-3.5" />
            Edit lyrics
          </Button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {editingDraft ? (
          <SongSectionsEditor song={editingDraft} />
        ) : song.sections.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No lyrics yet — click "Edit lyrics" to add sections.
          </p>
        ) : (
          <div className="flex flex-col gap-4 px-4 pb-4">
            {song.sections.map((section) => (
              <div key={section.id} className="flex flex-col gap-1">
                <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
                  {section.label}
                </span>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {section.lyrics || (
                    <span className="text-muted-foreground/60 italic">
                      (empty)
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

/** Slides tab: projection config + generated preview + Add to Schedule. */
function SlidesTab({ song }: { song: Song }) {
  return (
    <div className="flex min-h-0 flex-1">
      <ScrollArea className="min-h-0 w-[260px] shrink-0 border-r border-border">
        <div className="p-3">
          <Button
            className="mb-3 w-full gap-1.5"
            size="sm"
            onClick={() => addSongToSchedule({ songId: song.id })}
          >
            <ListPlusIcon className="size-3.5" />
            Add to Schedule
          </Button>
        </div>
        <SongProjectionOptions song={song} />
      </ScrollArea>
      <ScrollArea className="min-h-0 flex-1">
        <SongSlidePreview song={song} />
      </ScrollArea>
    </div>
  )
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5">
      <span className="text-muted-foreground/70">{label} </span>
      <span className="text-foreground">{value}</span>
    </span>
  )
}
