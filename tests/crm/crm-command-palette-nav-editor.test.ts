import { describe, expect, it } from "vitest"

import { ADMIN_OPEN_NAV_EDITOR_EVENT } from "@/components/admin/AdminCommandPalette"
import {
  CRM_PALETTE_OPEN_NAV_EDITOR_EVENT,
  NAV_CMDS,
  matchesNavCommand,
} from "@/components/admin/crm/CrmCommandPalette"

// CRM 라우트에서는 CrmCommandPalette 가 전역 ⌘K 를 대신한다(app/admin/crm/layout.tsx).
// 그래서 전역 팔레트에 생긴 "내 사이드바 편집"·태그·접수 명령과 라벨이 여기에도 같아야 한다.
describe("CRM 팔레트 — 전역 팔레트와 맞춘 명령", () => {
  it("사이드바 편집 이벤트 이름이 전역 정본과 같다", () => {
    expect(CRM_PALETTE_OPEN_NAV_EDITOR_EVENT).toBe(ADMIN_OPEN_NAV_EDITOR_EVENT)
  })

  it("사이드바 편집 명령은 이동이 아니라 이벤트 명령이고 '숨기기'로 찾힌다", () => {
    const editor = NAV_CMDS.find((nav) => nav.event === CRM_PALETTE_OPEN_NAV_EDITOR_EVENT)
    expect(editor?.label).toBe("내 사이드바 편집")
    expect(editor && matchesNavCommand(editor, "숨기기")).toBe(true)
  })

  it("태그 관리·접수로 이동할 수 있다", () => {
    const hrefs = NAV_CMDS.map((nav) => nav.href)
    expect(hrefs).toContain("/admin/crm/customers/tags")
    expect(hrefs).toContain("/admin/crm/customers/intake")
  })

  it("rev-sheet 는 '매출시트'로 부르고 옛 이름으로도 찾힌다", () => {
    const revSheet = NAV_CMDS.find((nav) => nav.href === "/admin/crm/deals/rev-sheet")
    expect(revSheet?.label).toBe("매출시트")
    expect(revSheet && matchesNavCommand(revSheet, "REV 스냅샷")).toBe(true)
  })

  it("이벤트 명령을 빼면 href 가 겹치지 않는다(항목 id 충돌 방지)", () => {
    const hrefs = NAV_CMDS.filter((nav) => !nav.event).map((nav) => nav.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
