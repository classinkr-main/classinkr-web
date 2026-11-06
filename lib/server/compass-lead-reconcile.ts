import "server-only"

import { getCompassHomeLeadRefs } from "@/lib/compass/bridge"
import { WEBSITE_FORM_LEAD_SOURCES, type LeadPayload, type LeadSource } from "@/lib/lead-types"
import { getCompassPushCandidateLeads, type CompassPushCandidateRow } from "@/lib/repositories/leads"
import {
  COMPASS_LEAD_PUSH_TIMEOUT_MS,
  compassLeadPushTarget,
  isCompassPushSource,
  pushLeadToCompass,
} from "@/lib/server/compass-lead-push"
import { parseEventToken } from "@/lib/types/event-metrics"

// Compass 전달 대조 — 실시간 전달(lib/server/compass-lead-push.ts)이 놓친 홈페이지 폼 리드를 매시 다시 민다 (2026-11-06).
//
// 왜: 실시간 전달은 폼 제출 순간 한 번뿐이다. Compass 가 잠깐 내려가 있거나 6초 안에 답하지 않으면 그 리드는 응답 warnings·
// 「리드 전달 경고」만 남기고 Compass 에 영영 안 들어갔다(2026-11-04 설계의 "자동 재전달은 없다"). 2026-11-06 운영 토큰 누락으로
// 이틀간 전달이 통째로 빠진 뒤 설계자 "실시간 연동 + 최소 하루 3번 싱크"로 대조를 둔다. 실행은 매시 디스패처(app/api/cron/dispatch).
//
// 규칙:
//  * 대상 = 최근 LOOKBACK 안에 저장된 홈페이지 폼 리드(isCompassPushSource — 공개 폼 + leadMagnet 이 붙은 자료 신청) 중
//    Compass 링크(compass_lead_refs_v system='home_lead')가 없는 것. 링크가 곧 "Compass 가 받았다"의 증거다.
//  * 방금 들어온 리드(MIN_AGE 이내)는 건너뛴다 — 실시간 전달이 아직 진행 중일 수 있다. 겹쳐도 Compass 는 event_id 로 한 번만 받는다.
//  * event_id 는 실시간 전달과 같은 `lead:<어드민 id>` — Compass crm.home_webhook_events 가 멱등 표식이라 두 번 가도 리드가 두 건이 되지 않는다.
//  * 링크를 못 읽으면(브리지 down) 아무것도 보내지 않는다 — "링크 없음"으로 오인해 이미 받은 리드를 다시 밀지 않게.
//  * LOOKBACK 보다 오래된 리드는 다시 밀지 않는다 — Compass 는 받은 시각으로 기록하므로 며칠 지난 리드를 밀면 KPI 달·연락 텀이 틀어진다.
//    그런 건은 사람이 원래 날짜로 옮긴다(2026-11-06 22건 이관 선례).
//  * 재문의 병합(기존 리드에 합친 재유입)은 대상이 아니다 — 리드 행은 예전 것이고 이미 링크가 있다. 그 전달 실패는 「리드 전달 경고」로만 보인다.
//  * 한 번에 MAX_PUSHES 건, 남은 시간 예산 안에서만 보낸다. 남은 건은 다음 시간에 간다(deferred).

/** 다시 볼 기간 — 몇 시간짜리 Compass 장애도 덮고, 그보다 오래된 리드는 사람 몫으로 남긴다. */
export const COMPASS_RECONCILE_LOOKBACK_MS = 72 * 60 * 60 * 1000
/** 이보다 최근에 저장된 리드는 실시간 전달 몫이다. */
export const COMPASS_RECONCILE_MIN_AGE_MS = 10 * 60 * 1000
/** 한 번 실행에서 보내는 상한 — 건당 최대 6초라 디스패처 maxDuration(60초) 안에 들어간다. */
export const COMPASS_RECONCILE_MAX_PUSHES = 5

const COMPASS_PUSH_SOURCES: readonly string[] = [...WEBSITE_FORM_LEAD_SOURCES, "newsletter"]

export type CompassReconcileStatus =
  | "skipped"
  | "in_sync"
  | "preview"
  | "sent"
  | "partial"
  | "failed"

export interface CompassReconcileReport {
  status: CompassReconcileStatus
  reason?: "not_configured" | "lead_read_failed" | "compass_links_unavailable"
  dryRun: boolean
  window: { since: string; until: string }
  /** 기간 안의 전달 대상 리드 수 */
  candidates: number
  /** 그중 Compass 링크가 있는 수 */
  linked: number
  /** 링크가 없는 수(= 다시 밀 대상) */
  missing: number
  sent: number
  failed: number
  /** 상한·시간 예산에 걸려 다음 실행으로 넘긴 수 */
  deferred: number
  /** 다시 밀 대상(미리보기) 또는 실패한 리드 — 어드민 리드 id 와 닫힌 오류 문구만(이름·연락처 없음) */
  leads: Array<{ leadId: string; createdAt: string; result: "pending" | "sent" | "failed" | "deferred"; error?: string }>
}

