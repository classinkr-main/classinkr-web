import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import { describe, expect, it, vi } from "vitest"

import { confirmOrder, type ConfirmDeps } from "@/lib/admin-ai/server/confirm"
import { collectTurn, type TurnInput } from "@/lib/admin-ai/server/orchestrator"
import { issueTicket, TICKET_TTL_MS, verifyTicket } from "@/lib/admin-ai/server/tickets"
import { previewWriteTurn } from "@/lib/admin-ai/server/writes"
import { runOpsTool } from "@/lib/ops-tools/run"
import type { ToolArgs, WriteToolDef } from "@/lib/ops-tools/types"

import { STAFF_ACTOR, fakeDeps } from "./fakes"

const SECRET = "test-secret-0123456789-abcdefghijklmnop"
const NOW = Date.parse("2026-11-25T01:00:00Z")
const STAFF = { source: "supabase" as const, role: "ADMIN", name: "스태프", userId: "user-1", capabilities: [] as string[] }
const DEAL = { path: "/admin/crm/deals", label: "딜", entity: { type: "deal" as const, id: "deal-1", label: "가온학원(샘플) 딜" } }
const CUSTOMER = { path: "/admin/crm/customers/unified", label: "고객", entity: { type: "customer" as const, id: "cust-1", label: "가온학원(샘플)" } }

function withWrites(secret: string | null) {
  const fake = fakeDeps()
  fake.deps.previewWrite = (kind, ctx) => previewWriteTurn(kind, ctx, { ops: fake.ops, ticketSecret: secret, sub: "user-1", newId: () => "local-1" })
  return fake
}

const turn = (text: string, context: TurnInput["context"]): TurnInput => ({ text, context, actor: STAFF_ACTOR, now: NOW })

describe("쓰기 — 조율기는 preview 만 부른다", () => {
  it("견적 초안 → 오더 카드(서버 계산 금액·서명 표), execute 0회", async () => {
    const { deps, preview, execute } = withWrites(SECRET)
    const result = await collectTurn(turn("T1 카메라 견적 초안 만들어 줘", DEAL), deps)
    expect(preview).toHaveBeenCalledTimes(1)
    expect(execute).not.toHaveBeenCalled()
    expect(result.orders).toHaveLength(1)
    const order = result.orders[0]
    expect(order.amount).toEqual({ label: "합계(VAT 포함)", currency: "KRW", value: 1_100_000 })
    expect(order.server?.ticket).toBeTruthy()
    expect(order.undo).toBe("none")
    expect(result.blocks.map((b) => b.kind)).toEqual(["text", "order"])
    expect(result.blocks[1]).toEqual({ kind: "order", orderId: order.id })
    const verified = verifyTicket(order.server?.ticket, SECRET, "user-1", NOW)
    expect(verified.ok && verified.payload.jti).toBe(order.id)
  })

  it("HW 배송 예정 → 기존 품목 하나를 골라 오더 카드, execute 0회", async () => {
    const { deps, preview, execute } = withWrites(SECRET)
    const result = await collectTurn(turn("T1 3대 내일 출고 예정 등록해 줘", CUSTOMER), deps)
    expect(execute).not.toHaveBeenCalled()
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ item_id: "item-t1", product_name: "T1 카메라", quantity: 3, planned_date: "2026-11-26", customer: "가온학원(샘플)" }))
    expect(result.orders).toHaveLength(1)
  })

  it("서명 비밀이 없으면 표 없이 '화면에서 직접 등록' 링크만 싣는다", async () => {
    const { deps } = withWrites(null)
    const result = await collectTurn(turn("T1 카메라 견적 초안 만들어 줘", DEAL), deps)
    const order = result.orders[0]
    expect(order.server?.ticket).toBeUndefined()
    expect(order.server?.directHref).toBe("/admin/quotes")
  })

  it("딜·템플릿이 없으면 오더 없이 되묻는다(preview 0회)", async () => {
    const { deps, preview } = withWrites(SECRET)
    const noDeal = await collectTurn(turn("견적 초안 만들어 줘", null), deps)
    expect(noDeal.orders).toHaveLength(0)
    expect(noDeal.blocks[0].kind).toBe("deny")
    const noTemplate = await collectTurn(turn("견적 초안 만들어 줘", DEAL), deps)
    expect(noTemplate.blocks[0].kind).toBe("choice")
    expect(preview).not.toHaveBeenCalled()
  })

  it("시키는 말 중 준비 안 된 오더(문자·결제 확정·삭제)는 거절 카드 + 링크", async () => {
    const { deps, preview } = withWrites(SECRET)
    for (const text of ["도담영어에 결제 링크 문자로 보내 줘", "한빛수학학원 결제 확정해", "견적 초안 삭제해 줘"]) {
      const result = await collectTurn(turn(text, DEAL), deps)
      expect(result.orders, text).toHaveLength(0)
      expect(result.blocks[0].kind, text).toBe("deny")
    }
    expect(preview).not.toHaveBeenCalled()
  })
})

