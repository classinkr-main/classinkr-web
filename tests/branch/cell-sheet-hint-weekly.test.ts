// 주차 칸 커밋의 시트 쓰기 판정(F-35) — 시트 쓰기가 켜져 있으면 워크벤치가 주차 칸 커밋을 서버 반영과 같은 판정으로 미리 돌리고,
// 막히는 칸(지난 주차 등)은 저장하지 않는다. cellSheetWriteHint 에 주차 5칸(weekly · 병합 결과)을 넘기면 서버 plan.ts 가 초안
// metadata.weekly 로 판정하는 것과 같은 결과다.
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { cellSheetWriteHint, type SheetRowLike } from "@/components/admin/branch/ledger/sheet-write-view"
import { mergeWeekCellCommit } from "@/components/admin/branch/ledger/rev-matrix-logic"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"
import { SHEET_WRITE_MESSAGES } from "@/lib/branch/sheet-writeback/messages"
import { sheetWriteHint } from "@/lib/branch/sheet-writeback/target"

const MONTH = "2026-12"
const TODAY = "2026-12-16" // W3(15~21일) 안 — W1 · W2 는 지난 주차

function row(overrides: Partial<SheetRowLike> = {}): SheetRowLike {
  return {
    customer: "예시학원",
    sheetRow: 42,
    rowId: "r_0123456789ab",
    firstPayment: null,
    weeklyPayments: { [MONTH]: [0, 0, 0, 0, 0] },
    weeklyColors: { [MONTH]: "-----" },
    ...overrides,
  }
}

function weekCommit(week: number, amount: number, pendingWeekly: number[] | null = null) {
  const merged = mergeWeekCellCommit({
    pendingDraft: pendingWeekly ? { amount: pendingWeekly.reduce((a, b) => a + b, 0), weekly: pendingWeekly, weeklyConfidence: null } : null,
    sheetRow: { id: "deal-1", customer: "예시학원", revenue: 0, ledgerOrigin: "sheet" } as LedgerRevenueRow,
    month: MONTH,
    week,
    amount,
  })
  return {
    kind: "edit-row" as const,
    sheetRow: row(),
    month: MONTH,
    amount: merged.amount,
    confidence: "expected" as const,
    confidenceTouched: false,
    today: TODAY,
    capturedAt: "2026-12-16T01:00:00.000Z",
    weekly: merged.weekly,
    weeklyConfidence: merged.weeklyConfidence,
    weeklyConfidenceTouched: null,
    week: merged.week,
  }
}

describe("cellSheetWriteHint — 주차 칸 커밋(weekly)", () => {
  it("이번 주 · 다음 주 칸은 그 주차에 쓴다고 말한다(info)", () => {
    expect(cellSheetWriteHint(weekCommit(2, 300_000))).toEqual({ tone: "info", text: "시트 W3에 씁니다" })
    expect(cellSheetWriteHint(weekCommit(3, 300_000))?.tone).toBe("info")
  })

  it("지난 주차 칸이면 막는다 — 저장하지 않는다(지난 주차는 시트에서 직접)", () => {
    expect(cellSheetWriteHint(weekCommit(0, 300_000))).toEqual({ tone: "block", text: SHEET_WRITE_MESSAGES.past_week })
  })

  it("같은 달 대기 초안(W4)에 이어 W3 을 쳐도 판정은 두 주차를 함께 본다", () => {
    const hint = cellSheetWriteHint(weekCommit(2, 100_000, [0, 0, 0, 200_000, 0]))
    expect(hint?.tone).toBe("info")
    expect(hint?.text).toContain("W3")
  })

  it("서버 plan.ts 와 같은 입력(planWeekWrites) — 주차 5칸 · 주차 확도 · 고친 주차", () => {
    const input = weekCommit(1, 50_000)
    const direct = sheetWriteHint({
      month: MONTH,
      baselineWeeks: [0, 0, 0, 0, 0].map((value) => ({ value, color: "k" as const })),
      draftAmount: input.amount,
      draftWeekly: input.weekly,
      draftConfidence: "expected",
      draftWeeklyConfidence: input.weeklyConfidence,
      confidenceTouched: false,
      draftWeeklyConfidenceTouched: null,
      firstPayment: null,
      today: TODAY,
      draftWeek: input.week,
    })
    expect(cellSheetWriteHint(input)).toEqual(direct)
  })

  it("weekly 가 없으면 지금처럼 월 칸 판정(빈 달은 첫 결제일 · 오늘 주차)", () => {
    const monthHint = cellSheetWriteHint({ ...weekCommit(2, 300_000), weekly: null, weeklyConfidence: null, week: null })
    expect(monthHint?.tone).toBe("info")
  })
})

describe("워크벤치 배선 — 켜짐일 때만 주차 칸 커밋을 판정하고, 막히면 저장하지 않는다", () => {
  const source = readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8").replace(/\r\n/g, "\n")
  const builder = source.slice(source.indexOf("const buildCellDraftInput = useCallback"), source.indexOf("const cancelDraftRef = useRef"))
  const commit = source.slice(source.indexOf("const onCommitCell = useCallback"), source.indexOf("const onMatrixAmountClamped = useCallback"))

  it("빌더는 sheetWriteOn && 주차 칸일 때만 병합 결과(weekly · 확도 · 고친 주차)로 cellSheetWriteHint 를 부른다", () => {
    expect(builder).toMatch(/const sheetHint = sheetWriteOn && week != null\n\s+\? cellSheetWriteHint\(\{/)
    expect(builder).toContain("weekly: mergedWeekly,")
    expect(builder).toContain("weeklyConfidence: mergedWeeklyConfidence,")
    expect(builder).toContain("week: placedWeek,")
    expect(builder).toContain('sheetBlock: sheetHint?.tone === "block" ? sheetHint.text : null,')
  })

  it("커밋은 막힌 칸이면 그 문구를 알리고 false — 초안을 만들지 않는다", () => {
    const blockIndex = commit.indexOf("if (built.sheetBlock) {")
    const persistIndex = commit.indexOf("chainCellCommit({")
    expect(blockIndex).toBeGreaterThan(-1)
    expect(persistIndex).toBeGreaterThan(blockIndex)
    expect(commit.slice(blockIndex, persistIndex)).toContain('pushMatrixToast({ kind: "error", text: built.sheetBlock })')
    expect(commit.slice(blockIndex, persistIndex)).toContain("return Promise.resolve(false)")
  })
})
