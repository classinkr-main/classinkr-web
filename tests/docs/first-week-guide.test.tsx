import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import FirstWeekGuidePage from "@/app/docs/first-week/page"
import { docsCategories, listDocs } from "@/lib/docs"
import { getDocsContent } from "@/lib/docs-content"

vi.mock("@/lib/docs-content", () => ({ getDocsContent: vi.fn() }))

describe("첫 7일 가이드", () => {
  beforeEach(() => {
    vi.mocked(getDocsContent).mockResolvedValue({ categories: docsCategories, docs: listDocs() })
  })

  it("공개된 설치·수업·복습 가이드와 도움 경로를 연결한다", async () => {
    const html = renderToStaticMarkup(await FirstWeekGuidePage())
    expect(html).toContain("첫 7일, 설치부터 다시보기까지")
    expect(html).toContain('href="/docs/start/pc-install"')
    expect(html).toContain('href="/docs/admin/course-creation"')
    expect(html).toContain('href="/docs/student/class-join-replay"')
    expect(html).toContain('href="/contact"')
  })

  it("수업 한 바퀴(설치→준비→교실 점검→판서·녹화→다시보기→과제·데이터) 여정을 4단계에 담는다", async () => {
    const html = renderToStaticMarkup(await FirstWeekGuidePage())
    const journey = [
      "설치하고 로그인 확인하기",
      "기관·코스·구성원 준비하기",
      "수업 전 교실 점검하기",
      "첫 수업에서 판서하고 녹화하기",
      "다시보기로 복습 확인하기",
      "과제·시험을 열고 관리자 데이터 살펴보기",
    ]
    const positions = journey.map((step) => html.indexOf(step))
    expect(positions.every((pos) => pos >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    for (const day of ["DAY 1", "DAY 2–3", "DAY 4–5", "DAY 6–7"]) expect(html).toContain(day)
    expect(html).toContain('href="/docs/teacher/course-activities"')
    expect(html).toContain('href="/docs/admin/statistics-data"')
  })

  it("공개 목록에서 빠진 가이드는 링크하지 않는다", async () => {
    vi.mocked(getDocsContent).mockResolvedValue({
      categories: docsCategories,
      docs: listDocs().filter((doc) => doc.slug !== "pc-install"),
    })
    const html = renderToStaticMarkup(await FirstWeekGuidePage())
    expect(html).not.toContain('href="/docs/start/pc-install"')
    expect(html).toContain('href="/docs/start/mobile-install"')
  })
})
