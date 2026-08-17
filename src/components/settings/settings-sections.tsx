import type { FC, ReactNode } from "react"

import {
  MicIcon,
  TvIcon,
  BookOpenIcon,
  PencilIcon,
  RadioIcon,
  HelpCircleIcon,
  BrainCircuitIcon,
  ListOrderedIcon,
  ImageIcon,
  MusicIcon,
} from "lucide-react"

import type { SettingsSection } from "@/lib/settings-dialog"

import { AudioSection } from "./sections/audio-section"
import { SpeechSection } from "./sections/speech-section"
import { BibleSection } from "./sections/bible-section"
import { SavedEditsSection } from "./sections/saved-edits-section"
import { DisplayModeSection } from "./sections/display-mode-section"
import { ScheduleSection } from "./sections/schedule-section"
import { MediaLibrarySection } from "./sections/media-library-section"
import { SongsSection } from "./sections/songs-section"
import { RemoteControlSection } from "./sections/remote-control-section"
import { HelpSection } from "./sections/help-section"

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

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  {
    id: "audio",
    name: "Audio",
    title: "Audio",
    icon: <MicIcon strokeWidth={2} />,
    Component: AudioSection,
  },
  {
    id: "speech",
    name: "Speech Recognition",
    title: "Speech Recognition",
    icon: <BrainCircuitIcon strokeWidth={2} />,
    Component: SpeechSection,
  },
  {
    id: "bible",
    name: "Bible",
    title: "Bible Translation",
    icon: <BookOpenIcon strokeWidth={2} />,
    Component: BibleSection,
  },
  {
    id: "saved-edits",
    name: "Saved Edits",
    title: "Saved Verse Edits",
    icon: <PencilIcon strokeWidth={2} />,
    Component: SavedEditsSection,
  },
  {
    id: "display",
    name: "Display Mode",
    title: "Display Mode",
    icon: <TvIcon strokeWidth={2} />,
    Component: DisplayModeSection,
  },
  {
    id: "schedule",
    name: "Schedule",
    title: "Schedule",
    icon: <ListOrderedIcon strokeWidth={2} />,
    Component: ScheduleSection,
  },
  {
    id: "media",
    name: "Media Library",
    title: "Media Library",
    icon: <ImageIcon strokeWidth={2} />,
    Component: MediaLibrarySection,
  },
  {
    id: "songs",
    name: "Songs",
    title: "Songs",
    icon: <MusicIcon strokeWidth={2} />,
    Component: SongsSection,
  },
  {
    id: "remote",
    name: "Remote Control",
    title: "Remote Control",
    icon: <RadioIcon strokeWidth={2} />,
    Component: RemoteControlSection,
  },
  {
    id: "help",
    name: "Help",
    title: "Help",
    icon: <HelpCircleIcon strokeWidth={2} />,
    Component: HelpSection,
  },
]

/** O(1) lookup for the active section during render. */
export const SETTINGS_SECTIONS_BY_ID: Record<
  SettingsSection,
  SettingsSectionDef
> = Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s.id, s])) as Record<
  SettingsSection,
  SettingsSectionDef
>
