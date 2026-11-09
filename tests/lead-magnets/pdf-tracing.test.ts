// next.config.ts outputFileTracingIncludes — 런타임에 fs 로 읽는 PDF 글꼴이 두 라우트 번들에 들어가는가.
// 글꼴 목록 정본은 lib/lead-magnet-pdf/fonts.ts, next.config.ts 는 복제본이다.
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  LEAD_MAGNET_PDF_FONT_DIR,
  LEAD_MAGNET_PDF_FONT_FILES,
  leadMagnetPdfFontPath,
  type LeadMagnetPdfFontWeight,
} from "@/lib/lead-magnet-pdf/fonts"
import nextConfig from "@/next.config"

// Next 빌드(collect-build-traces)와 같은 매처·옵션으로 라우트 경로를 맞춘다.
const picomatch = createRequire(import.meta.url)("next/dist/compiled/picomatch") as (
  glob: string,
  options: { dot: boolean; contains: boolean }
) => (value: string) => boolean

function includesFor(route: string) {
  const includes = nextConfig.outputFileTracingIncludes ?? {}
  return Object.entries(includes)
    .filter(([glob]) => picomatch(glob, { dot: true, contains: true })(route))
    .flatMap(([, files]) => files)
}

const FONT_PATHS = Object.values(LEAD_MAGNET_PDF_FONT_FILES).map((file) => `./${LEAD_MAGNET_PDF_FONT_DIR}/${file}`)
const PDF_ROUTES = ["/api/materials/[slug]/pdf", "/api/admin/lead-magnets/pdf-preview"]

describe("리드마그넷 PDF 글꼴 트레이싱", () => {
  it("글꼴 파일이 실제로 있다", () => {
    for (const fontPath of FONT_PATHS) expect(existsSync(path.join(process.cwd(), fontPath)), fontPath).toBe(true)
  })

  it.each(PDF_ROUTES)("%s 번들에 글꼴 전부가 들어간다", (route) => {
    expect(existsSync(path.join(process.cwd(), "app", route, "route.ts")), `app${route}/route.ts`).toBe(true)
    const includes = includesFor(route)
    for (const fontPath of FONT_PATHS) expect(includes).toContain(fontPath)
  })

  it("공개 라우트는 폴백 확인용 예전 생성본도 넣는다", () => {
    expect(includesFor("/api/materials/[slug]/pdf")).toContain("./public/materials/lead-magnets/*.pdf")
  })

  it("다른 자료 라우트(다운로드)에는 글꼴을 싣지 않는다", () => {
    expect(includesFor("/api/materials/[slug]/download")).toEqual([])
    expect(includesFor("/api/admin/lead-magnets/[slug]")).toEqual([])
  })
})

// vitest 는 @pdf-lib/fontkit 의 UMD main 을 읽어 `import * as` 도 통과하지만, Next(Turbopack)는
// package.json "module"(dist/fontkit.es.js — default export 하나뿐)을 읽어 컴파일이 깨진다(2026-11-04 실측).
describe("@pdf-lib/fontkit import 모양", () => {
  it("ES 진입점은 default export 하나뿐이다", () => {
    const esEntry = readFileSync(path.join(process.cwd(), "node_modules/@pdf-lib/fontkit/dist/fontkit.es.js"), "utf8")
    expect(esEntry).toMatch(/^export default fontkit;$/m)
    expect(esEntry).not.toMatch(/^export (?:function|const|\{)/m)
  })

  it("렌더러는 default import 로 읽는다", () => {
    const source = readFileSync(path.join(process.cwd(), "lib/lead-magnet-pdf/fonts.ts"), "utf8")
    expect(source).toMatch(/^import fontkit from "@pdf-lib\/fontkit"$/m)
    expect(source).not.toMatch(/import \* as \w+ from "@pdf-lib\/fontkit"/)
  })
})

// 함수 번들 크기(Vercel 상한 250MB) — 2026-11-04 next build 실측:
//   fs 경로를 디렉터리 + 변수로 조립했을 때 공개 PDF 라우트 399MB(public/ 전체), 글꼴 25MB(TTF 9개).
//   리터럴 글꼴 경로 + public 조회의 turbopackIgnore 로 15.6MB / 미리보기 8.7MB.
describe("PDF 라우트 번들 크기 가드", () => {
  it.each(Object.keys(LEAD_MAGNET_PDF_FONT_FILES) as LeadMagnetPdfFontWeight[])(
    "%s 글꼴 리터럴 경로가 파일 목록과 같다",
    (weight) => {
      expect(leadMagnetPdfFontPath(weight)).toBe(
        path.join(process.cwd(), LEAD_MAGNET_PDF_FONT_DIR, LEAD_MAGNET_PDF_FONT_FILES[weight])
      )
    }
  )

  it("글꼴은 리터럴 경로로만 읽는다(디렉터리 + 변수 조립 금지)", () => {
    const source = readFileSync(path.join(process.cwd(), "lib/lead-magnet-pdf/fonts.ts"), "utf8")
    expect(source).toMatch(/readFile\(leadMagnetPdfFontPath\(weight\)\)/)
    expect(source).not.toMatch(/path\.join\([^)]*LEAD_MAGNET_PDF_FONT_DIR/)
  })

  it("공개 라우트의 정적본 조회는 public/ 전체를 추적하지 않는다", () => {
    const source = readFileSync(path.join(process.cwd(), "app/api/materials/[slug]/pdf/route.ts"), "utf8")
    expect(source).toMatch(/access\(path\.join\(\/\* turbopackIgnore: true \*\/ process\.cwd\(\), "public", publicPath\)\)/)
  })
})
