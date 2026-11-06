// 지면·글자·선 토큰 대비 (surfaces §5-1·§8-1). WCAG 2.x 상대 휘도, 알파 색은 지면 위에 sRGB 합성.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(join(process.cwd(), "app/styles/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

// 첫 블록만 읽는다. 중첩 @media 앞에서 멈춘다.
function block(selector: RegExp): Record<string, string> {
  const body = css.match(selector)?.[1] ?? ""
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]))
}

const root = block(/:root\s*\{([^{}]*)/)
const ink = block(/\.surface-ink\s*\{([^{}]*)/)

type Rgba = [number, number, number, number]

// #RRGGBB 또는 rgb(r g b / a) 만 받는다. 다른 형식이면 실패시킨다.
function parse(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgb = value.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)\s*)?\)$/)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]
  throw new Error(`색 형식 미지원: ${value}`)
}

// 합성 결과는 8비트 정수로 반올림한다(화면에 그려지는 값, 표의 손 계산과 같은 방식)
function over([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba {
  const mix = (c: number, base: number) => Math.round(c * a + base * (1 - a))
  return [mix(r, br), mix(g, bg), mix(b, bb), 1]
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(fg: string, bg: string): number {
  const base = parse(bg)
  const a = luminance(over(parse(fg), base))
  const b = luminance(base)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const ROOT_KEYS = [
  "surface-paper", "surface-sheet", "surface-sunken", "surface-ink", "surface-skeleton", "surface-scrim",
  "fg-ink", "fg-body", "fg-muted", "fg-placeholder", "fg-faint", "fg-accent", "fg-accent-hover", "fg-danger", "fg-on-accent",
  "line-hair", "line-strong", "line-ink", "line-control", "line-link",
]
const INK_KEYS = [
  "surface-sheet", "fg-ink", "fg-body", "fg-muted", "fg-placeholder", "fg-faint", "fg-accent", "fg-accent-hover", "fg-danger",
  "line-hair", "line-strong", "line-ink", "line-control", "line-link",
]

describe("tokens.css 대비", () => {
  it("기대 키를 모두 읽었다", () => {
    expect(ROOT_KEYS.filter((k) => !(k in root))).toEqual([])
    expect(INK_KEYS.filter((k) => !(k in ink))).toEqual([])
  })

  const surfaces = ["surface-sheet", "surface-paper", "surface-sunken"]

  describe("밝은 지면", () => {
    for (const surface of surfaces) {
      it.each(["fg-ink", "fg-body", "fg-muted", "fg-accent", "fg-accent-hover", "fg-danger"])(`%s on ${surface} ≥ 4.5`, (fg) => {
        expect(contrast(root[fg], root[surface])).toBeGreaterThanOrEqual(4.5)
      })
      it.each(["line-control", "line-link"])(`%s on ${surface} ≥ 3.0`, (line) => {
        expect(contrast(root[line], root[surface])).toBeGreaterThanOrEqual(3)
      })
    }

    it("fg-placeholder on surface-sheet ≥ 4.5 (입력 바탕은 sheet 만)", () => {
      expect(contrast(root["fg-placeholder"], root["surface-sheet"])).toBeGreaterThanOrEqual(4.5)
    })

    it("fg-on-accent on fg-accent ≥ 4.5", () => {
      expect(contrast(root["fg-on-accent"], root["fg-accent"])).toBeGreaterThanOrEqual(4.5)
    })
  })

  describe("먹 지면 (.surface-ink 재정의 on --surface-ink)", () => {
    it.each(["fg-ink", "fg-body", "fg-muted", "fg-placeholder", "fg-accent", "fg-danger"])("%s ≥ 4.5", (fg) => {
      expect(contrast(ink[fg], root["surface-ink"])).toBeGreaterThanOrEqual(4.5)
    })
    it.each(["line-control", "line-link"])("%s ≥ 3.0", (line) => {
      expect(contrast(ink[line], root["surface-ink"])).toBeGreaterThanOrEqual(3)
    })
  })

  // 계산식 자체 점검 — surfaces §2-2·§2-3 표의 손 계산값. line-link 는 새 --line-link rgb(11 122 82 / .75) on sheet (2026-11-02)
  it("표의 값과 맞다", () => {
    expect(contrast(root["fg-muted"], root["surface-sheet"])).toBeCloseTo(6.53, 1)
    expect(contrast(root["line-link"], root["surface-sheet"])).toBeCloseTo(3.35, 1)
    expect(contrast(ink["fg-muted"], root["surface-ink"])).toBeCloseTo(6.14, 1)
  })
})
