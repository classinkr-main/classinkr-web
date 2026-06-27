import {
  BarChart3,
  BookOpen,
  Clock,
  FileText,
  GraduationCap,
  Layers,
  Users,
} from "lucide-react"

import { SegmentLandingPage, type SegmentLandingPageData } from "@/components/landing/SegmentLandingPage"
import { JsonLd } from "@/components/seo/JsonLd"
import { createBreadcrumbJsonLd, createPublicMetadata, createWebPageJsonLd } from "@/lib/seo"

const contactHref = `/contact?topic=${encodeURIComponent("수업 운영 상담")}&prefill=${encodeURIComponent(
  "우수 강사의 수업 흐름을 EDB 교안, 녹화, LMS로 표준화하는 도입 상담을 받고 싶습니다."
)}#contact-form`

const page: SegmentLandingPageData = {
  segmentId: "teacher-resource-standardization",
  themeLabel: "강사 리소스·수업 표준화 리드",
  hero: {
    title: "강사가 바뀌어도, 수업 품질은 흔들리지 않게",
    body:
      "수업 자료는 강사 PC에, 녹화와 과제는 다른 도구에, 상담 기록은 메신저에 흩어져 있나요? Classin은 학원 시스템 OS로 EDB 교안, 수업 녹화, LMS, 관리자 데이터를 한 흐름으로 묶어 학원식 수업 운영 기준을 남깁니다.",
    image: {
      src: "/images/l/test2/test2-hero.png",
      alt: "ClassIn 전자칠판에 표준 수업 템플릿을 띄우고 수업을 준비하는 강사가 있는 학원 교실",
      width: 1200,
      height: 900,
      objectPosition: "50% 50%",
    },
    primaryCta: {
      label: "강사 온보딩 SOP 받기",
      href: "/resources/teacher-edb-onboarding-sop-kit#download",
      ctaId: "segment_teacher_sop",
    },
    secondaryCta: {
      label: "리소스 절감 계산표 보기",
      href: "/resources/academy-resource-reduction-calculator#download",
      ctaId: "segment_teacher_roi",
    },
    evidence: [
      { label: "핵심 자산", value: "EDB 교안과 50페이지 칠판" },
      { label: "운영 범위", value: "수업, 녹화, 과제, 관리자 데이터" },
      { label: "확장 방식", value: "대표 수업 1개부터 90일 파일럿" },
    ],
    visualNotes: [
      "우수 강사의 판서와 자료 배치를 재사용 가능한 수업 자산으로 남깁니다.",
      "수업 후 녹화, 복습, 숙제·시험 운영까지 같은 흐름으로 연결합니다.",
      "관리자는 권한 범위 안에서 수업 운영 데이터를 확인합니다.",
    ],
  },
  problem: {
    heading: "좋은 수업이 개인기와 개인 파일에만 남을 때",
    body:
      "수업 품질 표준화는 기능 교육만으로 해결되지 않습니다. 강사가 실제로 따라 할 수 있는 교안, 녹화, 과제, 권한 기준이 함께 있어야 합니다.",
    items: [
      {
        title: "자료가 개인 저장소에 남음",
        body: "우수 강사의 자료와 판서 흐름이 개인 PC나 드라이브에만 있으면 강사 교체와 지점 확장 때 품질 편차가 커집니다.",
        icon: FileText,
      },
      {
        title: "첫 주 온보딩이 기능 설명으로 끝남",
        body: "로그인과 버튼 위치만 알려주면 첫 수업의 자료 열기, 녹화, LMS 연결에서 사고가 납니다.",
        icon: GraduationCap,
      },
      {
        title: "수업 후 업무가 흩어짐",
        body: "녹화, 보강 안내, 과제 미제출 확인, 상담 준비가 다른 도구에 있으면 원장과 실장은 기준을 보기 어렵습니다.",
        icon: Clock,
      },
    ],
  },
  flow: {
    heading: "수업 전·중·후를 하나의 운영 기준으로",
    body:
      "Classin을 기능 목록으로 도입하지 않고, 대표 수업 1개가 준비부터 복습까지 어떻게 남는지 기준을 세웁니다.",
    steps: [
      {
        title: "표준 수업 선정",
        body: "우수 강사의 대표 수업 1개를 골라 목표, 판서 흐름, 자료 전환, 복습 장면을 정리합니다.",
      },
      {
        title: "EDB 전환",
        body: "판서, 이미지, 텍스트를 살아 있는 칠판 파일로 저장해 다음 수업과 신규 강사 온보딩에 재사용합니다.",
      },
      {
        title: "녹화와 LMS 연결",
        body: "수업 녹화, 녹화 수업, 숙제, 시험, 학습 자료를 수업 후 루틴으로 묶습니다.",
      },
      {
        title: "관리자 점검",
        body: "수업 시간, 참여, 녹화 제공, 과제 상태, 권한 회수를 주간 운영 기준으로 확인합니다.",
      },
    ],
  },
  proof: {
    heading: "기관 자산으로 남는 수업 운영",
    body:
      "Classin의 강점은 에이스 강사의 노하우를 기능 설명이 아니라 반복 가능한 수업 운영 흐름으로 바꾸는 데 있습니다.",
    items: [
      {
        title: "EDB 교안",
        body: "EDB는 판서, 이미지, 텍스트가 상호작용 가능한 상태로 유지되는 Classin 칠판 파일입니다.",
        icon: BookOpen,
      },
      {
        title: "학습 활동",
        body: "수업, 숙제, 시험, 녹화 수업, 학습 자료, 일일 과제, 토론, OMR 카드, SCORM을 운영할 수 있습니다.",
        icon: Layers,
      },
      {
        title: "관리자 운영 가시성",
        body: "권한 범위 안에서 수업 시간, 출결·참여, 특이사항, 네트워크, 녹화·LMS 데이터를 확인합니다.",
        icon: BarChart3,
      },
      {
        title: "강사 권한과 회수",
        body: "강사 교체나 반 이동 때 자료와 계정 권한을 기관 기준으로 관리할 수 있게 SOP를 세웁니다.",
        icon: Users,
      },
    ],
  },
  decision: {
    heading: "90일 파일럿은 작게 시작합니다",
    body:
      "전 교실 표준화를 바로 약속하지 않습니다. 대표 수업 하나를 기준으로 줄어드는 업무와 남는 자료를 먼저 검증합니다.",
    rows: [
      {
        title: "30일",
        body: "대표 교안 1개를 EDB로 전환하고 첫 강사 온보딩 체크리스트를 운영합니다.",
      },
      {
        title: "60일",
        body: "녹화, 복습 배포, 숙제·시험 연결을 수업 후 루틴으로 고정합니다.",
      },
      {
        title: "90일",
        body: "원장·실장·강사 관점의 주간 운영 지표를 정하고 다른 반으로 확장할 기준을 봅니다.",
      },
      {
        title: "확장",
        body: "에이스 강사의 개인 파일이 아니라 학원 공통 교안, 권한, 버전 규칙으로 수업 자산을 관리합니다.",
      },
    ],
  },
  finalCta: {
    heading: "수업 표준화는 첫 교안 하나에서 시작됩니다",
    body:
      "대표 수업 자료를 기준으로 EDB 전환, 녹화, LMS, 관리자 점검까지 연결해 보면 강사 리소스 절감이 숫자로 보입니다.",
    primaryCta: {
      label: "수업 표준화 상담 요청",
      href: contactHref,
      ctaId: "segment_teacher_final_contact",
    },
    secondaryCta: {
      label: "온보딩 SOP 받기",
      href: "/resources/teacher-edb-onboarding-sop-kit#download",
      ctaId: "segment_teacher_final_sop",
    },
  },
  carefulNote:
    "Classin이 결제, 오프라인 출석, 고급 경영 리포트까지 전부 대체한다고 말하지 않습니다. 해당 영역은 별도 시스템, API 연동, 상담 확인 범위로 분리합니다.",
}

export const metadata = createPublicMetadata({
  title: "강사 리소스와 수업 표준화",
  description:
    "Classin으로 우수 강사의 EDB 교안, 수업 녹화, LMS, 관리자 데이터를 연결해 수업 품질을 표준화하는 랜딩입니다.",
  path: "/l/test2",
  keywords: ["강사 온보딩", "EDB 교안", "학원 수업 표준화", "수업 녹화", "Classin LMS"],
  noIndex: true,
})

export default function Test2LandingPage() {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/l/test2",
            name: "Classin 강사 리소스와 수업 표준화",
            description:
              "EDB 교안, 녹화, LMS, 관리자 데이터를 연결해 수업 품질을 표준화하는 세그먼트 랜딩입니다.",
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "강사 리소스와 수업 표준화", path: "/l/test2" },
          ]),
        ]}
      />
      <SegmentLandingPage page={page} />
    </>
  )
}
