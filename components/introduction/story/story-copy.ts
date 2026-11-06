// /introduction/story(시안 4 · 문제→해결 스토리) 전용 문구.
// 사실·숫자는 lib/introduction/content.ts 에 있는 것만 쓴다 — 표·사례 수·영상·사진은 거기서 꺼내 쓰고,
// 여기에는 이 페이지에서 새로 쓴 헤드라인과 문장 순서만 둔다. **굵게** 는 Emphasis 가 강조로 그린다.
// 상황별 전달 자료라 검색에 내지 않는다(noindex, sitemap 제외) — 대표 랜딩은 /introduction 이다.

import type { IntroAssetKey } from "@/lib/introduction/assets"
import {
  INTRO_CASE_VIDEOS,
  INTRO_CASES,
  INTRO_CASES_PATH,
  INTRO_DOWNLOADS,
  INTRO_FINAL_CTA,
  INTRO_HERO,
  INTRO_PATH,
  INTRO_SMART_CLASSROOM,
  INTRO_SOFTWARE,
  getIntroCase,
  type IntroBlock,
  type IntroCase,
  type IntroCaseSector,
  type IntroDownload,
  type IntroTable,
  type IntroVideo,
} from "@/lib/introduction/content"

export const STORY_PATH = `${INTRO_PATH}/story`
/** 계측 source 값(click_cta·download_materials·view_demo_video) */
export const STORY_SOURCE = "introduction_story"

export const STORY_HREF = {
  contact: INTRO_FINAL_CTA.primary.href,
  showroom: INTRO_FINAL_CTA.secondary.href,
  overview: INTRO_PATH,
  cases: INTRO_CASES_PATH,
} as const

/** CTA 계측 id — 대표 랜딩(introduction_*)·사례 중심(introduction_proof_*)과 겹치지 않게 introduction_story_* 로 둔다 */
export const STORY_CTA = {
  heroContact: "introduction_story_hero_contact",
  heroPdf: "introduction_story_hero_pdf",
  barShowroom: "introduction_story_bar_showroom",
  barContact: "introduction_story_bar_contact",
  evidencePdf: "introduction_story_evidence_pdf",
  evidenceContact: "introduction_story_evidence_contact",
  solutionShowroom: "introduction_story_solution_showroom",
  solutionContact: "introduction_story_solution_contact",
  classroomPdf: "introduction_story_classroom_pdf",
  classroomShowroom: "introduction_story_classroom_showroom",
  caseDetail: "introduction_story_case_detail",
  caseList: "introduction_story_case_list",
  casesAll: "introduction_story_cases_all",
  finalContact: "introduction_story_final_contact",
  finalShowroom: "introduction_story_final_showroom",
  finalPdf: "introduction_story_final_pdf",
  finalProposalPdf: "introduction_story_final_proposal_pdf",
  finalOverview: "introduction_story_final_overview",
} as const

// ─── content.ts 에서 꺼내 쓰는 도우미 — 원천이 바뀌어 못 찾으면 빌드를 멈춘다(빈 표를 조용히 그리지 않는다) ───

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`[introduction/story] content.ts 에서 ${what} 을(를) 찾지 못했습니다.`)
  return value
}

function findTable(blocks: readonly IntroBlock[], title: string): IntroTable | undefined {
  for (const block of blocks) {
    if (block.type === "table" && block.table.title === title) return block.table
    if (block.type === "toggle" || block.type === "callout") {
      const found = findTable(block.blocks, title)
      if (found) return found
    }
  }
  return undefined
}

function storyCase(slug: string): IntroCase {
  return required(getIntroCase(slug), `사례 ${slug}`)
}

function caseVideo(slug: string): IntroVideo {
  const block = storyCase(slug).body.find((item) => item.type === "video")
  return required(block?.type === "video" ? block.video : undefined, `사례 ${slug} 의 영상`)
}

function videoGroup(id: string): IntroVideo[] {
  return required(INTRO_CASE_VIDEOS.groups.find((group) => group.id === id), `영상 묶음 ${id}`).videos
}

