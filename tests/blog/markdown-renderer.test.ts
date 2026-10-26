import { describe, expect, it } from "vitest"

import { extractMarkdownHeadings, renderMarkdownToHtml } from "@/lib/blog-markdown"

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

  // 리치 에디터(tiptap-markdown)가 저장하는 역슬래시 이스케이프를 공개 페이지에 그대로 보이지 않게 한다.
  it("unescapes editor backslash escapes instead of printing them", () => {
    const html = renderMarkdownToHtml("수강생 10\\~20명, \\[무료\\] 안내 \\*강조 아님\\*\n\n1\\. 첫째\n\n\\# 해시태그")

    expect(html).toContain("수강생 10~20명, [무료] 안내 *강조 아님*")
    expect(html).toContain("1. 첫째")
    expect(html).toContain("# 해시태그")
    expect(html).not.toContain("\\")
    expect(html).not.toContain("<em>")
    expect(html).not.toContain("<ol")
  })

  it("keeps backslashes inside inline code", () => {
    const html = renderMarkdownToHtml("경로는 `C:\\temp\\~x` 입니다")
    expect(html).toContain("C:\\temp\\~x")
  })

  it("unescapes inside link labels", () => {
    const html = renderMarkdownToHtml("[10\\~20명 수업](/blog/x)")
    expect(html).toContain(">10~20명 수업</a>")
    expect(html).not.toContain("\u0000")
  })

  it("demotes a body H1 to H2 and renders H4 as a minor heading", () => {
    const html = renderMarkdownToHtml("# 본문 첫 제목\n\n#### 작은 소제목\n\n문단")
    expect(html).toMatch(/<h2 id="본문-첫-제목"/)
    expect(html).toContain("<h4")
    expect(html).toContain("작은 소제목</h4>")
    expect(html).not.toContain("####")
  })

  it("keeps the table of contents ids in sync with rendered headings", () => {
    const markdown = "# 요약\n\n## 요약\n\n#### 요약\n\n### 10\\~20명"
    const html = renderMarkdownToHtml(markdown)
    for (const heading of extractMarkdownHeadings(markdown)) {
      expect(html).toContain(`id="${heading.id}"`)
    }
    expect(extractMarkdownHeadings(markdown).map((h) => h.text)).toEqual(["요약", "요약", "10~20명"])
  })

  it("does not split table cells on escaped pipes", () => {
    const html = renderMarkdownToHtml("| 항목 | 내용 |\n| --- | --- |\n| A \\| B | 값 |")
    expect(html).toContain(">A | B</td>")
    expect(html.match(/<td/g)).toHaveLength(2)
  })
})

