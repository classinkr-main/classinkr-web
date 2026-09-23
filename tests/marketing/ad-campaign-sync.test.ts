import { describe, expect, it } from "vitest"

import {
  AD_SYNC_STALE_AFTER_DAYS,
  buildAdCampaignSyncPlan,
  type AdCampaignCandidate,
  type AdSyncPlan,
} from "@/lib/marketing/ad-campaign-sync"
import type { CampaignLink, CampaignWithLinks } from "@/lib/types/marketing-campaign"

const TODAY = "2026-09-14"

/** TODAY 기준 n일 전(YYYY-MM-DD). 오래된 캠페인 판정 경계를 테스트에서 직접 계산한다. */
function daysAgo(n: number): string {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)
}

function candidate(
  patch: Partial<AdCampaignCandidate> & { campaignId: string },
): AdCampaignCandidate {
  return {
    channel: "google",
    campaignName: `캠페인 ${patch.campaignId}`,
    lastActiveDate: daysAgo(1),
    spend: 1000,
    currency: "KRW",
    ...patch,
  }
}

function link(refType: CampaignLink["refType"], refId: string, campaignId: string): CampaignLink {
  return { id: `l-${refType}-${refId}`, campaignId, refType, refId, createdAt: "2026-09-01" }
}

function umbrella(
  id: string,
  links: CampaignLink[],
  patch: Partial<CampaignWithLinks> = {},
): CampaignWithLinks {
  return {
    id,
    name: `우산 ${id}`,
    objective: null,
    status: "active",
    channels: [],
    startsAt: null,
    endsAt: null,
    budget: null,
    owner: null,
    projectId: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    links,
    ...patch,
  }
}

function plan(
  candidates: AdCampaignCandidate[],
  campaigns: CampaignWithLinks[] = [],
  today = TODAY,
): AdSyncPlan {
  return buildAdCampaignSyncPlan({ candidates, campaigns, today })
}

/** 무음으로 빠지는 후보가 없어야 한다 — 모든 플랜이 만족해야 하는 불변식. */
function expectNoSilentDrop(result: AdSyncPlan) {
  expect(result.toLink.length + result.alreadyLinked.length + result.skipped.length).toBe(
    result.candidateCount,
  )
  for (const item of result.skipped) {
    expect(item.detail.trim().length).toBeGreaterThan(0)
  }
}

describe("buildAdCampaignSyncPlan — 빈 입력·기본", () => {
  it("후보도 캠페인도 없으면 전부 빈 플랜", () => {
    const result = plan([], [])
    expect(result.toLink).toEqual([])
    expect(result.alreadyLinked).toEqual([])
    expect(result.skipped).toEqual([])
    expect(result.candidateCount).toBe(0)
    expect(result.byChannel.google).toEqual({
      candidates: 0,
      toLink: 0,
      alreadyLinked: 0,
      skipped: 0,
    })
  })

  it("후보만 있고 우산이 하나도 없으면 우산을 만들지 않고 no-match 로 보고한다", () => {
    const result = plan([candidate({ campaignId: "g-1" }), candidate({ campaignId: "n-1", channel: "naver" })])
    expect(result.toLink).toEqual([])
    expect(result.skipped.map((s) => s.reason)).toEqual(["no-match", "no-match"])
    expect(result.skipped[0].detail).toContain("자동으로 만들지 않는다")
    expectNoSilentDrop(result)
  })
})

