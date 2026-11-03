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
import { HomeAcademies } from "@/components/home/HomeAcademies"
import { HomeGains } from "@/components/home/HomeGains"
import { HomeRoles } from "@/components/home/HomeRoles"
import { HomeProof } from "@/components/home/HomeProof"
import { HomeExplore } from "@/components/home/HomeExplore"
import { HomePilotCta } from "@/components/home/HomePilotCta"
import { HOME_COPY } from "@/components/home/home-copy"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"

const html = (el: ReactElement) => renderToStaticMarkup(el)
const CHECKLIST = "/resources/academy-system-checklist#download"
const SECTIONS = [HomeHero, HomeAcademies, HomeGains, HomeRoles, HomeProof, HomeExplore, HomePilotCta]
const all = (h: string, re: RegExp) => [...h.matchAll(re)].map((m) => m[0])
const count = (h: string, re: RegExp) => all(h, re).length
const imgs = (h: string) => all(h, /<img[^>]*>/g)
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
const hrefs = (h: string, list: readonly string[]) => {
  for (const href of list) expect(h, href).toContain(`href="${href}"`)
}

describe("홈", () => {
  it("히어로: H1 하나·주 CTA 1회·진단지·숫자 4개·전자칠판 컷아웃 1장(eager, priority 없음)", () => {
    const h = html(<HomeHero />)
    expect(count(h, /<h1[\s>]/g)).toBe(1)
    // 두 구절을 블록으로 나눠도 읽히는 문장은 heroHeadline 그대로(쉼표 뒤 공백 포함)
    expect(h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, "")).toBe(CLASSIN_POSITIONING.heroHeadline)
    expect(count(h, /파일럿 상담 신청/g)).toBe(1)
    hrefs(h, [CHECKLIST])
    for (const v of ["3,000만+", "5,000만+", "6만+", "160+"]) expect(h).toContain(v)
    const tags = imgs(h)
    expect(tags).toHaveLength(1)
    expect(attr(tags[0], "src")).toBe("/images/home/hero-board.webp")
    expect(attr(tags[0], "alt")).toBe(HOME_COPY.hero.image.alt)
    expect(attr(tags[0], "loading")).toBe("eager")
    expect(tags[0]).not.toContain("priority")
  })

  it("학원 띠: 34곳 목록 + aria-hidden 복제 한 벌 + 멈춤 버튼", () => {
    const h = html(<HomeAcademies />)
    const lists = all(h, /<ul[^>]*>[\s\S]*?<\/ul>/g)
    expect(lists).toHaveLength(2)
    const [visible, copy] = lists
    expect(visible).toContain(`aria-label="${HOME_COPY.academies.listLabel}"`)
    expect(visible).not.toContain("aria-hidden")
    expect(count(visible, /<li[\s>]/g)).toBe(34)
    for (const name of HOME_COPY.academies.names) expect(visible).toContain(`>${name}</li>`)
    expect(copy).toContain('aria-hidden="true"')
    expect(count(copy, /<li[\s>]/g)).toBe(34)
    expect(h).toMatch(/<button[^>]*aria-label="학원 목록 흐름 멈추기"/)
  })

  it("이득 3행: H2 하나·H3 셋·도판 3장·관문 링크·밑줄 강조 하나·창 그림자 둘", () => {
    const h = html(<HomeGains />)
    expect(count(h, /<h2[\s>]/g)).toBe(1)
    expect(h).toContain(HOME_COPY.gains.heading)
    expect(count(h, /<h3[\s>]/g)).toBe(3)
    const tags = imgs(h)
    expect(tags.map((t) => attr(t, "src"))).toEqual([
      "/images/home/board-class.webp",
      "/images/home/win-ai.webp",
      "/images/home/win-activity.webp",
    ])
    for (const t of tags) expect(attr(t, "alt")?.trim(), t).toBeTruthy()
    hrefs(h, ["/product/hw", "/product/ai-report", "/product/sw"])
    expect([...h.matchAll(/<span class="underline[^"]*">([^<]*)<\/span>/g)].map((m) => m[1])).toEqual(["저절로"])
    expect(count(h, /plate-window/g)).toBe(2)
  })

  it("역할: 실제 표(본문 4행)", () => {
    const h = html(<HomeRoles />)
    expect(h).toContain("<table")
    const body = h.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? ""
    expect(count(body, /<tr[\s>]/g)).toBe(4)
  })

  it("증거: 사례 사진 3장·alt·/blog", () => {
    const h = html(<HomeProof />)
    expect(h).toContain(HOME_COPY.proof.heading)
    const tags = imgs(h)
    expect(tags).toHaveLength(3)
    for (const t of tags) expect(attr(t, "alt")?.trim(), t).toBeTruthy()
    hrefs(h, ["/blog"])
  })

  it("둘러보기: 평문 링크 셋", () => {
    const h = html(<HomeExplore />)
    expect(h).toContain(HOME_COPY.explore.heading)
    hrefs(h, ["/resources", "/faq", "/docs"])
  })

  it("파일럿: 먹 지면·채움 버튼 없음·CTA 1회·진단지·페이지 줄·90일 없음", () => {
    const h = html(<HomePilotCta />)
    expect(h).toContain("surface-ink")
    expect(h).not.toContain("bg-fg-accent")
    expect(h).toContain(HOME_COPY.pilot.heading)
    expect(count(h, /파일럿 상담 신청/g)).toBe(1)
    hrefs(h, ["/showroom", "/pricing", "/resources", CHECKLIST])
    expect(h).not.toContain("90일")
  })

  it("어느 화면에도 priority 이미지가 없다", () => {
    for (const Section of SECTIONS) {
      for (const tag of imgs(html(<Section />))) expect(tag).not.toContain("priority")
    }
  })

  it("카피: 화살표 문자 없음, 이득 제목·본문·체크에 숫자 없음", () => {
    expect(JSON.stringify(HOME_COPY)).not.toContain("→")
    for (const row of HOME_COPY.gains.rows) {
      for (const text of [row.title, row.body, ...row.checks]) expect(text, text).not.toMatch(/\d/)
    }
  })

  it("components/home 에 hex 리터럴이 없다", () => {
    const dir = join(process.cwd(), "components/home")
    for (const file of readdirSync(dir)) {
      expect(readFileSync(join(dir, file), "utf8"), file).not.toMatch(/#[0-9a-fA-F]{6}\b/)
    }
  })
})
