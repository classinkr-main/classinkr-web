/**
 * 홈 MCP 보강(B3) 시험 — 인증·범위·묶음 쓰기 상한·idempotency_key·연락처 가림·품목 생성 금지·서버 합계·감사·오류 숨김.
 * DB·모델은 부르지 않는다(저장소·감사·챗봇은 모두 가짜).
 */
import { readFileSync } from "fs"
import path from "path"

import { NextRequest } from "next/server"
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const createHardwareMovementRows = vi.fn()
const listHardwareItems = vi.fn()
const findHardwareMovementsByMcpIdempotencyKey = vi.fn()
const listDealListItems = vi.fn()
const createQuoteDocument = vi.fn()
const createQuoteDocumentVersion = vi.fn()
const getQuoteDocument = vi.fn()
const getResolvableQuoteVersion = vi.fn()
const logAuditChecked = vi.fn()
const evaluateChatbotQuery = vi.fn()
const listPortalDocuments = vi.fn()

vi.mock("@/lib/repositories/hardware-inventory", () => ({
  createHardwareMovementRows: (...a: unknown[]) => createHardwareMovementRows(...a),
  listHardwareItems: (...a: unknown[]) => listHardwareItems(...a),
  findHardwareMovementsByMcpIdempotencyKey: (...a: unknown[]) => findHardwareMovementsByMcpIdempotencyKey(...a),
  getHardwareDashboard: vi.fn(),
  getHardwareMovementsPage: vi.fn(),
}))
vi.mock("@/lib/repositories/hardware-sales-dashboard", () => ({ currentSalesFy: vi.fn(), getHardwareSalesDashboard: vi.fn() }))
vi.mock("@/lib/auth/audit", () => ({ logAudit: vi.fn(), logAuditChecked: (...a: unknown[]) => logAuditChecked(...a) }))
vi.mock("@/lib/chatbot/service", () => ({ evaluateChatbotQuery: (...a: unknown[]) => evaluateChatbotQuery(...a) }))
vi.mock("@/lib/admin/traffic-summary", () => ({ getCachedTrafficSummary: vi.fn() }))
vi.mock("@/lib/portal/repositories/activity", () => ({ logActivity: vi.fn(async () => undefined) }))
vi.mock("@/lib/portal/repositories/documents", () => ({ listPortalDocuments: (...a: unknown[]) => listPortalDocuments(...a) }))
vi.mock("@/lib/portal/repositories/deals", () => ({ listDealListItems: (...a: unknown[]) => listDealListItems(...a) }))
vi.mock("@/lib/portal/repositories/quote-documents", () => ({
  createQuoteDocument: (...a: unknown[]) => createQuoteDocument(...a),
  createQuoteDocumentVersion: (...a: unknown[]) => createQuoteDocumentVersion(...a),
  getQuoteDocument: (...a: unknown[]) => getQuoteDocument(...a),
  getResolvableQuoteVersion: (...a: unknown[]) => getResolvableQuoteVersion(...a),
}))

import { POST } from "@/app/api/mcp/route"
import { authenticateMcp, formatMcpLog, handleMcpPayload, parseMcpTokenEntry, type McpCaller, type McpDeps } from "@/lib/mcp/server"
import { callTool, isWriteTool, listTools } from "@/lib/mcp/tools"
import { LEGACY_SCOPES, type OpsScope } from "@/lib/ops-tools/actor"
import { WRITE_RATE_LIMIT, resetOpsGuardsForTest } from "@/lib/ops-tools/guard"
import { RAW_EMAIL_PATTERN, RAW_PHONE_PATTERN, redactContacts } from "@/lib/ops-tools/redact"
import { buildStandardQuoteDetails, mergeStandardQuoteLineItems, resolveQuoteSupplier } from "@/lib/standard-quote-template"

const legacy: McpCaller = { name: "tester", scopes: LEGACY_SCOPES, legacy: true }
const scoped = (scopes: OpsScope[], extra: Partial<McpCaller> = {}): McpCaller => ({ name: "scoped", scopes, legacy: false, ...extra })

