/**
 * 통합 고객 목록의 Compass 링크 문구 = 공용 판정(resolveCrmWriteSurface) — 2026-09-26 교차 리뷰 [25].
 * 예전에는 source 만 보고 리드 행이면 "Compass에서 열기"를 붙여, 고객 행으로 접히지 않은 전환 리드·NEO 등록 확정
 * 리드를 목록은 Compass, 360 드로어·리드 보드는 Home 정본으로 갈라 안내했다.
 *  - Compass 정본(surface=compass)이면 "Compass에서 열기", Home 정본이면 보조 "Compass 기록 ↗".
 *  - 등록 확정은 360 과 같은 external_account 집합(neoAccountConfirmed)만 — 행의 crmRegistered(external_lead 포함)는
 *    쓰지 않는다(반대 방향 갈림 방지).
 *  - 리드 상태 원값이 행에 없으면 저장소가 converted 에만 주는 statusLabel 로 폴백 — 문구 계약을 저장소 소스로 고정.
 *  - 저장소 행에 등록 확정 사실이 없어(검증 [25] 잔여) 리드 보드와 같은 원천(neo-registered)을 목록이 읽어 넘긴다.
 * DOM 환경이 없어 순수 함수 + renderToStaticMarkup + 소스 계약으로 고정한다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

import CustomerResultsSection from "@/components/admin/crm/unified/CustomerResultsSection"
import UnifiedCompassLink, {
  UNIFIED_COMPASS_RECORD_LABEL,
  UNIFIED_LEAD_CONVERTED_STATUS_LABEL,
  UNIFIED_NEO_REGISTERED_ENDPOINT,
  fetchUnifiedNeoRegisteredLeadIds,
  parseUnifiedNeoRegisteredLeadIds,
  unifiedCompassLinkLabel,
  unifiedCompassWriteSurface,
  unifiedLeadRowId,
  unifiedRowNeedsNeoRegistration,
  withUnifiedNeoRegistration,
} from "@/components/admin/crm/unified/UnifiedCompassLink"
import type { CrmUnifiedCustomers } from "@/components/admin/crm/unified/shared"
import { COMPASS_OPEN_LABEL } from "@/components/admin/compass/CompassOpenLink"
import { compassLeadUrl } from "@/lib/compass/normalize"
import { COMPASS_RECORD_LABEL, resolveCrmWriteSurface, resolveLeadBoardWriteSurface } from "@/lib/crm/write-surface"
import type { CrmUnifiedCustomerRow } from "@/lib/repositories/crm-unified-customers"
import type { LeadStatus } from "@/lib/supabase/database.types"

const COMPASS = { leadId: 123, url: compassLeadUrl(123), stageLabel: "데모" }

function row(partial: Partial<CrmUnifiedCustomerRow>): CrmUnifiedCustomerRow {
  return {
    key: "lead:1",
    source: "lead",
    sourceLabel: "리드",
    name: "가나학원",
    contact: null,
    ownerName: "박담당",
    ownerKeys: ["박담당"],
    lifecycle: "active_lead",
    statusLabel: "접촉 중",
    nextActionLabel: "팔로업",
    priorityReason: "-",
    score: 10,
    bucket: null,
    moneyLabel: null,
    moneyState: "none",
    href: "#",
    updatedAt: null,
    expireAt: null,
    balance: null,
    tags: [],
    origin: "site",
    crmRegistered: false,
    provisional: false,
    slaTarget: false,
    firstResponseAt: null,
    createdAt: null,
    compass: COMPASS,
    ...partial,
  }
}

/** 전환 링크가 없어 고객 행으로 접히지 않은 전환 리드 — 저장소가 만드는 모양 그대로. */
const CONVERTED_LEAD = row({ key: "lead:c", lifecycle: "closed", statusLabel: UNIFIED_LEAD_CONVERTED_STATUS_LABEL, nextActionLabel: "기록 확인" })

function data(rows: CrmUnifiedCustomerRow[]): CrmUnifiedCustomers {
  return {
    generatedAt: "2026-09-26T03:00:00.000Z",
    sources: { leadsOk: true, neoAccountsOk: true, warnings: [], statuses: [] },
    summary: { total: rows.length, leadCount: rows.length, accountCount: 0, highPriorityCount: 0, ownerCount: 1 },
    pagination: { limit: 50, offset: 0, returned: rows.length, total: rows.length, hasMore: false, nextOffset: null },
    owners: [],
    rows,
  }
}

