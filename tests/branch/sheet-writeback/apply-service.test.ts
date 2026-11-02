// apply-service 순서·실패 처리 — googleapis·supabase 저장소는 전부 목. 실제 시트·DB 호출 없음.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { LiveGrid } from "@/lib/branch/sheet-writeback/plan"

import { baselineFor, block, blocks, BLUE, buildGrid, cloneGrid, RED, ROW_A, ROW_B, type RowSpec } from "./fixtures"

// ── 호출 순서 기록 ────────────────────────────────────────────────
const calls: string[] = []

// ── googleapis 목 ────────────────────────────────────────────────
const sheetsGet = vi.fn()
const sheetsBatchUpdate = vi.fn()
vi.mock("@/lib/google", () => ({
  sheets: {
    spreadsheets: {
      get: (...args: unknown[]) => {
        calls.push("sheets.get")
        return sheetsGet(...args)
      },
      batchUpdate: (...args: unknown[]) => {
        calls.push("sheets.batchUpdate")
        return sheetsBatchUpdate(...args)
      },
    },
  },
  drive: {},
}))

// ── 초안 저장소 목 ───────────────────────────────────────────────
interface DraftLike {
  id: string
  kind: "new-row" | "edit-row"
  status: "draft" | "checked" | "applied" | "cancelled"
  sourceDealId?: string
  sourceSheetRow: number | null
  sourceSnapshot: Record<string, unknown>
  customer: string
  manager: string
  team: string
  month: string
  amount: number
  currency: string
  note: string
  createdBy: string | null
  updatedBy: string | null
  checkedBy: string | null
  checkedAt: string | null
  appliedBy: string | null
  appliedAt: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
const drafts = new Map<string, DraftLike>()
const applyImpl = vi.fn(async (id: string, actor: string) => {
  calls.push(`apply:${id}`)
  const draft = drafts.get(id)
  if (!draft || draft.status !== "checked") return null
  return { ...draft, status: "applied" as const, appliedBy: actor, appliedAt: "2026-10-23T03:00:00Z" }
})
const NOT_READY = "매출 장부 내부 원본 DB 마이그레이션이 아직 적용되지 않았습니다."
const DUPLICATE = "이미 이 딜·월에 적용된 정정 항목이 있습니다. 기존 항목을 먼저 반전한 뒤 다시 적용하세요."
const DRAFT_CHANGED = "반영하는 사이 초안이 바뀌었습니다 — 새로고침 뒤 다시 반영해 주세요."
// 시트에 쓰는 사이 같은 초안을 고치는 사람 흉내(쓰기 호출 안에서 부른다).
let editDuringWrite: (() => void) | null = null
// (딜, 월) 활성 정정 항목(장부 유일성 인덱스 대상).
let activeEntries: Array<{ id: string; draftId: string | null; sourceDealId: string; month: string }> = []
let activeEntriesFailure: Error | null = null
vi.mock("@/lib/repositories/branch-sales-ledger-drafts", () => ({
  applyBranchSalesLedgerDraft: (id: string, actor: string) => applyImpl(id, actor),
  // 실제 RPC 처럼: checked 가 아니면 null, updated_at 이 계획 때와 다르면 던지고, 같으면 기존 apply.
  applyBranchSalesLedgerDraftIfUnchanged: async (id: string, actor: string, expectedUpdatedAt: string) => {
    const draft = drafts.get(id)
    if (draft && draft.status === "checked" && draft.updatedAt !== expectedUpdatedAt) {
      calls.push(`apply-changed:${id}`)
      throw new Error(DRAFT_CHANGED)
    }
    return applyImpl(id, actor)
  },
  findActiveManualEditEntries: async (pairs: Array<{ sourceDealId: string; month: string }>) => {
    calls.push("entries")
    if (activeEntriesFailure) throw activeEntriesFailure
    return activeEntries.filter((entry) => pairs.some((pair) => pair.sourceDealId === entry.sourceDealId && pair.month === entry.month))
  },
  isBranchSalesLedgerDraftChangedError: (e: unknown) => e instanceof Error && e.message === DRAFT_CHANGED,
  fetchBranchSalesLedgerDraftById: async (id: string) => (drafts.get(id) ? { ...drafts.get(id)! } : null),
  isBranchSalesLedgerDraftsNotReadyError: (e: unknown) => e instanceof Error && e.message.includes("매출 장부"),
  isBranchSalesLedgerDuplicateActiveCorrectionError: (e: unknown) => e instanceof Error && e.message === DUPLICATE,
  isBranchSalesLedgerNonPositiveAmountError: () => false,
}))

// ── 시트 쓰기 감사 저장소 목(메모리) ─────────────────────────────
interface Attempt { id: string; draftId: string; status: string; code: string; error: string | null; writtenAt: string | null; entryId: string | null; cells: unknown[]; rowId: string | null }
const attempts: Attempt[] = []
let insertFailure: Error | null = null
vi.mock("@/lib/repositories/branch-sales-ledger-sheet-writes", () => ({
  insertSheetWriteAttempts: async (rows: Array<Omit<Attempt, "id" | "writtenAt" | "entryId"> & { error?: string | null }>) => {
    calls.push(`insert:${rows.map((row) => `${row.draftId}=${row.status}`).join(",")}`)
    if (insertFailure) throw insertFailure
    const inserted = rows.map((row, index) => ({
      ...row,
      id: `attempt-${attempts.length + index + 1}`,
      error: row.error ?? null,
      writtenAt: null,
      entryId: null,
      batchId: "b",
      sheetRow: null,
      month: null,
      actor: "tester",
      createdAt: "2026-10-23T03:00:00Z",
    }))
    attempts.push(...inserted)
    return inserted
  },
  updateSheetWriteAttempt: async (id: string, patch: Partial<Attempt>) => {
    calls.push(`update:${id}=${patch.status ?? ""}/${patch.code ?? ""}`)
    const attempt = attempts.find((candidate) => candidate.id === id)
    if (attempt) Object.assign(attempt, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)))
  },
  isSheetWritesNotReadyError: (e: unknown) => e instanceof Error && e.message.includes("마이그레이션"),
  findLedgerEntryIdByDraftId: async (draftId: string) => `entry-of-${draftId}`,
}))

