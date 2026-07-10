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