function feature(id: string) {
  return required(INTRO_SOFTWARE.features.find((item) => item.id === id), `특장점 ${id}`)
}

// ─── 공통 자료 ────────────────────────────────────────────────────────────────

export interface StoryPdf {
  download: IntroDownload
  /** 버튼에 쓰는 짧은 이름(파일 크기는 download.size) */
  shortLabel: string
}

export const STORY_PDF = {
  introduction: { download: INTRO_DOWNLOADS.introduction, shortLabel: "서비스 소개서" },
  smartClassroom: { download: INTRO_DOWNLOADS.smartClassroom, shortLabel: "AI 스마트 교실 제안서" },
} satisfies Record<string, StoryPdf>

/** 사례 분류별 묶음(원문 데이터베이스 순서 유지) */
const SECTORS: IntroCaseSector[] = ["공교육", "사교육", "기타교육"]
export const STORY_CASE_GROUPS = SECTORS.map((sector) => ({
  sector,
  items: INTRO_CASES.filter((item) => item.sector === sector),
}))
const CASE_TOTAL = INTRO_CASES.length

// ─── 선생님 A–E 수업 도구 표 (원문 「클래스인 도입 배경」) ─────────────────────

const TOOL_TABLE_TITLE = "선생님마다 다른 수업 도구 — 클래스인 하나로"
const toolTable = required(findTable(INTRO_SOFTWARE.details, TOOL_TABLE_TITLE), `표 「${TOOL_TABLE_TITLE}」`)
// 원문 표: 0열 = 할 일, 1–4열 = 선생님 A–D, 마지막 열 = 선생님 E(클래스인). 셀의 "-" 는 '없음', " + " 는 도구 여러 개
const lastColumn = toolTable.columns.length - 1
const splitTools = (cell: string) =>
  cell.trim() === "-"
    ? []
    : cell
        .split(" + ")
        .map((tool) => tool.trim())
        .filter(Boolean)

const toolRows = toolTable.rows.map((row) => ({
  task: row[0],
  tools: row.slice(1, lastColumn).map(splitTools),
  classin: row[lastColumn],
}))

export const STORY_TOOL_TABLE = {
  caption: TOOL_TABLE_TITLE,
  regionLabel: "선생님별 수업 도구 비교표 (좌우로 스크롤)",
  taskHeader: "수업에 필요한 일",
  teachers: toolTable.columns.slice(1, lastColumn),
  classinTeacher: toolTable.columns[lastColumn],
  classinHeader: "클래스인 하나로",
  emptyLabel: "없음",
  rows: toolRows,
  note: "출처: 클래스인 서비스 소개서 「클래스인 도입 배경」의 수업 도구 비교표.",
}

/** 표 속 선생님 A–D 의 도구를 나온 순서대로 한 번씩 — 히어로의 흩어진 도구 묶음 */
export const STORY_SCATTERED_TOOLS = [...new Set(toolRows.flatMap((row) => row.tools.flat()))]

// ─── Hero ────────────────────────────────────────────────────────────────────

export const STORY_HERO = {
  eyebrow: INTRO_HERO.eyebrow,
  /** H1 은 정확히 두 줄(운영자 지정). 첫 줄 끝 구절만 강조색 + 형광펜 띠 */
  title: { lead: "수업 준비에는", marked: "“너무 많은”", second: "도구들이 필요합니다." },
  answer: "클래스인은 이 모든 것을 하나에 담았습니다.",
  lead: "수업 전 준비부터 실시간 판서, 녹화, 과제·시험, 관리자 데이터까지 하나의 흐름으로 잇는 수업 플랫폼. 전자칠판·AI 카메라·마이크가 연결된 교실, 클래스인 X까지 하나로 이어집니다.",
  primary: { label: INTRO_FINAL_CTA.primary.label, href: STORY_HREF.contact, ctaId: STORY_CTA.heroContact },
  pdf: { ...STORY_PDF.introduction, ctaId: STORY_CTA.heroPdf },
  casesNote: `${STORY_CASE_GROUPS.map((group) => `${group.sector} ${group.items.length}`).join(" · ")} — ${CASE_TOTAL}곳의 도입 사례`,
  device: {
    label: "선생님 A–D가 수업에 쓰는 것들",
    listLabel: "흩어진 수업 도구",
    tools: STORY_SCATTERED_TOOLS,
    converge: "하나로",
    result: "클래스인",
    resultLines: [`${toolRows[0].task}부터`, `${toolRows[toolRows.length - 1].task}까지`],
  },
}

