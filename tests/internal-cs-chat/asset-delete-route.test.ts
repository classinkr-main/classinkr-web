import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  purgeInternalCsAssetObject: vi.fn(),
}))

vi.mock("@/lib/admin-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin-auth")>()),
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))
vi.mock("@/lib/repositories/internal-cs-chat", () => ({
  isInternalCsChatNotReadyError: () => false,
  purgeInternalCsAssetObject: mocks.purgeInternalCsAssetObject,
  reviewInternalCsAsset: vi.fn(),
}))

import { DELETE } from "@/app/api/admin/cs-chat/conversations/[id]/assets/[assetId]/route"

const context = { params: Promise.resolve({ id: "conversation-1", assetId: "asset-1" }) }
const request = () =>
  new NextRequest("https://classin.kr/api/admin/cs-chat/conversations/conversation-1/assets/asset-1", { method: "DELETE" })

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe("DELETE cs-chat asset capability", () => {
  it("lets every copilot role delete by default (roles unchanged)", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "EDITOR", userId: "u1", capabilities: [] })
    mocks.purgeInternalCsAssetObject.mockResolvedValue({ id: "asset-1" })
    const response = await DELETE(request(), context)
    expect(response.status).toBe(200)
    expect(mocks.purgeInternalCsAssetObject).toHaveBeenCalledTimes(1)
  })

  it("with the strict switch requires an explicit cs.asset.delete grant", async () => {
    vi.stubEnv("CS_COPILOT_STRICT_CAPABILITIES", "1")
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", userId: "u1", capabilities: [] })
    const denied = await DELETE(request(), context)
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({ requiredCapability: "cs.asset.delete" })
    expect(mocks.purgeInternalCsAssetObject).not.toHaveBeenCalled()

    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", userId: "u1", capabilities: ["cs.asset.delete"] })
    mocks.purgeInternalCsAssetObject.mockResolvedValue({ id: "asset-1" })
    expect((await DELETE(request(), context)).status).toBe(200)
  })
})
