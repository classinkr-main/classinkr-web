// 세그먼트 자동 태그 떼기 상한 — 잡(runCrmSegmentDaily)과 실제 태그 저장소(crm-customer-tags)를 묶어 순서를 고정한다.
//  - 떼기 상한 = max(50, 직전 붙인 수 50%). 분모는 "이번 실행에서 붙이기 전" 마커 행 수여야 한다.
//    (붙이기 뒤에 읽으면 어제 120명 → 오늘 완전히 다른 120명일 때 분모 240·상한 120 이 되어 어제 120개가 전부 떼어진다.)
//  - 드라이런(켜기 전 미리보기)과 실제 적용이 같은 분모·같은 막힘 판정을 쓴다.
// Supabase 는 메모리 표로 흉내 낸다(저장소 코드는 진짜). 세그먼트 표·평가는 목.
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SavedSegmentRecord } from "@/lib/crm/saved-segments"

const NOW = new Date("2026-09-24T21:05:00.000Z") // KST 2026-09-25 06:05
const MARKER = "auto:seg:s1"

interface TagRow {
  id: string
  target_type: string
  target_id: string
  tag: string
  created_by: string | null
}

let table: TagRow[] = []
let nextRowId = 1

function newRowId() {
  const id = `row-${String(nextRowId).padStart(6, "0")}`
  nextRowId += 1
  return id
}

function selectBuilder(options?: { count?: string }) {
  const filters: Array<(row: TagRow) => boolean> = []
  const builder = {
    eq(field: keyof TagRow, value: string) {
      filters.push((row) => row[field] === value)
      return builder
    },
    in(field: keyof TagRow, values: string[]) {
      filters.push((row) => values.includes(row[field] as string))
      return builder
    },
    order() {
      return builder
    },
    async range(from: number, to: number) {
      const matched = table.filter((row) => filters.every((filter) => filter(row))).sort((a, b) => (a.id < b.id ? -1 : 1))
      return {
        data: matched.slice(from, to + 1).map((row) => ({ ...row })),
        error: null,
        count: options?.count === "exact" ? matched.length : null,
      }
    },
  }
  return builder
}

const supabase = {
  from: () => ({
    select: (_columns: string, options?: { count?: string }) => selectBuilder(options),
    upsert: (rows: Array<Omit<TagRow, "id">>) => ({
      async select() {
        // ON CONFLICT (target_type, target_id, tag) DO NOTHING — 들어간 행만 돌려준다.
        const inserted: Array<{ target_type: string; target_id: string }> = []
        for (const candidate of rows) {
          const exists = table.some(
            (row) => row.target_type === candidate.target_type && row.target_id === candidate.target_id && row.tag === candidate.tag
          )
          if (exists) continue
          table.push({ ...candidate, id: newRowId() })
          inserted.push({ target_type: candidate.target_type, target_id: candidate.target_id })
        }
        return { data: inserted, error: null }
      },
    }),
    delete: () => {
      let ids: string[] = []
      let createdBy: string | null = null
      const builder = {
        in(_field: string, values: string[]) {
          ids = values
          return builder
        },
        eq(_field: string, value: string) {
          createdBy = value
          return builder
        },
        async select() {
          const removed = table.filter((row) => ids.includes(row.id) && row.created_by === createdBy)
          table = table.filter((row) => !removed.includes(row))
          return { data: removed.map(({ id }) => ({ id })), error: null }
        },
      }
      return builder
    },
  }),
}

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
  }
})

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => supabase }))
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

function leadId(prefix: "a" | "b" | "c", index: number) {
  return `${String(index).padStart(8, "0")}-0000-4000-8000-${prefix.repeat(12)}`
}

const OLD_MEMBERS = Array.from({ length: 120 }, (_, index) => leadId("a", index))
const NEW_MEMBERS = Array.from({ length: 120 }, (_, index) => leadId("b", index))

