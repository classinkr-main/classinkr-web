/**
 * M2·M4 — 고객 360 매출 탭의 품목별 대수 표·연결 대기 출고 섹션(Customer360DetailMoney).
 * 표 열·근거 배지(확정/추정)·펼침 버튼(aria-expanded)·빈 상태·truncated 캡션·연결 버튼·
 * 계정 정보 없을 때 비활성화를 정적 마크업으로 고정한다(DOM 이벤트 환경이 없어 클릭 상호작용은
 * 소스 계약으로 대신 고정한다 — tests/crm/customer-360-money.test.tsx와 같은 패턴).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import Customer360DetailMoney from "@/components/admin/crm/Customer360DetailMoney"
import type { CrmMoneyLineItem, CrmUnmatchedOutboundCandidate } from "@/lib/crm/money-line-items"
import type { Customer360Money } from "@/lib/repositories/crm-customer-360"

function lineItem(overrides: Partial<CrmMoneyLineItem> & { key: string }): CrmMoneyLineItem {
  return {
    product: "전자칠판 86",
    category: "board",
    quantity: 3,
    unitPrice: 5_800_000,
    amount: 17_400_000,
    currency: "KRW",
    source: "deal_line_items",
    evidence: "confirmed",
    lastAt: "2026-09-10T00:00:00.000Z",
    details: [{ ref: "DEAL-1", at: "2026-09-10T00:00:00.000Z", quantity: 3, serials: [] }],
    ...overrides,
  }
}

function unmatched(overrides: Partial<CrmUnmatchedOutboundCandidate> & { id: string }): CrmUnmatchedOutboundCandidate {
  return {
    product: "전자칠판 86",
    quantity: 2,
    destination: "테스트 학원 강남캠퍼스",
    outboundDate: "2026-09-12T00:00:00.000Z",
    serials: ["SN-1", "SN-2"],
    similarity: 0.82,
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

describe("Customer360DetailMoney · M2 품목별 대수 표", () => {
  it("표 열(품목·구분·수량·단가·금액·최근·근거)과 확정 근거(점+텍스트)를 그린다", () => {
    const html = renderToStaticMarkup(<Customer360DetailMoney money={money({ lineItems: [lineItem({ key: "row-1" })] })} />)

    expect(html).toContain("품목별 대수")
    for (const header of ["품목", "구분", "수량", "단가", "금액", "최근", "근거"]) {
      expect(html).toContain(`<th`)
      expect(html).toContain(header)
    }
    expect(html).toContain("전자칠판 86")
    expect(html).toContain("칠판")
    expect(html).toContain("3개")
    expect(html).toContain("확정")
    // 확정 배지는 점(bg-current) + 텍스트, 점선 배지가 아니다.
    expect(html).not.toMatch(/border-dashed[^>]*>\s*확정/)
  })

  it("추정 근거는 점선 배지('추정 · 이름 일치')로 표시한다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailMoney
        money={money({ lineItems: [lineItem({ key: "row-1", source: "hw_outbound", evidence: "estimated", currency: "USD" })] })}
      />
    )
    expect(html).toContain("추정 · 이름 일치")
    expect(html).toMatch(/border-dashed[^>]*>\s*추정 · 이름 일치/)
  })

  it("행 펼침 버튼(aria-expanded)이 있고 details가 없으면 비활성화한다", () => {
    const withDetails = renderToStaticMarkup(<Customer360DetailMoney money={money({ lineItems: [lineItem({ key: "row-1" })] })} />)
    expect(withDetails).toMatch(/aria-expanded="false"[^>]*>/)

    const withoutDetails = renderToStaticMarkup(
      <Customer360DetailMoney money={money({ lineItems: [lineItem({ key: "row-1", details: [] })] })} />
    )
    expect(withoutDetails).not.toContain("aria-expanded")
  })

  it("품목이 없으면 빈 상태 문구를 그린다", () => {
    const html = renderToStaticMarkup(<Customer360DetailMoney money={money()} />)
    expect(html).toContain("품목 데이터 없음 · NEO 오더는 위 통화 그룹 참고")
  })

  it("truncated면 캡션을 보여주고, meta.note가 있으면 함께 보여준다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailMoney
        money={money({
          lineItems: [lineItem({ key: "row-1" })],
          lineItemsMeta: { truncated: true, sources: ["deal_line_items"], note: "예정 출고 2건 제외" },
        })}
      />
    )
    expect(html).toContain("조회 상한")
    expect(html).toContain("예정 출고 2건 제외")
  })

  it("money.available=false여도 lineItems가 있으면 품목 표를 그린다(HW-only 계정)", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailMoney money={money({ available: false, lineItems: [lineItem({ key: "row-1" })] })} />
    )
    expect(html).toContain("품목별 대수")
    expect(html).not.toContain("표시할 돈흐름 데이터가 없습니다.")
  })

  it("lineItems·unmatchedOutbound가 모두 비어 있고 available=false면 기존 안내 문구를 유지한다", () => {
    const html = renderToStaticMarkup(<Customer360DetailMoney money={money({ available: false })} />)
    expect(html).toContain("표시할 돈흐름 데이터가 없습니다.")
    expect(html).not.toContain("품목별 대수")
  })
})

describe("Customer360DetailMoney · M4 연결 대기 출고", () => {
  it("목적지·품목·수량·일자·유사도(%)와 44px 터치 타깃의 연결 버튼을 그린다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailMoney money={money({ unmatchedOutbound: [unmatched({ id: "o1" })] })} accountId="acc-1" />
    )
    expect(html).toContain("연결 대기 출고")
    expect(html).toContain("테스트 학원 강남캠퍼스")
    expect(html).toContain("2개")
    expect(html).toContain("유사도")
    expect(html).toContain("82%")
    expect(html).toMatch(/<button[^>]*min-h-11[^>]*>[\s\S]*?이 고객에 연결/)
  })

  it("accountId가 없으면 연결 버튼을 비활성화한다", () => {
    const html = renderToStaticMarkup(<Customer360DetailMoney money={money({ unmatchedOutbound: [unmatched({ id: "o1" })] })} />)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?이 고객에 연결/)
  })

  it("unmatchedOutbound가 비어 있으면 섹션 자체를 그리지 않는다", () => {
    const html = renderToStaticMarkup(<Customer360DetailMoney money={money()} accountId="acc-1" />)
    expect(html).not.toContain("연결 대기 출고")
  })
})

describe("Customer360DetailMoney 소스 계약 — M4 연결 흐름(클릭 상호작용, DOM 환경 없이 고정)", () => {
  const source = readFileSync(
    join(process.cwd(), "components/admin/crm/Customer360DetailMoney.tsx"),
    "utf8"
  )

  it("POST /api/admin/crm/source-links/hw-outbound에 outboundId·accountId를 보낸다", () => {
    expect(source).toContain('"/api/admin/crm/source-links/hw-outbound"')
    expect(source).toContain("outboundId: row.id")
    expect(source).toContain("accountId")
  })

  it("중복 클릭을 막는 pending 잠금이 있다", () => {
    expect(source).toMatch(/if\s*\(pendingId\)\s*return/)
  })

  it("성공 시 8초 되돌리기 없이 낙관적으로 lineItems에 옮기고 onRelinked를 부른다", () => {
    expect(source).not.toContain("8000")
    expect(source).not.toContain("setTimeout")
    expect(source).toContain("setOptimisticLineItems")
    expect(source).toContain("onRelinked?.()")
    expect(source).toContain("연결됨 · 다음 새로고침에 반영")
  })

  it("실패 시 인라인 에러 캡션을 상태로 남긴다", () => {
    expect(source).toContain("setErrorById")
  })
})