import { applyLedgerDraftsWithSheetWrite } from "@/lib/branch/sheet-writeback/apply-service"

// ── 그리드 ↔ API 변환, batchUpdate 흉내 ──────────────────────────
const TARGET = "1vBYyKc_pd5Kb2xyhDWG8lWMAd7fGsRcBoF_wK1wUc7Q"

function toApi(grid: LiveGrid) {
  return {
    sheets: [{
      properties: { sheetId: grid.sheetId, title: grid.title },
      data: [{
        rowData: grid.rows.map((row) => ({
          values: row.map((cell) => ({
            formattedValue: cell.text ?? undefined,
            effectiveValue: cell.value != null ? { numberValue: cell.value } : undefined,
            userEnteredValue: cell.formula
              ? { formulaValue: cell.formula }
              : cell.value != null
                ? { numberValue: cell.value }
                : cell.text
                  ? { stringValue: cell.text }
                  : undefined,
            effectiveFormat: cell.fg ? { textFormat: { foregroundColor: cell.fg } } : undefined,
          })),
        })),
      }],
    }],
  }
}

type UpdateCells = { updateCells: { range: { startRowIndex: number; startColumnIndex: number }; rows: Array<{ values: Array<Record<string, { numberValue?: number; textFormat?: { foregroundColor: Record<string, number> } }>> }>; fields: string } }

