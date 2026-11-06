import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// node 환경: 이미지·링크·Radix 모달은 껍데기로 대신한다(tests/home/landing-sections.test.tsx 와 같은 목)
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

import RecordingPage from "@/app/product/recording/page"
import { RECORDING_COPY } from "@/components/recording/recording-copy"

const h = renderToStaticMarkup(<RecordingPage />)
const imgs = [...h.matchAll(/<img[^>]*>/g)].map((m) => m[0])
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]

describe("녹화 수업 랜딩", () => {
  it("H1 하나가 한 문장으로 읽힌다", () => {
    expect(h.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, "")).toBe("수업만 하면, 녹화는 저절로 남습니다")
  })

  it("도판 4장(실제 캡처 3 + 카메라)·alt 있음·priority 없음, 창 그림자는 캡처 3장에만", () => {
    expect(imgs.map((t) => attr(t, "src"))).toEqual([
      "/images/product/recording/playback.webp",
      "/images/product/recording/camera-on-board.webp",
      "/images/product/recording/lesson-list.webp",
      "/images/product/recording/watch-data.webp",
    ])
    for (const t of imgs) {
      expect(attr(t, "alt")?.trim(), t).toBeTruthy()
      expect(t).not.toContain("data-priority")
    }
    expect(imgs.filter((t) => t.includes("plate-window"))).toHaveLength(3)
  })

  it("전자칠판·AI 강의 평가·진단지로 잇고, 상담 버튼은 히어로와 파일럿 띠에 하나씩", () => {
    for (const href of ["/product/hw", "/product/ai-report", "/resources/academy-system-checklist#download"]) {
      expect(h, href).toContain(`href="${href}"`)
    }
    expect(h.match(/파일럿 상담 신청/g)).toHaveLength(2)
  })

  it("다운로드 차단·워터마크를 '항상'으로 단정하지 않는다(관리자 설정·계약 범위에 따라 다름)", () => {
    const copy = JSON.stringify(RECORDING_COPY)
    expect(copy).not.toMatch(/다운로드 (?:차단|금지|불가)|항상/)
    expect(h).toContain(RECORDING_COPY.control.note)
  })
})
