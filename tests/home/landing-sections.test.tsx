import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { ReactElement, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// Next 런타임이 없는 node 환경: 이미지·링크·Radix 모달(ToastProvider 필요)은 껍데기로 대신한다
vi.mock("next/image", () => ({
  default: ({ priority: _p, loading: _l, ...rest }: Record<string, unknown>) => <img {...(rest as object)} />,
}))
vi.mock("next/link", () => ({
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

const html = (el: ReactElement) => renderToStaticMarkup(el)
const CHECKLIST = "/resources/academy-system-checklist"

describe("홈 5화면", () => {
  it("히어로: H1·주 CTA 1회·진단지 링크·숫자 4개·제품 이미지", () => {
    const h = html(<HomeHero />)
    expect(h).toContain("<h1")
    expect(h).toContain("학원의 시스템으로")
    expect(h.match(/파일럿 상담 신청/g)).toHaveLength(1)
    expect(h).toContain(`href="${CHECKLIST}#download"`)
    for (const v of ["3,000만+", "5,000만+", "6만+", "160+"]) expect(h).toContain(v)
    expect(h).toContain('src="/images/hero-dashboard.webp"')
    expect(h).not.toContain("priority")
  })

  it.each([
    ["문제", HomeProblem, "강사가 바뀌면, 수업도 바뀝니다.", [CHECKLIST]],
    ["작동 방식", HomeHow, "수업 전·중·후를 하나의 흐름으로", ["/product/sw", "/product/hw", "/product/ai-report"]],
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