/** 요청을 그리드에 적용하고 월 합계 수식을 다시 계산한 그리드. */
function simulate(grid: LiveGrid, requests: UpdateCells[]): LiveGrid {
  const next = cloneGrid(grid)
  for (const { updateCells } of requests) {
    const { startRowIndex: row, startColumnIndex: col } = updateCells.range
    const data = updateCells.rows[0].values[0]
    const cell = next.rows[row][col]
    if (updateCells.fields.includes("userEnteredValue")) {
      cell.value = data.userEnteredValue?.numberValue ?? null
      cell.text = cell.value != null ? `¥${cell.value}` : null
    }
    if (updateCells.fields.includes("foregroundColor")) cell.fg = data.userEnteredFormat?.textFormat?.foregroundColor ?? null
    for (const monthBlock of blocks()) {
      const sum = monthBlock.weekCols.reduce((total, weekCol) => total + (next.rows[row][weekCol].value ?? 0), 0)
      next.rows[row][monthBlock.totalCol].value = sum
    }
  }
  return next
}

// ── 시나리오 ─────────────────────────────────────────────────────
const oct = block("2026-10")
const rowA: RowSpec = { rowId: ROW_A, customer: "가나학원", months: { "2026-10": [{}, {}, {}, { v: 300, fg: RED }, {}] } }
const rowB: RowSpec = { rowId: ROW_B, customer: "다라학원", months: { "2026-10": [{}, {}, {}, { v: 900, fg: BLUE }, {}] } }
const baselineA = baselineFor(ROW_A, "가나학원", "2026-10", [
  { value: 0, color: "k" }, { value: 0, color: "k" }, { value: 0, color: "k" }, { value: 300, color: "r" }, { value: 0, color: "k" },
])

function addDraft(partial: Partial<DraftLike> & { id: string }) {
  drafts.set(partial.id, {
    kind: "edit-row",
    status: "checked",
    sourceDealId: "deal-a",
    sourceSheetRow: 3,
    sourceSnapshot: { sheetBaseline: baselineA },
    customer: "가나학원",
    manager: "김",
    team: "BD",
    month: "2026-10",
    amount: 500,
    currency: "CNY",
    note: "",
    createdBy: "tester",
    updatedBy: "tester",
    checkedBy: "tester",
    checkedAt: "2026-10-23T02:00:00Z",
    appliedBy: null,
    appliedAt: null,
    metadata: { confidence: "confirmed", confidenceTouched: false },
    createdAt: "2026-10-23T01:00:00Z",
    updatedAt: "2026-10-23T02:00:00Z",
    ...partial,
  })
}

let liveGrid: LiveGrid
let afterTransform: ((grid: LiveGrid) => LiveGrid) | null = null

