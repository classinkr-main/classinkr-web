import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import SendCenterHeader from "@/components/admin/marketing/SendCenterHeader"

const base = {
  composeActive: false,
  totalSubscribers: 23,
  activeCount: 17,
  unsubscribedCount: 6,
  emailReach: 15,
  phoneReach: 10,
  selectedAudience: 17,
  messagingStatus: null,
  messagingStatusLoaded: false,
  onRefresh: vi.fn(),
  onGoCompose: vi.fn(),
  onScrollToSend: vi.fn(),
  onScrollToTest: vi.fn(),
}

describe("SendCenterHeader loading state", () => {
  it("does not present placeholder subscriber counts as loaded on the first request", () => {
    const html = renderToStaticMarkup(<SendCenterHeader {...base} refreshing lastSyncedAt={null} />)
    expect(html).toContain("구독자 불러오는 중")
    expect(html).toContain("불러오는 중")
    expect(html).not.toContain("전체 23 · 수신거부 6 제외")
  })

  it("keeps previously loaded counts visible while refreshing", () => {
    const html = renderToStaticMarkup(
      <SendCenterHeader {...base} refreshing lastSyncedAt={new Date("2026-10-01T00:00:00Z")} />
    )
    expect(html).toContain("전체 23 · 수신거부 6 제외")
    expect(html).toContain("구독자 23명")
    expect(html).not.toContain("구독자 불러오는 중")
  })
})