describe("buildAdCampaignSyncPlan — 이름 매칭 링크", () => {
  it("이름이 같은 우산 1건에 붙인다(refType·집행 정보까지 실어 보고)", () => {
    const result = plan(
      [
        candidate({
          campaignId: "g-1",
          campaignName: "9월 브랜드",
          lastActiveDate: daysAgo(2),
          spend: 250_000,
          currency: "KRW",
        }),
      ],
      [umbrella("c-1", [], { name: "9월 브랜드" })],
    )
    expect(result.toLink).toEqual([
      {
        channel: "google",
        refType: "google_campaign",
        adCampaignId: "g-1",
        label: "9월 브랜드",
        umbrella: { id: "c-1", name: "9월 브랜드" },
        matchedBy: "name",
        lastActiveDate: daysAgo(2),
        spend: 250_000,
        currency: "KRW",
      },
    ])
    expectNoSilentDrop(result)
  })

  it("앞뒤 공백·연속 공백·대소문자 차이는 같은 이름으로 본다", () => {
    const result = plan(
      [candidate({ campaignId: "g-1", campaignName: "  Brand   SEP  " })],
      [umbrella("c-1", [], { name: "brand sep" })],
    )
    expect(result.toLink.map((l) => l.umbrella.id)).toEqual(["c-1"])
  })

  it("이름이 같은 우산이 둘 이상이면 붙이지 않는다(ambiguous-name)", () => {
    const result = plan(
      [candidate({ campaignId: "g-1", campaignName: "9월 브랜드" })],
      [umbrella("c-1", [], { name: "9월 브랜드" }), umbrella("c-2", [], { name: "9월 브랜드" })],
    )
    expect(result.toLink).toEqual([])
    expect(result.skipped[0].reason).toBe("ambiguous-name")
    expect(result.skipped[0].detail).toContain("2개")
    expectNoSilentDrop(result)
  })

  it("이름 없는 후보는 raw id 로 우산을 찾지 않는다(unnamed)", () => {
    const result = plan(
      [candidate({ campaignId: "g-1", campaignName: null })],
      [umbrella("c-1", [], { name: "g-1" })],
    )
    expect(result.toLink).toEqual([])
    expect(result.skipped[0].reason).toBe("unnamed")
    // 라벨은 adCampaignLabel 규칙대로 raw id 로 폴백한다(이름을 지어내지 않는다).
    expect(result.skipped[0].label).toBe("g-1")
  })

  it("이름이 빈 우산은 이름 없는 후보와 매칭되지 않는다", () => {
    const result = plan(
      [candidate({ campaignId: "g-1", campaignName: "   " })],
      [umbrella("c-1", [], { name: "  " })],
    )
    expect(result.toLink).toEqual([])
    expect(result.skipped[0].reason).toBe("unnamed")
  })
})

describe("buildAdCampaignSyncPlan — 멱등", () => {
  it("이미 링크된 후보는 다시 붙이지 않고 alreadyLinked 로만 보고한다", () => {
    const campaigns = [
      umbrella("c-1", [link("google_campaign", "g-1", "c-1")], { name: "9월 브랜드" }),
    ]
    const result = plan([candidate({ campaignId: "g-1", campaignName: "9월 브랜드" })], campaigns)
    expect(result.toLink).toEqual([])
    expect(result.alreadyLinked).toEqual([
      {
        channel: "google",
        refType: "google_campaign",
        adCampaignId: "g-1",
        label: "9월 브랜드",
        umbrellas: [{ id: "c-1", name: "9월 브랜드" }],
      },
    ])
    expectNoSilentDrop(result)
  })

  it("플랜을 적용한 뒤 다시 돌리면 새로 붙일 것이 없다", () => {
    const first = plan(
      [candidate({ campaignId: "g-1", campaignName: "9월 브랜드" })],
      [umbrella("c-1", [], { name: "9월 브랜드" })],
    )
    expect(first.toLink).toHaveLength(1)

    // 적용 결과를 그대로 재입력 — 우산에 링크가 생긴 상태.
    const second = plan(
      [candidate({ campaignId: "g-1", campaignName: "9월 브랜드" })],
      [umbrella("c-1", [link("google_campaign", "g-1", "c-1")], { name: "9월 브랜드" })],
    )
    expect(second.toLink).toEqual([])
    expect(second.alreadyLinked).toHaveLength(1)
  })

  it("오래된 캠페인이라도 이미 링크됐으면 stale 이 아니라 alreadyLinked 로 본다", () => {
    const result = plan(
      [
        candidate({
          campaignId: "g-1",
          campaignName: "작년 캠페인",
          lastActiveDate: daysAgo(400),
        }),
      ],
      [umbrella("c-1", [link("google_campaign", "g-1", "c-1")], { name: "작년 캠페인" })],
    )
    expect(result.skipped).toEqual([])
    expect(result.alreadyLinked).toHaveLength(1)
  })

  it("한 광고 캠페인이 여러 우산에 붙어 있으면 전부 보고한다(링크는 다대다)", () => {
    const result = plan(
      [candidate({ campaignId: "g-1", campaignName: "9월 브랜드" })],
      [
        umbrella("c-1", [link("google_campaign", "g-1", "c-1")], { name: "9월 브랜드" }),
        umbrella("c-2", [link("google_campaign", "g-1", "c-2")], { name: "다른 우산" }),
      ],
    )
    expect(result.alreadyLinked[0].umbrellas.map((u) => u.id)).toEqual(["c-1", "c-2"])
  })
})

