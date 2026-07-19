// 라운드 3(P1) — 주차별 확정/고확도/예정 개별 기록(metadata.weeklyConfidence) 계약 검증.
// 스키마: metadata.weeklyConfidence = (DraftConfidence | null)[5], metadata.weekly(금액 5칸)와 병렬.
//   - 금액 0/빈 주차는 반드시 null. 필드 부재/무효(길이≠5·무효 원소)는 "없음" → 기존 폴백
//     (초안 단위 metadata.confidence) — 완전 하위호환.
//   - 단일 금액 저장 경로는 weeklyConfidence: null 명시(weekly: null 규약과 동일 — 재편집 잔존 제거).
//   - metadata.confidence에는 우세 확도(금액 합 최대 버킷, 동률은 낮은 확도) 자동 기록.
// 이 저장소는 React 렌더 하네스가 없어(vitest environment: "node") 순수 헬퍼 직접 구동 +
// 소스 스캔 관례를 따른다(input-rail-weekly-split.test.ts와 동일 관례).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { appliedDraftConfidenceMaps } from "@/components/admin/branch/SalesLedgerWorkbench"
import { buildForecastBoardModel } from "@/components/admin/branch/ledger/ForecastBoard"
import {
  buildRevWeekProjection,
  defaultDraftWeeklyConfidence,
  dominantWeeklyConfidence,
  draftWeeklySaveContract,
  weeklyConfidenceFromMetadata,
  type LedgerRevenueRow,
} from "@/components/admin/branch/ledger/shared"

const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")
const railPath = join(process.cwd(), "components/admin/branch/ledger/InputRailSection.tsx")
const boardPath = join(process.cwd(), "components/admin/branch/ledger/ForecastBoard.tsx")
const queuePath = join(process.cwd(), "components/admin/branch/ledger/DraftQueue.tsx")

// CRLF 정규화: autocrlf 체크아웃(Windows)에서도 여러 줄 "\n" 스캔 패턴·경계 slice가 일치하도록
// (input-rail-weekly-split.test.ts와 동일 관례).
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

const MONTH = "2026-07"

describe("weeklyConfidenceFromMetadata — 검증 판독기(부재/무효/정상)", () => {
  it("정상 5칸(null 혼재 허용)은 그대로 판독한다", () => {
    expect(
      weeklyConfidenceFromMetadata({
        weeklyConfidence: ["confirmed", null, "high-confidence", null, "expected"],
      }),
    ).toEqual(["confirmed", null, "high-confidence", null, "expected"])
  })

  it("필드 부재/명시 null(단일 금액 경로)/metadata 자체 부재는 전부 '없음'(null)이다", () => {
    expect(weeklyConfidenceFromMetadata(undefined)).toBeNull()
    expect(weeklyConfidenceFromMetadata(null)).toBeNull()
    expect(weeklyConfidenceFromMetadata({})).toBeNull()
    expect(weeklyConfidenceFromMetadata({ weeklyConfidence: null })).toBeNull()
  })

  it("길이≠5·무효 원소·비배열은 '없음'으로 판독한다(기존 폴백 유지 — 하위호환)", () => {
    expect(weeklyConfidenceFromMetadata({ weeklyConfidence: ["confirmed", null, null, null] })).toBeNull()
    expect(
      weeklyConfidenceFromMetadata({ weeklyConfidence: ["confirmed", null, null, null, null, null] }),
    ).toBeNull()
    // 언더스코어 변형·임의 문자열·숫자는 무효 원소 — draftConfidenceFromMetadata의 "_"→"-" 관용은
    // 단일 문자열 필드 전용이고, 배열 스키마는 정확한 3단 리터럴만 받는다.
    expect(
      weeklyConfidenceFromMetadata({ weeklyConfidence: ["high_confidence", null, null, null, null] }),
    ).toBeNull()
    expect(weeklyConfidenceFromMetadata({ weeklyConfidence: [1, null, null, null, null] })).toBeNull()
    expect(weeklyConfidenceFromMetadata({ weeklyConfidence: "confirmed" })).toBeNull()
  })

  it("전 칸 null(신호 없음)도 '없음' — mergedWeekly의 some(>0) 가드와 대칭", () => {
    expect(weeklyConfidenceFromMetadata({ weeklyConfidence: [null, null, null, null, null] })).toBeNull()
  })
})

