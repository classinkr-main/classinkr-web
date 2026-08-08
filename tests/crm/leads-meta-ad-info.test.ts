import { describe, expect, it } from "vitest"

import {
  getLeadSourceDetail,
  getMetaAdInfo,
} from "@/components/admin/crm/leads/shared"
import type { LeadRecord } from "@/lib/repositories/leads"

// Meta 웹훅(app/api/meta/webhook/route.ts buildMetaMessage)이 실제로 남기는 message 포맷.
// 구버전 리드는 광고·세트명이 이 텍스트에만 존재한다 — 파서가 신구 리드를 통일하는지 검증.
const LEGACY_META_MESSAGE = [
  "Meta Lead Ads",
  "leadgen_id=1234567890",
  "page_id=111",
  "form_id=222",
  "campaign=오프라인 HW/SW",
  "adset=BD_설명회_7월 전국 설명회_0723-31",
  "ad=[SW]전자칠판을 업그레이드 해드립니다",
  "fields=학원명: 테스트학원 / 전화번호: 010-0000-0000",
].join("\n")

function makeLead(overrides: Partial<LeadRecord>): LeadRecord {
  return {
    id: "test",
    source: "meta_lead_ads",
    timestamp: "2026-07-24T00:00:00.000Z",
    status: "new",
    ...overrides,
  }
}

describe("getMetaAdInfo", () => {
  it("구버전 리드 — message의 campaign/adset/ad 줄을 파싱한다", () => {
    const lead = makeLead({ message: LEGACY_META_MESSAGE, utm_campaign: undefined })
    expect(getMetaAdInfo(lead)).toEqual({
      campaign: "오프라인 HW/SW",
      adset: "BD_설명회_7월 전국 설명회_0723-31",
      ad: "[SW]전자칠판을 업그레이드 해드립니다",
    })
  })

  it("신규 리드 — 구조화 필드(utm_campaign/term/content)가 message보다 우선한다", () => {
    const lead = makeLead({
      message: LEGACY_META_MESSAGE,
      utm_campaign: "설명회",
      utm_term: "구조화 세트",
      utm_content: "구조화 광고",
    })
    expect(getMetaAdInfo(lead)).toEqual({
      campaign: "설명회",
      adset: "구조화 세트",
      ad: "구조화 광고",
    })
  })

  it("부분 구조화 — 빈 계층만 message에서 보충한다", () => {
    const lead = makeLead({ message: LEGACY_META_MESSAGE, utm_campaign: "설명회" })
    const info = getMetaAdInfo(lead)
    expect(info?.campaign).toBe("설명회")
    expect(info?.ad).toBe("[SW]전자칠판을 업그레이드 해드립니다")
  })

  it("값에 '='가 포함돼도 첫 '=' 기준으로 자른다", () => {
    const lead = makeLead({ message: "Meta Lead Ads\nad=A=B 리타겟" })
    expect(getMetaAdInfo(lead)?.ad).toBe("A=B 리타겟")
  })

  it("'-' 플레이스홀더 값은 무시한다", () => {
    const lead = makeLead({ message: "Meta Lead Ads\nad=-\nadset=-" })
    expect(getMetaAdInfo(lead)).toBeNull()
  })

  it("메타가 아닌 리드는 null", () => {
    const lead = makeLead({ source: "contact_page", message: LEGACY_META_MESSAGE })
    expect(getMetaAdInfo(lead)).toBeNull()
  })

  it("광고 정보가 전혀 없으면 null (Graph 조회 실패 리드)", () => {
    const lead = makeLead({ message: "Meta Lead Ads\nleadgen_id=1\npage_id=-\nform_id=2" })
    expect(getMetaAdInfo(lead)).toBeNull()
  })
})

describe("getLeadSourceDetail — 메타 광고명 폴백", () => {
  it("source_detail이 있으면 그대로 (신규 웹훅 리드·타 채널)", () => {
    const lead = makeLead({ source_detail: "명시적 세부유입", message: LEGACY_META_MESSAGE })
    expect(getLeadSourceDetail(lead)).toBe("명시적 세부유입")
  })

  it("source_detail이 비면 메타 광고명으로 폴백 — 세부유입 필터가 광고 단위로 작동", () => {
    const lead = makeLead({ message: LEGACY_META_MESSAGE })
    expect(getLeadSourceDetail(lead)).toBe("[SW]전자칠판을 업그레이드 해드립니다")
  })

  it("메타가 아니고 source_detail도 없으면 빈 문자열 (기존 동작 보존)", () => {
    const lead = makeLead({ source: "newsletter" })
    expect(getLeadSourceDetail(lead)).toBe("")
  })
})
