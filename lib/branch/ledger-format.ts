// 장부 화면의 금액 글자 — 만 단위 표기는 이 파일 하나로 쓴다(F-44). 부호는 ¥ 앞("-¥19.5만"), 만으로 줄인 곳의
// 정확한 금액은 title 에 formatMoneyExact 로 싣는다. 비유한 값(NaN 등)은 0 으로 본다.

function finiteOrZero(value: number | null | undefined): number {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

/** 부호 없는 몸통 — 1만 이상은 만 단위(소수 한 자리까지, 천 단위 쉼표), 그 밖은 원 단위. */
function moneyBody(abs: number): string {
  if (abs >= 10_000) {
    return `${(abs / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만`
  }
  return abs.toLocaleString("ko-KR")
}

/** 보이는 글자가 0 이면 부호를 붙이지 않는다("-0" 방지). */
function signOf(numeric: number, body: string): string {
  return numeric < 0 && /[1-9]/.test(body) ? "-" : ""
}

/**
 * 만 단위 숫자 부분(¥ 없이) — "1,200만" · "19.5만" · "-19.5만" · "5,000". 표 칸처럼 ¥ 를 따로 그리는 곳에 쓴다.
 * plus 면 양수에 "+"를 붙인다(목표 대비 차이 등).
 */
export function formatMoneyAmount(value: number | null | undefined, options: { plus?: boolean } = {}): string {
  const numeric = finiteOrZero(value)
  const body = moneyBody(Math.abs(numeric))
  const sign = signOf(numeric, body)
  return `${sign || (options.plus && numeric > 0 ? "+" : "")}${body}`
}

/** 만 단위 금액 — "¥1,200만" · "-¥19.5만" · "¥5,000". */
export function formatMoney(value: number | null | undefined) {
  const numeric = finiteOrZero(value)
  const body = moneyBody(Math.abs(numeric))
  return `${signOf(numeric, body)}¥${body}`
}

/** 줄이지 않은 정확한 금액 — "¥1,234,567" · "-¥30,000"(소수는 둘째 자리까지). 만으로 줄인 곳의 title 용. */
export function formatMoneyExact(value: number | null | undefined) {
  const numeric = finiteOrZero(value)
  const body = Math.abs(numeric).toLocaleString("ko-KR", { maximumFractionDigits: 2 })
  return `${signOf(numeric, body)}¥${body}`
}

export function formatPercent(value: number | null | undefined) {
  return `${Number(value ?? 0).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`
}
