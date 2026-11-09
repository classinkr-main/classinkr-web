import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "../..")

function readSource(relativePath: string) {
  return readFileSync(path.join(ROOT, relativePath), "utf8")
}

function sourcesIn(dir: string) {
  return readdirSync(path.join(ROOT, dir))
    .filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"))
    .map((name) => `${dir}/${name}`)
}

// 검색 광고 착지 페이지(2026-11-06). 제품 문서(docs/active/classin-software-feature-inventory.md, lib/docs.ts)보다
// 더 단정하는 문구가 다시 들어오지 않게 지킨다. 카메라는 선택 구성품, 녹화는 옵션 + [즉시 녹화], 판서는 최대 50페이지,
// 터치 응답은 규격서 2ms, OPS는 i5, 무료 범위는 문서에 없음, '집중도'는 포지셔닝 캐논 금지어다.
const LANDING_SOURCES = [
  "app/product/hw/page.tsx",
  "app/product/hw/layout.tsx",
  ...sourcesIn("components/product/hw"),
  "app/product/sw/page.tsx",
  "app/product/sw/layout.tsx",
  ...sourcesIn("components/product/sw"),
  "app/product/ai-report/page.tsx",
  "app/product/ai-report/layout.tsx",
  "lib/ai-report-content.ts",
  "app/showroom/page.tsx",
  "app/product/page.tsx",
]

const BANNED = [
  "0.03초",
  "0.03s",
  "i7",
  "무한 캔버스",
  "무한 판서",
  "BUILT-IN",
  "즉시 배포",
  "4K AI 카메라",
  "4K 녹화",
  "4K 자동 트래킹",
  "4K@120Hz",
  "20포인트",
  "수식 편집기",
  "집중도",
  "무료 체험",
  "무료로 시작",
  "누르지 않아도",
  "누락되는 수업",
  "재생 시 워터마크", // 조건 없는 단정만 막는다 — "화면 녹화 방지를 켜 두면 … 워터마크"는 설정에 따른 문장(#86)
  "다운로드 차단",
  "다운로드가 차단",
  "30일 만족 보장",
]

describe("제품 착지 페이지가 문서보다 더 단정하지 않는다", () => {
  it.each(LANDING_SOURCES)("%s", (file) => {
    const source = readSource(file)
    for (const phrase of BANNED) {
      expect(source.includes(phrase), `${file}: "${phrase}"`).toBe(false)
    }
  })

  it("JSON-LD 제품 설명에 카메라를 기본 기능처럼 적지 않는다", () => {
    const seo = readSource("lib/seo.ts")
    expect(seo).not.toContain("4K AI 카메라")
    expect(seo).not.toContain("4K 자동 트래킹")
  })
})

describe("검색 광고가 쓰는 앵커와 쇼룸 CTA", () => {
  it("/product/hw 요약 앵커, 쇼룸 예약 CTA, H1 의 '학원 전자칠판'", () => {
    const hw = readSource("app/product/hw/page.tsx")
    expect(hw).toContain('id="classin-board-summary"')
    expect(hw).toContain('href="/showroom#booking"')
    const h1 = hw.slice(hw.indexOf("<h1"), hw.indexOf("</h1>"))
    expect(h1).toContain("학원 전자칠판")
  })

  it("카메라 구간에 id 가 있다", () => {
    expect(readSource("components/product/hw/AICameraSection.tsx")).toContain('id="ai-tracking-camera"')
  })

  it("/product/sw 요약 앵커가 있고, 쇼룸 예약 폼 앵커가 있다", () => {
    expect(readSource("app/product/sw/page.tsx")).toContain('id="classin-software-summary"')
    expect(readSource("app/showroom/page.tsx")).toContain('id="booking"')
  })
})
