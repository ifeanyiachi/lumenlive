import { describe, expect, it } from "vitest"

import { resolveSupportedLocale } from "./config"

import enCommon from "@/locales/en/common.json"
import enSettings from "@/locales/en/settings.json"
import enBroadcast from "@/locales/en/broadcast.json"
import enBroadcastOutput from "@/locales/en/broadcast-output.json"
import enControls from "@/locales/en/controls.json"
import enLayout from "@/locales/en/layout.json"
import enMedia from "@/locales/en/media.json"
import enProps from "@/locales/en/props.json"
import enShared from "@/locales/en/shared.json"
import enSlides from "@/locales/en/slides.json"
import enSchedule from "@/locales/en/schedule.json"
import enPanels from "@/locales/en/panels.json"
import enAlerts from "@/locales/en/alerts.json"
import enKeyboard from "@/locales/en/keyboard.json"
import enUi from "@/locales/en/ui.json"
import enCountdown from "@/locales/en/countdown.json"
import enTutorial from "@/locales/en/tutorial.json"
import enSong from "@/locales/en/song.json"
import enStore from "@/locales/en/store.json"
import enVerseEdit from "@/locales/en/verse-edit.json"
import frBroadcast from "@/locales/fr/broadcast.json"
import frBroadcastOutput from "@/locales/fr/broadcast-output.json"
import frControls from "@/locales/fr/controls.json"
import frCommon from "@/locales/fr/common.json"
import frSettings from "@/locales/fr/settings.json"
import frLayout from "@/locales/fr/layout.json"
import frMedia from "@/locales/fr/media.json"
import frProps from "@/locales/fr/props.json"
import frShared from "@/locales/fr/shared.json"
import frSlides from "@/locales/fr/slides.json"
import frSchedule from "@/locales/fr/schedule.json"
import frPanels from "@/locales/fr/panels.json"
import frAlerts from "@/locales/fr/alerts.json"
import frKeyboard from "@/locales/fr/keyboard.json"
import frUi from "@/locales/fr/ui.json"
import frCountdown from "@/locales/fr/countdown.json"
import frTutorial from "@/locales/fr/tutorial.json"
import frSong from "@/locales/fr/song.json"
import frStore from "@/locales/fr/store.json"
import frVerseEdit from "@/locales/fr/verse-edit.json"
import esCommon from "@/locales/es/common.json"
import esSettings from "@/locales/es/settings.json"
import esBroadcast from "@/locales/es/broadcast.json"
import esBroadcastOutput from "@/locales/es/broadcast-output.json"
import esControls from "@/locales/es/controls.json"
import esLayout from "@/locales/es/layout.json"
import esMedia from "@/locales/es/media.json"
import esProps from "@/locales/es/props.json"
import esShared from "@/locales/es/shared.json"
import esSlides from "@/locales/es/slides.json"
import esSchedule from "@/locales/es/schedule.json"
import esPanels from "@/locales/es/panels.json"
import esAlerts from "@/locales/es/alerts.json"
import esKeyboard from "@/locales/es/keyboard.json"
import esUi from "@/locales/es/ui.json"
import esCountdown from "@/locales/es/countdown.json"
import esTutorial from "@/locales/es/tutorial.json"
import esSong from "@/locales/es/song.json"
import esStore from "@/locales/es/store.json"
import esVerseEdit from "@/locales/es/verse-edit.json"
import ptCommon from "@/locales/pt/common.json"
import ptSettings from "@/locales/pt/settings.json"
import ptBroadcast from "@/locales/pt/broadcast.json"
import ptBroadcastOutput from "@/locales/pt/broadcast-output.json"
import ptControls from "@/locales/pt/controls.json"
import ptLayout from "@/locales/pt/layout.json"
import ptMedia from "@/locales/pt/media.json"
import ptProps from "@/locales/pt/props.json"
import ptShared from "@/locales/pt/shared.json"
import ptSlides from "@/locales/pt/slides.json"
import ptSchedule from "@/locales/pt/schedule.json"
import ptPanels from "@/locales/pt/panels.json"
import ptAlerts from "@/locales/pt/alerts.json"
import ptKeyboard from "@/locales/pt/keyboard.json"
import ptUi from "@/locales/pt/ui.json"
import ptCountdown from "@/locales/pt/countdown.json"
import ptTutorial from "@/locales/pt/tutorial.json"
import ptSong from "@/locales/pt/song.json"
import ptStore from "@/locales/pt/store.json"
import ptVerseEdit from "@/locales/pt/verse-edit.json"

const pilotCatalogs = [
  ["French", frCommon, frSettings],
  ["Spanish", esCommon, esSettings],
  ["Portuguese", ptCommon, ptSettings],
] as const

const broadcastCatalogs = [
  ["French", frBroadcast, frBroadcastOutput, frControls],
  ["Spanish", esBroadcast, esBroadcastOutput, esControls],
  ["Portuguese", ptBroadcast, ptBroadcastOutput, ptControls],
] as const

const mediaCatalogs = [
  ["French", frLayout, frMedia, frProps, frShared, frSlides],
  ["Spanish", esLayout, esMedia, esProps, esShared, esSlides],
  ["Portuguese", ptLayout, ptMedia, ptProps, ptShared, ptSlides],
] as const

