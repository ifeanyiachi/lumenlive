import { create } from "zustand"
import { load } from "@tauri-apps/plugin-store"

import type { DesktopTeam } from "@/services/lumenbo-client"

const TEAM_FILE = "teams.json"

interface TeamState {
  teams: DesktopTeam[]
  selectedOrganizationId: string | null
  setTeams: (teams: DesktopTeam[]) => Promise<void>
  selectTeam: (organizationId: string) => Promise<void>
  hydrate: () => Promise<void>
  clear: () => Promise<void>
}

async function persistSelection(organizationId: string | null) {
  try {
    const store = await load(TEAM_FILE, { autoSave: false })
    if (organizationId) {
      await store.set("selectedOrganizationId", organizationId)
    } else {
      await store.delete("selectedOrganizationId")
    }
    await store.save()
  } catch {
    console.warn("[teams] failed to persist selected team")
  }
}

export const useTeamStore = create<TeamState>((set, get) => ({
  teams: [],
  selectedOrganizationId: null,

  setTeams: async (teams) => {
    const current = get().selectedOrganizationId
    const selected = teams.some((team) => team.id === current)
      ? current
      : teams.length === 1
        ? (teams[0]?.id ?? null)
        : null
    set({ teams, selectedOrganizationId: selected })
    await persistSelection(selected)
  },

  selectTeam: async (organizationId) => {
    if (!get().teams.some((team) => team.id === organizationId)) return
    set({ selectedOrganizationId: organizationId })
    await persistSelection(organizationId)
  },

  hydrate: async () => {
    try {
      const store = await load(TEAM_FILE, { autoSave: false })
      const selectedOrganizationId =
        (await store.get<string>("selectedOrganizationId")) ?? null
      set({ selectedOrganizationId })
    } catch {
      console.warn("[teams] failed to hydrate selected team")
    }
  },

  clear: async () => {
    set({ teams: [], selectedOrganizationId: null })
    await persistSelection(null)
  },
}))
