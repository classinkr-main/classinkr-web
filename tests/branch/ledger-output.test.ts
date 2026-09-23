// 라운드 5 B1·R-2·R-8·R-12 — 매출 장부 출력(REV CSV·선택 셀 복사)과 매트릭스 표시 규약 회귀 고정.
// 순수 함수는 직접 구동하고, 워크벤치·에디터 배선은 이 저장소 관례대로 소스 스캔으로 확인한다(렌더 하네스 없음).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { buildRevMatrixCsvRows, withCaptionRow } from "@/components/admin/branch/ledger/ledger-export"
import {
  matrixDisplayedCellAmount,
  matrixWeekInputs,
  pendingWeekDisplay,
  type MatrixPendingDraft,
} from "@/components/admin/branch/ledger/rev-matrix-logic"
import type { LedgerRevenueRow, RevMonthlyBucket } from "@/components/admin/branch/ledger/shared"
import { formatExactMoney } from "@/lib/branch/ledger-format"
import { toCsv } from "@/lib/export/delimited"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커를 찾지 못함: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `종료 마커를 찾지 못함: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

function row(overrides: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
  return {
    id: "row-1",
    sheetRow: 42,
    customer: "한빛학원",
    manager: "김담당",
    team: "BD",
    region: "서울",
    status: "New",
    dealType: "Direct",
    revenue: 0,
    ledgerOrigin: "sheet",
    monthlyPayments: {},
    ...overrides,
  } as LedgerRevenueRow
}

function pending(overrides: Partial<MatrixPendingDraft> = {}): MatrixPendingDraft {
  return { id: "draft-1", amount: 1_200_000, confidence: "high-confidence", weekly: null, weeklyConfidence: null, ...overrides }
}

describe("buildRevMatrixCsvRows — REV 현재 보기 CSV(B1)", () => {
  const months = ["2026-04", "2026-05"]
  const buckets: Record<string, RevMonthlyBucket> = {
    "row-1::2026-04": { total: 1_234_567.4, confirmed: 1_000_000, high: 234_567.4, open: 0 },
    "row-1::2026-05": { total: 0, confirmed: 0, high: 0, open: 0 },
    "row-2::2026-04": { total: 0, confirmed: 0, high: 0, open: 0 },
    "row-2::2026-05": { total: 500_000, confirmed: 0, high: 0, open: 500_000 },
  }
  const table = buildRevMatrixCsvRows(
    [row(), row({ id: "row-2", sheetRow: undefined, customer: "=CMD()", ledgerOrigin: "draft" })],
    {
      months,
      monthLabel: (month) => `${month.slice(0, 4)}.${Number(month.slice(5))}월`,
      bucketOf: (target, month) => buckets[`${target.id}::${month}`],
      productLabel: () => "SW",
    },
  )

  it("머리글: 식별 열 9개 + 월별(¥) + 연간 합계·확정·고확도·예정", () => {
    expect(table[0]).toEqual([
      "시트 행",
      "고객",
      "담당",
      "팀",
      "지역",
      "상태",
      "유형",
      "상품",
      "원천",
      "2026.4월(¥)",
      "2026.5월(¥)",
      "연간 합계(¥)",
      "연간 확정(¥)",
      "연간 고확도(¥)",
      "연간 예정(¥)",
    ])
  })

  it("금액은 원 단위 정수(반올림), 빈 달은 빈 칸, 연간은 확도 분해 합", () => {
    expect(table[1]).toEqual([42, "한빛학원", "김담당", "BD", "서울", "New", "Direct", "SW", "시트", 1_234_567, null, 1_234_567, 1_000_000, 234_567, 0])
    expect(table[2].slice(8)).toEqual(["장부 입력", null, 500_000, 500_000, 0, 0, 500_000])
  })

  it("직렬화하면 수식처럼 보이는 고객명은 텍스트로 막힌다(lib/export/delimited)", () => {
    const csv = toCsv(table)
    expect(csv).toContain(`'=CMD()`)
    expect(csv.split("\r\n")).toHaveLength(3)
  })

  it("withCaptionRow — 첫 줄 설명 + 표", () => {
    expect(withCaptionRow("DSH · 단위 ¥", [["a"], ["b"]])).toEqual([["DSH · 단위 ¥"], ["a"], ["b"]])
  })
})

