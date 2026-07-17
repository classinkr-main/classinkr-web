import { describe, expect, it } from "vitest"
import {
  isMatrixCellEditable,
  isMatrixCellLocked,
} from "@/components/admin/branch/SalesLedgerWorkbench"
import type { LedgerRevenueRow } from "@/components/admin/branch/SalesLedgerWorkbench"

// 회귀 방지(품질 웨이브 4, 항목 1): 적용된 수정(edit-row) 초안은 원본 시트행의 그 달 금액을
// 0으로 지운다(SalesLedgerWorkbench의 adjustedSheetRows — 이중계상 방지를 위한 기존 동작, 이
// 테스트가 건드리지 않는다). 문제는 isMatrixCellLocked의 기존 "금액 0이면 편집 가능" 분기가
// 그 지워진 셀을 다시 미입력 취급해 재편집을 허용했다는 점 — 재편집으로 새 초안이 쌓이면
// 이미 적용된 정정 + 신규 셀 입력이 같은 (딜, 월)에 겹쳐 이중계상된다. 이 테스트는
// correctedMonths 가드가 금액과 무관하게 그 셀을 잠그는지 검증한다.

function makeRow(overrides: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
  return {
    id: "row-1",
    sourceDealId: "deal-1",
    customer: "테스트 학원",
    manager: "김지사",
    team: "BD",
    region: null,
    revenue: 0,
    ledgerOrigin: "sheet",
    monthlyPayments: {},
    ...overrides,
  }
}

describe("정정 적용 후 원본 셀 재잠금 (품질 웨이브 4, 항목 1)", () => {
  it("정정으로 지워진(금액 0) 달은 correctedMonths에 있으면 여전히 잠금이다", () => {
    // adjustedSheetRows가 원본 금액을 지운 뒤 상태를 흉내: 그 달 금액은 0.
    const row = makeRow({ monthlyPayments: { "2026-08": 0 } })
    const correctedMonths = new Set(["2026-08"])

    expect(isMatrixCellLocked(row, "2026-08", correctedMonths)).toBe(true)
    expect(isMatrixCellEditable(row, "2026-08", correctedMonths)).toBe(false)
  })

  it("correctedMonths가 없으면(정정 없음) 금액 0인 달은 기존처럼 편집 가능(예정 추가)이다", () => {
    const row = makeRow({ monthlyPayments: { "2026-08": 0 } })

    expect(isMatrixCellLocked(row, "2026-08")).toBe(false)
    expect(isMatrixCellEditable(row, "2026-08")).toBe(true)
  })

  it("correctedMonths에 있어도 다른 달은 기존 잠금 규칙을 그대로 따른다", () => {
    const row = makeRow({ monthlyPayments: { "2026-08": 0, "2026-09": 1_000_000 } })
    const correctedMonths = new Set(["2026-08"])

    // 9월은 정정 대상이 아니고 금액이 있으며 확정/red 플래그가 없으니 편집 가능.
    expect(isMatrixCellLocked(row, "2026-09", correctedMonths)).toBe(false)
    expect(isMatrixCellEditable(row, "2026-09", correctedMonths)).toBe(true)
  })

  it("적용된 초안 자신의 셀(ledgerOrigin=draft)은 correctedMonths 없이도 기존처럼 잠긴다", () => {
    const draftRow = makeRow({
      id: "draft-srv-1",
      ledgerOrigin: "draft",
      draftMonth: "2026-08",
      monthlyPayments: { "2026-08": 1_500_000 },
    })

    expect(isMatrixCellLocked(draftRow, "2026-08")).toBe(true)
  })
})