beforeEach(() => {
  calls.length = 0
  attempts.length = 0
  drafts.clear()
  insertFailure = null
  afterTransform = null
  editDuringWrite = null
  activeEntries = []
  activeEntriesFailure = null
  applyImpl.mockClear()
  sheetsGet.mockReset()
  sheetsBatchUpdate.mockReset()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-23T03:00:00Z")) // KST 10-23 12:00, FY2026
  vi.stubEnv("BRANCH_REV_SHEET_WRITE_ENABLED", "1")
  vi.stubEnv("VERCEL_ENV", "production")
  vi.stubEnv("GOOGLE_BRANCH_DASHBOARD_SHEET_ID", TARGET)
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})

  liveGrid = buildGrid([rowA, rowB])
  sheetsGet.mockImplementation(async () => ({ data: toApi(liveGrid) }))
  sheetsBatchUpdate.mockImplementation(async (params: { requestBody: { requests: UpdateCells[] } }) => {
    let after = simulate(liveGrid, params.requestBody.requests)
    if (afterTransform) after = afterTransform(after)
    liveGrid = after
    editDuringWrite?.()
    return { data: { updatedSpreadsheet: toApi(after) } }
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("off 모드 — 지금 경로 그대로", () => {
  it("시트를 읽지도 쓰지도 않고 각 초안을 장부에만 반영한다(sheet disabled)", async () => {
    vi.stubEnv("BRANCH_REV_SHEET_WRITE_ENABLED", "")
    addDraft({ id: "a" })
    addDraft({ id: "n", kind: "new-row" })
    addDraft({ id: "u", status: "draft" })
    const { mode, results } = await applyLedgerDraftsWithSheetWrite(["a", "n", "u"], "tester")
    expect(mode).toBe("off")
    expect(calls).toEqual(["apply:a", "apply:n", "apply:u"])
    expect(results.map((result) => [result.id, result.ok, result.status, result.sheet.code])).toEqual([
      ["a", true, 200, "disabled"],
      ["n", true, 200, "disabled"],
      ["u", false, 409, "disabled"],
    ])
    expect(results[2].error).toBe("체크 완료 초안만 적용할 수 있습니다.")
    expect(attempts).toEqual([])
  })

  it("Preview(VERCEL_ENV≠production) 도 off", async () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    addDraft({ id: "a" })
    const { mode } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(mode).toBe("off")
    expect(sheetsGet).not.toHaveBeenCalled()
    expect(sheetsBatchUpdate).not.toHaveBeenCalled()
  })

  it("장부 반영 오류는 기존 라우트와 같은 상태·문구로 번역한다", async () => {
    vi.stubEnv("BRANCH_REV_SHEET_WRITE_ENABLED", "")
    addDraft({ id: "a" })
    applyImpl.mockImplementationOnce(async () => { throw new Error(NOT_READY) })
    applyImpl.mockImplementationOnce(async () => { throw new Error(DUPLICATE) })
    applyImpl.mockImplementationOnce(async () => { throw new Error("boom") })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a", "a2", "a3"], "tester")
    expect(results.map((result) => [result.status, result.error])).toEqual([
      [503, NOT_READY],
      [409, DUPLICATE],
      [500, "Failed to update sales ledger draft"],
    ])
  })
})

describe("on 모드 — 성공 경로와 순서", () => {
  it("감사 행 sending → batchUpdate 한 번 → 확인 → 장부 반영 → written", async () => {
    addDraft({ id: "a" })
    const { mode, results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(mode).toBe("on")
    expect(results).toEqual([expect.objectContaining({ id: "a", ok: true, status: 200, sheet: { code: "written", message: "시트에 반영됨" } })])
    expect(calls).toEqual([
      "sheets.get",
      "entries",
      "insert:a=sending",
      "sheets.batchUpdate",
      "apply:a",
      "update:attempt-1=written/written",
    ])
    expect(liveGrid.rows[2][oct.weekCols[3]].value).toBe(500)
    expect(attempts[0]).toMatchObject({ status: "written", code: "written", entryId: "entry-of-a", rowId: ROW_A })
    expect(attempts[0].writtenAt).toBeTruthy()
  })

  it("new-row 는 시트를 읽지 않고 장부에만(new_row_app_only), 체크 안 된 초안은 409", async () => {
    addDraft({ id: "n", kind: "new-row" })
    addDraft({ id: "u", status: "draft" })
    const { results } = await applyLedgerDraftsWithSheetWrite(["n", "u", "missing"], "tester")
    expect(results.map((result) => [result.id, result.ok, result.status, result.sheet.code])).toEqual([
      ["n", true, 200, "new_row_app_only"],
      ["u", false, 409, "not_applied"],
      ["missing", false, 409, "not_applied"],
    ])
    expect(calls).toEqual(["apply:n"])
  })

  it("이미 시트에 의도한 값이 있으면(이전 결과 모름) 쓰지 않고 장부만 — already_written", async () => {
    liveGrid = buildGrid([{ ...rowA, months: { "2026-10": [{}, {}, {}, { v: 500, fg: RED }, {}] } }, rowB])
    addDraft({ id: "a" })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: true, sheet: { code: "already_written" } })
    expect(sheetsBatchUpdate).not.toHaveBeenCalled()
    expect(attempts[0]).toMatchObject({ status: "written", code: "already_written" })
  })

  it("한 번에 50건을 넘으면 앞의 50건만, 나머지는 400", async () => {
    const ids = Array.from({ length: 52 }, (_, index) => `n${index}`)
    for (const id of ids) addDraft({ id, kind: "new-row" })
    const { results } = await applyLedgerDraftsWithSheetWrite(ids, "tester")
    expect(results.filter((result) => result.ok)).toHaveLength(50)
    expect(results.slice(50).map((result) => result.status)).toEqual([400, 400])
    expect(applyImpl).toHaveBeenCalledTimes(50)
  })
})

