import { describe, expect, it } from "vitest"

import {
  aggregateLeads,
  buildOperationalAlerts,
  computePipelineCoverage,
  deriveBlogInsights,
  deriveBlogInsightsFromSummary,
  deriveBugInsights,
  deriveCampaignInsights,
  deriveConnections,
  deriveEventInsights,
  deriveLatestPatchNote,
  resolveUnrespondedSignal,
  EMPTY_OVERVIEW_BLOG_SUMMARY,
  type OperationalAlertInput,
  type OverviewBlogSummary,
} from "@/lib/admin/overview/insights"
import type { LeadRecord } from "@/lib/site-settings-types"
import type { BlogPost } from "@/lib/blog-types"
import type { EmailCampaign } from "@/lib/marketing-types"
import type { CalendarEvent } from "@/lib/calendar-data"
import type { BugReport } from "@/lib/bugs-data"
import type { PatchNote } from "@/lib/patch-notes-data"
import type { AdminIntegrationStatusResponse } from "@/lib/admin-integrations/types"

// Overview 신호 판정(우선순위·tone·임계값·리드 확인 게이트)을 고정하는 스냅샷성 유닛 테스트.
// 시간 의존 함수는 전부 Date 주입으로 고정한다 — 로컬 타임존과 무관하게 동작하도록
// 타임스탬프는 로컬 시각 기반 Date 생성자로 만든다.

// 기준 현재 시각: 2026-07-15 12:00 (로컬)
const NOW = new Date(2026, 6, 15, 12, 0, 0)

function localIso(year: number, monthIndex: number, day: number, hour = 9) {
  return new Date(year, monthIndex, day, hour).toISOString()
}

let seq = 0

function makeLead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  seq += 1
  return {
    id: `lead-${seq}`,
    source: "contact_page",
    timestamp: localIso(2026, 6, 15, 10),
    status: "new",
    confirmed_at: localIso(2026, 6, 15, 10),
    ...overrides,
  }
}

function makePost(overrides: Partial<BlogPost> = {}): BlogPost {
  seq += 1
  return {
    id: seq,
    slug: `post-${seq}`,
    title: `포스트 ${seq}`,
    excerpt: "",
    category: "인사이트",
    tags: [],
    tag: "",
    date: "2026-07-01",
    author: "팀",
    authorRole: "",
    authorBio: "",
    readTime: "3분",
    imageUrl: "",
    thumbnailAlt: "",
    heroImageUrl: "",
    heroImageAlt: "",
    featured: false,
    benefitItems: [],
    targetReader: "",
    contentMarkdown: "",
    seoTitle: "",
    seoDescription: "",
    relatedPostIds: [],
    pageLayout: "standard",
    cta: { eyebrow: "", title: "CTA", description: "", buttonLabel: "신청", buttonHref: "/contact" },
    status: "published",
    ...overrides,
  }
}

function makeCampaign(overrides: Partial<EmailCampaign> = {}): EmailCampaign {
  seq += 1
  return {
    id: seq,
    subject: `캠페인 ${seq}`,
    body: "",
    targetTags: [],
    status: "sent",
    recipientCount: 10,
    createdAt: localIso(2026, 6, 10),
    ...overrides,
  }
}

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  seq += 1
  return {
    id: `event-${seq}`,
    title: `일정 ${seq}`,
    date: "2026-07-16",
    type: "meeting",
    ...overrides,
  } as CalendarEvent
}

function makeBug(overrides: Partial<BugReport> = {}): BugReport {
  seq += 1
  return {
    id: `bug-${seq}`,
    title: `버그 ${seq}`,
    description: "",
    severity: "medium",
    status: "open",
    reporter: "qa",
    createdAt: localIso(2026, 6, 1),
    updatedAt: localIso(2026, 6, 10),
    tags: [],
    ...overrides,
  }
}

