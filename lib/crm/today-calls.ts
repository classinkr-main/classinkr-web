import type { CrmPriorityItem } from "@/lib/crm/priority"

// "오늘 전화할 N건" 선별기 — 홈 우선순위 패널의 판단 코어.
//
// 왜 쿼터 믹스인가: 점수 하나로 자르면 목록이 최다 유입원(메타 리드 미응답)으로 도배되고,
// 만료 임박 고객·재방문 신호처럼 성격이 다른 기회는 화면에 아예 못 올라온다(2026-08 실측:
// 상위 5건 전부 "미배정 신규 24~48h 미응답"). 오늘의 전화는 성격별 자리를 먼저 확보하고,
// 자리가 남을 때만 점수순으로 채운다.

export type TodayCallSlotKey = "new_response" | "money" | "reengage"

export interface TodayCallSlotDef {
  key: TodayCallSlotKey
  label: string
  hint: string
  quota: number
}

// 기본 5건 = 신규 응대 2 + 돈 임박 2 + 다시 움직임 1.
// 숫자는 팀 운영 감각으로 조정 가능하되, 어느 한 성격이 전부를 차지하지 못하게 유지한다.
export const TODAY_CALL_SLOTS: TodayCallSlotDef[] = [
  { key: "new_response", label: "신규 응대", hint: "새 문의 첫 응답", quota: 2 },
  { key: "money", label: "돈 임박", hint: "만료·충전·연장", quota: 2 },
  { key: "reengage", label: "다시 움직임", hint: "재방문·데모·약속", quota: 1 },
]

export interface TodayCall {
  item: CrmPriorityItem
  slot: TodayCallSlotKey
  slotLabel: string
  /** 같은 기관의 다른 리드가 접혔으면 그 수 — "같은 기관 +N건"으로 표기. */
  groupedCount: number
}

export interface TodayCallsResult {
  calls: TodayCall[]
  /** 선별에 못 든 다음 후보(분류 유지, 오늘 버킷 우선 정렬). */
  overflow: TodayCall[]
  totals: {
    /** bucket === "today" 전체 후보 수(메타 제외). */
    today: number
    /** 슬롯별 오늘 후보 수(선별 전 모수, 메타 제외). */
    slots: Record<TodayCallSlotKey, number>
  }
  /**
   * 메타 광고 리드는 카드 선별에서 완전히 분리한다 — 절대다수 유입원이라 카드에 섞으면
   * 직접 문의·기존 고객 기회가 다시 도배당한다. 함축 밴드(건수 + 상위 몇 건)로만 노출.
   */
  meta: {
    total: number
    today: number
    top: CrmPriorityItem[]
  }
}

const SLOT_LABEL: Record<TodayCallSlotKey, string> = {
  new_response: "신규 응대",
  money: "돈 임박",
  reengage: "다시 움직임",
}

// 분류는 엔진이 이미 계산한 action/actionLabel/reason을 읽는다 — 점수 재계산 금지.
//  - 다시 움직임: 재활성 계정, 연락 후 재방문 리드, 데모 전후, 오늘 팔로업 약속
//  - 돈 임박: 나머지 기존 고객 전부(만료·충전·연장·회복 — 전부 돈 축)
//  - 신규 응대: 첫 응답 대기 리드
export function classifyTodayCallSlot(item: CrmPriorityItem): TodayCallSlotKey {
  if (
    item.action === "reengage_account" ||
    item.actionLabel.includes("데모") ||
    item.reason.includes("재방문") ||
    (item.source === "lead" && item.action === "follow_up_lead")
  ) {
    return "reengage"
  }
  if (item.source === "neo_account") return "money"
  return "new_response"
}

const BUCKET_RANK: Record<CrmPriorityItem["bucket"], number> = {
  today: 0,
  renewal: 1,
  watch: 2,
  stale_recovery: 3,
}

function compareWithinSlot(a: CrmPriorityItem, b: CrmPriorityItem) {
  const bucketDiff = BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket]
  if (bucketDiff !== 0) return bucketDiff
  if (a.score !== b.score) return b.score - a.score
  const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER
  const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER
  return aTime - bTime
}

function orgKey(item: CrmPriorityItem): string | null {
  const key = item.subtitle?.trim().toLowerCase().replace(/\s+/g, "")
  return key && key.length > 1 ? key : null
}

export function isMetaLeadItem(item: CrmPriorityItem) {
  return item.source === "lead" && item.sourceKey === "meta_lead_ads"
}

