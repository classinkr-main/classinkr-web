import "server-only"

import { after } from "next/server"

import {
  getMarketingConversionStatus,
  sendGa4MeasurementProtocolEvent,
} from "@/lib/marketing/server-conversions"
import type { DealStage } from "@/lib/portal/types"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { LeadStatus } from "@/lib/supabase/database.types"

// 리드 품질 신호 — 영업 단계가 바뀌면 GA4 Measurement Protocol 로 qualify_lead·close_convert_lead 를 보내
// Google Ads 가 "폼 제출 수"가 아니라 "좋은 리드"에 맞춰 입찰하게 한다(GA4 주요 이벤트 → Ads 가져오기).
// 결합 키는 제출 때 남긴 leads.ga_client_id 다(분석 동의 제출만 — lib/server/lead-capture.ts).
// 거는 자리: 리드 상태는 updateLead(lib/repositories/leads.ts), 딜 단계는 updateDeal(lib/portal/repositories/deals.ts).
// 운영 설정·대안: docs/active/seo-analytics-console-runbook-2026-10-28.md §5-6.

export type LeadQualitySignal = "qualify" | "close"

/**
 * 상태 → 신호의 유일한 정본. 보수적으로 골랐다(대안은 런북 §5-6).
 *  - qualify: 리드가 CRM 고객·거래로 전환됨(converted — 단건·단체 전환, 상태 직접 변경).
 *    연락중(contacted)은 연락 기록일 뿐 영업 검증이 아니라 넣지 않는다.
 *  - close: 그 고객의 거래가 확정(confirmed = 오더 승인·오더번호) 이후 단계에 닿음.
 *    계약(contract)은 견적에서 계약서 초안을 만든 단계일 뿐이라 넣지 않는다.
 *  리드의 종료(closed)는 Compass 의 lost(이탈)라 어느 신호도 아니다.
 */
const LEAD_QUALITY_SIGNAL_TRIGGERS: {
  leadStatus: Partial<Record<LeadStatus, LeadQualitySignal>>
  dealStage: Partial<Record<DealStage, LeadQualitySignal>>
} = {
  leadStatus: { converted: "qualify" },
  dealStage: { confirmed: "close", installation: "close", payment: "close", closed: "close" },
}

const GA4_EVENT: Record<LeadQualitySignal, string> = {
  qualify: "qualify_lead",
  close: "close_convert_lead",
}

const SENT_AT_COLUMN: Record<LeadQualitySignal, string> = {
  qualify: "ga_qualify_sent_at",
  close: "ga_close_sent_at",
}

export function leadQualitySignalForLeadStatus(status: string): LeadQualitySignal | null {
  const map = LEAD_QUALITY_SIGNAL_TRIGGERS.leadStatus
  return Object.hasOwn(map, status) ? map[status as LeadStatus] ?? null : null
}

export function leadQualitySignalForDealStage(stage: string): LeadQualitySignal | null {
  const map = LEAD_QUALITY_SIGNAL_TRIGGERS.dealStage
  return Object.hasOwn(map, stage) ? map[stage as DealStage] ?? null : null
}

export type LeadQualitySignalResult =
  | "sent"
  /** GA4_MEASUREMENT_ID·GA4_API_SECRET 없음 — DB 를 건드리지 않는다 */
  | "not_configured"
  /** client_id 없음(분석 비동의·이 기능 전 리드) 또는 이미 보냄 */
  | "not_eligible"
  /** GA 가 2xx 가 아닌 응답 — 받지 않았으니 선점을 풀었다 */
  | "rejected"
  /** 선점 UPDATE 실패, 또는 네트워크 오류·시간 초과(받았는지 모름 — 선점 유지) */
  | "failed"

function mpConfigured(label: string) {
  if (getMarketingConversionStatus().google.measurementProtocolConfigured) return true
  console.debug(`[lead-quality-signal] skip ${label}: GA4 MP 미설정`)
  return false
}

/**
 * 리드 1건에 품질 신호 1건. 던지지 않는다.
 *
 * 한 번만: 보내기 전에 `<신호>_sent_at IS NULL AND ga_client_id IS NOT NULL` 조건부 UPDATE 로 선점하고
 * 선점한 호출만 보낸다 — 같은 리드에 동시에 두 번 불려도 하나만 이긴다.
 * 실패: GA 가 2xx 가 아닌 응답을 주면(받지 않았다) 선점을 풀어 다음 같은 전이(예: 확정 → 설치)에서 다시 보낸다.
 * 네트워크 오류·시간 초과는 받았는지 알 수 없어 선점을 유지한다 — 두 번 세는 것보다 한 번 놓치는 쪽을 택한다.
 * 로그에는 리드 id 만 남긴다(client_id·연락처 없음).
 */
