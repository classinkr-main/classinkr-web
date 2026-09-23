// 라운드 5 S-5 — 클라이언트 버튼 노출용 역할 목록(lib/admin/session-role.ts)이 서버 정본(lib/admin-auth.ts)과
// 어긋나면, 눌러도 403만 나는 버튼이 다시 보이거나 쓸 수 있는 버튼이 숨는다. 두 목록을 대조한다.
import { describe, expect, it } from "vitest"

import { CRM_STAFF_ADMIN_API_ROLES, STAFF_ADMIN_API_ROLES } from "@/lib/admin-auth"
import { SESSION_CRM_STAFF_ROLES, SESSION_SHEET_SYNC_ROLES } from "@/lib/admin/session-role"

describe("세션 역할 목록 = 서버 역할 묶음", () => {
  it("시트 동기화 = STAFF_ADMIN_API_ROLES(verifyAdmin 기본 POST 역할)", () => {
    expect([...SESSION_SHEET_SYNC_ROLES].sort()).toEqual([...STAFF_ADMIN_API_ROLES].sort())
  })

  it("CRM 운영 쓰기 = CRM_STAFF_ADMIN_API_ROLES", () => {
    expect([...SESSION_CRM_STAFF_ROLES].sort()).toEqual([...CRM_STAFF_ADMIN_API_ROLES].sort())
  })
})
