import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// T5(§11.3) — GET /api/cron/crm-auto-tags. 인증(401)·dryRun 전달·200·500을 고정한다.
// 인증 계약은 app/api/cron/lead-response-alerts/route.ts와 동일(Authorization: Bearer
// CRON_SECRET만, x-vercel-cron은 인증에 쓰지 않는다).

const applyAutoTagRules = vi.hoisted(() => vi.fn())

vi.mock("@/lib/repositories/crm-tag-rules", () => ({
  applyAutoTagRules,
}))

import { GET } from "@/app/api/cron/crm-auto-tags/route"

const ORIGINAL_ENV = { ...process.env }

function cronRequest(query = "") {
  return new NextRequest(`https://classin.kr/api/cron/crm-auto-tags${query}`, {
    headers: { authorization: "Bearer cron-test-secret" },
  })
}

beforeEach(() => {
  process.env.CRON_SECRET = "cron-test-secret"
  applyAutoTagRules.mockReset()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("GET /api/cron/crm-auto-tags", () => {
  it("CRON_SECRET이 설정되지 않으면 401이고 applyAutoTagRules를 호출하지 않는다", async () => {
    delete process.env.CRON_SECRET
    const response = await GET(cronRequest())
    expect(response.status).toBe(401)
    expect(applyAutoTagRules).not.toHaveBeenCalled()
  })

  it("Authorization 헤더가 없거나 다르면 401이다", async () => {
    const request = new NextRequest("https://classin.kr/api/cron/crm-auto-tags")
    const response = await GET(request)
    expect(response.status).toBe(401)
    expect(applyAutoTagRules).not.toHaveBeenCalled()
  })

  it("x-vercel-cron 헤더만으로는 인증되지 않는다", async () => {
    const request = new NextRequest("https://classin.kr/api/cron/crm-auto-tags", {
      headers: { "x-vercel-cron": "1" },
    })
    const response = await GET(request)
    expect(response.status).toBe(401)
  })

  it("정상 인증이면 applyAutoTagRules({ dryRun: false })를 호출하고 200을 돌려준다", async () => {
    applyAutoTagRules.mockResolvedValue({ generatedAt: "2026-09-22T00:00:00Z", dryRun: false, results: [] })
    const response = await GET(cronRequest())
    expect(response.status).toBe(200)
    expect(applyAutoTagRules).toHaveBeenCalledWith({ dryRun: false })
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.report).toMatchObject({ dryRun: false })
  })

  it("?dryRun=1이면 applyAutoTagRules({ dryRun: true })를 호출한다", async () => {
    applyAutoTagRules.mockResolvedValue({ generatedAt: "2026-09-22T00:00:00Z", dryRun: true, results: [] })
    const response = await GET(cronRequest("?dryRun=1"))
    expect(response.status).toBe(200)
    expect(applyAutoTagRules).toHaveBeenCalledWith({ dryRun: true })
  })

  it("applyAutoTagRules가 실패하면 500과 에러 메시지를 돌려준다", async () => {
    applyAutoTagRules.mockRejectedValue(new Error("boom"))
    const response = await GET(cronRequest())
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.ok).toBe(false)
    expect(body.error).toContain("boom")
  })
})
