import type { AttendeeOrigin } from "@/lib/supabase/database.types"
import type { CaptureTargetType } from "./matching"

// 광고 유입으로 분류할 리드 source (lib/server/lead-capture.ts · Meta 리드 등).
const AD_LEAD_SOURCES = new Set(["meta_lead_ads", "meta", "google_ads", "google"])
// KR팀이 직접 만들거나 내부 캡처/상담 흐름에서 만든 리드 source.
// 공개 홈페이지 폼과 구분해 행사 성과에서 "KR 팀 리드"로 본다.
const KR_TEAM_LEAD_SOURCES = new Set([
  "admin_manual",
  "manual",
  "manual_import",
  "crm_capture",
  "channel_talk",
])

export type LeadOriginClass = "ad" | "team" | "site"

/** 리드 source 문자열 → 유입 출신. 홈페이지 공개 폼(또는 출처 미상)은 site. */
export function classifyLeadOrigin(source: string | null | undefined, hasAdClickId: boolean): LeadOriginClass {
  const normalized = (source ?? "").trim().toLowerCase()
  if (hasAdClickId || AD_LEAD_SOURCES.has(normalized)) return "ad"
  if (KR_TEAM_LEAD_SOURCES.has(normalized)) return "team"
  return "site"
}

/**
 * 이 리드가 우리 공개 사이트의 폼에서 만들어졌는가.
 *
 * `classifyLeadOrigin`과 달리 광고 클릭 식별자(gclid·fbclid 등)를 보지 않는다. 클릭 식별자는
 * "어느 경로로 사이트에 들어왔나"이지 "어느 폼을 채웠나"가 아니다 — 광고를 타고 들어와
 * `/contact` 폼을 직접 채운 사람의 문의도 홈페이지 문의다. 설계 스펙 §D도 판정 기준을
 * `lead.source` 하나로 규정한다(docs/superpowers/specs/2026-07-16-crm-structure-develop-design.md).
 *
 * 유입 성과 귀속(어느 광고가 이 리드를 데려왔나)은 utm·클릭 식별자 컬럼이 따로 들고 있으므로
 * 이 판정에서 빠져도 잃는 정보가 없다.
 */
export function isSiteFormLead(source: string | null | undefined): boolean {
  return classifyLeadOrigin(source, false) === "site"
}

export interface DeriveAttendeeOriginInput {
  /** 매칭된 대상 종류 (매칭 없으면 null) */
  matchedTargetType: CaptureTargetType | null
  /** 명단에만 있던 신규 → 캡처가 새 리드를 만든 행 */
  createdNewLead: boolean
  /** 기존 리드 매칭일 때 그 리드의 유입 source */
  leadSource?: string | null
  /** 기존 리드에 광고 클릭 식별자(gclid/fbclid 등)가 있는지 */
  leadHasAdClickId?: boolean
}

/**
 * 행사 참석자의 출신(origin)을 도출한다. 확정(apply) 시점 스냅샷용.
 * 설계: docs/active/event-attendee-tracking-plan-2026-06-29.md §3
 */
export function deriveAttendeeOrigin(input: DeriveAttendeeOriginInput): AttendeeOrigin {
  if (input.createdNewLead) return "new_lead"

  switch (input.matchedTargetType) {
    case "lead": {
      const cls = classifyLeadOrigin(input.leadSource, Boolean(input.leadHasAdClickId))
      if (cls === "ad") return "ad_lead"
      if (cls === "team") return "kr_team_lead"
      return "site_lead" // 사이트 유입(또는 출처 미상) 리드
    }
    case "neo_account":
    case "customer":
    case "deal":
      // 기존 고객 베이스. 직판 vs 파트너 세분화는 후속(설계문서 §9).
      return "existing_customer"
    default:
      return "unknown"
  }
}
