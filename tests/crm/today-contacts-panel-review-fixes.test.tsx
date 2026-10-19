import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Suspense } from "react"
import { prerenderToNodeStream } from "react-dom/static"
import { beforeEach, describe, expect, it, vi } from "vitest"

// 교차 리뷰 후속(P-panel, 2026-09-26) — 강등 응답 캐시(P1-22)·불러오지 않은 건수(P2-20)·재전송 경고 이중 표기(P3)·
// 되돌리기 409(P4-7). jsdom 없이 순수 함수 + prerender + 소스 계약으로 지킨다(tests/crm/today-contacts-panel.test.tsx 와
// 같은 모킹).
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/crm",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
const client = vi.hoisted(() => ({
  adminFetch: vi.fn(async () => new Response(null, { status: 204 })),
  adminFetchJsonCached: vi.fn(async () => null),
  adminFetchJson: vi.fn(async () => null),
  clearAdminRequestCache: vi.fn(),
  getCachedAdminJson: vi.fn(() => null),
  seedAdminRequestCache: vi.fn(),
}))
vi.mock("@/lib/admin-client", () => client)
vi.mock("@/components/admin/crm/useCrmOwners", () => ({
  useCrmOwners: () => ({ owners: [], currentOwner: null, health: null }),
  buildOwnerSelectOptions: () => [],
}))

import CrmTodayContactsPanel, {
  TODAY_CONTACT_DUPLICATE_EDIT_WARNING,
  applyTodayContactOverlays,
  dropDegradedTodayContacts,
  isTodayContactContentMismatchWarning,
  readTodayContactUndoFailure,
  shouldSeedTodayContacts,
  todayContactSaveWarnings,
  todayContactsRowTotals,
  type TodayContactOverlay,
} from "@/components/admin/crm/home/CrmTodayContactsPanel"
import type { CrmTodayContacts, TodayContactReason, TodayContactRow } from "@/lib/crm/today-contact-types"
import { isTodayContactsCacheable } from "@/lib/crm/today-contacts-request"

const NOW = Date.parse("2026-09-25T03:00:00.000Z") // 2026-09-25(금) 12:00 KST
const URL_ALL = "/api/admin/crm/home/today-contacts?limit=60&v=1"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")
const panel = read("components/admin/crm/home/CrmTodayContactsPanel.tsx")

function reason(overrides: Partial<TodayContactReason> = {}): TodayContactReason {
  return { kind: "task", label: "할 일", detail: null, dueAt: null, overdue: false, sourceRef: "task:1", ...overrides }
}

function makeRow(key: string): TodayContactRow {
  const id = key.split(":")[1]
  return {
    key,
    entityType: "lead",
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
  }
}

