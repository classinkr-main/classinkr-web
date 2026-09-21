import { describe, expect, it } from "vitest"

import { getLeadCampaignLabel, getLeadAdLabel } from "@/lib/crm/lead-attribution"
import {
  buildAttributionFunnel,
  isChannelIdentified,
  type AttributionFunnel,
} from "@/lib/marketing/attribution-funnel"
import type { LeadRecord } from "@/lib/repositories/leads"

/**
 * 귀속 폭포 — 이 폭포가 틀리면 "광고 귀속이 안 된다"는 오경보로 마케팅이 고칠 수 없는 곳을
 * 파게 된다. 그래서 잠그는 건 합계가 아니라 **경계**다:
 *   단조 감소 불변식 · 분모 0 과 진짜 0% 의 구분 · 채널을 못 말하는 리드의 처리
 */

const lead = (over: Partial<LeadRecord> = {}): LeadRecord => ({
  id: "lead-1",
  source: "demo_modal", // 유입 묶음 homepage → 채널 폴백 라벨 "홈페이지"
  timestamp: "2026-09-10T00:00:00.000Z",
  status: "new",
  ...over,
})

/** 소재까지 이어지는 리드 — 단계별 테스트에서 "끝까지 가는 쪽" 기준선. */
const attributedLead = (over: Partial<LeadRecord> = {}): LeadRecord =>
  lead({
    utm_source: "naver",
    utm_medium: "cpc",
    utm_campaign: "brand",
    utm_content: "banner-a",
    ...over,
  })

const counts = (funnel: AttributionFunnel) => funnel.stages.map((stage) => stage.count)
const retentions = (funnel: AttributionFunnel) => funnel.stages.map((stage) => stage.retentionPct)

describe("buildAttributionFunnel — 빈 입력", () => {
  const funnel = buildAttributionFunnel([])

  it("단계는 항상 5개, 순서 고정", () => {
    expect(funnel.stages.map((stage) => stage.key)).toEqual([
      "total",
      "tracked",
      "channel",
      "campaign",
      "creative",
    ])
  })

  it("전 단계 0, 비율은 전부 null — 0% 가 아니다", () => {
    expect(counts(funnel)).toEqual([0, 0, 0, 0, 0])
    expect(retentions(funnel)).toEqual([null, null, null, null, null])
    // 0 과 null 을 같게 보면 "아무도 안 남았다"와 "셀 대상이 없다"가 한 칸이 된다.
    for (const pct of retentions(funnel)) expect(pct).not.toBe(0)
  })

  it("drop 은 전부 0, 채널 분해는 빈 배열, end-to-end 는 null", () => {
    expect(funnel.stages.map((stage) => stage.drop)).toEqual([0, 0, 0, 0, 0])
    expect(funnel.byChannel).toEqual([])
    expect(funnel.endToEndPct).toBeNull()
  })
})

describe("buildAttributionFunnel — 테스트 리드 제외", () => {
  it("총 리드에서부터 뺀다 — 귀속이 완벽해도 세지 않는다", () => {
    const funnel = buildAttributionFunnel([
      attributedLead({ id: "real" }),
      attributedLead({ id: "t1", email: "test@meta.com" }),
      attributedLead({ id: "t2", email: "test+e2e@classin.com" }),
      attributedLead({ id: "t3", name: "<Test Lead: dummy data>" }),
      attributedLead({ id: "t4", org: "<test lead: dummy data>" }),
    ])
    // 제외가 tracked 단계에서 일어났다면 total 이 5 로 남는다 — 분모가 오염된다.
    expect(counts(funnel)).toEqual([1, 1, 1, 1, 1])
    expect(funnel.endToEndPct).toBe(100)
  })

  it("상호에 '테스트'가 들어간 진짜 학원은 세어야 한다 — 판정을 넓히지 않았음을 잠근다", () => {
    const funnel = buildAttributionFunnel([
      attributedLead({ id: "real", org: "테스트베드 아카데미" }),
    ])
    expect(counts(funnel)[0]).toBe(1)
  })
})