export async function sendLeadQualitySignal(
  leadId: string,
  signal: LeadQualitySignal
): Promise<LeadQualitySignalResult> {
  const label = `${GA4_EVENT[signal]} lead=${leadId}`
  if (!mpConfigured(label)) return "not_configured"

  const column = SENT_AT_COLUMN[signal]
  const claimedAt = new Date().toISOString()
  const supabase = createSupabaseAdminClient()
  const claim = await supabase
    .from("leads")
    .update({ [column]: claimedAt })
    .eq("id", leadId)
    .is(column, null)
    .not("ga_client_id", "is", null)
    .select("ga_client_id, ga_session_id, ga_ad_consent")
  if (claim.error) {
    console.warn(`[lead-quality-signal] claim failed ${label}:`, claim.error.message)
    return "failed"
  }
  const lead = (claim.data as Array<{
    ga_client_id: string
    ga_session_id: string | null
    ga_ad_consent: boolean | null
  }> | null)?.[0]
  if (!lead) {
    console.debug(`[lead-quality-signal] skip ${label}: client_id 없음 또는 이미 보냄`)
    return "not_eligible"
  }

  try {
    const response = await sendGa4MeasurementProtocolEvent({
      clientId: lead.ga_client_id,
      adConsent: lead.ga_ad_consent === true,
      name: GA4_EVENT[signal],
      params: {
        ...(lead.ga_session_id ? { session_id: lead.ga_session_id } : {}),
        engagement_time_msec: 1,
      },
    })
    if (response?.ok) return "sent"

    const release = await supabase
      .from("leads")
      .update({ [column]: null })
      .eq("id", leadId)
      .eq(column, claimedAt)
    console.warn(
      `[lead-quality-signal] ${label} not accepted (${response ? `HTTP ${response.status}` : "GA4 MP 미설정"})` +
        (release.error ? ` — 선점 해제 실패: ${release.error.message}` : " — 선점 해제")
    )
    return "rejected"
  } catch (error) {
    console.warn(
      `[lead-quality-signal] ${label} delivery unknown — 선점 유지:`,
      error instanceof Error ? error.message : error
    )
    return "failed"
  }
}

/** 응답 뒤로 미룬다(after). 요청 밖(스크립트·테스트)이면 after 가 던지므로 그냥 돌린다 — 긴 프로세스라 끝까지 간다. */
function runAfterResponse(task: () => Promise<unknown>) {
  try {
    after(task)
  } catch {
    void task()
  }
}

export function scheduleLeadQualitySignal(leadId: string, signal: LeadQualitySignal) {
  runAfterResponse(() => sendLeadQualitySignal(leadId, signal))
}

/**
 * 딜 단계 신호 — 그 딜의 고객으로 전환·연결된 리드(crm_source_links 의 확정 lead→customer 링크)마다 보낸다.
 * 링크는 convertLeadToCrm 과 매칭함 확정이 남긴다. 딜이 아니라 고객으로 잇는 이유: 전환이 만든 "리드 상담" 딜 대신
 * 새 딜을 만들어 수주를 기록해도 잡혀야 한다.
 * ponytail: 같은 고객에 리드가 여럿 연결돼 있으면 리드마다 한 번씩 나간다 — 한 수주를 대표 리드 하나로만 셀 필요가 생기면 최신 리드만 고른다.
 */
export function scheduleLeadQualitySignalForCustomer(customerId: string, signal: LeadQualitySignal) {
  runAfterResponse(async () => {
    if (!mpConfigured(`${GA4_EVENT[signal]} customer=${customerId}`)) return
    const { data, error } = await createSupabaseAdminClient()
      .from("crm_source_links")
      .select("source_record_key")
      .eq("source_system", "lead")
      .eq("source_object", "leads")
      .eq("status", "confirmed")
      .eq("target_type", "customer")
      .eq("target_id", customerId)
    if (error) {
      console.warn(`[lead-quality-signal] lead lookup failed customer=${customerId}:`, error.message)
      return
    }
    for (const row of (data ?? []) as Array<{ source_record_key: string }>) {
      await sendLeadQualitySignal(row.source_record_key, signal)
    }
  })
}
