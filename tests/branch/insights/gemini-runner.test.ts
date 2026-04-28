import { describe, it, expect, vi, beforeEach } from "vitest"
import { callGemini } from "@/lib/branch/insights/gemini-runner"
import type { InsightInput } from "@/lib/branch/insights/input-builder"

const stubInput = {} as InsightInput

describe("callGemini", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test"
    delete process.env.GEMINI_MODEL
    vi.restoreAllMocks()
  })

  it("parses JSON response", async () => {
    const fake = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              one_liner: "ok",
              next_actions: [{ title: "t", why: "y", owner: "Han" }],
            }),
          }],
        },
      }],
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fake,
    } as unknown as Response))
    const out = await callGemini(stubInput)
    expect(out.result.one_liner).toBe("ok")
    expect(out.result.next_actions).toHaveLength(1)
  })

  it("falls back from unsupported gemini-3.1-pro config", async () => {
    process.env.GEMINI_MODEL = "gemini-3.1-pro"
    const fake = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              one_liner: "ok",
              next_actions: [{ title: "t", why: "y", owner: "Han" }],
            }),
          }],
        },
      }],
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fake,
    } as unknown as Response)
    vi.stubGlobal("fetch", fetchMock)

    await callGemini(stubInput)

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/models/gemini-2.5-pro:generateContent"),
      expect.any(Object),
    )
  })

  it("throws on non-200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    } as unknown as Response))
    await expect(callGemini(stubInput)).rejects.toThrow(/500/)
  })
})
