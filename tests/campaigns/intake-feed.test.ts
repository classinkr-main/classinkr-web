import { describe, expect, it } from "vitest"
import {
  buildIntakeFeed,
  resolveIntakeWindows,
  type CompassIntakeLead,
  type IntakeWindows,
} from "@/lib/marketing/intake-feed"
import type { LeadRecord } from "@/lib/repositories/leads"

// 기준 시각: 2026-08-28 14:30 KST = 2026-08-28T05:30Z.
const NOW = new Date("2026-08-28T05:30:00.000Z")

let seq = 0
function lead(over: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: `lead-${(seq += 1)}`,
    source: "meta_lead_ads",
    timestamp: "2026-08-28T04:00:00.000Z",
    status: "new",
    ...over,
  }
}

/** 기본값은 오래전에 생성돼 오늘 재유입한 Compass 리드(2026-09-14 이전 테스트가 전제한 모양). */
function compass(over: Partial<CompassIntakeLead> = {}): CompassIntakeLead {
  return {
    id: (seq += 1),
    academy: "행복학원",
    name: "김원장",
    phone_key: null,
    region: "서울",
    meta_ad_id: null,
    created_at: "2026-07-01T00:00:00.000Z",
    last_inflow_at: "2026-08-28T04:00:00.000Z",
    ...over,
  }
}

/** 오늘 생성된 Compass 신규 리드 — Compass 는 신규 insert 때 last_inflow_at 을 비워 둔다. */
function compassNew(over: Partial<CompassIntakeLead> = {}): CompassIntakeLead {
  return compass({ created_at: "2026-08-28T03:00:00.000Z", last_inflow_at: null, ...over })
}

describe("resolveIntakeWindows", () => {
  it("KST 자정 경계 — 오늘/어제 시작을 +09:00 기준으로 잡는다", () => {
    const w = resolveIntakeWindows(NOW)
    expect(w.todayKst).toBe("2026-08-28")
    expect(w.yesterdayKst).toBe("2026-08-27")
    // KST 8/28 00:00 = UTC 8/27 15:00 — 서버 TZ 와 무관해야 한다.
    expect(w.todayStartIso).toBe("2026-08-27T15:00:00.000Z")
    expect(w.yesterdayStartIso).toBe("2026-08-26T15:00:00.000Z")
    expect(w.yesterdaySameTimeIso).toBe("2026-08-27T05:30:00.000Z")
  })

  it("KST 자정 직후(UTC 로는 전날)에도 오늘 일자가 밀리지 않는다", () => {
    // 2026-08-28 00:10 KST = 2026-08-27T15:10Z
    const w = resolveIntakeWindows(new Date("2026-08-27T15:10:00.000Z"))
    expect(w.todayKst).toBe("2026-08-28")
    expect(w.todayStartIso).toBe("2026-08-27T15:00:00.000Z")
  })
})

