import { beforeEach, describe, expect, it, vi } from "vitest"

const createHardwareMovementRows = vi.fn()
const listDealListItems = vi.fn()
const createQuoteDocument = vi.fn()

vi.mock("@/lib/repositories/hardware-inventory", () => ({
  createHardwareMovementRows: (...a: unknown[]) => createHardwareMovementRows(...a),
  getHardwareDashboard: vi.fn(),
  getHardwareMovementsPage: vi.fn(),
}))
vi.mock("@/lib/repositories/hardware-sales-dashboard", () => ({ currentSalesFy: vi.fn(), getHardwareSalesDashboard: vi.fn() }))
vi.mock("@/lib/auth/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/chatbot/service", () => ({ evaluateChatbotQuery: vi.fn() }))
vi.mock("@/lib/admin/traffic-summary", () => ({ getCachedTrafficSummary: vi.fn() }))
vi.mock("@/lib/portal/repositories/activity", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/portal/repositories/documents", () => ({ listPortalDocuments: vi.fn() }))
vi.mock("@/lib/portal/repositories/deals", () => ({ listDealListItems: (...a: unknown[]) => listDealListItems(...a) }))
vi.mock("@/lib/portal/repositories/quote-documents", () => ({
  createQuoteDocument: (...a: unknown[]) => createQuoteDocument(...a),
  createQuoteDocumentVersion: vi.fn(),
  getQuoteDocument: vi.fn(),
  getResolvableQuoteVersion: vi.fn(),
}))

import { handleMcpPayload, resolveMcpCaller, type McpDeps } from "@/lib/mcp/server"
import { callTool, listTools } from "@/lib/mcp/tools"

const caller = { name: "tester" }

describe("resolveMcpCaller", () => {
  const env = "moon:aaaaaaaaaaaaaaaaaaaa,minjae:bbbbbbbbbbbbbbbbbbbb"
  it("맞는 토큰의 이름을 돌려준다", () => {
    expect(resolveMcpCaller("Bearer bbbbbbbbbbbbbbbbbbbb", env)).toEqual({ name: "minjae" })
  })
  it("env 가 비었거나 토큰이 틀리거나 짧으면 null(→401)", () => {
    expect(resolveMcpCaller("Bearer aaaaaaaaaaaaaaaaaaaa", undefined)).toBeNull()
    expect(resolveMcpCaller("Bearer aaaaaaaaaaaaaaaaaaab", env)).toBeNull()
    expect(resolveMcpCaller("aaaaaaaaaaaaaaaaaaaa", env)).toBeNull()
    expect(resolveMcpCaller("Bearer short", "x:short")).toBeNull()
    expect(resolveMcpCaller(null, env)).toBeNull()
  })
})

describe("handleMcpPayload", () => {
  const deps = (callToolImpl?: McpDeps["callTool"]): McpDeps => ({
    caller,
    listTools: () => [{ name: "t" }],
    callTool: callToolImpl ?? vi.fn(),
  })

  it("initialize 는 아는 판을 그대로, 모르는 판엔 최신을 답한다", async () => {
    const known = (await handleMcpPayload({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, deps())) as { result: { protocolVersion: string } }
    expect(known.result.protocolVersion).toBe("2025-06-18")
    const unknown = (await handleMcpPayload({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999" } }, deps())) as { result: { protocolVersion: string } }
    expect(unknown.result.protocolVersion).toBe("2025-11-25")
  })

  it("알림엔 답하지 않고, 모르는 메서드는 -32601", async () => {
    expect(await handleMcpPayload({ jsonrpc: "2.0", method: "notifications/initialized" }, deps())).toBeNull()
    const res = (await handleMcpPayload({ jsonrpc: "2.0", id: 3, method: "resources/list" }, deps())) as { error: { code: number } }
    expect(res.error.code).toBe(-32601)
  })

  it("도구가 던진 모르는 오류는 내용을 감추고 isError 로", async () => {
    const res = (await handleMcpPayload(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "x" } },
      deps(async () => {
        throw new Error("postgres://secret@host")
      })
    )) as { result: { isError: boolean; content: { text: string }[] } }
    expect(res.result.isError).toBe(true)
    expect(res.result.content[0].text).not.toContain("secret")
  })
})

describe("쓰기 도구", () => {
  beforeEach(() => {
    createHardwareMovementRows.mockReset().mockResolvedValue([{ id: "m1", product_name: "T1", quantity: 2, occurred_at: "2026-12-01", to_location: "A학원", status: "배송 예정", lot_no: null }])
    listDealListItems.mockReset()
    createQuoteDocument.mockReset()
  })

  it("쓰기 도구는 둘뿐이다", () => {
    expect(listTools().filter((t) => !t.annotations.readOnlyHint).map((t) => t.name).sort()).toEqual(["hw_plan_movement", "quote_create_draft"])
  })

  it("hw_plan_movement 는 늘 '배송 예정' 출고로, 입고관리 권한 없이 저장한다", async () => {
    const res = await callTool(
      "hw_plan_movement",
      { product_name: "T1", quantity: 2, planned_date: "2026-12-01", customer: "A학원", movementType: "inbound", status: "완료" },
      caller
    )
    expect(res.isError).toBeUndefined()
    const [input, options] = createHardwareMovementRows.mock.calls[0]
    expect(input).toMatchObject({ movementType: "outbound", status: "배송 예정", fromLocation: "창고", outboundType: "sales", createdBy: "mcp:tester" })
    expect(options.actor).toEqual({ userId: null, name: "mcp:tester", isInventoryManager: false })
  })

  it("hw_plan_movement 입력이 틀리면 저장하지 않고 isError", async () => {
    const res = await callTool("hw_plan_movement", { product_name: "T1", quantity: 0, planned_date: "2026-12-01", customer: "A" }, caller)
    expect(res.isError).toBe(true)
    expect(createHardwareMovementRows).not.toHaveBeenCalled()
  })

  it("quote_create_draft 는 템플릿에 없는 줄 번호를 DB 전에 거절한다", async () => {
    const res = await callTool(
      "quote_create_draft",
      { deal_id: "00000000-0000-4000-8000-000000000001", template_id: "camera_t1", lines: [{ line_number: 99, quantity: 1 }] },
      caller
    )
    expect(res.isError).toBe(true)
    expect(listDealListItems).not.toHaveBeenCalled()
    expect(createQuoteDocument).not.toHaveBeenCalled()
  })

  it("판매 중단 템플릿으로는 초안을 만들지 않는다", async () => {
    const res = await callTool("quote_create_draft", { deal_id: "00000000-0000-4000-8000-000000000001", template_id: "online_suite" }, caller)
    expect(res.isError).toBe(true)
    expect(createQuoteDocument).not.toHaveBeenCalled()
  })
})