// ─── 먹 띠(슬림 CTA) ──────────────────────────────────────────────────────────

export const STORY_BAND = {
  label: "도입 상담 안내",
  lead: "도입을 검토 중이라면",
  body: "교실 수, 수업 방식, 이미 쓰는 장비를 알려 주시면 맞는 구성과 도입 순서를 정리해 드립니다.",
  showroom: { label: INTRO_FINAL_CTA.secondary.label, href: STORY_HREF.showroom, ctaId: STORY_CTA.barShowroom },
  contact: { label: INTRO_FINAL_CTA.primary.label, href: STORY_HREF.contact, ctaId: STORY_CTA.barContact },
}

// ─── 01 문제 ─────────────────────────────────────────────────────────────────

export const STORY_PROBLEM = {
  id: "problem",
  kicker: "문제",
  title: ["선생님마다 다른 수업 도구,", "클래스인 하나로"],
  lead: "하드웨어 준비부터 녹화, 판서, 스트리밍, 커뮤니티, 저장, 채점, 질의응답까지. 선생님마다 쓰는 도구가 다르고, 수업·과제·평가·모니터링이 흩어지면 운영 효율이 떨어집니다.",
  limitsTitle: "기존 화상회의 도구와 단일 기능 LMS의 구조적 한계 — 그리고 클래스인의 답",
  limitLabel: "한계",
  answerLabel: "클래스인의 답",
  limits: [
    { title: "수업 중심 UX 부족", answer: "미팅이 아닌 수업 중심 설계, 30여 가지 실시간 수업 도구" },
    { title: "통합 관리 어려움", answer: "수업·과제·시험·모니터링을 LMS와 대시보드 하나로" },
    { title: "콘텐츠 보호와 디지털 저작권 대응 미비", answer: "녹화본 다운로드 차단 + 워터마크, 드라이브 세부 권한 설정" },
    { title: "하드웨어와 연동되지 않는 온라인 시스템", answer: "전자칠판·카메라·마이크까지 연결된 클래스인 X" },
  ],
}

// ─── 02 근거 (원문 「올인원 학습의 이점」) ─────────────────────────────────────

export const STORY_EVIDENCE = {
  id: "evidence",
  kicker: "근거 · 올인원 학습의 이점",
  title: ["도구를 오갈 때마다,", "집중은 흩어집니다."],
  lead: "여러 정보원을 한꺼번에 접하면 ‘인지 병목(cognitive bottleneck)’이 생기고, 속도와 정확도가 떨어집니다. 끊임없는 알림과 도구 전환은 지속 집중력과 작업 기억 용량까지 줄인다고 보고되었습니다.",
  note: "출처: 클래스인 서비스 소개서 「올인원 학습의 이점」에 요약된 미디어 멀티태스킹·분할 주의·연속적 부분 집중 연구. 잘 설계된 멀티미디어 환경은 오히려 학습 효과를 높일 수도 있지만, 이를 위해선 인지 부하를 줄이기 위한 설계가 필수적입니다.",
  /** filled = 다섯 칸 눈금 중 채운 칸. calm 은 '줄일수록 좋다'는 마지막 칸이라 강조색 한 칸으로 그린다 */
  callouts: [
    {
      context: "동시에 쓰는 디지털 매체",
      value: "2개 이상",
      filled: 2,
      calm: false,
      title: "인지 전환 비용 증가",
      body: "주의를 옮길 때마다 비용이 붙고, 기억 오류와 처리 속도 저하로 이어집니다.",
    },
    {
      context: "동시에 쓰는 디지털 매체",
      value: "4개 이상",
      filled: 4,
      calm: false,
      title: "학습 성과에 명확한 악영향",
      body: "기억과 성적 모두에서 학습 성과가 유의미하게 떨어집니다.",
    },
    {
      context: "디지털 툴 병행 사용",
      value: "최소화",
      filled: 1,
      calm: true,
      title: "집중력과 학습 효율에 유리",
      body: "작업 기억의 한계를 넘지 않도록, 도구를 하나의 흐름에 모으는 설계가 필요합니다.",
    },
  ],
  meterSize: 5,
  ctaLead: "근거와 전체 기능은 서비스 소개서에 정리되어 있습니다.",
  pdf: { ...STORY_PDF.introduction, ctaId: STORY_CTA.evidencePdf },
  contact: { label: INTRO_FINAL_CTA.primary.label, href: STORY_HREF.contact, ctaId: STORY_CTA.evidenceContact },
}

