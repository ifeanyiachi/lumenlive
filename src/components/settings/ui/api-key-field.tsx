import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckIcon } from "lucide-react"

import type { ApiKeyField as ApiKeyFieldState } from "../hooks/use-api-key-field"

/**
 * Password-style API key input with a "Key configured" badge, a Save button
 * that flashes a check on success, a dashed "how to get a key" instructions
 * box, and a help line. Shared by the Speech (Deepgram) and Songs (Genius)
 * sections; the `field` comes from {@link useApiKeyField}.
 */
export function ApiKeyField({
  label,
  placeholder,
  configured,
  field,
  instructionsTitle,
  helpText,
  children,
}: {
  label: string
  placeholder: string
  configured: boolean
  field: ApiKeyFieldState
  instructionsTitle: string
  helpText: ReactNode
  /** The `<ol>` of numbered steps shown inside the dashed instructions box. */
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </label>
        {configured && (
          <Badge variant="outline" className="text-[0.5rem]">
            Key configured
          </Badge>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder={placeholder}
          value={field.value}
          onChange={(e) => field.setValue(e.target.value)}
          className="flex-1 text-xs"
        />
        <Button size="sm" onClick={field.save}>
          {field.saved ? (
            <>
              <CheckIcon className="size-3" />
              Saved
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-2.5">
        <p className="mb-1 text-[0.625rem] font-medium text-foreground">
          {instructionsTitle}
        </p>
        {children}
      </div>
      <p className="text-[0.625rem] text-muted-foreground">{helpText}</p>
    </div>
  )
}
