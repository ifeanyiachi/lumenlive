import { beforeEach, describe, expect, it, vi } from "vitest"
import type { BibleResource } from "@/types/resource-store"

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}))
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }))

import {
  fetchManifestJson,
  installBible,
  listInstalledBibles,
  onInstallProgress,
  removeBible,
} from "./resource-store-gateway"

function bible(overrides: Partial<BibleResource> = {}): BibleResource {
  return {
    kind: "bible",
    id: "web",
    title: "World English Bible",
    abbreviation: "WEB",
    language: "en",
    schemaVersion: 1,
    license: {
      name: "Public Domain",
      copyrighted: false,
      distribution: "bundled-free",
    },
    url: "https://cdn.example/web.db.zst",
    sha256: "a".repeat(64),
    bytes: 1234,
    ...overrides,
  }
}

beforeEach(() => {
  invokeMock.mockReset().mockResolvedValue(undefined)
  listenMock.mockReset()
})

describe("resource-store-gateway", () => {
  it("fetchManifestJson invokes store_fetch_manifest", async () => {
    invokeMock.mockResolvedValue("{}")
    await fetchManifestJson()
    expect(invokeMock).toHaveBeenCalledWith("store_fetch_manifest")
  })

  it("listInstalledBibles maps registry rows to InstalledResource", async () => {
    invokeMock.mockResolvedValue([
      {
        globalId: 1000,
        localId: 1,
        resourceId: "web",
        abbreviation: "WEB",
        title: "World English Bible",
        language: "en",
        license: "Public Domain",
        isCopyrighted: false,
        fileName: "web.db",
        schemaVersion: 1,
      },
    ])
    const installed = await listInstalledBibles()
    expect(invokeMock).toHaveBeenCalledWith("store_list_installed")
    expect(installed).toEqual([
      { id: "web", kind: "bible", schemaVersion: 1, refId: 1000 },
    ])
  })

  it("installBible passes the download descriptor as request", async () => {
    invokeMock.mockResolvedValue({
      globalId: 1000,
      abbreviation: "WEB",
      title: "World English Bible",
      language: "en",
    })
    await installBible(bible())
    expect(invokeMock).toHaveBeenCalledWith("store_install_bible", {
      request: {
        resourceId: "web",
        url: "https://cdn.example/web.db.zst",
        sha256: "a".repeat(64),
        bytes: 1234,
        license: "Public Domain",
        schemaVersion: 1,
      },
    })
  })

  it("removeBible invokes store_remove_bible with the global id", async () => {
    await removeBible(1000)
    expect(invokeMock).toHaveBeenCalledWith("store_remove_bible", {
      translationId: 1000,
    })
  })

  it("onInstallProgress forwards event payloads and returns the disposer", async () => {
    const dispose = vi.fn()
    let captured: ((e: { payload: unknown }) => void) | undefined
    listenMock.mockImplementation(
      async (_name: string, cb: typeof captured) => {
        captured = cb
        return dispose
      }
    )

    const handler = vi.fn()
    const returned = await onInstallProgress(handler)
    expect(listenMock).toHaveBeenCalledWith(
      "store:progress",
      expect.any(Function)
    )

    captured?.({ payload: { resourceId: "web", received: 5, total: 10 } })
    expect(handler).toHaveBeenCalledWith({
      resourceId: "web",
      received: 5,
      total: 10,
    })
    expect(returned).toBe(dispose)
  })
})