function makeNote(overrides: Partial<PatchNote> = {}): PatchNote {
  seq += 1
  return {
    id: `note-${seq}`,
    version: "1.0.0",
    title: `패치 ${seq}`,
    date: localIso(2026, 6, 1),
    status: "published",
    changes: [],
    createdAt: localIso(2026, 6, 1),
    updatedAt: localIso(2026, 6, 1),
    ...overrides,
  }
}

function alertInput(overrides: Partial<OperationalAlertInput> = {}): OperationalAlertInput {
  return {
    unrespondedCount: 0,
    unresponded24hCount: 0,
    todayLeads: 0,
    thisWeekLeads: 0,
    missingConnectionLabels: [],
    openBugs: [],
    criticalOpenBugs: [],
    publishedBlogPostCount: 0,
    publishedPostsWithoutCta: 0,
    ctaCoverage: 0,
    draftCampaignCount: 0,
    sentCampaignCount: 0,
    ...overrides,
  }
}

describe("aggregateLeads — 리드 확인 게이트", () => {
  it("미확인 리드는 퍼널 단계 카운트에서 제외하되 total·유입 버킷에는 포함한다", () => {
    const leads = [
      makeLead({ status: "new" }),
      makeLead({ status: "new", confirmed_at: undefined }),
    ]
    const agg = aggregateLeads(leads, NOW)
    // 게이트: 착지 보드(filter=new)와 동일 기준 — 미확인 리드는 단계 카운트 제외.
    expect(agg.newLeads).toBe(1)
    expect(agg.activePipelineLeads).toBe(1)
    // 유입 흐름(오늘/이번 주/총량)은 게이트와 무관하게 전량 집계.
    expect(agg.total).toBe(2)
    expect(agg.todayLeads).toBe(2)
    expect(agg.thisWeekLeads).toBe(2)
  })

  it("확인된 리드는 상태별로 집계되고 전환율은 total 기준 반올림", () => {
    const leads = [
      makeLead({ status: "new" }),
      makeLead({ status: "new" }),
      makeLead({ status: "contacted" }),
      makeLead({ status: "converted" }),
      makeLead({ status: "closed" }),
    ]
    const agg = aggregateLeads(leads, NOW)
    expect(agg.newLeads).toBe(2)
    expect(agg.contactedLeads).toBe(1)
    expect(agg.converted).toBe(1)
    expect(agg.closedLeads).toBe(1)
    expect(agg.activePipelineLeads).toBe(3)
    expect(agg.convRate).toBe(20) // round(1/5*100)
  })
})

describe("aggregateLeads — 기간 버킷 (Date 주입)", () => {
  it("오늘/이번 주/지난주/이번 달/지난달 경계와 추이를 판정한다", () => {
    const leads = [
      makeLead({ timestamp: localIso(2026, 6, 15, 10) }), // 오늘
      makeLead({ timestamp: localIso(2026, 6, 10, 10) }), // 이번 주(7일 이내)
      makeLead({ timestamp: localIso(2026, 6, 3, 10) }), // 지난주(7~14일)
      makeLead({ timestamp: localIso(2026, 6, 2, 10), status: "converted" }), // 지난주·이번 달 전환
      makeLead({ timestamp: localIso(2026, 5, 20, 10), status: "converted" }), // 지난달 전환
    ]
    const agg = aggregateLeads(leads, NOW)
    expect(agg.todayLeads).toBe(1)
    expect(agg.thisWeekLeads).toBe(2)
    expect(agg.thisMonthLeads).toBe(4)
    expect(agg.weekTrend).toBe(0) // 이번 주 2 - 지난주 2
    expect(agg.monthTrend).toBe(3) // 이번 달 4 - 지난달 1
    expect(agg.convertedThisMonth).toBe(1)
    expect(agg.convertedTrend).toBe(0) // 이번 달 1 - 지난달 1
  })

  it("잘못된 timestamp는 기간 버킷에서 제외되지만 total에는 포함된다", () => {
    const agg = aggregateLeads([makeLead({ timestamp: "not-a-date" })], NOW)
    expect(agg.total).toBe(1)
    expect(agg.todayLeads).toBe(0)
    expect(agg.thisWeekLeads).toBe(0)
    expect(agg.thisMonthLeads).toBe(0)
  })
})

