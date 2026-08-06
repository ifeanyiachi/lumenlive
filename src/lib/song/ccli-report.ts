import type { SongUsageEntry } from "@/types/song"

/**
 * CCLI usage reporting (design doc §5, §7). Churches must report which
 * copyrighted songs they projected; this aggregates the raw `SongUsageEntry[]`
 * usage log into one row per song (+ arrangement-agnostic) with a play count and
 * first/last-used dates, and renders a CSV for the church to file. Pure — the
 * store owns the log, this owns the math.
 */

export interface CcliReportRow {
  songId: string
  title: string
  ccliNumber?: string
  count: number
  firstUsed: number
  lastUsed: number
}

/** Aggregate usage entries into per-song rows, sorted by most-used then title. */
export function buildCcliReport(entries: SongUsageEntry[]): CcliReportRow[] {
  const bySong = new Map<string, CcliReportRow>()
  for (const entry of entries) {
    const existing = bySong.get(entry.songId)
    if (existing) {
      existing.count += 1
      existing.firstUsed = Math.min(existing.firstUsed, entry.usedAt)
      existing.lastUsed = Math.max(existing.lastUsed, entry.usedAt)
      // A later entry's cached title/CCLI is the freshest; prefer it.
      existing.title = entry.cachedTitle || existing.title
      if (entry.cachedCcliNumber) existing.ccliNumber = entry.cachedCcliNumber
    } else {
      bySong.set(entry.songId, {
        songId: entry.songId,
        title: entry.cachedTitle,
        ccliNumber: entry.cachedCcliNumber,
        count: 1,
        firstUsed: entry.usedAt,
        lastUsed: entry.usedAt,
      })
    }
  }
  return [...bySong.values()].sort(
    (a, b) => b.count - a.count || a.title.localeCompare(b.title)
  )
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Render report rows as CSV. `formatDate` maps an epoch-ms to a date string. */
export function ccliReportToCsv(
  rows: CcliReportRow[],
  formatDate: (ms: number) => string = (ms) =>
    new Date(ms).toISOString().slice(0, 10)
): string {
  const header = [
    "CCLI Number",
    "Title",
    "Times Used",
    "First Used",
    "Last Used",
  ]
  const lines = rows.map((r) =>
    [
      r.ccliNumber ?? "",
      r.title,
      String(r.count),
      formatDate(r.firstUsed),
      formatDate(r.lastUsed),
    ]
      .map(csvCell)
      .join(",")
  )
  return [header.join(","), ...lines].join("\n")
}
