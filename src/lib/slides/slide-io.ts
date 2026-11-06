/**
 * Browser file I/O for presentation JSON: the DOM plumbing behind the editor's
 * export/import buttons, extracted so the component only supplies the JSON (on
 * export) or consumes it (on import) and never hand-rolls anchor/`FileReader`
 * elements. No React or store access — the caller owns store interaction.
 */

/** Trigger a download of `json` as a file named `filename` (e.g. "Deck.json"). */
export function downloadJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Prompt the user for a `.json` file and hand its text contents to `onJson`.
 * Does nothing if the user cancels the picker.
 */
export function pickJsonFile(onJson: (json: string) => void): void {
  const input = document.createElement("input")
  input.type = "file"
  input.accept = ".json"
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      onJson(reader.result as string)
    }
    reader.readAsText(file)
  }
  input.click()
}
