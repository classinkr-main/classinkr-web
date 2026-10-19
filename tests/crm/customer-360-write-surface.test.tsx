/**
 * A안(2026-09-25) "기록은 Compass에서" — 고객 360(드로어·상세)·기록 탭·리드 목록의 기록 위치 표면.
 * DOM 환경이 없어 presentational 컴포넌트의 정적 마크업 + 순수 함수 + 소스 계약으로 고정한다
 * (드로어는 마운트 뒤 fetch 로 데이터를 받아 renderToStaticMarkup 으로 Compass 모드를 재현할 수 없다).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/crm/customers/lead%3Alead-1",
  useParams: () => ({ key: "lead:lead-1" }),
}))

import { activityPanelDescription } from "@/components/admin/crm/Customer360DetailActivity"
import Customer360DetailClient, { detailWriteSurface } from "@/components/admin/crm/Customer360DetailClient"
import { leadFocus360Url } from "@/components/admin/crm/CrmActivityClient"
import C360WriteSurfaceBar, {
  C360_HOME_COMPOSER_ID,
  CompassDownWriteCaption,
  HomeOnlyCaption,
} from "@/components/admin/crm/drawer/C360WriteSurfaceBar"
import DrawerActivitySection from "@/components/admin/crm/drawer/DrawerActivitySection"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"

const HREF = "https://mkt.classin.co.kr/leads?open=77"

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

function make360(overrides: Partial<Customer360> & { source?: Customer360["source"] } = {}): Customer360 {
  const source = overrides.source ?? "lead"
  const key = source === "lead" ? "lead:lead-1" : "neo:acc-9"
  return {
    generatedAt: "2026-09-25T03:00:00.000Z",
    key,
    source,
    entityId: source === "lead" ? "lead-1" : "acc-9",
    found: true,
    health: { ok: true, warnings: [] },
    header: {
      key,
      source,
      sourceLabel: source === "lead" ? "리드" : "고객",
      name: "큰학원",
      statusLabel: null,
      ownerName: "이매니저",
      ownerKeys: [],
      region: null,
      score: null,
      priorityReason: null,
      nextActionLabel: null,
      createdAt: null,
      updatedAt: null,
    },
    contacts: { phone: null, email: null, message: null, extra: [] },
    money: {
      available: false,
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
    },
    productSummary: { matched: false },
    origin: null,
    crmRegistered: false,
    neoAccountId: null,
    leadStatus: source === "lead" ? "contacted" : null,
    risk: { severity: "low", reasons: [], overdueTaskCount: 0, riskEventCount: 0, nearestExpireAt: null, totalBalance: null },
    serviceRisk: null,
    activity: {
      generatedAt: "2026-09-25T03:00:00.000Z",
      health: { ok: true, message: null },
      summary: { total: 0, returned: 0, recordings: 0, risks: 0, openNextActions: 0 },
      pagination: { limit: 20, offset: 0, returned: 0, total: 0, hasMore: false, nextOffset: null },
      rows: [],
    },
    linkedLeads: { leadIds: [], truncated: false, mergedCount: 0, down: false },
    compass: { leadIds: [77], href: HREF, entries: [], down: false, nextActionAts: [] },
    tasks: { summary: { total: 0 }, rows: [] },
    deals: { summary: { total: 0 }, rows: [], pagination: { hasMore: false } },
    tags: [],
    ...overrides,
  } as unknown as Customer360
}

describe("C360WriteSurfaceBar — 기록은 Compass에서 바", () => {
  it("접힌 상태: 안내 + 'Home에 따로 남기기' 토글(aria-expanded=false, aria-controls=Home 컴포저)", () => {
    const html = renderToStaticMarkup(<C360WriteSurfaceBar name="큰학원" open={false} onToggle={() => undefined} />)
    expect(html).toContain("기록은 Compass에서")
    expect(html).toContain("콜·문자·미팅은 Compass에 남기면 마지막 연락·타임라인에 반영됩니다.")
    expect(html).toContain(">Home에 따로 남기기<")
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain(`aria-controls="${C360_HOME_COMPOSER_ID}"`)
    expect(C360_HOME_COMPOSER_ID).toBe("c360-home-composer")
    // 모바일은 세로로 쌓고 토글은 전체 폭.
    expect(html).toContain("flex-col")
    expect(html).toContain("w-full")
    // 드로어 안에서는 주 링크를 헤더가 그린다 — 바에는 링크가 없다.
    expect(html).not.toContain("<a ")
  })

  it("펼친 상태는 '접기', 작성 중(canCollapse=false)이면 접기를 내놓지 않는다", () => {
    const open = renderToStaticMarkup(<C360WriteSurfaceBar open onToggle={() => undefined} />)
    expect(open).toContain(">접기<")
    expect(open).toContain('aria-expanded="true"')

    const dirty = renderToStaticMarkup(<C360WriteSurfaceBar open canCollapse={false} onToggle={() => undefined} />)
    expect(dirty).not.toContain("접기")
    expect(dirty).not.toContain("<button")
  })

  it("기록 탭(standalone·showOpenLink): Compass 새 탭 링크를 함께 그리고 44px 터치 타깃을 직접 준다", () => {
    const html = renderToStaticMarkup(
      <C360WriteSurfaceBar compassHref={HREF} name="큰학원" showOpenLink standalone testId="crm-activity-write-surface-bar" />
    )
    expect(html).toContain(`href="${HREF}"`)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('aria-label="큰학원 Compass에서 열기 (새 탭)"')
    expect(html).toContain('data-testid="crm-activity-write-surface-bar-open-compass"')
    expect(html).toContain("min-h-11")
    // CTA 채움은 Classin Green, 파랑 금지.
    expect(html).toContain("bg-[#084734]")
    expect(html).not.toContain("#2F5D8C")
  })

  it("캡션 — Home 전용 저장 사실(중립색)과 Compass 끊김(경고색)", () => {
    const homeOnly = renderToStaticMarkup(<HomeOnlyCaption />)
    expect(homeOnly).toContain("Home에만 저장됩니다 — Compass 담당자에게는 보이지 않습니다.")
    expect(homeOnly).not.toMatch(/bg-\[#/)
    const down = renderToStaticMarkup(<CompassDownWriteCaption />)
    expect(down).toContain("Compass 연결 끊김")
    expect(down).toContain("text-[#A8741A]")
  })
})

describe("고객 360 상세 — 헤더 Compass 링크·활동 탭 안내", () => {
  it("Compass 에 매칭된 리드: 헤더 주 행동이 'Compass에서 열기'(새 탭)", () => {
    const html = renderToStaticMarkup(<Customer360DetailClient data={make360()} customerKey="lead:lead-1" />)
    expect(html).toContain('data-testid="c360-detail-open-compass"')
    expect(html).toContain(`href="${HREF}"`)
    expect(html).toContain("Compass에서 열기")
    expect(html).not.toContain("c360-detail-compass-record")
    // 원본 화면 링크는 그대로 남는다.
    expect(html).toContain("원본 화면")
  })

  it("NEO 계정·전환 리드: 주 링크 없이 보조 'Compass 기록' 링크", () => {
    const neo = renderToStaticMarkup(
      <Customer360DetailClient data={make360({ source: "neo_account" })} customerKey="neo:acc-9" />
    )
    expect(neo).not.toContain("c360-detail-open-compass")
    expect(neo).toContain('data-testid="c360-detail-compass-record"')
    expect(neo).toContain("Compass 기록")

    const converted = renderToStaticMarkup(
      <Customer360DetailClient data={make360({ leadStatus: "converted" })} customerKey="lead:lead-1" />
    )
    expect(converted).not.toContain("c360-detail-open-compass")
    expect(converted).toContain("c360-detail-compass-record")
  })

  it("Compass 매칭이 없으면 링크를 지어내지 않는다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailClient
        data={make360({ compass: { leadIds: [], href: null, entries: [], down: false, nextActionAts: [] } })}
        customerKey="lead:lead-1"
      />
    )
    expect(html).not.toContain("mkt.classin.co.kr")
  })

  it("detailWriteSurface 는 360 페이로드로 판정하고, 옛 페이로드(leadStatus 없음)도 깨지지 않는다", () => {
    expect(detailWriteSurface(make360()).surface).toBe("compass")
    expect(detailWriteSurface(make360({ source: "neo_account" })).reason).toBe("neo_account")
    const legacy = make360()
    delete (legacy as { leadStatus?: unknown }).leadStatus
    expect(detailWriteSurface(legacy).surface).toBe("compass")
    expect(detailWriteSurface(make360({ crmRegistered: true })).reason).toBe("converted_lead")
  })

  it("활동 탭 설명 — Compass 리드는 '기록은 Compass에서', 기본값은 기존 문구 그대로", () => {
    expect(activityPanelDescription({ compassCount: 0, leadEraCount: 0, linkedLeadCount: 0, writeSurface: "compass" })).toBe(
      "회의록 · 통화 · 메모 타임라인 (읽기 전용 — 기록은 Compass에서)"
    )
    expect(activityPanelDescription({ compassCount: 2, leadEraCount: 0, linkedLeadCount: 0, writeSurface: "compass" })).toBe(
      "회의록 · 통화 · 메모 타임라인 · Compass 2건 병합 (읽기 전용 · 기록은 Compass에서)"
    )
    expect(activityPanelDescription({ compassCount: 0, leadEraCount: 0, linkedLeadCount: 0, writeSurface: "home" })).toBe(
      "회의록 · 통화 · 메모 타임라인 (읽기 전용 — 기록 생성은 드로어에서)"
    )
  })
})

describe("드로어 활동 섹션 — Compass 링크 문구", () => {
  function renderSection(data: Customer360) {
    return renderToStaticMarkup(
      <DrawerActivitySection
        data={data}
        activityTab="timeline"
        onActivityTabChange={() => undefined}
        activitySource="all"
        onActivitySourceChange={() => undefined}
        feedRows={[]}
        mergedActivity={[]}
        eventsExpanded={false}
        eventsLoading={false}
        onLoadMoreEvents={() => undefined}
        targetType={data.source}
        entityId={data.entityId}
      />
    )
  }

  it("Compass 리드는 'Compass에서 열기', NEO 계정은 보조 'Compass 기록' — 공용 링크(파랑 없음)", () => {
    const lead = renderSection(make360())
    expect(lead).toContain('data-testid="c360-activity-compass-link"')
    expect(lead).toContain(">Compass에서 열기<")
    expect(lead).not.toContain("#2F5D8C")

    const neo = renderSection(make360({ source: "neo_account" }))
    expect(neo).toContain(">Compass 기록<")
  })
})

describe("소스 계약 — 드로어·리드 드로어·기록 탭·리드 목록", () => {
  it("360 드로어: 컴포저는 한 곳·같은 트리 위치에 hidden 으로만 감추고, 작성 중이면 숨기지 않는다", () => {
    const source = read("components/admin/crm/Customer360Drawer.tsx")
    expect((source.match(/<ActivityQuickForm/g) ?? []).length).toBe(1)
    expect(source).toContain("key={customerKey}")
    expect(source).toContain("id={C360_HOME_COMPOSER_ID} hidden={!composerVisible}")
    expect(source).toContain("const composerVisible = !compassPrimary || homeComposerOpen || composerDirty")
    // 작성을 시작하면 펼친 채로 둔다 + 고객 전환 시 리셋.
    expect(source).toContain("if (dirty) setHomeComposerOpen(true)")
    expect(source).toContain("setHomeComposerOpen(false)")
    // hidden 요소는 포커스를 받지 못한다 — 먼저 펼치고 다음 프레임에서 포커스.
    expect(source).toContain("requestAnimationFrame(() => document.getElementById(COMPOSER_BODY_ID)?.focus())")
    // 주 행동·보조 링크 테스트 id.
    expect(source).toContain('testId="c360-open-compass"')
    expect(source).toContain('testId="c360-compass-record"')
    // 기존 접근성 계약은 그대로.
    expect(source).toContain("aria-busy={loading || eventsLoading || tagBusy || neoLinkBusy || actingId !== null}")
  })

  it("리드 보드 → 리드 드로어: 목록 칩과 같은 오버레이·NEO 등록 집합을 넘긴다(드로어용 추가 fetch 없음)", () => {
    const board = read("components/admin/crm/leads/LeadsBoardClient.tsx")
    expect(board).toContain("initialContactForm={contactDraft?.leadId === selected.id}")
    expect(board).toContain("compassEntry={compass.down ? null : (compass.lookup(selected) ?? null)}")
    expect(board).toContain("compassDown={compass.down}")
    // 딥링크 자동 열림은 오버레이·NEO 등록 집합 조회가 모두 끝난 뒤 한 번만 정한다.
    expect(board).toContain("compassLoading={compass.loading || neoRegistered.loading}")
    expect(board).toContain("crmRegistered={neoRegistered.has(selected.id)}")
  })

  it("리드 목록: 판정이 compass 인 리드만 '연락 기록' 알약·Home 폼 열기 대신 Compass 링크(공용 판정)", () => {
    const list = read("components/admin/crm/leads/board/LeadsConsoleList.tsx")
    expect(list).toContain('lead.status === "new" && !isTestLead(lead) && !compassPrimary && (')
    expect(list).toContain('if (!compassPrimary) onContactAction(lead, "call")')
    expect(list).toContain('if (!compassPrimary) onContactAction(lead, "email")')
    expect(list).toContain('testId="lead-card-open-compass"')
    expect(list).toContain('testId="lead-card-compass-record"')
    expect(list).not.toContain("!compassEntry")
  })

  it("기록 탭: 리드 포커스면 드로어와 같은 360 캐시 키로 판정해 안내 바를 둔다", () => {
    const source = read("components/admin/crm/CrmActivityClient.tsx")
    expect(source).toContain('focusTargetId && focusTargetType === "lead"')
    expect(source).toContain("<LeadFocusWriteSurface")
    // 드로어 load URL(`/api/admin/crm/customers/${encodeURIComponent(customerKey)}/360`)과 같은 키.
    expect(leadFocus360Url("lead-1")).toBe(`/api/admin/crm/customers/${encodeURIComponent("lead:lead-1")}/360`)
    const drawer = read("components/admin/crm/Customer360Drawer.tsx")
    expect(drawer).toContain("`/api/admin/crm/customers/${encodeURIComponent(customerKey)}/360`")
  })
})