function renderResults(rows: CrmUnifiedCustomerRow[]) {
  return renderToStaticMarkup(
    <CustomerResultsSection
      data={data(rows)}
      rows={rows}
      loading={false}
      loadingMore={false}
      refreshing={false}
      sort={null}
      onToggleSort={() => {}}
      onClearSort={() => {}}
      savedView="all"
      hasActiveFilters={false}
      onResetFilters={() => {}}
      onOpenDrawer={() => {}}
      onRowDoubleClick={() => {}}
      onLoadPage={() => {}}
      onOpenLeadModal={() => {}}
    />
  )
}

function count(html: string, needle: string) {
  return html.split(needle).length - 1
}

describe("unifiedCompassLinkLabel — 공용 판정으로 문구를 고른다", () => {
  it("응대 중 리드(신규·접촉 중·종료, 단계 무관)는 Compass 정본 → 'Compass에서 열기'", () => {
    expect(unifiedCompassLinkLabel(row({}))).toBe(COMPASS_OPEN_LABEL)
    expect(unifiedCompassLinkLabel(row({ lifecycle: "new_lead", statusLabel: "신규 리드" }))).toBe(COMPASS_OPEN_LABEL)
    expect(unifiedCompassLinkLabel(row({ lifecycle: "closed", statusLabel: "종료" }))).toBe(COMPASS_OPEN_LABEL)
    expect(unifiedCompassWriteSurface(row({}))).toMatchObject({ surface: "compass", reason: "compass_lead" })
  })

  it("전환 리드(고객 행으로 안 접힌 것)는 Home 정본 → 보조 'Compass 기록' — 같은 Compass 딥링크", () => {
    expect(unifiedCompassLinkLabel(CONVERTED_LEAD)).toBe(UNIFIED_COMPASS_RECORD_LABEL)
    expect(UNIFIED_COMPASS_RECORD_LABEL).toBe(COMPASS_RECORD_LABEL)
    expect(unifiedCompassWriteSurface(CONVERTED_LEAD)).toEqual({
      surface: "home",
      reason: "converted_lead",
      compassHref: compassLeadUrl(123),
      secondaryCompassHref: compassLeadUrl(123),
    })
  })

  it("행에 리드 상태 원값(leadStatus)이 실리면 문구 폴백보다 우선한다", () => {
    expect(unifiedCompassLinkLabel({ ...row({}), leadStatus: "converted" })).toBe(UNIFIED_COMPASS_RECORD_LABEL)
    expect(unifiedCompassLinkLabel({ ...CONVERTED_LEAD, leadStatus: "contacted" })).toBe(COMPASS_OPEN_LABEL)
  })

  it("NEO 계정(external_account) 등록 확정 리드(NEO 행이 스냅샷에 없어 안 접힌 것)는 Home 정본", () => {
    expect(unifiedCompassLinkLabel({ ...row({}), neoAccountConfirmed: true })).toBe(UNIFIED_COMPASS_RECORD_LABEL)
    expect(unifiedCompassWriteSurface({ ...row({}), neoAccountConfirmed: true })?.reason).toBe("converted_lead")
  })

  it("행의 crmRegistered(external_lead 까지 세는 넓은 배지)만으로는 Home 으로 돌리지 않는다 — 360 과 반대 갈림 방지", () => {
    expect(unifiedCompassLinkLabel(row({ crmRegistered: true }))).toBe(COMPASS_OPEN_LABEL)
  })

  it("계정(NEO)·전환 고객 행은 Home 정본 → 'Compass 기록', 매칭이 없으면 null", () => {
    expect(unifiedCompassLinkLabel(row({ key: "neo:A", source: "neo_account", lifecycle: "active_account" }))).toBe(
      UNIFIED_COMPASS_RECORD_LABEL
    )
    expect(unifiedCompassWriteSurface(row({ key: "neo:A", source: "neo_account" }))?.reason).toBe("neo_account")
    expect(unifiedCompassLinkLabel(row({ key: "customer:C", source: "customer", statusLabel: "리드 전환 완료" }))).toBe(
      UNIFIED_COMPASS_RECORD_LABEL
    )
    expect(unifiedCompassLinkLabel(row({ compass: null }))).toBeNull()
    expect(unifiedCompassWriteSurface({ ...CONVERTED_LEAD, compass: null })).toBeNull()
    // 좁은 입력(세그먼트 허브처럼 source·compass 만 넘기는 호출부)도 깨지지 않는다.
    expect(unifiedCompassLinkLabel({ source: "lead", compass: COMPASS })).toBe(COMPASS_OPEN_LABEL)
  })
})

