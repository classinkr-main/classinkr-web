import { describe, expect, it } from "vitest"

import {
  LEAD_SEGMENTS,
  LEAD_SEGMENT_IDS,
  LEADS_BOARD_PATH,
  countLeadSegments,
  isLeadSegmentId,
  isMetaAdLead,
  leadSegment,
  leadSegmentHref,
  matchesLeadSegment,
  readLeadSegmentParam,
  resolveLeadSegments,
} from "@/lib/crm/lead-segments"
import type { CompassOverlayEntry } from "@/lib/compass/overlay"
import type { LeadRecord } from "@/lib/repositories/leads"

// 세그먼트 SSOT(lib/crm/lead-segments.ts, 읽기 전용) 계약 테스트 — S1/S2가 그대로 가져다 쓴다.
// 정책 근거: docs/active/crm-tab-develop-plan-2026-09-12.md §13.2 "세그먼트 정의".

function lead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: overrides.id ?? "l1",
    source: overrides.source ?? "contact_page",
    timestamp: overrides.timestamp ?? "2026-09-01T00:00:00.000Z",
    status: overrides.status ?? "new",
    ...overrides,
  } as LeadRecord
}

function overlayEntry(overrides: Partial<CompassOverlayEntry> = {}): CompassOverlayEntry {
  return {
    compassLeadId: 1,
    academy: "테스트학원",
    name: "김원장",
    stage: null,
    careStage: null,
    owner: null,
    caller: null,
    bdOwner: null,
    nextActionAt: null,
    demoAt: null,
    neocrmRegisteredAt: null,
    lastInflowAt: null,
    url: "https://mkt.classin.co.kr/leads/1",
    ...overrides,
  }
}

describe("LEAD_SEGMENTS 정의", () => {
  it("정확히 5개, all이 첫 번째, id가 유일하다", () => {
    expect(LEAD_SEGMENTS).toHaveLength(5)
    expect(LEAD_SEGMENTS[0].id).toBe("all")
    expect(new Set(LEAD_SEGMENT_IDS).size).toBe(5)
  })

  it("인계·기존만 Compass가 필요하다", () => {
    const needsCompass = LEAD_SEGMENTS.filter((s) => s.needsCompass).map((s) => s.id)
    expect(needsCompass.sort()).toEqual(["bd_handover", "existing"])
  })

  it("isLeadSegmentId / leadSegment", () => {
    expect(isLeadSegmentId("meta_ads")).toBe(true)
    expect(isLeadSegmentId("won")).toBe(false)
    expect(isLeadSegmentId(undefined)).toBe(false)
    expect(leadSegment("customer").label).toBe("고객")
    // 모르는 id는 조용히 all로 떨어진다(방어적 fallback).
    expect(leadSegment("nope" as never).id).toBe("all")
  })
})

describe("readLeadSegmentParam", () => {
  it("유효한 값은 그대로, 나머지는 all로 떨어진다", () => {
    expect(readLeadSegmentParam("meta_ads")).toBe("meta_ads")
    expect(readLeadSegmentParam("bd_handover")).toBe("bd_handover")
    expect(readLeadSegmentParam("existing")).toBe("existing")
    expect(readLeadSegmentParam("customer")).toBe("customer")
    expect(readLeadSegmentParam("all")).toBe("all")
    expect(readLeadSegmentParam(null)).toBe("all")
    expect(readLeadSegmentParam(undefined)).toBe("all")
    expect(readLeadSegmentParam("won")).toBe("all")
    expect(readLeadSegmentParam("")).toBe("all")
  })
})

describe("leadSegmentHref", () => {
  it("all은 파라미터를 붙이지 않는다 — 기본값은 URL에서 제외", () => {
    expect(leadSegmentHref("all")).toBe(LEADS_BOARD_PATH)
  })

  it("그 외 세그먼트는 ?segment=를 붙인다", () => {
    expect(leadSegmentHref("meta_ads")).toBe(`${LEADS_BOARD_PATH}?segment=meta_ads`)
    expect(leadSegmentHref("bd_handover")).toBe(`${LEADS_BOARD_PATH}?segment=bd_handover`)
  })

  it("추가 파라미터와 병기된다", () => {
    const href = leadSegmentHref("customer", { owner: "kim" })
    expect(href).toContain("segment=customer")
    expect(href).toContain("owner=kim")
    expect(leadSegmentHref("all", { owner: "kim" })).toBe(`${LEADS_BOARD_PATH}?owner=kim`)
  })
})

describe("isMetaAdLead", () => {
  it("source가 meta_lead_ads면 참", () => {
    expect(isMetaAdLead(lead({ source: "meta_lead_ads" }))).toBe(true)
  })

  it("fbclid 흔적만 있어도 참", () => {
    expect(isMetaAdLead(lead({ source: "contact_page", fbclid: "abc123" }))).toBe(true)
  })

  it("Meta 계열 utm_source(대소문자 무관)도 참", () => {
    for (const utm of ["meta", "Facebook", "FB", "instagram", "IG"]) {
      expect(isMetaAdLead(lead({ source: "admin_manual", utm_source: utm }))).toBe(true)
    }
  })

  it("신호가 없으면 거짓", () => {
    expect(isMetaAdLead(lead({ source: "contact_page" }))).toBe(false)
    expect(isMetaAdLead(lead({ source: "channel_talk", utm_source: "naver" }))).toBe(false)
  })
})

