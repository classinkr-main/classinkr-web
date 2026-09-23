// 자체 리드의 재유입 판정 — "이 연락처가 처음이 아니다"를 이미 가진 데이터에서 도출한다.
//
// 배경(2026-08-28 실측): public.leads.last_inflow_at 컬럼은 만들어졌지만 백필이
// created_at 그대로였고, 자체 저장 경로는 같은 연락처가 다시 제출돼도 **행을 새로 만든다**
// (병합하지 않는다). 그래서 재유입의 실제 근거는 두 가지뿐이다.
//
//  1) repeat_contact — 같은 전화/이메일의 더 이른 리드가 이미 있다. 오늘 데이터로 참이다.
//  2) inflow_stamp   — last_inflow_at이 생성 시각보다 유의미하게 뒤다. 저장 경로가 갱신을
//                      시작한 뒤에만 참이 된다(과거 행은 백필로 둘이 같다).
//
// 두 근거 중 하나라도 서면 재유입으로 센다. 근거가 없으면 숫자를 만들지 않는다.
//
// 2026-09-21 통합으로 응대 대상 소스의 재문의는 새 행 대신 기존 행의 last_inflow_at 만 갱신한다
// (lib/server/lead-capture.ts 재유입 병합). 그래서 "기간 안 유입"을 생성 시각만으로 세면 재문의가 통째로
// 빠진다 — 아래 leadInflowInWindow·tallyLeadInflow 가 유입 축 max(created_at, last_inflow_at)으로 센다.

import { normalizePhoneKey } from "@/lib/compass/normalize"

export type ReinflowReason = "repeat_contact" | "inflow_stamp"

export interface ReinflowLead {
  id: string
  phone?: string | null
  email?: string | null
  /** 리드 생성 시각(LeadRecord.timestamp = leads.created_at). */
  timestamp: string
  last_inflow_at?: string | null
}

/**
 * 백필 오차·저장 지연을 재유입으로 오인하지 않기 위한 여유. created_at과 last_inflow_at의
 * 차이가 이 값 이하이면 "최초 유입이 곧 마지막 유입"으로 본다.
 */
export const REINFLOW_STAMP_TOLERANCE_MS = 60_000

function contactKeys(lead: ReinflowLead): string[] {
  const keys: string[] = []
  const phone = normalizePhoneKey(lead.phone)
  if (phone) keys.push(`p:${phone}`)
  const email = lead.email?.trim().toLowerCase()
  if (email) keys.push(`e:${email}`)
  return keys
}

function timeOf(value: string | null | undefined): number | null {
  if (!value) return null
  const at = new Date(value).getTime()
  return Number.isNaN(at) ? null : at
}

/** 유입 축 판정에 필요한 두 시각 — 생성(LeadRecord.timestamp)과 최신 유입(last_inflow_at). */
export type LeadInflowTimes = Pick<ReinflowLead, "timestamp" | "last_inflow_at">

function hasInflowStamp(lead: LeadInflowTimes): boolean {
  const created = timeOf(lead.timestamp)
  const inflow = timeOf(lead.last_inflow_at)
  if (created === null || inflow === null) return false
  return inflow - created > REINFLOW_STAMP_TOLERANCE_MS
}

/** 기간 판정 결과 — 신규면 생성 시각, 재유입이면 최신 재유입(last_inflow_at) 시각. */
export type LeadInflowKind = "new" | "reinflow"

export interface LeadInflowEvent {
  kind: LeadInflowKind
  at: string
  atMs: number
}

export interface LeadInflowWindowOptions {
  /**
   * 창 끝을 포함하는가. 기본은 반열린 창 [from, to) — 일일·주간·월간 보고처럼 창이 이어 붙는 곳에서
   * 경계 시각의 리드가 두 창에 동시에 잡히지 않게. "오늘 유입"처럼 끝이 "지금"인 창만 true 로 닫는다.
   */
  inclusiveEnd?: boolean
}

