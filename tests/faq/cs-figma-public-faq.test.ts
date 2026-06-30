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
