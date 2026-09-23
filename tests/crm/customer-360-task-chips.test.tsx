import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// Customer360DetailTasks(§13 Q2)는 useParams로 360 라우트의 key 세그먼트를 읽어 빠른 추가 대상을
// 해석한다. 클릭 시에만 adminFetchJson을 호출하므로(렌더 중 호출 없음) 정적 렌더에는 필요 없지만,
// 이 스위트의 다른 컴포넌트 테스트와 같은 관례로 목을 둔다. paramsRef는 customer-360-detail-tabs
// 테스트의 searchParamsRef와 같은 패턴 — 테스트별로 useParams 반환값을 바꿔치기한다.
const paramsRef: { current: { key?: string | string[] } } = { current: { key: "lead:lead-1" } }
vi.mock("next/navigation", () => ({
  useParams: () => paramsRef.current,
}))
vi.mock("@/lib/admin-client", () => ({
  adminFetchJson: vi.fn(async () => ({ task: null })),
}))

import Customer360DetailTasks from "@/components/admin/crm/Customer360DetailTasks"
import { TASK_QUICK_PRESETS } from "@/lib/crm/task-quick-presets"
import type { CrmTaskRecord, ListCrmTasksResult } from "@/lib/repositories/crm-tasks"

function makeTask(overrides: Partial<CrmTaskRecord> = {}): CrmTaskRecord {
  return {
    id: "task-1",
    targetType: "lead",
    targetId: "lead-1",
    targetLabel: "테스트 학원",
    ownerKey: null,
    ownerNameSnapshot: null,
    taskType: "call",
    title: "기존 할 일",
    detail: null,
    dueAt: null,
    snoozedUntil: null,
    priority: "normal",
    status: "open",
    sourceEventId: null,
    createdBy: null,
    assignedBy: null,
    completedAt: null,
    completedBy: null,
    outcome: null,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    ...overrides,
  }
}

function makeTasksResult(rows: CrmTaskRecord[]): ListCrmTasksResult {
  return {
    generatedAt: "2026-09-20T00:00:00.000Z",
    health: { ok: true, message: null },
    summary: {
      total: rows.length,
      returned: rows.length,
      open: rows.filter((r) => r.status === "open").length,
      overdue: 0,
      dueToday: 0,
      snoozed: 0,
      done: 0,
    },
    pagination: { limit: 50, offset: 0, returned: rows.length, total: rows.length, hasMore: false, nextOffset: null },
    rows,
  }
}

describe("Customer360DetailTasks 빠른 추가 칩(§13 Q2)", () => {
  it("role=group aria-label='할 일 빠른 추가'로 프리셋 4개를 렌더한다", () => {
    const html = renderToStaticMarkup(<Customer360DetailTasks tasks={makeTasksResult([])} />)
    expect(html).toContain('aria-label="할 일 빠른 추가"')
    for (const preset of TASK_QUICK_PRESETS) {
      expect(html).toContain(`>${preset.label}<`)
    }
  })

  it("기존 스탯 타일(열린 할 일·지연·오늘 마감)을 그대로 유지한다", () => {
    const html = renderToStaticMarkup(<Customer360DetailTasks tasks={makeTasksResult([makeTask()])} />)
    expect(html).toContain("열린 할 일")
    expect(html).toContain("지연")
    expect(html).toContain("오늘 마감")
  })

  it("기존 태스크 목록·패널 제목(건수 포함)을 그대로 유지한다", () => {
    const html = renderToStaticMarkup(<Customer360DetailTasks tasks={makeTasksResult([makeTask({ title: "재통화 필요" })])} />)
    expect(html).toContain("태스크 (1)")
    expect(html).toContain("재통화 필요")
  })

  it("할 일이 없으면 빈 상태 문구를 그대로 유지한다", () => {
    const html = renderToStaticMarkup(<Customer360DetailTasks tasks={makeTasksResult([])} />)
    expect(html).toContain("열린 할 일이 없습니다.")
  })

  it("key를 정상 해석하면(정상 케이스) 안내 문구·disabled 없이 칩이 활성 상태로 렌더된다", () => {
    paramsRef.current = { key: "lead:lead-1" }
    const html = renderToStaticMarkup(<Customer360DetailTasks tasks={makeTasksResult([])} />)
    expect(html).not.toContain("이 화면에서는 빠른 추가 대상을 확인할 수 없습니다.")
    expect(html).not.toContain("disabled=\"\"")
  })

  it("useParams가 key를 주지 못하면 대상을 해석하지 못해 칩이 비활성화되고 안내 문구를 보여준다", () => {
    paramsRef.current = {}
    try {
      const html = renderToStaticMarkup(<Customer360DetailTasks tasks={makeTasksResult([])} />)
      expect(html).toContain("이 화면에서는 빠른 추가 대상을 확인할 수 없습니다.")
      expect(html).toContain("disabled=\"\"")
    } finally {
      paramsRef.current = { key: "lead:lead-1" }
    }
  })

  it("neo: 접두사 key는 neo_account 대상으로 해석해 칩을 활성화한다", () => {
    paramsRef.current = { key: "neo:acc-9" }
    try {
      const html = renderToStaticMarkup(<Customer360DetailTasks tasks={makeTasksResult([])} />)
      expect(html).not.toContain("이 화면에서는 빠른 추가 대상을 확인할 수 없습니다.")
    } finally {
      paramsRef.current = { key: "lead:lead-1" }
    }
  })
})
