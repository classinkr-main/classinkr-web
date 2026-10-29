import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"

import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"

const layout = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8")
const template = layout.match(/<Script id="consent-default"[\s\S]*?\{`([\s\S]*?)`\}/)?.[1]
if (!template) throw new Error("Consent Mode bootstrap script not found")

function consentUpdates(record: Record<string, unknown>, extraCookies = "", supported = true) {
  const cookie = `cln_consent=${encodeURIComponent(JSON.stringify(record))}${extraCookies}`
  const context: Record<string, unknown> = {
    document: { cookie }, decodeURIComponent,
    navigator: { locks: {} },
    crypto: { randomUUID: () => "uuid" },
    localStorage: { setItem: () => {}, removeItem: () => {} },
    cookieStore: supported ? { addEventListener: () => {}, removeEventListener: () => {} } : undefined,
  }
  context.window = context
  runInNewContext(template!.replace("${CONSENT_POLICY_VERSION}", CONSENT_POLICY_VERSION), context)
  return (context.dataLayer as IArguments[])
    .map((entry) => Array.from(entry))
    .filter((entry) => entry[0] === "consent" && entry[1] === "update")
}

describe("Consent Mode bootstrap", () => {
  it("서버 확인 전 선택은 허용 상태로 복원하지 않는다", () => {
    const updates = consentUpdates({ v: CONSENT_POLICY_VERSION, analytics: true, marketing: true, s: 0 })
    expect(updates[0]?.[2]).toMatchObject({ analytics_storage: "denied", ad_storage: "denied" })
  })

  it("서버 확인과 철회 표식이 일치한 선택만 복원한다", () => {
    const updates = consentUpdates({ v: CONSENT_POLICY_VERSION, analytics: true, marketing: false, s: 1, ackAnalytics: "a" }, "; cln_revoke_a=a; cln_revoke_m=m")
    expect(updates[0]?.[2]).toMatchObject({ analytics_storage: "granted", ad_storage: "denied" })
  })

  it("문자열 false와 같은 잘못된 값은 허용하지 않는다", () => {
    const updates = consentUpdates({ v: CONSENT_POLICY_VERSION, analytics: "false", marketing: "false", s: 1 })
    expect(updates[0]?.[2]).toMatchObject({ analytics_storage: "denied", ad_storage: "denied" })
  })

  it("부팅 시 새 철회 표식을 보지 못한 옛 허용은 복원하지 않는다", () => {
    const stale = consentUpdates({ v: CONSENT_POLICY_VERSION, analytics: true, marketing: true, s: 1 }, "; cln_revoke_a=a-later; cln_revoke_m=m-later")
    expect(stale[0]?.[2]).toMatchObject({ analytics_storage: "denied", ad_storage: "denied" })
    const current = consentUpdates({ v: CONSENT_POLICY_VERSION, analytics: true, marketing: true, s: 1, ackAnalytics: "a-later", ackMarketing: "m-later" }, "; cln_revoke_a=a-later; cln_revoke_m=m-later")
    expect(current[0]?.[2]).toMatchObject({ analytics_storage: "granted", ad_storage: "granted" })
  })

  it("한 카테고리의 철회는 나머지 카테고리의 확인된 허용을 유지한다", () => {
    const record = { v: CONSENT_POLICY_VERSION, analytics: true, marketing: true, s: 1, ackAnalytics: "a", ackMarketing: "m" }
    const analyticsRevoked = consentUpdates(record, "; cln_revoke_a=new-a; cln_revoke_m=m")
    expect(analyticsRevoked[0]?.[2]).toMatchObject({ analytics_storage: "denied", ad_storage: "granted" })
    const marketingRevoked = consentUpdates(record, "; cln_revoke_a=a; cln_revoke_m=new-m")
    expect(marketingRevoked[0]?.[2]).toMatchObject({ analytics_storage: "granted", ad_storage: "denied" })
  })

  it("표식이 만료되었거나 확인 상태가 잘못된 경우 허용하지 않는다", () => {
    const missing = consentUpdates({ v: CONSENT_POLICY_VERSION, analytics: true, marketing: true, s: 1, ackAnalytics: "a", ackMarketing: "m" })
    expect(missing[0]?.[2]).toMatchObject({ analytics_storage: "denied", ad_storage: "denied" })
    const malformed = consentUpdates({ v: CONSENT_POLICY_VERSION, analytics: true, marketing: true, s: "0", ackAnalytics: "a", ackMarketing: "m" }, "; cln_revoke_a=a; cln_revoke_m=m")
    expect(malformed[0]?.[2]).toMatchObject({ analytics_storage: "denied", ad_storage: "denied" })
  })

  it("쿠키 변경을 구독하지 못하는 브라우저는 기존 허용을 복원하지 않는다", () => {
    const record = { v: CONSENT_POLICY_VERSION, analytics: true, marketing: true, s: 1, ackAnalytics: "a", ackMarketing: "m" }
    expect(consentUpdates(record, "; cln_revoke_a=a; cln_revoke_m=m", false)).toEqual([])
  })
})
