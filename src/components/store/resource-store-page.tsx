import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Music, Package } from "lucide-react"
import { SongPacksSection } from "./song-packs-section"
import { UpdateSection } from "./update-section"
import { cn } from "@/lib/utils"

/**
 * The full-page resource store (the "Store" tab). Bible translations live in
 * Settings now, leaving this page for community song packs and offline tools.
 */

/** Category filter chips for the resources that remain on this page. */
const CATEGORIES = [
  { id: "songs", icon: Music },
] as const

type CategoryId = (typeof CATEGORIES)[number]["id"]

export function ResourceStorePage() {
  const { t } = useTranslation("store")
  const [category, setCategory] = useState<CategoryId>("songs")

  const showSongs = category === "songs"

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      {/* Always-visible software update panel: current version + manual check */}
      <UpdateSection />

      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Package className="mt-1 size-7 shrink-0 text-foreground" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("page.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("page.description")}
            </p>
          </div>
        </div>
      </header>

      {/* Category chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {CATEGORIES.map((c) => {
          const Icon = c.icon
          const active = category === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {t(`categories.${c.id}`)}
            </button>
          )
        })}
      </div>

      {/* Community song packs */}
      {showSongs && <SongPacksSection />}

    </div>
  )
}
