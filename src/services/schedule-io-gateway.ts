/**
 * Schedule import/export gateway — the Tauri I/O boundary for reading and
 * writing schedule files off disk.
 *
 * All `@tauri-apps` access for the "save the running order to its own file /
 * import it back" feature lives here (per the services layer rule): the
 * save/open dialogs and text-file read/write. The pure serializer/parser in
 * `@/lib/schedule-io` never touches the filesystem — callers serialize, then
 * write through this gateway; or read here, then parse. Imports are dynamic so
 * the module is safe to load in the browser / tests, where the plugins are
 * absent.
 */

import { SCHEDULE_FILE_EXTENSION } from "@/lib/schedule-io"

const FILTERS = [
  { name: "LumenLive schedule", extensions: [SCHEDULE_FILE_EXTENSION, "json"] },
]

/**
 * Prompt for a save location (pre-filled with `defaultName`) and write
 * `contents` there. Returns the saved path, or null if the user cancels or the
 * plugins are unavailable (browser/tests).
 */
export async function saveScheduleFile(
  defaultName: string,
  contents: string
): Promise<string | null> {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog")
    const { writeTextFile } = await import("@tauri-apps/plugin-fs")
    const path = await save({ defaultPath: defaultName, filters: FILTERS })
    if (!path) return null
    await writeTextFile(path, contents)
    return path
  } catch {
    return null
  }
}

/** A schedule file the user picked, with its raw text ready to parse. */
export interface PickedScheduleFile {
  /** Basename including extension, e.g. "sunday-morning.lumsched". */
  name: string
  text: string
}

/**
 * Open the file picker for a schedule file and read its text. Returns null when
 * the user cancels, when the file can't be read, or when the plugins are
 * unavailable. Parsing/validation is the caller's job (see `@/lib/schedule-io`).
 */
export async function pickScheduleFile(): Promise<PickedScheduleFile | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const { readTextFile } = await import("@tauri-apps/plugin-fs")
    const selected = await open({
      multiple: false,
      title: "Import schedule",
      filters: FILTERS,
    })
    if (selected == null || Array.isArray(selected)) return null
    const path = String(selected)
    const text = await readTextFile(path)
    return { name: path.split(/[\\/]/).pop() ?? "schedule", text }
  } catch {
    return null
  }
}
