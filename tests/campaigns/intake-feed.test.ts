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

function compass(over: Partial<CompassIntakeLead> = {}): CompassIntakeLead {
  return {
    id: (seq += 1),
    academy: "행복학원",
    name: "김원장",
    phone_key: null,
    region: "서울",
    meta_ad_id: null,
    last_inflow_at: "2026-08-28T04:00:00.000Z",
    ...over,
  }
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

  it("깨진 타임스탬프는 창에 넣지 않는다(0 시각으로 오늘에 끌려들어오지 않게)", () => {
    const result = buildIntakeFeed({
      adminLeads: [lead({ phone: "01011110000", timestamp: "not-a-date" })],
      compassLeads: [compass({ phone_key: "01022220000", last_inflow_at: null })],
      windows,
    })
    expect(result.todayCount).toBe(0)
    expect(result.yesterdayCount).toBe(0)
  })
})
