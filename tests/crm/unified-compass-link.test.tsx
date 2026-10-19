/**
 * 통합 고객 화면 A안(2026-09-25) — "Compass에서 열기"(행 링크) · NEO 동기화 경고 띠 장착 · OR 조건 안내.
 * DOM 테스트 환경이 없어 renderToStaticMarkup + 순수 함수 + 소스 문자열 계약으로 고정한다.
 * (저장소가 row.compass 를 채우는 규칙 — 접기 승계·Compass down 이면 null — 은 저장소 쪽 테스트 소관.)
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import CustomerResultsSection from "@/components/admin/crm/unified/CustomerResultsSection"
import SegmentOrNotice, {
  SEGMENT_OR_NOTICE_TITLE,
  describeOrGroupsForNotice,
} from "@/components/admin/crm/unified/SegmentOrNotice"
import UnifiedCompassLink, {
  UNIFIED_COMPASS_RECORD_LABEL,
  unifiedCompassLeadId,
  unifiedCompassLinkLabel,
} from "@/components/admin/crm/unified/UnifiedCompassLink"
import ContactSourceCaption, {
  CAPTION_COMPASS_ACTIVITY_DOWN,
  CAPTION_COMPASS_BOTH_DOWN,
  CAPTION_COMPASS_PARTIAL,
  CAPTION_COMPASS_REFS_DOWN,
  CAPTION_HOME_CONTACT_DETAIL_DOWN,
  contactSourceCaptionLines,
} from "@/components/admin/crm/unified/ContactSourceCaption"
import {
  exportUrl,
  listUrl,
  parseOrGroupsParam,
  patchUnifiedListParams,
  segmentParamSignature,
  type CrmUnifiedCustomers,
} from "@/components/admin/crm/unified/shared"
import { COMPASS_OPEN_LABEL } from "@/components/admin/compass/CompassOpenLink"
import { compassLeadUrl } from "@/lib/compass/normalize"
import { describeSegmentSpec } from "@/lib/crm/customer-segment-spec"
import type { CrmUnifiedCustomerRow } from "@/lib/repositories/crm-unified-customers"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const GENERATED_AT = "2026-09-25T03:00:00.000Z"

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
    nextActionLabel: "첫 연락",
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
    ...partial,
  }
}

function data(rows: CrmUnifiedCustomerRow[]): CrmUnifiedCustomers {
  return {
    generatedAt: GENERATED_AT,
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

const COMPASS = { leadId: 123, url: compassLeadUrl(123), stageLabel: "데모" }

function count(html: string, needle: string) {
  return html.split(needle).length - 1
}

describe("UnifiedCompassLink — 매칭이 있을 때만 새 탭 링크", () => {
  it("문구: 리드는 주 행동 'Compass에서 열기', 계정·전환 고객은 'Compass 기록', 매칭이 없으면 null", () => {
    expect(unifiedCompassLinkLabel({ source: "lead", compass: COMPASS })).toBe(COMPASS_OPEN_LABEL)
    expect(unifiedCompassLinkLabel({ source: "neo_account", compass: COMPASS })).toBe(UNIFIED_COMPASS_RECORD_LABEL)
    expect(unifiedCompassLinkLabel({ source: "customer", compass: COMPASS })).toBe(UNIFIED_COMPASS_RECORD_LABEL)
    expect(unifiedCompassLinkLabel({ source: "lead", compass: null })).toBeNull()
    expect(unifiedCompassLinkLabel({ source: "lead" })).toBeNull()
    // 링크를 만들 수 없는 id 는 매칭 없음과 같다.
    expect(unifiedCompassLeadId({ compass: { ...COMPASS, leadId: 0 } })).toBeNull()
    expect(unifiedCompassLeadId({ compass: { ...COMPASS, leadId: Number.NaN } })).toBeNull()
  })

  it("href 는 compassLeadUrl(id) 하나 — 새 탭·noopener, 누구의 기록인지 라벨, 단계 캡션", () => {
    const html = renderToStaticMarkup(<UnifiedCompassLink row={row({ compass: COMPASS })} />)
    expect(html).toContain(`href="${compassLeadUrl(123)}"`)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('aria-label="가나학원 Compass에서 열기 (새 탭)"')
    expect(html).toContain("· 데모")
  })

  it("응답의 compass.url 문자열을 href 로 그대로 싣지 않는다(id 로 다시 만든다)", () => {
    const html = renderToStaticMarkup(
      <UnifiedCompassLink row={row({ compass: { leadId: 7, url: "javascript:alert(1)", stageLabel: null } })} />
    )
    expect(html).not.toContain("javascript:")
    expect(html).toContain(`href="${compassLeadUrl(7)}"`)
  })

  it("매칭이 없으면(Compass 끊김 포함) 아무것도 그리지 않는다", () => {
    expect(renderToStaticMarkup(<UnifiedCompassLink row={row({ compass: null })} />)).toBe("")
    expect(renderToStaticMarkup(<UnifiedCompassLink row={row({})} />)).toBe("")
  })

  it("조상이 button 인 자리(interactive=false)에서는 a 없이 표시만", () => {
    const html = renderToStaticMarkup(<UnifiedCompassLink row={row({ compass: COMPASS })} interactive={false} />)
    expect(html).not.toContain("<a")
    expect(html).toContain(COMPASS_OPEN_LABEL)
  })
})

describe("결과 표 — Compass 매칭 행에만 링크(데스크톱 셀 + 모바일 카드)", () => {
  it("매칭된 리드 행은 데스크톱·모바일에 한 번씩, 매칭 없는 행은 없음", () => {
    const html = renderResults([
      row({ key: "lead:1", compass: COMPASS }),
      row({ key: "lead:2", name: "다라학원", compass: null }),
    ])
    expect(count(html, 'data-testid="unified-compass-open"')).toBe(2)
    expect(count(html, `href="${compassLeadUrl(123)}"`)).toBe(2)
    expect(html).not.toContain("다라학원 Compass에서 열기")
  })

  it("모바일 카드는 본문이 pointer-events-none 이라 링크만 되살린다(카드 버튼은 형제 — 조상이 아니다)", () => {
    const html = renderResults([row({ compass: COMPASS })])
    expect(html).toMatch(/data-testid="unified-compass-open" class="[^"]*pointer-events-auto relative z-20/)
    // a 는 button 안에 들어가지 않는다.
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*unified-compass-open/)
  })

  it("계정 행은 'Compass 기록' 문구로", () => {
    const html = renderResults([
      row({ key: "neo:A", source: "neo_account", sourceLabel: "고객", lifecycle: "active_account", compass: COMPASS }),
    ])
    expect(html).toContain('aria-label="가나학원 Compass 기록 (새 탭)"')
  })
})

describe("원천 캡션 — Compass 리드 참조만 끊겨도 '연결 끊김'(매칭 없음과 구분, 2026-09-25 리뷰 P2)", () => {
  it("활동 ok · 참조 down → 링크를 표시하지 못한다는 캡션(활동만 보던 예전 판정은 아무것도 안 그렸다)", () => {
    expect(contactSourceCaptionLines({ compass: "ok", homeContactDetail: "ok", compassRefs: "down" })).toEqual([
      CAPTION_COMPASS_REFS_DOWN,
    ])
    expect(CAPTION_COMPASS_REFS_DOWN).toBe("Compass 연결 끊김 — Compass 링크를 표시하지 못함")
    // 조회할 전화가 없던 활동(skipped)도 참조 끊김을 가리지 않는다.
    expect(contactSourceCaptionLines({ compass: "skipped", homeContactDetail: "ok", compassRefs: "down" })).toEqual([
      CAPTION_COMPASS_REFS_DOWN,
    ])
  })

  it("둘 다 끊기면 한 줄로 합치고, 활동만 끊기면 예전 문구 그대로", () => {
    expect(contactSourceCaptionLines({ compass: "down", homeContactDetail: "ok", compassRefs: "down" })).toEqual([
      CAPTION_COMPASS_BOTH_DOWN,
    ])
    expect(contactSourceCaptionLines({ compass: "down", homeContactDetail: "ok", compassRefs: "ok" })).toEqual([
      CAPTION_COMPASS_ACTIVITY_DOWN,
    ])
    expect(CAPTION_COMPASS_ACTIVITY_DOWN).toBe("Compass 연결 끊김 — 마지막 연락은 Home 기록만 반영")
  })

  it("겹친 사정은 줄을 나눠 전부 — 하나가 다른 하나를 가리지 않는다", () => {
    expect(contactSourceCaptionLines({ compass: "partial", homeContactDetail: "down", compassRefs: "down" })).toEqual([
      CAPTION_COMPASS_REFS_DOWN,
      CAPTION_COMPASS_PARTIAL,
      CAPTION_HOME_CONTACT_DETAIL_DOWN,
    ])
    expect(contactSourceCaptionLines({ compass: "down", homeContactDetail: "down" })).toEqual([
      CAPTION_COMPASS_ACTIVITY_DOWN,
      CAPTION_HOME_CONTACT_DETAIL_DOWN,
    ])
  })

  it("정상·모름(메타 없음·저장소가 아직 compassRefs 를 싣지 않음)이면 캡션 없음", () => {
    expect(contactSourceCaptionLines(undefined)).toEqual([])
    expect(contactSourceCaptionLines(null)).toEqual([])
    expect(contactSourceCaptionLines({ compass: "ok", homeContactDetail: "ok" })).toEqual([])
    expect(contactSourceCaptionLines({ compass: "ok", homeContactDetail: "ok", compassRefs: "ok" })).toEqual([])
    expect(renderToStaticMarkup(<ContactSourceCaption meta={{ compass: "ok", homeContactDetail: "ok" }} />)).toBe("")
  })

  it("렌더: role=status 한 덩어리에 줄마다 block — 경고 배너(role=alert)는 늘리지 않는다", () => {
    const html = renderToStaticMarkup(
      <ContactSourceCaption meta={{ compass: "partial", homeContactDetail: "ok", compassRefs: "down" }} className="mb-2" />
    )
    expect(count(html, 'role="status"')).toBe(1)
    expect(html).not.toContain('role="alert"')
    expect(html).toContain(`<span class="block">${CAPTION_COMPASS_REFS_DOWN}</span>`)
    expect(html).toContain(`<span class="block">${CAPTION_COMPASS_PARTIAL}</span>`)
  })

  it("리뷰 시나리오 — 활동 ok·참조 down 이면 모든 행이 링크 없이 그려지고, 캡션이 그 사실을 알린다", () => {
    // 저장소는 참조가 끊기면 모든 row.compass 를 null 로 둔다 — 행만으로는 '매칭 없음'과 같다.
    const rows = [row({ key: "lead:1", compass: null }), row({ key: "lead:2", name: "다라학원", compass: null })]
    const meta: NonNullable<CrmUnifiedCustomers["meta"]> = { compass: "ok", homeContactDetail: "ok", compassRefs: "down" }
    expect(renderResults(rows)).not.toContain('data-testid="unified-compass-open"')
    const caption = renderToStaticMarkup(<ContactSourceCaption meta={meta} />)
    expect(caption).toContain(CAPTION_COMPASS_REFS_DOWN)
  })

  it("소스 계약 — 목록 위 캡션은 ContactSourceCaption 하나가 응답 meta 전체로 판정한다(활동 상태만 보지 않는다)", () => {
    const clientSource = readFileSync(resolve(process.cwd(), "components/admin/crm/CrmUnifiedCustomersClient.tsx"), "utf8")
    expect(clientSource).toContain('import ContactSourceCaption from "./unified/ContactSourceCaption"')
    expect(clientSource).toMatch(/<ContactSourceCaption meta=\{data\?\.meta\}/)
    expect(clientSource).not.toContain('compassStatus === "down" ||')
    const linkSource = readFileSync(resolve(process.cwd(), "components/admin/crm/unified/UnifiedCompassLink.tsx"), "utf8")
    // 옛 주석의 틀린 가정("끊김은 기존 캡션이 알린다" — 활동 캡션은 참조 끊김을 몰랐다)을 되살리지 않는다.
    expect(linkSource).not.toContain("끊김은 목록 위 기존 캡션")
    expect(linkSource).toContain('meta.compassRefs === "down"')
  })
})

describe("OR 조건 안내 — 'OR 조건 포함 — 세그먼트 허브에서 편집'", () => {
  const groups = [{ risk: ["urgent" as const] }, { noContactDays: 60 }]

  it("그룹 문구 + 서버가 같은 그룹을 셌을 때만 건수", () => {
    const rows = describeOrGroupsForNotice(groups, { anyOf: [{ noContactDays: 60 }, { risk: ["urgent"] }], anyOfCounts: [9, 3] })
    expect(rows.map((item) => item.label)).toEqual([
      describeSegmentSpec({ risk: ["urgent"] }).join(" · "),
      describeSegmentSpec({ noContactDays: 60 }).join(" · "),
    ])
    expect(rows.map((item) => item.count)).toEqual([3, 9])
    // 응답이 아직 이전 조건(다른 그룹)이면 숫자를 붙이지 않는다.
    expect(describeOrGroupsForNotice(groups, { anyOf: [{ expDays: 30 }], anyOfCounts: [5] }).map((item) => item.count)).toEqual([
      null,
      null,
    ])
    // 길이가 어긋난 요약은 믿지 않는다.
    expect(describeOrGroupsForNotice(groups, { anyOf: groups, anyOfCounts: [1] }).map((item) => item.count)).toEqual([null, null])
  })

  it("제목·허브 링크·OR 빼기 버튼·결과 설명, 그룹이 없으면 아무것도 없음", () => {
    const html = renderToStaticMarkup(
      <SegmentOrNotice groups={groups} summary={{ anyOf: groups, anyOfCounts: [3, 9] }} total={11} onRemove={() => {}} />
    )
    expect(html).toContain(SEGMENT_OR_NOTICE_TITLE)
    expect(SEGMENT_OR_NOTICE_TITLE).toBe("OR 조건 포함 — 세그먼트 허브에서 편집")
    expect(html).toContain('href="/admin/crm/customers/segments"')
    expect(html).toContain("OR 조건 빼기")
    expect(html).toContain("위험 긴급")
    expect(html).toContain("3명")
    expect(html).toContain("결과 11명은")
    expect(html).not.toContain('role="alert"')
    expect(renderToStaticMarkup(<SegmentOrNotice groups={[]} total={0} onRemove={() => {}} />)).toBe("")
    expect(renderToStaticMarkup(<SegmentOrNotice groups={[{}]} total={0} onRemove={() => {}} />)).toBe("")
  })
})

describe("OR 그룹 URL 상태 — 목록·CSV 에 실어 보내고, AND 편집은 OR 을 건드리지 않는다", () => {
  const base = { query: "", source: "all" as const, lifecycle: "all" as const, owner: "", view: "all" as const, tag: "" }

  it("OR 그룹이 없거나 비면 기본 URL 그대로(프리페치 시드 불변)", () => {
    // base.owner 는 ""(전체) — 2026-10-16 기본 담당 계약이라 담당은 늘 실리고 전체는 `owner=` 다.
    const DEFAULT = "/api/admin/crm/customers/unified?limit=50&offset=0&owner="
    expect(listUrl({ ...base, offset: 0 })).toBe(DEFAULT)
    expect(listUrl({ ...base, orGroups: [], offset: 0 })).toBe(DEFAULT)
    expect(listUrl({ ...base, orGroups: [{}], offset: 0 })).toBe(DEFAULT)
  })

  it("목록·CSV URL 에 정규형 or= 를 반복해 싣는다(중복 제거·정렬)", () => {
    const orGroups = [{ risk: ["urgent" as const] }, { noContactDays: 60 }, { risk: ["urgent" as const] }]
    const list = new URL(listUrl({ ...base, segment: { expDays: 30 }, orGroups, offset: 0 }), "https://x")
    expect(list.searchParams.get("expDays")).toBe("30")
    expect(list.searchParams.getAll("or")).toEqual(["noContactDays=60", "risk=urgent"])
    const csv = new URL(exportUrl({ ...base, orGroups }), "https://x")
    expect(csv.searchParams.getAll("or")).toEqual(["noContactDays=60", "risk=urgent"])
  })

  it("화면 URL 에서 OR 그룹을 읽는다 — 빈 그룹·모르는 값은 버린다", () => {
    const params = new URLSearchParams("expDays=30&or=risk%3Durgent&or=nope%3D1&or=noContactDays%3D60")
    expect(parseOrGroupsParam(params)).toEqual([{ noContactDays: 60 }, { risk: ["urgent"] }])
    expect(parseOrGroupsParam(new URLSearchParams("expDays=30"))).toEqual([])
  })

  it("AND 조건 패치는 or= 를 그대로 두고, orGroups: [] 일 때만 지운다", () => {
    const current = "account=neo%3A1&expDays=30&or=risk%3Durgent"
    const andOnly = new URLSearchParams(patchUnifiedListParams(current, { segment: { noContactDays: 30 } }))
    expect(andOnly.getAll("or")).toEqual(["risk=urgent"])
    expect(andOnly.get("noContactDays")).toBe("30")
    expect(andOnly.has("expDays")).toBe(false)
    const cleared = new URLSearchParams(patchUnifiedListParams(current, { segment: {}, orGroups: [] }))
    expect(cleared.has("or")).toBe(false)
    expect(cleared.get("account")).toBe("neo:1")
  })

  it("조건 서명은 OR 까지 담는다 — OR 만 바뀐 딥링크도 착지 effect 가 알아챈다(OR 없으면 예전 문자열)", () => {
    expect(segmentParamSignature(new URLSearchParams("risk=soon&risk=urgent"))).toBe("risk=urgent&risk=soon")
    const withOr = segmentParamSignature(new URLSearchParams("expDays=30&or=risk%3Durgent"))
    expect(withOr).toContain("expDays=30")
    expect(new URLSearchParams(withOr).getAll("or")).toEqual(["risk=urgent"])
    expect(segmentParamSignature(new URLSearchParams("or=risk%3Durgent"))).not.toBe("")
  })
})

describe("소스 계약 — 페이지 경고 띠 장착 · OR 딥링크 프리페치 생략 · 클라이언트 OR 배선", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n")
  const pageSource = read("app/admin/crm/customers/unified/page.tsx")
  const clientSource = read("components/admin/crm/CrmUnifiedCustomersClient.tsx")

  it("page.tsx — NEO 동기화 경고 띠를 자체 Suspense 로 제목 아래 슬롯에 꽂는다", () => {
    expect(pageSource).toContain('import SyncHealthBannerServer from "@/components/admin/SyncHealthBannerServer"')
    expect(pageSource).toMatch(/syncHealthSlot=\{\s*<Suspense fallback=\{null\}>\s*<SyncHealthBannerServer sources=\{\["neo"\]\}/)
    expect(clientSource).toContain("{syncHealthSlot}")
  })

  it("page.tsx — OR 그룹 딥링크는 프리페치하지 않는다(AND 키 시드가 첫 요청과 어긋남)", () => {
    expect(pageSource).toContain("const initialData = segmentFilterHasOr(parseSegmentFilter(urlParams))")
    expect(pageSource).toMatch(/\?\s*null\s*:\s*await prefetchCrmUnifiedInitialData\(/)
  })

  it("클라이언트 — OR 그룹을 목록·CSV 요청에 싣고, 전체 초기화에서만 지우고, 안내를 그린다", () => {
    const loadStart = clientSource.indexOf("const loadPage = useCallback(")
    expect(clientSource.slice(loadStart, clientSource.indexOf("const cached =", loadStart))).toContain("orGroups,")
    const csvStart = clientSource.indexOf("const runCsvExport = useCallback(")
    expect(clientSource.slice(csvStart, clientSource.indexOf("setToast(", csvStart))).toContain("orGroups,")
    const resetStart = clientSource.indexOf("const resetFilters = useCallback(")
    expect(clientSource.slice(resetStart, clientSource.indexOf("setIncludeUnconfirmed(false)", resetStart))).toContain(
      "orGroups: []"
    )
    // 조건 칩(AND) 변경은 OR 을 건드리지 않는다.
    const changeStart = clientSource.indexOf("const changeSegment = useCallback(")
    expect(clientSource.slice(changeStart, clientSource.indexOf("[replaceListParams]", changeStart))).not.toContain("orGroups")
    expect(clientSource).toContain("<SegmentOrNotice")
    expect(clientSource).toContain("useState<CustomerSegmentSpec[]>(() => parseOrGroupsParam(searchParams))")
  })

  it("일괄 쓰기(태그·할 일)는 유지한다 — 세그먼트 허브·오늘 연락이 쓰는 행동", () => {
    expect(clientSource).toContain("<BulkActionBar")
  })
})