describe("formatExactMoney — 원 단위 정확 금액(R-8)", () => {
  it("반올림 없이 콤마, 비정상 값은 ¥0", () => {
    expect(formatExactMoney(1_234_567.4)).toBe("¥1,234,567")
    expect(formatExactMoney(null)).toBe("¥0")
    expect(formatExactMoney(Number.NaN)).toBe("¥0")
  })
})

describe("pendingWeekDisplay — 주차 칸 대기 초안 표시(R-2·R-W)", () => {
  it("정확한 주차 키 초안이 먼저", () => {
    const map = new Map([["row-1::2026-09::w2", pending({ amount: 300_000 })]])
    expect(pendingWeekDisplay(map, "row-1", "2026-09", 1, 0)).toMatchObject({ amount: 300_000 })
  })

  it("같은 달 주차 병합 초안은 바뀐 주차만 표시하고, 표시값과 같은 주차는 표시하지 않는다", () => {
    const merged = pending({ amount: 700_000, weekly: [100_000, 600_000, 0, 0, 0] })
    const map = new Map([["row-1::2026-09", merged]])
    expect(pendingWeekDisplay(map, "row-1", "2026-09", 1, 200_000)).toEqual({ pending: merged, amount: 600_000 })
    expect(pendingWeekDisplay(map, "row-1", "2026-09", 0, 100_000)).toBeNull()
  })

  it("월 단위 한 금액 초안(weekly 없음)은 주차 칸에 나누어 표시하지 않는다", () => {
    const map = new Map([["row-1::2026-09", pending()]])
    expect(pendingWeekDisplay(map, "row-1", "2026-09", 4, 0)).toBeNull()
    expect(pendingWeekDisplay(null, "row-1", "2026-09", 4, 0)).toBeNull()
  })
})

describe("matrixDisplayedCellAmount — Ctrl+C는 칸에 보이는 값을 복사한다(B1)", () => {
  const monthOnly = row({ monthlyPayments: { "2026-09": 900_000 } })

  it("월 칸: 대기 초안이 있으면 그 금액, 없으면 장부 월 금액", () => {
    expect(matrixDisplayedCellAmount(monthOnly, { rowId: "row-1", month: "2026-09" }, new Map())).toBe(900_000)
    const map = new Map([["row-1::2026-09", pending()]])
    expect(matrixDisplayedCellAmount(monthOnly, { rowId: "row-1", month: "2026-09" }, map)).toBe(1_200_000)
  })

  it("주차 칸: 월합계만 행은 W5에 월합계(표시 규약 그대로), 월 단위 초안은 주차 칸 값에 섞지 않는다", () => {
    expect(matrixWeekInputs(monthOnly, "2026-09")).toEqual({ weeks: [0, 0, 0, 0, 0], inferred: false, monthOnlyAmount: 900_000 })
    const map = new Map([["row-1::2026-09", pending()]])
    expect(matrixDisplayedCellAmount(monthOnly, { rowId: "row-1", month: "2026-09", week: 4 }, map)).toBe(900_000)
    expect(matrixDisplayedCellAmount(monthOnly, { rowId: "row-1", month: "2026-09", week: 0 }, map)).toBe(0)
  })

  it("주차 칸: 주차 병합 초안이 바꾼 주차는 초안 값", () => {
    const explicit = row({ monthlyPayments: { "2026-09": 300_000 }, weeklyPayments: { "2026-09": [100_000, 200_000, 0, 0, 0] } })
    const map = new Map([["row-1::2026-09", pending({ amount: 700_000, weekly: [100_000, 600_000, 0, 0, 0] })]])
    expect(matrixDisplayedCellAmount(explicit, { rowId: "row-1", month: "2026-09", week: 1 }, map)).toBe(600_000)
    expect(matrixDisplayedCellAmount(explicit, { rowId: "row-1", month: "2026-09", week: 0 }, map)).toBe(100_000)
  })

  it("행을 못 찾으면 0", () => {
    expect(matrixDisplayedCellAmount(undefined, { rowId: "gone", month: "2026-09" }, new Map())).toBe(0)
  })
})

