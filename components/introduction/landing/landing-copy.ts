// 대표 랜딩(/introduction) 전용 문구 — 시안 1 「편집 지면」(2026-11-06 운영자 선택)에서 새로 쓴 헤드라인·요약.
// 사실·수치는 lib/introduction/content.ts 에 있는 것만 쓴다(그 파일이 원천이고 수정은 리드 몫이다).
// 사례 수·분류별 수는 INTRO_CASES 에서 센다 — 사례를 더하면 제목·색인 숫자가 함께 바뀐다.
// 화면 숫자를 .tsx 에 글자로 쓰지 않고 여기 둔다(가드 numeric-claim).

import {
  INTRO_CASES,
  INTRO_CASES_PATH,
  INTRO_CASE_VIDEOS,
  INTRO_DOWNLOADS,
  INTRO_FINAL_CTA,
  INTRO_HERO,
  INTRO_PATH,
  INTRO_SMART_CLASSROOM,
  INTRO_SOFTWARE,
  getIntroCase,
  getIntroCasePath,
  type IntroCaseSector,
  type IntroVideo,
} from "@/lib/introduction/content"

const CONTACT_HREF = INTRO_FINAL_CTA.primary.href
const SHOWROOM_HREF = INTRO_FINAL_CTA.secondary.href

const SECTORS: IntroCaseSector[] = ["공교육", "사교육", "기타교육"]
const CASE_TOTAL = INTRO_CASES.length
const casesIn = (sector: IntroCaseSector) => INTRO_CASES.filter((item) => item.sector === sector)

// ─── 검색 제목·설명 ───────────────────────────────────────────────────────────
// positioning §11: 범주어 대신 무엇·이득을 말하는 설명형, 검색어(클래스인·학원 전자칠판·수업 녹화·AI)를 남긴다. 타사 비교 0.

export const LANDING_META = {
  title: "클래스인 서비스 소개 — 학원 전자칠판·수업 녹화·AI 교육 플랫폼",
  description:
    "클래스인은 실시간 판서 수업, 별도 설비 없는 자동 수업 녹화, 과제·시험 LMS, AI 튜터를 한 흐름으로 잇는 AI 교육 플랫폼입니다. 학원 전자칠판과 AI 카메라·마이크로 꾸리는 스마트 교실 클래스인 X, 학원·학교 도입 사례와 소개서 PDF를 한 페이지에서 확인하세요.",
  keywords: [
    "클래스인",
    "ClassIn",
    "클래스인 소개서",
    "학원 전자칠판",
    "수업 녹화",
    "AI 교육 플랫폼",
    "AI 튜터",
    "스마트 교실",
    "하이브리드 수업",
  ],
  /** JSON-LD WebPage·Breadcrumb 이름 — 사례 쪽 Breadcrumb(서비스 소개서)과 같은 이름 */
  pageName: "서비스 소개서",
}

// ─── Hero + 수업 운영 흐름 ────────────────────────────────────────────────────

export const LANDING_HERO = {
  eyebrow: INTRO_HERO.eyebrow,
  title: INTRO_HERO.title,
  lead: "수업과 학습 관리의 모든 것을 담은, 가장 교실다운 AI 교육 솔루션입니다. 수업 플랫폼 클래스인과 AI 스마트 교실 클래스인 X로 온라인·오프라인·하이브리드 수업을 하나로 운영합니다.",
  image: INTRO_HERO.image,
  primary: { label: "도입 상담 신청", href: CONTACT_HREF, ctaId: "introduction_hero_contact" },
  pdf: { label: "소개서 PDF", download: INTRO_DOWNLOADS.introduction, ctaId: "introduction_hero_pdf" },
  showroom: {
    before: "실제 수업 흐름을 직접 써 보고 싶다면",
    label: "목동 쇼룸 방문 예약",
    href: SHOWROOM_HREF,
    ctaId: "introduction_hero_showroom",
  },
}

export const LANDING_FLOW = {
  label: "수업 운영 흐름",
  note: "수업 전·중·후가 한 플랫폼에서 이어집니다.",
  steps: [
    { title: "수업 준비", body: "드라이브의 수업 자료를 바로 칠판으로 불러옵니다." },
    { title: "실시간 수업", body: "30여 가지 수업 도구와 최대 50페이지 칠판으로 가르칩니다." },
    { title: "자동 녹화", body: "별도 설비 없이 칠판과 카메라를 함께 녹화합니다." },
    { title: "과제·시험", body: "LMS로 수업 전·후 학습을 이어 갑니다." },
    { title: "데이터·AI", body: "출결·성적이 쌓이고, AI가 개별 피드백을 돕습니다." },
  ],
}