describe("aggregateLeads — 소스·지점·최근 리드", () => {
  it("pieData는 SOURCE_LABEL 매핑(미등록 키는 원시 키), topBranch는 최다 지점", () => {
    const leads = [
      makeLead({ source: "demo_modal", branch: "강남" }),
      makeLead({ source: "demo_modal", branch: "강남" }),
      makeLead({ source: "kakao_ch", branch: "분당" }),
    ]
    const agg = aggregateLeads(leads, NOW)
    expect(agg.pieData).toContainEqual({ name: "데모 신청", value: 2 })
    expect(agg.pieData).toContainEqual({ name: "kakao_ch", value: 1 })
    expect(agg.topBranch).toEqual(["강남", 2])
  })

  it("recentLeads는 timestamp 내림차순 최대 6건", () => {
    const leads = Array.from({ length: 7 }, (_, i) =>
      makeLead({ id: `l-${i}`, timestamp: localIso(2026, 6, 1 + i, 10) })
    )
    const agg = aggregateLeads(leads, NOW)
    expect(agg.recentLeads).toHaveLength(6)
    expect(agg.recentLeads[0].id).toBe("l-6")
    expect(agg.recentLeads[5].id).toBe("l-1")
  })
})

describe("deriveBlogInsights", () => {
  it("CTA 커버리지는 공개 글 기준 반올림, 미완성 CTA 수를 함께 산출", () => {
    const posts = [
      makePost(),
      makePost(),
      makePost({ cta: { eyebrow: "", title: "CTA", description: "", buttonLabel: "신청", buttonHref: "  " } }),
      makePost({ status: "draft" }),
    ]
    const derived = deriveBlogInsights(posts)
    expect(derived.publishedBlogPosts).toHaveLength(3)
    expect(derived.ctaCoverage).toBe(67) // round(2/3*100)
    expect(derived.publishedPostsWithoutCta).toBe(1)
    expect(derived.draftBlogPosts).toBe(1)
  })

  it("공개 글이 없으면 커버리지 0, recentPosts는 수정일 내림차순 최대 4건", () => {
    expect(deriveBlogInsights([]).ctaCoverage).toBe(0)
    const posts = Array.from({ length: 5 }, (_, i) =>
      makePost({ slug: `p-${i}`, updatedAt: localIso(2026, 6, 1 + i) })
    )
    const derived = deriveBlogInsights(posts)
    expect(derived.recentPosts).toHaveLength(4)
    expect(derived.recentPosts[0].slug).toBe("p-4")
  })
})