// ─── 03 해결 — 하나의 흐름 6단계 ──────────────────────────────────────────────

export type StoryStepMedia =
  | { kind: "image"; asset: IntroAssetKey; alt: string }
  | { kind: "videos"; videos: IntroVideo[] }

export interface StoryStep {
  id: string
  /** 흐름 요약 칸의 이름·부제 */
  short: string
  sub: string
  /** 단계 머리 줄(폴리오 뒤) */
  meta: string
  title: string[]
  points: string[]
  media: StoryStepMedia
  quote?: string
  /** 다음 단계로 넘어가는 한 줄 */
  bridge?: string
}

const softwareVideo: IntroVideo = INTRO_SOFTWARE.video

const photoOf = (id: string): { asset: IntroAssetKey; alt: string } => {
  const { media } = feature(id)
  return { asset: media.asset, alt: media.alt }
}
const imageOf = (id: string): StoryStepMedia => ({ kind: "image", ...photoOf(id) })

export const STORY_SOLUTION = {
  id: "solution",
  kicker: "해결 · 클래스인",
  title: ["수업 전부터 수업 후까지,", "하나의 흐름으로."],
  lead: "미팅이 아닌, 수업 중심의 플랫폼 설계. 준비한 자료가 칠판이 되고, 칠판이 녹화가 되고, 녹화가 복습과 데이터가 됩니다. 도구를 바꿔 탈 일이 없습니다.",
  video: softwareVideo,
  flowLabel: "클래스인 수업 흐름 6단계",
  steps: [
    {
      id: "step-1",
      short: "수업 준비",
      sub: "드라이브",
      meta: "수업 준비 · ClassIn Drive",
      title: ["자료는 간편하게", "저장, 업로드되고"],
      points: [
        "**개인 + 공유 드라이브**를 동시에 제공해 기관 안에서 자료를 함께 씁니다.",
        "URL이나 기타 장비 없이, 수업 중 PDF·이미지·워크시트를 **드라이브에서 바로 호출**합니다.",
        "세부 권한 설정과 다운로드·내보내기 제한으로 **저작권 보호**.",
      ],
      media: imageOf("materials"),
      bridge: "드라이브의 자료는 수업 중 지연 없이 칠판 위로",
    },
    {
      id: "step-2",
      short: "실시간 판서",
      sub: "최대 50페이지 칠판",
      meta: "실시간 판서 · 최대 50페이지 칠판",
      title: ["더 편하게 수업하고"],
      points: [
        "칠판, 퀴즈, 손들기, 타이머 등 **30여 가지 실시간 수업 도구**",
        "**최대 50페이지 칠판**으로 판서 히스토리를 그대로 이어 갑니다.",
        "권한을 주면 강사와 학생 모두 칠판에 판서하는 인터랙티브 수업",
        "학생 카메라 49개 동시 송출, 최대 2,000명 참여",
      ],
      media: imageOf("teach"),
      bridge: "판서와 카메라는 그대로 녹화본이 되고",
    },
    {
      id: "step-3",
      short: "자동 녹화",
      sub: "칠판·카메라",
      meta: "자동 녹화 · 칠판/카메라 듀얼",
      title: ["수업은 저절로", "녹화되고"],
      points: [
        "별도 녹화 장치 없이 **클래스인 안에서 자동 녹화**",
        "카메라 뷰와 칠판 화면을 따로 녹화해 편집에 활용",
        "녹화본은 앱 안에서만 열람, **다운로드 차단 + 워터마크**",
      ],
      media: { kind: "videos", videos: videoGroup("recording") },
      bridge: "녹화 수업은 숙제·시험과 함께 LMS로",
    },
    {
      id: "step-4",
      short: "복습·과제·시험",
      sub: "LMS",
      meta: "복습·과제·시험 · LMS",
      title: ["더 철저히 관리하고"],
      points: [
        "**녹화 수업 / 숙제 / 시험**으로 수업 전·후 학습을 잇습니다.",
        "학기 단위 반복 수업, 기관 차원의 **표준 커리큘럼**을 만들어 배포",
        "과제 자동 채점, 출결 확인, 성적 분석으로 강사 업무 부담 감소",
      ],
      media: imageOf("manage"),
      bridge: "출결·성적·녹화본은 대시보드에 모이고",
    },
    {
      id: "step-5",
      short: "관리자 데이터",
      sub: "대시보드",
      meta: "관리자 데이터 · 대시보드",
      title: ["데이터는 모이고"],
      points: [
        "**출결 / 성적 / 녹화본 / 스크린샷** 자동 저장",
        "관리자 **대시보드**에서 한눈에, 모든 수업을 실시간으로 확인하고 조용히 입장",
        "교사·학생 권한 세분화, 기관 내 시스템과 API 연동",
      ],
      media: imageOf("data"),
      bridge: "쌓인 학습 데이터는 AI 피드백의 바탕이 됩니다",
    },
    {
      id: "step-6",
      short: "AI 튜터",
      sub: "맞춤형 피드백",
      meta: "AI 튜터 · 맞춤형 피드백",
      title: ["AI의 도움으로"],
      points: [
        "기관만의 맞춤형 AI 에이전트, 실시간 질의응답을 위한 **AI 튜터**",
        "과제 수행, 시험 결과, 수업 참여도를 바탕으로 **개별 학생 맞춤형 피드백**",
        "AI 음성 어시스턴트 — 수업 중 음성 명령으로 전자칠판 기능 실행",
      ],
      media: imageOf("ai"),
      quote: "“수업은 곧 데이터가 되고, 곧 기관만이 가진 강점이 됩니다.”",
    },
  ] satisfies StoryStep[],
  anywhere: {
    kicker: "그리고, 어디서든",
    title: feature("anywhere").title,
    body: "PC를 넘어 전자칠판까지. 핸드폰·태블릿(iOS / Android)으로도 참여하고, 온·오프라인을 넘어 통합형 하이브리드 수업을 시작할 수 있습니다.",
    image: photoOf("anywhere"),
  },
  showroom: {
    kicker: "직접 확인하기",
    title: "이 흐름을 목동 쇼룸에서 직접 써 보세요",
    body: "목동 쇼룸에서는 실제 수업 흐름을 직접 써 볼 수 있습니다.",
    primary: { label: INTRO_FINAL_CTA.secondary.label, href: STORY_HREF.showroom, ctaId: STORY_CTA.solutionShowroom },
    secondary: { label: INTRO_FINAL_CTA.primary.label, href: STORY_HREF.contact, ctaId: STORY_CTA.solutionContact },
  },
}