describe("buildAttributionFunnel — 단조 감소 불변식", () => {
  // 단계마다 정확히 한 종류씩 떨어지도록 배치한 명시적 케이스(무작위 없음).
  const leads = [
    lead({ id: "l1" }), // 신호 없음 → tracked 에서 탈락
    lead({ id: "l2", lead_magnet: "학원운영가이드" }), // 신호는 있으나 채널 못 말함
    lead({ id: "l3", utm_medium: "cpc" }), // 매체만 있음 → 채널 아님
    lead({ id: "l4", gclid: "gclid-1" }), // 채널까지 (캠페인 없음)
    lead({ id: "l5", utm_source: "google", utm_campaign: "brand" }), // 캠페인까지 (소재 없음)
    attributedLead({ id: "l6" }), // 소재까지
  ]
  const funnel = buildAttributionFunnel(leads)

  it("단계 수가 한 번도 늘지 않는다", () => {
    expect(counts(funnel)).toEqual([6, 5, 3, 2, 1])
    funnel.stages.forEach((stage, index) => {
      if (index === 0) return
      expect(stage.count).toBeLessThanOrEqual(funnel.stages[index - 1].count)
    })
  })

  it("drop 은 직전 단계와의 차이고, 합이 총 − 소재와 같다", () => {
    expect(funnel.stages.map((stage) => stage.drop)).toEqual([0, 1, 2, 1, 1])
    const dropSum = funnel.stages.reduce((sum, stage) => sum + stage.drop, 0)
    expect(dropSum).toBe(counts(funnel)[0] - counts(funnel)[4])
  })

  it("잔존율은 직전 단계 대비 — 첫 단계만 null", () => {
    // 5/6 · 3/5 · 2/3 · 1/2 — 소수 한 자리까지 남긴다(정수 반올림은 0.x% 를 0% 로 만든다).
    expect(retentions(funnel)).toEqual([null, 83.3, 60, 66.7, 50])
    expect(funnel.endToEndPct).toBe(16.7) // 1/6
  })
})

describe("buildAttributionFunnel — 분모 0 과 진짜 0%", () => {
  it("셀 대상이 없어 못 낸 비율(null)과 실제로 아무도 안 남은 0% 를 구분한다", () => {
    const funnel = buildAttributionFunnel([lead({ id: "a" }), lead({ id: "b" }), lead({ id: "c" })])
    expect(counts(funnel)).toEqual([3, 0, 0, 0, 0])
    // tracked 는 분모 3 에 잔존 0 — 진짜 0% 다. 그 아래는 분모가 0 이라 null.
    expect(retentions(funnel)).toEqual([null, 0, null, null, null])
    // 총 리드가 있으므로 end-to-end 는 null 이 아니라 0 — "한 건도 못 이었다"는 사실이다.
    expect(funnel.endToEndPct).toBe(0)
  })
})

