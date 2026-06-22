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
    expect(buildSlashCommandMarkdown("checklist")).toContain("- [ ] 확인할 항목")
  })

  it("explains difficult publishing terms in operator language", () => {
    expect(getDocsEditorHelp("slug")?.description).toContain("URL")
    expect(getDocsEditorHelp("noindex")?.description).toContain("검색 엔진")
    expect(getDocsEditorHelp("unknown")).toBeNull()
  })
})