describe("on 모드 — 실패는 장부를 건드리지 않는다", () => {
  it("충돌(시트가 바뀜)이면 batchUpdate 0회·장부 반영 0회·감사 행 refused", async () => {
    liveGrid = buildGrid([{ ...rowA, months: { "2026-10": [{}, {}, {}, { v: 350, fg: RED }, {}] } }, rowB])
    addDraft({ id: "a" })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: false, status: 409, sheet: { code: "conflict" }, error: "시트가 바뀌었습니다 — 새로고침 뒤 다시 입력해 주세요" })
    expect(sheetsBatchUpdate).not.toHaveBeenCalled()
    expect(applyImpl).not.toHaveBeenCalled()
    expect(attempts.map((attempt) => [attempt.status, attempt.code])).toEqual([["refused", "conflict"]])
  })

  it("거절과 쓰기가 섞이면 쓸 것만 보낸다", async () => {
    addDraft({ id: "a" })
    addDraft({ id: "past", sourceSnapshot: { sheetBaseline: baselineFor(ROW_B, "다라학원", "2026-10", [
      { value: 0, color: "k" }, { value: 0, color: "k" }, { value: 0, color: "k" }, { value: 900, color: "b" }, { value: 0, color: "k" },
    ]) }, metadata: { weekly: [10, 0, 0, 900, 0], confidence: "expected" }, amount: 910 })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a", "past"], "tester")
    expect(results.map((result) => [result.id, result.ok, result.sheet.code])).toEqual([["a", true, "written"], ["past", false, "past_week"]])
    expect(sheetsBatchUpdate).toHaveBeenCalledTimes(1)
    expect(applyImpl).toHaveBeenCalledTimes(1)
  })

  it.each([
    [{ status: 400 }, "sheet_error", 502],
    [{ status: 403 }, "sheet_permission", 409],
  ])("batchUpdate 4xx(%j) → failed·장부 반영 0회", async (error, code, status) => {
    sheetsBatchUpdate.mockRejectedValue(error)
    addDraft({ id: "a" })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: false, status, sheet: { code } })
    expect(applyImpl).not.toHaveBeenCalled()
    expect(attempts[0]).toMatchObject({ status: "failed", code })
  })

  it.each([
    ["5xx", { status: 503 }],
    ["마감 초과", Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })],
    ["네트워크", Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })],
  ])("batchUpdate %s → unknown·재송신 0·장부 반영 0회·202", async (_label, error) => {
    sheetsBatchUpdate.mockRejectedValue(error)
    addDraft({ id: "a" })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: false, status: 202, sheet: { code: "outcome_unknown" } })
    expect(sheetsBatchUpdate).toHaveBeenCalledTimes(1)
    expect(applyImpl).not.toHaveBeenCalled()
    expect(attempts[0]).toMatchObject({ status: "unknown", code: "outcome_unknown" })
  })

  it("결과 모름 뒤 다시 누르면 시트에 이미 값이 있어 already_written 으로 마무리된다", async () => {
    addDraft({ id: "a" })
    // 1회차: 시트에는 반영됐지만 응답을 못 받음
    sheetsBatchUpdate.mockImplementationOnce(async (params: { requestBody: { requests: UpdateCells[] } }) => {
      liveGrid = simulate(liveGrid, params.requestBody.requests)
      throw { status: 502 }
    })
    const first = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(first.results[0].sheet.code).toBe("outcome_unknown")
    const second = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(second.results[0]).toMatchObject({ ok: true, sheet: { code: "already_written" } })
    expect(sheetsBatchUpdate).toHaveBeenCalledTimes(1)
    expect(applyImpl).toHaveBeenCalledTimes(1)
  })

  it("다시 읽기 실패 → 아무것도 쓰지 않음(결과 모름은 sheet_error 로 낮춤)", async () => {
    sheetsGet.mockRejectedValue({ status: 503 })
    addDraft({ id: "a" })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: false, status: 502, sheet: { code: "sheet_error" } })
    expect(sheetsBatchUpdate).not.toHaveBeenCalled()
    expect(applyImpl).not.toHaveBeenCalled()
    expect(attempts[0]).toMatchObject({ status: "failed", code: "sheet_error" })
  })

  it("env 시트 ID 가 쓰기 대상과 다르면 읽지도 쓰지도 않는다(not_allowed)", async () => {
    vi.stubEnv("GOOGLE_BRANCH_DASHBOARD_SHEET_ID", "some-copy")
    addDraft({ id: "a" })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: false, status: 409, sheet: { code: "not_allowed" } })
    expect(sheetsGet).not.toHaveBeenCalled()
    expect(sheetsBatchUpdate).not.toHaveBeenCalled()
  })

  it("감사 행을 못 남기면 시트에 쓰지 않는다(500)", async () => {
    insertFailure = new Error("매출 장부 시트 쓰기 기록 DB 마이그레이션이 아직 적용되지 않았습니다.")
    addDraft({ id: "a" })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: false, status: 500, sheet: { code: "not_applied" } })
    expect(sheetsBatchUpdate).not.toHaveBeenCalled()
    expect(applyImpl).not.toHaveBeenCalled()
  })

  it("쓰는 사이 행이 움직이면 row_shifted — 한 번 되돌리고 장부 반영 0회", async () => {
    addDraft({ id: "a" })
    // 쓰기 직전에 B 가 A 자리(3행)로 올라온 상황: 3행에 쓴 값은 B 의 칸에 들어간다.
    let shiftedOnce = false
    sheetsBatchUpdate.mockImplementation(async (params: { requestBody: { requests: UpdateCells[] } }) => {
      if (!shiftedOnce) {
        shiftedOnce = true
        liveGrid = buildGrid([rowB, rowA])
      }
      liveGrid = simulate(liveGrid, params.requestBody.requests)
      return { data: { updatedSpreadsheet: toApi(liveGrid) } }
    })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: false, status: 409, sheet: { code: "row_shifted" } })
    expect(sheetsBatchUpdate).toHaveBeenCalledTimes(2) // 쓰기 1 + 되돌리기 1
    expect(liveGrid.rows[2][oct.weekCols[3]].value).toBe(900) // B 의 원래 값으로 되돌아옴
    expect(applyImpl).not.toHaveBeenCalled()
    expect(attempts[0]).toMatchObject({ status: "failed", code: "row_shifted", error: "restored" })
  })

  it("되읽은 값이 다르면 verify_mismatch — 장부 반영 0회", async () => {
    afterTransform = (grid) => {
      grid.rows[2][oct.weekCols[3]].value = 499
      return grid
    }
    addDraft({ id: "a" })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: false, status: 502, sheet: { code: "verify_mismatch" } })
    expect(applyImpl).not.toHaveBeenCalled()
    expect(attempts[0]).toMatchObject({ status: "failed", code: "verify_mismatch" })
  })

  it("시트 반영 뒤 장부 반영이 실패하면 written + db_apply_failed(500)", async () => {
    applyImpl.mockImplementationOnce(async () => {
      calls.push("apply:fail")
      throw new Error("boom")
    })
    addDraft({ id: "a" })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: false, status: 500, sheet: { code: "db_apply_failed" } })
    expect(attempts[0]).toMatchObject({ status: "written", code: "db_apply_failed" })
    expect(attempts[0].writtenAt).toBeTruthy()
    // 다시 누르면 시트는 이미 의도한 값 → 쓰지 않고 장부만 마무리
    const retry = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(retry.results[0]).toMatchObject({ ok: true, sheet: { code: "already_written" } })
    expect(sheetsBatchUpdate).toHaveBeenCalledTimes(1)
  })
})

