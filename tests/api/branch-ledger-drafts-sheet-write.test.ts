// REV 시트 쓰기(ADR-011) — 장부 초안 라우트의 시트 쓰기 배선.
//  - [id] PATCH action=apply · batch PATCH action=apply 는 반영 서비스(applyLedgerDraftsWithSheetWrite)를 거치고
//    항목마다 sheet(코드 + 고정 문구)를 싣는다. 202(시트 반영 여부 모름)는 ok:false 로 내려간다.
//  - [id] PATCH action=reverse 는 최신 시트 시도가 written 이면 409 — 장부만 상쇄하면 시트와 갈라진다.
//  - GET 은 sheetWrite{mode,lastRevSyncStartedAt,health} 와 sheetWrites(초안 id → 최신 시도)를 내려준다.
//  - 본문 파서는 sourceSnapshot.sheetBaseline 과 metadata.confidenceTouched 를 검증한다.
// 반영 서비스·시트 쓰기 감사 저장소·초안 저장소는 전부 목이다 — 실제 시트·DB 호출 없음.
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SHEET_WRITE_MESSAGES, type SheetWriteCode } from "@/lib/branch/sheet-writeback/messages"

const requireVerifiedAdminContext = vi.fn()
const createBranchSalesLedgerDraft = vi.fn()
const updateBranchSalesLedgerDraft = vi.fn()
const applyBranchSalesLedgerDraft = vi.fn()
const deleteBranchSalesLedgerDraft = vi.fn()
const reverseBranchSalesLedgerEntryByDraftId = vi.fn()
const listBranchSalesLedgerDrafts = vi.fn()
const listBranchSalesLedgerEntries = vi.fn()
const applyLedgerDraftsWithSheetWrite = vi.fn()
const latestSheetWritesByDraftIds = vi.fn()
const lastSuccessfulRevSyncStartedAt = vi.fn()

const NOT_READY_MESSAGE = "매출 장부 내부 원본 DB 마이그레이션이 아직 적용되지 않았습니다."
const SHEET_WRITES_NOT_READY_MESSAGE = "매출 장부 시트 쓰기 기록 DB 마이그레이션이 아직 적용되지 않았습니다."
const NON_POSITIVE_AMOUNT_MESSAGE = "금액이 0 이하인 초안은 체크 완료할 수 없습니다. 금액을 입력한 뒤 다시 시도하세요."
const REVERSE_WRITTEN_MESSAGE = "시트에 반영된 항목입니다 — 시트에서 직접 되돌리거나 원래 값으로 다시 입력해 주세요"
const SHEET_WRITE_HISTORY_DELETE_MESSAGE = "시트 반영 시도 기록이 있는 초안은 삭제할 수 없습니다 — 취소로 정리해 주세요."

