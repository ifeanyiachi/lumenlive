import { useState } from "react"
import { Input } from "@/components/ui/input"

/**
 * Isolated context-search text field.
 *
 * Owns its own input value so that typing re-renders only this leaf — never the
 * parent `SearchPanel` or the (heavy) results list. Each change is reported up
 * through the stable, debounced `onSearch` callback from `useContextSearch`, so
 * results still stream in real time. Mounted only while the context tab is
 * active, so switching away and back naturally resets the field to empty.
 */
export function ContextSearchInput({
  onSearch,
}: {
  onSearch: (query: string) => void
}) {
  const [value, setValue] = useState("")

  return (
    <Input
      placeholder="Search verse text..."
      value={value}
      onChange={(e) => {
        const next = e.target.value
        setValue(next)
        onSearch(next)
      }}
      className="h-7 flex-1 text-xs"
    />
  )
}
