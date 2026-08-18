import type { ScheduleItem, ServiceSchedule } from "@/types/schedule"

/**
 * Serialize a {@link ServiceSchedule} to a portable, self-describing JSON file
 * and read one back. This is the "save the running order to its own file /
 * import it later" boundary — pure string ↔ data, no filesystem (that lives in
 * `services/schedule-io-gateway.ts`).
 *
 * The file is the schedule *document only* — item ids reference presentations,
 * media, and songs in the library by id. Those references resolve on the machine
 * that has that content; anything missing simply doesn't present (the schedule
 * already tolerates this via the cached reference/label fields). Scripture, web,
 * header, and lexicon items are fully self-contained and always survive a round
 * trip.
 */

/** Marker distinguishing our export from any other JSON the picker might return. */
export const SCHEDULE_FILE_FORMAT = "lumenlive.schedule"

/**
 * On-disk schema version. Bump when the envelope shape changes; {@link
 * parseScheduleFile} refuses versions newer than it understands so an older app
 * gives a clear error instead of importing garbage.
 */
export const SCHEDULE_FILE_VERSION = 1

/** File extension used for exported schedules (drives the dialog filter). */
export const SCHEDULE_FILE_EXTENSION = "lumsched"

/** The envelope written to disk. */
export interface ScheduleFileEnvelope {
  format: typeof SCHEDULE_FILE_FORMAT
  version: number
  /** Wall-clock export time (epoch ms), for the reader's information only. */
  exportedAt: number
  schedule: ServiceSchedule
}

const KNOWN_ITEM_TYPES: ReadonlySet<string> = new Set([
  "scripture",
  "slide",
  "media",
  "header",
  "web",
  "song",
  "lexicon",
])

/**
 * Produce the JSON text for `schedule`. `exportedAt` is injected (rather than
 * read from the clock here) so the function stays pure and testable.
 */
export function serializeSchedule(
  schedule: ServiceSchedule,
  exportedAt: number
): string {
  const envelope: ScheduleFileEnvelope = {
    format: SCHEDULE_FILE_FORMAT,
    version: SCHEDULE_FILE_VERSION,
    exportedAt,
    schedule,
  }
  return JSON.stringify(envelope, null, 2)
}

/** Suggested filename for a schedule export (sanitized, extension included). */
export function scheduleFileName(name: string): string {
  const base =
    name
      .trim()
      .replace(/[^\w\s-]/g, "") // drop path-unsafe punctuation
      .replace(/\s+/g, "-")
      .slice(0, 60) || "schedule"
  return `${base}.${SCHEDULE_FILE_EXTENSION}`
}

/** Raised when an imported file isn't a schedule we can read. */
export class ScheduleParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ScheduleParseError"
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

/**
 * Parse an exported schedule file back into a {@link ServiceSchedule}, ready to
 * hand to the store. The returned schedule gets **fresh ids** (schedule + every
 * item) and re-based `order`s so importing the same file twice — or a file whose
 * ids already exist in the library — never collides with existing rows.
 *
 * `newId`/`now` are injected so the function stays pure; callers pass
 * `crypto.randomUUID` and `Date.now`. Throws {@link ScheduleParseError} with a
 * user-readable message on anything that isn't a valid schedule file; invalid
 * individual items are dropped rather than failing the whole import.
 */
export function parseScheduleFile(
  text: string,
  newId: () => string,
  now: number
): ServiceSchedule {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ScheduleParseError("This file isn't valid JSON.")
  }

  if (!isRecord(raw) || raw.format !== SCHEDULE_FILE_FORMAT) {
    throw new ScheduleParseError("This isn't a LumenLive schedule file.")
  }
  if (typeof raw.version !== "number" || raw.version > SCHEDULE_FILE_VERSION) {
    throw new ScheduleParseError(
      "This schedule was made by a newer version of the app. Please update to import it."
    )
  }
  if (!isRecord(raw.schedule)) {
    throw new ScheduleParseError("This schedule file is missing its contents.")
  }

  const src = raw.schedule
  const name = typeof src.name === "string" && src.name.trim() ? src.name : "Imported Schedule"
  const rawItems = Array.isArray(src.items) ? src.items : []

  // Mint the schedule id before item ids so the schedule reads as the first
  // fresh id — purely cosmetic, but keeps the id sequence intuitive.
  const id = newId()
  const items: ScheduleItem[] = []
  for (const candidate of rawItems) {
    if (
      isRecord(candidate) &&
      typeof candidate.type === "string" &&
      KNOWN_ITEM_TYPES.has(candidate.type)
    ) {
      items.push({
        ...(candidate as unknown as ScheduleItem),
        id: newId(),
        order: items.length,
      })
    }
  }

  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    items,
  }
}
