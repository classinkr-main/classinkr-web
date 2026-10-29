import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"
import { getMarketingRequestMeta } from "@/lib/marketing/server-conversions"

function requestFor(record: Record<string, unknown>, extraCookies = "") {
  const cookie = `cln_consent=${encodeURIComponent(JSON.stringify(record))}${extraCookies}`
  return new NextRequest("https://classin.co.kr/contact", { headers: { cookie } })
}

describe("서버 광고 전환 동의 경계", () => {
  const base = { v: CONSENT_POLICY_VERSION, analytics: true, marketing: true, ts: 1 }

  it("서버 확인 전 선택은 GA4 및 Meta 전환에 쓰지 않는다", () => {
    expect(getMarketingRequestMeta(requestFor({ ...base, s: 0 })).consent).toEqual({ analytics: false, marketing: false })
  })

  it("표식을 확인한 선택만 유효하며 표식 없는 기존 허용은 재선택을 요구한다", () => {
    const markers = "; cln_revoke_a=confirmed-a; cln_revoke_m=confirmed-m"
    expect(getMarketingRequestMeta(requestFor({ ...base, s: 1, ackAnalytics: "confirmed-a", ackMarketing: "confirmed-m" }, markers)).consent).toEqual({ analytics: true, marketing: true })
    expect(getMarketingRequestMeta(requestFor(base)).consent).toEqual({ analytics: false, marketing: false })
  })

  it("잘못된 문자열 값과 다른 정책 버전은 허용하지 않는다", () => {
    expect(getMarketingRequestMeta(requestFor({ ...base, analytics: "false", marketing: "false", s: 1 })).consent).toEqual({ analytics: false, marketing: false })
    expect(getMarketingRequestMeta(requestFor({ ...base, v: "old", s: 1 })).consent).toEqual({ analytics: false, marketing: false })
  })

  it("새 철회 표식은 오래된 허용 기록보다 우선하고, 이후 명시한 새 허용은 가능하다", () => {
    const markers = "; cln_revoke_a=a-later; cln_revoke_m=m-later"
    expect(getMarketingRequestMeta(requestFor({ ...base, s: 1 }, markers)).consent).toEqual({ analytics: false, marketing: false })
    expect(getMarketingRequestMeta(requestFor({ ...base, s: 1, ackAnalytics: "a-later", ackMarketing: "m-later" }, markers)).consent).toEqual({ analytics: true, marketing: true })
  })
})
