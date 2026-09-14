// 리드 상태 MKT(Compass) 매시간 반영 — 조회 → 판정 → 조건부 반영 → 감사 기록.
// 설계: docs/superpowers/specs/2026-09-14-lead-contact-compass-sync-design.md
//
// 실행 자리는 app/api/cron/dispatch/[slot] 이다(매 슬롯, 예약 잡이 끝난 뒤).
//  * 쓰기 범위는 public.leads 뿐이다. Compass 는 브리지 뷰로 읽기만 한다.
//  * 브리지 조회가 하나라도 끊기면 이번 실행 전체를 건너뛴다 — 반쪽 결과로 판정하면 이미 처리된
//    리드를 "매칭 없음"으로 흘려보내게 된다. 다음 슬롯이 따라잡는다.
//  * 절대 던지지 않는다 — 크론 슬롯의 다른 잡(아침 카드)을 막으면 안 된다.

import "server-only"

import { logAudit } from "@/lib/auth/audit"
import { getCompassHumanActivityLeadIds, getCompassLeadsByPhoneKeys } from "@/lib/compass/bridge"
import {
  COMPASS_HUMAN_ACTIVITY_KINDS,
  compassLeadIdsNeedingActivityCheck,
  planCompassLeadStatusSync,
} from "@/lib/compass/lead-contact-sync"
import { normalizePhoneKey } from "@/lib/compass/normalize"
import type { CompassOverlaySource } from "@/lib/compass/overlay"
import { applyCompassLeadStatusSync, getLeadsForCompassContactSync } from "@/lib/repositories/leads"

export type LeadContactSyncStatus = "ok" | "bridge_down" | "failed" | "timeout"

export interface LeadContactSyncReport {
  status: LeadContactSyncStatus
  dryRun: boolean
  /** 판정에 넣은 어드민 리드 수(전화가 있는 신규·연락함) */
  scanned: number
  /** 전화 키로 Compass 리드가 붙은 수 */
  matched: number
  toContacted: number
  toClosed: number
  /** 조건부 UPDATE 로 실제 바뀐 수 — 판정과 쓰기 사이에 사람이 바꾼 행은 빠진다 */
  applied: { contacted: number; closed: number }
  error?: string
}

/** compass_leads_v phone_key in(...) 한 번에 싣는 키 수 — 리드 오버레이 라우트와 같은 값. */
const PHONE_KEY_CHUNK = 300

const AUDIT_ACTOR_NAME = "MKT(Compass) 자동 반영"
const AUDIT_ACTION = "lead.status.compass_sync"

function emptyReport(dryRun: boolean, status: LeadContactSyncStatus, error?: string): LeadContactSyncReport {
  return {
    status,
    dryRun,
    scanned: 0,
    matched: 0,
    toContacted: 0,
    toClosed: 0,
    applied: { contacted: 0, closed: 0 },
    ...(error ? { error } : {}),
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function syncLeadContactFromCompass(
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<LeadContactSyncReport> {
  const dryRun = options.dryRun === true

  let leads: Awaited<ReturnType<typeof getLeadsForCompassContactSync>>
  try {
    leads = await getLeadsForCompassContactSync()
  } catch (error) {
    return emptyReport(dryRun, "failed", messageOf(error))
  }
  if (leads.length === 0) return emptyReport(dryRun, "ok")

  const keys = Array.from(
    new Set(leads.map((lead) => normalizePhoneKey(lead.phone)).filter((key): key is string => Boolean(key)))
  )
  const compassRows: CompassOverlaySource[] = []
  for (let index = 0; index < keys.length; index += PHONE_KEY_CHUNK) {
    const result = await getCompassLeadsByPhoneKeys(keys.slice(index, index + PHONE_KEY_CHUNK))
    if (result.down) return { ...emptyReport(dryRun, "bridge_down", result.error), scanned: leads.length }
    compassRows.push(...result.rows)
  }

  const needActivity = compassLeadIdsNeedingActivityCheck(leads, compassRows)
  let touched: number[] = []
  if (needActivity.length > 0) {
    const activity = await getCompassHumanActivityLeadIds(needActivity, COMPASS_HUMAN_ACTIVITY_KINDS)
    if (activity.down) return { ...emptyReport(dryRun, "bridge_down", activity.error), scanned: leads.length }
    touched = activity.rows
  }

  const plan = planCompassLeadStatusSync(leads, compassRows, new Set(touched))
  const report: LeadContactSyncReport = {
    status: "ok",
    dryRun,
    scanned: plan.scanned,
    matched: plan.matched,
    toContacted: plan.contacted.length,
    toClosed: plan.closed.length,
    applied: { contacted: 0, closed: 0 },
  }
  if (dryRun || (plan.contacted.length === 0 && plan.closed.length === 0)) return report

  let applied: { contacted: string[]; closed: string[] }
  try {
    applied = await applyCompassLeadStatusSync(
      { contactedIds: plan.contacted, closedIds: plan.closed.map((item) => item.id) },
      options.now ?? new Date()
    )
  } catch (error) {
    return { ...report, status: "failed", error: messageOf(error) }
  }

  report.applied = { contacted: applied.contacted.length, closed: applied.closed.length }
  if (applied.contacted.length > 0 || applied.closed.length > 0) {
    const closedIds = new Set(applied.closed)
    // 복구 근거 — 바뀐 id 와(종료는) 바뀌기 전 상태. 기록 실패는 logAudit 이 삼킨다.
    await logAudit({
      actorUserId: null,
      actorDisplayName: AUDIT_ACTOR_NAME,
      action: AUDIT_ACTION,
      targetType: "lead",
      payload: {
        contacted: applied.contacted,
        closed: plan.closed.filter((item) => closedIds.has(item.id)),
      },
    })
  }
  return report
}

/**
 * 예산 안에서만 기다린다. 넘기면 timeout 보고를 돌려주고 진행 중 작업은 그대로 둔다 —
 * UPDATE 가 조건부라 반쯤 적용돼도 다음 실행이 이어서 맞춘다(멱등).
 */
export async function syncLeadContactFromCompassWithinBudget(options: {
  budgetMs: number
  dryRun?: boolean
  now?: Date
}): Promise<LeadContactSyncReport> {
  const dryRun = options.dryRun === true
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<LeadContactSyncReport>((resolve) => {
    timer = setTimeout(
      () => resolve(emptyReport(dryRun, "timeout", `예산 ${options.budgetMs}ms 초과`)),
      options.budgetMs
    )
  })
  try {
    return await Promise.race([
      syncLeadContactFromCompass({ dryRun, now: options.now }).catch((error: unknown) =>
        emptyReport(dryRun, "failed", messageOf(error))
      ),
      timeout,
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