const TOKEN_A = "aaaaaaaaaaaaaaaaaaaa"
const TOKEN_B = "bbbbbbbbbbbbbbbbbbbb"
const TOKEN_C = "cccccccccccccccccccc"
const DEAL_ID = "00000000-0000-4000-8000-000000000001"
const QUOTE_ID = "3f2b9c1e-7a4d-4e8b-9c2f-1a2b3c4d5e6f"

const textOf = (r: { content: { text: string }[] }) => r.content[0].text
const hwArgs = (extra: Record<string, unknown> = {}) => ({ product_name: "T1", quantity: 2, planned_date: "2026-12-01", customer: "A학원", ...extra })
const rpcCall = (id: number, name: string, args: Record<string, unknown>) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })
const mcpDeps = (caller: McpCaller, log?: McpDeps["log"]): McpDeps => ({ caller, listTools, callTool, isWriteTool, log })

beforeEach(() => {
  resetOpsGuardsForTest()
  createHardwareMovementRows.mockReset().mockImplementation(async (input: { productName: string; quantity: number }) => [
    { id: "m1", product_name: input.productName, quantity: input.quantity, occurred_at: "2026-12-01", to_location: "A학원", status: "배송 예정", lot_no: null },
  ])
  listHardwareItems.mockReset().mockResolvedValue([
    { id: "item-t1", name: "T1", source_aliases: [] },
    { id: "item-t1-cam", name: "T1 카메라", source_aliases: [] },
    { id: "item-86", name: "86인치 보드", source_aliases: ["86 IFP"] },
  ])
  findHardwareMovementsByMcpIdempotencyKey.mockReset().mockResolvedValue([])
  listDealListItems.mockReset().mockResolvedValue([{ id: DEAL_ID, customer_name: "가나학원", partner_account_id: null, customer_id: "c1" }])
  createQuoteDocument.mockReset().mockResolvedValue({ id: QUOTE_ID, quote_number: "Q-0001" })
  createQuoteDocumentVersion.mockReset().mockImplementation(async (row: Record<string, unknown>) => ({ id: "v1", ...row }))
  getQuoteDocument.mockReset()
  getResolvableQuoteVersion.mockReset()
  logAuditChecked.mockReset().mockResolvedValue({ ok: true })
  evaluateChatbotQuery.mockReset().mockResolvedValue({ answer: "답", sources: [] })
  listPortalDocuments.mockReset()
})

