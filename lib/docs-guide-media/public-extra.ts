import type { DocMedia } from "@/lib/docs"

import type { GuideMediaMap } from "./types"

// 키: "<카테고리>/<slug>" → 섹션 제목(heading) → 그 섹션 아래 붙일 화면.
// /docs/files/guides/ 아래 이미지는 scripts/docs-guide-shots/public-extra.json 으로 만든다(원본·자른 위치·가린 영역 기록).
// /images/... 는 공개 사이트에서 이미 쓰는 개념도·제품 이미지를 그대로 쓴다.
// 다른 그룹이 만든 /docs/files/guides/ 화면은 같은 화면을 다시 쓰는 경우에만 가져온다.
const G = "/docs/files/guides"
const DIAGRAMS = "/images/docs/diagrams"
const HW = "/images/product/hw"

function img(src: string, width: number, height: number, alt: string, caption: string): DocMedia {
  return { type: "image", src, alt, caption, width, height }
}

const LESSON_OS_MAP = (caption: string) =>
  img(
    `${DIAGRAMS}/lesson-os-map.svg`,
    1440,
    760,
    "수업 전 EDB 교안 준비·수업 예약, 수업 중 전자칠판 판서·녹화·수업 도구, 수업 후 다시보기 복습·LMS 숙제·시험·관리자 데이터가 한 흐름으로 이어지는 개념도",
    caption,
  )

const ADOPTION_ROUTINE = (caption: string) =>
  img(
    `${DIAGRAMS}/adoption-routine.svg`,
    1440,
    760,
    "전자칠판 판서, 수업 녹화, 다시보기 복습, LMS 숙제·시험이 차례로 이어진 뒤 다시 판서로 돌아오는 매주 반복 수업 루틴 다이어그램",
    caption,
  )

const VERIFICATION_EDIT = (caption: string) =>
  img(
    `${G}/account-verification/02-verification-edit.webp`,
    1000,
    915,
    "관리자용 대시보드 [계정 정보] > [인증 자료] 화면. 인증 상태와 [편집] 버튼 아래로 브랜드 이름, 소재지, 담당자 정보, 인증 방식 칸이 보입니다.",
    caption,
  )

const STORAGE_SETTINGS = (caption: string) =>
  img(
    `${G}/institution-settings/04-storage-settings.webp`,
    1039,
    499,
    "관리자용 대시보드 [계정 정보] > [일반 설정]의 [저장 설정] 탭. 리소스 자동 삭제 설정 아래 녹화된 코스 비디오, 수업 감독 이미지, 칠판 내용 및 수업자료 자동 삭제 토글이 꺼져 있습니다.",
    caption,
  )

