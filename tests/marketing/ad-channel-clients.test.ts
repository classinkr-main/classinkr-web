import { describe, expect, it } from "vitest"

import {
  buildDailyInsightsQuery,
  mapGoogleAdsRow,
  normalizeCustomerId,
} from "@/lib/google/ads"
import {
  chunk,
  enumerateDates,
  mapStatRows,
  signRequest,
} from "@/lib/naver/searchad"

/**
 * 광고 플랫폼 클라이언트의 **순수 부분**만 잠근다. 네트워크가 없는 함수들이지만,
 * 여기 있는 규칙은 전부 "틀려도 조용히 지나가고 화면에는 틀린 숫자가 뜨는" 종류다:
 *  · cost_micros 나눗셈을 빠뜨리면 지출이 100만 배
 *  · 네이버 서명에 쿼리를 섞으면 invalid-signature (이건 시끄럽게 죽는다 — 그래서 상대적으로 안전)
 *  · /stats 응답을 순서로 읽으면 광고비가 클릭수 자리로 밀림 (이름으로 읽는 이유)
 */

describe("Google Ads — cost_micros 변환", () => {
  it("cost_micros 를 1,000,000 으로 나눠 계정 통화 단위로 만든다", () => {
    const row = mapGoogleAdsRow({
      campaign: { id: 123, name: "브랜드 검색" },
      segments: { date: "2026-09-10" },
      metrics: { costMicros: "1840000", impressions: "5200", clicks: "310", conversions: "18" },
    })
    expect(row).toEqual({
      date: "2026-09-10",
      campaignId: "123",
      campaignName: "브랜드 검색",
      spend: 1.84,
      impressions: 5200,
      clicks: 310,
      conversions: 18,
    })
  })

  it("campaign.id 를 문자열로 정규화한다 — 숫자로 오면 스냅샷 키가 갈린다", () => {
    expect(mapGoogleAdsRow({ campaign: { id: 999 }, segments: { date: "2026-09-01" } })?.campaignId)
      .toBe("999")
  })

  it("campaign.id 나 segments.date 가 없으면 버린다(0 으로 채우지 않는다)", () => {
    expect(mapGoogleAdsRow({ segments: { date: "2026-09-01" } })).toBeNull()
    expect(mapGoogleAdsRow({ campaign: { id: 1 } })).toBeNull()
  })

  it("부분전환(소수) 을 보존한다 — 반올림하면 CPA 가 틀어진다", () => {
    const row = mapGoogleAdsRow({
      campaign: { id: 1 },
      segments: { date: "2026-09-01" },
      metrics: { conversions: 2.5 },
    })
    expect(row?.conversions).toBe(2.5)
  })

  it("음수·비수치 지표는 0 으로 떨어뜨린다", () => {
    const row = mapGoogleAdsRow({
      campaign: { id: 1 },
      segments: { date: "2026-09-01" },
      metrics: { costMicros: "-5", impressions: "abc", clicks: undefined },
    })
    expect(row).toMatchObject({ spend: 0, impressions: 0, clicks: 0 })
  })
})

describe("Google Ads — 고객 ID · GAQL", () => {
  it("하이픈 표기를 숫자만 남긴다", () => {
    expect(normalizeCustomerId("123-456-7890")).toBe("1234567890")
    expect(normalizeCustomerId("1234567890")).toBe("1234567890")
  })

  it("날짜를 그대로 끼워 넣되 형식을 강제한다(GAQL 문자열 조립 주입 방지)", () => {
    expect(buildDailyInsightsQuery("2026-09-01", "2026-09-14")).toContain(
      "BETWEEN '2026-09-01' AND '2026-09-14'"
    )
    expect(() => buildDailyInsightsQuery("2026-09-01' OR '1'='1", "2026-09-14")).toThrow()
    expect(() => buildDailyInsightsQuery("2026-09-01", "어제")).toThrow()
  })

  it("노출 0 행을 제외한다 — '집행 없음'과 '캠페인 부재'가 섞이지 않게", () => {
    expect(buildDailyInsightsQuery("2026-09-01", "2026-09-02")).toContain("metrics.impressions > 0")
  })
})

