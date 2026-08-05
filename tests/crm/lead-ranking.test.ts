import { describe, expect, it } from "vitest"

import {
  getLeadTrackingKey,
  hasTrackingSignal,
  isMarketingLead,
} from "@/lib/crm/lead-attribution"
import {
  EMPTY_LEAD_ENGAGEMENT,
  buildTrackingRollup,
  calcLeadPriority,
  matchesLeadSearch,
  parseLeadSize,
  scoreFrequency,
  scoreRecency,
  scoreResponse,
  scoreValue,
  sortLeads,
  tokenizeLeadSearch,
  type LeadEngagement,
} from "@/lib/crm/lead-ranking"
import type { LeadRecord } from "@/lib/repositories/leads"

const NOW = new Date("2026-08-05T03:00:00.000Z") // KST 2026-08-05 12:00
const NOW_MS = NOW.getTime()
const DAY_MS = 86_400_000

function makeLead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: overrides.id ?? "lead-1",
    source: "contact_page",
    timestamp: new Date(NOW_MS - DAY_MS).toISOString(),
    status: "new",
    confirmed_at: new Date(NOW_MS - DAY_MS).toISOString(),
    ...overrides,
  }
}

function makeEngagement(overrides: Partial<LeadEngagement> = {}): LeadEngagement {
  return { ...EMPTY_LEAD_ENGAGEMENT, providers: [], ...overrides }
}

describe("scoreRecency", () => {
  it("14일 반감기로 감쇠한다", () => {
    expect(scoreRecency(NOW_MS, NOW_MS)).toBe(100)
    expect(scoreRecency(NOW_MS - 14 * DAY_MS, NOW_MS)).toBe(50)
    expect(scoreRecency(NOW_MS - 28 * DAY_MS, NOW_MS)).toBe(25)
  })

  it("접점 자체가 없으면 0", () => {
    expect(scoreRecency(0, NOW_MS)).toBe(0)
  })

  it("시계 스큐로 미래 시각이 와도 100을 넘지 않는다", () => {
    expect(scoreRecency(NOW_MS + 5 * DAY_MS, NOW_MS)).toBe(100)
  })
})

describe("scoreFrequency", () => {
  it("접점이 없으면 0, 많을수록 로그로 오른다", () => {
    expect(scoreFrequency(makeEngagement())).toBe(0)
    const few = scoreFrequency(makeEngagement({ eventCount: 3 }))
    const many = scoreFrequency(makeEngagement({ eventCount: 30 }))
    expect(few).toBeGreaterThan(0)
    expect(many).toBeGreaterThan(few)
    expect(many).toBeLessThanOrEqual(100)
  })

  it("자료 다운로드·연락 기록을 단순 페이지뷰보다 무겁게 센다", () => {
    const pageViews = scoreFrequency(makeEngagement({ eventCount: 3 }))
    const downloads = scoreFrequency(makeEngagement({ downloadCount: 3 }))
    const contacts = scoreFrequency(makeEngagement({ contactLogCount: 3 }))
    expect(downloads).toBeGreaterThan(pageViews)
    expect(contacts).toBeGreaterThan(downloads)
  })
})

describe("parseLeadSize", () => {
  it("자유입력에서 첫 숫자만 뽑는다", () => {
    expect(parseLeadSize("300")).toBe(300)
    expect(parseLeadSize("약 1,200명")).toBe(1200)
    expect(parseLeadSize("300~500")).toBe(300)
    expect(parseLeadSize("모름")).toBe(0)
    expect(parseLeadSize(undefined)).toBe(0)
  })
})

describe("scoreValue", () => {
  it("규모가 클수록, 의도가 높은 유입일수록 매출에 가깝다", () => {
    const small = scoreValue(makeLead({ source: "newsletter", size: "20" }))
    const large = scoreValue(makeLead({ source: "demo_modal", size: "400", phone: "010-0000-0000", org: "테스트학원" }))
    expect(large).toBeGreaterThan(small)
    expect(large).toBeLessThanOrEqual(100)
  })

  it("연락 수단이 있으면 도달 가능성만큼 올라간다", () => {
    const base = makeLead({ source: "contact_page", size: "100" })
    expect(scoreValue({ ...base, phone: "010-1234-5678" })).toBeGreaterThan(scoreValue(base))
  })
})

