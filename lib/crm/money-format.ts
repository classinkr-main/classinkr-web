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