// ─── 04 교실까지 — 클래스인 X ─────────────────────────────────────────────────

export const STORY_CLASSROOM = {
  id: "classroom",
  kicker: "교실까지 · 클래스인 X",
  title: ["소프트웨어에서 멈추지 않고,", "교실까지 하나로."],
  lead: `${INTRO_SMART_CLASSROOM.lead} OPS PC 내장형 설계로 별도 장비 없이 올인원 구성.`,
  diagram: INTRO_SMART_CLASSROOM.hero,
  specsLabel: "클래스인 X 주요 스펙",
  specs: [
    { label: "4K 전자칠판", value: "65·75·86·110인치" },
    { label: "터치 반응 속도", value: "2ms" },
    { label: "필기 인식 · 종이에 쓰는 듯한 필기감", value: "0.03~0.06초" },
    { label: "멀티터치 + 손동작 제스처", value: "50포인트" },
    { label: "배열 마이크 + AI 음성 추적 카메라", value: "8개 내장" },
    { label: "천장 AI 마이크 · 360도 · 80㎡ 수음", value: "32마이크 어레이" },
  ],
  /** 스마트 교실 특징 3단 — 두 줄 제목 + 첫 사진 */
  photos: INTRO_SMART_CLASSROOM.features.map((item) => ({
    id: item.id,
    title: item.title,
    asset: item.images[0].asset,
    alt: item.images[0].alt,
  })),
  ctaLead: "하드웨어 기기 상세와 스펙은 제안서에서 확인하세요.",
  pdf: { ...STORY_PDF.smartClassroom, ctaId: STORY_CTA.classroomPdf },
  showroom: { label: INTRO_FINAL_CTA.secondary.label, href: STORY_HREF.showroom, ctaId: STORY_CTA.classroomShowroom },
}

