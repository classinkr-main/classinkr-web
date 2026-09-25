// 세그먼트 필터 OR 한 단계(세그먼트 허브, 2026-09-25) — 정규형·URL 왕복·옛 URL 호환·중첩 차단·매처·문구·저장 판.
import { describe, expect, it } from "vitest"

import {
  SEGMENT_OR_MAX_GROUPS,
  buildSegmentFilterMatcher,
  describeSegmentFilter,
  isSegmentFilterEmpty,
  normalizeSegmentFilter,
  parseSegmentFilter,
  readStoredSegmentFilter,
  segmentFilterHasOr,
  segmentFilterQueryString,
  segmentFilterTags,
  segmentFilterUsesContact,
  segmentFilterUsesNeoSignals,
  writeSegmentFilterParams,
} from "@/lib/crm/customer-segment-filter"
import { parseSegmentSpec, segmentSpecQueryString, type SegmentRowInput } from "@/lib/crm/customer-segment-spec"

const NOW = Date.parse("2026-09-25T03:00:00.000Z")
const DAY = 86_400_000

function row(partial: Partial<SegmentRowInput> = {}): SegmentRowInput {
  return {
    source: "neo_account",
    expireAt: null,
    depletionInDays: null,
    lastContactAt: new Date(NOW - 1 * DAY).toISOString(),
    lifecycle: "active_account",
    balance: 0,
    riskLevel: "normal",
    billingMode: "subscription",
    ownerKeys: [],
    regionLabel: null,
    tags: [],
    ...partial,
  }
}

describe("normalizeSegmentFilter — OR 정규형", () => {
  it("빈 그룹·모르는 값만 있는 그룹은 지우고(TRUE 로 보지 않음), 중복은 합치고, 정렬·상한을 건다", () => {
    const normalized = normalizeSegmentFilter({
      expDays: 60,
      anyOf: [
        { risk: ["urgent"] },
        {},
        { risk: ["bogus" as never] },
        { noContactDays: 60 },
        { risk: ["urgent"] },
      ],
    })
    expect(normalized).toEqual({ expDays: 60, anyOf: [{ noContactDays: 60 }, { risk: ["urgent"] }] })
  })

  it("그룹이 다 비면 anyOf 키를 뺀다 — AND 만 쓴 필터는 스펙과 같다", () => {
    expect(normalizeSegmentFilter({ kinds: ["neo_account"], anyOf: [{}] })).toEqual({ kinds: ["neo_account"] })
    expect(segmentFilterHasOr({ kinds: ["neo_account"], anyOf: [{}] })).toBe(false)
  })

  it(`그룹은 최대 ${SEGMENT_OR_MAX_GROUPS}개`, () => {
    const groups = [7, 14, 21, 30, 45, 60, 90].map((days) => ({ noContactDays: days }))
    expect(normalizeSegmentFilter({ anyOf: groups }).anyOf).toHaveLength(SEGMENT_OR_MAX_GROUPS)
  })

  it("그룹이 하나여도 기본 조건에 접지 않는다", () => {
    expect(normalizeSegmentFilter({ anyOf: [{ risk: ["urgent"] }] })).toEqual({ anyOf: [{ risk: ["urgent"] }] })
  })
})

describe("URL 왕복", () => {
  it("?expDays=60&kinds=neo_account&billing=subscription&or=…&or=… 를 읽고 같은 정규형으로 쓴다", () => {
    const params = new URLSearchParams("expDays=60&kinds=neo_account&billing=subscription&or=risk%3Durgent&or=noContactDays%3D60")
    const filter = parseSegmentFilter(params)
    expect(filter).toEqual({
      expDays: 60,
      kinds: ["neo_account"],
      billing: ["subscription"],
      anyOf: [{ noContactDays: 60 }, { risk: ["urgent"] }],
    })
    const query = segmentFilterQueryString(filter)
    expect(query).toBe("expDays=60&kinds=neo_account&billing=subscription&or=noContactDays%3D60&or=risk%3Durgent")
    expect(parseSegmentFilter(new URLSearchParams(query))).toEqual(filter)
  })

  it("옛 URL(or 없음)은 순수 AND 로 그대로 읽힌다 — parseSegmentSpec 과 같다", () => {
    const params = new URLSearchParams("expDays=30&risk=urgent&risk=soon")
    expect(parseSegmentFilter(params)).toEqual(parseSegmentSpec(params))
    expect(segmentFilterQueryString(parseSegmentFilter(params))).toBe(segmentSpecQueryString(parseSegmentSpec(params)))
  })

  it("그룹 안의 or 는 읽지 않는다(중첩 차단)", () => {
    const nested = new URLSearchParams({ or: "risk=urgent&or=noContactDays%3D30" })
    expect(parseSegmentFilter(nested)).toEqual({ anyOf: [{ risk: ["urgent"] }] })
  })

  it("writeSegmentFilterParams 는 다른 파라미터(view 등)를 두고 조건 키·or 만 바꾼다", () => {
    const params = new URLSearchParams("view=expiring&or=risk%3Dsoon&expDays=14")
    writeSegmentFilterParams(params, { noContactDays: 30 })
    expect(params.toString()).toBe("view=expiring&noContactDays=30")
  })

  it("빈 필터는 빈 쿼리", () => {
    expect(isSegmentFilterEmpty({ anyOf: [{}] })).toBe(true)
    expect(segmentFilterQueryString(null)).toBe("")
  })
})

