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

function hasInflowStamp(lead: ReinflowLead): boolean {
  const created = timeOf(lead.timestamp)
  const inflow = timeOf(lead.last_inflow_at)
  if (created === null || inflow === null) return false
  return inflow - created > REINFLOW_STAMP_TOLERANCE_MS
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
