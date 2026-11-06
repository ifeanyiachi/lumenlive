import { invoke } from "@tauri-apps/api/core"
import type {
  BibleResource,
  InstalledResource,
  InstalledTranslationRecord,
} from "@/types/resource-store"

/**
 * Gateway for the in-app resource store. Owns every backend command name and
 * event string for fetching the catalog, installing/removing Bible
 * translations, and streaming install progress — so the store and its UI never
 * touch Tauri APIs directly. Downloads run in Rust, so nothing here widens the
 * webview CSP.
 */

/** Result of a successful Bible install, for refreshing the picker in place. */
export interface InstalledBibleInfo {
  globalId: number
  abbreviation: string
  title: string
  language: string
}

/** Payload of a `store:progress` event during a download. */
export interface InstallProgress {
  resourceId: string
  received: number
  total: number
}

/** Raw registry record returned by `store_list_installed` (camelCase serde). */
interface RawInstalledTranslation {
  globalId: number
  localId: number
  resourceId: string
  abbreviation: string
  title: string
  language: string
  license: string
  isCopyrighted: boolean
  fileName: string
  schemaVersion: number
}

/** Fetch the raw catalog manifest JSON (parsed by `lib/resource-store`). */
export function fetchManifestJson(): Promise<string> {
  return invoke<string>("store_fetch_manifest")
}

/** List installed downloads as the generic `InstalledResource` the diff wants. */
export async function listInstalledBibles(): Promise<InstalledResource[]> {
  const rows = await invoke<RawInstalledTranslation[]>("store_list_installed")
  return rows.map((r) => ({
    id: r.resourceId,
    kind: "bible" as const,
    schemaVersion: r.schemaVersion,
    refId: r.globalId,
  }))
}

/**
 * List every installed translation (downloads AND imports) with its display
 * metadata. The store needs the fuller record to build cards for imported
 * translations, which have no manifest entry to draw a title/abbreviation from.
 */
export async function listInstalledTranslations(): Promise<
  InstalledTranslationRecord[]
> {
  const rows = await invoke<RawInstalledTranslation[]>("store_list_installed")
  return rows.map((r) => ({
    globalId: r.globalId,
    resourceId: r.resourceId,
    abbreviation: r.abbreviation,
    title: r.title,
    language: r.language,
    license: r.license,
    isCopyrighted: r.isCopyrighted,
    schemaVersion: r.schemaVersion,
  }))
}

/**
 * Install a Bible translation. The resource must be one-click installable
 * (`canInstall`) — its download fields are required by the backend. Resolves
 * with the assigned global id once attached.
 */
export function installBible(
  resource: BibleResource
): Promise<InstalledBibleInfo> {
  return invoke<InstalledBibleInfo>("store_install_bible", {
    request: {
      resourceId: resource.id,
      url: resource.url,
      sha256: resource.sha256,
      bytes: resource.bytes,
      license: resource.license.name,
      schemaVersion: resource.schemaVersion,
    },
  })
}

/** Uninstall a downloaded translation by its global (backend) id. */
export async function removeBible(translationId: number): Promise<void> {
  await invoke("store_remove_bible", { translationId })
}

/**
 * Subscribe to install-progress events. Returns a disposer that removes the
 * listener — callers must call it on unmount so the listener is never orphaned.
 */
export async function onInstallProgress(
  handler: (progress: InstallProgress) => void
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event")
  return listen<InstallProgress>("store:progress", (event) =>
    handler(event.payload)
  )
}