vi.mock("@/lib/admin-auth", () => ({
  BRANCH_READ_ADMIN_API_ROLES: ["ADMIN"],
  CRM_STAFF_ADMIN_API_ROLES: ["ADMIN"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/branch-sales-ledger-drafts", () => ({
  BRANCH_SALES_LEDGER_DRAFT_STATUSES: ["draft", "checked", "applied", "cancelled"],
  createBranchSalesLedgerDraft,
  updateBranchSalesLedgerDraft,
  applyBranchSalesLedgerDraft,
  deleteBranchSalesLedgerDraft,
  reverseBranchSalesLedgerEntryByDraftId,
  LEDGER_LIST_MAX: 1000,
  listBranchSalesLedgerDrafts,
  listBranchSalesLedgerEntries,
  isBranchSalesLedgerDraftsNotReadyError: (error: unknown) => error instanceof Error && error.message === NOT_READY_MESSAGE,
  isBranchSalesLedgerDuplicateActiveCorrectionError: () => false,
  isBranchSalesLedgerNonPositiveAmountError: (error: unknown) =>
    error instanceof Error && error.message === NON_POSITIVE_AMOUNT_MESSAGE,
  isBranchSalesLedgerDraftHasSheetWritesError: (error: unknown) =>
    error instanceof Error && error.message === SHEET_WRITE_HISTORY_DELETE_MESSAGE,
}))

vi.mock("@/lib/branch/sheet-writeback/apply-service", () => ({ applyLedgerDraftsWithSheetWrite }))

vi.mock("@/lib/repositories/branch-sales-ledger-sheet-writes", () => ({
  latestSheetWritesByDraftIds,
  lastSuccessfulRevSyncStartedAt,
  isSheetWritesNotReadyError: (error: unknown) =>
    error instanceof Error && error.message === SHEET_WRITES_NOT_READY_MESSAGE,
}))

function mockAdmin() {
  requireVerifiedAdminContext.mockResolvedValue({ source: "supabase", role: "ADMIN", name: "Tester", userId: "admin-1" })
}

function jsonRequest(url: string, method: string, body: Record<string, unknown>) {
  return new NextRequest(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
}

function patchOne(id: string, body: Record<string, unknown>) {
  return jsonRequest(`https://classin.kr/api/admin/branch/ledger-drafts/${id}`, "PATCH", body)
}

function patchBatch(body: Record<string, unknown>) {
  return jsonRequest("https://classin.kr/api/admin/branch/ledger-drafts/batch", "PATCH", body)
}

function sheet(code: SheetWriteCode) {
  return { code, message: SHEET_WRITE_MESSAGES[code] }
}

function draft(id: string, extra: Record<string, unknown> = {}) {
  return { id, kind: "edit-row", status: "applied", ...extra }
}

function attempt(draftId: string, extra: Record<string, unknown> = {}) {
  return {
    id: `attempt-${draftId}`,
    draftId,
    batchId: "batch-1",
    status: "written",
    code: "written",
    rowId: "r_0123456789ab",
    sheetRow: 15,
    month: "2026-10",
    cells: [],
    actor: "Tester",
    error: null,
    entryId: null,
    createdAt: "2026-10-23T01:00:00.000Z",
    writtenAt: "2026-10-23T01:00:01.000Z",
    ...extra,
  }
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe("PATCH /api/admin/branch/ledger-drafts/[id] action=apply — 반영 서비스를 거친다", () => {
  it("서비스를 ([id], actor)로 한 번 부르고, 성공이면 draft 와 sheet 를 돌려준다(RPC 를 직접 부르지 않는다)", async () => {
    mockAdmin()
    applyLedgerDraftsWithSheetWrite.mockResolvedValue({
      mode: "on",
      results: [{ id: "draft-1", ok: true, status: 200, draft: draft("draft-1"), sheet: sheet("written") }],
    })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "apply" }), params("draft-1"))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ draft: draft("draft-1"), sheet: sheet("written") })
    expect(applyLedgerDraftsWithSheetWrite).toHaveBeenCalledTimes(1)
    expect(applyLedgerDraftsWithSheetWrite).toHaveBeenCalledWith(["draft-1"], "Tester")
    expect(applyBranchSalesLedgerDraft).not.toHaveBeenCalled()
  })

  it("거절·충돌은 서비스의 상태·문구 그대로(409) — ok:false 와 sheet 를 싣는다", async () => {
    mockAdmin()
    applyLedgerDraftsWithSheetWrite.mockResolvedValue({
      mode: "on",
      results: [{ id: "draft-1", ok: false, status: 409, error: SHEET_WRITE_MESSAGES.conflict, sheet: sheet("conflict") }],
    })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "apply" }), params("draft-1"))
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json).toEqual({ ok: false, error: SHEET_WRITE_MESSAGES.conflict, sheet: sheet("conflict") })
  })

  it("결과 모름(202)은 성공으로 숨기지 않는다 — ok:false · draft 없음 · error 문구", async () => {
    mockAdmin()
    applyLedgerDraftsWithSheetWrite.mockResolvedValue({
      mode: "on",
      results: [
        { id: "draft-1", ok: false, status: 202, error: SHEET_WRITE_MESSAGES.outcome_unknown, sheet: sheet("outcome_unknown") },
      ],
    })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "apply" }), params("draft-1"))
    const json = await response.json()

    expect(response.status).toBe(202)
    expect(json.ok).toBe(false)
    expect(json.draft).toBeUndefined()
    expect(json.error).toBe(SHEET_WRITE_MESSAGES.outcome_unknown)
    expect(json.sheet).toEqual(sheet("outcome_unknown"))
  })

  it("서비스가 담은 기존 번역(마이그레이션 미적용 503 · 체크 완료 아님 409)을 그대로 내려준다", async () => {
    mockAdmin()
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    applyLedgerDraftsWithSheetWrite.mockResolvedValueOnce({
      mode: "off",
      results: [{ id: "draft-1", ok: false, status: 503, error: NOT_READY_MESSAGE, sheet: sheet("disabled") }],
    })
    const notReady = await PATCH(patchOne("draft-1", { action: "apply" }), params("draft-1"))
    expect(notReady.status).toBe(503)
    expect((await notReady.json()).error).toBe(NOT_READY_MESSAGE)

    applyLedgerDraftsWithSheetWrite.mockResolvedValueOnce({
      mode: "off",
      results: [{ id: "draft-1", ok: false, status: 409, error: "체크 완료 초안만 적용할 수 있습니다.", sheet: sheet("disabled") }],
    })
    const notChecked = await PATCH(patchOne("draft-1", { action: "apply" }), params("draft-1"))
    expect(notChecked.status).toBe(409)
    expect(await notChecked.json()).toEqual({
      ok: false,
      error: "체크 완료 초안만 적용할 수 있습니다.",
      sheet: sheet("disabled"),
    })
  })

  it("error 가 비면 sheet 문구로 채운다", async () => {
    mockAdmin()
    applyLedgerDraftsWithSheetWrite.mockResolvedValue({
      mode: "on",
      results: [{ id: "draft-1", ok: false, status: 409, sheet: sheet("past_week") }],
    })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "apply" }), params("draft-1"))

    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe(SHEET_WRITE_MESSAGES.past_week)
  })

  it("ok 인데 draft 가 없는 결과는 성공으로 내려가지 않는다(500)", async () => {
    mockAdmin()
    applyLedgerDraftsWithSheetWrite.mockResolvedValue({
      mode: "on",
      results: [{ id: "draft-1", ok: true, status: 200, sheet: sheet("written") }],
    })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "apply" }), params("draft-1"))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.ok).toBe(false)
  })

  it("서비스가 던진 예상 밖 오류는 기존 번역 사슬로 간다(미적용 503 · 그 밖 500 고정 문구)", async () => {
    mockAdmin()
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    applyLedgerDraftsWithSheetWrite.mockRejectedValueOnce(new Error(NOT_READY_MESSAGE))
    const notReady = await PATCH(patchOne("draft-1", { action: "apply" }), params("draft-1"))
    expect(notReady.status).toBe(503)

    applyLedgerDraftsWithSheetWrite.mockRejectedValueOnce(new Error("boom"))
    const generic = await PATCH(patchOne("draft-1", { action: "apply" }), params("draft-1"))
    expect(generic.status).toBe(500)
    expect((await generic.json()).error).toBe("Failed to update sales ledger draft")
  })
})

