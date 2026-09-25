import { describe, expect, it } from "vitest"

import { buildCsFigmaMediaForGuide } from "@/lib/cs-figma-assets"
import {
  CS_FIGMA_GUIDES,
  CS_FIGMA_INTERNAL_GUIDES,
  CS_FIGMA_PUBLIC_GUIDES,
  isCsFigmaInternalGuide,
  sanitizeGuideStep,
} from "@/lib/cs-figma-guides"
import { CS_FIGMA_DIGEST_GUIDES } from "@/lib/cs-figma-guides.generated"
import { getCsFigmaEnrichment } from "@/lib/cs-figma-enrichments"
import { buildCsFigmaDocArticle, getDocBySlug, listDocs } from "@/lib/docs"

// 직원용 신호: 번역·사내 계정·캡처 검수 메모, 직원만 대상인 audience, 특정 학원 CS 대응 기록 제목.
// digest를 재생성해 새 항목이 이 신호에 걸리면 내부 목록이나 검토된 공개 목록 중 하나로 분류해야 한다.
const STAFF_ONLY_TEXT_PATTERN =
  /crowdin|크라우딘|번역\s*(담당|작업)|현지화|내부\s*(계정|비밀번호)|baiteda|univpn|빈\s*(프레임|이미지)/i
const STAFF_ONLY_AUDIENCE_PATTERN =
  /^(?:cs팀|cs\s*담당자|번역[^/]*|현지화[^/]*)(?:\s*\/\s*(?:cs팀|cs\s*담당자|번역[^/]*|현지화[^/]*))*$/i
const CUSTOMER_CASE_TITLE_PATTERN = /학원[A-Z]\b.*\bCS\b/

// 신호에 걸리지만 검토 후 공개로 둔 가이드.
const REVIEWED_PUBLIC_GUIDE_SLUGS = new Set([
  // digest 제목 줄바꿈으로 audience가 기본값(CS 담당자)이 됐을 뿐, 원문 대상은 기관 관리자다.
  "cs-figma-digest-940",
  // 공개 다운로드 페이지(classin.com/kr/download) 캡처.
  "cs-figma-digest-1679",
])

function hasStaffOnlySignal(guide: (typeof CS_FIGMA_DIGEST_GUIDES)[number]) {
  return (
    STAFF_ONLY_TEXT_PATTERN.test(`${guide.title} ${guide.audience} ${guide.summary}`) ||
    STAFF_ONLY_AUDIENCE_PATTERN.test(guide.audience.trim()) ||
    CUSTOMER_CASE_TITLE_PATTERN.test(guide.title)
  )
}

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

  it("resolves every public CS Figma guide into an unlisted noindex document", () => {
    for (const guide of CS_FIGMA_PUBLIC_GUIDES) {
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
      updatedAt: "2026-08-05",
      visibility: "unlisted",
      noindex: true,
    })
    expect(doc?.sections.flatMap((section) => section.media ?? [])).toEqual([])
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

describe("internal-only CS Figma guides", () => {
  it("pins each internal slug to its generated title so digest line shifts fail loudly", () => {
    for (const [slug, entry] of Object.entries(CS_FIGMA_INTERNAL_GUIDES)) {
      expect(CS_FIGMA_GUIDES.find((guide) => guide.slug === slug)?.title, slug).toBe(entry.title)
    }
  })

  it("keeps internal-only guides out of the public docs center", () => {
    const docSlugs = new Set(listDocs().map((doc) => doc.slug))
    const internalGuides = CS_FIGMA_GUIDES.filter(isCsFigmaInternalGuide)

    expect(internalGuides).toHaveLength(Object.keys(CS_FIGMA_INTERNAL_GUIDES).length)
    expect(CS_FIGMA_PUBLIC_GUIDES).toHaveLength(CS_FIGMA_GUIDES.length - internalGuides.length)
    for (const guide of internalGuides) {
      expect(getDocBySlug(guide.docSlug, guide.docCategory), guide.slug).toBeUndefined()
      expect(getDocBySlug(guide.docSlug), guide.slug).toBeUndefined()
      expect(docSlugs.has(guide.docSlug), guide.slug).toBe(false)
    }
    // 번역 담당자용 Crowdin 작업 화면 안내(EEO ClassIn Korean 워크스페이스)
    expect(getDocBySlug("cs-figma-digest-1988", "teacher")).toBeUndefined()
    expect(listDocs().some((doc) => /crowdin/i.test(`${doc.title} ${doc.description}`))).toBe(false)
  })

  it("ships no public capture images for internal-only guides", () => {
    for (const guide of CS_FIGMA_GUIDES.filter(isCsFigmaInternalGuide)) {
      expect(buildCsFigmaMediaForGuide(guide), guide.slug).toEqual([])
    }
  })

  it("classifies every generated guide that carries a staff-only signal", () => {
    const unclassified = CS_FIGMA_DIGEST_GUIDES.filter(hasStaffOnlySignal)
      .filter((guide) => !isCsFigmaInternalGuide(guide) && !REVIEWED_PUBLIC_GUIDE_SLUGS.has(guide.slug))
      .map((guide) => `${guide.slug} ${guide.title} (${guide.audience})`)

    expect(unclassified).toEqual([])
    for (const slug of Object.keys(CS_FIGMA_INTERNAL_GUIDES)) {
      const guide = CS_FIGMA_DIGEST_GUIDES.find((item) => item.slug === slug)
      expect(guide && hasStaffOnlySignal(guide), slug).toBe(true)
    }
  })
})
