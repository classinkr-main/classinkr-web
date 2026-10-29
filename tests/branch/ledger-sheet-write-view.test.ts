import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import {
  APPLY_NO_RESPONSE_MESSAGE,
  blocksLedgerDelete,
  blocksLedgerReverse,
  cellSheetWriteHint,
  excludeSheetAbsorbedRows,
  isSheetWriteAbsorbed,
  LEDGER_APPLY_CLIENT_TIMEOUT_MS,
  LEDGER_DRAFT_APPLY_LIMIT,
  parseSheetWrites,
  parseSheetWriteState,
  sheetAbsorbedDraftIds,
  sheetBaselineForRow,
  SHEET_WRITE_HISTORY_DELETE_MESSAGE,
  sheetWriteBadge,
  summarizeApplyOutcomes,
  toApplyOutcome,
  type ApplySheetOutcome,
  type SheetRowLike,
  type SheetWriteView,
} from "@/components/admin/branch/ledger/sheet-write-view"
import { parseSheetBaseline } from "@/lib/branch/sheet-writeback/baseline"
import { REV_WRITE_MAX_DRAFTS } from "@/lib/branch/sheet-writeback/config"
import { SHEET_WRITE_MESSAGES } from "@/lib/branch/sheet-writeback/messages"

// REV 시트 쓰기(ADR-011) 화면 쪽 순수 헬퍼 — 이중 집계 제외(isSheetWriteAbsorbed·오버레이 제외), baseline,
// 칸 아래 힌트, 결과 줄·큐 배지. 판정 정본(lib/branch/sheet-writeback/*)을 부르는 얇은 층이라 경계만 본다.

const ROW_ID = "r_0123456789ab"
const LAST_SYNC = "2026-10-23T03:00:00.000Z"

function written(writtenAt: string | null, status: SheetWriteView["status"] = "written"): SheetWriteView {
  return { status, code: "written", message: SHEET_WRITE_MESSAGES.written, writtenAt, rowId: ROW_ID }
}

describe("isSheetWriteAbsorbed — 시트에 쓴 정정을 미러가 이미 읽었는가", () => {
  it("written 이고 쓴 시각이 마지막 성공 REV 동기화 시작보다 앞이면 true", () => {
    expect(isSheetWriteAbsorbed(written("2026-10-23T02:59:59.000Z"), LAST_SYNC)).toBe(true)
  })

  it("동기화 시작과 같은 시각·뒤에 쓴 것은 아직 미러에 없다(false)", () => {
    expect(isSheetWriteAbsorbed(written(LAST_SYNC), LAST_SYNC)).toBe(false)
    expect(isSheetWriteAbsorbed(written("2026-10-23T03:00:00.001Z"), LAST_SYNC)).toBe(false)
  })

  it("written 이 아닌 시도(sending·unknown·refused·failed)는 시각과 무관하게 false", () => {
    for (const status of ["sending", "unknown", "refused", "failed"] as const) {
      expect(isSheetWriteAbsorbed(written("2026-10-01T00:00:00.000Z", status), LAST_SYNC)).toBe(false)
    }
  })

  it("시각이 없거나 읽을 수 없으면 false(모르면 오버레이를 그대로 둔다)", () => {
    expect(isSheetWriteAbsorbed(written(null), LAST_SYNC)).toBe(false)
    expect(isSheetWriteAbsorbed(written("2026-10-01T00:00:00.000Z"), null)).toBe(false)
    expect(isSheetWriteAbsorbed(written("어제"), LAST_SYNC)).toBe(false)
    expect(isSheetWriteAbsorbed(written("2026-10-01T00:00:00.000Z"), "not-a-date")).toBe(false)
    expect(isSheetWriteAbsorbed(null, LAST_SYNC)).toBe(false)
  })
})