describe("PATCH /api/admin/branch/ledger-drafts/[id] action=reverse — 시트에 반영된 항목은 막는다", () => {
  it("최신 시트 시도가 written 이면 409 이고 장부 상쇄를 부르지 않는다", async () => {
    mockAdmin()
    latestSheetWritesByDraftIds.mockResolvedValue(new Map([["draft-1", attempt("draft-1")]]))
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "reverse" }), params("draft-1"))
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.error).toBe(REVERSE_WRITTEN_MESSAGE)
    expect(latestSheetWritesByDraftIds).toHaveBeenCalledWith(["draft-1"])
    expect(reverseBranchSalesLedgerEntryByDraftId).not.toHaveBeenCalled()
  })

  it("written + db_apply_failed(시트에는 쓰임)도 written 상태라 막는다", async () => {
    mockAdmin()
    latestSheetWritesByDraftIds.mockResolvedValue(new Map([["draft-1", attempt("draft-1", { code: "db_apply_failed" })]]))
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "reverse" }), params("draft-1"))

    expect(response.status).toBe(409)
    expect(reverseBranchSalesLedgerEntryByDraftId).not.toHaveBeenCalled()
  })

  it("sending(시트 확인 뒤 장부 반영까지 됐는데 감사 행 갱신만 실패한 경우 포함)도 막는다", async () => {
    mockAdmin()
    latestSheetWritesByDraftIds.mockResolvedValue(
      new Map([["draft-1", attempt("draft-1", { status: "sending", writtenAt: null })]]),
    )
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "reverse" }), params("draft-1"))

    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe(REVERSE_WRITTEN_MESSAGE)
    expect(reverseBranchSalesLedgerEntryByDraftId).not.toHaveBeenCalled()
  })

  it.each(["refused", "failed", "unknown"])("최신 시도가 %s 이면(시트에 쓰지 않았거나 장부 미반영) 기존 되돌리기를 그대로 한다", async (status) => {
    mockAdmin()
    latestSheetWritesByDraftIds.mockResolvedValue(new Map([["draft-1", attempt("draft-1", { status, writtenAt: null })]]))
    reverseBranchSalesLedgerEntryByDraftId.mockResolvedValue({ id: "entry-1", entryStatus: "reversed" })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "reverse", reason: "오입력" }), params("draft-1"))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ entry: { id: "entry-1", entryStatus: "reversed" } })
    expect(reverseBranchSalesLedgerEntryByDraftId).toHaveBeenCalledWith("draft-1", "Tester", "오입력")
  })

  it("시트에서 바뀌는 칸이 없던 반영(written·no_change)은 막지 않는다 — 시트에 쓴 것이 없다", async () => {
    mockAdmin()
    latestSheetWritesByDraftIds.mockResolvedValue(new Map([["draft-1", attempt("draft-1", { code: "no_change" })]]))
    reverseBranchSalesLedgerEntryByDraftId.mockResolvedValue({ id: "entry-1", entryStatus: "reversed" })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "reverse" }), params("draft-1"))

    expect(response.status).toBe(200)
    expect(reverseBranchSalesLedgerEntryByDraftId).toHaveBeenCalledWith("draft-1", "Tester", undefined)
  })

  it("시트 시도가 없거나 감사 표가 아직 없으면(마이그레이션 전) 기존 동작", async () => {
    mockAdmin()
    reverseBranchSalesLedgerEntryByDraftId.mockResolvedValue({ id: "entry-1", entryStatus: "reversed" })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    latestSheetWritesByDraftIds.mockResolvedValueOnce(new Map())
    expect((await PATCH(patchOne("draft-1", { action: "reverse" }), params("draft-1"))).status).toBe(200)

    latestSheetWritesByDraftIds.mockRejectedValueOnce(new Error(SHEET_WRITES_NOT_READY_MESSAGE))
    expect((await PATCH(patchOne("draft-1", { action: "reverse" }), params("draft-1"))).status).toBe(200)
    expect(reverseBranchSalesLedgerEntryByDraftId).toHaveBeenCalledTimes(2)
  })

  it("그 밖의 조회 실패는 fail closed — 500 이고 장부 상쇄를 부르지 않는다", async () => {
    mockAdmin()
    latestSheetWritesByDraftIds.mockRejectedValue(new Error("[branch-sales-ledger-sheet-writes] 조회 실패: timeout"))
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "reverse" }), params("draft-1"))

    expect(response.status).toBe(500)
    expect(reverseBranchSalesLedgerEntryByDraftId).not.toHaveBeenCalled()
  })

  it("reason 형식 오류는 시트 조회보다 먼저 400(기존 순서)", async () => {
    mockAdmin()
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "reverse", reason: 3 }), params("draft-1"))

    expect(response.status).toBe(400)
    expect(latestSheetWritesByDraftIds).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/admin/branch/ledger-drafts/batch action=apply — 서비스 한 번 · 항목별 sheet · 코드별 건수", () => {
  it("ids 묶음을 서비스에 한 번 넘기고, 항목마다 sheet 를 싣고, summary.sheet 에 코드별 건수를 센다", async () => {
    mockAdmin()
    applyLedgerDraftsWithSheetWrite.mockResolvedValue({
      mode: "on",
      results: [
        { id: "d1", ok: true, status: 200, draft: draft("d1"), sheet: sheet("written") },
        { id: "d2", ok: true, status: 200, draft: draft("d2"), sheet: sheet("written") },
        { id: "d3", ok: false, status: 409, error: SHEET_WRITE_MESSAGES.conflict, sheet: sheet("conflict") },
        { id: "d4", ok: true, status: 200, draft: draft("d4", { kind: "new-row" }), sheet: sheet("new_row_app_only") },
        { id: "d5", ok: false, status: 202, error: SHEET_WRITE_MESSAGES.outcome_unknown, sheet: sheet("outcome_unknown") },
      ],
    })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const response = await PATCH(patchBatch({ action: "apply", ids: ["d1", "d2", "d3", "d4", "d5"] }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(applyLedgerDraftsWithSheetWrite).toHaveBeenCalledTimes(1)
    expect(applyLedgerDraftsWithSheetWrite).toHaveBeenCalledWith(["d1", "d2", "d3", "d4", "d5"], "Tester")
    expect(applyBranchSalesLedgerDraft).not.toHaveBeenCalled()
    expect(json.results[0]).toEqual({ id: "d1", ok: true, status: 200, draft: draft("d1"), sheet: sheet("written") })
    expect(json.results[2]).toEqual({
      id: "d3",
      ok: false,
      status: 409,
      error: SHEET_WRITE_MESSAGES.conflict,
      sheet: sheet("conflict"),
    })
    expect(json.results[4]).toMatchObject({ id: "d5", ok: false, status: 202, sheet: sheet("outcome_unknown") })
    expect(json.results[4].draft).toBeUndefined()
    expect(json.summary).toEqual({
      total: 5,
      succeeded: 3,
      failed: 2,
      sheet: { written: 2, conflict: 1, new_row_app_only: 1, outcome_unknown: 1 },
    })
    expect(json.sheetWrite).toEqual({ mode: "on" })
  })

  it("서비스 결과 순서가 요청과 달라도 id 로 맞춰 요청 순서대로 돌려준다", async () => {
    mockAdmin()
    applyLedgerDraftsWithSheetWrite.mockResolvedValue({
      mode: "on",
      results: [
        { id: "d2", ok: false, status: 409, error: SHEET_WRITE_MESSAGES.past_week, sheet: sheet("past_week") },
        { id: "d1", ok: true, status: 200, draft: draft("d1"), sheet: sheet("written") },
      ],
    })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const json = await (await PATCH(patchBatch({ action: "apply", ids: ["d1", "d2"] }))).json()

    expect(json.results.map((item: { id: string; ok: boolean }) => [item.id, item.ok])).toEqual([
      ["d1", true],
      ["d2", false],
    ])
  })

  it("ok 인데 draft 가 없는 항목은 성공으로 세지 않는다", async () => {
    mockAdmin()
    applyLedgerDraftsWithSheetWrite.mockResolvedValue({
      mode: "on",
      results: [{ id: "d1", ok: true, status: 200, sheet: sheet("written") }],
    })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const json = await (await PATCH(patchBatch({ action: "apply", ids: ["d1"] }))).json()

    expect(json.results[0]).toMatchObject({ id: "d1", ok: false, status: 500 })
    expect(json.summary).toMatchObject({ total: 1, succeeded: 0, failed: 1 })
  })

  it("서비스가 던지면 묶음 전체 500 — 부분 성공으로 꾸미지 않는다", async () => {
    mockAdmin()
    applyLedgerDraftsWithSheetWrite.mockRejectedValue(new Error("boom"))
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const response = await PATCH(patchBatch({ action: "apply", ids: ["d1"] }))

    expect(response.status).toBe(500)
    expect((await response.json()).error).toBe("Failed to process sales ledger draft batch")
  })

  it("action=check 는 반영 서비스를 부르지 않는다", async () => {
    mockAdmin()
    updateBranchSalesLedgerDraft.mockResolvedValue({ outcome: "updated", draft: { id: "d1", status: "checked" } })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const json = await (await PATCH(patchBatch({ action: "check", ids: ["d1"] }))).json()

    expect(json.results[0]).toEqual({ id: "d1", ok: true, status: 200, draft: { id: "d1", status: "checked" } })
    expect(json.summary).toEqual({ total: 1, succeeded: 1, failed: 0 })
    expect(applyLedgerDraftsWithSheetWrite).not.toHaveBeenCalled()
  })
})