export function pickTodayCalls(
  items: CrmPriorityItem[],
  options?: { limit?: number; slots?: TodayCallSlotDef[] }
): TodayCallsResult {
  const slotDefs = options?.slots ?? TODAY_CALL_SLOTS
  const limit = options?.limit ?? slotDefs.reduce((sum, slot) => sum + slot.quota, 0)

  // 할 일은 이 큐의 소비자가 이미 제외하지만, 방어적으로 한 번 더 거른다.
  // 메타 광고 리드는 카드 풀에서 통째로 분리 — meta 밴드가 따로 담는다.
  const metaLeads = items.filter((item) => item.source !== "task" && isMetaLeadItem(item)).sort(compareWithinSlot)
  const candidates = items.filter((item) => item.source !== "task" && !isMetaLeadItem(item))

  const bySlot = new Map<TodayCallSlotKey, CrmPriorityItem[]>()
  for (const def of slotDefs) bySlot.set(def.key, [])
  for (const item of candidates) {
    bySlot.get(classifyTodayCallSlot(item))?.push(item)
  }
  for (const list of bySlot.values()) list.sort(compareWithinSlot)

  // 신규 응대는 같은 기관의 중복 리드를 접는다 — 한 학원에 세 번 전화하는 목록을 만들지 않는다.
  const grouped = new Map<string, number>()
  const dedupedNewResponse: CrmPriorityItem[] = []
  const seenOrgs = new Set<string>()
  for (const item of bySlot.get("new_response") ?? []) {
    const key = orgKey(item)
    if (key) {
      if (seenOrgs.has(key)) {
        grouped.set(key, (grouped.get(key) ?? 0) + 1)
        continue
      }
      seenOrgs.add(key)
    }
    dedupedNewResponse.push(item)
  }
  bySlot.set("new_response", dedupedNewResponse)

  const totals: TodayCallsResult["totals"] = {
    today: candidates.filter((item) => item.bucket === "today").length,
    slots: {
      new_response: (bySlot.get("new_response") ?? []).filter((i) => i.bucket === "today").length,
      money: (bySlot.get("money") ?? []).filter((i) => i.bucket === "today").length,
      reengage: (bySlot.get("reengage") ?? []).filter((i) => i.bucket === "today").length,
    },
  }

  const picked: TodayCall[] = []
  const pickedIds = new Set<string>()
  const toCall = (item: CrmPriorityItem, slot: TodayCallSlotKey): TodayCall => {
    const key = orgKey(item)
    return {
      item,
      slot,
      slotLabel: SLOT_LABEL[slot],
      groupedCount: slot === "new_response" && key ? (grouped.get(key) ?? 0) : 0,
    }
  }

  // 1차: 슬롯 쿼터를 "오늘 버킷" 후보로 채운다. 오늘 후보가 모자라면 같은 슬롯의
  // 다음 버킷(관찰 등)으로 내려간다 — 성격 유지가 점수보다 먼저다.
  for (const def of slotDefs) {
    const pool = bySlot.get(def.key) ?? []
    for (const item of pool) {
      if (picked.length >= limit) break
      if (pickedIds.has(item.id)) continue
      if (picked.filter((call) => call.slot === def.key).length >= def.quota) break
      picked.push(toCall(item, def.key))
      pickedIds.add(item.id)
    }
  }

  // 2차: 어떤 슬롯이 비어 총량이 모자라면, 남은 후보 전체에서 버킷 순 → 점수순으로 채운다.
  if (picked.length < limit) {
    const rest = candidates
      .filter((item) => !pickedIds.has(item.id))
      .filter((item) => {
        // 신규 응대에서 접힌 중복 기관 리드는 백필에도 다시 올리지 않는다.
        const slot = classifyTodayCallSlot(item)
        if (slot !== "new_response") return true
        return (bySlot.get("new_response") ?? []).includes(item)
      })
      .sort(compareWithinSlot)
    for (const item of rest) {
      if (picked.length >= limit) break
      picked.push(toCall(item, classifyTodayCallSlot(item)))
      pickedIds.add(item.id)
    }
  }

  const overflow = candidates
    .filter((item) => !pickedIds.has(item.id))
    .filter((item) => {
      const slot = classifyTodayCallSlot(item)
      if (slot !== "new_response") return true
      return (bySlot.get("new_response") ?? []).includes(item)
    })
    .sort(compareWithinSlot)
    .map((item) => toCall(item, classifyTodayCallSlot(item)))

  return {
    calls: picked,
    overflow,
    totals,
    meta: {
      total: metaLeads.length,
      today: metaLeads.filter((item) => item.bucket === "today").length,
      top: metaLeads.slice(0, 4),
    },
  }
}
