// Compass(MKT) 리드 처리 결과 → 어드민 리드 상태 자동 반영의 순수 판정 규칙.
// 설계: docs/superpowers/specs/2026-09-14-lead-contact-compass-sync-design.md
//
// 러프한 연동이다 — 콜 기록을 복제하지 않고 상태 한 칸만 MKT 처리 결과에 맞춘다.
//  * 한 방향만: new → contacted, new·contacted → closed. 전환·종료는 건드리지 않고 되돌리지 않는다.
//  * 매칭 키는 전화 정규화 키 하나(normalizePhoneKey = compass_leads_v.phone_key 식) — 자리표시·더미 번호는 키가 아니다
//    (joinableCompassPhoneKey, Compass ADR-0018 과 같은 규칙).
//  * 이탈 판정은 Compass 칩과 같은 대표 행(pickRepresentativeCompassRow) 기준이다.
//  * **홈페이지 문의보다 오래된 Compass 상태는 근거가 아니다**(2026-10-12). 홈페이지 리드는 Compass 로 전달되지 않으므로
//    Compass 의 종료(lost)·활동이 이 문의 **이전** 것이면 이 문의를 처리한 것이 아니다 — 종료된 고객의 재문의가 담당자 손길
//    없이 다시 종료되고, 몇 달 전 콜 때문에 새 문의가 "연락중"이 되던 것을 막는다. 기준 시각은 리드의
//    max(created_at, last_inflow_at)(leadInflowAtMs), Compass 쪽은 행 updated_at(없으면 created_at)·활동 created_at.
//    리드 시각을 모르면(옛 호출) 예전처럼 시각을 따지지 않는다.
//  * 서버 의존 없음 — 조회·쓰기는 lib/server/lead-contact-compass-sync.ts 가 한다.

import { joinableCompassPhoneKey, normalizePhoneKey } from "@/lib/compass/normalize"
import { pickRepresentativeCompassRow, type CompassOverlaySource } from "@/lib/compass/overlay"
import type { LeadStatus } from "@/lib/supabase/database.types"

/** 사람이 남긴 Compass 활동 kind. 알림톡(alimtalk)·시스템(system)·유입(inflow)·임포트(import)는 연락이 아니다. */
export const COMPASS_HUMAN_ACTIVITY_KINDS = ["call", "sms", "meeting", "note", "memo", "stage_change"] as const

/**
 * 사람이 아닌 작성자 — kind 가 note 여도 연락이 아니다. 설명회 명단 동기화가 신규 리드를 만들며 남기는
 * 'BD시트' 메모, 시트 크론의 종료 전파 '시트 동기화' 메모, 시트 백필·중복 병합 스크립트의 '시트'·'Claude'
 * 메모가 여기 해당한다(Compass 코드 실측). 작성자가 비어 있는(null) 기록은 시트 시절 콜 메모를 옮겨 온
 * 행이라 사람 기록으로 둔다.
 */
export const COMPASS_AUTOMATED_ACTORS: ReadonlySet<string> = new Set([
  "Claude",
  "BD시트",
  "시트",
  "시트 동기화",
  "시스템",
  "system",
])

export type LeadStatusFromCompass = "contacted" | "closed"

export interface CompassSyncLead {
  id: string
  phone?: string | null
  status: LeadStatus
  /** 홈페이지 리드 생성 시각 — 이 문의보다 오래된 Compass 근거를 거르는 기준의 재료. 없으면 시각을 따지지 않는다. */
  created_at?: string | null
  /** 재유입 축(자체 원천 재제출 시 갱신) — created_at 과 함께 max 를 기준 시각으로 쓴다. */
  last_inflow_at?: string | null
}

/** 활동 판정에 필요한 최소 필드 — 본문은 싣지 않는다. created_at 은 "문의 뒤의 활동인가" 판정에 쓴다. */
export interface CompassActivitySignal {
  lead_id: number
  kind: string | null
  actor: string | null
  created_at?: string | null
}