/** 저장된 리드 행 → 실시간 전달 때와 같은 본문. Compass 본문에 실리는 칸만 채운다(buildCompassLeadPushPayload). */
export function compassPayloadFromLeadRow(row: CompassPushCandidateRow): LeadPayload {
  const text = (value: string | null) => (value?.trim() ? value : undefined)
  return {
    source: row.source as LeadSource,
    timestamp: row.created_at,
    name: text(row.name),
    org: text(row.org),
    role: text(row.role),
    size: text(row.size),
    email: text(row.email),
    phone: text(row.phone),
    branch: text(row.branch),
    message: text(row.message),
    sourceDetail: text(row.source_detail),
    leadMagnet: text(row.lead_magnet),
    // 행사 신청은 notes 첫 줄 [event:slug] 토큰으로만 남는다(lib/server/lead-capture.ts setEventToken)
    eventSlug: parseEventToken(row.notes).token ?? undefined,
    utmSource: text(row.utm_source),
    utmMedium: text(row.utm_medium),
    utmCampaign: text(row.utm_campaign),
    landingPage: text(row.landing_page),
    currentPage: text(row.current_page),
  }
}

/** 응답·로그에 싣는 오류 문구 — `Compass: <상태>` 만 그대로, 나머지는 이름만(주소·토큰이 섞이지 않게). */
function safeErrorText(error: unknown): string {
  if (error instanceof Error) return /^Compass: \d{3}$/.test(error.message) ? error.message : error.name
  return "Error"
}

export async function reconcileCompassLeadPush(
  options: { now?: Date; dryRun?: boolean; timeBudgetMs?: number } = {}
): Promise<CompassReconcileReport> {
  const startedAt = Date.now()
  const now = options.now ?? new Date()
  const dryRun = options.dryRun === true
  const timeBudgetMs = options.timeBudgetMs ?? 40_000
  const window = {
    since: new Date(now.getTime() - COMPASS_RECONCILE_LOOKBACK_MS).toISOString(),
    until: new Date(now.getTime() - COMPASS_RECONCILE_MIN_AGE_MS).toISOString(),
  }
  const report: CompassReconcileReport = {
    status: "in_sync",
    dryRun,
    window,
    candidates: 0,
    linked: 0,
    missing: 0,
    sent: 0,
    failed: 0,
    deferred: 0,
    leads: [],
  }

  // 실시간 전달과 같은 조건 — env 둘이 없으면(로컬·Preview) 보내지 않는다.
  if (!compassLeadPushTarget()) return { ...report, status: "skipped", reason: "not_configured" }

  let rows: CompassPushCandidateRow[]
  try {
    rows = await getCompassPushCandidateLeads({ sources: COMPASS_PUSH_SOURCES, ...window })
  } catch (error) {
    console.error("[compass-reconcile] lead read failed:", error instanceof Error ? error.name : "Error")
    return { ...report, status: "failed", reason: "lead_read_failed" }
  }
  const candidates = rows.filter((row) => isCompassPushSource(row.source, row.lead_magnet))
  report.candidates = candidates.length
  if (candidates.length === 0) return report

  const refs = await getCompassHomeLeadRefs(candidates.map((row) => row.id))
  if (refs.down) return { ...report, status: "failed", reason: "compass_links_unavailable" }
  const linkedIds = new Set(refs.rows.map((ref) => ref.external_id))
  const missing = candidates.filter((row) => !linkedIds.has(row.id))
  report.linked = candidates.length - missing.length
  report.missing = missing.length
  if (missing.length === 0) return report

  if (dryRun) {
    report.leads = missing.map((row) => ({ leadId: row.id, createdAt: row.created_at, result: "pending" as const }))
    return { ...report, status: "preview" }
  }

  // 순차 — 다음 건을 보내기 전에 한 건 몫(전달 상한 + 여유)이 남았는지 본다.
  for (const row of missing) {
    const remaining = timeBudgetMs - (Date.now() - startedAt)
    if (report.sent + report.failed >= COMPASS_RECONCILE_MAX_PUSHES || remaining < COMPASS_LEAD_PUSH_TIMEOUT_MS + 2_000) {
      report.deferred += 1
      report.leads.push({ leadId: row.id, createdAt: row.created_at, result: "deferred" })
      continue
    }
    try {
      await pushLeadToCompass(compassPayloadFromLeadRow(row), {
        leadId: row.id,
        kind: "created",
        eventId: `lead:${row.id}`,
      })
      report.sent += 1
      report.leads.push({ leadId: row.id, createdAt: row.created_at, result: "sent" })
    } catch (error) {
      const message = safeErrorText(error)
      report.failed += 1
      report.leads.push({ leadId: row.id, createdAt: row.created_at, result: "failed", error: message })
      console.error("[compass-reconcile] push failed:", message)
    }
  }

  // 넘긴 건(deferred)만 있고 보낸 건이 없으면 partial — 실패는 아니지만 아직 덜 맞았다.
  report.status =
    report.failed > 0
      ? report.sent > 0 ? "partial" : "failed"
      : report.sent > 0 ? "sent" : "partial"
  console.info("[compass-reconcile]", {
    status: report.status,
    candidates: report.candidates,
    missing: report.missing,
    sent: report.sent,
    failed: report.failed,
    deferred: report.deferred,
  })
  return report
}
