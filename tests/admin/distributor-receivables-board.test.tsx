/**
 * 총판 미수금 보드 — 요약 · 경과 구간 · 기한 문구 · 빈 상태 · 일부만 읽음 안내(서버 렌더 마크업).
 * 계산은 lib/distributor-receivables-view.ts 가 하고(별도 테스트), 여기서는 화면이 그 값을 말로 옮기는지만 본다.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import DistributorReceivablesBoard, {
  receivableQuoteHref,
  type DistributorReceivablesBoardProps,
} from "@/components/admin/documents/DistributorReceivablesBoard"
import { DEFAULT_RECEIVABLE_VIEW_STATE, type ReceivableViewState } from "@/lib/distributor-receivables-view"
import type { DistributorReceivablePayment } from "@/lib/distributor-settlements"
import type { DistributorReceivableRow } from "@/lib/repositories/distributor-settlements"

const TODAY = "2026-11-20"

function makeRow(overrides: Partial<DistributorReceivableRow> = {}): DistributorReceivableRow {
  return {
    id: "s1",
    quoteDocumentId: "q1",
    dealId: null,
    fulfillmentMode: "C",
    sourceVersionId: null,
    issuedVersionId: null,
    distributorName: "퀴드러닝",
    distributorContactName: null,
    distributorEmail: null,
    distributorPhone: null,
    issueTrigger: "on_accept",
    autoEmail: true,
    priceTemplateId: null,
    lines: [],
    vatIncluded: true,
    subtotalAmount: 1_000_000,
    vatAmount: 0,
    totalAmount: 1_000_000,
    customerTotalAmount: 1_200_000,
    status: "issued",
    paidAmount: 0,
    dueDate: "2026-12-01",
    issuedAt: "2026-11-10T03:00:00.000Z",
    issueReason: "customer_accepted",
    shareToken: null,
    emailStatus: "not_sent",
    emailedAt: null,
    emailError: null,
    reviewRequiredReason: null,
    notes: null,
    cancelledAt: null,
    installedAt: null,
    confirmedAt: null,
    confirmedByName: null,
    revisedAt: null,
    discount: null,
    documentTitle: null,
    generalNotes: null,
    createdAt: "2026-11-10T03:00:00.000Z",
    updatedAt: "2026-11-10T03:00:00.000Z",
    quoteNumber: "Q-001",
    customerName: "성남여고",
    dealTitle: "전자칠판 도입",
    ...overrides,
  }
}

// 미수 4건(구간 4개에 하나씩) + 완납 1건.
const ROWS: DistributorReceivableRow[] = [
  makeRow({ id: "a", quoteDocumentId: "qa", customerName: "가나중", quoteNumber: "Q-A", dueDate: "2026-11-25", issuedAt: "2026-11-10T03:00:00.000Z" }),
  makeRow({ id: "b", quoteDocumentId: "qb", customerName: "다라중", quoteNumber: "Q-B", dueDate: "2026-11-20", totalAmount: 2_000_000, issuedAt: "2026-10-05T03:00:00.000Z" }),
  makeRow({ id: "c", quoteDocumentId: "qc", customerName: "마바고", quoteNumber: "Q-C", dueDate: "2026-11-08", totalAmount: 3_000_000, paidAmount: 1_000_000, status: "partial", issuedAt: "2026-09-01T03:00:00.000Z" }),
  makeRow({ id: "d", quoteDocumentId: "qd", customerName: "사아고", quoteNumber: "Q-D", dueDate: null, totalAmount: 4_000_000, issuedAt: "2026-07-01T03:00:00.000Z" }),
  makeRow({ id: "e", quoteDocumentId: "qe", customerName: "자차고", quoteNumber: "Q-E", totalAmount: 500_000, paidAmount: 500_000, status: "paid", issuedAt: "2026-11-02T03:00:00.000Z" }),
]
const PAYMENTS: DistributorReceivablePayment[] = [
  { settlementId: "c", amount: 1_000_000, paidOn: "2026-11-12" },
  { settlementId: "e", amount: 500_000, paidOn: "2026-11-15" },
]

function render(over: Partial<DistributorReceivablesBoardProps> = {}, state?: Partial<ReceivableViewState["filters"]>) {
  const initialState: ReceivableViewState = {
    ...DEFAULT_RECEIVABLE_VIEW_STATE,
    filters: { ...DEFAULT_RECEIVABLE_VIEW_STATE.filters, status: "all", ...state },
  }
  return renderToStaticMarkup(
    <DistributorReceivablesBoard
      rows={ROWS}
      payments={PAYMENTS}
      reviews={[]}
      truncated={false}
      today={TODAY}
      loading={false}
      onRefresh={() => {}}
      onOpenQuote={() => {}}
      initialState={initialState}
      {...over}
    />
  )
}

describe("DistributorReceivablesBoard", () => {
  it("요약 타일 — 필터와 무관하게 전체 발행분 기준", () => {
    // 상태 필터를 입금 완료로 좁혀도 위쪽 숫자는 그대로다.
    const html = render({}, { status: "paid" })
    expect(html).toContain("받을 금액")
    expect(html).toContain("9,000,000원") // 받을 금액 4건
    expect(html).toContain("기한 경과")
    expect(html).toContain("2,000,000원") // 기한 경과 1건
    expect(html).toContain("회수율 14.3%") // 입금 1,500,000 / 청구 10,500,000
    expect(html).toContain("1,500,000원")
  })

  it("경과 구간 범례 — 구간 이름·금액·건수", () => {
    const html = render()
    for (const label of ["30일 이내", "31~60일", "61~90일", "91일 이상"]) expect(html).toContain(label)
    expect(html).toContain("1,000,000원 · 1건")
    expect(html).toContain("4,000,000원 · 1건")
  })

  it("기한 문구 — D-n · 오늘 · n일 경과 · 기한 미입력", () => {
    const html = render()
    expect(html).toContain("D-5")
    expect(html).toContain("오늘")
    expect(html).toContain("12일 경과")
    expect(html).toContain("기한 미입력")
  })

  it("기한 미입력 안내와 견적 링크", () => {
    const html = render()
    expect(html).toContain("기한이 없으면 기한 경과로 잡히지 않습니다")
    expect(html).toContain(`href="${receivableQuoteHref("qa").replace("&", "&amp;")}"`)
  })

  it("빈 상태 — 발행분 없음 / 필터 결과 없음 / 불러오는 중", () => {
    const none = render({ rows: [], payments: [] })
    expect(none).toContain("발행된 총판 견적서가 없습니다.")
    expect(none).not.toContain("조건에 맞는 건이 없습니다.")

    const filtered = render({}, { query: "없는고객이름" })
    expect(filtered).toContain("조건에 맞는 건이 없습니다.")
    expect(filtered).toContain("필터 지우기")

    const loading = render({ rows: [], payments: [], loading: true })
    expect(loading).toContain("불러오는 중")
  })

  it("일부만 읽었을 때 안내", () => {
    expect(render({ truncated: true })).toContain("최근 500건까지만 불러왔습니다")
    expect(render({ truncated: false })).not.toContain("최근 500건까지만 불러왔습니다")
  })

  it("묶음을 고르면 묶음 머리 행이 나온다", () => {
    const html = renderToStaticMarkup(
      <DistributorReceivablesBoard
        rows={ROWS}
        payments={PAYMENTS}
        reviews={[]}
        truncated={false}
        today={TODAY}
        loading={false}
        onRefresh={() => {}}
        onOpenQuote={() => {}}
        initialState={{ ...DEFAULT_RECEIVABLE_VIEW_STATE, filters: { ...DEFAULT_RECEIVABLE_VIEW_STATE.filters, status: "all" }, group: "age_bucket" }}
      />
    )
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain("표시 중 5건 합계")
  })

  it("모바일 카드 목록 — 같은 행을 카드로도 그린다(표와 카드가 같은 문구 규칙)", () => {
    const html = render()
    const cards = html.slice(html.indexOf('<div class="sm:hidden">'))
    expect(cards.match(/<li /g)?.length).toBe(5) // 상태 전체: 5건 모두
    expect(cards).toContain("발행 후 10일")
    expect(cards).toContain("D-5")
    expect(cards).toContain("12일 경과")
    expect(cards).toContain("기한 미입력")
    expect(cards).toContain(`href="${receivableQuoteHref("qd").replace("&", "&amp;")}"`)
    // 표 합계와 카드 합계가 각각 한 번씩.
    expect(html.match(/표시 중 5건 합계/g)?.length).toBe(2)
  })

  it("모바일 정렬 선택 — 현재 정렬이 선택돼 있다", () => {
    const html = render()
    expect(html).toContain('aria-label="정렬"')
    expect(html).toMatch(/<option value="issued\.desc" selected="">발행 최신순<\/option>/)
  })
})
