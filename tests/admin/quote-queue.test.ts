import { describe, expect, it } from "vitest"

import {
  getQuoteQueueKey,
  getQuoteSentDays,
  getQuoteStage,
  type QuoteQueueInput,
} from "@/components/admin/documents/quote-queue"

const NOW = Date.parse("2026-10-20T00:00:00Z")

function quote(patch: Partial<QuoteQueueInput>): QuoteQueueInput {
  return {
    status: "shared",
    shareCount: 1,
    shareUrl: null,
    latestShareCreatedAt: "2026-06-16T00:00:00Z",
    viewCount: 0,
    lastViewedAt: null,
    reviewConfirmedAt: null,
    acceptedAt: null,
    ...patch,
  }
}

describe("quote-queue", () => {
  it("작성 중 견적은 공유 링크가 있어도 발송 경과일을 세지 않는다", () => {
    const draft = quote({ status: "draft" })
    expect(getQuoteStage(draft)).toBe(1)
    expect(getQuoteQueueKey(draft)).toBe("send")
    expect(getQuoteSentDays(draft, NOW)).toBeNull()
  })

  it("검토 확인 건은 열람 기록이 없어도 리마인드 대상이 아니다", () => {
    const reviewed = quote({ reviewConfirmedAt: "2026-06-04T00:00:00Z" })
    expect(getQuoteStage(reviewed)).toBe(4)
    expect(getQuoteQueueKey(reviewed)).toBe("close")
  })

  it("발송 후 미열람이면 리마인드, 경과일은 발송 시점 기준", () => {
    const sent = quote({})
    expect(getQuoteQueueKey(sent)).toBe("remind")
    expect(getQuoteSentDays(sent, NOW)).toBe(126)
  })

  it("열람만 했으면 조건 확인, 동의는 상태와 무관하게 계약 전환", () => {
    expect(getQuoteQueueKey(quote({ viewCount: 2, lastViewedAt: "2026-07-13T00:00:00Z" }))).toBe("terms")
    expect(getQuoteQueueKey(quote({ status: "draft", acceptedAt: "2026-04-12T00:00:00Z" }))).toBe("convert")
  })

  it("만료·보관은 별도 묶음", () => {
    expect(getQuoteQueueKey(quote({ status: "expired" }))).toBe("closed")
    expect(getQuoteQueueKey(quote({ status: "archived" }))).toBe("closed")
  })
})