describe("on 모드 — 행·열이 움직였는데 되돌리지 못하면 '되돌렸다'고 말하지 않는다", () => {
  it("대상 행 위에 Row ID 없는 새 행이 끼면 되돌릴 행을 못 찾는다 → row_shifted_unrestored(되돌리기 호출 없음)", async () => {
    addDraft({ id: "a" })
    let insertedOnce = false
    sheetsBatchUpdate.mockImplementation(async (params: { requestBody: { requests: UpdateCells[] } }) => {
      if (!insertedOnce) {
        insertedOnce = true
        liveGrid = buildGrid([{ rowId: null, customer: "새고객" }, rowA, rowB])
      }
      liveGrid = simulate(liveGrid, params.requestBody.requests)
      return { data: { updatedSpreadsheet: toApi(liveGrid) } }
    })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({
      ok: false,
      status: 409,
      sheet: { code: "row_shifted_unrestored", message: "쓰는 사이 시트 행·열이 움직였고 되돌리지 못했습니다 — 관리자가 감사 기록으로 복구해야 합니다" },
    })
    expect(results[0].sheet.message).not.toContain("되돌렸습니다")
    expect(sheetsBatchUpdate).toHaveBeenCalledTimes(1) // 되돌릴 칸이 없으니 되돌리기 요청도 없다
    expect(liveGrid.rows[2][oct.weekCols[3]].value).toBe(500) // 새 행 칸에 남은 값 — 사람이 감사 cells 로 복구
    expect(applyImpl).not.toHaveBeenCalled()
    expect(attempts[0]).toMatchObject({ status: "failed", code: "row_shifted_unrestored", error: "restore_not_found" })
  })

  it("되돌리기 호출이 실패하면 row_shifted_unrestored(restore_failed)", async () => {
    addDraft({ id: "a" })
    let call = 0
    sheetsBatchUpdate.mockImplementation(async (params: { requestBody: { requests: UpdateCells[] } }) => {
      call += 1
      if (call === 1) {
        liveGrid = buildGrid([rowB, rowA])
        liveGrid = simulate(liveGrid, params.requestBody.requests)
        return { data: { updatedSpreadsheet: toApi(liveGrid) } }
      }
      throw { status: 503 }
    })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: false, status: 409, sheet: { code: "row_shifted_unrestored" } })
    expect(sheetsBatchUpdate).toHaveBeenCalledTimes(2)
    expect(attempts[0]).toMatchObject({ status: "failed", code: "row_shifted_unrestored" })
    expect(attempts[0].error).toMatch(/^restore_failed: /)
  })

  it("쓰는 사이 열이 끼면(머리 구조가 바뀜) 행 이동으로 보지 않고 되돌리지도 않는다", async () => {
    addDraft({ id: "a" })
    // A~M 사이(F 앞)에 열 하나가 들어온 상태로 되읽힌다 — 옛 열 번호로 쓴 칸은 다른 칸에 들어갔다.
    afterTransform = (grid) => {
      grid.header.splice(5, 0, null)
      for (const row of grid.rows) row.splice(5, 0, { value: null, formula: null, fg: null, text: null })
      return grid
    }
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: false, status: 409, sheet: { code: "row_shifted_unrestored" } })
    expect(sheetsBatchUpdate).toHaveBeenCalledTimes(1)
    expect(applyImpl).not.toHaveBeenCalled()
    expect(attempts[0]).toMatchObject({ status: "failed", code: "row_shifted_unrestored", error: "layout_changed" })
  })
})

