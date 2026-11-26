/**
 * MCP 쓰기 멱등(B7) — 같은 키 동시 두 번이 한 번만 실행된다.
 *  - hw_plan_movement: 유니크 색인(23505)이 두 번째 insert 를 막으면 "이미 처리됨, 처음 결과"
 *  - quote_create_draft: 공용 저장소(Upstash 가짜)에서 같은 키 동시 실행을 막는다. 저장소가 없으면 닫지 않고 메모리 판정 + 표시
 * "다른 인스턴스"는 resetOpsGuardsForTest()(인스턴스 메모리 비우기)로 흉내 낸다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const createHardwareMovementRows = vi.fn()
const findHardwareMovementsByMcpIdempotencyKey = vi.fn()
const createQuoteDocument = vi.fn()
const createQuoteDocumentVersion = vi.fn()

vi.mock("@/lib/repositories/hardware-inventory", () => ({
  createHardwareMovementRows: (...a: unknown[]) => createHardwareMovementRows(...a),
  findHardwareMovementsByMcpIdempotencyKey: (...a: unknown[]) => findHardwareMovementsByMcpIdempotencyKey(...a),
  listHardwareItems: vi.fn(async () => [{ id: "item-t1", name: "T1", source_aliases: [] }]),
  getHardwareDashboard: vi.fn(),
  getHardwareMovementsPage: vi.fn(),
}))
vi.mock("@/lib/repositories/hardware-sales-dashboard", () => ({ currentSalesFy: vi.fn(), getHardwareSalesDashboard: vi.fn() }))
vi.mock("@/lib/auth/audit", () => ({ logAudit: vi.fn(), logAuditChecked: vi.fn(async () => ({ ok: true })) }))
vi.mock("@/lib/chatbot/service", () => ({ evaluateChatbotQuery: vi.fn() }))
vi.mock("@/lib/admin/traffic-summary", () => ({ getCachedTrafficSummary: vi.fn() }))
vi.mock("@/lib/portal/repositories/activity", () => ({ logActivity: vi.fn(async () => undefined) }))
vi.mock("@/lib/portal/repositories/mcp-queries", () => ({ searchDealsForMcp: vi.fn(), searchQuotesForMcp: vi.fn() }))
vi.mock("@/lib/portal/repositories/deals", () => ({
  listDealListItems: vi.fn(async () => [{ id: "00000000-0000-4000-8000-000000000001", customer_name: "가나학원", partner_account_id: null, customer_id: "c1" }]),
}))
vi.mock("@/lib/portal/repositories/quote-documents", () => ({
  createQuoteDocument: (...a: unknown[]) => createQuoteDocument(...a),
  createQuoteDocumentVersion: (...a: unknown[]) => createQuoteDocumentVersion(...a),
  getQuoteDocument: vi.fn(),
  getResolvableQuoteVersion: vi.fn(),
}))

import { LEGACY_SCOPES } from "@/lib/ops-tools/actor"
import { fingerprintArgs, idempotencyKeyHash, resetOpsGuardsForTest } from "@/lib/ops-tools/guard"
import { executeWithSharedClaimForTest, runOpsTool } from "@/lib/ops-tools/run"
import { hwPlanMovement } from "@/lib/ops-tools/defs/hardware"
import { quoteCreateDraft } from "@/lib/ops-tools/defs/quotes"

const actor = { name: "tester", scopes: LEGACY_SCOPES, legacy: true }
const DEAL_ID = "00000000-0000-4000-8000-000000000001"
const hwArgs = (extra: Record<string, unknown> = {}) => ({ product_name: "T1", quantity: 2, planned_date: "2026-12-01", customer: "A학원", ...extra })
const quoteArgs = (extra: Record<string, unknown> = {}) => ({ deal_id: DEAL_ID, template_id: "camera_t1", ...extra })
const tick = () => new Promise<void>((r) => setTimeout(r, 0))

beforeEach(() => {
  resetOpsGuardsForTest()
  vi.unstubAllEnvs()
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "")
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "")
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("hw_plan_movement — 유니크 제약(23505)", () => {
  /** insert 를 흉내 내는 가짜 표: 같은 (호출자, 키 해시) 두 번째는 23505 */
  function fakeTable() {
    const rows: Array<{ id: string; product_name: string; quantity: number; occurred_at: string; to_location: string; status: string; lot_no: null; raw: unknown }> = []
    let inserts = 0
    createHardwareMovementRows.mockReset().mockImplementation(async (input: { productName: string; quantity: number; raw: { mcp: { caller: string; idempotency_key_hash?: string } } }) => {
      await tick() // 두 호출이 겹쳐 들어가게
      const dup = rows.find((r) => (r.raw as typeof input.raw).mcp.idempotency_key_hash === input.raw.mcp.idempotency_key_hash && input.raw.mcp.idempotency_key_hash)
      if (dup) throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" })
      inserts++
      const row = { id: `m${inserts}`, product_name: input.productName, quantity: input.quantity, occurred_at: "2026-12-01", to_location: "A학원", status: "배송 예정", lot_no: null, raw: input.raw }
      rows.push(row)
      return [row]
    })
    findHardwareMovementsByMcpIdempotencyKey.mockReset().mockImplementation(async (_caller: string, hash: string) => rows.filter((r) => (r.raw as { mcp: { idempotency_key_hash?: string } }).mcp.idempotency_key_hash === hash))
    return { rows, inserts: () => inserts }
  }

  it("다른 인스턴스에서 같은 키가 동시에 오면 insert 는 한 번, 두 번째는 처음 결과(replayed)", async () => {
    const table = fakeTable()
    const args = hwArgs({ idempotency_key: "k-hw-1" })
    const first = runOpsTool(hwPlanMovement, args, actor)
    await tick()
    resetOpsGuardsForTest() // 다른 인스턴스 — 메모리에는 첫 호출의 기록이 없다
    const second = runOpsTool(hwPlanMovement, args, actor)
    const [a, b] = await Promise.all([first, second])
    expect(table.inserts()).toBe(1)
    expect(a.value).toEqual(b.value)
    expect([a.logCode, b.logCode].filter((c) => c === "replayed")).toHaveLength(1)
    expect(createHardwareMovementRows).toHaveBeenCalledTimes(2) // 두 번째는 시도했다가 제약에 막혔다
  })

  it("같은 키에 다른 내용이면 처음 결과를 돌려주지 않고 idempotency_conflict", async () => {
    fakeTable()
    const first = runOpsTool(hwPlanMovement, hwArgs({ idempotency_key: "k-hw-2" }), actor)
    await tick()
    resetOpsGuardsForTest()
    const second = runOpsTool(hwPlanMovement, hwArgs({ idempotency_key: "k-hw-2", quantity: 9 }), actor)
    const settled = await Promise.allSettled([first, second])
    expect(settled[0].status).toBe("fulfilled")
    expect(settled[1]).toMatchObject({ status: "rejected", reason: { code: "idempotency_conflict" } })
  })

  it("키 해시와 상관없는 다른 유니크 위반은 그대로 던진다", async () => {
    createHardwareMovementRows.mockReset().mockRejectedValue(Object.assign(new Error("dup"), { code: "23505" }))
    findHardwareMovementsByMcpIdempotencyKey.mockReset().mockResolvedValue([])
    await expect(runOpsTool(hwPlanMovement, hwArgs({ idempotency_key: "k-hw-3" }), actor)).rejects.toMatchObject({ code: "23505" })
  })

  it("키가 없으면 23505 를 가로채지 않는다", async () => {
    createHardwareMovementRows.mockReset().mockRejectedValue(Object.assign(new Error("dup"), { code: "23505" }))
    await expect(runOpsTool(hwPlanMovement, hwArgs(), actor)).rejects.toMatchObject({ code: "23505" })
  })
})

