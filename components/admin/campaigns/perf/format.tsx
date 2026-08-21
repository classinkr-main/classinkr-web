"use client"

import {
  CAMPAIGN_UPDATE_KIND_LABEL,
  CAMPAIGN_UPDATE_KINDS,
  type CampaignUpdateKind,
} from "@/lib/types/marketing-campaign"

// 캠페인 업데이트 표시 포맷 — UpdatesFeed(피드 목록·폼)와 CampaignScoreboard(최근 업데이트
// 1줄)가 공유한다. 원래 UpdatesFeed.tsx에 있던 것을 여기로 승격했다 — 스코어보드가 피드
// 컴포넌트 모듈을 거꾸로 끌어오는 크로스 임포트를 없애기 위함(2026-08-20).

// 상대시각 — Date.now() 는 렌더 본문이 아니라 모듈 헬퍼에 둔다(기존 SummaryTab
// findUpcomingEvent · SyncStatusBar 와 동일 패턴). perf 데이터는 클라이언트 fetch 후에만
// 렌더되므로 SSR 하이드레이션 불일치 경로가 없다.
export function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return "—"
  const diff = Date.now() - t
  if (diff < 60_000) return "방금"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`
  const d = new Date(t)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`
}

// kind 칩 — 어드민 라벨 단순화 원칙(파스텔 채움 대신 글자색+1px 보더)으로 종류만 구분.
const KIND_CHIP_CLASS: Record<CampaignUpdateKind, string> = {
  note: "border-[#e8e8e4] text-[#1a1a1a]/50",
  change: "border-[#ECD29C] text-[#A8741A]",
  milestone: "border-[#BDEFD8] text-[#084734]",
}

export function UpdateKindChip({ kind }: { kind: string }) {
  const known = (CAMPAIGN_UPDATE_KINDS as string[]).includes(kind)
    ? (kind as CampaignUpdateKind)
    : null
  // 미지의 kind 는 라벨을 지어내지 않고 raw 값 그대로 중립 표기한다.
  const label = known ? CAMPAIGN_UPDATE_KIND_LABEL[known] : kind
  const cls = known ? KIND_CHIP_CLASS[known] : KIND_CHIP_CLASS.note
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-px text-[10px] font-semibold leading-[1.4] ${cls}`}
    >
      {label}
    </span>
  )
}
