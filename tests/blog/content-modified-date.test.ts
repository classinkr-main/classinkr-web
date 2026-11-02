/**
 * 블로그 공개 날짜 신호(사이트맵 lastmod·JSON-LD dateModified·RSS lastBuildDate)의 우선순위 고정.
 *
 * updated_at 은 대표 글·공개 토글 같은 모든 UPDATE 에 바뀌므로(20260610 트리거) 공개 신호의 원천이
 * 아니다. 20261028 마이그레이션의 content_updated_at 을 쓰고, 미적용 DB 에서만 updated_at 으로 내려간다.
 */
import { describe, expect, it } from "vitest"

import { resolveBlogContentModifiedAt, resolveBlogPublishedAt } from "@/lib/blog-types"

describe("resolveBlogContentModifiedAt", () => {
  it("prefers contentUpdatedAt over a later updatedAt bumped by a featured/publish toggle", () => {
    expect(
      resolveBlogContentModifiedAt({
        contentUpdatedAt: "2026-10-26T03:00:00.000Z",
        updatedAt: "2026-10-28T09:00:00.000Z",
        publishedAt: "2026-10-01T00:00:00.000Z",
        createdAt: "2026-09-30T00:00:00.000Z",
      }),
    ).toBe("2026-10-26T03:00:00.000Z")
  })

  it("falls back to updatedAt when the column is missing (migration not applied)", () => {
    expect(
      resolveBlogContentModifiedAt({
        updatedAt: "2026-10-20T09:30:00.000Z",
        publishedAt: "2026-10-01T00:00:00.000Z",
      }),
    ).toBe("2026-10-20T09:30:00.000Z")
  })

  it("then publishedAt, then createdAt", () => {
    expect(resolveBlogContentModifiedAt({ publishedAt: "2026-10-01T00:00:00.000Z", createdAt: "2026-09-01T00:00:00.000Z" }))
      .toBe("2026-10-01T00:00:00.000Z")
    expect(resolveBlogContentModifiedAt({ createdAt: "2026-03-05T00:00:00.000Z" })).toBe("2026-03-05T00:00:00.000Z")
    expect(resolveBlogContentModifiedAt({})).toBeUndefined()
  })

  it("never goes earlier than publishedAt — a draft edited on 10-25 and published on 10-28 reports 10-28", () => {
    // dateModified < datePublished 는 구조화 데이터로 모순이다. 예약 발행도 같은 경우다.
    expect(
      resolveBlogContentModifiedAt({
        contentUpdatedAt: "2026-10-25T00:00:00.000Z",
        updatedAt: "2026-10-28T00:00:00.000Z",
        publishedAt: "2026-10-28T00:00:00.000Z",
      }),
    ).toBe("2026-10-28T00:00:00.000Z")
  })

  it("ignores an unparseable candidate instead of returning Invalid Date", () => {
    expect(
      resolveBlogContentModifiedAt({ contentUpdatedAt: "not-a-date", publishedAt: "2026-10-01T00:00:00.000Z" }),
    ).toBe("2026-10-01T00:00:00.000Z")
  })
})

describe("resolveBlogPublishedAt", () => {
  it("uses publishedAt, and createdAt only for legacy posts without one (same rule as the on-screen date)", () => {
    expect(resolveBlogPublishedAt({ publishedAt: "2026-10-01T00:00:00.000Z", createdAt: "2026-09-30T00:00:00.000Z" }))
      .toBe("2026-10-01T00:00:00.000Z")
    expect(resolveBlogPublishedAt({ createdAt: "2026-03-05T00:00:00.000Z" })).toBe("2026-03-05T00:00:00.000Z")
    expect(resolveBlogPublishedAt({})).toBeUndefined()
  })
})
