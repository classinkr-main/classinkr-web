import { describe, expect, it } from "vitest"

import {
  COMPASS_CARE_STAGE_LABEL,
  COMPASS_STAGE_LABEL,
  compassLeadUrl,
  normalizePhoneKey,
} from "@/lib/compass/normalize"

describe("normalizePhoneKey", () => {
  it("keeps domestic 010 numbers as-is (digits only)", () => {
    expect(normalizePhoneKey("010-1234-5678")).toBe("01012345678")
    expect(normalizePhoneKey("01012345678")).toBe("01012345678")
  })

  it("converts 0082 country-code format (Compass display format)", () => {
    // 실측: Compass UI는 0082-1090152356 형태를 쓴다
    expect(normalizePhoneKey("0082-1090152356")).toBe("01090152356")
  })

  it("converts bare 82 country-code format (admin webhook format)", () => {
    // 실측: public.leads 201/213건이 8210… 형태였다
    expect(normalizePhoneKey("821012345678")).toBe("01012345678")
    expect(normalizePhoneKey("+82 10-1234-5678")).toBe("01012345678")
  })

  it("returns null for empty or non-numeric input", () => {
    expect(normalizePhoneKey("")).toBeNull()
    expect(normalizePhoneKey(null)).toBeNull()
    expect(normalizePhoneKey(undefined)).toBeNull()
    expect(normalizePhoneKey("asdf")).toBeNull()
  })

  it("matches the SQL expression semantics: strip → ^0082→82 → ^82→0", () => {
    // 규칙이 뷰(compass_leads_v)와 어긋나면 조인이 조용히 빈다 — 이 순서 자체가 계약이다
    expect(normalizePhoneKey("0082 10 1234 5678")).toBe("01012345678")
    // 0082 치환이 먼저라 0082…는 82…를 거쳐 0…이 된다(이중 치환 아님)
    expect(normalizePhoneKey("00821012345678")).toBe("01012345678")
  })
})

describe("compass label vocabularies", () => {
  it("covers the live crm.stages keys (2026-08-28 실측)", () => {
    for (const key of ["new", "contact", "consult", "demo", "quote", "bd", "won", "lost"]) {
      expect(COMPASS_STAGE_LABEL[key]).toBeTruthy()
    }
  })

  it("covers the live care_stage keys", () => {
    for (const key of ["member", "leader", "ceo", "paid", "closed"]) {
      expect(COMPASS_CARE_STAGE_LABEL[key]).toBeTruthy()
    }
  })
})

describe("compassLeadUrl", () => {
  it("builds the ?open= deep link (라이브 확인된 파라미터)", () => {
    expect(compassLeadUrl(771)).toBe("https://mkt.classin.co.kr/leads?open=771")
  })
})
