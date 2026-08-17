import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useBibleStore } from "@/stores"
import { setActiveTranslation } from "@/services/translation-gateway"
import { toast } from "sonner"
import type { Translation } from "@/types"

/**
 * The translation picker shared by the book- and context-search input rows.
 * Switching sends the change to the backend first (so cached lookups repoint),
 * then updates the store; a failure is surfaced but leaves the prior translation
 * selected.
 */
export function TranslationSelect({
  translations,
  activeTranslationId,
}: {
  translations: Translation[]
  activeTranslationId: number
}) {
  return (
    <Select
      value={String(activeTranslationId)}
      onValueChange={async (v) => {
        const id = Number(v)
        try {
          await setActiveTranslation(id)
          useBibleStore.getState().setActiveTranslation(id)
        } catch (err) {
          console.error(err)
          toast.error("Couldn't switch translation", {
            description: String(err),
          })
        }
      }}
    >
      <SelectTrigger size="sm" className="h-7 w-[72px] shrink-0 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {translations.map((t) => (
          <SelectItem key={t.id} value={String(t.id)}>
            {t.abbreviation}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
