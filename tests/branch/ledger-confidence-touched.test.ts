import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { cellDraftConfidenceTouched, weeklyConfidenceTouchedFromMetadata } from "@/components/admin/branch/ledger/rev-matrix-logic"
import {
  defaultDraftWeeklyConfidence,
  draftFormConfidenceTouchedMetadata,
  draftFormWithConfidence,
  draftFormWithWeekConfidence,
  draftWeeklySaveContract,
  type DraftForm,
} from "@/components/admin/branch/ledger/shared"
import type { WeekColor } from "@/lib/branch/sheet-writeback/colors"
import { planWeekWrites, type PlanWeekWritesInput } from "@/lib/branch/sheet-writeback/target"

// REV 시트 쓰기(ADR-011) — 값 있는 시트 칸의 글자색은 사용자가 그 칸(주차 단위면 그 주차)의 확도를 직접 바꿨을 때만 쓴다.
// 화면이 채운 시드 확도(매트릭스 팝오버 = 그 달 우세 확도, 레일 = 행 확도 하나로 5칸, 콕핏 = 리스트 톤)는 시트 글자색과
// 다를 수 있다 — 시작 전 빨강 주차는 앱에서 '예정'(ADR-0062)이고, 주차 칸에도 달 전체 확도가 보인다.
// 아래는 검토에서 나온 경로를 그대로 재현한다: 클라이언트 판정(cellDraftConfidenceTouched·폼 표시) → 서버와 같은
// planWeekWrites. 오늘 2026-10-23(KST), 이번 주차 시작 10-22.

type W = { value: number; color: WeekColor }
const k = (value = 0): W => ({ value, color: "k" })
const r = (value: number): W => ({ value, color: "r" })
const b = (value: number): W => ({ value, color: "b" })
const TODAY = "2026-10-23"

function plan(partial: Partial<PlanWeekWritesInput>) {
  return planWeekWrites({
    month: "2026-11",
    baselineWeeks: [k(), k(), k(), k(), k()],
    draftAmount: 100,
    draftWeekly: null,
    draftConfidence: "expected",
    draftWeeklyConfidence: null,
    confidenceTouched: false,
    firstPayment: null,
    today: TODAY,
    ...partial,
  })
}