describe("인증 — 토큰 두 형식", () => {
  const now = Date.parse("2026-11-25T03:00:00Z")
  const env = [
    `moon:${TOKEN_A}`,
    `reader:${TOKEN_B};scope=read;exp=2027-03-31;admin=Reader@Example.com`,
    `old:${TOKEN_C};scope=read+write:quote;exp=2026-11-24`,
  ].join(",")

  it("옛 형식은 전과 같은 권한(읽기·쓰기·internal, pii 없음)과 legacy 표시", () => {
    const r = authenticateMcp(`Bearer ${TOKEN_A}`, env, now)
    expect(r).toEqual({ ok: true, caller: { name: "moon", scopes: LEGACY_SCOPES, legacy: true } })
  })

  it("옛 형식 토큰 안의 ':' 는 전처럼 토큰의 일부다", () => {
    const r = authenticateMcp("Bearer abc:defghijklmnopqrstu", "x:abc:defghijklmnopqrstu", now)
    expect(r.ok).toBe(true)
  })

  it("넓힌 형식은 적힌 범위·어드민 이메일만", () => {
    const r = authenticateMcp(`Bearer ${TOKEN_B}`, env, now)
    expect(r).toEqual({ ok: true, caller: { name: "reader", scopes: ["read"], legacy: false, adminEmail: "reader@example.com" } })
  })

  it("넓힌 형식 줄 전체를 토큰으로 보내도 옛 형식으로 통과하지 않는다", () => {
    expect(authenticateMcp(`Bearer ${TOKEN_B};scope=read;exp=2027-03-31;admin=Reader@Example.com`, env, now).ok).toBe(false)
  })

  it("만료일이 지나면 expired(그날 끝 KST 까지는 유효)", () => {
    expect(authenticateMcp(`Bearer ${TOKEN_C}`, env, now)).toEqual({ ok: false, reason: "expired" })
    expect(authenticateMcp(`Bearer ${TOKEN_C}`, env, Date.parse("2026-11-24T14:59:59Z")).ok).toBe(true)
  })

  it("헤더 없음·빈 설정·틀린 토큰은 각각 이유를 닫힌 어휘로", () => {
    expect(authenticateMcp(null, env, now)).toEqual({ ok: false, reason: "missing" })
    expect(authenticateMcp(`Bearer ${TOKEN_A}`, "", now)).toEqual({ ok: false, reason: "unconfigured" })
    expect(authenticateMcp(`Bearer ${TOKEN_A}`, undefined, now)).toEqual({ ok: false, reason: "unconfigured" })
    expect(authenticateMcp("Bearer zzzzzzzzzzzzzzzzzzzz", env, now)).toEqual({ ok: false, reason: "invalid" })
  })

  it("틀린 넓힌 형식 줄(모르는 범위·날짜·키, 만료 없음)은 어떤 토큰과도 맞지 않는다", () => {
    expect(parseMcpTokenEntry(`a:${TOKEN_A};scope=read+admin;exp=2027-01-01`)).toBeNull()
    expect(parseMcpTokenEntry(`a:${TOKEN_A};scope=read;exp=2027-02-30`)).toBeNull()
    expect(parseMcpTokenEntry(`a:${TOKEN_A};scope=read;exp=2027-01-01;role=x`)).toBeNull()
    expect(parseMcpTokenEntry(`a:${TOKEN_A};scope=read`)).toBeNull()
    expect(authenticateMcp(`Bearer ${TOKEN_A}`, `a:${TOKEN_A};scope=read`, now)).toEqual({ ok: false, reason: "invalid" })
  })
})

