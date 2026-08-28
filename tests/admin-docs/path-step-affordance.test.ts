import { describe, expect, it } from "vitest"

import { markdownToSections } from "@/lib/admin/docs-markdown"
import {
  PATH_STEP_EXAMPLE,
  PATH_STEP_MARKDOWN,
  PATH_STEP_PREFIX,
  SLASH_COMMANDS,
  buildSlashCommandMarkdown,
  filterSlashCommands,
  restorePathStepMarkup,
} from "@/lib/admin/docs-editor-usability"

describe("경로 슬래시 명령", () => {
  it("한글·영문 트리거 양쪽으로 찾힌다", () => {
    expect(filterSlashCommands("경로").map((command) => command.id)).toContain("path")
    expect(filterSlashCommands("path").map((command) => command.id)).toContain("path")
  })

  it("질의 없이 '/'만 눌러도 보이는 앞 6개 안에 있다", () => {
    // RichMarkdownEditor는 filterSlashCommands(...).slice(0, 6)만 렌더한다.
    expect(SLASH_COMMANDS.slice(0, 6).map((command) => command.id)).toContain("path")
  })

  it("삽입 결과가 파서가 스텝으로 잡는 불릿 한 줄이다", () => {
    const markdown = buildSlashCommandMarkdown("path")
    expect(markdown).toBe(PATH_STEP_MARKDOWN)

    const sections = markdownToSections(`## 절차\n\n${markdown}`)
    expect(sections[0].steps).toEqual([PATH_STEP_EXAMPLE])
  })

  it("삽입된 스텝이 공개 렌더러의 칩 규약을 만족한다", () => {
    const step = markdownToSections(`## 절차\n\n${PATH_STEP_MARKDOWN}`)[0].steps?.[0] ?? ""
    expect(step.startsWith(PATH_STEP_PREFIX)).toBe(true)

    // components/docs/DocsArticle.tsx PathStepChips 와 같은 분해 규칙.
    const segments = step.slice(PATH_STEP_PREFIX.length).split(" > ")
    expect(segments).toEqual(["대시보드", "[설정]", "[일반]"])
    expect(segments.filter((segment) => segment.startsWith("[") && segment.endsWith("]"))).toHaveLength(2)
  })
})

describe("restorePathStepMarkup — WYSIWYG 왕복 복구", () => {
  it("Tiptap이 이스케이프한 '>'와 대괄호를 되돌린다", () => {
    const serialized = "- 경로: 대시보드 &gt; \\[설정\\] &gt; \\[일반\\]"

    expect(restorePathStepMarkup(serialized)).toBe(PATH_STEP_MARKDOWN)
    expect(markdownToSections(`## 절차\n\n${restorePathStepMarkup(serialized)}`)[0].steps).toEqual([
      PATH_STEP_EXAMPLE,
    ])
  })

  it("번호 목록·들여쓴 불릿의 경로 스텝도 복구한다", () => {
    const restored = restorePathStepMarkup(
      ["1. 경로: 대시보드 &gt; \\[설정\\]", "  * 경로: 칠판 &gt; \\[수업 도구\\]"].join("\n")
    )

    expect(restored).toBe(["1. 경로: 대시보드 > [설정]", "  * 경로: 칠판 > [수업 도구]"].join("\n"))
  })

  it("경로 스텝이 아닌 줄은 건드리지 않는다", () => {
    const markdown = [
      "## 안내",
      "",
      "인용 표기 &gt; 는 본문에서 그대로 둡니다.",
      "- 링크 \\[대괄호\\] 표기가 있는 일반 스텝",
      "![설명](/images/a.png)",
    ].join("\n")

    expect(restorePathStepMarkup(markdown)).toBe(markdown)
  })

  it("이미 정상인 문서에는 변화가 없고 두 번 적용해도 같다", () => {
    const clean = `## 절차\n\n${PATH_STEP_MARKDOWN}`

    expect(restorePathStepMarkup(clean)).toBe(clean)
    expect(restorePathStepMarkup(restorePathStepMarkup(clean))).toBe(clean)
  })
})
