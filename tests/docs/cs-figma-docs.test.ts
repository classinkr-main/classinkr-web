import { describe, expect, it } from "vitest"

import { CS_FIGMA_GUIDES, sanitizeGuideStep } from "@/lib/cs-figma-guides"
import { getCsFigmaEnrichment } from "@/lib/cs-figma-enrichments"
import { buildCsFigmaDocArticle, getDocBySlug } from "@/lib/docs"

describe("CS Figma docs", () => {
  it("exposes generated digest guides with consumer-tone deep-dive sections", () => {
    const doc = getDocBySlug("cs-figma-digest-1195", "admin")

    expect(doc).toMatchObject({
      title: "코스 내 초대 활성화(QR, Link 등)",
      visibility: "unlisted",
      noindex: true,
    })
    // 단계별 사진이 붙은 문서라 합성 캡처를 글로 옮긴 "화면 기준 확인"은 빠지고, 캡처 작업 메모도 걸러진다.
    const headings = doc?.sections.map((section) => section.heading) ?? []
    expect(headings).toEqual(expect.arrayContaining(["순서대로 따라 하기", "주의사항과 참고"]))
    expect(headings).not.toContain("화면 기준 확인")
    const notes = doc?.sections.find((section) => section.heading === "주의사항과 참고")?.steps ?? []
    expect(notes.length).toBeGreaterThan(0)
    for (const note of notes) {
      expect(note).not.toMatch(/플레이스홀더|export|블러\s*처리|원본\s*이미지/)
    }
    expect(doc?.sections[0]?.steps).toEqual(
      expect.arrayContaining([
        expect.stringContaining("코스 가입 허용"),
      ])
    )
  })

  it("keeps the screen description for generated guides without step photos", () => {
    const guide = CS_FIGMA_GUIDES.find((item) => item.docSlug === "cs-figma-digest-1195")
    expect(guide).toBeTruthy()

    const doc = buildCsFigmaDocArticle({ ...guide!, docSlug: "cs-test-generated-without-step-photos" })
    expect(doc.sections.map((section) => section.heading)).toEqual(
      expect.arrayContaining(["순서대로 따라 하기", "화면 기준 확인", "주의사항과 안내 화면"])
    )
  })

  it("resolves every CS Figma guide into an unlisted noindex document", () => {
    for (const guide of CS_FIGMA_GUIDES) {
      const doc = getDocBySlug(guide.docSlug, guide.docCategory)
      const enrichment = getCsFigmaEnrichment(guide.docSlug)

      expect(doc, guide.docSlug).toMatchObject({
        title: enrichment?.title ?? guide.title,
        visibility: "unlisted",
        noindex: true,
      })

      // 소비자용 보강이 없는 가이드는 정리된 순서 단계를 그대로 노출한다.
      if (!enrichment) {
        const stepSection = doc?.sections.find(
          (section) => section.heading === "순서대로 따라 하기"
        )
        expect(stepSection?.steps, guide.docSlug).toEqual(
          guide.steps.map((step) => sanitizeGuideStep(step)).filter(Boolean)
        )
      }
    }
  })

  it("publishes current-board guides with the update date and no raw images", () => {
    const doc = getDocBySlug("cs-course-wide-chat-control", "admin")

    expect(doc).toMatchObject({
      title: "코스 전체 학생 채팅 활성화와 비활성화",
      updatedAt: "2026-09-24",
      visibility: "unlisted",
      noindex: true,
    })
    expect(doc?.sections.flatMap((section) => section.media ?? [])).toEqual([])
  })

  // 단계별로 가린 사진이 있는 가이드는 원본 합성 캡처를 붙이지 않으므로, 합성 캡처 첨부 규칙은
  // 사진 매핑이 없는 slug 로 바꾼 가이드로 확인한다.
  const fieldRecordingGuide = CS_FIGMA_GUIDES.find((item) => item.docSlug === "cs-field-recording-camera-setup")
  const unmappedGuide = fieldRecordingGuide
    ? { ...fieldRecordingGuide, docSlug: "cs-test-without-step-photos" }
    : undefined

  it("attaches matched capture images with consumer-tone alt text and no source filenames", () => {
    expect(unmappedGuide).toBeTruthy()

    const doc = buildCsFigmaDocArticle(unmappedGuide!, [
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-ifp.png",
    ])

    expect(doc.sections[0]?.media).toEqual([
      {
        type: "image",
        src: "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
        alt: "현장 녹화 카메라 설정 안내 화면",
        caption: "",
      },
      {
        type: "image",
        src: "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-ifp.png",
        alt: "현장 녹화 카메라 설정 안내 화면",
        caption: "",
      },
    ])
  })

  it("replaces raw captures with masked step photos when the guide has them", () => {
    for (const [slug, category] of [
      ["cs-field-recording-camera-setup", "teacher"],
      ["cs-web-live-create", "teacher"],
      ["cs-bulk-exam-upload", "teacher"],
      ["cs-recording-download-share", "admin"],
      ["cs-ai-disable-admin", "admin"],
    ] as const) {
      const srcs = getDocBySlug(slug, category)?.sections.flatMap((section) => section.media ?? []).map((item) => item.src) ?? []
      expect(srcs.length, slug).toBeGreaterThan(0)
      expect(srcs.every((src) => src.startsWith("/docs/files/guides/")), slug).toBe(true)
    }

    // 사진만 바뀌고 단계 본문은 그대로다.
    const bulkExamDoc = getDocBySlug("cs-bulk-exam-upload", "teacher")
    expect(bulkExamDoc?.sections[0]?.steps).toContain(
      "코스 화면에서 [새로 만들기]를 누르고 [시험]을 선택합니다."
    )
  })

  it("attaches only the linked images and never leaks source filenames into copy", () => {
    expect(unmappedGuide).toBeTruthy()

    const fullyLinkedDoc = buildCsFigmaDocArticle(unmappedGuide!, [
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-ifp.png",
    ])
    expect(fullyLinkedDoc.sections[0]?.media?.map((item) => item.src)).toEqual([
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-ifp.png",
    ])
    // 단계 카피에는 원본 캡처 파일명이나 피그마 표현이 노출되지 않는다.
    for (const step of fullyLinkedDoc.sections[0]?.steps ?? []) {
      expect(step).not.toMatch(/Figma|원본 캡처|\.png/i)
    }

    const partiallyLinkedDoc = buildCsFigmaDocArticle(unmappedGuide!, [
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
    ])
    expect(partiallyLinkedDoc.sections[0]?.media?.map((item) => item.src)).toEqual([
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
    ])
  })

  it("keeps staff-only captures and internal identifiers out of public CS docs and chatbot guides", () => {
    const staffOnly = ["cs-figma-digest-881", "cs-figma-digest-1402", "cs-figma-digest-1960", "cs-figma-digest-2017"]
    const guideSlugs = CS_FIGMA_GUIDES.map((guide) => guide.docSlug)
    for (const slug of staffOnly) expect(guideSlugs).not.toContain(slug)

    const leak =
      /EEO[-_ ]?TEST|EEO\d{4,}|Minjae|zhangsan|Classin_Hope|Wayne\s+Kim|학원[A-Z](?![A-Za-z])|CS\s*주의사항|내부 비밀번호 재설정|\p{Script=Han}/u
    for (const guide of CS_FIGMA_GUIDES) {
      const doc = buildCsFigmaDocArticle(guide)
      const visible = [
        doc.title,
        doc.description,
        doc.audience,
        doc.chatbotSummary,
        ...doc.keywords,
        ...doc.sections.flatMap((section) => [section.heading, section.body, ...(section.steps ?? [])]),
      ].join("\n")

      expect(visible, doc.slug).not.toMatch(leak)
      expect(doc.audience, doc.slug).not.toMatch(/(?<![A-Za-z])CS(?![A-Za-z])/)
      expect(doc.keywords.filter((keyword) => /\.(?:png|jpe?g|webp)$/i.test(keyword)), doc.slug).toEqual([])
    }
  })
})
