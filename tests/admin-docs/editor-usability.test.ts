import { describe, expect, it } from "vitest"

import {
  buildSlashCommandMarkdown,
  filterSlashCommands,
  getDocsEditorHelp,
} from "@/lib/admin/docs-editor-usability"

describe("docs editor usability helpers", () => {
  it("filters slash commands by Korean label and alias", () => {
    expect(filterSlashCommands("이미").map((command) => command.id)).toEqual(["image"])
    expect(filterSlashCommands("check").map((command) => command.id)).toContain("checklist")
  })

  it("builds reusable markdown snippets for slash commands", () => {
    expect(buildSlashCommandMarkdown("h2")).toBe("## 새 섹션")
    expect(buildSlashCommandMarkdown("checklist")).toContain("- 첫 번째로 할 일")
    // 체크박스 문법은 이 파이프라인에 없다 — 공개 화면에 "[ ]"가 그대로 노출된다.
    expect(buildSlashCommandMarkdown("checklist")).not.toContain("[ ]")
  })

  it("explains difficult publishing terms in operator language", () => {
    expect(getDocsEditorHelp("slug")?.description).toContain("URL")
    expect(getDocsEditorHelp("noindex")?.description).toContain("검색 엔진")
    expect(getDocsEditorHelp("unknown")).toBeNull()
  })
})
