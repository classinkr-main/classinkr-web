import { describe, expect, it } from "vitest"

import {
  MANAGE_PROJECTS_HREF,
  manageViewSearch,
  parseManageView,
} from "@/lib/marketing/manage-view"

// 캠페인 관리(캠페인·프로젝트 통합, 2026-10)의 탭 ↔ 주소 계약.
describe("manage-view", () => {
  it("?view=projects 만 프로젝트 탭이고, 나머지(없음·모르는 값·배열)는 캠페인 탭이다", () => {
    expect(parseManageView("projects")).toBe("projects")
    expect(parseManageView(undefined)).toBe("campaigns")
    expect(parseManageView("campaigns")).toBe("campaigns")
    expect(parseManageView("PROJECTS")).toBe("campaigns")
    expect(parseManageView(["projects", "campaigns"])).toBe("campaigns")
  })

  it("기본 탭은 파라미터 없는 깨끗한 주소, 프로젝트 탭은 ?view=projects", () => {
    expect(manageViewSearch("campaigns")).toBe("")
    expect(manageViewSearch("projects")).toBe("?view=projects")
    expect(MANAGE_PROJECTS_HREF).toBe("/admin/campaigns/manage?view=projects")
    expect(parseManageView(new URL(MANAGE_PROJECTS_HREF, "https://x.test").searchParams.get("view"))).toBe("projects")
  })
})