describe("resolveLeadSegments / matchesLeadSegment", () => {
  it("아무 신호 없는 리드는 all만 갖는다", () => {
    const segments = resolveLeadSegments(lead())
    expect(segments.has("all")).toBe(true)
    expect(segments.size).toBe(1)
  })

  it("메타 광고 리드는 meta_ads도 갖는다", () => {
    const segments = resolveLeadSegments(lead({ source: "meta_lead_ads" }))
    expect([...segments].sort()).toEqual(["all", "meta_ads"])
  })

  it("전환(converted) 리드는 customer를 갖는다", () => {
    expect(matchesLeadSegment(lead({ status: "converted" }), "customer")).toBe(true)
    expect(matchesLeadSegment(lead({ status: "new" }), "customer")).toBe(false)
  })

  it("Compass 단계 bd는 existing과 bd_handover를 함께 켠다", () => {
    const ctx = { overlay: overlayEntry({ stage: "bd" }) }
    const segments = resolveLeadSegments(lead(), ctx)
    expect(segments.has("existing")).toBe(true)
    expect(segments.has("bd_handover")).toBe(true)
    expect(matchesLeadSegment(lead(), "bd_handover", ctx)).toBe(true)
  })

  it("BD 담당만 지정돼도 인계로 친다(단계가 비어도)", () => {
    const ctx = { overlay: overlayEntry({ stage: null, bdOwner: "박매니저" }) }
    expect(matchesLeadSegment(lead(), "bd_handover", ctx)).toBe(true)
  })

  it("결제(won) 단계는 existing과 customer는 켜지만 bd_handover는 켜지 않는다", () => {
    const ctx = { overlay: overlayEntry({ stage: "won", bdOwner: "박매니저" }) }
    const segments = resolveLeadSegments(lead(), ctx)
    expect(segments.has("existing")).toBe(true)
    expect(segments.has("customer")).toBe(true)
    expect(segments.has("bd_handover")).toBe(false)
  })

  it("이탈(lost) 단계는 existing만 켠다 — 인계·고객 아님", () => {
    const ctx = { overlay: overlayEntry({ stage: "lost", bdOwner: "박매니저" }) }
    const segments = resolveLeadSegments(lead(), ctx)
    expect(segments.has("existing")).toBe(true)
    expect(segments.has("bd_handover")).toBe(false)
    expect(segments.has("customer")).toBe(false)
  })

  it("Compass 매칭만 있고 단계 신호가 없어도 existing은 켠다(재유입 등록만으로도)", () => {
    const ctx = { overlay: overlayEntry({ stage: null }) }
    expect(matchesLeadSegment(lead(), "existing", ctx)).toBe(true)
    expect(matchesLeadSegment(lead(), "bd_handover", ctx)).toBe(false)
  })

  it("compassDown이면 overlay가 있어도 existing·bd_handover를 켜지 않는다", () => {
    const ctx = { overlay: overlayEntry({ stage: "bd" }), compassDown: true }
    const segments = resolveLeadSegments(lead(), ctx)
    expect(segments.has("existing")).toBe(false)
    expect(segments.has("bd_handover")).toBe(false)
    expect(segments.has("all")).toBe(true)
  })

  it("한 리드가 여러 세그먼트에 동시에 속할 수 있다", () => {
    const ctx = { overlay: overlayEntry({ stage: "bd" }) }
    const segments = resolveLeadSegments(lead({ source: "meta_lead_ads" }), ctx)
    expect([...segments].sort()).toEqual(["all", "bd_handover", "existing", "meta_ads"])
  })

  it("all 세그먼트는 항상 참이다", () => {
    expect(matchesLeadSegment(lead(), "all")).toBe(true)
  })
})

describe("countLeadSegments", () => {
  const leads = [
    lead({ id: "meta", source: "meta_lead_ads" }),
    lead({ id: "converted", status: "converted" }),
    lead({ id: "plain" }),
  ]
  const lookup = (target: LeadRecord): CompassOverlayEntry | undefined => {
    if (target.id === "plain") return overlayEntry({ stage: "bd" })
    return undefined
  }

  it("한 번의 순회로 세그먼트별 건수를 낸다", () => {
    const counts = countLeadSegments(leads, lookup, false)
    expect(counts.all).toBe(3)
    expect(counts.meta_ads).toBe(1)
    // plain 리드가 Compass bd 매칭이라 existing·bd_handover에 1건씩 잡힌다.
    expect(counts.existing).toBe(1)
    expect(counts.bd_handover).toBe(1)
    expect(counts.customer).toBe(1)
  })

  it("Compass 끊김이면 인계·기존은 0이 아니라 null(연결 끊김)이다", () => {
    const counts = countLeadSegments(leads, lookup, true)
    expect(counts.bd_handover).toBeNull()
    expect(counts.existing).toBeNull()
    // Compass와 무관한 세그먼트는 계속 정확히 센다.
    expect(counts.all).toBe(3)
    expect(counts.meta_ads).toBe(1)
    expect(counts.customer).toBe(1)
  })

  it("빈 리드 목록은 전부 0(다운이 아니면)", () => {
    const counts = countLeadSegments([], lookup, false)
    expect(counts).toEqual({ all: 0, meta_ads: 0, bd_handover: 0, existing: 0, customer: 0 })
  })
})
