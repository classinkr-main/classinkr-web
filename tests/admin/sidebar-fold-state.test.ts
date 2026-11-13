import { describe, expect, it } from "vitest"

import type { AdminNavCategory } from "@/components/admin/admin-nav"
import { isFoldGroupExpanded, toggleFoldGroup, type FoldState } from "@/components/admin/sidebar-fold-state"

const state = (open: AdminNavCategory[] = [], closedActive: FoldState["closedActive"] = null): FoldState => ({
  open: new Set(open),
  closedActive,
})

describe("sidebar-fold-state — 접힘 묶음 펼침 규칙(2026-11-12)", () => {
  it("저장 목록에 있거나 현재 화면이 든 묶음이면 펼친다", () => {
    expect(isFoldGroupExpanded(state(["revenue"]), "revenue", null, "/admin/crm")).toBe(true)
    expect(isFoldGroupExpanded(state(), "system", "system", "/admin/settings")).toBe(true)
    expect(isFoldGroupExpanded(state(), "system", null, "/admin/crm")).toBe(false)
  })

  it("강제 열림 묶음을 접으면 이 화면에서 접히고, 저장 목록에는 열림이 생기지 않는다", () => {
    // 옛 동작: 저장 목록에 system 을 넣어 화면은 그대로 열려 있고, /admin/crm 으로 가면 거꾸로 열렸다.
    const next = toggleFoldGroup(state(), "system", "system", "/admin/settings")
    expect(isFoldGroupExpanded(next, "system", "system", "/admin/settings")).toBe(false)
    expect([...next.open]).toEqual([])
    expect(isFoldGroupExpanded(next, "system", null, "/admin/crm")).toBe(false)
  })

  it("다른 화면으로 가면 그 화면의 묶음은 다시 강제로 열린다", () => {
    const next = toggleFoldGroup(state(), "system", "system", "/admin/settings")
    expect(isFoldGroupExpanded(next, "system", "system", "/admin/users")).toBe(true)
  })

  it("저장돼 있던 강제 열림 묶음을 접으면 저장 목록에서도 빠진다", () => {
    const next = toggleFoldGroup(state(["system"]), "system", "system", "/admin/settings")
    expect(isFoldGroupExpanded(next, "system", "system", "/admin/settings")).toBe(false)
    expect(next.open.has("system")).toBe(false)
  })

  it("접은 강제 열림 묶음을 다시 펴면 저장 목록에 넣는다 — 마지막으로 누른 방향을 기억한다", () => {
    const closed = toggleFoldGroup(state(), "system", "system", "/admin/settings")
    const reopened = toggleFoldGroup(closed, "system", "system", "/admin/settings")
    expect(isFoldGroupExpanded(reopened, "system", "system", "/admin/settings")).toBe(true)
    expect(reopened.open.has("system")).toBe(true)
    expect(reopened.closedActive).toBeNull()
  })

  it("다른 묶음을 눌러도 이 화면에서 접어 둔 강제 열림 묶음은 접힌 채로 둔다", () => {
    const closed = toggleFoldGroup(state(), "system", "system", "/admin/settings")
    const other = toggleFoldGroup(closed, "revenue", "system", "/admin/settings")
    expect(other.open.has("revenue")).toBe(true)
    expect(isFoldGroupExpanded(other, "system", "system", "/admin/settings")).toBe(false)
  })

  it("강제 열림이 아닌 묶음은 저장 목록만 뒤집는다", () => {
    const opened = toggleFoldGroup(state(), "revenue", null, "/admin/crm")
    expect(opened.open.has("revenue")).toBe(true)
    expect(toggleFoldGroup(opened, "revenue", null, "/admin/crm").open.has("revenue")).toBe(false)
  })
})
