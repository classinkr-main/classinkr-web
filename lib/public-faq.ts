import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"

export type PublicFaqCategoryKey = "software" | "hardware"

export type PublicFaqItem = {
  question: string
  answer: string
}

export type PublicFaqCategory = {
  key: PublicFaqCategoryKey
  label: string
  eyebrow: string
  title: string
  description: string
  highlights: string[]
  items: PublicFaqItem[]
}

export const PUBLIC_FAQ_CATEGORIES: PublicFaqCategory[] = [
  {
    key: "software",
    label: "소프트웨어",
    eyebrow: "Software FAQ",
    title: "플랫폼 도입과 운영에 대한 질문",
    description: "Classin을 단순 화상수업 도구가 아니라 학원 시스템 OS로 도입할 때 가장 많이 확인하시는 내용을 정리했습니다.",
    highlights: ["학원 시스템 OS", "EDB·녹화·LMS", "관리자 데이터"],
    items: [
      {
        question: "Classin을 학원 시스템 OS라고 보는 이유는 무엇인가요?",
        answer: CLASSIN_POSITIONING.oneLine,
      },
      {
        question: "Classin은 Zoom 같은 화상회의 도구와 무엇이 다른가요?",
        answer:
          "Zoom은 회의 중심 도구이고, Classin은 수업 운영을 위해 설계된 시스템입니다. 실시간 수업만이 아니라 판서, EDB 교안, 녹화, LMS 과제, 복습 자료, 관리자 데이터를 수업 전후 흐름으로 함께 관리할 수 있다는 점이 다릅니다.",
      },
      {
        question: "도입하는 데 얼마나 걸리나요?",
        answer:
          "한국 학원에서는 전자칠판, 녹화, 수업 관리부터 시작하는 경우가 많고, 파일럿 수업과 강사 온보딩을 거쳐 보통 3개월 안팎으로 운영 루틴을 잡는 방식이 현실적입니다. 도입 범위가 넓거나 API 연동이 필요한 경우에는 일정이 더 길어질 수 있습니다.",
      },
      {
        question: "EDB는 무엇이고 왜 중요한가요?",
        answer:
          CLASSIN_POSITIONING.edbSummary,
      },
      {
        question: "학생들에게 특정 기기가 필요한가요?",
        answer:
          "Classin은 웹과 앱 환경을 모두 지원하며 노트북, 태블릿, 스마트폰 등 다양한 기기에서 사용할 수 있습니다. 다만 한국 학원 현장에서는 학생 개인 기기 기반 수업보다 전자칠판과 녹화, 수업 관리부터 시작하는 경우가 많아 운영 방식에 맞춰 권장 환경을 잡는 것이 좋습니다.",
      },
      {
        question: "관리자는 어떤 데이터를 볼 수 있나요?",
        answer:
          CLASSIN_POSITIONING.adminDataSummary,
      },
      {
        question: "기존 시스템과 연동되나요?",
        answer:
          `가능합니다. ${CLASSIN_POSITIONING.apiStages.join(" ")} 다만 결제, 오프라인 출석, 고급 리포트처럼 학원별 기준이 큰 영역은 현재 시스템과의 역할 분담을 먼저 정하는 편이 안전합니다.`,
      },
      {
        question: "학원의 콘텐츠와 학생 데이터는 안전한가요?",
        answer:
          "수업 자료와 학생 데이터는 권한 관리와 보안 기준에 따라 관리됩니다. 데이터 접근 범위, 계정 권한, 운영 정책은 기관 상황에 맞게 설정할 수 있습니다.",
      },
      {
        question: "요금 체계는 어떻게 되나요?",
        answer:
          "기관 규모, 도입 대수, 필요한 기능, 전자칠판·카메라·스탠드/벽걸이 구성, 소프트웨어 사용 범위에 따라 달라집니다. Classin Board는 OPS와 기본 스펙, 소프트웨어 연동 범위가 포함되므로 단순 전자칠판 가격표와만 비교하기보다 줄일 운영 리소스와 도입 범위를 함께 봐야 합니다.",
      },
    ],
  },
  {
    key: "hardware",
    label: "하드웨어",
    eyebrow: "Hardware FAQ",
    title: "좋은 교실은, 도입부터 단순해야 합니다",
    description:
      "Classin Board는 판서, 기록, 공유, 복습까지 한 흐름으로 이어지도록 설계된 교육 전용 보드입니다. 모델 선택부터 설치, 온보딩, 유지보수까지 도입 전에 가장 많이 확인하시는 내용을 정리했습니다.",
    highlights: ["공간별 모델 제안", "현장 온보딩", "원격지원 · 출장 A/S"],
    items: [
      {
        question: "Classin Board와 일반 전자칠판은 무엇이 다른가요?",
        answer:
          "일반 전자칠판이 화면 출력과 판서에 머무르는 경우가 많다면, Classin Board는 OPS와 Classin 소프트웨어를 통해 판서, EDB 교안, 녹화, 수업 자료 공유, LMS와 관리자 데이터까지 수업 운영 흐름으로 연결합니다.",
      },
      {
        question: "우리 교실에는 어떤 모델이 가장 잘 맞나요?",
        answer:
          "가장 많이 선택되는 구성은 75인치와 86인치입니다. 1:1·소그룹 수업이나 소규모 교실은 75인치, 일반 교실과 라이브 강의 운영은 86인치가 많이 선택됩니다. 50명 이상 대형 공간이나 설명회·강당은 110인치 모델까지 함께 검토합니다.",
      },
      {
        question: "설치에는 얼마나 걸리나요?",
        answer:
          "현장 환경 확인과 일정 조율 후 설치 계획을 잡습니다. 수업 공백을 최소화하는 방향으로 진행하고, 설치 직후 바로 활용할 수 있도록 교사 온보딩도 함께 지원합니다.",
      },
      {
        question: "별도 PC나 카메라를 따로 준비해야 하나요?",
        answer:
          "기본 구성은 전자칠판, OPS 기반 컴퓨팅, 카메라, 마이크, Classin 소프트웨어 흐름을 함께 고려합니다. 스탠드 또는 벽걸이, 카메라 구성, 소프트웨어 충전제 범위는 교실 환경과 도입 목적에 맞춰 확인합니다.",
      },
      {
        question: "Classin 소프트웨어와 어떻게 연동되나요?",
        answer:
          "보드에서 진행한 판서와 수업 기록을 Classin 흐름 안에서 복습 자료와 영상으로 연결할 수 있습니다. 출결, 과제, 성적, 학부모 알림까지 한 시스템에서 관리하는 구성을 상담 과정에서 맞춰드립니다.",
      },
      {
        question: "판서와 수업 영상은 어떻게 저장되고 공유되나요?",
        answer:
          "판서는 PDF로, 수업 영상은 복습 가능한 형태로 저장되어 Classin 흐름 안에서 바로 공유할 수 있습니다. 수업이 끝난 뒤 따로 정리하고 업로드하는 일을 줄여주는 것이 핵심입니다.",
      },
      {
        question: "기존 칠판이나 빔프로젝터를 쓰던 교실에도 설치할 수 있나요?",
        answer:
          "대부분 가능합니다. 벽면 상태, 전원, 네트워크, 시야 거리 같은 기본 조건을 현장 실측 단계에서 먼저 확인하고, 현재 교실 구조를 크게 흔들지 않는 방향으로 설치 구성을 제안드립니다.",
      },
      {
        question: "도입 후 A/S와 운영 지원은 어떻게 진행되나요?",
        answer:
          "설치 이후에도 원격 지원과 유지보수를 이어가며, 필요한 경우 출장 A/S까지 연결합니다. 처음 도입할 때만 잘 되는 장비가 아니라, 매일 수업에서 안정적으로 쓰일 수 있도록 지원 체계를 함께 제공합니다.",
      },
    ],
  },
]

export function getPublicFaqItems(categoryKey?: PublicFaqCategoryKey) {
  return PUBLIC_FAQ_CATEGORIES
    .filter((category) => !categoryKey || category.key === categoryKey)
    .flatMap((category) => category.items)
}