describe("buildSegmentFilterMatcher — 기본 AND ∧ (그룹 OR, 그룹 안 AND)", () => {
  const expiring = new Date(NOW + 20 * DAY).toISOString()
  const filter = normalizeSegmentFilter({
    expDays: 60,
    anyOf: [{ risk: ["urgent"] }, { noContactDays: 60 }],
  })
  const match = buildSegmentFilterMatcher(filter, NOW)

  it("기본 조건을 못 넘으면 그룹과 무관하게 탈락", () => {
    expect(match(row({ expireAt: null, riskLevel: "urgent" }))).toBe(false)
  })

  it("기본 조건 + 그룹 하나라도 맞으면 통과", () => {
    expect(match(row({ expireAt: expiring, riskLevel: "urgent" }))).toBe(true)
    expect(match(row({ expireAt: expiring, lastContactAt: null }))).toBe(true)
  })

  it("기본 조건만 맞고 어느 그룹에도 안 맞으면 탈락", () => {
    expect(match(row({ expireAt: expiring, riskLevel: "normal" }))).toBe(false)
  })

  it("그룹 안은 AND", () => {
    const groupAnd = buildSegmentFilterMatcher({ anyOf: [{ risk: ["urgent"], billing: ["consumption"] }] }, NOW)
    expect(groupAnd(row({ riskLevel: "urgent", billingMode: "subscription" }))).toBe(false)
    expect(groupAnd(row({ riskLevel: "urgent", billingMode: "consumption" }))).toBe(true)
  })

  it("조건이 없으면 항상 참", () => {
    expect(buildSegmentFilterMatcher({}, NOW)(row())).toBe(true)
  })
})

describe("문구·신호", () => {
  it("기본 문구 + '(A) 또는 (B)' 한 줄", () => {
    expect(describeSegmentFilter({ expDays: 60, anyOf: [{ risk: ["urgent"] }, { noContactDays: 60 }] })).toEqual([
      "만료 60일 이내",
      "(무연락 60일+) 또는 (위험 긴급)",
    ])
    expect(describeSegmentFilter({ anyOf: [{ risk: ["urgent"], billing: ["consumption"] }] })).toEqual([
      expect.stringContaining(" · "),
    ])
  })

  it("라벨은 기본·그룹 전부(대소문자 무시 중복 제거)", () => {
    expect(segmentFilterTags({ tagsAll: ["VIP"], anyOf: [{ tagsAny: ["vip", "재계약"] }] })).toEqual(["VIP", "재계약"])
  })

  it("NEO 신호 — 만료·소진·잔액·위험·과금 또는 종류가 고객 하나뿐", () => {
    expect(segmentFilterUsesNeoSignals({ noContactDays: 30 })).toBe(false)
    expect(segmentFilterUsesNeoSignals({ kinds: ["lead", "neo_account"] })).toBe(false)
    expect(segmentFilterUsesNeoSignals({ kinds: ["neo_account"] })).toBe(true)
    expect(segmentFilterUsesNeoSignals({ anyOf: [{ risk: ["urgent"] }] })).toBe(true)
  })

  it("연락 조건 — 무연락 N일+ 가 기본이나 그룹에 있으면", () => {
    expect(segmentFilterUsesContact({ anyOf: [{ noContactDays: 30 }] })).toBe(true)
    expect(segmentFilterUsesContact({ expDays: 30 })).toBe(false)
  })
})

describe("readStoredSegmentFilter — 저장 판", () => {
  it("모르는 새 판은 읽지 않는다(구 배포가 조건을 넓혀 평가하는 사고 방지)", () => {
    expect(readStoredSegmentFilter({ expDays: 30 }, 2)).toEqual({ readable: false, reason: "newer_version" })
  })

  it("객체가 아니면 invalid", () => {
    expect(readStoredSegmentFilter("expDays=30", 1)).toEqual({ readable: false, reason: "invalid" })
    expect(readStoredSegmentFilter([], 1)).toEqual({ readable: false, reason: "invalid" })
  })

  it("현재 판은 정규형으로 읽는다", () => {
    expect(readStoredSegmentFilter({ expDays: "60", anyOf: [{ risk: ["urgent"] }, {}] }, 1)).toEqual({
      readable: true,
      filter: { expDays: 60, anyOf: [{ risk: ["urgent"] }] },
    })
  })
})