describe("scoreResponse", () => {
  it("우리 연락 이후의 재방문을 가장 무겁게 센다", () => {
    const noReaction = scoreResponse(
      makeEngagement({
        contactLogCount: 3,
        lastContactAt: new Date(NOW_MS - 2 * DAY_MS).toISOString(),
      }),
      NOW_MS
    )
    const cameBack = scoreResponse(
      makeEngagement({
        contactLogCount: 3,
        lastContactAt: new Date(NOW_MS - 2 * DAY_MS).toISOString(),
        lastActivityAt: new Date(NOW_MS - DAY_MS).toISOString(),
      }),
      NOW_MS
    )
    expect(cameBack).toBeGreaterThan(noReaction)
  })

  it("우리가 아무리 많이 연락해도 그 자체는 반응이 아니다", () => {
    expect(scoreResponse(makeEngagement({ contactLogCount: 12 }), NOW_MS)).toBe(0)
  })

  it("오래된 반응은 식는다", () => {
    const build = (daysAgo: number) =>
      scoreResponse(
        makeEngagement({
          lastContactAt: new Date(NOW_MS - (daysAgo + 1) * DAY_MS).toISOString(),
          lastActivityAt: new Date(NOW_MS - daysAgo * DAY_MS).toISOString(),
        }),
        NOW_MS
      )
    expect(build(60)).toBeLessThan(build(1))
  })

  it("자료 수령·로그인 신원은 반응으로 가산된다", () => {
    expect(scoreResponse(makeEngagement({ downloadCount: 2 }), NOW_MS)).toBeGreaterThan(0)
    expect(scoreResponse(makeEngagement({ authenticated: true }), NOW_MS)).toBeGreaterThan(0)
    expect(scoreResponse(makeEngagement(), NOW_MS)).toBe(0)
  })
})