// T5-B: overview는 전 포스트 대신 서버 요약(/api/admin/blog?scope=overview)을 받는다.
// 같은 데이터를 (a) 전체 목록 → deriveBlogInsights, (b) 요약 → deriveBlogInsightsFromSummary로
// 파생했을 때 출력 수치·최근 4건이 동치여야 한다(커버리지 반올림·정렬·컷 규칙 공유).
describe("deriveBlogInsightsFromSummary", () => {
  function summarize(posts: BlogPost[]): OverviewBlogSummary {
    const published = posts.filter((post) => post.status === "published")
    const withoutCta = published.filter((post) => {
      const cta = post.cta
      return !(cta?.title?.trim() && cta?.buttonLabel?.trim() && cta?.buttonHref?.trim())
    })
    return {
      totalCount: posts.length,
      publishedCount: published.length,
      draftCount: posts.filter((post) => post.status === "draft").length,
      publishedWithoutCtaCount: withoutCta.length,
      // 서버는 updated_at 내림차순 4건만 보낸다 — 여기서도 같은 컷을 흉내 낸다.
      recent: [...posts]
        .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
        .slice(0, 4)
        .map((post) => ({
          id: post.id,
          title: post.title,
          status: post.status,
          category: post.category,
          author: post.author,
          updatedAt: post.updatedAt,
          publishedAt: post.publishedAt,
        })),
    }
  }

  it("동일 픽스처에서 전체 목록 파생과 같은 수치·최근 4건을 낸다", () => {
    const posts = [
      makePost({ updatedAt: localIso(2026, 6, 1) }),
      makePost({ updatedAt: localIso(2026, 6, 5) }),
      makePost({
        updatedAt: localIso(2026, 6, 3),
        cta: { eyebrow: "", title: "CTA", description: "", buttonLabel: "신청", buttonHref: "  " },
      }),
      makePost({ status: "draft", updatedAt: localIso(2026, 6, 9) }),
      makePost({ status: "review", updatedAt: localIso(2026, 6, 7) }),
      makePost({ status: "archived", updatedAt: localIso(2026, 6, 2) }),
    ]
    const full = deriveBlogInsights(posts)
    const fromSummary = deriveBlogInsightsFromSummary(summarize(posts))

    expect(fromSummary.totalBlogPosts).toBe(posts.length)
    expect(fromSummary.publishedBlogPostCount).toBe(full.publishedBlogPosts.length)
    expect(fromSummary.draftBlogPosts).toBe(full.draftBlogPosts)
    expect(fromSummary.ctaCoverage).toBe(full.ctaCoverage)
    expect(fromSummary.publishedPostsWithoutCta).toBe(full.publishedPostsWithoutCta)
    expect(fromSummary.recentPosts.map((post) => post.id)).toEqual(full.recentPosts.map((post) => post.id))
    expect(fromSummary.recentPosts.map((post) => post.status)).toEqual(
      full.recentPosts.map((post) => post.status)
    )
    // 수치 스냅샷 — round(2/3*100)=67, 미완성 1건, 초안 1건
    expect(fromSummary.ctaCoverage).toBe(67)
    expect(fromSummary.publishedPostsWithoutCta).toBe(1)
    expect(fromSummary.draftBlogPosts).toBe(1)
  })

  it("빈 요약은 전체 목록 [] 파생과 같다 — 커버리지 0, 최근 글 없음", () => {
    const full = deriveBlogInsights([])
    const fromSummary = deriveBlogInsightsFromSummary(EMPTY_OVERVIEW_BLOG_SUMMARY)
    expect(fromSummary.totalBlogPosts).toBe(0)
    expect(fromSummary.publishedBlogPostCount).toBe(full.publishedBlogPosts.length)
    expect(fromSummary.ctaCoverage).toBe(full.ctaCoverage)
    expect(fromSummary.publishedPostsWithoutCta).toBe(full.publishedPostsWithoutCta)
    expect(fromSummary.recentPosts).toEqual([])
  })

  it("서버 카운트가 어긋나도(미완성 > 공개) 음수·100% 초과가 나오지 않는다", () => {
    const derived = deriveBlogInsightsFromSummary({
      ...EMPTY_OVERVIEW_BLOG_SUMMARY,
      totalCount: 3,
      publishedCount: 2,
      publishedWithoutCtaCount: 5,
    })
    expect(derived.publishedPostsWithoutCta).toBe(2)
    expect(derived.ctaCoverage).toBe(0)
  })
})

