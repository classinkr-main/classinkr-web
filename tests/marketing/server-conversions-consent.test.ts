import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"
import { getMarketingRequestMeta } from "@/lib/marketing/server-conversions"

function requestFor(record: Record<string, unknown>) {
  const cookie = `cln_consent=${encodeURIComponent(JSON.stringify(record))}`
  return new NextRequest("https://classin.co.kr/contact", { headers: { cookie } })
}

describe("서버 광고 전환 동의 경계", () => {
  const base = { v: CONSENT_POLICY_VERSION, analytics: true, marketing: true, ts: 1 }

  it("서버 확인 전 선택은 GA4 및 Meta 전환에 쓰지 않는다", () => {
    expect(getMarketingRequestMeta(requestFor({ ...base, s: 0 })).consent).toEqual({ analytics: false, marketing: false })
  })

  it("확인된 선택과 기존 쿠키는 유효하게 유지한다", () => {
    expect(getMarketingRequestMeta(requestFor({ ...base, s: 1 })).consent).toEqual({ analytics: true, marketing: true })
    expect(getMarketingRequestMeta(requestFor(base)).consent).toEqual({ analytics: true, marketing: true })
  })

  it("잘못된 문자열 값과 다른 정책 버전은 허용하지 않는다", () => {
    expect(getMarketingRequestMeta(requestFor({ ...base, analytics: "false", marketing: "false", s: 1 })).consent).toEqual({ analytics: false, marketing: false })
    expect(getMarketingRequestMeta(requestFor({ ...base, v: "old", s: 1 })).consent).toEqual({ analytics: false, marketing: false })
  })
})
