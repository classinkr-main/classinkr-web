// Compass(MKT) 리드 처리 결과 → 어드민 리드 상태 자동 반영의 순수 판정 규칙.
// 설계: docs/superpowers/specs/2026-09-14-lead-contact-compass-sync-design.md
//
// 러프한 연동이다 — 콜 기록을 복제하지 않고 상태 한 칸만 MKT 처리 결과에 맞춘다.
//  * 한 방향만: new → contacted, new·contacted → closed. 전환·종료는 건드리지 않고 되돌리지 않는다.
//  * 매칭 키는 전화 정규화 키 하나(normalizePhoneKey = compass_leads_v.phone_key 식).
//  * 이탈 판정은 Compass 칩과 같은 대표 행(pickRepresentativeCompassRow) 기준이다.
//  * 서버 의존 없음 — 조회·쓰기는 lib/server/lead-contact-compass-sync.ts 가 한다.

import { normalizePhoneKey } from "@/lib/compass/normalize"
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

/** 이보다 짧은 전화 키는 매칭하지 않는다 — '0' 같은 잘못된 번호끼리 붙는 것을 막는다(지역번호 포함 최소 9자리). */
const MIN_PHONE_KEY_LENGTH = 9

export type LeadStatusFromCompass = "contacted" | "closed"

export interface CompassSyncLead {
  id: string
  phone?: string | null
  status: LeadStatus
}

/** 활동 판정에 필요한 최소 필드 — 본문은 싣지 않는다. */
export interface CompassActivitySignal {
  lead_id: number
  kind: string | null
  actor: string | null
}

const HUMAN_KINDS: ReadonlySet<string> = new Set(COMPASS_HUMAN_ACTIVITY_KINDS)

/** 사람 손 활동(사람 kind + 자동 작성자 아님)이 한 건이라도 있는 Compass lead id. */
export function humanTouchedCompassLeadIds(activities: readonly CompassActivitySignal[]): Set<number> {
  const touched = new Set<number>()
  for (const activity of activities) {
    if (!activity.kind || !HUMAN_KINDS.has(activity.kind)) continue
    const actor = activity.actor?.trim()
    if (actor && COMPASS_AUTOMATED_ACTORS.has(actor)) continue
    touched.add(activity.lead_id)
  }
  return touched
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

/**
 * 리드 한 건의 다음 상태. 바꿀 게 없으면 null.
 *
 * @param rows 같은 전화 키의 Compass 행들
 * @param touchedCompassLeadIds 사람 손 활동(COMPASS_HUMAN_ACTIVITY_KINDS)이 있는 Compass lead id
 */
export function decideLeadStatusFromCompass(
  lead: Pick<CompassSyncLead, "status">,
  rows: readonly CompassOverlaySource[],
  touchedCompassLeadIds: ReadonlySet<number>
): LeadStatusFromCompass | null {
  if (lead.status !== "new" && lead.status !== "contacted") return null
  const representative = pickRepresentativeCompassRow(rows)
  if (!representative) return null
  if (stageOf(representative) === "lost") return "closed"
  if (lead.status !== "new") return null
  const handled = rows.some((row) => movedPastNew(row) || touchedCompassLeadIds.has(row.id))
  return handled ? "contacted" : null
}

function groupByPhoneKey(rows: readonly CompassOverlaySource[]): Map<string, CompassOverlaySource[]> {
  const groups = new Map<string, CompassOverlaySource[]>()
  for (const row of rows) {
    const key = row.phone_key?.trim()
    if (!key || key.length < MIN_PHONE_KEY_LENGTH) continue
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return groups
}

/** 매칭에 쓸 수 있는 전화 키 — 정규화 후 9자리 미만이면 null. */
function lookupKeyOf(lead: Pick<CompassSyncLead, "phone">): string | null {
  const key = normalizePhoneKey(lead.phone)
  return key && key.length >= MIN_PHONE_KEY_LENGTH ? key : null
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
  touchedCompassLeadIds: ReadonlySet<number>
): CompassLeadStatusSyncPlan {
  const groups = groupByPhoneKey(compassRows)
  const plan: CompassLeadStatusSyncPlan = { scanned: leads.length, matched: 0, contacted: [], closed: [] }
  for (const lead of leads) {
    const group = matchedGroup(lead, groups)
    if (!group) continue
    plan.matched += 1
    const next = decideLeadStatusFromCompass(lead, group, touchedCompassLeadIds)
    if (next === "contacted") plan.contacted.push(lead.id)
    if (next === "closed" && (lead.status === "new" || lead.status === "contacted")) {
      plan.closed.push({ id: lead.id, from: lead.status })
    }
  }
  return plan
}

/**
 * 활동을 조회해야 판정이 끝나는 Compass lead id — 신규 리드 중 매칭 행 단계가 전부 신규유입인 경우만.
 * 나머지(단계 이동·이탈·이미 연락함)는 단계만으로 결론이 나서 활동 조회가 필요 없다.
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
    if (!group || group.some(movedPastNew)) continue
    for (const row of group) ids.add(row.id)
  }
  return [...ids].sort((a, b) => a - b)
}
