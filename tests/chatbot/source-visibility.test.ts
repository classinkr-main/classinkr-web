import { describe, expect, it } from "vitest"

import { resolveMatchChunkVisibility } from "@/lib/chatbot/service"

// 벡터 RPC 행 → ChatbotSource.visibility 판정. internal 만 표시하고 공개 문서는 undefined 로 둔다
// (공개 경로 응답 sources 의 모양을 바꾸지 않기 위해서다).
describe("resolveMatchChunkVisibility", () => {
  it("marks chunks whose metadata says internal", () => {
    expect(resolveMatchChunkVisibility({ metadata: { visibility: "internal" }, category_id: "admin" })).toBe("internal")
  })

  it("marks chunks from DB-locked internal categories even without metadata", () => {
    expect(resolveMatchChunkVisibility({ metadata: null, category_id: "cs-knowledge" })).toBe("internal")
    expect(resolveMatchChunkVisibility({ metadata: {}, category_id: "internal-canon" })).toBe("internal")
  })

  it("leaves public and unlisted docs undefined so the public payload is unchanged", () => {
    expect(resolveMatchChunkVisibility({ metadata: { visibility: "public" }, category_id: "admin" })).toBeUndefined()
    expect(resolveMatchChunkVisibility({ metadata: { visibility: "unlisted" }, category_id: "teacher" })).toBeUndefined()
    expect(resolveMatchChunkVisibility({ metadata: null, category_id: "start" })).toBeUndefined()
  })
})
