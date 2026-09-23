// 라운드 5 B3·S-6·S-9 — 매출시트 화면 순수 헬퍼(lib/crm/revenue-sheet-view.ts).
import { describe, expect, it } from "vitest"

import type { AdminCrmRevenueSheetRow } from "@/lib/admin-crm-revenue-sheet-types"
import {
  DEFAULT_REVENUE_SHEET_URL_STATE,
  LEDGER_MANUAL_ENTRIES_HREF,
  buildLedgerEntryHref,
  buildRevenueSheetCsvRows,
  isRevenueSheetSyncStale,
  parseRevenueSheetUrlState,
  serializeRevenueSheetUrlState,
} from "@/lib/crm/revenue-sheet-view"

function row(overrides: Partial<AdminCrmRevenueSheetRow> = {}): AdminCrmRevenueSheetRow {
  return {
    id: "deal-1",
    sheetRow: 12,
    sourceRecordKey: "rev:12",
    customerName: "한빛학원",
    branchContact: null,
    team: "BD",
    manager: "김담당",
    dealType: "Direct",
    status: "New",
    firstPayment: "2026-09-01",
    productVersion: "SW",
    region: "서울",
    importance: null,
    note: "=HYPERLINK(\"x\")",
    contractTarget: 0,
    scheduledAmount: 3_000_000,
    confirmedAmount: 1_000_000.4,
    highConfidenceAmount: 500_000,
    expectedAmount: 1_500_000,
    pastUnconfirmedAmount: 0,
    monthCount: 3,
    linkId: null,
    linkStatus: null,
    targetType: null,
    targetId: null,
    targetLabel: null,
    confidence: 0.834,
    placeholder: false,
    syncedAt: "2026-09-23T08:00:00Z",
    ...overrides,
  }
}

describe("buildLedgerEntryHref — 매출시트 행 → 장부의 그 행(라운드 4 P2-10)", () => {
  it("REV 렌즈·월 기간·당월·고객명 검색·팀으로 착지한다 — 장부는 period=M일 때만 month를 쓴다", () => {
    const href = buildLedgerEntryHref(row(), "2026-09")
    const url = new URL(href, "https://classin.kr")
    expect(url.pathname).toBe("/admin/branch/ledger")
    expect(url.searchParams.get("lens")).toBe("rev")
    expect(url.searchParams.get("period")).toBe("M")
    expect(url.searchParams.get("month")).toBe("2026-09")
    expect(url.searchParams.get("q")).toBe("한빛학원")
    expect(url.searchParams.get("team")).toBe("BD")
  })

  it("임시명 행은 이름 대신 시트 행 번호로 찾는다", () => {
    const url = new URL(buildLedgerEntryHref(row({ placeholder: true, customerName: "(미정)" }), "2026-09"), "https://x")
    expect(url.searchParams.get("q")).toBe("12")
  })

  it("장부가 모르는 팀·형식이 틀린 월은 싣지 않는다(장부가 기본값으로 되돌리는 값)", () => {
    const url = new URL(buildLedgerEntryHref(row({ team: "HQ" }), "2026-9"), "https://x")
    expect(url.searchParams.has("team")).toBe(false)
    expect(url.searchParams.has("month")).toBe(false)
  })

  it("수기 입력 확인 링크는 적용 초안 원천·회계연도 전체", () => {
    const url = new URL(LEDGER_MANUAL_ENTRIES_HREF, "https://x")
    expect(url.searchParams.get("origin")).toBe("draft")
    expect(url.searchParams.get("period")).toBe("Y")
  })
})

describe("필터 URL 보존(S-9)", () => {
  it("기본값은 URL에 적지 않고, 바뀐 값만 왕복한다", () => {
    expect(serializeRevenueSheetUrlState(DEFAULT_REVENUE_SHEET_URL_STATE)).toBe("")
    const search = serializeRevenueSheetUrlState({ status: "unmatched", team: "MKT", q: " 한빛 " })
    expect(parseRevenueSheetUrlState(`?${search}`)).toEqual({ status: "unmatched", team: "MKT", q: "한빛" })
  })

  it("모르는 상태 값은 기본값(검토 필요)으로", () => {
    expect(parseRevenueSheetUrlState("?status=bogus").status).toBe("review")
  })
})

describe("buildRevenueSheetCsvRows(B3)", () => {
  it("머리글 + 행마다 ¥ 정수·링크 상태 라벨·신뢰도 %를 싣는다", () => {
    const rows = buildRevenueSheetCsvRows([row(), row({ id: "deal-2", linkStatus: "confirmed", targetLabel: "고객 · 한빛", confidence: null })])
    expect(rows).toHaveLength(3)
    expect(rows[0][0]).toBe("시트 행")
    expect(rows[1][9]).toBe(1_000_000) // 확정 표시 — 반올림 정수
    expect(rows[1][13]).toBe("미매칭")
    expect(rows[1][15]).toBe(83)
    expect(rows[2][13]).toBe("확정")
    expect(rows[2][15]).toBeNull()
  })
})

describe("isRevenueSheetSyncStale(S-6)", () => {
  const now = Date.parse("2026-09-23T10:00:00Z")
  it("26시간을 넘기거나 기록이 없으면 오래됨", () => {
    expect(isRevenueSheetSyncStale("2026-09-22T09:00:00Z", now)).toBe(false)
    expect(isRevenueSheetSyncStale("2026-09-22T07:59:00Z", now)).toBe(true)
    expect(isRevenueSheetSyncStale(null, now)).toBe(true)
  })
})
