import { describe, expect, it } from "vitest"

import { renderMarkdownToHtml } from "@/lib/blog-markdown"

describe("renderMarkdownToHtml", () => {
  it("renders image markdown with a trailing backslash without hanging", () => {
    const html = renderMarkdownToHtml(
      "![Forum](https://kfoaodkgvhvmfrankeyu.supabase.co/storage/v1/object/public/blog-images/forum.jpg)\\"
    )

    expect(html).toContain("<figure")
    expect(html).toContain('src="https://kfoaodkgvhvmfrankeyu.supabase.co/storage/v1/object/public/blog-images/forum.jpg"')
  })

  it("advances past malformed image-like lines", () => {
    const html = renderMarkdownToHtml("![broken image\n\n다음 문단")

    expect(html).toContain("![broken image")
    expect(html).toContain("다음 문단")
  })

  it("renders adjacent images as separate figures", () => {
    const html = renderMarkdownToHtml(
      "![first](https://classin.ai.kr/first.png)![second](https://classin.ai.kr/second.png)"
    )

    expect(html.match(/<figure/g)).toHaveLength(2)
    expect(html).toContain('src="https://classin.ai.kr/first.png"')
    expect(html).toContain('src="https://classin.ai.kr/second.png"')
    expect(html).not.toContain("first.png)![second]")
  })

  it("keeps headings when they are pasted directly after an image", () => {
    const html = renderMarkdownToHtml(
      "![first](https://classin.ai.kr/first.png)## 다음 섹션"
    )

    expect(html).toContain("<figure")
    expect(html).toContain('id="다음-섹션"')
    expect(html).toContain("다음 섹션")
  })

  it("splits a paragraph glued onto an image line (old rich-editor saves)", () => {
    const html = renderMarkdownToHtml("![첫 화면](https://classin.ai.kr/first.png)화상강의 하면 가장 먼저 떠오르는 것은 Zoom입니다.")

    expect(html).toContain("<figure")
    expect(html).toContain("<p class=\"mt-5 text-[17px] leading-8 text-[#2f2f2b]\">화상강의 하면")
    expect(html).not.toContain("![첫 화면]")
  })

  it("renders trailing-backslash hard breaks as line breaks, not literal backslashes", () => {
    const paragraph = renderMarkdownToHtml("첫 줄\\\n둘째 줄")
    expect(paragraph).toContain("첫 줄<br /> 둘째 줄")
    expect(paragraph).not.toContain("\\")

    const quote = renderMarkdownToHtml("> **퇴원율 계산 예시**\\\n> 당월 퇴원생 ÷ 월초 재원생")
    expect(quote).toContain("<strong>퇴원율 계산 예시</strong><br />당월 퇴원생")
    expect(quote).not.toContain("\\")
  })

  it("shows < > saved as entities by the rich editor as plain characters", () => {
    const html = renderMarkdownToHtml("상하이에서 &lt;기술, 교육, 그리고 비즈니스&gt; 포럼을 열었습니다.")
    expect(html).toContain("&lt;기술, 교육, 그리고 비즈니스&gt;")
    expect(html).not.toContain("&amp;lt;")
  })

  it("renders <https://…> autolinks", () => {
    const html = renderMarkdownToHtml("<https://st2.classin.com/files/demo.mp4>")
    expect(html).toContain('href="https://st2.classin.com/files/demo.mp4"')
    expect(html).not.toContain("&lt;https://")
  })

  it("deduplicates repeated heading ids", () => {
    const html = renderMarkdownToHtml(["## 결과", "", "### 결과", "", "## 결과"].join("\n"))

    expect(html).toContain('id="결과"')
    expect(html).toContain('id="결과-2"')
    expect(html).toContain('id="결과-3"')
  })

  it("renders simple markdown tables", () => {
    const html = renderMarkdownToHtml(
      ["| 항목 | 이전 | 이후 |", "|------|-----:|:----:|", "| 출석 | 70% | 92% |"].join("\n")
    )

    expect(html).toContain("<table")
    expect(html).toContain("<thead>")
    expect(html).toContain("항목")
    expect(html).toContain("92%")
    expect(html).toContain("text-right")
    expect(html).toContain("text-center")
  })

  it("does not render unsupported image hosts as images", () => {
    const html = renderMarkdownToHtml("![bad](https://example.com/image.png)")

    expect(html).not.toContain("<figure")
    expect(html).not.toContain("<img")
    expect(html).toContain("![bad]")
  })
})
