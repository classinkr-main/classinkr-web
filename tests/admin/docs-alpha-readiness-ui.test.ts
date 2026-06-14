import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("admin docs alpha readiness surface", () => {
  it("exposes a guarded alpha readiness endpoint backed by docs and chatbot tables", () => {
    const routePath = join(process.cwd(), "app/api/admin/docs/alpha-readiness/route.ts")

    expect(existsSync(routePath)).toBe(true)

    const source = readFileSync(routePath, "utf8")
    expect(source).toContain("verifyAdmin")
    expect(source).toContain("ALPHA_DB_RPC_PROBES")
    expect(source).toContain("buildChatbotAlphaReadiness")
    expect(source).toContain("listDocGapBacklog")
    expect(source).toContain(".rpc(probe.functionName")
    expect(source).toContain("docs_ai_chunks")
    expect(source).toContain("chatbot_recommended_questions")
  })

  it("shows alpha readiness in the docs gap admin workspace", () => {
    const source = readFileSync(join(process.cwd(), "app/admin/docs/gaps/page.tsx"), "utf8")

    expect(source).toContain("/api/admin/docs/alpha-readiness")
    expect(source).toContain("알파 준비도")
    expect(source).toContain("Supabase 운영 연결")
    expect(source).toContain("챗봇 DB 스키마")
    expect(source).toContain("check.artifacts")
  })
})