describe("calcLeadPriority", () => {
  it("자주·최근·주요가 겹친 리드가 오늘 들어온 저의도 리드보다 위에 선다", () => {
    const engagedWhale = calcLeadPriority(
      makeLead({
        id: "whale",
        source: "demo_modal",
        size: "400",
        org: "큰학원",
        phone: "010-1111-2222",
        status: "contacted",
        timestamp: new Date(NOW_MS - 40 * DAY_MS).toISOString(),
      }),
      makeEngagement({
        eventCount: 22,
        downloadCount: 4,
        contactLogCount: 3,
        authenticated: true,
        lastActivityAt: new Date(NOW_MS - 2 * DAY_MS).toISOString(),
      }),
      NOW_MS
    )
    const freshNewsletter = calcLeadPriority(
      makeLead({ id: "fresh", source: "newsletter", timestamp: new Date(NOW_MS - 3600_000).toISOString() }),
      makeEngagement(),
      NOW_MS
    )
    expect(engagedWhale.total).toBeGreaterThan(freshNewsletter.total)
  })

  it("미응답은 24~48시간에서 봉우리를 찍고 그 뒤로는 식는다", () => {
    const urgencyAfter = (hours: number) =>
      calcLeadPriority(
        makeLead({
          source: "contact_page",
          status: "new",
          timestamp: new Date(NOW_MS - hours * 3600_000).toISOString(),
        }),
        makeEngagement(),
        NOW_MS
      ).urgency

    const justIn = urgencyAfter(2)
    const peak = urgencyAfter(36)
    const threeDays = urgencyAfter(72)
    const twoWeeks = urgencyAfter(24 * 14)

    expect(peak).toBeGreaterThan(justIn)
    // 핵심: 오래 방치될수록 점수가 계속 오르던 이전 곡선을 끊는다.
    expect(threeDays).toBeLessThan(peak)
    expect(twoWeeks).toBeLessThan(threeDays)
    expect(twoWeeks).toBeLessThanOrEqual(15)
  })

  it("지연된 팔로업도 봉우리 이후 감쇠한다 — 40일 지연이 2일 지연을 이기지 못한다", () => {
    const urgencyForOverdue = (days: number) =>
      calcLeadPriority(
        makeLead({
          source: "manual",
          status: "contacted",
          follow_up_at: new Date(NOW_MS - days * DAY_MS).toISOString(),
        }),
        makeEngagement(),
        NOW_MS
      ).urgency

    expect(urgencyForOverdue(40)).toBeLessThan(urgencyForOverdue(2))
  })

  it("방치된 미응답 리드는 컨택·데모·반응이 겹친 리드를 이기지 못한다", () => {
    // 사용자 요청의 핵심 회귀 방지: "미응답 길어짐"만으로 상단을 먹지 않는다.
    const neglected = calcLeadPriority(
      makeLead({
        id: "neglected",
        source: "contact_page",
        status: "new",
        timestamp: new Date(NOW_MS - 9 * DAY_MS).toISOString(),
        follow_up_at: new Date(NOW_MS - 7 * DAY_MS).toISOString(),
      }),
      makeEngagement(),
      NOW_MS
    )
    const engagedDemo = calcLeadPriority(
      makeLead({
        id: "engaged",
        source: "demo_modal",
        status: "contacted",
        size: "220",
        org: "반응학원",
        phone: "010-1111-2222",
        timestamp: new Date(NOW_MS - 12 * DAY_MS).toISOString(),
      }),
      makeEngagement({
        eventCount: 9,
        downloadCount: 2,
        contactLogCount: 2,
        lastContactAt: new Date(NOW_MS - 5 * DAY_MS).toISOString(),
        lastActivityAt: new Date(NOW_MS - 2 * DAY_MS).toISOString(),
      }),
      NOW_MS
    )

    expect(engagedDemo.total).toBeGreaterThan(neglected.total)
    expect(engagedDemo.reasons[0]).not.toContain("미응답")
  })

  it("전환·종료 리드는 목록에 남되 상단에서 내려간다", () => {
    const base = makeLead({ source: "demo_modal", size: "400", org: "큰학원", phone: "010-1111-2222" })
    const engagement = makeEngagement({ eventCount: 20, downloadCount: 3 })
    const active = calcLeadPriority({ ...base, status: "contacted" }, engagement, NOW_MS)
    const closed = calcLeadPriority({ ...base, status: "closed" }, engagement, NOW_MS)
    expect(closed.total).toBeLessThan(active.total)
  })

  it("사이트 재방문이 유입일보다 최근이면 최근 축이 그걸 따른다", () => {
    const stale = makeLead({ timestamp: new Date(NOW_MS - 60 * DAY_MS).toISOString() })
    const withoutRevisit = calcLeadPriority(stale, makeEngagement(), NOW_MS)
    const withRevisit = calcLeadPriority(
      stale,
      makeEngagement({ eventCount: 1, lastActivityAt: new Date(NOW_MS - DAY_MS).toISOString() }),
      NOW_MS
    )
    expect(withRevisit.recency).toBeGreaterThan(withoutRevisit.recency)
    expect(withRevisit.reasons).toContain("1일 전 사이트 활동")
  })

  it("근거는 최대 3개까지만 노출한다", () => {
    const priority = calcLeadPriority(
      makeLead({
        source: "demo_modal",
        size: "500",
        status: "new",
        timestamp: new Date(NOW_MS - 5 * DAY_MS).toISOString(),
        follow_up_at: new Date(NOW_MS - 4 * DAY_MS).toISOString(),
      }),
      makeEngagement({ eventCount: 9, downloadCount: 2, lastActivityAt: new Date(NOW_MS - DAY_MS).toISOString() }),
      NOW_MS
    )
    expect(priority.reasons.length).toBeLessThanOrEqual(3)
  })
})

