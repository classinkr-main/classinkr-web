// ClassIn 서비스 소개서(/introduction) 콘텐츠 원천.
// 원문은 Notion 공개 페이지 「가장 교실다운 AI 교육 플랫폼, ClassIn」(하위 사례 17쪽 포함)이다.
// 원문을 그대로 옮기되, 저장소 카피 규칙(docs/active/classin-korea-positioning-guidelines.md)과
// 부딪히는 문장(AI 튜터 설명·타사 비교 단정)만 고쳤다. 고친 자리는 해당 줄 주석에 남긴다.
//
// 문자열 안의 **굵게** 는 화면에서 강조로 그린다(그 외 마크다운은 쓰지 않는다).
// 표 셀의 줄바꿈("\n")은 셀 안의 줄 목록으로 그린다.

import type { IntroAssetKey } from "./assets"

export const INTRO_PATH = "/introduction"
export const INTRO_CASES_PATH = `${INTRO_PATH}/cases`

export function getIntroCasePath(slug: string) {
  return `${INTRO_CASES_PATH}/${slug}`
}

// ─── 블록 모델 ────────────────────────────────────────────────────────────────

export interface IntroListItem {
  text: string
  children?: IntroListItem[]
}

export interface IntroTable {
  /** 표 위 작은 제목(있으면 caption 으로 그린다) */
  title?: string
  columns: string[]
  rows: string[][]
  /** ClassIn 열처럼 강조할 열 번호(0부터) */
  highlightColumn?: number
  /** 표 아래 출처·기준 메모 */
  note?: string
}

export type IntroVideo =
  | {
      kind: "youtube"
      youtubeId: string
      title: string
      /** 영상 채널(원문 링크 작성자) */
      channel?: string
      /** 로컬에 저장한 썸네일 */
      thumbnail: IntroAssetKey
    }
  | {
      kind: "file"
      /** 재생 파일(mp4) */
      video: IntroAssetKey
      title: string
      /** 세로 영상이면 portrait */
      orientation: "landscape" | "portrait"
    }

export type IntroBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: IntroListItem[] }
  | { type: "quote"; text: string }
  | { type: "callout"; blocks: IntroBlock[] }
  | { type: "table"; table: IntroTable }
  | { type: "toggle"; title: string; blocks: IntroBlock[] }
  | { type: "image"; asset: IntroAssetKey; alt: string; caption?: string }
  | { type: "imageRow"; images: Array<{ asset: IntroAssetKey; alt: string; caption?: string }> }
  | { type: "video"; video: IntroVideo }
  | { type: "videoRow"; videos: IntroVideo[] }
  | { type: "download"; download: IntroDownload }

export interface IntroDownload {
  /** 다운로드 계측 lead_magnet 값으로도 쓴다 */
  id: string
  label: string
  description: string
  asset: IntroAssetKey
  /** 사용자가 받는 파일 이름 */
  fileName: string
  size: string
}

// ─── 다운로드 자료 ────────────────────────────────────────────────────────────

export const INTRO_DOWNLOADS = {
  introduction: {
    id: "classin-introduction-251218",
    label: "클래스인 서비스 소개서 상세",
    description: "클래스인 소프트웨어·하드웨어·도입 사례를 담은 전체 소개 자료(PDF)",
    asset: "classin-introduction-251218",
    fileName: "[클래스인]소개자료_251218.pdf",
    size: "11.3MB",
  },
  smartClassroom: {
    id: "classin-ai-smart-classroom-proposal",
    label: "AI 스마트 교실 제안서",
    description: "ClassIn X 전자칠판·카메라·마이크 구성과 스펙을 정리한 제안서(PDF)",
    asset: "classin-ai-smart-classroom-proposal",
    fileName: "[클래스인] AI 스마트 교실 제안서.pdf",
    size: "6.0MB",
  },
} satisfies Record<string, IntroDownload>

// ─── Hero ────────────────────────────────────────────────────────────────────

export const INTRO_HERO = {
  eyebrow: "ClassIn 서비스 소개서",
  title: "가장 교실다운 AI 교육 플랫폼, ClassIn",
  lead: "수업과 학습 관리의 모든 것을 담은, 가장 교실다운 AI 교육 솔루션",
  image: {
    asset: "hero-banner" as IntroAssetKey,
    alt: "전자칠판 앞에서 선생님이 수업하고 학생들이 참여하는 클래스인 교실",
  },
  /** 페이지 안 목차 */
  nav: [
    { id: "classin", label: "클래스인" },
    { id: "classin-x", label: "클래스인 X : AI 스마트 교실" },
    { id: "cases", label: "고객 사례" },
  ],
}

// ─── 1. 클래스인 (소프트웨어) ────────────────────────────────────────────────

export interface IntroFeature {
  id: string
  title: string
  media: { kind: "image"; asset: IntroAssetKey; alt: string }
  points: IntroListItem[]
}

