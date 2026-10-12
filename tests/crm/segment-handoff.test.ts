/**
 * 세그먼트 → 메시지 탭 넘김(lib/crm/segment-handoff.ts) — URL 에는 저장 세그먼트 id(UUID) 하나만.
 */
import { describe, expect, it } from "vitest"

import {
  SEGMENT_HANDOFF_PARAM,
  buildSegmentHandoffHref,
  isSegmentHandoffId,
  parseSegmentHandoff,
  stripSegmentHandoffParams,
} from "@/lib/crm/segment-handoff"

const ID = "11111111-1111-4111-8111-111111111111"

describe("segment handoff", () => {
  it("메시지 탭 딥링크 — tab=email & segment=<소문자 uuid>, UUID 가 아니면 null", () => {
    expect(buildSegmentHandoffHref(ID)).toBe(`/admin/campaigns?tab=email&segment=${ID}`)
    expect(buildSegmentHandoffHref(ID.toUpperCase())).toBe(`/admin/campaigns?tab=email&segment=${ID}`)
    expect(buildSegmentHandoffHref("010-1234-5678")).toBeNull()
    expect(buildSegmentHandoffHref("expDays=60")).toBeNull()
  })

  it("파싱은 UUID 만 받는다 — 전화·이메일·조건 문자열은 무시", () => {
    expect(parseSegmentHandoff(`?tab=email&segment=${ID}`)).toEqual({ segmentId: ID })
    expect(parseSegmentHandoff(new URLSearchParams({ segment: ID.toUpperCase() }))).toEqual({ segmentId: ID })
    expect(parseSegmentHandoff("?segment=01012345678")).toBeNull()
    expect(parseSegmentHandoff("?segment=a%40b.com")).toBeNull()
    expect(parseSegmentHandoff("?tab=email")).toBeNull()
    expect(isSegmentHandoffId(ID)).toBe(true)
    expect(isSegmentHandoffId(42)).toBe(false)
  })

  it("segment 파라미터만 지우고 다른 파라미터는 순서대로 보존한다", () => {
    expect(stripSegmentHandoffParams(`?tab=email&segment=${ID}&perf=30d`)).toBe("tab=email&perf=30d")
    expect(stripSegmentHandoffParams(`segment=${ID}`)).toBe("")
    expect(SEGMENT_HANDOFF_PARAM).toBe("segment")
  })

  it("딥링크에 연락처·이름이 실리지 않는다 — 파라미터는 tab 과 segment 둘뿐", () => {
    const href = buildSegmentHandoffHref(ID) ?? ""
    const params = new URLSearchParams(href.split("?")[1])
    expect([...params.keys()]).toEqual(["tab", "segment"])
  })
})
