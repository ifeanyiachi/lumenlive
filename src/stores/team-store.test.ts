import { beforeEach, describe, expect, it, vi } from "vitest"

const store = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  save: vi.fn(),
}

vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(async () => store),
}))

import { useTeamStore } from "./team-store"

const team = (id: string) => ({
  id,
  name: id,
  role: "member",
  seat: true,
  status: "active" as const,
  createdAt: "2026-09-22T00:00:00.000Z",
})

describe("team store", () => {
  beforeEach(() => {
    store.get.mockReset()
    store.set.mockReset()
    store.delete.mockReset()
    store.save.mockReset()
    useTeamStore.setState({ teams: [], selectedOrganizationId: null })
  })

  it("clears a persisted team when the server removes it", async () => {
    useTeamStore.setState({
      teams: [team("org-old")],
      selectedOrganizationId: "org-old",
    })

    await useTeamStore.getState().setTeams([team("org-new")])

    expect(useTeamStore.getState()).toMatchObject({
      teams: [team("org-new")],
      selectedOrganizationId: "org-new",
    })
  })

  it("does not persist an ambiguous selection for multiple teams", async () => {
    await useTeamStore.getState().setTeams([team("org-1"), team("org-2")])

    expect(useTeamStore.getState().selectedOrganizationId).toBeNull()
    expect(store.delete).toHaveBeenCalledWith("selectedOrganizationId")
  })

  it("rejects selecting a team that is not in the current server list", async () => {
    await useTeamStore.getState().setTeams([team("org-1")])
    await useTeamStore.getState().selectTeam("revoked-org")

    expect(useTeamStore.getState().selectedOrganizationId).toBe("org-1")
    expect(store.set).toHaveBeenCalledWith("selectedOrganizationId", "org-1")
  })
})