export const INTRO_SOFTWARE = {
  id: "classin",
  kicker: "Software",
  title: "클래스인",
  lead: "수업 전 준비부터 실시간 판서, 녹화, 과제·시험, 관리자 데이터까지 하나의 흐름으로 잇는 수업 플랫폼입니다.",
  video: {
    kind: "youtube",
    youtubeId: "rsqlml3GIm8",
    title: "인터랙티브 하이브리드 학습? 클래스인으로 완성해 보세요!",
    channel: "클래스인 코리아 Classin Korea",
    thumbnail: "youtube/rsqlml3GIm8",
  } satisfies IntroVideo,
  featuresTitle: "클래스인 특장점",
  features: [
    {
      id: "teach",
      title: "더 편하게 수업하고",
      media: {
        kind: "image",
        asset: "feature-teach",
        alt: "클래스인 칠판에 수식 판서와 교재 화면이 함께 띄워진 수업 화면",
      },
      points: [
        {
          text: "**미팅이 아닌, 수업 중심의 플랫폼 설계**",
          children: [{ text: "수업을 위한 약 20개의 실시간 수업 도구" }],
        },
        { text: "**총 50p의 디지털 판서 페이지 제공**" },
        {
          text: "**인터랙티브 수업 시스템**",
          children: [{ text: "참여자에게 권한을 부여하여 강사와 학생 모두 블랙보드에 판서할 수 있도록 지원" }],
        },
      ],
    },
    {
      id: "materials",
      title: "자료는 간편하게 저장, 업로드되고",
      media: {
        kind: "image",
        asset: "feature-materials",
        alt: "수업 중 클래스인 드라이브에서 자료 폴더를 열어 칠판으로 불러오는 화면",
      },
      points: [
        {
          text: "**[드라이브]를 통한 기관 내 자료 공유**",
          children: [{ text: "개인 + 공유 드라이브 동시 제공" }, { text: "세부 권한 설정을 통한 저작권 보호 가능" }],
        },
        {
          text: "**수업 자동 녹화 & 플레이백 기능**",
          children: [
            { text: "별도 설비 없이 자동 녹화 기능 지원" },
            { text: "칠판/카메라 듀얼 녹화 가능, 녹화본은 앱 내에서만 열람되도록 지원" },
          ],
        },
      ],
    },
    {
      id: "manage",
      title: "더 철저히 관리하고",
      media: {
        kind: "image",
        asset: "feature-manage",
        alt: "클래스인 LMS 코스 화면 — 수업 단원별 녹화 수업·숙제·시험 활동 목록",
      },
      points: [
        {
          text: "**LMS 통합 학습 관리**",
          children: [{ text: "**녹화 수업 / 숙제 / 시험** 등의 기능으로 철저한 수업 전·후 관리 지원" }],
        },
        {
          text: "**표준화된 커리큘럼 제작 및 배포 가능**",
          children: [{ text: "학기 단위로 반복되는 수업 및 기관 차원의 표준 수업 운영 가능" }],
        },
        { text: "**관리를 위한 [실시간 모니터링] 기능 제공**" },
      ],
    },
    {
      id: "data",
      title: "데이터는 모이고",
      media: {
        kind: "image",
        asset: "feature-data",
        alt: "관리자 대시보드에 수업 현황 그래프와 출결·스크린샷 기록이 모인 화면",
      },
      points: [
        { text: "**출결 / 성적 / 녹화본 / 스크린샷 등 자동 저장**" },
        {
          text: "**관리자를 위한 [대시보드]**",
          children: [{ text: "저장된 데이터를 한 눈에 파악 가능한 관리자용 페이지 제공" }],
        },
        { text: "**기관 내 시스템과 API 연동 지원**" },
      ],
    },
    {
      id: "ai",
      title: "AI의 도움으로",
      media: {
        kind: "image",
        asset: "feature-ai",
        alt: "AI 튜터가 영어 단락 쓰기 구조(PEEL)를 단계별로 설명하는 화면",
      },
      points: [
        {
          text: "**기관만의 맞춤형 AI 에이전트**",
          children: [
            { text: "학생의 학습데이터 분석 및 실시간 피드백 제공" },
            // 원문 "실시간 질의 응답을 위한 AI 튜터 기능 제공" — AI 튜터는 AgentIn 튜닝 에이전트로 표현한다(포지셔닝 지침 §5).
            { text: "실시간 질의응답을 위한 **AI 튜터** — AgentIn에서 기관 기준으로 튜닝한 에이전트" },
          ],
        },
        {
          text: "**학습 분석 및 개인화 피드백**",
          children: [{ text: "과제 수행, 시험 결과, 수업 참여도 등을 기반으로 개별 학생 맞춤형 피드백 제공" }],
        },
        {
          text: "**AI 음성 어시스턴트**",
          children: [{ text: "수업 중 음성 명령으로 전자 칠판 내 다양한 기능 실행 가능" }],
        },
      ],
    },
    {
      id: "anywhere",
      title: "언제 어디서나 수업에 참여하세요",
      media: {
        kind: "image",
        asset: "feature-anywhere",
        alt: "노트북·태블릿·휴대폰에서 같은 클래스인 수업에 참여하는 모습",
      },
      points: [
        {
          text: "**PC를 넘어 전자 칠판까지**",
          children: [{ text: "PC에서만 지원되던 화상 수업 툴은 그만, 전자 칠판에서도 원활한 수업 지원" }],
        },
        {
          text: "**BYOD(Bring Your Own Device) 모델 지원**",
          children: [{ text: "핸드폰, 태블릿 사용 가능" }, { text: "iOS / Android 서비스 모두 제공" }],
        },
        {
          text: "**온라인과 오프라인을 넘어 하이브리드로**",
          children: [
            { text: "하나의 교육 모델(온·오프라인)에 한정될 필요 없이, **통합형 하이브리드 수업** 킥스타트 가능" },
          ],
        },
      ],
    },
  ] satisfies IntroFeature[],
  moreTitle: "더 자세히 확인해 보세요",
  download: INTRO_DOWNLOADS.introduction,
  details: [
    {
      type: "toggle",
      title: "클래스인 도입 배경",
      blocks: [
        { type: "quote", text: "**언제 어디서나, 수업에 대한 모든 것, 클래스인 하나면 끝.**" },
        { type: "heading", level: 2, text: "교수-학습 방식의 대전환" },
        {
          type: "paragraph",
          text: "코로나19 팬데믹을 계기로 **하이브리드 및 온라인 학습**은 일시적인 대안에서 벗어나, **대학 교육의 새로운 표준**으로 자리잡고 있습니다.",
        },
        {
          type: "list",
          items: [
            { text: "2022년 Google Future of Education 보고서: “교육 환경의 업그레이드가 최우선 과제”" },
            { text: "말레이시아 교육부: 95개 대학 프로그램을 전면 하이브리드로 전환 발표 (2023년 6월)" },
            { text: "영국/미국 대학생의 45~49%가 온라인·하이브리드 수업을 선호함" },
          ],
        },
        { type: "heading", level: 2, text: "기존 시스템의 구조적 한계" },
        {
          type: "paragraph",
          text: "기존 화상회의 도구 및 단일 기능 중심의 LMS로는 다음과 같은 문제점이 지속되고 있습니다.",
        },
        {
          type: "list",
          items: [
            { text: "**수업 중심 UX 부족**: 교사와 학생 간 상호작용 구조 미비, 수업 몰입도 저하" },
            { text: "**통합 관리 어려움**: 수업, 과제, 평가, 모니터링 시스템이 분산되어 운영 효율성 저하" },
            { text: "**콘텐츠 보호와 디지털 저작권 대응 미비**" },
            { text: "**하드웨어와 연동되지 않는 온라인 시스템**" },
          ],
        },
        {
          type: "paragraph",
          text: "**수업 준비에는 “너무 많은” 도구들이 필요합니다. 클래스인은 이 모든 것을 하나에 담았습니다.**",
        },
        {
          type: "table",
          table: {
            title: "선생님마다 다른 수업 도구 — 클래스인 하나로",
            columns: ["", "선생님 A", "선생님 B", "선생님 C", "선생님 D", "선생님 E"],
            highlightColumn: 5,
            rows: [
              ["하드웨어 준비", "대형TV + 판서모니터 + PC", "프로젝터 + 캠코더 + PC", "전자칠판 + 캠코더 + PC", "대형TV + 아이패드", "클래스인 X"],
              ["카메라 녹화", "-", "OBS", "OBS", "-", "클래스인"],
              ["화면 녹화", "반디캠", "-", "닥줌", "아이패드 화면녹화", "클래스인"],
              ["화면 판서", "PDF Annotator", "-", "닥줌", "굿노트", "클래스인"],
              ["스트리밍", "유튜브 채널", "네이버 밴드", "NAS", "유튜브 채널", "클래스인"],
              ["커뮤니티", "네이버 밴드", "네이버 밴드", "카카오톡", "네이버 밴드", "클래스인"],
              ["라이브 강의", "줌(Zoom)", "네이버 밴드", "-", "줌(Zoom)", "클래스인"],
              ["스토리지", "구글 드라이브", "네이버 마이박스", "MS 원드라이브", "아이클라우드", "클래스인"],
              ["OMR 채점", "-", "-", "OMR 스캐너", "-", "클래스인"],
              ["질의응답", "카카오톡", "네이버 밴드", "카카오톡", "카카오톡", "클래스인"],
            ],
          },
        },
        {
          type: "toggle",
          title: "올인원 학습의 이점",
          blocks: [
            { type: "heading", level: 3, text: "분할 주의와 멀티태스킹의 인지 부담" },
            {
              type: "list",
              items: [
                {
                  text: "**미디어 멀티태스킹(media multitasking)** 연구(2009)는 멀티태스킹을 많이 하던 학생이 적게 하던 학생보다 인지 제어력이 낮고 집중력 전환에 시간이 더 걸리며, 학업 성적 역시 떨어졌음을 보여줍니다.",
                },
                {
                  text: "**여러 정보원을 한꺼번에 접할 경우 ‘인지 병목(cognitive bottleneck)’ 현상이 발생**하며, 이는 속도·정확도의 하락으로 이어집니다.",
                },
              ],
            },
            { type: "heading", level: 3, text: "연속적 부분 집중(continuous partial attention)" },
            {
              type: "list",
              items: [
                {
                  text: "끊임없는 디지털 알림과 도구 전환으로 인해 지속 집중력이 떨어지고 작업 기억 용량도 줄어드는 현상이 보고되었습니다.",
                },
              ],
            },
            {
              type: "callout",
              blocks: [
                {
                  type: "list",
                  items: [
                    {
                      text: "여러 툴을 동시에 사용하는 동안 집중력이 분산되고, 작업 기억(Working Memory)이 한계에 다다르면 학습 효율이 감소하는 경향이 있습니다.",
                    },
                    {
                      text: "물론, 잘 설계된 멀티미디어 환경에서 올바른 방식으로 사용하면 오히려 학습 효과를 향상시킬 수도 있지만, 이를 위해선 **인지 부하를 줄이기 위한 설계**가 필수적입니다.",
                    },
                  ],
                },
              ],
            },
            {
              type: "table",
              table: {
                columns: ["조건", "기준", "결과"],
                rows: [
                  ["미디어 스트림 수", "≥ 2", "주의 전환 비용 증가(+0.3–0.4초), false memory 증가"],
                  ["오프태스크 툴", "4개", "학습 및 메모리 성과 유의미하게 떨어짐"],
                  ["MMT 빈도", "많을수록", "작업 기억, 지속 주의력, 실행 기능 저하"],
                ],
              },
            },
            {
              type: "list",
              items: [
                {
                  text: "**2개 이상** 디지털 매체 동시 사용 시",
                  children: [{ text: "인지 전환 비용 증가" }, { text: "기억 오류와 처리 속도 저하" }],
                },
                {
                  text: "**4개 이상** 사용할 경우",
                  children: [{ text: "학습 성과(기억·성적)에 명확한 악영향" }],
                },
                {
                  text: "작업 기억 한계를 넘지 않도록, **디지털 툴 병행 사용은 최소화**하는 것이 집중력과 학습 효율에 유리",
                },
              ],
            },
            {
              type: "paragraph",
              text: "**즉, 두 개 이상의 툴만 동시에 사용해도 인지 병목이 생기며, 네 개 이상이면 학습 성과에 명백한 부정적 효과가 나타납니다.**",
            },
          ],
        },
        { type: "heading", level: 2, text: "대학 차원의 교육혁신 및 디지털화 전략 가속화" },
        {
          type: "paragraph",
          text: "전 세계적으로 교육부 및 대학 본부 차원에서 **직업 교육 고도화**, **AI 기반 학습**, **글로벌 협업 수업 확대**에 대한 요구가 커지고 있으며, 대학들은 이에 발맞춰 **디지털 기반 수업 환경**을 구축할 필요성이 커지고 있습니다.",
        },
        { type: "paragraph", text: "국내외 대학들 역시 다음과 같은 수요를 안고 있습니다." },
        {
          type: "list",
          items: [
            { text: "**하나의 플랫폼으로 모든 교수학습 활동을 통합하고자 하는 니즈**" },
            { text: "**온라인/오프라인을 넘나드는 수업 구조**" },
            { text: "디지털 기반 교수법(PBL, AI 튜터 등)의 실현" },
          ],
        },
      ],
    },
    {
      type: "toggle",
      title: "타사 기능 비교",
      blocks: [
        { type: "heading", level: 2, text: "왜 ClassIn인가?" },
        { type: "quote", text: "**ClassIn vs. Google Classroom**" },
        {
          type: "table",
          table: {
            title: "주요 기능 비교",
            columns: ["항목", "ClassIn", "Google Classroom"],
            highlightColumn: 1,
            rows: [
              ["목적", "실시간 수업 + 과제·시험 **올인원 라이브 클래스룸**", "과제·공지·자료 공유 중심 **LMS**"],
              [
                "실시간 수업",
                "전용 화상 수업 플랫폼 탑재(2,000명까지, 반응속도 50ms 미만)\n무제한 칠판, 공동 작업 도구, 손들기/발언자 순서 자동화\n수업 전문/최적화",
                "Google Meet 연동 필요\n실시간 수업 기능은 외부 툴 의존\n칠판 기능 없음\n화상회의 전문/최적화",
              ],
              ["활용 차원", "온/오프라인 **하이브리드**", "온라인 위주"],
              [
                "교실 수업 최적화",
                "전자칠판 연동\nAI 추적 카메라 자동 수업 녹화/백업\n오프라인 + 온라인 통합 수업 지원",
                "오프라인 수업 관리 기능 없음",
              ],
              [
                "다양한 수업 도구",
                "드래그-앤-드롭 방식의 가상 실험실부터, 수업 중 활용할 수 있는 **30개 이상의 인터랙티브 수업 도구**",
                "자체 기능(투표 등) 4개",
              ],
              [
                "AI 통합 방식",
                "클래스 안에서 바로 작동하는 AI\n**RAG 기능**을 통한 수업 데이터 기반의 자세한 답변\n**수업 데이터의 효과적 활용**",
                "AI는 주로 과제 작성 도구(Gemini), 외부 툴에 의존\n수업 도중 직접 사용 어려움",
              ],
              ["녹화 및 수업 보관", "모든 수업 자동 녹화 + 판서 + 채팅까지 클라우드 보관", "Meet의 경우 수동 녹화 또는 유료 플랜 필요"],
              [
                "출결 + 활동 분석",
                "자동 출석, 발언 로그, 채팅 기록, 참여 점수화로 학생 관리 강화",
                "Analytics는 과제 위주, 실시간 활동 분석 미흡",
              ],
              ["생태계 통합", "수업·시험·자료·보고서 **완전 통합** + LTI/CED API", "Drive, Docs, Slides, Chromebook Class tools"],
            ],
            // 타사 기능은 단정하지 않는다(포지셔닝 지침 §7) — 비교 기준 시점을 밝힌다.
            note: "타사 항목은 소개서 작성 시점(2025년)의 공개 자료 기준이며, 이후 변경될 수 있습니다.",
          },
        },
        {
          type: "table",
          table: {
            title: "하드웨어·기기 호환성",
            columns: ["항목", "ClassIn", "Google Classroom"],
            highlightColumn: 1,
            rows: [
              ["하드웨어·기기 호환성", "ClassIn X: 스마트보드(65~110\"), AI 카메라, 빔포밍 마이크까지 자체 개발", "전용 하드웨어 없음"],
              [
                "교실 수업 최적화",
                "전자칠판 연동\nAI 추적 카메라 자동 수업 녹화/백업\n오프라인 + 온라인 통합 수업 지원",
                "오프라인 수업 관리 기능 없음",
              ],
              ["전자칠판", "**Smart Board 65″–110″ 4K**", "전용 HW 없음"],
              ["AI 카메라", "**AI 트래킹 카메라·DT1 Beamforming Mic**", "없음"],
              ["듀얼 디바이스 수업", "모바일·패드 + PC 카메라 분리 촬영", "미지원"],
              ["데스크톱 앱", "Windows·macOS 전용 앱 / Android·iOS·Chromebook", "웹 중심"],
              ["기타 연동", "마이크·스피커·외부 문서 카메라 등 교육용 장비", "―"],
            ],
            note: "타사 항목은 소개서 작성 시점(2025년)의 공개 자료 기준이며, 이후 변경될 수 있습니다.",
          },
        },
      ],
    },
    {
      type: "toggle",
      title: "클래스인 6.0 with AI 자세히 보기",
      blocks: [
        { type: "heading", level: 2, text: "실시간 수업에 최적화된 인터페이스" },
        {
          type: "list",
          items: [
            {
              text: "**영상 회의가 아닌 수업 중심의 플랫폼 설계**",
              children: [{ text: "수업 전용 칠판, 퀴즈, 손들기, 타이머 등 **20가지 이상의 실시간 수업 도구 제공**" }],
            },
            {
              text: "**49개 학생 카메라 동시 송출 / 최대 2,000명 참여**",
              children: [{ text: "대형 강의에도 적합한 구조" }, { text: "강사 중심 + 학생 참여가 균형 잡힌 화면 구성 가능" }],
            },
            {
              text: "**수업 자동 녹화 & 플레이백 기능**",
              children: [
                { text: "별도 녹화 장치 없이 **클래스인 내부에서 자동 녹화**" },
                { text: "칠판/카메라 뷰 선택 가능, 녹화본은 앱 내에서만 열람" },
                { text: "**저작권 보호를 위해 다운로드 차단 + 워터마크 삽입**" },
              ],
            },
            {
              text: "**그룹 토론 모드**",
              children: [{ text: "학생을 소그룹으로 분리하여 토론 유도 / 교사는 실시간 이동 가능" }],
            },
          ],
        },
        { type: "heading", level: 2, text: "통합형 클라우드 저장소: ClassIn Drive" },
        {
          type: "list",
          items: [
            {
              text: "**개인/공유 드라이브 제공**",
              children: [{ text: "URL이나 기타 장비 없이도 수업자료를 불러오고 배포 가능" }],
            },
            {
              text: "**드라이브에서 직접 수업자료 호출**",
              children: [{ text: "수업 중 지연 없이 PDF, 이미지, 워크시트 등을 실시간 불러오기 가능" }],
            },
            { text: "**저작권 보호 모드 지원**", children: [{ text: "다운로드 및 내보내기 제한 설정 가능" }] },
          ],
        },
        { type: "heading", level: 2, text: "LMS 통합 학습 관리" },
        {
          type: "list",
          items: [
            { text: "**수업 전·후 과제, 시험, 토론 구성 가능**", children: [{ text: "수업 후에도 학습이 연속되도록 설계" }] },
            {
              text: "**표준화된 커리큘럼 제작 및 배포 기능**",
              children: [{ text: "학기 단위 반복 수업 또는 기관 차원의 표준 수업 운영 가능" }],
            },
            {
              text: "**과제 자동 채점, 출결 확인, 성적 분석까지 지원**",
              children: [{ text: "강사 업무 부담 감소 + 데이터 기반 피드백 가능" }],
            },
          ],
        },
        { type: "heading", level: 2, text: "관리자 중심 대시보드 & 실시간 모니터링" },
        {
          type: "list",
          items: [
            { text: "**모든 수업 실시간 확인 + 조용히 입장 가능**", children: [{ text: "문제 발생 시 즉각 개입 가능" }] },
            { text: "**교사/학생 권한 세분화 설정**", children: [{ text: "학교 규모에 따라 다양한 역할 기반 시스템 설계" }] },
            { text: "**녹화본, 스크린샷, 제출물 등 수업 리포트 자동 축적**" },
          ],
        },
        { type: "heading", level: 2, text: "AI 기반 학습 지원" },
        {
          type: "callout",
          blocks: [
            {
              type: "paragraph",
              text: "ClassIn에서 이루어지는 모든 수업은 자동으로 기록되고, 과제, 채점, 피드백, 상호작용 등 학습 데이터를 기반으로 **AI 분석이 이루어집니다.**",
            },
            {
              type: "quote",
              text: "**수업은 곧 데이터가 되고, 곧 기관만이 가진 강점이 됩니다.** 교육의 ‘기록’을 넘어, **지속가능한 지식자산 구축**이 가능합니다.",
            },
          ],
        },
        { type: "heading", level: 3, text: "기관만의 맞춤형 AI 에이전트(AI 튜터/평가)" },
        {
          type: "list",
          items: [
            { text: "학생의 학습 데이터를 **AI가 분석하고 실시간 피드백** 제공" },
            // 원문 "수업 내용을 집중 학습한 AI 알고리즘을 통해 특정 수업 맞춤형 AI 피드백 제공 가능" —
            // 녹화 기반 답변으로 읽히지 않게 AgentIn 튜닝 에이전트로 고쳤다(포지셔닝 지침 §5).
            { text: "AgentIn에서 기관·과목 기준으로 튜닝한 에이전트로 수업 맞춤형 AI 피드백 제공 가능" },
            { text: "AI 스피킹의 경우 발음 정확도, 억양, 표현력 등 **다중 요소 기반 평가**" },
            { text: "에세이 첨삭, 문법 교정 등 텍스트 기반 학습 피드백 지원" },
          ],
        },
        { type: "heading", level: 3, text: "학습 분석 및 개인화 피드백" },
        {
          type: "list",
          items: [
            {
              text: "**과제 수행, 시험 결과, 수업 참여도** 등의 데이터를 기반으로",
              children: [{ text: "AI가 **개별 학생 맞춤형 피드백** 제공" }],
            },
            { text: "교사는 누적 데이터를 통해 **학습 성향, 성취도 변화**를 확인 가능" },
          ],
        },
        { type: "heading", level: 3, text: "AI 음성 어시스턴트(Voice Assistant)" },
        {
          type: "list",
          items: [
            { text: "수업 중 음성 명령으로 다양한 기능 실행(예: “화면 공유 시작”, “질문창 열어줘”)" },
            { text: "교사의 손을 덜어주는 **직관적 수업 보조 도구**" },
          ],
        },
        { type: "heading", level: 2, text: "기능 요약 및 기술 우위" },
        {
          type: "table",
          table: {
            columns: ["기능 영역", "ClassIn 제공 항목"],
            rows: [
              ["실시간 수업", "판서, 퀴즈, 타이머, 토론, 스크린 공유 등"],
              ["자료 저장", "실시간 수업 녹화, ClassIn Drive(개인/공유), 저작권 보호"],
              ["학습 관리", "LMS(과제, 시험, 출결, 커리큘럼)"],
              ["학습 데이터 확인", "관리자 대시보드, 실시간 모니터링"],
              ["AI 기능", "AI 튜터, 음성 비서, 자동 분석"],
              ["기기 호환성", "전자칠판, PC, 모바일 완전 지원"],
            ],
          },
        },
        {
          type: "table",
          table: {
            columns: ["항목", "ClassIn", "일반 화상/교육 플랫폼"],
            highlightColumn: 1,
            rows: [
              ["전자칠판 연동", "완전 통합", "별도 앱 필요"],
              ["수업 도구", "전용 수업 기능 탑재", "화면공유 위주"],
              ["LMS 기능", "과제, 시험, 토론 내장", "외부 도구 필요"],
              ["다자간 협업", "실시간 협력 가능", "제한적"],
              ["판서/녹화", "자동 저장 / 편집", "수동 녹화"],
            ],
          },
        },
      ],
    },
  ] satisfies IntroBlock[],
}