describe("on 모드 — 장부가 막을 것이 확실한 반영은 시트에 쓰기 전에 멈춘다", () => {
  it("같은 딜·월에 활성 정정이 있으면 active_correction — batchUpdate 0회·장부 반영 0회", async () => {
    activeEntries = [{ id: "entry-old", draftId: "old-draft", sourceDealId: "deal-a", month: "2026-10" }]
    addDraft({ id: "a" })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({
      ok: false,
      status: 409,
      sheet: { code: "active_correction" },
      error: "이 딜·월에 이미 적용된 정정이 있어 시트에 쓰지 않았습니다 — 새로고침 뒤 다시 입력하거나 기존 항목을 먼저 되돌려 주세요",
    })
    expect(sheetsBatchUpdate).not.toHaveBeenCalled()
    expect(applyImpl).not.toHaveBeenCalled()
    expect(liveGrid.rows[2][oct.weekCols[3]].value).toBe(300)
    expect(attempts.map((attempt) => [attempt.status, attempt.code])).toEqual([["refused", "active_correction"]])
  })

  it("다른 달·자기 자신의 항목은 막지 않는다", async () => {
    activeEntries = [
      { id: "entry-nov", draftId: "old-draft", sourceDealId: "deal-a", month: "2026-11" },
      { id: "entry-self", draftId: "a", sourceDealId: "deal-a", month: "2026-10" },
    ]
    addDraft({ id: "a" })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: true, sheet: { code: "written" } })
  })

  it("이미 쓰인(already_written) 재시도도 활성 정정이 있으면 장부에서 실패하기 전에 멈춘다", async () => {
    liveGrid = buildGrid([{ ...rowA, months: { "2026-10": [{}, {}, {}, { v: 500, fg: RED }, {}] } }, rowB])
    activeEntries = [{ id: "entry-old", draftId: "old-draft", sourceDealId: "deal-a", month: "2026-10" }]
    addDraft({ id: "a" })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: false, status: 409, sheet: { code: "active_correction" } })
    expect(applyImpl).not.toHaveBeenCalled()
  })

  it("활성 정정 확인이 실패하면 시트에 쓰지 않는다(fail closed)", async () => {
    activeEntriesFailure = new Error("[branch-sales-ledger-entries] 활성 정정 조회 실패: timeout")
    addDraft({ id: "a" })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: false, status: 500, sheet: { code: "not_applied" } })
    expect(sheetsBatchUpdate).not.toHaveBeenCalled()
    expect(applyImpl).not.toHaveBeenCalled()
  })
})

