import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  adminFetchJson: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CS_COPILOT_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/admin-client", () => ({
  adminFetchJson: mocks.adminFetchJson,
}))

import { POST } from "@/app/api/admin/cs-chat/escalation/route"
import { escalationInputFromDetail } from "@/components/admin/cs-chat/formatters"
import type { ConversationDetailResponse } from "@/components/admin/cs-chat/types"
import {
  ESCALATION_ENDPOINT,
  ESCALATION_MEMORY_LIMIT,
  escalationMemorySize,
  loadEscalation,
  readEscalationResult,
  resetEscalationMemory,
} from "@/components/admin/cs-chat/use-escalation"
import { HQ_DOMAINS } from "@/lib/internal-cs-chat/escalation-routing"
import type { EscalationResult } from "@/lib/internal-cs-chat/escalation-types"

function request(body: string) {
  return new NextRequest("http://localhost/api/admin/cs-chat/escalation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  })
}

function detail(text: string): ConversationDetailResponse {
  return {
    conversation: {
      id: "conv-route",
      title: "문의",
      status: "active",
      priority: "normal",
      assignee_user_id: null,
      assignee_name: null,
      tags: [],
      customer_context: {},
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
      last_message_at: "2026-11-01T00:00:00Z",
      archive_reason: null,
    },
    messages: [
      {
        id: "u-1",
        conversation_id: "conv-route",
        role: "user",
        content: text,
        model_name: null,
        model_mode: null,
        source_refs: [],
        metadata: {},
        review_state: "not_required",
        corrected_content: null,
        review_note: null,
        feedback_labels: [],
        regression_candidate: false,
        regression_outcome: "not_evaluated",
        reviewed_by: null,
        reviewed_at: null,
        created_at: "2026-11-01T00:00:00Z",
      },
    ],
  }
}

afterEach(() => {
  vi.clearAllMocks()
  resetEscalationMemory()
})

describe("POST /api/admin/cs-chat/escalation", () => {
  it("uses the same admin guard as the other cs-chat routes", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    const response = await POST(request(JSON.stringify({ userMessages: ["카메라"] })))
    expect(response.status).toBe(401)
    expect(mocks.requireVerifiedAdminContext).toHaveBeenCalledWith(expect.anything(), ["SUPER_ADMIN", "ADMIN", "BRANCH"])
  })

  it("returns 400 for malformed JSON or a wrong body shape, not 500", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN" })
    expect((await POST(request("{not json"))).status).toBe(400)
    expect((await POST(request(JSON.stringify({ userMessages: "카메라" })))).status).toBe(400)
    expect((await POST(request(JSON.stringify({ userMessages: [1, 2] })))).status).toBe(400)
    expect((await POST(request(JSON.stringify({ userMessages: [], tags: "area:camera" })))).status).toBe(400)
    expect((await POST(request(JSON.stringify({ userMessages: [], customerContext: [] })))).status).toBe(400)
  })

  it("answers with one domain row and the two drafts (no other domains' contacts)", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN" })
    const response = await POST(
      request(JSON.stringify({ userMessages: ["T1 카메라 화질이 떨어져요 010-2345-6789"], tags: [], priority: "high" }))
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-store")
    const body = (await response.json()) as EscalationResult
    expect(body.context.domain).toBe("camera")
    expect(body.context.contact).toEqual(HQ_DOMAINS.camera)
    expect(body.hqDraft).toContain(HQ_DOMAINS.camera.wecomMention)
    expect(body.handoffDraft).toContain("우선순위 / 태그: HIGH")
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain("010-2345-6789")
    // 다른 도메인의 담당 줄은 응답에 없다.
    for (const key of ["network", "billing", "api", "lms_agentin"]) {
      expect(serialized).not.toContain(HQ_DOMAINS[key].primaryContact)
    }
  })
})

describe("loadEscalation (client loader)", () => {
  it("posts the structured input (no AI text) once per input and remembers only successes", async () => {
    const d = detail("녹화가 안 돼요")
    const result = { context: { domain: "recording" }, hqDraft: "초안", handoffDraft: "인계" } as unknown as EscalationResult
    mocks.adminFetchJson.mockResolvedValue(result)

    const [a, b] = await Promise.all([loadEscalation(d), loadEscalation(d)])
    expect(a).toBe(result)
    expect(b).toBe(result)
    expect(mocks.adminFetchJson).toHaveBeenCalledTimes(1)
    const [url, init] = mocks.adminFetchJson.mock.calls[0]
    expect(url).toBe(ESCALATION_ENDPOINT)
    expect(init.method).toBe("POST")
    expect(init.adminReadOnly).toBe(true)
    expect(JSON.parse(init.body)).toEqual(escalationInputFromDetail(d))
    expect(readEscalationResult(d)).toBe(result)
  })

  it("does not cache a failure so the retry button can ask again", async () => {
    const d = detail("미러링이 안 돼요")
    mocks.adminFetchJson.mockRejectedValueOnce(new Error("503 Service Unavailable"))
    await expect(loadEscalation(d)).rejects.toThrow("503")
    expect(readEscalationResult(d)).toBeNull()

    const ok = { context: { domain: "mirroring" }, hqDraft: "", handoffDraft: "" } as unknown as EscalationResult
    mocks.adminFetchJson.mockResolvedValueOnce(ok)
    await expect(loadEscalation(d)).resolves.toBe(ok)
    expect(mocks.adminFetchJson).toHaveBeenCalledTimes(2)
  })

  it("keeps at most ESCALATION_MEMORY_LIMIT results and drops the least recently used (검토 동작-7)", async () => {
    const ok = { context: { domain: "general" }, hqDraft: "", handoffDraft: "" } as unknown as EscalationResult
    mocks.adminFetchJson.mockResolvedValue(ok)
    const first = detail("질문 0")
    await loadEscalation(first)
    for (let index = 1; index <= ESCALATION_MEMORY_LIMIT; index += 1) await loadEscalation(detail(`질문 ${index}`))
    expect(escalationMemorySize()).toBe(ESCALATION_MEMORY_LIMIT)
    expect(readEscalationResult(first)).toBeNull()
    expect(readEscalationResult(detail(`질문 ${ESCALATION_MEMORY_LIMIT}`))).toBe(ok)
  })
})

