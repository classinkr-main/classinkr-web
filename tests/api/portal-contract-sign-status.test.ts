// V2 계약 서명 상태가 서명 순서에 따라 뒤집히던 문제 — 양측 서명이 모두 있으면 순서와 무관하게 completed.
import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>

const { state, requirePortalContext, proposeLedgerDraftForSignedContract } = vi.hoisted(() => ({
  state: {
    doc: {} as Record<string, unknown>,
    version: {} as Record<string, unknown>,
  },
  requirePortalContext: vi.fn(),
  proposeLedgerDraftForSignedContract: vi.fn(async () => ({ status: "created" })),
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/portal/portal-context", () => ({
  requirePortalContext,
  isErrorResponse: (value: unknown) => value instanceof NextResponse,
}))
vi.mock("@/lib/portal/portal-authorize", () => ({
  authorizeForAccount: vi.fn(() => undefined),
  getActorInfo: vi.fn(() => ({ actor_user_id: "u1", actor_role: "admin" })),
}))
vi.mock("@/lib/portal/repositories/deals", () => ({
  getDeal: vi.fn(async () => ({ id: "deal_1", partner_account_id: "pa_1", customer_id: "cust_1" })),
}))
vi.mock("@/lib/portal/repositories/activity", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/server/image-validation", () => ({
  decodePngDataUrl: vi.fn(() => ({ ok: true, buffer: Buffer.from("png") })),
}))
vi.mock("@/lib/admin/handoff/contract-to-ledger-draft", () => ({ proposeLedgerDraftForSignedContract }))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  }),
}))
// 실제 applySignature 의 상태 파생은 repository 테스트(아래 인메모리 구현)로 함께 고정한다.
vi.mock("@/lib/portal/repositories/contract-documents", () => ({
  getContractDocument: vi.fn(async () => state.doc),
  applySignature: vi.fn(async (_versionId: string, _url: string, signer: "partner" | "admin") => {
    const now = new Date().toISOString()
    Object.assign(
      state.version,
      signer === "partner" ? { partner_signed_at: now } : { admin_signed_at: now }
    )
    return { ...state.version }
  }),
  updateContractDocument: vi.fn(async (_id: string, input: Row) => {
    Object.assign(state.doc, input)
    return state.doc
  }),
}))

import { POST as sign } from "@/app/api/portal/contracts/[id]/sign/route"

const signAs = (type: "admin" | "partner") => {
  requirePortalContext.mockResolvedValue({ type, scope: "all", userId: "u1", name: "담당", role: "ADMIN" })
  return sign(
    new NextRequest("https://classin.kr/api/portal/contracts/cd_1/sign", {
      method: "POST",
      body: JSON.stringify({ signature_data: "data:image/png;base64,AAAA" }),
    }),
    { params: Promise.resolve({ id: "cd_1" }) }
  )
}

beforeEach(() => {
  proposeLedgerDraftForSignedContract.mockClear()
  state.doc = { id: "cd_1", deal_id: "deal_1", contract_number: "C-2026-001", status: "draft", current_version_id: "cv_1" }
  state.version = { id: "cv_1", partner_signed_at: null, admin_signed_at: null }
})

describe("POST /api/portal/contracts/[id]/sign — 서명 상태", () => {
  it("파트너 → 관리자 순서로 서명하면 completed", async () => {
    expect((await signAs("partner")).status).toBe(200)
    expect(state.doc.status).toBe("partner_signed")
    expect((await signAs("admin")).status).toBe(200)
    expect(state.doc.status).toBe("completed")
  })

  it("관리자 → 파트너 순서로 서명해도 completed (partner_signed 로 되돌아가지 않는다)", async () => {
    await signAs("admin")
    expect(state.doc.status).toBe("admin_signed")
    await signAs("partner")
    expect(state.doc.status).toBe("completed")
  })

  it("한쪽만 서명하면 서명한 쪽 상태", async () => {
    await signAs("admin")
    expect(state.doc.status).toBe("admin_signed")
  })

  it("관리자가 서명할 때마다 원장 초안 제안을 시도한다(순서와 무관)", async () => {
    await signAs("admin")
    await signAs("partner")
    expect(proposeLedgerDraftForSignedContract).toHaveBeenCalledTimes(1)

    // 두 번째 장면: 파트너만 서명한 계약(완료된 계약에는 더 서명할 수 없으므로 문서 상태도 그 장면으로 되돌린다).
    state.doc.status = "partner_signed"
    state.version = { id: "cv_1", partner_signed_at: "2026-11-01T00:00:00.000Z", admin_signed_at: null }
    await signAs("admin")
    expect(proposeLedgerDraftForSignedContract).toHaveBeenCalledTimes(2)
    expect(state.doc.status).toBe("completed")
  })
})

describe("POST /api/portal/contracts/[id]/sign — 끝난 계약에는 서명을 받지 않는다", () => {
  // 2026-11-25 점검 B-6: 상태를 보지 않아 취소·완료된 계약이 서명 단계로 되돌아갔다.
  it.each(["cancelled", "completed"])("%s 계약은 409 이고 상태·서명을 바꾸지 않는다", async (status) => {
    state.doc.status = status
    const response = await signAs("admin")

    expect(response.status).toBe(409)
    expect(state.doc.status).toBe(status)
    expect(state.version.admin_signed_at).toBeNull()
    expect(proposeLedgerDraftForSignedContract).not.toHaveBeenCalled()
  })
})
