// P0-2(호환성 기획 2026-07-18 §4) — 연결된 고객 → CRM 진입로.
// (1) 커버리지 additive 확장(linkedTargets): 우세 linked 링크 산출·candidate/stale 제외,
// (2) href 규칙(revLinkedTargetHref): customer=통합 고객 DB 검색 착지 / partner_account=파트너
//     상세 / deal=상세 라우트 없음 → null(링크 생략),
// (3) 워크벤치 배선 소스 스캔 — 레일 전용(1열 무변경) 규약.
// supabase 모킹 관례는 tests/repositories/rev-account-coverage.test.ts와 동일.
// CRLF 정규화 read 관례(autocrlf 체크아웃에서 여러 줄 패턴 보호).
import { readFileSync } from "fs"
import { join } from "path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { normalizedAccountKey } from "@/lib/branch/account-key"
import { getBranchRevSourceRecordKey } from "@/lib/crm-source-linking"
import { revLinkedTargetHref } from "@/lib/crm/rev-sync-health"

const read = (relPath: string) =>
  readFileSync(join(process.cwd(), relPath), "utf8").replace(/\r\n/g, "\n")

interface SheetRow {
  sheet_row: number
  customer_name: string
  team: string | null
  manager: string | null
  status: string | null
  first_payment: string | null
  contract_target: number | null
  monthly_payments: Record<string, number> | null
  synced_at: string | null
}

interface LinkRow {
  source_record_key: string
  status: string
  target_type?: string | null
  target_id?: string | null
  target_label?: string | null
}

function tableClient<T>(rows: T[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    limit: () => builder,
    // order()/range() — rev-account-coverage.ts가 crm_source_links·crm_match_aliases를
    // fetchSupabasePages(id 전순서 커서)로 읽으면서 체인에 추가된 호출.
    order: () => builder,
    range: () => builder,
    then(resolve: (value: { data: T[]; error: null }) => void) {
      resolve({ data: rows, error: null })
    },
  }
  return builder
}

async function loadCoverage(sheetRows: SheetRow[], linkRows: LinkRow[]) {
  vi.resetModules()
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) =>
        table === "branch_rev_deals" ? tableClient(sheetRows) : tableClient(linkRows)
      ),
    })),
  }))
  const { getRevAccountCoverage } = await import("@/lib/repositories/rev-account-coverage")
  return getRevAccountCoverage()
}

function sheetRow(sheet_row: number, customer_name: string, amount: number): SheetRow {
  return {
    sheet_row,
    customer_name,
    team: "BD",
    manager: "BD Han",
    status: "진행",
    first_payment: null,
    contract_target: amount,
    monthly_payments: { "2026-04": amount },
    synced_at: "2026-07-18T00:33:00.000Z",
  }
}

// 가나학원 2행 전부 확정 — 첫 linked 행(row 1)의 target이 우세여야 한다.
const ROW_A1 = sheetRow(1, "가나학원", 1000)
const ROW_A2 = sheetRow(2, "가나학원", 700)
// 다라어학원 — candidate만(검토 대기) → linkedTargets에 절대 못 들어간다.
const ROW_B = sheetRow(3, "다라어학원", 500)
// 마바스쿨 — 링크 없음.
const ROW_C = sheetRow(4, "마바스쿨", 300)
// 하하파트너 — partner_account target 확정(label 없음).
const ROW_P = sheetRow(5, "하하파트너", 900)
// 딜학원 — deal target 확정(데이터는 싣되 href 규칙에서 null → UI 링크 생략).
const ROW_D = sheetRow(6, "딜학원", 400)

const LINKS: LinkRow[] = [
  // 같은 record key에 linked 링크 2개 — 먼저 온 c-111이 이긴다.
  {
    source_record_key: getBranchRevSourceRecordKey(ROW_A1),
    status: "confirmed",
    target_type: "customer",
    target_id: "c-111",
    target_label: "가나학원 · 강남캠퍼스",
  },
  {
    source_record_key: getBranchRevSourceRecordKey(ROW_A1),
    status: "confirmed",
    target_type: "customer",
    target_id: "c-999",
    target_label: "다른 라벨",
  },
  // 같은 계정의 뒤 행(row 2)도 확정이지만 target은 첫 linked 행(row 1) 우세.
  {
    source_record_key: getBranchRevSourceRecordKey(ROW_A2),
    status: "confirmed",
    target_type: "customer",
    target_id: "c-222",
    target_label: null,
  },
  // candidate — target이 있어도 linkedTargets 산출에서 제외.
  {
    source_record_key: getBranchRevSourceRecordKey(ROW_B),
    status: "candidate",
    target_type: "customer",
    target_id: "c-333",
    target_label: "다라어학원",
  },
  // stale — LINKED_STATUSES 밖이므로 target 후보에서 제외.
  {
    source_record_key: getBranchRevSourceRecordKey(ROW_B),
    status: "stale",
    target_type: "customer",
    target_id: "c-444",
    target_label: null,
  },
  {
    source_record_key: getBranchRevSourceRecordKey(ROW_P),
    status: "confirmed",
    target_type: "partner_account",
    target_id: "p-1",
    target_label: null,
  },
  {
    source_record_key: getBranchRevSourceRecordKey(ROW_D),
    status: "confirmed",
    target_type: "deal",
    target_id: "d-1",
    target_label: null,
  },
]

