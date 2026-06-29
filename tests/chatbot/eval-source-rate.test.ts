import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { runGoldenEval } from "@/lib/chatbot/eval"

interface GoldenCase {
  id: string
  expectSources?: boolean
}

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

describe("chatbot golden eval source coverage", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("excludes source-optional cases from the source-rate denominator", async () => {
    disableExternalChatbotServices()
    const limit = 40
    const cases = JSON.parse(
      readFileSync(join(process.cwd(), "data/chatbot-golden-set.json"), "utf8")
    ).cases as GoldenCase[]
    const sourceOptionalCount = cases
      .slice(0, limit)
      .filter((testCase) => testCase.expectSources === false).length

    const report = await runGoldenEval({ judge: false, limit })
    const deterministic = report.deterministic as typeof report.deterministic & {
      sourceApplicable?: number
    }

    expect(sourceOptionalCount).toBeGreaterThan(0)
    expect(deterministic.sourceApplicable).toBe(report.total - sourceOptionalCount)
    expect(deterministic.sourceRate).toBe(
      deterministic.withSources / (deterministic.sourceApplicable ?? 1)
    )
  })
})