// ─── 05 고객 사례 ────────────────────────────────────────────────────────────

export interface StoryCaseStory {
  item: IntroCase
  /** 분류 뒤에 붙는 수업 방식 한 마디 */
  method: string
  title: string[]
  body: string
  image: { asset: IntroAssetKey; alt: string }
}

function caseStory(slug: string, story: Omit<StoryCaseStory, "item">): StoryCaseStory {
  return { item: storyCase(slug), ...story }
}

/** 영상 하나의 안정 키(React key·중복 판별) */
export const storyVideoKey = (video: IntroVideo) => (video.kind === "youtube" ? video.youtubeId : video.video)

// 화판 수업 영상 넷 가운데 동인천종로엠 두 편은 그 사례 쪽 영상 묶음(videoRow)과 같은 것이라 그 학원 소개 옆에 따로 둔다
const tabletVideos = videoGroup("tablet")
const digitalRow = storyCase("dongincheon-jongro-m").body.find((block) => block.type === "videoRow")
const digitalVideos = required(digitalRow?.type === "videoRow" ? digitalRow.videos : undefined, "동인천종로엠 영상 묶음")
const digitalKeys = new Set(digitalVideos.map(storyVideoKey))

export const STORY_CASES = {
  id: "cases",
  kicker: "고객 사례",
  title: ["먼저 도입한", "교실들의 이야기"],
  lead: `${STORY_CASE_GROUPS.map((group) => `${group.sector} ${group.items.length}곳`).join(", ")}. ${CASE_TOTAL}곳의 도입 사례 가운데 세 곳의 이야기를 먼저 소개합니다.`,
  detailLabel: "사례 자세히 보기",
  featured: caseStory("bucheon-jungyul", {
    method: "하이브리드",
    title: ["수업은 부천에서,", "학생은 부산·대구·대치동에서"],
    body: "모든 교실에 전자 칠판(86″ 혹은 110″)과 전후면 카메라(T1&S1)가 설치되어 있고, 모든 수업은 하이브리드로 진행됩니다. 학생들은 부천 외의 지역에서 모집되어 실시간으로 함께 참여하기도 하고, 촬영한 녹화 수업은 판매되기도 합니다.",
    image: { asset: "cases/bucheon-jungyul-2", alt: "정율사관학원 강의실 — 전자칠판과 원격 참여 화면" },
  }),
  pair: [
    caseStory("acts-university", {
      method: "원격 참여 · 녹화",
      title: ["해외 교수를 초빙하고,", "모든 수업을 복습 자료로"],
      body: "전자 칠판, 천장형 마이크(DT1), 전후면 카메라(T1&S1)를 종합적으로 활용해 해외의 교수자를 초빙하고, 학생들은 공간 제약 없이 자유롭게 참여합니다. 모든 수업은 실시간으로 녹화되어 차후 복습 자료로 쓰입니다.",
      image: { asset: "cases/acts-university-2", alt: "아신대학교 강의실 전자칠판 화면 — 후면 카메라로 강의자 화면 송출" },
    }),
    caseStory("busan-gwasaram", {
      method: "듀얼 스크린",
      title: ["86″ 두 대를 이어,", "교실 어디서든 보이는 칠판"],
      body: "86″ 전자 칠판 두 개를 연결해 듀얼 스크린으로 씁니다. 수업에 따라 확장 혹은 복제 화면으로 전환하고, 복제 화면에서는 학생이 교실 어디에 앉아 있더라도 칠판에 대한 시야를 확보합니다.",
      image: { asset: "cases/busan-gwasaram-1", alt: "과사람학원 교실 — 듀얼 전자칠판을 복제 화면으로 쓰는 모습" },
    }),
  ],
  videos: {
    kicker: "영상으로 보는 현장 · 화판 수업",
    title: ["학생의 필기를 실시간으로 보고,", "바로 첨삭합니다"],
    body: "[개인 칠판] 기능으로 학생들의 필기 내역을 실시간으로 확인하고 첨삭하는 수업입니다. 정율사관학원, 과사람학원, 세정학원 등에서 학생의 이해도를 정확하게 파악하고 맞춤형 수업을 하기 위해 이 방식을 채택하고 있습니다.",
    lead: tabletVideos.filter((video) => !digitalKeys.has(storyVideoKey(video))),
    digital: {
      item: storyCase("dongincheon-jongro-m"),
      method: "디지털 교과서",
      title: ["동인천종로엠의", "양방향 수업"],
      videos: digitalVideos,
    },
  },
  tour: {
    title: "교실을 직접 둘러보세요",
    items: ["bucheon-jungyul", "busan-gwasaram"].map((slug) => ({ item: storyCase(slug), video: caseVideo(slug) })),
  },
  list: {
    title: `도입 기관 ${CASE_TOTAL}곳`,
    groups: STORY_CASE_GROUPS,
    allLabel: `사례 ${CASE_TOTAL}곳 모아 보기`,
  },
}

