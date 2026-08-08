import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { formatBlogDisplayDate, resolveDisplayDateSource } from "@/lib/blog-display"

const repositorySource = readFileSync(
  path.join(process.cwd(), "lib/repositories/blog.ts"),
  "utf8",
)

describe("블로그 목록 표시 날짜", () => {
  it("발행일이 있으면 발행일을 쓴다 (정렬 키와 동일해야 최신순이 화면에서도 최신순이다)", () => {
    expect(
      resolveDisplayDateSource({
        published_at: "2026-07-29T00:00:00Z",
        created_at: "2026-06-11T00:00:00Z",
      }),
    ).toBe("2026-07-29T00:00:00Z")
  })

  it("발행일이 없는 레거시 글만 작성일로 떨어진다", () => {
    expect(
      resolveDisplayDateSource({ published_at: null, created_at: "2023-04-27T00:00:00Z" }),
    ).toBe("2023-04-27T00:00:00Z")
  })

  it("표시 문자열에 이중 공백이나 후행 마침표가 없다", () => {
    const formatted = formatBlogDisplayDate("2023-08-02T00:00:00Z")
    expect(formatted).not.toMatch(/\s{2}/)
    expect(formatted).not.toMatch(/\.$/)
    expect(formatted).toMatch(/^\d{4}\. \d{2}\. \d{2}$/)
  })
})

describe("블로그 목록 정렬", () => {
  // Postgres는 DESC에서 NULL을 맨 앞에 둔다. published_at 없이 발행된 글이
  // 목록 최상단에 눌러앉는 회귀를 막는다.
  it("공개 목록 쿼리가 published_at DESC에서 NULL을 뒤로 보낸다", () => {
    const orderCalls = repositorySource.match(/\.order\("published_at"[^)]*\)/g) ?? []
    expect(orderCalls.length).toBeGreaterThan(0)
    for (const call of orderCalls) {
      expect(call).toContain("nullsFirst: false")
    }
  })

  it("동일 발행 시각 글의 순서를 created_at으로 고정한다", () => {
    expect(repositorySource).toContain('.order("created_at", { ascending: false })')
  })

  it("표시 날짜를 created_at에서 직접 읽지 않는다", () => {
    expect(repositorySource).not.toMatch(/date:\s*formatDate\(row\.created_at\)/)
    expect(repositorySource).toContain("resolveDisplayDateSource(row)")
  })
})