describe("GET /api/admin/branch/ledger-drafts — sheetWrite · sheetWrites", () => {
  function mockLists() {
    listBranchSalesLedgerDrafts.mockResolvedValue({
      generatedAt: "x",
      health: { ok: true, message: null },
      drafts: [{ id: "draft-a" }, { id: "draft-b" }],
    })
    listBranchSalesLedgerEntries.mockImplementation(async (options: { status?: string } = {}) => ({
      generatedAt: "x",
      health: { ok: true, message: null },
      entries:
        options.status === "reversed"
          ? [{ id: "entry-r", draftId: "draft-r", entryStatus: "reversed" }]
          : [
              { id: "entry-1", draftId: "draft-c", entryStatus: "active" },
              { id: "entry-2", entryStatus: "active" },
            ],
    }))
  }

  async function getJson() {
    const { GET } = await import("@/app/api/admin/branch/ledger-drafts/route")
    const response = await GET(new NextRequest("https://classin.kr/api/admin/branch/ledger-drafts"))
    return { response, json: await response.json() }
  }

  it("켜짐이면 mode on · 마지막 REV 동기화 시각 · 초안+장부 항목 초안 id 마다 최신 시도를 내려준다", async () => {
    vi.stubEnv("BRANCH_REV_SHEET_WRITE_ENABLED", "1")
    vi.stubEnv("VERCEL_ENV", "production")
    mockAdmin()
    mockLists()
    lastSuccessfulRevSyncStartedAt.mockResolvedValue("2026-10-23T08:00:00.000Z")
    latestSheetWritesByDraftIds.mockResolvedValue(
      new Map([
        ["draft-a", attempt("draft-a")],
        ["draft-c", attempt("draft-c", { status: "refused", code: "past_week", writtenAt: null, rowId: null })],
      ]),
    )

    const { response, json } = await getJson()

    expect(response.status).toBe(200)
    expect(json.sheetWrite).toEqual({
      mode: "on",
      lastRevSyncStartedAt: "2026-10-23T08:00:00.000Z",
      health: { ok: true, message: null },
    })
    expect(json.sheetWrites).toEqual({
      "draft-a": {
        status: "written",
        code: "written",
        message: SHEET_WRITE_MESSAGES.written,
        writtenAt: "2026-10-23T01:00:01.000Z",
        rowId: "r_0123456789ab",
      },
      "draft-c": { status: "refused", code: "past_week", message: SHEET_WRITE_MESSAGES.past_week, writtenAt: null, rowId: null },
    })
    // 목록 초안 + active 장부 항목의 draftId(없는 항목은 빼고). 상쇄된 항목은 오버레이 대상이 아니라 묻지 않는다.
    expect(latestSheetWritesByDraftIds).toHaveBeenCalledTimes(1)
    expect(latestSheetWritesByDraftIds.mock.calls[0][0]).toEqual(["draft-a", "draft-b", "draft-c"])
    // 기존 칸은 그대로다.
    expect(json.reversedDraftIds).toEqual(["draft-r"])
    expect(json.drafts).toEqual([{ id: "draft-a" }, { id: "draft-b" }])
  })

  it("sending(보내는 중·결과를 못 적고 끝남)은 반영됐다고 말하지 않는다 — 결과 모름 문구, code 는 저장값 그대로", async () => {
    mockAdmin()
    mockLists()
    lastSuccessfulRevSyncStartedAt.mockResolvedValue(null)
    latestSheetWritesByDraftIds.mockResolvedValue(
      new Map([["draft-a", attempt("draft-a", { status: "sending", writtenAt: null })]]),
    )

    const { json } = await getJson()

    expect(json.sheetWrites["draft-a"]).toMatchObject({
      status: "sending",
      code: "written",
      message: SHEET_WRITE_MESSAGES.outcome_unknown,
    })
  })

  it("모르는 code 는 고정 안내 문구로 — 저장된 원문을 문구로 내보내지 않는다", async () => {
    mockAdmin()
    mockLists()
    lastSuccessfulRevSyncStartedAt.mockResolvedValue(null)
    latestSheetWritesByDraftIds.mockResolvedValue(
      new Map([["draft-a", attempt("draft-a", { status: "failed", code: "mystery_code" })]]),
    )

    const { json } = await getJson()

    expect(json.sheetWrites["draft-a"].message).toBe("시트 쓰기 상태를 알 수 없습니다 — 관리자 확인 필요")
  })

  it("기본(스위치 꺼짐)은 mode off — 그래도 예전 기록은 내려준다", async () => {
    vi.stubEnv("BRANCH_REV_SHEET_WRITE_ENABLED", "")
    vi.stubEnv("VERCEL_ENV", "production")
    mockAdmin()
    mockLists()
    lastSuccessfulRevSyncStartedAt.mockResolvedValue(null)
    latestSheetWritesByDraftIds.mockResolvedValue(new Map([["draft-a", attempt("draft-a")]]))

    const { json } = await getJson()

    expect(json.sheetWrite.mode).toBe("off")
    expect(Object.keys(json.sheetWrites)).toEqual(["draft-a"])
  })

  it("감사 표가 없으면(마이그레이션 전) sheetWrites {} · health ok · mode 는 그대로", async () => {
    vi.stubEnv("BRANCH_REV_SHEET_WRITE_ENABLED", "1")
    vi.stubEnv("VERCEL_ENV", "preview")
    mockAdmin()
    mockLists()
    lastSuccessfulRevSyncStartedAt.mockResolvedValue(null)
    latestSheetWritesByDraftIds.mockRejectedValue(new Error(SHEET_WRITES_NOT_READY_MESSAGE))

    const { response, json } = await getJson()

    expect(response.status).toBe(200)
    expect(json.sheetWrites).toEqual({})
    expect(json.sheetWrite).toEqual({ mode: "off", lastRevSyncStartedAt: null, health: { ok: true, message: null } })
  })

  it("그 밖의 감사 표 조회 실패는 장부 화면을 막지 않되 health 로 알린다", async () => {
    mockAdmin()
    mockLists()
    lastSuccessfulRevSyncStartedAt.mockResolvedValue("2026-10-23T08:00:00.000Z")
    latestSheetWritesByDraftIds.mockRejectedValue(new Error("[branch-sales-ledger-sheet-writes] 조회 실패: timeout"))

    const { response, json } = await getJson()

    expect(response.status).toBe(200)
    expect(json.sheetWrites).toEqual({})
    expect(json.sheetWrite.health).toEqual({
      ok: false,
      message: "시트 쓰기 기록을 읽지 못했습니다 — 시트 반영 상태가 비어 보일 수 있습니다.",
    })
    expect(json.drafts).toHaveLength(2)
  })

  it("마지막 REV 동기화 시각을 못 읽으면 null + health 경고(이중 집계 제외를 하지 않는 쪽)", async () => {
    mockAdmin()
    mockLists()
    lastSuccessfulRevSyncStartedAt.mockRejectedValue(new Error("[branch-sales-ledger-sheet-writes] 동기화 기록 조회 실패: x"))
    latestSheetWritesByDraftIds.mockResolvedValue(new Map())

    const { response, json } = await getJson()

    expect(response.status).toBe(200)
    expect(json.sheetWrite.lastRevSyncStartedAt).toBeNull()
    expect(json.sheetWrite.health).toEqual({ ok: false, message: "마지막 REV 동기화 시각을 읽지 못했습니다." })
  })
})

