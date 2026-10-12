/**
 * A안(2026-09-25) "기록은 Compass에서" — 리드 보드(목록 카드·데스크톱 알약·리드 드로어)가 고객 360 과 같은 공용 판정
 * (lib/crm/write-surface resolveLeadBoardWriteSurface)을 쓰는지 고정한다.
 *
 * 리뷰 회귀(2026-09-25):
 *  - 목록이 compassEntry 존재만 보고 전환 리드도 "Compass에서 열기"를 주 행동으로 내놓아 드로어(Home 정본)와 갈렸다.
 *  - 리드 드로어 판정에 crmRegistered 가 없어, 360 에서 'NEO 등록 연결'만 한(상태 미전환) Compass 리드를
 *    360 은 Home, 리드 드로어는 Compass 로 반대 판정했다.
 * DOM 환경이 없어 정적 마크업 + 라우트 핸들러 + 소스 계약으로 잡는다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  listConfirmedLeadNeoAccountLinks: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/crm/customers/leads",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["crm-staff-roles"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))
vi.mock("@/lib/repositories/crm-source-links", () => ({
  listConfirmedLeadNeoAccountLinks: mocks.listConfirmedLeadNeoAccountLinks,
}))

import LeadDrawer from "@/components/admin/crm/leads/board/LeadDrawer"
import LeadsConsoleList from "@/components/admin/crm/leads/board/LeadsConsoleList"
import { resolveLeadBoardWriteSurface } from "@/lib/crm/write-surface"
import type { CompassOverlayEntry } from "@/lib/compass/overlay"
import type { LeadRecord } from "@/lib/repositories/leads"

const HREF = "https://mkt.classin.co.kr/leads?open=77"

const compassEntry: CompassOverlayEntry = {
  compassLeadId: 77,
  academy: "테스트 학원",
  name: "홍길동",
  stage: "contact",
  careStage: null,
  owner: null,
  caller: "진소망",
  bdOwner: null,
  nextActionAt: null,
  demoAt: null,
  neocrmRegisteredAt: null,
  lastInflowAt: null,
  url: HREF,
}

function makeLead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: "lead-1",
    name: "홍길동",
    email: "hong@example.com",
    phone: "010-1234-5678",
    org: "큰학원",
    source: "homepage",
    status: "new",
    timestamp: "2026-09-10T09:00:00.000Z",
    confirmed_at: "2026-09-10T09:05:00.000Z",
    assigned_to: "owner-a",
    ...overrides,
  } as unknown as LeadRecord
}

function renderList(
  lead: LeadRecord,
  options: { entry?: CompassOverlayEntry | undefined; registered?: string[]; compassDown?: boolean } = {}
) {
  const registered = new Set(options.registered ?? [])
  return renderToStaticMarkup(
    <LeadsConsoleList
      filtered={[lead]}
      totalLeadCount={1}
      loading={false}
      loadError={null}
      visibleLeadCount={10}
      canMoreLeads={false}
      canCollapseLeads={false}
      onShowMore={() => undefined}
      onCollapse={() => undefined}
      selectedId={undefined}
      selectedLeadIds={new Set()}
      deletingIds={new Set()}
      convertingIds={new Set()}
      activitySummary={{}}
      priorityMap={new Map()}
      today="2026-09-25"
      now={new Date("2026-09-25T03:00:00.000Z")}
      compassLookup={() => ("entry" in options ? options.entry : compassEntry)}
      compassDown={options.compassDown}
      isCrmRegistered={(leadId) => registered.has(leadId)}
      allVisibleSelected={false}
      selectedVisibleCount={0}
      visibleIds={[lead.id]}
      onSelect={() => undefined}
      onToggleLeadSelection={() => undefined}
      onToggleVisibleSelection={() => undefined}
      onDelete={() => undefined}
      onConvert={() => undefined}
      onContactAction={() => undefined}
      onRetry={() => undefined}
      onOpenLeadModal={() => undefined}
      onResetAllFilters={() => undefined}
    />
  )
}

function renderDrawer(overrides: Partial<Parameters<typeof LeadDrawer>[0]> = {}) {
  const noop = async () => undefined
  return renderToStaticMarkup(
    <LeadDrawer
      lead={makeLead()}
      logs={[]}
      logsLoading={false}
      events={[]}
      activity={null}
      activityLoading={false}
      crmOwners={[] as never}
      crmOwnerHealth={{ ok: true, message: null }}
      onClose={() => undefined}
      onStatusChange={noop}
      onNotesChange={noop}
      onFollowUpChange={noop}
      onAssignedToChange={noop}
      onDelete={noop}
      onAddLog={noop}
      onDeleteLog={noop}
      onConvert={noop}
      onConfirm={noop}
      {...overrides}
    />
  )
}

const PRIMARY_CALL_CLASS = "rounded-md bg-[#084734] px-3 text-[12px] font-medium text-white"
const PILL_TITLE = 'title="상세에서 연락 기록 남기기"'

describe("resolveLeadBoardWriteSurface — 목록·드로어 공용 입력", () => {
  it("Compass 매칭 리드(단계 무관)는 compass, 전환·NEO 등록 확정은 Home 정본 + 보조 링크", () => {
    expect(resolveLeadBoardWriteSurface({ leadStatus: "new", compassHref: HREF })).toEqual({
      surface: "compass",
      reason: "compass_lead",
      compassHref: HREF,
      secondaryCompassHref: null,
    })
    expect(resolveLeadBoardWriteSurface({ leadStatus: "converted", compassHref: HREF })).toEqual({
      surface: "home",
      reason: "converted_lead",
      compassHref: HREF,
      secondaryCompassHref: HREF,
    })
    expect(
      resolveLeadBoardWriteSurface({ leadStatus: "contacted", compassHref: HREF, crmRegistered: true })
    ).toMatchObject({ surface: "home", reason: "converted_lead", secondaryCompassHref: HREF })
  })

  it("매칭 없음·끊김은 Home(끊김은 사유로 구분), 입력이 비어도 깨지지 않는다", () => {
    expect(resolveLeadBoardWriteSurface({ leadStatus: "new", compassHref: null })).toMatchObject({
      surface: "home",
      reason: "no_compass_match",
    })
    expect(resolveLeadBoardWriteSurface({ leadStatus: "new", compassHref: undefined, compassDown: true })).toMatchObject({
      surface: "home",
      reason: "compass_down",
    })
    expect(resolveLeadBoardWriteSurface({ leadStatus: null, compassHref: HREF }).surface).toBe("compass")
  })
})

describe("리드 목록 — 공용 판정으로 모바일 카드·데스크톱 알약을 정한다", () => {
  it("Compass 리드(new): 카드 주 행동이 'Compass에서 열기', Call 은 보조, 알약 없음", () => {
    const html = renderList(makeLead())
    expect(html).toContain('data-testid="lead-card-open-compass"')
    expect(html).toContain(`href="${HREF}"`)
    expect(html).not.toContain(PRIMARY_CALL_CLASS)
    expect(html).not.toContain(PILL_TITLE)
    expect(html).not.toContain("lead-card-compass-record")
  })

  it("회귀 — 전환 리드 + Compass 매칭: 드로어와 같이 Home 정본(Call 이 주 행동), Compass 는 보조 'Compass 기록'", () => {
    const html = renderList(makeLead({ status: "converted" }))
    expect(html).not.toContain("lead-card-open-compass")
    expect(html).toContain(PRIMARY_CALL_CLASS)
    expect(html).toContain('data-testid="lead-card-compass-record"')
    expect(html).toContain(">Compass 기록<")
    // 같은 리드의 드로어 판정과 일치한다.
    const drawer = renderDrawer({ lead: makeLead({ status: "converted" }), compassEntry })
    expect(drawer).not.toContain("lead-drawer-open-compass")
    expect(drawer).toContain(">연락 추가<")
  })

  it("회귀 — NEO 등록 확정(상태 new 그대로) + Compass 매칭: Home 정본, 데스크톱 '연락 기록' 알약이 남는다", () => {
    const html = renderList(makeLead(), { registered: ["lead-1"] })
    expect(html).not.toContain("lead-card-open-compass")
    expect(html).toContain(PRIMARY_CALL_CLASS)
    expect(html).toContain(PILL_TITLE)
    expect(html).toContain("lead-card-compass-record")
  })

  it("Compass 매칭 없는 리드는 지금 그대로 — Call 주 행동·알약, Compass 링크 없음(끊김이어도 같다)", () => {
    for (const compassDown of [false, true]) {
      const html = renderList(makeLead(), { entry: undefined, compassDown })
      expect(html).toContain(PRIMARY_CALL_CLASS)
      expect(html).toContain(PILL_TITLE)
      expect(html).not.toContain("mkt.classin.co.kr")
    }
  })
})

describe("리드 드로어 — crmRegistered 를 360 과 같이 판정에 넣는다", () => {
  it("회귀 — 360 에서 NEO 등록 연결만 한(status=contacted) Compass 리드: Home '연락 추가'가 주 행동, 주 Compass 링크 없음", () => {
    const html = renderDrawer({ lead: makeLead({ status: "contacted" }), compassEntry, crmRegistered: true })
    expect(html).not.toContain("lead-drawer-open-compass")
    expect(html).not.toContain("Home에 따로 남기기")
    expect(html).not.toContain('data-testid="lead-drawer-home-only"')
    expect(html).toContain(">연락 추가<")
    // 헤더 Compass 상태 칩(링크)은 병기로 남는다.
    expect(html).toContain("Compass 컨택")
  })

  it("회귀 — 같은 리드의 ?action=contact 딥링크는 Home 연락 폼을 연다(Compass 판정으로 막히지 않는다)", () => {
    const html = renderDrawer({
      lead: makeLead({ status: "contacted" }),
      compassEntry,
      crmRegistered: true,
      initialContactForm: true,
    })
    expect(html).toContain('aria-label="연락 기록 저장"')
  })

  it("등록 여부 조회 중(compassLoading)에는 딥링크 자동 열림을 미룬다", () => {
    const html = renderDrawer({ compassEntry: null, compassLoading: true, initialContactForm: true })
    expect(html).not.toContain('aria-label="연락 기록 저장"')
  })

  it("미등록 Compass 리드는 여전히 Compass 정본", () => {
    const html = renderDrawer({ lead: makeLead({ status: "contacted" }), compassEntry, crmRegistered: false })
    expect(html).toContain('data-testid="lead-drawer-open-compass"')
    expect(html).toContain("Home에 따로 남기기")
  })
})

describe("GET /api/admin/crm/leads/neo-registered — 360 crmRegistered 와 같은 원천", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireVerifiedAdminContext.mockResolvedValue({ userId: "admin-1" })
  })

  it("CRM 역할로 가드하고, 확정 계정 링크의 리드 id 를 정렬해 내려준다", async () => {
    mocks.listConfirmedLeadNeoAccountLinks.mockResolvedValue(
      new Map([
        ["lead-b", "acc-2"],
        ["lead-a", "acc-1"],
      ])
    )
    const { GET } = await import("@/app/api/admin/crm/leads/neo-registered/route")
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/leads/neo-registered"))
    expect(mocks.requireVerifiedAdminContext).toHaveBeenCalledWith(expect.anything(), ["crm-staff-roles"])
    expect(response.status).toBe(200)
    const body = (await response.json()) as { leadIds: string[]; generatedAt: string }
    expect(body.leadIds).toEqual(["lead-a", "lead-b"])
    expect(typeof body.generatedAt).toBe("string")
    expect(response.headers.get("Cache-Control")).toContain("private")
  })

  it("조회 실패는 500 — 빈 목록을 정상 응답으로 위장하지 않는다", async () => {
    mocks.listConfirmedLeadNeoAccountLinks.mockRejectedValue(new Error("boom"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { GET } = await import("@/app/api/admin/crm/leads/neo-registered/route")
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/leads/neo-registered"))
    expect(response.status).toBe(500)
    expect(response.headers.get("Cache-Control")).toBeNull()
    errorSpy.mockRestore()
  })

  it("가드가 거부하면 그대로 돌려준다(조회하지 않는다)", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }))
    const { GET } = await import("@/app/api/admin/crm/leads/neo-registered/route")
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/leads/neo-registered"))
    expect(response.status).toBe(403)
    expect(mocks.listConfirmedLeadNeoAccountLinks).not.toHaveBeenCalled()
  })
})

describe("소스 계약 — 보드가 같은 판정 입력을 목록·드로어에 넘긴다", () => {
  const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8")

  it("리드 보드: NEO 등록 집합을 한 번 읽어 목록·드로어에 같은 값으로 넘기고, 딥링크는 두 조회가 끝난 뒤 정한다", () => {
    const board = read("components/admin/crm/leads/LeadsBoardClient.tsx")
    expect(board).toContain('adminFetchJson<{ leadIds?: unknown }>("/api/admin/crm/leads/neo-registered")')
    expect(board).toContain("isCrmRegistered={neoRegistered.has}")
    expect(board).toContain("compassDown={compass.down}")
    expect(board).toContain("crmRegistered={neoRegistered.has(selected.id)}")
    expect(board).toContain("compassLoading={compass.loading || neoRegistered.loading}")
  })

  it("목록·드로어 모두 공용 resolveLeadBoardWriteSurface 로 판정한다(compassEntry 존재만으로 가르지 않는다)", () => {
    const list = read("components/admin/crm/leads/board/LeadsConsoleList.tsx")
    expect((list.match(/resolveLeadBoardWriteSurface\(/g) ?? []).length).toBe(2)
    expect(list).not.toContain("!compassEntry")
    expect(list).toContain('lead.status === "new" && !isTestLead(lead) && !compassPrimary && (')
    const drawer = read("components/admin/crm/leads/board/LeadDrawer.tsx")
    expect(drawer).toContain("resolveLeadBoardWriteSurface({")
    expect(drawer).toContain("crmRegistered,")
    expect(drawer).not.toContain("resolveCrmWriteSurface(")
  })
})
