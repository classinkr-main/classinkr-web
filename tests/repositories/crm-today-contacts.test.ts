/**
 * lib/repositories/crm-today-contacts.ts 원천 조립 배선 계약(현황 "오늘 연락", C안 ①).
 *  - Home 보조 원천(연락 인덱스·오늘 닫힌 할 일)은 unstable_cache 60초 — 태그 = 큐 스냅샷 + 오늘 연락.
 *  - Compass 조회(다음 액션 목록 창·14일 넘은 건수·리드 인덱스·최신 활동)는 Data Cache 밖 — 캐시 적중이어도 매 요청
 *    부르고, 끊김은 sources.compass 로만 알린다.
 *  - 응답에 전화 키·원문 전화를 싣지 않는다.
 *  - 보조 원천 실패는 던지지 않고 homeContactsOk=false 로 선다 — 캐시 함수도 던지지 않고 라벨 붙은 강등을 저장한다
 *    (던지면 Next 가 옛 완성 엔트리를 계속 돌려준다 — 교차 리뷰 [16]).
 *  - 할 일 = 후보 풀(200) + 오늘 대상 할 일 전량(보조 원천) — 잘리거나 못 읽으면 tasksOk=false · 경고([13]).
 *  - Compass 조회 전화 키에 할 일 대상 리드(상태 무관)를 넣는다([24]).
 *  - force 는 후보 풀·보조 원천을 우회하고 오늘 연락 태그를 즉시 만료한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const NOW = new Date("2026-09-25T03:00:00.000Z") // 금 12:00 KST

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(),
  revalidateTag: vi.fn(),
  getPool: vi.fn(),
  loadHomeContactIndex: vi.fn(),
  listClosed: vi.fn(),
  listDueToday: vi.fn(),
  nextActions: vi.fn(),
  leadIndex: vi.fn(),
  latestActivity: vi.fn(),
  cachedAux: null as unknown,
}))

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
  revalidateTag: mocks.revalidateTag,
}))
vi.mock("@/lib/repositories/crm-priority-queue", () => ({ getCrmPriorityCandidatePool: mocks.getPool }))
vi.mock("@/lib/repositories/crm-contact-index", () => ({ loadHomeContactIndex: mocks.loadHomeContactIndex }))
vi.mock("@/lib/repositories/crm-tasks", () => ({
  listCrmTasksClosedSince: mocks.listClosed,
  listCrmTasksDueForToday: mocks.listDueToday,
  toCrmTaskRecord: (row: unknown) => row,
}))
vi.mock("@/lib/compass/bridge", () => ({
  getCompassNextActionsInRange: mocks.nextActions,
  getCompassLeadIndexByPhoneKeys: mocks.leadIndex,
  getCompassLatestActivityByPhoneKeys: mocks.latestActivity,
}))
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }))

function pool(overrides: Record<string, unknown> = {}) {
  return {
    now: NOW,
    leads: [
      {
        id: "L1",
        source: "contact_page",
        org: "가 학원",
        name: "김원장",
        phone: "010-1111-2222",
        timestamp: "2026-09-25T01:00:00.000Z",
        status: "new",
        assigned_to: "김담당",
      },
    ],
    leadsOk: true,
    neoRows: [
      {
        accountId: "N1",
        name: "나 기관",
        ownerId: null,
        ownerName: "박담당",
        phone: "010-3333-4444",
        balance: 10,
        expireAt: "2026-09-27T00:00:00.000Z",
        lastClassAt: "2026-09-20T00:00:00.000Z",
        uid: null,
        orderAmount: 0,
        orderCount: 0,
        createdAt: null,
        updatedAt: null,
      },
    ],
    neoAccountsOk: true,
    neoLatestSyncedAt: "2026-08-28T00:00:00.000Z",
    neoStale: true,
    tasks: [],
    tasksOk: true,
    engagements: null,
    demoIndex: null,
    items: [],
    warnings: [],
    ...overrides,
  }
}

function compassDue(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    academy: "다 학원",
    name: null,
    phone_key: "01055556666",
    stage: "contact",
    owner: "이콤",
    caller: null,
    bd_owner: null,
    care_stage: null,
    next_action_at: "2026-09-25T02:00:00.000Z",
    next_action: "견적 재안내",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: null,
    last_inflow_at: null,
    ...overrides,
  }
}

function listDue() {
  return { rows: [compassDue(9)], down: false, truncated: false }
}

async function loadRepository() {
  vi.resetModules()
  return import("@/lib/repositories/crm-today-contacts")
}

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cachedAux = null
  // unstable_cache 는 "캐시 적중" 흉내 — cachedAux 가 있으면 그 값을, 없으면 원래 함수를 그대로 부른다.
  mocks.unstableCache.mockImplementation((fn: (...args: unknown[]) => Promise<unknown>) =>
    vi.fn(async (...args: unknown[]) => (mocks.cachedAux ? mocks.cachedAux : fn(...args)))
  )
  mocks.getPool.mockResolvedValue(pool())
  mocks.loadHomeContactIndex.mockResolvedValue(new Map())
  mocks.listClosed.mockResolvedValue({ rows: [], health: { ok: true, message: null }, truncated: false })
  mocks.listDueToday.mockResolvedValue({ rows: [], health: { ok: true, message: null }, truncated: false })
  // 목록 창 조회(첫 호출)와 14일 넘은 건수 조회(두 번째 호출, order desc)를 가른다 — 건수 조회는 기본 빈 결과.
  mocks.nextActions.mockImplementation(async (_from: string, _to: string, options?: { order?: string }) =>
    options?.order === "desc" ? { rows: [], down: false, truncated: false } : listDue()
  )
  mocks.leadIndex.mockResolvedValue({ rows: [], down: false })
  mocks.latestActivity.mockResolvedValue({ rows: [], down: false })
})

describe("crm-today-contacts 원천 조립", () => {
  it("Home 보조 원천은 unstable_cache(60초, 큐 스냅샷 + 오늘 연락 태그)로 감싼다", async () => {
    await loadRepository()
    expect(mocks.unstableCache).toHaveBeenCalledTimes(1)
    const [fn, keyParts, options] = mocks.unstableCache.mock.calls[0]
    expect(typeof fn).toBe("function")
    expect(keyParts).toEqual(["admin-crm-today-contacts", "home-aux-v2"])
    expect(options).toEqual({
      revalidate: 60,
      tags: ["admin-crm-priority-queue-snapshot", "admin-crm-today-contacts"],
    })
  })

  it("리드·NEO·Compass 원천을 한 목록으로 — 전화 키는 진행 중 리드·NEO·다음 액션 행에서 모은다", async () => {
    const { getCrmTodayContacts } = await loadRepository()
    const result = await getCrmTodayContacts({ now: NOW })
    expect(result.rows.map((row) => row.key).sort()).toEqual(["compass:9", "lead:L1", "neo:N1"])
    expect(result.sources).toMatchObject({ leadsOk: true, compass: "ok", homeContactsOk: true })
    expect(result.sources.neoSync).toEqual({ latestSyncedAt: "2026-08-28T00:00:00.000Z", stale: true })
    const keys = mocks.leadIndex.mock.calls[0][0] as string[]
    expect([...keys].sort()).toEqual(["01011112222", "01033334444", "01055556666"])
    // Compass 다음 액션 — 목록 창 [오늘 00:00 KST − 14일, 오늘 끝(KST 23:59:59.999)] 과
    // 14일 넘은 건수 전용 조회(하한 ~ 창 시작, 최근 먼저)를 따로 읽는다(목록이 옛 행에 밀려 잘리지 않게).
    expect(mocks.nextActions).toHaveBeenCalledTimes(2)
    expect(mocks.nextActions.mock.calls[0]).toEqual(["2026-09-10T15:00:00.000Z", "2026-09-25T14:59:59.999Z"])
    expect(mocks.nextActions.mock.calls[1]).toEqual(["2020-01-01T00:00:00.000Z", "2026-09-10T15:00:00.000Z", { order: "desc" }])
    // 닫힌 할 일은 오늘 00:00 KST 이후 · 오늘 대상 할 일은 [오늘 00:00 KST, 오늘 끝].
    expect(mocks.listClosed).toHaveBeenCalledWith("2026-09-24T15:00:00.000Z")
    expect(mocks.listDueToday).toHaveBeenCalledWith("2026-09-24T15:00:00.000Z", "2026-09-25T14:59:59.999Z")
    expect(result.sources.tasksOk).toBe(true)
    // 전화 키도, 원문 전화(하이픈 형식)도 응답에 싣지 않는다 — NEO 행 보조 줄은 지역·UID.
    const json = JSON.stringify(result)
    for (const raw of ["01011112222", "010-1111-2222", "01033334444", "010-3333-4444", "3333-4444"]) {
      expect(json).not.toContain(raw)
    }
    expect(result.rows.find((row) => row.key === "neo:N1")?.subtitle).toBeNull()
    expect(result.rows.find((row) => row.key === "lead:L1")?.subtitle).toBe("김원장")
  })

  it("14일 넘은 건수는 건수 전용 조회에서 세고, 그 조회만 끊기면 목록은 그대로 · partial(0 과 구분)", async () => {
    mocks.nextActions.mockImplementation(async (_from: string, _to: string, options?: { order?: string }) =>
      options?.order === "desc"
        ? {
            rows: [
              compassDue(21, { next_action_at: "2026-09-01T00:00:00.000Z" }),
              compassDue(22, { next_action_at: "2025-01-01T00:00:00.000Z", stage: "lost" }),
            ],
            down: false,
            truncated: false,
          }
        : listDue()
    )
    const { getCrmTodayContacts } = await loadRepository()
    const counted = await getCrmTodayContacts({ now: NOW })
    expect(counted.counts.compassOverdueBeyondLookback).toBe(1)
    expect(counted.sources.compass).toBe("ok")
    // 건수 조회 행은 목록에 올리지 않고 전화 키 조인에도 쓰지 않는다.
    expect(counted.rows.map((row) => row.key).sort()).toEqual(["compass:9", "lead:L1", "neo:N1"])

    mocks.nextActions.mockImplementation(async (_from: string, _to: string, options?: { order?: string }) =>
      options?.order === "desc" ? { rows: [], down: true, truncated: false } : listDue()
    )
    const partial = await getCrmTodayContacts({ now: NOW })
    expect(partial.rows.map((row) => row.key)).toContain("compass:9")
    expect(partial.sources.compass).toBe("partial")
    expect(partial.sources.warnings.some((warning) => warning.includes("건수를 세지 못했습니다"))).toBe(true)
  })

  it("Compass 조회는 Data Cache 밖 — 보조 원천이 캐시 적중이어도 매 요청 부르고, 끊김은 메타로만 알린다", async () => {
    mocks.cachedAux = {
      homeContacts: [],
      closedTasksToday: [],
      closedTasksOk: true,
      todayTasks: [],
      todayTasksTruncated: false,
      warnings: [],
    }
    mocks.nextActions.mockImplementation(async () => ({ rows: [], down: true, truncated: false }))
    mocks.leadIndex.mockResolvedValue({ rows: [], down: true })
    mocks.latestActivity.mockResolvedValue({ rows: [], down: true })
    // now 를 넘기면 캐시를 우회하므로 이 테스트는 시계만 고정한다 — 실제 날짜로 돌면 픽스처(09-25)가
    // 목록 창 밖으로 밀려 결과가 날짜에 따라 달라진다.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    const { getCrmTodayContacts } = await loadRepository()

    const first = await getCrmTodayContacts({})
    await getCrmTodayContacts({})
    expect(mocks.loadHomeContactIndex).not.toHaveBeenCalled()
    // 요청마다 목록 창·건수 두 조회.
    expect(mocks.nextActions).toHaveBeenCalledTimes(4)
    expect(first.sources.compass).toBe("down")
    expect(first.sources.homeContactsOk).toBe(true)
    // Home 원천만으로 선다.
    expect(first.rows.map((row) => row.key).sort()).toEqual(["lead:L1", "neo:N1"])
    expect(first.sources.warnings.some((warning) => warning.includes("Compass 연결 끊김"))).toBe(true)
  })

  it("Home 연락 인덱스가 실패해도 던지지 않는다 — homeContactsOk=false · 경고", async () => {
    mocks.loadHomeContactIndex.mockRejectedValue(new Error("boom"))
    const { getCrmTodayContacts } = await loadRepository()
    const result = await getCrmTodayContacts({})
    expect(result.sources.homeContactsOk).toBe(false)
    expect(result.rows.length).toBeGreaterThan(0)
  })

  it("force 는 후보 풀에 force 를 넘기고 오늘 연락 태그를 즉시 만료한다", async () => {
    const { getCrmTodayContacts } = await loadRepository()
    await getCrmTodayContacts({ force: true })
    expect(mocks.getPool).toHaveBeenCalledWith({ now: undefined, force: true })
    expect(mocks.revalidateTag).toHaveBeenCalledWith("admin-crm-today-contacts", { expire: 0 })
    // force 는 보조 원천 캐시를 우회한다(직접 읽음).
    expect(mocks.loadHomeContactIndex).toHaveBeenCalledTimes(1)
  })

  it("담당 키 필터는 병합 뒤 행에 건다(Home 담당 + Compass 담당)", async () => {
    const { getCrmTodayContacts } = await loadRepository()
    const mine = await getCrmTodayContacts({ now: NOW, ownerKeys: ["김담당"] })
    expect(mine.rows.map((row) => row.key)).toEqual(["lead:L1"])
    const compassOwner = await getCrmTodayContacts({ now: NOW, owner: "이콤" })
    expect(compassOwner.rows.map((row) => row.key)).toEqual(["compass:9"])
    // 담당 목록은 필터 전 기준.
    expect(mine.owners.map((owner) => owner.ownerName).sort()).toEqual(["김담당", "박담당", "이콤"])
  })

  it("limit 은 [1, 150] 으로 자른다", async () => {
    const { getCrmTodayContacts } = await loadRepository()
    const result = await getCrmTodayContacts({ now: NOW, limit: 9999 })
    expect(result.truncated.limit).toBe(150)
    const fallback = await getCrmTodayContacts({ now: NOW, limit: Number.NaN })
    expect(fallback.truncated.limit).toBe(60)
  })

  it("[16] 보조 원천 캐시 함수는 실패에도 던지지 않는다 — 라벨 붙은 강등을 저장해 옛 완성 엔트리에 고착되지 않게", async () => {
    mocks.loadHomeContactIndex.mockRejectedValue(new Error("상한에 닿았습니다"))
    mocks.listClosed.mockRejectedValue(new Error("closed down"))
    await loadRepository()
    const [fn] = mocks.unstableCache.mock.calls[0] as [(...args: unknown[]) => Promise<Record<string, unknown>>]
    // 던지면 Next unstable_cache 는 만료된 옛 엔트리를 계속 돌려준다(백그라운드 재계산 오류를 삼킨다) — 값으로 끝나야 한다.
    const aux = await fn("2026-09-25", "2026-09-24T15:00:00.000Z", "2026-09-25T14:59:59.999Z")
    expect(aux).toMatchObject({ homeContacts: null, closedTasksOk: false, todayTasks: [] })
    expect(aux).not.toHaveProperty("complete")
  })

  it("[16] 캐시 적중이 강등 값이어도 그대로 드러낸다(homeContactsOk=false · 경고)", async () => {
    mocks.cachedAux = {
      homeContacts: null,
      closedTasksToday: [],
      closedTasksOk: true,
      todayTasks: [],
      todayTasksTruncated: false,
      warnings: [],
    }
    const { getCrmTodayContacts } = await loadRepository()
    const result = await getCrmTodayContacts({})
    expect(result.sources.homeContactsOk).toBe(false)
    expect(result.sources.warnings.some((warning) => warning.includes("Home 연락 기록을 읽지 못해"))).toBe(true)
  })

  it("[13] 오늘 대상 할 일은 후보 풀 상한(200) 밖이어도 행이 된다 — 풀과 id 로 합친다", async () => {
    const poolTask = taskRow({ id: "P1", title: "풀 할 일", dueAt: "2026-09-26T01:00:00.000Z" })
    mocks.getPool.mockResolvedValue(pool({ tasks: [poolTask] }))
    mocks.listDueToday.mockResolvedValue({
      rows: [
        taskRow({ id: "U1", title: "기한 없는 긴급", dueAt: null, priority: "urgent" }),
        taskRow({ id: "S1", title: "세그먼트 할 일", dueAt: "2026-09-25T09:00:00.000Z" }),
      ],
      health: { ok: true, message: null },
      truncated: false,
    })
    const { getCrmTodayContacts } = await loadRepository()
    const result = await getCrmTodayContacts({ now: NOW })
    const keys = result.rows.map((row) => row.key)
    expect(keys).toEqual(expect.arrayContaining(["task:U1", "task:S1"]))
    // 풀의 미래 할 일(내일)은 오늘 행이 아니다.
    expect(keys).not.toContain("task:P1")
    expect(result.sources.tasksOk).toBe(true)
  })

  it("[Q2-15] 방금 닫은 할 일이 후보 풀(쓰기 뒤 SWR 로 한 번 늦는 스냅샷)에 '열림'으로 남아 있어도 대기 사유로 세우지 않는다", async () => {
    // 풀 = 완료 전 사본(오늘 기한 · 열림). 보조 원천(즉시 만료돼 새 값) = 오늘 완료.
    const stale = taskRow({ id: "T1", title: "세그먼트 할 일", dueAt: "2026-09-25T01:00:00.000Z" })
    mocks.getPool.mockResolvedValue(pool({ tasks: [stale] }))
    mocks.listClosed.mockResolvedValue({
      rows: [{ ...stale, status: "done", completedAt: "2026-09-25T02:30:00.000Z", completedBy: "김운영" }],
      health: { ok: true, message: null },
      truncated: false,
    })
    const { getCrmTodayContacts } = await loadRepository()
    const result = await getCrmTodayContacts({ now: NOW })
    const row = result.rows.find((candidate) => candidate.key === "task:T1")
    expect(row?.handled).toMatchObject({ kind: "task_done", by: "김운영" })
    expect(row?.openTaskIds).toEqual([])
    expect(row?.reasons.map((reason) => reason.label)).toEqual(["할 일 · 완료"])

    // 대조 — 같은 풀이라도 오늘 닫힘이 없으면(아직 열린 할 일) 대기 행이다.
    mocks.listClosed.mockResolvedValue({ rows: [], health: { ok: true, message: null }, truncated: false })
    const open = await getCrmTodayContacts({ now: NOW })
    expect(open.rows.find((candidate) => candidate.key === "task:T1")).toMatchObject({ handled: null, openTaskIds: ["T1"] })
  })

  it("[13] 오늘 대상 할 일이 상한에서 잘리거나 읽지 못하면 tasksOk=false · 경고(목록이 할 일을 다 담았다고 말하지 않는다)", async () => {
    mocks.listDueToday.mockResolvedValue({ rows: [], health: { ok: true, message: null }, truncated: true })
    const { getCrmTodayContacts } = await loadRepository()
    const truncated = await getCrmTodayContacts({ now: NOW })
    expect(truncated.sources.tasksOk).toBe(false)
    expect(truncated.sources.warnings).toContain("오늘 할 일이 많아 일부만 목록에 반영했습니다.")

    mocks.listDueToday.mockRejectedValue(new Error("tasks down"))
    const failed = await getCrmTodayContacts({ now: NOW })
    expect(failed.sources.tasksOk).toBe(false)
    expect(failed.sources.warnings).toContain("오늘 할 일을 모두 읽지 못해 일부 할 일이 빠졌을 수 있습니다.")
  })

  it("[24] 할 일 대상 종료 리드의 전화 키도 Compass 리드 인덱스·최신 활동 조회에 넣는다 — 단계 무관 Compass 판정", async () => {
    const closedLead = {
      id: "L2",
      source: "contact_page",
      org: "종료 학원",
      name: null,
      phone: "010-7777-8888",
      timestamp: "2026-07-01T00:00:00.000Z",
      status: "closed",
    }
    mocks.getPool.mockResolvedValue(pool({ leads: [...pool().leads, closedLead] }))
    mocks.listDueToday.mockResolvedValue({
      rows: [taskRow({ id: "T2", targetType: "lead", targetId: "L2", targetLabel: "종료 학원", dueAt: "2026-09-25T09:00:00.000Z" })],
      health: { ok: true, message: null },
      truncated: false,
    })
    mocks.leadIndex.mockImplementation(async (keys: string[]) => ({
      rows: keys.includes("01077778888")
        ? [
            {
              phone_key: "01077778888",
              id: 88,
              stage: "lost",
              owner: "이콤",
              caller: null,
              bd_owner: null,
              care_stage: null,
              next_action_at: null,
              created_at: "2026-07-01T00:00:00.000Z",
              updated_at: null,
              last_inflow_at: null,
            },
          ]
        : [],
      down: false,
    }))
    const { getCrmTodayContacts } = await loadRepository()
    const result = await getCrmTodayContacts({ now: NOW })
    expect(mocks.leadIndex.mock.calls[0][0]).toContain("01077778888")
    expect(mocks.latestActivity.mock.calls[0][0]).toContain("01077778888")
    const row = result.rows.find((candidate) => candidate.key === "lead:L2")
    expect(row?.primaryAction).toBe("open_compass")
    expect(row?.compass?.leadId).toBe(88)
  })
})

function taskRow(overrides: Record<string, unknown> & { id: string }) {
  return {
    targetType: "unknown",
    targetId: null,
    targetLabel: null,
    ownerKey: null,
    ownerNameSnapshot: null,
    taskType: "call",
    title: `할 일 ${overrides.id}`,
    detail: null,
    dueAt: "2026-09-25T09:00:00.000Z",
    snoozedUntil: null,
    priority: "normal",
    status: "open",
    sourceEventId: null,
    createdBy: null,
    assignedBy: null,
    completedAt: null,
    completedBy: null,
    outcome: null,
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  }
}
