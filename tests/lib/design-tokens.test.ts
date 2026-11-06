// lib/design-tokens.ts 손 미러가 app/styles/tokens.css 정본과 같은지 대조한다 (system §3-6).
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { color } from "@/lib/design-tokens"

const css = readFileSync(join(process.cwd(), "app/styles/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

// 첫 블록만 읽는다. 중첩 블록 앞에서 멈춘다.
function block(selector: RegExp): Record<string, string> {
  const body = css.match(selector)?.[1] ?? ""
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]))
}

const root = block(/:root\s*\{([^{}]*)/)
const theme = block(/@theme inline\s*\{([^{}]*)/)

// 미러 키 → tokens.css 변수 (lib/design-tokens.ts 주석과 같은 10쌍)
const PAIRS: Record<keyof typeof color, string> = {
  paper: "surface-paper",
  sheet: "surface-sheet",
  sunken: "surface-sunken",
  ink: "surface-ink",
  fgBody: "fg-body",
  fgMuted: "fg-muted",
  accent: "fg-accent",
  onAccent: "fg-on-accent",
  lineControl: "line-control",
  danger: "fg-danger",
}

describe("lib/design-tokens 미러", () => {
  it("미러 키 10개가 대조 목록과 같다", () => {
    expect(Object.keys(color).sort()).toEqual(Object.keys(PAIRS).sort())
  })

  it.each(Object.entries(PAIRS))("%s = --%s", (key, cssVar) => {
    expect(root[cssVar], `tokens.css :root 에 --${cssVar} 없음`).toBeDefined()
    expect(color[key as keyof typeof color].toLowerCase()).toBe(root[cssVar].toLowerCase())
  })

  it.each(["ease-soft", "ease-drift"])("@theme inline --%s = :root 값", (name) => {
    const norm = (v: string | undefined) => v?.replace(/\s+/g, "")
    expect(root[name]).toBeDefined()
    expect(norm(theme[name])).toBe(norm(root[name]))
  })
})
