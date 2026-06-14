import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("chatbot embedding dimension", () => {
  it("defaults runtime query embeddings to the current production vector(1536) schema", () => {
    const source = readFileSync(join(process.cwd(), "lib/chatbot/llm.ts"), "utf8")

    expect(source).toContain("GEMINI_EMBED_DIM")
    expect(source).toContain("1536")
    expect(source).toContain("CHATBOT_EMBED_DIM")
  })
})