describe("매트릭스 칸 커밋 — cellDraftConfidenceTouched", () => {
  it("(a) 월 칸: 미래 주차 빨강 한 칸(앱에서 '예정')의 금액만 고치면 색은 그대로 — 빨강이 검정으로 바뀌지 않는다", () => {
    // 11월 W1=10000 빨강. 팝오버 기본 확도 = 우세 확도 'expected'. 금액만 12000 으로 Enter(확도 안 건드림).
    const touched = cellDraftConfidenceTouched({
      picked: false,
      confidence: "expected",
      shownConfidence: "expected",
      pending: null,
      mergedWeekly: null,
    })
    expect(touched).toEqual({ confidenceTouched: false, weeklyConfidenceTouched: null })
    expect(plan({ baselineWeeks: [r(10000), k(), k(), k(), k()], draftAmount: 12000, confidenceTouched: touched.confidenceTouched }))
      .toEqual({ ok: true, writes: [{ weekIndex: 0, value: 12000, color: null }], note: "시트 W1에 씁니다" })
  })

  it("(b) 주차 칸: 우세 확도(확정)가 기본인 W5 파랑 칸의 금액만 고치면 W5 는 파랑 그대로 — 거짓 결제 표시가 생기지 않는다", () => {
    // 10월 W4=5000 빨강(이번 주차 결제)·W5=5000 파랑 → 우세 확도 confirmed. W5 를 6000 으로(확도 안 건드림).
    const mergedWeekly = [0, 0, 0, 5000, 6000]
    const touched = cellDraftConfidenceTouched({
      picked: false,
      confidence: "confirmed",
      shownConfidence: "confirmed",
      pending: null,
      week: 4,
      mergedWeekly,
    })
    expect(touched).toEqual({ confidenceTouched: false, weeklyConfidenceTouched: [false, false, false, false, false] })
    expect(plan({
      month: "2026-10",
      baselineWeeks: [k(), k(), k(), r(5000), b(5000)],
      draftAmount: 11000,
      draftWeekly: mergedWeekly,
      draftWeeklyConfidence: [null, null, null, null, "confirmed"],
      draftConfidence: "confirmed",
      confidenceTouched: touched.confidenceTouched,
      draftWeeklyConfidenceTouched: touched.weeklyConfidenceTouched,
      draftWeek: 4,
    })).toEqual({ ok: true, writes: [{ weekIndex: 4, value: 6000, color: null }], note: "시트 W5에 씁니다" })
  })

  it("확도를 직접 골라 보이던 것과 달라졌을 때만 고른 것 — 주차 병합은 그 주차만", () => {
    expect(cellDraftConfidenceTouched({ picked: true, confidence: "confirmed", shownConfidence: "expected", pending: null, mergedWeekly: null }))
      .toEqual({ confidenceTouched: true, weeklyConfidenceTouched: null })
    // 골랐어도 보이던 확도 그대로면 바뀐 것이 없다.
    expect(cellDraftConfidenceTouched({ picked: true, confidence: "expected", shownConfidence: "expected", pending: null, mergedWeekly: null }))
      .toEqual({ confidenceTouched: false, weeklyConfidenceTouched: null })
    expect(cellDraftConfidenceTouched({
      picked: true,
      confidence: "high-confidence",
      shownConfidence: "confirmed",
      pending: null,
      week: 4,
      mergedWeekly: [0, 0, 0, 5000, 6000],
    })).toEqual({ confidenceTouched: true, weeklyConfidenceTouched: [false, false, false, false, true] })
  })

  it("같은 칸 대기 초안이 앞서 고른 표시는 PATCH 해도 이어 받는다(금액 0 주차는 false)", () => {
    expect(cellDraftConfidenceTouched({
      picked: false,
      confidence: "confirmed",
      shownConfidence: "confirmed",
      pending: { confidenceTouched: true },
      mergedWeekly: null,
    })).toEqual({ confidenceTouched: true, weeklyConfidenceTouched: null })
    expect(cellDraftConfidenceTouched({
      picked: false,
      confidence: "confirmed",
      shownConfidence: "confirmed",
      pending: { confidenceTouched: true, weeklyConfidenceTouched: [true, false, true, false, false] },
      week: 3,
      mergedWeekly: [100, 0, 0, 300, 0],
    })).toEqual({ confidenceTouched: true, weeklyConfidenceTouched: [true, false, false, false, false] })
  })

  it("metadata.weeklyConfidenceTouched 판독 — 5칸 불리언만", () => {
    expect(weeklyConfidenceTouchedFromMetadata({ weeklyConfidenceTouched: [true, false, false, false, true] })).toEqual([true, false, false, false, true])
    expect(weeklyConfidenceTouchedFromMetadata({ weeklyConfidenceTouched: [true, false] })).toBeNull()
    expect(weeklyConfidenceTouchedFromMetadata({ weeklyConfidenceTouched: ["true", false, false, false, false] })).toBeNull()
    expect(weeklyConfidenceTouchedFromMetadata(null)).toBeNull()
  })
})

