// 행사 attribution 토큰 정규화 SSOT (lib/events/attribution.ts)
// 공개 신청 리드는 [event:slug], 리드 보드 수동 연결·캡처 배치는 [event:id]를 써 왔다.
// slug/id 어느 쪽 토큰이든 같은 행사로 정규화되는지 검증한다.
import { describe, expect, it } from "vitest"

import {
  buildEventTokenIndex,
  canonicalEventTokenKey,
  countEventTokenSignups,
  eventTokenValues,
  resolveEventTokenKey,
  textMatchesEventToken,
} from "@/lib/events/attribution"

const SEMINAR = { id: "EV-123", slug: "spring-seminar" }
const NO_SLUG_EVENT = { id: "ev-no-slug", slug: null }

describe("eventTokenValues / canonicalEventTokenKey", () => {
  it("returns lowercased id and slug candidates", () => {
    expect(eventTokenValues(SEMINAR)).toEqual(["ev-123", "spring-seminar"])
    expect(eventTokenValues(NO_SLUG_EVENT)).toEqual(["ev-no-slug"])
  })

  it("prefers slug as the canonical key, falls back to id", () => {
    expect(canonicalEventTokenKey(SEMINAR)).toBe("spring-seminar")
    expect(canonicalEventTokenKey(NO_SLUG_EVENT)).toBe("ev-no-slug")
  })
})

describe("buildEventTokenIndex / resolveEventTokenKey", () => {
  const index = buildEventTokenIndex([SEMINAR, NO_SLUG_EVENT])

  it("normalizes both slug and id tokens to the same canonical key", () => {
    expect(resolveEventTokenKey("spring-seminar", index)).toBe("spring-seminar")
    expect(resolveEventTokenKey("EV-123", index)).toBe("spring-seminar")
    expect(resolveEventTokenKey("ev-123", index)).toBe("spring-seminar")
  })

  it("keeps unknown tokens as-is (기존 동작 보존)", () => {
    expect(resolveEventTokenKey("deleted-event", index)).toBe("deleted-event")
  })
})

describe("textMatchesEventToken", () => {
  it("matches id tokens, slug tokens, and rejects other events", () => {
    expect(textMatchesEventToken("manual [event:ev-123]\n메모", SEMINAR)).toBe(true)
    expect(textMatchesEventToken("events_page [event:spring-seminar]", SEMINAR)).toBe(true)
    expect(textMatchesEventToken("events_page [event:other-event]", SEMINAR)).toBe(false)
    expect(textMatchesEventToken("", SEMINAR)).toBe(false)
  })
})

describe("countEventTokenSignups", () => {
  it("merges slug-token and id-token leads into one canonical count", () => {
    const counts = countEventTokenSignups(
      [
        "[event:spring-seminar]\n공개 신청 폼 리드",
        "[event:EV-123]\n리드 보드 수동 연결 리드",
        "[event:ev-123]", // 캡처 배치 (본문 없음)
        "[event:ev-no-slug]\nslug 없는 행사",
        "[event:deleted-event]\n카탈로그에 없는 토큰",
        "토큰 없는 일반 메모",
        null,
        undefined,
      ],
      [SEMINAR, NO_SLUG_EVENT]
    )

    expect(counts).toEqual({
      "spring-seminar": 3,
      "ev-no-slug": 1,
      "deleted-event": 1,
    })
  })

  it("ignores tokens that are not on the first line (parseEventToken 규약)", () => {
    const counts = countEventTokenSignups(["메모 먼저\n[event:spring-seminar]"], [SEMINAR])
    expect(counts).toEqual({})
  })
})
