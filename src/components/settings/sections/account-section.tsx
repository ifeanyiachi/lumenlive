import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

import { useAuthStore } from "@/stores/auth-store"
import { useEntitlementsStore } from "@/stores/entitlements-store"
import {
  revalidate,
  signInAndActivate,
  signOut,
  type RevalidateResult,
} from "@/stores/licensing-actions"
import { LicensingError } from "@/services/lumenbo-client"
import { openExternalUrl } from "@/services/external-link-gateway"
import { planLabel, trialRemaining } from "@/lib/entitlements"
import { appUrl } from "@/lib/app-urls"

// The sign-up page is served by the lumenbo app (app.lumenlive.xyz/signup), not
// the marketing site.
const SIGNUP_URL = appUrl("/signup")

const REASON_KEYS = new Set([
  "trial_ended",
  "expired",
  "machine_mismatch",
  "signature",
])

export function AccountSection() {
  const status = useAuthStore((s) => s.status)

  return (
    <div className="flex flex-col gap-6">
      {status === "authenticated" ? <SignedIn /> : <SignedOut />}
    </div>
  )
}

// ── Signed-out: sign in + register ──────────────────────────────────────────

function SignedOut() {
  const { t } = useTranslation("settings")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<string[] | null>(null)

  async function handleSignIn() {
    if (!email || !password || busy) return
    setBusy(true)
    setError(null)
    setDevices(null)
    try {
      await signInAndActivate(email.trim(), password)
    } catch (err) {
      if (err instanceof LicensingError) {
        setError(err.message)
        if (err.code === "DEVICE_LIMIT_REACHED") {
          const detail = err.details as
            { devices?: { machineName?: string }[] } | undefined
          setDevices(
            detail?.devices?.map(
              (d) => d.machineName ?? t("account.unknownDevice")
            ) ?? []
          )
        }
      } else {
        setError(String(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">
          {t("account.signIn.title")}
        </h3>
        <p className="text-[0.6875rem] text-muted-foreground">
          {t("account.signIn.description")}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleSignIn()
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">
            {t("account.email")}
          </label>
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-8 text-xs"
            disabled={busy}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">
            {t("account.password")}
          </label>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-8 text-xs"
            disabled={busy}
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5">
            <p className="text-[0.6875rem] text-red-500">{error}</p>
            {devices && devices.length > 0 && (
              <ul className="mt-1.5 list-disc pl-4 text-[0.625rem] text-muted-foreground">
                {devices.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Button
          type="submit"
          size="sm"
          className="text-xs"
          disabled={busy || !email || !password}
        >
          {busy ? t("account.signingIn") : t("account.signIn.action")}
        </Button>
      </form>

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
  const entitlement = useEntitlementsStore((s) => s.entitlement)
  const reason = useEntitlementsStore((s) => s.reason)
  const machineId = useEntitlementsStore((s) => s.machineId)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RevalidateResult | null>(null)

  async function handleRevalidate() {
    setBusy(true)
    try {
      setResult(await revalidate())
    } finally {
      setBusy(false)
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

      {entitlement.trialEnd != null && (
        <TrialCountdown trialEnd={entitlement.trialEnd} />
      )}

      {note && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
          <p className="text-[0.6875rem] text-amber-600 dark:text-amber-400">
            {note}
          </p>
        </div>
      )}

      {result && !result.ok && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5">
          <p className="text-[0.6875rem] text-red-500">
            {t("account.refreshFailed", { message: result.message })}
          </p>
          <p className="mt-0.5 font-mono text-[0.625rem] text-muted-foreground">
            {result.code}
          </p>
        </div>
      )}

      {result?.ok && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5">
          <p className="text-[0.6875rem] text-emerald-600 dark:text-emerald-400">
            {result.reason === "ok"
              ? t("account.revalidatedNow", { plan: planLabel(entitlement) })
              : t("account.revalidatedStill", { plan: planLabel(entitlement) })}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
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
    <div className="rounded-lg border border-border bg-muted/30 p-3">
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
