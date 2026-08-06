import { useMemo, useState } from "react"
import { MusicIcon, PlusIcon, GlobeIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SongImportButton } from "@/components/song/song-import-button"
import { SongOnlineSearchDialog } from "@/components/song/song-online-search"
import { useSongStore } from "@/stores/song-store"
import { searchSongs } from "@/lib/song/song-search"
import { cn } from "@/lib/utils"
import type { Song } from "@/types/song"

type SortKey = "recent" | "title" | "author"

/** Sort a song list by the chosen key (stable, non-mutating). */
function sortSongs(songs: Song[], key: SortKey): Song[] {
  const copy = [...songs]
  switch (key) {
    case "title":
      return copy.sort((a, b) => a.title.localeCompare(b.title))
    case "author":
      return copy.sort((a, b) =>
        (a.authors[0] ?? "").localeCompare(b.authors[0] ?? "")
      )
    default:
      return copy.sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

/**
 * The Song Library panel — the left column of the Songs view (mirrors the
 * YouTube tab's sidebar). Search + sort the catalogue and create/import/search
 * songs from the header; selecting a row drives the detail pane on the right.
 */
export function SongLibrary() {
  const songs = useSongStore((s) => s.songs)
  const searchQuery = useSongStore((s) => s.searchQuery)
  const selectedSongId = useSongStore((s) => s.selectedSongId)
  const importProgress = useSongStore((s) => s.importProgress)
  const [onlineOpen, setOnlineOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("recent")

  const filtered = useMemo(() => {
    const matched = searchSongs(songs, searchQuery)
    return sortSongs(matched, sortKey)
  }, [songs, searchQuery, sortKey])

  return (
    <div
      data-slot="song-library"
      className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      {/* Header: title + count */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <MusicIcon className="size-3.5" />
          Song Library
        </span>
        <span className="text-[10px] text-muted-foreground">
          {songs.length}
        </span>
      </div>

      {/* Controls: search + sort, then actions */}
      <div className="flex flex-col gap-2 border-b border-border p-2">
        <div className="flex items-center gap-1.5">
          <Input
            placeholder="Search songs..."
            value={searchQuery}
            onChange={(e) =>
              useSongStore.getState().setSearchQuery(e.target.value)
            }
            className="h-7 flex-1 text-xs"
          />
          <Select
            value={sortKey}
            onValueChange={(v) => setSortKey(v as SortKey)}
          >
            <SelectTrigger className="h-7 w-[92px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent" className="text-xs">
                Recent
              </SelectItem>
              <SelectItem value="title" className="text-xs">
                Title
              </SelectItem>
              <SelectItem value="author" className="text-xs">
                Author
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-7 flex-1 gap-1 px-2 text-xs"
            onClick={() => useSongStore.getState().openNewSongEditor()}
          >
            <PlusIcon className="size-3" />
            New
          </Button>
          <SongImportButton />
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setOnlineOpen(true)}
          >
            <GlobeIcon className="size-3" />
            Online
          </Button>
        </div>
      </div>

      {importProgress && (
        <div className="border-b border-border bg-muted/50 px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{importProgress.label ?? "Importing…"}</span>
            <span>
              {importProgress.current} / {importProgress.total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-200"
              style={{
                width: `${
                  importProgress.total > 0
                    ? (importProgress.current / importProgress.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Song list */}
      <ScrollArea className="min-h-0 flex-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <MusicIcon className="size-9 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "No matching songs" : "No songs yet"}
            </p>
            {!searchQuery && (
              <p className="px-6 text-xs text-muted-foreground/70">
                Create one with New, Import, or search Online
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-1.5">
            {filtered.map((song) => (
              <button
                key={song.id}
                type="button"
                onClick={() => useSongStore.getState().setSelectedSong(song.id)}
                onDoubleClick={() =>
                  useSongStore.getState().openEditor(song.id)
                }
                className={cn(
                  "flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors",
                  selectedSongId === song.id
                    ? "bg-accent"
                    : "hover:bg-accent/50"
                )}
              >
                <span className="truncate text-sm font-medium text-foreground">
                  {song.title}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {song.authors.length ? song.authors.join(", ") : "—"}
                  {" · "}
                  {song.sections.length}{" "}
                  {song.sections.length === 1 ? "section" : "sections"}
                </span>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>

      <SongOnlineSearchDialog open={onlineOpen} onOpenChange={setOnlineOpen} />
    </div>
  )
}
