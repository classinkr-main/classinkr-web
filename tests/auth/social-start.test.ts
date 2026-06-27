import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { GET as naverStart } from "@/app/api/auth/naver/start/route"
import { GET as kakaoStart } from "@/app/api/auth/kakao/start/route"

function makeReq(path: string) {
  return new NextRequest(`http://localhost:3000${path}`)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("naver start route", () => {
  it("redirects to next with error when not configured", async () => {
    vi.stubEnv("NAVER_CLIENT_ID", "")
    const res = await naverStart(makeReq("/api/auth/naver/start?next=/premium"))
    const location = res.headers.get("location") ?? ""
    expect(location).toContain("/premium")
    expect(location).toContain("auth_error=naver_not_configured")
  })

  it("builds the Naver authorize URL and sets CSRF + next cookies", async () => {
    vi.stubEnv("NAVER_CLIENT_ID", "test-id")
    const res = await naverStart(makeReq("/api/auth/naver/start?next=/account"))
    const location = res.headers.get("location") ?? ""
    expect(location).toContain("https://nid.naver.com/oauth2.0/authorize")
    expect(location).toContain("response_type=code")
    expect(location).toContain("client_id=test-id")
    expect(location).toContain(
      `redirect_uri=${encodeURIComponent("http://localhost:3000/api/auth/naver/callback")}`
    )
    const state = res.cookies.get("cln_naver_oauth_state")?.value
    expect(state).toBeTruthy()
    expect(location).toContain(`state=${state}`)
    expect(res.cookies.get("cln_naver_oauth_next")?.value).toBe("/account")
  })

  it("rejects open-redirect next values", async () => {
    vi.stubEnv("NAVER_CLIENT_ID", "test-id")
    const res = await naverStart(makeReq("/api/auth/naver/start?next=//evil.com"))
    expect(res.cookies.get("cln_naver_oauth_next")?.value).toBe("/resources")
  })
})

describe("kakao start route", () => {
  it("redirects to next with error when not configured", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "")
    const res = await kakaoStart(makeReq("/api/auth/kakao/start?next=/premium"))
    const location = res.headers.get("location") ?? ""
    expect(location).toContain("/premium")
    expect(location).toContain("auth_error=kakao_not_configured")
  })

  it("builds the Kakao authorize URL with scope and sets cookies", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "test-key")
    const res = await kakaoStart(makeReq("/api/auth/kakao/start?next=/account"))
    const location = res.headers.get("location") ?? ""
    expect(location).toContain("https://kauth.kakao.com/oauth/authorize")
    expect(location).toContain("response_type=code")
    expect(location).toContain("client_id=test-key")
    expect(location).toContain(
      `redirect_uri=${encodeURIComponent("http://localhost:3000/api/auth/kakao/callback")}`
    )
    expect(location).toContain(
      `scope=${encodeURIComponent("account_email,profile_nickname")}`
    )
    const state = res.cookies.get("cln_kakao_oauth_state")?.value
    expect(state).toBeTruthy()
    expect(location).toContain(`state=${state}`)
    expect(res.cookies.get("cln_kakao_oauth_next")?.value).toBe("/account")
  })
})