describe("getRevAccountCoverage — linkedTargets additive 산출", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("계정별 우세 linked 링크 target을 싣는다 — 첫 linked 우선, candidate/stale 제외", async () => {
    const coverage = await loadCoverage([ROW_A1, ROW_A2, ROW_B, ROW_C, ROW_P, ROW_D], LINKS)

    expect(coverage.linkedTargets).toEqual([
      {
        accountKey: normalizedAccountKey("가나학원"),
        name: "가나학원",
        targetType: "customer",
        targetId: "c-111",
        label: "가나학원 · 강남캠퍼스",
      },
      {
        accountKey: normalizedAccountKey("하하파트너"),
        name: "하하파트너",
        targetType: "partner_account",
        targetId: "p-1",
        label: null,
      },
      {
        accountKey: normalizedAccountKey("딜학원"),
        name: "딜학원",
        targetType: "deal",
        targetId: "d-1",
        label: null,
      },
    ])
    // candidate만 있는 계정·링크 없는 계정은 절대 linkedTargets에 없다.
    expect(coverage.linkedTargets.some((t) => t.name === "다라어학원")).toBe(false)
    expect(coverage.linkedTargets.some((t) => t.name === "마바스쿨")).toBe(false)

    // 기존 집계 하위호환 — linked/needsReview/unlinked 분해가 target 부착으로 변하지 않는다.
    expect(coverage.accounts).toEqual({
      total: 5,
      linked: 3,
      partial: 0,
      needsReview: 1,
      unlinked: 1,
      placeholder: 0,
    })
  })

  it("target 필드가 없는 구 링크 행에서도 안전하다(빈 linkedTargets)", async () => {
    const coverage = await loadCoverage(
      [ROW_A1],
      [{ source_record_key: getBranchRevSourceRecordKey(ROW_A1), status: "confirmed" }]
    )
    expect(coverage.linkedTargets).toEqual([])
    expect(coverage.accounts.linked).toBe(1)
  })
})

describe("revLinkedTargetHref — target_type → href 규칙", () => {
  it("customer는 통합 고객 DB 검색 착지 — label 우선, 없으면 시트 계정명", () => {
    expect(
      revLinkedTargetHref({
        targetType: "customer",
        targetId: "c-1",
        label: "가나학원 · 강남캠퍼스",
        name: "가나학원",
      })
    ).toBe(`/admin/crm/customers/unified?q=${encodeURIComponent("가나학원 · 강남캠퍼스")}`)
    expect(
      revLinkedTargetHref({ targetType: "customer", targetId: "c-1", label: null, name: "가나학원" })
    ).toBe(`/admin/crm/customers/unified?q=${encodeURIComponent("가나학원")}`)
  })

  it("partner_account는 파트너 상세 경로", () => {
    expect(
      revLinkedTargetHref({ targetType: "partner_account", targetId: "p 1/2", label: null, name: "하하파트너" })
    ).toBe(`/admin/crm/partners/${encodeURIComponent("p 1/2")}`)
  })

  it("deal은 상세 라우트가 없어 링크 생략(null) — 빈 target_id도 null", () => {
    expect(revLinkedTargetHref({ targetType: "deal", targetId: "d-1", label: null, name: "딜학원" })).toBeNull()
    expect(revLinkedTargetHref({ targetType: "customer", targetId: "  ", label: null, name: "가나학원" })).toBeNull()
    expect(revLinkedTargetHref({ targetType: "customer", targetId: "c-1", label: "  ", name: "  " })).toBeNull()
  })
})

describe("SalesLedgerWorkbench — CRM ↗ 배선(레일 전용, 1열 무변경)", () => {
  const workbench = read("components/admin/branch/SalesLedgerWorkbench.tsx")
  const matrix = read("components/admin/branch/ledger/RevMatrix.tsx")

  it("커버리지 확장(linkedTargets)을 소비하고 href 규칙은 SSOT(revLinkedTargetHref)만 쓴다", () => {
    expect(workbench).toContain('"/api/admin/crm/coverage"')
    expect(workbench).toContain("revLinkedTargetHref(")
    expect(workbench).toContain("crmLinkedFor(")
    // 워크벤치에서 href를 직접 조립하지 않는다(규칙 이원화 방지).
    expect(workbench).not.toContain("/admin/crm/customers/unified?q=")
  })

  it("레일 두 곳에만 렌더 — 그룹 요약(NeedsLinkBadge 자리 대칭) + 행 상세(inline)", () => {
    const usages = workbench.match(/<CrmLinkedBadge/g) ?? []
    expect(usages).toHaveLength(2)
    // 그룹 요약 — 미연결 배지와 같은 자리에서 대칭 렌더.
    expect(workbench).toContain(
      "{isNeedsLink(selectedGroup.customer) && <NeedsLinkBadge customer={selectedGroup.customer} />}"
    )
    expect(workbench).toContain(
      "<CrmLinkedBadge customer={selectedGroup.customer} link={crmLinkedFor(selectedGroup.customer)} />"
    )
    // 행 상세 — '하드웨어 ↗'와 같은 톤/크기의 inline 변형.
    expect(workbench).toContain('variant="inline"')
  })

  it("1열(매트릭스)은 무변경 — CrmLinkedBadge는 RevMatrix에서 export만 하고 렌더하지 않는다", () => {
    expect(matrix).toContain("export function CrmLinkedBadge")
    expect(matrix).not.toContain("<CrmLinkedBadge")
    // 미연결 팝오버(1열 트리거)·레일 미연결 배지는 현행 유지.
    expect(matrix).toContain("CRM 미연결 — 매출·활동이 CRM 고객과 이어져 있지 않습니다.")
    expect(matrix).toContain("매칭 인박스에서 연결 ↗")
  })
})
