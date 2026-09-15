import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import DrawerDealsSection from "@/components/admin/crm/drawer/DrawerDealsSection"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import type { CrmDealRecord } from "@/lib/repositories/crm-deals"

// 감사 2026-09-07 §2 — 딜 예상금액을 생성 후 어떤 화면에서도 못 고치던 결함(#2)과, 그 입력이
// 공용 AdminMoneyInput을 우회하던 결함(#11)을 함께 수리했다. 이 테스트는 dev 서버 없이도
// "open 딜은 편집 가능한 인풋, 종료된 딜은 정적 텍스트"라는 계약을 정적 마크업으로 고정한다.

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
      generatedAt: "2026-09-10T00:00:00.000Z",
      health: { ok: true, message: null },
      summary: {
        total: deals.length,
        returned: deals.length,
        open: deals.filter((d) => d.status === "open").length,
        won: deals.filter((d) => d.status === "won").length,
        lost: deals.filter((d) => d.status === "lost").length,
        openAmount: 0,
        noNextActionCount: 0,
        aggregateTruncated: false,
      },
      rows: deals,
    },
  } as unknown as Customer360
}

const noop = () => undefined

describe("DrawerDealsSection 딜 금액 인라인 편집", () => {
  it("open 딜은 AdminMoneyInput으로 금액을 편집할 수 있다", () => {
    const data = makeCustomer360([makeDeal({ status: "open", expectedAmount: 1_000_000 })])
    const html = renderToStaticMarkup(
      <DrawerDealsSection
        data={data}
        actingId={null}
        dealFormOpen={false}
        onDealFormOpenChange={noop}
        dealTitle=""
        onDealTitleChange={noop}
        dealAmount={null}
        onDealAmountChange={noop}
        dealStage="consult"
        onDealStageChange={noop}
        onAddDeal={noop}
        onDealStage={noop}
        onDealAmountCommit={noop}
      />
    )

    // AdminMoneyInput은 text+inputMode=numeric 인풋으로 렌더된다(감사 #11 — type=number 금지 이유와 동일).
    expect(html).toContain('aria-label="테스트 딜 예상금액"')
    expect(html).toContain('inputMode="numeric"')
    expect(html).toContain('value="1,000,000"')
  })

  it("종료된(won/lost) 딜은 편집 인풋 대신 정적 텍스트로 금액을 보여준다", () => {
    const data = makeCustomer360([makeDeal({ status: "won", expectedAmount: 2_000_000 })])
    const html = renderToStaticMarkup(
      <DrawerDealsSection
        data={data}
        actingId={null}
        dealFormOpen={false}
        onDealFormOpenChange={noop}
        dealTitle=""
        onDealTitleChange={noop}
        dealAmount={null}
        onDealAmountChange={noop}
        dealStage="consult"
        onDealStageChange={noop}
        onAddDeal={noop}
        onDealStage={noop}
        onDealAmountCommit={noop}
      />
    )

    expect(html).not.toContain('aria-label="테스트 딜 예상금액"')
    expect(html).toContain("2,000,000")
    // 종료된 딜은 단계 select도 없다(기존 동작 유지 확인).
    expect(html).not.toContain('aria-label="딜 단계"')
  })

  it("actingId가 이 딜을 가리키면 편집 인풋이 비활성화된다", () => {
    const data = makeCustomer360([makeDeal({ id: "deal-9", status: "open" })])
    const html = renderToStaticMarkup(
      <DrawerDealsSection
        data={data}
        actingId="deal:deal-9"
        dealFormOpen={false}
        onDealFormOpenChange={noop}
        dealTitle=""
        onDealTitleChange={noop}
        dealAmount={null}
        onDealAmountChange={noop}
        dealStage="consult"
        onDealStageChange={noop}
        onAddDeal={noop}
        onDealStage={noop}
        onDealAmountCommit={noop}
      />
    )

    expect(html).toContain("disabled=\"\"")
  })

  it("새 딜 폼의 예상금액도 AdminMoneyInput(₩ prefix)을 쓴다", () => {
    const data = makeCustomer360([])
    const html = renderToStaticMarkup(
      <DrawerDealsSection
        data={data}
        actingId={null}
        dealFormOpen
        onDealFormOpenChange={noop}
        dealTitle=""
        onDealTitleChange={noop}
        dealAmount={500_000}
        onDealAmountChange={noop}
        dealStage="consult"
        onDealStageChange={noop}
        onAddDeal={noop}
        onDealStage={noop}
        onDealAmountCommit={noop}
      />
    )

    expect(html).toContain('aria-label="새 딜 예상 금액"')
    expect(html).toContain(">₩<")
    expect(html).toContain('value="500,000"')
  })
})