describe("dominantWeeklyConfidence — 우세 확도(금액 합 최대 버킷, 동률=낮은 확도)", () => {
  it("금액 합이 가장 큰 버킷이 우세다", () => {
    expect(dominantWeeklyConfidence([1000, 0, 2000, 0, 0], ["confirmed", null, "expected", null, null])).toBe("expected")
    expect(dominantWeeklyConfidence([3000, 0, 2000, 0, 0], ["confirmed", null, "expected", null, null])).toBe("confirmed")
    expect(
      dominantWeeklyConfidence([100, 900, 0, 0, 0], ["expected", "high-confidence", null, null, null]),
    ).toBe("high-confidence")
  })

  it("동률은 낮은 확도(expected < high-confidence < confirmed) 우선", () => {
    expect(dominantWeeklyConfidence([500, 500, 0, 0, 0], ["confirmed", "expected", null, null, null])).toBe("expected")
    expect(
      dominantWeeklyConfidence([500, 500, 0, 0, 0], ["confirmed", "high-confidence", null, null, null]),
    ).toBe("high-confidence")
  })

  it("확도 미기록(null) 금액은 예정 버킷으로 계상한다(상향 왜곡 금지)", () => {
    expect(dominantWeeklyConfidence([300, 200, 0, 0, 0], [null, "confirmed", null, null, null])).toBe("expected")
  })

  it("금액이 전부 0이면 기본 예정이다", () => {
    expect(dominantWeeklyConfidence([0, 0, 0, 0, 0], defaultDraftWeeklyConfidence("confirmed"))).toBe("expected")
  })
})

describe("draftWeeklySaveContract — 확장형(weeklyConfidence + dominantConfidence)", () => {
  it("금액>0 주차만 폼 버퍼 확도가 실리고 나머지는 null, 우세 확도가 함께 실린다", () => {
    const contract = draftWeeklySaveContract({
      operation: "forecast-add",
      weeklyMode: true,
      weekly: ["1000", "", "300", "", "200"],
      weeklyConfidence: ["confirmed", "confirmed", "high-confidence", "expected", "expected"],
    })
    expect(contract).toEqual({
      amount: 1500,
      weekly: [1000, 0, 300, 0, 200],
      week: "month",
      weeklyConfidence: ["confirmed", null, "high-confidence", null, "expected"],
      dominantConfidence: "confirmed",
    })
  })
})

describe("appliedDraftConfidenceMaps — 주차 합 exact 분해 + red 규칙", () => {
  it("weekly+weeklyConfidence가 유효하면 확정/고확도는 주차 합 exact이고, 부분 확정은 red가 아니다", () => {
    const maps = appliedDraftConfidenceMaps(MONTH, 1800, {
      weekly: [1000, 500, 300, 0, 0],
      weeklyConfidence: ["confirmed", "expected", "high-confidence", null, null],
      // 초안 단위 confidence가 무엇이든(우세 기록값) 주차 배열이 정본이다.
      confidence: "expected",
    })
    expect(maps.monthlyConfirmed).toEqual({ [MONTH]: 1000 })
    expect(maps.monthlyHighConfidence).toEqual({ [MONTH]: 300 })
    expect(maps.monthlyRed).toEqual({})
  })

  it("red는 전액 확정(confirmed 합 ≥ amount-1, ¥1 오차 허용)일 때만 true다", () => {
    const full = appliedDraftConfidenceMaps(MONTH, 3000, {
      weekly: [1000, 2000, 0, 0, 0],
      weeklyConfidence: ["confirmed", "confirmed", null, null, null],
      confidence: "confirmed",
    })
    expect(full.monthlyConfirmed).toEqual({ [MONTH]: 3000 })
    expect(full.monthlyRed).toEqual({ [MONTH]: true })

    // ¥1 반올림 오차 허용 경계: 2999 ≥ 3000-1.
    const nearFull = appliedDraftConfidenceMaps(MONTH, 3000, {
      weekly: [999, 2000, 0, 0, 0],
      weeklyConfidence: ["confirmed", "confirmed", null, null, null],
      confidence: "confirmed",
    })
    expect(nearFull.monthlyRed).toEqual({ [MONTH]: true })

    const partial = appliedDraftConfidenceMaps(MONTH, 3000, {
      weekly: [1000, 2000, 0, 0, 0],
      weeklyConfidence: ["confirmed", "expected", null, null, null],
      confidence: "expected",
    })
    expect(partial.monthlyRed).toEqual({})
  })

  it("weeklyConfidence가 없거나 무효인 기존 초안은 초안 단위 확도 폴백 그대로다(하위호환)", () => {
    const confirmed = appliedDraftConfidenceMaps(MONTH, 5000, { confidence: "confirmed" })
    expect(confirmed.monthlyConfirmed).toEqual({ [MONTH]: 5000 })
    expect(confirmed.monthlyRed).toEqual({ [MONTH]: true })

    const high = appliedDraftConfidenceMaps(MONTH, 5000, { confidence: "high-confidence" })
    expect(high.monthlyConfirmed).toEqual({})
    expect(high.monthlyHighConfidence).toEqual({ [MONTH]: 5000 })
    expect(high.monthlyRed).toEqual({})

    // weekly는 있는데 weeklyConfidence가 무효(길이 4) — 배열을 버리고 폴백을 태운다.
    const invalid = appliedDraftConfidenceMaps(MONTH, 3000, {
      weekly: [1000, 2000, 0, 0, 0],
      weeklyConfidence: ["confirmed", "expected", null, null],
      confidence: "confirmed",
    })
    expect(invalid.monthlyConfirmed).toEqual({ [MONTH]: 3000 })
    expect(invalid.monthlyRed).toEqual({ [MONTH]: true })
  })
})

