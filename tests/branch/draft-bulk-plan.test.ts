// 입력 표 조작 개선(2026-09-14) — 체크 큐 일괄 체크·일괄 적용 대상 계산.
// 3단계(초안→체크→적용)는 유지하되, 한 건씩 누르던 체크·적용을 보이는 목록 단위로 한 번에.
// 로컬 임시 초안(local-*)은 서버 적용 대상이 아니므로 적용 계획에서 뺀다.
import { describe, expect, it } from "vitest"

import { planBulkApply, planBulkCheck } from "@/components/admin/branch/ledger/draft-bulk-plan"

const drafts = [
  { id: "a", status: "draft", amount: 1000 },
  { id: "b", status: "checked", amount: 2500 },
  { id: "c", status: "draft", amount: 300 },
  { id: "d", status: "applied", amount: 9999 },
  { id: "local-1", status: "checked", amount: 700 },
  { id: "e", status: "cancelled", amount: 50 },
] as const

describe("planBulkCheck", () => {
  it("targets only drafts still in 'draft' status, with their total", () => {
    expect(planBulkCheck(drafts)).toEqual({ ids: ["a", "c"], count: 2, total: 1300 })
  })

  it("returns an empty plan when nothing is checkable", () => {
    expect(planBulkCheck([{ id: "x", status: "checked", amount: 1 }])).toEqual({ ids: [], count: 0, total: 0 })
  })
})

describe("planBulkApply", () => {
  it("targets checked server drafts only and reports skipped local drafts", () => {
    expect(planBulkApply(drafts)).toEqual({ ids: ["b"], count: 1, total: 2500, skippedLocal: 1 })
  })
})
