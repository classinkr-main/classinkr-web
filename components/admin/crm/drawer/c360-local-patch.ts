// 고객 360 드로어의 낙관 갱신(로컬 patch) 순수 헬퍼 — c360-03.
//
// 드로어의 모든 쓰기(할 일·딜·CS·추천)는 성공 응답의 레코드로 화면을 먼저 바꾸고, 360 전량 재조회는
// 백그라운드로 흘린다. 그런데 할 일 저장소는 쓰기 뒤 revalidateTag(tag, "max")(SWR)라 force 없는
// 재검증이 처리 전 행을 한 번 더 돌려줄 수 있다(CrmWeekAheadPanel의 OVERRIDE_MS와 같은 문제).
// 그래서 방금 반영한 로컬 변경을 C360_OVERRIDE_MS 동안 서버 응답 위에 다시 덧씌운다.
// 헤더의 명시 새로고침(force)은 이 목록을 비운다.

import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import type { CrmDealRecord } from "@/lib/repositories/crm-deals"
import type { CrmTaskRecord } from "@/lib/repositories/crm-tasks"

export const C360_OVERRIDE_MS = 120_000

export type C360LocalOverride =
  | { kind: "task_removed"; id: string; at: number }
  | { kind: "task_added"; id: string; at: number; record: CrmTaskRecord }
  | { kind: "deal_added"; id: string; at: number; record: CrmDealRecord }
  | { kind: "deal_patched"; id: string; at: number; patch: Partial<CrmDealRecord> }

/** 할 일 완료 버튼의 DOM id — 행 제거 뒤 다음 행 첫 액션으로 포커스를 옮길 때 쓴다. */
export function taskCompleteButtonId(taskId: string): string {
  return `c360-task-done-${taskId}`
}

/** 할 일 섹션 heading id(tabIndex=-1) — 마지막 행이 사라지면 여기로 포커스를 돌린다. */
export const TASKS_SECTION_HEADING_ID = "c360-tasks-heading"

/** 새 할 일을 맨 앞에 넣고 summary(total/returned/open)를 함께 올린다. 이미 있으면 그대로. */
export function addTaskRow(data: Customer360, task: CrmTaskRecord): Customer360 {
  if (data.tasks.rows.some((row) => row.id === task.id)) return data
  const summary = data.tasks.summary
  return {
    ...data,
    tasks: {
      ...data.tasks,
      rows: [task, ...data.tasks.rows],
      summary: { ...summary, total: summary.total + 1, returned: summary.returned + 1, open: summary.open + 1 },
    },
  }
}

/** 할 일 행 제거(완료). 없는 행이면 그대로. */
export function removeTaskRow(data: Customer360, taskId: string): Customer360 {
  if (!data.tasks.rows.some((row) => row.id === taskId)) return data
  const summary = data.tasks.summary
  return {
    ...data,
    tasks: {
      ...data.tasks,
      rows: data.tasks.rows.filter((row) => row.id !== taskId),
      summary: {
        ...summary,
        total: Math.max(0, summary.total - 1),
        returned: Math.max(0, summary.returned - 1),
        open: Math.max(0, summary.open - 1),
      },
    },
  }
}

/** 롤백 — 제거했던 행을 원래 위치에 되돌린다. 이미 있으면 그대로. */
export function restoreTaskRow(data: Customer360, task: CrmTaskRecord, index: number): Customer360 {
  if (data.tasks.rows.some((row) => row.id === task.id)) return data
  const rows = [...data.tasks.rows]
  rows.splice(Math.max(0, Math.min(index, rows.length)), 0, task)
  const summary = data.tasks.summary
  return {
    ...data,
    tasks: {
      ...data.tasks,
      rows,
      summary: { ...summary, total: summary.total + 1, returned: summary.returned + 1, open: summary.open + 1 },
    },
  }
}

/** 새 딜을 맨 앞에 넣고 summary(total/returned/open/openAmount)를 함께 올린다. 이미 있으면 그대로. */
export function addDealRow(data: Customer360, deal: CrmDealRecord): Customer360 {
  if (data.deals.rows.some((row) => row.id === deal.id)) return data
  const summary = data.deals.summary
  const isOpen = deal.status === "open"
  return {
    ...data,
    deals: {
      ...data.deals,
      rows: [deal, ...data.deals.rows],
      summary: {
        ...summary,
        total: summary.total + 1,
        returned: summary.returned + 1,
        open: summary.open + (isOpen ? 1 : 0),
        openAmount: summary.openAmount + (isOpen ? deal.expectedAmount ?? 0 : 0),
      },
    },
  }
}

/** 딜 한 행만 교체(단계·예상금액·상태). 없는 행이면 그대로. */
export function patchDealRow(data: Customer360, dealId: string, patch: Partial<CrmDealRecord>): Customer360 {
  if (!data.deals.rows.some((row) => row.id === dealId)) return data
  return {
    ...data,
    deals: {
      ...data.deals,
      rows: data.deals.rows.map((row) => (row.id === dealId ? { ...row, ...patch } : row)),
    },
  }
}

/** 창(ttlMs)이 지난 항목을 버린다. */
export function pruneC360Overrides(
  overrides: C360LocalOverride[],
  nowMs: number,
  ttlMs: number = C360_OVERRIDE_MS
): C360LocalOverride[] {
  return overrides.filter((item) => nowMs - item.at < ttlMs)
}

/**
 * 서버 응답 위에 아직 유효한 로컬 변경을 순서대로 덧씌운다.
 * 서버가 이미 같은 상태를 돌려줬으면 각 헬퍼가 no-op이라 중복되지 않는다.
 */
export function applyC360Overrides(
  data: Customer360,
  overrides: C360LocalOverride[],
  nowMs: number,
  ttlMs: number = C360_OVERRIDE_MS
): Customer360 {
  let next = data
  for (const item of pruneC360Overrides(overrides, nowMs, ttlMs)) {
    switch (item.kind) {
      case "task_removed":
        next = removeTaskRow(next, item.id)
        break
      case "task_added":
        next = addTaskRow(next, item.record)
        break
      case "deal_added":
        next = addDealRow(next, item.record)
        break
      case "deal_patched":
        next = patchDealRow(next, item.id, item.patch)
        break
    }
  }
  return next
}

/**
 * 행이 사라진 뒤 포커스를 받을 다음 할 일 id — 같은 자리(없으면 마지막 행). 남는 행이 없으면 null
 * (소비처는 섹션 heading으로 보낸다).
 */
export function nextTaskIdAfterRemoval(rows: CrmTaskRecord[], removedId: string): string | null {
  const index = rows.findIndex((row) => row.id === removedId)
  const remaining = rows.filter((row) => row.id !== removedId)
  if (remaining.length === 0) return null
  const at = index < 0 ? 0 : Math.min(index, remaining.length - 1)
  return remaining[at]?.id ?? null
}
