import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  runGoldenEval: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/chatbot/eval", () => ({ runGoldenEval: mocks.runGoldenEval }))

import { POST } from "@/app/api/admin/chatbot/eval/route"

function request(body: Record<string, unknown>) {
  return new NextRequest("https://classin.ai.kr/api/admin/chatbot/eval", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/admin/chatbot/eval quality gate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyAdmin.mockResolvedValue(null)
    mocks.runGoldenEval.mockResolvedValue({ gate: { passed: false, reasons: ["source_rate_below_threshold"] } })
  })

  it("returns 422 when an explicitly enforced gate fails", async () => {
    const response = await POST(request({ judge: false, enforceGate: true }))

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ gate: { passed: false } })
  })

  it("keeps report-only evaluation backward compatible by default", async () => {
    const response = await POST(request({ judge: false }))

    expect(response.status).toBe(200)
    expect(mocks.runGoldenEval).toHaveBeenCalledWith({ judge: false, limit: undefined })
  })
})
