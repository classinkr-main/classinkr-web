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
