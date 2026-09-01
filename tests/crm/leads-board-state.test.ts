import { describe, expect, it } from "vitest"

import {
  BOARD_COLUMN_KEYS,
  CONFIRMATION_GATE_EXEMPT_FILTERS,
  LEADS_VIEW_DEFAULT,
  appliesAcrossBoardColumns,
  applyLeadsViewParam,
  daysBetween,
  hoursBetween,
  isActiveLead,
  isUnconfirmedLead,
  isUnrespondedLead,
  partitionLeadsToBoardColumns,
  readLeadsView,
  resolveBoardColumn,
  resolveBoardColumnFocus,
  matchesLeadScopeFilters,
  selectScopedUnconfirmedLeads,
  toFollowUpTimestamp,
  toLocalDateKey,
  type LeadFilter,
  type LeadScopeCriteria,
} from "@/lib/crm/leads-board-state"
import type { LeadRecord } from "@/lib/repositories/leads"

const NOW = new Date("2026-08-20T05:22:00.000Z")

function lead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: overrides.id ?? "l1",
    source: overrides.source ?? "contact_page", // RESPONSE_TARGET_SOURCES 안쪽
    timestamp: overrides.timestamp ?? "2026-08-19T00:00:00.000Z",
    status: overrides.status ?? "new",
    ...overrides,
  } as LeadRecord
}

describe("보드 컬럼 분배", () => {
  it("확인 게이트는 활성 리드에만 걸린다 — 전환·종료는 confirmed_at 이 비어도 자기 컬럼에 남는다", () => {
    // 게이트를 무조건 앞세우면 전환 리드가 미확인 컬럼으로 빨려 들어가 전환 수가 사라진다.
    expect(resolveBoardColumn(lead({ status: "new" }))).toBe("unconfirmed")
    expect(resolveBoardColumn(lead({ status: "contacted" }))).toBe("unconfirmed")
    expect(resolveBoardColumn(lead({ status: "converted" }))).toBe("converted")
    expect(resolveBoardColumn(lead({ status: "closed" }))).toBe("closed")
  })

  it("확인된 리드는 상태 그대로 간다", () => {
    const confirmed = { confirmed_at: "2026-08-19T01:00:00.000Z" } as Partial<LeadRecord>
    expect(resolveBoardColumn(lead({ ...confirmed, status: "new" }))).toBe("new")
    expect(resolveBoardColumn(lead({ ...confirmed, status: "contacted" }))).toBe("contacted")
  })

  it("모든 컬럼 키가 존재하고 입력 순서를 지킨다", () => {
    const rows = [
      lead({ id: "a", status: "new", confirmed_at: "2026-08-19T01:00:00.000Z" } as Partial<LeadRecord>),
      lead({ id: "b", status: "new" }),
      lead({ id: "c", status: "new", confirmed_at: "2026-08-19T01:00:00.000Z" } as Partial<LeadRecord>),
    ]
    const columns = partitionLeadsToBoardColumns(rows)
    expect(Object.keys(columns).sort()).toEqual([...BOARD_COLUMN_KEYS].sort())
    expect(columns.new.map((l) => l.id)).toEqual(["a", "c"])
    expect(columns.unconfirmed.map((l) => l.id)).toEqual(["b"])
    expect(columns.converted).toEqual([])
  })
})

describe("필터 축 — 컬럼 포커스 vs 가로지르기", () => {
  it("상태와 같은 축인 키는 포커스로 강등되고 컬럼을 가로지르지 않는다", () => {
    for (const filter of ["unconfirmed", "new", "contacted", "converted", "closed"] as LeadFilter[]) {
      expect(resolveBoardColumnFocus(filter)).toBe(filter)
      expect(appliesAcrossBoardColumns(filter)).toBe(false)
    }
  })

  it("all 은 아무것도 포커스하지 않고 가로지르지도 않는다", () => {
    expect(resolveBoardColumnFocus("all")).toBeNull()
    expect(appliesAcrossBoardColumns("all")).toBe(false)
  })

  it("시간·배정 필터는 직교라 컬럼을 가로질러 AND로 걸린다", () => {
    for (const filter of [
      "unresponded", "unresponded_24h", "unresponded_48h", "unassigned",
    ] as LeadFilter[]) {
      expect(resolveBoardColumnFocus(filter)).toBeNull()
      expect(appliesAcrossBoardColumns(filter)).toBe(true)
    }
  })

  it("확인 게이트 면제 필터는 '응대·확인이 필요하다'가 관점인 4종뿐이다", () => {
    expect([...CONFIRMATION_GATE_EXEMPT_FILTERS].sort()).toEqual([
      "unconfirmed", "unresponded", "unresponded_24h", "unresponded_48h",
    ])
  })
})

