import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ document: null as Record<string, unknown> | null }))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: table === "quote_document_shares"
          ? { quote_document_version_id: "version", expires_at: null }
          : table === "quote_document_versions" ? { id: "version", quote_document_id: "quote" }
          : table === "deals" ? { customers: { name: "고객", email: null } } : null, error: null }),
        single: async () => ({ data: mocks.document, error: null }),
      }
      return query
    },
  }),
}))
import { getPublicQuoteByToken } from "@/lib/portal/repositories/quote-documents"

beforeEach(() => { mocks.document = { id: "quote", deal_id: "deal", deleted_at: null } })

describe("삭제된 견적 공유", () => {
  it("삭제 표시가 있으면 기존 공유 링크로도 열 수 없다", async () => {
    mocks.document = { id: "quote", deal_id: "deal", deleted_at: "2026-11-02T00:00:00Z" }
    expect(await getPublicQuoteByToken("token")).toEqual({ status: "not_found" })
  })
  it("복구되면 만료되지 않은 링크를 다시 열 수 있다", async () => {
    expect((await getPublicQuoteByToken("token")).status).toBe("ok")
  })
})
