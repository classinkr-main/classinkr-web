import { NextRequest, NextResponse } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { parseStreamChunk } from "@/lib/admin-ai/stream-protocol"

// 인증 가드는 실제 역할 판정(hasAdminApiRole)을 쓰고, 세션 해석만 가짜다 — 헤더 x-test-role 이 있으면 그 역할로 로그인.
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-auth")>()
  return {
    ...actual,
    requireVerifiedAdminContext: vi.fn(async (req: NextRequest, roles: readonly string[]) => {
      const role = req.headers.get("x-test-role")
      if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      if (!actual.hasAdminApiRole(role, roles as never)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      return { source: "supabase", role, name: "스태프", userId: req.headers.get("x-test-user") ?? "user-1", capabilities: [] }
    }),
  }
})

vi.mock("@/lib/admin-ai/server/deps", async () => {
  const { fakeDeps } = await import("./fakes")
  return { buildServerOrchestratorDeps: () => fakeDeps().deps }
})

import { POST } from "@/app/api/admin/ai/chat/route"

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/admin/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost", ...headers },
    body: JSON.stringify(body),
  })
}

const ask = (text: string) => ({ messages: [{ role: "user", text }], pageContext: { path: "/admin/hardware", label: "HW" } })

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ADMIN_AI_LIVE", "1")
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe("POST /api/admin/ai/chat — 가드", () => {
  it("실제 모드 스위치가 꺼져 있으면 404", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_AI_LIVE", "")
    const res = await POST(request(ask("T1 재고 몇 대야?"), { "x-test-role": "ADMIN" }))
    expect(res.status).toBe(404)
  })

  it("로그인하지 않으면 401", async () => {
    const res = await POST(request(ask("T1 재고 몇 대야?")))
    expect(res.status).toBe(401)
  })

  it("대화 역할(CRM 스태프)이 아니면 403 — VIEWER·PARTNER", async () => {
    for (const role of ["VIEWER", "PARTNER"]) {
      const res = await POST(request(ask("T1 재고 몇 대야?"), { "x-test-role": role }))
      expect(res.status, role).toBe(403)
    }
  })

  it("계정별 분당 상한을 넘으면 429", async () => {
    const headers = { "x-test-role": "EDITOR", "x-test-user": "rate-limit-user" }
    let last = 0
    for (let i = 0; i < 21; i += 1) last = (await POST(request(ask("안녕"), headers))).status
    expect(last).toBe(429)
    // 다른 계정은 영향이 없다
    expect((await POST(request(ask("안녕"), { "x-test-role": "EDITOR", "x-test-user": "other-user" }))).status).toBe(200)
  })

  it("본문이 잘못되면 400", async () => {
    const res = await POST(request({ messages: [] }, { "x-test-role": "ADMIN" }))
    expect(res.status).toBe(400)
  })
})

describe("POST /api/admin/ai/chat — NDJSON 스트림", () => {
  it("단계 → 블록 → 끝 순서로 낸다", async () => {
    const res = await POST(request(ask("T1 재고 몇 대야?"), { "x-test-role": "BRANCH", "x-test-user": "stream-user" }))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/x-ndjson")
    const { events, rest } = parseStreamChunk(await res.text())
    expect(rest).toBe("")
    expect(events[0]).toEqual({ type: "step", label: "질문 나누기" })
    expect(events.at(-1)).toEqual({ type: "done" })
    const kinds = events.filter((e) => e.type === "block").map((e) => (e.type === "block" ? e.block.kind : ""))
    expect(kinds).toEqual(["text", "read"])
  })
})
