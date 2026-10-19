import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Suspense } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { prerenderToNodeStream } from "react-dom/static"
import { describe, expect, it, vi } from "vitest"

// CrmTodayContactsPanel 은 App Router 훅·요청 캐시·담당자 훅을 쓴다 — jsdom 없이 prerender 하려고 모킹한다
// (옛 tests/crm/priority-queue-optimistic.test.tsx 와 같은 방식).
// nav.search — ?owner 착지(기본 담당 = 로그인 사용자 · 빈 owner = 담당 전체)를 바꿔 보는 테스트만 고친다(끝나면 되돌린다).
const nav = vi.hoisted(() => ({ search: "" }))
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/crm",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}))
vi.mock("@/lib/admin-client", () => ({
  adminFetch: vi.fn(async () => new Response(null, { status: 204 })),
  adminFetchJsonCached: vi.fn(async () => null),
  adminFetchJson: vi.fn(async () => null),
  clearAdminRequestCache: vi.fn(),
  getCachedAdminJson: vi.fn(() => null),
  seedAdminRequestCache: vi.fn(),
}))
vi.mock("@/components/admin/crm/useCrmOwners", () => ({
  useCrmOwners: () => ({ owners: [], currentOwner: null, health: null }),
  buildOwnerSelectOptions: () => [],
}))

import CrmTodayContactsPanel, {
  TODAY_CONTACTS_OVERLAY_MS,
  TODAY_CONTACTS_PENDING_REQUEST_MAX_AGE_MS,
  TODAY_CONTACTS_PREVIEW_ROWS,
  TODAY_CONTACTS_UNDO_WINDOW_MS,
  applyTodayContactOverlays,
  countTodayContactSources,
  dropClosedTaskReasons,
  filterTodayContactRows,
  isCompassRowHandledByHomeTaskOnly,
  isTodayContactPendingRequestLive,
  knownTaskDueAts,
  newTodayContactRequestId,
  nextFocusKeyAfterHandled,
  pickTodayContactRequestId,
  planTodayContactTaskAction,
  previousLeadFollowUpAt,
  pruneTodayContactOverlays,
  reopenCompassRowsHandledByHomeTasks,
  resolveLeadUndoFollowUpAt,
  taskIdForRow,
  taskIdsForRow,
  todayContactDuplicateDroppedEdit,
  todayContactPendingKey,
  todayContactRequestSignature,
  todayContactSnoozeKind,
  todayContactSourceChipCounts,
  todayContactsCoverCompassActions,
  todayContactsCoverTasks,
  todayContactsEmptyCopy,
  todayContactsMoreLabel,
  todayContactsSourcesIncomplete,
  type TodayContactOverlay,
} from "@/components/admin/crm/home/CrmTodayContactsPanel"
import TodayContactRowView, {
  canOpenCustomerDrawer,
  compassRowOpenTaskCount,
  describeTodayContactHandled,
  describeTodayContactLast,
  formatTodayContactDue,
  handledRowOpenTaskCount,
  isInternalHref,
  neoAsOfCaption,
  rowSourceGroups,
  secondaryCompassRecordHref,
  todayContactHomeHref,
  todayContactTaskCompleteLabel,
  todayContactTaskSnoozeLabel,
} from "@/components/admin/crm/home/TodayContactRow"
import { INTERACTIVE_TEXT_CLASS, SECONDARY_TEXT_CLASS } from "@/components/admin/crm/home/shared"
import { compassLeadUrl } from "@/lib/compass/normalize"
import { todayContactCustomerHref } from "@/lib/crm/today-contact-queue"
import type {
  CrmTodayContacts,
  TodayContactCompassRef,
  TodayContactHandled,
  TodayContactOutcomeRequest,
  TodayContactReason,
  TodayContactRow,
} from "@/lib/crm/today-contact-types"

const NOW = Date.parse("2026-09-25T03:00:00.000Z") // 2026-09-25(금) 12:00 KST
const GENERATED_AT = "2026-09-25T03:00:00.000Z"

function reason(overrides: Partial<TodayContactReason> = {}): TodayContactReason {
  return { kind: "first_response", label: "신규 첫 응답 · 27시간", detail: null, dueAt: null, overdue: false, sourceRef: "lead:1", ...overrides }
}

function makeRow(key: string, overrides: Partial<TodayContactRow> = {}): TodayContactRow {
  const [prefix, id] = key.split(":")
  return {
    key,
    entityType: prefix === "neo" ? "neo_account" : prefix === "compass" ? "compass_lead" : prefix === "task" ? "task" : "lead",
    entityId: id,
    title: `학원 ${id}`,
    subtitle: null,
    ownerName: "이서연",
    ownerKeys: ["이서연"],
    lane: "new_response",
    laneLabel: "신규 응대",
    severity: "high",
    score: 50,
    reasons: [reason({ sourceRef: key })],
    dueAt: null,
    overdue: false,
    groupedCount: 1,
    isMetaLead: false,
    lastContact: null,
    nextContact: null,
    compass: null,
    primaryAction: "record_outcome_lead",
    openTaskIds: [],
    handled: null,
    href: `/admin/crm/customers/leads?lead=${id}`,
    neoAsOf: null,
    ...overrides,
  }
}

function makeData(rows: TodayContactRow[], overrides: Partial<CrmTodayContacts> = {}): CrmTodayContacts {
  const handled = rows.filter((row) => row.handled).length
  return {
    generatedAt: GENERATED_AT,
    dateKey: "2026-09-25",
    progress: {
      total: rows.length,
      handled,
      remaining: rows.length - handled,
      overdue: rows.filter((row) => row.overdue && !row.handled).length,
      byLane: {
        new_response: { total: rows.filter((r) => r.lane === "new_response").length, handled: 0 },
        money: { total: rows.filter((r) => r.lane === "money").length, handled: 0 },
        reengage: { total: rows.filter((r) => r.lane === "reengage").length, handled: 0 },
      },
      compassHandledToday: 0,
      approximate: true,
    },
    counts: {
      bySource: {
        first_response: 0,
        follow_up: 0,
        task: 0,
        compass_next_action: 0,
        account_expiry: 0,
        account_balance: 0,
        demo: 0,
        revisit: 0,
        reinflow: 0,
      },
      compassOverdueBeyondLookback: 0,
    },
    rows,
    meta: { total: 0, today: 0, top: [] },
    owners: [],
    sources: {
      leadsOk: true,
      neoAccountsOk: true,
      tasksOk: true,
      homeContactsOk: true,
      compass: "ok",
      neoSync: { latestSyncedAt: "2026-09-25T00:00:00.000Z", stale: false },
      warnings: [],
    },
    truncated: { rows: false, limit: 120 },
    ...overrides,
  }
}

const HANDLED: TodayContactHandled = {
  kind: "contact_logged",
  at: "2026-09-25T02:30:00.000Z",
  by: "박지훈",
  source: "home",
  nextAt: "2026-09-26T00:00:00.000Z",
  approximate: false,
}

function overlay(row: TodayContactRow, handled: TodayContactHandled | null, extra: Partial<TodayContactOverlay> = {}): TodayContactOverlay {
  return { scope: "/scope", row, index: 0, handled, summary: null, until: NOW + TODAY_CONTACTS_OVERLAY_MS, ...extra }
}

function compassRef(leadId: number, overrides: Partial<TodayContactCompassRef> = {}): TodayContactCompassRef {
  return { leadId, url: `https://mkt.classin.co.kr/leads/${leadId}`, stageLabel: "상담", owner: "김민준", nextActionAt: null, ...overrides }
}

function renderRow(row: TodayContactRow, props: Partial<Parameters<typeof TodayContactRowView>[0]> = {}) {
  return renderToStaticMarkup(
    <ul>
      <TodayContactRowView row={row} basisMs={NOW} neoStale={false} {...props} />
    </ul>
  )
}

async function renderPanel(data: CrmTodayContacts) {
  const { prelude } = await prerenderToNodeStream(
    <Suspense fallback={<p>loading</p>}>
      <CrmTodayContactsPanel initialData={{ promise: Promise.resolve(data), generatedAt: NOW }} />
    </Suspense>
  )
  let html = ""
  for await (const chunk of prelude) html += chunk.toString()
  // prerender 는 인접 텍스트 노드 사이에 <!-- --> 를 넣는다 — 문구 비교 전에 걷어낸다.
  return html.replace(/<!-- -->/g, "")
}

describe("오늘 연락 — 낙관 오버레이(처리됨·되돌리기)", () => {
  it("서버에 있는 행을 처리됨으로 덮고 진행률(처리·남음·레인·기한 지남)을 맞춘다", () => {
    const a = makeRow("lead:a", { overdue: true })
    const b = makeRow("neo:b", { lane: "money", primaryAction: "record_outcome" })
    const data = makeData([a, b])
    const next = applyTodayContactOverlays(data, new Map([[a.key, overlay(a, HANDLED)]]), "/scope")
    expect(next?.rows[0].handled).toEqual(HANDLED)
    expect(next?.progress).toMatchObject({ total: 2, handled: 1, remaining: 1, overdue: 0 })
    expect(next?.progress.byLane.new_response).toEqual({ total: 1, handled: 1 })
    // 원본은 건드리지 않는다
    expect(data.rows[0].handled).toBeNull()
    expect(data.progress.handled).toBe(0)
  })

  it("다른 담당 범위(scope)의 오버레이는 덧씌우지 않는다", () => {
    const a = makeRow("lead:a")
    const data = makeData([a])
    expect(applyTodayContactOverlays(data, new Map([[a.key, overlay(a, HANDLED, { scope: "/other" })]]), "/scope")).toBe(data)
  })

  it("서버가 행을 빼 버렸으면 처리 직전 위치에 되살린다(되돌리기 창을 잃지 않게)", () => {
    const a = makeRow("lead:a")
    const b = makeRow("lead:b")
    const c = makeRow("lead:c")
    const data = makeData([a, c])
    const next = applyTodayContactOverlays(data, new Map([[b.key, overlay(b, HANDLED, { index: 1 })]]), "/scope")
    expect(next?.rows.map((row) => row.key)).toEqual(["lead:a", "lead:b", "lead:c"])
    expect(next?.progress).toMatchObject({ total: 3, handled: 1, remaining: 2 })
  })

  it("되돌리기 뒤(handled null)는 서버가 아직 처리됨으로 줘도 다시 연다", () => {
    const a = makeRow("lead:a", { handled: HANDLED })
    const data = makeData([a])
    const next = applyTodayContactOverlays(data, new Map([[a.key, overlay(makeRow("lead:a"), null)]]), "/scope")
    expect(next?.rows[0].handled).toBeNull()
    expect(next?.progress).toMatchObject({ handled: 0, remaining: 1 })
  })

  it("만료된 오버레이만 걷어내고, 바뀐 게 없으면 같은 참조를 돌려준다", () => {
    const a = makeRow("lead:a")
    const live = new Map([[a.key, overlay(a, HANDLED)]])
    expect(pruneTodayContactOverlays(live, NOW)).toBe(live)
    const expired = new Map([[a.key, overlay(a, HANDLED, { until: NOW - 1 })]])
    expect(pruneTodayContactOverlays(expired, NOW).size).toBe(0)
  })

  it("되돌리기 8초 · 오버레이 120초 · 첫 화면 10행", () => {
    expect(TODAY_CONTACTS_UNDO_WINDOW_MS).toBe(8_000)
    expect(TODAY_CONTACTS_OVERLAY_MS).toBe(120_000)
    expect(TODAY_CONTACTS_PREVIEW_ROWS).toBe(10)
  })
})