describe("buildAdCampaignSyncPlan — 건드리면 안 되는 우산", () => {
  it("Meta 링크가 있는 우산에는 붙이지 않는다(동명이라도 meta-sync 미러를 깨지 않는다)", () => {
    const result = plan(
      [candidate({ campaignId: "g-1", campaignName: "9월 브랜드" })],
      [umbrella("c-1", [link("meta_campaign", "m-1", "c-1")], { name: "9월 브랜드" })],
    )
    expect(result.toLink).toEqual([])
    expect(result.skipped[0].reason).toBe("meta-linked-umbrella")
    expect(result.skipped[0].umbrella).toEqual({ id: "c-1", name: "9월 브랜드" })
    expect(result.skipped[0].detail).toContain("meta-sync")
    expectNoSilentDrop(result)
  })

  it("Meta + 다른 채널이 묶인 크로스채널 우산도 건드리지 않는다", () => {
    const result = plan(
      [candidate({ campaignId: "g-1", campaignName: "9월 브랜드" })],
      [
        umbrella("c-1", [link("meta_campaign", "m-1", "c-1"), link("event", "e-1", "c-1")], {
          name: "9월 브랜드",
        }),
      ],
    )
    expect(result.toLink).toEqual([])
    expect(result.skipped[0].reason).toBe("meta-linked-umbrella")
  })

  it("이메일·문자·행사가 묶인 우산은 cross-channel-umbrella 로 건너뛴다", () => {
    for (const refType of ["email_campaign", "sms_campaign", "event"] as const) {
      const result = plan(
        [candidate({ campaignId: "g-1", campaignName: "9월 브랜드" })],
        [umbrella("c-1", [link(refType, "x-1", "c-1")], { name: "9월 브랜드" })],
      )
      expect(result.toLink).toEqual([])
      expect(result.skipped[0].reason).toBe("cross-channel-umbrella")
    }
  })

  it("완료(done)된 우산에는 새 집행을 붙이지 않는다", () => {
    const result = plan(
      [candidate({ campaignId: "g-1", campaignName: "9월 브랜드" })],
      [umbrella("c-1", [], { name: "9월 브랜드", status: "done" })],
    )
    expect(result.toLink).toEqual([])
    expect(result.skipped[0].reason).toBe("umbrella-done")
  })

  it("계획·진행·일시중지 우산에는 붙인다", () => {
    for (const status of ["planned", "active", "paused"] as const) {
      const result = plan(
        [candidate({ campaignId: "g-1", campaignName: "9월 브랜드" })],
        [umbrella("c-1", [], { name: "9월 브랜드", status })],
      )
      expect(result.toLink).toHaveLength(1)
    }
  })

  it("같은 채널 칸이 이미 찬 우산에는 동명이어도 겹쳐 붙이지 않는다", () => {
    const result = plan(
      [candidate({ campaignId: "g-2", campaignName: "9월 브랜드" })],
      [umbrella("c-1", [link("google_campaign", "g-1", "c-1")], { name: "9월 브랜드" })],
    )
    expect(result.toLink).toEqual([])
    expect(result.skipped[0].reason).toBe("channel-slot-taken")
    expect(result.skipped[0].detail).toContain("Google")
  })

  it("동명 후보 둘이 한 우산을 겨냥하면 하나만 붙고 나머지는 이유와 함께 남는다", () => {
    const result = plan(
      [
        candidate({ campaignId: "g-1", campaignName: "9월 브랜드" }),
        candidate({ campaignId: "g-2", campaignName: "9월 브랜드" }),
      ],
      [umbrella("c-1", [], { name: "9월 브랜드" })],
    )
    expect(result.toLink.map((l) => l.adCampaignId)).toEqual(["g-1"])
    expect(result.skipped.map((s) => [s.adCampaignId, s.reason])).toEqual([
      ["g-2", "channel-slot-taken"],
    ])
    expectNoSilentDrop(result)
  })
})