function makeData(rows: TodayContactRow[], overrides: Partial<CrmTodayContacts> = {}): CrmTodayContacts {
  return {
    generatedAt: "2026-09-25T03:00:00.000Z",
    dateKey: "2026-09-25",
    progress: {
      total: rows.length,
      handled: 0,
      remaining: rows.length,
      overdue: 0,
      byLane: {
        new_response: { total: rows.length, handled: 0 },
        money: { total: 0, handled: 0 },
        reengage: { total: 0, handled: 0 },
      },
      compassHandledToday: 0,
      approximate: true,
    },
    counts: {
      bySource: {
        first_response: 0,
        follow_up: 0,
        task: rows.length,
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
    truncated: { rows: false, limit: 60 },
    ...overrides,
  }
}

async function renderPanel(data: CrmTodayContacts) {
  const { prelude } = await prerenderToNodeStream(
    <Suspense fallback={<p>loading</p>}>
      <CrmTodayContactsPanel initialData={{ promise: Promise.resolve(data), generatedAt: NOW }} />
    </Suspense>
  )
  let html = ""
  for await (const chunk of prelude) html += chunk.toString()
  return html.replace(/<!-- -->/g, "")
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── P1-22 강등 응답을 화면 캐시에 남기지 않는다 ─────────────────────────────

describe("강등 응답(Home 필수 원천 일부 실패)은 요청 캐시에 심지도 남기지도 않는다(P1-22)", () => {
  const healthy = makeData([makeRow("lead:a")])
  const degraded: Array<[string, CrmTodayContacts]> = [
    ["리드 실패(leadsOk=false)", makeData([], { sources: { ...healthy.sources, leadsOk: false } })],
    ["NEO 계정 실패", makeData([], { sources: { ...healthy.sources, neoAccountsOk: false } })],
    ["할 일 실패", makeData([], { sources: { ...healthy.sources, tasksOk: false } })],
    ["Home 연락 실패", makeData([makeRow("lead:a")], { sources: { ...healthy.sources, homeContactsOk: false } })],
  ]

  it("정상 응답은 지우지 않고 그대로 돌려준다 — Compass 끊김은 강등이 아니다(메타로만 알리는 외부 원천)", () => {
    const clear = vi.fn()
    expect(dropDegradedTodayContacts(URL_ALL, healthy, clear)).toBe(healthy)
    const compassDown = makeData([makeRow("lead:a")], { sources: { ...healthy.sources, compass: "down" } })
    expect(dropDegradedTodayContacts(URL_ALL, compassDown, clear)).toBe(compassDown)
    expect(dropDegradedTodayContacts(URL_ALL, null, clear)).toBeNull()
    expect(dropDegradedTodayContacts(URL_ALL, undefined, clear)).toBeUndefined()
    expect(clear).not.toHaveBeenCalled()
  })

  it.each(degraded)("%s 응답은 화면에 그대로 돌려주되 그 캐시 키를 지운다", (_label, data) => {
    const clear = vi.fn()
    expect(isTodayContactsCacheable(data)).toBe(false)
    expect(dropDegradedTodayContacts(URL_ALL, data, clear)).toBe(data)
    expect(clear).toHaveBeenCalledTimes(1)
    expect(clear).toHaveBeenCalledWith(URL_ALL)
  })

  it("기본 삭제 함수는 요청 캐시 무효화(clearAdminRequestCache)다", () => {
    dropDegradedTodayContacts(URL_ALL, degraded[0][1])
    expect(client.clearAdminRequestCache).toHaveBeenCalledWith(URL_ALL)
    client.clearAdminRequestCache.mockClear()
    dropDegradedTodayContacts(URL_ALL, healthy)
    expect(client.clearAdminRequestCache).not.toHaveBeenCalled()
  })

  it("첫 마운트 시드는 강등이 아닌 프리페치 값만", () => {
    expect(shouldSeedTodayContacts(healthy)).toBe(true)
    for (const [, data] of degraded) expect(shouldSeedTodayContacts(data)).toBe(false)
    expect(shouldSeedTodayContacts(null)).toBe(false)
    expect(shouldSeedTodayContacts(undefined)).toBe(false)
  })

  it("강등 프리페치도 화면에는 그대로 보인다(시드만 하지 않는다)", async () => {
    const data = makeData([makeRow("lead:a")], { sources: { ...healthy.sources, leadsOk: false, warnings: ["리드를 불러오지 못했습니다."] } })
    const html = await renderPanel(data)
    expect(html).toContain("학원 a")
    expect(html).toContain("리드를 불러오지 못했습니다.")
    // prerender 는 effect 를 돌리지 않는다 — 렌더 경로에서 캐시를 건드리지 않는다
    expect(client.seedAdminRequestCache).not.toHaveBeenCalled()
  })

  it("소스 계약 — 시드는 판정 뒤에만, 받은 값·백그라운드 갱신 값·캐시에서 읽은 값 모두 강등이면 지운다", () => {
    expect(panel).toContain("if (!forced && shouldSeedTodayContacts(prefetchSeed)) {")
    expect(panel).not.toContain("if (!forced && prefetchSeed) {")
    // 시드 호출은 한 곳(판정 블록 안)뿐
    expect(panel.match(/seedAdminRequestCache\(/g)?.length).toBe(1)
    expect(panel).toContain("dropDegradedTodayContacts(url, getCachedAdminJson<CrmTodayContacts>(url, { cacheKey: url }))")
    expect(panel).toContain("dropDegradedTodayContacts(url, fresh)")
    // 최신 요청이 아니어도(캐시 쓰기는 이미 일어났다) 지운다 — isLatest 확인보다 앞
    const fetchAt = panel.indexOf("const next = await adminFetchJsonCached<CrmTodayContacts>(")
    const dropNext = panel.indexOf("dropDegradedTodayContacts(url, next)")
    const latestCheck = panel.indexOf("if (!isLatest()) return", fetchAt)
    expect(fetchAt).toBeGreaterThan(-1)
    expect(dropNext).toBeGreaterThan(fetchAt)
    expect(dropNext).toBeLessThan(latestCheck)
    // 캐시 키는 조회 URL(force 쿼리 없는 값) — adminFetchJsonCached 의 cacheKey 와 같다
    expect(panel).toContain("cacheKey: url,")
  })

  it("소스 계약 — 서버 프리페치는 아무것도 시드·캐시하지 않고 값을 그대로 넘긴다(판정은 패널)", () => {
    const prefetch = read("lib/admin/crm/today-contacts-prefetch.ts")
    expect(prefetch).not.toContain("seedAdminRequestCache")
    // 기본 담당 = 로그인 사용자(10월 줄기 3f5f0a21) — 프리페치도 패널 기본 호출(내 담당)과 같은 범위로 푼다.
    expect(prefetch).toMatch(
      /openPrefetchLane\(async \(\) =>\s*getCrmTodayContacts\(\{ limit: TODAY_CONTACTS_LIMIT, owner: null, ownerKeys: \(await currentDataOwner\(admin\)\)\.keys \}\)/
    )
    expect(prefetch).not.toContain("getCrmTodayContacts({ limit: TODAY_CONTACTS_LIMIT, owner: null })")
    // 라우트(no-store)와 화면(캐시 삭제)이 같은 판정을 쓴다
    const route = read("app/api/admin/crm/home/today-contacts/route.ts")
    expect(route).toContain("isTodayContactsCacheable(data)")
  })
})

// ─── P2-20 불러오지 않은 N건 = 자르기 전 행 수 − 받은 행 ───────────────────────

describe("잘린 목록의 전체·불러오지 않은 행 수는 truncated.totalRows 가 정본(P2-20)", () => {
  it("잘리지 않았으면 보이는 행이 전체, 안 받은 행 0", () => {
    expect(todayContactsRowTotals({ truncated: { rows: false, totalRows: 40 }, progressTotal: 55, shownRows: 12 })).toEqual({
      total: 12,
      unloaded: 0,
    })
    expect(todayContactsRowTotals({ truncated: null, progressTotal: 0, shownRows: 0 })).toEqual({ total: 0, unloaded: 0 })
  })

  it("잘렸으면 totalRows − 보이는 행 — progress.total(같은 기관으로 접은 리드까지 센 대상 수)로 부풀리지 않는다", () => {
    expect(todayContactsRowTotals({ truncated: { rows: true, totalRows: 40 }, progressTotal: 55, shownRows: 12 })).toEqual({
      total: 40,
      unloaded: 28,
    })
  })

  it("낙관 오버레이가 되살린 행은 totalRows 에 이미 들어 있다 — 두 번 세지 않는다", () => {
    // 받은 12행 + 되살린 1행(서버가 처리됨으로 목록 끝, 상한 밖으로 보낸 행 — totalRows 40 안에 있다)
    expect(todayContactsRowTotals({ truncated: { rows: true, totalRows: 40 }, progressTotal: 56, shownRows: 13 })).toEqual({
      total: 40,
      unloaded: 27,
    })
  })

  it("검증 재현 — 받은 3행 + 되살린 1행, totalRows 4 → 전체 4 · 안 받은 0(예전: 5 · 1)", () => {
    const received = [makeRow("lead:a"), makeRow("lead:b"), makeRow("lead:c")]
    const handled = makeRow("lead:x")
    const data = makeData(received, { truncated: { rows: true, limit: 3, totalRows: 4 } })
    const overlays = new Map<string, TodayContactOverlay>([
      [
        handled.key,
        {
          scope: "s",
          row: handled,
          index: 1,
          handled: {
            kind: "contact_logged",
            source: "home",
            at: "2026-09-25T02:00:00.000Z",
            by: "이서연",
            nextAt: null,
            approximate: false,
          },
          summary: null,
          until: Number.MAX_SAFE_INTEGER,
        },
      ],
    ])
    const view = applyTodayContactOverlays(data, overlays, "s")
    expect(view?.rows.map((row) => row.key)).toEqual(["lead:a", "lead:x", "lead:b", "lead:c"])
    expect(
      todayContactsRowTotals({ truncated: view?.truncated, progressTotal: view?.progress.total ?? 0, shownRows: view?.rows.length ?? 0 })
    ).toEqual({ total: 4, unloaded: 0 })
  })

  it("totalRows 가 보이는 행보다 작아도(경합·서버가 행을 뺌) 음수가 되지 않는다", () => {
    expect(todayContactsRowTotals({ truncated: { rows: true, totalRows: 10 }, progressTotal: 30, shownRows: 12 })).toEqual({
      total: 12,
      unloaded: 0,
    })
  })

  it("옛 응답(totalRows 없음)은 지금 공식 — max(progress.total, 보이는 행)", () => {
    expect(todayContactsRowTotals({ truncated: { rows: true }, progressTotal: 20, shownRows: 12 })).toEqual({ total: 20, unloaded: 8 })
    expect(todayContactsRowTotals({ truncated: { rows: true }, progressTotal: 5, shownRows: 12 })).toEqual({ total: 12, unloaded: 0 })
  })

  it("prerender — '전체 원천'·'더 보기'·'오늘 전체'가 totalRows 기준", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => makeRow(`lead:r${i}`))
    const data = makeData(rows, { truncated: { rows: true, limit: 12, totalRows: 15 } })
    // 같은 기관으로 접은 리드까지 센 대상 수 — 행 수보다 크다
    data.progress.total = 20
    data.progress.remaining = 20
    const html = await renderPanel(data)
    expect(html).toMatch(/전체 원천 <span class="tabular-nums">15<\/span>/)
    // 받은 12행 중 접은 2 + 안 받은 3(20 − 12 = 8 이 아니다)
    expect(html).toContain("남은 5건 더 보기")
    expect(html).toContain("상위 12건까지만 불러왔습니다(오늘 전체 15건)")
    expect(html).not.toContain("남은 10건 더 보기")
  })

  it("소스 계약 — 세 표기(칩·더 보기·오늘 전체)가 같은 계산을 쓴다", () => {
    expect(panel).toContain("const rowTotals = todayContactsRowTotals({")
    expect(panel).toContain("const serverTotal = view ? rowTotals.total : 0")
    expect(panel).toContain("const unloadedCount = rowTotals.unloaded")
    expect(panel).not.toMatch(/Math\.max\(view\.progress\.total, allRows\.length\)/)
    // 오버레이 전 받은 행 수로 빼면 되살린 행을 두 번 센다 — 보이는 행(오버레이 포함)만 넘긴다
    expect(panel).not.toContain("receivedRows")
    expect(panel).toMatch(/const rowTotals = todayContactsRowTotals\(\{[^}]*shownRows: allRows\.length,\s*\}\)/)
  })
})

// ─── P3 재전송 경고 한 번만 ────────────────────────────────────────────────

describe("재전송 내용 불일치 경고는 한 번만 — 서버 문구가 있으면 그것만 접두어 없이(P3)", () => {
  // 서버 문구(lib/crm/account-contact-record.ts todayContactContentMismatchWarning)를 소스에서 그대로 읽어 만든다 —
  // 서버 문구가 바뀌어 판정이 어긋나면 여기서 깨진다.
  const recordSource = read("lib/crm/account-contact-record.ts")
  const template = /export function todayContactContentMismatchWarning\(storedTitle: string, skipped: string\): string \{\s*return `([^`]+)`/.exec(
    recordSource
  )?.[1]
  const serverMismatch = (storedTitle: string, skipped: string) =>
    (template ?? "").replace("${storedTitle}", storedTitle).replace("${skipped}", skipped)

  it("서버 불일치 경고 문구를 알아본다(서버 문구·'수정한 … 저장되지 않았' 계열)", () => {
    expect(template).toBeTruthy()
    expect(isTodayContactContentMismatchWarning(serverMismatch("전화 · 부재", "할 일 닫기"))).toBe(true)
    expect(isTodayContactContentMismatchWarning("수정한 내용은 저장되지 않았습니다.")).toBe(true)
    expect(isTodayContactContentMismatchWarning("할 일 2건을 닫지 못했습니다.")).toBe(false)
    expect(isTodayContactContentMismatchWarning("다른 사람이 남긴 같은 요청의 기록이라 이어서 처리하지 않았습니다.")).toBe(false)
  })

  it("서버 불일치 경고가 있으면 그 문구만 — 화면 자체 경고와 '저장했지만 일부 단계를 건너뜀' 접두어를 붙이지 않는다", () => {
    const mismatch = serverMismatch("전화 · 부재", "팔로업 이동·할 일 닫기")
    const warnings = todayContactSaveWarnings({ contentChanged: true, duplicate: true, serverWarnings: [mismatch] })
    expect(warnings).toEqual([mismatch])
    expect(warnings.join(" ")).toContain("'전화 · 부재'")
    expect(warnings.join(" ")).not.toContain(TODAY_CONTACT_DUPLICATE_EDIT_WARNING)
    expect(warnings.join(" ")).not.toContain("일부 단계가 빠졌습니다")
  })

  it("서버 경고가 없으면(옛 서버·서버가 비교하지 않는 칸) 화면이 알아챈 경고를 쓴다", () => {
    expect(todayContactSaveWarnings({ contentChanged: true, duplicate: true, serverWarnings: [] })).toEqual([
      TODAY_CONTACT_DUPLICATE_EDIT_WARNING,
    ])
    expect(todayContactSaveWarnings({ contentChanged: true, duplicate: false })).toEqual([])
    expect(todayContactSaveWarnings({ contentChanged: false, duplicate: true, serverWarnings: null })).toEqual([])
  })

  it("다른 서버 경고는 접두어 뒤에 묶고, 불일치 경고는 앞에 한 번만(중복 제거)", () => {
    const mismatch = serverMismatch("문자", "이 행의 할 일 닫기")
    const warnings = todayContactSaveWarnings({
      contentChanged: true,
      duplicate: true,
      serverWarnings: [mismatch, "할 일 1건을 닫지 못했습니다.", mismatch, "  "],
    })
    expect(warnings).toEqual([mismatch, "기록은 저장했지만 일부 단계가 빠졌습니다 — 할 일 1건을 닫지 못했습니다."])
    expect(todayContactSaveWarnings({ contentChanged: false, duplicate: false, serverWarnings: ["팔로업 일정을 바꾸지 못했습니다."] })).toEqual([
      "기록은 저장했지만 일부 단계가 빠졌습니다 — 팔로업 일정을 바꾸지 못했습니다.",
    ])
  })

  it("소스 계약 — 저장 성공 경고는 todayContactSaveWarnings 한 곳에서 만든다", () => {
    expect(panel).toContain("const warnings = todayContactSaveWarnings({")
    expect(panel).not.toMatch(/if \(response\.warnings\?\.length\) warnings\.push/)
  })
})

// ─── P4-7 되돌리기 409 ──────────────────────────────────────────────────────

describe("되돌리기 409(서버 거절)는 '다시 시도' 없이 서버 안내만(P4-7)", () => {
  it("409 — 서버 문구, 다시 시도 없음", () => {
    expect(readTodayContactUndoFailure(409, { error: "되돌릴 수 있는 시간(10분)이 지나 되돌리지 않았습니다." })).toEqual({
      message: "되돌릴 수 있는 시간(10분)이 지나 되돌리지 않았습니다.",
      retryable: false,
    })
    expect(readTodayContactUndoFailure(409, { error: "다른 사람이 남긴 연락 기록이라 되돌리지 않았습니다." }).retryable).toBe(false)
    // 본문이 없어도 거절은 거절이다
    expect(readTodayContactUndoFailure(409, null, "Conflict")).toEqual({ message: "이 저장은 되돌릴 수 없습니다.", retryable: false })
  })

  it("그 밖의 실패는 지금처럼 다시 시도할 수 있다(서버 문구 → 상태 코드 순)", () => {
    expect(readTodayContactUndoFailure(500, { error: "Failed to undo today contact outcome" })).toEqual({
      message: "Failed to undo today contact outcome",
      retryable: true,
    })
    expect(readTodayContactUndoFailure(503, null, "Service Unavailable")).toEqual({ message: "503 Service Unavailable", retryable: true })
    expect(readTodayContactUndoFailure(400, { message: "requestId 가 필요합니다" })).toEqual({
      message: "requestId 가 필요합니다",
      retryable: true,
    })
  })

  it("소스 계약 — DELETE 는 상태 코드를 읽고, 409 는 되돌리기 버튼을 거두고 retry 없는 오류만", () => {
    const undo = panel.slice(panel.indexOf("const undoOutcome = useCallback("), panel.indexOf("const submitOutcome = useCallback("))
    expect(undo).toContain("await adminFetch(TODAY_CONTACTS_OUTCOME_API_PATH, {")
    expect(undo).toContain('method: "DELETE"')
    expect(undo).toContain("readTodayContactUndoFailure(httpResponse.status, payload, httpResponse.statusText)")
    const refused = undo.slice(undo.indexOf("if (!failure.retryable) {"), undo.indexOf("throw new Error(failure.message)"))
    expect(refused).toContain("clearUndo()")
    expect(refused).toContain("setError({ message })")
    expect(refused).not.toContain("retry:")
    // 포커스된 되돌리기 버튼이 사라지므로 성공 경로처럼 행(없으면 heading)으로 포커스를 옮긴다 — body 로 떨어지지 않게
    expect(refused).toMatch(/clearUndo\(\)[\s\S]*announce\(message\)\s*\n[\s\S]*requestFocus\(row\.key\)\s*\n\s*return/)
    // 다시 시도할 수 있는 실패는 그대로 '다시 시도'
    expect(undo).toContain("setError({ message, retry: () => void undoOutcome(row, request, response, previousFollowUpAt) })")
  })

  it("서버 계약 — 되돌리기 거절은 409 로 온다 · 할 일 PATCH(할 일 되돌리기)에는 409 가 없어 같은 규칙이 필요 없다", () => {
    const record = read("lib/crm/account-contact-record.ts")
    expect(record).toMatch(/const refuse = \(error: string\)[\s\S]{0,160}status: 409/)
    const taskRoute = read("app/api/admin/crm/tasks/[id]/route.ts")
    expect(taskRoute).not.toMatch(/status: 409/)
  })
})