describe("sortLeads", () => {
  const older = makeLead({ id: "older", timestamp: new Date(NOW_MS - 10 * DAY_MS).toISOString(), name: "가나" })
  const newer = makeLead({ id: "newer", timestamp: new Date(NOW_MS - 1 * DAY_MS).toISOString(), name: "하하" })
  const leads = [older, newer]
  const context = { nowMs: NOW_MS, engagements: {} }

  it("newest / oldest 는 유입 시각을 뒤집는다", () => {
    expect(sortLeads(leads, "newest", context).map((l) => l.id)).toEqual(["newer", "older"])
    expect(sortLeads(leads, "oldest", context).map((l) => l.id)).toEqual(["older", "newer"])
  })

  it("입력 배열을 변형하지 않는다", () => {
    const input = [...leads]
    sortLeads(input, "oldest", context)
    expect(input.map((l) => l.id)).toEqual(["older", "newer"])
  })

  it("frequent 는 가중 접점 수가 많은 쪽이 먼저", () => {
    const sorted = sortLeads(leads, "frequent", {
      nowMs: NOW_MS,
      engagements: { older: makeEngagement({ downloadCount: 5 }), newer: makeEngagement({ eventCount: 1 }) },
    })
    expect(sorted[0].id).toBe("older")
  })

  it("followup 은 예정일이 있는 리드를 먼저, 빠른 날짜순으로 세운다", () => {
    const withFollowUp = { ...older, follow_up_at: new Date(NOW_MS - 2 * DAY_MS).toISOString() }
    const sorted = sortLeads([newer, withFollowUp], "followup", context)
    expect(sorted.map((l) => l.id)).toEqual(["older", "newer"])
  })

  it("name 은 가나다순", () => {
    expect(sortLeads(leads, "name", context).map((l) => l.id)).toEqual(["older", "newer"])
  })
})

describe("검색", () => {
  it("공백은 AND, 큰따옴표는 구문 하나로 묶는다", () => {
    expect(tokenizeLeadSearch('  강남   "여름 특강" 300 ')).toEqual(["강남", "여름 특강", "300"])
    expect(tokenizeLeadSearch("   ")).toEqual([])
  })

  it("모든 토큰을 만족하는 리드만 남는다", () => {
    const lead = makeLead({ name: "김원장", org: "강남 수학학원", size: "300" })
    expect(matchesLeadSearch(lead, tokenizeLeadSearch("강남 300"))).toBe(true)
    expect(matchesLeadSearch(lead, tokenizeLeadSearch("강남 500"))).toBe(false)
    expect(matchesLeadSearch(lead, [])).toBe(true)
  })

  it("하이픈 없이 친 전화번호도 찾는다", () => {
    const lead = makeLead({ phone: "010-1234-5678" })
    expect(matchesLeadSearch(lead, tokenizeLeadSearch("01012345678"))).toBe(true)
  })

  it("캠페인·담당자·메모까지 훑는다", () => {
    const lead = makeLead({ utm_campaign: "summer_hw", assigned_to: "박매니저", notes: "설명회 참석" })
    expect(matchesLeadSearch(lead, tokenizeLeadSearch("summer_hw"))).toBe(true)
    expect(matchesLeadSearch(lead, tokenizeLeadSearch("박매니저"))).toBe(true)
    expect(matchesLeadSearch(lead, tokenizeLeadSearch("설명회"))).toBe(true)
  })
})

