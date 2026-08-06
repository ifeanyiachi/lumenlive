import { useState, useEffect } from "react"

interface FontInfo {
  family: string
  fullName: string
  style: string
}

let cachedFamilies: string[] | null = null
let loadPromise: Promise<string[]> | null = null

const FALLBACK_FONTS = [
  "Arial",
  "Calibri",
  "Cambria",
  "Comic Sans MS",
  "Consolas",
  "Courier New",
  "Georgia",
  "Geist",
  "Impact",
  "Inter",
  "Lucida Console",
  "Palatino Linotype",
  "Segoe UI",
  "Source Serif 4",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
]

async function queryFonts(): Promise<string[]> {
  if (cachedFamilies) return cachedFamilies

  if (!("queryLocalFonts" in window)) {
    cachedFamilies = FALLBACK_FONTS
    return cachedFamilies
  }

  try {
    const fonts: FontInfo[] = await (
      window as unknown as { queryLocalFonts: () => Promise<FontInfo[]> }
    ).queryLocalFonts()
    const families = new Set<string>()
    for (const font of fonts) {
      families.add(font.family)
    }
    const sorted = Array.from(families).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    )
    cachedFamilies = sorted.length > 0 ? sorted : FALLBACK_FONTS
  } catch {
    cachedFamilies = FALLBACK_FONTS
  }

  return cachedFamilies
}

export function useLocalFonts() {
  const [fonts, setFonts] = useState<string[]>(cachedFamilies ?? FALLBACK_FONTS)
  const [loading, setLoading] = useState(!cachedFamilies)

  useEffect(() => {
    // State is already seeded from the cache in the initializers above, so
    // there's nothing to update synchronously when the cache is warm.
    if (cachedFamilies) return
    if (!loadPromise) {
      loadPromise = queryFonts()
    }
    let cancelled = false
    loadPromise.then((f) => {
      if (cancelled) return
      setFonts(f)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { fonts, loading }
}
