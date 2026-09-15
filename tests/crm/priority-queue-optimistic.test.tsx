import { Suspense } from "react"
import { prerenderToNodeStream } from "react-dom/static"
import { describe, expect, it, vi } from "vitest"

// CrmPriorityQueuePanel은 App Router 훅(useRouter/useSearchParams)을 쓴다 — home-list-budget 테스트와 같은 모킹.
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/crm",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/lib/admin-client", () => ({
  adminFetchJsonCached: vi.fn(async () => null),
  adminFetchJson: vi.fn(async () => null),
  getCachedAdminJson: vi.fn(() => null),
  seedAdminRequestCache: vi.fn(),
}))
vi.mock("@/components/admin/crm/useCrmOwners", () => ({
  useCrmOwners: () => ({ owners: [], currentOwner: null, health: null }),
  buildOwnerSelectOptions: () => [],
}))

import CrmPriorityQueuePanel, {
  QUEUE_UNDO_WINDOW_MS,
  computeVisibleCalls,
  focusTargetAfterRemoval,
  isContactDraftDirty,
  previousLeadScheduleForUndo,
  removeQueueItem,
  restoreQueueItem,
  type CrmPriorityQueue,
} from "@/components/admin/crm/CrmPriorityQueuePanel"
import { INTERACTIVE_TEXT_CLASS, SECONDARY_TEXT_CLASS } from "@/components/admin/crm/home/shared"
import type { CrmPriorityItem } from "@/lib/crm/priority"

function makeLead(id: string, overrides: Partial<CrmPriorityItem> = {}): CrmPriorityItem {
  return {
    id: `lead:${id}`,
    source: "lead",
    title: `학원 ${id}`,
    subtitle: null,
    ownerName: "김담당",
    ownerKeys: ["김담당"],
    statusLabel: "신규 리드",
    score: 60,
    severity: "high",
    lane: "sales",
    laneLabel: "영업",
    bucket: "today",
    bucketLabel: "오늘 처리",
    action: "respond_lead",
    actionLabel: "첫 응답",
    reason: "24시간 미응답",
    href: `/admin/crm/customers/leads?lead=${id}`,
    dueAt: null,
    updatedAt: "2026-09-14T01:00:00.000Z",
    sourceKey: "demo_modal",
    ...overrides,
  }
}

function makeQueue(items: CrmPriorityItem[]): CrmPriorityQueue {
  return {
    generatedAt: "2026-09-15T00:00:00.000Z",
    sources: { leadsOk: true, neoAccountsOk: true, tasksOk: true, warnings: [] },
    summary: {
      total: items.length,
      critical: 0,
      high: items.length,
      leadCount: items.length,
      neoAccountCount: 0,
      taskCount: 0,
      ownerCount: 1,
      bucketCounts: { today: items.length, renewal: 0, stale_recovery: 0, watch: 0 },
      laneTotals: { sales: items.length, renewal: 0, customer_care: 0 },
      laneCritical: 0,
    },
    buckets: [],
    lanes: [],
    owners: [],
    items,
  }
}

async function render(data: CrmPriorityQueue) {
  const { prelude } = await prerenderToNodeStream(
    <Suspense fallback={<p>loading</p>}>
      <CrmPriorityQueuePanel initialData={{ promise: Promise.resolve(data), generatedAt: Date.now() }} />
    </Suspense>
  )
  let html = ""
  for await (const chunk of prelude) html += chunk.toString()
  return html
}

