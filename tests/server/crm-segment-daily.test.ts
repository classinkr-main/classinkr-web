// 저장 세그먼트 매일 평가 + 자동 태그 잡(runCrmSegmentDaily, 세그먼트 허브 2026-09-25) — 저장소·평가·태그 쓰기는 목.
//  - 크론·수동 실행 평가는 bypassCache:true(unstable_cache SWR 로 어제 저녁 스냅샷을 받지 않게).
//  - 마커 "auto:seg:<id>" 로 붙이고, 떼기는 그 마커 행만(회원 저장 키를 keep 으로 넘김). 떼기 계획은 붙이기 전에
//    세우고(상한 분모 = 이번 실행 전 마커 행 수), 실제 지우기는 붙이기 뒤. 실제 저장소와 묶은 순서 검증은
//    tests/server/crm-segment-daily-untag.test.ts.
//  - 자동 태그 적용·실행당 상한·시간 예산은 autoTagOrder 순서(지난번 예산에 밀린 세그먼트 먼저).
//  - 가드: NEO 오래됨·Compass 끊김(연락 조건)·원천 미완성·상한·급변·실행당 개수 → 태그 쓰기 0, 건수 기록은 한다.
//  - dryRun 은 쓰기 0. 세그먼트 하나의 실패는 그 세그먼트만. 표 미적용은 skipped(not_ready).
//  - 급변 가드 기준값은 품질 저하 점을 건너뛴 직전 정상 점(교차 리뷰 [17]). lookback 안 점이 전부 품질 저하(복구 첫날)면
//    하루 보류(skipped_spike)하고 오늘 정상 점을 기록해 다음 날 기준으로 쓴다([17] 후속).
//  - 실행당 20개 상한은 실제로 적용을 시작한 세그먼트만 센다 · last_* 갱신은 묶음 병렬(교차 리뷰 [35]).
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SavedSegmentRecord } from "@/lib/crm/saved-segments"

const NOW = new Date("2026-09-24T21:05:00.000Z") // KST 2026-09-25 06:05
const TODAY = "2026-09-25"

const mocks = vi.hoisted(() => {
  class SavedSegmentsNotReadyError extends Error {}
  return {
    SavedSegmentsNotReadyError,
    listActiveSavedSegmentsForRun: vi.fn(),
    listSavedSegmentDailyPoints: vi.fn(),
    upsertSavedSegmentDailyRows: vi.fn(),
    updateSavedSegmentRunState: vi.fn(),
    deleteSavedSegmentDailyBefore: vi.fn(),
    evaluateCrmSegmentFilters: vi.fn(),
    addCustomerTagToTargets: vi.fn(),
    previewCustomerTagForTargets: vi.fn(),
    planSegmentAutoTagRemovals: vi.fn(),
    applyRemoval: vi.fn(),
  }
})

vi.mock("@/lib/repositories/crm-saved-segments", () => ({
  SavedSegmentsNotReadyError: mocks.SavedSegmentsNotReadyError,
  listActiveSavedSegmentsForRun: mocks.listActiveSavedSegmentsForRun,
  listSavedSegmentDailyPoints: mocks.listSavedSegmentDailyPoints,
  upsertSavedSegmentDailyRows: mocks.upsertSavedSegmentDailyRows,
  updateSavedSegmentRunState: mocks.updateSavedSegmentRunState,
  deleteSavedSegmentDailyBefore: mocks.deleteSavedSegmentDailyBefore,
}))
vi.mock("@/lib/repositories/crm-unified-customers", () => ({
  evaluateCrmSegmentFilters: mocks.evaluateCrmSegmentFilters,
}))
vi.mock("@/lib/repositories/crm-customer-tags", () => ({
  addCustomerTagToTargets: mocks.addCustomerTagToTargets,
  previewCustomerTagForTargets: mocks.previewCustomerTagForTargets,
  planSegmentAutoTagRemovals: mocks.planSegmentAutoTagRemovals,
}))

const LEAD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const LEAD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