const schedulePanelCatalogs = [
  ["French", frSchedule, frPanels],
  ["Spanish", esSchedule, esPanels],
  ["Portuguese", ptSchedule, ptPanels],
] as const

const sharedUiCatalogs = [
  ["French", frAlerts, frKeyboard, frUi],
  ["Spanish", esAlerts, esKeyboard, esUi],
  ["Portuguese", ptAlerts, ptKeyboard, ptUi],
] as const

const remainingCatalogs = [
  ["French", frCountdown, frTutorial, frSong, frStore, frVerseEdit],
  ["Spanish", esCountdown, esTutorial, esSong, esStore, esVerseEdit],
  ["Portuguese", ptCountdown, ptTutorial, ptSong, ptStore, ptVerseEdit],
] as const

const translatedSettingsSections = [
  "account",
  "audio",
  "backup",
  "bible",
  "display",
  "help",
  "mediaLibrary",
  "privacy",
  "remote",
  "schedule",
  "songs",
  "sections",
  "dialog",
] as const

function expectMatchingKeys(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>
) {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort())

  for (const key of Object.keys(expected)) {
    const expectedValue = expected[key]
    const actualValue = actual[key]
    if (
      typeof expectedValue === "object" &&
      expectedValue !== null &&
      typeof actualValue === "object" &&
      actualValue !== null
    ) {
      expectMatchingKeys(
        actualValue as Record<string, unknown>,
        expectedValue as Record<string, unknown>
      )
    }
  }
}

describe("Phase 2 localization pilot catalogs", () => {
  it("resolves supported OS language tags and falls back to English", () => {
    expect(resolveSupportedLocale("fr-FR")).toBe("fr")
    expect(resolveSupportedLocale("es")).toBe("es")
    expect(resolveSupportedLocale("de-DE")).toBe("en")
    expect(resolveSupportedLocale(undefined)).toBe("en")
  })

  it.each(pilotCatalogs)(
    "has translated display and language strings for %s",
    (_locale, common, settings) => {
      expect(common.save).not.toBe("Save")
      expect(settings.language.label).not.toBe("Interface Language")
      expect(settings.display.detectionBehavior).not.toBe("Detection Behavior")
      expect(settings.display.confidenceThreshold.label).not.toBe(
        "Confidence Threshold"
      )
      expect(settings.sections.display.name).toBeTruthy()
      expect(settings.sections.language.name).toBeTruthy()
    }
  )

  it.each(pilotCatalogs)(
    "keeps the translated Settings section keys aligned for %s",
    (_locale, _common, settings) => {
      for (const section of translatedSettingsSections) {
        expectMatchingKeys(
          settings[section] as Record<string, unknown>,
          enSettings[section] as Record<string, unknown>
        )
      }
    }
  )

  it.each(pilotCatalogs)(
    "matches the complete English Settings catalog for %s",
    (_locale, _common, settings) => {
      expectMatchingKeys(
        settings as Record<string, unknown>,
        enSettings as Record<string, unknown>
      )
    }
  )

  it.each(pilotCatalogs)(
    "matches the complete English common catalog for %s",
    (_locale, common) => {
      expectMatchingKeys(common, enCommon)
    }
  )

  it.each(broadcastCatalogs)(
    "matches the English broadcast catalog keys for %s",
    (_locale, broadcast, broadcastOutput, controls) => {
      expectMatchingKeys(
        broadcast as Record<string, unknown>,
        enBroadcast as Record<string, unknown>
      )
      expectMatchingKeys(
        broadcastOutput as Record<string, unknown>,
        enBroadcastOutput as Record<string, unknown>
      )
      expectMatchingKeys(
        controls as Record<string, unknown>,
        enControls as Record<string, unknown>
      )
    }
  )

  it.each(mediaCatalogs)(
    "matches English keys in translated media-related catalogs for %s",
    (_locale, layout, media, props, shared, slides) => {
      expectMatchingKeys(layout, enLayout)
      expectMatchingKeys(media, enMedia)
      expectMatchingKeys(props, enProps)
      expectMatchingKeys(shared, enShared)
      expectMatchingKeys(slides, enSlides)
    }
  )

  it.each(schedulePanelCatalogs)(
    "matches English keys in Schedule and Panels catalogs for %s",
    (_locale, schedule, panels) => {
      expectMatchingKeys(schedule, enSchedule)
      expectMatchingKeys(panels, enPanels)
    }
  )

  it.each(sharedUiCatalogs)(
    "matches English keys in shared UI catalogs for %s",
    (_locale, alerts, keyboard, ui) => {
      expectMatchingKeys(alerts, enAlerts)
      expectMatchingKeys(keyboard, enKeyboard)
      expectMatchingKeys(ui, enUi)
    }
  )

  it.each(remainingCatalogs)(
    "matches English keys in the remaining Phase 2 catalogs for %s",
    (_locale, countdown, tutorial, song, store, verseEdit) => {
      expectMatchingKeys(countdown, enCountdown)
      expectMatchingKeys(tutorial, enTutorial)
      expectMatchingKeys(song, enSong)
      expectMatchingKeys(store, enStore)
      expectMatchingKeys(verseEdit, enVerseEdit)
    }
  )
})
