/**
 * CS 문서 소비자용 보강(enrichment) 레이어.
 *
 * 생성된 CS 가이드(`CS_FIGMA_GUIDES`)는 내부 캡처 메모 톤이라 그대로 노출하면 안 된다.
 * 이 파일은 docSlug 기준으로 "소비자에게 보여줄" 제목/도입문/단계별 화면/팁을 큐레이션한다.
 *
 * - 보강이 있는 문서: 합성 캡처 1장 대신 단계별로 분리한 화면을 각 단계 설명 옆에 배치한다.
 * - 보강이 없는 문서: `buildCsFigmaDocArticle`이 자동으로 정리(피그마/캡처 표현 제거)한 기본 구성을 쓴다.
 *
 * 단계별 화면 이미지는 원본 합성 PNG를 패널로 분리하고 개인정보(학원명/연락처/계정 ID 등)를
 * 마스킹한 뒤 `/docs/files/cs-figma/<자산>/panel-N.png` 로 저장한다.
 */

export interface CsFigmaStage {
  /** 단계 제목 (예: "1. 클래스인 접속") */
  title: string
  /** 소비자용 안내 본문 (마크다운 허용) */
  body: string
  /** 단계 화면 이미지 경로(public 기준). 없으면 텍스트만 표시 */
  image?: string
  imageAlt?: string
  width?: number
  height?: number
}

export interface CsFigmaDownloadImage {
  src: string
  label: string
  description?: string
}

export interface CsFigmaEnrichment {
  /** 소비자용 제목(미지정 시 가이드 제목 사용) */
  title?: string
  /** 소비자용 도입문(문서 설명/요약으로도 사용) */
  intro: string
  /** 분할하지 않은 단일 안내 이미지(전체 화면을 "한눈에 보기"로 한 번 표시) */
  heroImage?: { src: string; alt?: string }
  stages: CsFigmaStage[]
  /** 마지막 "알아두면 좋은 점" 항목 */
  tips?: string[]
  /** 마지막 "저장해 두고 보기" 이미지 다운로드(피그마 기준 전체 한 장) */
  downloadImage?: CsFigmaDownloadImage
}

import { GENERATED_CS_FIGMA_ENRICHMENTS } from "@/lib/cs-figma-enrichments.generated"

const RECORDING_ASSET_DIR = "/docs/files/cs-figma/하위계정-녹화본-다운로드"

