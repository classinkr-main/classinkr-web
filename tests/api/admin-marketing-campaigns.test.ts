import { describe, expect, it } from "vitest"
import { sanitizeCampaignInput } from "@/app/api/admin/marketing-campaigns/route"
import { sanitizeCampaignPatch } from "@/app/api/admin/marketing-campaigns/[id]/route"
import { sanitizeLinkInput } from "@/app/api/admin/marketing-campaigns/[id]/links/route"

/*
 * D1-4 sanitizer 계약. 라우트 HTTP 모킹 없이 순수 함수만 검증한다.
 * 하드 게이트(→ null 로 입력 전체 거부): name 빈값 · status 미허용 enum · budget 음수/비정수.
 * 강제 정규화(필드 코어싱): 파싱 불가한 날짜 → null · channels 비문자 제거 · 문자열 트림.
 * 정직 규칙: 잘못된 status/refType 은 조용히 기본값으로 삼키지 않고 거부한다.
 */

describe("sanitizeCampaignInput (캠페인 생성 입력)", () => {
  it("유효한 전체 입력을 정규화해 통과시킨다", () => {
    const out = sanitizeCampaignInput({
      name: "  여름 그로스 캠페인  ",
      objective: " 신규 리드 확보 ",
      status: "active",
      channels: ["email", "sms", "meta"],
      startsAt: "2026-08-01",
      endsAt: "2026-08-31",
      budget: 5_000_000,
      owner: " Moon ",
    })
    expect(out).toEqual({
      name: "여름 그로스 캠페인",
      objective: "신규 리드 확보",
      status: "active",
      channels: ["email", "sms", "meta"],
      startsAt: "2026-08-01",
      endsAt: "2026-08-31",
      budget: 5_000_000,
      owner: "Moon",
      projectId: null,
    })
  })

  it("name 이 없거나 공백뿐이면 null (하드 게이트)", () => {
    expect(sanitizeCampaignInput({})).toBeNull()
    expect(sanitizeCampaignInput({ name: "" })).toBeNull()
    expect(sanitizeCampaignInput({ name: "   " })).toBeNull()
    expect(sanitizeCampaignInput({ name: 123 })).toBeNull()
    expect(sanitizeCampaignInput(null)).toBeNull()
  })

  it("name 만 주면 status 는 planned 기본값·나머지는 안전한 기본값", () => {
    const out = sanitizeCampaignInput({ name: "미니멀" })
    expect(out).toEqual({
      name: "미니멀",
      objective: null,
      status: "planned",
      channels: [],
      startsAt: null,
      endsAt: null,
      budget: null,
      owner: null,
      projectId: null,
    })
  })

  it("허용되지 않은 status 는 조용히 기본값으로 삼키지 않고 거부(null)", () => {
    expect(sanitizeCampaignInput({ name: "x", status: "running" })).toBeNull()
    expect(sanitizeCampaignInput({ name: "x", status: 42 })).toBeNull()
  })

  it("음수·비정수 budget 은 거부(null)", () => {
    expect(sanitizeCampaignInput({ name: "x", budget: -1 })).toBeNull()
    expect(sanitizeCampaignInput({ name: "x", budget: 100.5 })).toBeNull()
    expect(sanitizeCampaignInput({ name: "x", budget: Number.NaN })).toBeNull()
    expect(sanitizeCampaignInput({ name: "x", budget: "3000" })).toBeNull()
  })

  it("budget 0 은 유효(무료/미배정)", () => {
    expect(sanitizeCampaignInput({ name: "x", budget: 0 })?.budget).toBe(0)
  })

  it("channels 는 비문자열을 걸러내고 트림·빈값 제거", () => {
    const out = sanitizeCampaignInput({
      name: "x",
      channels: ["email", 123, "  sms  ", null, "", "  ", "meta"],
    })
    expect(out?.channels).toEqual(["email", "sms", "meta"])
  })

  it("파싱 불가한 날짜는 null 로 코어싱(입력 전체를 죽이지 않음)", () => {
    const out = sanitizeCampaignInput({ name: "x", startsAt: "not-a-date", endsAt: "2026-09-01" })
    expect(out?.startsAt).toBeNull()
    expect(out?.endsAt).toBe("2026-09-01")
  })
})

describe("sanitizeCampaignPatch (캠페인 부분 수정 입력)", () => {
  it("제공된 키만 포함한다", () => {
    expect(sanitizeCampaignPatch({ status: "paused" })).toEqual({ status: "paused" })
  })

  it("빈 객체는 빈 패치({}) — 라우트가 무변경을 별도 처리한다", () => {
    expect(sanitizeCampaignPatch({})).toEqual({})
  })

  it("제공된 status 가 잘못되면 거부(null)", () => {
    expect(sanitizeCampaignPatch({ status: "bogus" })).toBeNull()
  })

  it("name 을 제공했는데 빈값이면 거부(null)", () => {
    expect(sanitizeCampaignPatch({ name: "   " })).toBeNull()
  })

  it("budget:null 을 명시하면 예산을 비운다({budget:null})", () => {
    expect(sanitizeCampaignPatch({ budget: null })).toEqual({ budget: null })
  })

  it("음수 budget 은 패치에서도 거부(null)", () => {
    expect(sanitizeCampaignPatch({ budget: -5 })).toBeNull()
  })

  it("객체가 아니면 null", () => {
    expect(sanitizeCampaignPatch(null)).toBeNull()
    expect(sanitizeCampaignPatch("nope")).toBeNull()
  })
})

describe("sanitizeLinkInput (캠페인 ↔ 실행 링크 입력)", () => {
  it("유효한 refType·refId 를 정규화(트림)", () => {
    expect(sanitizeLinkInput({ refType: "email_campaign", refId: "  e-42 " })).toEqual({
      refType: "email_campaign",
      refId: "e-42",
    })
  })

  it("허용되지 않은 refType 은 거부(null)", () => {
    expect(sanitizeLinkInput({ refType: "kakao_campaign", refId: "x" })).toBeNull()
    expect(sanitizeLinkInput({ refType: 7, refId: "x" })).toBeNull()
  })

  it("빈/누락 refId 는 거부(null)", () => {
    expect(sanitizeLinkInput({ refType: "sms_campaign", refId: "" })).toBeNull()
    expect(sanitizeLinkInput({ refType: "sms_campaign", refId: "   " })).toBeNull()
    expect(sanitizeLinkInput({ refType: "sms_campaign" })).toBeNull()
  })

  it("객체가 아니면 null", () => {
    expect(sanitizeLinkInput(null)).toBeNull()
  })
})
