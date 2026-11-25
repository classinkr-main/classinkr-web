/**
 * 공용 운영 도구 레지스트리 계약 — 쓰기 정의에는 run 이 없다(preview·execute 만), MCP 이름 집합이 레지스트리와 같다.
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/repositories/hardware-inventory", () => ({
  createHardwareMovementRows: vi.fn(),
  listHardwareItems: vi.fn(),
  findHardwareMovementsByMcpIdempotencyKey: vi.fn(),
  getHardwareDashboard: vi.fn(),
  getHardwareMovementsPage: vi.fn(),
}))
vi.mock("@/lib/repositories/hardware-sales-dashboard", () => ({ currentSalesFy: vi.fn(), getHardwareSalesDashboard: vi.fn() }))
vi.mock("@/lib/auth/audit", () => ({ logAudit: vi.fn(), logAuditChecked: vi.fn() }))
vi.mock("@/lib/chatbot/service", () => ({ evaluateChatbotQuery: vi.fn() }))
vi.mock("@/lib/admin/traffic-summary", () => ({ getCachedTrafficSummary: vi.fn() }))
vi.mock("@/lib/portal/repositories/activity", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/portal/repositories/documents", () => ({ listPortalDocuments: vi.fn() }))
vi.mock("@/lib/portal/repositories/deals", () => ({ listDealListItems: vi.fn() }))
vi.mock("@/lib/portal/repositories/quote-documents", () => ({
  createQuoteDocument: vi.fn(),
  createQuoteDocumentVersion: vi.fn(),
  getQuoteDocument: vi.fn(),
  getResolvableQuoteVersion: vi.fn(),
}))

import { listTools } from "@/lib/mcp/tools"
import { OPS_SCOPES } from "@/lib/ops-tools/actor"
import { OPS_TOOLS } from "@/lib/ops-tools/registry"

describe("ops-tools 레지스트리", () => {
  it("id·mcpName 이 겹치지 않는다", () => {
    expect(new Set(OPS_TOOLS.map((t) => t.id)).size).toBe(OPS_TOOLS.length)
    expect(new Set(OPS_TOOLS.map((t) => t.mcpName)).size).toBe(OPS_TOOLS.length)
  })

  it("R0 은 run 하나, R1 이상은 run 없이 preview·execute", () => {
    for (const t of OPS_TOOLS) {
      if (t.risk === "R0") {
        expect(typeof (t as { run?: unknown }).run, t.id).toBe("function")
        expect(t, t.id).not.toHaveProperty("preview")
        expect(t, t.id).not.toHaveProperty("execute")
      } else {
        expect(t, t.id).not.toHaveProperty("run")
        expect(typeof (t as { preview?: unknown }).preview, t.id).toBe("function")
        expect(typeof (t as { execute?: unknown }).execute, t.id).toBe("function")
      }
    }
  })

  it("필요 범위는 아는 범위이고, 쓰기는 write:* 범위를 요구한다", () => {
    for (const t of OPS_TOOLS) {
      expect(OPS_SCOPES, t.id).toContain(t.requiredScope)
      if (t.risk === "R0") expect(t.requiredScope, t.id).toBe("read")
      else expect(t.requiredScope, t.id).toMatch(/^write:/)
    }
  })

  it("MCP tools/list 이름 집합 = 레지스트리 mcpName 집합(순서도 같다)", () => {
    expect(listTools().map((t) => t.name)).toEqual(OPS_TOOLS.map((t) => t.mcpName))
  })

  it("MCP 의 읽기 전용 표시는 등급과 같다", () => {
    const byName = new Map(OPS_TOOLS.map((t) => [t.mcpName, t]))
    for (const d of listTools()) expect(d.annotations.readOnlyHint, d.name).toBe(byName.get(d.name)?.risk === "R0")
  })
})
