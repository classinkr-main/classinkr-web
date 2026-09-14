// 리드 상태 MKT(Compass) 매시간 반영 — 조회 → 판정 → 조건부 반영 → 감사 기록.
// 설계: docs/superpowers/specs/2026-09-14-lead-contact-compass-sync-design.md
//
// 실행 자리는 app/api/cron/dispatch/[slot] 이다(매 슬롯, 예약 잡이 끝난 뒤).
//  * 쓰기 범위는 public.leads 뿐이다. Compass 는 브리지 뷰로 읽기만 한다.
//  * 브리지 조회가 하나라도 끊기거나 행 상한에 닿으면 이번 실행 전체를 건너뛴다 — 반쪽 결과로
//    판정하면 처리된 리드를 흘려보내거나(누락) 대표 행이 바뀌어 잘못 종료한다. 다음 슬롯이 따라잡는다.
//  * 쓰기는 마감 시각(writeDeadlineAt) 전에만 시작하고 덩어리 사이에서도 멈춘다 — 크론 응답이
//    나간 뒤에 쓰기가 시작되면 결과가 보고되지도, 캐시 무효화가 반영되지도 않는다.
//  * 실제로 바뀐 행은 성공·실패·중단과 무관하게 감사 기록에 남긴다(복구의 근거).
//  * 절대 던지지 않는다 — 크론 슬롯의 다른 잡(아침 카드)을 막으면 안 된다.

import "server-only"

import { logAudit } from "@/lib/auth/audit"
import { getCompassActivitySignals, getCompassLeadsByPhoneKeys } from "@/lib/compass/bridge"
import {
  COMPASS_HUMAN_ACTIVITY_KINDS,
  compassLeadIdsNeedingActivityCheck,
  humanTouchedCompassLeadIds,
  planCompassLeadStatusSync,
} from "@/lib/compass/lead-contact-sync"
import { normalizePhoneKey } from "@/lib/compass/normalize"
import type { CompassOverlaySource } from "@/lib/compass/overlay"
import {
  applyCompassLeadStatusSync,
  CompassLeadStatusSyncError,
  getLeadsForCompassContactSync,
  type CompassLeadStatusSyncResult,
} from "@/lib/repositories/leads"

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
/** PostgREST 기본 행 상한. 한 번의 조회가 여기에 닿으면 잘렸을 수 있다. */
const COMPASS_ROW_CAP = 1000
/** 예산 끝에서 쓰기에 남겨 두는 여유 — 이 시각 이후로는 쓰기를 시작하지 않는다. */
const WRITE_MARGIN_MS = 3_000

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

async function recordAudit(result: CompassLeadStatusSyncResult, error?: string): Promise<void> {
  if (result.contacted.length === 0 && result.closed.length === 0) return
  // 복구 근거 — 바뀐 id, 종료 전 상태, 새로 찍은 도장(id·시각). 기록 실패는 logAudit 이 삼킨다.
  await logAudit({
    actorUserId: null,
    actorDisplayName: AUDIT_ACTOR_NAME,
    action: AUDIT_ACTION,
    targetType: "lead",
    payload: {
      contacted: result.contacted,
      closed: result.closed,
      stamped: result.stamped,
      confirmedAt: result.confirmedAt,
      ...(result.stoppedEarly ? { stoppedEarly: true } : {}),
      ...(error ? { error } : {}),
    },
  })
}

export async function syncLeadContactFromCompass(
  options: { dryRun?: boolean; now?: Date; writeDeadlineAt?: number } = {}
): Promise<LeadContactSyncReport> {
  const dryRun = options.dryRun === true
  const writeDeadlineAt = options.writeDeadlineAt ?? Number.POSITIVE_INFINITY

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
    if (result.rows.length >= COMPASS_ROW_CAP) {
      return {
        ...emptyReport(dryRun, "bridge_down", `Compass 리드 조회가 행 상한(${COMPASS_ROW_CAP})에 닿아 잘렸을 수 있음`),
        scanned: leads.length,
      }
    }
    compassRows.push(...result.rows)
  }

  const needActivity = compassLeadIdsNeedingActivityCheck(leads, compassRows)
  let touched = new Set<number>()
  if (needActivity.length > 0) {
    const activity = await getCompassActivitySignals(needActivity, COMPASS_HUMAN_ACTIVITY_KINDS)
    if (activity.down) return { ...emptyReport(dryRun, "bridge_down", activity.error), scanned: leads.length }
    touched = humanTouchedCompassLeadIds(activity.rows)
  }

  const plan = planCompassLeadStatusSync(leads, compassRows, touched)
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
  if (Date.now() >= writeDeadlineAt) {
    return { ...report, status: "timeout", error: "쓰기 마감이 지나 이번 슬롯은 반영하지 않음" }
  }

  let result: CompassLeadStatusSyncResult
  try {
    result = await applyCompassLeadStatusSync(
      { contactedIds: plan.contacted, closedIds: plan.closed.map((item) => item.id) },
      { now: options.now ?? new Date(), shouldContinue: () => Date.now() < writeDeadlineAt }
    )
  } catch (error) {
    const message = messageOf(error)
    if (error instanceof CompassLeadStatusSyncError) {
      await recordAudit(error.partial, message)
      return {
        ...report,
        status: "failed",
        error: message,
        applied: { contacted: error.partial.contacted.length, closed: error.partial.closed.length },
      }
    }
    return { ...report, status: "failed", error: message }
  }

  await recordAudit(result)
  report.applied = { contacted: result.contacted.length, closed: result.closed.length }
  if (result.stoppedEarly) {
    return { ...report, status: "timeout", error: "쓰기 마감으로 남은 덩어리를 다음 슬롯에 넘김" }
  }
  return report
}

/**
 * 예산 안에서만 기다린다. 넘기면 timeout 보고를 돌려준다. 늦게 끝난 조회가 응답 뒤에 쓰기를
 * 시작하지 않도록 쓰기 마감을 예산보다 WRITE_MARGIN_MS 앞에 둔다(syncLeadContactFromCompass 참고).
 */
export async function syncLeadContactFromCompassWithinBudget(options: {
  budgetMs: number
  dryRun?: boolean
  now?: Date
}): Promise<LeadContactSyncReport> {
  const dryRun = options.dryRun === true
  if (options.budgetMs <= WRITE_MARGIN_MS) {
    return emptyReport(dryRun, "timeout", `예산 ${options.budgetMs}ms 가 쓰기 여유보다 짧아 건너뜀`)
  }
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<LeadContactSyncReport>((resolve) => {
    timer = setTimeout(
      () => resolve(emptyReport(dryRun, "timeout", `예산 ${options.budgetMs}ms 초과`)),
      options.budgetMs
    )
  })
  try {
    return await Promise.race([
      syncLeadContactFromCompass({
        dryRun,
        now: options.now,
        writeDeadlineAt: startedAt + options.budgetMs - WRITE_MARGIN_MS,
      }).catch((error: unknown) => emptyReport(dryRun, "failed", messageOf(error))),
      timeout,
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
