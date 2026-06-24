import { beforeEach, describe, expect, it, vi } from "vitest"

const order = vi.fn()
const eq = vi.fn(() => ({ order }))
const select = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ select }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from })),
}))

import { getMaterialDownloadsByUser } from "@/lib/repositories/account-downloads"

describe("getMaterialDownloadsByUser", () => {
  beforeEach(() => {
    from.mockClear()
    select.mockClear()
    eq.mockClear()
    order.mockReset()
  })

  it("returns [] for an empty userId without querying", async () => {
    const result = await getMaterialDownloadsByUser("")
    expect(result).toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it("scopes by user_id, orders by created_at desc, and de-dupes per slug", async () => {
    order.mockResolvedValue({
      data: [
        { material_slug: "academy-checklist", gate_type: "login", created_at: "2026-06-20T10:00:00Z" },
        { material_slug: "academy-checklist", gate_type: "login", created_at: "2026-06-10T10:00:00Z" },
        { material_slug: "onboarding-guide", gate_type: "login", created_at: "2026-06-15T10:00:00Z" },
      ],
      error: null,
    })

    const result = await getMaterialDownloadsByUser("user-123")

    expect(from).toHaveBeenCalledWith("material_downloads")
    expect(select).toHaveBeenCalledWith("material_slug, gate_type, created_at")
    expect(eq).toHaveBeenCalledWith("user_id", "user-123")
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false })
    expect(result).toEqual([
      { slug: "academy-checklist", gateType: "login", lastDownloadedAt: "2026-06-20T10:00:00Z" },
      { slug: "onboarding-guide", gateType: "login", lastDownloadedAt: "2026-06-15T10:00:00Z" },
    ])
  })

  it("returns [] and does not throw when the query errors", async () => {
    order.mockResolvedValue({ data: null, error: { message: "rls denied" } })
    const result = await getMaterialDownloadsByUser("user-123")
    expect(result).toEqual([])
  })
})
