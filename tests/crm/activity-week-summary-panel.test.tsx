/**
 * 기록 화면 이번 주 요약 패널(A5) + 기록 화면 캐시 TTL SSOT(P2) 계약.
 *  - View 렌더: 건수 텍스트(단위 포함), 위험 0 흐림, 미연결 버튼, 미완 액션 목록의 로딩/실패/성공 분기.
 *  - loadWeekOpenTasks: URL·캐시 옵션(SSOT 상수)·성공/실패를 예외 없이 상태로 돌려주는지.
 *  - CrmActivityClient: 로컬 TTL 상수를 더 갖지 않고 client-cache SSOT + FreshnessCaption 을 쓴다.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  adminFetchJsonCached: vi.fn(),
}))

vi.mock("@/lib/admin-client", () => ({
  adminFetchJsonCached: mocks.adminFetchJsonCached,
  adminFetchJsonCachedWithMeta: vi.fn(async () => ({ data: null, stale: false, staleSince: null })),
  getCachedAdminJson: vi.fn(() => null),
  adminFetch: vi.fn(),
}))

import {
  ActivityWeekSummaryView,
  WEEK_TASKS_LIMIT,
  loadWeekOpenTasks,
  taskDueBadge,
  weekOpenTasksUrl,
} from "@/components/admin/crm/activity/ActivityWeekSummary"
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import { summarizeActivityWeek } from "@/lib/crm/activity-week-summary"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import type { CrmTaskRecord, ListCrmTasksResult } from "@/lib/repositories/crm-tasks"

// 2026-09-16 12:00 KST (수)
const NOW_MS = Date.parse("2026-09-16T03:00:00.000Z")

function makeTask(overrides: Partial<CrmTaskRecord> = {}): CrmTaskRecord {
  return {
    id: overrides.id ?? "t1",
    targetType: "neo_account",
    targetId: "acc-1",
    targetLabel: "테스트 학원",
    ownerKey: "owner-a",
    ownerNameSnapshot: "김지사",
    taskType: "call",
    title: "견적 회신 확인",
    detail: null,
    dueAt: "2026-09-18T01:00:00.000Z", // 금 10:00 KST → D-2
    snoozedUntil: null,
    priority: "normal",
    status: "open",
    sourceEventId: null,
    createdBy: "김지사",
    assignedBy: "김지사",
    completedAt: null,
    completedBy: null,
    outcome: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  }
}

function makeTasksResponse(rows: CrmTaskRecord[], overrides: Partial<ListCrmTasksResult> = {}): ListCrmTasksResult {
  return {
    generatedAt: "2026-09-16T03:00:00.000Z",
    health: { ok: true, message: null },
    summary: { total: rows.length, returned: rows.length, open: rows.length, overdue: 0, dueToday: 0, snoozed: 0, done: 0 },
    pagination: { limit: 8, offset: 0, returned: rows.length, total: rows.length, hasMore: false, nextOffset: null },
    rows,
    ...overrides,
  }
}

const SUMMARY = summarizeActivityWeek(
  [
    { occurredAt: "2026-09-15T01:00:00.000Z", sourceType: "call", sentiment: "neutral", targetType: "neo_account", targetId: "a" },
    { occurredAt: "2026-09-15T02:00:00.000Z", sourceType: "call", sentiment: "risk", targetType: "neo_account", targetId: "a" },
    { occurredAt: "2026-09-15T03:00:00.000Z", sourceType: "meeting_minutes", sentiment: "neutral", targetType: "unknown", targetId: null },
    { occurredAt: "2026-09-15T04:00:00.000Z", sourceType: "manual_note", sentiment: "neutral", targetType: "lead", targetId: "l" },
    { occurredAt: "2026-09-15T05:00:00.000Z", sourceType: "sms", sentiment: "neutral", targetType: "unknown", targetId: null },
  ],
  { nowMs: NOW_MS, weekStartsOn: 1 }
)

describe("ActivityWeekSummaryView", () => {
  it("이번 주 건수·콜/회의·위험·미연결을 단위와 함께 그리고, 미연결은 필터 버튼이다", () => {
    const html = renderToStaticMarkup(
      <ActivityWeekSummaryView
        summary={SUMMARY}
        tasks={{ status: "ready", rows: [], total: 0 }}
        nowMs={NOW_MS}
        onFilterUnlinked={() => undefined}
        unlinkedFilterActive={false}
      />
    )
    expect(html).toContain("이번 주 요약")
    expect(html).toContain("9/14–9/20")
    expect(html).toContain("이번 주 기록")
    expect(html).toContain(">5건<")
    expect(html).toContain("콜 · 회의")
    expect(html).toContain("2건")
    expect(html).toContain("1건")
    expect(html).toContain('data-risk="some"')
    expect(html).toContain(STATUS_TONE_TEXT_CLASS.danger)
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>2건<\/button>/)
    expect(html).toContain("tabular-nums")
    expect(html).toContain("이번 주 마감인 미완 액션이 없습니다.")
    expect(html).toContain("현재 필터 · 불러온 목록 기준")
  })

  it("위험 신호 0 이면 흐리게(danger 색 없음), 목록이 부분이면 캡션에 (더 있음)", () => {
    const zeroRisk = summarizeActivityWeek([], { nowMs: NOW_MS })
    const html = renderToStaticMarkup(
      <ActivityWeekSummaryView summary={zeroRisk} partial tasks={{ status: "ready", rows: [], total: 0 }} nowMs={NOW_MS} />
    )
    expect(html).toContain('data-risk="none"')
    expect(html).not.toContain(STATUS_TONE_TEXT_CLASS.danger)
    expect(html).toContain("(더 있음)")
    // onFilterUnlinked 없으면 버튼 대신 숫자만
    expect(html).not.toContain("aria-pressed")
  })

  it("요약 null(목록 로딩 전)·할 일 로딩은 #F0F0EC 스켈레톤", () => {
    const html = renderToStaticMarkup(<ActivityWeekSummaryView summary={null} tasks={{ status: "loading" }} nowMs={NOW_MS} />)
    expect(html).toContain('data-testid="week-tasks-skeleton"')
    expect(html).toContain("bg-[#f0f0ec]")
    expect(html).toContain("animate-pulse")
    expect(html).not.toContain("이번 주 기록")
  })

  it("할 일 실패는 인라인 캡션 + 재시도 버튼만 — 건수 타일은 그대로 그린다", () => {
    const html = renderToStaticMarkup(
      <ActivityWeekSummaryView
        summary={SUMMARY}
        tasks={{ status: "error", message: "서버 오류" }}
        nowMs={NOW_MS}
        onRetryTasks={() => undefined}
      />
    )
    expect(html).toContain("다음 액션을 불러오지 못했습니다.")
    expect(html).toContain("서버 오류")
    expect(html).toContain("다시 시도")
    expect(html).toContain('role="status"')
    expect(html).toContain("이번 주 기록")
    expect(html).toContain(">5건<")
  })

  it("할 일 성공은 제목·대상·D-N·담당을 버튼 행으로(링크 없음) 최대 8건", () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      makeTask({ id: `t${index}`, title: `할 일 ${index}`, dueAt: index === 0 ? "2026-09-14T01:00:00.000Z" : undefined })
    )
    rows[1] = makeTask({ id: "t1", title: "오늘 마감", dueAt: "2026-09-16T08:00:00.000Z", ownerNameSnapshot: null, targetLabel: null, targetId: null })
    const html = renderToStaticMarkup(
      <ActivityWeekSummaryView
        summary={SUMMARY}
        tasks={{ status: "ready", rows: rows.slice(0, WEEK_TASKS_LIMIT), total: 10 }}
        nowMs={NOW_MS}
        onOpenTask={() => undefined}
      />
    )
    expect(html).toContain("이번 주 마감 10건")
    expect(html).toContain("할 일 0")
    expect(html).toContain("할 일 7")
    expect(html).not.toContain("할 일 8")
    expect(html).toContain("테스트 학원")
    expect(html).toContain("김지사")
    expect(html).toContain("D+2") // 9/14 마감 → 지남
    expect(html).toContain("D-DAY")
    expect(html).toContain("담당 미지정")
    expect(html).toContain(">미연결<")
    expect(html).not.toContain("<a ")
    expect((html.match(/<li>/g) ?? []).length).toBe(8)
    expect((html.match(/<li><button/g) ?? []).length).toBe(8)
  })

  it("taskDueBadge — 지남 danger · 오늘 warning · 미래/없음 neutral", () => {
    expect(taskDueBadge({ dueAt: "2026-09-14T01:00:00.000Z" }, NOW_MS)).toEqual({ text: "D+2", tone: "danger" })
    expect(taskDueBadge({ dueAt: "2026-09-16T08:00:00.000Z" }, NOW_MS)).toEqual({ text: "D-DAY", tone: "warning" })
    expect(taskDueBadge({ dueAt: "2026-09-18T01:00:00.000Z" }, NOW_MS)).toEqual({ text: "D-2", tone: "neutral" })
    expect(taskDueBadge({ dueAt: null }, NOW_MS)).toEqual({ text: "기한 없음", tone: "neutral" })
  })
})

describe("loadWeekOpenTasks", () => {
  beforeEach(() => {
    mocks.adminFetchJsonCached.mockReset()
  })

  it("URL 은 status=open · limit=8 · dueBefore=이번 주 일요일 23:59:59.999 KST 이고 캐시 창은 SSOT 상수", async () => {
    const url = weekOpenTasksUrl(NOW_MS)
    expect(url).toBe("/api/admin/crm/tasks?status=open&limit=8&dueBefore=2026-09-20T14%3A59%3A59.999Z")

    const fetchJson = vi.fn(async () => makeTasksResponse([makeTask()]))
    const state = await loadWeekOpenTasks(NOW_MS, { fetchJson: fetchJson as never })
    expect(state).toEqual({ status: "ready", rows: [makeTask()], total: 1 })
    expect(fetchJson).toHaveBeenCalledWith(url, undefined, {
      cacheKey: url,
      ttlMs: CRM_CACHE_TTL_MS,
      staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
      force: undefined,
    })
  })

  it("force 는 &force=1 로 네트워크를 강제하되 캐시 키는 그대로", async () => {
    const fetchJson = vi.fn(async () => makeTasksResponse([]))
    await loadWeekOpenTasks(NOW_MS, { force: true, fetchJson: fetchJson as never })
    const [input, , options] = fetchJson.mock.calls[0] as unknown as [string, undefined, { cacheKey: string; force?: boolean }]
    expect(input).toBe(`${weekOpenTasksUrl(NOW_MS)}&force=1`)
    expect(options.cacheKey).toBe(weekOpenTasksUrl(NOW_MS))
    expect(options.force).toBe(true)
  })

  it("성공 응답은 8건으로 자르고 total 은 pagination.total", async () => {
    const rows = Array.from({ length: 12 }, (_, index) => makeTask({ id: `t${index}` }))
    const fetchJson = vi.fn(async () =>
      makeTasksResponse(rows, { pagination: { limit: 8, offset: 0, returned: 12, total: 12, hasMore: true, nextOffset: 8 } })
    )
    const state = await loadWeekOpenTasks(NOW_MS, { fetchJson: fetchJson as never })
    expect(state.status).toBe("ready")
    if (state.status === "ready") {
      expect(state.rows).toHaveLength(WEEK_TASKS_LIMIT)
      expect(state.total).toBe(12)
    }
  })

  it("fetch 실패는 throw 대신 error 상태(메시지 포함)", async () => {
    const fetchJson = vi.fn(async () => {
      throw new Error("네트워크 끊김")
    })
    await expect(loadWeekOpenTasks(NOW_MS, { fetchJson: fetchJson as never })).resolves.toEqual({
      status: "error",
      message: "네트워크 끊김",
    })
  })

  it("health.ok=false 이고 행이 없으면 서버 메시지로 error 상태", async () => {
    const fetchJson = vi.fn(async () =>
      makeTasksResponse([], { health: { ok: false, message: "crm_tasks 마이그레이션 미적용" } })
    )
    await expect(loadWeekOpenTasks(NOW_MS, { fetchJson: fetchJson as never })).resolves.toEqual({
      status: "error",
      message: "crm_tasks 마이그레이션 미적용",
    })
  })

  it("fetchJson 을 안 주면 adminFetchJsonCached 를 쓴다", async () => {
    mocks.adminFetchJsonCached.mockResolvedValueOnce(makeTasksResponse([]))
    const state = await loadWeekOpenTasks(NOW_MS)
    expect(state.status).toBe("ready")
    expect(mocks.adminFetchJsonCached).toHaveBeenCalledTimes(1)
  })
})

describe("CrmActivityClient — 캐시 TTL SSOT(P2) + 요약 패널 배선(A5)", () => {
  const source = readFileSync(path.resolve(__dirname, "../../components/admin/crm/CrmActivityClient.tsx"), "utf8")

  it("로컬 TTL 상수를 갖지 않고 lib/crm/client-cache 상수를 쓴다", () => {
    expect(source).not.toMatch(/const\s+CACHE_TTL_MS\s*=/)
    expect(source).not.toContain("30_000")
    expect(source).toMatch(/from "@\/lib\/crm\/client-cache"/)
    expect(source).toContain("ttlMs: CRM_CACHE_TTL_MS")
    expect(source).toContain("staleWhileRevalidateMs: CRM_CACHE_SWR_MS")
  })

  it("메타 fetch + 신선도 캡션(generatedAt·receivedAt·refreshing·staleReason·onRefresh)을 배선한다", () => {
    expect(source).toContain("adminFetchJsonCachedWithMeta<CrmEventsResponse>")
    expect(source).not.toMatch(/\badminFetchJsonCached</)
    expect(source).toContain("<FreshnessCaption")
    expect(source).toContain("generatedAt={data?.generatedAt")
    expect(source).toContain("receivedAt={receivedAt}")
    expect(source).toContain('staleReason={staleReason}')
    expect(source).toContain("onRevalidated")
    expect(source).toContain("staleIfError: !options?.force")
  })

  it("요약 View 를 데스크톱 우측 카드 + 모바일 details 두 자리에 그리되 할 일 훅은 한 번만 부른다", () => {
    expect((source.match(/useWeekOpenTasks\(/g) ?? []).length).toBe(1)
    expect((source.match(/<ActivityWeekSummaryView/g) ?? []).length).toBe(2)
    expect(source).toContain('frame="plain"')
    expect(source).toContain('frame="card"')
    expect(source).toContain("xl:hidden")
    expect(source).toContain("onFilterUnlinked: handleFilterUnlinked")
    expect(source).toContain("onOpenTask: handleOpenTask")
  })
})
