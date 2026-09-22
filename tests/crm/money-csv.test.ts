/**
 * M5 — 고객 360 매출 탭 품목·타임라인 CSV 내보내기(lib/crm/money-csv.ts).
 * 이스케이프(쉼표·따옴표·줄바꿈), 통화 열 분리·합계 행 없음, 헤더 순서, 파일명을 고정한다.
 */
import { describe, expect, it } from "vitest"

import {
  buildMoneyLineItemsCsv,
  buildMoneyTimelineCsv,
  MONEY_LINE_ITEMS_CSV_HEADERS,
  MONEY_TIMELINE_CSV_HEADERS,
  moneyCsvFileName,
  toCsv,
} from "@/lib/crm/money-csv"
import type { CrmMoneyLineItem } from "@/lib/crm/money-line-items"
import type { MoneyTimelineEntry } from "@/lib/crm/money-timeline"

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

function timelineEntry(overrides: Partial<MoneyTimelineEntry> & { id: string }): MoneyTimelineEntry {
  return {
    kind: "order",
    currency: "USD",
    title: "오더 제목",
    amount: 1500,
    occurredAt: "2026-09-12T00:00:00.000Z",
    status: null,
    ownerName: "김담당",
    sourceLabel: "NEO 오더",
    statusTone: null,
    ...overrides,
  }
}

describe("toCsv", () => {
  it("쉼표·따옴표·줄바꿈이 섞인 셀만 따옴표로 감싸고 내부 따옴표를 두 배로 만든다", () => {
    const csv = toCsv([
      ["일반 텍스트", "쉼표, 포함", '따옴표 " 포함', "줄바꿈\n포함", "CR\r포함"],
    ])
    const cells = [
      "일반 텍스트",
      '"쉼표, 포함"',
      '"따옴표 "" 포함"',
      '"줄바꿈\n포함"',
      '"CR\r포함"',
    ]
    expect(csv).toBe(cells.join(","))
  })

  it("여러 행을 개행으로 잇고 빈 배열 행은 빈 줄이 된다", () => {
    expect(toCsv([["a", "b"], [], ["c"]])).toBe("a,b\n\nc")
  })
})

describe("buildMoneyLineItemsCsv", () => {
  it("헤더 순서를 고정한다", () => {
    expect(MONEY_LINE_ITEMS_CSV_HEADERS).toEqual([
      "품목",
      "카테고리",
      "수량",
      "통화",
      "단가",
      "금액",
      "근거",
      "출처",
      "최근 일자",
      "주문번호",
      "시리얼",
    ])
    const csv = buildMoneyLineItemsCsv([], { customerName: "테스트 학원", generatedAt: "2026-09-22T00:00:00.000Z" })
    const lines = csv.split("\n")
    expect(lines[0]).toBe("고객,테스트 학원")
    expect(lines[1]).toBe("생성 시각,2026-09-22T00:00:00.000Z")
    expect(lines[2]).toBe("")
    expect(lines[3]).toBe(MONEY_LINE_ITEMS_CSV_HEADERS.join(","))
  })

  it("통화 열과 금액 열을 분리하고 합계 행을 넣지 않는다(서로 다른 통화 행이 섞여도 합산하지 않음)", () => {
    const csv = buildMoneyLineItemsCsv(
      [
        lineItem({ key: "krw", currency: "KRW", amount: 17_400_000, quantity: 3 }),
        lineItem({
          key: "usd",
          currency: "USD",
          amount: 900,
          unitPrice: null,
          quantity: 2,
          source: "hw_outbound",
          evidence: "estimated",
          product: "카메라",
        }),
      ],
      { customerName: "고객A", generatedAt: "2026-09-22T00:00:00.000Z" }
    )
    const rows = csv.split("\n").slice(4)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain("KRW,5800000,17400000")
    expect(rows[1]).toContain("USD,,900")
    // 합계 행("총계"·합산된 금액 등)이 없다 — 데이터 행 수가 입력 그대로다.
    expect(csv).not.toMatch(/총계|합계/)
    expect(rows.every((row) => !row.includes("18300000"))).toBe(true) // 17,400,000 + 900은 통화가 달라 합산 금지
  })

  it("근거 라벨(확정/추정)과 출처 라벨(딜/HW 출고)을 매핑한다", () => {
    const csv = buildMoneyLineItemsCsv(
      [
        lineItem({ key: "a", evidence: "confirmed", source: "deal_line_items" }),
        lineItem({ key: "b", evidence: "estimated", source: "hw_outbound", currency: "USD" }),
      ],
      { customerName: "고객", generatedAt: "2026-09-22T00:00:00.000Z" }
    )
    const rows = csv.split("\n").slice(4)
    expect(rows[0]).toContain(",확정,딜,")
    expect(rows[1]).toContain(",추정,HW 출고,")
  })

  it("주문번호·시리얼을 세미콜론으로 이어 붙이고, 값이 comma를 포함해도 이스케이프한다", () => {
    const csv = buildMoneyLineItemsCsv(
      [
        lineItem({
          key: "multi",
          details: [
            { ref: "DEAL-1", at: "2026-09-01T00:00:00.000Z", quantity: 1, serials: ["SN-1", "SN-2"] },
            { ref: "DEAL-2", at: "2026-09-05T00:00:00.000Z", quantity: 2, serials: ["SN-3"] },
          ],
        }),
      ],
      { customerName: "고객", generatedAt: "2026-09-22T00:00:00.000Z" }
    )
    expect(csv).toContain("DEAL-1;DEAL-2")
    expect(csv).toContain("SN-1;SN-2;SN-3")
  })

  it("품목명에 쉼표·따옴표가 있으면 이스케이프한다", () => {
    const csv = buildMoneyLineItemsCsv([lineItem({ key: "a", product: '전자칠판 86", 스탠드 포함' })], {
      customerName: "고객",
      generatedAt: "2026-09-22T00:00:00.000Z",
    })
    expect(csv).toContain('"전자칠판 86"", 스탠드 포함"')
  })

  it("단가·금액이 null이면 빈 셀로 남긴다(하이픈 등 비숫자 텍스트 금지)", () => {
    const csv = buildMoneyLineItemsCsv([lineItem({ key: "a", unitPrice: null, amount: null, currency: null })], {
      customerName: "고객",
      generatedAt: "2026-09-22T00:00:00.000Z",
    })
    const row = csv.split("\n")[4]
    // 통화·단가·금액 세 칸이 모두 빈 문자열 — 하이픈 등 비숫자 텍스트로 채우지 않는다.
    expect(row).toContain("3,,,,확정")
  })
})

