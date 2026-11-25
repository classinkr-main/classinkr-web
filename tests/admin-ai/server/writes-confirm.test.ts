import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import { describe, expect, it, vi } from "vitest"

import { ALREADY_PROCESSED_TEXT, confirmOrder, type ConfirmDeps } from "@/lib/admin-ai/server/confirm"
import { collectTurn, type TurnInput } from "@/lib/admin-ai/server/orchestrator"
import {
  ClaimStoreError,
  createMemoryClaimStore,
  createUpstashClaimStore,
  readConfirmSetup,
  TICKET_CLAIM_TTL_MS,
  type TicketClaimStore,
} from "@/lib/admin-ai/server/ticket-claims"
import { issueTicket, TICKET_TTL_MS, verifyTicket } from "@/lib/admin-ai/server/tickets"
import { previewWriteTurn } from "@/lib/admin-ai/server/writes"
import { runOpsTool } from "@/lib/ops-tools/run"
import { OpsToolError } from "@/lib/ops-tools/errors"
import type { OpsToolDef, ToolArgs, WriteToolDef } from "@/lib/ops-tools/types"

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

/** 여러 서버가 함께 보는 저장소의 가짜 — SET NX 처럼 있으면 실패한다. 판정 전에 한 틱 쉬어 동시 요청이 겹치게 한다. */
function fakeSharedStore() {
  const used = new Set<string>()
  const claim = vi.fn(async (id: string) => {
    await new Promise((r) => setTimeout(r, 0))
    if (used.has(id)) return "already_used" as const
    used.add(id)
    return "claimed" as const
  })
  const store: TicketClaimStore = { kind: "distributed", claim }
  return { store, claim, used }
}

/** idempotency 메모리를 함께 쓰지 않는 실행기 — 서로 다른 서버 인스턴스를 흉내 낸다(분당 상한·메모리 replay 없음). */
const instanceRun: ConfirmDeps["run"] = async (def: OpsToolDef, args, actor) => {
  if (!("execute" in def)) throw new Error("not write")
  const preview = await def.preview(args, actor)
  const result = await def.execute(preview, actor, {})
  return { value: result.output }
}