export const PUBLIC_EXTRA_GUIDE_MEDIA: GuideMediaMap = {
  // ── 빠른 시작 ───────────────────────────────────────────────
  "start/customer-stories": {
    "국어 학원은 첨삭 기록을 상담 근거로 씁니다": [
      img(
        `${G}/customer-stories/01-cheongju-korean-classroom.webp`,
        768,
        737,
        "앞쪽 벽 가운데에 클래스인 보드를 두고 양옆에 화이트보드를 이어 단 국어 학원 강의실",
        "청주 이** 국어 학원 강의실입니다. 화이트보드 사이에 클래스인 보드를 두고 수업합니다.",
      ),
    ],
    "과학 학원은 흩어진 평가 기록을 한곳에 모았습니다": [
      img(
        `${G}/customer-stories/02-busan-science-class.webp`,
        972,
        333,
        "강사가 나란히 건 보드 두 대에 걸쳐 풀이를 이어 쓰는 강의실 앞쪽",
        "부산 과** 학원 수업 장면입니다. 보드 두 대에 풀이를 이어 쓰며 설명합니다.",
      ),
    ],
    "입시 학원은 판서와 풀이를 복습 자료로 남깁니다": [
      img(
        `${G}/customer-stories/03-daechi-board-answers.webp`,
        1116,
        557,
        "보드 왼쪽에 문제지를, 오른쪽에 학생별 손글씨 풀이를 칸마다 모아 띄우고 강사가 그 앞에서 풀이를 살펴보는 수업 장면. 학생 이름은 가렸습니다.",
        "대치 세** 수업 장면입니다. 학생들이 각자 쓴 풀이를 보드 한 화면에 모아 놓고 함께 짚습니다.",
      ),
    ],
    "온라인 학원은 비대면 수업의 참여 흐름을 봅니다": [
      img(
        `${G}/customer-stories/04-online-game-activity.webp`,
        1200,
        673,
        "온라인 교실 칠판에 바둑판 두 개와 바둑돌 통을 띄운 수업 화면. 위쪽 참여자 영상과 학생 이름은 가렸습니다.",
        "12인 에** 학원의 온라인 수업 화면입니다. 칠판 위 바둑판에 돌을 놓는 게임형 활동으로 학생이 직접 참여합니다.",
      ),
    ],
    "하이브리드 강의실은 교실 환경을 하나로 맞췄습니다": [
      img(
        `${G}/customer-stories/05-cheonan-hybrid-classroom.webp`,
        1200,
        675,
        "앞쪽 벽에 클래스인 보드 두 대를 나란히 걸고 칸막이 책상을 배치한 강의실",
        "천안 제** 학원 강의실입니다. 클래스인 보드 두 대를 나란히 걸어 강의실 구성을 맞췄습니다.",
      ),
    ],
  },

  "start/why-classin-needs": {
    "도구가 흩어지면 강사 시간과 운영비가 샙니다": [
      LESSON_OS_MAP("수업 준비, 판서, 녹화, 복습, 과제, 관리 데이터가 따로 흩어지지 않고 한 흐름으로 이어지는 구조입니다."),
    ],
    "그냥 줌을 쓰면 안 되나요?": [
      ADOPTION_ROUTINE("판서, 녹화, 다시보기 복습, LMS 숙제·시험이 클래스인 안에서 매주 한 바퀴로 이어집니다."),
    ],
  },

  "start/company-overview": {
    "한 줄 소개": [
      LESSON_OS_MAP("수업 전·중·후가 끊기지 않고 한 흐름으로 이어지는 것이 수업 시스템 OS라는 말의 뜻입니다."),
    ],
    "EEO는 어떤 회사인가요": [
      img(
        `${G}/company-overview/01-eeo-product-family.webp`,
        1200,
        711,
        "EEO(empower education online) 로고 아래에 Classin, Classin X, TeacherIn, Flowin, NOBOOK 제품 로고가 나란히 있는 이미지",
        "EEO 제품군입니다. 한국에서는 Classin 소프트웨어와 Classin X(국내명 Classin Board)를 제공합니다.",
      ),
    ],
    "무엇을 하는 서비스인가": [
      ADOPTION_ROUTINE("한국 학원은 보통 전자칠판 판서, 녹화, 다시보기 복습, LMS 숙제·시험 순서로 씁니다."),
    ],
  },

  "start/pre-adoption-faq-22-questions": {
    "녹화·과제·스토리지": [
      img(
        `${DIAGRAMS}/lesson-options.svg`,
        1440,
        760,
        "수업 녹화, 현장 녹화, 온스테이지, 하이브리드 수업 네 가지 수업 옵션을 나란히 비교한 그림. 수업 녹화와 현장 녹화는 다시보기에서 골라 볼 수 있다고 표시돼 있습니다.",
        "수업 녹화는 칠판·자료 화면을, 현장 녹화는 교실 카메라 화면을 남깁니다. 다시보기에서 둘을 골라 봅니다.",
      ),
      STORAGE_SETTINGS("자동 삭제는 관리자 콘솔 [계정 정보] > [일반 설정] > [저장 설정]에서 켜고 끕니다. 기본은 모두 꺼져 있습니다."),
    ],
  },

  // ── 소프트웨어·하드웨어 ─────────────────────────────────────
  "software/software-pricing-quote-bundle-faq": {
    "결제한 다음에 할 일": [
      VERIFICATION_EDIT("결제 후 [계정 정보] > [인증 자료]에서 [편집]을 눌러 학원 정보와 증명서를 올립니다."),
    ],
  },

  "hardware/hardware-spec-installation-faq": {
    "모델별 주요 사양": [
      img(
        `${G}/hardware-spec-installation-faq/01-lineup-sizes.webp`,
        1200,
        655,
        "65·75·86·110인치 Classin Board를 이동형 스탠드에 나란히 세워 화면 크기를 비교한 제품 이미지",
        "S65, S75, S86, S110 네 가지 크기입니다. 교실 규모에 맞춰 고릅니다.",
      ),
    ],
    "설치 방식과 현장 조건": [
      img(
        `${HW}/hero/hero-board-stand.webp`,
        1536,
        1024,
        "바퀴 달린 이동형 스탠드에 올린 Classin Board",
        "이동형 스탠드는 설치와 이동이 쉽지만, 다리가 보드 앞 공간을 차지합니다.",
      ),
      img(
        `${HW}/board/board-side-profile.webp`,
        1408,
        768,
        "벽에 붙여 건 Classin Board를 옆에서 본 이미지",
        "벽걸이는 벽이나 기존 칠판 위에 브래킷으로 고정합니다. 석고보드 벽면은 합판 보강이 필요합니다.",
      ),
    ],
    "설치한 뒤 관리": [
      img(
        `${HW}/details/bezel-closeup.webp`,
        1536,
        1024,
        "Classin Board 화면 모서리와 테두리(베젤)를 가까이서 본 이미지",
        "적외선 터치는 화면 테두리(베젤)에서 손과 펜을 읽습니다. 테두리에 먼지가 끼면 터치가 튀니 주기적으로 닦습니다.",
      ),
    ],
  },

  // ── 업데이트 ───────────────────────────────────────────────
  "updates/classin-ai-feature-guide-published": {
    "AI 기능 소개서를 추가했습니다": [
      img(
        `${G}/classin-ai-lesson-analysis/01-replay-ai-analysis.webp`,
        1200,
        791,
        "수업 다시보기 창 오른쪽 [AI 강의 분석] 탭. 종합 점수와 수업 참여 품질, 상호작용의 학습 촉진, 교수 설계 및 리듬, 언어 표현 및 감화력 영역별 점수가 보입니다.",
        "AI 강의 분석은 수업 다시보기의 [AI 강의 분석]에서 종합 점수와 영역별 점수를 보여 줍니다.",
      ),
    ],
    "우리 학원의 사용 조건을 확인하세요": [
      img(
        `${G}/classin-ai-blackboard-609/01-open-ai-blackboard.webp`,
        1000,
        863,
        "교실 오른쪽 도구 막대의 [수업 도구]를 눌러 연 도구 모음에서 [AI 칠판]을 강조한 화면",
        "활성화된 뒤에는 교실 [수업 도구]에서 [AI 칠판]을 엽니다.",
      ),
      img(
        `${G}/classin-609-update/01-agentin-menu.webp`,
        900,
        664,
        "교실 오른쪽 도구 막대 맨 아래 AI 버튼을 눌러 연 메뉴. 자막 번역 아래에 [AgentIn 에이전트] 항목이 강조돼 있습니다.",
        "교실 안 AgentIn은 도구 막대 맨 아래 AI 버튼을 누르고 [AgentIn 에이전트]를 고릅니다.",
      ),
    ],
  },

  // ── 관리자 ─────────────────────────────────────────────────
  "admin/billing-upgrade": {
    "전환 직후에 할 일": [
      VERIFICATION_EDIT("[계정 정보] > [인증 자료]에서 [편집]을 눌러 인증을 신청합니다. 처리가 끝나면 인증 상태가 '인증됨'으로 바뀝니다."),
      STORAGE_SETTINGS("[계정 정보] > [일반 설정] > [저장 설정]에서 자동 삭제 기간을 정합니다. 기본은 꺼져 있습니다."),
    ],
  },
}