// 초안 파생 행(LedgerRevenueRow) 빌더 — SalesLedgerWorkbench의 ledgerEntryRows 매핑과 동일한
// 형태(확도 맵은 appliedDraftConfidenceMaps 실물 소비 — 배선과 같은 데이터로 검증한다).
function draftRow(
  id: string,
  weekly: number[],
  metadata: Record<string, unknown>,
  amount = weekly.reduce((sum, value) => sum + value, 0),
): LedgerRevenueRow {
  return {
    id,
    customer: `고객-${id}`,
    manager: "Han",
    team: "BD",
    region: "서울",
    revenue: amount,
    ledgerOrigin: "draft",
    draftMonth: MONTH,
    draftMetadata: metadata,
    monthlyPayments: { [MONTH]: amount },
    weeklyPayments: { [MONTH]: weekly },
    ...appliedDraftConfidenceMaps(MONTH, amount, metadata),
  } as LedgerRevenueRow
}

describe("buildRevWeekProjection — 주차별 exact 버킷 vs 비례 폴백", () => {
  it("유효한 weekly+weeklyConfidence 초안 행은 주차 상태를 exact로 집계한다(비례 배분 없음)", () => {
    const row = draftRow("exact", [1000, 500, 300, 0, 0], {
      weekly: [1000, 500, 300, 0, 0],
      weeklyConfidence: ["confirmed", "expected", "high-confidence", null, null],
      confidence: "expected",
    })
    const weeks = buildRevWeekProjection([row], MONTH)
    expect(weeks[0]).toMatchObject({ confirmed: 1000, highConfidence: 0, open: 0, total: 1000, rows: 1 })
    expect(weeks[1]).toMatchObject({ confirmed: 0, highConfidence: 0, open: 500, total: 500, rows: 1 })
    expect(weeks[2]).toMatchObject({ confirmed: 0, highConfidence: 300, open: 0, total: 300, rows: 1 })
    expect(weeks[3].total).toBe(0)
    expect(weeks[4].total).toBe(0)
  })

  it("weeklyConfidence가 없는 초안 행은 기존 비례 배분 폴백 그대로다(하위호환)", () => {
    // 확도 맵을 직접 절반 확정으로 구성 — 비례 경로는 각 주차에 confirmedRatio(0.5)를 곱한다.
    const row = draftRow("ratio", [1000, 800, 0, 0, 0], { confidence: "expected" })
    row.monthlyConfirmed = { [MONTH]: 900 }
    const weeks = buildRevWeekProjection([row], MONTH)
    expect(weeks[0].confirmed).toBeCloseTo(500)
    expect(weeks[0].open).toBeCloseTo(500)
    expect(weeks[1].confirmed).toBeCloseTo(400)
    expect(weeks[1].open).toBeCloseTo(400)
  })

  it("exact 경로의 주간 시리즈 합은 확도 맵(appliedDraftConfidenceMaps)의 월 합과 일치한다", () => {
    const metadata: Record<string, unknown> = {
      weekly: [700, 0, 1200, 0, 100],
      weeklyConfidence: ["confirmed", null, "high-confidence", null, "expected"],
      confidence: "high-confidence",
    }
    const row = draftRow("parity", [700, 0, 1200, 0, 100], metadata)
    const weeks = buildRevWeekProjection([row], MONTH)
    const confirmedSum = weeks.reduce((sum, week) => sum + week.confirmed, 0)
    const highSum = weeks.reduce((sum, week) => sum + week.highConfidence, 0)
    const maps = appliedDraftConfidenceMaps(MONTH, 2000, metadata)
    expect(confirmedSum).toBe(maps.monthlyConfirmed?.[MONTH] ?? 0)
    expect(highSum).toBe(maps.monthlyHighConfidence?.[MONTH] ?? 0)
  })
})

