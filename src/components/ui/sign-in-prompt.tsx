import { openSettings } from "@/lib/settings-dialog"
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
 * Transcription runs strictly on platform-managed keys, which require a
 * LumenLive account, so there's nothing to configure locally — the user just
 * needs to sign in. Points them at the in-app Account settings, where the
 * sign-in form lives. Distinct from `TranscriptionBlockedPrompt`, which handles
 * a *signed-in* user whose allowance is spent or whose account key is rejected.
 */

interface SignInPromptProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SignInPrompt({ open, onOpenChange }: SignInPromptProps) {
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
              window.setTimeout(() => {
                openSettings("account")
              }, 120)
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
