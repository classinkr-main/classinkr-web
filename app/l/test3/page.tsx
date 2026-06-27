import {
  ClipboardCheck,
  Database,
  LockKeyhole,
  Monitor,
  ShieldCheck,
  Video,
  WifiOff,
} from "lucide-react"

import { SegmentLandingPage, type SegmentLandingPageData } from "@/components/landing/SegmentLandingPage"
import { JsonLd } from "@/components/seo/JsonLd"
import { createBreadcrumbJsonLd, createPublicMetadata, createWebPageJsonLd } from "@/lib/seo"

const contactHref = `/contact?topic=${encodeURIComponent("도입 상담")}&prefill=${encodeURIComponent(
  "ClassIn 도입 전 확인 필요 항목을 즉답 가능 항목과 정책 확인 항목으로 나눠 상담받고 싶습니다."
)}#contact-form`

const page: SegmentLandingPageData = {
  segmentId: "pre-adoption-risk-check",
  themeLabel: "도입 전 고의도 검토 리드",
  hero: {
    title: "계약 전에 확인할 질문부터 정리하세요",
    body:
      "관리자 권한, 녹화 저장, 스토리지, 개인정보, 서버, OPS, 오프라인 칠판까지. 학원 시스템 OS인 Classin의 도입 전 질문은 기능 호기심이 아니라 리스크 점검입니다. 바로 답할 수 있는 것과 최신 정책 확인이 필요한 것을 나눠 상담을 빠르게 만듭니다.",
    image: {
      src: "/images/l/test3/test3-hero.png",
      alt: "도입 점검 화면이 켜진 ClassIn 전자칠판",
      width: 1200,
      height: 900,
      objectPosition: "48% 42%",
    },
    primaryCta: {
      label: "도입 전 22가지 질문 체크리스트 받기",
      href: "/resources/classin-pre-adoption-questions-checklist#download",
      ctaId: "segment_risk_checklist",
    },
    secondaryCta: {
      label: "확인 필요 항목 상담 요청",
      href: contactHref,
      ctaId: "segment_risk_contact",
    },
    evidence: [
      { label: "검토 항목", value: "권한, 녹화, 스토리지, 개인정보" },
      { label: "분류 방식", value: "즉답, 조건부, 확인 필요" },
      { label: "다음 행동", value: "정책 회신, 쇼룸, 견적, 파일럿" },
    ],
    visualNotes: [
      "확인 가능한 기능도 누가 볼 수 있는지 권한 기준을 붙입니다.",
      "가격·스토리지·서버·개인정보는 최신 정책 확인 항목으로 분리합니다.",
      "쇼룸에서는 녹화, OPS, 오프라인 필기 같은 실제 장면을 검증합니다.",
    ],
  },
  problem: {
    heading: "도입 직전 리드는 더 많은 기능 설명을 원하지 않습니다",
    body:
      "이 단계의 원장과 관리자는 과장된 확신보다 정확한 분리가 필요합니다. 가능한 것, 조건이 붙는 것, 상담에서 확인할 것을 나누는 순간 신뢰가 생깁니다.",
    items: [
      {
        title: "권한과 데이터가 불명확함",
        body: "관리자, 권한 받은 교사, 학생 중 누가 녹화와 리포트를 볼 수 있는지 분리하지 않으면 도입 후 운영 리스크가 됩니다.",
        icon: LockKeyhole,
      },
      {
        title: "정책성 질문을 추정으로 답함",
        body: "스토리지 용량, 서버 위치, 개인정보 처리, 콘텐츠 소유권, 권한 과금은 최신 계약·정책 확인이 필요합니다.",
        icon: ShieldCheck,
      },
      {
        title: "오프라인과 온라인 기능을 섞음",
        body: "기본 칠판 필기는 오프라인에서도 가능하지만 클라우드 동기화, 온라인 수업, LMS 배포에는 네트워크가 필요합니다.",
        icon: WifiOff,
      },
    ],
  },
  flow: {
    heading: "상담 전에 질문을 네 묶음으로 나눕니다",
    body:
      "22개 질문은 FAQ 목록이 아니라 의사결정 플로우입니다. 답변 속도보다 정확한 분류가 전환 장벽을 낮춥니다.",
    steps: [
      {
        title: "불안 3개 선정",
        body: "권한, 녹화, 스토리지, 개인정보, 가격, 교실 설치 중 가장 불안한 항목을 먼저 고릅니다.",
      },
      {
        title: "즉답 항목 정리",
        body: "웹 관리자 콘솔, 리포트, 온보딩, 과제, 전화번호·이메일 가입, OPS, 오프라인 필기를 구분합니다.",
      },
      {
        title: "확인 필요 분리",
        body: "무료·유료 권한, 계약 기간, 스토리지 용량·단가, 서버 위치, 콘텐츠 소유권은 정책 회신 항목으로 둡니다.",
      },
      {
        title: "쇼룸·견적 연결",
        body: "녹화 찾기, 스토리지 확인, OPS 단독 구동, 외부 PC 연결 같은 장면을 실제로 검증합니다.",
      },
    ],
  },
  proof: {
    heading: "바로 답할 것과 확인할 것을 숨기지 않습니다",
    body:
      "Classin의 신뢰는 만능처럼 보이는 답변이 아니라, 지금 답할 수 있는 범위와 최신 확인이 필요한 범위를 정직하게 나누는 데서 나옵니다.",
    items: [
      {
        title: "관리자 콘솔",
        body: "관리자 콘솔은 기관 관리, 스토리지, 학습 관리, 관리자 기능, 결제, 계정 정보 영역으로 나누어 설명합니다.",
        icon: Monitor,
      },
      {
        title: "녹화 관리",
        body: "수업 녹화와 현장 녹화는 목적이 다르며, 관리자 또는 권한 받은 계정 기준으로 설명해야 합니다.",
        icon: Video,
      },
      {
        title: "스토리지·콘텐츠",
        body: "녹화본, 스크린샷, 칠판 파일, 장기 보관 조건은 계약·기관 설정과 정책 기준으로 확인합니다.",
        icon: Database,
      },
      {
        title: "상담 질문표",
        body: "질문마다 즉답, 자료 전달, 정책 회신, 쇼룸 검증, 견적 반영 중 다음 행동을 붙입니다.",
        icon: ClipboardCheck,
      },
    ],
  },
  decision: {
    heading: "상담 결론은 네 가지 중 하나로 끝냅니다",
    body:
      "답변을 많이 주는 것보다 다음 행동을 정확히 정하는 것이 중요합니다. 내부 공유, 정책 회신, 쇼룸 검증, 견적 범위를 분리합니다.",
    rows: [
      {
        title: "내부 공유",
        body: "즉답 가능 항목과 확인 필요 항목을 1페이지로 정리해 의사결정자에게 공유합니다.",
      },
      {
        title: "정책 회신",
        body: "서버, 개인정보, 콘텐츠 소유권, 스토리지 단가처럼 최신 기준이 필요한 항목은 담당자 확인으로 넘깁니다.",
      },
      {
        title: "쇼룸 검증",
        body: "녹화 관리, OPS, 오프라인 칠판, 외부 PC 연결은 실제 수업 장면에서 확인합니다.",
      },
      {
        title: "견적·파일럿",
        body: "장비, 카메라, 스탠드·벽걸이, 소프트웨어, 설치, 온보딩 범위를 나눠 90일 파일럿으로 연결합니다.",
      },
    ],
  },
  finalCta: {
    heading: "확인 필요 항목을 숨기지 않는 상담이 더 빠릅니다",
    body:
      "도입 전 가장 불안한 질문 3개를 먼저 고르면, 답변 가능한 것과 정책 확인이 필요한 것을 나눠 쇼룸·견적·파일럿으로 이어갈 수 있습니다.",
    primaryCta: {
      label: "22가지 질문표 받기",
      href: "/resources/classin-pre-adoption-questions-checklist#download",
      ctaId: "segment_risk_final_checklist",
    },
    secondaryCta: {
      label: "확인 항목 상담하기",
      href: contactHref,
      ctaId: "segment_risk_final_contact",
    },
  },
  carefulNote:
    "서버 위치, 개인정보 처리, 콘텐츠 소유권, 스토리지 용량·단가, 무료·유료 관리자 권한은 단정하지 않고 최신 계약·정책 확인 범위로 둡니다.",
}

export const metadata = createPublicMetadata({
  title: "도입 전 22가지 질문 체크",
  description:
    "Classin 도입 전 관리자 권한, 녹화, 스토리지, 개인정보, 서버, OPS, 오프라인 칠판 질문을 분류하는 랜딩입니다.",
  path: "/l/test3",
  keywords: ["Classin 도입 전 질문", "관리자 권한", "수업 녹화", "스토리지", "개인정보"],
  noIndex: true,
})

export default function Test3LandingPage() {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/l/test3",
            name: "Classin 도입 전 22가지 질문 체크",
            description:
              "도입 전 질문을 즉답, 조건부, 확인 필요, 쇼룸 검증으로 나누는 세그먼트 랜딩입니다.",
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "도입 전 22가지 질문 체크", path: "/l/test3" },
          ]),
        ]}
      />
      <SegmentLandingPage page={page} />
    </>
  )
}
