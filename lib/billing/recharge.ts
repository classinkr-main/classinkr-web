/**
 * 충전형 Business 선충전 금액 규칙 — 원화(KRW) 기준.
 *
 * 2026-07 전환: CNY 선충전 → KRW 선충전. 고객은 원화로 충전하고, 실제 사용 차감은
 * 위안화 단가표(BusinessRechargePanel 의 RATE_TABLE_ROWS)로 이루어진다.
 * 라이브 주문·견적코드·프로모가 전부 0행인 상태에서 전환했으므로 데이터 마이그레이션 없음.
 *
 * 구 CNY 값과의 대응(참고용, 전환 시점 환율 ≈ ₩190/CNY):
 *
 * | 항목      | 구 CNY      | 환산(≈₩190/CNY)  | 신 KRW      |
 * |-----------|-------------|------------------|-------------|
 * | 최소 충전 | ¥10,000     | ≈ ₩1,900,000     | ₩2,000,000  |
 * | 증분 단위 | ¥2,000      | ≈ ₩380,000       | ₩500,000    |
 * | 프리셋 1  | ¥10,000     | ≈ ₩1,900,000     | ₩2,000,000  |
 * | 프리셋 2  | ¥20,000     | ≈ ₩3,800,000     | ₩4,000,000  |
 * | 프리셋 3  | ¥50,000     | ≈ ₩9,500,000     | ₩10,000,000 |
 * | 프리셋 4  | ¥100,000    | ≈ ₩19,000,000    | ₩20,000,000 |
 * | 1회 상한  | ¥10,000,000 | ≈ ₩1,900,000,000 | ₩50,000,000 |
 *
 * 상한은 도입 신청 계약의 MAX_SOFTWARE_UNIT_AMOUNT(lib/checkout-requests.ts = ₩50,000,000)에
 * 맞췄다 — 그 위로는 온라인 결제 대신 수동 계약으로 안내한다.
 *
 * 금액 정책을 바꾸려면 이 객체의 숫자만 수정하면 된다. 검증(validateRechargeAmount)·
 * 표기(formatRechargeKrw)·주문명(buildRechargeOrderName)이 전부 여기서 파생된다.
 * 단, 모든 프리셋은 `(preset - baseMinKrw) % incrementKrw === 0` 을 만족해야 한다.
 */
export const BUSINESS_RECHARGE = {
  baseMinKrw: 2_000_000,
  incrementKrw: 500_000,
  presetsKrw: [2_000_000, 4_000_000, 10_000_000, 20_000_000] as const,
  maxKrw: 50_000_000, // 이 이상은 수동 계약(도입 신청) 경로로 안내
}

export type RechargeValidation =
  | { ok: true }
  | { ok: false; reason: string; suggested?: number }

export function formatRechargeKrw(amountKrw: number) {
  return `₩${Math.round(amountKrw).toLocaleString("ko-KR")}`
}

export function validateRechargeAmount(amountKrw: number): RechargeValidation {
  if (!Number.isFinite(amountKrw) || amountKrw <= 0) {
    return { ok: false, reason: "충전 금액을 입력해 주세요." }
  }

  if (amountKrw > BUSINESS_RECHARGE.maxKrw) {
    return {
      ok: false,
      reason: `1회 충전 상한은 ${formatRechargeKrw(
        BUSINESS_RECHARGE.maxKrw
      )} 입니다. 더 큰 금액은 담당자 계약으로 진행해 주세요.`,
      suggested: BUSINESS_RECHARGE.maxKrw,
    }
  }

  if (amountKrw < BUSINESS_RECHARGE.baseMinKrw) {
    return {
      ok: false,
      reason: `최초 충전은 ${formatRechargeKrw(BUSINESS_RECHARGE.baseMinKrw)} 부터 가능합니다.`,
      suggested: BUSINESS_RECHARGE.baseMinKrw,
    }
  }

  const excess = amountKrw - BUSINESS_RECHARGE.baseMinKrw
  if (excess % BUSINESS_RECHARGE.incrementKrw !== 0) {
    const nearestBelow =
      BUSINESS_RECHARGE.baseMinKrw +
      Math.floor(excess / BUSINESS_RECHARGE.incrementKrw) * BUSINESS_RECHARGE.incrementKrw
    const nearestAbove = nearestBelow + BUSINESS_RECHARGE.incrementKrw
    const suggested = amountKrw - nearestBelow < nearestAbove - amountKrw ? nearestBelow : nearestAbove
    return {
      ok: false,
      reason: `충전 금액은 ${formatRechargeKrw(
        BUSINESS_RECHARGE.baseMinKrw
      )} 이후 ${formatRechargeKrw(BUSINESS_RECHARGE.incrementKrw)} 단위로만 가능합니다.`,
      suggested,
    }
  }

  return { ok: true }
}

export function buildRechargeOrderName(amountKrw: number) {
  return `Classin Business 충전 · ${formatRechargeKrw(amountKrw)}`
}
