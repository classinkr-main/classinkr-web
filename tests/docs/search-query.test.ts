import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { readQuery, withSearchNoIndex } from "@/app/docs/_utils"

function read(relative: string) {
  // Windows CRLF 체크아웃에서도 같은 패턴으로 보게 줄바꿈을 맞춘다.
  return readFileSync(join(process.cwd(), relative), "utf8").replace(/\r\n/g, "\n")
}

describe("docs search query normalization", () => {
  it("does not throw when q is repeated (?q=a&q=b arrives as an array) and uses the first value", () => {
    expect(() => readQuery(["녹화", "로그인"])).not.toThrow()
    expect(readQuery(["  녹화  ", "로그인"])).toBe("녹화")
  })

  it("returns an empty string for missing, empty or whitespace-only values", () => {
    expect(readQuery(undefined)).toBe("")
    expect(readQuery("")).toBe("")
    expect(readQuery("   ")).toBe("")
    expect(readQuery([])).toBe("")
    expect(readQuery([""])).toBe("")
  })

  it("trims a plain string without changing its case", () => {
    expect(readQuery("  EDB  ")).toBe("EDB")
  })

  it("keeps the hub indexable without a query and noindex,follow with one", () => {
    const base = { alternates: { canonical: "https://classin.co.kr/docs" } }

    expect(withSearchNoIndex(base, "")).toBe(base)
    expect(withSearchNoIndex(base, "녹화")).toEqual({
      ...base,
      robots: { index: false, follow: true },
    })
  })
})

describe("docs routes read q through readQuery", () => {
  // 세 라우트의 본문과 generateMetadata 가 같은 정규화를 거치는지, 배열에 .trim() 을 바로 부르는 코드가
  // 되살아나지 않는지 소스로 고정한다.
  it.each(["app/docs/page.tsx", "app/docs/[category]/page.tsx", "app/docs/search/page.tsx"])(
    "%s normalizes q with readQuery and never trims the raw value",
    (file) => {
      const source = read(file)
      expect(source).toContain("readQuery(")
      expect(source).not.toMatch(/\bq\?\.trim\(/)
      expect(source).not.toMatch(/\(q \?\? ""\)\.trim\(/)
      expect(source).not.toMatch(/Promise<\{ q\?: string \}>/)
    }
  )

  it.each(["app/docs/page.tsx", "app/docs/[category]/page.tsx"])(
    "%s keeps the canonical query-free and noindexes search URLs",
    (file) => {
      const source = read(file)
      expect(source).toContain("export async function generateMetadata")
      expect(source).toContain("createPublicMetadata(")
      expect(source).toContain("withSearchNoIndex(")
    }
  )

  it("does not stack the guide suffix on the category title (root template already appends | Classin)", () => {
    const source = read("app/docs/[category]/page.tsx")
    expect(source).not.toContain("| Classin 가이드")
  })
})
