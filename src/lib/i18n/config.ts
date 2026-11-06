import i18n, { type ResourceLanguage } from "i18next"

export const SUPPORTED_LOCALES = [
  { code: "en", displayName: "English" },
  { code: "fr", displayName: "Français" },
  { code: "es", displayName: "Español" },
  { code: "pt", displayName: "Português" },
] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]["code"]

type CatalogModule = { default: ResourceLanguage }
type CatalogLoader = () => Promise<CatalogModule>

// Vite turns this into one async chunk per catalog. Keeping the JSON out of
// this module's static imports means a launch downloads only the active UI
// language instead of all 80 shipped catalogs.
const catalogLoaders = import.meta.glob("../../locales/*/*.json") as Record<
  string,
  CatalogLoader
>

const loadedLocales = new Set<SupportedLocale>()
const localeLoads = new Map<SupportedLocale, Promise<void>>()
let requestedLocale: SupportedLocale = "en"

async function loadLocale(locale: SupportedLocale): Promise<void> {
  if (loadedLocales.has(locale)) return

  const inFlight = localeLoads.get(locale)
  if (inFlight) return inFlight

  const load = Promise.all(
    Object.entries(catalogLoaders)
      .filter(([path]) => path.startsWith(`../../locales/${locale}/`))
      .map(async ([path, loadCatalog]) => {
        const namespace = path.slice(path.lastIndexOf("/") + 1, -".json".length)
        const { default: catalog } = await loadCatalog()
        i18n.addResourceBundle(locale, namespace, catalog, true, true)
      })
  ).then(() => {
    loadedLocales.add(locale)
  })

  localeLoads.set(locale, load)
  return load
}

/** Resolve a browser language tag to one of the locales the UI ships. */
export function resolveSupportedLocale(
  language: string | undefined
): SupportedLocale {
  const code = language?.split("-")[0]?.toLowerCase()
  return SUPPORTED_LOCALES.some((locale) => locale.code === code)
    ? (code as SupportedLocale)
    : "en"
}

export function isI18nUiEnabled(): boolean {
  return import.meta.env.VITE_I18N_UI !== "false"
}

const i18nReady = i18n.init({
  lng: "en",
  fallbackLng: "en",
  defaultNS: "common",
  returnNull: false,
  interpolation: {
    escapeValue: false,
  },
})

/** Load the initial English catalog before React first renders. */
export async function initializeI18n(): Promise<void> {
  await i18nReady
  await loadLocale("en")
}

/** Load a locale's catalog chunks before publishing the language change. */
export async function changeLanguage(locale: SupportedLocale): Promise<void> {
  requestedLocale = locale
  await initializeI18n()
  await loadLocale(locale)
  // A user can select another language while this locale's chunks download.
  // Do not let the slower, earlier request overwrite that newer choice.
  if (requestedLocale !== locale) return
  await i18n.changeLanguage(locale)
}

export { i18n }