describe("DELETE /api/admin/branch/ledger-drafts/[id] — 시트 쓰기 기록이 있는 초안", () => {
  function deleteOne(id: string) {
    return new NextRequest(`https://classin.kr/api/admin/branch/ledger-drafts/${id}`, { method: "DELETE" })
  }

  it("감사 행 FK 로 막힌 삭제는 원인 없는 500 이 아니라 409 + '취소로 정리' 안내", async () => {
    mockAdmin()
    deleteBranchSalesLedgerDraft.mockRejectedValue(new Error(SHEET_WRITE_HISTORY_DELETE_MESSAGE))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { DELETE } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await DELETE(deleteOne("draft-1"), params("draft-1"))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: SHEET_WRITE_HISTORY_DELETE_MESSAGE, reason: "sheet-write-history" })
  })

  it("그 밖의 삭제 실패는 기존 500 고정 문구, 없으면 404, 지워지면 ok", async () => {
    mockAdmin()
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { DELETE } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    deleteBranchSalesLedgerDraft.mockRejectedValueOnce(new Error("[branch-sales-ledger-drafts] 삭제 실패: boom"))
    const failed = await DELETE(deleteOne("draft-1"), params("draft-1"))
    expect(failed.status).toBe(500)
    expect((await failed.json()).error).toBe("Failed to delete sales ledger draft")

    deleteBranchSalesLedgerDraft.mockResolvedValueOnce(false)
    expect((await DELETE(deleteOne("draft-1"), params("draft-1"))).status).toBe(404)

    deleteBranchSalesLedgerDraft.mockResolvedValueOnce(true)
    const ok = await DELETE(deleteOne("draft-1"), params("draft-1"))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true })
  })
})

