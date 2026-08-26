import { describe, expect, it } from "vitest"

import {
  countBySourceGroup,
  filterNewLeads,
  kstDateKey,
  resolveLeadDateRange,
} from "@/lib/marketing/new-leads"
import type { LeadRecord } from "@/lib/repositories/leads"

function makeLead(patch: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: patch.id ?? "lead-1",
    source: "contact_page",
    status: "new",
    timestamp: "2026-08-20T03:00:00.000Z",
    ...patch,
  } as LeadRecord
}

describe("kstDateKey", () => {
  it("UTC 시각을 KST 일자로 접는다 — 자정 직전 UTC는 다음 날이다", () => {
    // 2026-08-25 15:30 UTC = 2026-08-26 00:30 KST. UTC 일자로 자르면 하루 밀린다.
    expect(kstDateKey("2026-08-25T15:30:00.000Z")).toBe("2026-08-26")
    expect(kstDateKey("2026-08-25T14:59:00.000Z")).toBe("2026-08-25")
  })

  it("깨진 timestamp 는 null — 임의 일자를 만들지 않는다", () => {
    expect(kstDateKey("not-a-date")).toBeNull()
    expect(kstDateKey("")).toBeNull()
  })
})

describe("resolveLeadDateRange", () => {
  it("프리셋은 오늘을 끝점으로 하는 inclusive 구간이다", () => {
    expect(resolveLeadDateRange("7d", null, "2026-08-26")).toEqual({
      since: "2026-08-20",
      until: "2026-08-26",
    })
    expect(resolveLeadDateRange("30d", null, "2026-08-26")).toEqual({
      since: "2026-07-28",
      until: "2026-08-26",
    })
    expect(resolveLeadDateRange("90d", null, "2026-08-26")).toEqual({
      since: "2026-05-29",
      until: "2026-08-26",
    })
  })

  it("커스텀 범위는 양끝을 그대로 쓴다(하루짜리 포함)", () => {
    expect(
      resolveLeadDateRange("custom", { from: "2026-08-01", to: "2026-08-15" }, "2026-08-26")
    ).toEqual({ since: "2026-08-01", until: "2026-08-15" })
    expect(
      resolveLeadDateRange("custom", { from: "2026-08-03", to: "2026-08-03" }, "2026-08-26")
    ).toEqual({ since: "2026-08-03", until: "2026-08-03" })
  })

  it("시작이 종료보다 뒤이거나 형식이 깨진 커스텀은 null — 호출부가 직전 유효 범위를 유지한다", () => {
    expect(
      resolveLeadDateRange("custom", { from: "2026-08-20", to: "2026-08-01" }, "2026-08-26")
    ).toBeNull()
    expect(resolveLeadDateRange("custom", { from: "2026-08-20", to: "" }, "2026-08-26")).toBeNull()
    expect(resolveLeadDateRange("custom", null, "2026-08-26")).toBeNull()
    expect(
      resolveLeadDateRange("custom", { from: "20260820", to: "2026-08-21" }, "2026-08-26")
    ).toBeNull()
  })
})

