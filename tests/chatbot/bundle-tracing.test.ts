import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

import nextConfig from "@/next.config"

const picomatch = createRequire(import.meta.url)("next/dist/compiled/picomatch") as (
  glob: string,
  options: { dot: boolean; contains: boolean }
) => (value: string) => boolean

function matchTraceMap(map: Record<string, string[]> | undefined, route: string) {
  return Object.entries(map ?? {})
    .filter(([glob]) => picomatch(glob, { dot: true, contains: true })(route))
    .flatMap(([, files]) => files)
}

describe("chatbot serverless bundle tracing configuration", () => {
  it.each(["/api/chatbot/query", "/api/chatbot/query/stream"])(
    "includes runtime answer-index artifacts and excludes non-runtime bloat for %s",
    (route) => {
      expect(existsSync(path.join(process.cwd(), "app", route, "route.ts")), route).toBe(true)

      const includes = matchTraceMap(nextConfig.outputFileTracingIncludes, route)
      expect(includes).toContain("./data/answer-index/cards/*.json")
      expect(includes).toContain("./data/answer-index/variants/*.json")
      expect(includes).toContain("./data/answer-index/universe/*.json")
      expect(includes).toContain("./data/answer-index/lexicon.json")
      expect(includes).toContain("./data/answer-index/manifest.json")

      const excludes = matchTraceMap(nextConfig.outputFileTracingExcludes, route)
      expect(excludes).toContain("./data/_naver-dev/**")
      expect(excludes).toContain("./data/_naver-pull/**")
      expect(excludes).toContain("./data/answer-index/inventory.json")
      expect(excludes).toContain("./data/answer-index/units.json")
      expect(excludes).toContain("./data/answer-index/site-facts.json")
      expect(excludes).toContain("./data/answer-index/audit/**")
      expect(excludes).toContain("./data/answer-index/eval/**")
      expect(excludes).toContain("./data/chatbot-golden-set.json")
    }
  )
})