function segment(extra: Partial<SavedSegmentRecord> = {}): SavedSegmentRecord {
  return {
    id: "s1",
    name: "만료 임박",
    description: null,
    spec: { kinds: ["lead"] },
    specVersion: 1,
    specHash: "hash-s1",
    visibility: "team",
    ownerUserId: "u1",
    ownerName: "관리자",
    autoTagEnabled: true,
    autoTagLabel: "만료임박",
    autoUntag: true,
    lastCount: 120,
    lastEvaluatedAt: "2026-09-23T21:05:00.000Z",
    lastRunStatus: "applied",
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

function evaluation(memberIds: readonly string[]) {
  const keys = memberIds.map((id) => `lead:${id}`).sort()
  return {
    generatedAt: NOW.toISOString(),
    meta: { compass: "ok", homeContactDetail: "ok" },
    sources: {
      leadsOk: true,
      neoAccountsOk: true,
      portalCustomersOk: true,
      complete: true,
      tagsOk: true,
      neoLatestSyncedAt: "2026-09-24T20:00:00.000Z",
      neoPartial: false,
    },
    results: [
      {
        total: keys.length,
        bySource: { lead: keys.length, neo_account: 0, customer: 0, task: 0 },
        keys,
        truncated: false,
        noContactRecordCount: 0,
        anyOfCounts: [],
      },
    ],
  }
}

/** 어제 이 세그먼트가 붙여 둔 자동 태그 행 + 비회원에게 사람이 붙인 같은 라벨 하나(자동 떼기가 절대 건드리지 않는다). */
function seedYesterday(memberIds: readonly string[]) {
  table = memberIds.map((id) => ({ id: newRowId(), target_type: "lead", target_id: id, tag: "만료임박", created_by: MARKER }))
  table.push({ id: newRowId(), target_type: "lead", target_id: leadId("c", 0), tag: "만료임박", created_by: "김담당" })
}

async function run(options: { dryRun?: boolean } = {}) {
  const { runCrmSegmentDaily } = await import("@/lib/server/crm-segment-daily")
  return runCrmSegmentDaily({ trigger: "cron", now: NOW, ...options })
}

const markerRowCount = () => table.filter((row) => row.created_by === MARKER).length
const markerTargets = () =>
  new Set(table.filter((row) => row.created_by === MARKER).map((row) => row.target_id))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "info").mockImplementation(() => {})
  table = []
  nextRowId = 1
  mocks.listActiveSavedSegmentsForRun.mockResolvedValue([segment()])
  // 어제도 120명(같은 조건) — 총계가 같아 급변 가드는 걸리지 않는다.
  mocks.listSavedSegmentDailyPoints.mockResolvedValue({
    available: true,
    points: [{ segmentId: "s1", snapshotDate: "2026-09-24", total: 120, specHash: "hash-s1", flags: [] }],
  })
  mocks.upsertSavedSegmentDailyRows.mockImplementation(async (rows: unknown[]) => ({ ok: true, written: rows.length }))
  mocks.updateSavedSegmentRunState.mockResolvedValue(undefined)
  mocks.deleteSavedSegmentDailyBefore.mockResolvedValue(undefined)
})

describe("runCrmSegmentDaily × crm-customer-tags — 떼기 상한 분모", () => {
  it("회원이 통째로 바뀌면(어제 120 → 오늘 다른 120) 떼기를 막는다 — 새로 붙인 행은 분모에 들어가지 않는다", async () => {
    seedYesterday(OLD_MEMBERS)
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(evaluation(NEW_MEMBERS))

    const report = await run()

    // 분모 120 → 상한 max(50, 60) = 60 < 후보 120 → 막힘. (붙이기 뒤에 읽었다면 분모 240 → 상한 120 → 전부 떼어졌다.)
    expect(report.segments[0]).toMatchObject({ autoTagStatus: "applied", tagged: 120, untagged: 0, blockedUntag: true })
    expect(markerRowCount()).toBe(240)
    for (const id of OLD_MEMBERS) expect(markerTargets().has(id)).toBe(true)
    // 같은 라벨의 수동 태그는 그대로.
    expect(table.filter((row) => row.created_by === "김담당")).toHaveLength(1)
    expect(mocks.updateSavedSegmentRunState.mock.calls[0][1]).toMatchObject({
      lastRunStatus: "applied",
      lastRunDetail: expect.objectContaining({ tagged: 120, untagged: 0, blockedUntag: true }),
    })
  })

  it("드라이런 미리보기와 실제 적용이 같은 판정을 낸다 — 막힘", async () => {
    seedYesterday(OLD_MEMBERS)
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(evaluation(NEW_MEMBERS))

    const preview = await run({ dryRun: true })
    expect(markerRowCount()).toBe(120) // 드라이런은 쓰기 0
    const applied = await run()

    const pick = (outcome: (typeof preview.segments)[number]) => ({
      tagged: outcome.tagged,
      untagged: outcome.untagged,
      blockedUntag: outcome.blockedUntag ?? false,
    })
    expect(pick(preview.segments[0])).toEqual({ tagged: 120, untagged: 0, blockedUntag: true })
    expect(pick(applied.segments[0])).toEqual(pick(preview.segments[0]))
  })

  it("상한 안의 변화(120 중 20명 교체)는 떼고, 드라이런 예정 수와 실제 뗀 수가 같다", async () => {
    const today = [...OLD_MEMBERS.slice(20), ...NEW_MEMBERS.slice(0, 20)]
    seedYesterday(OLD_MEMBERS)
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(evaluation(today))

    const preview = await run({ dryRun: true })
    const applied = await run()

    expect(preview.segments[0]).toMatchObject({ tagged: 20, untagged: 20 })
    expect(preview.segments[0].blockedUntag).toBeUndefined()
    expect(applied.segments[0]).toMatchObject({ autoTagStatus: "applied", tagged: 20, untagged: 20 })
    expect(applied.segments[0].blockedUntag).toBeUndefined()
    expect(markerRowCount()).toBe(120)
    expect(markerTargets()).toEqual(new Set(today))
    // 비회원의 같은 라벨 수동 태그는 남는다.
    expect(table.filter((row) => row.created_by === "김담당")).toHaveLength(1)
  })
})