describe("buildAdCampaignSyncPlan — 집행일 판정", () => {
  it("기준일 이내면 붙이고, 하루라도 넘으면 stale 로 건너뛴다(경계)", () => {
    const campaigns = () => [umbrella("c-1", [], { name: "9월 브랜드" })]
    const onEdge = plan(
      [
        candidate({
          campaignId: "g-1",
          campaignName: "9월 브랜드",
          lastActiveDate: daysAgo(AD_SYNC_STALE_AFTER_DAYS),
        }),
      ],
      campaigns(),
    )
    expect(onEdge.toLink).toHaveLength(1)

    const overEdge = plan(
      [
        candidate({
          campaignId: "g-1",
          campaignName: "9월 브랜드",
          lastActiveDate: daysAgo(AD_SYNC_STALE_AFTER_DAYS + 1),
        }),
      ],
      campaigns(),
    )
    expect(overEdge.toLink).toEqual([])
    expect(overEdge.skipped[0].reason).toBe("stale")
    expect(overEdge.skipped[0].detail).toContain(String(AD_SYNC_STALE_AFTER_DAYS))
  })

  it("집행일이 없으면 no-activity", () => {
    const result = plan(
      [candidate({ campaignId: "g-1", campaignName: "9월 브랜드", lastActiveDate: null })],
      [umbrella("c-1", [], { name: "9월 브랜드" })],
    )
    expect(result.toLink).toEqual([])
    expect(result.skipped[0].reason).toBe("no-activity")
  })

  it("날짜 형식이 아니면 판정을 보류한다(unreadable-date — 안전한 쪽)", () => {
    const badLast = plan(
      [candidate({ campaignId: "g-1", campaignName: "9월 브랜드", lastActiveDate: "2026/09/01" })],
      [umbrella("c-1", [], { name: "9월 브랜드" })],
    )
    expect(badLast.skipped[0].reason).toBe("unreadable-date")

    const badToday = plan(
      [candidate({ campaignId: "g-1", campaignName: "9월 브랜드" })],
      [umbrella("c-1", [], { name: "9월 브랜드" })],
      "오늘",
    )
    expect(badToday.toLink).toEqual([])
    expect(badToday.skipped[0].reason).toBe("unreadable-date")
  })

  it("집행액이 0 이거나 통화를 몰라도 마지막 집행일이 최근이면 붙인다", () => {
    const result = plan(
      [candidate({ campaignId: "g-1", campaignName: "9월 브랜드", spend: 0, currency: null })],
      [umbrella("c-1", [], { name: "9월 브랜드" })],
    )
    expect(result.toLink).toHaveLength(1)
    expect(result.toLink[0].spend).toBe(0)
    expect(result.toLink[0].currency).toBeNull()
  })
})

describe("buildAdCampaignSyncPlan — 채널 분기", () => {
  it("채널이 섞인 후보를 채널별 refType 으로 갈라 붙인다", () => {
    const result = plan(
      [
        candidate({ campaignId: "g-1", channel: "google", campaignName: "9월 브랜드" }),
        candidate({ campaignId: "cmp-1", channel: "naver", campaignName: "9월 검색" }),
      ],
      [umbrella("c-1", [], { name: "9월 브랜드" }), umbrella("c-2", [], { name: "9월 검색" })],
    )
    expect(result.toLink.map((l) => [l.channel, l.refType, l.umbrella.id])).toEqual([
      ["google", "google_campaign", "c-1"],
      ["naver", "naver_campaign", "c-2"],
    ])
    expect(result.byChannel.google.toLink).toBe(1)
    expect(result.byChannel.naver.toLink).toBe(1)
    expectNoSilentDrop(result)
  })

  it("Google 과 네이버는 같은 우산에 함께 붙을 수 있다(다른 채널 칸)", () => {
    const result = plan(
      [
        candidate({ campaignId: "g-1", channel: "google", campaignName: "9월 브랜드" }),
        candidate({ campaignId: "cmp-1", channel: "naver", campaignName: "9월 브랜드" }),
      ],
      [umbrella("c-1", [], { name: "9월 브랜드" })],
    )
    expect(result.toLink.map((l) => l.refType)).toEqual(["google_campaign", "naver_campaign"])
    expect(result.toLink.every((l) => l.umbrella.id === "c-1")).toBe(true)
  })

  it("이미 Google 이 붙은 우산에도 네이버는 붙는다(순서에 무관한 플랜)", () => {
    const result = plan(
      [candidate({ campaignId: "cmp-1", channel: "naver", campaignName: "9월 브랜드" })],
      [umbrella("c-1", [link("google_campaign", "g-1", "c-1")], { name: "9월 브랜드" })],
    )
    expect(result.toLink.map((l) => l.refType)).toEqual(["naver_campaign"])
  })

  it("Meta 후보는 meta-sync 소관이라 여기서 링크하지 않는다", () => {
    const result = plan(
      [candidate({ campaignId: "m-1", channel: "meta", campaignName: "9월 브랜드" })],
      [umbrella("c-1", [], { name: "9월 브랜드" })],
    )
    expect(result.toLink).toEqual([])
    expect(result.skipped[0].reason).toBe("unsupported-channel")
    expect(result.byChannel.meta).toEqual({
      candidates: 1,
      toLink: 0,
      alreadyLinked: 0,
      skipped: 1,
    })
    expectNoSilentDrop(result)
  })

  it("채널이 다르면 같은 ID 라도 다른 후보로 본다", () => {
    const result = plan(
      [
        candidate({ campaignId: "dup", channel: "google", campaignName: "구글" }),
        candidate({ campaignId: "dup", channel: "naver", campaignName: "네이버" }),
      ],
      [umbrella("c-1", [], { name: "구글" }), umbrella("c-2", [], { name: "네이버" })],
    )
    expect(result.toLink).toHaveLength(2)
    expect(result.skipped).toEqual([])
  })
})

