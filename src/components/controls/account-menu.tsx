import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { CircleUserRoundIcon, ChevronDownIcon } from "lucide-react"

import { AccountContent } from "@/components/settings/sections/account-section"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { planLabel } from "@/lib/entitlements"
import { useAuthStore } from "@/stores/auth-store"
import { useEntitlementsStore } from "@/stores/entitlements-store"
import { useTranscriptStore } from "@/stores/transcript-store"
import { useTeamStore } from "@/stores/team-store"
import { useAccountMenuStore } from "@/lib/account-menu"
import { reportTranscriptionUsage } from "@/services/transcription-key-gateway"

function firstName(name: string | undefined, email: string | undefined) {
  const value = name?.trim() || email?.trim() || "Account"
  return value.split(/\s+/)[0]
}

export function AccountMenu() {
  const { t } = useTranslation("settings")
  const status = useAuthStore((s) => s.status)
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const plan = useEntitlementsStore((s) => planLabel(s.entitlement))
  const selectedOrganizationId = useTeamStore((s) => s.selectedOrganizationId)
  const open = useAccountMenuStore((s) => s.open)
  const setOpen = useAccountMenuStore((s) => s.setOpen)
  const signedIn = status === "authenticated"

  // Load the usage snapshot while the account control is sitting in the
  // transport bar so opening it can render the detail from the cache.
  useEffect(() => {
    if (!token) return
    let active = true
    // Usage is organization-scoped on the server. Clear the previous team's
    // snapshot immediately, then fetch the new team's status whenever the live
    // switcher changes the selected organization.
    useTranscriptStore.getState().setTranscriptionStatus(null)
    void useEntitlementsStore
      .getState()
      .ensureMachineId()
      .then((machineId) => reportTranscriptionUsage(token, machineId, 0))
      .then((transcriptionStatus) => {
        if (active) {
          useTranscriptStore
            .getState()
            .setTranscriptionStatus(transcriptionStatus)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [token, selectedOrganizationId])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={signedIn ? "ghost" : "outline"}
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs"
          aria-label={
            signedIn
              ? `${firstName(user?.name, user?.email)} · ${plan}`
              : t("account.signIn.action")
          }
        >
          <CircleUserRoundIcon className="size-3.5" />
          {signedIn ? (
            <>
              <span>{firstName(user?.name, user?.email)}</span>
              <Badge
                variant={plan === "Free" ? "outline" : "default"}
                className="ml-0.5 h-4 px-1.5 text-[0.5625rem] uppercase"
              >
                {plan}
              </Badge>
            </>
          ) : (
            <span>{t("account.signIn.action")}</span>
          )}
          <ChevronDownIcon className="ml-0.5 size-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-[22rem] shadow-2xl"
      >
        <div className="max-h-[min(34rem,calc(100vh-6rem))] overflow-y-auto">
          <div className="flex flex-col gap-4">
            <AccountContent />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
