import type { FC, ReactNode } from "react"
import type { TFunction } from "i18next"

import {
  MicIcon,
  TvIcon,
  BookOpenIcon,
  RadioIcon,
  HelpCircleIcon,
  ListOrderedIcon,
  ImageIcon,
  MusicIcon,
  ShieldIcon,
  ArchiveIcon,
  UserCircleIcon,
  LanguagesIcon,
} from "lucide-react"

import type { SettingsSection } from "@/lib/settings-dialog"
import { isI18nUiEnabled } from "@/lib/i18n/config"

import { AccountSection } from "./sections/account-section"
import { AudioSection } from "./sections/audio-section"
import { BibleSection } from "./sections/bible-section"
import { DisplayModeSection } from "./sections/display-mode-section"
import { ScheduleSection } from "./sections/schedule-section"
import { MediaLibrarySection } from "./sections/media-library-section"
import { SongsSection } from "./sections/songs-section"
import { RemoteControlSection } from "./sections/remote-control-section"
import { BackupSection } from "./sections/backup-section"
import { PrivacySection } from "./sections/privacy-section"
import { HelpSection } from "./sections/help-section"
import { LanguageSection } from "./sections/language-section"

/**
 * Single source of truth for the settings sections. Replaces the three
 * hand-synced parallel maps (nav items / section titles / section components)
 * the dialog used to keep in lockstep: `name` is the sidebar label, `title`
 * the header, `icon` the sidebar glyph, `Component` the section body.
 */
export interface SettingsSectionDef {
  id: SettingsSection
  /** Sidebar navigation label. */
  name: string
  /** Header title shown above the active section. */
  title: string
  icon: ReactNode
  Component: FC
}

/**
 * Builds localized settings metadata at render time. Keeping translation out of
 * module scope means a language change updates the sidebar and header too.
 */
export function getSettingsSections(t: TFunction): SettingsSectionDef[] {
  return [
    {
      id: "account",
      name: t("sections.account.name"),
      title: t("sections.account.title"),
      icon: <UserCircleIcon strokeWidth={2} />,
      Component: AccountSection,
    },
    {
      id: "audio",
      name: t("sections.audio.name"),
      title: t("sections.audio.title"),
      icon: <MicIcon strokeWidth={2} />,
      Component: AudioSection,
    },
    {
      id: "bible",
      name: t("sections.bible.name"),
      title: t("sections.bible.title"),
      icon: <BookOpenIcon strokeWidth={2} />,
      Component: BibleSection,
    },
    {
      id: "display",
      name: t("sections.display.name"),
      title: t("sections.display.title"),
      icon: <TvIcon strokeWidth={2} />,
      Component: DisplayModeSection,
    },
    {
      id: "schedule",
      name: t("sections.schedule.name"),
      title: t("sections.schedule.title"),
      icon: <ListOrderedIcon strokeWidth={2} />,
      Component: ScheduleSection,
    },
    {
      id: "media",
      name: t("sections.media.name"),
      title: t("sections.media.title"),
      icon: <ImageIcon strokeWidth={2} />,
      Component: MediaLibrarySection,
    },
    {
      id: "songs",
      name: t("sections.songs.name"),
      title: t("sections.songs.title"),
      icon: <MusicIcon strokeWidth={2} />,
      Component: SongsSection,
    },
    {
      id: "remote",
      name: t("sections.remote.name"),
      title: t("sections.remote.title"),
      icon: <RadioIcon strokeWidth={2} />,
      Component: RemoteControlSection,
    },
    {
      id: "backup",
      name: t("sections.backup.name"),
      title: t("sections.backup.title"),
      icon: <ArchiveIcon strokeWidth={2} />,
      Component: BackupSection,
    },
    {
      id: "privacy",
      name: t("sections.privacy.name"),
      title: t("sections.privacy.title"),
      icon: <ShieldIcon strokeWidth={2} />,
      Component: PrivacySection,
    },
    {
      id: "help",
      name: t("sections.help.name"),
      title: t("sections.help.title"),
      icon: <HelpCircleIcon strokeWidth={2} />,
      Component: HelpSection,
    },
    ...(isI18nUiEnabled()
      ? [
          {
            id: "language" as const,
            name: t("sections.language.name"),
            title: t("sections.language.title"),
            icon: <LanguagesIcon strokeWidth={2} />,
            Component: LanguageSection,
          },
        ]
      : []),
  ]
}
