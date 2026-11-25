import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// AI 인사이트 모델 호출 — Claude(Anthropic API) 먼저, 실패하면 Gemini(Vertex 또는 AI Studio).
const createMock = vi.fn()
vi.mock("@anthropic-ai/sdk", () => ({
  default: class { beta = { messages: { create: createMock } } },
}))
vi.mock("googleapis", () => ({
  google: { auth: { GoogleAuth: class { async getAccessToken() { return "vertex-token" } } } },
}))

import { generateStructured, toClaudeSchema, type StructuredCall } from "@/lib/branch/insights/llm"

const call: StructuredCall<{ ok: string }> = {
  system: "sys",
  user: "{}",
  schema: { type: "object", properties: { ok: { type: "string", maxLength: 10 } }, required: ["ok"] },
  mode: "quality",
  validate: (value) => {
    const v = value as { ok?: unknown }
    if (typeof v?.ok !== "string") throw new Error("bad shape")
    return { ok: v.ok }
  },
}
const geminiOk = (text: string) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) }) as unknown as Response
const ENV_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "GEMINI_API_KEY", "GOOGLE_VERTEX_PROJECT", "GOOGLE_VERTEX_LOCATION", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "BRANCH_INSIGHTS_CLAUDE_MODEL", "GEMINI_MODEL"]
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) { saved[key] = process.env[key]; delete process.env[key] }
  createMock.mockReset()
  vi.unstubAllGlobals()
})
afterEach(() => {
  for (const key of ENV_KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] }
})

describe("Claude 구조화 출력 스키마", () => {
  it("객체마다 additionalProperties:false를 넣고 길이·개수·패턴 제약은 뺀다(enum·required는 유지)", () => {
    const out = toClaudeSchema({
      type: "object",
      properties: {
        list: { type: "array", minItems: 5, maxItems: 5, items: { type: "object", properties: { due: { type: "string", pattern: "^x$" }, m: { type: "string", enum: ["KA"] } }, required: ["m"] } },
      },
      required: ["list"],
    })
    expect(out).toEqual({
      type: "object",
      properties: {
        list: { type: "array", items: { type: "object", properties: { due: { type: "string" }, m: { type: "string", enum: ["KA"] } }, required: ["m"], additionalProperties: false } },
      },
      required: ["list"],
      additionalProperties: false,
    })
  })
})

describe("모델 순서", () => {
  it("Claude가 되면 Claude 결과를 쓰고 Gemini는 부르지 않는다", async () => {
    process.env.ANTHROPIC_API_KEY = "k"
    createMock.mockResolvedValue({ id: "msg", model: "claude-opus-5-5", stop_reason: "end_turn", usage: {}, content: [{ type: "text", text: "{\"ok\":\"claude\"}" }] })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const out = await generateStructured(call)
    expect(out).toMatchObject({ provider: "claude", result: { ok: "claude" } })
    expect(fetchMock).not.toHaveBeenCalled()
    const req = createMock.mock.calls[0][0]
    expect(req.model).toBe("claude-opus-5-5")
    expect(req.output_config.format.type).toBe("json_schema")
    expect(req.output_config.format.schema.additionalProperties).toBe(false)
    expect(req.fallbacks).toBe("default")
  })

  it("Claude가 실패(크레딧·거절 등)하면 Gemini로 한 번 더 부르고 이유를 남긴다", async () => {
    process.env.ANTHROPIC_API_KEY = "k"
    process.env.GEMINI_API_KEY = "g"
    createMock.mockResolvedValue({ id: "msg", model: "claude-opus-5-5", stop_reason: "refusal", stop_details: { category: "cyber" }, usage: {}, content: [] })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiOk("{\"ok\":\"gemini\"}")))
    const out = await generateStructured(call)
    expect(out).toMatchObject({ provider: "gemini-studio", result: { ok: "gemini" } })
    expect(out.fallbackReason).toMatch(/refusal/)
  })

  it("Anthropic 키가 없으면 바로 Gemini", async () => {
    process.env.GEMINI_API_KEY = "g"
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiOk("{\"ok\":\"gemini\"}")))
    const out = await generateStructured(call)
    expect(out.provider).toBe("gemini-studio")
    expect(createMock).not.toHaveBeenCalled()
  })

  it("Vertex 프로젝트가 있으면 Gemini는 Vertex 엔드포인트를 서비스 계정 토큰으로 부른다", async () => {
    process.env.GOOGLE_VERTEX_PROJECT = "classin-kr"
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "sa@x.iam.gserviceaccount.com"
    process.env.GOOGLE_PRIVATE_KEY = "key"
    process.env.GEMINI_MODEL = "gemini-3-pro"
    const fetchMock = vi.fn().mockResolvedValue(geminiOk("{\"ok\":\"vertex\"}"))
    vi.stubGlobal("fetch", fetchMock)
    const out = await generateStructured(call)
    expect(out.provider).toBe("gemini-vertex")
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://aiplatform.googleapis.com/v1/projects/classin-kr/locations/global/publishers/google/models/gemini-3-pro:generateContent")
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer vertex-token" })
  })

  it("둘 다 실패하면 두 이유를 함께 알린다(0건·빈 결과로 위장하지 않는다)", async () => {
    process.env.ANTHROPIC_API_KEY = "k"
    process.env.GEMINI_API_KEY = "g"
    createMock.mockRejectedValue(new Error("402 credit"))
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "quota" } as unknown as Response))
    await expect(generateStructured(call)).rejects.toThrow(/Claude: 402 credit \/ Gemini: Gemini 429/)
  })
})
