// 빠른 작업 레일 "주차 분해 입력 그리드"(Ledger-1a 편집 다이얼로그 "주차별 입력 — 금액만 넣으면
// 월 합 자동" + Cockpit-1c 주차 그리드) 규약 검증.
//  - 원칙: 월 합 = 주차 자동합계(직접 수정 불가).
//  - 저장 계약: weeklyMode + 지원 작업 유형 + 주차 합>0이면 metadata.weekly(5칸 숫자) +
//    metadata.week="month" + amount=주차 합 — onCommitCell 주차 병합 초안과 동일한 키 규약.
//  - 노출 조건: forecast-add·amount-change 한정(기간 이동·수량 변경은 단일 금액 UX 유지).
// 이 저장소는 React 렌더 하네스가 없어(vitest environment: "node") 순수 헬퍼 직접 구동 +
// 소스 스캔 관례를 따른다(rev-matrix-link-popover.test.ts와 동일 관례).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { FORECAST_WEEK_RANGE_LABELS as BOARD_WEEK_RANGE_LABELS } from "@/components/admin/branch/ledger/ForecastBoard"
import {
  FORECAST_WEEK_RANGE_LABELS,
  draftWeeklyAmounts,
  draftWeeklySaveContract,
  draftWeeklyTotal,
  emptyDraftWeekly,
  operationSupportsWeeklySplit,
} from "@/components/admin/branch/ledger/shared"

const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")
const railPath = join(process.cwd(), "components/admin/branch/ledger/InputRailSection.tsx")
const boardPath = join(process.cwd(), "components/admin/branch/ledger/ForecastBoard.tsx")
const sharedPath = join(process.cwd(), "components/admin/branch/ledger/shared.tsx")

// CRLF 정규화: autocrlf 체크아웃(Windows)에서도 여러 줄 "\n" 스캔 패턴·경계 slice가 일치하도록
// (rev-matrix-link-popover.test.ts와 동일 관례).
function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n")
}

