import "server-only"

import { isMissingTableMessage } from "@/lib/db/schema-contract"
import { parsePartnerSettlementSnapshot, type PartnerSettlementSnapshot } from "@/lib/partner-settlement"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 총판 정산 스냅샷 저장소(2026-11-23) — partner_settlement_snapshots(RLS deny-all, service role 전용).
// 쓰기는 업로드 스크립트뿐이라 여기엔 읽기만 있다.
// 미적용 폴백(마이그레이션 런북 관례): available:false + 안내. 행 없음·모양 다름은 value:null.
// 미적용이 아닌 읽기 오류는 삼키지 않고 던진다.

const TABLE = "partner_settlement_snapshots"

export const PARTNER_SETTLEMENT_NOT_READY_MESSAGE =
  "총판 정산 스냅샷 표가 아직 적용되지 않았습니다. supabase/migrations/20261123_partner_settlement_snapshots.sql 적용이 필요합니다."
const MALFORMED_MESSAGE = "정산 스냅샷의 형식을 읽지 못했습니다. 스냅샷을 다시 올려 주세요."

export type PartnerSettlementRead =
  | { available: false; warning: string; value: null }
  | {
      available: true
      warning: string | null
      value: { snapshot: PartnerSettlementSnapshot; updatedAt: string } | null
    }

export async function getPartnerSettlementSnapshot(partner: string): Promise<PartnerSettlementRead> {
  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .select("snapshot, updated_at")
    .eq("partner", partner)
    .maybeSingle()
  if (error) {
    if (isMissingTableMessage([error.code, error.message].filter(Boolean).join(" "))) {
      return { available: false, warning: PARTNER_SETTLEMENT_NOT_READY_MESSAGE, value: null }
    }
    throw new Error(error.message || "정산 스냅샷을 불러오지 못했습니다.")
  }
  if (!data) return { available: true, warning: null, value: null }

  const snapshot = parsePartnerSettlementSnapshot(data.snapshot)
  if (!snapshot) {
    console.warn(`[partner-settlement] '${partner}' 스냅샷 모양이 맞지 않아 보여 주지 않습니다.`)
    return { available: true, warning: MALFORMED_MESSAGE, value: null }
  }
  return { available: true, warning: null, value: { snapshot, updatedAt: data.updated_at as string } }
}