describe("buildForecastBoardModel — 카드 확도 exact(주차 슬롯 상태)", () => {
  it("초안 행의 유효 weeklyConfidence는 카드 톤을 주차 슬롯 상태로 칠한다", () => {
    const row = draftRow("board", [1000, 500, 300, 0, 0], {
      weekly: [1000, 500, 300, 0, 0],
      weeklyConfidence: ["confirmed", "expected", "high-confidence", null, null],
      confidence: "expected",
    })
    const model = buildForecastBoardModel([row], MONTH)
    const byId = Object.fromEntries(model.columns.map((column) => [column.id, column]))
    expect(byId.w1.cards[0]).toMatchObject({ amount: 1000, confidence: "confirmed", draft: true, inferred: false })
    expect(byId.w2.cards[0]).toMatchObject({ amount: 500, confidence: "expected" })
    expect(byId.w3.cards[0]).toMatchObject({ amount: 300, confidence: "high-confidence" })
    // 주차 슬롯은 통째로 한 상태 — 부분 확정 마이크로 바가 성립하지 않는다(1/0 고정).
    expect(byId.w1.cards[0].confirmedRatio).toBe(1)
    expect(byId.w2.cards[0].confirmedRatio).toBe(0)
    // 월 스칼라는 확도 맵 exact 합과 일치.
    expect(model.monthConfirmed).toBe(1000)
    expect(model.monthHighConfidence).toBe(300)
    expect(model.monthOpen).toBe(500)
  })

  it("weeklyConfidence가 없는 초안 행은 현행(월 확도) 카드 톤 그대로다(하위호환)", () => {
    const row = draftRow("legacy", [0, 2000, 0, 0, 0], {
      weekly: [0, 2000, 0, 0, 0],
      confidence: "confirmed",
    })
    const model = buildForecastBoardModel([row], MONTH)
    const w2 = model.columns[1]
    expect(w2.cards[0]).toMatchObject({ amount: 2000, confidence: "confirmed", draft: true })
  })
})

describe("SalesLedgerWorkbench — weeklyConfidence 배선 규약(소스 스캔)", () => {
  const source = read(workbenchPath)

  it("buildDraftInput: weeklyConfidence는 계약값(단일 경로 null 명시), confidence는 우세 확도다", () => {
    const body = sliceBetween(
      source,
      "const buildDraftInput = useCallback",
      "}, [detail, draftForm, lens, period, selectedMonth, selectedRow, team])",
    )
    expect(body).toContain("weeklyConfidence: weeklyContract ? weeklyContract.weeklyConfidence : null")
    expect(body).toContain("confidence: weeklyContract ? weeklyContract.dominantConfidence : draftForm.confidence")
  })

  it("onCommitCell: 주차 병합 시 확도 병렬 구성(편집 주차=선택 확도, 나머지=기존 보존) + 우세 확도 기록", () => {
    const body = sliceBetween(
      source,
      "const onCommitCell = useCallback",
      "const onMatrixAmountClamped = useCallback",
    )
    expect(body).toContain("const baseStates = weeklyConfidenceFromMetadata(row.draftMetadata)")
    expect(body).toContain("if (index === week) return confidence")
    expect(body).toContain("return baseStates?.[index] ?? null")
    expect(body).toContain("weeklyConfidence: mergedWeeklyConfidence,")
    expect(body).toContain("dominantWeeklyConfidence(mergedWeekly, mergedWeeklyConfidence)")
  })

  it("defaultDraftForm(리셋 경로)·프리필(loadDealDetail/editDraft)이 확도 버퍼를 시드/복원한다", () => {
    const defaults = sliceBetween(source, "const defaultDraftForm = useMemo<DraftForm>", "}), [selectedMonth, team])")
    expect(defaults).toContain('weeklyConfidence: defaultDraftWeeklyConfidence("expected")')

    const detail = sliceBetween(source, "const loadDealDetail = useCallback", "}, [selectedMonth, team])")
    expect(detail).toContain("storedWeeklyConfidence.map((state) => state ?? rowConfidence)")
    expect(detail).toContain(": defaultDraftWeeklyConfidence(rowConfidence)")

    const edit = sliceBetween(source, "const editDraft = useCallback", "}, [team])")
    expect(edit).toContain("const storedWeeklyConfidence = weeklyConfidenceFromMetadata(draft.metadata)")
    expect(edit).toContain("storedWeeklyConfidence.map((state) => state ?? draftConfidence)")
    expect(edit).toContain(": defaultDraftWeeklyConfidence(draftConfidence)")
  })
})