describe("오늘 연락 — 필터·포커스·되돌리기 입력", () => {
  const compassRow = makeRow("compass:9", { reasons: [reason({ kind: "compass_next_action", label: "Compass 다음 액션 · 14:00" })] })
  const neoRow = makeRow("neo:n1", {
    lane: "money",
    primaryAction: "record_outcome",
    reasons: [reason({ kind: "account_expiry", label: "만료 D-5" }), reason({ kind: "task", label: "할 일 1" })],
  })
  const doneRow = makeRow("lead:done", { handled: HANDLED })

  it("원천 칩 — 행이 걸친 원천마다 센다(계정 만료·소진은 한 묶음)", () => {
    const counts = countTodayContactSources([compassRow, neoRow, doneRow])
    expect(counts.compass).toBe(1)
    expect(counts.account).toBe(1)
    expect(counts.task).toBe(1)
    expect(counts.first_response).toBe(1)
    expect(counts.reinflow).toBe(0)
  })

  it("원천 필터·처리됨 숨기기 — 되돌리기 창의 행은 숨기기에서도 남긴다", () => {
    expect(filterTodayContactRows([compassRow, neoRow, doneRow], { source: "account", hideHandled: false }).map((r) => r.key)).toEqual(["neo:n1"])
    expect(filterTodayContactRows([compassRow, neoRow, doneRow], { source: "all", hideHandled: true }).map((r) => r.key)).toEqual([
      "compass:9",
      "neo:n1",
    ])
    expect(
      filterTodayContactRows([compassRow, doneRow], { source: "all", hideHandled: true, keepKeys: new Set(["lead:done"]) }).map((r) => r.key)
    ).toEqual(["compass:9", "lead:done"])
  })

  it("처리 뒤 포커스 — 아래 첫 미처리 행, 없으면 위쪽, 그것도 없으면 heading(null)", () => {
    const rows = [makeRow("lead:a"), makeRow("lead:b", { handled: HANDLED }), makeRow("lead:c")]
    expect(nextFocusKeyAfterHandled(rows, "lead:a")).toBe("lead:c")
    expect(nextFocusKeyAfterHandled(rows, "lead:c")).toBe("lead:a")
    expect(nextFocusKeyAfterHandled([makeRow("lead:only")], "lead:only")).toBeNull()
  })

  it("행 추정 follow_up_at — 팔로업 사유 기한 → 미래 팔로업 → 모름(undefined, null 로 단정하지 않는다)", () => {
    expect(previousLeadFollowUpAt(makeRow("lead:a", { reasons: [reason({ kind: "follow_up", dueAt: "2026-09-24T00:00:00.000Z" })] }))).toBe(
      "2026-09-24T00:00:00.000Z"
    )
    expect(previousLeadFollowUpAt(makeRow("lead:a", { nextContact: { at: "2026-09-30T00:00:00.000Z", kind: "follow_up" } }))).toBe(
      "2026-09-30T00:00:00.000Z"
    )
    // 할 일이 더 이른 다음 연락이면 follow_up_at 이 행에 드러나지 않는다 — "비어 있었다"가 아니라 모름.
    expect(previousLeadFollowUpAt(makeRow("lead:a", { nextContact: { at: "2026-09-28T00:00:00.000Z", kind: "task" } }))).toBeUndefined()
  })

  describe("리드 되돌리기(DELETE)의 previousFollowUpAt — 서버 응답(계약)이 정본", () => {
    // 리뷰 시나리오: follow_up_at=10-02 10:00, 열린 할 일 기한 09-28, 사유는 재문의뿐 → 행 nextContact=task.
    const lead = makeRow("lead:L", {
      reasons: [reason({ kind: "reinflow", label: "재문의" })],
      nextContact: { at: "2026-09-28T00:00:00.000Z", kind: "task" },
    })
    const leadRequest = { target: { type: "lead" as const, id: "L", label: "학원 L" }, next: { preset: "in3_10" as const } }

    it("응답의 previousFollowUpAt 을 그대로 보낸다 — 행 추정(모름)으로 실제 팔로업을 지우지 않는다", () => {
      expect(resolveLeadUndoFollowUpAt(lead, leadRequest, { previousFollowUpAt: "2026-10-02T01:00:00.000Z" })).toBe(
        "2026-10-02T01:00:00.000Z"
      )
      // 행 추정값이 있어도 응답이 우선한다(스냅샷 뒤에 팔로업이 바뀌었을 수 있다).
      const withFollowUp = makeRow("lead:L", { reasons: [reason({ kind: "follow_up", dueAt: "2026-09-24T00:00:00.000Z" })] })
      expect(resolveLeadUndoFollowUpAt(withFollowUp, leadRequest, { previousFollowUpAt: "2026-10-02T01:00:00.000Z" })).toBe(
        "2026-10-02T01:00:00.000Z"
      )
    })

    it("응답이 null(저장 전 비어 있었음)이면 null — 서버가 비운다", () => {
      expect(resolveLeadUndoFollowUpAt(lead, leadRequest, { previousFollowUpAt: null })).toBeNull()
    })

    it("응답에 없으면(duplicate 등) 확실한 추정만, 모르면 undefined(키를 빼서 follow_up_at 을 건드리지 않는다)", () => {
      expect(resolveLeadUndoFollowUpAt(lead, leadRequest, {})).toBeUndefined()
      const withFollowUp = makeRow("lead:L", { reasons: [reason({ kind: "follow_up", dueAt: "2026-09-24T00:00:00.000Z" })] })
      expect(resolveLeadUndoFollowUpAt(withFollowUp, leadRequest, {})).toBe("2026-09-24T00:00:00.000Z")
    })

    it("리드가 아니거나 다음 일정 없이 저장했으면(서버가 follow_up_at 을 바꾸지 않음) undefined", () => {
      expect(resolveLeadUndoFollowUpAt(lead, { ...leadRequest, next: null }, { previousFollowUpAt: "2026-10-02T01:00:00.000Z" })).toBeUndefined()
      expect(
        resolveLeadUndoFollowUpAt(lead, { target: { type: "neo_account", id: "n", label: "n" }, next: { preset: "tomorrow_9" } }, {
          previousFollowUpAt: null,
        })
      ).toBeUndefined()
    })
  })

  it("대상 없는 할 일 행의 할 일 id · 요청 id 는 uuid v4 모양", () => {
    expect(taskIdForRow(makeRow("task:t9", { primaryAction: "complete_task", openTaskIds: ["t9"] }))).toBe("t9")
    expect(taskIdForRow(makeRow("neo:n", { openTaskIds: ["x1"] }))).toBe("x1")
    expect(newTodayContactRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe("오늘 연락 — 잘린 목록·도달성(주간 패널 숨김 버킷)·원천 실패", () => {
  it("잘리지 않았으면 칩은 받은 행 기준, 잘렸으면 서버 전체 집계(counts.bySource) — 묶음 칩은 하한 + '+'", () => {
    const rows = [
      makeRow("lead:a", { reasons: [reason({ kind: "task", label: "할 일" })] }),
      makeRow("neo:b", { reasons: [reason({ kind: "account_expiry" }), reason({ kind: "account_balance" })] }),
    ]
    const bySource = { ...makeData([]).counts.bySource, task: 13, account_expiry: 30, account_balance: 5 }
    const exact = todayContactSourceChipCounts(rows, { bySource, truncated: false })
    expect(exact.task).toEqual({ count: 1, more: false })
    expect(exact.account).toEqual({ count: 1, more: false })
    const truncated = todayContactSourceChipCounts(rows, { bySource, truncated: true })
    expect(truncated.task).toEqual({ count: 13, more: false })
    // 만료·소진을 함께 가진 계정은 두 번 셀 수 있다 — 확실한 하한 30, 합 35 가 더 크니 "+"
    expect(truncated.account).toEqual({ count: 30, more: true })
    expect(truncated.reinflow).toEqual({ count: 0, more: false })
  })

  it("'더 보기' 문구 — 잘려서 더 불러올 수 있으면 안 받은 건수까지(필터가 걸리면 따로 적는다)", () => {
    expect(todayContactsMoreLabel({ hiddenCount: 50, unloadedCount: 13, canLoadMore: true, filterActive: false })).toBe("남은 63건 더 보기")
    expect(todayContactsMoreLabel({ hiddenCount: 5, unloadedCount: 13, canLoadMore: true, filterActive: true })).toBe(
      "남은 5건 더 보기 · 불러오지 않은 13건도 불러오기"
    )
    expect(todayContactsMoreLabel({ hiddenCount: 0, unloadedCount: 13, canLoadMore: true, filterActive: true })).toBe(
      "불러오지 않은 13건 더 불러오기"
    )
    // 최대 상한까지 받은 뒤(canLoadMore=false)에는 받은 행만
    expect(todayContactsMoreLabel({ hiddenCount: 50, unloadedCount: 13, canLoadMore: false, filterActive: false })).toBe("남은 50건 더 보기")
  })

  it("지난·오늘 할 일을 다 담았는가 — 담당 전체·잘리지 않음·할 일 원천 정상일 때만(아니면 주간 패널이 다시 보인다)", () => {
    const ok = makeData([makeRow("lead:a")])
    expect(todayContactsCoverTasks(ok, "")).toBe(true)
    expect(todayContactsCoverTasks({ ...ok, truncated: { rows: true, limit: 60 } }, "")).toBe(false)
    expect(todayContactsCoverTasks({ ...ok, sources: { ...ok.sources, tasksOk: false } }, "")).toBe(false)
    expect(todayContactsCoverTasks(ok, "__me")).toBe(false)
    expect(todayContactsCoverTasks(null, "")).toBe(false)
  })

  it("Compass 행에 Home 할 일이 묶여 있어도 다 담았다 — 행에서 닫을 수 있어 주간 패널에 한 번 더 두지 않는다(리뷰 새 [2])", () => {
    // 행 단위 "할 일 완료"·"할 일 내일로"가 생겼으니 Compass 비중이 큰 세그먼트를 넣어도 주간 패널이 지난·오늘 버킷
    // 전체를 되살리지 않는다(플레이북 04 §3 중복 배치 금지).
    const withCompassTask = makeData([
      makeRow("lead:c1", { primaryAction: "open_compass", openTaskIds: ["T1"], compass: compassRef(77) }),
    ])
    expect(todayContactsCoverTasks(withCompassTask, "")).toBe(true)
    // 처리됨(Compass 에서 연락)으로 접혀도 — 접힌 줄에 "할 일 완료"가 있고, "처리됨 숨기기"도 이 행은 남긴다
    const handledCompassTask = makeRow("lead:c1", {
      primaryAction: "open_compass",
      openTaskIds: ["T1"],
      compass: compassRef(77),
      handled: { ...HANDLED, kind: "compass_activity", source: "compass" },
    })
    expect(todayContactsCoverTasks(makeData([handledCompassTask]), "")).toBe(true)
    expect(filterTodayContactRows([handledCompassTask], { source: "all", hideHandled: true }).map((row) => row.key)).toEqual(["lead:c1"])
    // 결과 기록 때 함께 닫지 않은 할 일이 남은 처리됨 계정 행도 숨기지 않는다 — 남은 할 일이 없으면 숨긴다
    const handledNeo = makeRow("neo:n1", { primaryAction: "record_outcome", openTaskIds: ["T2"], handled: HANDLED })
    expect(filterTodayContactRows([handledNeo], { source: "all", hideHandled: true })).toHaveLength(1)
    expect(filterTodayContactRows([{ ...handledNeo, openTaskIds: [] }], { source: "all", hideHandled: true })).toHaveLength(0)
    expect(handledRowOpenTaskCount(handledNeo)).toBe(1)
    expect(handledRowOpenTaskCount({ handled: null, openTaskIds: ["T3"] })).toBe(0)
    // 목록 모양과 무관하게 범위·잘림·할 일 원천만 본다
    expect(todayContactsCoverTasks({ ...withCompassTask, truncated: { rows: true, limit: 60 } }, "")).toBe(false)
  })

  it("오늘·지난 Compass 다음 액션을 다 담았는가 — 담당 전체·Compass ok·잘리지 않음일 때만(리뷰 [4]·[27])", () => {
    const ok = makeData([makeRow("compass:9", { primaryAction: "open_compass" })])
    expect(todayContactsCoverCompassActions(ok, "")).toBe(true)
    // 담당 필터 — 서버가 다른 담당의 Compass 다음 액션 행을 거른다
    expect(todayContactsCoverCompassActions(ok, "김담당")).toBe(false)
    expect(todayContactsCoverCompassActions(ok, "__me")).toBe(false)
    // Compass 다음 액션 조회 실패(행 0건)·일부 실패(잘렸을 수 있다)
    expect(todayContactsCoverCompassActions({ ...ok, sources: { ...ok.sources, compass: "down" } }, "")).toBe(false)
    expect(todayContactsCoverCompassActions({ ...ok, sources: { ...ok.sources, compass: "partial" } }, "")).toBe(false)
    // 서버 상한에서 잘린 목록 — 아래쪽 Compass 행이 빠졌을 수 있다
    expect(todayContactsCoverCompassActions({ ...ok, truncated: { rows: true, limit: 60 } }, "")).toBe(false)
    // 목록 실패
    expect(todayContactsCoverCompassActions(null, "")).toBe(false)
    // 할 일 원천 실패는 Compass 액션 포괄과 무관
    expect(todayContactsCoverCompassActions({ ...ok, sources: { ...ok.sources, tasksOk: false } }, "")).toBe(true)
  })

  it("원천 실패 판정 — 리드·NEO·할 일 중 하나라도 실패하거나 Compass 가 ok 가 아니면", () => {
    const sources = makeData([]).sources
    expect(todayContactsSourcesIncomplete(sources)).toBe(false)
    expect(todayContactsSourcesIncomplete({ ...sources, leadsOk: false })).toBe(true)
    expect(todayContactsSourcesIncomplete({ ...sources, neoAccountsOk: false })).toBe(true)
    expect(todayContactsSourcesIncomplete({ ...sources, tasksOk: false })).toBe(true)
    expect(todayContactsSourcesIncomplete({ ...sources, compass: "partial" })).toBe(true)
    // Home 연락 인덱스는 처리 판정에만 쓰인다 — 행 존재와 무관
    expect(todayContactsSourcesIncomplete({ ...sources, homeContactsOk: false })).toBe(false)
    expect(todayContactsSourcesIncomplete(null)).toBe(false)
  })
})

describe("오늘 연락 행 — 표기 헬퍼", () => {
  it("기한 문구 — 지남(일·시간)·오늘·내일·그 뒤, 3일 이상 지남은 danger", () => {
    expect(formatTodayContactDue("2026-09-21T03:00:00.000Z", NOW)).toEqual({ text: "4일 지남", tone: "danger" })
    expect(formatTodayContactDue("2026-09-24T03:00:00.000Z", NOW)).toEqual({ text: "1일 지남", tone: "warning" })
    expect(formatTodayContactDue("2026-09-25T00:00:00.000Z", NOW)).toEqual({ text: "3시간 지남", tone: "warning" })
    expect(formatTodayContactDue("2026-09-25T05:00:00.000Z", NOW)).toEqual({ text: "오늘 14:00", tone: null })
    expect(formatTodayContactDue("2026-09-26T01:00:00.000Z", NOW)).toEqual({ text: "내일 10:00", tone: null })
    expect(formatTodayContactDue("2026-09-28T01:00:00.000Z", NOW)).toEqual({ text: "09/28 10:00", tone: null })
    expect(formatTodayContactDue(null, NOW)).toBeNull()
  })

  it("처리됨 문구 — 세션 요약 우선, 없으면 종류 라벨 + 다음 일정, 보조 줄에 시각·사람·원천·추정", () => {
    expect(describeTodayContactHandled(HANDLED, "콜 · 부재 → 다음 09/26")).toEqual({
      text: "콜 · 부재 → 다음 09/26",
      meta: "11:30 · 박지훈 · Home",
    })
    expect(describeTodayContactHandled({ ...HANDLED, kind: "compass_activity", source: "compass", by: null, nextAt: null, approximate: true }, null)).toEqual({
      text: "Compass 활동",
      meta: "11:30 · Compass · 추정",
    })
    expect(describeTodayContactHandled(HANDLED, null).text).toBe("연락 기록 → 다음 09/26")
  })

  it("마지막 연락 — KST 달력일, 14일 이상 경고, 없음은 null", () => {
    expect(describeTodayContactLast({ at: "2026-09-23T03:00:00.000Z", source: "compass", channelLabel: "Compass 콜", actor: "김민준" }, NOW)).toEqual({
      when: "2일 전",
      detail: "Compass 콜 · 김민준",
      stale: false,
    })
    expect(describeTodayContactLast({ at: "2026-09-01T03:00:00.000Z", source: "home_log", channelLabel: "콜", actor: null }, NOW)?.stale).toBe(true)
    expect(describeTodayContactLast(null, NOW)).toBeNull()
  })

  it("드로어·경로·NEO 캡션·원천 묶음", () => {
    expect(canOpenCustomerDrawer({ key: "lead:1" })).toBe(true)
    expect(canOpenCustomerDrawer({ key: "neo:1" })).toBe(true)
    expect(canOpenCustomerDrawer({ key: "customer:1" })).toBe(false)
    expect(canOpenCustomerDrawer({ key: "compass:1" })).toBe(false)
    expect(isInternalHref("/admin/crm")).toBe(true)
    expect(isInternalHref("https://mkt.classin.co.kr/leads/1")).toBe(false)
    expect(isInternalHref("//evil.example")).toBe(false)
    expect(neoAsOfCaption({ entityType: "neo_account", neoAsOf: "2026-08-28T00:00:00.000Z" })).toBe("NEO 값 08/28 기준")
    expect(neoAsOfCaption({ entityType: "lead", neoAsOf: "2026-08-28T00:00:00.000Z" })).toBeNull()
    const groups = rowSourceGroups({
      reasons: [reason({ kind: "account_balance" }), reason({ kind: "account_expiry" }), reason({ kind: "reinflow" })],
    })
    expect(groups.map((group) => group.key)).toEqual(["account", "reinflow"])
  })
})

describe("오늘 연락 행 — 주 행동(A안)", () => {
  it("Compass 매칭 리드는 'Compass에서 열기'(새 탭)만 — Home 결과 기록 버튼이 없다", () => {
    const html = renderToStaticMarkup(
      <ul>
        <TodayContactRowView
          row={makeRow("lead:c1", {
            primaryAction: "open_compass",
            compass: { leadId: 42, url: "https://mkt.classin.co.kr/leads/42", stageLabel: "상담", owner: "김민준", nextActionAt: null },
          })}
          basisMs={NOW}
          neoStale={false}
        />
      </ul>
    )
    expect(html).toContain('href="https://mkt.classin.co.kr/leads/42"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain("Compass에서 열기")
    expect(html).toContain("bg-[#084734]") // primary 변형
    expect(html).not.toContain("결과 기록")
    expect(html).not.toContain("내일로")
    // 묶인 Home 할 일이 없으면 할 일 버튼도 없다 · 주 행동이 이미 Compass 링크라 보조 "Compass 기록"도 없다
    expect(html).not.toContain("할 일 완료")
    expect(html).not.toContain("Compass 기록")
    expect(html).toContain("Compass · 상담 · 김민준")
  })

  it("NEO 계정은 '결과 기록'·'내일로' + 'NEO 값 기준' 캡션(멈췄으면 경고색)", () => {
    const html = renderToStaticMarkup(
      <ul>
        <TodayContactRowView
          row={makeRow("neo:n1", {
            primaryAction: "record_outcome",
            lane: "money",
            laneLabel: "돈 임박",
            reasons: [reason({ kind: "account_expiry", label: "만료 D-5", dueAt: "2026-09-30T00:00:00.000Z" })],
            neoAsOf: "2026-08-28T00:00:00.000Z",
          })}
          basisMs={NOW}
          neoStale
        />
      </ul>
    )
    expect(html).toContain("결과 기록")
    expect(html).toContain("내일로")
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain("aria-controls")
    expect(html).toContain("NEO 값 08/28 기준")
    expect(html).toContain("계정 만료·소진")
    expect(html).not.toContain("Compass에서 열기")
    expect(html).toContain(SECONDARY_TEXT_CLASS)
    expect(html).toContain(INTERACTIVE_TEXT_CLASS)
  })

  it("대상 없는 할 일은 '완료'·'내일로'", () => {
    const html = renderToStaticMarkup(
      <ul>
        <TodayContactRowView
          row={makeRow("task:t1", { primaryAction: "complete_task", reasons: [reason({ kind: "task", label: "할 일 — 견적 회신 확인" })] })}
          basisMs={NOW}
          neoStale={false}
        />
      </ul>
    )
    expect(html).toMatch(/완료<\/button>/)
    expect(html).toContain("내일로")
    expect(html).not.toContain("결과 기록")
  })

  it("처리된 행은 한 줄로 접히고, 되돌리기 창 안에서만 '되돌리기'를 단다", () => {
    const row = makeRow("neo:n1", { primaryAction: "record_outcome", handled: HANDLED })
    const withUndo = renderToStaticMarkup(
      <ul>
        <TodayContactRowView row={row} basisMs={NOW} neoStale={false} handledSummary="콜 · 부재 → 다음 09/26" undo={{ pending: false, onUndo: () => {} }} />
      </ul>
    )
    expect(withUndo).toContain('data-handled="true"')
    expect(withUndo).toContain("처리됨")
    expect(withUndo).toContain("콜 · 부재 → 다음 09/26")
    expect(withUndo).toContain("되돌리기")
    expect(withUndo).not.toContain("결과 기록")
    const withoutUndo = renderToStaticMarkup(
      <ul>
        <TodayContactRowView row={row} basisMs={NOW} neoStale={false} />
      </ul>
    )
    expect(withoutUndo).not.toContain("되돌리기")
    expect(withoutUndo).toContain("연락 기록 → 다음 09/26")
  })

  it("리드·NEO 제목은 360 드로어 버튼, 그 밖은 Home 링크 · Compass 전용 행은 텍스트", () => {
    const lead = renderToStaticMarkup(
      <ul>
        <TodayContactRowView row={makeRow("lead:a")} basisMs={NOW} neoStale={false} onOpenCustomer={() => {}} />
      </ul>
    )
    expect(lead).toContain('title="학원 a 고객 360 열기"')
    // 전환 고객 행의 href 는 빌더가 만드는 값(통합 고객 DB 검색 착지 — todayContactCustomerHref)으로 둔다.
    const customerHref = todayContactCustomerHref("학원 c")
    const customer = renderToStaticMarkup(
      <ul>
        <TodayContactRowView
          row={makeRow("customer:c", { entityType: "customer", primaryAction: "record_outcome", href: customerHref })}
          basisMs={NOW}
          neoStale={false}
          onOpenCustomer={() => {}}
        />
      </ul>
    )
    expect(customerHref).toMatch(/^\/admin\/crm\/customers\/unified\?source=customer&q=/)
    expect(customer).toContain(`href="${customerHref.replace(/&/g, "&amp;")}"`)
    expect(customer).not.toContain("고객 360 열기")
    const compassOnly = renderToStaticMarkup(
      <ul>
        <TodayContactRowView
          row={makeRow("compass:7", {
            primaryAction: "open_compass",
            href: "https://mkt.classin.co.kr/leads/7",
            compass: { leadId: 7, url: "https://mkt.classin.co.kr/leads/7", stageLabel: null, owner: null, nextActionAt: null },
          })}
          basisMs={NOW}
          neoStale={false}
          onOpenCustomer={() => {}}
        />
      </ul>
    )
    // 외부 href 를 next/link 로 같은 탭 이동시키지 않는다 — Compass 열기 링크 하나뿐
    expect(compassOnly.match(/href="https:\/\/mkt\.classin\.co\.kr\/leads\/7"/g)?.length).toBe(1)
  })
})

describe("Compass 매칭 리드에 묶인 Home 할 일 — 홈에서 닫을 길(리뷰 [0]·[23])", () => {
  // 세그먼트 "오늘 연락에 넣기"가 Compass 매칭 리드 L1 에 할 일 T1(오늘 18:00)을 만든 상태.
  const compassLeadWithTask = makeRow("lead:L1", {
    primaryAction: "open_compass",
    compass: compassRef(77),
    openTaskIds: ["T1"],
    reasons: [reason({ kind: "task", label: "할 일 · 오늘 18:00", detail: "[세그먼트] 무연락 30일+", dueAt: "2026-09-25T09:00:00.000Z", sourceRef: "task:T1" })],
  })

  it("주 행동 'Compass에서 열기'는 그대로, 보조로 '할 일 완료'·'할 일 내일로' — 연락 기록 버튼은 없다", () => {
    const html = renderRow(compassLeadWithTask)
    expect(html).toContain("Compass에서 열기")
    expect(html).toContain('href="https://mkt.classin.co.kr/leads/77"')
    expect(html).toContain('data-today-contact-task-action="complete"')
    expect(html).toContain('data-today-contact-task-action="snooze"')
    expect(html).toContain("할 일 완료")
    // 라벨이 Home 할 일만 옮긴다는 것을 밝힌다(리드 팔로업·Compass 다음 액션이 아니다)
    expect(html).toMatch(/할 일 내일로<\/button>/)
    // 이중 연락 방지 — Home 결과 기록은 여전히 없다
    expect(html).not.toContain("결과 기록")
    // 버튼은 보조(채움 없음) — Compass 열기만 Classin Green 채움
    expect(html.match(/bg-\[#084734\]/g)?.length).toBe(1)
  })

  it("할 일이 여러 건이면 버튼이 건수를 밝히고 모두 닫는다", () => {
    expect(todayContactTaskCompleteLabel(1)).toBe("할 일 완료")
    expect(todayContactTaskCompleteLabel(2)).toBe("할 일 2건 완료")
    expect(todayContactTaskSnoozeLabel(1)).toBe("할 일 내일로")
    expect(todayContactTaskSnoozeLabel(3)).toBe("할 일 3건 내일로")
    // 한 번에 닫는 수는 상한 10 — 라벨이 실제로 닫는 수와 같다(나머지는 남은 수로 다시 뜬다)
    expect(todayContactTaskCompleteLabel(14)).toBe("할 일 10건 완료")
    expect(todayContactTaskSnoozeLabel(14)).toBe("할 일 10건 내일로")
    expect(renderRow({ ...compassLeadWithTask, openTaskIds: ["T1", "T2"] })).toContain("할 일 2건 완료")
    expect(taskIdsForRow({ ...compassLeadWithTask, openTaskIds: ["T1", "T2", "T1"] })).toEqual(["T1", "T2"])
    // 결과 폼과 같은 상한(10)
    expect(taskIdsForRow({ ...compassLeadWithTask, openTaskIds: Array.from({ length: 14 }, (_, i) => `T${i}`) })).toHaveLength(10)
    // 대상 없는 할 일 행은 그 할 일 하나
    expect(taskIdsForRow(makeRow("task:t9", { primaryAction: "complete_task", openTaskIds: [] }))).toEqual(["t9"])
    expect(compassRowOpenTaskCount(compassLeadWithTask)).toBe(1)
    expect(compassRowOpenTaskCount({ primaryAction: "record_outcome", openTaskIds: ["x"] })).toBe(0)
  })

  it("'내일로'는 할 일 PATCH 로 — 결과 라우트 미루기(리드 follow_up_at 이동)로 보내지 않는다", () => {
    expect(todayContactSnoozeKind(compassLeadWithTask)).toBe("task")
    expect(todayContactSnoozeKind({ primaryAction: "open_compass", openTaskIds: [] })).toBeNull()
    expect(todayContactSnoozeKind({ primaryAction: "complete_task", openTaskIds: ["t"] })).toBe("task")
    expect(todayContactSnoozeKind({ primaryAction: "record_outcome", openTaskIds: ["t"] })).toBe("outcome")
    expect(todayContactSnoozeKind({ primaryAction: "record_outcome_lead", openTaskIds: [] })).toBe("outcome")
  })

  it("미루기 되돌리기용 원래 기한 — 사유(sourceRef)로 확실한 것만, 접혀서 모르는 할 일은 빠진다", () => {
    // 할 일 두 건이 한 사유로 접혔다(대표 T1 의 sourceRef 만 남는다)
    const dues = knownTaskDueAts(compassLeadWithTask, ["T1", "T2"])
    expect(dues.get("T1")).toBe("2026-09-25T09:00:00.000Z")
    expect(dues.has("T2")).toBe(false)
    // 대상 없는 할 일 행은 사유 하나 — 행 기한으로 보충
    const taskRow = makeRow("task:t9", { primaryAction: "complete_task", dueAt: "2026-09-24T00:00:00.000Z", reasons: [reason({ kind: "task", sourceRef: "task:other" })] })
    expect(knownTaskDueAts(taskRow, ["t9"]).get("t9")).toBeNull()
    expect(knownTaskDueAts({ ...taskRow, reasons: [reason({ kind: "compass_next_action" })] }, ["t9"]).get("t9")).toBe("2026-09-24T00:00:00.000Z")
  })

  it("Compass 에서 연락해 처리됨으로 접혀도 남은 Home 할 일과 '할 일 완료'를 보인다(안 닫으면 내일 '지남'으로 다시 오른다)", () => {
    const handled = { ...compassLeadWithTask, handled: { ...HANDLED, kind: "compass_activity" as const, source: "compass" as const } }
    const html = renderRow(handled, { onCompleteTask: () => {} })
    expect(html).toContain('data-handled="true"')
    expect(html).toContain("Compass 활동")
    expect(html).toContain('data-today-contact-open-tasks="1"')
    expect(html).toContain("Home 할 일 1건 남음")
    expect(html).toMatch(/할 일 완료<\/button>/)
    // 핸들러가 없으면 표시만
    const readOnly = renderRow(handled)
    expect(readOnly).toContain("Home 할 일 1건 남음")
    expect(readOnly).not.toMatch(/할 일 완료<\/button>/)
    // 이번 세션에서 닫아 오버레이가 남은 할 일을 비웠으면 표시하지 않는다
    expect(renderRow({ ...handled, openTaskIds: [] }, { onCompleteTask: () => {} })).not.toContain("남음")
    // 결과 기록으로 처리된 계정 행도 함께 닫지 않은 할 일이 남으면 같은 표시 — 접힌 행에는 결과 폼이 없어 여기가 닫을 곳이다
    const neoHandled = renderRow(makeRow("neo:n1", { primaryAction: "record_outcome", openTaskIds: ["T9"], handled: HANDLED }), {
      onCompleteTask: () => {},
    })
    expect(neoHandled).toContain("Home 할 일 1건 남음")
    expect(neoHandled).toContain('title="남은 Home 할 일을 닫습니다"')
    expect(neoHandled).not.toContain("Compass에서 열기")
  })

  it("처리됨으로 접힌 Compass 행도 'Compass에서 열기'를 남긴다(리뷰 새 [0] — 접혀도 Compass 다음 액션에 한 번에 닿게)", () => {
    const handled = { ...compassLeadWithTask, openTaskIds: [], handled: { ...HANDLED, kind: "compass_activity" as const, source: "compass" as const } }
    const html = renderRow(handled)
    expect(html).toContain('data-handled="true"')
    expect(html).toContain('data-testid="today-contact-handled-compass"')
    expect(html).toContain('href="https://mkt.classin.co.kr/leads/77"')
    expect(html).toContain('target="_blank"')
    // 접힌 줄의 링크는 채움이 아니다(inline)
    expect(html).not.toContain("bg-[#084734]")
    // Compass 가 아닌 행은 달지 않는다
    expect(renderRow(makeRow("neo:n1", { primaryAction: "record_outcome", compass: compassRef(90), handled: HANDLED }))).not.toContain(
      "today-contact-handled-compass"
    )
  })

  it("오버레이가 열린 할 일 목록을 덮는다 — 닫은 뒤 낡은 응답이 '남은 할 일'로, 되돌린 뒤 빈 목록으로 보이지 않게", () => {
    const data = makeData([compassLeadWithTask])
    const done = applyTodayContactOverlays(
      data,
      new Map([[compassLeadWithTask.key, overlay(compassLeadWithTask, { ...HANDLED, kind: "task_done" }, { openTaskIds: [] })]]),
      "/scope"
    )
    expect(done?.rows[0].openTaskIds).toEqual([])
    expect(done?.rows[0].handled?.kind).toBe("task_done")
    // 되돌리기: 서버가 아직 닫힌 상태(할 일 없음)로 줘도 처리 직전 목록으로 되살린다 — 진행률은 그대로(둘 다 미처리)
    const staleClosed = makeData([{ ...compassLeadWithTask, openTaskIds: [] }])
    const reopened = applyTodayContactOverlays(
      staleClosed,
      new Map([[compassLeadWithTask.key, overlay(compassLeadWithTask, null, { openTaskIds: ["T1"] })]]),
      "/scope"
    )
    expect(reopened?.rows[0].openTaskIds).toEqual(["T1"])
    expect(reopened?.rows[0].handled).toBeNull()
    expect(reopened?.progress).toMatchObject({ handled: 0, remaining: 1 })
    // 덮어쓰기가 없으면 서버 값 그대로
    const plain = applyTodayContactOverlays(data, new Map([[compassLeadWithTask.key, overlay(compassLeadWithTask, HANDLED)]]), "/scope")
    expect(plain?.rows[0].openTaskIds).toEqual(["T1"])
  })

  it("소스 계약 — 할 일 PATCH(Home crm_tasks)만, 행에 묶인 할 일 전부, 되돌리기는 처리 직전 상태로", () => {
    const panel = readFileSync(join(process.cwd(), "components/admin/crm/home/CrmTodayContactsPanel.tsx"), "utf8")
    expect(panel).toContain("const taskIds = taskIdsForRow(row)")
    expect(panel).toContain("const snoozeKind = todayContactSnoozeKind(row)")
    expect(panel).toContain('if (snoozeKind === "task") void handleTask(row, "snooze")')
    expect(panel).toContain('else if (snoozeKind === "outcome") snoozeRow(row)')
    expect(panel).not.toContain('if (row.primaryAction === "complete_task") void handleTask(row, "snooze")')
    // Compass 에서 이미 처리됨이던 행은 되돌린 뒤에도 처리됨(null 로 강제하면 행이 다시 열린다) · 세션 요약도 처리 직전 그대로
    expect(panel).toContain("putOverlay(row, row.handled, restoreSummary, { openTaskIds: [...row.openTaskIds] })")
    // 오버레이는 계획(planTodayContactTaskAction)대로 — 무조건 task_done/task_snoozed 로 덮지 않는다
    expect(panel).toContain("putOverlay(row, plan.handled, plan.summary, { openTaskIds: plan.remainingTaskIds })")
    // 할 일 닫기는 Compass 로 쓰지 않는다(교차 쓰기 0)
    expect(panel).not.toMatch(/mkt\.classin\.co\.kr\/api/)
  })
})

describe("Compass 다음 액션이 남은 행에서 Home 할 일만 닫거나 미룬다(리뷰 새 [0])", () => {
  // 리뷰 시나리오: Compass 매칭 리드 L1 — 같은 전화의 Compass 다음 액션(오늘 14:00)이 lead:L1 에 합쳐져 있고, 세그먼트
  // 할 일 T1(오늘 18:00)도 묶였다.
  const compassReason = reason({
    kind: "compass_next_action",
    label: "Compass 다음 액션 · 오늘 14:00",
    dueAt: "2026-09-25T05:00:00.000Z",
    sourceRef: "compass:77",
  })
  const taskReason = reason({
    kind: "task",
    label: "할 일 · 3시간 지남",
    detail: "[세그먼트] 무연락 30일+",
    dueAt: "2026-09-25T00:00:00.000Z",
    overdue: true,
    sourceRef: "task:T1",
  })
  const l1 = makeRow("lead:L1", {
    primaryAction: "open_compass",
    compass: compassRef(77),
    openTaskIds: ["T1"],
    reasons: [taskReason, compassReason],
    dueAt: taskReason.dueAt,
    overdue: true,
  })
  const TOMORROW_9 = "2026-09-26T00:00:00.000Z"

  it("계획 — 할 일 밖 사유가 남은 Compass 행은 연 채로(할 일만 걷는다), 할 일만으로 선 행은 처리됨", () => {
    const snooze = planTodayContactTaskAction({ row: l1, taskIds: ["T1"], action: "snooze", at: GENERATED_AT, by: "박지훈", nextAt: TOMORROW_9 })
    expect(snooze.handled).toBeNull()
    expect(snooze.closesRow).toBe(false)
    expect(snooze.remainingTaskIds).toEqual([])
    expect(snooze.summary).toBe("할 일 미룸 → 다음 09/26 (토) 09:00")
    const complete = planTodayContactTaskAction({ row: l1, taskIds: ["T1"], action: "complete", at: GENERATED_AT, by: null, nextAt: null })
    expect(complete.handled).toBeNull()
    expect(complete.summary).toBe("할 일 완료")
    // 할 일만으로 선 Compass 행(세그먼트 할 일뿐)은 닫으면 처리됨
    const taskOnly = { ...l1, reasons: [taskReason] }
    const closed = planTodayContactTaskAction({ row: taskOnly, taskIds: ["T1"], action: "snooze", at: GENERATED_AT, by: "박지훈", nextAt: TOMORROW_9 })
    expect(closed.closesRow).toBe(true)
    expect(closed.handled).toMatchObject({ kind: "task_snoozed", source: "home", nextAt: TOMORROW_9, by: "박지훈", approximate: false })
    // 대상 없는 할 일 행 — 처리됨(task_done)
    const taskRow = makeRow("task:t9", { primaryAction: "complete_task", openTaskIds: ["t9"], reasons: [reason({ kind: "task", sourceRef: "task:t9" })] })
    expect(planTodayContactTaskAction({ row: taskRow, taskIds: ["t9"], action: "complete", at: GENERATED_AT, by: null, nextAt: null }).handled?.kind).toBe(
      "task_done"
    )
    // 한 번에 닫는 상한(10)을 넘어 할 일이 남으면 연 채로 — 남은 할 일을 다시 닫게
    const many = { ...taskOnly, openTaskIds: Array.from({ length: 12 }, (_, i) => `T${i}`) }
    const partial = planTodayContactTaskAction({ row: many, taskIds: taskIdsForRow(many), action: "complete", at: GENERATED_AT, by: null, nextAt: null })
    expect(partial.handled).toBeNull()
    expect(partial.remainingTaskIds).toEqual(["T10", "T11"])
    expect(partial.summary).toBe("할 일 10건 완료")
  })

  it("계획 — 이미 처리됨(Compass 활동)인 행은 처리 판정을 바꾸지 않고 문구만 덧붙인다", () => {
    const handled = { ...l1, reasons: [compassReason], handled: { ...HANDLED, kind: "compass_activity" as const, source: "compass" as const, nextAt: null } }
    const plan = planTodayContactTaskAction({ row: handled, taskIds: ["T1"], action: "complete", at: GENERATED_AT, by: null, nextAt: null })
    expect(plan.handled).toBe(handled.handled)
    expect(plan.closesRow).toBe(false)
    expect(plan.summary).toBe("Compass 활동 · 할 일 완료")
    // 이번 세션 요약이 있으면 그 문구에 덧붙인다
    expect(
      planTodayContactTaskAction({ row: handled, taskIds: ["T1"], action: "complete", at: GENERATED_AT, by: null, nextAt: null, currentSummary: "콜 · 부재" }).summary
    ).toBe("콜 · 부재 · 할 일 완료")
  })

  it("오버레이 — 행은 열린 채, 할 일 사유·버튼만 걷히고 대표 기한·기한 지남이 남은 사유로 맞춰진다", () => {
    const data = makeData([l1])
    const plan = planTodayContactTaskAction({ row: l1, taskIds: ["T1"], action: "snooze", at: GENERATED_AT, by: null, nextAt: TOMORROW_9 })
    const view = applyTodayContactOverlays(
      data,
      new Map([[l1.key, overlay(l1, plan.handled, { summary: plan.summary, openTaskIds: plan.remainingTaskIds })]]),
      "/scope"
    )
    const row = view?.rows[0]
    expect(row?.handled).toBeNull()
    expect(row?.primaryAction).toBe("open_compass")
    expect(row?.openTaskIds).toEqual([])
    expect(row?.reasons.map((item) => item.kind)).toEqual(["compass_next_action"])
    expect(row?.dueAt).toBe(compassReason.dueAt)
    expect(row?.overdue).toBe(false)
    // 진행률 — 처리로 올라가지 않는다. 기한 지남은 지난 할 일이 걷혀 줄어든다
    expect(view?.progress).toMatchObject({ total: 1, handled: 0, remaining: 1, overdue: 0 })
    // 할 일 사유뿐인 행은 사유를 비우지 않는다
    expect(dropClosedTaskReasons({ ...l1, reasons: [taskReason], openTaskIds: [] }).reasons).toHaveLength(1)
    // 열린 할 일이 남아 있으면 건드리지 않는다
    expect(dropClosedTaskReasons(l1)).toBe(l1)
  })

  it("렌더 — 'Compass에서 열기' 주 행동이 그대로 있고, 한 일(할 일 미룸)과 되돌리기를 행 안에 밝힌다", () => {
    const opened = { ...l1, openTaskIds: [], reasons: [compassReason], dueAt: compassReason.dueAt, overdue: false }
    const html = renderRow(opened, { handledSummary: "할 일 미룸 → 다음 09/26 (토) 09:00", undo: { pending: false, onUndo: () => {} } })
    expect(html).not.toContain('data-handled="true"')
    expect(html).not.toContain("처리됨")
    expect(html).toContain("Compass에서 열기")
    expect(html.match(/bg-\[#084734\]/g)?.length).toBe(1)
    expect(html).toContain("data-today-contact-open-summary")
    expect(html).toContain("할 일 미룸 → 다음 09/26 (토) 09:00")
    expect(html).toMatch(/되돌리기<\/button>/)
    // 할 일을 다 걷었으니 할 일 버튼은 없다
    expect(html).not.toContain("data-today-contact-task-action")
  })

  it("서버가 할 일 흔적만으로 처리됨을 줘도 다시 연다 — 진행률·순서를 맞추고, Compass 활동·Home 입력 행은 건드리지 않는다", () => {
    const snoozedByServer = makeRow("lead:L1", {
      primaryAction: "open_compass",
      compass: compassRef(77),
      reasons: [compassReason],
      dueAt: compassReason.dueAt,
      handled: { kind: "task_snoozed", at: GENERATED_AT, by: "박지훈", source: "home", nextAt: TOMORROW_9, approximate: true },
    })
    const pendingRow = makeRow("lead:P", { overdue: true })
    const compassHandled = makeRow("lead:C", {
      primaryAction: "open_compass",
      compass: compassRef(78),
      reasons: [compassReason],
      handled: { ...HANDLED, kind: "compass_activity", source: "compass" },
    })
    const homeLead = makeRow("lead:H", { primaryAction: "record_outcome_lead", reasons: [reason({ kind: "reinflow" })], handled: { ...HANDLED, kind: "task_done" } })
    const taskOnly = makeRow("lead:T", {
      primaryAction: "open_compass",
      compass: compassRef(79),
      reasons: [taskReason],
      handled: { ...HANDLED, kind: "task_done" },
    })
    expect(isCompassRowHandledByHomeTaskOnly(snoozedByServer)).toBe(true)
    expect(isCompassRowHandledByHomeTaskOnly(compassHandled)).toBe(false)
    expect(isCompassRowHandledByHomeTaskOnly(homeLead)).toBe(false)
    expect(isCompassRowHandledByHomeTaskOnly(taskOnly)).toBe(false)
    expect(isCompassRowHandledByHomeTaskOnly({ ...snoozedByServer, handled: { ...HANDLED, kind: "rescheduled" } })).toBe(true)

    // 서버 순서: 미처리 → 처리됨(최근 처리 먼저)
    const data = makeData([pendingRow, compassHandled, snoozedByServer, homeLead, taskOnly])
    data.progress.byLane.new_response.handled = 4
    const next = reopenCompassRowsHandledByHomeTasks(data)
    expect(next?.rows.map((row) => row.key)).toEqual(["lead:P", "lead:L1", "lead:C", "lead:H", "lead:T"])
    expect(next?.rows[1].handled).toBeNull()
    expect(next?.progress).toMatchObject({ total: 5, handled: 3, remaining: 2, overdue: 1 })
    expect(next?.progress.byLane.new_response.handled).toBe(3)
    // 원본은 그대로 · 다시 열 행이 없으면 같은 참조
    expect(data.rows[2].handled?.kind).toBe("task_snoozed")
    const untouched = makeData([pendingRow, compassHandled])
    expect(reopenCompassRowsHandledByHomeTasks(untouched)).toBe(untouched)
    expect(reopenCompassRowsHandledByHomeTasks(null)).toBeNull()
  })

  it("패널 — 서버가 접어 보낸 Compass 행을 열린 행으로 그리고 진행률 머리도 맞춘다", async () => {
    const snoozedByServer = makeRow("lead:L1", {
      primaryAction: "open_compass",
      compass: compassRef(77),
      reasons: [compassReason],
      dueAt: compassReason.dueAt,
      handled: { kind: "task_snoozed", at: GENERATED_AT, by: "박지훈", source: "home", nextAt: TOMORROW_9, approximate: true },
    })
    const data = makeData([makeRow("lead:a"), snoozedByServer])
    data.progress.byLane.new_response.handled = 1
    const html = await renderPanel(data)
    expect(html).toMatch(/오늘 <b[^>]*>2<\/b>건 중 <b[^>]*>0<\/b>건 처리/)
    expect(html).not.toContain('data-handled="true"')
    expect(html).toContain('href="https://mkt.classin.co.kr/leads/77"')
  })

  it("소스 계약 — 서버 응답을 다시 연 뒤 오버레이를 덧씌운다", () => {
    const panel = readFileSync(join(process.cwd(), "components/admin/crm/home/CrmTodayContactsPanel.tsx"), "utf8")
    expect(panel).toContain("const reopened = useMemo(() => reopenCompassRowsHandledByHomeTasks(data), [data])")
    expect(panel).toContain("applyTodayContactOverlays(reopened, overlays, scope)")
    expect(panel).toContain("const plan = planTodayContactTaskAction({")
    // 되돌리기는 연 채로 둔 행에도(처리됨 조건 없이)
    expect(panel).toContain("const undo = undoable?.key === row.key ?")
  })
})

describe("Home 정본 행의 보조 'Compass 기록 ↗'(리뷰 [6]·[28])", () => {
  it("같은 전화의 Compass 리드가 있는 NEO 계정 — 결과 기록은 주 행동 그대로, 사유 줄에 Compass 기록 새 탭 링크", () => {
    const html = renderRow(
      makeRow("neo:N2", {
        primaryAction: "record_outcome",
        lane: "money",
        reasons: [reason({ kind: "account_expiry", label: "만료 D-5" })],
        compass: compassRef(90),
      })
    )
    expect(html).toContain("결과 기록")
    expect(html).toContain(">Compass 기록</span>")
    expect(html).toContain('data-testid="today-contact-compass-record"')
    expect(html.match(/href="https:\/\/mkt\.classin\.co\.kr\/leads\/90"/g)?.length).toBe(1)
    expect(html).toContain('target="_blank"')
    expect(html).not.toContain("Compass에서 열기")
  })

  it("NEO 등록 확정 리드(record_outcome_lead) — 단계가 없어도 링크는 단다", () => {
    const html = renderRow(makeRow("lead:L1", { primaryAction: "record_outcome_lead", compass: compassRef(77, { stageLabel: null, owner: null }) }))
    expect(html).toContain(">Compass 기록</span>")
    expect(html).toContain('href="https://mkt.classin.co.kr/leads/77"')
    expect(html).not.toContain("Compass ·")
  })

  it("Compass 참조가 없거나 주 행동이 이미 Compass 링크면 달지 않는다", () => {
    expect(renderRow(makeRow("neo:N3", { primaryAction: "record_outcome" }))).not.toContain("Compass 기록")
    expect(secondaryCompassRecordHref({ primaryAction: "open_compass", compass: compassRef(1) })).toBeNull()
    expect(secondaryCompassRecordHref({ primaryAction: "record_outcome", compass: null })).toBeNull()
    expect(secondaryCompassRecordHref({ primaryAction: "record_outcome", compass: compassRef(5) })).toBe("https://mkt.classin.co.kr/leads/5")
    // URL 이 비었으면 리드 id 로 만든다(compassLeadUrl)
    expect(secondaryCompassRecordHref({ primaryAction: "record_outcome_lead", compass: compassRef(6, { url: "" }) })).toBe(compassLeadUrl(6))
  })

  it("처리됨으로 접힌 행은 한 줄 그대로(보조 링크를 달지 않는다)", () => {
    expect(renderRow(makeRow("neo:N2", { primaryAction: "record_outcome", compass: compassRef(90), handled: HANDLED }))).not.toContain("Compass 기록")
  })
})

describe("저장 실패 뒤 다시 보내기 — 같은 requestId(리뷰 [2])", () => {
  const base: TodayContactOutcomeRequest = {
    requestId: "11111111-1111-4111-8111-111111111111",
    mode: "contact",
    target: { type: "neo_account", id: "n1", label: "학원 n1" },
    channel: "call",
    result: "no_answer",
    next: { preset: "tomorrow_9" },
    nextTitle: "연장 제안 후속",
    closeTaskIds: ["T1"],
  }

  it("지문은 requestId 를 빼고 내용만 본다", () => {
    expect(todayContactRequestSignature(base)).toBe(todayContactRequestSignature({ ...base, requestId: "22222222-2222-4222-8222-222222222222" }))
    expect(todayContactRequestSignature(base)).not.toBe(todayContactRequestSignature({ ...base, memo: "다시 전화 요청" }))
    expect(todayContactRequestSignature(base)).not.toContain(base.requestId)
  })

  it("실패한 요청이 남아 있으면 그 id 를 다시 쓴다 — 폼 '저장'도 배너 '다시 시도'와 같은 멱등 키", () => {
    const create = vi.fn(() => "fresh-id")
    const signature = todayContactRequestSignature(base)
    const pending = { requestId: base.requestId, signature, failedAtMs: NOW }
    expect(pickTodayContactRequestId(pending, signature, NOW + 60_000, create)).toEqual({
      requestId: base.requestId,
      contentChanged: false,
    })
    expect(create).not.toHaveBeenCalled()
    // 내용을 고쳐 다시 보내도 같은 id(서버가 duplicate 면 고친 내용이 빠졌다고 알린다)
    expect(pickTodayContactRequestId(pending, todayContactRequestSignature({ ...base, memo: "메모" }), NOW + 60_000, create)).toEqual({
      requestId: base.requestId,
      contentChanged: true,
    })
    // 실패가 없으면(첫 저장·성공 뒤) 새 id
    expect(pickTodayContactRequestId(undefined, signature, NOW, create)).toEqual({ requestId: "fresh-id", contentChanged: false })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("실패 기록은 10분·KST 날짜가 바뀌면 만료 — 어제 기록이 오늘 같은 내용의 저장을 duplicate 로 삼키지 않게(리뷰 새 [1] b)", () => {
    const create = vi.fn(() => "fresh-id")
    const signature = todayContactRequestSignature(base)
    const pending = { requestId: base.requestId, signature, failedAtMs: NOW }
    expect(TODAY_CONTACTS_PENDING_REQUEST_MAX_AGE_MS).toBe(10 * 60_000)
    expect(isTodayContactPendingRequestLive(pending, NOW + TODAY_CONTACTS_PENDING_REQUEST_MAX_AGE_MS)).toBe(true)
    expect(isTodayContactPendingRequestLive(pending, NOW + TODAY_CONTACTS_PENDING_REQUEST_MAX_AGE_MS + 1)).toBe(false)
    // 같은 내용이어도 만료된 기록은 없는 것으로 — 새 id, 경고 없음
    expect(pickTodayContactRequestId(pending, signature, NOW + 11 * 60_000, create)).toEqual({ requestId: "fresh-id", contentChanged: false })
    // 10분 안이라도 KST 자정을 넘기면 새 날의 저장이다(23:55 실패 → 00:02 저장)
    const lateNight = Date.parse("2026-09-25T14:55:00.000Z") // 09-25 23:55 KST
    const afterMidnight = Date.parse("2026-09-25T15:02:00.000Z") // 09-26 00:02 KST
    expect(isTodayContactPendingRequestLive({ failedAtMs: lateNight }, afterMidnight)).toBe(false)
    expect(isTodayContactPendingRequestLive({ failedAtMs: lateNight }, lateNight + 60_000)).toBe(true)
    expect(isTodayContactPendingRequestLive({ failedAtMs: Number.NaN }, NOW)).toBe(false)
  })

  it("duplicate + 고친 내용 경고는 대상 종류와 무관 — 리드도 requestId 멱등이다(리뷰 새 [1] a)", () => {
    expect(todayContactDuplicateDroppedEdit({ contentChanged: true, duplicate: true })).toBe(true)
    expect(todayContactDuplicateDroppedEdit({ contentChanged: false, duplicate: true })).toBe(false)
    expect(todayContactDuplicateDroppedEdit({ contentChanged: true, duplicate: false })).toBe(false)
  })

  it("실패 기록은 행·모드별 — 결과 저장과 미루기가 서로의 id 를 쓰지 않는다", () => {
    expect(todayContactPendingKey("neo:n1", "contact")).not.toBe(todayContactPendingKey("neo:n1", "snooze"))
    expect(todayContactPendingKey("neo:n1", "contact")).not.toBe(todayContactPendingKey("neo:n2", "contact"))
  })

  it("소스 계약 — 폼 저장·미루기 모두 실패 기록을 거쳐 id 를 고르고, 실패 때 남기고 성공 때만 지운다", () => {
    const panel = readFileSync(join(process.cwd(), "components/admin/crm/home/CrmTodayContactsPanel.tsx"), "utf8")
    // 폼의 저장은 retryRequestId 없이 부른다 — 그래도 실패 기록에서 같은 id 를 찾는다(만료 판정은 저장 순간 시각)
    expect(panel).toContain("onSubmit={() => saveOutcome(row)}")
    expect(panel.match(/: pickTodayContactRequestId\(pending, signature, nowMs\)/g)?.length).toBe(2)
    expect(panel).not.toMatch(/retryRequestId \?\? newTodayContactRequestId\(\)/)
    const submit = panel.slice(panel.indexOf("const submitOutcome = useCallback"), panel.indexOf("const saveOutcome = useCallback"))
    const failure = submit.slice(submit.indexOf("if (!result.ok || !response)"), submit.indexOf("requestFocus(row.key)"))
    expect(failure).toContain("pendingRequestsRef.current.set(")
    expect(failure).toContain("{ requestId: request.requestId, signature: input.signature, failedAtMs }")
    // 같은 행이 성공하면 결과 저장·미루기 양쪽 실패 기록을 지운다
    expect(submit).toContain('pendingRequestsRef.current.delete(todayContactPendingKey(row.key, "contact"))')
    expect(submit).toContain('pendingRequestsRef.current.delete(todayContactPendingKey(row.key, "snooze"))')
    // 리드도 requestId 멱등 — 대상 종류로 경고를 빼지 않는다
    expect(submit).not.toContain('request.target.type !== "lead"')
    // 재전송 내용 변경 경고는 todayContactSaveWarnings(todayContactDuplicateDroppedEdit + 서버 불일치 경고 한 번만)로
    // (tests/crm/today-contacts-panel-review-fixes.test.tsx P3)
    expect(submit).toContain("const warnings = todayContactSaveWarnings({")
    expect(submit).toContain("contentChanged: input.contentChanged,")
    expect(submit).toContain("duplicate: response.duplicate,")
  })

  it("소스 계약 — 초안을 버리면(취소·버리고 닫기·담당 변경·다른 행 처리) 그 행의 결과 저장 실패 기록도 버린다", () => {
    const panel = readFileSync(join(process.cwd(), "components/admin/crm/home/CrmTodayContactsPanel.tsx"), "utf8")
    const dropDraft = panel.slice(panel.indexOf("const dropDraft = useCallback"), panel.indexOf("const toggleForm = useCallback"))
    expect(dropDraft).toContain('pendingRequestsRef.current.delete(todayContactPendingKey(draft.rowKey, "contact"))')
    expect(panel).toContain("onCancel={() => guardDraft(dropDraft)}")
    // 초안을 비우는 곳은 dropDraft 뿐(저장 성공으로 폼을 닫는 submitOutcome apply 는 예외 — 제출은 버림이 아니다)
    const renderStart = panel.indexOf('aria-labelledby="crm-today-contacts-heading"')
    expect(renderStart).toBeGreaterThan(0)
    const render = panel.slice(renderStart)
    expect(render).not.toContain("setDraft(null)")
  })
})

describe("force 새로고침과 낙관 오버레이(리뷰 [15])", () => {
  it("force 도 만료된 오버레이만 걷는다 — 방금 미룬 행을 낡은 할 일 캐시가 '미처리'로 되살리지 않게", () => {
    const panel = readFileSync(join(process.cwd(), "components/admin/crm/home/CrmTodayContactsPanel.tsx"), "utf8")
    const load = panel.slice(panel.indexOf("const load = useCallback"), panel.indexOf("// 홈 새로고침(refreshKey 증가)은 force"))
    expect(load).not.toMatch(/if \(force\) setOverlays/)
    expect(load).not.toContain("new Map()")
    expect(load).toContain("setOverlays((current) => pruneTodayContactOverlays(current, nowMs))")
  })

  it("살아 있는 미루기 오버레이는 서버가 아직 미처리로 줘도 처리됨으로 덮는다(만료 전까지)", () => {
    const row = makeRow("task:t1", { primaryAction: "complete_task", openTaskIds: ["t1"], reasons: [reason({ kind: "task", sourceRef: "task:t1" })] })
    const snoozed = overlay(row, { ...HANDLED, kind: "task_snoozed" }, { openTaskIds: [] })
    const live = new Map([[row.key, snoozed]])
    // force 응답 직후(아직 120초 안) — prune 은 그대로 두고, 낡은 응답(미처리) 위에 처리됨을 덮는다
    expect(pruneTodayContactOverlays(live, NOW + 5_000)).toBe(live)
    const view = applyTodayContactOverlays(makeData([row]), live, "/scope")
    expect(view?.rows[0].handled?.kind).toBe("task_snoozed")
    expect(view?.progress).toMatchObject({ handled: 1, remaining: 0 })
    // 만료되면 서버 값으로
    expect(pruneTodayContactOverlays(live, NOW + TODAY_CONTACTS_OVERLAY_MS).size).toBe(0)
  })
})

describe("오늘 연락 패널(prerender)", () => {
  it("머리 진행률·레인·추정 캡션·기준 시각, SR 통지 영역", async () => {
    const rows = [makeRow("lead:a", { overdue: true, dueAt: "2026-09-24T00:00:00.000Z" }), makeRow("neo:b", { lane: "money", primaryAction: "record_outcome", handled: HANDLED })]
    const data = makeData(rows)
    data.progress.byLane.money.handled = 1
    const html = await renderPanel(data)
    expect(html).toContain("오늘 연락")
    expect(html).toMatch(/오늘 <b[^>]*>2<\/b>건 중 <b[^>]*>1<\/b>건 처리/)
    expect(html).toContain("기한 지남 1")
    expect(html).toContain("아침 목록을 저장하지 않아")
    expect(html).toContain("기준 09/25 (금) 12:00")
    expect(html).toMatch(/<p role="status" aria-live="polite" class="sr-only">/)
    expect(html).toContain('aria-label="오늘 연락 목록"')
    expect(html).toContain("처리됨 숨기기")
    expect(html).toContain('aria-label="담당자 필터"')
  })

  it("10행 뒤는 '남은 N건 더 보기'로 접는다", async () => {
    const rows = Array.from({ length: 13 }, (_, i) => makeRow(`lead:r${i}`))
    const html = await renderPanel(makeData(rows))
    expect(html).toContain("남은 3건 더 보기")
    expect(html).toContain("학원 r9")
    expect(html).not.toContain("학원 r10<")
  })

  it("Compass 끊김·NEO 멈춤·원천 경고는 warning 배너 — 없음과 구분한다", async () => {
    const data = makeData([makeRow("lead:a")], {
      sources: {
        leadsOk: true,
        neoAccountsOk: true,
        tasksOk: false,
        homeContactsOk: true,
        compass: "down",
        neoSync: { latestSyncedAt: "2026-08-28T00:00:00.000Z", stale: true },
        warnings: ["CRM 할 일을 불러오지 못했습니다."],
      },
    })
    const html = await renderPanel(data)
    expect(html).toContain("Compass 연결이 끊겨")
    expect(html).toContain("확인할 수 없는 상태")
    expect(html).toContain("NEO 값이 08/28 기준입니다")
    expect(html).toContain("CRM 할 일을 불러오지 못했습니다.")
    expect(html).toContain('data-tone="warning"')
    expect(html).not.toContain('data-tone="danger"')
  })

  it("메타 광고 밴드 — 건수·오늘·상위 항목(Compass 매칭은 새 탭), 잘린 목록·오래된 Compass 액션 건수", async () => {
    const data = makeData([makeRow("lead:a")], {
      meta: {
        total: 37,
        today: 12,
        top: [
          { key: "lead:m1", title: "메타학원1", dueAt: null, href: "/admin/crm/customers/leads?lead=m1", compass: { leadId: 5, url: "https://mkt.classin.co.kr/leads/5", stageLabel: null, owner: null, nextActionAt: null } },
          { key: "lead:m2", title: "메타학원2", dueAt: null, href: "/admin/crm/customers/leads?lead=m2", compass: null },
        ],
      },
      truncated: { rows: true, limit: 120 },
      counts: { ...makeData([]).counts, compassOverdueBeyondLookback: 4 },
    })
    const html = await renderPanel(data)
    expect(html).toContain("메타 광고 리드")
    expect(html).toContain("응대는 Compass 에서")
    expect(html).toContain('href="https://mkt.classin.co.kr/leads/5"')
    expect(html).toContain("메타학원2")
    expect(html).toContain("+35")
    expect(html).toContain("상위 120건까지만 불러왔습니다")
    expect(html).toContain("14일 넘게 지난 Compass 다음 액션 4건")
  })

  it("대상이 없으면 '없음'을 데이터 누락과 구분해 말한다", async () => {
    const html = await renderPanel(makeData([]))
    expect(html).toContain("오늘 연락할 대상이 없습니다")
    expect(html).toContain("데이터 누락이 아닙니다")
    expect(html).toContain('data-today-contacts-empty="none"')
  })

  it("원천이 실패한 빈 목록은 '없음'을 단언하지 않는다 — 모름으로 말하고 새로고침을 준다", async () => {
    const html = await renderPanel(
      makeData([], {
        sources: {
          leadsOk: false,
          neoAccountsOk: false,
          tasksOk: false,
          homeContactsOk: true,
          compass: "down",
          neoSync: { latestSyncedAt: "2026-09-25T00:00:00.000Z", stale: false },
          warnings: ["리드를 불러오지 못했습니다."],
        },
      })
    )
    expect(html).toContain('data-today-contacts-empty="unknown"')
    expect(html).toContain("오늘 연락 목록이 비어 있습니다")
    expect(html).toContain("일부 원천을 읽지 못해 목록이 비어 보일 수 있습니다")
    expect(html).not.toContain("데이터 누락이 아닙니다")
    expect(html).not.toContain("오늘 연락할 대상이 없습니다")
    expect(html).toMatch(/>새로고침<\/button>/)
  })

  it("잘린 목록 — 칩·전체 건수는 서버 기준, '더 보기'는 안 받은 행까지 세고, 최대 상한 재조회 버튼을 준다", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => makeRow(`lead:r${i}`, { reasons: [reason({ kind: "task", label: "할 일" })] }))
    const data = makeData(rows, {
      truncated: { rows: true, limit: 12 },
      counts: { ...makeData([]).counts, bySource: { ...makeData([]).counts.bySource, task: 20 } },
    })
    data.progress.total = 20
    data.progress.remaining = 20
    const html = await renderPanel(data)
    expect(html).toMatch(/전체 원천 <span class="tabular-nums">20<\/span>/)
    expect(html).toMatch(/할 일 <span class="tabular-nums">20<\/span>/)
    // 받은 12행 중 접은 2 + 안 받은 8
    expect(html).toContain("남은 10건 더 보기")
    expect(html).toContain("상위 12건까지만 불러왔습니다(오늘 전체 20건)")
    expect(html).toContain("최대 150건까지 불러오기")
  })
})

describe("10월 줄기 이식 — 기본 담당 = 로그인 사용자 · 리드/NEO 고객 링크 = 고객 360 상세", () => {
  async function renderPanelAt(search: string, data: CrmTodayContacts) {
    nav.search = search
    try {
      return await renderPanel(data)
    } finally {
      nav.search = ""
    }
  }

  it("?owner 가 없으면 내 담당이 기본 — '내 담당 · 담당자 연결 확인' 옵션을 늘 두고(매핑 없음) 개인 범위 프리페치를 쓴다", async () => {
    const html = await renderPanelAt("", makeData([makeRow("lead:a")]))
    expect(html).toMatch(/<option value="__me" selected="">내 담당 · 담당자 연결 확인<\/option>/)
    expect(html).toMatch(/<option value="">담당 전체<\/option>/)
    expect(html).toContain("학원 a")
  })

  it("?owner=__me 명시도 같은 기본 범위라 프리페치를 쓴다", async () => {
    const html = await renderPanelAt("owner=__me", makeData([makeRow("lead:a")]))
    expect(html).toContain("학원 a")
  })

  it("?owner= (담당 전체 명시)·다른 담당이면 개인 범위 프리페치를 덧씌우지 않는다", async () => {
    const all = await renderPanelAt("owner=", makeData([makeRow("lead:a")]))
    expect(all).not.toContain("학원 a")
    expect(all).toMatch(/<option value="" selected="">담당 전체<\/option>/)
    const other = await renderPanelAt("owner=%EB%B0%95%EB%8B%B4%EB%8B%B9", makeData([makeRow("lead:a")]))
    expect(other).not.toContain("학원 a")
  })

  it("빈 목록 문구 — 담당 전체는 옛 문구 그대로, 내 담당은 범위를 밝히되 '없음'(데이터 누락 아님)·'모름' 구분은 같다", () => {
    expect(todayContactsEmptyCopy({ unknown: false, filtered: false, owner: "" })).toEqual({
      title: "오늘 연락할 대상이 없습니다",
      detail: "처리할 연락이 없다는 뜻입니다 — 데이터 누락이 아닙니다.",
    })
    expect(todayContactsEmptyCopy({ unknown: true, filtered: false, owner: "" }).title).toBe("오늘 연락 목록이 비어 있습니다")
    const mineNone = todayContactsEmptyCopy({ unknown: false, filtered: false, owner: "__me" })
    expect(mineNone.title).toBe("내 담당 중 오늘 연락할 대상이 없습니다")
    expect(mineNone.detail).toContain("데이터 누락이 아닙니다")
    expect(mineNone.detail).toContain("담당 전체로 넓히면")
    const mineUnknown = todayContactsEmptyCopy({ unknown: true, filtered: false, owner: "__me" })
    expect(mineUnknown.title).toBe("내 담당 오늘 연락 목록이 비어 있습니다")
    expect(mineUnknown.detail).not.toContain("데이터 누락이 아닙니다")
    expect(todayContactsEmptyCopy({ unknown: false, filtered: false, owner: "박담당" }).title).toBe("선택한 담당자의 오늘 연락이 없습니다")
    expect(todayContactsEmptyCopy({ unknown: true, filtered: false, owner: "박담당" }).title).toBe("선택한 담당자의 오늘 연락이 보이지 않습니다")
    expect(todayContactsEmptyCopy({ unknown: false, filtered: true, owner: "__me" }).title).toBe("이 조건에 남은 연락이 없습니다")
  })

  it("기본(내 담당) 빈 목록은 '담당 전체로 보기'를 준다", async () => {
    const html = await renderPanelAt("", makeData([]))
    expect(html).toContain("내 담당 중 오늘 연락할 대상이 없습니다")
    expect(html).toMatch(/>담당 전체로 보기<\/button>/)
  })

  it("todayContactHomeHref — 리드·NEO 계정은 고객 360 상세(?tab=activity), 그 밖은 빌더 href", () => {
    expect(todayContactHomeHref({ key: "lead:a", href: "/admin/crm/customers/leads?lead=a" })).toBe("/admin/crm/customers/lead%3Aa?tab=activity")
    expect(todayContactHomeHref({ key: "neo:b", href: "/admin/crm/customers/accounts?account=b" })).toBe("/admin/crm/customers/neo%3Ab?tab=activity")
    expect(todayContactHomeHref({ key: "customer:c", href: "/admin/crm/customers/unified?source=customer&q=c" })).toBe(
      "/admin/crm/customers/unified?source=customer&q=c"
    )
    expect(todayContactHomeHref({ key: "task:t", href: "/admin/crm/activity" })).toBe("/admin/crm/activity")
    expect(todayContactHomeHref({ key: "compass:7", href: "https://mkt.classin.co.kr/leads/7" })).toBe("https://mkt.classin.co.kr/leads/7")
  })

  it("드로어 없이(홈) 리드·NEO 행 제목과 보조 링크는 고객 360 상세로 — 리드 보드·계정 화면 링크로 새지 않는다", () => {
    const lead = renderRow(makeRow("lead:a"))
    expect(lead.match(/href="\/admin\/crm\/customers\/lead%3Aa\?tab=activity"/g)?.length).toBe(2)
    expect(lead).toContain('title="학원 a 고객 360 열기"')
    expect(lead).not.toContain("/admin/crm/customers/leads?lead=a")
    const neo = renderRow(makeRow("neo:b", { primaryAction: "record_outcome", href: "/admin/crm/customers/accounts?account=b" }))
    expect(neo).toContain('href="/admin/crm/customers/neo%3Ab?tab=activity"')
    expect(neo).not.toContain("/admin/crm/customers/accounts?account=b")
  })

  it("A안 — Compass 매칭 리드 행은 주 행동 'Compass에서 열기'를 그대로 두고, 제목만 고객 360 상세로 간다", () => {
    const html = renderRow(makeRow("lead:c1", { primaryAction: "open_compass", compass: compassRef(42) }))
    expect(html).toContain("Compass에서 열기")
    expect(html).toContain('href="https://mkt.classin.co.kr/leads/42"')
    expect(html).toContain('href="/admin/crm/customers/lead%3Ac1?tab=activity"')
    expect(html).not.toContain("결과 기록")
  })

  it("메타 광고 밴드 — Compass 없는 메타 리드는 고객 360 상세로, Compass 매칭은 새 탭 그대로", async () => {
    const data = makeData([makeRow("lead:a")], {
      meta: {
        total: 2,
        today: 1,
        top: [
          { key: "lead:m1", title: "메타학원1", dueAt: null, href: "/admin/crm/customers/leads?lead=m1", compass: compassRef(5) },
          { key: "lead:m2", title: "메타학원2", dueAt: null, href: "/admin/crm/customers/leads?lead=m2", compass: null },
        ],
      },
    })
    const html = await renderPanel(data)
    expect(html).toContain('href="https://mkt.classin.co.kr/leads/5"')
    expect(html).toContain('href="/admin/crm/customers/lead%3Am2?tab=activity"')
    expect(html).not.toContain("/admin/crm/customers/leads?lead=m2")
  })

  it("소스 계약 — 담당 전체는 owner= 를 URL 에 남기고(지우면 다음 착지가 내 담당), 기본값은 내 담당", () => {
    const panelSource = readFileSync(join(process.cwd(), "components/admin/crm/home/CrmTodayContactsPanel.tsx"), "utf8")
    const setOwner = panelSource.slice(panelSource.indexOf("const setOwner = useCallback("), panelSource.indexOf("// scope = 담당 범위"))
    expect(setOwner).toMatch(/params\.set\("owner", next\)/)
    expect(setOwner).not.toMatch(/params\.delete\("owner"\)/)
    expect(panelSource).toMatch(/searchParams\.get\("owner"\)\?\.trim\(\) \?\? CURRENT_OWNER_VALUE/)
    expect(panelSource).toMatch(/initialOwner === CURRENT_OWNER_VALUE && initialData != null/)
    // 홈은 드로어를 쓰지 않는다 — 고객 링크는 행이 직접 단다.
    const home = readFileSync(join(process.cwd(), "components/admin/crm/home/CrmHomeClient.tsx"), "utf8")
    expect(home).not.toMatch(/\bonOpenCustomer=/)
    expect(home).not.toMatch(/\bsetDrawerTarget\b/)
  })

  it("기본 담당 쿼리(?owner=__me)를 단 홈 URL 에 새로고침을 '?force=1'로 덧붙이지 않는다(owner 값이 깨진다)", () => {
    const home = readFileSync(join(process.cwd(), "components/admin/crm/home/CrmHomeClient.tsx"), "utf8")
    const band = readFileSync(join(process.cwd(), "components/admin/compass/CompassPipelineBand.tsx"), "utf8")
    expect(home).toContain('const CRM_ACTION_KPIS_URL = "/api/admin/crm/action-kpis?owner=__me"')
    expect(home).not.toMatch(/\$\{CRM_[A-Z_]+_URL\}\?force=1/)
    expect(home).toMatch(/withForceParam\(CRM_ACTION_KPIS_URL\)/)
    expect(home).toMatch(/withForceParam\(CRM_COMPASS_PIPELINE_URL\)/)
    expect(band).toContain('export const COMPASS_PIPELINE_URL = "/api/admin/crm/compass-pipeline?owner=__me"')
    expect(band).not.toMatch(/\$\{COMPASS_PIPELINE_URL\}\?force=1/)
  })
})

describe("소스 계약", () => {
  const panel = readFileSync(join(process.cwd(), "components/admin/crm/home/CrmTodayContactsPanel.tsx"), "utf8")
  const rowSource = readFileSync(join(process.cwd(), "components/admin/crm/home/TodayContactRow.tsx"), "utf8")

  it("결과 저장은 outcome 라우트 POST, 되돌리기는 같은 라우트 DELETE, 할 일은 기존 PATCH", () => {
    expect(panel).toContain("TODAY_CONTACTS_OUTCOME_API_PATH")
    expect(panel).toMatch(/method: "POST"/)
    expect(panel).toMatch(/method: "DELETE"/)
    expect(panel).toContain("/api/admin/crm/tasks/${encodeURIComponent(id)}")
  })

  it("리드 되돌리기는 저장 응답으로 previousFollowUpAt 을 정한다(요청 전 행 추정 금지)", () => {
    expect(panel).toContain("resolveLeadUndoFollowUpAt(row, request, response)")
    expect(panel).not.toMatch(/const previousFollowUpAt =\s*request\.target\.type === "lead"/)
  })

  it("저장 순간의 실제 시각으로 '날짜' 다음 일정을 다시 검사한다(폼은 응답 기준 시각으로 그려진다)", () => {
    expect(panel).toMatch(/outcomeDateProblem\(current, nowMs\) === "past"/)
  })

  it("잘린 목록은 최대 상한으로 다시 받고, 홈에 할 일 포괄 여부를 알린다", () => {
    expect(panel).toContain("todayContactsUrl(owner, TODAY_CONTACTS_MAX_LIMIT)")
    expect(panel).toContain("onCoverageChange(coversTasks)")
    // 포괄 판정은 오버레이를 덧씌운 목록 기준(이 목록에서 Compass 행의 할 일을 닫으면 다시 숨긴다)
    expect(panel).toContain("const coversTasks = todayContactsCoverTasks(view, owner)")
    expect(panel).toContain("onCompassCoverageChange(coversCompassActions)")
    const home = readFileSync(join(process.cwd(), "components/admin/crm/home/CrmHomeClient.tsx"), "utf8")
    expect(home).toContain("onCoverageChange={setTodayCoversTasks}")
    expect(home).toContain("hideBuckets={todayCoversTasks ? HOME_WEEK_AHEAD_HIDDEN_BUCKETS : undefined}")
  })

  it("배너 '다시 시도'는 같은 requestId 로 다시 보낸다(응답 유실 시 서버 멱등으로 중복 기록 방지)", () => {
    expect(panel).toContain("retry: () => saveOutcome(row, current, requestId)")
    expect(panel).toContain("retry: () => snoozeRow(row, requestId)")
  })

  it("Compass 행 주 행동은 CompassOpenLink primary — 교차 쓰기 경로(Compass API)를 부르지 않는다", () => {
    expect(rowSource).toContain('variant="primary"')
    expect(rowSource).toContain('from "@/components/admin/compass/CompassOpenLink"')
    expect(panel).not.toMatch(/mkt\.classin\.co\.kr\/api/)
  })

  it("렌더 중 Date.now() 를 부르지 않는다(표기 기준은 응답 generatedAt)", () => {
    // 이벤트 핸들러·load 안의 Date.now() 는 허용 — 렌더 경로의 useMemo 는 basisMs 로만 계산한다.
    const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    const basisMemo = panel.slice(panel.indexOf("const basisMs = useMemo"), panel.indexOf("const keepKeys = useMemo"))
    expect(basisMemo).not.toContain("Date.now()")
    expect(stripComments(rowSource)).not.toContain("Date.now()")
  })
})
