/**
 * 리드 드로어 저장 규약 계약(C6) — docs/active/crm-lead-console-board-design-2026-08-21.md §4
 * "이산값은 선택 즉시 저장, 자유 텍스트는 ⌘↵/저장 버튼으로만 커밋, blur는 어떤 경우에도 저장하지 않는다."
 * 그리고 닫기 경로는 미저장 값을 조용히 버리지 않는다(확인 + 명시 저장 버튼).
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  resolve(process.cwd(), "components/admin/crm/leads/board/LeadDrawer.tsx"),
  "utf8"
)

describe("LeadDrawer 저장 규약", () => {
  it("blur는 어떤 경우에도 저장하지 않는다 — onBlur 저장·닫기 시 강제 blur 없음", () => {
    expect(source).not.toContain("onBlur=")
    expect(source).not.toContain(".blur()")
  })

  it("이산값(담당 select·팔로업 date)은 onChange 즉시 저장한다", () => {
    expect(source).toContain("void onAssignedToChange(lead.id, next).catch(() => setAssignedTo(previous))")
    expect(source).toContain("void saveFollowUp(next)")
    // 미완성 날짜(badInput)·연도 타이핑 중간값(min 미달)은 저장하지 않는다.
    expect(source).toContain('min="2000-01-01"')
    expect(source).toContain("if (!event.currentTarget.validity.valid) return")
  })

  it("자유 텍스트(메모)는 ⌘/Ctrl+Enter 또는 저장 버튼으로만 커밋한다", () => {
    expect(source).toContain("(e.metaKey || e.ctrlKey)")
    expect(source).toContain("메모·행사 저장")
  })

  it("닫기 시 미저장 값(메모·팔로업)이 있으면 확인을 받고, 실패한 팔로업은 명시 저장 버튼으로 재시도한다", () => {
    expect(source).toContain('followUpUnsaved ? "팔로업 날짜" : null')
    expect(source).toContain("닫으면 사라집니다. 닫을까요?")
    expect(source).toContain("onClick={() => void saveFollowUp(followUp)}")
    expect(source).toContain("저장되지 않았습니다 · 저장 버튼으로 다시 시도하세요")
  })
})
