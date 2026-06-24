import { describe, expect, it } from "vitest"

import {
  CS_FIGMA_ASSET_PATHS,
  buildCsFigmaMediaForGuide,
  buildCsFigmaAssetImportPlan,
  findMissingCsFigmaAssetLabels,
  getCsFigmaAssetRequirements,
  normalizeCsFigmaAssetKey,
  normalizeCsFigmaAssetPathKeys,
  suggestCsFigmaAssetPath,
} from "@/lib/cs-figma-assets"
import { CS_FIGMA_GUIDES } from "@/lib/cs-figma-guides"

describe("CS Figma asset resolver", () => {
  it("matches Figma source filenames to safe public image paths", () => {
    const guide = CS_FIGMA_GUIDES.find((item) => item.docSlug === "cs-field-recording-camera-setup")
    expect(guide).toBeTruthy()

    const media = buildCsFigmaMediaForGuide(guide!, [
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
    ])

    expect(media).toEqual([
      {
        type: "image",
        src: "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
        alt: "현장 녹화 카메라 설정 안내 화면",
        caption: "",
      },
    ])
  })

  it("normalizes Korean labels, separators, and extensions into stable asset keys", () => {
    expect(normalizeCsFigmaAssetKey("12/17 실시간 수업 생성 ~ 현장 녹화 확인(PC).png")).toBe(
      "12 17 실시간 수업 생성 현장 녹화 확인 pc"
    )
    expect(normalizeCsFigmaAssetKey("12-17-실시간-수업-생성-현장-녹화-확인-pc.png")).toBe(
      "12 17 실시간 수업 생성 현장 녹화 확인 pc"
    )
  })

  it("normalizes public paths and export suffixes into source asset keys", () => {
    expect(
      normalizeCsFigmaAssetPathKeys(
        "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc@2x.png"
      )
    ).toContain("12 17 실시간 수업 생성 현장 녹화 확인 pc")
  })

  it("matches nested Figma export folders and common source typos", () => {
    expect(
      normalizeCsFigmaAssetPathKeys(
        "/tmp/export/12/17 실시간 수업 생성 ~ 현장 녹화 확인(PC).png"
      )
    ).toContain("12 17 실시간 수업 생성 현장 녹화 확인 pc")
    expect(
      normalizeCsFigmaAssetPathKeys(
        "/tmp/export/두드림 - 수업개설/녹화 활성화/카메라 세팅.png"
      )
    ).toContain("두드림 수업개설 녹화 활성화 카메라 세팅")
    expect(normalizeCsFigmaAssetKey("대시보드 수업 교사 설졍 & 삭제.png")).toBe(
      "대시보드 수업 교사 설정 삭제"
    )
  })

  it("matches known Figma layer names that differ from public guide titles", () => {
    expect(
      normalizeCsFigmaAssetPathKeys("/tmp/export/웹 라이브 사용 방법 안내(대시보드).png")
    ).toContain("웹 라이브 생성 방법 대시보드")
    expect(
      normalizeCsFigmaAssetPathKeys("/tmp/export/AI 기능 비활성화.png")
    ).toContain("classin ai 비활성화 안내")
    expect(
      normalizeCsFigmaAssetPathKeys("/tmp/export/클래스인 마이크 활성화/비활성화(PC).png")
    ).toEqual(
      expect.arrayContaining([
        "클래스인 마이크 설정",
        "클래스인 교실 내 카메라 마이크 설정 확인 pc",
      ])
    )
    expect(
      normalizeCsFigmaAssetPathKeys("/tmp/export/클래스인 학생 대리등록 & 코스 초대.png")
    ).toContain("클래스인 학생 대리등록 코스 입장")
  })

  it("suggests stable public paths for Figma captures", () => {
    expect(suggestCsFigmaAssetPath("12/17 실시간 수업 생성 ~ 현장 녹화 확인(PC).png")).toBe(
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png"
    )
    expect(suggestCsFigmaAssetPath("코스 내 초대 활성화(QR, Link 등)")).toBe(
      "/docs/files/cs-figma/코스-내-초대-활성화-qr-link-등.png"
    )
  })

  it("lists deduped asset requirements with recommended target paths", () => {
    const guide = CS_FIGMA_GUIDES.find((item) => item.docSlug === "cs-field-recording-camera-setup")
    expect(guide).toBeTruthy()

    const requirements = getCsFigmaAssetRequirements([guide!])

    expect(requirements).toEqual([
      {
        assetKey: "12 17 실시간 수업 생성 현장 녹화 확인 pc",
        sourceImageFile: "12/17 실시간 수업 생성 ~ 현장 녹화 확인(PC).png",
        expectedPublicPath: "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
        docPaths: ["/docs/teacher/cs-field-recording-camera-setup"],
        guideTitles: ["현장 녹화 카메라 설정"],
      },
      {
        assetKey: "12 17 실시간 수업 생성 현장 녹화 확인 ifp",
        sourceImageFile: "12/17 실시간 수업 생성 ~ 현장 녹화 확인(IFP).png",
        expectedPublicPath: "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-ifp.png",
        docPaths: ["/docs/teacher/cs-field-recording-camera-setup"],
        guideTitles: ["현장 녹화 카메라 설정"],
      },
    ])
  })

  it("builds an import plan from exported Figma image files", () => {
    const guide = CS_FIGMA_GUIDES.find((item) => item.docSlug === "cs-field-recording-camera-setup")
    expect(guide).toBeTruthy()

    const importPlan = buildCsFigmaAssetImportPlan([guide!], [
      "/tmp/export/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
      "/tmp/export/12 17 실시간 수업 생성 ~ 현장 녹화 확인(IFP).png",
      "/tmp/export/unrelated.png",
    ])

    expect(importPlan).toEqual({
      matched: [
        {
          assetKey: "12 17 실시간 수업 생성 현장 녹화 확인 pc",
          sourcePath: "/tmp/export/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
          sourceImageFile: "12/17 실시간 수업 생성 ~ 현장 녹화 확인(PC).png",
          targetPublicPath: "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
          docPaths: ["/docs/teacher/cs-field-recording-camera-setup"],
        },
        {
          assetKey: "12 17 실시간 수업 생성 현장 녹화 확인 ifp",
          sourcePath: "/tmp/export/12 17 실시간 수업 생성 ~ 현장 녹화 확인(IFP).png",
          sourceImageFile: "12/17 실시간 수업 생성 ~ 현장 녹화 확인(IFP).png",
          targetPublicPath: "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-ifp.png",
          docPaths: ["/docs/teacher/cs-field-recording-camera-setup"],
        },
      ],
      unmatchedSourcePaths: ["/tmp/export/unrelated.png"],
      missingRequirements: [],
    })
  })

  it("matches common Figma export suffixes when importing image files", () => {
    const guide = CS_FIGMA_GUIDES.find((item) => item.docSlug === "cs-field-recording-camera-setup")
    expect(guide).toBeTruthy()

    const importPlan = buildCsFigmaAssetImportPlan([guide!], [
      "/tmp/export/12-17-실시간-수업-생성-현장-녹화-확인-pc@2x.png",
      "/tmp/export/12 17 실시간 수업 생성 ~ 현장 녹화 확인(IFP) (1).png",
    ])

    expect(importPlan.matched.map((item) => item.targetPublicPath)).toEqual([
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-pc.png",
      "/docs/files/cs-figma/12-17-실시간-수업-생성-현장-녹화-확인-ifp.png",
    ])
    expect(importPlan.unmatchedSourcePaths).toEqual([])
    expect(importPlan.missingRequirements).toEqual([])
  })

  it("can import one exported Figma image into multiple known guide aliases", () => {
    const guide = CS_FIGMA_GUIDES.find((item) => item.docSlug === "cs-microphone-camera-check")
    const generatedGuide = CS_FIGMA_GUIDES.find((item) => item.docSlug === "cs-figma-digest-1213")
    expect(guide).toBeTruthy()
    expect(generatedGuide).toBeTruthy()

    const importPlan = buildCsFigmaAssetImportPlan([guide!, generatedGuide!], [
      "/tmp/export/클래스인 마이크 활성화/비활성화(PC).png",
    ])

    expect(importPlan.matched.map((item) => item.targetPublicPath)).toEqual(
      expect.arrayContaining([
        "/docs/files/cs-figma/클래스인-마이크-설정.png",
        "/docs/files/cs-figma/클래스인-교실-내-카메라-마이크-설정-확인-pc.png",
      ])
    )
    expect(importPlan.unmatchedSourcePaths).toEqual([])
  })

  it("reports Figma source captures that do not have public image assets yet", () => {
    const guide = CS_FIGMA_GUIDES.find((item) => item.docSlug === "cs-field-recording-camera-setup")
    expect(guide).toBeTruthy()

    const missing = findMissingCsFigmaAssetLabels([guide!], [])

    expect(missing).toEqual([
      {
        guideTitle: "현장 녹화 카메라 설정",
        docPath: "/docs/teacher/cs-field-recording-camera-setup",
        sourceImageFile: "12/17 실시간 수업 생성 ~ 현장 녹화 확인(PC).png",
      },
      {
        guideTitle: "현장 녹화 카메라 설정",
        docPath: "/docs/teacher/cs-field-recording-camera-setup",
        sourceImageFile: "12/17 실시간 수업 생성 ~ 현장 녹화 확인(IFP).png",
      },
    ])
  })

  it("keeps the imported Figma asset manifest fully linked", () => {
    const missing = findMissingCsFigmaAssetLabels(CS_FIGMA_GUIDES)
    const requirements = getCsFigmaAssetRequirements(CS_FIGMA_GUIDES)

    expect(CS_FIGMA_ASSET_PATHS.length).toBe(112)
    expect(requirements).toHaveLength(112)
    expect(missing).toEqual([])
  })
})
