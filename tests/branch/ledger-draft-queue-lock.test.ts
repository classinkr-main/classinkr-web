import { describe, expect, it } from "vitest"

import {
  APPLY_NO_RESPONSE_MESSAGE,
  applyFailuresNeedDetail,
  applyQueueNotice,
  isNoResponseOutcome,
  isSheetLockActive,
  koreanRequestError,
  parseSheetWriteLock,
  parseSheetWriteState,
  settleNoResponseOutcomes,
  SHEET_WRITE_STATE_OFF,
  SHEET_WRITTEN_REVERSE_MESSAGE,
  sheetWriteBadge,
  sheetWritePageMessage,
  sheetWritePageProblem,
  sheetWrittenReverseMessage,
  summarizeApplyOutcomes,
  toApplyOutcome,
  type ApplySheetOutcome,
} from "@/components/admin/branch/ledger/sheet-write-view"
import { SHEET_WRITE_MESSAGES } from "@/lib/branch/sheet-writeback/messages"

// 시트 고정(BRANCH_REV_SHEET_LOCKED_AT, design-1) 화면 쪽 판독과 체크 큐 반영 문구(2026-11-25).
//  - GET sheetWrite.lock {lockedAt, active} 를 SheetWriteState 로(모양이 틀리면 null). 적용 중이면 mode 는 off.
//  - 잠김(sheet_locked)·권한(sheet_permission)은 화면 전체 문제 한 줄(sheetWritePageProblem) — 행마다 다시 하라고 하지 않는다.
//  - 응답을 못 받은 반영은 "실패"가 아니라 "새로고침해 확인"(F-33) — 다시 읽은 목록이 적용완료면 성공으로 센다.
//  - 영어 서버 문구는 한국어로(F-33).

const out = (id: string, partial: Partial<ApplySheetOutcome> = {}): ApplySheetOutcome => ({
  id,
  ok: false,
  status: 409,
  code: null,
  message: null,
  error: "x",
  ...partial,
})

describe("sheetWrite.lock 판독 — 신뢰 경계", () => {
  it("lockedAt 이 YYYY-MM-DD 이고 active 가 불리언일 때만 받는다", () => {
    expect(parseSheetWriteLock({ lockedAt: "2026-12-01", active: true })).toEqual({ lockedAt: "2026-12-01", active: true })
    expect(parseSheetWriteLock({ lockedAt: " 2026-12-01 ", active: false })).toEqual({ lockedAt: "2026-12-01", active: false })
    for (const raw of [undefined, null, "2026-12-01", {}, { lockedAt: "12/1", active: true }, { lockedAt: "2026-12-1", active: true }, { lockedAt: "2026-12-01" }, { lockedAt: "2026-12-01", active: "true" }]) {
      expect(parseSheetWriteLock(raw)).toBeNull()
    }
  })

  it("SheetWriteState 에 싣고, 없으면 null(지금과 같은 화면)", () => {
    expect(SHEET_WRITE_STATE_OFF.lock).toBeNull()
    expect(parseSheetWriteState({ mode: "off" }).lock).toBeNull()
    expect(parseSheetWriteState({ mode: "off", lock: { lockedAt: "12/1", active: true } }).lock).toBeNull()
    expect(parseSheetWriteState({ mode: "off", lock: { lockedAt: "2026-12-01", active: false } }).lock).toEqual({ lockedAt: "2026-12-01", active: false })
  })

  it("적용 중이면 서버가 on 을 보내도 화면은 off — '시트·장부에' 문구가 남지 않는다. 예정이면 서버 값 그대로", () => {
    const active = parseSheetWriteState({ mode: "on", lock: { lockedAt: "2026-12-01", active: true } })
    expect(active.mode).toBe("off")
    expect(isSheetLockActive(active)).toBe(true)
    const scheduled = parseSheetWriteState({ mode: "on", lock: { lockedAt: "2026-12-01", active: false } })
    expect(scheduled.mode).toBe("on")
    expect(isSheetLockActive(scheduled)).toBe(false)
    expect(isSheetLockActive(null)).toBe(false)
  })

  it("되돌리기 막힘 사유 — 적용 중이면 고정 날짜가 든 '장부에서 원래 값으로 다시 입력'", () => {
    expect(sheetWrittenReverseMessage({ lockedAt: "2026-12-01", active: true })).toBe(
      "시트는 12월 1일 기준으로 고정돼 되돌릴 수 없습니다 — 장부에서 원래 값으로 다시 입력하세요",
    )
    expect(sheetWrittenReverseMessage({ lockedAt: "2026-12-01", active: false })).toBe(SHEET_WRITTEN_REVERSE_MESSAGE)
    expect(sheetWrittenReverseMessage(undefined)).toBe(SHEET_WRITTEN_REVERSE_MESSAGE)
  })

  it("큐 배지 — sheet_locked 는 '시트 잠김'(경고 톤)", () => {
    expect(sheetWriteBadge({ status: "failed", code: "sheet_locked", message: SHEET_WRITE_MESSAGES.sheet_locked, writtenAt: null, rowId: null })).toEqual({
      label: "시트 잠김",
      tone: "warning",
      message: SHEET_WRITE_MESSAGES.sheet_locked,
    })
  })
})