describe("뷰 축", () => {
  it("모르는 값은 콘솔로 떨어진다", () => {
    expect(readLeadsView("board")).toBe("board")
    expect(readLeadsView("console")).toBe("console")
    expect(readLeadsView(null)).toBe(LEADS_VIEW_DEFAULT)
    expect(readLeadsView("kanban")).toBe(LEADS_VIEW_DEFAULT)
  })

  it("기본값(콘솔)은 URL에서 지운다 — ?view= 없이 열리는 것이 정상 주소다", () => {
    const url = new URL("https://classin.kr/admin/crm/customers/leads?view=board&filter=new")
    applyLeadsViewParam(url, "console")
    expect(url.search).toBe("?filter=new")

    applyLeadsViewParam(url, "board")
    expect(url.searchParams.get("view")).toBe("board")
    expect(url.searchParams.get("filter")).toBe("new")
  })
})

describe("리드 술어", () => {
  it("미응대는 status=new 이면서 응대 대상 유입일 때만 참이다", () => {
    expect(isUnrespondedLead(lead({ status: "new", source: "contact_page" }))).toBe(true)
    // 연락중으로 넘어가는 순간 이 큐에서 빠진다 — 보드에서 연락중 컬럼이 0이 되는 근거.
    expect(isUnrespondedLead(lead({ status: "contacted", source: "contact_page" }))).toBe(false)
    // 뉴스레터처럼 응대 대상이 아닌 유입은 신규여도 미응대가 아니다.
    expect(isUnrespondedLead(lead({ status: "new", source: "newsletter" }))).toBe(false)
    expect(isUnrespondedLead(lead({ email: "test@meta.com" }))).toBe(false)
  })

  it("활성은 전환·종료가 아닌 것", () => {
    expect(isActiveLead("new")).toBe(true)
    expect(isActiveLead("contacted")).toBe(true)
    expect(isActiveLead("converted")).toBe(false)
    expect(isActiveLead("closed")).toBe(false)
  })

  it("미확인은 confirmed_at 부재 하나로 판정한다", () => {
    expect(isUnconfirmedLead(lead())).toBe(true)
    expect(isUnconfirmedLead(lead({ confirmed_at: "2026-08-19T00:00:00.000Z" } as Partial<LeadRecord>))).toBe(false)
  })
})

describe("시간 헬퍼", () => {
  it("경과는 음수로 내려가지 않는다 — 미래 타임스탬프는 0", () => {
    expect(hoursBetween("2026-08-19T05:22:00.000Z", NOW)).toBe(24)
    expect(daysBetween("2026-08-18T05:22:00.000Z", NOW)).toBe(2)
    expect(hoursBetween("2026-08-25T00:00:00.000Z", NOW)).toBe(0)
    expect(daysBetween("2026-08-25T00:00:00.000Z", NOW)).toBe(0)
  })

  it("팔로업은 정오로 고정한다 — 자정이면 타임존에 따라 하루 밀린다", () => {
    expect(toFollowUpTimestamp("2026-08-26")).toBe("2026-08-26T12:00:00.000Z")
  })

  it("날짜 키는 로컬 기준으로 뽑는다", () => {
    const local = new Date(2026, 7, 20, 23, 30) // 로컬 8/20 23:30
    expect(toLocalDateKey(local)).toBe("2026-08-20")
  })
})


