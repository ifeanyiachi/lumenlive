import { beforeEach, describe, expect, it, vi } from "vitest"

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }))

import { useOfflineSttStore } from "./offline-stt-store"
import { OFFLINE_STT_MODEL_IDS } from "@/services/offline-stt-gateway"

const status = {
  id: OFFLINE_STT_MODEL_IDS.nemotron,
  title: "Nemotron",
  version: "1",
  installed: false,
  bytes: 0,
}

beforeEach(() => {
  invokeMock.mockReset()
  listenMock.mockReset()
  useOfflineSttStore.setState({
    models: {
      nemotron: {
        status: { ...status },
        busy: false,
        progress: 0,
        error: null,
      },
      nemotron35: {
        status: { ...status, id: OFFLINE_STT_MODEL_IDS.nemotron35 },
        busy: false,
        progress: 0,
        error: null,
      },
    },
  })
})

describe("offline STT store", () => {
  it("keeps download progress in shared state while the UI is unmounted", async () => {
    let onProgress: ((event: { payload: unknown }) => void) | undefined
    let resolveInstall: ((value: typeof status) => void) | undefined

    listenMock.mockImplementation(
      async (_name: string, handler: typeof onProgress) => {
        onProgress = handler
        return vi.fn()
      }
    )
    invokeMock.mockImplementation((command: string) => {
      if (command === "offline_stt_install_model") {
        return new Promise<typeof status>((resolve) => {
          resolveInstall = resolve
        })
      }
      return Promise.resolve(status)
    })

    const install = useOfflineSttStore.getState().startDownload("nemotron")
    await vi.waitFor(() => expect(onProgress).toBeDefined())

    onProgress?.({
      payload: {
        resourceId: OFFLINE_STT_MODEL_IDS.nemotron,
        received: 25,
        total: 100,
      },
    })

    expect(useOfflineSttStore.getState().models.nemotron).toMatchObject({
      busy: true,
      progress: 0.25,
    })

    resolveInstall?.({ ...status, installed: true, bytes: 100 })
    await install
    expect(useOfflineSttStore.getState().models.nemotron).toMatchObject({
      busy: false,
      progress: 1,
      status: { installed: true },
    })
  })
})