// ─── 01 클래스인 ─────────────────────────────────────────────────────────────

/**
 * 특장점 화면이 매트에 앉는 방식.
 * - cutout: 배경이 투명한 제품 화면(PNG 알파) — 흰 받침 없이 sunken 매트에 바로 놓는다.
 * - capture: 흰 바탕 화면 캡처 — V16 대로 sheet + hair 로 판을 세운다(흰 위 흰 경계가 사라지지 않게).
 */
export type LandingMatKind = "cutout" | "capture"
const FALLBACK_MAT: LandingMatKind = "capture"

const FEATURE_POINTS: Record<string, { mat: LandingMatKind; points: string[] }> = {
  teach: {
    mat: "cutout",
    points: [
      "수업을 위한 30여 가지 실시간 수업 도구",
      "총 50페이지의 디지털 판서",
      "강사와 학생 모두 판서하는 인터랙티브 수업",
    ],
  },
  materials: {
    mat: "capture",
    points: [
      "개인 + 공유 드라이브, 세부 권한으로 저작권 보호",
      "별도 설비 없는 자동 녹화, 칠판/카메라 듀얼 녹화",
      "녹화본은 앱 안에서만 열람",
    ],
  },
  manage: {
    mat: "capture",
    points: ["녹화 수업·숙제·시험을 묶은 LMS 통합 학습 관리", "표준화된 커리큘럼 제작과 배포", "관리를 위한 실시간 모니터링"],
  },
  data: {
    mat: "cutout",
    points: ["출결·성적·녹화본·스크린샷 자동 저장", "한눈에 파악하는 관리자 대시보드", "기관 내 시스템과 API 연동"],
  },
  ai: {
    mat: "capture",
    points: [
      "기관만의 맞춤형 AI 에이전트와 AI 튜터",
      "학습 분석 기반 개인화 피드백",
      "음성 명령으로 칠판을 다루는 AI 음성 어시스턴트",
    ],
  },
  anywhere: {
    mat: "cutout",
    points: ["PC를 넘어 전자칠판까지", "휴대폰·태블릿 BYOD, iOS / Android 모두 지원", "온·오프라인 통합 하이브리드 수업"],
  },
}

export const LANDING_SOFTWARE = {
  id: INTRO_SOFTWARE.id,
  folio: "01",
  kicker: "클래스인",
  title: "미팅이 아닌, 수업을 위해 설계한 플랫폼",
  lead: INTRO_SOFTWARE.lead,
  stats: [
    { value: "30", unit: "여 가지", label: "실시간 수업 도구", note: "칠판·퀴즈·손들기·타이머 등" },
    { value: "2,000", unit: "명", label: "한 수업 최대 참여 인원" },
    { value: "49", unit: "개", label: "학생 카메라 동시 송출" },
    { value: "50", unit: "페이지", label: "디지털 판서 칠판(최대)" },
  ],
  features: {
    folio: "01.1",
    kicker: INTRO_SOFTWARE.featuresTitle,
    title: "수업에서 관리까지, 여섯 가지 장면",
    items: INTRO_SOFTWARE.features.map((feature) => ({
      id: feature.id,
      title: feature.title,
      image: feature.media,
      mat: FEATURE_POINTS[feature.id]?.mat ?? FALLBACK_MAT,
      points: FEATURE_POINTS[feature.id]?.points ?? [],
    })),
  },
  more: {
    folio: "01.2",
    kicker: INTRO_SOFTWARE.moreTitle,
    video: INTRO_SOFTWARE.video,
    pdf: {
      download: INTRO_DOWNLOADS.introduction,
      title: INTRO_DOWNLOADS.introduction.label,
      body: "클래스인 소프트웨어·하드웨어·도입 사례를 담은 전체 소개 자료입니다.",
      label: "소개서 PDF 받기",
      ctaId: "introduction_software_pdf",
    },
    // 문서형 소개서 원문(/introduction/full)으로 가는 링크
    full: { label: "소개서 전체 보기", href: `${INTRO_PATH}/full`, ctaId: "introduction_full_link" },
  },
}

// ─── 02 클래스인 X ───────────────────────────────────────────────────────────

const SMART_BODIES: Record<string, string> = {
  lecture: "학생이 전자칠판 앞에서 직접 판서하며 발표합니다. 교사·학생 누구나 손쉽게 화면을 조작할 수 있습니다.",
  review: "학생이 태블릿 개인 칠판에 쓴 풀이를 강사가 실시간으로 확인하고 바로 첨삭합니다.",
  hybrid:
    "교실 학생과 원격 참여 학생이 한 화면에서 함께 수업합니다. 8개 배열 마이크와 AI 음성 추적 카메라가 음성·영상을 지원합니다.",
}