describe("buildMoneyTimelineCsv", () => {
  it("헤더 순서를 고정한다", () => {
    expect(MONEY_TIMELINE_CSV_HEADERS).toEqual(["일자", "구분", "제목", "통화", "금액", "상태", "담당자", "출처"])
  })

  it("kind별 구분 라벨·통화·출처를 그대로 옮기고 합계 행이 없다", () => {
    const csv = buildMoneyTimelineCsv(
      [
        timelineEntry({ id: "o1", kind: "order", currency: "USD", amount: 1500 }),
        timelineEntry({ id: "c1", kind: "collection", currency: "CNY", amount: 20_000, sourceLabel: "NEO 수금", ownerName: "이담당" }),
        timelineEntry({ id: "d1", kind: "deal", currency: "KRW", amount: 7_000_000, sourceLabel: "딜(₩)", status: "won" }),
      ],
      { customerName: "고객", generatedAt: "2026-09-22T00:00:00.000Z" }
    )
    const rows = csv.split("\n").slice(4)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain(",오더,")
    expect(rows[0]).toContain("USD,1500")
    expect(rows[1]).toContain(",수금,")
    expect(rows[1]).toContain("CNY,20000")
    expect(rows[2]).toContain(",딜,")
    expect(rows[2]).toContain("KRW,7000000")
    expect(rows[2]).toContain("완료") // 딜 status=won → 표시 라벨 "완료"
    expect(csv).not.toMatch(/총계|합계/)
  })

  it("일자는 UTC YYYY-MM-DD로, 담당자 없으면 빈 셀로 남긴다", () => {
    const csv = buildMoneyTimelineCsv(
      [timelineEntry({ id: "o1", occurredAt: "2026-09-12T23:30:00.000Z", ownerName: undefined })],
      { customerName: "고객", generatedAt: "2026-09-22T00:00:00.000Z" }
    )
    const row = csv.split("\n")[4]
    expect(row.startsWith("2026-09-12,")).toBe(true)
  })

  it("occurredAt이 없으면 일자 셀이 빈 문자열이다", () => {
    const csv = buildMoneyTimelineCsv([timelineEntry({ id: "o1", occurredAt: null })], {
      customerName: "고객",
      generatedAt: "2026-09-22T00:00:00.000Z",
    })
    const row = csv.split("\n")[4]
    expect(row.startsWith(",오더,")).toBe(true)
  })
})

describe("moneyCsvFileName", () => {
  it("kind·고객명·dateKey를 조합한다", () => {
    expect(moneyCsvFileName("line-items", "테스트 학원", "2026-09-22")).toBe("money-line-items-테스트-학원-2026-09-22.csv")
    expect(moneyCsvFileName("timeline", "테스트 학원", "2026-09-22")).toBe("money-timeline-테스트-학원-2026-09-22.csv")
  })

  it("파일명에 쓸 수 없는 문자를 제거한다", () => {
    expect(moneyCsvFileName("line-items", 'A/B\\C:D*E?F"G<H>I|J,K', "2026-09-22")).toBe("money-line-items-ABCDEFGHIJK-2026-09-22.csv")
  })

  it("고객명이 비어 있으면 'customer'로 대체한다", () => {
    expect(moneyCsvFileName("line-items", "   ", "2026-09-22")).toBe("money-line-items-customer-2026-09-22.csv")
  })
})
