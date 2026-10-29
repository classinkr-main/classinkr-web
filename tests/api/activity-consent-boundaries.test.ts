import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({ material: vi.fn(), lookup: vi.fn(), access: vi.fn(), accessLog: vi.fn(), view: vi.fn() }))
vi.mock("@/lib/auth/public-user", () => ({ getPublicUserContext: async () => ({ user: { id: "user", email: "test@example.com" }, profile: { lead_id: "lead" } }) }))
vi.mock("@/lib/server/same-origin", () => ({ isCrossOriginRequest: () => false }))
vi.mock("@/lib/server/rate-limit", () => ({ getClientIp: () => "127.0.0.1", checkRateLimit: () => ({ allowed: true }), checkRateLimitDistributed: async () => ({ allowed: true }) }))
vi.mock("@/lib/identity/stitch", () => ({ resolveLeadIdForAnonymousId: mocks.lookup }))
vi.mock("@/lib/materials", () => ({ prepareMaterialDownload: mocks.material }))
vi.mock("@/lib/repositories/lead-magnets", () => ({ getLeadMagnetBySlugFromStore: async () => ({ published: true, gate: "open" }) }))
vi.mock("@/lib/premium/authorize", () => ({ authorizePremiumContentAccess: mocks.access }))
vi.mock("@/lib/premium/access-log", () => ({ recordPremiumAccessEvent: mocks.accessLog }))
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://example.org/file" }, error: null }) }) } }) }))
vi.mock("@/lib/seminars/catalog", () => ({ getSeminarBySlug: () => ({}) }))
vi.mock("@/lib/seminars/record-view", () => ({ recordSeminarView: mocks.view }))
import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"
import { CONSENT_OBSERVATION_HEADER, CONSENT_OBSERVATION_VERSION } from "@/lib/consent/observation-contract"
import { GET as materialGet, POST as materialPost } from "@/app/api/materials/[slug]/download/route"
import { POST as premiumPost } from "@/app/api/premium/[slug]/download/route"
import { POST as seminarPost } from "@/app/api/seminars/[slug]/view/route"

const context = { params: Promise.resolve({ slug: "test" }) }
function request(path: string, method: "POST" | "GET", observe: boolean, body?: object) {
  const consent = encodeURIComponent(JSON.stringify({ v: CONSENT_POLICY_VERSION, s: 1, analytics: true, marketing: false, ackAnalytics: "a", ts: 1 }))
  return new NextRequest(`https://classin.co.kr${path}`, { method, headers: {
    cookie: `cln_consent=${consent}; cln_revoke_a=a; cln_aid=anonymous-cookie`,
    ...(observe ? { [CONSENT_OBSERVATION_HEADER]: CONSENT_OBSERVATION_VERSION } : {}),
    ...(body ? { "content-type": "application/json" } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.material.mockResolvedValue({ destinationUrl: "https://example.org/file", signed: true, stored: true, magnet: { gate: "open" } })
  mocks.access.mockResolvedValue({ status: "allowed", content: { id: "c", slug: "test", content_type: "file", storage_path: "file" }, entitlement: { user_id: "user" } })
})
describe("자료 및 활동 익명 식별자 동의 경계", () => {
  it.each([false, true])("자료 POST는 동의 관찰 %s에 따라 cookie와 본문 ID를 제한하되 다운로드를 유지한다", async observe => {
    const res = await materialPost(request("/api/materials/test/download", "POST", observe, { anonymousId: "body-id" }), context)
    expect(res.status).toBe(200)
    expect(mocks.material).toHaveBeenCalledWith(expect.objectContaining({ anonymousId: observe ? "anonymous-cookie" : null, leadId: "lead" }))
  })
  it("자료 POST는 동의가 있어도 본문의 임의 ID로 타인의 활동을 연결하지 않는다", async () => {
    const consent = encodeURIComponent(JSON.stringify({ v: CONSENT_POLICY_VERSION, s: 1, analytics: true, marketing: false, ackAnalytics: "a", ts: 1 }))
    const req = new NextRequest("https://classin.co.kr/api/materials/test/download", { method: "POST", headers: {
      cookie: `cln_consent=${consent}; cln_revoke_a=a`, "content-type": "application/json",
      [CONSENT_OBSERVATION_HEADER]: CONSENT_OBSERVATION_VERSION,
    }, body: JSON.stringify({ anonymousId: "victim-id" }) })
    expect((await materialPost(req, context)).status).toBe(200)
    expect(mocks.material).toHaveBeenCalledWith(expect.objectContaining({ anonymousId: null, leadId: "lead" }))
  })
  it("구형 직접 GET 요청은 쿠키 ID를 연결하지 않으면서 다운로드를 유지한다", async () => {
    const res = await materialGet(request("/api/materials/test/download", "GET", false), context)
    expect(res.status).toBe(307)
    expect(mocks.material).toHaveBeenCalledWith(expect.objectContaining({ anonymousId: null, leadId: "lead" }))
  })
  it.each([false, true])("프리미엄 다운로드는 동의 관찰 %s에 따라 ID만 제한한다", async observe => {
    const res = await premiumPost(request("/api/premium/test/download", "POST", observe), context)
    expect(res.status).toBe(200)
    expect(mocks.access).toHaveBeenCalledWith("test", expect.objectContaining({ anonymous_id: observe ? "anonymous-cookie" : null }))
    expect(mocks.accessLog).toHaveBeenCalledWith(expect.objectContaining({ anonymous_id: observe ? "anonymous-cookie" : null, user_id: "user" }))
  })
  it.each([false, true])("영상 기록은 동의 관찰 %s에 따라 ID만 제한한다", async observe => {
    const res = await seminarPost(request("/api/seminars/test/view", "POST", observe), context)
    expect(res.status).toBe(200)
    expect(mocks.view).toHaveBeenCalledWith(expect.objectContaining({ anonymousId: observe ? "anonymous-cookie" : null, userId: "user" }))
  })
})
