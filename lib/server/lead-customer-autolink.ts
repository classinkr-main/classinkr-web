import "server-only"

import { generateLeadLinkCandidatesForLeads } from "@/lib/repositories/crm-source-links"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 최근 리드 → 기존 고객 자동 연결(2026-10-22, docs/active/hardware-order-revenue-link-plan-2026-10-22.md §4-1).
//
// 리드 저장 경로(공개 폼)에 일을 더하지 않고, 매시간 최근에 들어오거나 재문의한 리드만 모아 기존 매칭
// 엔진(crm-source-links 의 리드 후보 생성 + 자동 확정 정책)에 넘긴다. 리드 상태·담당은 건드리지 않는다.
// 확정은 고객 대상·신뢰도 0.92·2위와 0.15 차이일 때만 — 애매하면 매칭함 후보로 남는다.

/** 지난 회차를 놓쳐도 한 번 더 보도록 1시간보다 넉넉히 잡는다. 이미 확정된 리드는 엔진이 건너뛴다. */
export const LEAD_CUSTOMER_AUTOLINK_LOOKBACK_HOURS = 3
/** 한 회차에 보는 리드 수 상한 — 광고 몰림 시간에도 실행 시간이 늘어지지 않게. */
export const LEAD_CUSTOMER_AUTOLINK_MAX_LEADS = 200

export interface LeadCustomerAutoLinkReport {
  status: "ok" | "failed"
  recentLeads: number
  generatedCandidates: number
  insertedCandidates: number
  autoConfirmed: number
  error?: string
}

export async function runRecentLeadCustomerAutoLink(now: Date = new Date()): Promise<LeadCustomerAutoLinkReport> {
  const since = new Date(now.getTime() - LEAD_CUSTOMER_AUTOLINK_LOOKBACK_HOURS * 3_600_000).toISOString()
  try {
    const sb = createSupabaseAdminClient()
    const { data, error } = await sb
      .from("leads")
      .select("id")
      .neq("status", "closed")
      .or(`created_at.gte.${since},last_inflow_at.gte.${since}`)
      .order("created_at", { ascending: false })
      .limit(LEAD_CUSTOMER_AUTOLINK_MAX_LEADS)
    if (error) throw error

    const leadIds = ((data ?? []) as Array<{ id: string }>).map((row) => row.id)
    const result = await generateLeadLinkCandidatesForLeads(leadIds)
    return {
      status: "ok",
      recentLeads: leadIds.length,
      generatedCandidates: result.generatedCandidates,
      insertedCandidates: result.insertedCandidates,
      autoConfirmed: result.autoConfirmed,
    }
  } catch (error) {
    // 오류 원문(쿼리·키)은 응답에 싣지 않는다 — 종류만 남긴다.
    console.error("[lead-customer-autolink] failed:", error instanceof Error ? error.name : "Error")
    return {
      status: "failed",
      recentLeads: 0,
      generatedCandidates: 0,
      insertedCandidates: 0,
      autoConfirmed: 0,
      error: "Lead customer auto-link failed.",
    }
  }
}