const HUMAN_KINDS: ReadonlySet<string> = new Set(COMPASS_HUMAN_ACTIVITY_KINDS)

function msOf(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** 리드의 기준 시각 — max(created_at, last_inflow_at). 둘 다 없거나 깨졌으면 null(= 시각을 따지지 않는다). */
export function leadInflowAtMs(lead: Pick<CompassSyncLead, "created_at" | "last_inflow_at">): number | null {
  const created = msOf(lead.created_at)
  const inflow = msOf(lead.last_inflow_at)
  if (created == null) return inflow
  if (inflow == null) return created
  return Math.max(created, inflow)
}

/** Compass lead id → 사람 손 활동(사람 kind + 자동 작성자 아님)의 **가장 늦은** 시각(ms). 시각이 없는 활동은 0. */
export function humanTouchedCompassLeadIds(activities: readonly CompassActivitySignal[]): Map<number, number> {
  const touched = new Map<number, number>()
  for (const activity of activities) {
    if (!activity.kind || !HUMAN_KINDS.has(activity.kind)) continue
    const actor = activity.actor?.trim()
    if (actor && COMPASS_AUTOMATED_ACTORS.has(actor)) continue
    const at = msOf(activity.created_at) ?? 0
    const current = touched.get(activity.lead_id)
    if (current == null || at > current) touched.set(activity.lead_id, at)
  }
  return touched
}

/** Compass 행이 처리된 시각 — updated_at(단계 이동·종료가 now() 로 찍는다)이 없으면 created_at. */
function compassRowAtMs(row: CompassOverlaySource): number | null {
  return msOf(row.updated_at) ?? msOf(row.created_at)
}

/** 이 Compass 근거(시각)가 리드 문의 뒤의 것인가 — 리드 시각을 모르면 참, 근거 시각을 모르면 거짓(보수적). */
function afterInflow(atMs: number | null, inflowMs: number | null): boolean {
  if (inflowMs == null) return true
  return atMs != null && atMs >= inflowMs
}

export interface CompassLeadStatusSyncPlan {
  /** 판정에 넣은 어드민 리드 수 */
  scanned: number
  /** 전화 키로 Compass 행이 하나라도 붙은 리드 수 */
  matched: number
  contacted: string[]
  /** from = 바뀌기 전 상태 — 감사 기록과 복구의 근거 */
  closed: Array<{ id: string; from: "new" | "contacted" }>
}

function stageOf(row: CompassOverlaySource): string | null {
  return row.stage?.trim() || null
}

/** 단계만으로 "MKT가 처리했다"가 확정되는 행 — 신규유입(new)을 벗어난 단계. */
function movedPastNew(row: CompassOverlaySource): boolean {
  const stage = stageOf(row)
  return stage !== null && stage !== "new"
}

/** 단계만으로 "이 문의를 처리했다"가 되는 행 — 신규유입을 벗어났고, 그 처리가 문의 뒤다. */
function handledByStageAfter(row: CompassOverlaySource, inflowMs: number | null): boolean {
  return movedPastNew(row) && afterInflow(compassRowAtMs(row), inflowMs)
}

/**
 * 리드 한 건의 다음 상태. 바꿀 게 없으면 null.
 *
 * @param rows 같은 전화 키의 Compass 행들
 * @param touched Compass lead id → 사람 손 활동(COMPASS_HUMAN_ACTIVITY_KINDS)의 가장 늦은 시각(humanTouchedCompassLeadIds)
 */
export function decideLeadStatusFromCompass(
  lead: Pick<CompassSyncLead, "status" | "created_at" | "last_inflow_at">,
  rows: readonly CompassOverlaySource[],
  touched: ReadonlyMap<number, number>
): LeadStatusFromCompass | null {
  if (lead.status !== "new" && lead.status !== "contacted") return null
  const representative = pickRepresentativeCompassRow(rows)
  if (!representative) return null
  const inflowMs = leadInflowAtMs(lead)
  if (stageOf(representative) === "lost" && afterInflow(compassRowAtMs(representative), inflowMs)) return "closed"
  if (lead.status !== "new") return null
  const handled = rows.some((row) => {
    if (handledByStageAfter(row, inflowMs)) return true
    const touchedAt = touched.get(row.id)
    return touchedAt != null && afterInflow(touchedAt, inflowMs)
  })
  return handled ? "contacted" : null
}

function groupByPhoneKey(rows: readonly CompassOverlaySource[]): Map<string, CompassOverlaySource[]> {
  const groups = new Map<string, CompassOverlaySource[]>()
  for (const row of rows) {
    const key = joinableCompassPhoneKey(row.phone_key?.trim())
    if (!key) continue
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return groups
}

/** 매칭에 쓸 수 있는 전화 키 — 정규화 후 9자리 미만이거나 자리표시·더미 번호면 null. */
function lookupKeyOf(lead: Pick<CompassSyncLead, "phone">): string | null {
  return joinableCompassPhoneKey(normalizePhoneKey(lead.phone))
}

/** Compass 에 조회할 전화 키(중복 없음). 매칭에 못 쓰는 짧은 키로 조회해 행 상한을 채우지 않게 한다. */
export function compassLookupPhoneKeys<T extends Pick<CompassSyncLead, "phone">>(leads: readonly T[]): string[] {
  const keys = new Set<string>()
  for (const lead of leads) {
    const key = lookupKeyOf(lead)
    if (key) keys.add(key)
  }
  return [...keys]
}

function matchedGroup(
  lead: Pick<CompassSyncLead, "phone">,
  groups: Map<string, CompassOverlaySource[]>
): CompassOverlaySource[] | undefined {
  const key = lookupKeyOf(lead)
  return key ? groups.get(key) : undefined
}

/** 어드민 리드 전체에 판정을 돌려 바꿀 목록을 만든다. */
export function planCompassLeadStatusSync(
  leads: readonly CompassSyncLead[],
  compassRows: readonly CompassOverlaySource[],
  touched: ReadonlyMap<number, number>
): CompassLeadStatusSyncPlan {
  const groups = groupByPhoneKey(compassRows)
  const plan: CompassLeadStatusSyncPlan = { scanned: leads.length, matched: 0, contacted: [], closed: [] }
  for (const lead of leads) {
    const group = matchedGroup(lead, groups)
    if (!group) continue
    plan.matched += 1
    const next = decideLeadStatusFromCompass(lead, group, touched)
    if (next === "contacted") plan.contacted.push(lead.id)
    if (next === "closed" && (lead.status === "new" || lead.status === "contacted")) {
      plan.closed.push({ id: lead.id, from: lead.status })
    }
  }
  return plan
}

/**
 * 활동을 조회해야 판정이 끝나는 Compass lead id — 신규 리드 중 "문의 뒤에 단계를 벗어난" 행이 하나도 없는 경우.
 * 그런 행이 있으면(단계 이동·이탈) 단계만으로 결론이 나서 활동 조회가 필요 없다. 문의 **전에** 벗어난 행뿐이면
 * 그 뒤의 사람 손 활동이 있는지 봐야 한다.
 */
export function compassLeadIdsNeedingActivityCheck(
  leads: readonly CompassSyncLead[],
  compassRows: readonly CompassOverlaySource[]
): number[] {
  const groups = groupByPhoneKey(compassRows)
  const ids = new Set<number>()
  for (const lead of leads) {
    if (lead.status !== "new") continue
    const group = matchedGroup(lead, groups)
    if (!group) continue
    const inflowMs = leadInflowAtMs(lead)
    if (group.some((row) => handledByStageAfter(row, inflowMs))) continue
    for (const row of group) ids.add(row.id)
  }
  return [...ids].sort((a, b) => a - b)
}