describe("한 규칙 — 같은 리드를 목록·리드 보드·360 이 같은 곳으로 안내한다", () => {
  const statuses: LeadStatus[] = ["new", "contacted", "converted", "closed"]
  const cases = statuses.flatMap((leadStatus) => [false, true].map((registered) => ({ leadStatus, registered })))

  it.each(cases)("leadStatus=$leadStatus · 등록 확정=$registered", ({ leadStatus, registered }) => {
    const href = compassLeadUrl(123)
    const unified = unifiedCompassWriteSurface({ ...row({}), leadStatus, neoAccountConfirmed: registered })
    const board = resolveLeadBoardWriteSurface({ leadStatus, compassHref: href, crmRegistered: registered })
    const c360 = resolveCrmWriteSurface({ source: "lead", found: true, compassHref: href, leadStatus, crmRegistered: registered })
    expect(unified?.surface).toBe(board.surface)
    expect(unified?.surface).toBe(c360.surface)
    expect(unified?.reason).toBe(c360.reason)
  })
})

describe("결과 표 — 전환 리드 행은 보조 'Compass 기록'(데스크톱 셀 + 모바일 카드)", () => {
  it("전환 리드는 'Compass 기록', 응대 중 리드는 'Compass에서 열기' — 판정은 data-write-surface 로도 드러난다", () => {
    const html = renderResults([CONVERTED_LEAD, row({ key: "lead:2", name: "다라학원" })])
    expect(count(html, 'aria-label="가나학원 Compass 기록 (새 탭)"')).toBe(2)
    expect(count(html, 'aria-label="다라학원 Compass에서 열기 (새 탭)"')).toBe(2)
    expect(html).not.toContain('aria-label="가나학원 Compass에서 열기 (새 탭)"')
    expect(count(html, 'data-write-surface="home"')).toBe(2)
    expect(count(html, 'data-write-surface="compass"')).toBe(2)
  })
})

describe("UnifiedCompassLink — icon 변형(좁은 표 칸 재사용)", () => {
  it("문구는 접근성 라벨·title 로만, 단계 캡션 없음, href 는 id 로 다시 만든 것", () => {
    const html = renderToStaticMarkup(<UnifiedCompassLink row={CONVERTED_LEAD} variant="icon" />)
    expect(html).toContain(`href="${compassLeadUrl(123)}"`)
    expect(html).toContain('aria-label="가나학원 Compass 기록 (새 탭)"')
    expect(html).not.toContain("· 데모")
    expect(html).not.toContain(`<span>${UNIFIED_COMPASS_RECORD_LABEL}</span>`)
  })
})

