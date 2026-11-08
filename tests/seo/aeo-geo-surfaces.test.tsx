import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { buildDocMetaDescription, buildDocSeoTitle } from "@/app/docs/_utils"
import { FAQ } from "@/components/sections/FAQ"
import { AI_REPORT_QA } from "@/lib/ai-report-content"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import { buildLlmsTxt } from "@/lib/llms-txt"
import { PRODUCT_SW_FAQS } from "@/lib/product-sw-faq"
import { buildPublicEventMetaDescription } from "@/lib/public-event-dates"
import { PUBLIC_FAQ_CATEGORIES, getPublicFaqItems } from "@/lib/public-faq"
import { SITE_URL } from "@/lib/seo"

// React 는 텍스트의 따옴표·꺾쇠를 엔티티로 바꾸므로 비교 전에 같은 규칙으로 맞춘다.
function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;")
}

describe("/faq 답변이 서버 HTML 에 실린다 (AEO)", () => {
  const html = renderToStaticMarkup(<FAQ />)

  it("세 탭의 모든 질문과 답변이 첫 HTML 에 있다", () => {
    for (const item of getPublicFaqItems()) {
      expect(html, item.id).toContain(escapeHtml(item.question))
      expect(html, item.id).toContain(escapeHtml(item.answer))
    }
  })

  it("질문마다 /faq#<id> 로 걸 수 있는 고유 앵커가 있다", () => {
    const ids = getPublicFaqItems().map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/)
      expect(html).toContain(`id="${id}"`)
    }
  })
})

describe("llms.txt", () => {
  const text = buildLlmsTxt()

  it("정본 도메인으로만 링크하고 옛 도메인 링크가 없다", () => {
    expect(text).toContain(`](${SITE_URL}/product/sw)`)
    expect(text).not.toMatch(/\]\(https?:\/\/classin\.ai\.kr/)
  })

  it("포지셔닝 정본 문장과 공개 FAQ 전부를 질문 단위 출처와 함께 싣는다", () => {
    expect(text).toContain(CLASSIN_POSITIONING.oneLine)
    expect(text).toContain(CLASSIN_POSITIONING.honestLimit)
    for (const category of PUBLIC_FAQ_CATEGORIES) {
      for (const item of category.items) {
        expect(text).toContain(`### ${item.question}`)
        expect(text).toContain(`${SITE_URL}/faq#${item.id}`)
      }
    }
  })

  it("회사 수치는 EEO 공식 기준 출처를 같은 줄에 단다", () => {
    const line = text.split("\n").find((row) => row.includes("5,000만+"))
    expect(line).toContain("EEO 공식 소개 기준")
    expect(line).toContain("https://www.classin.com/")
  })
})

describe("/product/sw FAQ 정본 문구", () => {
  it("근거 없는 단정(LMS 제품명·다운로드 차단·워터마크·소유권·무료 체험 기간)을 싣지 않는다", () => {
    const all = PRODUCT_SW_FAQS.map(({ q, a }) => `${q} ${a}`).join("\n")
    for (const banned of ["Google Classroom", "Canvas", "Moodle", "워터마크", "다운로드를 차단", "저작권", "2주 무료"]) {
      expect(all).not.toContain(banned)
    }
    expect(all).toContain(CLASSIN_POSITIONING.comparisonPoints[0].point)
  })
})

describe("/product/ai-report Q&A 정본 문구", () => {
  it("녹화 다운로드 차단·앱 전용·저작권 귀속을 늘 그런 것처럼 단정하지 않는다", () => {
    const all = AI_REPORT_QA.map(({ question, answer }) => `${question} ${answer}`).join("\n")
    for (const banned of ["외부 다운로드", "다운로드가 차단", "앱 내 재생만", "저작권은"]) {
      expect(all).not.toContain(banned)
    }
    expect(all).toContain("관리자 권한과 계약 범위")
  })
})

describe("buildDocSeoTitle", () => {
  it.each([
    ["클래스인 프로필 설정 | ClassIn 가이드", "교사 가이드", "클래스인 프로필 설정 — 교사 가이드 | Classin"],
    ["클래스인 프로필 설정 | ClassIn 가이드", "학생 가이드", "클래스인 프로필 설정 — 학생 가이드 | Classin"],
    ["코스 개설 | Classin 가이드 | Classin", "관리자 가이드", "코스 개설 — 관리자 가이드 | Classin"],
    ["녹화 설정 - 클래스인", "교사 가이드", "녹화 설정 — 교사 가이드 | Classin"],
    ["Classin 6.0.8 업데이트 안내", "업데이트", "Classin 6.0.8 업데이트 안내 — 업데이트 | Classin"],
  ])("%j (%s) → %j", (seoTitle, category, expected) => {
    expect(buildDocSeoTitle({ title: "무시됨", seoTitle }, category)).toBe(expected)
  })

  it("검색 제목이 없으면 문서명, 카테고리를 모르면 가이드 접미사로 끝낸다", () => {
    expect(buildDocSeoTitle({ title: "QR 초대" })).toBe("QR 초대 | Classin 가이드")
  })
})

describe("buildDocMetaDescription", () => {
  it("짧은 설명은 문서 요약으로 채우고, 충분히 긴 설명은 그대로 둔다", () => {
    const summary = "6.0.8 에서 달라진 칠판 도구와 녹화 설정, 학원 운영자가 업데이트 뒤 확인할 항목을 정리했습니다."
    expect(buildDocMetaDescription({ description: "클래스인 6.0.8 업데이트", chatbotSummary: summary })).toBe(summary)
    const long = "원장님과 운영팀이 반복 업무를 안정적으로 처리하는 방법을 화면 순서대로 정리한 운영 가이드입니다."
    expect(buildDocMetaDescription({ description: long, chatbotSummary: summary })).toBe(long)
  })
})

describe("buildPublicEventMetaDescription", () => {
  const base = {
    title: "Classin Meets July",
    startsAt: "2026-07-08T05:00:00.000Z",
    endsAt: "2026-07-08T07:00:00.000Z",
    sessionDates: null,
    location: "목동 쇼룸",
  }

  it("설명이 없으면 제목·일정·장소로 문장을 만든다", () => {
    const text = buildPublicEventMetaDescription({ ...base, description: null })
    expect(text).toContain("Classin Meets July")
    expect(text).toContain("목동 쇼룸")
    expect(text).toContain("2026")
    expect(text.length).toBeGreaterThanOrEqual(40)
  })

  it("충분히 긴 설명은 손대지 않는다", () => {
    const description = "7월 Classin Meets 에서는 녹화와 AI 리포트로 수업 품질을 관리하는 학원 사례를 함께 봅니다."
    expect(buildPublicEventMetaDescription({ ...base, description })).toBe(description)
  })
})
