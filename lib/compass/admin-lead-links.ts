import "server-only"

// 어드민 리드 ↔ Compass 리드 매칭의 한 자리 — **링크 우선, 전화 키 폴백**(연동 2차 compass-integration-2026-09-14.md §4-4, 2026-11-04 구현).
//
//  * 링크: Compass 가 홈페이지 폼 리드를 받으며 거는 crm.lead_refs(system='home_lead', external_id=어드민 리드 id) —
//    compass_lead_refs_v 로 읽는다(Compass ADR-0082). 전화가 없거나 자리표시·더미 번호인 리드도 정확히 붙는다.
//  * 전화 키: 예전 규칙 그대로(normalizePhoneKey → compass_leads_v.phone_key). 링크가 없는 옛 리드·수동 등록 리드가 이 길로 붙는다.
//    자리표시·더미 번호 가드(joinableCompassPhoneKey)는 여기서 걸지 않는다 — 고객 360·타임라인은 사람이 보는 단건 화면이라 예전과 같이
//    번호 그대로 붙이고, 자동 반영(크론)은 자기 쪽 compassLookupPhoneKeys 가 가드를 건다(2026-10-12 브리지 감사 4번).
//  * 둘은 합집합이다(Compass 리드 id 로 중복 제거). 어느 한 조회라도 끊기면 전체를 down 으로 — 반쪽 결과를 "매칭 없음"으로 그리면
//    이미 콜이 돌고 있는 리드를 미접촉으로 오인한다(브리지 공통 계약).
//  * 읽기 전용 — 어디에도 쓰지 않는다.

import {
  getCompassHomeLeadRefs,
  getCompassLeadsByIds,
  getCompassLeadsByPhoneKeys,
  type CompassLeadRow,
  type CompassResult,
} from "@/lib/compass/bridge"
import { normalizePhoneKey } from "@/lib/compass/normalize"

/** 어드민 리드 id → Compass 리드 id 목록(링크). 링크가 없는 리드는 키가 없다. */
export type CompassLinkMap = Map<string, number[]>

export interface CompassLinksResult {
  links: CompassLinkMap
  down: boolean
  error?: string
}

/** 어드민 리드 id 들의 Compass 링크 — 크론·오버레이가 한 번에 묻는다. */
export async function getCompassLinksForAdminLeads(adminLeadIds: readonly string[]): Promise<CompassLinksResult> {
  const ids = [...new Set(adminLeadIds.map((id) => id?.trim()).filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return { links: new Map(), down: false }
  const refs = await getCompassHomeLeadRefs(ids)
  if (refs.down) return { links: new Map(), down: true, error: refs.error }
  const links: CompassLinkMap = new Map()
  for (const ref of refs.rows) {
    if (!Number.isInteger(ref.lead_id)) continue
    const list = links.get(ref.external_id)
    if (list) {
      if (!list.includes(ref.lead_id)) list.push(ref.lead_id)
    } else links.set(ref.external_id, [ref.lead_id])
  }
  for (const list of links.values()) list.sort((a, b) => a - b)
  return { links, down: false }
}

export interface CompassLeadsForAdminLead extends CompassResult<CompassLeadRow> {
  /** 링크(home_lead)로 붙은 Compass 리드 id — 전화 키로만 붙은 행은 여기 없다. */
  linkedIds: number[]
}

/**
 * 어드민 리드 한 건(id·전화) → 그 사람의 Compass 리드 행 전부(링크 ∪ 전화 키). 고객 360·타임라인이 쓴다.
 * 전화도 링크도 없으면 조회 없이 빈 결과(추측 매칭 금지).
 */
export async function getCompassLeadsForAdminLead(input: {
  leadId?: string | null
  phone?: string | null
}): Promise<CompassLeadsForAdminLead> {
  const leadId = input.leadId?.trim() || null
  const key = normalizePhoneKey(input.phone)
  if (!leadId && !key) return { rows: [], down: false, linkedIds: [] }

  let linkedIds: number[] = []
  if (leadId) {
    const links = await getCompassLinksForAdminLeads([leadId])
    if (links.down) return { rows: [], down: true, error: links.error, linkedIds: [] }
    linkedIds = links.links.get(leadId) ?? []
  }

  const [linked, byPhone] = await Promise.all([
    linkedIds.length ? getCompassLeadsByIds(linkedIds) : Promise.resolve<CompassResult<CompassLeadRow>>({ rows: [], down: false }),
    key ? getCompassLeadsByPhoneKeys([key]) : Promise.resolve<CompassResult<CompassLeadRow>>({ rows: [], down: false }),
  ])
  if (linked.down) return { rows: [], down: true, error: linked.error, linkedIds }
  if (byPhone.down) return { rows: [], down: true, error: byPhone.error, linkedIds }

  const byId = new Map<number, CompassLeadRow>()
  for (const row of [...linked.rows, ...byPhone.rows]) if (!byId.has(row.id)) byId.set(row.id, row)
  return {
    rows: [...byId.values()].sort((a, b) => a.id - b.id),
    down: false,
    truncated: byPhone.truncated,
    linkedIds,
  }
}
