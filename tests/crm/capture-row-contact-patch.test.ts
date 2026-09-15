import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 감사 2026-09-07 §10 — 캡처 입력함이 organization_name/contact_name만 고칠 수 있어, 파서가
// 잘못 자른 전화/이메일 하나 고치자고 배치를 통째로 다시 파싱해야 했다. phone/email PATCH를 열되
// app/api/admin/leads/route.ts POST과 같은 형식 기준을 그대로 따른다(등록 단계에서 다시 걸리지
// 않도록).

const requireVerifiedAdminContext = vi.fn()
const updateCaptureRow = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/crm/capture/repository", () => ({ updateCaptureRow }))

async function callPatch(body: unknown) {
  const { PATCH } = await import("@/app/api/admin/crm/capture/rows/[id]/route")
  const req = new NextRequest("https://classin.kr/api/admin/crm/capture/rows/row-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  return PATCH(req, { params: Promise.resolve({ id: "row-1" }) })
}

describe("PATCH capture rows/[id] — 전화/이메일 행 단위 교정", () => {
  beforeEach(() => {
    requireVerifiedAdminContext.mockResolvedValue({ source: "supabase", role: "ADMIN", userId: "admin-1" })
    updateCaptureRow.mockImplementation(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch }))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("형식이 맞는 전화/이메일 교정을 저장한다", async () => {
    const res = await callPatch({ phone: "010-1234-5678", email: "fixed@example.com" })

    expect(res.status).toBe(200)
    expect(updateCaptureRow).toHaveBeenCalledWith("row-1", {
      phone: "010-1234-5678",
      email: "fixed@example.com",
    })
  })

  it("빈 문자열은 null로 지운다(다른 문자열 필드와 같은 규약)", async () => {
    await callPatch({ phone: "", email: "" })
    expect(updateCaptureRow).toHaveBeenCalledWith("row-1", { phone: null, email: null })
  })

  it("형식이 틀린 전화는 400이고 저장하지 않는다", async () => {
    const res = await callPatch({ phone: "abc" })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("전화번호 형식")
    expect(updateCaptureRow).not.toHaveBeenCalled()
  })

  it("형식이 틀린 이메일은 400이고 저장하지 않는다", async () => {
    const res = await callPatch({ email: "not-an-email" })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("이메일 형식")
    expect(updateCaptureRow).not.toHaveBeenCalled()
  })

  it("기존 organizationName/contactName 편집은 그대로 동작한다(회귀 없음)", async () => {
    await callPatch({ organizationName: "새 학원명", contactName: "김원장" })
    expect(updateCaptureRow).toHaveBeenCalledWith("row-1", {
      organization_name: "새 학원명",
      contact_name: "김원장",
    })
  })
})
