// 라운드 5 B-1·B-4·B-5·B-6 — 보드·콕핏 동선(입력 직행·필터 표시·로딩/오류·대기 초안 점) 회귀 고정.
// 보드·콕핏 목록은 SSR로 직접 그려 보고(renderToStaticMarkup — 훅은 초기값으로 돈다), 워크벤치 배선은 소스로 확인한다.
import { readFileSync } from "fs"
import { join } from "path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CockpitDealList } from "@/components/admin/branch/ledger/CockpitDealList"
import { ForecastBoard } from "@/components/admin/branch/ledger/ForecastBoard"
import type { MatrixPendingDraft } from "@/components/admin/branch/ledger/rev-matrix-logic"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"
import { RevLoadErrorPanel } from "@/components/admin/branch/ledger/workbench-shared"

const MONTH = "2026-09"
const MONTH_OPTIONS = [{ value: MONTH, label: "9월" }]

function row(overrides: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
  return {
    id: "row-1",
    customer: "한빛학원",
    manager: "Minjae",
    team: "BD",
    region: "서울",
    revenue: 0,
    ledgerOrigin: "sheet",
    monthlyPayments: { [MONTH]: 1_000_000 },
    ...overrides,
  } as LedgerRevenueRow
}

const pending: MatrixPendingDraft = {
  id: "draft-1",
  amount: 1_234_567,
  confidence: "high-confidence",
  weekly: null,
  weeklyConfidence: null,
}

function board(pendingByCell: Map<string, MatrixPendingDraft> | null) {
  return renderToStaticMarkup(
    <ForecastBoard
      rows={[row(), row({ id: "row-2", customer: "다온학원" })]}
      selectedMonth={MONTH}
      monthOptions={MONTH_OPTIONS}
      onSelectMonth={() => {}}
      onOpenRow={() => {}}
      pendingByCell={pendingByCell}
    />,
  )
}

describe("ForecastBoard — 대기 초안 점(B-6)·입력 직행 안내(B-1)", () => {
  it("대기 초안이 걸린 행의 카드에만 확도색 점과 원 단위 금액 title", () => {
    const html = board(new Map([[`row-1::${MONTH}`, pending]]))
    expect(html.match(/data-pending-dot/g)).toHaveLength(1)
    expect(html).toContain("대기 초안 있음")
    expect(html).toContain("대기 초안 ¥1,234,567(고확도) — 적용 전, 체크 큐에서 확인")
    expect(html).toContain("누르면 빠른 입력")
  })

  it("대기 초안이 없거나 다른 달이면 점이 없다", () => {
    expect(board(null)).not.toContain("data-pending-dot")
    expect(board(new Map([["row-1::2026-10", pending]]))).not.toContain("data-pending-dot")
  })

  it("안내 문구가 입력 직행을 말한다", () => {
    expect(board(null)).toContain("우측 빠른 입력이 그 행·그 달로 바로 열립니다")
  })
})

describe("CockpitDealList — 대기 금액 줄(B-6)", () => {
  function list(pendingByCell: Map<string, MatrixPendingDraft> | null) {
    return renderToStaticMarkup(
      <CockpitDealList
        rows={[row()]}
        pendingByCell={pendingByCell}
        selectedMonth={MONTH}
        monthOptions={MONTH_OPTIONS}
        onSelectMonth={() => {}}
        openDraftCount={1}
        onOpenQueue={() => {}}
        selectedRowId={null}
        onSelectDeal={() => {}}
        onNewDeal={() => {}}
      />,
    )
  }

  it("대기 초안이 있으면 확도색 '대기 ¥…' 줄, 없으면 없음", () => {
    const html = list(new Map([[`row-1::${MONTH}`, pending]]))
    expect(html).toContain("대기 ¥123.5만")
    expect(html).toContain("대기 초안 ¥1,234,567(고확도)")
    expect(list(null)).not.toContain("대기 ¥")
  })
})

describe("RevLoadErrorPanel — 조회 실패를 '행 없음'과 구분(B-5)", () => {
  it("원인과 재시도, framed면 카드 테두리", () => {
    const html = renderToStaticMarkup(<RevLoadErrorPanel framed error="fetch failed" onRetry={() => {}} />)
    expect(html).toContain("REV 데이터를 불러오지 못했습니다")
    expect(html).toContain("fetch failed")
    expect(html).toContain("다시 불러오기")
    expect(html).toContain('role="alert"')
    expect(html).toContain("rounded-lg border")
  })
})

describe("워크벤치 배선 — 보드·콕핏", () => {
  const source = readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8")

  it("보드 카드 = 빠른 입력 직행, 대기 초안은 화면 전체 행 기준 맵", () => {
    expect(source).toContain("onOpenRow={(row) => void openQuickInputForRow(row)}")
    expect(source).toContain('lens === "board" || lens === "cockpit" ? buildMatrixPendingByCell(drafts, filteredRows) : null')
    expect(source.match(/pendingByCell=\{lensPendingByCell\}/g)).toHaveLength(2)
  })

  it("보드·콕핏은 REV 필터 칩과 초기화를 같은 줄에, 로딩·오류는 REV와 같은 패널로", () => {
    expect(source).toContain('(lens === "board" || lens === "cockpit") && revRowFilterCount > 0')
    expect(source.match(/\{revFilterTags\}/g)).toHaveLength(2)
    expect(source).toContain("<RevLoadErrorPanel framed")
    expect(source).toContain('(lens === "board" || lens === "cockpit") && !pipeline.data && (pipeline.loading || pipeline.error)')
  })
})
