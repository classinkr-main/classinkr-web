import { describe, expect, it } from "vitest"

import {
  parseUnifiedCustomerKeyList,
  parseUnifiedCustomerTargetKey,
  unifiedCustomerStorageKey,
} from "@/lib/crm/unified-customer-key"

// 통합 고객 행 키(lead:/neo:/customer:) → 쓰기 대상. 일괄 태그·할 일 라우트의 키 계약을 고정한다.

const LEAD_ID = "3f2b9c1e-8a4d-4c2e-9f10-1234567890ab"
const CUSTOMER_ID = "a1b2c3d4-e5f6-4789-8abc-def012345678"

describe("parseUnifiedCustomerTargetKey", () => {
  it("통합 목록의 세 키 형식을 target_type 으로 옮긴다(neo → neo_account)", () => {
    expect(parseUnifiedCustomerTargetKey(`lead:${LEAD_ID}`)).toEqual({
      key: `lead:${LEAD_ID}`,
      targetType: "lead",
      targetId: LEAD_ID,
    })
    expect(parseUnifiedCustomerTargetKey("neo:acc-1")).toEqual({
      key: "neo:acc-1",
      targetType: "neo_account",
      targetId: "acc-1",
    })
    expect(parseUnifiedCustomerTargetKey(`customer:${CUSTOMER_ID}`)).toEqual({
      key: `customer:${CUSTOMER_ID}`,
      targetType: "customer",
      targetId: CUSTOMER_ID,
    })
  })

  it("customer: 키를 받는다 — 360 파서(parseUnifiedCustomerKey)와 다른 점", () => {
    expect(parseUnifiedCustomerTargetKey(`customer:${CUSTOMER_ID}`)?.targetType).toBe("customer")
  })

  it("neo 계정 id 안의 ':' 는 첫 ':' 이후 전부 id 로 본다", () => {
    expect(parseUnifiedCustomerTargetKey("neo:a:b:c")).toMatchObject({ targetType: "neo_account", targetId: "a:b:c" })
  })

  it("앞뒤 공백을 떼고, lead·customer UUID 는 소문자로 맞춘다", () => {
    expect(parseUnifiedCustomerTargetKey(`  lead:${LEAD_ID.toUpperCase()}  `)).toEqual({
      key: `lead:${LEAD_ID}`,
      targetType: "lead",
      targetId: LEAD_ID,
    })
  })

  it("형식이 맞지 않으면 null", () => {
    const invalid: unknown[] = [
      "",
      "lead",
      "lead:",
      ":abc",
      "neo:   ",
      "lead:not-a-uuid",
      "customer:123",
      "LEAD:" + LEAD_ID, // 접두는 소문자만(행 키 그대로)
      "neo_account:acc-1", // 저장 키(target_type)는 행 키가 아니다
      "deal:" + LEAD_ID,
      "unknown:" + LEAD_ID,
      'neo:acc"1',
      "neo:acc\\1",
      "neo:acc\n1",
      "neo:" + "x".repeat(201),
      42,
      null,
      undefined,
      { key: "lead:" + LEAD_ID },
    ]
    for (const value of invalid) {
      expect(parseUnifiedCustomerTargetKey(value), String(value)).toBeNull()
    }
  })

  it("저장 키는 target_type 기준이다(통합 목록 태그 맵 키와 같다)", () => {
    const parsed = parseUnifiedCustomerTargetKey("neo:acc-1")
    expect(parsed && unifiedCustomerStorageKey(parsed)).toBe("neo_account:acc-1")
  })
})

describe("parseUnifiedCustomerKeyList", () => {
  it("배열이 아니면 not_array", () => {
    expect(parseUnifiedCustomerKeyList("lead:x", 10)).toMatchObject({ ok: false, reason: "not_array" })
    expect(parseUnifiedCustomerKeyList(undefined, 10)).toMatchObject({ ok: false, reason: "not_array" })
  })

  it("중복·빈 문자열을 뺀 뒤 0개면 empty", () => {
    expect(parseUnifiedCustomerKeyList([], 10)).toMatchObject({ ok: false, reason: "empty" })
    expect(parseUnifiedCustomerKeyList(["", "   "], 10)).toMatchObject({ ok: false, reason: "empty" })
  })

  it("상한은 중복 제거 후 개수로 판정한다", () => {
    const keys = Array.from({ length: 3 }, (_, i) => `neo:acc-${i}`)
    // 6개가 들어와도 고유 3개면 상한 3 안이다.
    expect(parseUnifiedCustomerKeyList([...keys, ...keys], 3)).toMatchObject({ ok: true, requested: 3 })
    expect(parseUnifiedCustomerKeyList([...keys, "neo:acc-9"], 3)).toMatchObject({
      ok: false,
      reason: "too_many",
      limit: 3,
    })
  })

  it("해석 못 하는 키는 invalid 로 모으고, 같은 대상은 하나로 합친다(입력 순서 유지)", () => {
    const result = parseUnifiedCustomerKeyList(
      [
        `lead:${LEAD_ID}`,
        "bogus",
        `lead:${LEAD_ID.toUpperCase()}`,
        "neo:acc-1",
        " neo:acc-1 ",
        7,
        `customer:${CUSTOMER_ID}`,
      ],
      10
    )
    expect(result).toEqual({
      ok: true,
      requested: 6,
      invalid: ["bogus", "7"],
      targets: [
        { key: `lead:${LEAD_ID}`, targetType: "lead", targetId: LEAD_ID },
        { key: "neo:acc-1", targetType: "neo_account", targetId: "acc-1" },
        { key: `customer:${CUSTOMER_ID}`, targetType: "customer", targetId: CUSTOMER_ID },
      ],
    })
  })

  it("invalid 로 되돌리는 원본 키는 길이를 제한한다", () => {
    const result = parseUnifiedCustomerKeyList(["x".repeat(500)], 10)
    expect(result.ok && result.invalid[0].length).toBeLessThanOrEqual(201)
  })
})