// 손으로 검증한 플래그십(단계별 분할 포함). 자동 생성본(GENERATED)보다 우선한다.
const CURATED_CS_FIGMA_ENRICHMENTS: Record<string, CsFigmaEnrichment> = {
  "cs-figma-digest-523": {
    title: "수업 녹화본 PC로 다운로드하기",
    intro:
      "관리자 대시보드에서 진행된 수업의 녹화본을 찾아 내 PC에 저장하는 방법입니다. 구글 검색에서 시작해 다운로드까지 순서대로 따라오시면 됩니다.",
    stages: [
      {
        title: "1. 클래스인 홈페이지 접속",
        body: "구글에서 **클래스인**을 검색하고, 맨 위에 나오는 **올인원 하이브리드 학습 플랫폼 클래스인**(classin.com) 결과를 클릭합니다.",
        image: `${RECORDING_ASSET_DIR}/panel-1.png`,
        imageAlt: "구글에서 클래스인을 검색해 첫 번째 결과를 클릭하는 화면",
        width: 1920,
        height: 944,
      },
      {
        title: "2. 로그인 버튼 누르기",
        body: "홈페이지가 열리면 오른쪽 위 **로그인** 버튼을 클릭합니다.",
        image: `${RECORDING_ASSET_DIR}/panel-2.png`,
        imageAlt: "클래스인 홈페이지 오른쪽 위 로그인 버튼",
        width: 1920,
        height: 944,
      },
      {
        title: "3. 계정으로 로그인",
        body: "아이디(전화번호 또는 이메일)와 비밀번호를 입력하고 **Log In**을 누릅니다.",
        image: `${RECORDING_ASSET_DIR}/panel-3.png`,
        imageAlt: "아이디와 비밀번호를 입력하는 로그인 화면",
        width: 1920,
        height: 944,
      },
      {
        title: "4. 수업 관리에서 녹화 데이터 열기",
        body: [
          "왼쪽 메뉴에서 **기관 관리 → 수업 관리**로 들어갑니다.",
          "",
          "- 상단 필터(코스 이름·교사·기간 등)로 원하는 수업을 찾습니다.",
          "- 수업 행 오른쪽 끝 **조작 ∧** 버튼을 누릅니다.",
          "- 펼쳐진 메뉴에서 **수업 녹화 데이터**를 선택합니다.",
        ].join("\n"),
        image: `${RECORDING_ASSET_DIR}/panel-4.png`,
        imageAlt: "수업 관리 목록에서 조작 메뉴를 열어 수업 녹화 데이터를 선택하는 화면",
        width: 1910,
        height: 948,
      },
      {
        title: "5. 녹화 파일 다운로드",
        body: [
          "녹화 목록에서 받을 파일(예: 클립 1) 행의 **다운로드**를 클릭하면 PC에 저장됩니다.",
          "",
          "- 바로 저장되지 않으면 **다운로드**를 마우스 오른쪽 버튼으로 클릭한 뒤 **다른 이름으로 저장**을 선택하세요.",
          "- 화면 위쪽에서 녹화 길이·파일 크기 같은 요약 정보를 확인할 수 있습니다.",
        ].join("\n"),
        image: `${RECORDING_ASSET_DIR}/panel-5.png`,
        imageAlt: "수업 녹화 데이터 화면에서 다운로드 버튼을 클릭하는 화면",
        width: 1910,
        height: 948,
      },
      {
        title: "6. 녹화 영상 확인",
        body: [
          "저장했거나 재생되는 영상을 확인합니다. 영상이 **음소거**로 시작될 수 있으니 볼륨을 올려 주세요.",
          "",
          "- 플레이어 오른쪽 아래 **더보기(⋮)** 버튼에서 재생 속도 등 추가 옵션을 쓸 수 있습니다.",
        ].join("\n"),
        image: `${RECORDING_ASSET_DIR}/panel-6.png`,
        imageAlt: "녹화 영상 재생 화면과 오른쪽 아래 더보기 버튼",
        width: 1910,
        height: 948,
      },
    ],
    tips: [
      "다운로드가 바로 안 되면 **다운로드**를 마우스 오른쪽 버튼으로 클릭한 뒤 **다른 이름으로 저장**을 사용하세요.",
      "화면 위쪽의 **다운로드 플러그인 사용 추천** 안내를 따르면 더 안정적으로 받을 수 있습니다.",
      "영상은 음소거로 시작될 수 있어요. 소리가 안 들리면 플레이어 볼륨부터 확인하세요.",
    ],
    downloadImage: {
      src: `${RECORDING_ASSET_DIR}.png`,
      label: "전체 안내 한 장으로 보기 (이미지 내려받기)",
      description: "6단계 화면을 한 장에 모았습니다. 인쇄하거나 저장해 두고 보세요.",
    },
  },
}

// 자동 생성본 + 큐레이션본 병합(큐레이션이 우선).
export const CS_FIGMA_ENRICHMENTS: Record<string, CsFigmaEnrichment> = {
  ...(GENERATED_CS_FIGMA_ENRICHMENTS as Record<string, CsFigmaEnrichment>),
  ...CURATED_CS_FIGMA_ENRICHMENTS,
}

export function getCsFigmaEnrichment(docSlug: string): CsFigmaEnrichment | undefined {
  return CS_FIGMA_ENRICHMENTS[docSlug]
}