// ─── 2. 클래스인 X : AI 스마트 교실 (하드웨어) ───────────────────────────────

export const INTRO_SMART_CLASSROOM = {
  id: "classin-x",
  kicker: "Hardware",
  title: "클래스인 X : AI 스마트 교실",
  lead: "전자칠판·AI 카메라·마이크가 클래스인 소프트웨어와 연결된 하이브리드 교실 구성입니다.",
  hero: {
    asset: "classin-x-hero" as IntroAssetKey,
    alt: "클래스인 하이브리드 교실 구성도 — 전자칠판, AI 트래킹 카메라, 천장 마이크, 학생 좌석 배치",
  },
  featuresTitle: "스마트 교실 특징",
  features: [
    {
      id: "lecture",
      title: ["일반 강의식 수업에", "스마트 터치 한 스푼"],
      images: [
        { asset: "smart-lecture-1" as IntroAssetKey, alt: "학생이 전자칠판 앞에서 판서하며 발표하는 모습" },
        {
          asset: "smart-lecture-2" as IntroAssetKey,
          alt: "정율사관학원 강사가 전자칠판 앞에서 강의하는 모습",
          caption: "SBS Biz 「참 좋은 하루」 촬영(2025.07.30, 정율사관학원) — AI 기반 스마트 교실에서 학생들의 ‘공부하는 힘’을 키우다",
        },
      ],
    },
    {
      id: "review",
      title: ["학생의 판서도", "한 눈에 파악 & 즉시 첨삭"],
      images: [
        { asset: "smart-review-1" as IntroAssetKey, alt: "학생이 태블릿 개인 칠판에 펜으로 풀이를 쓰는 모습" },
        { asset: "smart-review-2" as IntroAssetKey, alt: "강사가 전자칠판에 학생들의 개인 칠판 화면을 띄워 확인하는 모습" },
      ],
    },
    {
      id: "hybrid",
      title: ["하이브리드 강의로", "언제 어디서나 수업 참여 지원"],
      images: [
        { asset: "smart-hybrid-1" as IntroAssetKey, alt: "교실 학생과 원격 참여 학생이 한 화면에서 함께 수업하는 하이브리드 강의실" },
        { asset: "smart-hybrid-2" as IntroAssetKey, alt: "원격 참여자 화면이 띄워진 전자칠판 앞에서 수업을 듣는 학생들" },
      ],
    },
  ],
  overview: {
    asset: "classin-x-overview" as IntroAssetKey,
    alt: "현장 강의·온라인 강의·그룹 학습·하이브리드 강의 등 다양한 교육 환경에서 쓰이는 클래스인 X",
  },
  moreTitle: "더 자세히 확인해 보세요",
  moreLead: "하드웨어 기기 상세 및 스펙",
  download: INTRO_DOWNLOADS.smartClassroom,
  details: [
    {
      type: "toggle",
      title: "몰입형 학습 경험을 위한 디자인",
      blocks: [
        {
          type: "imageRow",
          images: [
            { asset: "hw-design-1", alt: "클래스인 X 전자칠판 측면 — 라운딩 프레임과 자석으로 붙는 스타일러스" },
            { asset: "hw-design-2", alt: "클래스인 X 전자칠판 정면 — 풀 라미네이션 디스플레이" },
          ],
        },
        {
          type: "list",
          items: [
            {
              text: "**풀 라미네이션 디스플레이**",
              children: [{ text: "빛 반사 최소화, 90% 이상의 빛 투과율로 **선명하고 생생한 색감 제공**" }],
            },
            {
              text: "**눈부심 & 지문 방지**",
              children: [{ text: "AG(눈부심 방지) + AF(지문 방지) 유리패널로 **오래도록 깨끗하고 선명한 화면 유지**" }],
            },
            {
              text: "**라운딩 처리된 프레임 + 스타일러스 자석 부착 가능**",
              children: [{ text: "어느 벽에도 **세련되게 설치 가능**, **스타일러스 분실 방지**" }],
            },
          ],
        },
      ],
    },
    {
      type: "toggle",
      title: "차원이 다른 터치 & 필기 감도",
      blocks: [
        { type: "image", asset: "hw-touch", alt: "스타일러스로 전자칠판에 수식을 쓰는 손 클로즈업" },
        {
          type: "list",
          items: [
            {
              text: "**초고속 반응 속도 2ms, 초저지연 필기인식 0.03~0.06초**",
              children: [{ text: "**종이에 쓰는 듯한 자연스러운 필기감**" }],
            },
            {
              text: "**50포인트 멀티터치 + 다양한 손동작 제스처 지원**",
              children: [
                { text: "네 손가락: 툴바 호출 / 두 손가락: 전환 / 손등: 지우개 등" },
                { text: "**수업 중 직관적 조작 가능**" },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "toggle",
      title: "수업 집중도 & 편의성 강화 기능",
      blocks: [
        { type: "image", asset: "hw-focus", alt: "태양계 탐구 수업 화면을 띄운 클래스인 X 전자칠판" },
        {
          type: "list",
          items: [
            {
              text: "**최대 50페이지 무한 스크롤 칠판**",
              children: [{ text: "**연속적인 강의 가능**, 판서 히스토리 보존에 탁월" }],
            },
            {
              text: "**슬라이딩 바를 통한 화면 분할 기능**",
              children: [{ text: "교사·학생 누구나 손쉽게 화면 조작 가능" }],
            },
            { text: "**OPS PC 내장형 설계**", children: [{ text: "별도 장비 없이 **올인원 구성**" }] },
          ],
        },
      ],
    },
    {
      type: "toggle",
      title: "하이브리드 환경에 최적화된 장비 내장",
      blocks: [
        { type: "image", asset: "hw-hybrid", alt: "전자칠판 상단의 AI 음성 추적 카메라와 배열 마이크 수음 범위" },
        {
          type: "list",
          items: [
            {
              text: "**8개 배열의 마이크 + AI 기반 음성 추적 카메라**",
              children: [{ text: "**원격수업, 실시간 발표에 강력한 음성·영상 지원**" }],
            },
            { text: "**NFC 로그인 기능**", children: [{ text: "**강사 개인화된 환경 빠르게 셋업**" }] },
            {
              text: "**클라우드 연동 + 무선 미러링 지원**",
              children: [{ text: "다양한 기기와의 **자유로운 콘텐츠 공유 가능**" }],
            },
          ],
        },
      ],
    },
    {
      type: "toggle",
      title: "기술 스펙 요약",
      blocks: [
        {
          type: "callout",
          blocks: [{ type: "paragraph", text: "**ClassIn X**는 타사의 플래그십 제품에 비해 전반적으로 우수한 성능을 갖고 있습니다." }],
        },
        {
          type: "table",
          table: {
            columns: ["항목", "ClassIn X", "S사 pro", "S사 WXX", "L사"],
            highlightColumn: 1,
            rows: [
              ["OS", "Windows", "Tizen", "Android", "Android"],
              ["디스플레이 본딩", "풀라미네이션", "제로본딩", "제로본딩", "제로본딩"],
              ["터치 반응 속도", "2ms", "8ms", "8ms", "8ms"],
              ["NFC", "지원", "미지원", "미지원", "미지원"],
              ["마이크", "8개 내장", "없음", "없음", "없음"],
              ["OPS PC", "내장", "별도 옵션", "별도 옵션", "별도 옵션"],
              ["지문 방지", "우수", "일반", "일반", "일반"],
            ],
            note: "타사 항목은 소개서 작성 시점(2025년)의 공개 사양 기준이며, 모델별로 다를 수 있습니다.",
          },
        },
        {
          type: "table",
          table: {
            columns: ["구성", "주요 스펙"],
            rows: [
              ["전자칠판(IFP)", "65/75/86/110인치 / 4K 해상도 / 멀티터치 / 지문방지, 눈부심방지"],
              ["AI 모션 트래킹 카메라", "4K@30fps / 자동 줌&트래킹 / 교사, 학생 전용 카메라 구분"],
              ["천장 AI 마이크", "32마이크 어레이 / 360도 커버 / AGC+AEC+ANS 내장 / 80㎡ 수음 가능"],
              ["ClassIn 플랫폼", "그룹 분반, 채팅, 퀴즈, 판서, 과제, 평가, 실시간 출석, 강의녹화, LMS 연동"],
              ["기타 장비", "API/SDK 호환 연동, BYOD 디바이스 호환"],
            ],
          },
        },
        { type: "download", download: INTRO_DOWNLOADS.smartClassroom },
      ],
    },
  ] satisfies IntroBlock[],
}

// ─── 3. 고객 사례 ────────────────────────────────────────────────────────────

export const INTRO_CASE_VIDEOS = {
  id: "cases",
  kicker: "Customer Stories",
  title: "고객 사례",
  groups: [
    {
      id: "recording",
      title: "강의 녹화",
      quote:
        "클래스인 전자 칠판 & 카메라를 활용한 **선명한 수업 영상 녹화를 지원**합니다. 카메라 뷰 외에도 **칠판 화면도 별도로 녹화**되어 편집 시 활용이 가능합니다.",
      videos: [
        {
          kind: "youtube",
          youtubeId: "19f1al8hNk0",
          title: "인하대학교 2025학년도 모의논술 자연계열 완벽해설, 조우제 수리논술 대표 강사",
          channel: "정율TV",
          thumbnail: "youtube/19f1al8hNk0",
        },
        {
          kind: "youtube",
          youtubeId: "lz6XY-0Oj4A",
          title: "쎈B 공통수학2 도형의 이동 전문항 풀이",
          channel: "김준성",
          thumbnail: "youtube/lz6XY-0Oj4A",
        },
      ] satisfies IntroVideo[],
    },
    {
      id: "tablet",
      title: "화판 수업",
      quote:
        "학생들의 **필기 내역을 실시간으로 확인 및 첨삭**하는 **[개인 칠판] 기능을 활용**하는 수업 사례입니다. 현재 정율사관학원, 과사람학원, 세정학원 등에서 학생들의 이해도를 정확하게 파악하고 맞춤형 수업을 진행하기 위해 해당 수업 방식을 채택하고 있습니다.",
      videos: [
        { kind: "file", video: "case-quad-learning", title: "쿼드러닝 수업", orientation: "landscape" },
        {
          kind: "youtube",
          youtubeId: "X4zpJB-hymg",
          title: "수1 삼각함수 포기할거야? 수포자 탈출 프로젝트",
          channel: "수K",
          thumbnail: "youtube/X4zpJB-hymg",
        },
        {
          kind: "file",
          video: "case-dongincheon-science",
          title: "동인천종로엠학원 과티T — 소통하는 수업, 디지털 교과서로 더 가까이",
          orientation: "portrait",
        },
        {
          kind: "file",
          video: "case-dongincheon-math",
          title: "동인천종로엠학원 수이T와 함께하는 경우의 수 수업",
          orientation: "portrait",
        },
      ] satisfies IntroVideo[],
    },
  ],
  gallery: {
    id: "smart-classrooms",
    title: "스마트 교실 구성",
    quote: "ClassIn X 시리즈 기반의 클래스인 스마트 교실의 실제 모습을 한 번 살펴보세요.",
  },
}

export type IntroCaseSector = "공교육" | "사교육" | "기타교육"
export type IntroCaseCountry = "한국" | "싱가포르" | "중국"

export interface IntroCase {
  slug: string
  name: string
  sector: IntroCaseSector
  country: IntroCaseCountry
  /** 목록 카드 사진 */
  cover: IntroAssetKey
  /** 목록 카드·메타 설명 한 줄. 원문에 설명이 없는 사례는 사진 구성만 말한다. */
  summary: string
  body: IntroBlock[]
}

// 순서는 원문 데이터베이스 보기 순서를 따른다.
export const INTRO_CASES: IntroCase[] = [
  {
    slug: "korea-digital-media-high-school",
    name: "한국디지털미디어고등학교",
    sector: "공교육",
    country: "한국",
    cover: "cases/korea-digital-media-high-school-3",
    summary: "86인치 ClassIn X 전자칠판과 모션 트래킹 카메라로 교실마다 같은 하이브리드 수업 환경을 만들었습니다.",
    body: [
      {
        type: "paragraph",
        text: "한국디지털미디어고는 86인치 ClassIn X 전자칠판, 모션 트래킹 카메라를 도입해 교실마다 일관된 하이브리드 수업 환경을 구축했습니다.",
      },
      {
        type: "paragraph",
        text: "실시간 판서, 원격 참여, 자동 녹화 기능을 통합해 수업 몰입도와 운영 효율성을 동시에 향상시켰습니다.",
      },
      {
        type: "imageRow",
        images: [
          { asset: "cases/korea-digital-media-high-school-1", alt: "한국디지털미디어고 교실에 설치된 ClassIn X 전자칠판" },
          { asset: "cases/korea-digital-media-high-school-2", alt: "한국디지털미디어고 교실 전경" },
        ],
      },
      { type: "image", asset: "cases/korea-digital-media-high-school-3", alt: "한국디지털미디어고 스마트 교실" },
    ],
  },
  {
    slug: "acts-university",
    name: "아신대학교",
    sector: "공교육",
    country: "한국",
    cover: "cases/acts-university-1",
    summary: "전자칠판·천장형 마이크·전후면 카메라로 해외 교수 초빙 수업과 원격 참여, 수업 녹화를 운영합니다.",
    body: [
      {
        type: "list",
        items: [
          {
            text: "전자 칠판 / 천장형 마이크(DT1) / 전후면 카메라(T1&S1)를 종합적으로 활용하고 있습니다.",
            children: [
              { text: "이러한 스마트 교실 솔루션을 활용하여 해외의 교수자를 초빙하거나," },
              { text: "학생들이 공간적 제약을 받지 않고 자유로운 참여를 보장합니다." },
              { text: "또한 모든 수업은 실시간으로 녹화되어 차후 복습 자료로 사용됩니다." },
            ],
          },
        ],
      },
      {
        type: "imageRow",
        images: [
          { asset: "cases/acts-university-1", alt: "아신대학교 강의실 전자칠판에 띄운 ACTS University × ClassIn 화면" },
          {
            asset: "cases/acts-university-2",
            alt: "아신대학교 강의실 전자칠판 화면",
            caption: "후면 카메라를 통해 강의자 화면 송출",
          },
        ],
      },
      { type: "image", asset: "cases/acts-university-3", alt: "아신대학교 스마트 강의실 전경" },
    ],
  },
  {
    slug: "bucheon-jungyul",
    name: "부천 정율사관학원",
    sector: "사교육",
    country: "한국",
    cover: "cases/bucheon-jungyul-1",
    summary: "모든 교실을 하이브리드로 운영해 부산·대구·대치동 학생도 실시간으로 함께 수업합니다.",
    body: [
      { type: "heading", level: 2, text: "사진" },
      { type: "image", asset: "cases/bucheon-jungyul-1", alt: "정율사관학원 스마트 교실 전경" },
      {
        type: "imageRow",
        images: [
          { asset: "cases/bucheon-jungyul-2", alt: "정율사관학원 강의실 — 전자칠판과 원격 참여 화면" },
          { asset: "cases/bucheon-jungyul-3", alt: "정율사관학원 강의실에서 학생들이 수업을 듣는 모습" },
        ],
      },
      {
        type: "imageRow",
        images: [
          { asset: "cases/bucheon-jungyul-4", alt: "정율사관학원 강의실 전자칠판" },
          { asset: "cases/bucheon-jungyul-5", alt: "정율사관학원 강의실 좌석 배치" },
        ],
      },
      {
        type: "list",
        items: [
          {
            text: "모든 교실에 전자 칠판(86″ 혹은 110″) / 전후면 카메라(T1&S1)가 설치되어 있습니다.",
            children: [
              { text: "이러한 스마트 교실 솔루션을 기반으로, 모든 수업은 **하이브리드로 진행**됩니다." },
              {
                text: "수업은 부천에서 진행되지만 **학생들은 부천 외의 지역**(부산, 대구, 대치동)**에서 모집**되어 실시간으로 함께 참여하기도 합니다.",
              },
              { text: "실시간 수업 외에도 온라인 강의를 촬영하여 **녹화 수업들이 판매**되기도 합니다." },
            ],
          },
        ],
      },
      { type: "heading", level: 2, text: "영상" },
      { type: "quote", text: "학원 투어 & 정율사관 내 클래스인 시스템 활용 영상" },
      {
        type: "video",
        video: {
          kind: "file",
          video: "cases/bucheon-jungyul-video-1",
          title: "정율사관학원 투어 & 클래스인 시스템 활용 영상",
          orientation: "landscape",
        },
      },
    ],
  },
  {
    slug: "busan-gwasaram",
    name: "부산 과사람학원",
    sector: "사교육",
    country: "한국",
    cover: "cases/busan-gwasaram-1",
    summary: "86″ 전자칠판 두 대를 이어 듀얼 스크린으로 쓰며, 교실 어디서든 칠판이 보이게 했습니다.",
    body: [
      {
        type: "list",
        items: [
          {
            text: "86″ 전자 칠판 두 개를 연결하여 **듀얼 스크린 솔루션으로 활용**하고 있습니다.",
            children: [
              { text: "연결된 듀얼 스크린은 수업에 따라 확장 혹은 복제 화면으로 사용됩니다." },
              {
                text: "아래 [교실 모습]의 사진은 ‘복제 화면’으로 사용하는 모습으로, 학생들이 교실 내 어디에 앉아있더라도 교실 칠판에 대한 시야를 확보해줍니다.",
              },
            ],
          },
        ],
      },
      { type: "heading", level: 2, text: "영상" },
      {
        type: "video",
        video: {
          kind: "file",
          video: "cases/busan-gwasaram-video-1",
          title: "과사람학원 완공 기념식",
          orientation: "landscape",
        },
      },
      { type: "heading", level: 2, text: "교실 모습" },
      { type: "image", asset: "cases/busan-gwasaram-1", alt: "과사람학원 교실 — 듀얼 전자칠판을 복제 화면으로 쓰는 모습" },
      { type: "image", asset: "cases/busan-gwasaram-2", alt: "과사람학원 교실에서 강사가 듀얼 전자칠판으로 수업하는 모습" },
    ],
  },
  {
    slug: "cheongju-youngs-english",
    name: "청주 영스잉글리쉬",
    sector: "사교육",
    country: "한국",
    cover: "cases/cheongju-youngs-english-1",
    summary: "영어 학원 강의실에 클래스인 전자칠판을 설치한 모습입니다.",
    body: [{ type: "image", asset: "cases/cheongju-youngs-english-1", alt: "청주 영스잉글리쉬 강의실의 클래스인 전자칠판" }],
  },
  {
    slug: "korea-hakwon-university",
    name: "한국학원대",
    sector: "기타교육",
    country: "한국",
    cover: "cases/korea-hakwon-university-1",
    summary: "강연장과 교실에 클래스인 전자칠판을 설치해 강의와 행사를 운영합니다.",
    body: [
      {
        type: "imageRow",
        images: [
          { asset: "cases/korea-hakwon-university-1", alt: "한국학원대 강연장 전경" },
          { asset: "cases/korea-hakwon-university-2", alt: "한국학원대 강연장 전자칠판" },
        ],
      },
      { type: "image", asset: "cases/korea-hakwon-university-3", alt: "한국학원대 강의 장면" },
      { type: "image", asset: "cases/korea-hakwon-university-4", alt: "한국학원대 강의를 노트북으로 원격 시청하는 모습" },
    ],
  },
  {
    slug: "icheon-aidabom",
    name: "이천 아이다봄",
    sector: "기타교육",
    country: "한국",
    cover: "cases/icheon-aidabom-1",
    summary: "아동·부모 교육 공간에 클래스인 전자칠판을 두고 특강과 수업에 활용합니다.",
    body: [
      { type: "image", asset: "cases/icheon-aidabom-1", alt: "이천 아이다봄 특강 현장" },
      { type: "image", asset: "cases/icheon-aidabom-2", alt: "이천 아이다봄 교육 공간의 전자칠판" },
    ],
  },
  {
    slug: "cheonan-jscan",
    name: "천안 제이스칸",
    sector: "사교육",
    country: "한국",
    cover: "cases/cheonan-jscan-1",
    summary: "강의실에 클래스인 전자칠판을 설치한 모습입니다.",
    body: [{ type: "image", asset: "cases/cheonan-jscan-1", alt: "천안 제이스칸 강의실의 클래스인 전자칠판" }],
  },
  {
    slug: "cheongju-leemisook-korean",
    name: "청주 이미숙국어",
    sector: "사교육",
    country: "한국",
    cover: "cases/cheongju-leemisook-korean-1",
    summary: "국어 학원 강의실의 클래스인 전자칠판 구성입니다.",
    body: [
      { type: "image", asset: "cases/cheongju-leemisook-korean-1", alt: "청주 이미숙국어 강의실" },
      { type: "image", asset: "cases/cheongju-leemisook-korean-2", alt: "청주 이미숙국어 강의실 전자칠판" },
    ],
  },
  {
    slug: "suwon-mijiwon",
    name: "수원 미지원교육",
    sector: "사교육",
    country: "한국",
    cover: "cases/suwon-mijiwon-1",
    summary: "강의실에 클래스인 전자칠판을 설치한 모습입니다.",
    body: [{ type: "image", asset: "cases/suwon-mijiwon-1", alt: "수원 미지원교육 강의실의 클래스인 전자칠판" }],
  },
  {
    slug: "dongincheon-jongro-m",
    name: "동인천종로엠",
    sector: "사교육",
    country: "한국",
    cover: "cases/dongincheon-jongro-m-1",
    summary: "디지털 교과서와 태블릿으로 학생과 선생님이 함께 소통하는 양방향 수업을 진행합니다.",
    body: [
      { type: "image", asset: "cases/dongincheon-jongro-m-1", alt: "동인천종로엠학원 강의실" },
      { type: "image", asset: "cases/dongincheon-jongro-m-2", alt: "동인천종로엠학원 강의실 전자칠판" },
      // 본문 「화판 수업」에 실린 이 학원 수업 영상 두 편을 사례 쪽에도 함께 둔다.
      { type: "heading", level: 2, text: "수업 영상" },
      {
        type: "videoRow",
        videos: [
          {
            kind: "file",
            video: "case-dongincheon-science",
            title: "동인천종로엠학원 과티T — 소통하는 수업, 디지털 교과서로 더 가까이",
            orientation: "portrait",
          },
          {
            kind: "file",
            video: "case-dongincheon-math",
            title: "동인천종로엠학원 수이T와 함께하는 경우의 수 수업",
            orientation: "portrait",
          },
        ],
      },
    ],
  },
  {
    slug: "gwanggyo-u2m",
    name: "광교 U2M",
    sector: "사교육",
    country: "한국",
    cover: "cases/gwanggyo-u2m-1",
    summary: "강의실에 클래스인 전자칠판을 설치한 모습입니다.",
    body: [{ type: "image", asset: "cases/gwanggyo-u2m-1", alt: "광교 U2M 강의실의 클래스인 전자칠판" }],
  },
  {
    slug: "busan-yerim",
    name: "부산 예림학원",
    sector: "사교육",
    country: "한국",
    cover: "cases/busan-yerim-1",
    summary: "강의실에 클래스인 전자칠판을 설치한 모습입니다.",
    body: [{ type: "image", asset: "cases/busan-yerim-1", alt: "부산 예림학원 강의실의 클래스인 전자칠판" }],
  },
  {
    slug: "pyo-criminal-science-lab",
    name: "표창원범죄과학연구소",
    sector: "기타교육",
    country: "한국",
    cover: "cases/pyo-criminal-science-lab-1",
    summary: "강의 공간에 클래스인 전자칠판을 두고 강연과 교육을 진행합니다.",
    body: [
      { type: "image", asset: "cases/pyo-criminal-science-lab-1", alt: "표창원범죄과학연구소 강의 공간" },
      { type: "image", asset: "cases/pyo-criminal-science-lab-2", alt: "표창원범죄과학연구소 전자칠판" },
    ],
  },
  {
    slug: "national-university-of-singapore",
    name: "싱가포르국립대학교",
    sector: "공교육",
    country: "싱가포르",
    cover: "cases/national-university-of-singapore-1",
    summary: "싱가포르국립대학교의 클래스인 스마트 강의실입니다.",
    body: [{ type: "image", asset: "cases/national-university-of-singapore-1", alt: "싱가포르국립대학교 클래스인 스마트 강의실" }],
  },
  {
    slug: "peking-university",
    name: "북경대학교",
    sector: "공교육",
    country: "중국",
    cover: "cases/peking-university-1",
    summary: "북경대학교의 클래스인 스마트 교실입니다.",
    body: [{ type: "image", asset: "cases/peking-university-1", alt: "북경대학교 클래스인 스마트 교실" }],
  },
  {
    slug: "k1-sports",
    name: "K1스포츠",
    sector: "사교육",
    country: "한국",
    cover: "cases/k1-sports-1",
    summary: "교육 공간에 이동형 스탠드 전자칠판을 둔 구성입니다.",
    body: [{ type: "image", asset: "cases/k1-sports-1", alt: "K1스포츠 교육 공간의 이동형 스탠드 전자칠판" }],
  },
]

export function getIntroCase(slug: string): IntroCase | undefined {
  return INTRO_CASES.find((item) => item.slug === slug)
}

export const INTRO_CASE_FILTERS: Array<{ id: "all" | IntroCaseSector; label: string }> = [
  { id: "all", label: "전체" },
  { id: "공교육", label: "공교육" },
  { id: "사교육", label: "사교육" },
  { id: "기타교육", label: "기타교육" },
]

// ─── 마무리 CTA ──────────────────────────────────────────────────────────────

export const INTRO_FINAL_CTA = {
  title: "우리 기관에 맞는 클래스인 구성이 궁금하다면",
  lead: "교실 수, 수업 방식, 이미 쓰는 장비를 알려 주시면 맞는 구성과 도입 순서를 함께 정리해 드립니다. 목동 쇼룸에서는 실제 수업 흐름을 직접 써 볼 수 있습니다.",
  primary: { label: "도입 상담 신청", href: "/contact#contact-form", ctaId: "introduction_final_contact" },
  secondary: { label: "목동 쇼룸 방문 예약", href: "/showroom", ctaId: "introduction_final_showroom" },
}
