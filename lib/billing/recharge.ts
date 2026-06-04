export const BUSINESS_RECHARGE = {
  baseMinCny: 10000,
  incrementCny: 2000,
  presetsCny: [10000, 20000, 50000, 100000] as const,
  maxCny: 10_000_000, // 1천만 CNY 이상은 현실적으로 수동 계약
}

export type RechargeValidation =
  | { ok: true }
  | { ok: false; reason: string; suggested?: number }

export function validateRechargeAmount(amountCny: number): RechargeValidation {
  if (!Number.isFinite(amountCny) || amountCny <= 0) {
    return { ok: false, reason: "충전 금액을 입력해 주세요." }
  }

  if (amountCny > BUSINESS_RECHARGE.maxCny) {
    return {
      ok: false,
      reason: `1회 충전 상한은 ${BUSINESS_RECHARGE.maxCny.toLocaleString()} CNY 입니다.`,
    }
  }

  if (amountCny < BUSINESS_RECHARGE.baseMinCny) {
    return {
      ok: false,
      reason: `최초 충전은 ${BUSINESS_RECHARGE.baseMinCny.toLocaleString()} CNY 부터 가능합니다.`,
      suggested: BUSINESS_RECHARGE.baseMinCny,
    }
  }

  const excess = amountCny - BUSINESS_RECHARGE.baseMinCny
  if (excess % BUSINESS_RECHARGE.incrementCny !== 0) {
    const nearestBelow =
      BUSINESS_RECHARGE.baseMinCny +
      Math.floor(excess / BUSINESS_RECHARGE.incrementCny) * BUSINESS_RECHARGE.incrementCny
    const nearestAbove = nearestBelow + BUSINESS_RECHARGE.incrementCny
    const suggested = amountCny - nearestBelow < nearestAbove - amountCny ? nearestBelow : nearestAbove
    return {
      ok: false,
      reason: `충전 금액은 ${BUSINESS_RECHARGE.baseMinCny.toLocaleString()} CNY 이후 ${BUSINESS_RECHARGE.incrementCny.toLocaleString()} CNY 단위로만 가능합니다.`,
      suggested,
    }
  }

  return { ok: true }
}

export function formatCny(amountCny: number) {
  return `¥${Math.round(amountCny).toLocaleString("en-US")}`
}

export function buildRechargeOrderName(amountCny: number) {
  return `Classin Business 충전 · ${Math.round(amountCny).toLocaleString("en-US")} CNY`
}
