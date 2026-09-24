import { useEffect, useState, useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { Building2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

import { useAuthStore } from "@/stores/auth-store"
import { useEntitlementsStore } from "@/stores/entitlements-store"
import { useTranscriptStore } from "@/stores/transcript-store"
import {
  activatePendingTeam,
  revalidate,
  retryActivation,
  signOut,
  switchTeam as switchActiveTeam,
  type PendingTeamActivation,
  type RevalidateResult,
} from "@/stores/licensing-actions"
import { LicensingError } from "@/services/lumenbo-client"
import { openExternalUrl } from "@/services/external-link-gateway"
import { planLabel, trialRemaining } from "@/lib/entitlements"
import { appUrl } from "@/lib/app-urls"
import type { TranscriptionStatus } from "@/lib/transcription/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTeamStore } from "@/stores/team-store"
import {
  cancelDesktopLogin,
  getDesktopAuthSnapshot,
  subscribeDesktopAuth,
} from "@/services/desktop-auth-service"
import {
  clearPendingBrowserAction,
  resumePendingBrowserAction,
  startBrowserSignIn,
} from "@/services/desktop-auth-flow"

// The sign-up page is served by the lumenbo app (app.lumenlive.xyz/signup), not
// the marketing site.
const SIGNUP_URL = appUrl("/signup")

const REASON_KEYS = new Set([
  "trial_ended",
  "expired",
  "machine_mismatch",
  "signature",
  "malformed",
  "issuer",
  "audience",
])

/**
 * Account content shown by the transport-bar account menu.
 */
export function AccountContent() {
  const status = useAuthStore((s) => s.status)
  const pendingTeams = useAuthStore((s) => s.pendingTeams)
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)

  if (status !== "authenticated") return <SignedOut />
  if (pendingTeams && token && user) {
    return (
      <AuthenticatedTeamSelection
        pending={{ token, user, teams: pendingTeams }}
      />
    )
  }
  return <SignedIn />
}

// ── Signed-out: sign in + register ──────────────────────────────────────────

function SignedOut() {
  const { t } = useTranslation("settings")
  const browserAuth = useSyncExternalStore(
    subscribeDesktopAuth,
    getDesktopAuthSnapshot,
    getDesktopAuthSnapshot
  )
  const pending = browserAuth.status === "pending"
  const terminalMessage =
    browserAuth.status === "cancelled"
      ? t("account.browser.cancelled")
      : browserAuth.status === "timed-out"
        ? t("account.browser.timedOut")
        : browserAuth.error?.code === "OFFLINE"
          ? t("account.browser.offline")
          : browserAuth.error?.message

  function handleBrowserSignIn() {
    if (pending) return
    void startBrowserSignIn().catch(() => {})
  }

  function handleCancelBrowserSignIn() {
    clearPendingBrowserAction()
    cancelDesktopLogin()
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">
          {t("account.signIn.title")}
        </h3>
        <p className="text-[0.6875rem] text-muted-foreground">
          {t("account.browser.description")}
        </p>
      </div>

      {pending && (
        <div className="border-t border-border pt-3">
          <p className="text-[0.6875rem] text-muted-foreground">
            {t("account.browser.pending")}
          </p>
        </div>
      )}
      {terminalMessage && !pending && (
        <div className="border-t border-red-500/40 pt-3">
          <p className="text-[0.6875rem] text-red-500">{terminalMessage}</p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Button
          size="sm"
          className="text-xs"
          disabled={pending}
          onClick={handleBrowserSignIn}
        >
          {pending ? t("account.browser.pendingAction") : t("account.browser.action")}
        </Button>
        {pending && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={handleCancelBrowserSignIn}
          >
            {t("account.browser.cancel")}
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <p className="text-[0.6875rem] text-muted-foreground">
          {t("account.newToLumenLive")}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => void openExternalUrl(SIGNUP_URL)}
        >
          {t("account.registerChurch")}
        </Button>
      </div>
    </>
  )
}

// ── Signed-in: license status + devices ─────────────────────────────────────

function SignedIn() {
  const { t } = useTranslation("settings")
  const user = useAuthStore((s) => s.user)
  const activationStatus = useAuthStore((s) => s.activationStatus)
  const activationError = useAuthStore((s) => s.activationError)
  const activationErrorCode = useAuthStore((s) => s.activationErrorCode)
  const entitlement = useEntitlementsStore((s) => s.entitlement)
  const reason = useEntitlementsStore((s) => s.reason)
  const machineId = useEntitlementsStore((s) => s.machineId)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RevalidateResult | null>(null)
  const cachedTranscription = useTranscriptStore((s) => s.transcriptionStatus)
  const isTranscribing = useTranscriptStore((s) => s.isTranscribing)
  const transcriptionConnection = useTranscriptStore((s) => s.connectionStatus)
  const teams = useTeamStore((s) => s.teams)
  const selectedOrganizationId = useTeamStore((s) => s.selectedOrganizationId)
  const [switchingTeam, setSwitchingTeam] = useState(false)
  const [teamError, setTeamError] = useState<string | null>(null)

  async function handleRevalidate() {
    setBusy(true)
    try {
      setResult(await revalidate())
    } finally {
      setBusy(false)
    }
  }

  async function handleRetryActivation() {
    if (busy) return
    setBusy(true)
    try {
      await retryActivation()
    } catch {
      // The auth store retains the distinct activation failure for the next
      // render, including device-limit, seat, offline, and session errors.
    } finally {
      setBusy(false)
    }
  }

  async function handleTeamChange(organizationId: string) {
    if (
      organizationId === selectedOrganizationId ||
      switchingTeam ||
      isTranscribing ||
      transcriptionConnection === "connecting"
    )
      return
    setSwitchingTeam(true)
    setTeamError(null)
    try {
      await switchActiveTeam(organizationId)
    } catch (err) {
      setTeamError(err instanceof LicensingError ? err.message : String(err))
    } finally {
      setSwitchingTeam(false)
    }
  }

  const note =
    reason !== "ok" && REASON_KEYS.has(reason)
      ? t(`account.reason.${reason}`)
      : null

  return (
    <>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">
            {user?.name || user?.email}
          </span>
          <span className="text-[0.6875rem] text-muted-foreground">
            {user?.email}
          </span>
        </div>
        <Badge variant={entitlement.tier === "free" ? "outline" : "default"}>
          {planLabel(entitlement)}
        </Badge>
      </div>

      {teams.length > 1 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex items-center gap-1.5 text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            <Building2Icon className="size-3" />
            <span>{t("account.team.label")}</span>
          </div>
          <Select
            value={selectedOrganizationId ?? undefined}
            onValueChange={(value) => void handleTeamChange(value)}
            disabled={
              switchingTeam ||
              isTranscribing ||
              transcriptionConnection === "connecting"
            }
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder={t("account.team.choose")} />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {teamError && (
            <p className="text-[0.6875rem] text-red-500">{teamError}</p>
          )}
        </div>
      )}

      {(activationError || activationStatus === "activating") && (
        <div className="border-t border-red-500/40 pt-3">
          <p className="text-xs font-medium text-red-500">
            {activationStatus === "activating"
              ? t("account.activation.activating")
              : activationErrorCode === "DEVICE_LIMIT_REACHED"
                ? t("account.activation.deviceLimit")
                : activationErrorCode === "NO_SEAT"
                  ? t("account.activation.noSeat")
                  : activationErrorCode === "UNAUTHORIZED"
                    ? t("account.activation.sessionExpired")
                    : activationErrorCode === "NETWORK"
                      ? t("account.activation.offline")
                      : t("account.activation.failed")}
          </p>
          {activationError && (
            <p className="text-[0.6875rem] text-red-500">{activationError}</p>
          )}
          {activationStatus === "activating" ? null : activationErrorCode ===
              "UNAUTHORIZED" ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 text-xs"
              disabled={busy}
              onClick={() => void startBrowserSignIn().catch(() => {})}
            >
              {t("account.activation.signInAgain")}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 text-xs"
              disabled={busy}
              onClick={() => void handleRetryActivation()}
            >
              {busy
                ? t("account.activation.retrying")
                : t("account.activation.retry")}
            </Button>
          )}
        </div>
      )}

      {activationStatus === "inactive" && !activationError && (
        <div className="border-t border-amber-500/40 pt-3">
          <p className="text-[0.6875rem] text-amber-600 dark:text-amber-400">
            {t("account.activation.required")}
          </p>
        </div>
      )}

      {entitlement.trialEnd != null && (
        <TrialCountdown trialEnd={entitlement.trialEnd} />
      )}

      {cachedTranscription !== null && (
        <TranscriptionUsage status={cachedTranscription} />
      )}

      {note && (
        <div className="border-t border-amber-500/40 pt-3">
          <p className="text-[0.6875rem] text-amber-600 dark:text-amber-400">
            {note}
          </p>
        </div>
      )}

      {result && !result.ok && (
        <div className="border-t border-red-500/40 pt-3">
          <p className="text-[0.6875rem] text-red-500">
            {t("account.refreshFailed", { message: result.message })}
          </p>
          <p className="mt-0.5 font-mono text-[0.625rem] text-muted-foreground">
            {result.code}
          </p>
        </div>
      )}

      {result?.ok && (
        <div className="border-t border-emerald-500/40 pt-3">
          <p className="text-[0.6875rem] text-emerald-600 dark:text-emerald-400">
            {result.reason === "ok"
              ? t("account.revalidatedNow", { plan: planLabel(entitlement) })
              : t("account.revalidatedStill", { plan: planLabel(entitlement) })}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <label className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          {t("account.thisDevice")}
        </label>
        <code className="font-mono text-[0.625rem] break-all text-muted-foreground">
          {machineId ?? t("account.loadingDevice")}
        </code>
        <p className="text-[0.625rem] text-muted-foreground">
          {entitlement.limits.maxDevices < 0
            ? t("account.unlimitedDevices")
            : t("account.deviceLimit", {
                count: entitlement.limits.maxDevices,
              })}
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          disabled={busy}
          onClick={() => void handleRevalidate()}
        >
          {busy
            ? t("account.revalidating")
            : result?.ok
              ? t("account.revalidated")
              : t("account.revalidateNow")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-red-500 hover:text-red-500"
          onClick={() => void signOut()}
        >
          {t("account.signOut")}
        </Button>
      </div>
    </>
  )
}

function AuthenticatedTeamSelection({
  pending,
}: {
  pending: PendingTeamActivation
}) {
  const { t } = useTranslation("settings")
  const [selectedTeamId, setSelectedTeamId] = useState(
    pending.teams[0]?.id ?? ""
  )
  const [busy, setBusy] = useState(false)
  const activationError = useAuthStore((s) => s.activationError)

  async function onConfirm() {
    if (!selectedTeamId || busy) return
    setBusy(true)
    try {
      await activatePendingTeam(pending, selectedTeamId)
      resumePendingBrowserAction()
    } catch {
      // The shared auth store retains the activation error across rerenders.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">
          {t("account.team.chooseTitle")}
        </h3>
        <p className="text-[0.6875rem] text-muted-foreground">
          {t("account.team.chooseDescription")}
        </p>
      </div>
      <Select
        value={selectedTeamId}
        onValueChange={setSelectedTeamId}
        disabled={busy}
      >
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue placeholder={t("account.team.choose")} />
        </SelectTrigger>
        <SelectContent>
          {pending.teams.map((team) => (
            <SelectItem key={team.id} value={team.id}>
              {team.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {activationError && (
        <p className="text-[0.6875rem] text-red-500">{activationError}</p>
      )}
      <Button
        size="sm"
        className="text-xs"
        disabled={busy || !selectedTeamId}
        onClick={() => void onConfirm()}
      >
        {busy ? t("account.team.activating") : t("account.team.continue")}
      </Button>
    </div>
  )
}

function TranscriptionUsage({ status }: { status: TranscriptionStatus }) {
  const { t } = useTranslation("settings")
  const used = Math.round(status.usedMinutes)
  const teamKey = status.mode === "team_byok"
  const unlimited =
    status.mode !== "blocked" && !teamKey && status.remainingMinutes === null
  const allowance = Math.round(status.allowanceMinutes)
  const remaining = Math.max(0, Math.round(status.remainingMinutes ?? 0))
  const progress = allowance > 0 ? Math.min(100, (used / allowance) * 100) : 0

  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          {t("account.transcriptionUsage")}
        </p>
        <span className="text-[0.625rem] font-medium text-foreground tabular-nums">
          {teamKey
            ? t("account.transcriptionUsageTeamKey")
            : unlimited
              ? t("account.transcriptionUsageUnlimited")
              : t("account.transcriptionUsageRemaining", {
                  minutes: remaining,
                })}
        </span>
      </div>
      {teamKey ? (
        <p className="mt-1 text-xs text-foreground">
          {t("account.transcriptionUsageTeamKeyDescription")}
        </p>
      ) : unlimited ? (
        <p className="mt-1 text-xs text-foreground tabular-nums">
          {t("account.transcriptionUsageUsed", { minutes: used })}
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-foreground tabular-nums">
            {t("account.transcriptionUsageProgress", { used, allowance })}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </>
      )}
    </div>
  )
}

/** Live-updating trial/subscription countdown (ticks each minute). */
function TrialCountdown({ trialEnd }: { trialEnd: number }) {
  const { t } = useTranslation("settings")
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const rem = trialRemaining(trialEnd, now)
  return (
    <div className="border-t border-border pt-4">
      <p className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
        {t("account.accessPeriod")}
      </p>
      {rem.expired ? (
        <p className="mt-1 text-xs text-red-500">{t("account.accessEnded")}</p>
      ) : (
        <p className="mt-1 text-xs text-foreground">
          {t("account.accessRemaining", {
            days: t("account.days", { count: rem.days }),
            hours: t("account.hours", { count: rem.hours }),
          })}
        </p>
      )}
    </div>
  )
}
