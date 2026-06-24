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
    expect(doc?.sections.map((section) => section.heading)).toEqual(
      expect.arrayContaining([
        "순서대로 따라 하기",
        "화면 기준 확인",
        "CS 주의사항과 안내 화면",
      ])
    )
    expect(doc?.sections[0]?.steps).toEqual(
      expect.arrayContaining([
        expect.stringContaining("코스 가입 허용"),
      ])
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

  it("attaches matched capture images with consumer-tone alt text and no source filenames", () => {
    const guide = CS_FIGMA_GUIDES.find((item) => item.docSlug === "cs-field-recording-camera-setup")
    expect(guide).toBeTruthy()

    const doc = buildCsFigmaDocArticle(guide!, [
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

  it("uses the imported asset manifest when resolving live guide documents", () => {
    const fieldRecordingDoc = getDocBySlug("cs-field-recording-camera-setup", "teacher")
    const webLiveDoc = getDocBySlug("cs-web-live-create", "teacher")
    const bulkExamDoc = getDocBySlug("cs-bulk-exam-upload", "teacher")

    expect(fieldRecordingDoc?.sections[0]?.media?.map((item) => item.src)).toEqual(
      expect.arrayContaining([
        "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
        "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-ifp.png",
      ])
    )
    expect(webLiveDoc?.sections[0]?.media?.map((item) => item.src)).toEqual(
      expect.arrayContaining([
        "/docs/files/cs-figma/웹-라이브-생성-방법-앱.png",
        "/docs/files/cs-figma/웹-라이브-생성-방법-대시보드.png",
      ])
    )
    expect(bulkExamDoc?.sections[0]?.media?.map((item) => item.src)).toEqual([
      "/docs/files/cs-figma/문제-은행-가이드.png",
    ])
    expect(bulkExamDoc?.sections[0]?.steps).toContain(
      "코스 화면에서 새로 만들기를 누르고 시험을 선택합니다."
    )
  })

  it("attaches only the linked images and never leaks source filenames into copy", () => {
    const guide = CS_FIGMA_GUIDES.find((item) => item.docSlug === "cs-field-recording-camera-setup")
    expect(guide).toBeTruthy()

    const fullyLinkedDoc = buildCsFigmaDocArticle(guide!, [
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

    const partiallyLinkedDoc = buildCsFigmaDocArticle(guide!, [
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
    ])
    expect(partiallyLinkedDoc.sections[0]?.media?.map((item) => item.src)).toEqual([
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
    ])
  })
})
