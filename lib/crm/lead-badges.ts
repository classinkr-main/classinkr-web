// 리드 행 배지 파생 규칙 — 순수 클라이언트 안전 모듈(서버 의존 없음, 단위 테스트 대상).
// 홈페이지 유입/정식 리드(NEO 등록)/미응답 SLA 경과를 행 데이터에서만 파생한다.

import type { CrmUnifiedCustomerRow } from "@/lib/crm/unified-view-rules"

export type LeadBadgeTone = "neutral" | "green" | "risk"

export interface LeadBadge {
  label: string
  tone: LeadBadgeTone
}

/** 미응답 경과가 이 시간(시) 이상이면 risk 톤. */
export const UNANSWERED_RISK_HOURS = 24

// DESIGN.md 팔레트 — neutral(뉴트럴)/green(그린 액센트)/risk(테라코타).
export const LEAD_BADGE_TONE_CLASSES: Record<LeadBadgeTone, string> = {
  neutral: "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55",
  green: "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]",
  risk: "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]",
}

/** 리드가 아니거나 해당 배지가 없으면 null. */
export function leadBadges(row: CrmUnifiedCustomerRow, nowMs: number): LeadBadge[] | null {
  if (row.source !== "lead") return null
  const badges: LeadBadge[] = []
  if (row.origin === "site") {
    badges.push(
      row.crmRegistered
        ? { label: "정식 리드 · NEO", tone: "green" }
        : { label: "홈페이지", tone: "neutral" }
    )
  }
  if (row.slaTarget && !row.firstResponseAt && row.createdAt) {
    const createdMs = new Date(row.createdAt).getTime()
    if (Number.isFinite(createdMs)) {
      // 시계 스큐로 createdAt이 미래면 0h로 클램프.
      const hours = Math.max(0, Math.floor((nowMs - createdMs) / 3_600_000))
      badges.push({
        label: `미응답 ${hours}h`,
        tone: hours >= UNANSWERED_RISK_HOURS ? "risk" : "neutral",
      })
    }
  }
  return badges.length ? badges : null
}