/** Upstash REST 가짜 — SET NX PX / SET PX / GET / DEL */
function fakeUpstash() {
  const kv = new Map<string, string>()
  const commands: string[][] = []
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test")
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t")
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const cmd = JSON.parse(String(init.body)) as string[]
      commands.push(cmd)
      let result: unknown = null
      if (cmd[0] === "SET") {
        const nx = cmd.includes("NX")
        if (nx && kv.has(cmd[1])) result = null
        else {
          kv.set(cmd[1], cmd[2])
          result = "OK"
        }
      } else if (cmd[0] === "GET") result = kv.get(cmd[1]) ?? null
      else if (cmd[0] === "DEL") result = kv.delete(cmd[1]) ? 1 : 0
      return new Response(JSON.stringify({ result }), { status: 200 })
    })
  )
  return { kv, commands }
}

describe("quote_create_draft — 공용 저장소", () => {
  beforeEach(() => {
    let n = 0
    createQuoteDocument.mockReset().mockImplementation(async () => {
      await tick()
      n++
      return { id: `doc-${n}`, quote_number: `Q-000${n}` }
    })
    createQuoteDocumentVersion.mockReset().mockImplementation(async (row: Record<string, unknown>) => ({ id: "v1", ...row }))
  })

  it("다른 인스턴스에서 같은 키가 동시에 오면 문서 생성은 한 번, 두 번째는 처음 결과", async () => {
    const { kv } = fakeUpstash()
    const args = quoteArgs({ idempotency_key: "k-q-1" })
    const first = runOpsTool(quoteCreateDraft, args, actor)
    await tick()
    resetOpsGuardsForTest() // 다른 인스턴스
    const second = runOpsTool(quoteCreateDraft, args, actor)
    const [a, b] = await Promise.all([first, second])
    expect(createQuoteDocument).toHaveBeenCalledTimes(1)
    expect(a.value).toEqual(b.value)
    expect((a.value as { id: string }).id).toBe("doc-1")
    expect([a.logCode, b.logCode].filter((c) => c === "replayed")).toHaveLength(1)
    // 저장소 판정이라 "메모리 판정" 표시가 없다
    expect(a.value).not.toHaveProperty("idempotency_scope")
    expect(a.logCode ?? "").not.toContain("idem_memory")
    // 키는 해시로만 저장되고 원문이 없다
    const keys = Array.from(kv.keys())
    expect(keys).toEqual([`ops-idem:${idempotencyKeyHash("tester", "quote_create_draft", "k-q-1")}`])
    expect(JSON.stringify(Array.from(kv.values()))).not.toContain("k-q-1")
  })

  it("같은 키에 다른 인자면 거절하고, 실행이 실패하면 키를 지워 다시 시도할 수 있다", async () => {
    const { kv } = fakeUpstash()
    const first = runOpsTool(quoteCreateDraft, quoteArgs({ idempotency_key: "k-q-2" }), actor)
    await tick()
    resetOpsGuardsForTest()
    await expect(runOpsTool(quoteCreateDraft, quoteArgs({ idempotency_key: "k-q-2", internal_memo: "다른 내용" }), actor)).rejects.toMatchObject({ code: "idempotency_conflict" })
    await first

    createQuoteDocument.mockReset().mockRejectedValueOnce(new Error("db down")).mockResolvedValue({ id: "doc-9", quote_number: "Q-0009" })
    resetOpsGuardsForTest()
    kv.clear()
    await expect(runOpsTool(quoteCreateDraft, quoteArgs({ idempotency_key: "k-q-3" }), actor)).rejects.toThrow("db down")
    expect(kv.size).toBe(0)
    resetOpsGuardsForTest()
    const retry = await runOpsTool(quoteCreateDraft, quoteArgs({ idempotency_key: "k-q-3" }), actor)
    expect((retry.value as { id: string }).id).toBe("doc-9")
  })

  it("저장소가 없으면 닫지 않고 인스턴스 메모리로 한 번 실행하며, 응답·로그에 메모리 판정이라고 표시한다", async () => {
    const args = quoteArgs({ idempotency_key: "k-q-4" })
    const r = await runOpsTool(quoteCreateDraft, args, actor)
    expect(createQuoteDocument).toHaveBeenCalledTimes(1)
    expect(r.value).toMatchObject({ status: "draft", idempotency_scope: "instance_memory" })
    expect(r.logCode).toContain("idem_memory")
    // 같은 인스턴스의 재시도는 메모리로 막힌다
    const again = await runOpsTool(quoteCreateDraft, args, actor)
    expect(createQuoteDocument).toHaveBeenCalledTimes(1)
    expect(again.logCode).toContain("replayed")
    expect(again.logCode).toContain("idem_memory")
    // 키를 안 주면 표시도 없다(전과 같다)
    const noKey = await runOpsTool(quoteCreateDraft, quoteArgs(), actor)
    expect(noKey.value).not.toHaveProperty("idempotency_scope")
    expect(noKey.logCode).toBeUndefined()
  })

  it("저장소 호출이 실패해도 닫지 않고 메모리 판정으로 실행한다(표시)", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test")
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t")
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network") }))
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const r = await runOpsTool(quoteCreateDraft, quoteArgs({ idempotency_key: "k-q-5" }), actor)
    expect(createQuoteDocument).toHaveBeenCalledTimes(1)
    expect(r.value).toMatchObject({ idempotency_scope: "instance_memory" })
    expect(r.logCode).toContain("idem_memory")
    err.mockRestore()
  })

  it("진행 중인 키를 기다리다 시간이 지나면 idempotency_in_progress", async () => {
    const store = {
      claim: vi.fn(async () => ({ won: false as const, record: { state: "pending" as const, fingerprint: "f" } })),
      read: vi.fn(),
      complete: vi.fn(),
      release: vi.fn(),
    }
    await expect(executeWithSharedClaimForTest(store, "h", "f", async () => ({ output: 1 }), 50)).rejects.toMatchObject({ code: "idempotency_in_progress" })
    expect(fingerprintArgs({})).toMatch(/^[0-9a-f]{64}$/)
  })
})
