// 충전형 Business 금액 규칙 회귀 — 2026-07 CNY → KRW 전환.
// 결제 금액을 만드는 유일한 진실원이라 경계값(최소/증분/상한)과 표기가 어긋나면
// 패널 검증·어드민 견적코드 발급·서버 주문 생성이 동시에 틀어진다.
import { describe, expect, it } from "vitest"

import {
  BUSINESS_RECHARGE,
  buildRechargeOrderName,
  formatRechargeKrw,
  validateRechargeAmount,
} from "@/lib/billing/recharge"

function reasonOf(amount: number) {
  const result = validateRechargeAmount(amount)
  return result.ok ? null : result.reason
}

describe("BUSINESS_RECHARGE 금액 체계", () => {
  it("원화 기준 값으로 고정되어 있다", () => {
    expect(BUSINESS_RECHARGE.baseMinKrw).toBe(2_000_000)
    expect(BUSINESS_RECHARGE.incrementKrw).toBe(500_000)
    expect(BUSINESS_RECHARGE.presetsKrw).toEqual([2_000_000, 4_000_000, 10_000_000, 20_000_000])
    expect(BUSINESS_RECHARGE.maxKrw).toBe(50_000_000)
  })

  it("모든 프리셋이 최소·증분 규칙을 스스로 만족한다", () => {
    // 프리셋 하나만 규칙을 벗어나도 사용자가 버튼을 눌렀는데 검증에서 막히는 상태가 된다.
    for (const preset of BUSINESS_RECHARGE.presetsKrw) {
      expect(validateRechargeAmount(preset)).toEqual({ ok: true })
    }
  })

  it("상한은 도입 신청 계약의 소프트웨어 단가 상한(₩50,000,000)과 정렬되어 있다", () => {
    // lib/checkout-requests.ts 의 MAX_SOFTWARE_UNIT_AMOUNT 와 같은 수. 어긋나면
    // 결제는 통과하는데 "결제 없이 도입 신청"만 금액이 잘려 접수된다.
    expect(BUSINESS_RECHARGE.maxKrw).toBe(50_000_000)
  })
})

describe("validateRechargeAmount — 경계값", () => {
  it("0·음수·NaN 은 금액 미입력으로 본다", () => {
    for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = validateRechargeAmount(amount)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe("충전 금액을 입력해 주세요.")
    }
  })

  it("최소 미만은 거부하고 최소 금액을 제안한다", () => {
    const result = validateRechargeAmount(1_999_999)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.suggested).toBe(BUSINESS_RECHARGE.baseMinKrw)
    expect(result.reason).toContain("₩2,000,000")
  })

  it("최소 금액 자체는 통과한다", () => {
    expect(validateRechargeAmount(BUSINESS_RECHARGE.baseMinKrw)).toEqual({ ok: true })
  })

  it("증분 단위에 맞으면 통과한다", () => {
    expect(validateRechargeAmount(2_500_000)).toEqual({ ok: true })
    expect(validateRechargeAmount(3_000_000)).toEqual({ ok: true })
    expect(validateRechargeAmount(49_500_000)).toEqual({ ok: true })
  })

  it("증분 단위를 벗어나면 가까운 쪽 금액을 제안한다", () => {
    const nearBelow = validateRechargeAmount(2_600_000)
    expect(nearBelow.ok).toBe(false)
    if (nearBelow.ok) return
    expect(nearBelow.suggested).toBe(2_500_000)

    const nearAbove = validateRechargeAmount(2_900_000)
    expect(nearAbove.ok).toBe(false)
    if (nearAbove.ok) return
    expect(nearAbove.suggested).toBe(3_000_000)
  })

  it("증분 오류 메시지는 최소·증분을 원화로 안내한다", () => {
    expect(reasonOf(2_600_000)).toBe(
      "충전 금액은 ₩2,000,000 이후 ₩500,000 단위로만 가능합니다."
    )
  })

  it("상한 자체는 통과하고, 1원이라도 넘으면 수동 계약으로 안내한다", () => {
    expect(validateRechargeAmount(BUSINESS_RECHARGE.maxKrw)).toEqual({ ok: true })

    const result = validateRechargeAmount(BUSINESS_RECHARGE.maxKrw + 1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain("₩50,000,000")
    expect(result.reason).toContain("담당자 계약")
    expect(result.suggested).toBe(BUSINESS_RECHARGE.maxKrw)
  })

  it("상한 초과는 증분 규칙보다 먼저 걸린다(안내가 뒤집히지 않는다)", () => {
    // 상한 초과 + 증분 위반이 동시에 걸린 금액에서 증분 메시지가 나오면 사용자가
    // "50만원 단위로 맞추면 되는구나"로 오해한다.
    expect(reasonOf(50_000_001)).toContain("1회 충전 상한")
  })

  it("구 CNY 규칙(최소 10,000 / 증분 2,000)은 더 이상 통과하지 않는다", () => {
    expect(validateRechargeAmount(10_000).ok).toBe(false)
    expect(validateRechargeAmount(12_000).ok).toBe(false)
  })
})

describe("표기", () => {
  it("formatRechargeKrw 는 ₩ + 천단위 구분자로 찍는다", () => {
    expect(formatRechargeKrw(2_000_000)).toBe("₩2,000,000")
    expect(formatRechargeKrw(500_000)).toBe("₩500,000")
    expect(formatRechargeKrw(0)).toBe("₩0")
  })

  it("소수는 원 단위로 반올림한다(Toss 승인 금액은 정수)", () => {
    expect(formatRechargeKrw(1_999_999.6)).toBe("₩2,000,000")
  })

  it("buildRechargeOrderName 은 원화 주문명을 만든다", () => {
    expect(buildRechargeOrderName(2_000_000)).toBe("Classin Business 충전 · ₩2,000,000")
    expect(buildRechargeOrderName(20_000_000)).toBe("Classin Business 충전 · ₩20,000,000")
  })

  it("주문명에 CNY 잔재가 남지 않는다", () => {
    const name = buildRechargeOrderName(BUSINESS_RECHARGE.baseMinKrw)
    expect(name).not.toContain("CNY")
    expect(name).not.toContain("¥")
  })
})