// ─── 마무리 ──────────────────────────────────────────────────────────────────

export const STORY_FINAL = {
  chipsLabel: "흩어진 도구 대신 클래스인 하나",
  chips: ["반디캠", "OBS", "줌(Zoom)", "네이버 밴드", "카카오톡", "구글 드라이브", "OMR 스캐너"].filter((tool) =>
    STORY_SCATTERED_TOOLS.includes(tool)
  ),
  result: "클래스인",
  title: ["우리 기관에 맞는", "클래스인 구성이 궁금하다면"],
  lead: INTRO_FINAL_CTA.lead,
  primary: { label: INTRO_FINAL_CTA.primary.label, href: STORY_HREF.contact, ctaId: STORY_CTA.finalContact },
  secondary: { label: INTRO_FINAL_CTA.secondary.label, href: STORY_HREF.showroom, ctaId: STORY_CTA.finalShowroom },
  resourcesLabel: "자료와 대표 소개",
  pdfs: [
    { ...STORY_PDF.introduction, ctaId: STORY_CTA.finalPdf },
    { ...STORY_PDF.smartClassroom, ctaId: STORY_CTA.finalProposalPdf },
  ],
  overview: { label: "클래스인 소개 전체 보기", href: STORY_HREF.overview, ctaId: STORY_CTA.finalOverview },
}

export const STORY_META = {
  title: "수업 도구, 클래스인 하나로 — 문제에서 해결까지",
  description:
    "선생님마다 다른 수업 도구가 왜 수업과 운영을 흐트러뜨리는지, 클래스인이 수업 준비·실시간 판서·자동 녹화·LMS·관리자 대시보드·AI 튜터를 하나의 흐름으로 어떻게 잇는지 학원·학교의 실제 사례와 함께 정리한 소개 자료입니다.",
}
