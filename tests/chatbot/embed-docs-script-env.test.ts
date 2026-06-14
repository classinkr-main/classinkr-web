import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("embed docs chunks script env loading", () => {
  it("loads .env.local before checking Supabase and Gemini environment variables", () => {
    const source = readFileSync(join(process.cwd(), "scripts/embed-docs-chunks.ts"), "utf8")

    expect(source).toContain("loadEnvLocal()")
    expect(source).toContain(".env.local")
    expect(source.indexOf("loadEnvLocal()")).toBeLessThan(source.indexOf("process.env.NEXT_PUBLIC_SUPABASE_URL"))
    expect(source).toContain("GEMINI_EMBED_DIM")
    expect(source).toContain("1536")
  })
})
