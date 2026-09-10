import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const repository = readFileSync(join(process.cwd(), "lib/repositories/blog.ts"), "utf8")
const aboutPage = readFileSync(join(process.cwd(), "app/about/page.tsx"), "utf8")

describe("public blog query resilience contract", () => {
  it("retries one transient timeout and never reports it as a valid empty result", () => {
    expect(repository).toContain("const PUBLIC_BLOG_QUERY_ATTEMPTS = 2")
    expect(repository).toContain("attempt < PUBLIC_BLOG_QUERY_ATTEMPTS")
    expect(repository).toContain("throw new Error(`[blog] 공개 글 조회 timeout")
    expect(repository).not.toContain("공개 글 조회 timeout after ${PUBLIC_BLOG_QUERY_TIMEOUT_MS}ms`);\n      return []")
  })

  it("loads only the three cards rendered by the about page", () => {
    expect(aboutPage).toContain("getRecentPublishedPosts(3)")
    expect(aboutPage).not.toContain("posts.slice(0, 3)")
    expect(repository).toContain("if (limit !== undefined) query = query.limit(limit)")
  })
})