describe("deriveCampaignInsights", () => {
  it("latestFailedCampaign은 sentAt??createdAt 기준 가장 최근 실패 건", () => {
    const oldFail = makeCampaign({ status: "failed", createdAt: localIso(2026, 6, 1) })
    const newFail = makeCampaign({ status: "failed", sentAt: localIso(2026, 6, 12) })
    const derived = deriveCampaignInsights([
      oldFail,
      newFail,
      makeCampaign({ status: "draft" }),
      makeCampaign({ status: "sent" }),
    ])
    expect(derived.latestFailedCampaign?.id).toBe(newFail.id)
    expect(derived.draftCampaigns).toHaveLength(1)
    expect(derived.sentCampaigns).toHaveLength(1)
    expect(derived.failedCampaigns).toHaveLength(2)
  })

  it("recentCampaigns는 최신순 최대 4건", () => {
    const campaigns = Array.from({ length: 5 }, (_, i) =>
      makeCampaign({ subject: `c-${i}`, sentAt: localIso(2026, 6, 1 + i) })
    )
    const derived = deriveCampaignInsights(campaigns)
    expect(derived.recentCampaigns).toHaveLength(4)
    expect(derived.recentCampaigns[0].subject).toBe("c-4")
  })
})

describe("deriveEventInsights — 7일 창 (Date 주입)", () => {
  it("오늘~+7일 경계 포함, 그 밖은 제외하고 날짜·시간순 정렬", () => {
    const today = makeEvent({ date: "2026-07-15", time: "14:00" })
    const boundary = makeEvent({ date: "2026-07-22" }) // +7일: 포함
    const beyond = makeEvent({ date: "2026-07-23" }) // +8일: 제외
    const past = makeEvent({ date: "2026-07-14" }) // 어제: 제외
    const earlier = makeEvent({ date: "2026-07-15", time: "09:00" })
    const derived = deriveEventInsights([boundary, today, beyond, past, earlier], NOW)
    expect(derived.upcomingEvents.map((event) => event.id)).toEqual([
      earlier.id,
      today.id,
      boundary.id,
    ])
    expect(derived.nextUpcomingEvent?.id).toBe(earlier.id)
  })

  it("담당자 집계 — 미배정 카운트와 최다 담당자", () => {
    const derived = deriveEventInsights(
      [
        makeEvent({ date: "2026-07-16", assignees: ["mooni"] }),
        makeEvent({ date: "2026-07-17", assignees: ["mooni", "silky"] }),
        makeEvent({ date: "2026-07-18" }),
      ],
      NOW
    )
    expect(derived.activeAssigneeCount).toBe(2)
    expect(derived.unassignedEventCount).toBe(1)
    expect(derived.busiestAssignee).toEqual(["mooni", 2])
  })
})

describe("deriveBugInsights", () => {
  it("open/in-progress만, 심각도 우선(동률은 최근 업데이트순), 최대 4건", () => {
    const critical = makeBug({ severity: "critical", updatedAt: localIso(2026, 6, 1) })
    const highNew = makeBug({ severity: "high", updatedAt: localIso(2026, 6, 12), status: "in-progress" })
    const highOld = makeBug({ severity: "high", updatedAt: localIso(2026, 6, 2) })
    const medium = makeBug({ severity: "medium" })
    const low = makeBug({ severity: "low" })
    const resolved = makeBug({ severity: "critical", status: "resolved" })
    const derived = deriveBugInsights([low, medium, highOld, highNew, critical, resolved])
    expect(derived.openBugs.map((bug) => bug.id)).toEqual([
      critical.id,
      highNew.id,
      highOld.id,
      medium.id,
    ])
    expect(derived.criticalOpenBugs.map((bug) => bug.id)).toEqual([
      critical.id,
      highNew.id,
      highOld.id,
    ])
  })
})

describe("deriveLatestPatchNote", () => {
  it("date 기준 가장 최근 노트를 고른다 (없으면 undefined)", () => {
    const older = makeNote({ date: localIso(2026, 5, 1) })
    const newer = makeNote({ date: localIso(2026, 6, 10) })
    expect(deriveLatestPatchNote([older, newer])?.id).toBe(newer.id)
    expect(deriveLatestPatchNote([])).toBeUndefined()
  })
})

