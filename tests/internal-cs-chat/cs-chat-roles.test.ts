import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({ select: vi.fn(), from: vi.fn() }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: supabaseMocks.from }),
}))

import {
  CRM_STAFF_ADMIN_API_ROLES,
  CS_COPILOT_API_ROLES,
  CS_DISPATCH_CAPABILITY,
  hasAdminApiRole,
  requireCsCopilotCapability,
} from "@/lib/admin-auth"
import { ADMIN_CAPABILITIES } from "@/lib/admin-capabilities"
import {
  INTERNAL_CS_CONVERSATION_LIST_COLUMNS,
  listInternalCsConversations,
} from "@/lib/repositories/internal-cs-chat"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe("CS copilot roles and capabilities", () => {
  it("keeps the same role set as before (who can enter is not changed by this batch)", () => {
    expect([...CS_COPILOT_API_ROLES]).toEqual([...CRM_STAFF_ADMIN_API_ROLES])
    expect(hasAdminApiRole("branch", CS_COPILOT_API_ROLES)).toBe(true)
    expect(hasAdminApiRole("EDITOR", CS_COPILOT_API_ROLES)).toBe(true)
    expect(hasAdminApiRole("VIEWER", CS_COPILOT_API_ROLES)).toBe(false)
    expect(hasAdminApiRole("PARTNER", CS_COPILOT_API_ROLES)).toBe(false)
  })

  it("registers the cs capabilities", () => {
    expect(ADMIN_CAPABILITIES).toEqual(expect.arrayContaining(["cs.dispatch", "cs.knowledge.promote", "cs.regression.run", "cs.asset.delete"]))
  })

  it("grants the cs capability to every current copilot role by default so nobody is locked out", () => {
    for (const role of CS_COPILOT_API_ROLES) {
      expect(requireCsCopilotCapability({ role, capabilities: [] }, CS_DISPATCH_CAPABILITY)).toBeUndefined()
    }
  })

  it("denies roles outside the copilot set even when the capability is missing the default grant", () => {
    const response = requireCsCopilotCapability({ role: "VIEWER", capabilities: [] }, CS_DISPATCH_CAPABILITY)
    expect(response?.status).toBe(403)
  })

  it("with the strict switch only explicit grants (and SUPER_ADMIN) pass", async () => {
    vi.stubEnv("CS_COPILOT_STRICT_CAPABILITIES", "1")
    const denied = requireCsCopilotCapability({ role: "ADMIN", capabilities: [] }, CS_DISPATCH_CAPABILITY)
    expect(denied?.status).toBe(403)
    expect(await denied?.json()).toMatchObject({ requiredCapability: "cs.dispatch" })
    expect(requireCsCopilotCapability({ role: "BRANCH", capabilities: [] }, CS_DISPATCH_CAPABILITY)?.status).toBe(403)
    expect(requireCsCopilotCapability({ role: "ADMIN", capabilities: ["cs.dispatch"] }, CS_DISPATCH_CAPABILITY)).toBeUndefined()
    expect(requireCsCopilotCapability({ role: "SUPER_ADMIN", capabilities: [] }, CS_DISPATCH_CAPABILITY)).toBeUndefined()
  })

  it("the B5-owned cs-chat routes use the dedicated role constant, not the CRM one", () => {
    const routes = [
      "app/api/admin/cs-chat/conversations/route.ts",
      "app/api/admin/cs-chat/conversations/[id]/route.ts",
      "app/api/admin/cs-chat/conversations/[id]/assets/route.ts",
      "app/api/admin/cs-chat/conversations/[id]/assets/[assetId]/route.ts",
      "app/api/admin/cs-chat/conversations/[id]/dispatch/route.ts",
      "app/api/admin/cs-chat/conversations/[id]/messages/route.ts",
      "app/api/admin/cs-chat/metrics/route.ts",
      "app/api/admin/cs-chat/regression-candidates/route.ts",
      "app/api/admin/cs-chat/integrations/status/route.ts",
    ]
    for (const route of routes) {
      const source = readFileSync(join(process.cwd(), route), "utf8")
      expect(source, route).toContain("CS_COPILOT_API_ROLES")
      expect(source, route).not.toContain("CRM_STAFF_ADMIN_API_ROLES")
    }
    const dispatch = readFileSync(join(process.cwd(), routes[4]), "utf8")
    expect(dispatch).toContain("requireCsCopilotCapability")
  })
})

describe("conversation list data minimisation", () => {
  it("does not select customer_context for the list", async () => {
    expect(INTERNAL_CS_CONVERSATION_LIST_COLUMNS).not.toContain("customer_context")
    expect(INTERNAL_CS_CONVERSATION_LIST_COLUMNS).not.toContain("*")

    const chain: Record<string, unknown> = {}
    for (const name of ["order", "range", "eq", "or"]) chain[name] = vi.fn(() => chain)
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null, count: 0 })
    supabaseMocks.select.mockReturnValue(chain)
    supabaseMocks.from.mockReturnValue({ select: supabaseMocks.select })

    await listInternalCsConversations({ status: "all" })

    expect(supabaseMocks.from).toHaveBeenCalledWith("internal_cs_conversations")
    const [columns] = supabaseMocks.select.mock.calls[0]
    expect(columns).not.toContain("customer_context")
    expect(columns).toContain("title")
    expect(columns).toContain("tags")
  })
})