describe("route POST /api/mcp", () => {
  const post = (body: unknown, auth?: string) =>
    POST(
      new NextRequest("http://localhost/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
        body: typeof body === "string" ? body : JSON.stringify(body),
      })
    )
  let info: MockInstance<typeof console.info>

  beforeEach(() => {
    vi.stubEnv("HOME_MCP_TOKENS", `moon:${TOKEN_A},past:${TOKEN_C};scope=read;exp=2020-01-01`)
    info = vi.spyOn(console, "info").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    info.mockRestore()
  })

  it("헤더 없음·틀린 토큰·만료 토큰은 401, 로그는 이유만", async () => {
    expect((await post({ jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401)
    expect((await post({ jsonrpc: "2.0", id: 1, method: "ping" }, "Bearer wrongwrongwrongwrong")).status).toBe(401)
    expect((await post({ jsonrpc: "2.0", id: 1, method: "ping" }, `Bearer ${TOKEN_C}`)).status).toBe(401)
    const lines = info.mock.calls.map((c) => String(c[0]))
    expect(lines).toEqual(["[mcp] auth=denied reason=missing", "[mcp] auth=denied reason=invalid", "[mcp] auth=denied reason=expired"])
    expect(lines.join("\n")).not.toContain(TOKEN_C)
  })

  it("빈 설정이면 늘 401", async () => {
    vi.stubEnv("HOME_MCP_TOKENS", "")
    expect((await post({ jsonrpc: "2.0", id: 1, method: "ping" }, `Bearer ${TOKEN_A}`)).status).toBe(401)
  })

  it("64KB 를 넘는 몸통은 413", async () => {
    const res = await post(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", pad: "x".repeat(70 * 1024) }), `Bearer ${TOKEN_A}`)
    expect(res.status).toBe(413)
  })

  it("옛 형식 토큰으로 initialize·tools/list 가 되고 tools/call 로그에 legacy=1", async () => {
    const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, `Bearer ${TOKEN_A}`)
    expect(init.status).toBe(200)
    const list = (await (await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, `Bearer ${TOKEN_A}`)).json()) as { result: { tools: { name: string }[] } }
    expect(list.result.tools.map((t) => t.name)).toContain("hw_plan_movement")
    await post(rpcCall(3, "quote_templates", {}), `Bearer ${TOKEN_A}`)
    const line = info.mock.calls.map((c) => String(c[0])).find((l) => l.includes("tool=quote_templates"))
    expect(line).toMatch(/^\[mcp\] caller=moon method=tools\/call tool=quote_templates ok=1 ms=\d+ legacy=1$/)
  })
})

describe("범위(scope)", () => {
  it("read 만 있는 토큰으로 쓰기를 부르면 거절하고 쓰지 않는다", async () => {
    const res = await callTool("hw_plan_movement", hwArgs(), scoped(["read"]))
    expect(res.isError).toBe(true)
    expect(res.logCode).toBe("scope_denied")
    expect(createHardwareMovementRows).not.toHaveBeenCalled()
    const q = await callTool("quote_create_draft", { deal_id: DEAL_ID, template_id: "camera_t1" }, scoped(["read", "write:hw"]))
    expect(q.isError).toBe(true)
    expect(createQuoteDocument).not.toHaveBeenCalled()
  })

  it("쓰기 범위만 있는 토큰은 읽기 도구를 못 부른다", async () => {
    const res = await callTool("quote_templates", {}, scoped(["write:quote"]))
    expect(res.isError).toBe(true)
  })

  it("internal 범위가 없으면 internal=true 를 무시하고 알린다, 옛 형식은 전과 같다", async () => {
    const res = await callTool("chatbot_ask", { question: "가격", internal: true }, scoped(["read"]))
    expect(evaluateChatbotQuery).toHaveBeenLastCalledWith("가격", { generateAnswer: true, includeInternalDocs: false })
    expect(textOf(res)).toContain("internal_ignored")
    await callTool("chatbot_ask", { question: "가격", internal: true }, scoped(["read", "internal"]))
    expect(evaluateChatbotQuery).toHaveBeenLastCalledWith("가격", { generateAnswer: true, includeInternalDocs: true })
    const old = await callTool("chatbot_ask", { question: "가격", internal: true }, legacy)
    expect(evaluateChatbotQuery).toHaveBeenLastCalledWith("가격", { generateAnswer: true, includeInternalDocs: true })
    expect(textOf(old)).not.toContain("internal_ignored")
  })
})

describe("쓰기 안전", () => {
  it("JSON-RPC 묶음 하나에 쓰기 두 개면 두 번째만 오류, 실행은 한 번", async () => {
    const log = vi.fn()
    const out = (await handleMcpPayload(
      [rpcCall(1, "hw_plan_movement", hwArgs()), rpcCall(2, "quote_templates", {}), rpcCall(3, "hw_plan_movement", hwArgs({ quantity: 3 }))],
      mcpDeps(legacy, log)
    )) as { id: number; result: { isError?: boolean; content: { text: string }[] } }[]
    expect(out.map((r) => r.result.isError ?? false)).toEqual([false, false, true])
    expect(out[2].result.content[0].text).toContain("쓰기 도구는 1개까지")
    expect(createHardwareMovementRows).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[2][0]).toMatchObject({ tool: "hw_plan_movement", ok: false, code: "batch_write_limit", legacy: true })
    // 묶음이 아니면 요청마다 따로 센다
    await handleMcpPayload(rpcCall(4, "hw_plan_movement", hwArgs()), mcpDeps(legacy))
    expect(createHardwareMovementRows).toHaveBeenCalledTimes(2)
  })

  it("logCode 는 응답에 싣지 않는다", async () => {
    const out = (await handleMcpPayload(rpcCall(1, "hw_plan_movement", hwArgs()), mcpDeps(scoped(["read"])))) as { result: Record<string, unknown> }
    expect(out.result).not.toHaveProperty("logCode")
  })

  it("같은 idempotency_key 두 번이면 실행은 한 번, 두 번째는 처음 결과를 replayed 로", async () => {
    const first = await callTool("hw_plan_movement", hwArgs({ idempotency_key: "k-1" }), legacy)
    const second = await callTool("hw_plan_movement", hwArgs({ idempotency_key: "k-1" }), legacy)
    expect(createHardwareMovementRows).toHaveBeenCalledTimes(1)
    expect(createHardwareMovementRows.mock.calls[0][0].raw).toEqual({ mcp: { caller: "tester", idempotency_key: "k-1" } })
    expect(JSON.parse(textOf(second))).toEqual({ replayed: true, note: expect.any(String), result: JSON.parse(textOf(first)) })
    expect(second.logCode).toBe("replayed")

    const q1 = await callTool("quote_create_draft", { deal_id: DEAL_ID, template_id: "camera_t1", idempotency_key: "q-1" }, legacy)
    const q2 = await callTool("quote_create_draft", { deal_id: DEAL_ID, template_id: "camera_t1", idempotency_key: "q-1" }, legacy)
    expect(q1.isError).toBeUndefined()
    expect(q2.isError).toBeUndefined()
    expect(createQuoteDocument).toHaveBeenCalledTimes(1)
  })

  it("같은 키를 다른 내용에 쓰면 거절, 키가 없으면 매번 실행(전과 같다)", async () => {
    await callTool("hw_plan_movement", hwArgs({ idempotency_key: "k-2" }), legacy)
    const conflict = await callTool("hw_plan_movement", hwArgs({ idempotency_key: "k-2", quantity: 5 }), legacy)
    expect(conflict.isError).toBe(true)
    expect(conflict.logCode).toBe("idempotency_conflict")
    await callTool("hw_plan_movement", hwArgs(), legacy)
    await callTool("hw_plan_movement", hwArgs(), legacy)
    expect(createHardwareMovementRows).toHaveBeenCalledTimes(3)
  })

  it("다른 인스턴스가 같은 키로 이미 만든 HW 기록은 DB 에서 찾아 다시 만들지 않는다", async () => {
    findHardwareMovementsByMcpIdempotencyKey.mockResolvedValue([
      { id: "m-old", product_name: "T1", quantity: 2, occurred_at: "2026-12-01", to_location: "A학원", status: "배송 예정", lot_no: null },
    ])
    const res = await callTool("hw_plan_movement", hwArgs({ idempotency_key: "k-3" }), legacy)
    expect(findHardwareMovementsByMcpIdempotencyKey).toHaveBeenCalledWith("tester", "k-3")
    expect(createHardwareMovementRows).not.toHaveBeenCalled()
    expect(JSON.parse(textOf(res))).toMatchObject({ replayed: true, result: [{ id: "m-old" }] })
  })

  it(`호출자별 쓰기는 분당 ${WRITE_RATE_LIMIT.max}번까지`, async () => {
    for (let i = 0; i < WRITE_RATE_LIMIT.max; i++) expect((await callTool("hw_plan_movement", hwArgs(), legacy)).isError).toBeUndefined()
    const over = await callTool("hw_plan_movement", hwArgs(), legacy)
    expect(over.isError).toBe(true)
    expect(over.logCode).toBe("rate_limited")
    expect(createHardwareMovementRows).toHaveBeenCalledTimes(WRITE_RATE_LIMIT.max)
    // 다른 호출자는 따로 센다
    expect((await callTool("hw_plan_movement", hwArgs(), { ...legacy, name: "other" })).isError).toBeUndefined()
  })
})

