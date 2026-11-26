// LeftSidebar 의 "지금 기준" 값(미니 달력, D-n, N시간 전)은 서버 시계·시간대에 따라 달라진다.
// 서버 렌더(= 하이드레이션 첫 렌더)는 시계와 무관해야 하이드레이션 텍스트 불일치가 나지 않는다.
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

import { LeftSidebar } from "@/components/portal/home/PortalHome"

const props = {
  upcoming_installations: [
    { id: "i1", title: "설치", location: null, scheduled_start_at: "2026-04-20T09:00:00+09:00", scheduled_end_at: "2026-04-21T09:00:00+09:00" },
  ],
  recent_calendar_events: [],
  recent_activity: [{ id: "a1", summary: "견적서 발송", action_type: "document", created_at: "2026-04-04T02:10:00Z" }],
  calendarHref: "/admin/calendar",
} as unknown as Parameters<typeof LeftSidebar>[0]

afterEach(() => vi.useRealTimers())

describe("PortalHome LeftSidebar 서버 렌더", () => {
  it("시계가 달라도 같은 마크업이고, 시간 의존 텍스트(D-n, N시간 전, 달력)가 없다", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-05T15:30:00Z"))
    const a = renderToString(<LeftSidebar {...props} />)
    vi.setSystemTime(new Date("2026-04-10T00:10:00Z"))
    const b = renderToString(<LeftSidebar {...props} />)
    expect(a).toBe(b)
    expect(a).not.toMatch(/D-\d+|시간 전|일 전|어제|방금 전/)
    expect(a).not.toContain("2026년")
    expect(a).toContain("설치")
    expect(a).toContain("견적서 발송")
  })
})