function segment(id: string, extra: Partial<SavedSegmentRecord> = {}): SavedSegmentRecord {
  return {
    id,
    name: `세그먼트 ${id}`,
    description: null,
    spec: { kinds: ["lead"] },
    specVersion: 1,
    specHash: `hash-${id}`,
    visibility: "team",
    ownerUserId: "u1",
    ownerName: "관리자",
    autoTagEnabled: false,
    autoTagLabel: null,
    autoUntag: false,
    lastCount: null,
    lastEvaluatedAt: null,
    lastRunStatus: null,
    lastRunDetail: null,
    archivedAt: null,
    archivedBy: null,
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...extra,
  }
}

function result(keys: string[], extra: Record<string, unknown> = {}) {
  return {
    total: keys.length,
    bySource: { lead: keys.filter((key) => key.startsWith("lead:")).length, neo_account: keys.filter((key) => key.startsWith("neo:")).length, customer: 0, task: 0 },
    keys,
    truncated: false,
    noContactRecordCount: 0,
    anyOfCounts: [],
    ...extra,
  }
}

function batch(results: ReturnType<typeof result>[], extra: { compass?: string; complete?: boolean; tagsOk?: boolean; neoLatestSyncedAt?: string | null } = {}) {
  return {
    generatedAt: NOW.toISOString(),
    meta: { compass: extra.compass ?? "ok", homeContactDetail: "ok" },
    sources: {
      leadsOk: true,
      neoAccountsOk: true,
      portalCustomersOk: true,
      complete: extra.complete ?? true,
      tagsOk: extra.tagsOk ?? true,
      neoLatestSyncedAt: extra.neoLatestSyncedAt === undefined ? "2026-09-24T20:00:00.000Z" : extra.neoLatestSyncedAt,
      neoPartial: false,
    },
    results,
  }
}

async function run(options: Record<string, unknown> = {}) {
  const { runCrmSegmentDaily } = await import("@/lib/server/crm-segment-daily")
  return runCrmSegmentDaily({ trigger: "cron", now: NOW, ...options })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "info").mockImplementation(() => {})
  mocks.listSavedSegmentDailyPoints.mockResolvedValue({ available: true, points: [] })
  mocks.upsertSavedSegmentDailyRows.mockImplementation(async (rows: unknown[]) => ({ ok: true, written: rows.length }))
  mocks.updateSavedSegmentRunState.mockResolvedValue(undefined)
  mocks.deleteSavedSegmentDailyBefore.mockResolvedValue(undefined)
  mocks.addCustomerTagToTargets.mockImplementation(async (targets: unknown[]) => ({ applied: targets.length, skipped: 0, failed: [] }))
  mocks.previewCustomerTagForTargets.mockResolvedValue({ wouldApply: 1, skipped: 1 })
  mocks.applyRemoval.mockResolvedValue({ removed: 1, failed: 0 })
  mocks.planSegmentAutoTagRemovals.mockImplementation(async () => ({
    markerRows: 3,
    candidates: 1,
    blocked: false,
    apply: mocks.applyRemoval,
  }))
})

