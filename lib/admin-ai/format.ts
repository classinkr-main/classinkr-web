import type { OrderAmount, OrderRisk, OrderTicket } from "./types"

/** 남은 시간을 m:ss 로. 올림 처리 — 0.4초 남았을 때 "0:00" 이 아니라 "0:01" 을 보인다. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`
}

export function formatSeconds(ms: number): string {
  return String(Math.max(0, Math.ceil(ms / 1000)))
}

const numberFormat = new Intl.NumberFormat("ko-KR")

export function formatAmountValue(value: number): string {
  return numberFormat.format(value)
}

/** 금액 변경 오더의 차액 줄 — 예: "−3,800,000 (−10%)". 이전 금액이 없으면 null. */
export function formatAmountDelta(amount: OrderAmount): string | null {
  if (amount.previous === undefined || amount.previous === amount.value) return null
  const diff = amount.value - amount.previous
  const sign = diff < 0 ? "−" : "+"
  const ratio = amount.previous === 0 ? null : Math.round((Math.abs(diff) / amount.previous) * 100)
  const percent = ratio === null ? "" : ` (${sign}${ratio}%)`
  return `${sign}${numberFormat.format(Math.abs(diff))}${percent}`
}

const RISK_NAMES: Record<OrderRisk, string> = {
  R0: "조회",
  R1: "등록",
  R2: "변경",
  R3: "발송",
  R4: "금지",
}

export function riskName(risk: OrderRisk, sensitive = false): string {
  return sensitive ? "민감" : RISK_NAMES[risk]
}

export function orderRiskName(order: Pick<OrderTicket, "risk" | "sensitive">): string {
  return riskName(order.risk, order.sensitive)
}

export function formatTimeOfDay(timestamp: number): string {
  const date = new Date(timestamp)
  const minutes = date.getMinutes()
  return `${date.getHours()}:${minutes < 10 ? "0" : ""}${minutes}`
}
