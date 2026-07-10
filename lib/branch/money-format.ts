// KR Team 대시보드 섹션 공용 금액 축약 — 억/만 단위. sections/* 9개 파일에 바이트 단위로
// 중복돼 있던 cny()를 단일 소스로 통합(상위집합: null/비유한 입력은 "-").
// 통화 기호는 호출부가 직접 붙인다(대개 `¥${cny(n)}`).
export function cny(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "-"
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`
  return n.toLocaleString()
}