describe("매트릭스 편집기·워크벤치 배선(소스) — 명시 선택만 confidenceTouched", () => {
  const logic = readFileSync(join(process.cwd(), "components/admin/branch/ledger/rev-matrix-logic.ts"), "utf8")
  const workbench = readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8")
  const slice = (source: string, start: string, end: string) => {
    const from = source.indexOf(start)
    const to = source.indexOf(end, from + start.length)
    expect(from, start).toBeGreaterThan(-1)
    expect(to, end).toBeGreaterThan(from)
    return source.slice(from, to)
  }

  it("편집 시작은 선택 표시를 지우고, 팝오버·E/H/C(pickEditConfidence)만 세운다", () => {
    expect(slice(logic, "const beginEdit = useCallback", "const cancelEdit = useCallback")).toMatch(/\n\s+confidencePickedRef\.current = false\n/)
    expect(slice(logic, "const pickEditConfidence = useCallback", "const commitBuffer = useCallback")).toMatch(/\n\s+confidencePickedRef\.current = true\n/)
  })

  it("커밋은 그 표시를, Ctrl+D 는 false 를, 선택 칸 E/H/C 는 true 를 넘긴다", () => {
    expect(slice(logic, "const commitBuffer = useCallback", "const moveSelection = useCallback"))
      .toMatch(/onCommitCell\(coord\.rowId, coord\.month, amount, confidence, coord\.week, \{ confidenceTouched: confidencePickedRef\.current \}\)/)
    const selected = slice(logic, "const onSelectedKeyDown = useCallback", "if (event.key === \"ArrowRight\")")
    expect(selected).toMatch(/onCommitCell\(coord\.rowId, coord\.month, value, cellConfidence\(coord\), coord\.week, \{ confidenceTouched: false \}\)/)
    expect(selected).toMatch(/onCommitCell\(coord\.rowId, coord\.month, value, shortcut, coord\.week, \{ confidenceTouched: true \}\)/)
  })

  it("셀 빌더 기본은 '안 고름'이고 판정은 cellDraftConfidenceTouched 하나(보이던 확도와 비교)", () => {
    const body = slice(workbench, "const buildCellDraftInput = useCallback", "const cancelDraftRef = useRef")
    expect(body).toMatch(/\n\s+confidencePicked = false,\n/)
    expect(body).toMatch(/cellDraftConfidenceTouched\(\{\n\s+picked: confidencePicked,\n\s+confidence,\n\s+shownConfidence: matrixCellConfidence\(\{ rowId, month, week \}\),\n\s+pending,\n\s+week,\n\s+mergedWeekly,\n\s+\}\)/)
    expect(body).toMatch(/confidenceTouched: touched\.confidenceTouched,\n\s+weeklyConfidenceTouched: touched\.weeklyConfidenceTouched,/)
    expect(workbench).toMatch(/buildCellDraftInput\(rowId, month, amount, confidence, week, options\?\.confidenceTouched \?\? false\)/)
  })

  it("편집 바·붙여넣기도 직접 고른 경우만 표시한다", () => {
    const bar = slice(workbench, "const pickConfidenceFromEditBar = useCallback", "const editBarContext = useMemo")
    expect(bar).toMatch(/onCommitCell\(coord\.rowId, coord\.month, value, next, coord\.week, \{ confidenceTouched: true \}\)/)
    expect(workbench).toMatch(/setPasteConfidence\(loadStoredMatrixConfidence\(\) \?\? "expected"\)\n\s+setPasteConfidencePicked\(false\)/)
    expect(workbench).toMatch(/buildCellDraftInput\(cell\.rowId, cell\.month, cell\.next, pasteConfidence, undefined, pasteConfidencePicked\)/)
    expect(workbench).toMatch(/onPickConfidence=\{pickPasteConfidence\}/)
  })
})

