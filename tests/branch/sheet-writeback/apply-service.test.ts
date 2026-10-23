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
vi.mock("@/lib/repositories/branch-sales-ledger-drafts", () => ({
  applyBranchSalesLedgerDraft: (id: string, actor: string) => applyImpl(id, actor),
  fetchBranchSalesLedgerDraftById: async (id: string) => drafts.get(id) ?? null,
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
