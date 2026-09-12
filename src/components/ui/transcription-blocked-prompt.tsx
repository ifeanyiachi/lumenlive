import { openExternalUrl } from "@/services/external-link-gateway"
import { appUrl } from "@/lib/app-urls"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Shown when the platform blocks transcription for a signed-in user (portalplan
 * D2-06): allowance spent, BYO key rejected, or the platform key unset. Points
 * the operator at the account portal, where they add/rotate their own Deepgram
 * key or upgrade. Distinct from `SignInPrompt`, which handles the anonymous
 * "not signed in yet" case.
 */

/**
 * The account portal's transcription page, on the app/dashboard host
 * (`app.lumenlive.xyz`) — distinct from the `/v1` API host. See `lib/app-urls`.
 */
const PORTAL_URL = appUrl("/account/transcription")

interface TranscriptionBlockedPromptProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: string
}

export function TranscriptionBlockedPrompt({
  open,
  onOpenChange,
  title,
  message,
}: TranscriptionBlockedPromptProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-white/12 bg-linear-to-b from-card to-card/95 sm:max-w-[420px]"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => {
              onOpenChange(false)
              void openExternalUrl(PORTAL_URL)
            }}
          >
            Open account portal
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
