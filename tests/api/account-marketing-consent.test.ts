import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const eq = vi.fn()
const update = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ update }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from })),
}))

// vi.hoisted so the mock fn is initialized before the hoisted vi.mock factory runs
// (the factory references it directly at module-load, unlike the deferred admin mock).
const { getPublicUserContext } = vi.hoisted(() => ({ getPublicUserContext: vi.fn() }))
vi.mock("@/lib/auth/public-user", () => ({
  getPublicUserContext,
}))

import { POST } from "@/app/api/account/marketing-consent/route"

function consentRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/account/marketing-consent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://classin.kr",
    },
    body: JSON.stringify(body),
  })
}

describe("account marketing-consent POST", () => {
  beforeEach(() => {
    from.mockClear()
    update.mockClear()
    eq.mockReset()
    eq.mockResolvedValue({ error: null })
    getPublicUserContext.mockReset()
  })

  it("returns 401 when not logged in", async () => {
    getPublicUserContext.mockResolvedValue(null)
    const res = await POST(consentRequest({ consent: true }))
    expect(res.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it("returns 400 when consent is missing or not boolean", async () => {
    getPublicUserContext.mockResolvedValue({ user: { id: "user-1" }, profile: {} })
    const res = await POST(consentRequest({ consent: "yes" }))
    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it("updates marketing_consent scoped by the logged-in user id", async () => {
    getPublicUserContext.mockResolvedValue({ user: { id: "user-1" }, profile: {} })
    const res = await POST(consentRequest({ consent: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, consent: true })
    expect(from).toHaveBeenCalledWith("user_profiles")
    expect(update).toHaveBeenCalledWith({ marketing_consent: true })
    expect(eq).toHaveBeenCalledWith("id", "user-1")
  })

  it("supports withdrawal with consent:false", async () => {
    getPublicUserContext.mockResolvedValue({ user: { id: "user-1" }, profile: {} })
    const res = await POST(consentRequest({ consent: false }))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ marketing_consent: false })
    expect(eq).toHaveBeenCalledWith("id", "user-1")
  })
})
