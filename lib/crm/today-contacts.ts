// 오늘(KST) 기록에서 연락한 고객/리드를 뽑아내는 순수 함수 — 기획 §11.2 A1.
// ActivityQuickForm 컴포저의 "최근·오늘 연락 고객" 칩 행이 이 함수와 recent-customers.ts(최근 열람)를
// 합쳐 칩 목록을 만든다. 여기는 "오늘 기록 대상" 절반만 담당한다: I/O 없음, /api/admin/crm/events 응답의
// rows(CrmEventRecord[])를 그대로 받는다.

import type { CrmEventRecord } from "@/components/admin/crm/rail/activity-contract"

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** 칩으로 원클릭 연결 가능한 대상 종류 — CrmCustomerPicker의 CustomerPickValue와 같은 폭. */
export type TodayContactTargetType = "lead" | "neo_account"

export interface TodayContact {
  /** recent-customers.ts와 같은 통합 키 형식(`lead:{id}` / `neo:{id}`) — 병합 시 중복 제거 기준. */
  key: string
  targetType: TodayContactTargetType
  targetId: string
  name: string
  occurredAt: string
}

/** extractTodayContacts가 읽는 최소 행 구조 — CrmEventRecord를 그대로 넘겨도 된다. */
export type TodayContactEvent = Pick<CrmEventRecord, "targetType" | "targetId" | "targetLabel" | "occurredAt">

/** 칩 행에 올릴 오늘 기록 대상 상한(기획 §14.2 A1 — 최근 4 + 오늘 4를 합쳐 최대 6). */
export const TODAY_CONTACTS_LIMIT = 4

function kstDayStart(ms: number): number {
  const kst = ms + KST_OFFSET_MS
  return Math.floor(kst / DAY_MS) * DAY_MS - KST_OFFSET_MS
}

function unifiedKey(targetType: TodayContactTargetType, targetId: string): string {
  return `${targetType === "lead" ? "lead" : "neo"}:${targetId}`
}

/**
 * 오늘(KST 00:00~24:00) occurredAt을 가진 행에서 연결된 대상(lead/neo_account)만 뽑아
 * 중복 제거(같은 대상은 가장 최근 occurredAt만 유지) 후 최근순으로 정렬해 상한까지 자른다.
 * targetType이 customer/deal/unknown이거나 targetId·targetLabel이 비어 있으면 칩으로 만들 수 없어 건너뛴다.
 */
export function extractTodayContacts(events: TodayContactEvent[], nowMs: number): TodayContact[] {
  const todayStart = kstDayStart(nowMs)
  const todayEnd = todayStart + DAY_MS
  const byKey = new Map<string, TodayContact>()

  for (const event of events) {
    if (event.targetType !== "lead" && event.targetType !== "neo_account") continue
    const targetId = event.targetId?.trim()
    const name = event.targetLabel?.trim()
    if (!targetId || !name) continue

    const occurredMs = new Date(event.occurredAt).getTime()
    if (Number.isNaN(occurredMs) || occurredMs < todayStart || occurredMs >= todayEnd) continue

    const key = unifiedKey(event.targetType, targetId)
    const existing = byKey.get(key)
    if (existing && new Date(existing.occurredAt).getTime() >= occurredMs) continue
    byKey.set(key, { key, targetType: event.targetType, targetId, name, occurredAt: event.occurredAt })
  }

  return Array.from(byKey.values())
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, TODAY_CONTACTS_LIMIT)
}
