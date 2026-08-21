import { describe, expect, it } from "vitest"
import {
  sanitizeCampaignUpdateInput,
  sanitizeUpdateId,
} from "@/app/api/admin/marketing-campaigns/[id]/updates/route"

/*
 * 캠페인 업데이트 로그 sanitizer 계약. 라우트 HTTP 모킹 없이 순수 함수만 검증한다.
 * kind 미지정 → note 기본값(DB DEFAULT 와 동일) · 미허용 kind 는 조용히 삼키지 않고 거부.
 * body 는 트림 후 1~2000자만 허용 — 빈/공백·과다 길이·비문자열은 거부.
 * createdBy 는 서버(세션)가 파생하므로 sanitizer 입출력 어디에도 없다.
 */

describe("sanitizeCampaignUpdateInput", () => {
  it("kind 를 지정하지 않으면 note 기본값으로 통과시킨다", () => {
    expect(sanitizeCampaignUpdateInput({ body: "정상 진행 중" })).toEqual({
      kind: "note",
      body: "정상 진행 중",
    })
  })

  it("허용된 kind(change/milestone)를 그대로 통과시킨다", () => {
    expect(sanitizeCampaignUpdateInput({ kind: "change", body: "예산 증액" })).toEqual({
      kind: "change",
      body: "예산 증액",
    })
    expect(sanitizeCampaignUpdateInput({ kind: "milestone", body: "1차 목표 달성" })).toEqual({
      kind: "milestone",
      body: "1차 목표 달성",
    })
  })

  it("허용되지 않은 kind 는 조용히 기본값으로 삼키지 않고 거부(null)", () => {
    expect(sanitizeCampaignUpdateInput({ kind: "urgent", body: "x" })).toBeNull()
    expect(sanitizeCampaignUpdateInput({ kind: 42, body: "x" })).toBeNull()
  })

  it("빈/공백뿐인 body 는 거부(null)", () => {
    expect(sanitizeCampaignUpdateInput({ body: "" })).toBeNull()
    expect(sanitizeCampaignUpdateInput({ body: "   " })).toBeNull()
    expect(sanitizeCampaignUpdateInput({})).toBeNull()
  })

  it("body 가 문자열이 아니면 거부(null)", () => {
    expect(sanitizeCampaignUpdateInput({ body: ["a", "b"] })).toBeNull()
    expect(sanitizeCampaignUpdateInput({ body: 123 })).toBeNull()
    expect(sanitizeCampaignUpdateInput({ body: null })).toBeNull()
  })

  it("body 2001자는 거부(null), 2000자는 통과(경계값)", () => {
    const at2000 = "가".repeat(2000)
    const at2001 = "가".repeat(2001)
    expect(sanitizeCampaignUpdateInput({ body: at2001 })).toBeNull()
    expect(sanitizeCampaignUpdateInput({ body: at2000 })).toEqual({
      kind: "note",
      body: at2000,
    })
  })

  it("body 앞뒤 공백은 트림한다", () => {
    expect(sanitizeCampaignUpdateInput({ body: "  띄어쓰기  " })).toEqual({
      kind: "note",
      body: "띄어쓰기",
    })
  })

  it("객체가 아니면 null", () => {
    expect(sanitizeCampaignUpdateInput(null)).toBeNull()
    expect(sanitizeCampaignUpdateInput("nope")).toBeNull()
    expect(sanitizeCampaignUpdateInput(undefined)).toBeNull()
  })

  it("createdBy 는 본문에 실려 와도 결과에 포함되지 않는다(서버 파생, 본문 비신뢰)", () => {
    const out = sanitizeCampaignUpdateInput({ body: "x", createdBy: "자칭 관리자" })
    expect(out).toEqual({ kind: "note", body: "x" })
    expect(out).not.toHaveProperty("createdBy")
  })
})

describe("sanitizeUpdateId", () => {
  it("유효한 id 를 트림해 통과시킨다", () => {
    expect(sanitizeUpdateId("  upd-1  ")).toBe("upd-1")
  })

  it("null·빈값·공백뿐이면 null(→ 라우트가 400으로 강등)", () => {
    expect(sanitizeUpdateId(null)).toBeNull()
    expect(sanitizeUpdateId("")).toBeNull()
    expect(sanitizeUpdateId("   ")).toBeNull()
  })
})