describe("화면 전체 문제 — 잠김·권한은 배너 한 줄", () => {
  const on = { mode: "on" as const, lock: null }
  const drafts = [
    { id: "a", status: "checked" },
    { id: "b", status: "checked" },
    { id: "c", status: "applied" },
  ]

  it("체크완료 초안의 마지막 시도가 잠김·권한이면 한 건으로 묶는다 — 잠김이 하나라도 있으면 잠김 문구", () => {
    expect(sheetWritePageProblem({ a: { code: "sheet_permission" }, b: { code: "sheet_locked" }, c: { code: "sheet_locked" } }, drafts, on)).toEqual({
      code: "sheet_locked",
      message: SHEET_WRITE_MESSAGES.sheet_locked,
      count: 2,
    })
    const permission = sheetWritePageProblem({ a: { code: "sheet_permission" } }, drafts, on)
    expect(permission?.code).toBe("sheet_permission")
    expect(permission?.message).toContain("관리자")
    expect(permission?.message).toBe(sheetWritePageMessage("sheet_permission"))
  })

  it("행 문제(충돌 등)·적용완료 초안만이면 없음, 시트 쓰기가 꺼졌거나 고정이 적용 중이면 없음(다시 반영하면 장부에만)", () => {
    expect(sheetWritePageProblem({ a: { code: "conflict" }, c: { code: "sheet_locked" } }, drafts, on)).toBeNull()
    const locked = { a: { code: "sheet_locked" } }
    expect(sheetWritePageProblem(locked, drafts, { mode: "off", lock: null })).toBeNull()
    expect(sheetWritePageProblem(locked, drafts, { mode: "on", lock: { lockedAt: "2026-12-01", active: true } })).toBeNull()
    expect(sheetWritePageProblem(locked, drafts)).not.toBeNull()
  })

  it("잠김 문구는 결정 문구 그대로", () => {
    expect(SHEET_WRITE_MESSAGES.sheet_locked).toBe("시트가 잠겨 시트 쓰기를 할 수 없습니다 — 관리자에게 시트 쓰기 끄기를 요청하세요")
    expect(sheetWritePageMessage("sheet_locked")).toBe(SHEET_WRITE_MESSAGES.sheet_locked)
  })
})

describe("반영 큐 배너(applyQueueNotice) — 행마다 다시 하라는 말은 행 문제일 때만", () => {
  it("성공만이면 null", () => {
    expect(applyQueueNotice([out("a", { ok: true, error: null })])).toBeNull()
  })

  it("일괄: 잠김·응답 없음·행 문제를 나눠 말한다 — 고정 전엔 지금 문구, 고정 뒤엔 체크 큐에서 사유 확인", () => {
    const outcomes = [out("a", { code: "sheet_locked" }), out("b", { status: 0, error: APPLY_NO_RESPONSE_MESSAGE }), out("c", { code: "conflict" })]
    expect(applyQueueNotice(outcomes)).toBe(
      `1건 ${SHEET_WRITE_MESSAGES.sheet_locked} · 1건 ${APPLY_NO_RESPONSE_MESSAGE} · 일괄 적용 중 1건이 DB 장부에 반영되지 않았습니다 — 해당 행에서 다시 적용하세요.`,
    )
    expect(applyQueueNotice([out("c", { code: "active_correction" })], { locked: true })).toBe(
      "1건이 장부에 반영되지 않았습니다 — 체크 큐에서 사유를 확인하세요",
    )
    expect(applyQueueNotice([out("a", { code: "sheet_locked" }), out("b", { code: "sheet_locked" })])).toBe(`2건 ${SHEET_WRITE_MESSAGES.sheet_locked}`)
  })

  it("단건: 응답 없음 → 새로고침 안내, 잠김 → 관리자 안내, 그 밖 → 사유(고정 뒤엔 'DB' 없이)", () => {
    expect(applyQueueNotice([out("a", { status: 0 })], { single: true })).toBe(APPLY_NO_RESPONSE_MESSAGE)
    expect(applyQueueNotice([out("a", { code: "sheet_locked" })], { single: true })).toBe(SHEET_WRITE_MESSAGES.sheet_locked)
    expect(applyQueueNotice([out("a", { error: "이미 정정이 있습니다" })], { single: true })).toBe("DB 장부 반영에 실패했습니다 — 이미 정정이 있습니다")
    expect(applyQueueNotice([out("a", { error: "이미 정정이 있습니다" })], { single: true, locked: true })).toBe("장부 반영에 실패했습니다 — 이미 정정이 있습니다")
  })

  it("행 사유를 볼 실패가 있는지(applyFailuresNeedDetail) — 응답 없음·잠김·권한뿐이면 false", () => {
    expect(applyFailuresNeedDetail([out("a", { status: 0 }), out("b", { code: "sheet_permission" })])).toBe(false)
    expect(applyFailuresNeedDetail([out("a", { code: "conflict" })])).toBe(true)
    expect(applyFailuresNeedDetail([out("a", { ok: true })])).toBe(false)
  })
})