// 함수 경계 slice — 마커가 없으면 -1 slice로 조용히 파일 전체를 훑는 약화를 막기 위해 즉시 실패.
function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커 누락: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `끝 마커 누락: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe("주차 분해 순수 헬퍼 — 합계 산식·0 처리", () => {
  it("emptyDraftWeekly는 항상 빈 5칸 새 배열을 돌려준다(공유 참조 금지)", () => {
    expect(emptyDraftWeekly()).toEqual(["", "", "", "", ""])
    expect(emptyDraftWeekly()).not.toBe(emptyDraftWeekly())
  })

  it("draftWeeklyAmounts는 문자열 버퍼를 숫자 5칸으로 정규화한다(콤마 허용)", () => {
    expect(draftWeeklyAmounts(["1000", "", "2,500", "0", "300"])).toEqual([1000, 0, 2500, 0, 300])
  })

  it("음수/비숫자는 0으로 처리한다(감액은 장부 가감 입력 — 매트릭스 셀 규약과 동일)", () => {
    expect(draftWeeklyAmounts(["-500", "abc", "1000", "", ""])).toEqual([0, 0, 1000, 0, 0])
  })

  it("버퍼가 5칸 미만이어도 항상 5칸으로 채운다", () => {
    expect(draftWeeklyAmounts(["700"])).toEqual([700, 0, 0, 0, 0])
    expect(draftWeeklyAmounts([])).toEqual([0, 0, 0, 0, 0])
  })

  it("draftWeeklyTotal(월 합)은 정규화된 5칸의 합이다", () => {
    expect(draftWeeklyTotal(["1000", "-500", "2000", "x", ""])).toBe(3000)
    expect(draftWeeklyTotal(["", "", "", "", ""])).toBe(0)
  })

  it("주차 분해는 forecast-add·amount-change에서만 노출·저장된다", () => {
    expect(operationSupportsWeeklySplit("forecast-add")).toBe(true)
    expect(operationSupportsWeeklySplit("amount-change")).toBe(true)
    expect(operationSupportsWeeklySplit("period-shift")).toBe(false)
    expect(operationSupportsWeeklySplit("quantity-change")).toBe(false)
  })
})

describe("draftWeeklySaveContract — buildDraftInput 저장 계약", () => {
  it("weeklyMode + 지원 작업 유형 + 주차 합>0이면 amount=주차 합, weekly=5칸 숫자, week='month'다", () => {
    const contract = draftWeeklySaveContract({
      operation: "forecast-add",
      weeklyMode: true,
      weekly: ["1000", "", "2000", "", ""],
    })
    expect(contract).toEqual({ amount: 3000, weekly: [1000, 0, 2000, 0, 0], week: "month" })
  })

  it("음수/비숫자 칸은 0으로 실려 합계에서 빠진다", () => {
    const contract = draftWeeklySaveContract({
      operation: "amount-change",
      weeklyMode: true,
      weekly: ["-999", "abc", "500", "", ""],
    })
    expect(contract).toEqual({ amount: 500, weekly: [0, 0, 500, 0, 0], week: "month" })
  })

  it("weeklyMode가 꺼져 있으면 null — 단일 금액 경로 그대로", () => {
    expect(draftWeeklySaveContract({ operation: "forecast-add", weeklyMode: false, weekly: ["1000", "", "", "", ""] })).toBeNull()
  })

  it("기간 이동·수량 변경은 weeklyMode가 남아 있어도 null — 단일 금액 UX 유지(노출 조건과 동일 게이트)", () => {
    expect(draftWeeklySaveContract({ operation: "period-shift", weeklyMode: true, weekly: ["1000", "", "", "", ""] })).toBeNull()
    expect(draftWeeklySaveContract({ operation: "quantity-change", weeklyMode: true, weekly: ["1000", "", "", "", ""] })).toBeNull()
  })

  it("주차 합이 0이면 null — 검증(고객명 + 주차 합>0)과 같은 판정", () => {
    expect(draftWeeklySaveContract({ operation: "forecast-add", weeklyMode: true, weekly: ["", "", "", "", ""] })).toBeNull()
    expect(draftWeeklySaveContract({ operation: "forecast-add", weeklyMode: true, weekly: ["-100", "abc", "", "", ""] })).toBeNull()
  })
})

describe("FORECAST_WEEK_RANGE_LABELS — shared SSOT 이동(ForecastBoard 재수입)", () => {
  it("shared가 정의하고 ForecastBoard는 같은 참조를 재수출한다(값 분화 금지)", () => {
    expect(FORECAST_WEEK_RANGE_LABELS).toHaveLength(5)
    expect(BOARD_WEEK_RANGE_LABELS).toBe(FORECAST_WEEK_RANGE_LABELS)
  })

  it("ForecastBoard 소스는 배열 리터럴을 재정의하지 않고 shared에서 재수입한다(순환 import 없음)", () => {
    const board = read(boardPath)
    expect(board).toContain('export { FORECAST_WEEK_RANGE_LABELS } from "./shared"')
    expect(board).not.toContain("FORECAST_WEEK_RANGE_LABELS = [")
    // shared는 ForecastBoard를 import하지 않는다 — 사이클 금지 불변식.
    expect(read(sharedPath)).not.toContain("./ForecastBoard")
  })
})

describe("SalesLedgerWorkbench — 주차 분해 배선 규약(소스 스캔)", () => {
  const source = read(workbenchPath)

  it("buildDraftInput은 저장 계약대로 amount·metadata.week·metadata.weekly를 싣는다(단일 경로는 weekly:null로 잔존 제거)", () => {
    const body = sliceBetween(
      source,
      "const buildDraftInput = useCallback",
      "}, [detail, draftForm, lens, period, selectedMonth, selectedRow, team])",
    )
    expect(body).toContain("const weeklyContract = draftWeeklySaveContract(draftForm)")
    expect(body).toContain("amount: weeklyContract ? weeklyContract.amount : safeAmount(draftForm.amount)")
    expect(body).toContain("week: weeklyContract ? weeklyContract.week : draftForm.week")
    expect(body).toContain("weekly: weeklyContract ? weeklyContract.weekly : null")
  })

  it("검증 체인: 주차 분해 활성 시 '고객명 + 주차 합>0'이 유효 조건이다", () => {
    expect(source).toContain(
      "const draftWeeklySplitActive = draftForm.weeklyMode && operationSupportsWeeklySplit(draftForm.operation)",
    )
    const invalid = sliceBetween(source, "const draftAmountInvalid = draftWeeklySplitActive", "const draftQuantityInvalid")
    expect(invalid).toContain("draftWeeklyTotal(draftForm.weekly) <= 0")
    expect(invalid).toContain("!draftForm.amount.trim() || draftAmountValue <= 0")
  })

  it("loadDealDetail 프리필: explicit 주차만 5칸 프리필 + weeklyMode on(inferred/month-only는 월합계 모드 유지)", () => {
    const body = sliceBetween(source, "const loadDealDetail = useCallback", "}, [selectedMonth, team])")
    expect(body).toContain("const weeklySplit = rowWeeklySplit(row, formMonth)")
    expect(body).toContain('weeklySplit.source === "explicit" && operationSupportsWeeklySplit(operation)')
    expect(body).toContain("weeklyMode: weeklyPrefill")
    expect(body).toContain(": emptyDraftWeekly()")
    // week 토큰은 저장 계약·dedup 좌표와 일치하게 month로 고정된다.
    expect(body).toContain('week: weeklyPrefill ? "month"')
  })

  it("editDraft 프리필: metadata.weekly(mergedWeeklyFromMetadata)가 있으면 동일 프리필", () => {
    const body = sliceBetween(source, "const editDraft = useCallback", "}, [team])")
    expect(body).toContain("const mergedWeekly = mergedWeeklyFromMetadata(draft.metadata)")
    expect(body).toContain("mergedWeekly != null && operationSupportsWeeklySplit(operation)")
    expect(body).toContain("weeklyMode: weeklyPrefill")
    expect(body).toContain(": emptyDraftWeekly()")
  })

  it("defaultDraftForm(폼 리셋 경로)은 weeklyMode 꺼짐 + weekly 5칸 초기화를 포함한다", () => {
    const body = sliceBetween(source, "const defaultDraftForm = useMemo<DraftForm>", "}), [selectedMonth, team])")
    expect(body).toContain("weeklyMode: false")
    expect(body).toContain("weekly: emptyDraftWeekly()")
  })
})

describe("InputRailSection — 주차 분해 그리드 UI 규약(소스 스캔)", () => {
  const source = read(railPath)

  it("노출 조건: operationSupportsWeeklySplit(forecast-add·amount-change 한정) 게이트를 쓴다", () => {
    expect(source).toContain("const weeklySplitAvailable = operationSupportsWeeklySplit(draftForm.operation)")
    expect(source).toContain("const weeklySplitActive = weeklySplitAvailable && draftForm.weeklyMode")
  })

  it("모드 토글 [월합계 한 줄 | 주차 분해] — 주차 분해 진입 시 week 토큰을 month로 고정한다", () => {
    expect(source).toContain("월합계 한 줄")
    expect(source).toContain("주차 분해")
    expect(source).toContain('({ ...current, weeklyMode: true, week: "month" })')
    expect(source).toContain("({ ...current, weeklyMode: false })")
  })

  it("주차 5행 입력은 숫자만 허용(inputMode numeric + 숫자 외 제거) + W라벨·날짜 구간을 단다", () => {
    expect(source).toContain("FORECAST_WEEK_RANGE_LABELS.map((rangeLabel, index)")
    const weeklyInput = sliceBetween(source, "FORECAST_WEEK_RANGE_LABELS.map", "월 합 = 주차 자동합계")
    expect(weeklyInput).toContain('event.target.value.replace(/[^\\d]/g, "")')
    expect(weeklyInput).toContain('inputMode="numeric"')
    expect(weeklyInput).toContain("aria-label={`W${index + 1} 금액`}")
  })

  it("월 합은 읽기전용 자동합계 표시(입력 아님) + 안내 문구·초안 단위 확도 안내를 단다", () => {
    expect(source).toContain("const weeklySum = draftWeeklyTotal(draftForm.weekly)")
    expect(source).toContain("{formatMoney(weeklySum)}")
    // weeklySum을 value로 받는 입력 필드는 없어야 한다(월 합 직접 수정 불가 원칙).
    expect(source).not.toContain("value={weeklySum}")
    expect(source).toContain("월 합 = 주차 자동합계(직접 수정 불가)")
    expect(source).toContain("확도는 초안 단위로 기록됩니다")
  })

  it("주차 분해 모드에서는 단일 금액 입력을 숨기고, 월합계 모드는 기존 UX(단일 금액 + week select)를 유지한다", () => {
    expect(source).toContain("{!weeklySplitActive && (")
    // 월합계 모드용 week 토큰 select가 유지된다(w1..w5 옵션).
    const occurrences = source.match(/<option value="month">월합계<\/option>/g) ?? []
    expect(occurrences.length).toBeGreaterThanOrEqual(1)
  })
})