describe("hw_plan_movement — 새 품목을 만들지 않는다", () => {
  it("item_id 없이 이름이 정확히 같은 기존 품목 하나면 그 품목 id 로 등록", async () => {
    await callTool("hw_plan_movement", hwArgs({ product_name: " T1 " }), legacy)
    expect(createHardwareMovementRows.mock.calls[0][0]).toMatchObject({ itemId: "item-t1", productName: "T1" })
    await callTool("hw_plan_movement", hwArgs({ product_name: "86 IFP" }), legacy)
    expect(createHardwareMovementRows.mock.calls[1][0]).toMatchObject({ itemId: "item-86", productName: "86인치 보드" })
  })

  it("정확히 같은 품목이 없으면 후보를 싣고 거절한다(저장 없음)", async () => {
    const res = await callTool("hw_plan_movement", hwArgs({ product_name: "T1 카메라2" }), legacy)
    expect(res.isError).toBe(true)
    expect(res.logCode).toBe("item_not_exact")
    expect(textOf(res)).toContain("item-t1-cam")
    expect(createHardwareMovementRows).not.toHaveBeenCalled()
  })

  it("같은 이름의 품목이 둘 이상이면 거절한다", async () => {
    listHardwareItems.mockResolvedValue([
      { id: "a", name: "T1", source_aliases: [] },
      { id: "b", name: "T1 신형", source_aliases: ["T1"] },
    ])
    const res = await callTool("hw_plan_movement", hwArgs(), legacy)
    expect(res.isError).toBe(true)
    expect(createHardwareMovementRows).not.toHaveBeenCalled()
  })

  it("없는 item_id 는 거절, 있는 item_id 는 그 품목 이름으로", async () => {
    expect((await callTool("hw_plan_movement", hwArgs({ item_id: "nope" }), legacy)).isError).toBe(true)
    expect(createHardwareMovementRows).not.toHaveBeenCalled()
    const res = await callTool("hw_plan_movement", hwArgs({ item_id: "item-86", product_name: "86인치" }), legacy)
    expect(createHardwareMovementRows.mock.calls[0][0]).toMatchObject({ itemId: "item-86", productName: "86인치 보드" })
    expect(textOf(res)).toContain("product_name_differs")
  })
})

