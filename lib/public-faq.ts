import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"

export type PublicFaqCategoryKey = "software" | "hardware" | "usage"

export type PublicFaqItem = {
  question: string
  answer: string
  guideHref?: string
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
    description: "Classin을 단순 화상수업 도구가 아니라 수업 시스템 OS로 도입할 때 가장 많이 확인하시는 내용을 정리했습니다.",
    highlights: ["수업 시스템 OS", "EDB·녹화·LMS", "관리자 데이터"],
    items: [
      {
        question: "Classin을 수업 시스템 OS라고 보는 이유는 무엇인가요?",
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
          `${CLASSIN_POSITIONING.apiStages.join(" ")} 실제 연동 가능 범위는 현재 시스템, 필요한 데이터, 계약과 공식 API 지원 범위를 확인한 뒤 설계해야 하며, 양방향 자동 동기화를 기본 제공한다고 단정할 수는 없습니다.`,
      },
      {
        question: "학원의 콘텐츠와 학생 데이터는 안전한가요?",
        answer:
          "보안 방식, 저장·처리 지역, 접근 권한과 보관·삭제 기준은 최신 개인정보 처리방침과 기관 계약을 기준으로 확인해야 합니다. 공개 FAQ에서는 암호화 방식이나 데이터 처리 위치를 추정해 보장하지 않으며, 도입 상담에서 필요한 확인 항목을 함께 정리해 드립니다.",
      },
      {
        question: "요금 체계는 어떻게 되나요?",
        answer:
          "기관 규모, 도입 대수, 전자칠판 모델, 카메라·스탠드/벽걸이, 소프트웨어와 설치·온보딩 범위에 따라 달라집니다. 최종 금액과 포함 품목은 최신 견적과 계약에서 확인하며, 공개 FAQ에서는 고정 가격이나 기본 포함 구성을 단정하지 않습니다.",
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
    highlights: ["공간별 모델 검토", "설치 조건 확인", "유지보수 범위 확인"],
    items: [
      {
        question: "Classin Board와 일반 전자칠판은 무엇이 다른가요?",
        answer:
          "일반 전자칠판이 화면 출력과 판서에 머무르는 경우가 많다면, Classin Board는 OPS와 Classin 소프트웨어를 통해 판서, EDB 교안, 녹화, 수업 자료 공유, LMS와 관리자 데이터까지 수업 운영 흐름으로 연결합니다.",
      },
      {
        question: "우리 교실에는 어떤 모델이 가장 잘 맞나요?",
        answer:
          "Classin Board는 여러 크기의 모델을 검토할 수 있지만, 모델 선택은 교실 크기만으로 확정하지 않습니다. 시야 거리, 수업 인원, 설치 방식, 벽면·전원 조건과 정확한 모델·세대를 확인한 뒤 최신 사양표와 견적으로 결정해야 합니다.",
      },
      {
        question: "설치에는 얼마나 걸리나요?",
        answer:
          "현장 환경 확인과 일정 조율 후 설치 계획을 잡습니다. 수업 공백을 최소화하는 방향으로 진행하고, 설치 직후 바로 활용할 수 있도록 교사 온보딩도 함께 지원합니다.",
      },
      {
        question: "별도 PC나 카메라를 따로 준비해야 하나요?",
        answer:
          "필요 장비는 선택한 보드 모델·세대와 수업 방식에 따라 달라집니다. PC·카메라·마이크의 포함 여부나 별도 준비 여부는 최신 모델 사양과 견적, 교실 환경을 확인한 뒤 안내합니다.",
      },
      {
        question: "Classin 소프트웨어와 어떻게 연동되나요?",
        answer:
          "보드와 Classin 소프트웨어의 연결 범위는 선택한 모델·계정·수업 설정에 따라 달라집니다. 판서, 녹화·복습, 출결·과제 같은 항목 중 필요한 흐름을 먼저 정하고, 자동 알림이나 외부 시스템 연동은 별도 지원 범위를 확인해야 합니다.",
      },
      {
        question: "판서와 수업 영상은 어떻게 저장되고 공유되나요?",
        answer:
          "판서는 PDF로, 수업 영상은 복습 가능한 형태로 저장되어 Classin 흐름 안에서 바로 공유할 수 있습니다. 수업이 끝난 뒤 따로 정리하고 업로드하는 일을 줄여주는 것이 핵심입니다.",
      },
      {
        question: "기존 칠판이나 빔프로젝터를 쓰던 교실에도 설치할 수 있나요?",
        answer:
          "설치 가능 여부는 현장 확인 전 확정할 수 없습니다. 벽면 강도, 전원·접지, 네트워크, 시야 거리, 환기와 이동 동선을 실측하고 모델별 설치 기준을 충족하는지 확인한 뒤 설치 방식을 결정합니다.",
      },
      {
        question: "도입 후 A/S와 운영 지원은 어떻게 진행되나요?",
        answer:
          "보증 기간, 원격 지원, 출장 A/S 가능 여부와 비용은 모델·구매 시점·계약에 따라 달라질 수 있습니다. 증상과 제품 식별정보를 접수한 뒤 최신 보증·유지보수 조건을 확인해 안내합니다.",
      },
    ],
  },
  {
    key: "usage",
    label: "사용법",
    eyebrow: "CS Guide FAQ",
    title: "실제 CS 캡처 순서로 보는 사용법",
    description:
      "검토된 사용 가이드의 화면 순서와 버튼명을 기준으로, 현장에서 자주 묻는 사용법을 짧게 정리했습니다.",
    highlights: ["현장 녹화", "QR 초대", "숙제 제출"],
    items: [
      {
        question: "현장 녹화 카메라는 어떤 순서로 설정하나요?",
        answer:
          "코스에서 새 수업을 만들고 학습 활동 유형을 수업으로 선택합니다. 수업 옵션에서 온스테이지 인원수를 1V0으로 설정하고 현장 녹화 토글을 켠 뒤 등록합니다. 교실 입장 전 카메라·마이크·스피커를 확인하고, 현장 녹화 알림에서 확인을 누른 다음 톱니바퀴 설정에서 녹화할 카메라를 선택해 바로 녹화하기를 누릅니다.",
        guideHref: "/docs/teacher/cs-field-recording-camera-setup",
      },
      {
        question: "코스 QR 초대 링크는 어디서 활성화하나요?",
        answer:
          "PC 코스 화면 좌측 상단의 코스 이름을 클릭한 뒤 코스 설정으로 들어갑니다. 코스 설정 페이지에서 코스 관리를 선택하고, 코스 관리 안의 코스 가입 허용 옵션을 활성화합니다. 이후 학생에게 QR 또는 초대 링크를 전달하면 코스 가입 안내가 가능합니다.",
        guideHref: "/docs/admin/cs-figma-digest-1195",
      },
      {
        question: "학생이 모바일에서 숙제를 사진으로 업로드하려면 어떻게 하나요?",
        answer:
          "학생은 모바일 앱에서 해당 코스를 선택하고 숙제 활동을 엽니다. 제출하기를 눌러 제출 작성을 시작한 뒤 화면 하단 사진 아이콘으로 촬영본이나 앨범 이미지를 첨부합니다. 첨부 미리보기와 제출 완료 상태까지 확인해야 합니다.",
        guideHref: "/docs/student/cs-homework-upload-mobile",
      },
      {
        question: "시험 문제를 대량 업로드하려면 어떤 순서로 진행하나요?",
        answer:
          "코스에서 새로 만들기를 누르고 시험을 선택합니다. 새 시험 추가 화면에서 시험 문제 대량 추가를 클릭한 뒤 워드 또는 엑셀 템플릿을 내려받아 형식에 맞게 작성합니다. 템플릿 업로드 후 문제 인식 결과를 확인하고 실패 항목을 수정한 다음, 필요하면 내 문제 은행 저장을 체크하고 게시합니다.",
        guideHref: "/docs/teacher/cs-bulk-exam-upload",
      },
    ],
  },
]

export function getPublicFaqItems(categoryKey?: PublicFaqCategoryKey) {
  return PUBLIC_FAQ_CATEGORIES
    .filter((category) => !categoryKey || category.key === categoryKey)
    .flatMap((category) => category.items)
}
