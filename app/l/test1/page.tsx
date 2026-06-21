import {
  Camera,
  ClipboardCheck,
  Monitor,
  PenTool,
  Presentation,
  Video,
  Wrench,
} from "lucide-react"

import { SegmentLandingPage, type SegmentLandingPageData } from "@/components/landing/SegmentLandingPage"
import { JsonLd } from "@/components/seo/JsonLd"
import { createBreadcrumbJsonLd, createPublicMetadata, createWebPageJsonLd } from "@/lib/seo"

const contactHref = `/contact?topic=${encodeURIComponent("하드웨어/설치/AS")}&prefill=${encodeURIComponent(
  "목동 쇼룸에서 대표 수업 자료로 Classin Board, EDB, 녹화 흐름을 확인하고 싶습니다."
)}#contact-form`

const page: SegmentLandingPageData = {
  segmentId: "hardware-classroom-buildout",
  themeLabel: "전자칠판 비교 리드",
  hero: {
    title: "전자칠판을 바꾸는 게 아니라, 교실 수업 흐름을 바꿉니다",
    body:
      "화면 크기와 판서감만 비교하면 Classin Board의 가치는 작게 보입니다. Classin은 학원 시스템 OS 관점으로 OPS 기반 보드, 수업 소프트웨어, EDB, 녹화, 복습, LMS, 관리자 데이터를 교실 한 흐름으로 연결합니다.",
    image: {
      src: "/images/product/hw/hero/hero-board-stand.webp",
      alt: "Classin Board 전자칠판 스탠드형 제품 이미지",
      width: 1400,
      height: 1050,
      objectPosition: "50% 48%",
    },
    primaryCta: {
      label: "목동 쇼룸에서 대표 수업 시연하기",
      href: contactHref,
      ctaId: "segment_hw_showroom",
    },
    secondaryCta: {
      label: "전자칠판 구축 체크리스트 받기",
      href: "/resources/electronic-whiteboard-classroom-checklist#download",
      ctaId: "segment_hw_checklist",
    },
    evidence: [
      { label: "핵심 비교 기준", value: "패널 단품이 아니라 교실 시스템" },
      { label: "첫 도입 범위", value: "전자칠판, 녹화, 수업 관리" },
      { label: "상담 준비물", value: "교실 사진과 대표 수업 자료" },
    ],
    visualNotes: [
      "OPS 포함 구성에서는 외장 PC 의존을 줄일 수 있습니다.",
      "EDB, 녹화, LMS가 수업 후 복습 흐름까지 이어집니다.",
      "카메라·마이크·스탠드·벽걸이는 교실 조건 기준으로 확인합니다.",
    ],
  },
  problem: {
    heading: "기존 전자칠판의 숨은 비용",
    body:
      "교실 장비는 설치 후 매일 쓰입니다. 화면이 커도 수업 자료, 녹화, 복습 배포가 따로 움직이면 운영팀의 손은 그대로 남습니다.",
    items: [
      {
        title: "외장 장비 의존",
        body: "노트북, HDMI, 터치 케이블, 별도 녹화 프로그램을 매 수업마다 연결하면 장비가 늘수록 장애 지점도 늘어납니다.",
        icon: Monitor,
      },
      {
        title: "녹화 이후의 수작업",
        body: "녹화 파일을 다시 다운로드하고 업로드하고 링크를 배포한다면 전자칠판 도입 후에도 복습 제공은 새 업무가 됩니다.",
        icon: Video,
      },
      {
        title: "단품 가격 비교",
        body: "패널 단가만 보면 OPS, 카메라, 설치, 소프트웨어, 교사 온보딩까지 포함한 실제 도입 범위가 흐려집니다.",
        icon: ClipboardCheck,
      },
    ],
  },
  flow: {
    heading: "교실 시스템 기준으로 보는 도입 흐름",
    body:
      "Classin Board는 큰 화면 하나가 아니라 수업 전 준비, 판서, 녹화, 복습, 관리자 확인까지 연결되는 교실 운영 구성으로 검토해야 합니다.",
    steps: [
      {
        title: "교실 조건 정리",
        body: "교실 크기, 좌석 거리, 전원, 네트워크, 벽걸이 또는 스탠드 조건을 먼저 모읍니다.",
      },
      {
        title: "OPS와 소프트웨어 확인",
        body: "OPS 포함 구성, 윈도우 기반 수업 환경, 무선 미러링, Classin 소프트웨어 연결성을 확인합니다.",
      },
      {
        title: "판서에서 복습까지",
        body: "EDB 교안, 50페이지 칠판, 수업 녹화, 다시보기, LMS 배포가 한 흐름으로 이어지는지 봅니다.",
      },
      {
        title: "쇼룸에서 검증",
        body: "대표 수업 자료를 가져와 판서, 녹화, 카메라, 관리자 확인 장면을 실제로 검증합니다.",
      },
    ],
  },
  proof: {
    heading: "하드웨어 스펙보다 중요한 운영 근거",
    body:
      "구매 전에는 화면 크기보다 수업을 시작하고 끝낸 뒤 어떤 자료와 데이터가 남는지를 먼저 확인해야 합니다.",
    items: [
      {
        title: "OPS 기반 수업 환경",
        body: "OPS 포함 구성에서는 보드에서 수업 환경을 구동할 수 있습니다. 실제 OPS 포함 여부와 스펙은 모델·견적 기준으로 확인합니다.",
        icon: Presentation,
      },
      {
        title: "EDB 교안과 판서 재사용",
        body: "EDB는 판서, 이미지, 텍스트가 상호작용 가능한 상태로 유지되는 Classin 칠판 파일입니다.",
        icon: PenTool,
      },
      {
        title: "카메라·마이크 구성",
        body: "T1/S1 카메라와 외부 마이크 구성은 교실 크기, 녹화 목적, 하이브리드 여부에 따라 검토합니다.",
        icon: Camera,
      },
      {
        title: "설치 후 첫 수업 테스트",
        body: "설치 완료는 전원 켜짐이 아니라 대표 수업 자료, 녹화, 다시보기, LMS 연결 확인까지입니다.",
        icon: Wrench,
      },
    ],
  },
  decision: {
    heading: "상담 전에 이렇게 묻습니다",
    body:
      "하드웨어 상담은 모델 추천보다 현장 조건과 수업 루틴 확인이 먼저입니다. 이 질문들이 견적 범위를 빠르게 좁힙니다.",
    rows: [
      {
        title: "교실",
        body: "설치 후보 교실의 사진, 좌석 수, 가장 먼 자리 거리, 전원과 네트워크 위치를 준비합니다.",
      },
      {
        title: "수업",
        body: "대표 수업에서 자료 열기, 판서, 학생 참여, 녹화, 복습 배포가 어떤 순서로 일어나는지 적습니다.",
      },
      {
        title: "AV",
        body: "녹화가 판서 중심인지, 강사 추적과 학생 음성까지 필요한지 기준을 나눕니다.",
      },
      {
        title: "견적",
        body: "전자칠판, OPS, 카메라, 스탠드·벽걸이, 소프트웨어, 설치, 온보딩이 어디까지 포함되는지 확인합니다.",
      },
    ],
  },
  finalCta: {
    heading: "대표 교실 하나로 먼저 검증하세요",
    body:
      "전 교실 도입을 한 번에 결정하기보다, 실제 수업 자료로 EDB·판서·녹화·복습 흐름을 확인하면 가격 비교가 운영 판단으로 바뀝니다.",
    primaryCta: {
      label: "쇼룸 상담 요청하기",
      href: contactHref,
      ctaId: "segment_hw_final_showroom",
    },
    secondaryCta: {
      label: "구축 체크리스트 보기",
      href: "/resources/electronic-whiteboard-classroom-checklist#download",
      ctaId: "segment_hw_final_checklist",
    },
  },
  carefulNote:
    "모델별 가격, 재고, 설치 가능 여부, 정확한 구성품은 최신 상담 기준으로 확인합니다. OPS와 외장 PC 관련 표현은 항상 실제 구성 조건을 전제로 봅니다.",
}

export const metadata = createPublicMetadata({
  title: "전자칠판 교실 구축",
  description:
    "Classin Board를 전자칠판 단품이 아니라 OPS, EDB, 녹화, LMS, 관리자 데이터가 이어지는 교실 시스템으로 검토하세요.",
  path: "/l/test1",
  keywords: ["전자칠판", "Classin Board", "교실 구축", "OPS", "수업 녹화"],
  noIndex: true,
})

export default function Test1LandingPage() {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/l/test1",
            name: "Classin 전자칠판 교실 구축",
            description:
              "Classin Board를 전자칠판 단품이 아니라 수업 운영 흐름으로 검토하는 세그먼트 랜딩입니다.",
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "전자칠판 교실 구축", path: "/l/test1" },
          ]),
        ]}
      />
      <SegmentLandingPage page={page} />
    </>
  )
}
