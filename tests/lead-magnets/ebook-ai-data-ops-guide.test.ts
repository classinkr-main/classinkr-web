// 1권 e-book 인쇄 원본 계약 — 렌더러(scripts/render-lead-magnet-workbook-pdf.mjs)가 전제하는 모양과
// 보이스 차터 §4 금지 표현을 소스 수준에서 잡는다. 실제 PDF 는 Chromium 이 있어야 하므로 여기선 HTML 만 본다.
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const SLUG = "academy-ai-data-ops-guide"
const html = readFileSync(path.join(process.cwd(), "scripts", "lead-magnet-ebooks", `${SLUG}.html`), "utf8")
const text = html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ")

describe("1권 e-book 인쇄 원본", () => {
  it("12쪽이고 글꼴 자리가 있다", () => {
    expect(html.match(/<section class="page/g) ?? []).toHaveLength(12)
    expect(html).toContain("/* FONT_CSS */")
    expect(html).toContain("@page{size:794px 1123px;margin:0}")
  })

  it("이미지는 public 상대 경로, 링크는 사이트 상대 경로만 쓴다", () => {
    for (const [, src] of html.matchAll(/src="([^"]+)"/g)) expect(src, src).toMatch(/^\//)
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) expect(href, href).toMatch(/^\/|^mailto:/)
    expect(html).not.toContain("file://")
    expect(html).not.toContain('<link rel="stylesheet"')
  })

  it("금지 표현과 미확인 약속이 없다", () => {
    for (const banned of ["점수표", "무조건", "완벽하게", "가장 싸", "집중도", "50회 무료 수업에 AI"]) {
      expect(text, banned).not.toContain(banned)
    }
    expect(text).not.toMatch(/\d+만\s?원/) // 가격 숫자 없음
  })

  it("핵심 블록이 다 들어 있다", () => {
    for (const must of ["챗봇인가 시스템인가", "돼요", "안 돼요", "표시해요", "출제 템플릿 1호", "운영 분석", "월말 보고 초안", "ClassIn에서는", "이름은 번호로", "망치는 다섯 가지", "강사가 찍고"]) {
      expect(text, must).toContain(must)
    }
    expect(text.match(/ClassIn에서는/g)!.length).toBeGreaterThanOrEqual(5)
  })
})