describe("마케팅 렌즈", () => {
  it("마케팅 채널 묶음은 트래킹이 없어도 마케팅 리드", () => {
    expect(isMarketingLead(makeLead({ source: "meta_lead_ads" }))).toBe(true)
    expect(isMarketingLead(makeLead({ source: "demo_modal" }))).toBe(true)
    expect(isMarketingLead(makeLead({ source: "newsletter" }))).toBe(true)
  })

  it("영업·수기 유입은 기본적으로 제외한다", () => {
    expect(isMarketingLead(makeLead({ source: "admin_manual" }))).toBe(false)
    expect(isMarketingLead(makeLead({ source: "channel_talk" }))).toBe(false)
  })

  it("UTM·클릭ID가 붙어 들어왔다면 채널과 무관하게 마케팅 귀속", () => {
    expect(isMarketingLead(makeLead({ source: "admin_manual", utm_campaign: "summer" }))).toBe(true)
    expect(isMarketingLead(makeLead({ source: "channel_talk", gclid: "abc" }))).toBe(true)
    expect(hasTrackingSignal(makeLead({ source: "admin_manual" }))).toBe(false)
  })

  it("빈 문자열 UTM은 트래킹 신호로 치지 않는다", () => {
    expect(hasTrackingSignal(makeLead({ utm_source: "  " }))).toBe(false)
  })
})

describe("getLeadTrackingKey", () => {
  it("UTM이 있으면 source/medium, 없으면 유입 묶음 라벨", () => {
    expect(
      getLeadTrackingKey(makeLead({ utm_source: "google", utm_medium: "cpc" }), "channel")
    ).toBe("google / cpc")
    expect(getLeadTrackingKey(makeLead({ source: "contact_page" }), "channel")).toBe("홈페이지")
  })

  it("랜딩은 쿼리·호스트를 떼고 경로만 남긴다", () => {
    expect(
      getLeadTrackingKey(makeLead({ landing_page: "https://classin.co.kr/product/sw?utm_source=x" }), "landing")
    ).toBe("/product/sw")
    expect(getLeadTrackingKey(makeLead({ landing_page: "/" }), "landing")).toBe("/")
  })

  it("값이 없는 축은 null — '기타' 한 덩어리로 부풀리지 않는다", () => {
    expect(getLeadTrackingKey(makeLead(), "campaign")).toBeNull()
    expect(getLeadTrackingKey(makeLead(), "magnet")).toBeNull()
  })

  it("구버전 Meta 리드는 message 파서 값으로 광고 축을 채운다", () => {
    const legacy = makeLead({
      source: "meta_lead_ads",
      message: ["campaign=여름 HW", "ad=[SW] 전자칠판"].join("\n"),
    })
    expect(getLeadTrackingKey(legacy, "campaign")).toBe("여름 HW")
    expect(getLeadTrackingKey(legacy, "ad")).toBe("[SW] 전자칠판")
  })
})

describe("buildTrackingRollup", () => {
  const leads = [
    makeLead({ id: "a", utm_campaign: "summer", status: "converted" }),
    makeLead({ id: "b", utm_campaign: "summer", status: "new", source: "contact_page" }),
    makeLead({ id: "c", utm_campaign: "winter", status: "contacted" }),
    makeLead({ id: "d" }),
  ]
  const rollup = buildTrackingRollup(leads, (lead) => getLeadTrackingKey(lead, "campaign"))

  it("축 값이 없는 리드는 untracked 로 따로 센다", () => {
    expect(rollup.total).toBe(4)
    expect(rollup.untrackedCount).toBe(1)
    expect(rollup.rows).toHaveLength(2)
  })

  it("전환 건수 → 총 건수 순으로 정렬하고 전환율을 함께 낸다", () => {
    expect(rollup.rows[0].key).toBe("summer")
    expect(rollup.rows[0].total).toBe(2)
    expect(rollup.rows[0].converted).toBe(1)
    expect(rollup.rows[0].convRate).toBeCloseTo(0.5)
    expect(rollup.rows[0].unresponded).toBe(1)
    expect(rollup.rows[1].key).toBe("winter")
    expect(rollup.rows[1].contacted).toBe(1)
  })

  it("빈 입력은 빈 롤업", () => {
    const empty = buildTrackingRollup([], (lead) => getLeadTrackingKey(lead, "campaign"))
    expect(empty.rows).toEqual([])
    expect(empty.total).toBe(0)
  })
})
