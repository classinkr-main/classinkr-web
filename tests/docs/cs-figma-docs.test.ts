import { describe, expect, it } from "vitest"

import { CS_FIGMA_GUIDES } from "@/lib/cs-figma-guides"
import { buildCsFigmaDocArticle, getDocBySlug } from "@/lib/docs"

describe("CS Figma docs", () => {
  it("exposes generated Figma digest guides with 3-level deep-dive sections", () => {
    const doc = getDocBySlug("cs-figma-digest-1197", "admin")

    expect(doc).toMatchObject({
      title: "코스 내 초대 활성화(QR, Link 등)",
      visibility: "unlisted",
      noindex: true,
    })
    expect(doc?.sections.map((section) => section.heading)).toEqual(
      expect.arrayContaining([
        "Figma CS 캡처 기준",
        "순서별 안내",
        "1단계 — 순서 그대로 안내",
        "2단계 — 화면 기준 확인",
        "3단계 — CS 주의사항과 원본 캡처",
      ])
    )
    expect(doc?.sections[0]?.body).toContain("코스 내 초대 활성화(QR, Link 등)")
  })

  it("resolves every CS Figma guide into an unlisted noindex document", () => {
    for (const guide of CS_FIGMA_GUIDES) {
      const doc = getDocBySlug(guide.docSlug, guide.docCategory)
      const stepSection = doc?.sections.find((section) => section.heading === "순서별 안내")

      expect(doc, guide.docSlug).toMatchObject({
        title: guide.title,
        visibility: "unlisted",
        noindex: true,
      })
      expect(stepSection?.steps, guide.docSlug).toEqual(guide.steps)
    }
  })

  it("attaches matched Figma capture images to the generated guide document", () => {
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
        alt: "현장 녹화 카메라 설정 원본 캡처 - 12/17 실시간 수업 생성 ~ 현장 녹화 확인(PC).png",
        caption: "Figma 원본 캡처: 12/17 실시간 수업 생성 ~ 현장 녹화 확인(PC).png",
      },
      {
        type: "image",
        src: "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-ifp.png",
        alt: "현장 녹화 카메라 설정 원본 캡처 - 12/17 실시간 수업 생성 ~ 현장 녹화 확인(IFP).png",
        caption: "Figma 원본 캡처: 12/17 실시간 수업 생성 ~ 현장 녹화 확인(IFP).png",
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
      "필요한 Figma 원본 캡처 1개가 이 가이드에 모두 연결되어 있습니다."
    )
  })

  it("updates the Figma capture section copy based on linked image coverage", () => {
    const guide = CS_FIGMA_GUIDES.find((item) => item.docSlug === "cs-field-recording-camera-setup")
    expect(guide).toBeTruthy()

    const fullyLinkedDoc = buildCsFigmaDocArticle(guide!, [
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-ifp.png",
    ])
    expect(fullyLinkedDoc.sections[0]?.steps).toContain("필요한 Figma 원본 캡처 2개가 이 가이드에 모두 연결되어 있습니다.")
    expect(fullyLinkedDoc.sections[0]?.steps).not.toContain(
      "실제 이미지 파일은 아직 레포에 저장되어 있지 않으므로 현재는 원본 캡처 파일명을 함께 표시합니다."
    )

    const partiallyLinkedDoc = buildCsFigmaDocArticle(guide!, [
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
    ])
    expect(partiallyLinkedDoc.sections[0]?.steps).toContain(
      "아직 연결되지 않은 원본 캡처: 12/17 실시간 수업 생성 ~ 현장 녹화 확인(IFP).png"
    )
  })
})