describe("useMatrixEditor 배선 — 0 커밋 차단(R-12)·Ctrl+C(B1)", () => {
  const logic = read("components/admin/branch/ledger/rev-matrix-logic.ts")

  it("값 있는 칸을 0으로 치면 onCommitCell 대신 onZeroCommitBlocked — 서버 400을 사전 차단", () => {
    const commit = sliceBetween(logic, "const commitBuffer = useCallback(", "const moveSelection = useCallback(")
    const guard = commit.indexOf("if (amount <= 0) {")
    expect(guard).toBeGreaterThan(-1)
    expect(commit.indexOf("onZeroCommitBlocked?.(coord)")).toBeGreaterThan(guard)
    expect(commit.indexOf("onCommitCell(coord.rowId")).toBeGreaterThan(commit.indexOf("onZeroCommitBlocked?.(coord)"))
  })

  it("Ctrl/Cmd+C는 물리 키(KeyC)로 판정하고, 드래그로 고른 텍스트가 있으면 브라우저 기본 복사를 둔다", () => {
    const keydown = sliceBetween(logic, "const onSelectedKeyDown = useCallback(", "// 셀 핸들러가 호출하는 액션들")
    expect(keydown).toContain('event.code === "KeyC"')
    expect(keydown).toContain("window.getSelection?.()?.toString()")
    expect(keydown).toContain("onCopyCell(coord)")
    expect(keydown.indexOf('event.code === "KeyC"')).toBeLessThan(keydown.indexOf('event.key === "d"'))
  })
})

describe("워크벤치 배선 — CSV 버튼·셀 복사·0 차단 안내", () => {
  const workbench = read("components/admin/branch/SalesLedgerWorkbench.tsx")

  it("CSV는 필터·정렬 결과 전체(filteredRows, 페이지 무관)를 매트릭스와 같은 버킷 산식으로 낸다", () => {
    const exporter = sliceBetween(workbench, "const exportRevCsv = useCallback(", "}, [filteredRows")
    expect(exporter).toContain("buildRevMatrixCsvRows(filteredRows")
    expect(exporter).toContain("bucketOf: rowMonthBucket")
    expect(exporter).toContain("downloadCsvFile(safeFileName(")
    expect(workbench).toContain("onClick={exportRevCsv}")
  })

  it("셀 복사는 칸에 보이는 값(matrixDisplayedCellAmount), 0 차단은 큐 취소·되돌리기로 안내", () => {
    const copy = sliceBetween(workbench, "const copyMatrixCell = useCallback(", "const matrixEditor = useMatrixEditor(")
    expect(copy).toContain("matrixDisplayedCellAmount(row, coord, copySourceRef.current.pendingByCell)")
    expect(copy).toContain("copyTextToClipboard(String(value))")
    expect(workbench).toContain("onZeroCommitBlocked: onMatrixZeroCommitBlocked")
    expect(workbench).toContain("onCopyCell: copyMatrixCell")
  })
})

describe("RevMatrix 표시 — 대기 초안 값이 칸에 보인다(R-2)·원 단위 title(R-8)", () => {
  const matrix = read("components/admin/branch/ledger/RevMatrix.tsx")

  it("월 칸은 대기 초안 금액을 보이고, title은 장부 → 대기 초안(적용 전) 원 단위", () => {
    expect(matrix).toContain("const shownTotal = pending ? pending.amount : bucket.total")
    expect(matrix).toContain("{formatWeekAmount(shownTotal)}")
    expect(matrix).toContain("→ 대기 초안 ${formatExactMoney(pending.amount)}")
  })

  it("주차 칸은 pendingWeekDisplay로 고른 값, 행 주차 입력은 matrixWeekInputs 한 곳에서", () => {
    expect(matrix).toContain("weekPendingOf: (month, week, display) => pendingWeekDisplay(pendingByCell, row.id, month, week, display)")
    expect(matrix).toContain("const inputs = matrixWeekInputs(row, month)")
    expect(matrix).toContain("{shownDisplay > 0 ? formatWeekAmount(shownDisplay) : \"·\"}")
  })
})
