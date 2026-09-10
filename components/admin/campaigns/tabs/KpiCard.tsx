"use client"

import { StatTile } from "@/components/admin/viz"

// KPI 카드는 공용 StatTile(compact)로 통합 — 로컬 tone은 색이 픽셀 동일한 viz Tone으로 매핑
// (success→brand, warn→danger[#FEF3EE/#B85C33 동일], neutral→neutral).
// 요약 탭 KPI 스트립과 광고 탭 MetaCampaignPanel이 함께 쓴다.
export function KpiCard({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  tone?: "neutral" | "success" | "warn"
}) {
  const vizTone = tone === "success" ? "brand" : tone === "warn" ? "danger" : "neutral"
  // 대표 숫자는 34px(lg) — 카드 밀도는 compact 로 유지하되 값만 키운다.
  return <StatTile icon={icon} label={label} value={value} hint={hint} tone={vizTone} compact valueSize="lg" />
}