describe("deriveConnections", () => {
  it("상태 응답이 없으면(로딩/실패) 미연결로 단정하지 않는다 — missing 0건", () => {
    const derived = deriveConnections(null)
    expect(derived.connections).toHaveLength(4)
    expect(derived.connections.every((connection) => !connection.connected)).toBe(true)
    expect(derived.missingConnections).toHaveLength(0)
  })

  it("응답이 있으면 configured=false 항목만 missing으로, 라벨·href는 응답 우선", () => {
    const status: AdminIntegrationStatusResponse = {
      generatedAt: localIso(2026, 6, 15),
      items: [
        {
          key: "lead_webhooks",
          label: "리드 웹훅",
          category: "lead",
          configured: true,
          source: "env",
          health: "ok",
          requiredKeys: [],
          adminHref: "/admin/settings?tab=webhooks",
        },
        {
          key: "email_provider",
          label: "이메일",
          category: "marketing",
          configured: false,
          source: "not_configured",
          health: "unknown",
          requiredKeys: [],
        },
      ],
    }
    const derived = deriveConnections(status)
    const leadConnection = derived.connections.find((connection) => connection.label === "리드 웹훅")
    expect(leadConnection?.connected).toBe(true)
    expect(leadConnection?.href).toBe("/admin/settings?tab=webhooks")
    // 응답에 없는 키(channel_talk·notifications)와 configured=false 항목이 미연결로 잡힌다.
    expect(derived.missingConnections.map((connection) => connection.label)).toEqual([
      "Channel Talk",
      "이메일",
      "Notifications",
    ])
  })
})

describe("resolveUnrespondedSignal — 미응답 단일 정의 (W2-8)", () => {
  it("서버 수치(action-kpis)가 있으면 그대로 캐논으로 쓴다 (리드 목록 무시)", () => {
    const signal = resolveUnrespondedSignal(
      { unrespondedCount: 7, unresponded24hCount: 3 },
      [makeLead()],
      NOW
    )
    expect(signal).toEqual({ unrespondedCount: 7, unresponded24hCount: 3, basis: "server" })
  })

  it("서버·리드 둘 다 없으면 null — 0 플래시 대신 스켈레톤 유지", () => {
    expect(resolveUnrespondedSignal(null, null, NOW)).toBeNull()
    expect(resolveUnrespondedSignal(undefined, null, NOW)).toBeNull()
  })

  it("클라 폴백은 보드와 같은 정의: status=new AND 데모·문의·Meta 소스만 (확인 게이트 미적용)", () => {
    const leads = [
      makeLead({ source: "contact_page" }), // 대상 (2h 경과)
      makeLead({ source: "demo_modal", confirmed_at: undefined }), // 미확인이어도 응대 SLA엔 포함
      makeLead({ source: "newsletter" }), // 비대상 소스 제외
      makeLead({ source: "channel_talk" }), // 비대상 소스 제외
      makeLead({ source: "meta_lead_ads", status: "contacted" }), // new 아님 → 제외
    ]
    const signal = resolveUnrespondedSignal(null, leads, NOW)
    expect(signal).toEqual({ unrespondedCount: 2, unresponded24hCount: 0, basis: "client" })
  })

  it("클라 폴백 24h 경계: 접수 후 24시간 이상 경과만 골든타임 초과로 센다", () => {
    const leads = [
      makeLead({ timestamp: localIso(2026, 6, 14, 10) }), // 26h 경과 → 24h+
      makeLead({ timestamp: localIso(2026, 6, 15, 10) }), // 2h 경과
    ]
    const signal = resolveUnrespondedSignal(null, leads, NOW)
    expect(signal).toEqual({ unrespondedCount: 2, unresponded24hCount: 1, basis: "client" })
  })
})

