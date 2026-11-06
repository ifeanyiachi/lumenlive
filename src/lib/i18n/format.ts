import { i18n } from "./config"

type Locale = string | undefined

function currentLocale(locale?: Locale): string {
  return locale ?? i18n.resolvedLanguage ?? i18n.language ?? "en"
}

/** Format a general-purpose number using the selected UI language. */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale?: Locale
): string {
  return new Intl.NumberFormat(currentLocale(locale), options).format(value)
}

/** Format a byte count using locale-appropriate decimal separators. */
export function formatBytes(bytes: number, locale?: Locale): string {
  if (bytes < 1024) return `${formatNumber(bytes, undefined, locale)} B`

  const [value, unit] =
    bytes < 1024 * 1024 ? [bytes / 1024, "KB"] : [bytes / (1024 * 1024), "MB"]

  return `${formatNumber(value, { maximumFractionDigits: 1 }, locale)} ${unit}`
}

/**
 * Format a media duration as a compact clock value. Digits follow the selected
 * UI locale while the fixed-width clock layout remains easy to scan.
 */
export function formatDuration(milliseconds: number, locale?: Locale): string {
  const totalSeconds = Number.isFinite(milliseconds)
    ? Math.max(0, Math.floor(milliseconds / 1000))
    : 0
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const twoDigits = (value: number) =>
    formatNumber(value, { useGrouping: false, minimumIntegerDigits: 2 }, locale)

  return hours > 0
    ? `${formatNumber(hours, { useGrouping: false }, locale)}:${twoDigits(
        minutes
      )}:${twoDigits(seconds)}`
    : `${formatNumber(minutes, { useGrouping: false }, locale)}:${twoDigits(
        seconds
      )}`
}

/** Format a date and time for metadata shown in the operator UI. */
export function formatDateTime(value: number | Date, locale?: Locale): string {
  return new Intl.DateTimeFormat(currentLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

/** Format a short clock time, for example in command or activity logs. */
export function formatTime(value: number | Date, locale?: Locale): string {
  return new Intl.DateTimeFormat(currentLocale(locale), {
    timeStyle: "medium",
  }).format(value)
}

/**
 * CCLI exports use an unambiguous ISO calendar date, independent of display
 * locale, so that reports import consistently across reporting systems.
 */
export function formatCcliDate(value: number | Date): string {
  return new Date(value).toISOString().slice(0, 10)
}
