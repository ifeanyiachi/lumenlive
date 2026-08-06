import { useState, useRef } from "react"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useLocalFonts } from "@/hooks/use-local-fonts"
import { cn } from "@/lib/utils"

export function FontFamilyPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (family: string) => void
}) {
  const { fonts, loading } = useLocalFonts()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = search
    ? fonts.filter((f) => f.toLowerCase().includes(search.toLowerCase()))
    : fonts

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setSearch("")
      }}
    >
      <PopoverTrigger asChild>
        <div>
          <Input
            ref={inputRef}
            value={open ? search : value}
            onChange={(e) => {
              setSearch(e.target.value)
              if (!open) setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder={loading ? "Loading fonts..." : "Search fonts..."}
            className="h-7 text-xs"
            style={!open ? { fontFamily: value } : undefined}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        sideOffset={2}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <div className="flex max-h-52 flex-col overflow-y-auto overscroll-contain p-1">
          {filtered.map((family) => (
            <button
              key={family}
              type="button"
              className={cn(
                "shrink-0 rounded px-2 py-1 text-left text-xs transition-colors",
                family === value
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              style={{ fontFamily: family }}
              onClick={() => {
                onChange(family)
                setOpen(false)
                setSearch("")
              }}
            >
              {family}
            </button>
          ))}
          {filtered.length === 0 && (
            <span className="px-2 py-1 text-xs text-muted-foreground">
              No fonts found
            </span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
