/**
 * M1·M3 — 고객 360 매출 탭(Customer360DetailMoney).
 * 통화별 그룹 3개 + "서로 더하지 않음" 캡션, 타임라인 행의 kind 텍스트 라벨, 빈 통화 그룹의 "해당 없음",
 * 더 보기 버튼, 원천별 목록 유지(정보 삭제 금지)를 고정한다.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import Customer360DetailMoney, {
  MONEY_NO_SUM_CAPTION,
  MONEY_TIMELINE_PAGE_SIZE,
} from "@/components/admin/crm/Customer360DetailMoney"
import type { NeoCrmCustomerMoneyItem } from "@/lib/admin-crm-customers-neo"
import type { Customer360Money } from "@/lib/repositories/crm-customer-360"
import type { CrmDealRecord, ListCrmDealsResult } from "@/lib/repositories/crm-deals"

function neo(overrides: Partial<NeoCrmCustomerMoneyItem> & { id: string }): NeoCrmCustomerMoneyItem {
  return {
    title: `항목 ${overrides.id}`,
    amount: 100,
    occurredAt: "2026-09-10T00:00:00.000Z",
    ownerName: "담당자",
    status: null,
    ...overrides,
  }
}

function money(overrides: Partial<Customer360Money> = {}): Customer360Money {
  return {
    available: true,
    label: null,
    totalBalance: null,
    totalOrderAmount: null,
    orders: [],
    collections: [],
    performances: [],
    eeoAccounts: [],
    lineItems: [],
    lineItemsMeta: { truncated: false, sources: [] },
    unmatchedOutbound: [],
    ...overrides,
  }
}

function dealRecord(overrides: Partial<CrmDealRecord> & { id: string }): CrmDealRecord {
  return {
    targetType: "neo_account",
    targetId: "acc-1",
    targetLabel: "테스트 학원",
    ownerKey: null,
    ownerNameSnapshot: "김담당",
    title: `딜 ${overrides.id}`,
    stage: "quote",
    status: "open",
    expectedAmount: 12_000_000,
    expectedCloseAt: "2026-09-20T00:00:00.000Z",
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

function dealsResult(rows: CrmDealRecord[], overrides: Partial<ListCrmDealsResult> = {}): ListCrmDealsResult {
  return {
    generatedAt: "2026-09-18T00:00:00.000Z",
    health: { ok: true, message: null },
    summary: {
      total: rows.length,
      returned: rows.length,
      open: rows.filter((row) => row.status === "open").length,
      won: rows.filter((row) => row.status === "won").length,
      lost: rows.filter((row) => row.status === "lost").length,
      openAmount: 0,
      noNextActionCount: 0,
      aggregateTruncated: false,
    },
    pagination: { limit: 20, offset: 0, returned: rows.length, total: rows.length, hasMore: false, nextOffset: null },
    rows,
    ...overrides,
  }
}

describe("Customer360DetailMoney · M1 통화별 분리 타일", () => {
  it("USD·CNY·KRW 그룹 3개와 '서로 더하지 않음' 캡션을 그린다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailMoney
        money={money({
          orders: [neo({ id: "o1", amount: 1500 })],
          collections: [neo({ id: "c1", amount: 20_000 })],
        })}
        deals={dealsResult([dealRecord({ id: "d1" })])}
      />
    )
    expect(html).toContain(MONEY_NO_SUM_CAPTION)
    expect(html).toContain("통화별 합계 · 서로 더하지 않음")
    for (const currency of ["USD", "CNY", "KRW"]) {
      expect(html).toContain(`data-testid="money-currency-group-${currency}"`)
    }
    // 출처 칩과 통화 배지 기호
    expect(html).toContain("NEO 오더")
    expect(html).toContain("NEO 수금")
    expect(html).toContain("딜(₩)")
    expect(html).toContain(">$<")
    expect(html).toContain(">¥<")
    expect(html).toContain(">₩<")
    // 통화별 포맷 — 합계는 각 통화 안에서만
    expect(html).toContain("$1,500")
    expect(html).toContain("¥2.00만")
    expect(html).toContain("₩1,200만")
  })

  it("데이터가 없는 통화 그룹은 숨기지 않고 '해당 없음'으로 흐리게 둔다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailMoney money={money({ orders: [neo({ id: "o1", amount: 10 })] })} />
    )
    expect(html).toContain('data-testid="money-currency-group-CNY"')
    expect(html).toContain('data-testid="money-currency-group-KRW"')
    expect(html.match(/해당 없음/g)?.length).toBe(2)
    expect(html).toContain("opacity-60")
    // deals prop 이 없을 때 이유를 밝힌다
    expect(html).toContain("딜 데이터가 전달되지 않았습니다.")
  })

  it("money.available=false 면 기존 안내 문구를 유지한다", () => {
    const html = renderToStaticMarkup(<Customer360DetailMoney money={money({ available: false })} />)
    expect(html).toContain("표시할 돈흐름 데이터가 없습니다.")
    expect(html).not.toContain(MONEY_NO_SUM_CAPTION)
  })
})

describe("Customer360DetailMoney · M3 주문 타임라인", () => {
  it("타임라인 행에 kind 텍스트 라벨(오더/수금/딜)·월 헤더·상태 라벨·담당자가 있다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailMoney
        money={money({
          orders: [neo({ id: "o1", title: "칠판 3대", amount: 4500, occurredAt: "2026-09-12T00:00:00.000Z", status: "완료" })],
          collections: [neo({ id: "c1", title: "1차 수금", amount: 30_000, occurredAt: "2026-08-20T00:00:00.000Z", ownerName: "이담당" })],
        })}
        deals={dealsResult([dealRecord({ id: "d1", title: "재계약 딜", status: "won", stage: "won", closedAt: "2026-09-15T00:00:00.000Z" })])}
      />
    )
    const rows = html.match(/data-testid="money-timeline-row"/g) ?? []
    expect(rows).toHaveLength(3)
    expect(html).toContain("<span>오더</span>")
    expect(html).toContain("<span>수금</span>")
    expect(html).toContain("<span>딜</span>")
    expect(html).toContain("2026년 9월")
    expect(html).toContain("2026년 8월")
    expect(html).toContain("칠판 3대")
    expect(html).toContain("재계약 딜")
    expect(html).toContain("이담당")
    // 상태 라벨: 딜 won → "완료"(ok 톤 텍스트), NEO "완료" 원문
    expect(html).toContain("text-[#084734]")
    expect(html).toContain("완료")
    // 최신(딜 9/15) 이 오더(9/12) 보다 먼저
    expect(html.indexOf("재계약 딜")).toBeLessThan(html.indexOf("칠판 3대"))
    expect(html.indexOf("칠판 3대")).toBeLessThan(html.indexOf("1차 수금"))
  })

  it("기본 20행만 그리고 남은 건수를 '더 보기' 버튼(min-h-11)으로 알린다", () => {
    const orders = Array.from({ length: 25 }, (_, index) =>
      neo({ id: `o${index}`, title: `오더 ${index}`, occurredAt: `2026-09-${String(1 + (index % 28)).padStart(2, "0")}T00:00:00.000Z` })
    )
    const html = renderToStaticMarkup(<Customer360DetailMoney money={money({ orders })} />)
    const rows = html.match(/data-testid="money-timeline-row"/g) ?? []
    expect(rows).toHaveLength(MONEY_TIMELINE_PAGE_SIZE)
    expect(html).toContain("더 보기 · 남은 5건")
    expect(html).toMatch(/<button[^>]*min-h-11[^>]*>더 보기/)
  })

  it("M5 — 품목·타임라인이 모두 비어 있으면 CSV 버튼 2개가 모두 비활성화되고 안내 title을 갖는다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailMoney
        money={money({ eeoAccounts: [{ id: "e1", name: "EEO A", uid: null, balance: 500, expireAt: null, lastClassAt: null, serviceStatus: null, syncedAt: null }] })}
      />
    )
    expect(html.match(/CSV/g) ?? []).toHaveLength(2)
    expect(html.match(/내보낼 행이 없습니다\./g) ?? []).toHaveLength(2)
  })

  it("M5 — 타임라인에 항목이 생기면 그만큼 CSV 비활성 버튼이 줄어든다(타임라인 CSV가 활성화)", () => {
    const html = renderToStaticMarkup(<Customer360DetailMoney money={money({ orders: [neo({ id: "o1" })] })} />)
    // 품목별 대수는 여전히 0건(이 fixture는 lineItems를 채우지 않음)이라 그쪽 CSV만 비활성으로 남는다.
    expect(html.match(/내보낼 행이 없습니다\./g) ?? []).toHaveLength(1)
  })

  it("항목이 없으면 EmptyState 문구를 그린다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailMoney
        money={money({ eeoAccounts: [{ id: "e1", name: "EEO A", uid: null, balance: 500, expireAt: null, lastClassAt: null, serviceStatus: null, syncedAt: null }] })}
      />
    )
    expect(html).toContain("주문 타임라인 항목이 없습니다")
    expect(html).not.toContain("더 보기")
  })

  it("원천별 목록(오더·수금·성과·EEO)은 접이식으로 남아 정보가 사라지지 않는다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailMoney
        money={money({
          orders: [neo({ id: "o1", title: "오더 원문" })],
          collections: [neo({ id: "c1", title: "수금 원문" })],
          performances: [neo({ id: "p1", title: "성과 원문" })],
          eeoAccounts: [{ id: "e1", name: "EEO 계정 원문", uid: "u-1", balance: 500, expireAt: null, lastClassAt: null, serviceStatus: "normal", syncedAt: null }],
        })}
      />
    )
    expect((html.match(/<details/g) ?? []).length).toBe(4)
    expect(html).toContain("오더 원문")
    expect(html).toContain("수금 원문")
    expect(html).toContain("성과 원문")
    expect(html).toContain("EEO 계정 원문")
    expect(html).toContain("u-1")
  })
})