describe("buildOperationalAlerts — 우선순위·상한", () => {
  it("신호 전부 발화 시 priority 내림차순 전체 목록을 돌려준다 (접힘 6건 컷은 페이지 렌더 몫)", () => {
    const failed = makeCampaign({ status: "failed" })
    const criticalBug = makeBug({ severity: "critical" })
    const { alerts } = buildOperationalAlerts(
      alertInput({
        unrespondedCount: 3,
        unresponded24hCount: 1,
        todayLeads: 1,
        thisWeekLeads: 5,
        latestFailedCampaign: failed,
        missingConnectionLabels: ["Email"],
        openBugs: [criticalBug],
        criticalOpenBugs: [criticalBug],
        publishedBlogPostCount: 4,
        publishedPostsWithoutCta: 2,
        ctaCoverage: 50,
        draftCampaignCount: 2,
        sentCampaignCount: 1,
        nextUpcomingEvent: makeEvent(),
        latestPatchNote: makeNote(),
      })
    )
    expect(alerts.map((alert) => alert.id).slice(0, 6)).toEqual([
      "lead-followup",
      `campaign-failed-${failed.id}`,
      "connection-missing",
      "open-bugs",
      "cta-coverage",
      "campaign-drafts",
    ])
    // 7번째 이후(행사·패치노트)도 잘리지 않고 반환된다 — 페이지 '더보기'가 이 꼬리를 연다.
    expect(alerts).toHaveLength(8)
    expect(alerts.map((alert) => alert.priority)).toEqual([100, 95, 90, 85, 70, 60, 50, 40])
  })

  it("신호가 없으면 알림 0건·주의 카운트 0", () => {
    const { alerts, actionableAlertCount } = buildOperationalAlerts(alertInput())
    expect(alerts).toEqual([])
    expect(actionableAlertCount).toBe(0)
  })

  it("actionableAlertCount는 warning·danger tone만 센다", () => {
    const { alerts, actionableAlertCount } = buildOperationalAlerts(
      alertInput({
        unrespondedCount: 1, // warning (24h+ 0건이면 danger 아님)
        draftCampaignCount: 1, // info
        latestPatchNote: makeNote({ status: "published" }), // success
      })
    )
    expect(alerts).toHaveLength(3)
    expect(actionableAlertCount).toBe(1)
  })
})