describe("네이버 — HMAC 서명", () => {
  const SECRET = "test-secret"

  it("서명 문자열은 {timestamp}.{METHOD}.{path} 다", () => {
    // 같은 입력이면 같은 서명 — 규칙이 바뀌면 이 값이 바뀐다.
    const a = signRequest(SECRET, 1_757_000_000_000, "GET", "/stats")
    const b = signRequest(SECRET, 1_757_000_000_000, "GET", "/stats")
    expect(a).toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/) // base64
  })

  it("메서드는 대문자로 정규화한다", () => {
    expect(signRequest(SECRET, 1, "get", "/stats")).toBe(signRequest(SECRET, 1, "GET", "/stats"))
  })

  it("path 가 다르면 서명이 다르다 — 쿼리를 섞으면 안 되는 이유", () => {
    const withoutQuery = signRequest(SECRET, 1, "GET", "/stats")
    const withQuery = signRequest(SECRET, 1, "GET", "/stats?ids=cmp-1")
    expect(withoutQuery).not.toBe(withQuery)
  })

  it("타임스탬프가 다르면 서명이 다르다 — 초/밀리초를 섞으면 안 되는 이유", () => {
    expect(signRequest(SECRET, 1_757_000_000, "GET", "/stats")).not.toBe(
      signRequest(SECRET, 1_757_000_000_000, "GET", "/stats")
    )
  })
})

describe("네이버 — /stats 응답 매핑", () => {
  const payload = {
    data: [
      { id: "cmp-a001-01-000000001234567", impCnt: 12_000, clkCnt: 340, salesAmt: 920_000, ccnt: 12 },
    ],
  }

  it("필드명으로 읽는다 — 순서가 바뀌어도 값이 밀리지 않는다", () => {
    expect(mapStatRows(payload, "2026-09-10")).toEqual([
      {
        date: "2026-09-10",
        campaignId: "cmp-a001-01-000000001234567",
        campaignName: null,
        spend: 920_000,
        impressions: 12_000,
        clicks: 340,
        conversions: 12,
      },
    ])
  })

  it("{data:[...]} 봉투와 배열 그대로를 둘 다 받는다", () => {
    expect(mapStatRows(payload.data, "2026-09-10")).toHaveLength(1)
  })

  it("id 가 없는 행은 버린다", () => {
    expect(mapStatRows({ data: [{ impCnt: 100 }] }, "2026-09-10")).toEqual([])
  })

  it("문자열 지표를 숫자로 받는다(계정에 따라 문자열로 온다)", () => {
    const [row] = mapStatRows({ data: [{ id: "c1", salesAmt: "12345" }] }, "2026-09-10")
    expect(row.spend).toBe(12_345)
  })

  it("예상 밖 형태는 빈 배열 — throw 하지 않는다", () => {
    expect(mapStatRows(null, "2026-09-10")).toEqual([])
    expect(mapStatRows({ error: "x" }, "2026-09-10")).toEqual([])
  })
})

describe("네이버 — 날짜·청크 유틸", () => {
  it("[since, until] 을 양끝 포함으로 편다", () => {
    expect(enumerateDates("2026-09-10", "2026-09-12")).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ])
  })

  it("같은 날이면 하루", () => {
    expect(enumerateDates("2026-09-10", "2026-09-10")).toEqual(["2026-09-10"])
  })

  it("역순·비정상 범위는 빈 배열 — 호출부가 0행으로 읽는다", () => {
    expect(enumerateDates("2026-09-12", "2026-09-10")).toEqual([])
    expect(enumerateDates("어제", "2026-09-10")).toEqual([])
  })

  it("월 경계를 넘는다", () => {
    expect(enumerateDates("2026-08-31", "2026-09-01")).toEqual(["2026-08-31", "2026-09-01"])
  })

  it("chunk 는 마지막 조각이 작아도 유지한다", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 2)).toEqual([])
  })
})
