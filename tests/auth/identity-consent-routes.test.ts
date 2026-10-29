import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"
import { CONSENT_OBSERVATION_HEADER, CONSENT_OBSERVATION_VERSION } from "@/lib/consent/observation-contract"

const mocks = vi.hoisted(() => ({ stitch: vi.fn(), upsert: vi.fn(), context: vi.fn() }))
const user = { id: "user-1", email: "user@example.com", email_confirmed_at: "2026-01-01" }
vi.mock("server-only", () => ({}))
vi.mock("@/lib/identity/stitch", () => ({ stitchIdentity: mocks.stitch }))
vi.mock("@/lib/auth/public-user", () => ({ upsertPublicUserProfile: mocks.upsert, getPublicUserContext: mocks.context }))
vi.mock("@/lib/server/same-origin", () => ({ isCrossOriginRequest: () => false }))
vi.mock("@/lib/server/rate-limit", () => ({ getClientIp: () => "test", checkRateLimitDistributed: async () => ({ allowed: true }) }))
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: {
  exchangeCodeForSession: async () => ({ data: { user }, error: null }),
  verifyOtp: async () => ({ data: { user }, error: null }),
} }) }))
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
  auth: { admin: {
    createUser: async () => ({ data: { user }, error: null }),
    generateLink: async () => ({ data: { properties: { hashed_token: "token" } }, error: null }),
  } },
}) }))
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { verifyOtp: async () => ({ data: { user }, error: null }) } }) }))
vi.mock("@/lib/supabase/public-env", () => ({ getSupabaseBrowserEnv: () => ({ url: "https://example.com", publishableKey: "public" }) }))

import { POST as identify } from "@/app/api/identify/route"
import { GET as callback } from "@/app/auth/callback/route"
import { GET as confirm } from "@/app/auth/confirm/route"
import { GET as naver } from "@/app/api/auth/naver/callback/route"

beforeEach(() => {
  mocks.stitch.mockReset().mockResolvedValue({ ok: true })
  mocks.upsert.mockReset().mockResolvedValue({ lead_id: "lead-1", email: user.email })
  mocks.context.mockReset().mockResolvedValue({ user, profile: { lead_id: "lead-1", email: user.email } })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const cookie = (analytics: boolean) => `cln_aid=old-id; cln_revoke_a=a; cln_consent=${encodeURIComponent(JSON.stringify({ v: CONSENT_POLICY_VERSION, analytics, marketing: false, s: 1, ts: 1, ackAnalytics: "a" }))}`

describe("identity linkage and analytics consent", () => {
  it.each([
    [false, true, null], [true, false, null], [true, true, "old-id"],
  ])("identify applies analytics choice %s and observation signal %s", async (analytics, observation, expected) => {
    const req = new NextRequest("https://classin.co.kr/api/identify", { method: "POST", headers: {
      cookie: cookie(analytics), ...(observation ? { [CONSENT_OBSERVATION_HEADER]: CONSENT_OBSERVATION_VERSION } : {}),
    } })
    expect((await identify(req)).status).toBe(200)
    expect(mocks.stitch).toHaveBeenCalledWith(expect.objectContaining({ anonymousId: expected, userId: user.id, leadId: "lead-1" }))
  })

  it.each([
    ["OAuth callback", callback, "/auth/callback?code=ok"],
    ["email confirmation", confirm, "/auth/confirm?token_hash=ok&type=signup"],
  ])("%s retains account linking but ignores stale anonymous ID", async (_label, handler, url) => {
    const response = await handler(new NextRequest(`https://classin.co.kr${url}`, { headers: { cookie: cookie(true) } }))
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).not.toContain("auth_error")
    expect(mocks.stitch).toHaveBeenCalledWith(expect.objectContaining({ anonymousId: null, userId: user.id, leadId: "lead-1", emailVerified: true }))
  })

  it("Naver login keeps account linking without joining a stale anonymous ID", async () => {
    vi.stubEnv("NAVER_CLIENT_ID", "test")
    vi.stubEnv("NAVER_CLIENT_SECRET", "test")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ access_token: "test" }))
      .mockResolvedValueOnce(Response.json({ response: { id: "123", email: user.email } })))
    const response = await naver(new NextRequest("https://classin.co.kr/api/auth/naver/callback?code=ok&state=valid", { headers: {
      cookie: `${cookie(true)}; cln_naver_oauth_state=valid`,
    } }))
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).not.toContain("auth_error")
    expect(mocks.stitch).toHaveBeenCalledWith(expect.objectContaining({ anonymousId: null, userId: user.id, leadId: "lead-1", emailVerified: false }))
  })
})