describe("quote_create_draft — 합계는 서버 계산, 단가 지정은 경고", () => {
  const expectedDetails = (lines: { line: number; quantity?: number; unitPrice?: number }[]) => {
    const items = mergeStandardQuoteLineItems("camera_t1")
    for (const l of lines) items[l.line - 1] = { ...items[l.line - 1], quantity: l.quantity ?? items[l.line - 1].quantity, unitPrice: l.unitPrice ?? items[l.line - 1].unitPrice }
    return buildStandardQuoteDetails({ templateId: "camera_t1", ...resolveQuoteSupplier("camera_t1"), lineItems: items }, "camera_t1")
  }

  it("기본 줄이면 템플릿 계산 합계, 경고 없음", async () => {
    const res = await callTool("quote_create_draft", { deal_id: DEAL_ID, template_id: "camera_t1" }, legacy)
    const body = JSON.parse(textOf(res))
    const want = expectedDetails([])
    expect(createQuoteDocumentVersion.mock.calls[0][0]).toMatchObject({ subtotal: want.subtotalAmount, tax_amount: want.vatAmount, total_amount: want.grandTotalAmount })
    expect(body.total).toBe(want.grandTotalAmount)
    expect(body).not.toHaveProperty("price_warnings")
  })

  it("단가를 바꾸면 합계는 서버가 다시 계산하고 기준 단가와의 차이·변동률을 경고로 싣는다. 합계 인자는 무시", async () => {
    const base = mergeStandardQuoteLineItems("camera_t1")[0].unitPrice as number
    const res = await callTool(
      "quote_create_draft",
      { deal_id: DEAL_ID, template_id: "camera_t1", lines: [{ line_number: 1, quantity: 3, unit_price: base / 2 }], total_amount: 1, grandTotalAmount: 1 },
      legacy
    )
    const body = JSON.parse(textOf(res))
    const want = expectedDetails([{ line: 1, quantity: 3, unitPrice: base / 2 }])
    expect(want.grandTotalAmount).toBeGreaterThan(1)
    expect(createQuoteDocumentVersion.mock.calls[0][0].total_amount).toBe(want.grandTotalAmount)
    expect(body.total).toBe(want.grandTotalAmount)
    expect(body.price_warnings).toEqual([
      { line_number: 1, name: expect.any(String), template_unit_price: base, unit_price: base / 2, diff: -base / 2, change_pct: -50 },
    ])
    const memo = createQuoteDocumentVersion.mock.calls[0][0].structured_json.quoteDetails.internalMemo as string
    expect(memo).toContain("단가 지정 1줄")
  })
})

