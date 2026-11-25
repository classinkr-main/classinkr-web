// 서버 1단계 검토(2026-11) 안전-3·안전-5 재현 시험 — 행위자 키 충돌, 화면 맥락 경로·이름표 검사.
import { describe, expect, it } from "vitest"

import { staffKey } from "@/lib/admin-ai/server/actor"
import { parseChatBody } from "@/lib/admin-ai/server/request"

const body = (pageContext: unknown) => ({ messages: [{ role: "user", text: "재고 알려 줘" }], pageContext })

describe("화면 맥락 검사(안전-5)", () => {
  it.each(["/admin/../api/x", "/admin//hardware", "/admin/%2e%2e/api", "/admin\\..\\api", "/admin/./x"])("상위 경로·빈 마디 %s 는 버린다", (path) => {
    const parsed = parseChatBody(body({ path, label: "x" }))
    expect(parsed.ok && parsed.value.context).toBeNull()
  })

  it("보통 어드민 경로와 쿼리는 받는다", () => {
    const parsed = parseChatBody(body({ path: "/admin/quotes?tab=draft", label: "견적" }))
    expect(parsed.ok && parsed.value.context?.path).toBe("/admin/quotes?tab=draft")
  })

  it("연락처 꼴 이름표는 비운다(배송 예정 받는 곳으로 저장되지 않게)", () => {
    for (const label of ["010-1234-5678", "고객 a.person@example.com", "고객 01012345678"]) {
      const parsed = parseChatBody(body({ path: "/admin/crm/customers/unified", label: "고객", entity: { type: "customer", id: "cust-1", label } }))
      expect(parsed.ok && parsed.value.context?.entity?.label, label).toBe("")
    }
    const ok = parseChatBody(body({ path: "/admin/crm/customers/unified", label: "고객", entity: { type: "customer", id: "cust-1", label: "고객 기관(샘플)" } }))
    expect(ok.ok && ok.value.context?.entity?.label).toBe("고객 기관(샘플)")
  })
})

describe("행위자 키(안전-3)", () => {
  it("계정 id 가 없으면 이름 공백·역할이 달라도 서로 다른 키다", () => {
    const a = staffKey({ source: "legacy", role: "EDITOR", name: "스태프 가", userId: undefined, capabilities: [] } as never)
    const b = staffKey({ source: "legacy", role: "ADMIN", name: "스태프가", userId: undefined, capabilities: [] } as never)
    const c = staffKey({ source: "legacy", role: "EDITOR", name: "스태프가", userId: undefined, capabilities: [] } as never)
    expect(new Set([a, b, c]).size).toBe(3)
    expect(a).toMatch(/^legacy:EDITOR:[0-9a-f]{16}$/)
  })

  it("계정 id 가 있으면 그 id 다", () => {
    expect(staffKey({ source: "supabase", role: "ADMIN", name: "x", userId: "user-1", capabilities: [] } as never)).toBe("user-1")
  })
})
