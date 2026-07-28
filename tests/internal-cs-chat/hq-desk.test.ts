import { describe, expect, it } from "vitest"

// 본사 확인 화면(tab=hq)의 순수 로직 — 정본: docs/active/cs-admin-console-ia-2026-07-27.md §6.
// 상태가 tags[] 하나에만 사는 설계라, 태그 전이가 곧 화면 소속 규칙이다. 여기서 그 계약을 고정한다.
import {
  formatWaitingElapsed,
  HQ_CONFIRMED_TAG,
  HQ_INTENT_TAG,
  HQ_PENDING_TAG,
  hqWaitingSince,
  INTERNAL_CS_TAG_LIMIT,
  isHqPending,
  isHqStale,
  selectHqPending,
  withHqConfirmed,
  withHqPending,
} from "@/components/admin/cs-chat/hq-desk"
// 태그가 실제로 저장되는지는 서버 정제 함수가 결정한다 — 어휘 화이트리스트가 없음을 여기서 못 박는다.
import { cleanInternalCsTags } from "@/lib/repositories/internal-cs-chat"

const HOUR = 3_600_000

function conversation(id: string, tags: string[], updatedAt: string) {
  return { id, tags, updated_at: updatedAt }
}

describe("본사 확인 태그 어휘", () => {
  it("uses only the vocabulary defined in internal-cs-content-arrangement §5", () => {
    expect(HQ_INTENT_TAG).toBe("intent:hq_confirmation")
    expect(HQ_PENDING_TAG).toBe("evidence:hq_pending")
    expect(HQ_CONFIRMED_TAG).toBe("evidence:confirmed")
  })

  it("survives cleanInternalCsTags — 화이트리스트가 아니라 trim·중복 제거·상한만 건다", () => {
    const cleaned = cleanInternalCsTags([HQ_INTENT_TAG, HQ_PENDING_TAG, HQ_CONFIRMED_TAG])
    expect(cleaned).toEqual([HQ_INTENT_TAG, HQ_PENDING_TAG, HQ_CONFIRMED_TAG])
  })

  it("drops the tail past the cap — 호출부가 응답 tags를 되짚어야 하는 이유", () => {
    const crowded = Array.from({ length: INTERNAL_CS_TAG_LIMIT }, (_, index) => `area:filler-${index}`)
    const cleaned = cleanInternalCsTags([...crowded, HQ_PENDING_TAG])
    expect(cleaned).toHaveLength(INTERNAL_CS_TAG_LIMIT)
    expect(cleaned).not.toContain(HQ_PENDING_TAG)
  })
})

describe("withHqPending", () => {
  it("adds the intent and pending tags without touching unrelated axes", () => {
    expect(withHqPending(["area:billing", "topic:audio_video"])).toEqual([
      "area:billing",
      "topic:audio_video",
      HQ_INTENT_TAG,
      HQ_PENDING_TAG,
    ])
  })

  it("clears a stale confirmed tag — 두 근거 상태는 상호배타적이다", () => {
    expect(withHqPending(["area:billing", HQ_CONFIRMED_TAG])).toEqual([
      "area:billing",
      HQ_INTENT_TAG,
      HQ_PENDING_TAG,
    ])
  })

  it("keeps other evidence values (conditional·conflict·field_verified)", () => {
    expect(withHqPending(["evidence:conditional", "evidence:conflict"])).toContain("evidence:conditional")
    expect(withHqPending(["evidence:conditional", "evidence:conflict"])).toContain("evidence:conflict")
  })

  it("is idempotent", () => {
    const once = withHqPending(["area:billing"])
    expect(withHqPending(once)).toEqual(once)
  })
})

describe("withHqConfirmed", () => {
  it("swaps pending for confirmed and keeps the intent classification", () => {
    expect(withHqConfirmed(["area:billing", HQ_INTENT_TAG, HQ_PENDING_TAG])).toEqual([
      "area:billing",
      HQ_INTENT_TAG,
      HQ_CONFIRMED_TAG,
    ])
  })

  it("removes the conversation from the pending list", () => {
    const tags = withHqConfirmed(withHqPending(["area:board"]))
    expect(isHqPending({ tags })).toBe(false)
  })

  it("is idempotent", () => {
    const once = withHqConfirmed([HQ_PENDING_TAG])
    expect(withHqConfirmed(once)).toEqual(once)
  })
})

describe("selectHqPending", () => {
  it("keeps only hq_pending rows and puts the longest wait first", () => {
    const rows = [
      conversation("recent", [HQ_PENDING_TAG], "2026-07-27T09:00:00.000Z"),
      conversation("confirmed", [HQ_CONFIRMED_TAG], "2026-07-20T09:00:00.000Z"),
      conversation("oldest", ["area:mic", HQ_PENDING_TAG], "2026-07-21T09:00:00.000Z"),
      conversation("untagged", [], "2026-07-19T09:00:00.000Z"),
    ]
    expect(selectHqPending(rows).map((row) => row.id)).toEqual(["oldest", "recent"])
  })

  it("does not mutate the input array order", () => {
    const rows = [
      conversation("b", [HQ_PENDING_TAG], "2026-07-27T09:00:00.000Z"),
      conversation("a", [HQ_PENDING_TAG], "2026-07-21T09:00:00.000Z"),
    ]
    selectHqPending(rows)
    expect(rows.map((row) => row.id)).toEqual(["b", "a"])
  })
})

describe("formatWaitingElapsed", () => {
  const now = Date.parse("2026-07-27T12:00:00.000Z")

  it("steps from minutes to hours to days", () => {
    expect(formatWaitingElapsed("2026-07-27T11:58:00.000Z", now)).toBe("2분")
    expect(formatWaitingElapsed("2026-07-27T07:00:00.000Z", now)).toBe("5시간")
    expect(formatWaitingElapsed("2026-07-24T09:00:00.000Z", now)).toBe("3일 3시간")
    expect(formatWaitingElapsed("2026-07-24T12:00:00.000Z", now)).toBe("3일")
  })

  it("flattens sub-minute and clock-skewed values instead of showing negatives", () => {
    expect(formatWaitingElapsed("2026-07-27T11:59:59.000Z", now)).toBe("방금")
    expect(formatWaitingElapsed("2026-07-27T13:00:00.000Z", now)).toBe("방금")
  })

  it("returns a placeholder for unparseable timestamps", () => {
    expect(formatWaitingElapsed("not-a-date", now)).toBe("—")
  })
})

describe("hqWaitingSince / isHqStale", () => {
  it("approximates the waiting start with updated_at — 태그 부착 시각 칼럼이 없다", () => {
    expect(hqWaitingSince({ updated_at: "2026-07-21T09:00:00.000Z" })).toBe("2026-07-21T09:00:00.000Z")
  })

  it("marks a row stale at 72 hours", () => {
    const now = Date.parse("2026-07-27T12:00:00.000Z")
    expect(isHqStale(new Date(now - 71 * HOUR).toISOString(), now)).toBe(false)
    expect(isHqStale(new Date(now - 72 * HOUR).toISOString(), now)).toBe(true)
  })
})
