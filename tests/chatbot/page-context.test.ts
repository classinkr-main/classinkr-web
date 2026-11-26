import { describe, expect, it } from "vitest"

import { resolvePageContext, mergeStarters } from "@/lib/chatbot/page-context"
import { TROUBLESHOOTING_DOCS } from "@/lib/docs-troubleshooting"

describe("resolvePageContext", () => {
  it("keeps beginner and support questions on the home page and includes a learner route", () => {
    const ctx = resolvePageContext("/")
    expect(ctx.key).toBe("home")
    expect(ctx.teaserEligible).toBe(true)
    expect(ctx.welcome).toContain("클래스인이 어떤 서비스인지")
    expect(ctx.welcome).toContain("AI 안내 챗봇")
    expect(ctx.starters).toContain("쇼룸 방문이 가능한가요?")
    expect(mergeStarters(ctx.starters, ["다른 추천 질문"], 4)).toEqual([
      "클래스인이 뭐예요?",
      "우리 학원에서는 어떻게 써요?",
      "사용 중 문제가 생겼어요",
      "아이가 수업에 어떻게 들어가요?",
    ])
  })

  it("matches product and docs by prefix", () => {
    expect(resolvePageContext("/product/hw").key).toBe("product")
    expect(resolvePageContext("/docs/getting-started/setup").key).toBe("docs")
    expect(resolvePageContext("/contact").key).toBe("contact")
  })

  it("falls back to a non-eligible default for unknown paths", () => {
    const ctx = resolvePageContext("/some/unknown/page")
    expect(ctx.key).toBe("default")
    expect(ctx.teaserEligible).toBe(false)
  })

  it("treats null pathname as default", () => {
    expect(resolvePageContext(null).key).toBe("default")
  })

  it("never itemizes a final price in teaser copy", () => {
    for (const path of ["/", "/product/hw", "/contact", "/docs/x"]) {
      expect(resolvePageContext(path).teaser).not.toMatch(/원\b|₩|\d{3,}/)
    }
  })
})

describe("mergeStarters", () => {
  it("puts page starters first, then fills with dynamic ones, deduped, capped", () => {
    const merged = mergeStarters(["A", "B"], ["B", "C", "D", "E"], 4)
    expect(merged).toEqual(["A", "B", "C", "D"])
  })

  it("drops empties and trims", () => {
    expect(mergeStarters([" A ", ""], ["A", "  "], 4)).toEqual(["A"])
  })
})

describe("home starters", () => {
  it("shows a plain-language intro chip first (the widget shows the first four)", () => {
    const starters = resolvePageContext("/").starters
    expect(starters[0]).toBe("클래스인이 뭐예요?")
    expect(starters.slice(0, 4).some((starter) => /EDB|LMS/.test(starter))).toBe(false)
  })
})

// 2026-11-25 CX-20: 경로·대상별 첫 화면 칩. 칩 문구는 이미 쓰던 것만 쓰고, 빈 환경 /api/chatbot/query 에서
// '찾지 못했어요'가 아닌 답이 나오는지 확인한 뒤 골랐다(위젯은 앞 4개만 보인다).
describe("경로·대상별 첫 칩", () => {
  const firstFour = (path: string) => resolvePageContext(path).starters.slice(0, 4)

  it("홈 앞 4개 안에 학생·학부모용 수업 들어가기 칩이 있다", () => {
    expect(firstFour("/")).toContain("아이가 수업에 어떻게 들어가요?")
  })

  it("따로 정하지 않은 곳(/faq·/about)의 첫 칩은 용어 없는 소개다", () => {
    for (const path of ["/faq", "/about"]) {
      const ctx = resolvePageContext(path)
      expect(ctx.key).toBe("default")
      expect(ctx.starters[0]).toBe("클래스인이 뭐예요? 쉽게 알려 주세요")
      expect(ctx.starters).not.toContain("수업 시스템 OS 관점으로 설명해 주세요")
    }
  })

  it("학생 문서는 원장용 칩 없이 수업 들어가기부터 보인다", () => {
    const ctx = resolvePageContext("/docs/student/course-join")
    expect(ctx.key).toBe("docs-student")
    expect(ctx.starters[0]).toBe("아이가 수업에 어떻게 들어가요?")
    expect(ctx.starters.some((starter) => starter.includes("우리 학원"))).toBe(false)
  })

  it("전자칠판·장비 문서는 칠판 칩을 보인다", () => {
    for (const path of ["/docs/hardware/board-overview", "/docs/board/webcam-cms-setup-t1-panorama"]) {
      const ctx = resolvePageContext(path)
      expect(ctx.key).toBe("docs-hardware")
      expect(ctx.starters).toContain("전자칠판 화면이 안 켜져요")
    }
  })

  it("공개 문제 해결 문서는 모두 문제 해결 칩(사람 연결 포함)을 보인다", () => {
    expect(TROUBLESHOOTING_DOCS.length).toBeGreaterThan(0)
    for (const doc of TROUBLESHOOTING_DOCS) {
      const ctx = resolvePageContext(`/docs/${doc.category}/${doc.slug}`)
      expect(ctx.key, `${doc.category}/${doc.slug}`).toBe("docs-troubleshooting")
      expect(ctx.starters).toContain("상담원 연결해 주세요")
    }
  })

  it("문서 하위 칩도 문서 티저·인텐트를 그대로 쓰고, 나머지 문서는 기존 문서 칩이다", () => {
    const docs = resolvePageContext("/docs/teacher/course-create")
    expect(docs.key).toBe("docs")
    for (const path of ["/docs/student/course-join", "/docs/hardware/board-overview", "/docs/start/camera-mic-troubleshooting"]) {
      const ctx = resolvePageContext(path)
      expect(ctx.teaser).toBe(docs.teaser)
      expect(ctx.intent).toBe("support")
      expect(ctx.teaserEligible).toBe(true)
      expect(ctx.starters.length).toBeGreaterThanOrEqual(4)
    }
    expect(resolvePageContext("/docs").key).toBe("docs")
    expect(resolvePageContext("/docs/search").key).toBe("docs")
  })
})
