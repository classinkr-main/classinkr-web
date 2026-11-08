import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

import { ShareActions } from "@/components/share/ShareActions"

describe("ShareActions", () => {
  const html = renderToStaticMarkup(
    <ShareActions title="학원 수업 녹화 기준" url="https://classin.co.kr/blog/a" source="blog" label="이 글 공유하기" />
  )

  it("renders copy · KakaoTalk · Instagram · SMS as labelled icon buttons in one group", () => {
    expect(html).toContain('role="group"')
    expect(html).toContain('aria-label="이 글 공유하기"')
    for (const label of ["링크 복사", "카카오톡으로 보내기", "인스타그램으로 보내기", "문자 메시지로 보내기"]) {
      expect(html).toContain(`aria-label="${label}"`)
      expect(html).toContain(`title="${label}"`)
    }
    expect(html.match(/<button/g)).toHaveLength(4)
  })

  it("uses the public line icon-md control (44px, control border) and never brand fills or pills", () => {
    expect(html).toContain("h-11 w-11")
    expect(html).toContain("border-line-control")
    expect(html).not.toMatch(/rounded-full|#FEE500|bg-\[#/)
  })

  it("does not render the native share-sheet button on the server (no hydration mismatch)", () => {
    expect(html).not.toContain("다른 앱으로 공유")
  })
})