describe("buildAdCampaignSyncPlan — 보고 규약", () => {
  it("후보 목록의 중복은 첫 건만 처리하고 나머지는 이유와 함께 남긴다", () => {
    const result = plan(
      [
        candidate({ campaignId: "g-1", campaignName: "9월 브랜드" }),
        candidate({ campaignId: "g-1", campaignName: "9월 브랜드" }),
      ],
      [umbrella("c-1", [], { name: "9월 브랜드" })],
    )
    expect(result.toLink).toHaveLength(1)
    expect(result.skipped.map((s) => s.reason)).toEqual(["duplicate-candidate"])
    expect(result.candidateCount).toBe(2)
    expectNoSilentDrop(result)
  })

  it("캠페인 ID 가 비면 링크하지 않는다", () => {
    const result = plan([candidate({ campaignId: "   ", campaignName: "9월 브랜드" })], [
      umbrella("c-1", [], { name: "9월 브랜드" }),
    ])
    expect(result.toLink).toEqual([])
    expect(result.skipped[0].reason).toBe("invalid-candidate")
  })

  it("여러 이유가 섞여도 모든 후보가 정확히 한 칸에 들어간다", () => {
    const result = plan(
      [
        candidate({ campaignId: "g-link", campaignName: "붙는 것" }),
        candidate({ campaignId: "g-done", campaignName: "닫힌 것" }),
        candidate({ campaignId: "g-meta", campaignName: "메타 미러" }),
        candidate({ campaignId: "g-old", campaignName: "붙는 것2", lastActiveDate: daysAgo(200) }),
        candidate({ campaignId: "g-linked", campaignName: "이미 붙음" }),
        candidate({ campaignId: "g-none", campaignName: "짝 없음" }),
        candidate({ campaignId: "m-1", channel: "meta", campaignName: "붙는 것" }),
      ],
      [
        umbrella("c-link", [], { name: "붙는 것" }),
        umbrella("c-done", [], { name: "닫힌 것", status: "done" }),
        umbrella("c-meta", [link("meta_campaign", "m-9", "c-meta")], { name: "메타 미러" }),
        umbrella("c-old", [], { name: "붙는 것2" }),
        umbrella("c-linked", [link("google_campaign", "g-linked", "c-linked")], {
          name: "이미 붙음",
        }),
      ],
    )
    expect(result.toLink.map((l) => l.adCampaignId)).toEqual(["g-link"])
    expect(result.alreadyLinked.map((l) => l.adCampaignId)).toEqual(["g-linked"])
    expect(result.skipped.map((s) => [s.adCampaignId, s.reason])).toEqual([
      ["g-done", "umbrella-done"],
      ["g-meta", "meta-linked-umbrella"],
      ["g-old", "stale"],
      ["g-none", "no-match"],
      ["m-1", "unsupported-channel"],
    ])
    expect(result.byChannel.google).toEqual({
      candidates: 6,
      toLink: 1,
      alreadyLinked: 1,
      skipped: 4,
    })
    expectNoSilentDrop(result)
  })

  it("입력 배열을 변형하지 않는다(순수 함수)", () => {
    const candidates = [candidate({ campaignId: "g-1", campaignName: "9월 브랜드" })]
    const campaigns = [umbrella("c-1", [], { name: "9월 브랜드" })]
    const snapshot = JSON.stringify({ candidates, campaigns })
    buildAdCampaignSyncPlan({ candidates, campaigns, today: TODAY })
    expect(JSON.stringify({ candidates, campaigns })).toBe(snapshot)
  })
})