describe("filterNewLeads", () => {
  const range = { since: "2026-08-01", until: "2026-08-10" }

  it("커스텀 범위의 양끝 일자를 포함한다(KST 기준)", () => {
    const leads = [
      makeLead({ id: "start", timestamp: "2026-07-31T15:00:00.000Z" }), // KST 08-01 00:00
      makeLead({ id: "end", timestamp: "2026-08-10T14:59:00.000Z" }), // KST 08-10 23:59
      makeLead({ id: "before", timestamp: "2026-07-31T14:00:00.000Z" }), // KST 07-31
      makeLead({ id: "after", timestamp: "2026-08-10T15:00:00.000Z" }), // KST 08-11
    ]
    expect(filterNewLeads(leads, range).map((lead) => lead.id)).toEqual(["end", "start"])
  })

  it("테스트 리드는 범위 안이어도 제외한다", () => {
    const leads = [
      makeLead({ id: "real", timestamp: "2026-08-05T03:00:00.000Z" }),
      makeLead({ id: "meta-test", timestamp: "2026-08-05T03:00:00.000Z", email: "test@meta.com" }),
      makeLead({ id: "e2e", timestamp: "2026-08-05T03:00:00.000Z", email: "test+abc@classin.com" }),
      makeLead({ id: "dummy", timestamp: "2026-08-05T03:00:00.000Z", name: "<test lead: dummy>" }),
    ]
    expect(filterNewLeads(leads, range).map((lead) => lead.id)).toEqual(["real"])
  })

  it("깨진 timestamp 는 조용히 제외한다(1970년으로 떨어뜨리지 않는다)", () => {
    const leads = [
      makeLead({ id: "ok", timestamp: "2026-08-05T03:00:00.000Z" }),
      makeLead({ id: "broken", timestamp: "언젠가" }),
      makeLead({ id: "empty", timestamp: "" }),
    ]
    expect(filterNewLeads(leads, range).map((lead) => lead.id)).toEqual(["ok"])
  })

  it("소스 그룹 필터는 선택한 묶음만 남기고, 비어 있으면 전체다", () => {
    const leads = [
      makeLead({ id: "meta", source: "meta_lead_ads", timestamp: "2026-08-05T03:00:00.000Z" }),
      makeLead({ id: "home", source: "demo_modal", timestamp: "2026-08-05T03:00:00.000Z" }),
      makeLead({ id: "news", source: "newsletter", timestamp: "2026-08-05T03:00:00.000Z" }),
    ]
    expect(filterNewLeads(leads, { ...range, groups: ["meta"] }).map((l) => l.id)).toEqual(["meta"])
    expect(
      filterNewLeads(leads, { ...range, groups: ["meta", "newsletter"] }).map((l) => l.id).sort()
    ).toEqual(["meta", "news"])
    expect(filterNewLeads(leads, { ...range, groups: [] })).toHaveLength(3)
  })

  it("검색은 공백 구분 AND 토큰이다 — 두 조건을 모두 만족해야 남는다", () => {
    const leads = [
      makeLead({ id: "both", org: "강남 수학학원", size: "300", timestamp: "2026-08-05T03:00:00.000Z" }),
      makeLead({ id: "one", org: "강남 영어학원", size: "50", timestamp: "2026-08-05T03:00:00.000Z" }),
    ]
    expect(filterNewLeads(leads, { ...range, query: "강남 300" }).map((l) => l.id)).toEqual(["both"])
    expect(filterNewLeads(leads, { ...range, query: "강남" })).toHaveLength(2)
    expect(filterNewLeads(leads, { ...range, query: "   " })).toHaveLength(2)
  })

  it("검색은 Meta 광고명(구버전 message 표기 포함)까지 훑는다", () => {
    const leads = [
      makeLead({
        id: "ad",
        source: "meta_lead_ads",
        message: "campaign=8월전자칠판\nad=업그레이드소재A",
        timestamp: "2026-08-05T03:00:00.000Z",
      }),
      makeLead({ id: "plain", timestamp: "2026-08-05T03:00:00.000Z" }),
    ]
    expect(filterNewLeads(leads, { ...range, query: "업그레이드소재A" }).map((l) => l.id)).toEqual(["ad"])
  })

  it("미연락만 보기는 status 가 new 인 리드만 남긴다", () => {
    const leads = [
      makeLead({ id: "new", status: "new", timestamp: "2026-08-05T03:00:00.000Z" }),
      makeLead({ id: "contacted", status: "contacted", timestamp: "2026-08-05T03:00:00.000Z" }),
      makeLead({ id: "converted", status: "converted", timestamp: "2026-08-05T03:00:00.000Z" }),
    ]
    expect(filterNewLeads(leads, { ...range, onlyUncontacted: true }).map((l) => l.id)).toEqual(["new"])
    expect(filterNewLeads(leads, { ...range, onlyUncontacted: false })).toHaveLength(3)
  })

  it("반환은 최신 유입순이다", () => {
    const leads = [
      makeLead({ id: "old", timestamp: "2026-08-02T03:00:00.000Z" }),
      makeLead({ id: "newest", timestamp: "2026-08-09T03:00:00.000Z" }),
      makeLead({ id: "mid", timestamp: "2026-08-05T03:00:00.000Z" }),
    ]
    expect(filterNewLeads(leads, range).map((lead) => lead.id)).toEqual(["newest", "mid", "old"])
  })
})

describe("countBySourceGroup", () => {
  it("7개 그룹 키를 항상 채운다 — 0건 그룹도 null 이 아니라 0으로 보인다", () => {
    const counts = countBySourceGroup([
      makeLead({ id: "a", source: "meta_lead_ads" }),
      makeLead({ id: "b", source: "meta_lead_ads" }),
      makeLead({ id: "c", source: "demo_modal" }),
      // 매핑에 없는 source 는 수기·기타로 흡수된다(칩에서 리드가 새지 않게).
      makeLead({ id: "d", source: "무언가_새_채널" }),
    ])
    expect(counts).toEqual({
      meta: 2,
      homepage: 1,
      resources: 0,
      newsletter: 0,
      channel_talk: 0,
      chatbot: 0,
      manual_etc: 1,
    })
  })

  it("빈 배열이면 전 그룹 0", () => {
    expect(Object.values(countBySourceGroup([])).every((count) => count === 0)).toBe(true)
  })
})