describe("오버레이 제외 — sheetAbsorbedDraftIds + excludeSheetAbsorbedRows", () => {
  const sheetWrites: Record<string, SheetWriteView> = {
    absorbed: written("2026-10-22T00:00:00.000Z"),
    afterSync: written("2026-10-23T05:00:00.000Z"),
    refused: { ...written("2026-10-22T00:00:00.000Z", "refused"), code: "conflict" },
  }

  it("미러가 읽은 시트 쓰기 초안만 고른다", () => {
    expect([...sheetAbsorbedDraftIds(sheetWrites, LAST_SYNC)]).toEqual(["absorbed"])
    expect(sheetAbsorbedDraftIds(sheetWrites, null).size).toBe(0)
  })

  it("고른 초안의 적용 행만 빼고, draftId 없는 행·다른 초안 행은 남긴다", () => {
    const rows = [
      { id: "ledger-1", draftId: "absorbed" },
      { id: "ledger-2", draftId: "afterSync" },
      { id: "draft-3", draftId: "refused" },
      { id: "sheet-row" },
    ]
    const kept = excludeSheetAbsorbedRows(rows, sheetAbsorbedDraftIds(sheetWrites, LAST_SYNC))
    expect(kept.map((row) => row.id)).toEqual(["ledger-2", "draft-3", "sheet-row"])
  })

  it("뺄 것이 없으면 같은 배열을 그대로 돌려준다(memo 안정)", () => {
    const rows = [{ id: "a", draftId: "x" }]
    expect(excludeSheetAbsorbedRows(rows, new Set())).toBe(rows)
  })

  it("워크벤치 appliedDraftRows 가 두 갈래(적용 항목 있음/없음) 모두 이 제외를 거치고, 그 결과로 정정 월을 만든다", () => {
    const source = readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8")
    const start = source.indexOf("const appliedDraftRows = useMemo")
    const end = source.indexOf("}, [appliedDraftFallbackRows, ledgerEntryRows, sheetAbsorbedIds])", start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const body = source.slice(start, end)
    expect(body).toMatch(/if \(ledgerEntryRows\.length === 0\) return excludeSheetAbsorbedRows\(appliedDraftFallbackRows, sheetAbsorbedIds\)/)
    expect(body).toMatch(/return excludeSheetAbsorbedRows\(\[\s*\.\.\.ledgerEntryRows,/)
    // 기준 시각은 서버 동기화와 이 화면 시트 행의 데이터 시각 중 이른 쪽(absorptionCutoff).
    expect(source).toMatch(/sheetAbsorbedDraftIds\(sheetWrites, absorptionCutoff\(sheetWrite\.lastRevSyncStartedAt, sheetRowsSyncedAt\)\)/)
    // editRowOverrideMonths 는 appliedDraftRows → replacementAppliedDraftRows 에서만 만든다(제외가 정정 월에도 반영).
    expect(source).toMatch(/return appliedDraftRows\.filter\(\(row\) => row\.draftKind === "edit-row"\)/)
    // 2026-10-26: 원본 행 찾기(Row ID·행 번호·고객·상품)를 거쳐 정정 월을 만든다 — 입력은 여전히 replacementAppliedDraftRows 뿐.
    expect(source).toMatch(/resolveCorrectionTargets\(replacementAppliedDraftRows, sheetRows,/)
  })
})

describe("GET 응답 판독 — 신뢰 경계", () => {
  it("mode 는 글자 그대로 \"on\" 일 때만 켜짐, 나머지는 꺼짐", () => {
    expect(parseSheetWriteState({ mode: "on", lastRevSyncStartedAt: LAST_SYNC }).mode).toBe("on")
    for (const raw of [undefined, null, {}, { mode: "ON" }, { mode: true }, { mode: "1" }, "on"]) {
      expect(parseSheetWriteState(raw).mode).toBe("off")
    }
    expect(parseSheetWriteState({ mode: "on", lastRevSyncStartedAt: LAST_SYNC }).lastRevSyncStartedAt).toBe(LAST_SYNC)
    expect(parseSheetWriteState({ mode: "off", health: { ok: false, message: "읽지 못함" } }).healthMessage).toBe("읽지 못함")
    expect(parseSheetWriteState({ mode: "off", health: { ok: true, message: "x" } }).healthMessage).toBeNull()
  })

  it("sheetWrites 는 모양이 맞는 항목만 받고, 문구가 비면 코드 문구로 채운다", () => {
    const parsed = parseSheetWrites({
      a: { status: "written", code: "written", message: "", writtenAt: LAST_SYNC, rowId: ROW_ID },
      b: { status: "weird", code: "written" },
      c: { status: "refused" },
      d: "nope",
    })
    expect(Object.keys(parsed)).toEqual(["a"])
    expect(parsed.a.message).toBe(SHEET_WRITE_MESSAGES.written)
    expect(parseSheetWrites(null)).toEqual({})
  })
})

function sheetRow(overrides: Partial<SheetRowLike> = {}): SheetRowLike {
  return {
    customer: "  서울 학원  ",
    sheetRow: 12,
    rowId: ROW_ID,
    firstPayment: null,
    weeklyPayments: { "2026-10": [0, 0, 0, 5000, 0] },
    weeklyColors: { "2026-10": "---b-" },
    ...overrides,
  }
}

describe("sheetBaselineForRow — 초안에 싣는 baseline", () => {
  it("parseSheetBaseline 을 통과하는 v1 을 만든다(값 칸 색은 weeklyColors, 고객은 trim)", () => {
    const baseline = sheetBaselineForRow(sheetRow(), "2026-10", "2026-10-23T01:00:00.000Z")
    expect(parseSheetBaseline(baseline)).toEqual(baseline)
    expect(baseline?.customer).toBe("서울 학원")
    expect(baseline?.weeks).toEqual([
      { value: 0, color: "k" },
      { value: 0, color: "k" },
      { value: 0, color: "k" },
      { value: 5000, color: "b" },
      { value: 0, color: "k" },
    ])
  })

  it("파이프라인이 5칸으로 채운 2월은 weeklyColors 글자 수(시트 실제 칸 4)로 자른다 — 안 자르면 서버가 conflict", () => {
    const baseline = sheetBaselineForRow(
      sheetRow({ weeklyPayments: { "2027-02": [100, 0, 0, 300, 0] }, weeklyColors: { "2027-02": "r--k" } }),
      "2027-02",
      "2026-10-23T01:00:00.000Z",
    )
    expect(baseline?.weeks.map((week) => week.value)).toEqual([100, 0, 0, 300])
    expect(baseline?.weeks.map((week) => week.color)).toEqual(["r", "k", "k", "k"])
  })

  it("그 달 값이 없던 행은 weeks [] (서버가 live 칸 수로 정한다), 행 ID 형식이 틀리면 rowId null", () => {
    const empty = sheetBaselineForRow(sheetRow({ weeklyPayments: {}, weeklyColors: {} }), "2026-11", "2026-10-23T01:00:00.000Z")
    expect(empty?.weeks).toEqual([])
    expect(sheetBaselineForRow(sheetRow({ rowId: "R_BAD" }), "2026-10", "2026-10-23T01:00:00.000Z")?.rowId).toBeNull()
    expect(sheetBaselineForRow(null, "2026-10", "2026-10-23T01:00:00.000Z")).toBeNull()
  })
})

describe("cellSheetWriteHint — 칸 아래 한 줄(서버 planWeekWrites 와 같은 판정)", () => {
  const base = {
    kind: "edit-row" as const,
    month: "2026-10",
    confidence: "expected" as const,
    confidenceTouched: false,
    today: "2026-10-23",
    capturedAt: "2026-10-23T01:00:00.000Z",
  }

  it("값 있는 주차가 하나면 그 칸에 쓴다고 말한다(info)", () => {
    expect(cellSheetWriteHint({ ...base, sheetRow: sheetRow(), amount: 7000 })).toEqual({ tone: "info", text: "시트 W4에 씁니다" })
  })

  it("그 칸이 지난 주차면 막는다(block — 지난 주차는 시트에서 직접)", () => {
    expect(cellSheetWriteHint({ ...base, today: "2026-10-29", sheetRow: sheetRow(), amount: 7000 })).toEqual({
      tone: "block",
      text: SHEET_WRITE_MESSAGES.past_week,
    })
  })

  it("빈 달은 첫 결제일 주차를 고르고, 칸 수는 2월 4칸·그 밖 5칸으로 본다", () => {
    const row = sheetRow({ weeklyPayments: {}, weeklyColors: {}, firstPayment: "2026-11-30" })
    expect(cellSheetWriteHint({ ...base, month: "2026-11", sheetRow: row, amount: 100 })).toEqual({ tone: "info", text: "시트 W5에 씁니다" })
    const feb = sheetRow({ weeklyPayments: {}, weeklyColors: {}, firstPayment: "2027-02-28" })
    expect(cellSheetWriteHint({ ...base, month: "2027-02", sheetRow: feb, amount: 100 })).toEqual({ tone: "info", text: "시트 W4에 씁니다" })
  })

  it("4칸인 달(2월)은 마지막 칸이 22일~말일을 맡는다 — 윤년 29일의 이번 주차는 W4", () => {
    const row = sheetRow({ weeklyPayments: {}, weeklyColors: {} })
    expect(cellSheetWriteHint({ ...base, month: "2028-02", today: "2028-02-29", sheetRow: row, amount: 100 }))
      .toEqual({ tone: "info", text: "시트 W4에 씁니다" })
  })

  it("확도만 바꾸면(금액 그대로) 직접 골랐을 때만 색을 바꾼다", () => {
    expect(cellSheetWriteHint({ ...base, sheetRow: sheetRow(), amount: 5000, confidence: "confirmed", confidenceTouched: true })?.text)
      .toBe("값 있는 주차 1칸의 색을 바꿉니다")
    expect(cellSheetWriteHint({ ...base, sheetRow: sheetRow(), amount: 5000, confidence: "confirmed", confidenceTouched: false })?.text)
      .toBe("시트에서 바뀌는 칸이 없습니다 — 장부에만 기록됩니다")
  })

  it("행 ID 없음·중복·시트 행 못 찾음·0원은 막는다", () => {
    expect(cellSheetWriteHint({ ...base, sheetRow: sheetRow({ rowId: null }), amount: 1 })).toEqual({ tone: "block", text: SHEET_WRITE_MESSAGES.no_row_id })
    expect(cellSheetWriteHint({ ...base, sheetRow: sheetRow({ rowId: null, rowIdIssue: "duplicate" }), amount: 1 }))
      .toEqual({ tone: "block", text: SHEET_WRITE_MESSAGES.row_id_duplicate })
    expect(cellSheetWriteHint({ ...base, sheetRow: null, amount: 1 })).toEqual({ tone: "block", text: SHEET_WRITE_MESSAGES.row_not_found })
    expect(cellSheetWriteHint({ ...base, sheetRow: sheetRow(), amount: 0 })).toEqual({ tone: "block", text: SHEET_WRITE_MESSAGES.amount_invalid })
  })

  it("새 행은 장부에만(info), 금액이 아직 없으면 힌트 없음", () => {
    expect(cellSheetWriteHint({ ...base, kind: "new-row", sheetRow: null, amount: 1 })).toEqual({ tone: "info", text: SHEET_WRITE_MESSAGES.new_row_app_only })
    expect(cellSheetWriteHint({ ...base, sheetRow: sheetRow(), amount: null })).toBeNull()
  })
})

function outcome(code: ApplySheetOutcome["code"], ok: boolean): ApplySheetOutcome {
  return { id: `${code}-${ok}`, ok, status: ok ? 200 : 409, code, message: code ? SHEET_WRITE_MESSAGES[code] : null, error: ok ? null : "x" }
}

describe("반영 결과 — toApplyOutcome · summarizeApplyOutcomes", () => {
  it("단건 202(시트 반영 여부 모름)는 2xx 여도 실패, 200 + draft 만 성공", () => {
    const sheet = { code: "outcome_unknown", message: SHEET_WRITE_MESSAGES.outcome_unknown }
    expect(toApplyOutcome("d1", { error: sheet.message, sheet }, 202)).toMatchObject({ ok: false, status: 202, code: "outcome_unknown" })
    // 실패 응답에도 초안(체크 완료 그대로)이 실려 올 수 있다 — draft 가 있어도 202 는 성공이 아니다.
    expect(toApplyOutcome("d1", { ok: undefined, draft: { id: "d1", status: "checked" }, error: sheet.message, sheet }, 202))
      .toMatchObject({ ok: false, status: 202, error: sheet.message })
    expect(toApplyOutcome("d1", { draft: { id: "d1" }, sheet: { code: "written", message: "시트에 반영됨" } }, 200))
      .toMatchObject({ ok: true, status: 200, code: "written", error: null })
    expect(toApplyOutcome("d1", { sheet: { code: "written" } }, 200).ok).toBe(false)
  })

  it("배치 항목은 ok·status 를 그대로 쓰고, 모르는 코드는 버리며, 항목이 없으면 응답 없음", () => {
    expect(toApplyOutcome("d1", { ok: false, status: 409, error: "충돌", sheet: { code: "conflict" } }))
      .toMatchObject({ ok: false, status: 409, code: "conflict", message: SHEET_WRITE_MESSAGES.conflict, error: "충돌" })
    expect(toApplyOutcome("d1", { ok: false, status: 500, sheet: { code: "nope" } }).code).toBeNull()
    expect(toApplyOutcome("d1", undefined)).toMatchObject({ ok: false, code: null, error: APPLY_NO_RESPONSE_MESSAGE })
  })

  it("코드별 건수를 성공 → 실패 순으로 말한다", () => {
    const summary = summarizeApplyOutcomes([
      outcome("written", true),
      outcome("conflict", false),
      outcome("written", true),
      outcome("new_row_app_only", true),
      outcome("written", true),
    ])
    expect(summary).toEqual({ text: "3건 시트에 반영 · 1건 장부에만(새 행) · 1건 충돌 — 시트가 바뀌었습니다", failed: true })
  })

  it("실패 코드는 messages.ts 문구, 응답 없음은 다시 반영 안내", () => {
    expect(summarizeApplyOutcomes([outcome("past_week", false), outcome(null, false)])?.text).toBe(
      `1건 ${SHEET_WRITE_MESSAGES.past_week} · 1건 ${APPLY_NO_RESPONSE_MESSAGE}`,
    )
  })

  it("시트 쓰기가 꺼져 있었으면(전부 disabled) null — 호출부가 기존 문구를 쓴다", () => {
    expect(summarizeApplyOutcomes([outcome("disabled", true), outcome("disabled", true)])).toBeNull()
    expect(summarizeApplyOutcomes([])).toBeNull()
  })
})

describe("큐 행 배지 — sheetWriteBadge", () => {
  const view = (status: SheetWriteView["status"], code: string): SheetWriteView => ({ status, code, message: "m", writtenAt: null, rowId: null })

  it("시트 반영됨·충돌·확인 중·실패·장부에만으로 나눈다", () => {
    expect(sheetWriteBadge(view("written", "written"))).toMatchObject({ label: "시트 반영됨", tone: "success" })
    expect(sheetWriteBadge(view("written", "already_written"))).toMatchObject({ label: "시트 반영됨", tone: "success" })
    expect(sheetWriteBadge(view("refused", "conflict"))).toMatchObject({ label: "충돌", tone: "danger" })
    expect(sheetWriteBadge(view("unknown", "outcome_unknown"))).toMatchObject({ label: "확인 중", tone: "warning" })
    expect(sheetWriteBadge(view("sending", "written"))).toMatchObject({ label: "확인 중", tone: "warning" })
    expect(sheetWriteBadge(view("refused", "past_week"))).toMatchObject({ label: "실패", tone: "danger" })
    expect(sheetWriteBadge(view("written", "db_apply_failed"))).toMatchObject({ label: "실패", tone: "danger" })
    expect(sheetWriteBadge(view("written", "new_row_app_only"))).toMatchObject({ label: "장부에만", tone: "neutral" })
  })

  it("시트에서 바뀐 칸이 없던 반영은 '시트 반영됨'이 아니고, 장부에 못 적은 갈래·못 되돌린 이동은 실패", () => {
    expect(sheetWriteBadge(view("written", "no_change"))).toMatchObject({ label: "장부에만", tone: "neutral" })
    expect(sheetWriteBadge(view("written", "draft_changed"))).toMatchObject({ label: "실패", tone: "danger" })
    expect(sheetWriteBadge(view("failed", "row_shifted_unrestored"))).toMatchObject({ label: "실패", tone: "danger" })
    expect(sheetWriteBadge(view("refused", "active_correction"))).toMatchObject({ label: "실패", tone: "danger" })
  })
})

describe("삭제 가드 — 반영을 시도한 초안은 삭제 대신 취소", () => {
  const view = (status: SheetWriteView["status"], code: string): SheetWriteView => ({ status, code, message: "m", writtenAt: null, rowId: null })

  it("시트 쓰기 기록이 하나라도 있으면(거절·실패 포함) 막고, 기록이 없으면 기존 동작", () => {
    expect(blocksLedgerDelete(view("refused", "conflict"))).toBe(true)
    expect(blocksLedgerDelete(view("failed", "sheet_error"))).toBe(true)
    expect(blocksLedgerDelete(undefined)).toBe(false)
    expect(blocksLedgerDelete(null)).toBe(false)
  })

  it("큐의 삭제 버튼이 이 가드로 꺼지고, 이유는 서버 409 와 같은 상수", () => {
    const queue = readFileSync(join(process.cwd(), "components/admin/branch/ledger/DraftQueue.tsx"), "utf8")
    const button = queue.slice(queue.indexOf("onClick={() => setConfirmDeleteDraft(draft)}"), queue.indexOf("<Trash2"))
    expect(button).toMatch(/isRowBusy\(draft\.id\) \|\|\n\s+sheetBlocksDelete\(draft\.id\)\n/)
    expect(button).toMatch(/title=\{sheetBlocksDelete\(draft\.id\) \? SHEET_WRITE_HISTORY_DELETE_MESSAGE : draftDeleteDisabledReason\(draft\) \?\? "초안 삭제"\}/)
    expect(queue).toMatch(/const sheetBlocksDelete = \(id: string\) => blocksLedgerDelete\(sheetWrites\?\.\[id\]\)/)
    expect(SHEET_WRITE_HISTORY_DELETE_MESSAGE).toBe("시트 반영 시도 기록이 있는 초안은 삭제할 수 없습니다 — 취소로 정리해 주세요.")
  })

  it("훅은 그 409 를 레코드 오류로 다룬다 — 큐 전체를 로컬로 내리지 않는다", () => {
    const hook = readFileSync(join(process.cwd(), "components/admin/branch/ledger/useLedgerDraftQueue.ts"), "utf8")
    const body = hook.slice(hook.indexOf("const deleteDraft = useCallback"), hook.indexOf("const reverseEntry = useCallback"))
    const guard = body.indexOf("error.message === SHEET_WRITE_HISTORY_DELETE_MESSAGE")
    const downgrade = body.indexOf('setQueueMode("local")')
    expect(guard).toBeGreaterThan(-1)
    expect(downgrade).toBeGreaterThan(guard)
    expect(body.slice(guard, downgrade)).toMatch(/setRecordError\(id, SHEET_WRITE_HISTORY_DELETE_MESSAGE\)\n\s+return\n/)
  })
})

describe("되돌리기 가드 — 시트에 쓴 정정은 장부에서만 상쇄하지 않는다", () => {
  const view = (status: SheetWriteView["status"]): SheetWriteView => ({ status, code: "written", message: "m", writtenAt: null, rowId: null })

  it("written·sending 이면 막고, 그 밖·기록 없음은 기존 동작", () => {
    expect(blocksLedgerReverse(view("written"))).toBe(true)
    expect(blocksLedgerReverse(view("sending"))).toBe(true)
    for (const status of ["refused", "failed", "unknown"] as const) expect(blocksLedgerReverse(view(status))).toBe(false)
    expect(blocksLedgerReverse(undefined)).toBe(false)
  })

  it("시트에서 바뀌는 칸이 없던 반영(no_change)은 막지 않는다 — 시트에 쓴 것이 없다", () => {
    expect(blocksLedgerReverse({ status: "written", code: "no_change" })).toBe(false)
    expect(blocksLedgerReverse({ status: "written", code: "already_written" })).toBe(true)
  })

  it("큐의 되돌리기 버튼이 이 가드로 꺼지고, 문구는 서버 409 문구와 같다", () => {
    const queue = readFileSync(join(process.cwd(), "components/admin/branch/ledger/DraftQueue.tsx"), "utf8")
    const button = queue.slice(queue.indexOf("onClick={() => setConfirmReverseDraft(draft)}"), queue.indexOf("<RotateCcw"))
    expect(button).toMatch(/isRowBusy\(draft\.id\) \|\|\n\s+sheetBlocksReverse\(draft\.id\)\n/)
    expect(button).toMatch(/sheetBlocksReverse\(draft\.id\) \? SHEET_WRITTEN_REVERSE_MESSAGE/)
    expect(queue).toMatch(/const sheetBlocksReverse = \(id: string\) => blocksLedgerReverse\(sheetWrites\?\.\[id\]\)/)
    // 문구는 라우트 409 와 같은 상수(messages.ts) — 라우트가 같은 상수를 import 해 쓰는지는
    // tests/branch/sheet-writeback/ledger-rules.test.ts 가 본다.
    const route = readFileSync(join(process.cwd(), "app/api/admin/branch/ledger-drafts/[id]/route.ts"), "utf8")
    expect(route).toMatch(/\{ error: SHEET_WRITTEN_REVERSE_MESSAGE, reason: "sheet-written" \}/)
  })
})

describe("반영 요청 크기·마감", () => {
  it("한 요청 50건(서버 REV_WRITE_MAX_DRAFTS)·클라이언트 마감은 라우트 maxDuration(60s)보다 길다", () => {
    expect(LEDGER_DRAFT_APPLY_LIMIT).toBe(REV_WRITE_MAX_DRAFTS)
    expect(LEDGER_APPLY_CLIENT_TIMEOUT_MS).toBeGreaterThan(60_000)
  })

  it("훅의 단건·일괄 반영이 그 마감을 싣는다", () => {
    const hook = readFileSync(join(process.cwd(), "components/admin/branch/ledger/useLedgerDraftQueue.ts"), "utf8")
    const single = hook.slice(hook.indexOf("const applyDraft = useCallback"), hook.indexOf("}, [drafts, loadDrafts, queueMode])"))
    const batch = hook.slice(hook.indexOf("const applyDrafts = useCallback"), hook.indexOf("}, [loadDrafts, queueMode])"))
    expect(single).toMatch(/adminTimeoutMs: LEDGER_APPLY_CLIENT_TIMEOUT_MS\b/)
    expect(batch).toMatch(/adminTimeoutMs: LEDGER_APPLY_CLIENT_TIMEOUT_MS\b/)
    expect(single).toMatch(/toApplyOutcome\(id, data, response\.status\)/)
    expect(batch).toMatch(/sheetResults\.push\(outcome\)/)
  })
})

describe("훅 배선 — GET 의 sheetWrite·sheetWrites", () => {
  const hook = readFileSync(join(process.cwd(), "components/admin/branch/ledger/useLedgerDraftQueue.ts"), "utf8")
  const loadDrafts = hook.slice(hook.indexOf("const loadDrafts = useCallback"), hook.indexOf("useEffect(() => {\n    void loadDrafts()"))

  it("응답을 받으면 parse 함수로만 읽어 상태에 둔다", () => {
    expect(loadDrafts).toMatch(/setSheetWrite\(parseSheetWriteState\(data\.sheetWrite\)\)/)
    expect(loadDrafts).toMatch(/setSheetWrites\(parseSheetWrites\(data\.sheetWrites\)\)/)
  })

  it("목록 조회가 실패하면 직전 값을 덮지 않는다(catch 에서 sheetWrite 를 건드리지 않음)", () => {
    const catchBody = loadDrafts.slice(loadDrafts.indexOf("} catch (error) {"))
    expect(catchBody).not.toMatch(/setSheetWrite/)
  })

  it("반환 객체에 sheetWrite·sheetWrites 를 싣는다", () => {
    const returned = hook.slice(hook.indexOf("return {\n    drafts,"), hook.indexOf("reloadDrafts: loadDrafts,"))
    expect(returned).toMatch(/\bsheetWrite,\n/)
    expect(returned).toMatch(/\bsheetWrites,\n/)
  })
})

describe("워크벤치 배선 — 켜짐일 때만 힌트·화면에 상태 전달", () => {
  const source = readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8")

  it("칸 힌트는 sheetWrite.mode === \"on\" 일 때만 넘긴다(꺼짐 = 지금과 같은 화면)", () => {
    expect(source).toMatch(/const sheetWriteOn = sheetWrite\.mode === "on"\n/)
    expect(source).toMatch(/sheetHint: sheetWriteOn\n\s+\? \(row, month, amount, confidence, confidenceTouched\) => \{/)
    expect(source).toMatch(/: undefined,\n\s+\}\), \[editRowOverrideMonths, matrixCellConfidence, matrixCellValue, onCommitCell, pendingByCell, sheetRowById, sheetWriteOn\]\)/)
  })

  it("장부 화면에 mode, 큐에 sheetWrites 를 넘긴다", () => {
    expect(source).toMatch(/sheetWriteMode=\{sheetWrite\.mode\}/)
    expect(source).toMatch(/sheetWriteHealthMessage=\{sheetWrite\.healthMessage\}/)
    expect(source).toMatch(/sheetWrites=\{sheetWrites\}/)
  })
})

describe("초안 빌더 배선 — baseline·confidenceTouched", () => {
  const source = readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8")

  it("셀 빌더는 시트 행(오버레이 전 미러)에서 baseline 을 잡아 싣고, 첫 결제일·확도 선택 표시를 싣는다", () => {
    const body = source.slice(source.indexOf("const buildCellDraftInput = useCallback"), source.indexOf("const cancelDraftRef = useRef"))
    expect(body).toMatch(/sheetBaselineForRow\(sheetRowById\.get\(sourceDealId\), month, new Date\(\)\.toISOString\(\)\)/)
    expect(body).toMatch(/\.\.\.\(sheetBaseline \? \{ sheetBaseline \} : \{\}\)/)
    expect(body).toMatch(/firstPayment: row\.firstPayment \?\? null,/)
    // 판정 규칙은 tests/branch/ledger-confidence-touched.test.ts — 기본은 "안 고름"(시트 글자색 그대로).
    expect(body).toMatch(/confidenceTouched: touched\.confidenceTouched,/)
    expect(body).toMatch(/confidencePicked = false,/)
  })

  it("onCommitCell 이 선택 표시를 빌더로 넘기고(생략 = 안 고름), 장부 칸 편집이 그 값을 싣는다", () => {
    expect(source).toMatch(/buildCellDraftInput\(rowId, month, amount, confidence, week, options\?\.confidenceTouched \?\? false\)/)
    expect(source).toMatch(/onCommitCell\(rowId, month, amount, confidence, undefined, \{ confidenceTouched \}\)/)
  })

  it("레일 빌더는 baseline 을 싣고, 확도 선택 표시는 폼에서 버튼을 누른 칸만(시드는 고른 것이 아니다)", () => {
    const body = source.slice(
      source.indexOf("const buildDraftInput = useCallback"),
      source.indexOf("}, [detail, draftForm, lens, period, selectedMonth, selectedRow, sheetRowById, team])"),
    )
    expect(body).toMatch(/sheetBaselineForRow\(sheetRowById\.get\(sourceDealId\), draftForm\.month, new Date\(\)\.toISOString\(\)\)/)
    expect(body).toMatch(/sheetBaseline \? \{ \.\.\.\(snapshot \?\? \{\}\), sheetBaseline \} : snapshot/)
    expect(body).toMatch(/confidenceTouched: touchedMetadata\.confidenceTouched,/)
  })

  it("시트 행 조회는 오버레이를 얹기 전 sheetRows 에서 만든다", () => {
    const body = source.slice(source.indexOf("const sheetRowById = useMemo"), source.indexOf("}, [sheetRows])"))
    expect(body).toMatch(/for \(const row of sheetRows\) map\.set\(row\.id, row\)/)
  })
})
