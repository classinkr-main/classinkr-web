// cn() 의 tailwind-merge 확장 설정 (system §3-7). 토큰 유틸이 서로 지우지 않는지 본다.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { TEXT_SCALE, cn } from "@/lib/utils"

describe("cn — 토큰 유틸 병합", () => {
  it("크기·색·여백은 서로 다른 그룹이라 셋 다 남는다", () => {
    expect(cn("mt-4 text-h3 text-fg-ink")).toBe("mt-4 text-h3 text-fg-ink")
  })

  it("크기 토큰끼리는 뒤의 것이 이긴다", () => {
    expect(cn("text-body text-h3")).toBe("text-h3")
  })

  it("text-ui 와 색 토큰은 둘 다 남는다", () => {
    expect(cn("text-ui text-fg-muted")).toBe("text-ui text-fg-muted")
  })

  it("선 색 토큰끼리는 뒤의 것이 이긴다", () => {
    expect(cn("border-line-hair border-line-control")).toBe("border-line-control")
  })

  it("측정폭 토큰은 max-w 그룹이다", () => {
    expect(cn("max-w-measure max-w-2xl")).toBe("max-w-2xl")
  })

  it("TEXT_SCALE = tokens.css 의 --text-* 이름 집합", () => {
    const css = readFileSync(join(process.cwd(), "app/styles/tokens.css"), "utf8")
    const names = new Set([...css.matchAll(/--text-([a-z0-9-]+):/g)].map((m) => m[1]).filter((n) => !n.includes("--")))
    expect([...names].sort()).toEqual([...TEXT_SCALE].sort())
  })
})