describe("응답 없음(F-33)", () => {
  it("코드 없이 상태 0(네트워크·마감) 또는 504(게이트웨이 마감)만 응답 없음", () => {
    expect(isNoResponseOutcome(out("a", { status: 0 }))).toBe(true)
    expect(isNoResponseOutcome(out("a", { status: 504 }))).toBe(true)
    expect(isNoResponseOutcome(out("a", { status: 409 }))).toBe(false)
    expect(isNoResponseOutcome(out("a", { status: 0, code: "sheet_error" }))).toBe(false)
    expect(isNoResponseOutcome(out("a", { status: 0, ok: true }))).toBe(false)
  })

  it("다시 읽은 목록에서 적용완료가 된 초안은 성공으로 센다 — 목록을 못 읽었으면 그대로", () => {
    const outcomes = [out("a", { status: 0 }), out("b", { status: 0 }), out("c", { code: "conflict" })]
    const settled = settleNoResponseOutcomes(outcomes, [{ id: "a", status: "applied" }, { id: "b", status: "checked" }, { id: "c", status: "applied" }])
    expect(settled.map((outcome) => outcome.ok)).toEqual([true, false, false])
    expect(settled[0].error).toBeNull()
    expect(settleNoResponseOutcomes(outcomes, null)).toEqual(outcomes)
  })

  it("결과 줄 — 전부 응답 없음이면 '응답을 받지 못했습니다 — 새로고침해 결과를 확인한 뒤 다시 시도하세요'", () => {
    expect(APPLY_NO_RESPONSE_MESSAGE).toBe("응답을 받지 못했습니다 — 새로고침해 결과를 확인한 뒤 다시 시도하세요")
    expect(summarizeApplyOutcomes([out("a", { status: 0 }), out("b", { status: 0 })])).toEqual({ text: `2건 ${APPLY_NO_RESPONSE_MESSAGE}`, failed: true })
    // 코드 없는 거절은 서버가 보낸 사유로 센다(응답 없음으로 말하지 않는다).
    expect(summarizeApplyOutcomes([out("a", { status: 403, error: "이 작업을 할 권한이 없습니다" })])?.text).toBe("1건 이 작업을 할 권한이 없습니다")
  })
})

describe("영어 서버 문구 → 한국어(F-33)", () => {
  it.each([
    ["Failed to fetch", "서버에 연결하지 못했습니다"],
    ["Load failed", "서버에 연결하지 못했습니다"],
    ["NetworkError when attempting to fetch resource.", "서버에 연결하지 못했습니다"],
    ["Failed to update sales ledger draft", "서버가 초안을 저장하지 못했습니다"],
    ["Failed to process sales ledger draft batch", "서버가 일괄 요청을 처리하지 못했습니다"],
    ["Forbidden", "이 작업을 할 권한이 없습니다"],
    ["Unauthorized", "로그인이 풀렸습니다 — 다시 로그인하세요"],
    ["Invalid JSON body", "요청 모양이 맞지 않습니다 — 새로고침한 뒤 다시 시도하세요"],
    ["Unsupported action: zap", "요청 모양이 맞지 않습니다 — 새로고침한 뒤 다시 시도하세요"],
    ["502 Bad Gateway", "서버 오류(502)"],
    ["something odd happened", "서버 오류가 났습니다"],
    ["요청이 너무 오래 걸립니다 — 다시 시도해 주세요", "요청이 너무 오래 걸립니다 — 다시 시도해 주세요"],
    ["", "알 수 없는 오류가 났습니다"],
  ])("%s → %s", (raw, expected) => {
    expect(koreanRequestError(new Error(raw))).toBe(expected)
  })

  it("반영 응답의 영어 오류도 한국어로(한국어 사유·시트 문구는 그대로)", () => {
    expect(toApplyOutcome("a", { ok: false, status: 500, error: "Failed to process sales ledger draft batch" }).error).toBe("서버가 일괄 요청을 처리하지 못했습니다")
    expect(toApplyOutcome("a", { ok: false, status: 409, error: "충돌", sheet: { code: "conflict" } }).error).toBe("충돌")
  })
})
