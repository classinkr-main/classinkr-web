import { describe, expect, it } from "vitest"

import { normalizeBlogSlug, sanitizeBlogSlugInput } from "@/lib/blog-slug-route"

describe("normalizeBlogSlug", () => {
  // 2026-10-26 운영에 실제로 있는 슬러그 모양들. 저장할 때 바뀌면 공개 주소가 404 가 된다.
  it.each([
    "customerstory_skyssam",
    "customerstories_peking_university_hybrid",
    "dual_device_update",
    "ai-class-recording-report",
    "naver-2026-06-11-최대-500만원-지원-국민내일배움카드-신청-가이드",
    "정율사관학원-인구-감소의-위기에서-학원이-살아남",
    "classin-5-0-reach-your-learning-goals",
  ])("keeps an existing slug unchanged: %s", (slug) => {
    expect(normalizeBlogSlug(slug)).toBe(slug)
    expect(normalizeBlogSlug(normalizeBlogSlug(slug))).toBe(slug)
  })

  it("builds a slug from a title", () => {
    expect(normalizeBlogSlug("  Classin 5.0 업데이트: LMS 기능! ")).toBe("classin-50-업데이트-lms-기능")
    expect(normalizeBlogSlug("제 2회 클래스인 세미나 ㅣ 200% 활용")).toBe("제-2회-클래스인-세미나-ㅣ-200-활용")
  })

  it("caps generated slugs at 80 characters without a trailing dash", () => {
    const slug = normalizeBlogSlug(`${"가".repeat(79)} 나다`)
    expect([...slug].length).toBeLessThanOrEqual(80)
    expect(slug.endsWith("-")).toBe(false)
  })

  it("never starts with the proxy token prefix underscore", () => {
    expect(normalizeBlogSlug("_u8_abc")).toBe("u8_abc")
  })

  it("lets the slug input keep a trailing dash while typing", () => {
    expect(sanitizeBlogSlugInput("abc-")).toBe("abc-")
    expect(sanitizeBlogSlugInput("My Post!")).toBe("my-post")
  })
})