describe("레일·콕핏 — 폼에서 확도 버튼을 누른 칸만 고른 것", () => {
  function form(partial: Partial<DraftForm> = {}): DraftForm {
    return {
      operation: "amount-change",
      customer: "가나학원",
      manager: "김",
      team: "BD",
      productCategory: "software",
      month: "2026-10",
      fromMonth: "2026-10",
      week: "month",
      confidence: "expected",
      amount: "",
      quantity: "",
      note: "",
      weeklyMode: true,
      weekly: ["", "", "", "3000", "2500"],
      weeklyConfidence: defaultDraftWeeklyConfidence("expected"),
      ...partial,
    }
  }

  it("시드만 있고 버튼을 안 누르면 손대지 않은 W4 빨강·W5 파랑 색을 쓰지 않는다(W5 금액만)", () => {
    // 시트 10월 W4=3000 빨강(이번 주 결제)·W5=2000 파랑. 레일은 행 확도 하나('예정')로 5칸을 시드한다.
    const draft = form()
    const contract = draftWeeklySaveContract(draft)
    if (!contract) throw new Error("weekly contract missing")
    const meta = draftFormConfidenceTouchedMetadata(draft, contract.weeklyConfidence)
    expect(meta).toEqual({ confidenceTouched: false, weeklyConfidenceTouched: [false, false, false, false, false] })
    expect(plan({
      month: "2026-10",
      baselineWeeks: [k(), k(), k(), r(3000), b(2000)],
      draftAmount: contract.amount,
      draftWeekly: contract.weekly,
      draftConfidence: contract.dominantConfidence,
      draftWeeklyConfidence: contract.weeklyConfidence,
      confidenceTouched: meta.confidenceTouched,
      draftWeeklyConfidenceTouched: meta.weeklyConfidenceTouched,
    })).toEqual({ ok: true, writes: [{ weekIndex: 4, value: 2500, color: null }], note: "시트 W5에 씁니다" })
  })

  it("손대지 않은 지난 주차(W2 빨강) 때문에 초안 전체가 past_week 로 막히지 않는다", () => {
    const draft = form({ weekly: ["", "1000", "", "", "2500"] })
    const contract = draftWeeklySaveContract(draft)
    if (!contract) throw new Error("weekly contract missing")
    const meta = draftFormConfidenceTouchedMetadata(draft, contract.weeklyConfidence)
    const input = {
      month: "2026-10",
      baselineWeeks: [k(), r(1000), k(), k(), b(2000)],
      draftAmount: contract.amount,
      draftWeekly: contract.weekly,
      draftConfidence: contract.dominantConfidence,
      draftWeeklyConfidence: contract.weeklyConfidence,
    }
    expect(plan({ ...input, confidenceTouched: meta.confidenceTouched, draftWeeklyConfidenceTouched: meta.weeklyConfidenceTouched }))
      .toEqual({ ok: true, writes: [{ weekIndex: 4, value: 2500, color: null }], note: "시트 W5에 씁니다" })
    // 예전처럼 시드를 고른 것으로 실으면, 이번 달 지난 주는 색 쓰기가 허용되므로(2026-10-23 결정) 손대지 않은
    // W2 빨강(확정)을 검정(예정)으로 다시 칠한다 — 고른 칸만 싣는 이 수정이 그래서 필요하다.
    expect(plan({ ...input, confidenceTouched: true, draftWeeklyConfidenceTouched: [true, true, true, true, true] }))
      .toEqual({
        ok: true,
        writes: [{ weekIndex: 1, value: null, color: "k" }, { weekIndex: 4, value: 2500, color: "k" }],
        note: "시트 W2·W5에 씁니다",
      })
  })

  it("주차 확도 한 칸을 누르면 그 주차만, 일괄 버튼은 전 주차를 고른 것으로 표시한다", () => {
    const one = draftFormWithWeekConfidence(form(), 4, "high-confidence")
    expect(one.weeklyConfidence).toEqual(["expected", "expected", "expected", "expected", "high-confidence"])
    expect(draftFormConfidenceTouchedMetadata(one, draftWeeklySaveContract(one)?.weeklyConfidence ?? null))
      .toEqual({ confidenceTouched: true, weeklyConfidenceTouched: [false, false, false, false, true] })

    const all = draftFormWithConfidence(form(), "confirmed")
    expect(all).toMatchObject({ confidence: "confirmed", weeklyConfidence: defaultDraftWeeklyConfidence("confirmed"), confidenceTouched: true })
    // 금액 0 주차는 싣지 않는다.
    expect(draftFormConfidenceTouchedMetadata(all, draftWeeklySaveContract(all)?.weeklyConfidence ?? null))
      .toEqual({ confidenceTouched: true, weeklyConfidenceTouched: [false, false, false, true, true] })
  })

  it("단일 금액 저장은 폼의 단일 표시만 싣는다(시드는 false)", () => {
    expect(draftFormConfidenceTouchedMetadata(form({ weeklyMode: false }), null)).toEqual({ confidenceTouched: false, weeklyConfidenceTouched: null })
    expect(draftFormConfidenceTouchedMetadata(draftFormWithConfidence(form({ weeklyMode: false }), "confirmed"), null))
      .toEqual({ confidenceTouched: true, weeklyConfidenceTouched: null })
  })

  it("레일·콕핏 버튼과 레일 빌더가 이 판정을 쓴다(늘 true 로 싣지 않는다)", () => {
    for (const file of ["components/admin/branch/ledger/InputRailSection.tsx", "components/admin/branch/ledger/CockpitEditor.tsx"]) {
      const source = readFileSync(join(process.cwd(), file), "utf8")
      expect(source, file).toMatch(/setDraftForm\(\(current\) => draftFormWithConfidence\(current, option\.id\)\)/)
      expect(source, file).toMatch(/setDraftForm\(\(current\) => draftFormWithWeekConfidence\(current, index, key\)\)/)
    }
    const workbench = readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8")
    const body = workbench.slice(
      workbench.indexOf("const buildDraftInput = useCallback"),
      workbench.indexOf("}, [detail, draftForm, lens, period, selectedMonth, selectedRow, sheetRowById, team])"),
    )
    expect(body).toMatch(/draftFormConfidenceTouchedMetadata\(draftForm, weeklyContract \? weeklyContract\.weeklyConfidence : null\)/)
    expect(body).toMatch(/confidenceTouched: touchedMetadata\.confidenceTouched,\n\s+weeklyConfidenceTouched: touchedMetadata\.weeklyConfidenceTouched,/)
    expect(body).not.toMatch(/confidenceTouched: true\b/)
    // 다시 고치는 초안은 앞서 고른 표시를 이어 받는다.
    const edit = workbench.slice(workbench.indexOf("const editDraft = useCallback"), workbench.indexOf("const cancelDraftEdit = useCallback"))
    expect(edit).toMatch(/confidenceTouched: draft\.metadata\?\.confidenceTouched === true,/)
    expect(edit).toMatch(/weeklyConfidenceTouched: weeklyConfidenceTouchedFromMetadata\(draft\.metadata\) \?\? undefined,/)
  })
})