describe("감사·오류", () => {
  it("쓰기 감사는 mcp:<이름>·MCP 역할·토큰 형식으로 남는다", async () => {
    await callTool("hw_plan_movement", hwArgs(), legacy)
    expect(logAuditChecked).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: null,
        actorDisplayName: "mcp:tester",
        actorRole: "MCP",
        action: "hardware.plan_movement",
        payload: expect.objectContaining({ token_format: "legacy", quantity: 2 }),
      })
    )
    await callTool("quote_create_draft", { deal_id: DEAL_ID, template_id: "camera_t1" }, scoped(["write:quote"], { adminEmail: "a@b.co" }))
    expect(logAuditChecked).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "quote.create_draft", actorDisplayName: "mcp:scoped", payload: expect.objectContaining({ token_format: "scoped", admin_email: "a@b.co" }) })
    )
  })

  it("쓰기 뒤 감사 실패는 삼키지 않고 결과에 audit_warning 으로 싣는다", async () => {
    logAuditChecked.mockResolvedValue({ ok: false, code: "db_42501" })
    const res = await callTool("quote_create_draft", { deal_id: DEAL_ID, template_id: "camera_t1" }, legacy)
    expect(res.isError).toBeUndefined()
    expect(JSON.parse(textOf(res)).audit_warning).toContain("db_42501")
    const hw = await callTool("hw_plan_movement", hwArgs(), legacy)
    expect(JSON.parse(textOf(hw))).toMatchObject({ movements: [{ id: "m1" }], audit_warning: expect.stringContaining("db_42501") })
  })

  it("모르는 DB 오류는 원문 없이 코드만 돌려준다", async () => {
    createHardwareMovementRows.mockRejectedValue({ message: "duplicate key value violates unique constraint \"x\" Key (memo)=(010-1234-5678)", code: "23505" })
    const res = await callTool("hw_plan_movement", hwArgs(), legacy)
    expect(res.isError).toBe(true)
    expect(textOf(res)).not.toMatch(/duplicate|constraint|010-1234/)
    expect(textOf(res)).toContain("db_23505")
    expect(res.logCode).toBe("db_23505")
  })

  it("저장소의 한국어 규칙 오류(중복·재고)는 고칠 수 있게 글을 돌려준다", async () => {
    createHardwareMovementRows.mockRejectedValue(new Error("이미 같은 CRM 오더가 배송 예정 또는 출고 기록으로 반영되어 있습니다."))
    const res = await callTool("hw_plan_movement", hwArgs(), legacy)
    expect(textOf(res)).toContain("이미 같은 CRM 오더")
  })

  it("server 가 잡은 모르는 오류는 로그에 코드만(오류 글 원문 없음)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const deps: McpDeps = {
      caller: legacy,
      listTools: () => [],
      callTool: async () => {
        throw new Error("postgres://user:secret@host")
      },
    }
    const out = (await handleMcpPayload(rpcCall(1, "x", {}), deps)) as { result: { content: { text: string }[] } }
    expect(out.result.content[0].text).not.toContain("secret")
    expect(err.mock.calls.flat().join(" ")).not.toContain("secret")
    err.mockRestore()
  })

  it("formatMcpLog 는 코드·legacy 를 싣고 값은 싣지 않는다", () => {
    expect(formatMcpLog({ caller: "moon fake", method: "tools/call", tool: "hw_stock", ok: false, ms: 3, code: "db_23505", legacy: true })).toBe(
      "[mcp] caller=moon?fake method=tools/call tool=hw_stock ok=0 ms=3 code=db_23505 legacy=1"
    )
  })
})

