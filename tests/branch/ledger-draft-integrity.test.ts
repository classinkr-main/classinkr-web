// 라운드 5 정합 결함 수리(docs/active/sales-ledger-view-ux-round5-plan-2026-09-23.md §3.2) 회귀 고정.
// 순수 함수는 직접 구동하고, 워크벤치 배선은 이 저장소 관례대로 소스 스캔으로 확인한다(렌더 하네스 없음).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { capLedgerDrafts, isOpenLedgerDraft } from "@/components/admin/branch/ledger/draft-list"
import {
  buildMatrixPastePlan,
  mergeWeeklyCellEdit,
  type MatrixPastePlan,
} from "@/components/admin/branch/ledger/rev-matrix-logic"
import { rowMonthConfidenceTone, type LedgerDraft, type LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"
import { revPageResetSignature } from "@/components/admin/branch/ledger/workbench-shared"
import { mergeRecentAndOpenDraftRows } from "@/lib/repositories/branch-sales-ledger-drafts"

const workbenchSource = () => readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8")

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커를 찾지 못함: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `종료 마커를 찾지 못함: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

function draft(id: string, status: LedgerDraft["status"]): LedgerDraft {
  return {
    id,
    kind: "edit-row",
    status,
    customer: `고객-${id}`,
    manager: "",
    team: "BD",
    month: "2026-09",
    amount: 1000,
    note: "",
    createdAt: "2026-09-23T00:00:00Z",
    updatedAt: "2026-09-23T00:00:00Z",
  } as LedgerDraft
}

function row(overrides: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
  return {
    id: "row-x",
    customer: "테스트 고객",
    manager: "매니저",
    team: "BD",
    region: null,
    revenue: 0,
    ledgerOrigin: "sheet",
    monthlyPayments: {},
    ...overrides,
  } as LedgerRevenueRow
}

describe("Q-1 capLedgerDrafts — 열린 초안은 자르지 않는다", () => {
  it("열린(draft·checked)·로컬 초안은 전부, 닫힌(적용·취소) 초안만 최근 N건", () => {
    const list = [
      ...Array.from({ length: 70 }, (_, index) => draft(`open-${index}`, index % 2 ? "checked" : "draft")),
      ...Array.from({ length: 80 }, (_, index) => draft(`closed-${index}`, index % 2 ? "applied" : "cancelled")),
      draft("local-1", "draft"),
    ]
    const kept = capLedgerDrafts(list, 50)
    expect(kept.filter((item) => isOpenLedgerDraft(item))).toHaveLength(71)
    expect(kept.filter((item) => !isOpenLedgerDraft(item))).toHaveLength(50)
    // 순서 유지 — 닫힌 초안은 앞쪽(최신) 50건이 남는다.
    expect(kept.find((item) => item.id === "closed-49")).toBeDefined()
    expect(kept.find((item) => item.id === "closed-50")).toBeUndefined()
  })

  it("서버 병합: 최근 이력과 열린 초안을 id로 합쳐 최근 수정순으로", () => {
    const merged = mergeRecentAndOpenDraftRows(
      [
        { id: "a", updated_at: "2026-09-23T03:00:00Z" },
        { id: "b", updated_at: "2026-09-23T01:00:00Z" },
      ],
      [
        { id: "b", updated_at: "2026-09-23T01:00:00Z" },
        { id: "c", updated_at: "2026-09-23T02:00:00Z" },
      ],
    )
    expect(merged.map((item) => item.id)).toEqual(["a", "c", "b"])
  })
})

describe("R-W mergeWeeklyCellEdit — 주차 연속 편집이 앞 편집을 지우지 않는다", () => {
  it("W1=150 저장(대기 초안) 뒤 W2=250을 고치면 W1=150이 남는다", () => {
    const rowWeeks = [100, 200, 0, 0, 0]
    const first = mergeWeeklyCellEdit({
      rowWeeks,
      pendingWeekly: null,
      week: 0,
      amount: 150,
      confidence: "expected",
      baseWeeklyConfidence: null,
    })
    expect(first.weeks).toEqual([150, 200, 0, 0, 0])
    const second = mergeWeeklyCellEdit({
      rowWeeks, // 행 표시값은 여전히 시트 값(대기 초안은 적용 전)
      pendingWeekly: first.weeks,
      week: 1,
      amount: 250,
      confidence: "confirmed",
      baseWeeklyConfidence: first.weeklyConfidence,
    })
    expect(second.weeks).toEqual([150, 250, 0, 0, 0])
    expect(second.total).toBe(400)
    expect(second.weeklyConfidence).toEqual(["expected", "confirmed", null, null, null])
  })

  it("대기 초안이 없으면 행 표시값 기준(기존 규약), 0이 된 주차 확도는 null", () => {
    const merged = mergeWeeklyCellEdit({
      rowWeeks: [100, 200, 0, 0, 0],
      pendingWeekly: null,
      week: 1,
      amount: 0,
      confidence: "confirmed",
      baseWeeklyConfidence: ["high-confidence", "confirmed", null, null, null],
    })
    expect(merged.weeks).toEqual([100, 0, 0, 0, 0])
    expect(merged.weeklyConfidence).toEqual(["high-confidence", null, null, null, null])
  })

  it("워크벤치 buildCellDraftInput이 같은 달 대기 초안(월 키)을 병합 기준으로 넘긴다", () => {
    const body = sliceBetween(workbenchSource(), "const buildCellDraftInput = useCallback", "const onMatrixAmountClamped = useCallback")
    expect(body).toContain("lookupMatrixPending(pendingByCell, { rowId, month })")
    expect(body).toContain("pendingWeekly: monthPending?.weekly ?? null")
  })
})

describe("R-1 붙여넣기 이름 매칭 — 화면 밖 고객을 새 행 후보로 오분류하지 않는다", () => {
  const MONTHS = ["2026-09", "2026-10"]
  const visibleRow = row({ id: "row-a", customer: "한빛학원" })
  const hiddenRow = row({ id: "row-b", customer: "새싹어학원" })
  function plan(allRows?: LedgerRevenueRow[]): MatrixPastePlan {
    const result = buildMatrixPastePlan(
      ["한빛학원\t100000", "새싹어학원\t200000", "처음 보는 학원\t300000"].join("\n"),
      { rowId: "row-a", month: "2026-09" },
      [visibleRow],
      MONTHS,
      new Map(),
      allRows,
    )
    if (!result) throw new Error("plan null")
    return result
  }

  it("전체 행을 주면 화면 밖 고객은 outOfViewNames, 장부에 없는 고객만 unmatched(새 행 후보)", () => {
    const result = plan([visibleRow, hiddenRow])
    expect(result.cells.map((cell) => cell.rowId)).toEqual(["row-a"])
    expect(result.outOfViewNames).toEqual(["새싹어학원"])
    expect(result.unmatched.map((item) => item.name)).toEqual(["처음 보는 학원"])
  })

  it("전체 행을 안 주면 예전과 같다(하위호환)", () => {
    const result = plan()
    expect(result.outOfViewNames).toEqual([])
    expect(result.unmatched.map((item) => item.name)).toEqual(["새싹어학원", "처음 보는 학원"])
  })

  it("워크벤치가 붙여넣기 계획에 전체 행(rows)을 넘긴다", () => {
    expect(workbenchSource()).toContain(
      "buildMatrixPastePlan(text, anchor, visibleDealRows, matrixMonths, editRowOverrideMonths, rows)",
    )
  })
})

describe("K-1·K-2 레일·콕핏 저장 — 화면 밖 딜의 이중 계상 판정과 편집 격리", () => {
  it("saveDraft는 선택 행 자체로 대기 초안 맵을 만든다(보이는 행의 pendingByCell이 아니라)", () => {
    const body = sliceBetween(workbenchSource(), "const saveDraft = useCallback", "const editDraft = useCallback")
    expect(body).toContain("railDedupTarget(buildMatrixPendingByCell(drafts, [selectedRow]), selectedRow.id")
    expect(body).not.toContain("railDedupTarget(pendingByCell,")
  })

  it("saveEditedDraft·잠금 사전검사는 전체 행에서 딜을 찾는다(rowByDealKey = rows)", () => {
    const source = workbenchSource()
    const map = sliceBetween(source, "const rowByDealKey = useMemo(() => {", "}, [rows])")
    expect(map).toContain("for (const row of rows) map.set(row.sourceDealId ?? row.id, row)")
    const edited = sliceBetween(source, "const saveEditedDraft = useCallback", "const revenue = summary.data?.revenue")
    expect(edited).toContain("railDedupTarget(buildMatrixPendingByCell(drafts, [dedupRow]), dedupRow.id")
  })

  it("편집 중 초안(base)의 딜·시트 행·스냅샷이 선택 행보다 우선한다", () => {
    const body = sliceBetween(
      workbenchSource(),
      "const buildDraftInput = useCallback",
      "}, [detail, draftForm, lens, period, selectedMonth, selectedRow, team])",
    )
    expect(body).toContain("const sourceSnapshot = base ? base.sourceSnapshot :")
    expect(body).toContain("base.sourceDealId ?? metadataString(base.metadata, \"sourceDealId\")")
    expect(body).toContain("base ? (base.sourceSheetRow ?? null)")
  })

  it("다른 딜을 고르면(loadDealDetail) 초안 편집 상태를 끝낸다", () => {
    const body = sliceBetween(workbenchSource(), "const loadDealDetail = useCallback", "}, [selectedMonth, team])")
    expect(body).toContain("setEditingDraftId(null)")
  })
})

describe("Q-2·Q-4 레일 프리필 — 그 달 금액과 시트 색 확도", () => {
  it("loadDealDetail은 폼 월 금액(rowMonthAmount)으로 채우고 기간 합계(row.revenue)로 떨어지지 않는다", () => {
    const body = sliceBetween(workbenchSource(), "const loadDealDetail = useCallback", "}, [selectedMonth, team])")
    expect(body).toContain("const formMonthAmount = rowMonthAmount(row, formMonth)")
    expect(body).toContain(": rowMonthAmount(row, current.month)")
    expect(body).not.toContain("row.revenue ? String")
    expect(body).not.toContain("?? row.revenue ?? 0")
    expect(body).toContain(": rowMonthConfidenceTone(row, formMonth)")
  })

  it("rowMonthConfidenceTone — 전액 확정=확정, 고확도 보유=고확도, 나머지·빈 달=예정", () => {
    const month = "2026-09"
    expect(rowMonthConfidenceTone(row({ monthlyPayments: { [month]: 100 }, monthlyConfirmed: { [month]: 100 } }), month)).toBe("confirmed")
    expect(
      rowMonthConfidenceTone(row({ monthlyPayments: { [month]: 100 }, monthlyHighConfidence: { [month]: 40 } }), month),
    ).toBe("high-confidence")
    expect(rowMonthConfidenceTone(row({ monthlyPayments: {} }), month)).toBe("expected")
  })
})

describe("R-4 페이지 복원 — 필터가 실제로 바뀔 때만 1페이지", () => {
  const base = {
    managerFilter: new Set(["김", "이"]),
    regionFilter: new Set<string>(),
    period: "Q",
    team: "ALL",
    query: "한빛",
    productFilter: "all",
    revStatusFilter: "ALL",
    revDealTypeFilter: "ALL",
    revOriginFilter: "all",
    revForecastFilter: "all",
    revSortKey: "revenue",
    revSortDirection: "desc",
    revPageSize: 100,
    selectedMonth: "2026-09",
  }

  it("같은 값의 새 Set·순서만 다른 Set은 같은 시그니처(리셋하지 않음)", () => {
    expect(revPageResetSignature({ ...base, managerFilter: new Set(["이", "김"]) })).toBe(revPageResetSignature(base))
  })

  it("검색어가 바뀌면 다른 시그니처(리셋)", () => {
    expect(revPageResetSignature({ ...base, query: "새싹" })).not.toBe(revPageResetSignature(base))
  })

  it("복원 effect가 기준 시그니처를 적고, 리셋 effect는 urlReady 전에는 돌지 않는다", () => {
    const source = workbenchSource()
    expect(source).toContain("revPageResetBaselineRef.current = revPageResetSignature({")
    const reset = sliceBetween(source, "// 필터·정렬·기간이 실제로 바뀌면 1페이지로", "const editingDraft = useMemo")
    expect(reset).toContain("if (!urlReady) return")
    expect(reset).toContain("if (revPageResetBaselineRef.current === signature) return")
  })
})
