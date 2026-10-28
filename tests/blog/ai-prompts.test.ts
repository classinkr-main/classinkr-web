import { describe, expect, it } from "vitest"

import { buildBlogAiPrompt, readBlogAiRequest, splitBlogAiDraft } from "@/lib/blog-ai-prompts"

describe("splitBlogAiDraft", () => {
  it("제목 줄과 meta 블록을 본문에서 떼어 각 칸으로 보낸다", () => {
    const raw = [
      "# 결석 보강, 녹화로 바꾸는 법",
      "",
      "도입 문단입니다.",
      "",
      "## 왜 녹화일까요?",
      "{{green:핵심 한 줄}}",
      "",
      "<!--meta",
      "요약: 두 문장 요약입니다. 둘째 문장.",
      "SEO 설명: 검색 결과 설명",
      "얻는 것: 하나 | 둘 |  셋 ",
      "-->",
    ].join("\n")
    expect(splitBlogAiDraft(raw)).toEqual({
      title: "결석 보강, 녹화로 바꾸는 법",
      body: "도입 문단입니다.\n\n## 왜 녹화일까요?\n{{green:핵심 한 줄}}",
      excerpt: "두 문장 요약입니다. 둘째 문장.",
      seoDescription: "검색 결과 설명",
      benefits: ["하나", "둘", "셋"],
    })
  })

  it("meta 가 없으면 본문을 그대로, 닫는 표시가 없으면 meta 뒤를 버린다", () => {
    expect(splitBlogAiDraft("본문만\n\n## 소제목").body).toBe("본문만\n\n## 소제목")
    const cut = splitBlogAiDraft("# 제목\n본문\n<!--meta\n요약: 잘린")
    expect(cut).toMatchObject({ title: "제목", body: "본문", excerpt: "잘린" })
  })

  it("## 소제목을 제목으로 오인하지 않는다", () => {
    expect(splitBlogAiDraft("## 소제목\n본문").title).toBe("")
  })
})

describe("buildBlogAiPrompt", () => {
  it("초안: 참고 자료·독자·검색어·연결 자료를 넣고 근거 밖 수치를 막는다", () => {
    const prompt = buildBlogAiPrompt("draft", "", "", "인사이트", {
      topic: "결석 보강",
      tone: "없는 톤",
      length: "short",
      reference: "86인치 권장",
      audience: "1인 원장",
      keywords: ["녹화", " ", "보강"],
      closing: "자료 '판단표' 받기",
    })
    expect(prompt).toContain("86인치 권장")
    expect(prompt).toContain("독자: 1인 원장")
    expect(prompt).toContain("검색어: 녹화, 보강")
    expect(prompt).toContain("자료 '판단표' 받기로")
    expect(prompt).toContain("[확인 필요]")
    expect(prompt).toContain("약 1,500자")
    expect(prompt).toContain("신뢰감 있는 전문가") // 모르는 톤 → 기본 톤
    expect(prompt).toContain("<!--meta")
  })

  it("다듬기: 블로그 표기를 지키게 하고, 선택 구간이면 제목을 만들지 않게 한다", () => {
    const whole = buildBlogAiPrompt("optimize", "t", "본문", "제품", {})
    expect(whole).toContain("{{green:문장}}")
    expect(whole).toContain("==구절==")
    const part = buildBlogAiPrompt("optimize", "t", "본문", "제품", { selection: true })
    expect(part).toContain("이 구간만 다듬는다")
  })
})

describe("readBlogAiRequest", () => {
  it("문자열이 아닌 값은 버리고 긴 입력은 자른다", () => {
    const { title, extra } = readBlogAiRequest({
      title: 42,
      reference: "가".repeat(20_000),
      keywords: ["a", 1, "b"],
      selection: "true",
    })
    expect(title).toBe("")
    expect(extra.reference).toHaveLength(12_000)
    expect(extra.keywords).toEqual(["a", "b"])
    expect(extra.selection).toBe(false)
  })
})