describe("isChannelIdentified — 무엇을 '채널 식별됨'으로 치는가", () => {
  it("utm_source 가 있으면 식별 — 유입 묶음과 무관하다", () => {
    expect(isChannelIdentified(lead({ utm_source: "naver" }))).toBe(true)
    // 채널톡으로 들어왔어도 utm 이 붙어 있으면 캠페인 성과에 귀속돼야 한다.
    expect(isChannelIdentified(lead({ source: "channel_talk", utm_source: "kakao" }))).toBe(true)
  })

  it("utm_medium 단독은 미식별 — 'cpc' 는 매체이지 채널이 아니다", () => {
    expect(isChannelIdentified(lead({ utm_medium: "cpc" }))).toBe(false)
  })

  it("라벨 분기가 있는 클릭ID(gclid·fbclid·네이버 n_*)는 식별", () => {
    expect(isChannelIdentified(lead({ gclid: "g-1" }))).toBe(true)
    expect(isChannelIdentified(lead({ fbclid: "f-1" }))).toBe(true)
    expect(isChannelIdentified(lead({ naver_ad: { n_ad: "ad-77" } }))).toBe(true)
    expect(isChannelIdentified(lead({ naver_ad: { n_campaign_type: "파워링크" } }))).toBe(true)
  })

  it("클릭ID 가 있어도 라벨이 유입 묶음으로 떨어지면 미식별", () => {
    // hasAdClickId 는 참이지만 getLeadChannelLabel 에 분기가 없어 "홈페이지"로 떨어진다.
    // 이걸 식별됨으로 세면 채널 분해에 채널이 아닌 라벨이 올라간다.
    expect(isChannelIdentified(lead({ msclkid: "ms-1" }))).toBe(false)
    expect(isChannelIdentified(lead({ ttclid: "tt-1" }))).toBe(false)
    // 네이버 묶음이 표시 축(n_ad·n_ad_group·n_keyword·n_campaign_type) 없이 온 경우도 같다.
    expect(isChannelIdentified(lead({ naver_ad: { n_media: "naver" } }))).toBe(false)
  })

  it("Meta 리드애즈는 유입 묶음만으로 식별 — 그 묶음이 광고 플랫폼 자체다", () => {
    // 사용자가 우리 사이트를 거치지 않아 utm_source·클릭ID 가 붙을 방법이 없다.
    // 예외가 없으면 캠페인·광고명이 멀쩡히 있는 리드가 채널 단계에서 전멸한다.
    expect(isChannelIdentified(lead({ source: "meta_lead_ads", utm_campaign: "HW_전자칠판" }))).toBe(
      true
    )
  })

  it("우리 쪽 유입 표면 묶음은 폴백으로 떨어지면 미식별", () => {
    for (const source of ["demo_modal", "resource_pdf_download", "newsletter", "admin_manual"]) {
      expect(isChannelIdentified(lead({ source, lead_magnet: "학원운영가이드" }))).toBe(false)
    }
  })
})

describe("buildAttributionFunnel — 신호는 있는데 채널을 못 말하는 리드", () => {
  const unidentifiable: Array<[string, Partial<LeadRecord>]> = [
    ["리드마그넷만", { lead_magnet: "학원운영가이드" }],
    ["랜딩만", { landing_page: "https://classin.co.kr/pricing?x=1" }],
    ["utm_medium 만", { utm_medium: "cpc" }],
    ["msclkid 만", { msclkid: "ms-1" }],
    ["ttclid 만", { ttclid: "tt-1" }],
    ["네이버 n_media 만", { naver_ad: { n_media: "naver" } }],
  ]

  for (const [name, patch] of unidentifiable) {
    it(`${name} — tracked 까지만 오르고 채널 분해에는 안 뜬다`, () => {
      const funnel = buildAttributionFunnel([lead(patch)])
      expect(counts(funnel)).toEqual([1, 1, 0, 0, 0])
      // 미식별을 '기타'로 접어 채널 분해에 올리지 않는다 — 있지도 않은 채널이 생긴다.
      expect(funnel.byChannel).toEqual([])
      expect(funnel.endToEndPct).toBe(0)
    })
  }

  it("캠페인은 말할 수 있어도 채널을 못 말하면 캠페인 단계로 못 내려간다", () => {
    const orphan = lead({ utm_campaign: "spring-sale" })
    // 라벨 자체는 있다 — 단계가 독립 집계였다면 campaign > channel 이 됐을 자리다.
    expect(getLeadCampaignLabel(orphan)).toBe("spring-sale")
    const funnel = buildAttributionFunnel([orphan])
    expect(counts(funnel)).toEqual([1, 1, 0, 0, 0])
  })
})

