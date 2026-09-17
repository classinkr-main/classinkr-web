import { describe, expect, it } from "vitest"

import {
  C360_OVERRIDE_TTL_MS,
  applyC360Overrides,
  patchDealRow,
  type C360Override,
} from "@/components/admin/crm/drawer/c360-local-patch"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import type { CrmDealRecord } from "@/lib/repositories/crm-deals"

// 고객 360 드로어의 로컬 보정 계약을 순수 함수 수준에서 고정한다.
// 핵심은 "보정 patch 는 그 mutation 이 실제로 바꾼 필드만 담는다"는 호출자 계약이다.

function makeDeal(overrides: Partial<CrmDealRecord> = {}): CrmDealRecord {
  return {
    id: "deal-1",
    targetType: "lead",
    targetId: "lead-1",
    targetLabel: "테스트 학원",
    ownerKey: null,
    ownerNameSnapshot: null,
    title: "테스트 딜",
    stage: "consult",
    status: "open",
    expectedAmount: 1_000_000,
    expectedCloseAt: null,
    nextTaskId: null,
    quoteRef: null,
    orderRef: null,
    riskNote: null,
    createdBy: null,
    closedAt: null,
    closedBy: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  }
}

function makeCustomer360(deals: CrmDealRecord[]): Customer360 {
  return {
    deals: {
      generatedAt: "2026-09-15T00:00:00.000Z",
      health: { ok: true, message: null },
      summary: {
        total: deals.length,
        returned: deals.length,
        open: deals.filter((deal) => deal.status === "open").length,
        won: deals.filter((deal) => deal.status === "won").length,
        lost: deals.filter((deal) => deal.status === "lost").length,
        openAmount: 0,
        noNextActionCount: 0,
        aggregateTruncated: false,
      },
      pagination: { limit: 20, offset: 0, returned: deals.length, total: deals.length, hasMore: false, nextOffset: null },
      rows: deals,
    },
  } as unknown as Customer360
}

const NOW = Date.parse("2026-09-15T04:00:00.000Z")

function dealPatched(dealId: string, patch: Partial<CrmDealRecord>, at: number = NOW): C360Override {
  return { kind: "deal_patched", dealId, patch, at }
}

describe("patchDealRow", () => {
  it("patch 에 담긴 필드만 덮고 나머지는 그대로 둔다", () => {
    const row = makeDeal({ stage: "quote", ownerNameSnapshot: "김담당" })

    expect(patchDealRow(row, { stage: "decision" })).toMatchObject({
      stage: "decision",
      ownerNameSnapshot: "김담당",
      title: "테스트 딜",
    })
  })
})

describe("applyC360Overrides", () => {
  it("deal_patched 보정을 같은 id 의 딜 행에 얹는다", () => {
    const data = makeCustomer360([makeDeal({ id: "deal-1", stage: "quote" })])

    const result = applyC360Overrides(data, [dealPatched("deal-1", { stage: "decision" })], NOW)

    expect(result?.deals.rows[0].stage).toBe("decision")
  })

  it("보정 patch 가 바꾸지 않은 필드는 서버가 새로 준 값을 그대로 보여준다", () => {
    // 이 화면에서 단계만 바꾸는 동안, 다른 사람이 같은 딜의 담당자를 바꿨다.
    // 재조회 페이로드는 우리 쓰기는 아직 안 보이고(stage 는 옛 quote), 상대 쓰기는 이미 보인다.
    const beforeOwner = "김담당"
    const server = makeDeal({
      id: "deal-1",
      ownerNameSnapshot: "박담당",
      title: "1학기 도입 견적",
      expectedAmount: 3_000_000,
      stage: "quote",
      status: "open",
      closedAt: null,
      closedBy: null,
    })

    // handleDealStage 의 pickConfirmed 가 실제로 만드는 모양 — setCrmDealStage 가 서버에서
    // 파생하는 status·closedAt·closedBy 와 우리가 요청한 stage 뿐이다.
    const result = applyC360Overrides(
      makeCustomer360([server]),
      [
        dealPatched("deal-1", {
          stage: "won",
          status: "won",
          closedAt: "2026-09-15T03:59:00.000Z",
          closedBy: "이영업",
        }),
      ],
      NOW
    )
    const row = result?.deals.rows[0]

    // 이 mutation 이 바꾼 필드는 보정이 이긴다.
    expect(row?.stage).toBe("won")
    expect(row?.status).toBe("won")
    expect(row?.closedAt).toBe("2026-09-15T03:59:00.000Z")
    expect(row?.closedBy).toBe("이영업")

    // 이 mutation 소관이 아닌 필드는 서버 최신값이 살아남는다. 보정에 응답 레코드 전체를 담으면
    // 담당자가 보정 창 동안 옛 값으로 되돌아간다 — 그 회귀를 여기서 잡는다.
    expect(row?.ownerNameSnapshot).toBe("박담당")
    expect(row?.ownerNameSnapshot).not.toBe(beforeOwner)
    expect(row?.title).toBe("1학기 도입 견적")
    expect(row?.expectedAmount).toBe(3_000_000)
  })

  it("보정 창을 지난 override 는 무시하고 서버 값을 그대로 쓴다", () => {
    const data = makeCustomer360([makeDeal({ id: "deal-1", stage: "quote" })])
    const expired = dealPatched("deal-1", { stage: "decision" }, NOW - C360_OVERRIDE_TTL_MS - 1)

    expect(applyC360Overrides(data, [expired], NOW)).toBe(data)
  })

  it("적용할 보정이 없으면 페이로드를 그대로 돌려준다", () => {
    const data = makeCustomer360([makeDeal({ id: "deal-1" })])

    expect(applyC360Overrides(data, [], NOW)).toBe(data)
    expect(applyC360Overrides(null, [dealPatched("deal-1", { stage: "won" })], NOW)).toBeNull()
  })

  it("다른 딜의 보정은 해당 행에만 닿는다", () => {
    const data = makeCustomer360([
      makeDeal({ id: "deal-1", stage: "quote" }),
      makeDeal({ id: "deal-2", stage: "consult" }),
    ])

    const result = applyC360Overrides(data, [dealPatched("deal-2", { stage: "demo" })], NOW)

    expect(result?.deals.rows[0].stage).toBe("quote")
    expect(result?.deals.rows[1].stage).toBe("demo")
  })
})