describe("buildIntakeFeed", () => {
  const windows: IntakeWindows = resolveIntakeWindows(NOW)

  it("두 원천이 같은 전화면 1건으로 접고 접힌 수를 밝힌다", () => {
    const result = buildIntakeFeed({
      adminLeads: [lead({ phone: "010-1234-5678", name: "김원장", org: "행복학원" })],
      compassLeads: [compass({ phone_key: "01012345678", region: "서울" })],
      windows,
    })
    expect(result.todayCount).toBe(1)
    expect(result.overlapCount).toBe(1)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].origins).toEqual(["admin", "compass"])
    // 어드민에 없는 지역은 Compass 쪽에서 채운다.
    expect(result.items[0].region).toBe("서울")
  })

  it("국가코드 표기가 달라도 같은 번호면 접힌다(normalizePhoneKey 규칙 공유)", () => {
    const result = buildIntakeFeed({
      adminLeads: [lead({ phone: "+82 10-1234-5678" })],
      compassLeads: [compass({ phone_key: "01012345678" })],
      windows,
    })
    expect(result.todayCount).toBe(1)
  })

  it("전화가 없으면 접지 않는다 — 다른 사람을 합치지 않는다", () => {
    const result = buildIntakeFeed({
      adminLeads: [lead({ name: "김원장", org: "행복학원" })],
      compassLeads: [compass({ phone_key: null, name: "김원장", academy: "행복학원" })],
      windows,
    })
    expect(result.todayCount).toBe(2)
    expect(result.overlapCount).toBe(0)
  })

  it("어제 같은 시각까지만 비교 창에 넣는다(어제 오후는 제외)", () => {
    const result = buildIntakeFeed({
      adminLeads: [
        lead({ phone: "01011110000", timestamp: "2026-08-28T04:00:00.000Z" }), // 오늘
        lead({ phone: "01022220000", timestamp: "2026-08-27T03:00:00.000Z" }), // 어제 12:00 KST
        lead({ phone: "01033330000", timestamp: "2026-08-27T08:00:00.000Z" }), // 어제 17:00 KST — 창 밖
      ],
      compassLeads: [],
      windows,
    })
    expect(result.todayCount).toBe(1)
    expect(result.yesterdayCount).toBe(1)
    expect(result.delta).toBe(0)
  })

  it("델타는 today − yesterday, 두 원천 다 미측정이면 null", () => {
    const measured = buildIntakeFeed({
      adminLeads: [lead({ phone: "01011110000" }), lead({ phone: "01022220000" })],
      compassLeads: [],
      windows,
    })
    expect(measured.delta).toBe(2)

    const unmeasured = buildIntakeFeed({ adminLeads: null, compassLeads: null, windows })
    expect(unmeasured.delta).toBeNull()
    expect(unmeasured.adminMeasured).toBe(false)
    expect(unmeasured.compassMeasured).toBe(false)
  })

  it("한쪽 원천만 죽어도 남은 쪽으로 세되 미측정을 표시한다", () => {
    const result = buildIntakeFeed({
      adminLeads: null,
      compassLeads: [compass({ phone_key: "01012345678" })],
      windows,
    })
    expect(result.todayCount).toBe(1)
    expect(result.adminMeasured).toBe(false)
    expect(result.compassMeasured).toBe(true)
    expect(result.delta).toBe(1)
  })

  it("테스트 리드는 세지 않는다(대시보드 리드 집계와 동일 기준)", () => {
    const result = buildIntakeFeed({
      adminLeads: [
        lead({ email: "test@meta.com", phone: "01011110000" }),
        lead({ org: "<test lead: dummy data>", phone: "01022220000" }),
        lead({ phone: "01033330000" }),
      ],
      compassLeads: [],
      windows,
    })
    expect(result.todayCount).toBe(1)
  })

  it("피드는 최근순이고 maxItems 로 자른다 — 접힌 항목은 최초 유입 시각을 쓴다", () => {
    const result = buildIntakeFeed({
      adminLeads: [
        lead({ phone: "01011110000", timestamp: "2026-08-28T01:00:00.000Z", org: "이른학원" }),
        lead({ phone: "01022220000", timestamp: "2026-08-28T05:00:00.000Z", org: "늦은학원" }),
      ],
      compassLeads: [
        // 같은 사람을 Compass 가 더 늦게 기록 — 늦은 쪽을 쓰면 "방금 들어온 리드"로 오독된다.
        compass({ phone_key: "01011110000", last_inflow_at: "2026-08-28T05:20:00.000Z" }),
      ],
      windows,
      maxItems: 2,
    })
    expect(result.items.map((i) => i.org)).toEqual(["늦은학원", "이른학원"])
    expect(result.items[1].at).toBe("2026-08-28T01:00:00.000Z")
  })

  it("광고명은 우리 UTM 우선, 없으면 Compass 광고 ID 매핑, 그래도 없으면 채널", () => {
    const result = buildIntakeFeed({
      adminLeads: [
        lead({ phone: "01011110000", utm_content: "여름_원장ROI_A" }),
      ],
      compassLeads: [
        compass({ id: 91, phone_key: "01022220000", meta_ad_id: "ad-9", channel: "네이버" }),
        compass({ id: 92, phone_key: "01033330000", meta_ad_id: null, channel: "네이버" }),
      ],
      windows,
      adNameById: new Map([["ad-9", "가을_체험_B"]]),
    })
    const byAd = new Map(result.items.map((item) => [item.adName, item]))
    expect([...byAd.keys()].sort()).toEqual(["가을_체험_B", "네이버", "여름_원장ROI_A"])
    // Compass 항목의 표시 키는 Compass 레코드 id 기반이어야 한다(전화번호 아님).
    expect(byAd.get("가을_체험_B")?.key).toBe("c:91")
    expect(byAd.get("네이버")?.key).toBe("c:92")
  })

  it("표시 키에 전화번호를 싣지 않는다 (응답·DOM 으로 PII 유출 금지)", () => {
    const result = buildIntakeFeed({
      adminLeads: [lead({ id: "lead-abc", phone: "010-1234-5678" })],
      compassLeads: [],
      windows,
    })
    expect(result.items[0].key).toBe("a:lead-abc")
    expect(JSON.stringify(result.items)).not.toContain("01012345678")
  })

  it("Compass 조회 상한 플래그를 그대로 전달한다 (어제 비교 신뢰도 경고)", () => {
    const result = buildIntakeFeed({
      adminLeads: [],
      compassLeads: [],
      windows,
      compassTruncated: true,
    })
    expect(result.compassTruncated).toBe(true)
  })

  it("F12 회귀: Compass 신규 리드(last_inflow_at null)를 오늘 유입으로 센다 — 재유입 표시 없음", () => {
    const result = buildIntakeFeed({
      adminLeads: [],
      compassLeads: [compassNew({ id: 501, phone_key: "01044440000" })],
      windows,
    })
    expect(result.todayCount).toBe(1)
    expect(result.todayReinflowCount).toBe(0)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ key: "c:501", at: "2026-08-28T03:00:00.000Z", reinflow: false })
  })

  it("신규와 재유입을 함께 세고 재유입을 구분한다", () => {
    const result = buildIntakeFeed({
      adminLeads: [lead({ phone: "01055550000" })],
      compassLeads: [
        compassNew({ id: 601, phone_key: "01066660000" }),
        compass({ id: 602, phone_key: "01077770000", last_inflow_at: "2026-08-28T05:00:00.000Z" }),
      ],
      windows,
    })
    expect(result.todayCount).toBe(3)
    expect(result.todayReinflowCount).toBe(1)
    const byKey = new Map(result.items.map((item) => [item.key, item]))
    expect(byKey.get("c:601")?.reinflow).toBe(false)
    expect(byKey.get("c:602")?.reinflow).toBe(true)
    expect(byKey.get("c:602")?.at).toBe("2026-08-28T05:00:00.000Z")
    expect([...byKey.values()].filter((item) => item.key.startsWith("a:")).every((item) => !item.reinflow)).toBe(true)
  })

  it("어제 생성되고 오늘 재유입한 리드는 어제엔 신규, 오늘엔 재유입으로 각각 1건", () => {
    const result = buildIntakeFeed({
      adminLeads: [],
      compassLeads: [
        compass({ id: 701, phone_key: "01088880000", created_at: "2026-08-27T02:00:00.000Z", last_inflow_at: "2026-08-28T02:00:00.000Z" }),
      ],
      windows,
    })
    expect(result.todayCount).toBe(1)
    expect(result.yesterdayCount).toBe(1)
    expect(result.todayReinflowCount).toBe(1)
    expect(result.delta).toBe(0)
  })

  it("오늘 생성 뒤 오늘 다시 들어온 리드는 신규 1건 — 최초 유입 시각", () => {
    const result = buildIntakeFeed({
      adminLeads: [],
      compassLeads: [compass({ id: 801, created_at: "2026-08-28T01:00:00.000Z", last_inflow_at: "2026-08-28T05:00:00.000Z" })],
      windows,
    })
    expect(result.todayCount).toBe(1)
    expect(result.todayReinflowCount).toBe(0)
    expect(result.items[0]).toMatchObject({ at: "2026-08-28T01:00:00.000Z", reinflow: false })
  })

  it("어드민 신규와 Compass 재유입이 같은 전화면 1건으로 접고 재유입으로 표시한다", () => {
    const result = buildIntakeFeed({
      adminLeads: [lead({ phone: "010-9999-0000", timestamp: "2026-08-28T04:30:00.000Z" })],
      compassLeads: [compass({ phone_key: "01099990000", last_inflow_at: "2026-08-28T04:00:00.000Z" })],
      windows,
    })
    expect(result.todayCount).toBe(1)
    expect(result.overlapCount).toBe(1)
    expect(result.todayReinflowCount).toBe(1)
    expect(result.items[0]).toMatchObject({ origins: ["admin", "compass"], reinflow: true, at: "2026-08-28T04:00:00.000Z" })
  })

  it("Compass 어제 신규도 어제 같은 시각 창으로 비교한다", () => {
    const result = buildIntakeFeed({
      adminLeads: [],
      compassLeads: [
        compassNew({ phone_key: "01012120000", created_at: "2026-08-27T03:00:00.000Z" }), // 어제 12:00 KST
        compassNew({ phone_key: "01013130000", created_at: "2026-08-27T08:00:00.000Z" }), // 어제 17:00 KST — 창 밖
      ],
      windows,
    })
    expect(result.todayCount).toBe(0)
    expect(result.yesterdayCount).toBe(1)
  })

  it("Compass 인바운드(채널톡·다이렉트·워크인·소개) 리드는 세지 않는다 — Compass 마케팅 유입(mktLeadCond)과 같은 규칙", () => {
    const result = buildIntakeFeed({
      adminLeads: [],
      compassLeads: [
        compassNew({ id: 901, phone_key: "01010200001", channel: "walkin" }),
        compassNew({ id: 902, phone_key: "01010200002", channel: "channeltalk" }),
        compassNew({ id: 903, phone_key: "01010200003", channel: "direct" }),
        compass({ id: 904, phone_key: "01010200004", channel: "referral" }), // 재유입이어도 인바운드면 제외
        compassNew({ id: 905, phone_key: "01010200005", channel: "referral", created_at: "2026-08-27T02:00:00.000Z" }), // 어제
        // 마케팅: 채널 없음(메타 리드)·빈 값·프로모션(sms·email)
        compassNew({ id: 911, phone_key: "01010200011", channel: null }),
        compassNew({ id: 912, phone_key: "01010200012", channel: "" }),
        compassNew({ id: 913, phone_key: "01010200013", channel: "sms" }),
        compass({ id: 914, phone_key: "01010200014", channel: "email" }),
        compassNew({ id: 915, phone_key: "01010200015" }), // channel 필드 없음
      ],
      windows,
      maxItems: 20,
    })
    expect(result.items.map((item) => item.key).sort()).toEqual(["c:911", "c:912", "c:913", "c:914", "c:915"])
    expect(result.todayCount).toBe(5)
    expect(result.todayReinflowCount).toBe(1)
    expect(result.yesterdayCount).toBe(0)
    expect(result.delta).toBe(5)
  })

  it("인바운드 Compass 리드와 같은 전화의 어드민 리드는 어드민 원천 1건으로 남는다(접히지 않고, 사라지지도 않는다)", () => {
    const result = buildIntakeFeed({
      adminLeads: [lead({ id: "lead-walkin", phone: "010-1020-0100" })],
      compassLeads: [compassNew({ id: 920, phone_key: "01010200100", channel: "walkin" })],
      windows,
    })
    expect(result.todayCount).toBe(1)
    expect(result.overlapCount).toBe(0)
    expect(result.items[0]).toMatchObject({ key: "a:lead-walkin", origins: ["admin"], compassLeadId: null, reinflow: false })
  })

  // 2026-09-21 — 응대 대상 소스의 재문의는 새 행 대신 기존 행의 last_inflow_at 만 갱신한다(재유입 병합).
  // 생성 시각만 보면 오늘 재문의한 기존 리드가 "오늘 유입"에서 통째로 빠진다.
  it("재문의 병합: 예전에 생성되고 오늘 재문의한 어드민 리드를 오늘 재유입으로 센다", () => {
    const result = buildIntakeFeed({
      adminLeads: [
        lead({
          id: "lead-again",
          phone: "010-4545-0000",
          org: "다시학원",
          timestamp: "2026-07-01T00:00:00.000Z",
          last_inflow_at: "2026-08-28T05:10:00.000Z",
        }),
      ],
      compassLeads: [],
      windows,
    })
    expect(result.todayCount).toBe(1)
    expect(result.todayReinflowCount).toBe(1)
    expect(result.yesterdayCount).toBe(0)
    expect(result.items[0]).toMatchObject({
      key: "a:lead-again",
      org: "다시학원",
      origins: ["admin"],
      reinflow: true,
      at: "2026-08-28T05:10:00.000Z",
    })
  })

  it("어드민 신규와 재문의를 함께 세고 재유입만 표시한다 — 백필(두 값이 같음)은 재유입이 아니다", () => {
    const result = buildIntakeFeed({
      adminLeads: [
        // 오늘 신규 — 저장 경로가 last_inflow_at 을 생성 시각으로 채운다.
        lead({ id: "lead-new", phone: "01046460000", timestamp: "2026-08-28T02:00:00.000Z", last_inflow_at: "2026-08-28T02:00:00.000Z" }),
        // 오늘 재문의
        lead({ id: "lead-re", phone: "01047470000", timestamp: "2026-08-01T02:00:00.000Z", last_inflow_at: "2026-08-28T03:00:00.000Z" }),
        // 옛 리드(백필) — 오늘 유입이 아니다.
        lead({ id: "lead-old", phone: "01048480000", timestamp: "2026-08-01T02:00:00.000Z", last_inflow_at: "2026-08-01T02:00:00.000Z" }),
      ],
      compassLeads: [],
      windows,
    })
    expect(result.todayCount).toBe(2)
    expect(result.todayReinflowCount).toBe(1)
    const byKey = new Map(result.items.map((item) => [item.key, item]))
    expect(byKey.get("a:lead-new")?.reinflow).toBe(false)
    expect(byKey.get("a:lead-re")?.reinflow).toBe(true)
    expect(byKey.has("a:lead-old")).toBe(false)
  })

  it("오늘 생성 뒤 오늘 재문의한 어드민 리드는 신규 1건 — 최초 유입 시각", () => {
    const result = buildIntakeFeed({
      adminLeads: [
        lead({ id: "lead-twice", phone: "01049490000", timestamp: "2026-08-28T01:00:00.000Z", last_inflow_at: "2026-08-28T05:00:00.000Z" }),
      ],
      compassLeads: [],
      windows,
    })
    expect(result.todayCount).toBe(1)
    expect(result.todayReinflowCount).toBe(0)
    expect(result.items[0]).toMatchObject({ key: "a:lead-twice", reinflow: false, at: "2026-08-28T01:00:00.000Z" })
  })

  it("어제 생성되고 오늘 재문의한 어드민 리드는 어제엔 신규, 오늘엔 재유입으로 각각 1건", () => {
    const result = buildIntakeFeed({
      adminLeads: [
        lead({ id: "lead-y", phone: "01050500000", timestamp: "2026-08-27T02:00:00.000Z", last_inflow_at: "2026-08-28T02:00:00.000Z" }),
      ],
      compassLeads: [],
      windows,
    })
    expect(result.todayCount).toBe(1)
    expect(result.todayReinflowCount).toBe(1)
    expect(result.yesterdayCount).toBe(1)
    expect(result.delta).toBe(0)
  })

  it("어제 같은 시각 이후의 재문의는 어제 비교 창에 넣지 않는다", () => {
    const result = buildIntakeFeed({
      adminLeads: [
        // 어제 17:00 KST 재문의 — 어제 창(~14:30 KST) 밖, 오늘 창 밖.
        lead({ phone: "01051510000", timestamp: "2026-07-01T00:00:00.000Z", last_inflow_at: "2026-08-27T08:00:00.000Z" }),
        // 어제 12:00 KST 재문의 — 어제 창 안.
        lead({ phone: "01052520000", timestamp: "2026-07-01T00:00:00.000Z", last_inflow_at: "2026-08-27T03:00:00.000Z" }),
      ],
      compassLeads: [],
      windows,
    })
    expect(result.todayCount).toBe(0)
    expect(result.yesterdayCount).toBe(1)
  })

  it("어드민 재문의와 Compass 신규가 같은 전화면 1건으로 접고 재유입으로 표시한다", () => {
    const result = buildIntakeFeed({
      adminLeads: [
        lead({ id: "lead-fold", phone: "010-5353-0000", timestamp: "2026-07-01T00:00:00.000Z", last_inflow_at: "2026-08-28T04:30:00.000Z" }),
      ],
      compassLeads: [compassNew({ id: 950, phone_key: "01053530000", created_at: "2026-08-28T04:00:00.000Z" })],
      windows,
    })
    expect(result.todayCount).toBe(1)
    expect(result.overlapCount).toBe(1)
    expect(result.todayReinflowCount).toBe(1)
    expect(result.items[0]).toMatchObject({
      origins: ["admin", "compass"],
      reinflow: true,
      at: "2026-08-28T04:00:00.000Z",
    })
  })

  it("재문의 스탬프라도 테스트 리드는 세지 않는다", () => {
    const result = buildIntakeFeed({
      adminLeads: [
        lead({ email: "test@meta.com", phone: "01054540000", timestamp: "2026-07-01T00:00:00.000Z", last_inflow_at: "2026-08-28T04:00:00.000Z" }),
      ],
      compassLeads: [],
      windows,
    })
    expect(result.todayCount).toBe(0)
    expect(result.todayReinflowCount).toBe(0)
  })

  it("깨진 타임스탬프는 창에 넣지 않는다(0 시각으로 오늘에 끌려들어오지 않게)", () => {
    const result = buildIntakeFeed({
      adminLeads: [lead({ phone: "01011110000", timestamp: "not-a-date" })],
      compassLeads: [
        compass({ phone_key: "01022220000", last_inflow_at: null }),
        compass({ phone_key: "01033330000", created_at: "not-a-date", last_inflow_at: null }),
      ],
      windows,
    })
    expect(result.todayCount).toBe(0)
    expect(result.yesterdayCount).toBe(0)
  })
})
