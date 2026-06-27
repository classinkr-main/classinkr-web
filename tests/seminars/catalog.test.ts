import { describe, expect, it } from "vitest"

import {
  extractYoutubeId,
  getPublishedSeminars,
  isPlaceholderYoutube,
  toPublicSeminarCard,
  type SeminarVideo,
} from "@/lib/seminars/catalog"

const sample: SeminarVideo = {
  slug: "demo",
  title: "데모 영상",
  description: "설명",
  youtube: "https://youtu.be/abcdefghijk",
  presenter: "발표자",
  durationLabel: "32분",
  posterUrl: "https://example.com/p.jpg",
  highlights: ["포인트"],
  publishedAt: "2026-01-01",
  isPublished: true,
}

describe("toPublicSeminarCard (게이팅 누출 방지)", () => {
  it("youtube 영상 ID/URL 을 공개 projection 에서 제외한다", () => {
    const card = toPublicSeminarCard(sample)
    expect(card).not.toHaveProperty("youtube")
    // 비회원 직렬화 결과 어디에도 영상 ID 가 새지 않아야 한다
    expect(JSON.stringify(card)).not.toContain("abcdefghijk")
  })

  it("카드 노출용 공개 필드는 보존한다", () => {
    const card = toPublicSeminarCard(sample)
    expect(card.slug).toBe("demo")
    expect(card.title).toBe("데모 영상")
    expect(card.presenter).toBe("발표자")
    expect(card.durationLabel).toBe("32분")
    expect(card.posterUrl).toBe("https://example.com/p.jpg")
  })
})

describe("extractYoutubeId", () => {
  it("이미 11자 ID 면 그대로 반환한다", () => {
    expect(extractYoutubeId("abcdefghijk")).toBe("abcdefghijk")
  })

  it("youtu.be 단축 URL 에서 추출한다", () => {
    expect(extractYoutubeId("https://youtu.be/abcdefghijk")).toBe("abcdefghijk")
  })

  it("watch?v= URL(추가 쿼리 포함)에서 추출한다", () => {
    expect(
      extractYoutubeId("https://youtube.com/watch?v=abcdefghijk&feature=youtu.be")
    ).toBe("abcdefghijk")
  })

  it("embed / shorts URL 에서 추출한다", () => {
    expect(extractYoutubeId("https://www.youtube.com/embed/abcdefghijk")).toBe("abcdefghijk")
    expect(extractYoutubeId("https://www.youtube.com/shorts/abcdefghijk")).toBe("abcdefghijk")
  })
})

describe("isPlaceholderYoutube", () => {
  it("유효한 URL 은 플레이스홀더가 아니다", () => {
    expect(isPlaceholderYoutube("https://youtu.be/abcdefghijk")).toBe(false)
  })

  it("빈 값/안내 문구는 플레이스홀더로 본다", () => {
    expect(isPlaceholderYoutube("")).toBe(true)
    expect(isPlaceholderYoutube("준비중")).toBe(true)
  })
})

describe("getPublishedSeminars", () => {
  it("게시된 항목만, publishedAt 내림차순으로 정렬한다", () => {
    const list = getPublishedSeminars()
    for (const seminar of list) {
      expect(seminar.isPublished).toBe(true)
    }
    for (let i = 1; i < list.length; i += 1) {
      expect(list[i - 1].publishedAt >= list[i].publishedAt).toBe(true)
    }
  })
})
