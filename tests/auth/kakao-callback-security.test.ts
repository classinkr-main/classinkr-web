import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  existing: null as null | { id: string },
  issuedUserId: "new-user",
  createUser: vi.fn(),
  generateLink: vi.fn(),
  upsert: vi.fn(),
  stitch: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: mocks.existing }),
    }) }) }) }),
    auth: { admin: { createUser: mocks.createUser, generateLink: mocks.generateLink } },
  }),
}))
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { verifyOtp: async () => ({ data: { user: { id: mocks.issuedUserId, email: "identity@example.com" } }, error: null }) } }),
}))
vi.mock("@/lib/supabase/public-env", () => ({ getSupabaseBrowserEnv: () => ({ url: "https://example.com", publishableKey: "public" }) }))
vi.mock("@/lib/auth/public-user", () => ({ upsertPublicUserProfile: mocks.upsert }))
vi.mock("@/lib/identity/stitch", () => ({ stitchIdentity: mocks.stitch }))

import { GET } from "@/app/api/auth/kakao/callback/route"

beforeEach(() => {
  vi.stubEnv("KAKAO_REST_API_KEY", "example")
  mocks.existing = null
  mocks.issuedUserId = "new-user"
  mocks.createUser.mockReset().mockResolvedValue({ data: { user: { id: "new-user" } }, error: null })
  mocks.generateLink.mockReset().mockResolvedValue({ data: { properties: { hashed_token: "test" } }, error: null })
  mocks.upsert.mockReset().mockResolvedValue({ lead_id: null, email: "identity@example.com" })
  mocks.stitch.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function callback(verified: boolean) {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(Response.json({ access_token: "test" }))
    .mockResolvedValueOnce(Response.json({ id: 123, kakao_account: { email: "victim@example.com", is_email_verified: verified, is_email_valid: verified } })))
  return new NextRequest("http://localhost:3000/api/auth/kakao/callback?code=test&state=valid", {
    headers: { cookie: "cln_kakao_oauth_state=valid" },
  })
}

describe("Kakao identity isolation", () => {
  it("never issues an existing email identity for an unverified provider address", async () => {
    const response = await GET(callback(false))
    expect(response.headers.get("location")).not.toContain("auth_error")
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "kakao_123@kakao.invalid", email_confirm: true }))
    expect(mocks.generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "kakao_123@kakao.invalid" })
  })

  it("allows a verified email when the session matches the linked account", async () => {
    mocks.existing = { id: "new-user" }
    const response = await GET(callback(true))
    expect(response.headers.get("location")).not.toContain("auth_error")
    expect(mocks.generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "victim@example.com" })
  })

  it("rejects a session for a different account than the existing provider link", async () => {
    mocks.existing = { id: "linked-user" }
    vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await GET(callback(false))
    expect(response.headers.get("location")).toContain("auth_error=kakao_failed")
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})
