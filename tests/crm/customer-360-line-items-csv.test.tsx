/**
 * M5 — 고객 360 매출 탭 품목별 대수 CSV 내보내기(Customer360DetailMoney).
 * 통화별 열 분리(합산 없음) · 확정/추정 근거 열 · 수식 주입 방어·BOM(lib/crm/csv.ts) 을 고정한다.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import Customer360DetailMoney, {
  buildLineItemsCsv,
  LINE_ITEM_CSV_COLUMNS,
  lineItemEvidenceBasis,
  lineItemsCsvFileName,
} from "@/components/admin/crm/Customer360DetailMoney"
import { CSV_BOM } from "@/lib/crm/csv"
import type { CrmMoneyLineItem } from "@/lib/crm/money-line-items"
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
    lastAt: "2026-09-10T16:00:00.000Z", // 9/11 01:00 KST
    details: [{ ref: "DEAL-1", at: "2026-09-10T00:00:00.000Z", quantity: 3, serials: [] }],
    ...overrides,
  }
}

function money(lineItems: CrmMoneyLineItem[]): Customer360Money {
  return {
    available: true,
    label: null,
    totalBalance: null,
    totalOrderAmount: null,
    orders: [],
    collections: [],
    performances: [],
    eeoAccounts: [],
    lineItems,
    lineItemsMeta: { truncated: false, sources: [] },
    unmatchedOutbound: [],
  }
}

function parse(csv: string): string[][] {
  expect(csv.startsWith(CSV_BOM)).toBe(true)
  return csv
    .slice(CSV_BOM.length)
    .split("\r\n")
    .map((line) => line.split(","))
}

const HEADERS = [
  "품목",
  "구분",
  "수량",
  "통화",
  "단가(KRW)",
  "금액(KRW)",
  "단가(USD)",
  "금액(USD)",
  "단가(CNY)",
  "금액(CNY)",
  "출처",
  "근거",
  "근거 설명",
  "최근 일자(KST)",
  "참조",
  "시리얼",
]

describe("M5 품목 CSV — 행 → CSV 행(순수)", () => {
  it("통화별 단가·금액 열을 따로 두고, 그 행의 통화 열에만 값을 넣는다(합계 행 없음)", () => {
    const items = [
      lineItem({ key: "krw" }),
      lineItem({
        key: "usd",
        product: "스탠드",
        category: "stand",
        quantity: 2,
        unitPrice: 300,
        amount: 600,
        currency: "USD",
        source: "hw_outbound",
        evidence: "estimated",
        details: [
          { ref: "LOT-9", at: null, quantity: 1, serials: ["SN-1"] },
          { ref: "LOT-10", at: null, quantity: 1, serials: ["SN-2"] },
        ],
      }),
      lineItem({ key: "none", product: "카메라", category: "camera", unitPrice: null, amount: null, currency: null, source: "hw_outbound", lastAt: null, details: [] }),
    ]

    const rows = parse(buildLineItemsCsv(items))

    expect(rows[0]).toEqual(HEADERS)
    expect(LINE_ITEM_CSV_COLUMNS.map((column) => column.header)).toEqual(HEADERS)
    // 합계 행을 만들지 않는다 — 헤더 + 품목 수.
    expect(rows).toHaveLength(items.length + 1)

    const col = (name: string) => HEADERS.indexOf(name)
    const [, krw, usd, none] = rows
    expect(krw[col("통화")]).toBe("KRW")
    expect(krw[col("단가(KRW)")]).toBe("5800000")
    expect(krw[col("금액(KRW)")]).toBe("17400000")
    expect(krw[col("금액(USD)")]).toBe("")
    expect(krw[col("금액(CNY)")]).toBe("")
    expect(krw[col("근거")]).toBe("확정")
    expect(krw[col("근거 설명")]).toBe("확정 · 이 고객의 딜 품목")
    expect(krw[col("출처")]).toBe("딜 라인아이템")
    expect(krw[col("최근 일자(KST)")]).toBe("2026-09-11")

    expect(usd[col("금액(USD)")]).toBe("600")
    expect(usd[col("금액(KRW)")]).toBe("")
    expect(usd[col("근거")]).toBe("추정")
    expect(usd[col("근거 설명")]).toBe("추정 · 출고 목적지 이름 일치(확정 링크 없음)")
    expect(usd[col("참조")]).toBe("LOT-9; LOT-10")
    expect(usd[col("시리얼")]).toBe("SN-1; SN-2")

    // 통화 미상(금액 없음) 행은 금액 열이 전부 비고, 대수만 남는다.
    for (const name of ["단가(KRW)", "금액(KRW)", "단가(USD)", "금액(USD)", "단가(CNY)", "금액(CNY)", "통화"]) {
      expect(none[col(name)]).toBe("")
    }
    expect(none[col("수량")]).toBe("3")
  })

  it("수식처럼 시작하는 품목명은 작은따옴표로 고정한다(CSV 인젝션 방어)", () => {
    const csv = buildLineItemsCsv([lineItem({ key: "evil", product: "=HYPERLINK(\"x\")" })])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })

  it("근거 설명은 출처별로 다르다 — HW 확정은 계정 확정 링크", () => {
    expect(lineItemEvidenceBasis({ source: "hw_outbound", evidence: "confirmed" })).toBe("확정 · 계정 확정 링크")
  })

  it("파일명은 고객명을 넣은 KST 날짜 파일이고 경로 문자는 걸러 낸다", () => {
    const now = new Date("2026-09-25T03:00:00.000Z")
    expect(lineItemsCsvFileName("테스트/학원", now)).toBe("품목별대수-테스트-학원-2026-09-25.csv")
    expect(lineItemsCsvFileName(null, now)).toBe("품목별대수-2026-09-25.csv")
  })
})

describe("M5 품목 CSV — 매출 탭 버튼", () => {
  it("품목이 있으면 'CSV 내보내기' 버튼이 활성으로 뜬다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailMoney money={money([lineItem({ key: "row-1" })])} customerName="테스트 학원" />
    )
    expect(html).toContain('data-testid="line-items-csv-export"')
    expect(html).toContain("CSV 내보내기")
    expect(html).not.toMatch(/data-testid="line-items-csv-export"[^>]*disabled=""/)
  })

  it("품목이 없으면 버튼은 비활성이다", () => {
    const html = renderToStaticMarkup(<Customer360DetailMoney money={money([])} />)
    expect(html).toMatch(/<button[^>]*data-testid="line-items-csv-export"[^>]*disabled=""/)
  })
})
