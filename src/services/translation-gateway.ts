import { invoke } from "@tauri-apps/api/core"
import type { TranslationInfo } from "@/lib/settings/translations"
import type { Translation } from "@/types"

/**
 * Gateway for Bible-translation selection. Owns the backend command names for
 * listing translations and reading/writing the active one, keeping the Bible
 * settings section free of Tauri APIs.
 */

/** List every installed Bible translation. */
export function listTranslations(): Promise<TranslationInfo[]> {
  return invoke<TranslationInfo[]>("list_translations")
}

/**
 * List every translation with full metadata (copyright/download flags), as the
 * Bible store holds it. Used to refresh the picker after a store install/remove.
 */
export function listTranslationsDetailed(): Promise<Translation[]> {
  return invoke<Translation[]>("list_translations")
}

/** Read the id of the currently active translation. */
export function getActiveTranslation(): Promise<number> {
  return invoke<number>("get_active_translation")
}

/** Set the active translation by id. */
export function setActiveTranslation(translationId: number): Promise<unknown> {
  return invoke("set_active_translation", { translationId })
}
