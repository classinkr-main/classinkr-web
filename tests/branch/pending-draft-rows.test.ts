import { describe, expect, it } from "vitest"

import { normalizedAccountKey } from "@/lib/branch/account-key"
import { buildPendingDraftRows } from "@/components/admin/branch/ledger/pending-draft-rows"
import type { LedgerDraft, LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

// 매출 장부 입력 속도 라운드 — P1-4 준비 단계. buildPendingDraftRows(미적용 new-row 초안 →
// 매트릭스 임시 행)의 규칙 7개 + 부가 동작(합산·정렬·id 안정성·빈 입력)을 실제 함수 호출로
// 고정한다. 이 함수는 렌더/DOM 의존이 없는 순수 함수라 다른 tests/branch/*의 "소스 스캔" 관례
// (React 렌더 하네스 부재 우회)를 쓸 필요가 없다 — 직접 구동해 검증한다.

// 워크벤치 회계연도 매트릭스 열과 같은 형태(12개월). 월 스코프를 검증하는 테스트만 이 목록
// 밖의 달을 쓴다.
const MATRIX_MONTHS = [
  "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
  "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
]

// 픽스처 팩토리(유일) — LedgerDraft shape를 직접 만들어 쓴다. existingRows(LedgerRevenueRow)는
// 2개 테스트에서만 필요해 그 자리에서 리터럴로 직접 만든다(팩토리를 늘리지 않는다).
function makeDraft(overrides: Partial<LedgerDraft> = {}): LedgerDraft {
  const now = new Date().toISOString()
  return {
    id: "srv-1",
    kind: "new-row",
    status: "draft",
    customer: "새 학원",
    manager: "김지사",
    team: "BD",
    month: "2026-07",
    amount: 1_000_000,
    note: "",
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function run(drafts: LedgerDraft[], opts: Partial<{ team: string; matrixMonths: string[]; existingRows: LedgerRevenueRow[] }> = {}) {
  return buildPendingDraftRows({
    drafts,
    matrixMonths: opts.matrixMonths ?? MATRIX_MONTHS,
    team: opts.team ?? "ALL",
    existingRows: opts.existingRows ?? [],
  })
}

describe("규칙 1 — 미적용(draft|checked) 초안만 행을 만든다", () => {
  it("applied·cancelled 초안은 제외하고 draft·checked만 행이 된다", () => {
    const drafts: LedgerDraft[] = [
      makeDraft({ id: "d-draft", status: "draft", customer: "학원A" }),
      makeDraft({ id: "d-checked", status: "checked", customer: "학원B" }),
      makeDraft({ id: "d-applied", status: "applied", customer: "학원C" }),
      makeDraft({ id: "d-cancelled", status: "cancelled", customer: "학원D" }),
    ]
    const rows = run(drafts)
    expect(rows.map((row) => row.customer).sort()).toEqual(["학원A", "학원B"])
  })
})

describe("규칙 2 — kind가 new-row인 것만 행을 만든다", () => {
  it("edit-row 초안은 셀에 pending 점으로만 표시되므로 임시 행을 만들지 않는다", () => {
    const drafts: LedgerDraft[] = [
      makeDraft({ id: "d-new", kind: "new-row", customer: "학원A" }),
      makeDraft({ id: "d-edit", kind: "edit-row", customer: "학원B", sourceDealId: "deal-1" }),
    ]
    const rows = run(drafts)
    expect(rows.map((row) => row.customer)).toEqual(["학원A"])
  })
})

describe("규칙 3 — 표시 월/팀 스코프", () => {
  it("matrixMonths 밖의 월은 제외한다", () => {
    const drafts: LedgerDraft[] = [
      makeDraft({ id: "d-in", customer: "학원A", month: "2026-07" }),
      makeDraft({ id: "d-out", customer: "학원B", month: "2025-01" }),
    ]
    const rows = run(drafts)
    expect(rows.map((row) => row.customer)).toEqual(["학원A"])
  })

  it("team이 ALL이 아니면 그 팀의 초안만 행을 만든다", () => {
    const drafts: LedgerDraft[] = [
      makeDraft({ id: "d-bd", customer: "학원A", team: "BD" }),
      makeDraft({ id: "d-mkt", customer: "학원B", team: "MKT" }),
    ]
    const rows = run(drafts, { team: "BD" })
    expect(rows.map((row) => row.customer)).toEqual(["학원A"])
  })

  it("team이 ALL이면 팀과 무관하게 전부 포함한다", () => {
    const drafts: LedgerDraft[] = [
      makeDraft({ id: "d-bd", customer: "학원A", team: "BD" }),
      makeDraft({ id: "d-mkt", customer: "학원B", team: "MKT" }),
    ]
    const rows = run(drafts, { team: "ALL" })
    expect(rows.map((row) => row.customer).sort()).toEqual(["학원A", "학원B"])
  })
})

describe("규칙 4 — existingRows에 같은 정규화 키가 있으면 임시 행을 만들지 않는다", () => {
  it("정확히 같은 고객명이 이미 매트릭스에 있으면 제외한다", () => {
    const existing: LedgerRevenueRow = {
      id: "row-1", customer: "기존 고객", manager: null, team: "BD", region: null,
      revenue: 0, ledgerOrigin: "sheet",
    }
    const drafts: LedgerDraft[] = [makeDraft({ id: "d-1", customer: "기존 고객" })]
    expect(run(drafts, { existingRows: [existing] })).toEqual([])
  })

  it("표기만 다른 같은 정규화 키(\"OO학원\" vs \"OO 학원\")도 제외 대상이다", () => {
    const existing: LedgerRevenueRow = {
      id: "row-1", customer: "OO학원", manager: null, team: "BD", region: null,
      revenue: 0, ledgerOrigin: "sheet",
    }
    const drafts: LedgerDraft[] = [makeDraft({ id: "d-1", customer: "OO 학원" })]
    expect(run(drafts, { existingRows: [existing] })).toEqual([])
  })

  it("다른 고객(정규화 키가 다름)이면 제외되지 않는다", () => {
    const existing: LedgerRevenueRow = {
      id: "row-1", customer: "기존 고객", manager: null, team: "BD", region: null,
      revenue: 0, ledgerOrigin: "sheet",
    }
    const drafts: LedgerDraft[] = [makeDraft({ id: "d-1", customer: "새 고객" })]
    const rows = run(drafts, { existingRows: [existing] })
    expect(rows.map((row) => row.customer)).toEqual(["새 고객"])
  })
})

describe("규칙 5 — 같은 고객의 초안을 행 하나로 합친다", () => {
  it("여러 달에 걸친 초안은 행 하나로 합치고 monthlyPayments에 달별로 싣는다(월 합산)", () => {
    const drafts: LedgerDraft[] = [
      makeDraft({ id: "d-1", customer: "새 고객", month: "2026-04", amount: 1_000_000 }),
      makeDraft({ id: "d-2", customer: "새 고객", month: "2026-07", amount: 2_000_000 }),
    ]
    const rows = run(drafts)
    expect(rows).toHaveLength(1)
    expect(rows[0].monthlyPayments).toEqual({ "2026-04": 1_000_000, "2026-07": 2_000_000 })
    expect(rows[0].revenue).toBe(3_000_000)
    expect(rows[0].pendingDraftIds).toEqual(["d-1", "d-2"])
  })

  it("같은 달 초안 2건은 금액과 확도 맵(확정)을 합산한다(같은 달 2건 합산)", () => {
    const drafts: LedgerDraft[] = [
      makeDraft({ id: "d-1", customer: "새 고객", month: "2026-07", amount: 1_000_000, metadata: { confidence: "confirmed" } }),
      makeDraft({ id: "d-2", customer: "새 고객", month: "2026-07", amount: 500_000, metadata: { confidence: "confirmed" } }),
    ]
    const rows = run(drafts)
    expect(rows).toHaveLength(1)
    expect(rows[0].monthlyPayments).toEqual({ "2026-07": 1_500_000 })
    expect(rows[0].monthlyConfirmed).toEqual({ "2026-07": 1_500_000 })
    // 둘 다 전액 확정 → 합계도 전액 확정이라 red가 선다.
    expect(rows[0].monthlyRed).toEqual({ "2026-07": true })
  })

  it("부분 확정 두 건의 합이 전액이 아니면 red를 단순 OR로 합치지 않는다", () => {
    const drafts: LedgerDraft[] = [
      // 자기 몫(100만)은 전액 확정.
      makeDraft({ id: "d-1", customer: "새 고객", month: "2026-07", amount: 1_000_000, metadata: { confidence: "confirmed" } }),
      // 자기 몫(100만) 중 40만만 주차 단위로 확정.
      makeDraft({
        id: "d-2", customer: "새 고객", month: "2026-07", amount: 1_000_000,
        metadata: {
          weekly: [400_000, 0, 0, 0, 0],
          weeklyConfidence: ["confirmed", null, null, null, null],
          confidence: "expected",
        },
      }),
    ]
    const rows = run(drafts)
    expect(rows[0].monthlyPayments).toEqual({ "2026-07": 2_000_000 })
    expect(rows[0].monthlyConfirmed).toEqual({ "2026-07": 1_400_000 }) // 100만 + 40만
    expect(rows[0].monthlyRed).toEqual({}) // 140만 < 200만-1 → 전액확정 아님
  })

  it("같은 달 2건이 각각 주차 정보를 가지면 weeklyPayments도 주차별로 합산한다", () => {
    const drafts: LedgerDraft[] = [
      makeDraft({ id: "d-1", customer: "새 고객", month: "2026-07", amount: 1_000_000, metadata: { weekly: [500_000, 0, 500_000, 0, 0] } }),
      makeDraft({ id: "d-2", customer: "새 고객", month: "2026-07", amount: 500_000, metadata: { weekly: [0, 300_000, 0, 200_000, 0] } }),
    ]
    const rows = run(drafts)
    expect(rows[0].monthlyPayments).toEqual({ "2026-07": 1_500_000 })
    expect(rows[0].weeklyPayments).toEqual({ "2026-07": [500_000, 300_000, 500_000, 200_000, 0] })
  })
})

describe("규칙 6 — id는 pending-{정규화키} 접두어로 안정적이다", () => {
  it("같은 입력으로 두 번 호출해도 id·행 전체가 동일하다", () => {
    const buildDrafts = (): LedgerDraft[] => [
      makeDraft({ id: "d-1", customer: "새 고객", month: "2026-04", amount: 1_000_000 }),
      makeDraft({ id: "d-2", customer: "새 고객", month: "2026-07", amount: 2_000_000 }),
    ]
    const first = run(buildDrafts())
    const second = run(buildDrafts())
    expect(first[0].id).toBe(`pending-${normalizedAccountKey("새 고객")}`)
    expect(first).toEqual(second)
  })
})

describe("규칙 7 — 로컬 전용(local-) 초안도 행으로 보여주되 pendingLocalOnly를 표시한다", () => {
  it("local- 접두어 초안은 행을 만들고 pendingLocalOnly=true를 싣는다", () => {
    const drafts: LedgerDraft[] = [makeDraft({ id: "local-1699999999", customer: "로컬 고객" })]
    const rows = run(drafts)
    expect(rows).toHaveLength(1)
    expect(rows[0].pendingLocalOnly).toBe(true)
    expect(rows[0].pendingDraftIds).toEqual(["local-1699999999"])
  })

  it("서버 초안만 있으면 pendingLocalOnly는 false다", () => {
    const drafts: LedgerDraft[] = [makeDraft({ id: "srv-9", customer: "서버 고객" })]
    const rows = run(drafts)
    expect(rows[0].pendingLocalOnly).toBe(false)
  })
})

it("정렬 — 고객명 localeCompare(ko) 오름차순", () => {
  const drafts: LedgerDraft[] = [
    makeDraft({ id: "d-da", customer: "다 학원" }),
    makeDraft({ id: "d-ga", customer: "가 학원" }),
    makeDraft({ id: "d-na", customer: "나 학원" }),
  ]
  const rows = run(drafts)
  expect(rows.map((row) => row.customer)).toEqual(["가 학원", "나 학원", "다 학원"])
})

it("빈 입력이면 빈 배열을 반환한다", () => {
  expect(run([])).toEqual([])
})

it("반환 행의 ledgerOrigin·draftKind·기본 필드가 워크벤치 규약과 같은 모양이다", () => {
  const rows = run([makeDraft({ id: "d-1", customer: "새 고객" })])
  expect(rows[0].ledgerOrigin).toBe("draft")
  expect(rows[0].draftKind).toBe("new-row")
  expect(rows[0].region).toBeNull()
  expect(rows[0].contractTarget).toBe(0)
})
