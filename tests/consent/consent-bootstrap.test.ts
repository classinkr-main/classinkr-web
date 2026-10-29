import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"

import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"

const layout = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8")
const template = layout.match(/<Script id="consent-default"[\s\S]*?\{`([\s\S]*?)`\}/)?.[1]
if (!template) throw new Error("Consent Mode bootstrap script not found")

function consentUpdates(record: Record<string, unknown>) {
  const cookie = `cln_consent=${encodeURIComponent(JSON.stringify(record))}`
  const context: Record<string, unknown> = { document: { cookie }, decodeURIComponent }
  context.window = context
  runInNewContext(template!.replace("${CONSENT_POLICY_VERSION}", CONSENT_POLICY_VERSION), context)
  return (context.dataLayer as IArguments[])
    .map((entry) => Array.from(entry))
    .filter((entry) => entry[0] === "consent" && entry[1] === "update")
}

describe("Consent Mode bootstrap", () => {
  it("서버 확인 전 선택은 허용 상태로 복원하지 않는다", () => {
    expect(consentUpdates({ v: CONSENT_POLICY_VERSION, analytics: true, marketing: true, s: 0 })).toEqual([])
  })

  it("서버 확인된 선택은 복원한다", () => {
    expect(consentUpdates({ v: CONSENT_POLICY_VERSION, analytics: true, marketing: false, s: 1 }))
      .toHaveLength(1)
  })

  it("문자열 false와 같은 잘못된 값은 허용하지 않는다", () => {
    const updates = consentUpdates({ v: CONSENT_POLICY_VERSION, analytics: "false", marketing: "false", s: 1 })
    expect(updates[0]?.[2]).toMatchObject({ analytics_storage: "denied", ad_storage: "denied" })
  })
})
