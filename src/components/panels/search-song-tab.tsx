import { useMemo, useState } from "react"
import { MusicIcon, SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useSongStore } from "@/stores/song-store"
import { useDragSource } from "@/stores/drag-store"
import { searchSongs } from "@/lib/song/song-search"
import { addSongToSchedule } from "@/lib/schedule-song"
import type { Song } from "@/types/song"

function DraggableSongCard({ song }: { song: Song }) {
  const dragSource = useDragSource()
  const dragHandlers = dragSource(() => ({
    payload: { kind: "song" as const, songId: song.id, songName: song.title },
    label: song.title,
  }))

  const authors = song.authors.join(", ")

  return (
    <button
      type="button"
      {...dragHandlers}
      onDoubleClick={() => addSongToSchedule({ songId: song.id })}
      title={`${song.title} — drag to schedule or double-click to add`}
      className="group flex cursor-grab flex-col gap-1 rounded-lg border border-border bg-card p-2 text-left transition-colors hover:border-primary/50 hover:bg-accent/50 active:cursor-grabbing"
    >
      <div className="flex items-start gap-1.5">
        <MusicIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <span className="line-clamp-2 min-w-0 flex-1 text-[0.6875rem] leading-tight font-medium text-foreground">
          {song.title}
        </span>
      </div>
      {authors && (
        <span className="truncate text-[0.625rem] text-muted-foreground">
          {authors}
        </span>
      )}
      <span className="mt-auto w-fit rounded bg-muted px-1 py-0.5 text-[0.5rem] text-muted-foreground">
        {song.sections.length}{" "}
        {song.sections.length === 1 ? "section" : "sections"}
      </span>
    </button>
  )
}

export function SearchSongTab() {
  const songs = useSongStore((s) => s.songs)
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => searchSongs(songs, query), [songs, query])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Search */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs..."
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            {songs.length === 0
              ? "No songs yet — add them in the Songs view."
              : "No songs match your search."}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2 p-2">
            {filtered.map((song) => (
              <DraggableSongCard key={song.id} song={song} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
