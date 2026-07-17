// KR Team 대시보드 섹션 공용 금액 축약 — 억/만 단위. sections/* 9개 파일에 바이트 단위로
// 중복돼 있던 cny()를 단일 소스로 통합(상위집합: null/비유한 입력은 "-").
// 통화 기호는 호출부가 직접 붙인다(대개 `¥${cny(n)}`).
export function cny(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "-"
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`
  return n.toLocaleString()
}

// 축약 없는 원값 — 로케일 콤마만 적용한 전체 자릿수. cny()가 억/만 단위로
// 반올림/축약하는 표시를 호버·title로 보정하기 위한 짝 함수. 통화 기호(¥)는
// cny()와 동일하게 호출부가 붙인다. 정합성(2026-07-17 사용성 디벨롭 항목 1)
// 용도 외의 집계·계산 로직에는 관여하지 않는다.
export function cnyExact(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "-"
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 20 })
}