describe("확인 경로 — POST /api/admin/ai/orders/confirm 의 판정(confirm.ts)", () => {
  function setup(options: { secret?: string | null; summaryTotal?: number } = {}) {
    let total = 1_100_000
    const execute = vi.fn(async () => ({ output: { id: "q-1", quote_number: "Q-0001" } }))
    const def: WriteToolDef = {
      id: "fake.quote",
      mcpName: "quote_create_draft",
      risk: "R1",
      requiredScope: "write:quote",
      title: "견적 초안",
      description: "",
      inputSchema: {},
      preview: async (args: ToolArgs) => ({ plan: {}, summary: { deal_id: args.deal_id, total }, warnings: [] }),
      execute,
    }
    const audit = vi.fn(async () => undefined)
    const deps: ConfirmDeps = {
      getTool: (name) => (name === "quote_create_draft" ? def : undefined),
      run: runOpsTool,
      secret: options.secret === undefined ? SECRET : options.secret,
      describeError: async (error) => (error instanceof Error ? error.message : "오류"),
      audit,
      now: () => NOW + 1000,
    }
    const ticket = issueTicket({ tool: "quote_create_draft", args: { deal_id: `deal-${Math.random()}`, template_id: "camera_t1" }, summary: { deal_id: "x", total }, sub: "user-1" }, SECRET, NOW)
    // 미리보기 요약을 표와 같게 맞춘다(deal_id 포함)
    const args = ticket.payload.args
    const fresh = issueTicket({ tool: "quote_create_draft", args, summary: { deal_id: args.deal_id, total }, sub: "user-1" }, SECRET, NOW)
    return { deps, execute, audit, ticket: fresh.ticket, setTotal: (v: number) => (total = v) }
  }

  it("정상 확인은 한 번 실행하고 실제 어드민으로 감사한다", async () => {
    const { deps, execute, audit, ticket } = setup()
    const result = await confirmOrder(ticket, STAFF, deps)
    expect(result.status).toBe(200)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin_ai.order.confirm", admin: STAFF }))
    if (result.status === 200) expect(result.body.result).toContain("Q-0001")
  })

  it("같은 표를 두 번 눌러도 실행은 한 번이다", async () => {
    const { deps, execute, ticket } = setup()
    const first = await confirmOrder(ticket, STAFF, deps)
    const second = await confirmOrder(ticket, STAFF, deps)
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    if (second.status === 200) expect(second.body.replayed).toBe(true)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("서명 위조는 거절한다", async () => {
    const { deps, execute, ticket } = setup()
    const [body, signature] = ticket.split(".")
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
    payload.args.template_id = "studio_l"
    const forgedBody = Buffer.from(JSON.stringify(payload)).toString("base64url")
    expect((await confirmOrder(`${forgedBody}.${signature}`, STAFF, deps)).status).toBe(400)
    const otherKey = issueTicket({ tool: "quote_create_draft", args: payload.args, summary: {}, sub: "user-1" }, "another-secret-0123456789-abcdefghijk", NOW)
    expect((await confirmOrder(otherKey.ticket, STAFF, deps)).status).toBe(400)
    expect((await confirmOrder("garbage", STAFF, deps)).status).toBe(400)
    expect(execute).not.toHaveBeenCalled()
  })

  it("15분이 지나면 거절한다", async () => {
    const { deps, execute, ticket } = setup()
    const result = await confirmOrder(ticket, STAFF, { ...deps, now: () => NOW + TICKET_TTL_MS + 1 })
    expect(result.status).toBe(410)
    expect(execute).not.toHaveBeenCalled()
  })

  it("다른 계정의 표는 거절한다", async () => {
    const { deps, execute, ticket } = setup()
    const result = await confirmOrder(ticket, { ...STAFF, userId: "user-2" }, deps)
    expect(result.status).toBe(403)
    expect(execute).not.toHaveBeenCalled()
  })

  it("작성 뒤 역할이 회수되면 거절한다", async () => {
    const { deps, execute, ticket } = setup()
    const result = await confirmOrder(ticket, { ...STAFF, role: "VIEWER" }, deps)
    expect(result.status).toBe(403)
    if (result.status !== 200) expect(result.body.code).toBe("role_revoked")
    expect(execute).not.toHaveBeenCalled()
  })

  it("서명 비밀이 없으면 실행하지 않는다", async () => {
    const { deps, execute, ticket } = setup()
    const result = await confirmOrder(ticket, STAFF, { ...deps, secret: null })
    expect(result.status).toBe(503)
    expect(execute).not.toHaveBeenCalled()
  })

  it("미리본 뒤 금액이 바뀌면 실행하지 않는다", async () => {
    const { deps, execute, ticket, setTotal } = setup()
    setTotal(999)
    const result = await confirmOrder(ticket, STAFF, deps)
    expect(result.status).toBe(409)
    expect(execute).not.toHaveBeenCalled()
  })
})

describe("확인 경로 모듈 그래프 — 모델이 없다", () => {
  const root = resolve(__dirname, "../../..")
  const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g

  function resolveImport(from: string, spec: string): string | null {
    let base: string
    if (spec.startsWith("@/")) base = join(root, spec.slice(2))
    else if (spec.startsWith(".")) base = resolve(dirname(from), spec)
    else return null
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
      if (existsSync(candidate) && /\.(ts|tsx)$/.test(candidate)) return candidate
    }
    return null
  }

  function graph(entry: string): Set<string> {
    const seen = new Set<string>()
    const stack = [entry]
    while (stack.length) {
      const file = stack.pop() as string
      if (seen.has(file)) continue
      seen.add(file)
      const source = readFileSync(file, "utf8")
      for (const match of source.matchAll(IMPORT_RE)) {
        const next = resolveImport(file, match[1] ?? match[2] ?? match[3])
        if (next && !seen.has(next)) stack.push(next)
      }
    }
    return seen
  }

  it("확인 라우트와 confirm.ts 는 모델 어댑터·조율기·대화 deps 를 import 하지 않는다", () => {
    const files = [...graph(join(root, "app/api/admin/ai/orders/confirm/route.ts"))].map((f) => f.slice(root.length + 1))
    expect(files).toContain("lib/admin-ai/server/confirm.ts")
    const MODEL_PATHS = [
      "lib/admin-ai/server/orchestrator.ts",
      "lib/admin-ai/server/deps.ts",
      "lib/chatbot/llm.ts",
      "lib/chatbot/service.ts",
      "lib/internal-cs-chat/gemini.ts",
      "lib/ops-tools/registry.ts",
    ]
    const forbidden = files.filter((f) => f.startsWith("lib/admin-ai/server/llm/") || f.startsWith("lib/chatbot/llm/") || MODEL_PATHS.includes(f))
    expect(forbidden).toEqual([])
    // 쓰기 도구 정의는 직접 들어온다(레지스트리 없이).
    expect(files).toContain("lib/admin-ai/server/write-tools.ts")
  })

  it("대화 라우트는 조율기를 거쳐 모델 어댑터를 쓴다(그래프 시험이 실제로 잡는지 확인)", () => {
    const files = [...graph(join(root, "app/api/admin/ai/chat/route.ts"))].map((f) => f.slice(root.length + 1))
    expect(files).toContain("lib/admin-ai/server/llm/adapter.ts")
  })
})