describe("route segment config — maxDuration", () => {
  it("[id]·batch 라우트는 maxDuration 60 을 선언한다(시트 읽기 8s + 쓰기 8s + 되돌리기 8s + DB)", async () => {
    const single = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")
    const batch = await import("@/app/api/admin/branch/ledger-drafts/batch/route")
    expect(single.maxDuration).toBe(60)
    expect(batch.maxDuration).toBe(60)
  })
})

// ── 본문 파서: sheetBaseline · confidenceTouched ───────────────────────────
const VALID_BASELINE = {
  v: 1,
  rowId: "r_0123456789ab",
  sheetRow: 15,
  customer: "  테스트 학원  ",
  month: "2026-10",
  weeks: [
    { value: 100_000, color: "r" },
    { value: 0, color: "k" },
    { value: 0, color: "k" },
    { value: 0, color: "k" },
    { value: 0, color: "k" },
  ],
  capturedAt: "2026-10-23T01:00:00.000Z",
}

const validEditBody = {
  kind: "edit-row",
  customer: "테스트 학원",
  month: "2026-10",
  amount: 200_000,
  sourceSheetRow: 15,
  sourceSnapshot: { row: { firstPayment: "2026-09-01" }, sheetBaseline: VALID_BASELINE },
  metadata: { confidence: "confirmed", confidenceTouched: true },
}