describe("CrmPriorityQueuePanel 낙관 갱신 헬퍼", () => {
  it("removeQueueItem은 카드만 빼고 같은 응답의 나머지를 유지한다(없는 id면 동일 참조)", () => {
    const data = makeQueue([makeLead("a"), makeLead("b")])
    const next = removeQueueItem(data, "lead:a")
    expect(next?.items.map((item) => item.id)).toEqual(["lead:b"])
    expect(removeQueueItem(data, "lead:zzz")).toBe(data)
    expect(removeQueueItem(null, "lead:a")).toBeNull()
  })

  it("restoreQueueItem은 빠진 카드를 되살리고 이미 있으면 그대로 둔다", () => {
    const a = makeLead("a")
    const data = makeQueue([makeLead("b")])
    expect(restoreQueueItem(data, a)?.items.map((item) => item.id)).toEqual(["lead:b", "lead:a"])
    expect(restoreQueueItem(makeQueue([a]), a)?.items).toHaveLength(1)
  })

  it("previousLeadScheduleForUndo — 상태는 statusLabel, 일정은 dueAt 유무 + updatedAt에서 복원한다", () => {
    // follow_up_at 없음: dueAt null → null (updatedAt은 유입 시각이라 쓰지 않는다)
    expect(previousLeadScheduleForUndo(makeLead("a"))).toEqual({ status: "new", followUpAt: null })
    // follow_up_at 있음(데모 없음): dueAt === updatedAt === F
    const f = "2026-09-16T00:00:00.000Z"
    expect(previousLeadScheduleForUndo(makeLead("b", { dueAt: f, updatedAt: f, statusLabel: "접촉 중" }))).toEqual({
      status: "contacted",
      followUpAt: f,
    })
    // 데모 일정이 dueAt을 덮은 경우: updatedAt이 원래 follow_up_at
    expect(previousLeadScheduleForUndo(makeLead("c", { dueAt: "2026-09-15T05:00:00.000Z", updatedAt: f })).followUpAt).toBe(f)
  })

  it("focusTargetAfterRemoval은 같은 자리의 다음 카드(승격된 후보 포함)를 고르고 마지막이면 앞 카드로 간다", () => {
    const items = [makeLead("a"), makeLead("b"), makeLead("c")]
    const visible = computeVisibleCalls(items, 2, false).map((call) => call.item.id)
    expect(visible).toEqual(["lead:a", "lead:b"])
    // a를 빼면 b가 같은 자리로 올라오고 c가 승격된다 → 포커스는 b
    expect(focusTargetAfterRemoval(items, "lead:a", 2, false)).toBe("lead:b")
    // 마지막 카드 b를 빼면 c가 그 자리로 승격 → 포커스는 c
    expect(focusTargetAfterRemoval(items, "lead:b", 2, false)).toBe("lead:c")
    // 하나뿐인 카드를 빼면 heading으로(null)
    expect(focusTargetAfterRemoval([makeLead("only")], "lead:only", 2, false)).toBeNull()
  })

  it("isContactDraftDirty — 기본값 그대로면 묻지 않고, 무엇이든 바뀌면 묻는다", () => {
    const base = { itemId: "lead:a", type: "call" as const, result: "answered" as const, notes: "", nextSchedule: "keep" as const }
    expect(isContactDraftDirty(null)).toBe(false)
    expect(isContactDraftDirty(base)).toBe(false)
    expect(isContactDraftDirty({ ...base, notes: " 메모 " })).toBe(true)
    expect(isContactDraftDirty({ ...base, nextSchedule: "tomorrow" })).toBe(true)
  })

  it("되돌리기 창은 8초", () => {
    expect(QUEUE_UNDO_WINDOW_MS).toBe(8_000)
  })
})

describe("CrmPriorityQueuePanel 데이터 뷰(prerender)", () => {
  it("카드 정보 텍스트·버튼은 대비 토큰을 쓰고 #B85C33·저알파 정보 텍스트가 없다", async () => {
    const html = await render(makeQueue([makeLead("a", { subtitle: "원장" }), makeLead("b")]))
    expect(html).toContain("학원 a")
    expect(html).toContain(SECONDARY_TEXT_CLASS)
    expect(html).toContain(INTERACTIVE_TEXT_CLASS)
    expect(html).not.toContain("#B85C33")
    for (const alpha of ["/35", "/40", "/45", "/50", "/55", "/60"]) {
      expect(html, `text-[#1a1a1a]${alpha} 잔존`).not.toContain(`text-[#1a1a1a]${alpha}`)
    }
  })

  it("'종료'는 인라인 확인 폼과 aria-controls/aria-expanded로 연결되고, 다른 버튼과 gap-3으로 분리된다", async () => {
    const html = await render(makeQueue([makeLead("a")]))
    expect(html).toContain('aria-controls="queue-close-lead:a"')
    expect(html).toContain('aria-controls="queue-contact-lead:a"')
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="queue-close-lead:a"/)
    expect(html).toContain('class="flex flex-wrap items-start gap-3 lg:justify-end"')
    // 확인 전에는 폼이 없고 window.confirm도 쓰지 않는다
    expect(html).not.toContain("리드를 종료합니다")
  })

  it("항상 마운트된 SR 통지 영역과 범위 문구(풀 기준)를 갖는다", async () => {
    const html = await render(makeQueue([makeLead("a")]))
    expect(html).toMatch(/<p role="status" aria-live="polite" class="sr-only">/)
    expect(html).toContain("건 풀 기준")
    expect(html).toContain("기준 ")
  })

  it("소스 경고는 warning 톤 배너(role=status)로, 실패 톤과 분리해 그린다", async () => {
    const data = makeQueue([makeLead("a")])
    data.sources = { ...data.sources, tasksOk: false, warnings: ["CRM 할 일을 불러오지 못했습니다."] }
    const html = await render(data)
    expect(html).toContain('data-tone="warning"')
    expect(html).toContain("CRM 할 일을 불러오지 못했습니다.")
    expect(html).not.toContain('data-tone="danger"')
  })
})
