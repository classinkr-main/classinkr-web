import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("alpha recommended questions seed", () => {
  const migrationPath = join(
    process.cwd(),
    "supabase/migrations/20260614211500_chatbot_recommended_questions_alpha_seed.sql"
  )

  it("adds a fourth published starter prompt without duplicating manual rows", () => {
    expect(existsSync(migrationPath)).toBe(true)

    const sql = readFileSync(migrationPath, "utf8").toLowerCase()

    expect(sql).toContain("chatbot_recommended_questions")
    expect(sql).toContain("starter")
    expect(sql).toContain("published")
    expect(sql).toContain("where not exists")
    expect(sql).toContain("전자칠판")
    expect(sql).toContain("a/s")
  })
})