describe("범위 필터 (상태와 직교하는 축)", () => {
  const ANY: LeadScopeCriteria = {
    sourceGroup: "all",
    sourceDetail: "all",
    channelSource: "",
    leadMagnet: "all",
    trackingDimension: "channel",
    trackingKey: null,
    searchTokens: [],
  }

  it("아무 축도 안 걸면 전부 통과한다", () => {
    expect(matchesLeadScopeFilters(lead({ source: "meta_lead_ads" }), ANY)).toBe(true)
  })

  it("유입 그룹 축은 소스가 아니라 그룹으로 판정한다 — 데모 모달도 홈페이지다", () => {
    const criteria = { ...ANY, sourceGroup: "homepage" as const }
    expect(matchesLeadScopeFilters(lead({ source: "contact_page" }), criteria)).toBe(true)
    expect(matchesLeadScopeFilters(lead({ source: "demo_modal" }), criteria)).toBe(true)
    expect(matchesLeadScopeFilters(lead({ source: "meta_lead_ads" }), criteria)).toBe(false)
  })

  it("skipSourceGroup 은 유입 축만 뺀다 — 칩 패싯 카운트가 자기 축에 갇히지 않게", () => {
    const criteria = { ...ANY, sourceGroup: "homepage" as const, channelSource: "meta_lead_ads" }
    const metaLead = lead({ source: "meta_lead_ads" })
    expect(matchesLeadScopeFilters(metaLead, criteria)).toBe(false)
    expect(matchesLeadScopeFilters(metaLead, criteria, { skipSourceGroup: true })).toBe(true)
  })

  it("skipTracking 은 트래킹 축만 뺀다", () => {
    const criteria = { ...ANY, trackingDimension: "channel" as const, trackingKey: "없는채널" }
    const l = lead({ source: "contact_page" })
    expect(matchesLeadScopeFilters(l, criteria)).toBe(false)
    expect(matchesLeadScopeFilters(l, criteria, { skipTracking: true })).toBe(true)
  })

  it("채널·마그넷 축은 그대로 원본 값으로 판정한다", () => {
    expect(matchesLeadScopeFilters(lead({ source: "newsletter" }), { ...ANY, channelSource: "newsletter" })).toBe(true)
    expect(matchesLeadScopeFilters(lead({ source: "newsletter" }), { ...ANY, channelSource: "contact_page" })).toBe(false)
    const magnetLead = lead({ lead_magnet: "omo-guide" } as Partial<LeadRecord>)
    expect(matchesLeadScopeFilters(magnetLead, { ...ANY, leadMagnet: "omo-guide" })).toBe(true)
    expect(matchesLeadScopeFilters(magnetLead, { ...ANY, leadMagnet: "다른자료" })).toBe(false)
  })
})

describe("미확인 수신함 모집단", () => {
  const ANY: LeadScopeCriteria = {
    sourceGroup: "all",
    sourceDetail: "all",
    channelSource: "",
    leadMagnet: "all",
    trackingDimension: "channel",
    trackingKey: null,
    searchTokens: [],
  }
  const confirmed = { confirmed_at: "2026-08-19T01:00:00.000Z" } as Partial<LeadRecord>

  it("확인된 리드는 빠진다", () => {
    const leads = [lead({ id: "a" }), lead({ id: "b", ...confirmed })]
    expect(selectScopedUnconfirmedLeads(leads, ANY).map((l) => l.id)).toEqual(["a"])
  })

  it("화면에 걸린 범위 필터를 그대로 따른다 — 배지 숫자가 목록과 어긋나지 않게", () => {
    // 실측 재현: 홈페이지 유입만 보는 화면인데 배지가 광고 리드까지 세어 160을 말했다.
    const leads = [
      lead({ id: "home", source: "contact_page" }),
      lead({ id: "ad-1", source: "meta_lead_ads" }),
      lead({ id: "ad-2", source: "meta_lead_ads" }),
    ]
    expect(selectScopedUnconfirmedLeads(leads, ANY)).toHaveLength(3)
    expect(
      selectScopedUnconfirmedLeads(leads, { ...ANY, sourceGroup: "homepage" }).map((l) => l.id)
    ).toEqual(["home"])
  })

  it("상태 축은 적용하지 않는다 — 미확인은 상태와 직교한 큐다", () => {
    const leads = [lead({ id: "n", status: "new" }), lead({ id: "c", status: "contacted" })]
    expect(selectScopedUnconfirmedLeads(leads, ANY).map((l) => l.id)).toEqual(["n", "c"])
  })
})