describe("on 모드 — 시트에 쓴 것과 다른 내용을 장부에 남기지 않는다", () => {
  it("쓰는 사이 같은 초안이 고쳐지면(PATCH 자가 체크) draft_changed — 장부 반영 0회", async () => {
    addDraft({ id: "a" })
    editDuringWrite = () => {
      const draft = drafts.get("a")!
      drafts.set("a", { ...draft, amount: 700, updatedAt: "2026-10-23T03:00:05Z" })
    }
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: false, status: 409, sheet: { code: "draft_changed" } })
    expect(calls).toContain("apply-changed:a")
    expect(applyImpl).not.toHaveBeenCalled()
    expect(liveGrid.rows[2][oct.weekCols[3]].value).toBe(500) // 시트에는 계획한 값
    expect(attempts[0]).toMatchObject({ status: "written", code: "draft_changed" })
  })

  it("바꿀 칸이 없으면 no_change 로 장부만 기록한다(시트 반영됨이 아니다)", async () => {
    addDraft({ id: "a", amount: 300, metadata: { confidence: "confirmed", confidenceTouched: false } })
    const { results } = await applyLedgerDraftsWithSheetWrite(["a"], "tester")
    expect(results[0]).toMatchObject({ ok: true, sheet: { code: "no_change", message: "시트에서 바뀌는 칸이 없어 장부만 기록" } })
    expect(sheetsBatchUpdate).not.toHaveBeenCalled()
    expect(attempts[0]).toMatchObject({ status: "written", code: "no_change" })
  })
})