function postOne(body: Record<string, unknown>) {
  return jsonRequest("https://classin.kr/api/admin/branch/ledger-drafts", "POST", body)
}

describe("본문 파서 — sourceSnapshot.sheetBaseline · metadata.confidenceTouched", () => {
  it("올바른 sheetBaseline 은 정규화(customer trim)해 저장하고 sourceSnapshot 의 다른 칸은 그대로 둔다", async () => {
    mockAdmin()
    createBranchSalesLedgerDraft.mockResolvedValue({ draft: { id: "draft-1" }, dedupedRecent: false })
    const { POST } = await import("@/app/api/admin/branch/ledger-drafts/route")

    const response = await POST(postOne(validEditBody))

    expect(response.status).toBe(201)
    const input = createBranchSalesLedgerDraft.mock.calls[0][0]
    expect(input.sourceSnapshot.row).toEqual({ firstPayment: "2026-09-01" })
    expect(input.sourceSnapshot.sheetBaseline).toEqual({ ...VALID_BASELINE, customer: "테스트 학원" })
    expect(input.metadata).toEqual({ confidence: "confirmed", confidenceTouched: true })
  })

  it.each([
    ["v 가 1 이 아님", { ...VALID_BASELINE, v: 2 }],
    ["행 ID 형식 오류", { ...VALID_BASELINE, rowId: "R_0123456789AB" }],
    ["달 형식 오류", { ...VALID_BASELINE, month: "2026-13" }],
    ["주차 색 오류", { ...VALID_BASELINE, weeks: [{ value: 1, color: "x" }] }],
    ["주차 6칸", { ...VALID_BASELINE, weeks: Array.from({ length: 6 }, () => ({ value: 0, color: "k" })) }],
    ["음수 주차 값", { ...VALID_BASELINE, weeks: [{ value: -1, color: "k" }] }],
    ["배열", [VALID_BASELINE]],
    ["문자열", "baseline"],
  ])("sheetBaseline %s → 400 'sheetBaseline 형식 오류', 저장소를 부르지 않는다", async (_label, sheetBaseline) => {
    mockAdmin()
    const { POST } = await import("@/app/api/admin/branch/ledger-drafts/route")

    const response = await POST(postOne({ ...validEditBody, sourceSnapshot: { sheetBaseline } }))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("sheetBaseline 형식 오류")
    expect(createBranchSalesLedgerDraft).not.toHaveBeenCalled()
  })

  it("sheetBaseline 이 없거나 null 이면(새 행·baseline 을 못 만든 행) 그대로 저장한다 — 반영 때 서버가 판정", async () => {
    mockAdmin()
    createBranchSalesLedgerDraft.mockResolvedValue({ draft: { id: "draft-1" }, dedupedRecent: false })
    const { POST } = await import("@/app/api/admin/branch/ledger-drafts/route")

    expect((await POST(postOne({ ...validEditBody, sourceSnapshot: { sheetBaseline: null } }))).status).toBe(201)
    expect((await POST(postOne({ ...validEditBody, sourceSnapshot: { other: 1 } }))).status).toBe(201)
    expect(createBranchSalesLedgerDraft.mock.calls[0][0].sourceSnapshot).toEqual({ sheetBaseline: null })
    expect(createBranchSalesLedgerDraft.mock.calls[1][0].sourceSnapshot).toEqual({ other: 1 })
  })

  it.each([["문자열", "true"], ["숫자", 1], ["null", null]])(
    "metadata.confidenceTouched 가 %s 이면 400(반영 계획은 === true 만 본다)",
    async (_label, confidenceTouched) => {
      mockAdmin()
      const { POST } = await import("@/app/api/admin/branch/ledger-drafts/route")

      const response = await POST(postOne({ ...validEditBody, metadata: { confidenceTouched } }))

      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe("metadata.confidenceTouched must be a boolean")
      expect(createBranchSalesLedgerDraft).not.toHaveBeenCalled()
    },
  )

  it.each([
    ["2칸", [true, false]],
    ["문자열 칸", ["true", false, false, false, false]],
    ["객체", { 0: true }],
  ])("metadata.weeklyConfidenceTouched 가 %s 이면 400(5칸 불리언 또는 null 만)", async (_label, weeklyConfidenceTouched) => {
    mockAdmin()
    const { POST } = await import("@/app/api/admin/branch/ledger-drafts/route")

    const response = await POST(postOne({ ...validEditBody, metadata: { confidenceTouched: true, weeklyConfidenceTouched } }))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("metadata.weeklyConfidenceTouched must be null or 5 booleans")
    expect(createBranchSalesLedgerDraft).not.toHaveBeenCalled()
  })

  it("metadata.weeklyConfidenceTouched 5칸 불리언·null 은 그대로 저장한다", async () => {
    mockAdmin()
    createBranchSalesLedgerDraft.mockResolvedValue({ draft: { id: "draft-1" }, dedupedRecent: false })
    const { POST } = await import("@/app/api/admin/branch/ledger-drafts/route")

    const touched = [false, false, false, false, true]
    expect((await POST(postOne({ ...validEditBody, metadata: { confidenceTouched: true, weeklyConfidenceTouched: touched } }))).status).toBe(201)
    expect((await POST(postOne({ ...validEditBody, metadata: { confidenceTouched: false, weeklyConfidenceTouched: null } }))).status).toBe(201)
    expect(createBranchSalesLedgerDraft.mock.calls[0][0].metadata.weeklyConfidenceTouched).toEqual(touched)
    expect(createBranchSalesLedgerDraft.mock.calls[1][0].metadata.weeklyConfidenceTouched).toBeNull()
  })

  it("PATCH update 도 같은 검증 — 틀리면 400, 맞으면 정규화해 넘긴다", async () => {
    mockAdmin()
    updateBranchSalesLedgerDraft.mockResolvedValue({ outcome: "updated", draft: { id: "draft-1" } })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const bad = await PATCH(
      patchOne("draft-1", { sourceSnapshot: { sheetBaseline: { ...VALID_BASELINE, capturedAt: "not-a-date" } } }),
      params("draft-1"),
    )
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toBe("sheetBaseline 형식 오류")

    const badTouched = await PATCH(patchOne("draft-1", { metadata: { confidenceTouched: "yes" } }), params("draft-1"))
    expect(badTouched.status).toBe(400)
    expect(updateBranchSalesLedgerDraft).not.toHaveBeenCalled()

    const good = await PATCH(
      patchOne("draft-1", { amount: 300_000, sourceSnapshot: { sheetBaseline: VALID_BASELINE }, metadata: { confidenceTouched: false } }),
      params("draft-1"),
    )
    expect(good.status).toBe(200)
    const update = updateBranchSalesLedgerDraft.mock.calls[0][1]
    expect(update.sourceSnapshot.sheetBaseline.customer).toBe("테스트 학원")
    expect(update.metadata).toEqual({ confidenceTouched: false })
  })

  it("배치 생성 항목도 같은 파서 — 틀린 항목만 400 이고 나머지는 진행한다", async () => {
    mockAdmin()
    createBranchSalesLedgerDraft.mockResolvedValue({ draft: { id: "draft-1" }, dedupedRecent: false })
    const { POST } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const response = await POST(
      jsonRequest("https://classin.kr/api/admin/branch/ledger-drafts/batch", "POST", {
        items: [
          { op: "create", input: validEditBody },
          { op: "create", input: { ...validEditBody, sourceSnapshot: { sheetBaseline: { v: 1 } } } },
        ],
      }),
    )
    const json = await response.json()

    expect(json.results[0]).toMatchObject({ index: 0, ok: true, status: 201 })
    expect(json.results[1]).toEqual({ index: 1, ok: false, status: 400, error: "sheetBaseline 형식 오류" })
    expect(createBranchSalesLedgerDraft).toHaveBeenCalledTimes(1)
  })
})
