import { describe, expect, it } from "vitest"

import { CS_FIGMA_DIGEST_GUIDES } from "@/lib/cs-figma-guides.generated"
import { CS_FIGMA_GUIDES, INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS, type CsFigmaGuide } from "@/lib/cs-figma-guides"
import {
  evaluateDigestGuide,
  evaluateDigestPublishGate,
  summarizeDigestGate,
} from "@/lib/docs-gate/digest-publish-gate"

const guides = CS_FIGMA_DIGEST_GUIDES as readonly CsFigmaGuide[]

function base(overrides: Partial<CsFigmaGuide> = {}): CsFigmaGuide {
  return {
    slug: "x",
    docSlug: "x",
    docCategory: "teacher",
    category: "classroom",
    title: "판서 생성 & 불러오기",
    audience: "교사",
    summary: "판서를 만들고 불러오는 순서입니다.",
    keywords: [],
    steps: ["판서 도구를 엽니다."],
    deepDive: [],
    sourceImageFiles: [],
    sourceDigestLineHint: "",
    ...overrides,
  }
}

describe("digest 공개 게이트 (초안)", () => {
  it("테스트·임시 제목, 빈 이미지, 날짜 공지, 질문형 제목을 제외 후보로 잡는다", () => {
    expect(evaluateDigestGuide(base({ title: "테스트" })).exclude).toContain("test_title")
    expect(evaluateDigestGuide(base({ title: "임시 수업 가이드" })).exclude).toContain("test_title")
    expect(evaluateDigestGuide(base({ title: "(빈 이미지 — 내용 없음)" })).exclude).toContain("empty_capture")
    expect(evaluateDigestGuide(base({ title: "전자칠판 에러 안내 ~4/23" })).exclude).toContain("dated_title")
    expect(evaluateDigestGuide(base({ title: "6/16 (화) 따라읽기" })).exclude).toContain("dated_title")
    expect(evaluateDigestGuide(base({ title: "Q : 1문단의 흐름이 어떻게 진행되나요?" })).exclude).toContain("non_guide_title")
    expect(evaluateDigestGuide(base({ title: "Crowdin UI 가이드" })).exclude).toContain("internal_tool")
    expect(evaluateDigestGuide(base({ steps: [] })).exclude).toContain("screen_only")
  })

  it("정상 가이드는 제외하지 않는다", () => {
    expect(evaluateDigestGuide(base()).exclude).toEqual([])
    expect(evaluateDigestGuide(base({ title: "Windows용 클래스인" })).exclude).toEqual([])
  })

  it("원본 캡처 섹션·캡처 주석·생성 오타는 문서를 남기고 섹션 수정 대상으로 표시한다", () => {
    const result = evaluateDigestGuide(
      base({
        steps: ["\"등록\"을 클릭해 주세요요합니다."],
        deepDive: [
          { level: "2단계", title: "화면 기준 확인", body: "스텝 1: 대시보드 화면. 코스 카드가 빨간 박스로 강조됨.", checks: [] },
          { level: "3단계", title: "CS 주의사항과 원본 캡처", body: "원본 캡처: Frame 30.png", checks: [] },
        ],
      })
    )
    expect(result.exclude).toEqual([])
    expect(result.sectionFixes).toEqual(["raw_capture_section", "capture_annotation", "typo"])
  })

  it("같은 제목은 처음 것을 대표로 두고 뒤의 것을 통합 후보로 표시한다", () => {
    const results = evaluateDigestPublishGate([
      base({ docSlug: "a", title: "코스 설정" }),
      base({ docSlug: "b", title: "코스 설정" }),
      base({ docSlug: "c", title: "Windows용 클래스인 (다운로드 | 클래스인)" }),
      base({ docSlug: "d", title: "Windows용 클래스인 (다운로드 | 클래스인)" }),
      base({ docSlug: "e", title: "클래스인 코스 입장 ~ 현장 녹화 확인 (IFP)" }),
      base({ docSlug: "f", title: "클래스인 코스 입장 ~ 현장 녹화 확인 (PC)" }),
    ])
    // 괄호 속 기기 구분(IFP/PC)이 다르면 별개 문서로 본다.
    expect(results.map((r) => r.duplicateOf ?? null)).toEqual([null, "a", null, "c", null, null])
  })

  it("실제 107편: 알려진 테스트 문서를 잡고, 기존 INTERNAL_ONLY 를 그대로 반영한다", () => {
    const results = evaluateDigestPublishGate(guides, { internalOnly: INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS })
    const bySlug = new Map(results.map((r) => [r.slug, r]))
    expect(results).toHaveLength(guides.length)
    expect(bySlug.get("cs-figma-digest-91")?.exclude).toContain("test_title")
    expect(bySlug.get("cs-figma-digest-426")?.exclude).toContain("test_title")
    expect(bySlug.get("cs-figma-digest-1535")?.exclude).toContain("dated_title")
    for (const slug of INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS) expect(bySlug.get(slug)?.exclude).toContain("internal_only")
    const summary = summarizeDigestGate(results)
    expect(summary.publishable + summary.excludeCandidates).toBe(guides.length)
    expect(summary.fixCounts.raw_capture_section).toBe(guides.length)
  })

  it("초안 단계: 게이트는 아직 공개 목록에 연결하지 않는다 (기존 INTERNAL_ONLY 제외만 적용)", () => {
    const publicDigestCount = CS_FIGMA_GUIDES.filter((g) => g.slug.startsWith("cs-figma-digest-")).length
    expect(publicDigestCount).toBe(guides.length - INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS.size)
  })
})