/**
 * 자체 리드가 창 [fromMs, toMs) 안에 유입했는가, 했다면 신규인가 재유입인가.
 * Compass 쪽 lib/compass/inflow-window.ts compassInflowInWindow 와 같은 규칙이다.
 *  - 생성 시각이 창 안이면 신규(같은 창 안에서 재문의까지 했어도 1건) — 시각은 생성 시각.
 *  - 아니면 last_inflow_at 이 생성 시각보다 유의미하게 뒤이고(REINFLOW_STAMP_TOLERANCE_MS) 창 안일 때
 *    재유입 — 시각은 재유입 시각. 백필·신규 저장은 두 값이 같아 재유입으로 승격하지 않는다.
 *  - 둘 다 창 밖이거나 시각이 깨졌으면 null.
 * 한계: last_inflow_at 은 **최신** 재문의만 담는다. 지난 창에 재문의하고 이번 창에 또 재문의한 리드는
 * 지난 창에서 보이지 않는다(활동 이력을 읽지 않는 한 복원 불가 — 직전 기간 대비 델타가 그만큼 커질 수 있다).
 */
export function leadInflowInWindow(
  lead: LeadInflowTimes,
  fromMs: number,
  toMs: number,
  { inclusiveEnd = false }: LeadInflowWindowOptions = {}
): LeadInflowEvent | null {
  const inWindow = (ms: number) => ms >= fromMs && (inclusiveEnd ? ms <= toMs : ms < toMs)
  const created = timeOf(lead.timestamp)
  if (created !== null && inWindow(created)) {
    return { kind: "new", at: lead.timestamp, atMs: created }
  }
  if (!lead.last_inflow_at || !hasInflowStamp(lead)) return null
  const inflow = timeOf(lead.last_inflow_at)
  if (inflow === null || !inWindow(inflow)) return null
  return { kind: "reinflow", at: lead.last_inflow_at, atMs: inflow }
}

export interface LeadInflowTally<T> {
  /** 창 안에 유입한 리드(신규 + 재유입). 한 리드는 창마다 한 번만 — 생성과 재문의가 모두 창 안이면 신규. */
  leads: T[]
  newCount: number
  reinflowCount: number
}

/** 리드 목록을 한 창의 유입 축으로 걸러 신규/재유입을 함께 센다. 소스·테스트 리드 필터는 호출부가 먼저 건다. */
export function tallyLeadInflow<T extends LeadInflowTimes>(
  leads: readonly T[],
  fromMs: number,
  toMs: number,
  options: LeadInflowWindowOptions = {}
): LeadInflowTally<T> {
  const inflowLeads: T[] = []
  let reinflowCount = 0
  for (const lead of leads) {
    const event = leadInflowInWindow(lead, fromMs, toMs, options)
    if (!event) continue
    inflowLeads.push(lead)
    if (event.kind === "reinflow") reinflowCount += 1
  }
  return {
    leads: inflowLeads,
    newCount: inflowLeads.length - reinflowCount,
    reinflowCount,
  }
}

/**
 * 리드 전량을 훑어 재유입 리드의 id → 근거 맵을 만든다.
 *
 * 판정은 **전달된 모집단 안에서만** 성립한다. 기간으로 자른 배열만 넘기면 그 기간 밖의
 * 선행 유입을 못 보므로, 호출부는 화면이 가진 전량을 넘기고 세는 것만 부분집합으로 한다.
 */
export function buildReinflowIndex(leads: ReinflowLead[]): Map<string, ReinflowReason> {
  const index = new Map<string, ReinflowReason>()

  // 같은 연락처끼리 묶어 시간순 최초 1건만 "최초 유입"으로 남긴다.
  const firstSeen = new Map<string, string>()
  const ordered = [...leads].sort((a, b) => {
    const left = timeOf(a.timestamp) ?? Number.POSITIVE_INFINITY
    const right = timeOf(b.timestamp) ?? Number.POSITIVE_INFINITY
    if (left !== right) return left - right
    // 동시각 동률은 id로 전순서를 만든다 — 정렬이 흔들리면 어느 쪽이 "최초"인지 매번 바뀐다.
    return a.id.localeCompare(b.id)
  })

  for (const lead of ordered) {
    const keys = contactKeys(lead)
    let repeat = false
    for (const key of keys) {
      const seenId = firstSeen.get(key)
      if (seenId && seenId !== lead.id) repeat = true
      else if (!seenId) firstSeen.set(key, lead.id)
    }
    if (repeat) index.set(lead.id, "repeat_contact")
    else if (hasInflowStamp(lead)) index.set(lead.id, "inflow_stamp")
  }

  return index
}

/** 부분집합(화면에 보이는 기간)에서 재유입 건수만 센다. */
export function countReinflow(
  subset: Array<{ id: string }>,
  index: Map<string, ReinflowReason>
): number {
  let count = 0
  for (const lead of subset) if (index.has(lead.id)) count += 1
  return count
}
