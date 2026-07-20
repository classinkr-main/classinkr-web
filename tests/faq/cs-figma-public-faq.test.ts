import { describe, expect, it } from "vitest"

import { getCsFigmaAssetRequirements } from "@/lib/cs-figma-assets"
import { CS_FIGMA_GUIDES } from "@/lib/cs-figma-guides"
import { getDocBySlug } from "@/lib/docs"
import { PUBLIC_FAQ_CATEGORIES, getPublicFaqItems } from "@/lib/public-faq"

describe("public FAQ CS Figma usage entries", () => {
  it("surfaces Figma-derived usage questions in a dedicated category", () => {
    const usageCategory = PUBLIC_FAQ_CATEGORIES.find((category) => category.key === "usage")

    expect(usageCategory).toMatchObject({
      label: "사용법",
      eyebrow: "CS Guide FAQ",
    })
    expect(usageCategory?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          question: "현장 녹화 카메라는 어떤 순서로 설정하나요?",
          answer: expect.stringContaining("1V0"),
          guideHref: "/docs/teacher/cs-field-recording-camera-setup",
        }),
        expect.objectContaining({
          question: "코스 QR 초대 링크는 어디서 활성화하나요?",
          answer: expect.stringContaining("코스 가입 허용"),
          // 실제 가이드 슬러그는 digest 1195번 항목("코스 내 초대 활성화(QR, Link 등)").
          // 1197은 어떤 가이드에도 없는 dead 링크였음(소스/테스트 동시 오타).
          guideHref: "/docs/admin/cs-figma-digest-1195",
        }),
      ])
    )
  })

  it("includes usage entries in FAQ JSON-LD source items", () => {
    const questions = getPublicFaqItems().map((item) => item.question)

    expect(questions).toContain("현장 녹화 카메라는 어떤 순서로 설정하나요?")
    expect(questions).toContain("코스 QR 초대 링크는 어디서 활성화하나요?")
  })

  it("resolves every usage guide link to a CS Figma document", () => {
    const usageCategory = PUBLIC_FAQ_CATEGORIES.find((category) => category.key === "usage")
    const usageGuideHrefs = usageCategory?.items.flatMap((item) => item.guideHref ?? []) ?? []

    expect(usageGuideHrefs.length).toBeGreaterThan(0)
    for (const href of usageGuideHrefs) {
      const match = href.match(/^\/docs\/([^/]+)\/([^/]+)$/)
      const category = match?.[1] as Parameters<typeof getDocBySlug>[1]
      const slug = match?.[2] ?? ""

      expect(match, href).not.toBeNull()
      expect(getDocBySlug(slug, category), href).toMatchObject({
        visibility: "unlisted",
        noindex: true,
      })
    }
  })

  it("tracks required Figma captures for every public usage guide", () => {
    const requirements = getCsFigmaAssetRequirements(CS_FIGMA_GUIDES)
    const usageCategory = PUBLIC_FAQ_CATEGORIES.find((category) => category.key === "usage")
    const usageGuideHrefs = usageCategory?.items.flatMap((item) => item.guideHref ?? []) ?? []

    for (const href of usageGuideHrefs) {
      const requiredAssets = requirements.filter((item) => item.docPaths.includes(href))

      expect(requiredAssets.length, href).toBeGreaterThan(0)
      for (const item of requiredAssets) {
        expect(item.expectedPublicPath, href).toMatch(/^\/docs\/files\/cs-figma\/.+\.(png|jpe?g|webp|gif|avif)$/i)
      }
    }
  })
})

describe("public FAQ claim boundaries", () => {
  it("does not promise security, integrations, installation, or A/S without verification", () => {
    const items = getPublicFaqItems()
    const byQuestion = (question: string) =>
      items.find((item) => item.question === question)?.answer ?? ""

    expect(byQuestion("기존 시스템과 연동되나요?")).toContain("확인한 뒤")
    expect(byQuestion("기존 시스템과 연동되나요?")).not.toMatch(/^가능합니다/)

    expect(byQuestion("학원의 콘텐츠와 학생 데이터는 안전한가요?")).toContain(
      "개인정보 처리방침"
    )
    expect(byQuestion("학원의 콘텐츠와 학생 데이터는 안전한가요?")).not.toMatch(
      /모든 정보.*암호화|안전하게 보호/
    )

    expect(byQuestion("기존 칠판이나 빔프로젝터를 쓰던 교실에도 설치할 수 있나요?")).toContain(
      "현장 확인 전 확정할 수 없습니다"
    )
    expect(byQuestion("도입 후 A/S와 운영 지원은 어떻게 진행되나요?")).toContain(
      "계약에 따라"
    )
    expect(byQuestion("도입 후 A/S와 운영 지원은 어떻게 진행되나요?")).not.toContain(
      "출장 A/S까지 연결합니다"
    )
  })

  it("keeps pricing composition aligned with the public pricing policy", () => {
    const pricing = getPublicFaqItems().find(
      (item) => item.question === "요금 체계는 어떻게 되나요?"
    )?.answer

    expect(pricing).toContain("최신 견적과 계약")
    expect(pricing).not.toMatch(/전자칠판\s*\+\s*OPS|OPS와 기본 스펙/)
  })
})
