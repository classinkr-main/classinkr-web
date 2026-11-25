// P2 — 매출시트 행 확정·제외: 요약 다시 세기(순수) + 화면 소스 계약(권한·공용 훅·기존 경로만).
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import type { AdminCrmRevenueSheetRow } from "@/lib/admin-crm-revenue-sheet-types"
import { recountRevenueSheetLinkSummary } from "@/lib/crm/revenue-sheet-view"

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
    note: null,
    contractTarget: 0,
    scheduledAmount: 1_000,
    confirmedAmount: 0,
    highConfidenceAmount: 0,
    expectedAmount: 1_000,
    pendingAmount: 0,
    pendingNextWeek: null,
    pendingNextStart: null,
    pastUnconfirmedAmount: 0,
    monthCount: 1,
    linkId: "link-1",
    linkStatus: "candidate",
    targetType: "customer",
    targetId: "c-1",
    targetLabel: "한빛",
    confidence: 0.9,
    placeholder: false,
    syncedAt: "2026-09-23T08:00:00Z",
    ...overrides,
  }
}

const summary = { linkedRowCount: 5, candidateRowCount: 3, unmatchedRowCount: 7, linkedAmount: 50_000, unmatchedAmount: 9_000, rowCount: 99 }

describe("recountRevenueSheetLinkSummary — 행에서 바꾼 링크만큼 요약을 고친다", () => {
  it("후보 → 확정: 연결 +1, 후보 −1, 미연결 −1, 금액 이동", () => {
    const before = [row()]
    const after = [row({ linkStatus: "confirmed" })]
    expect(recountRevenueSheetLinkSummary(summary, before, after)).toEqual({
      ...summary,
      linkedRowCount: 6,
      candidateRowCount: 2,
      unmatchedRowCount: 6,
      linkedAmount: 51_000,
      unmatchedAmount: 8_000,
    })
  })

  it("후보 → 제외: 후보만 −1(여전히 미연결)", () => {
    const next = recountRevenueSheetLinkSummary(summary, [row()], [row({ linkStatus: "rejected" })])
    expect(next).toEqual({ ...summary, candidateRowCount: 2 })
  })

  it("확정 → 재검수(되돌리기)는 반대 방향이다 — 반영 후 복원하면 원래 요약", () => {
    const before = [row()]
    const confirmed = [row({ linkStatus: "confirmed" })]
    const once = recountRevenueSheetLinkSummary(summary, before, confirmed)
    expect(recountRevenueSheetLinkSummary(once, confirmed, before)).toEqual(summary)
    const staled = recountRevenueSheetLinkSummary(once, confirmed, [row({ linkStatus: "stale" })])
    expect(staled).toEqual(summary)
  })

  it("임시명·취소/해지 행은 서버처럼 분모 밖이라 요약을 바꾸지 않는다", () => {
    expect(recountRevenueSheetLinkSummary(summary, [row({ placeholder: true })], [row({ placeholder: true, linkStatus: "confirmed" })])).toBe(summary)
    expect(recountRevenueSheetLinkSummary(summary, [row({ status: "해지" })], [row({ status: "해지", linkStatus: "confirmed" })])).toBe(summary)
  })

  it("상태가 그대로면 같은 객체를 돌려준다(불필요한 리렌더 없음)", () => {
    const rows = [row()]
    expect(recountRevenueSheetLinkSummary(summary, rows, rows.map((r) => ({ ...r })))).toBe(summary)
  })
})

describe("매출시트 화면 계약 — P2 행·일괄 확정/제외", () => {
  const page = readFileSync("app/admin/crm/deals/rev-sheet/page.tsx", "utf8")
  const inbox = readFileSync("components/admin/crm/matching/MatchingInboxClient.tsx", "utf8")
  const hook = readFileSync("components/admin/crm/matching/useSourceLinkActions.ts", "utf8")

  it("매출시트와 매칭 인박스가 같은 훅을 쓴다", () => {
    expect(page).toContain("useSourceLinkActions<AdminCrmRevenueSheetRow>(")
    expect(inbox).toContain("useSourceLinkActions<CrmMatchingRow>(")
    expect(page).toContain("<SourceLinkUndoNotice")
    expect(inbox).toContain("<SourceLinkUndoNotice")
  })

  it("버튼은 서버와 같은 CRM 스태프 역할에서만 보인다", () => {
    expect(page).toContain("setCanEditLinks(sessionRoleIn(SESSION_CRM_STAFF_ROLES))")
    expect(page).toContain("canEditLinks && row.linkId && isSourceLinkActionable(row)")
    expect(page).toContain("canEditLinks && (selectableRows.length > 0 || selectedIds.size > 0)")
    // 권한 없으면 예전 링크(인박스로 이동)가 그대로 남는다.
    expect(page).toContain("연결하기")
  })

  it("기존 서버 경로만 쓴다 — 새 API·직접 DB 접근 없음", () => {
    // 훅은 URL을 직접 만들지 않는다 — 요청은 lib의 run* 함수(기존 두 경로)만 거친다.
    expect(hook).not.toMatch(/adminFetchJson(<[^>]*>)?\(\s*[`"']/)
    // 매출시트는 확정·제외 URL을 따로 만들지 않는다(기존 후보 생성 호출 generate만 남는다).
    expect(page).not.toContain("source-links/${")
    expect(page).not.toContain("source-links/bulk")
    const lib = readFileSync("lib/crm/source-link-actions.ts", "utf8")
    expect(lib).toContain("`/api/admin/crm/source-links/${encodeURIComponent(linkId)}`")
    expect(lib).toContain("`/api/admin/crm/source-links/bulk`")
    expect(page).not.toMatch(/supabase/i)
    expect(hook).not.toMatch(/supabase/i)
  })

  it("행 변경 직후 전체 재조회로 낙관적 상태를 덮지 않는다 — 요약은 차이만 고친다", () => {
    expect(page).toContain("recountRevenueSheetLinkSummary(current.summary, current.rows, rows)")
    const hookCall = page.slice(page.indexOf("useSourceLinkActions<AdminCrmRevenueSheetRow>("))
    expect(hookCall.slice(0, hookCall.indexOf("})\n"))).not.toContain("refresh:")
  })

  it("일괄 선택은 보이는 후보·재검수 행만, 필터가 바뀌면 비운다", () => {
    expect(page).toContain("visibleRows.slice(0, visibleLimit).filter((row) => isSourceLinkActionable(row))")
    expect(page).toContain("setSelectedIds(new Set())")
    expect(page).toContain("colSpan={columnCount}")
  })

  it("되돌리기는 재검수(stale)로 보낸다", () => {
    expect(page).toContain('updateSourceLink(linkId, "stale")')
    expect(page).toContain("제외를 되돌리고 재검수로 보냅니다")
  })
})
