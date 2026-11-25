import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listInternalCsAssetsPastRetention: vi.fn(),
  purgeInternalCsAssetObject: vi.fn(),
  removeObject: vi.fn(),
}))

vi.mock("@/lib/repositories/internal-cs-chat", () => ({
  isInternalCsAssetStorageDeleted: (row: { metadata?: Record<string, unknown> }) =>
    typeof row.metadata?.storageDeletedAt === "string",
  listInternalCsAssetsPastRetention: mocks.listInternalCsAssetsPastRetention,
  // 실제 정리 함수는 저장소 객체를 지운다 — 여기서는 지운 경로만 기록하는 가짜 저장소를 쓴다.
  purgeInternalCsAssetObject: mocks.purgeInternalCsAssetObject,
}))

import { GET } from "@/app/api/cron/internal-cs-retention/route"

const DAY = 24 * 60 * 60 * 1000

function request(secret = "cron-secret-for-test") {
  return new NextRequest("https://classin.kr/api/cron/internal-cs-retention", {
    headers: { authorization: `Bearer ${secret}` },
  })
}

function asset(id: string, ageDays: number, metadata: Record<string, unknown> = {}) {
  return {
    id,
    conversation_id: "conversation-1",
    storage_path: `conversation-1/${id}.png`,
    created_at: new Date(Date.now() - ageDays * DAY).toISOString(),
    metadata,
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe("GET /api/cron/internal-cs-retention", () => {
  it("rejects requests without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-for-test")
    expect((await GET(request("wrong"))).status).toBe(401)
    expect(mocks.listInternalCsAssetsPastRetention).not.toHaveBeenCalled()
  })

  it("is off by default: without INTERNAL_CS_ASSET_RETENTION_DAYS nothing is listed or deleted", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-for-test")
    const response = await GET(request())
    expect(await response.json()).toMatchObject({ ok: true, enabled: false, deleted: 0 })
    expect(mocks.listInternalCsAssetsPastRetention).not.toHaveBeenCalled()
    expect(mocks.purgeInternalCsAssetObject).not.toHaveBeenCalled()
  })

  it("treats a malformed or zero period as off", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-for-test")
    for (const value of ["0", "-3", "abc", "10 days", ""]) {
      vi.stubEnv("INTERNAL_CS_ASSET_RETENTION_DAYS", value)
      expect((await (await GET(request())).json()).enabled, value).toBe(false)
    }
    expect(mocks.purgeInternalCsAssetObject).not.toHaveBeenCalled()
  })

  it("deletes only objects older than the period (and never re-deletes already deleted ones)", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-for-test")
    vi.stubEnv("INTERNAL_CS_ASSET_RETENTION_DAYS", "30")
    mocks.listInternalCsAssetsPastRetention.mockResolvedValue([
      asset("old-1", 45),
      asset("fresh", 5),
      asset("old-gone", 90, { storageDeletedAt: "2026-01-01T00:00:00.000Z" }),
      asset("old-2", 31),
    ])
    const removed: string[] = []
    mocks.purgeInternalCsAssetObject.mockImplementation(async (input: { assetId: string }) => {
      removed.push(input.assetId)
      return { id: input.assetId }
    })

    const response = await GET(request())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toMatchObject({ ok: true, enabled: true, retentionDays: 30, deleted: 2, failed: 0 })
    expect(removed.sort()).toEqual(["old-1", "old-2"])
    const cutoff = mocks.listInternalCsAssetsPastRetention.mock.calls[0][0].cutoff as Date
    expect(Math.abs(Date.now() - cutoff.getTime() - 30 * DAY)).toBeLessThan(5_000)
    expect(mocks.purgeInternalCsAssetObject).toHaveBeenCalledWith(expect.objectContaining({ reason: "retention" }))
  })

  it("keeps going when one object fails and reports it", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-for-test")
    vi.stubEnv("INTERNAL_CS_ASSET_RETENTION_DAYS", "7")
    mocks.listInternalCsAssetsPastRetention.mockResolvedValue([asset("a", 10), asset("b", 10)])
    mocks.purgeInternalCsAssetObject
      .mockRejectedValueOnce(new Error("storage down"))
      .mockResolvedValueOnce({ id: "b" })
    const response = await GET(request())
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ deleted: 1, failed: 1 })
  })
})