// 2026-09-26 검증 [25] 잔여 — 저장소 행에는 external_account 등록 확정 사실이 없어, NEO 행이 스냅샷에 없어 안
// 접힌 등록 리드가 계속 "Compass에서 열기"였다. 리드 보드와 같은 원천(neo-registered)을 목록이 읽어 넘긴다.
describe("NEO 등록 확정 원천(neo-registered) — 안 접힌 등록 리드도 360·리드 보드와 같이 Home 정본", () => {
  const LEAD = row({ key: "lead:L1" })

  it("원천에 리드 id 가 있으면 'Compass 기록'(Home 정본), 없으면 'Compass에서 열기' 그대로", () => {
    const ids = new Set(["L1"])
    expect(unifiedCompassLinkLabel(withUnifiedNeoRegistration(LEAD, ids))).toBe(UNIFIED_COMPASS_RECORD_LABEL)
    expect(unifiedCompassWriteSurface(withUnifiedNeoRegistration(LEAD, ids))?.reason).toBe("converted_lead")
    expect(unifiedCompassLinkLabel(withUnifiedNeoRegistration(LEAD, new Set(["L2"])))).toBe(COMPASS_OPEN_LABEL)
    // 조회 전·실패(원천 없음) = 미등록 폴백.
    expect(withUnifiedNeoRegistration(LEAD, null)).toBe(LEAD)
    expect(withUnifiedNeoRegistration(LEAD, new Set())).toBe(LEAD)
  })

  it("리드 id 는 행 키(lead:<id>)로만 찾는다 — 계정·고객 행 키가 같은 id 여도 덧입히지 않는다", () => {
    const ids = new Set(["L1"])
    const neoRow = row({ key: "neo:L1", source: "neo_account" })
    const customerRow = row({ key: "customer:L1", source: "customer" })
    expect(withUnifiedNeoRegistration(neoRow, ids)).toBe(neoRow)
    expect(withUnifiedNeoRegistration(customerRow, ids)).toBe(customerRow)
    expect(unifiedLeadRowId(LEAD)).toBe("L1")
    expect(unifiedLeadRowId(row({ key: "lead:" }))).toBeNull()
    expect(unifiedLeadRowId({ source: "lead" })).toBeNull()
  })

  it("행에 neoAccountConfirmed 가 실려 오면 원천이 없어도 등록 확정(둘 중 하나라도 참)", () => {
    const confirmed = { ...LEAD, neoAccountConfirmed: true }
    expect(withUnifiedNeoRegistration(confirmed, new Set())).toBe(confirmed)
    expect(unifiedCompassLinkLabel(withUnifiedNeoRegistration(confirmed, null))).toBe(UNIFIED_COMPASS_RECORD_LABEL)
  })

  it("원천은 문구가 바뀔 수 있는 행이 있을 때만 읽는다 — Compass 링크 있는 전환 아닌 리드", () => {
    expect(unifiedRowNeedsNeoRegistration(LEAD)).toBe(true)
    expect(unifiedRowNeedsNeoRegistration({ ...LEAD, compass: null })).toBe(false)
    expect(unifiedRowNeedsNeoRegistration(CONVERTED_LEAD)).toBe(false)
    expect(unifiedRowNeedsNeoRegistration({ ...LEAD, leadStatus: "converted" })).toBe(false)
    expect(unifiedRowNeedsNeoRegistration({ ...LEAD, neoAccountConfirmed: true })).toBe(false)
    // 서버가 "미등록"을 알려 준 행도 전체 조회를 건너뛴다(필드 없음 = 모름일 때만 조회).
    expect(unifiedRowNeedsNeoRegistration({ ...LEAD, neoAccountConfirmed: false })).toBe(false)
    expect(unifiedRowNeedsNeoRegistration(row({ key: "neo:A", source: "neo_account" }))).toBe(false)
    expect(unifiedRowNeedsNeoRegistration(row({ key: "customer:C", source: "customer" }))).toBe(false)
    expect(unifiedRowNeedsNeoRegistration({ source: "lead", compass: COMPASS })).toBe(false)
  })

  it("응답 파싱 — { leadIds: string[] } 만 받고, 모양이 틀리거나 조회가 실패하면 null(모름 — 직전 값 유지)", async () => {
    expect(parseUnifiedNeoRegisteredLeadIds({ leadIds: ["L1", "", 3, "L2"] })).toEqual(new Set(["L1", "L2"]))
    expect(parseUnifiedNeoRegisteredLeadIds({ leadIds: [] })).toEqual(new Set())
    expect(parseUnifiedNeoRegisteredLeadIds({})).toBeNull()
    expect(parseUnifiedNeoRegisteredLeadIds(null)).toBeNull()
    expect(parseUnifiedNeoRegisteredLeadIds([])).toBeNull()

    const fetchJson = vi.fn(async () => ({ generatedAt: "x", leadIds: ["L1"] }))
    expect(await fetchUnifiedNeoRegisteredLeadIds(fetchJson)).toEqual(new Set(["L1"]))
    expect(fetchJson).toHaveBeenCalledWith(UNIFIED_NEO_REGISTERED_ENDPOINT)
    expect(
      await fetchUnifiedNeoRegisteredLeadIds(async () => {
        throw new Error("500")
      })
    ).toBeNull()
    expect(await fetchUnifiedNeoRegisteredLeadIds(async () => ({ error: "x" }))).toBeNull()
  })

  it("한 규칙 — 원천으로 판정한 목록 = 같은 등록 사실을 받은 리드 보드·360", () => {
    const href = compassLeadUrl(123)
    const statuses: LeadStatus[] = ["new", "contacted", "converted", "closed"]
    for (const leadStatus of statuses) {
      for (const registered of [false, true]) {
        const ids = registered ? new Set(["L1"]) : new Set<string>()
        const unified = unifiedCompassWriteSurface(withUnifiedNeoRegistration({ ...LEAD, leadStatus }, ids))
        const board = resolveLeadBoardWriteSurface({ leadStatus, compassHref: href, crmRegistered: registered })
        const c360 = resolveCrmWriteSurface({ source: "lead", found: true, compassHref: href, leadStatus, crmRegistered: registered })
        expect(unified?.surface).toBe(board.surface)
        expect(unified?.reason).toBe(c360.reason)
      }
    }
  })

  it("컴포넌트 — neoRegisteredLeadIds 를 받으면 등록 리드를 'Compass 기록'으로, href 는 id 로 다시 만든 것", () => {
    const html = renderToStaticMarkup(<UnifiedCompassLink row={LEAD} neoRegisteredLeadIds={new Set(["L1"])} />)
    expect(html).toContain('aria-label="가나학원 Compass 기록 (새 탭)"')
    expect(html).toContain('data-write-surface="home"')
    expect(html).toContain(`href="${compassLeadUrl(123)}"`)
    const open = renderToStaticMarkup(<UnifiedCompassLink row={LEAD} neoRegisteredLeadIds={new Set(["L9"])} />)
    expect(open).toContain('aria-label="가나학원 Compass에서 열기 (새 탭)"')
  })

  it("소스 계약 — 원천은 리드 보드와 같은 라우트이고, 그 라우트는 360 과 같은 external_account 확정 집합이다", () => {
    const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")
    expect(read("components/admin/crm/leads/LeadsBoardClient.tsx")).toContain(`"${UNIFIED_NEO_REGISTERED_ENDPOINT}"`)
    expect(read("app/api/admin/crm/leads/neo-registered/route.ts")).toContain("listConfirmedLeadNeoAccountLinks")
    const repo = read("lib/repositories/crm-source-links.ts")
    const scan = repo.match(/export async function listConfirmedLeadNeoAccountLinks[\s\S]*?\n\}/)?.[0] ?? ""
    expect(scan, "listConfirmedLeadNeoAccountLinks 를 찾지 못함").toBeTruthy()
    expect(scan).toContain('.eq("target_type", "external_account")')
    expect(scan).toContain('.eq("status", "confirmed")')
    expect(scan).not.toContain("external_lead")
  })

  it("소스 계약 — 결과 섹션은 원천을 한 번 읽어 데스크톱 셀·모바일 카드 두 링크에 모두 넘긴다", () => {
    const section = readFileSync(join(process.cwd(), "components/admin/crm/unified/CustomerResultsSection.tsx"), "utf8")
    expect(count(section, "useUnifiedNeoRegisteredLeadIds(")).toBe(1)
    expect(section).toContain("rows.some(unifiedRowNeedsNeoRegistration)")
    expect(count(section, "<UnifiedCompassLink")).toBe(2)
    expect(count(section, "neoRegisteredLeadIds={neoRegisteredLeadIds}")).toBe(2)
  })
})

describe("소스 계약 — 폴백 문구는 저장소가 converted 에만 주는 statusLabel 과 같다", () => {
  const repository = readFileSync(join(process.cwd(), "lib/repositories/crm-unified-customers.ts"), "utf8")

  it("leadStatusLabel 은 converted 에만 UNIFIED_LEAD_CONVERTED_STATUS_LABEL 을 준다", () => {
    const body = repository.match(/function leadStatusLabel\(lead: LeadRecord\) \{([\s\S]*?)\n\}/)?.[1]
    expect(body, "leadStatusLabel 을 찾지 못함 — 폴백 판정 근거를 다시 확인하세요").toBeTruthy()
    expect(body).toContain(`if (lead.status === "converted") return "${UNIFIED_LEAD_CONVERTED_STATUS_LABEL}"`)
    expect(count(body ?? "", `"${UNIFIED_LEAD_CONVERTED_STATUS_LABEL}"`)).toBe(1)
  })
})