describe("runCrmSegmentDaily", () => {
  it("표 미적용이면 skipped(not_ready) — 평가·쓰기 없음", async () => {
    mocks.listActiveSavedSegmentsForRun.mockRejectedValue(new mocks.SavedSegmentsNotReadyError("not ready"))
    const report = await run()
    expect(report).toMatchObject({ status: "skipped", reason: "not_ready", segments: [] })
    expect(mocks.evaluateCrmSegmentFilters).not.toHaveBeenCalled()
  })

  it("세그먼트가 없으면 skipped(no_segments)", async () => {
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([])
    expect(await run()).toMatchObject({ status: "skipped", reason: "no_segments" })
  })

  it("bypassCache 로 한 번에 평가하고, 자동 태그는 마커로 붙이고 마커 행만 뗀다 — 일별·실행 결과 기록", async () => {
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([
      segment("s1", { autoTagEnabled: true, autoTagLabel: "만료임박", autoUntag: true }),
      segment("s2"),
    ])
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(
      batch([result([`lead:${LEAD_A}`, `lead:${LEAD_B}`, "lead:not-a-uuid"]), result([`lead:${LEAD_A}`])])
    )

    const report = await run()

    expect(mocks.evaluateCrmSegmentFilters).toHaveBeenCalledTimes(1)
    expect(mocks.evaluateCrmSegmentFilters.mock.calls[0][1]).toMatchObject({ bypassCache: true })
    const [targets, label, marker] = mocks.addCustomerTagToTargets.mock.calls[0]
    expect(label).toBe("만료임박")
    expect(marker).toBe("auto:seg:s1")
    expect(targets.map((target: { key: string }) => target.key)).toEqual([`lead:${LEAD_A}`, `lead:${LEAD_B}`])
    const removal = mocks.planSegmentAutoTagRemovals.mock.calls[0][0]
    expect(removal).toMatchObject({ marker: "auto:seg:s1", label: "만료임박" })
    expect([...removal.keepStorageKeys]).toEqual([`lead:${LEAD_A}`, `lead:${LEAD_B}`])
    expect(removal.limitFor(300)).toBe(150)
    // 떼기 계획(마커 행 읽기) → 붙이기 → 지우기 순서 — 상한 분모에 이번에 붙인 행이 들어가지 않는다.
    const planOrder = mocks.planSegmentAutoTagRemovals.mock.invocationCallOrder[0]
    const addOrder = mocks.addCustomerTagToTargets.mock.invocationCallOrder[0]
    const applyOrder = mocks.applyRemoval.mock.invocationCallOrder[0]
    expect(planOrder).toBeLessThan(addOrder)
    expect(addOrder).toBeLessThan(applyOrder)

    expect(report.status).toBe("ok")
    expect(report.daily).toBe("written")
    expect(report.segments).toEqual([
      expect.objectContaining({ id: "s1", autoTagStatus: "applied", tagged: 2, untagged: 1, invalid: 1, total: 3 }),
      expect.objectContaining({ id: "s2", autoTagStatus: "off", tagged: 0, total: 1 }),
    ])

    const rows = mocks.upsertSavedSegmentDailyRows.mock.calls[0][0]
    expect(rows[0]).toMatchObject({
      segmentId: "s1",
      snapshotDate: TODAY,
      total: 3,
      leadCount: 3,
      neoAccountCount: 0,
      customerCount: 0,
      specHash: "hash-s1",
      autoTagStatus: "applied",
      tagged: 2,
      untagged: 1,
      runTrigger: "cron",
    })
    expect(mocks.updateSavedSegmentRunState).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ lastCount: 3, lastRunStatus: "applied", lastRunDetail: expect.objectContaining({ tagged: 2, untagged: 1, invalid: 1 }) })
    )
    // 보존 삭제는 크론에서만, 오늘-180일 기준.
    expect(mocks.deleteSavedSegmentDailyBefore).toHaveBeenCalledWith("2026-03-29")
  })

  it("dryRun 은 쓰기 0 — 붙일·뗄 예정 수만", async () => {
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([
      segment("s1", { autoTagEnabled: true, autoTagLabel: "만료임박", autoUntag: true }),
    ])
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(batch([result([`lead:${LEAD_A}`, `lead:${LEAD_B}`])]))
    const report = await run({ dryRun: true })

    expect(report).toMatchObject({ status: "ok", dryRun: true, daily: "skipped" })
    expect(report.segments[0]).toMatchObject({ autoTagStatus: "applied", tagged: 1, untagged: 1 })
    expect(mocks.planSegmentAutoTagRemovals).toHaveBeenCalledTimes(1)
    expect(mocks.applyRemoval).not.toHaveBeenCalled()
    expect(mocks.addCustomerTagToTargets).not.toHaveBeenCalled()
    expect(mocks.upsertSavedSegmentDailyRows).not.toHaveBeenCalled()
    expect(mocks.updateSavedSegmentRunState).not.toHaveBeenCalled()
    expect(mocks.deleteSavedSegmentDailyBefore).not.toHaveBeenCalled()
  })

  it("드라이런 미리보기는 자동 태그가 꺼져 있어도 넘긴 라벨로 켰다고 치고 본다", async () => {
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([segment("s1")])
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(batch([result([`lead:${LEAD_A}`])]))
    const report = await run({ dryRun: true, trigger: "manual", segmentIds: ["s1"], simulateAutoTag: { label: "새라벨" } })
    expect(mocks.listActiveSavedSegmentsForRun).toHaveBeenCalledWith(["s1"])
    expect(mocks.previewCustomerTagForTargets.mock.calls[0][1]).toBe("새라벨")
    expect(report.segments[0].autoTagStatus).toBe("applied")
  })

  it("가드 — NEO 오래됨(NEO 조건)·Compass 끊김(연락 조건)·원천 미완성은 태그를 쓰지 않고 건수만 기록한다", async () => {
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([
      segment("neo", { spec: { expDays: 30 }, autoTagEnabled: true, autoTagLabel: "A" }),
      segment("contact", { spec: { noContactDays: 30 }, autoTagEnabled: true, autoTagLabel: "B" }),
      segment("plain", { autoTagEnabled: true, autoTagLabel: "C" }),
    ])
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(
      batch([result(["neo:N1"]), result([`lead:${LEAD_A}`]), result([`lead:${LEAD_B}`])], {
        compass: "down",
        neoLatestSyncedAt: "2026-08-28T00:00:00.000Z",
      })
    )
    const report = await run()
    expect(report.segments.map((outcome) => [outcome.id, outcome.autoTagStatus, outcome.flags])).toEqual([
      ["neo", "skipped_neo_stale", ["neo_stale"]],
      ["contact", "skipped_degraded", ["compass_down"]],
      ["plain", "applied", []],
    ])
    expect(mocks.addCustomerTagToTargets).toHaveBeenCalledTimes(1)
    expect(mocks.upsertSavedSegmentDailyRows.mock.calls[0][0]).toHaveLength(3)

    vi.clearAllMocks()
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([segment("plain", { autoTagEnabled: true, autoTagLabel: "C", autoUntag: true })])
    mocks.listSavedSegmentDailyPoints.mockResolvedValue({ available: true, points: [] })
    mocks.upsertSavedSegmentDailyRows.mockResolvedValue({ ok: true, written: 1 })
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(batch([result([])], { tagsOk: false }))
    const incomplete = await run()
    expect(incomplete.segments[0]).toMatchObject({ autoTagStatus: "skipped_degraded", flags: ["source_incomplete"] })
    // 라벨 읽기가 실패해 0명으로 무너진 결과로 태그를 떼지 않는다.
    expect(mocks.planSegmentAutoTagRemovals).not.toHaveBeenCalled()
  })

  it("가드 — 급변(같은 조건 직전 기록 20명 이상에서 3배)·상한(1,000명)", async () => {
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([
      segment("spike", { autoTagEnabled: true, autoTagLabel: "A" }),
      segment("big", { autoTagEnabled: true, autoTagLabel: "B" }),
    ])
    mocks.listSavedSegmentDailyPoints.mockResolvedValue({
      available: true,
      points: [
        { segmentId: "spike", snapshotDate: "2026-09-24", total: 20, specHash: "hash-spike", flags: [] },
        // 조건이 바뀌기 전 기록은 비교하지 않는다.
        { segmentId: "big", snapshotDate: "2026-09-24", total: 1, specHash: "old", flags: [] },
      ],
    })
    const spikeKeys = Array.from({ length: 61 }, (_, index) => `lead:${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`)
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(batch([result(spikeKeys), result([], { total: 1_001 })]))
    const report = await run()
    expect(report.segments.map((outcome) => outcome.autoTagStatus)).toEqual(["skipped_spike", "skipped_too_many"])
    expect(mocks.addCustomerTagToTargets).not.toHaveBeenCalled()
  })

  it("실행당 20개 넘는 자동 태그 세그먼트는 skipped_time_budget(다음 실행 우선)", async () => {
    const segments = Array.from({ length: 21 }, (_, index) =>
      segment(`s${String(index).padStart(2, "0")}`, {
        autoTagEnabled: true,
        autoTagLabel: `L${index}`,
        createdAt: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      })
    )
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue(segments)
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(batch(segments.map(() => result([`lead:${LEAD_A}`]))))
    const report = await run()
    expect(report.segments.filter((outcome) => outcome.autoTagStatus === "applied")).toHaveLength(20)
    expect(report.segments.at(-1)?.autoTagStatus).toBe("skipped_time_budget")
  })

  it("떼기가 막히면(후보 > 상한) 지우지 않고 blockedUntag — 붙이기는 그대로", async () => {
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([
      segment("s1", { autoTagEnabled: true, autoTagLabel: "L", autoUntag: true }),
    ])
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(batch([result([`lead:${LEAD_A}`])]))
    mocks.planSegmentAutoTagRemovals.mockResolvedValue({ markerRows: 400, candidates: 400, blocked: true, apply: mocks.applyRemoval })
    const report = await run()
    expect(mocks.applyRemoval).not.toHaveBeenCalled()
    expect(report.segments[0]).toMatchObject({ autoTagStatus: "applied", tagged: 1, untagged: 0, blockedUntag: true })
    expect(mocks.updateSavedSegmentRunState.mock.calls[0][1].lastRunDetail).toMatchObject({ blockedUntag: true })
  })

  it("시간 예산 — 지난번 예산에 밀린 세그먼트를 이번엔 먼저 적용한다(목록 순서가 아니라 autoTagOrder 순서로 돈다)", async () => {
    // 목록(updated_at 내림차순) 순서: s1, s2, s3. s3 는 어제 시간 예산에 밀렸다.
    const ranAt = "2026-09-23T21:05:00.000Z"
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([
      segment("s1", { autoTagEnabled: true, autoTagLabel: "A", lastRunStatus: "applied", lastEvaluatedAt: ranAt, createdAt: "2026-09-01T00:00:00.000Z" }),
      segment("s2", { autoTagEnabled: true, autoTagLabel: "B", lastRunStatus: "applied", lastEvaluatedAt: ranAt, createdAt: "2026-09-02T00:00:00.000Z" }),
      segment("s3", { autoTagEnabled: true, autoTagLabel: "C", lastRunStatus: "skipped_time_budget", lastEvaluatedAt: ranAt, createdAt: "2026-09-03T00:00:00.000Z" }),
      segment("off"),
    ])
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(
      batch([result([`lead:${LEAD_A}`]), result([`lead:${LEAD_A}`]), result([`lead:${LEAD_B}`]), result([])])
    )
    // 적용 하나에 5초 — 예산 8초면 두 개만 들어간다.
    let clock = 1_000_000
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock)
    mocks.addCustomerTagToTargets.mockImplementation(async (targets: unknown[]) => {
      clock += 5_000
      return { applied: targets.length, skipped: 0, failed: [] }
    })
    try {
      const report = await run({ timeBudgetMs: 8_000 })
      expect(mocks.addCustomerTagToTargets.mock.calls.map((call) => call[2])).toEqual(["auto:seg:s3", "auto:seg:s1"])
      // 보고 순서는 목록 순서 그대로, 이번에 예산 밖으로 밀린 건 s2.
      expect(report.segments.map((outcome) => [outcome.id, outcome.autoTagStatus])).toEqual([
        ["s1", "applied"],
        ["s2", "skipped_time_budget"],
        ["s3", "applied"],
        ["off", "off"],
      ])
      expect(mocks.updateSavedSegmentRunState).toHaveBeenCalledWith("s2", expect.objectContaining({ lastRunStatus: "skipped_time_budget" }))
    } finally {
      nowSpy.mockRestore()
    }
  })

  it("세그먼트 하나의 실패는 그 세그먼트만 failed — 나머지는 계속, 전체는 partial", async () => {
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([
      segment("bad", { autoTagEnabled: true, autoTagLabel: "A" }),
      segment("good", { autoTagEnabled: true, autoTagLabel: "B" }),
    ])
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(batch([result([`lead:${LEAD_A}`]), result([`lead:${LEAD_B}`])]))
    mocks.addCustomerTagToTargets.mockRejectedValueOnce(new Error("boom"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const report = await run()
    expect(report.status).toBe("partial")
    expect(report.segments.map((outcome) => outcome.autoTagStatus)).toEqual(["failed", "applied"])
  })

  it("새 판 조건은 평가하지 않는다(skipped_unreadable), 평가가 던지면 failed", async () => {
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([
      segment("future", { specVersion: 2, autoTagEnabled: true, autoTagLabel: "A" }),
      segment("ok"),
    ])
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(batch([result([])]))
    const report = await run()
    expect(mocks.evaluateCrmSegmentFilters.mock.calls[0][0]).toHaveLength(1)
    expect(report.segments.find((outcome) => outcome.id === "future")).toMatchObject({ autoTagStatus: "skipped_unreadable", total: null })

    mocks.evaluateCrmSegmentFilters.mockRejectedValueOnce(new Error("snapshot"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await run()).toMatchObject({ status: "failed", reason: "evaluation_failed" })
  })

  it("일별 표만 없으면 건수 기록만 건너뛰고 실행 결과는 갱신한다", async () => {
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([segment("s1")])
    mocks.listSavedSegmentDailyPoints.mockResolvedValue({ available: false, warning: "x", points: [] })
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(batch([result([`lead:${LEAD_A}`])]))
    const report = await run({ trigger: "manual" })
    expect(report.daily).toBe("not_ready")
    expect(mocks.upsertSavedSegmentDailyRows).not.toHaveBeenCalled()
    expect(mocks.updateSavedSegmentRunState).toHaveBeenCalledTimes(1)
    expect(mocks.deleteSavedSegmentDailyBefore).not.toHaveBeenCalled()
  })

  it("급변 가드 기준값은 품질 저하 점을 건너뛴다 — 전날 Compass 끊김으로 부푼 950 이 아니라 그 전 정상 300 과 비교([17])", async () => {
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([
      segment("contact", { spec: { noContactDays: 30 }, autoTagEnabled: true, autoTagLabel: "무연락" }),
    ])
    mocks.listSavedSegmentDailyPoints.mockResolvedValue({
      available: true,
      points: [
        { segmentId: "contact", snapshotDate: "2026-09-23", total: 300, specHash: "hash-contact", flags: [] },
        { segmentId: "contact", snapshotDate: "2026-09-24", total: 950, specHash: "hash-contact", flags: ["compass_down"] },
      ],
    })
    const keys = Array.from({ length: 310 }, (_, index) => `lead:${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`)
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(batch([result(keys)]))
    const report = await run()
    expect(report.segments[0]).toMatchObject({ autoTagStatus: "applied", tagged: 310 })

    // 반대 방향 — 전날 원천 미완성으로 5 로 무너진 점을 기준으로 삼지 않는다(300 → 오늘 950 은 급변으로 멈춘다).
    vi.clearAllMocks()
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([segment("plain", { autoTagEnabled: true, autoTagLabel: "L" })])
    mocks.listSavedSegmentDailyPoints.mockResolvedValue({
      available: true,
      points: [
        { segmentId: "plain", snapshotDate: "2026-09-23", total: 300, specHash: "hash-plain", flags: [] },
        { segmentId: "plain", snapshotDate: "2026-09-24", total: 5, specHash: "hash-plain", flags: ["source_incomplete"] },
      ],
    })
    mocks.upsertSavedSegmentDailyRows.mockResolvedValue({ ok: true, written: 1 })
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(batch([result([], { total: 950 })]))
    const spiked = await run()
    expect(spiked.segments[0].autoTagStatus).toBe("skipped_spike")
    expect(mocks.addCustomerTagToTargets).not.toHaveBeenCalled()
  })

  it("NEO 가 7일 넘게 멈췄다 돌아온 첫날 — 직전 기록이 전부 neo_stale 이면 붙이기·떼기 없이 하루 보류, 다음 날 적용([17] 후속)", async () => {
    const neoSegment = segment("exp60", { spec: { expDays: 60 }, autoTagEnabled: true, autoTagLabel: "만료60", autoUntag: true })
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([neoSegment])
    const staleWeek = Array.from({ length: 7 }, (_, index) => ({
      segmentId: "exp60",
      snapshotDate: `2026-09-${String(18 + index).padStart(2, "0")}`,
      total: 300,
      specHash: "hash-exp60",
      flags: ["neo_stale"],
    }))
    mocks.listSavedSegmentDailyPoints.mockResolvedValue({ available: true, points: staleWeek })
    // 오늘 NEO 는 새로 동기화됐다(기본 neoLatestSyncedAt = 어제 20시 UTC) — 첫 동기화가 불완전해 900 이 나왔다.
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(batch([result([], { total: 900 })]))

    const day1 = await run()
    expect(mocks.listSavedSegmentDailyPoints).toHaveBeenCalledWith(["exp60"], "2026-09-18")
    expect(day1.segments[0]).toMatchObject({ autoTagStatus: "skipped_spike", flags: [], tagged: 0, untagged: 0 })
    expect(mocks.planSegmentAutoTagRemovals).not.toHaveBeenCalled()
    expect(mocks.addCustomerTagToTargets).not.toHaveBeenCalled()
    // 오늘 점은 정상(플래그 없음)으로 기록된다 — 내일의 기준.
    expect(mocks.upsertSavedSegmentDailyRows).toHaveBeenCalledWith([
      expect.objectContaining({ segmentId: "exp60", snapshotDate: TODAY, total: 900, flags: [], autoTagStatus: "skipped_spike" }),
    ])

    // 다음 날 — 어제 기록한 정상 900 과 비교해 적용한다(보류는 하루뿐).
    mocks.listSavedSegmentDailyPoints.mockResolvedValue({
      available: true,
      points: [...staleWeek, { segmentId: "exp60", snapshotDate: TODAY, total: 900, specHash: "hash-exp60", flags: [] }],
    })
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(batch([result([`lead:${LEAD_A}`], { total: 905 })], { neoLatestSyncedAt: "2026-09-25T20:00:00.000Z" }))
    const day2 = await run({ now: new Date("2026-09-25T21:05:00.000Z") })
    expect(day2.segments[0].autoTagStatus).toBe("applied")
    expect(mocks.planSegmentAutoTagRemovals).toHaveBeenCalledTimes(1)
    expect(mocks.addCustomerTagToTargets).toHaveBeenCalledTimes(1)
  })

  it("실행당 20개 상한은 실제로 적용을 시작한 세그먼트만 센다 — NEO 오래됨으로 건너뛴 20개가 자리를 차지하지 않는다([35])", async () => {
    const neoSegments = Array.from({ length: 20 }, (_, index) =>
      segment(`neo${String(index).padStart(2, "0")}`, {
        spec: { expDays: 30 },
        autoTagEnabled: true,
        autoTagLabel: `N${index}`,
        createdAt: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      })
    )
    const plain = segment("plain", { autoTagEnabled: true, autoTagLabel: "P", createdAt: "2026-09-30T00:00:00.000Z" })
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue([...neoSegments, plain])
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(
      batch([...neoSegments.map(() => result(["neo:N1"])), result([`lead:${LEAD_A}`])], { neoLatestSyncedAt: "2026-08-28T00:00:00.000Z" })
    )
    const report = await run()
    expect(report.segments.filter((outcome) => outcome.autoTagStatus === "skipped_neo_stale")).toHaveLength(20)
    expect(report.segments.at(-1)).toMatchObject({ id: "plain", autoTagStatus: "applied" })
    expect(mocks.addCustomerTagToTargets).toHaveBeenCalledTimes(1)
  })

  it("세그먼트 행 last_* 갱신은 5개씩 묶어 병렬 — 전부 갱신하고, 하나가 실패해도 나머지는 남긴다([35])", async () => {
    const segments = Array.from({ length: 12 }, (_, index) => segment(`s${String(index).padStart(2, "0")}`))
    mocks.listActiveSavedSegmentsForRun.mockResolvedValue(segments)
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(batch(segments.map(() => result([`lead:${LEAD_A}`]))))
    let inFlight = 0
    let maxInFlight = 0
    mocks.updateSavedSegmentRunState.mockImplementation(async (id: string) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      inFlight -= 1
      if (id === "s03") throw new Error("boom")
    })
    vi.spyOn(console, "error").mockImplementation(() => {})
    const report = await run()
    expect(mocks.updateSavedSegmentRunState).toHaveBeenCalledTimes(12)
    expect(maxInFlight).toBe(5)
    expect(report.status).toBe("partial")
  })
})
