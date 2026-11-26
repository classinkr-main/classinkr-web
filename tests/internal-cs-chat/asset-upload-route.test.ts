import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  checkRateLimitDistributed: vi.fn(),
  getInternalCsConversation: vi.fn(),
  uploadInternalCsAsset: vi.fn(),
  findInternalCsAssetByHash: vi.fn(),
  createInternalCsAsset: vi.fn(),
  getInternalCsAsset: vi.fn(),
  updateInternalCsAssetAnalysis: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CS_COPILOT_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))
vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimitDistributed: mocks.checkRateLimitDistributed,
  getClientIp: () => "203.0.113.9",
}))
vi.mock("@/lib/repositories/internal-cs-chat", () => ({
  createInternalCsAsset: mocks.createInternalCsAsset,
  findInternalCsAssetByHash: mocks.findInternalCsAssetByHash,
  getInternalCsAsset: mocks.getInternalCsAsset,
  isInternalCsAssetStorageDeleted: (row: { metadata?: Record<string, unknown> }) => typeof row.metadata?.storageDeletedAt === "string",
  getInternalCsConversation: mocks.getInternalCsConversation,
  isInternalCsChatNotReadyError: () => false,
  updateInternalCsAssetAnalysis: mocks.updateInternalCsAssetAnalysis,
}))
vi.mock("@/lib/storage/internal-cs-assets", () => ({
  INTERNAL_CS_ASSET_MAX_BYTES: 8 * 1024 * 1024,
  uploadInternalCsAsset: mocks.uploadInternalCsAsset,
}))
vi.mock("@/lib/internal-cs-chat/vision", () => ({ analyzeInternalCsImage: vi.fn() }))

import { POST } from "@/app/api/admin/cs-chat/conversations/[id]/assets/route"

const context = { params: Promise.resolve({ id: "conversation-1" }) }

function request() {
  const form = new FormData()
  form.set("file", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }))
  return new NextRequest("https://classin.kr/api/admin/cs-chat/conversations/conversation-1/assets", {
    method: "POST",
    body: form,
  })
}

afterEach(() => vi.clearAllMocks())

describe("POST cs-chat assets rate limit", () => {
  it("counts uploads per account, not per shared office IP", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", userId: "user-42", name: "담당자" })
    mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: false })
    const response = await POST(request(), context)
    expect(response.status).toBe(429)
    expect(mocks.checkRateLimitDistributed).toHaveBeenCalledWith(
      "user-42",
      "admin-internal-cs-asset-upload",
      expect.objectContaining({ max: 20 })
    )
    expect(mocks.getInternalCsConversation).not.toHaveBeenCalled()
  })

  it("falls back to the client IP only when the account has no id or name", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN" })
    mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: false })
    await POST(request(), context)
    expect(mocks.checkRateLimitDistributed.mock.calls[0][0]).toBe("203.0.113.9")
  })
})

describe("POST cs-chat assets re-upload of a deleted attachment", () => {
  it("does not answer with the deleted row as a duplicate; it goes on to revive it through createInternalCsAsset", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", userId: "user-42", name: "담당자" })
    mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: true })
    mocks.getInternalCsConversation.mockResolvedValue({ id: "conversation-1" })
    mocks.uploadInternalCsAsset.mockResolvedValue({
      ok: true, path: "conversation-1/h.png", fileName: "a.png", mimeType: "image/png", sizeBytes: 3, sha256: "a".repeat(64), reused: false,
    })
    mocks.findInternalCsAssetByHash.mockResolvedValue({ id: "asset-1", metadata: { storageDeletedAt: "2026-11-01T00:00:00.000Z" } })
    mocks.createInternalCsAsset.mockRejectedValue(new Error("stop here"))
    await POST(request(), context).catch(() => undefined)
    expect(mocks.createInternalCsAsset).toHaveBeenCalledTimes(1)
    expect(mocks.getInternalCsAsset).not.toHaveBeenCalled()
  })
})
