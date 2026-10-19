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
  /** 분할하지 않은 단일 안내 이미지(전체 화면을 "전체 순서를 한 장으로"에 한 번 표시) */
  heroImage?: { src: string; alt?: string }
  stages: CsFigmaStage[]
  /** 마지막 "미리 알아 둘 것" 항목 */
  tips?: string[]
  /** 마지막 "저장해 두고 보기" 이미지 다운로드(피그마 기준 전체 한 장) */
  downloadImage?: CsFigmaDownloadImage
  /** 사람이 다시 쓴 보강 문서의 공개 문서 갱신일 */
  updatedAt?: string
}

import { GENERATED_CS_FIGMA_ENRICHMENTS } from "@/lib/cs-figma-enrichments.generated"

const RECORDING_ASSET_DIR = "/docs/files/cs-figma/하위계정-녹화본-다운로드"

// 손으로 검증한 플래그십(단계별 분할 포함). 자동 생성본(GENERATED)보다 우선한다.
const CURATED_CS_FIGMA_ENRICHMENTS: Record<string, CsFigmaEnrichment> = {
  "cs-figma-digest-1054": {
    updatedAt: "2026-09-24",
    title: "수업이 끝난 뒤 들어온 학생에게 이전 수업 다시보기 열어 주기",
    intro:
      "학생이 지난 수업 다시보기가 안 보인다고 하면, 그 수업이 끝난 뒤에 코스에 들어온 학생인지부터 확인해 주세요. 맞다면 관리자 대시보드에서 새로 참여한 학생도 이전 수업을 볼 수 있게 허용해야 합니다. 이미 코스에 들어와 있는 학생은 설정을 바꾼 뒤 코스에서 내보냈다가 다시 추가해야 적용됩니다.",
    stages: [
      {
        title: "1. 관리자 대시보드 열기",
        body: "클래스인 PC 앱의 프로필 메뉴에서 **관리자용 대시보드**를 엽니다. 대시보드에 바로 로그인해도 됩니다.",
      },
      {
        title: "2. 수업 다시보기 탭으로 이동",
        body: "왼쪽 메뉴 **계정 정보 → 일반 설정**으로 들어가 위쪽 **수업 다시보기** 탭을 누릅니다.",
      },
      {
        title: "3. 정규 학생과 교사의 다시보기 켜기",
        body: "먼저 **수업 종료 후 정규 학생과 교사가 수업 다시보기 영상을 시청할 수 있습니다** 옵션을 켭니다. 이 기본 옵션이 꺼져 있으면 다음 단계의 옵션을 켜도 다시보기가 제대로 열리지 않을 수 있습니다.",
      },
      {
        title: "4. 새로 참여한 학생의 이전 수업 열람 허용",
        body: "**수업 다시보기 권한에 대한 고급 설정**에서 **새로 참여한 학생은 이전 수업 데이터를 볼 수 있습니다** 옵션을 켭니다. 화면 버전에 따라 **코스에 새로 가입된 학생이 이전 수업의 다시보기 시청을 허용합니다**로 나오기도 합니다.",
      },
      {
        title: "5. 이미 들어와 있는 학생은 코스에 다시 추가",
        body: "설정을 켜기 전부터 코스에 있던 학생에게는 바로 적용되지 않을 수 있습니다. 대상 학생을 코스에서 내보낸 뒤 다시 추가하거나, 학생이 코스에서 나갔다가 다시 들어오게 안내합니다.",
      },
      {
        title: "6. 학생 화면에서 확인",
        body: "학생 계정으로 코스에 다시 들어가 이전 수업이 목록에 보이고 다시보기가 재생되는지 확인합니다.",
      },
    ],
    tips: [
      "이 설정은 코스에 새로 들어오는 학생에게 적용됩니다. 이미 들어와 있는 학생은 코스에 다시 추가해야 할 수 있습니다.",
      "설정을 켜는 시점에 있는 코스 전체에 영향을 줄 수 있습니다. 적용 범위를 먼저 확인하세요.",
      "학생의 과거 수업 역할이 한 번 바뀌면 되돌리기 어려울 수 있습니다. 대상 학생과 코스를 정확히 골라 주세요.",
    ],
  },
  "cs-figma-digest-523": {
    updatedAt: "2026-09-24",
    title: "수업 녹화본을 PC에 내려받기",
    intro:
      "지난 수업 녹화본을 내 PC에 저장하려는 관리자를 위한 순서입니다. 클래스인 홈페이지에 로그인해 기관 관리의 수업 관리에서 수업을 찾고, 수업 녹화 데이터 화면에서 파일을 내려받습니다.",
    stages: [
      {
        title: "1. 클래스인 홈페이지 접속",
        body: "구글에서 **클래스인**을 검색해 맨 위의 **올인원 하이브리드 학습 플랫폼 클래스인**(classin.com)을 엽니다.",
      },
      {
        title: "2. 로그인 버튼 누르기",
        body: "홈페이지 오른쪽 위 **로그인**을 누릅니다.",
      },
      {
        title: "3. 계정으로 로그인",
        body: "아이디(전화번호 또는 이메일)와 비밀번호를 입력하고 **Log In**을 누릅니다.",
      },
      {
        title: "4. 수업 관리에서 녹화 데이터 열기",
        body: [
          "왼쪽 메뉴에서 **기관 관리 → 수업 관리**로 들어갑니다.",
          "",
          "- 위쪽 필터에서 코스 이름, 교사, 기간으로 수업을 찾습니다.",
          "- 수업 행 오른쪽 끝의 **조작 ∧** 버튼을 누릅니다.",
          "- 펼쳐진 메뉴에서 **수업 녹화 데이터**를 누릅니다.",
        ].join("\n"),
      },
      {
        title: "5. 녹화 파일 다운로드",
        body: [
          "녹화 목록에서 받을 클립 행의 **다운로드**를 누르면 PC에 저장됩니다.",
          "",
          "- 바로 저장되지 않으면 **다운로드**를 마우스 오른쪽 버튼으로 누르고 **다른 이름으로 저장**을 고르세요.",
          "- 화면 위쪽에 녹화 길이와 파일 크기가 나옵니다.",
        ].join("\n"),
      },
      {
        title: "6. 녹화 영상 확인",
        body: [
          "저장한 영상이나 브라우저에서 재생되는 영상을 확인합니다. 영상이 **음소거**로 시작될 수 있으니 소리가 안 들리면 볼륨부터 올려 주세요.",
          "",
          "- 플레이어 오른쪽 아래 **더보기(⋮)** 버튼에서 재생 속도를 바꿀 수 있습니다.",
        ].join("\n"),
      },
    ],
    tips: [
      "화면 위쪽의 **다운로드 플러그인 사용 추천** 안내를 따르면 더 안정적으로 받을 수 있습니다.",
      "파일로 남길 필요가 없다면 영상 재생 화면의 주소창 링크를 보내도 됩니다. 이 링크는 로그인 없이 열리니 보낼 사람을 먼저 정하세요.",
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