export const LANDING_SMART_CLASSROOM = {
  id: INTRO_SMART_CLASSROOM.id,
  folio: "02",
  kicker: "클래스인 X",
  title: "전자칠판부터 천장 마이크까지, 클래스인과 연결된 AI 스마트 교실",
  lead: `${INTRO_SMART_CLASSROOM.lead} 현장 강의부터 온라인 강의, 그룹 학습, 하이브리드 강의까지 다양한 교육 환경에서 쓰입니다.`,
  diagram: { ...INTRO_SMART_CLASSROOM.hero, caption: "클래스인 하이브리드 교실 구성도" },
  setup: {
    label: "교실 구성",
    items: [
      { term: "전자칠판(IFP)", detail: "65 / 75 / 86 / 110인치 · 4K 해상도 · 멀티터치 · 지문·눈부심 방지" },
      { term: "AI 모션 트래킹 카메라", detail: "자동 줌 & 트래킹 · 교사·학생 전용 카메라 구분" },
      { term: "천장 AI 마이크", detail: "32마이크 어레이 · 80㎡ 수음 · AGC+AEC+ANS 내장" },
      { term: "ClassIn 플랫폼", detail: "판서 · 강의 녹화 · 과제·평가 · 실시간 출석 · LMS 연동" },
    ],
  },
  features: {
    folio: "02.1",
    kicker: INTRO_SMART_CLASSROOM.featuresTitle,
    title: "교실에서 달라지는 세 가지 수업",
    items: INTRO_SMART_CLASSROOM.features.map((feature) => ({
      id: feature.id,
      titleLines: feature.title,
      image: feature.images[0],
      body: SMART_BODIES[feature.id] ?? "",
    })),
  },
  spec: {
    folio: "02.2",
    kicker: "전자칠판 사양",
    note: "ClassIn X 전자칠판의 터치·필기·내장 장비",
    title: "차원이 다른 터치 & 필기 감도",
    tableLabel: "ClassIn X 전자칠판 주요 사양",
    columns: ["항목", "ClassIn X", "수업에서"] as const,
    rows: [
      ["터치 반응 속도", "2ms", "종이에 쓰는 듯한 자연스러운 필기감"],
      ["필기 인식 속도", "0.03~0.06초", "초저지연 필기 인식"],
      ["멀티터치", "50포인트", "네 손가락으로 툴바 호출, 두 손가락으로 전환, 손등으로 지우기"],
      ["디스플레이", "풀 라미네이션 · AG+AF 유리", "빛 반사를 줄이고 눈부심·지문을 막는 선명한 화면"],
      ["칠판", "최대 50페이지 무한 스크롤", "연속 강의, 판서 히스토리 보존"],
      ["내장 마이크·카메라", "8개 배열 마이크 · AI 음성 추적 카메라", "원격수업·실시간 발표의 음성·영상 지원"],
      ["PC · 로그인", "OPS PC 내장 · NFC 로그인", "별도 장비 없는 올인원 구성, 강사 환경 빠른 셋업"],
    ] satisfies Array<[string, string, string]>,
    proposal: {
      download: INTRO_DOWNLOADS.smartClassroom,
      title: INTRO_DOWNLOADS.smartClassroom.label,
      body: "ClassIn X 전자칠판·카메라·마이크 구성과 스펙을 정리한 제안서입니다.",
      label: "제안서 PDF",
      ctaId: "introduction_smart_classroom_pdf",
    },
  },
}

// ─── 03 고객 사례 ────────────────────────────────────────────────────────────

const [RECORDING_GROUP, TABLET_GROUP] = INTRO_CASE_VIDEOS.groups
const isPortrait = (video: IntroVideo) => video.kind === "file" && video.orientation === "portrait"

export interface LandingCaseVideo {
  video: IntroVideo
  name: string
  href: string
}

/** 사례 상세 본문의 첫 영상(기관 영상). 원천은 INTRO_CASES[].body 다. */
function caseVideo(slug: string): LandingCaseVideo | null {
  const item = getIntroCase(slug)
  const block = item?.body.find((entry) => entry.type === "video")
  if (!item || block?.type !== "video") return null
  return { video: block.video, name: item.name, href: getIntroCasePath(item.slug) }
}

const TEXTBOOK_CASE = "dongincheon-jongro-m"

