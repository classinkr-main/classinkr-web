import { describe, expect, it } from "vitest"

import {
  buildCrmDealEditPatch,
  buildCrmDealInsert,
  statusForStage,
  toCrmDealRecord,
} from "@/lib/repositories/crm-deals"
import type { CrmDeal } from "@/lib/supabase/database.types"

describe("statusForStage", () => {
  it("derives terminal status from stage", () => {
    expect(statusForStage("consult")).toBe("open")
    expect(statusForStage("order")).toBe("open")
    expect(statusForStage("won")).toBe("won")
    expect(statusForStage("lost")).toBe("lost")
  })
})

describe("buildCrmDealInsert", () => {
  it("normalizes a deal with derived status and rounded amount", () => {
    const insert = buildCrmDealInsert({
      targetType: "neo_account",
      targetId: "acc-1",
      targetLabel: "큰학원",
      title: "  연장 제안  ",
      stage: "quote",
      expectedAmount: 1234.7,
      expectedCloseAt: "2026-07-15T00:00:00.000Z",
      createdBy: "김지사",
    })
    expect(insert).toMatchObject({
      target_type: "neo_account",
      target_id: "acc-1",
      title: "연장 제안",
      stage: "quote",
      status: "open",
      expected_amount: 1235,
      expected_close_at: "2026-07-15T00:00:00.000Z",
    })
    expect(insert.closed_at).toBeNull()
  })

  it("falls back safely and marks won stage as won status", () => {
    const insert = buildCrmDealInsert({ title: "  ", stage: "won", expectedAmount: NaN, expectedCloseAt: "nope" })
    expect(insert.title).toBe("제목 없는 딜")
    expect(insert.status).toBe("won")
    expect(insert.expected_amount).toBeNull()
    expect(insert.expected_close_at).toBeNull()
    expect(insert.target_type).toBe("unknown")
  })
})

describe("buildCrmDealEditPatch", () => {
  it("only patches provided fields", () => {
    expect(buildCrmDealEditPatch({ riskNote: "예산 보류" })).toEqual({ risk_note: "예산 보류" })
    expect(buildCrmDealEditPatch({ expectedAmount: null, quoteRef: "  " })).toEqual({
      expected_amount: null,
      quote_ref: null,
    })
    expect(buildCrmDealEditPatch({})).toEqual({})
  })
})

describe("toCrmDealRecord", () => {
  it("maps a db row to a camelCase record", () => {
    const row: CrmDeal = {
      id: "deal-1",
      target_type: "lead",
      target_id: "lead-9",
      target_label: "테스트 학원",
      owner_key: "owner-a",
      owner_name_snapshot: "김지사",
      title: "신규 도입",
      stage: "demo",
      status: "open",
      expected_amount: 5000,
      expected_close_at: "2026-08-01T00:00:00.000Z",
      next_task_id: null,
      quote_ref: "Q-1",
      order_ref: null,
      risk_note: null,
      created_by: "김지사",
      closed_at: null,
      closed_by: null,
      created_at: "2026-06-27T00:00:00.000Z",
      updated_at: "2026-06-27T00:00:00.000Z",
    }
    expect(toCrmDealRecord(row)).toMatchObject({
      id: "deal-1",
      targetType: "lead",
      stage: "demo",
      expectedAmount: 5000,
      quoteRef: "Q-1",
    })
  })
})
