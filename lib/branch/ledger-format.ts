export function formatMoney(value: number | null | undefined) {
  const numeric = Number(value ?? 0)
  if (Math.abs(numeric) >= 10_000) {
    return `¥${(numeric / 10_000).toLocaleString("ko-KR", {
      maximumFractionDigits: 1,
    })}만`
  }
  return `¥${numeric.toLocaleString("ko-KR")}`
}

export function formatPercent(value: number | null | undefined) {
  return `${Number(value ?? 0).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`
}

// 반올림 없는 원 단위 금액(¥1,234,567) — 셀·편집 바는 만 단위로 축약하고, 정확한 값은 이 포맷으로 title·편집 바에
// 병기한다(라운드 5 R-8: 예전엔 title까지 만 단위라 정확한 금액을 확인할 길이 없었다).
export function formatExactMoney(value: number | null | undefined) {
  const numeric = Math.round(Number(value ?? 0))
  return `¥${(Number.isFinite(numeric) ? numeric : 0).toLocaleString("ko-KR")}`
}
