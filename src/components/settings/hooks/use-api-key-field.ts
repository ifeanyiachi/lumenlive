import { useState } from "react"

import { flushSettings } from "@/stores/settings-store"

/**
 * Local state for an API-key input: tracks the editable value, persists it to
 * the settings store on save (flushing immediately so the key survives a
 * crash), and flashes a transient "Saved" acknowledgement for 2s.
 *
 * `persist` receives the trimmed value, or `null` when the field is empty, so
 * clearing the field clears the stored key.
 */
export function useApiKeyField(
  storedKey: string | null | undefined,
  persist: (value: string | null) => void
) {
  const [value, setValue] = useState(storedKey ?? "")
  const [saved, setSaved] = useState(false)

  const save = () => {
    persist(value.trim() || null)
    flushSettings()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return { value, setValue, saved, save }
}

export type ApiKeyField = ReturnType<typeof useApiKeyField>
