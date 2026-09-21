/**
 * unified-07 · unified-08 — 결과 섹션 헤더의 정렬 범위 캡션과 돈흐름 통화 안내.
 *
 * 정렬은 현재 페이지(≤50건)만 클라이언트에서 재정렬한다(unified/sort.tsx). 툴바·페이지네이션에
 * 범위를 명시하지 않으면 전체 정렬처럼 읽혀 페이지를 넘길 때 순서 리셋을 오해한다.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import CustomerResultsSection, {
  MONEY_COLUMN_CURRENCY_HINT,
  sortScopeCaption,
} from "@/components/admin/crm/unified/CustomerResultsSection"
import type { CrmUnifiedCustomers } from "@/components/admin/crm/unified/shared"
import type { CrmUnifiedCustomerRow } from "@/lib/repositories/crm-unified-customers"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

function row(index: number): CrmUnifiedCustomerRow {
  return {
    key: `neo:${index}`,
    source: "neo_account",
    sourceLabel: "고객",
    name: `고객 ${index}`,
    contact: null,
    ownerName: null,
    ownerKeys: [],
    lifecycle: "active_account",
    statusLabel: "활성 고객",
    nextActionLabel: "관계 유지",
    priorityReason: "-",
    score: 10,
    bucket: null,
    moneyLabel: null,
    moneyState: "zero",
    href: "#",
    updatedAt: null,
    expireAt: null,
    balance: 0,
    tags: [],
    origin: null,
    crmRegistered: false,
    provisional: false,
    slaTarget: false,
    firstResponseAt: null,
    createdAt: null,
  }
}

function data(rows: CrmUnifiedCustomerRow[]): CrmUnifiedCustomers {
  return {
    generatedAt: "2026-09-15T00:00:00.000Z",
    sources: { leadsOk: true, neoAccountsOk: true, warnings: [], statuses: [] },
    summary: { total: 120, leadCount: 0, accountCount: 120, highPriorityCount: 0, ownerCount: 0 },
    pagination: { limit: 50, offset: 0, returned: rows.length, total: 120, hasMore: true, nextOffset: 50 },
    owners: [],
    rows,
  }
}

function render(sort: { key: "name"; direction: "asc" } | null, rows: CrmUnifiedCustomerRow[]) {
  return renderToStaticMarkup(
    <CustomerResultsSection
      data={data(rows)}
      rows={rows}
      loading={false}
      loadingMore={false}
      refreshing={false}
      sort={sort}
      onToggleSort={() => undefined}
      onClearSort={() => undefined}
      savedView="all"
      hasActiveFilters={false}
      onResetFilters={() => undefined}
      onOpenDrawer={() => undefined}
      onRowDoubleClick={() => undefined}
      onLoadPage={() => undefined}
      onOpenLeadModal={() => undefined}
    />
  )
}

describe("CustomerResultsSection 정렬 범위·통화 안내", () => {
  const fifty = Array.from({ length: 50 }, (_, index) => row(index))

  it("정렬 활성 시 툴바 문구와 페이지네이션에 '이 페이지 N건 기준' 캡션을 붙인다", () => {
    const html = render({ key: "name", direction: "asc" }, fifty)

    expect(sortScopeCaption(50)).toBe("이 페이지 50건 기준")
    expect(html).toContain("정렬 · 고객명 오름차순 · 이 페이지 50건 기준")
    expect(html).toContain("정렬은 이 페이지 50건 기준")
  })

  it("추천순(기본)에는 범위 캡션을 붙이지 않는다", () => {
    const html = render(null, fifty)

    expect(html).toContain("추천순 (기본)")
    expect(html).not.toContain("이 페이지 50건 기준")
  })

  it("돈흐름 헤더에 통화 안내(title + sr-only)를 붙인다", () => {
    const html = render(null, fifty.slice(0, 3))

    expect(MONEY_COLUMN_CURRENCY_HINT).toBe("외부 CRM: ¥잔액·$오더 / 전환 고객: ₩계약·미수")
    expect(html).toContain(`title="${MONEY_COLUMN_CURRENCY_HINT}"`)
    expect(html).toContain("잔액 ¥0")
    expect(html).not.toContain("0원")
  })
})
