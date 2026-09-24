import { openAccountMenu } from "@/lib/account-menu"
import { useTranslation } from "react-i18next"
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
 * Shown when an anonymous (signed-out) user tries to start transcription.
 * Transcription uses server-authorized keys, including team-managed BYOK keys,
 * which require a LumenLive account, so there's nothing to configure locally —
 * the user just needs to sign in. Starts the shared browser-login flow. Distinct from
 * `TranscriptionBlockedPrompt`, which handles
 * a *signed-in* user whose allowance is spent or whose account key is rejected.
 */

interface SignInPromptProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSignIn?: () => void
}

export function SignInPrompt({
  open,
  onOpenChange,
  onSignIn,
}: SignInPromptProps) {
  const { t } = useTranslation("ui")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-white/12 bg-linear-to-b from-card to-card/95 sm:max-w-[420px]"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-center">
            {t("signInPrompt.title")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t("signInPrompt.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => {
              onOpenChange(false)
              if (onSignIn) onSignIn()
              else window.setTimeout(openAccountMenu, 120)
            }}
          >
            {t("signInPrompt.signIn")}
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            {t("signInPrompt.notNow")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