export const LANDING_CASES = {
  id: INTRO_CASE_VIDEOS.id,
  folio: "03",
  kicker: INTRO_CASE_VIDEOS.title,
  title: `공교육부터 학원까지, 클래스인을 쓰는 ${CASE_TOTAL}곳의 교실`,
  lead: `강의 녹화와 화판 수업 영상, 그리고 도입 기관의 교실 사진입니다. ${SECTORS.map(
    (sector) => `${sector} ${casesIn(sector).length}곳`
  ).join(", ")}의 사례를 모았습니다.`,
  recording: {
    title: RECORDING_GROUP.title,
    body: "전자칠판과 카메라로 선명한 수업 영상을 녹화합니다. 칠판 화면도 별도로 녹화되어 편집에 활용할 수 있습니다.",
    videos: RECORDING_GROUP.videos,
  },
  tablet: {
    title: TABLET_GROUP.title,
    body: "학생의 필기를 실시간으로 확인하고 첨삭하는 [개인 칠판] 기능을 활용합니다. 정율사관학원, 과사람학원, 세정학원 등이 이 수업 방식을 채택하고 있습니다.",
    videos: TABLET_GROUP.videos.filter((video) => !isPortrait(video)),
  },
  textbook: {
    title: "디지털 교과서 수업",
    body: "동인천종로엠학원은 디지털 교과서와 태블릿으로 학생과 선생님이 함께 소통하는 양방향 수업을 진행합니다.",
    videos: TABLET_GROUP.videos.filter(isPortrait),
    link: { label: "동인천종로엠 사례 보기", href: getIntroCasePath(TEXTBOOK_CASE) },
  },
  institutions: {
    title: "도입 기관 영상",
    body: "클래스인 스마트 교실을 갖춘 학원의 모습과 시스템 활용을 영상으로 확인하세요.",
    items: ["bucheon-jungyul", "busan-gwasaram"]
      .map(caseVideo)
      .filter((item): item is LandingCaseVideo => item !== null),
    linkLabel: "사례 보기",
  },
  featured: {
    folio: "03.1",
    kicker: "도입 기관",
    title: "교실 사진으로 보는 도입 사례",
    linkLabel: "사례 보기",
    items: [
      "korea-digital-media-high-school",
      "bucheon-jungyul",
      "busan-gwasaram",
      "acts-university",
      "korea-hakwon-university",
      TEXTBOOK_CASE,
    ].flatMap((slug) => {
      const item = getIntroCase(slug)
      return item ? [item] : []
    }),
  },
  index: {
    folio: "03.2",
    kicker: "사례 색인",
    note: `${CASE_TOTAL}곳 · 분류별`,
    groups: SECTORS.map((sector) => ({ sector, count: `${casesIn(sector).length}곳`, items: casesIn(sector) })),
    all: { label: `고객 사례 ${CASE_TOTAL}곳 모두 보기`, href: INTRO_CASES_PATH, ctaId: "introduction_cases_all" },
  },
}

// ─── 04 도입 문의 ────────────────────────────────────────────────────────────

export const LANDING_FINAL = {
  id: "introduction-contact",
  folio: "04",
  kicker: "도입 문의",
  title: INTRO_FINAL_CTA.title,
  lead: "도입 상담, 쇼룸 체험, 자료 검토 중 편한 방법으로 시작하세요.",
  contact: {
    title: "도입 상담",
    body: "교실 수, 수업 방식, 이미 쓰는 장비를 알려 주시면 맞는 구성과 도입 순서를 함께 정리해 드립니다.",
    label: INTRO_FINAL_CTA.primary.label,
    href: CONTACT_HREF,
    ctaId: "introduction_final_contact",
  },
  showroom: {
    title: "목동 쇼룸",
    body: "목동 쇼룸에서는 실제 수업 흐름을 직접 써 볼 수 있습니다.",
    label: "쇼룸 방문 예약",
    href: SHOWROOM_HREF,
    ctaId: "introduction_final_showroom",
  },
  materials: {
    title: "자료 받기",
    body: "서비스 소개서와 AI 스마트 교실 제안서를 PDF로 받아 검토하세요.",
    links: [
      { download: INTRO_DOWNLOADS.introduction, label: "서비스 소개서 PDF", ctaId: "introduction_final_pdf_introduction" },
      {
        download: INTRO_DOWNLOADS.smartClassroom,
        label: "AI 스마트 교실 제안서 PDF",
        ctaId: "introduction_final_pdf_smart_classroom",
      },
    ],
  },
}
