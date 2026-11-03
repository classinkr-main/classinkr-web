import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { ReactElement, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// Next 런타임이 없는 node 환경: 이미지·링크·Radix 모달(ToastProvider 필요)은 껍데기로 대신한다.
// priority 는 data-priority 로 드러내 '안 쓴다'를 검사할 수 있게 한다
vi.mock("next/image", () => ({
  default: ({ priority, ...rest }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- 테스트 목. alt 는 rest 로 넘어간다
    <img {...(rest as object)} data-priority={priority ? "true" : undefined} />
  ),
}))
vi.mock("next/link", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- prefetch 는 <a> 에 넘기지 않으려고 버린다
  default: ({ href, prefetch: _p, children, ...rest }: { href: string; prefetch?: boolean | null; children: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
vi.mock("@/components/sections/DemoModal", () => ({
  DemoModal: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import { HomeHero } from "@/components/home/HomeHero"
import { HomeProblem } from "@/components/home/HomeProblem"
import { HomeHow } from "@/components/home/HomeHow"
import { HomeProof } from "@/components/home/HomeProof"
import { HomePilotCta } from "@/components/home/HomePilotCta"
import { HOME_COPY } from "@/components/home/home-copy"

const html = (el: ReactElement) => renderToStaticMarkup(el)
const CHECKLIST = "/resources/academy-system-checklist"
const imgs = (h: string) => h.match(/<img[^>]*>/g) ?? []
const alts = (h: string) => imgs(h).map((tag) => tag.match(/alt="([^"]*)"/)?.[1] ?? "")

describe("홈 5화면", () => {
  it("히어로: H1·주 CTA 1회·진단지 링크·숫자 4개·전자칠판 이미지", () => {
    const h = html(<HomeHero />)
    expect(h).toContain("<h1")
    expect(h).toContain("학원의 시스템으로")
    expect(h.match(/파일럿 상담 신청/g)).toHaveLength(1)
    expect(h).toContain(`href="${CHECKLIST}#download"`)
    for (const v of ["3,000만+", "5,000만+", "6만+", "160+"]) expect(h).toContain(v)
    expect(imgs(h)).toHaveLength(1)
    expect(h).toContain('src="/images/hero-dashboard.webp"')
    expect(alts(h)).toEqual([HOME_COPY.hero.imageAlt])
    expect(h).toContain('loading="eager"')
    expect(h).not.toContain("priority")
  })

  it("작동 방식: 도판 3장(실제 캡처)·alt·링크 3개", () => {
    const h = html(<HomeHow />)
    expect(imgs(h)).toHaveLength(3)
    expect(alts(h).every((a) => a.trim().length > 0)).toBe(true)
    for (const step of ["before", "during", "after"]) expect(h).toContain(`src="/images/home/how-${step}.webp"`)
    for (const href of ["/product/sw", "/product/hw", "/product/ai-report"]) expect(h).toContain(`href="${href}"`)
  })

  it("증거: 사례 사진 3장·alt", () => {
    const h = html(<HomeProof />)
    expect(imgs(h)).toHaveLength(3)
    expect(alts(h).every((a) => a.trim().length > 0)).toBe(true)
  })

  it("5화면 어디에도 priority 이미지가 없다", () => {
    for (const Section of [HomeHero, HomeProblem, HomeHow, HomeProof, HomePilotCta]) {
      for (const tag of imgs(html(<Section />))) expect(tag).not.toContain("priority")
    }
  })

  it("카피: 화살표 문자 없음, 작동 방식 제목·본문에 숫자 없음", () => {
    expect(JSON.stringify(HOME_COPY)).not.toContain("→")
    for (const step of HOME_COPY.how.steps) {
      expect(step.title, step.title).not.toMatch(/\d/)
      expect(step.body, step.body).not.toMatch(/\d/)
    }
  })

  it.each([
    ["문제", HomeProblem, "강사가 바뀌면, 수업도 바뀝니다.", [CHECKLIST]],
    ["작동 방식", HomeHow, "도입하면 바로 달라지는 세 가지", ["/product/sw", "/product/hw", "/product/ai-report"]],
    ["증거", HomeProof, "먼저 바꾼 학원들", ["/blog"]],
  ] as const)("%s: H2 + 관문 링크", (_name, Section, heading, hrefs) => {
    const h = html(<Section />)
    expect(h).toContain("<h2")
    expect(h).toContain(heading)
    for (const href of hrefs) expect(h).toContain(`href="${href}"`)
  })

  it("파일럿: H2·주 CTA 1회·진단지·페이지 줄", () => {
    const h = html(<HomePilotCta />)
    expect(h).toContain("1개 교실, 90일 파일럿부터")
    expect(h.match(/파일럿 상담 신청/g)).toHaveLength(1)
    expect(h).toContain(`href="${CHECKLIST}#download"`)
    for (const href of ["/showroom", "/pricing", "/resources"]) expect(h).toContain(`href="${href}"`)
  })

  it("components/home 에 hex 리터럴이 없다", () => {
    const dir = join(process.cwd(), "components/home")
    for (const file of readdirSync(dir)) {
      expect(readFileSync(join(dir, file), "utf8"), file).not.toMatch(/#[0-9a-fA-F]{6}\b/)
    }
  })
})
