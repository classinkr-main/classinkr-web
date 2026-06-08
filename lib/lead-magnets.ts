export type LeadMagnetStatus = "draft" | "review" | "unlisted"

export type LeadMagnetSourceDetail =
  | "lead_magnet:academy-system-checklist"
  | "lead_magnet:electronic-whiteboard-classroom-checklist"

export interface LeadMagnet {
  slug: string
  title: string
  audience: string
  status: LeadMagnetStatus
  sourceDetail: LeadMagnetSourceDetail
  blogTone: string
  guideTone: string
  checklistBullets: readonly string[]
  ctaCopy: {
    eyebrow: string
    title: string
    body: string
    buttonLabel: string
  }
  suggestedPlacements: readonly string[]
}

export const leadMagnets = [
  {
    slug: "academy-system-checklist",
    title: "학원 운영 시스템 점검 체크리스트",
    audience: "원장, 실장, 운영팀 리더",
    status: "review",
    sourceDetail: "lead_magnet:academy-system-checklist",
    blogTone:
      "수업, 과제, 상담, 결제, 리포트가 따로 움직일 때 생기는 운영 누수를 짚고, 원장이 바로 확인할 수 있는 점검 항목으로 연결합니다.",
    guideTone:
      "학원 내부 프로세스를 수강생 여정 기준으로 정리하고, 현재 쓰는 도구가 어떤 업무를 덜어주는지 차분하게 비교할 수 있도록 안내합니다.",
    checklistBullets: [
      "신규 문의부터 등록까지 담당자, 응답 기준, 이탈 기록이 남는가",
      "수업 출결, 과제, 보강, 상담 이력이 학생별로 이어져 보이는가",
      "학부모에게 보내는 리포트와 알림이 수업 기록에서 바로 만들어지는가",
      "반 변경, 휴원, 환불, 재등록 같은 예외 업무가 담당자 기억에 의존하지 않는가",
      "운영 지표를 주간 단위로 확인해 다음 액션을 정할 수 있는가",
    ],
    ctaCopy: {
      eyebrow: "운영 점검 자료",
      title: "우리 학원의 시스템 누수를 10분 안에 확인하세요",
      body: "수업 운영, 상담, 학부모 커뮤니케이션, 매출 흐름을 한 장으로 점검할 수 있는 내부 검토용 체크리스트입니다.",
      buttonLabel: "체크리스트 미리보기",
    },
    suggestedPlacements: [
      "학원 운영 자동화 관련 블로그 본문 하단",
      "관리자용 CRM 리드 태그: 운영 개선 관심",
      "상담 후속 이메일의 자료 다운로드 CTA",
      "학원 관리 솔루션 비교 가이드 사이드 CTA",
    ],
  },
  {
    slug: "electronic-whiteboard-classroom-checklist",
    title: "전자칠판 교실 구축 체크리스트",
    audience: "학원 원장, 캠퍼스 매니저, 강의실 구축 담당자",
    status: "draft",
    sourceDetail: "lead_magnet:electronic-whiteboard-classroom-checklist",
    blogTone:
      "전자칠판을 단순 장비 구매가 아니라 수업 흐름, 판서 저장, 학생 참여, 설치 환경까지 함께 결정해야 하는 교실 운영 선택지로 설명합니다.",
    guideTone:
      "강의실 규모와 수업 방식에 맞춰 화면 크기, 판서 도구, 연결 방식, 설치 조건, 유지보수 기준을 하나씩 확인하도록 돕습니다.",
    checklistBullets: [
      "강의실 거리와 좌석 배치에 맞는 화면 크기와 해상도를 정했는가",
      "판서 저장, 자료 불러오기, 녹화, 실시간 공유가 수업 방식에 맞는가",
      "노트북, 태블릿, 카메라, 마이크 등 기존 장비와 연결 테스트가 가능한가",
      "벽면, 전원, 네트워크, 이동 동선 등 설치 조건을 사전에 확인했는가",
      "교사 온보딩, 장애 대응, 보증 범위, 교체 기준이 문서화되어 있는가",
    ],
    ctaCopy: {
      eyebrow: "교실 구축 자료",
      title: "전자칠판 도입 전에 확인할 항목을 정리하세요",
      body: "수업 품질과 설치 리스크를 함께 검토할 수 있도록 만든 전자칠판 교실 구축 체크리스트입니다.",
      buttonLabel: "구축 체크리스트 보기",
    },
    suggestedPlacements: [
      "Classin Board 제품 소개 페이지 중간 CTA",
      "전자칠판 비교 블로그의 제품 선택 섹션",
      "하드웨어 견적 상담 신청 전 단계",
      "설치 일정 안내 이메일의 사전 준비 자료",
    ],
  },
] as const satisfies readonly LeadMagnet[]

export function getLeadMagnetStatusLabel(status: LeadMagnetStatus) {
  if (status === "review") return "리뷰"
  if (status === "unlisted") return "링크 공개"
  return "초안"
}