describe("buildAttributionFunnel — 채널별 경로", () => {
  it("gclid 만 — 채널까지만 (캠페인을 말할 근거가 없다)", () => {
    const funnel = buildAttributionFunnel([lead({ gclid: "g-1" })])
    expect(counts(funnel)).toEqual([1, 1, 1, 0, 0])
    expect(funnel.byChannel).toEqual([{ channel: "google / cpc", count: 1 }])
    expect(funnel.endToEndPct).toBe(0)
  })

  it("네이버 n_* 만 — 유형이 캠페인, 소재 축이 광고가 된다", () => {
    const naverLead = lead({ naver_ad: { n_campaign_type: "파워링크", n_ad: "ad-77" } })
    const funnel = buildAttributionFunnel([naverLead])
    expect(counts(funnel)).toEqual([1, 1, 1, 1, 1])
    expect(funnel.byChannel).toEqual([{ channel: "naver / cpc", count: 1 }])
    // 네이버는 캠페인'명'을 안 넘긴다 — 유형에 접두가 붙은 라벨이 그대로 실린다.
    expect(getLeadCampaignLabel(naverLead)).toBe("네이버 파워링크")
  })

  it("네이버가 표시 축만 있고 유형이 없으면 캠페인에서 끊긴다", () => {
    const funnel = buildAttributionFunnel([lead({ naver_ad: { n_keyword: "학원관리프로그램" } })])
    expect(counts(funnel)).toEqual([1, 1, 1, 0, 0])
  })

  it("utm 만 — 소재까지 이어진다", () => {
    const funnel = buildAttributionFunnel([attributedLead()])
    expect(counts(funnel)).toEqual([1, 1, 1, 1, 1])
    expect(funnel.byChannel).toEqual([{ channel: "naver / cpc", count: 1 }])
    expect(funnel.endToEndPct).toBe(100)
  })

  it("utm_source 만 있고 캠페인이 없으면 채널에서 끊긴다", () => {
    const funnel = buildAttributionFunnel([lead({ utm_source: "google" })])
    expect(counts(funnel)).toEqual([1, 1, 1, 0, 0])
    expect(funnel.byChannel).toEqual([{ channel: "google", count: 1 }])
  })

  it("Meta 리드애즈 — 구조화 필드든 구버전 message 든 소재까지 이어진다", () => {
    const structured = lead({
      id: "meta-new",
      source: "meta_lead_ads",
      utm_campaign: "HW_전자칠판",
      utm_term: "adset-1",
      utm_content: "ad-1",
    })
    const legacy = lead({
      id: "meta-old",
      source: "meta_lead_ads",
      utm_campaign: "레거시캠페인",
      message: "campaign=레거시캠페인\nadset=세트A\nad=광고B",
    })
    expect(getLeadAdLabel(legacy)).toBe("광고B")

    const funnel = buildAttributionFunnel([structured, legacy])
    expect(counts(funnel)).toEqual([2, 2, 2, 2, 2])
    expect(funnel.byChannel).toEqual([{ channel: "메타", count: 2 }])
  })

  it("Meta 리드애즈여도 트래킹 신호가 아예 없으면 tracked 에서 끊긴다", () => {
    // 묶음 예외는 채널 단계의 판정일 뿐 — 상위 단계를 건너뛰게 해 주지 않는다.
    const funnel = buildAttributionFunnel([lead({ source: "meta_lead_ads" })])
    expect(counts(funnel)).toEqual([1, 0, 0, 0, 0])
  })
})

describe("buildAttributionFunnel — 채널 분해", () => {
  const leads = [
    ...Array.from({ length: 3 }, (_, i) => attributedLead({ id: `naver-${i}` })),
    ...Array.from({ length: 2 }, (_, i) => lead({ id: `google-${i}`, gclid: `g-${i}` })),
    ...Array.from({ length: 2 }, (_, i) => lead({ id: `meta-${i}`, fbclid: `f-${i}` })),
    lead({ id: "no-signal" }),
    lead({ id: "no-channel", lead_magnet: "학원운영가이드" }),
  ]
  const funnel = buildAttributionFunnel(leads)

  it("많은 순 정렬, 동률이면 라벨 오름차순", () => {
    expect(funnel.byChannel).toEqual([
      { channel: "naver / cpc", count: 3 },
      // 2 로 동률 — 라벨 오름차순이라 google 이 meta 보다 앞이다(정렬이 흔들리지 않게).
      { channel: "google / cpc", count: 2 },
      { channel: "meta / paid", count: 2 },
    ])
  })

  it("채널 분해 합이 채널 단계 수와 같다 — 미식별이 새어 들어오지 않는다", () => {
    const sum = funnel.byChannel.reduce((acc, row) => acc + row.count, 0)
    expect(sum).toBe(counts(funnel)[2])
    // 캠페인 이후로는 utm 리드 3건만 남는다 — 클릭ID 만 있는 리드는 캠페인을 말할 수 없다.
    expect(counts(funnel)).toEqual([9, 8, 7, 3, 3])
  })
})