describe("buildOperationalAlerts — tone·임계값·딥링크", () => {
  it("미응답 신호는 필터드 보드 딥링크로 직결된다 (bare /admin/crm 금지)", () => {
    const { alerts } = buildOperationalAlerts(alertInput({ unrespondedCount: 2, todayLeads: 1 }))
    expect(alerts[0].id).toBe("lead-followup")
    expect(alerts[0].href).toBe("/admin/crm/customers/leads?filter=unresponded&focus=risk")
    expect(alerts[0].tone).toBe("warning")
  })

  it("24h+ 경과가 있으면 골든타임 타일과 같은 breach 판정으로 danger", () => {
    const { alerts } = buildOperationalAlerts(
      alertInput({ unrespondedCount: 2, unresponded24hCount: 1 })
    )
    expect(alerts[0].id).toBe("lead-followup")
    expect(alerts[0].tone).toBe("danger")
    // 산정 기준 캡션(응대 전·24h+·소스 기준)이 설명에 포함된다.
    expect(alerts[0].description).toContain("응대 전 2건")
    expect(alerts[0].description).toContain("24h+ 경과 1건")
    expect(alerts[0].description).toContain("데모·문의·Meta")
  })

  it("후속 리스크 meta는 오늘 유입이 있으면 '오늘 유입 N건', 없으면 '이번 주 유입 N건'", () => {
    const withToday = buildOperationalAlerts(
      alertInput({ unrespondedCount: 2, todayLeads: 3, thisWeekLeads: 5 })
    )
    expect(withToday.alerts[0].meta).toBe("오늘 유입 3건")
    const withoutToday = buildOperationalAlerts(
      alertInput({ unrespondedCount: 2, todayLeads: 0, thisWeekLeads: 5 })
    )
    expect(withoutToday.alerts[0].meta).toBe("이번 주 유입 5건")
  })

  it("CTA 커버리지 50% 미만이면 warning, 이상이면 info", () => {
    const below = buildOperationalAlerts(
      alertInput({ publishedBlogPostCount: 4, publishedPostsWithoutCta: 3, ctaCoverage: 25 })
    )
    expect(below.alerts[0].tone).toBe("warning")
    const above = buildOperationalAlerts(
      alertInput({ publishedBlogPostCount: 4, publishedPostsWithoutCta: 1, ctaCoverage: 75 })
    )
    expect(above.alerts[0].tone).toBe("info")
  })

  it("오픈 이슈는 critical/high가 있으면 danger·priority 85, 없으면 warning·75", () => {
    const criticalBug = makeBug({ severity: "critical" })
    const withCritical = buildOperationalAlerts(
      alertInput({ openBugs: [criticalBug], criticalOpenBugs: [criticalBug] })
    )
    expect(withCritical.alerts[0].tone).toBe("danger")
    expect(withCritical.alerts[0].priority).toBe(85)
    expect(withCritical.alerts[0].meta).toBe("긴급 1건")
    const withoutCritical = buildOperationalAlerts(alertInput({ openBugs: [makeBug()] }))
    expect(withoutCritical.alerts[0].tone).toBe("warning")
    expect(withoutCritical.alerts[0].priority).toBe(75)
    expect(withoutCritical.alerts[0].meta).toBe("오픈 1건")
  })

  it("미연결 요약은 2건 이하 나열, 3건 이상 '외 N개' 축약", () => {
    const two = buildOperationalAlerts(alertInput({ missingConnectionLabels: ["A", "B"] }))
    expect(two.alerts[0].description).toContain("A, B")
    expect(two.alerts[0].description).not.toContain("외")
    const three = buildOperationalAlerts(alertInput({ missingConnectionLabels: ["A", "B", "C"] }))
    expect(three.alerts[0].description).toContain("A, B 외 1개")
    expect(three.alerts[0].meta).toBe("미연결 3건")
  })

  it("패치노트는 published면 success·'배포 완료', 아니면 info·'초안'", () => {
    const published = buildOperationalAlerts(alertInput({ latestPatchNote: makeNote({ status: "published" }) }))
    expect(published.alerts[0].tone).toBe("success")
    expect(published.alerts[0].meta).toBe("배포 완료")
    const draft = buildOperationalAlerts(alertInput({ latestPatchNote: makeNote({ status: "draft" }) }))
    expect(draft.alerts[0].tone).toBe("info")
    expect(draft.alerts[0].meta).toBe("초안")
  })
})

describe("computePipelineCoverage", () => {
  it("시리즈가 없으면 null", () => {
    expect(computePipelineCoverage(null)).toBeNull()
    expect(computePipelineCoverage(undefined)).toBeNull()
  })

  it("예상 파이프 ÷ 잔여목표 — 누적 시리즈의 마지막 값 기준", () => {
    const coverage = computePipelineCoverage({
      goal_cum: [50, 100],
      revenue_cum: [20, 40],
      revenue_trend_cum: [30, 90],
    })
    expect(coverage).toBeCloseTo((90 - 40) / (100 - 40), 10)
  })

  it("잔여목표가 0 이하이거나 시리즈가 비어 있으면 null (0 나눗셈 방지)", () => {
    expect(
      computePipelineCoverage({ goal_cum: [100], revenue_cum: [100], revenue_trend_cum: [120] })
    ).toBeNull()
    expect(
      computePipelineCoverage({ goal_cum: [100], revenue_cum: [120], revenue_trend_cum: [130] })
    ).toBeNull()
    expect(computePipelineCoverage({ goal_cum: [], revenue_cum: [], revenue_trend_cum: [] })).toBeNull()
  })
})