describe("확인 경로 — POST /api/admin/ai/orders/confirm 의 판정(confirm.ts)", () => {
  function setup(options: { secret?: string | null; summaryTotal?: number; claims?: TicketClaimStore | null; failExecute?: boolean } = {}) {
    let total = 1_100_000
    const execute = vi.fn(async () => {
      if (options.failExecute) throw new OpsToolError("견적 초안을 저장하지 못했습니다.", "execute_failed")
      return { output: { id: "q-1", quote_number: "Q-0001" } }
    })
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
    const shared = fakeSharedStore()
    const deps: ConfirmDeps = {
      getTool: (name) => (name === "quote_create_draft" ? def : undefined),
      run: runOpsTool,
      secret: options.secret === undefined ? SECRET : options.secret,
      claims: options.claims === undefined ? shared.store : options.claims,
      screenHref: (tool) => (tool === "quote_create_draft" ? "/admin/quotes" : undefined),
      describeError: async (error) => (error instanceof Error ? error.message : "오류"),
      audit,
      now: () => NOW + 1000,
    }
    const ticket = issueTicket({ tool: "quote_create_draft", args: { deal_id: `deal-${Math.random()}`, template_id: "camera_t1" }, summary: { deal_id: "x", total }, sub: "user-1" }, SECRET, NOW)
    // 미리보기 요약을 표와 같게 맞춘다(deal_id 포함)
    const args = ticket.payload.args
    const fresh = issueTicket({ tool: "quote_create_draft", args, summary: { deal_id: args.deal_id, total }, sub: "user-1" }, SECRET, NOW)
    return { deps, execute, audit, claim: shared.claim, ticket: fresh.ticket, jti: fresh.payload.jti, setTotal: (v: number) => (total = v) }
  }

  it("정상 확인은 한 번 실행하고 실제 어드민으로 감사한다", async () => {
    const { deps, execute, audit, ticket } = setup()
    const result = await confirmOrder(ticket, STAFF, deps)
    expect(result.status).toBe(200)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin_ai.order.confirm", admin: STAFF }))
    if (result.status === 200) expect(result.body.result).toContain("Q-0001")
  })

  it("같은 표를 순서대로 두 번 보내면 둘째는 실행하지 않고 409 '이미 처리됨'(화면 링크)이다", async () => {
    const { deps, execute, ticket } = setup()
    const first = await confirmOrder(ticket, STAFF, deps)
    const second = await confirmOrder(ticket, STAFF, deps)
    expect(first.status).toBe(200)
    expect(second.status).toBe(409)
    if (second.status !== 200) {
      expect(second.body.code).toBe("already_processed")
      expect(second.body.error).toBe(ALREADY_PROCESSED_TEXT)
      expect(second.body.href).toBe("/admin/quotes")
    }
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("같은 표를 동시에 두 번(같은 인스턴스) — 실행 1회, 하나는 409", async () => {
    const { deps, execute, ticket } = setup()
    const results = await Promise.all([confirmOrder(ticket, STAFF, deps), confirmOrder(ticket, STAFF, deps)])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("같은 표를 동시에 두 서버로 — 메모리를 나누지 않아도 함께 보는 저장소가 실행을 한 번으로 막는다", async () => {
    const { deps, execute, claim, ticket } = setup()
    const results = await Promise.all([
      confirmOrder(ticket, STAFF, { ...deps, run: instanceRun }),
      confirmOrder(ticket, STAFF, { ...deps, run: instanceRun }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(claim).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("표 사용 표시는 서명·역할·미리보기 대조가 끝난 뒤에만 한다", async () => {
    const { deps, claim, ticket, setTotal } = setup()
    await confirmOrder(ticket, { ...STAFF, role: "VIEWER" }, deps)
    await confirmOrder(ticket, { ...STAFF, userId: "user-2" }, deps)
    setTotal(999)
    await confirmOrder(ticket, STAFF, deps)
    expect(claim).not.toHaveBeenCalled()
  })

  it("저장소 오류(연결 실패)면 실행하지 않고 503 — 실패하면 닫힌다", async () => {
    const { deps, execute, ticket } = setup({
      claims: { kind: "distributed", claim: async () => Promise.reject(new ClaimStoreError()) },
    })
    const result = await confirmOrder(ticket, STAFF, deps)
    expect(result.status).toBe(503)
    if (result.status !== 200) expect(result.body.code).toBe("claim_store_unavailable")
    expect(execute).not.toHaveBeenCalled()
  })

  it("실행이 실패해도 표시는 남는다 — 같은 표를 다시 보내면 409, 실패 답은 새 미리보기를 안내한다", async () => {
    const { deps, execute, ticket } = setup({ failExecute: true })
    const first = await confirmOrder(ticket, STAFF, deps)
    expect(first.status).toBe(422)
    if (first.status !== 200) {
      expect(first.body.consumed).toBe(true)
      expect(first.body.error).toContain("새 미리보기")
    }
    const second = await confirmOrder(ticket, STAFF, deps)
    expect(second.status).toBe(409)
    if (second.status !== 200) expect(second.body.code).toBe("already_processed")
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("저장소가 없으면(운영) 503 이고 실행 0회", async () => {
    const { deps, execute, ticket } = setup({ claims: null })
    const result = await confirmOrder(ticket, STAFF, deps)
    expect(result.status).toBe(503)
    if (result.status !== 200) expect(result.body.code).toBe("claim_store_missing")
    expect(execute).not.toHaveBeenCalled()
  })

  it("메모리 대신 판정(운영 아님)은 한 번만 통과하고 응답에 그렇다고 표시한다", async () => {
    const { deps, execute, ticket } = setup({ claims: createMemoryClaimStore(() => NOW) })
    const first = await confirmOrder(ticket, STAFF, deps)
    const second = await confirmOrder(ticket, STAFF, { ...deps, run: instanceRun })
    expect(first.status).toBe(200)
    expect(first.body.claimStore).toBe("memory")
    expect(second.status).toBe(409)
    expect(second.body.claimStore).toBe("memory")
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

describe("확인을 열 조건 — readConfirmSetup 한 곳", () => {
  const UPSTASH = { UPSTASH_REDIS_REST_URL: "https://redis.invalid", UPSTASH_REDIS_REST_TOKEN: "token-for-test" }

  it("운영 + 저장소 없음: 확인 저장소 없음, 카드에 표를 싣지 않는다 → 확인 버튼 없이 '화면에서 직접 등록'", async () => {
    const setup = readConfirmSetup({ ADMIN_AI_TICKET_SECRET: SECRET, VERCEL_ENV: "production" })
    expect(setup.claims).toBeNull()
    expect(setup.cardSecret).toBeNull()
    expect(setup.blocked).toBe("claim_store_missing")
    const { deps, execute } = withWrites(setup.cardSecret)
    const result = await collectTurn(turn("T1 카메라 견적 초안 만들어 줘", DEAL), deps)
    const order = result.orders[0]
    expect(order.server?.ticket).toBeUndefined()
    expect(order.server?.directHref).toBe("/admin/quotes")
    expect(execute).not.toHaveBeenCalled()
  })

  it("운영이 아닌 곳 + 저장소 없음: 인스턴스 메모리로 대신한다", () => {
    for (const VERCEL_ENV of [undefined, "preview", "development"]) {
      const setup = readConfirmSetup({ ADMIN_AI_TICKET_SECRET: SECRET, VERCEL_ENV })
      expect(setup.claims?.kind).toBe("memory")
      expect(setup.cardSecret).toBe(SECRET)
    }
  })

  it("저장소가 있으면 운영에서도 연다(분산), 비밀이 없으면 열지 않는다", () => {
    const setup = readConfirmSetup({ ADMIN_AI_TICKET_SECRET: SECRET, VERCEL_ENV: "production", ...UPSTASH })
    expect(setup.claims?.kind).toBe("distributed")
    expect(setup.cardSecret).toBe(SECRET)
    const noSecret = readConfirmSetup({ VERCEL_ENV: "production", ...UPSTASH })
    expect(noSecret.cardSecret).toBeNull()
    expect(noSecret.blocked).toBe("no_secret")
  })

  it("Upstash 표시는 SET NX PX(표 만료 + 여유) 한 번 — 있으면 already_used, 연결 실패면 던진다", async () => {
    const keys = new Set<string>()
    const bodies: unknown[] = []
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const command = JSON.parse(String(init.body)) as string[]
      bodies.push(command)
      const fresh = !keys.has(command[1])
      keys.add(command[1])
      return new Response(JSON.stringify({ result: fresh ? "OK" : null }), { status: 200 })
    })
    const store = createUpstashClaimStore({ url: "https://redis.invalid", token: "t" }, fetcher)
    expect(await store.claim("jti-1")).toBe("claimed")
    expect(await store.claim("jti-1")).toBe("already_used")
    expect(bodies[0]).toEqual(["SET", "admin-ai:ticket-used:jti-1", "1", "NX", "PX", String(TICKET_CLAIM_TTL_MS)])
    expect(TICKET_CLAIM_TTL_MS).toBeGreaterThan(TICKET_TTL_MS)

    const down = createUpstashClaimStore({ url: "https://redis.invalid", token: "t" }, async () => {
      throw new TypeError("fetch failed")
    })
    await expect(down.claim("jti-2")).rejects.toBeInstanceOf(ClaimStoreError)
    const bad = createUpstashClaimStore({ url: "https://redis.invalid", token: "t" }, async () => new Response("{}", { status: 500 }))
    await expect(bad.claim("jti-3")).rejects.toBeInstanceOf(ClaimStoreError)
    const errored = createUpstashClaimStore({ url: "https://redis.invalid", token: "t" }, async () => new Response(JSON.stringify({ error: "ERR" }), { status: 200 }))
    await expect(errored.claim("jti-4")).rejects.toBeInstanceOf(ClaimStoreError)
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
