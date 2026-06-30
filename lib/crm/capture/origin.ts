import type { AttendeeOrigin } from "@/lib/supabase/database.types"
import type { CaptureTargetType } from "./matching"

// 광고 유입으로 분류할 리드 source (lib/server/lead-capture.ts · Meta 리드 등).
const AD_LEAD_SOURCES = new Set(["meta_lead_ads", "meta", "google_ads", "google"])

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
      const source = (input.leadSource ?? "").trim().toLowerCase()
      if (input.leadHasAdClickId || AD_LEAD_SOURCES.has(source)) return "ad_lead"
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
