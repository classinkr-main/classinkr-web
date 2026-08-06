// CRM 금액 표기 공용 규약.
// Neo CRM(샤오쇼우이) 동기화 값의 통화는 출처별로 고정돼 있다:
//   - 잔액 / 수금(Collection) / 성과(SalesPerformance) → 위안화(CNY, ¥ 만단위 2자리)
//   - 오더(Opportunity) → 달러($)
// 동일 규약이 NeoCrmCustomersClient·통합목록에 각각 중복 정의돼 있던 것을 공용화한다.
// 클라이언트 컴포넌트에서도 import 가능하도록 server-only 의존성을 두지 않는다.

/** 위안화 표기. 1만 이상은 만단위 2자리(¥1.23만), 그 미만은 원 단위(¥5,000). 값이 없으면 "-". */
export function formatCNY(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-"
  if (Math.abs(value) >= 10_000) {
    return `¥${(value / 10_000).toLocaleString("ko-KR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}만`
  }
  return `¥${value.toLocaleString("ko-KR")}`
}

/** 달러 표기($1,500.5). 값이 없으면 "-". */
export function formatUSD(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-"
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

/**
 * 자체 집계 원화 표기(₩7,360만 / ₩1.2억). 만 미만은 ₩ 원단위.
 * ClassIn 자체 DB(인식매출·견적·계약·미수 등) 전용 — NEO/REV(CNY) 값에는 절대 쓰지 말 것(formatCNY 사용).
 */
export function formatKRWAbbrev(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-"
  const abs = Math.abs(value)
  if (abs >= 100_000_000) return `₩${(value / 100_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`
  if (abs >= 10_000) return `₩${Math.round(value / 10_000).toLocaleString("ko-KR")}만`
  return `₩${value.toLocaleString("ko-KR")}`
}

export type CrmCurrency = "KRW" | "USD" | "CNY"

/**
 * KPI 카드·타일의 통화 칩 메타. 서로 다른 통화(₩ 자체집계 / $ 오더 / ¥ NEO 동기화)를
 * 한 화면에 인접 배치할 때 기호·출처를 시각적으로 분리해 합산 오독을 막는다.
 */
export const CRM_CURRENCY_BADGE: Record<CrmCurrency, { symbol: string; label: string }> = {
  KRW: { symbol: "₩", label: "자체 집계" },
  USD: { symbol: "$", label: "NEO 오더" },
  CNY: { symbol: "¥", label: "NEO 동기화" },
}

/** 값과 통화를 함께 들고 다니는 금액. 출처가 다른 금액을 한 변수에 담을 때 통화를 잃지 않기 위해. */
export interface CrmMoney {
  amount: number
  currency: CrmCurrency
}

/** 통화에 맞는 표기로 렌더한다. 하드코딩된 기호 접두사(항상 "₩")를 대체한다. */
export function formatCrmMoney(money: CrmMoney | null | undefined): string {
  if (!money || !Number.isFinite(money.amount)) return "-"
  if (money.currency === "CNY") return formatCNY(money.amount)
  if (money.currency === "USD") return formatUSD(money.amount)
  return formatKRWAbbrev(money.amount)
}

/**
 * VIP 배지 기준선 — 통화별로 따로 둔다.
 *
 * 이전에는 통화 구분 없이 하나의 임계값(30,000,000)을 썼다. 그래서 ₩3천만(견적 기준)과
 * ¥3천만(수금 기준)이 같은 선으로 취급돼, 원화 견적 한 건이면 VIP가 되고 실제 CNY 고객은
 * 사실상 도달할 수 없는 선이 됐다.
 *
 * 이 값들은 배지 표시용 어림 환산이다(회계 수치 아님). 정산·보고에는 쓰지 않는다.
 */
export const CRM_VIP_THRESHOLD: Record<CrmCurrency, number> = {
  KRW: 30_000_000,
  USD: 22_000,
  CNY: 160_000,
}

/** 통화별 기준선으로 VIP 여부를 판정한다. 금액이 없으면 false. */
export function isCrmVipMoney(money: CrmMoney | null | undefined): boolean {
  if (!money || !Number.isFinite(money.amount)) return false
  return money.amount >= CRM_VIP_THRESHOLD[money.currency]
}