describe("연락처 가림", () => {
  const quoteWithContacts = () => {
    getQuoteDocument.mockResolvedValue({ id: QUOTE_ID, quote_number: "Q-2026-0001" })
    getResolvableQuoteVersion.mockResolvedValue({
      id: "v1",
      content_html: "<p>x</p>",
      structured_json: {
        quoteDetails: {
          recipientContactName: "김담당",
          recipientPhone: "010-1234-5678",
          recipientEmail: "teacher@school.example.kr",
          supplierContactPhone: "02 3456 7890",
          generalNotes: "연락은 +82 10-9876-5432 또는 boss@academy.co.kr 로",
        },
      },
    })
  }

  it("기본(옛 형식 포함)은 응답에 전화·이메일 꼴이 없고, 연락처 든 읽기를 감사에 남긴다", async () => {
    quoteWithContacts()
    const res = await callTool("quote_get", { id: QUOTE_ID }, legacy)
    const out = textOf(res)
    expect(out).not.toMatch(RAW_PHONE_PATTERN)
    expect(out).not.toMatch(RAW_EMAIL_PATTERN)
    expect(out).not.toContain("9876-5432")
    expect(out).toContain("010-****-5678")
    expect(out).toContain("Q-2026-0001")
    expect(logAuditChecked).toHaveBeenCalledWith(
      expect.objectContaining({ action: "mcp.read_contacts", targetType: "mcp_tool", targetId: QUOTE_ID, payload: expect.objectContaining({ tool: "quote_get", contact_fields: 4, revealed: false }) })
    )
    expect(JSON.stringify(logAuditChecked.mock.calls)).not.toContain("1234-5678")
  })

  it("pii 범위가 있는 넓힌 형식 토큰에만 원문", async () => {
    quoteWithContacts()
    const out = textOf(await callTool("quote_get", { id: QUOTE_ID }, scoped(["read", "pii"])))
    expect(out).toMatch(RAW_PHONE_PATTERN)
    expect(out).toContain("teacher@school.example.kr")
    expect(logAuditChecked).toHaveBeenCalledWith(expect.objectContaining({ action: "mcp.read_contacts", payload: expect.objectContaining({ revealed: true }) }))
  })

  it("id·번호 칸은 전화 꼴이어도 건드리지 않는다(다음 호출 인자로 쓰인다)", () => {
    const { value, masked } = redactContacts({ quote_number: "Q-01012345678", item_id: "010-1234-5678", memo: "010-1234-5678" })
    expect(value).toEqual({ quote_number: "Q-01012345678", item_id: "010-1234-5678", memo: "010-****-5678" })
    expect(masked).toBe(1)
  })

  it("연락처가 없는 읽기는 감사하지 않는다", async () => {
    await callTool("quote_templates", {}, legacy)
    expect(logAuditChecked).not.toHaveBeenCalled()
  })

  it("쓰기는 원문으로 실행하고 응답만 가린다", async () => {
    const res = await callTool("hw_plan_movement", hwArgs({ customer: "A학원 010-2222-3333", memo: "담당 010-2222-3333" }), legacy)
    expect(createHardwareMovementRows.mock.calls[0][0]).toMatchObject({ toLocation: "A학원 010-2222-3333" })
    expect(createHardwareMovementRows.mock.calls[0][0].memo).toContain("010-2222-3333")
    expect(textOf(res)).not.toMatch(RAW_PHONE_PATTERN)
  })
})

describe("tools/list 는 바꾸기 전과 같다(새 선택 인자 idempotency_key 만 더)", () => {
  it("떠 둔 결과와 대조", () => {
    const before = JSON.parse(readFileSync(path.join(__dirname, "fixtures/tools-list.before.json"), "utf8"))
    const now = JSON.parse(JSON.stringify(listTools())) as { name: string; annotations: { readOnlyHint: boolean }; inputSchema: { properties: Record<string, unknown> } }[]
    const writes = now.filter((t) => !t.annotations.readOnlyHint)
    expect(writes.map((t) => t.name).sort()).toEqual(["hw_plan_movement", "quote_create_draft"])
    for (const t of writes) {
      expect(t.inputSchema.properties.idempotency_key).toMatchObject({ type: "string" })
      delete t.inputSchema.properties.idempotency_key
    }
    expect(now).toEqual(before)
  })
})