describe("InputRailSection — 주차별 확도 seg UI 규약(소스 스캔)", () => {
  const source = read(railPath)

  it("주차 그리드 각 행에 3단 확도 seg(축약 라벨 + title/aria 전체 라벨, 금액 0은 비활성)를 단다", () => {
    const grid = sliceBetween(source, "FORECAST_WEEK_RANGE_LABELS.map", "월 합 = 주차 자동합계")
    expect(grid).toContain("aria-label={`W${index + 1} 확도`}")
    expect(grid).toContain("title={`W${index + 1} ${option.label}`}")
    expect(grid).toContain("{option.label.slice(0, 1)}")
    expect(grid).toContain("disabled={zeroWeek}")
    // 활성색은 CONFIDENCE_TOKENS bgClass만 사용(확도 색 리터럴 재정의 금지).
    expect(grid).toContain("CONFIDENCE_TOKENS[option.id].bgClass")
  })

  it("weeklyMode의 기존 확도 블록은 전체 일괄 적용(5칸 세트) + 우세 버킷 캡션이다", () => {
    expect(source).toContain("weeklyConfidence: defaultDraftWeeklyConfidence(option.id)")
    expect(source).toContain("전체 일괄 적용 — 주차별로 개별 변경 가능 · 저장 확도는 우세 버킷 자동")
  })

  it("합계 인근에 우세 확도 미리보기(저장 확도)가 있고 dominantWeeklyConfidence를 소비한다", () => {
    expect(source).toContain("dominantWeeklyConfidence(weeklyAmounts, draftForm.weeklyConfidence)")
    expect(source).toContain("저장 확도")
  })
})

describe("ForecastBoard / DraftQueue — exact 카드 톤·확도 도트 배선(소스 스캔)", () => {
  it("보드는 draft 행의 유효 weeklyConfidence를 주차 슬롯 상태로 소비한다", () => {
    const board = read(boardPath)
    expect(board).toContain("weeklyConfidenceFromMetadata(row.draftMetadata)")
    expect(board).toContain("confidence: slotState,")
  })

  it("큐 카드는 주차 병합 표기에 확도 도트(CONFIDENCE_TOKENS color)를 단다 — weeklyConfidence 있을 때만", () => {
    const queue = read(queuePath)
    const dots = sliceBetween(queue, "function WeeklyConfidenceDots", "export function DraftQueue")
    expect(dots).toContain("weeklyConfidenceFromMetadata(metadata)")
    expect(dots).toContain("backgroundColor: token.color")
    expect(dots).toContain("if (!weekly || !states) return null")
    expect(queue).toContain("<WeeklyConfidenceDots metadata={draft.metadata} />")
  })
})

// 라운드 4 최적화 — 주차 셀 팝오버 기본 확도의 슬롯 우선 규약 + pending 요약 동봉.
describe("matrixCellConfidence — 주차 슬롯 우선(소스 스캔)", () => {
  it("pending 요약(buildMatrixPendingByCell)에 weeklyConfidence가 동봉된다", () => {
    const matrix = read("components/admin/branch/ledger/RevMatrix.tsx")
    const summary = sliceBetween(matrix, "export function buildMatrixPendingByCell", "function parseMatrixAmountResult")
    expect(summary).toContain("weeklyConfidence: weeklyConfidenceFromMetadata(draft.metadata)")
  })

  it("주차 좌표는 pending 슬롯 → pending 확도 → 행 슬롯 → 월 우세 순으로 폴백한다", () => {
    const workbench = read("components/admin/branch/SalesLedgerWorkbench.tsx")
    const fn = sliceBetween(workbench, "const matrixCellConfidence = useCallback", "const onCommitCell")
    expect(fn).toContain("pending.weeklyConfidence?.[coord.week]")
    expect(fn).toContain("weeklyConfidenceFromMetadata(row.draftMetadata)?.[coord.week]")
    expect(fn).toContain("dominantCellConfidence(rowMonthBucket(row, coord.month))")
  })

  it("워크벤치 pendingByCell은 인라인 사본 없이 순수 함수를 소비한다(드리프트 차단)", () => {
    const workbench = read("components/admin/branch/SalesLedgerWorkbench.tsx")
    expect(workbench).toContain("useMemo(() => buildMatrixPendingByCell(drafts, visibleDealRows), [drafts, visibleDealRows])")
  })
})
