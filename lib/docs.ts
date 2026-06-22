import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import { buildCsFigmaMediaForGuide } from "@/lib/cs-figma-assets"
import { CS_FIGMA_GUIDES, sanitizeGuideStep, type CsFigmaGuide } from "@/lib/cs-figma-guides"
import { getCsFigmaEnrichment } from "@/lib/cs-figma-enrichments"

export const DOC_CATEGORY_IDS = [
  "quick-start",
  "guides",
  "manual",
  "help",
  "troubleshooting",
  "updates",
  "start",
  "software",
  "admin",
  "teacher",
  "student",
  "hardware",
  "board",
] as const

export type DocCategoryId = (typeof DOC_CATEGORY_IDS)[number]
export type DocArticleStatus = "draft" | "review" | "published" | "archived"
export type DocArticleVisibility = "public" | "unlisted" | "internal"
export type DocArticleDocType =
  | "guide"
  | "manual"
  | "faq"
  | "troubleshooting"
  | "release_note"
  | "reference"
export type DocArticleProductArea =
  | "general"
  | "software"
  | "hardware"
  | "billing"
  | "onboarding"
  | "classroom"
  | "admin"
  | "partner"
export type DocArticleDifficulty = "beginner" | "intermediate" | "advanced"

export interface DocCategory {
  id: DocCategoryId
  title: string
  description: string
  order: number
}

export interface DocSection {
  heading: string
  body: string
  steps?: string[]
  media?: DocMedia[]
}

export interface DocMedia {
  type: "image" | "video"
  src: string
  alt: string
  caption?: string
  width?: number
  height?: number
}

export interface DocResource {
  label: string
  href: string
  description?: string
}

export interface DocArticle {
  slug: string
  category: DocCategoryId
  title: string
  description: string
  audience: string
  updatedAt: string
  readMinutes: number
  featured?: boolean
  tags: string[]
  keywords: string[]
  chatbotSummary: string
  sections: DocSection[]
  resources?: DocResource[]
  relatedSlugs?: string[]
  status?: DocArticleStatus
  visibility?: DocArticleVisibility
  noindex?: boolean
  seoTitle?: string
  seoDescription?: string
  canonicalPath?: string
  docType?: DocArticleDocType
  productArea?: DocArticleProductArea
  difficulty?: DocArticleDifficulty
}

export function isDocCategoryId(value: string): value is DocCategoryId {
  return (DOC_CATEGORY_IDS as readonly string[]).includes(value)
}

export const docsCategories: DocCategory[] = [
  {
    id: "start",
    title: "클래스인 시작하기",
    description: "설치부터 회원가입까지, 수업을 진행하고 참여하기 위한 기초 안내입니다.",
    order: 1,
  },
  {
    id: "software",
    title: "[소프트웨어] 기능 가이드",
    description: "수업 도구, 학습 활동, LMS, AI, 데이터 기능을 제품 기능 기준으로 정리합니다.",
    order: 2,
  },
  {
    id: "admin",
    title: "[관리자] 사용 가이드",
    description: "기관(학원) 관리자를 위한 대시보드 전반의 사용 방법을 안내합니다.",
    order: 3,
  },
  {
    id: "teacher",
    title: "[교사] 사용 가이드",
    description: "수업을 진행하는 강사를 위한 클래스인 사용 가이드입니다.",
    order: 4,
  },
  {
    id: "student",
    title: "[학생] 사용 가이드",
    description: "수업 참여부터 학습 활동 제출까지 학생을 위한 다양한 사용법을 모았습니다.",
    order: 5,
  },
  {
    id: "hardware",
    title: "[하드웨어] 기능 가이드",
    description: "Classin Board의 판서, 디스플레이, AI 카메라, 모델별 사양을 정리합니다.",
    order: 6,
  },
  {
    id: "board",
    title: "[전자칠판] 배송/설치",
    description: "전자칠판 배송 및 설치 관련 안내입니다.",
    order: 7,
  },
]

const CLASSIN_607_MEDIA_BASE = "/docs/files/classin-607-update"
const SOFTWARE_MEDIA_BASE = "/images/product/sw"
const HARDWARE_MEDIA_BASE = "/images/product/hw"

// 생성된 CS 가이드 텍스트에서 내부 운영 표현(피그마/원본 캡처/CS 캡처/파일 목록)을 소비자용 중립 표현으로 정리한다.
function sanitizeCsFigmaText(value: string): string {
  return value
    .replace(/원본\s*캡처\s*:\s*[^.\n]*\.?/g, "")
    .replace(/출처\s*메모\s*:\s*[^.\n]*\.?/g, "")
    .replace(/Figma\s*['"`]?CS용\s*캡쳐\s*모음['"`]?\s*전수\s*추출\s*문서/gi, "공식 안내 화면")
    .replace(/Figma\s*CS\s*캡처(?:\s*보드)?/gi, "안내 화면")
    .replace(/CS\s*캡처(?:\s*보드)?/gi, "안내 화면")
    .replace(/Figma\s*(?:보드|캡처|캡쳐)/gi, "안내 화면")
    .replace(/원본\s*캡처/gi, "안내 화면")
    .replace(/\bFigma\b/gi, "안내 화면")
    .replace(/(\d+)\s*장의\s*스크린샷으로\s*안내하는\s*가이드/g, "화면을 순서대로 안내하는 가이드")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

// 키워드/메타에서 내부 예시 식별자(예: "학원K(메인 계정)", "대수 개념 올데이-New Course-20",
// "클립 1", 전화/계정 ID 숫자)를 걸러 개인정보·내부 표현이 새지 않게 한다.
const CS_FIGMA_PII_KEYWORD_RE = /메인\s*계정|학원[A-Z]\b|New\s*Course|클립\s*\d|\d{8,}/i

function scrubCsFigmaKeywords(keywords: string[]): string[] {
  return Array.from(
    new Set(
      keywords
        .map((keyword) => sanitizeCsFigmaText(keyword))
        .filter((keyword) => keyword.length > 0 && !CS_FIGMA_PII_KEYWORD_RE.test(keyword))
    )
  )
}

const CS_FIGMA_RELATED_SLUGS = ["app-capabilities-map", "classroom-basic-setup", "course-activities"]

function getCsFigmaProductArea(guide: CsFigmaGuide): DocArticleProductArea {
  return guide.category === "admin"
    ? "admin"
    : guide.category === "onboarding"
      ? "onboarding"
      : "classroom"
}

export function buildCsFigmaDocArticle(
  guide: CsFigmaGuide,
  assetPaths?: readonly string[]
): DocArticle {
  const enrichment = getCsFigmaEnrichment(guide.docSlug)
  const baseTags = ["사용 가이드", "사용법", guide.category]
  const baseKeywords = scrubCsFigmaKeywords([
    guide.title,
    ...guide.keywords,
    ...guide.sourceImageFiles,
    "사용법",
    "순서 안내",
  ])
  const baseMeta = {
    slug: guide.docSlug,
    category: guide.docCategory,
    audience: guide.audience,
    updatedAt: "2026-06-21",
    featured: false,
    tags: baseTags,
    keywords: baseKeywords,
    relatedSlugs: CS_FIGMA_RELATED_SLUGS,
    status: "published" as const,
    visibility: "unlisted" as const,
    noindex: true,
    docType: "manual" as const,
    productArea: getCsFigmaProductArea(guide),
    difficulty: "beginner" as const,
  }

  // 소비자용 보강이 있는 문서: 합성 캡처 대신 단계별 화면을 각 단계 옆에 배치한다.
  if (enrichment) {
    const stageSections: DocSection[] = enrichment.stages.map((stage) => ({
      heading: stage.title,
      body: stage.body,
      ...(stage.image
        ? {
            media: [
              {
                type: "image" as const,
                src: stage.image,
                alt: stage.imageAlt ?? stage.title,
                caption: "",
                ...(stage.width ? { width: stage.width } : {}),
                ...(stage.height ? { height: stage.height } : {}),
              },
            ],
          }
        : {}),
    }))

    const sections: DocSection[] = []
    if (enrichment.heroImage) {
      sections.push({
        heading: "한눈에 보기",
        body: "전체 단계를 한 화면에 담은 안내입니다. 아래에서 단계별로 자세히 설명합니다.",
        media: [
          {
            type: "image" as const,
            src: enrichment.heroImage.src,
            alt: enrichment.heroImage.alt ?? enrichment.title ?? guide.title,
            caption: "",
          },
        ],
      })
    }
    sections.push(...stageSections)
    if (enrichment.tips && enrichment.tips.length > 0) {
      sections.push({ heading: "알아두면 좋은 점", body: "", steps: enrichment.tips })
    }

    return {
      ...baseMeta,
      title: enrichment.title ?? guide.title,
      description: enrichment.intro,
      readMinutes: Math.max(3, Math.ceil(enrichment.stages.length * 0.7)),
      chatbotSummary: enrichment.intro,
      sections,
      ...(enrichment.downloadImage
        ? {
            resources: [
              {
                label: enrichment.downloadImage.label,
                href: enrichment.downloadImage.src,
                description: enrichment.downloadImage.description,
              },
            ],
          }
        : {}),
    }
  }

  // 보강이 없는 문서: 피그마/캡처 표현을 제거한 기본 구성으로 자동 정리한다.
  const media = buildCsFigmaMediaForGuide(guide, assetPaths)
  const sections: DocSection[] = [
    {
      heading: "순서대로 따라 하기",
      body: "아래 순서대로 따라 하시면 됩니다.",
      steps: guide.steps.map((step) => sanitizeGuideStep(step)).filter(Boolean),
      ...(media.length > 0 ? { media } : {}),
    },
    ...guide.deepDive
      // 위 "순서대로 따라 하기"와 중복되는 단계 안내 레벨은 제외한다.
      .filter((item) => !/순서\s*그대로\s*안내/.test(item.title))
      .map((item) => ({
        heading: sanitizeCsFigmaText(item.title),
        body: sanitizeCsFigmaText(item.body),
        steps: item.checks.map(sanitizeCsFigmaText).filter(Boolean),
      })),
  ]

  return {
    ...baseMeta,
    title: guide.title,
    description: sanitizeCsFigmaText(guide.summary),
    readMinutes: Math.max(3, Math.ceil((guide.steps.length + guide.deepDive.length * 3) / 4)),
    chatbotSummary: sanitizeCsFigmaText(guide.summary),
    sections,
  }
}

const csFigmaDocs: DocArticle[] = CS_FIGMA_GUIDES.map((guide) => buildCsFigmaDocArticle(guide))

const docs: DocArticle[] = [
  ...csFigmaDocs,
  {
    slug: "academy-system-os-positioning",
    category: "start",
    title: "Classin을 학원 시스템 OS로 이해하기",
    description: "Classin을 Zoom, 일반 전자칠판, LMS 중 하나와 비교하기 전에 학원 수업 운영 흐름 전체에서 이해할 수 있도록 정리했습니다.",
    audience: "학원 원장, 관리자, 운영 책임자, 기관 도입 담당자",
    updatedAt: "2026-06-16",
    readMinutes: 7,
    featured: true,
    tags: ["학원 시스템 OS", "도입 상담", "전자칠판", "EDB", "녹화", "LMS", "관리자 데이터"],
    keywords: [
      "학원 시스템 OS",
      "Classin 차이",
      "Zoom과 차이",
      "일반 전자칠판과 차이",
      "EDB",
      "수업 녹화",
      "LMS",
      "관리자 대시보드",
      "API 연동",
      "학원 도입",
    ],
    chatbotSummary: CLASSIN_POSITIONING.chatbot.identitySummary,
    sections: [
      {
        heading: "한 문장으로 정의",
        body: CLASSIN_POSITIONING.oneLine,
        steps: [
          "전자칠판만 바꾸는 프로젝트가 아니라 수업 운영 기준을 다시 세우는 프로젝트로 봅니다.",
          "수업 준비, 판서, 녹화, 복습, 과제, 학생 관리, 관리자 데이터를 한 흐름으로 연결합니다.",
          "강사 개인기와 외부 도구 조합에 의존하던 운영을 기관의 반복 가능한 기준으로 바꿉니다.",
        ],
      },
      {
        heading: "Zoom이나 일반 전자칠판과 다른 점",
        body: CLASSIN_POSITIONING.coreNarrative,
        steps: CLASSIN_POSITIONING.comparisonPoints.map((item) => `${item.label}: ${item.point}`),
      },
      {
        heading: "한국 학원에서 현실적인 첫 도입 범위",
        body: CLASSIN_POSITIONING.localReality,
        steps: [
          "첫 단계는 전자칠판, 수업 녹화, 수업 관리 중심으로 잡는 편이 현실적입니다.",
          "대표 수업 1개와 대표 강사 1명을 정해 파일럿 교실을 먼저 만듭니다.",
          "교사 온보딩은 EDB 교안 전환, 녹화와 복습 배포, LMS 숙제·시험 루틴 순서로 잡습니다.",
          "온라인·하이브리드 전체 전환보다 오프라인 교실의 수업 품질 표준화부터 시작할 수 있습니다.",
          "학생 개인 기기 활용은 학원 문화와 수업 방식에 따라 단계적으로 검토합니다.",
        ],
      },
      {
        heading: "EDB가 도입 설득에서 중요한 이유",
        body: CLASSIN_POSITIONING.edbSummary,
        steps: [
          "우수 강사의 판서, 이미지 배치, 활동 구성을 수업 파일로 남길 수 있습니다.",
          "수업마다 자료를 하나씩 다시 띄우거나 칠판을 지우는 시간을 줄일 수 있습니다.",
          "교안 템플릿을 재사용하면 신규 강사 온보딩과 지점별 수업 표준화에 도움이 됩니다.",
          "전자칠판, 녹화, LMS 운영과 함께 설계해야 실제 수업 후 복습 자산으로 이어집니다.",
        ],
      },
      {
        heading: "관리자가 봐야 하는 데이터",
        body: CLASSIN_POSITIONING.adminDataSummary,
        steps: [
          "수업 시간, 출결과 참여, 수업 특이사항, 네트워크 상태를 운영 점검 기준으로 봅니다.",
          "권한이 허용된 관리자 또는 교사 계정만 필요한 데이터에 접근하도록 설계합니다.",
          "수업 녹화와 복습 자료가 정상적으로 남았는지 확인합니다.",
          "감에 의존하던 강사 관리와 학생 관리를 반복 가능한 기준으로 바꿉니다.",
        ],
      },
      {
        heading: "정직하게 분리해야 하는 영역",
        body: CLASSIN_POSITIONING.honestLimit,
        steps: [
          "결제와 정산은 학원별 운영 방식이 달라 별도 시스템과의 역할 분담을 먼저 정합니다.",
          "오프라인 출석은 현장 장비와 운영 규칙에 따라 외부 시스템 또는 별도 프로세스가 필요할 수 있습니다.",
          "고급 리포트와 자체 CRM 연계는 공식 API, 데이터 구독, 커스텀 대시보드 범위로 분리해 검토합니다.",
          ...CLASSIN_POSITIONING.apiStages,
        ],
      },
    ],
    resources: [
      {
        label: "ClassIn EDB 파일 만들기 공식 가이드",
        href: "https://www.classin.com/kr/how-to-create-edb-files/",
        description: "EDB 파일의 개념과 제작 흐름을 확인할 수 있는 공식 자료입니다.",
      },
      {
        label: "ClassIn API 공식 문서",
        href: "https://docs.eeo.cn/api/en/",
        description: "데이터 구독, 코스/수업 정보 조회, SDK 등 연동 범위를 확인할 때 참고합니다.",
      },
      {
        label: "학원 시스템 OS 진단 체크리스트",
        href: "/resources/academy-system-checklist",
        description: "우리 학원이 Classin을 도입할 준비가 되었는지 점검하는 자료입니다.",
      },
    ],
    relatedSlugs: ["software-overview", "board-overview", "admin-operation-standardization"],
  },
  {
    slug: "software-overview",
    category: "software",
    title: "Classin 소프트웨어 기능 한눈에 보기",
    description: "Classin 소프트웨어가 제공하는 실시간 교실, 수업 도구, 학습 활동, LMS, AI, 데이터 기능을 전체 구조로 정리했습니다.",
    audience: "도입 검토자, 학원 관리자, 운영팀, 교사",
    updatedAt: "2026-05-30",
    readMinutes: 6,
    featured: true,
    tags: ["소프트웨어", "기능 지도", "수업 운영", "LMS", "AI"],
    keywords: ["Classin 소프트웨어", "클래스인 기능", "수업 도구", "학습 활동", "LMS", "AI 튜터", "자동 녹화", "학습 데이터"],
    chatbotSummary: "Classin 소프트웨어는 실시간 교실, 판서와 수업 도구, 숙제·시험·자료 같은 학습 활동, 출결·과제·성적을 관리하는 LMS, 자동 녹화와 리포트, AI 튜터·AI 평가 기능을 하나의 흐름으로 제공합니다. 도입 초기에는 설치와 계정, 코스 구조, 교사 온보딩, 수업 도구, 학습 활동, 데이터 확인 순서로 점검하는 것이 좋습니다.",
    sections: [
      {
        heading: "소프트웨어가 담당하는 범위",
        body: "Classin 소프트웨어는 단순 화상 수업 도구가 아니라 수업 전 준비, 실시간 수업, 수업 후 복습, 과제와 성적 관리까지 이어지는 교육 운영 플랫폼입니다. 교사는 교실에서 수업을 진행하고, 학생은 코스와 수업 활동을 따라 학습하며, 관리자는 운영 데이터와 권한을 확인합니다.",
        steps: [
          "수업 전: 코스 개설, 단원 구성, 자료 업로드, 학생 초대, 수업 예약을 준비합니다.",
          "수업 중: 전자칠판, 화면 공유, 채팅, 퀴즈, 그룹 토론, 개인 칠판 등으로 상호작용을 진행합니다.",
          "수업 후: 자동 녹화, 학습 보고서, 과제 제출, 성적 확인, 피드백 전달로 복습 흐름을 만듭니다.",
          "운영 관리: 출결, 스토리지, 교사·학생 계정, 웹 라이브, 통계 데이터를 관리합니다.",
          "AI 활용: 튜터, 평가, 첨삭, 과제 생성, 문서 정리 등 학습 보조 기능을 상황에 맞게 사용합니다.",
        ],
      },
      {
        heading: "기능은 다섯 묶음으로 보면 쉽습니다",
        body: "처음 기능을 익힐 때는 화면 이름보다 운영 흐름 기준으로 나누는 편이 빠릅니다.",
        steps: [
          "실시간 교실: 전자칠판, 카메라, 마이크, 채팅, 화면 공유, 미러링, VNC가 포함됩니다.",
          "수업 도구: 타이머, 스톱워치, 주사위, 랜덤 선택, 레이저 포인터, 퀴즈, 그룹 토론, 개인 칠판이 포함됩니다.",
          "학습 활동: 수업, 숙제, 시험, 녹화 수업, 학습 자료, 일일 과제, 토론, OMR 카드, SCORM, 따라읽기를 구성합니다.",
          "운영/LMS: 코스, 단원, 출결, 과제, 성적, 보고서, 드라이브, 공지와 메시지를 관리합니다.",
          "AI/데이터: AI 튜터, AI 평가, AI 첨삭, 학습 데이터 리포트, 관리자 통계를 확인합니다.",
        ],
      },
      {
        heading: "역할별로 먼저 볼 기능",
        body: "학원 안에서 같은 Classin을 쓰더라도 관리자, 교사, 학생이 먼저 익혀야 할 기능은 다릅니다.",
        steps: [
          "관리자는 기관 설정, 교사와 학생 추가, 코스 권한, 스토리지, 웹 라이브, 통계 데이터를 먼저 확인합니다.",
          "교사는 프로필, 드라이브 자료, 코스 생성, 수업 생성, 학습 활동 추가, 교실 기본 설정을 먼저 익힙니다.",
          "학생은 코스 참여, 수업 입장, 다시보기, 과제 제출, 성적 확인, AI 튜터 사용법을 먼저 익힙니다.",
          "운영팀은 상담과 온보딩에서 설치, 계정 인증, 첫 수업 체크리스트, 자주 묻는 질문을 바로 안내할 수 있어야 합니다.",
        ],
      },
      {
        heading: "도입 초기에 잡아야 하는 기준",
        body: "소프트웨어 기능을 모두 한 번에 쓰려 하면 현장 적응이 느려질 수 있습니다. 첫 2주에는 수업 안정성과 반복 운영을 만드는 기능부터 도입하는 것이 좋습니다.",
        steps: [
          "1단계: 설치, 회원가입, 비밀번호, 계정 인증, 코스 참여 경로를 정리합니다.",
          "2단계: 교사용 기본 수업 템플릿과 자료 업로드 규칙을 정합니다.",
          "3단계: 판서, 채팅, 화면 공유, 타이머, 퀴즈처럼 매 수업 쓰는 도구를 먼저 훈련합니다.",
          "4단계: 숙제, 시험, 성적, 리포트 등 수업 후 운영 기능을 붙입니다.",
          "5단계: AI 튜터, AI 평가, 학습 데이터 리포트처럼 운영 고도화 기능을 적용합니다.",
        ],
      },
      {
        heading: "같이 보면 좋은 문서",
        body: "전체 구조를 확인한 뒤에는 실제 사용할 기능별 문서를 이어서 확인하세요.",
        steps: [
          "수업 중 사용할 도구는 '교실과 판서 도구 사용법'에서 확인합니다.",
          "숙제, 시험, 녹화 수업, 자료 배포는 '수업·숙제·시험·학습 활동 가이드'에서 확인합니다.",
          "AI 기능은 'AI 튜터와 AI 평가 활용하기'에서 확인합니다.",
          "관리자 관점의 운영 데이터는 '관리자 모니터링과 통계 활용'에서 확인합니다.",
        ],
      },
    ],
    resources: [
      {
        label: "Classin 소프트웨어 소개",
        href: "/product/sw",
        description: "제품 소개 페이지에서 주요 기능과 도입 사례를 함께 확인할 수 있습니다.",
      },
    ],
    relatedSlugs: ["classroom-tools", "lesson-activities", "ai-learning-tools"],
  },
  {
    slug: "classroom-tools",
    category: "software",
    title: "교실과 판서 도구 사용법",
    description: "실시간 수업에서 자주 쓰는 판서, 화면 공유, 퀴즈, 그룹 토론, 개인 칠판, 보조 도구를 목적별로 정리했습니다.",
    audience: "교사, 수업 운영팀, 신규 강사 온보딩 담당자",
    updatedAt: "2026-05-30",
    readMinutes: 9,
    featured: true,
    tags: ["교실", "판서", "수업 도구", "퀴즈", "상호작용", "온스테이지", "STEM 실험", "게이미피케이션"],
    keywords: ["전자칠판", "수업 도구", "타이머", "스톱워치", "화면 공유", "미러링", "개인 칠판", "그룹 토론", "선착순 퀴즈", "온스테이지", "오프스테이지", "발표 권한", "물리 실험", "화학 실험", "기하도형", "측정 도구", "바둑 칠판", "공동 작업", "다방향 브라우저", "보조 카메라", "랜덤 선택", "트로피 순위", "레이저 포인터"],
    chatbotSummary: "교실 도구는 수업 리듬을 만드는 도구, 판서와 화면을 다루는 도구, 학생 참여를 끌어내는 도구로 나누면 쉽습니다. 타이머와 스톱워치, 주사위, 랜덤 선택은 진행 보조에, 화면 공유·미러링·브라우저·VNC·다방향 브라우저는 자료 설명에, 개인 칠판·객관식 퀴즈·선착순 퀴즈·그룹 토론은 학생 참여에 적합합니다. 온스테이지/오프스테이지와 권한 부여로 발표를 통제하고, 물리·화학 실험과 기하도형·측정 도구·바둑 칠판 같은 STEM 도구와 공동 작업으로 체험형 수업을, 트로피 순위·랜덤 선택·객관식/선착순 퀴즈·레이저 포인터로 몰입을 높일 수 있습니다. 노출되는 도구는 기관 스위치 설정에 따라 달라질 수 있습니다.",
    sections: [
      {
        heading: "수업 도구를 고르는 기준",
        body: "수업 도구는 많이 쓰는 것보다 목적에 맞게 고르는 것이 중요합니다. 한 차시 수업 안에서 도입, 설명, 참여, 정리 단계마다 필요한 도구가 달라집니다.",
        steps: [
          "도입 단계에는 타이머, 주사위, 랜덤 선택으로 집중을 빠르게 모읍니다.",
          "설명 단계에는 판서, 레이저 포인터, 브라우저, 화면 공유, 미러링으로 자료를 보여줍니다.",
          "풀이 단계에는 개인 칠판, 보조 칠판, 측정 도구, 기하도형, 물리·화학 실험 도구를 활용합니다.",
          "참여 단계에는 객관식 퀴즈, 선착순 퀴즈, 그룹 토론, 공동 작업을 사용합니다.",
          "정리 단계에는 트로피 순위, 채팅, 수업 자료 라이브러리로 결과와 다음 학습을 안내합니다.",
        ],
      },
      {
        heading: "수업 리듬을 만드는 도구",
        body: "타이머, 스톱워치, 주사위, 랜덤 선택, 트로피 순위는 수업의 속도와 분위기를 조절할 때 씁니다.",
        steps: [
          "타이머는 문제 풀이, 토론 준비, 휴식 시간을 명확히 제한할 때 사용합니다.",
          "스톱워치는 발표 시간이나 과제 수행 시간을 기록할 때 사용합니다.",
          "주사위는 게임형 복습, 문제 번호 선택, 조 편성에 활용할 수 있습니다.",
          "랜덤 선택은 특정 학생에게만 질문이 몰리지 않게 하고 참여 긴장감을 유지합니다.",
          "트로피 순위는 퀴즈나 활동 결과를 가볍게 정리할 때 적합합니다.",
        ],
      },
      {
        heading: "판서와 화면 설명 도구",
        body: "교사가 설명을 끊지 않고 이어가려면 판서 도구와 화면 도구의 역할을 분리해 두는 것이 좋습니다.",
        steps: [
          "기본 판서는 수식 풀이, 개념 도식, 문제 해설처럼 수업의 중심 내용을 남길 때 씁니다.",
          "보조 칠판은 본 판서를 유지한 채 임시 계산이나 추가 설명을 할 때 씁니다.",
          "레이저 포인터와 매직펜 계열 도구는 학생 시선을 특정 위치로 잠깐 유도할 때 유용합니다.",
          "브라우저는 웹 자료를 교실 안에서 바로 보여줄 때 사용합니다.",
          "화면 공유, 미러링, VNC는 교재, 외부 앱, 실습 화면을 보여줄 때 사용합니다.",
        ],
        media: [
          {
            type: "image",
            src: `${SOFTWARE_MEDIA_BASE}/two-way-blackboard.webp`,
            alt: "Classin 양방향 판서 수업 예시",
            caption: "교사와 학생이 같은 수업 화면 위에서 판서와 상호작용을 이어갈 수 있습니다.",
            width: 1440,
            height: 900,
          },
        ],
      },
      {
        heading: "학생 참여를 만드는 도구",
        body: "온라인 또는 하이브리드 수업에서는 학생이 보는 시간이 길어지기 쉽습니다. 참여 도구는 학생이 직접 반응하고 조작하는 순간을 만드는 데 사용합니다.",
        steps: [
          "개인 칠판은 학생별 풀이 과정을 동시에 확인하거나 첨삭할 때 사용합니다.",
          "문제 배포는 칠판 → 수업 도구 → 개인 칠판 → 그림판 → 배포 순서로 진행합니다.",
          "객관식 퀴즈는 이해도 확인, 개념 확인, 출석 대체 활동에 적합합니다.",
          "선착순 퀴즈는 빠른 반응과 집중도를 끌어올릴 때 좋습니다.",
          "그룹 토론은 조별 문제 풀이, 발표 준비, 토의형 수업에 사용합니다.",
          "공동 작업은 여러 학생이 같은 자료를 함께 조작하거나 작성해야 할 때 사용합니다.",
        ],
      },
      {
        heading: "발표 통제: 온스테이지와 권한 부여",
        body: "Classin 교실은 누가 화면에 크게 노출되고 누가 칠판 중심으로 보는지를 교사가 제어하는 온스테이지/오프스테이지 구조를 기본으로 합니다. 온스테이지는 고정형 카메라 레이아웃처럼 교사와 학생을 무대 영역에 띄우는 개념이며, 필요하면 스테이지 영역을 숨기거나 작게 보여 칠판 화면을 넓게 쓸 수 있습니다.",
        steps: [
          "교사는 학생에게 마이크·카메라 노출을 요청해 발표자로 올릴 수 있습니다.",
          "온스테이지 인원수는 수업 생성 시 1v0~1v12 등으로 미리 설정합니다.",
          "학생 자동 온스테이지는 학생을 상단 고정 레이아웃 슬롯에 자동 배치하는 설정으로 이해하며, 학생이나 교사가 스테이지 영역을 숨길 수 있습니다.",
          "특정 학생에게 권한을 부여하면 칠판 판서나 드라이브 자료 발표를 직접 맡길 수 있습니다.",
          "발표가 끝나면 권한을 회수해 수업 흐름을 다시 교사 중심으로 되돌립니다.",
          "대규모 수업에서는 핵심 발표자만 온스테이지로 올려 화면과 네트워크 부담을 줄입니다.",
        ],
      },
      {
        heading: "STEM 가상 실험실과 협업 도구",
        body: "이론 위주 수업을 체험형으로 바꿀 때는 STEM 실험 도구와 공동 작업 기능을 활용합니다. 교실 도구 팔레트에는 물리 실험, 화학 실험, 기하도형, 측정 도구, 바둑 칠판 같은 체험형 도구가 내장되어 있습니다.",
        steps: [
          "물리 실험·화학 실험 도구로 회로 연결이나 용액 반응 같은 시뮬레이션을 디지털 공간에서 진행합니다.",
          "기하도형·측정 도구로 도형과 작도 수업을 시각화합니다.",
          "바둑 칠판으로 바둑·오목처럼 격자 기반 수업을 진행합니다.",
          "미러링·공동 작업·다방향 브라우저로 여러 학생이 하나의 자료에 동시에 접근해 공동 필기와 과제를 수행합니다.",
          "보조 카메라로 실물 교구나 손동작을 별도 화면으로 비춰 실습 장면을 전달합니다.",
        ],
      },
      {
        heading: "게이미피케이션으로 몰입 유지",
        body: "수업이 늘어질 때 학생 참여를 끌어올리는 보상·진행 도구입니다. 교실 도구 팔레트에서 바로 꺼내 쓰며, 노출되는 도구는 기관 스위치 설정에 따라 달라질 수 있습니다.",
        steps: [
          "트로피 순위로 정답이나 참여도가 높은 학생을 즉시 보상하면 화면에 효과가 연출됩니다.",
          "랜덤 선택으로 발표자를 무작위 지정해 특정 학생에게 질문이 몰리지 않게 하고 참여 긴장감을 유지합니다.",
          "주사위로 퀴즈 순서나 조 편성을 게임처럼 진행합니다.",
          "객관식 퀴즈로 이해도를 퍼센트로 즉시 확인하고, 선착순 퀴즈로 빠른 반응과 집중을 끌어올립니다.",
          "레이저 포인터로 학생 시선을 특정 위치로 잠깐 유도합니다.",
        ],
      },
      {
        heading: "운영 팁",
        body: "수업 도구는 사전에 사용할 순서와 목적을 정해 두면 강사마다 수업 품질 편차가 줄어듭니다.",
        steps: [
          "자주 쓰는 도구 5개를 수업 템플릿으로 정하고 신규 강사에게 먼저 교육합니다.",
          "수업 자료를 열기 전 화면 공유, 마이크, 카메라, 판서 입력 상태를 미리 점검합니다.",
          "퀴즈와 토론은 수업 목표와 연결되는 질문으로 준비합니다.",
          "학생 참여 도구를 쓸 때는 제한 시간과 제출 기준을 먼저 안내합니다.",
          "수업 후에는 녹화, 판서 자료, 과제 안내가 학생에게 전달됐는지 확인합니다.",
        ],
      },
    ],
    relatedSlugs: ["classroom-basic-setup", "lesson-activities", "classin-607-update"],
  },
  {
    slug: "lesson-activities",
    category: "software",
    title: "수업·숙제·시험·학습 활동 가이드",
    description: "Classin에서 구성할 수 있는 주요 학습 활동의 목적, 적합한 사용 상황, 운영 체크포인트를 정리했습니다.",
    audience: "교사, 커리큘럼 담당자, 학원 운영팀",
    updatedAt: "2026-05-30",
    readMinutes: 7,
    tags: ["학습 활동", "숙제", "시험", "녹화 수업", "SCORM"],
    keywords: ["수업", "숙제", "시험", "녹화 수업", "학습 자료", "일일 과제", "토론", "OMR 카드", "SCORM", "따라읽기", "받아쓰기", "외워말하기", "AI 어학", "문제은행", "테스트 뱅크", "자동 채점"],
    chatbotSummary: "Classin 학습 활동은 실시간 수업, 숙제, 시험, 녹화 수업, 학습 자료, 일일 과제, 토론, OMR 카드, SCORM, 따라읽기 등으로 구성됩니다. 객관식·단답형은 자동 채점, 서술형은 첨삭으로 처리하고, 반복 문항은 문제은행(테스트 뱅크)으로 모아 둘 수 있습니다. 활동을 만들 때는 평가 목적, 제출 방식, 마감 시간, 피드백 방식, 성적 반영 여부를 먼저 정해야 합니다.",
    sections: [
      {
        heading: "학습 활동을 설계하는 순서",
        body: "학습 활동은 기능 이름부터 고르기보다 학습 목표와 평가 방식을 먼저 정한 뒤 선택해야 합니다.",
        steps: [
          "활동 목표를 정합니다. 예: 개념 이해, 복습, 수행 평가, 자동 채점, 토론 참여.",
          "학생이 제출해야 하는 결과물을 정합니다. 예: 답안, 파일, 음성, 토론 댓글, OMR 응답.",
          "마감 시간과 지각 제출 허용 여부를 정합니다.",
          "교사 피드백 방식과 성적 반영 여부를 정합니다.",
          "학생에게 보낼 안내 문구와 제출 기준을 활동 설명에 적습니다.",
        ],
      },
      {
        heading: "실시간 수업과 녹화 수업",
        body: "실시간 수업은 교사와 학생이 동시에 참여하는 수업이고, 녹화 수업은 학생이 시간에 맞춰 다시 학습하거나 비동기 수업으로 활용하는 활동입니다.",
        steps: [
          "실시간 수업은 출결, 판서, 채팅, 퀴즈, 토론 같은 상호작용 기능과 함께 운영합니다.",
          "녹화 수업은 결석 보강, 예습 영상, 반복 복습 자료로 활용합니다.",
          "수업 종료 후 녹화 파일과 판서 자료가 학생에게 제공되는지 확인합니다.",
          "복습용으로 제공할 때는 시청 마감일과 확인 과제를 함께 붙이는 것이 좋습니다.",
        ],
      },
      {
        heading: "숙제와 일일 과제",
        body: "숙제는 한 번의 제출물을 받는 활동에, 일일 과제는 반복 학습과 습관 형성에 적합합니다.",
        steps: [
          "숙제는 제출 파일 형식, 채점 기준, 재제출 가능 여부를 명확히 적습니다.",
          "일일 과제는 매일 반복할 분량과 완료 기준을 짧게 정합니다.",
          "첨삭이 필요한 과제는 제출 예시와 피드백 예정일을 안내합니다.",
          "자동 채점을 활용하는 과제는 문항 형식과 정답 데이터를 사전에 점검합니다.",
        ],
      },
      {
        heading: "시험, OMR 카드, 따라읽기",
        body: "평가형 활동은 공정성과 채점 기준이 중요합니다. 학생이 무엇을 언제까지 어떻게 제출해야 하는지 먼저 안내하세요.",
        steps: [
          "시험은 응시 시간, 제한 시간, 재응시 가능 여부, 부정행위 방지 기준을 정합니다.",
          "객관식·단답형 문항은 자동 채점으로 결과를 빠르게 정리하고, 서술형은 손글씨·텍스트로 첨삭합니다.",
          "반복 출제할 문항은 문제은행(테스트 뱅크) 형태로 모아 두면 과제·시험 배포가 빨라집니다. 제공 범위는 기관 설정·계약에 따라 다를 수 있습니다.",
          "OMR 카드는 객관식 문항을 빠르게 채점하고 결과를 정리할 때 적합합니다.",
          "따라읽기는 언어 학습, 발음 훈련, 낭독 과제처럼 음성 제출이 필요한 수업에 적합합니다.",
          "평가 활동은 성적 반영 방식과 결과 공개 시점을 학생에게 미리 안내합니다.",
        ],
      },
      {
        heading: "학습 자료, 토론, SCORM",
        body: "자료형 활동은 학생이 수업 전후로 학습 흐름을 이어가도록 돕고, 토론과 SCORM은 참여형 또는 외부 콘텐츠 기반 학습에 적합합니다.",
        steps: [
          "학습 자료는 PDF, 문서, 영상 등 학생이 확인해야 하는 참고 자료를 배포할 때 사용합니다.",
          "토론은 정답이 하나로 고정되지 않은 주제나 조별 발표 준비에 적합합니다.",
          "SCORM은 표준화된 외부 학습 콘텐츠를 활용해야 할 때 검토합니다.",
          "자료형 활동에도 완료 기준을 붙이면 학생 이탈을 줄일 수 있습니다.",
        ],
      },
      {
        heading: "AI 어학 활동: 따라읽기·받아쓰기·외워말하기",
        body: "활동 게시 화면에는 AI 기반 어학 활동이 영어와 중국어로 나뉘어 제공됩니다. 학생이 음성으로 제출하면 AI가 발음·정확도를 평가하므로 어학 수업의 반복 훈련과 자동 채점에 적합합니다.",
        steps: [
          "따라읽기는 제시된 문장을 소리 내어 읽게 해 발음과 유창성을 훈련할 때 사용합니다.",
          "받아쓰기는 듣고 받아쓰게 해 청취력과 철자 정확도를 확인할 때 사용합니다.",
          "외워말하기는 암기한 문장을 말하게 해 표현 암기와 발화를 점검할 때 사용합니다.",
          "활동을 만들 때 대상 언어(영어·중국어), 제출 횟수, 마감, 성적 반영 여부를 함께 정합니다.",
          "AI 채점 결과는 참고 자료로 보고, 발음·의미 판단이 중요한 문항은 교사가 최종 확인합니다.",
        ],
      },
    ],
    relatedSlugs: ["course-activities", "course-submit-activity", "course-grades", "ai-learning-tools"],
  },
  {
    slug: "ai-learning-tools",
    category: "software",
    title: "AI 튜터와 AI 평가 활용하기",
    description: "학생 질문 대응, 학습 결과 피드백, 과제 첨삭, 수업 자료 정리에 활용할 수 있는 AI 기능의 사용 기준을 정리했습니다.",
    audience: "학생, 교사, 학습 관리 담당자",
    updatedAt: "2026-05-30",
    readMinutes: 6,
    tags: ["AI", "AI 튜터", "AI 평가", "첨삭", "피드백"],
    keywords: ["AI 튜터", "AI 평가", "AI 첨삭", "AI 과제 생성", "AI 수식 풀이", "AI 문서 정리", "학습 피드백", "자기주도 학습"],
    chatbotSummary: "AI 튜터는 코스 자료와 수업 맥락을 기반으로 학생 질문에 답하고, AI 평가는 성적과 학습 결과를 바탕으로 피드백을 제공합니다. 교사는 AI 첨삭, 과제 생성, 수식 풀이, 문서 정리, 교안 자동화 기능을 수업 준비와 피드백 보조에 활용할 수 있습니다. 기능 노출 범위는 기관 설정, 계약, 계정 권한에 따라 달라질 수 있습니다.",
    sections: [
      {
        heading: "AI 기능을 쓰기 전 확인할 점",
        body: "AI 기능은 학습 보조와 운영 효율화를 위한 기능입니다. 기관의 계약, 계정 권한, 코스 설정에 따라 실제 화면에서 보이는 기능이 달라질 수 있으므로 도입 전 사용 범위를 확인하세요.",
        steps: [
          "AI 기능이 기관 계정에서 활성화되어 있는지 확인합니다.",
          "학생에게 노출할 기능과 교사 전용으로 둘 기능을 구분합니다.",
          "개인정보, 민감한 상담 내용, 계약 정보는 AI 입력에 넣지 않는 원칙을 세웁니다.",
          "AI 답변은 최종 정답이 아니라 학습 보조 자료로 안내합니다.",
          "오답 가능성이 있는 과목이나 고난도 문항은 교사가 최종 검수합니다.",
        ],
      },
      {
        heading: "AI 튜터",
        body: "AI 튜터는 학생이 코스 안에서 모르는 내용을 바로 질문할 수 있게 돕는 기능입니다. 일반 검색보다 우리 코스의 수업 자료와 학습 맥락에 맞춘 답변을 받는 데 목적이 있습니다.",
        steps: [
          "학생은 공부 중인 코스에서 AI 튜터 탭을 엽니다.",
          "질문은 짧고 구체적으로 입력합니다. 예: '오늘 수업의 이차함수 꼭짓점 구하는 법을 다시 설명해줘'.",
          "답변을 받은 뒤 이해가 안 되는 부분을 이어서 질문합니다.",
          "교사는 반복 질문을 확인해 보충 자료나 다음 수업 설명에 반영합니다.",
        ],
      },
      {
        heading: "AI 평가",
        body: "AI 평가는 학생의 학습 결과와 성적 흐름을 바탕으로 부족한 부분과 다음 학습 방향을 정리하는 데 적합합니다.",
        steps: [
          "학생은 코스 내 AI 평가 탭에서 본인의 학습 결과를 확인합니다.",
          "점수만 보지 말고 부족한 단원, 반복 오답, 제출 패턴을 함께 확인합니다.",
          "교사는 상담 전 AI 평가 내용을 참고해 학생별 보완 과제를 정할 수 있습니다.",
          "학부모 상담에서는 AI 평가를 그대로 전달하기보다 교사의 관찰과 함께 요약합니다.",
        ],
      },
      {
        heading: "교사용 AI 보조 기능",
        body: "교사는 AI를 채점과 피드백, 자료 정리, 수업 준비의 보조 도구로 활용할 수 있습니다.",
        steps: [
          "AI 첨삭은 학생 제출 과제의 초안 피드백이나 반복 오류 확인에 활용합니다.",
          "AI 과제 생성은 학습 수준과 목표에 맞는 추가 연습문항을 만들 때 사용합니다.",
          "AI 수식 풀이는 풀이 방향을 점검하거나 보충 설명을 만들 때 활용합니다.",
          "AI 문서 정리는 수업 자료 요약, 보고서 초안, 학습 노트 정리에 활용합니다.",
          "AI 교안 자동화는 수업 목표를 기준으로 차시 흐름을 빠르게 설계할 때 사용합니다.",
        ],
      },
      {
        heading: "운영 기준",
        body: "AI 기능은 편리하지만 학원 운영의 기준을 대체하지 않습니다. 어떤 답변을 학생에게 허용할지, 어떤 결과는 교사가 검수할지 내부 기준을 세워야 합니다.",
        steps: [
          "평가와 성적에 직접 반영되는 내용은 교사가 최종 확인합니다.",
          "학생에게 AI 사용 가능 범위와 금지 범위를 안내합니다.",
          "과제 작성 전체를 AI에 맡기지 않도록 제출 기준을 구체화합니다.",
          "반복 질문과 오답 패턴은 커리큘럼 개선 자료로 활용합니다.",
        ],
      },
    ],
    relatedSlugs: ["ai-features", "lesson-activities", "course-grades"],
  },
  {
    slug: "admin-monitoring-analytics",
    category: "software",
    title: "관리자 모니터링과 통계 활용",
    description: "학원 관리자가 수업 운영 상태, 웹 라이브와 플레이백, 학습 데이터, 통계 지표를 확인할 때 봐야 할 기준을 정리했습니다.",
    audience: "학원 관리자, 운영팀, 지점장, 교육 매니저",
    updatedAt: "2026-05-30",
    readMinutes: 6,
    tags: ["관리자", "모니터링", "통계", "웹 라이브", "학습 데이터"],
    keywords: ["수업 모니터링", "웹 라이브", "플레이백", "통계 데이터", "학습 보고서", "출결", "성적", "운영 데이터"],
    chatbotSummary: "관리자는 Classin에서 수업 모니터링, 웹 라이브와 플레이백, 출결·과제·성적 데이터, 학습 보고서, 스토리지와 계정 권한을 확인해 운영 품질을 관리합니다. 핵심은 실시간 감시가 아니라 수업 안정성, 강사 온보딩, 학생 참여도, 학부모 상담 자료를 만드는 것입니다.",
    sections: [
      {
        heading: "관리자가 보는 데이터의 목적",
        body: "모니터링과 통계는 강사를 감시하기 위한 기능이 아니라 수업 품질을 일정하게 유지하고 운영 문제를 빠르게 찾기 위한 기능입니다.",
        steps: [
          "수업이 정상적으로 개설되고 진행되는지 확인합니다.",
          "출결, 과제, 시험, 성적 데이터가 누락 없이 쌓이는지 확인합니다.",
          "강사별 수업 운영 편차와 신규 강사 온보딩 상태를 확인합니다.",
          "학부모 상담에 필요한 학습 참여도와 성취도 자료를 준비합니다.",
          "스토리지, 녹화, 웹 라이브 사용량을 점검해 운영 비용과 품질을 관리합니다.",
        ],
      },
      {
        heading: "웹 라이브와 플레이백",
        body: "웹 라이브는 수업을 실시간으로 확인하거나 외부 시청 경로를 제공할 때, 플레이백은 수업 후 복습과 운영 검수에 사용합니다.",
        steps: [
          "라이브 공개 범위와 접근 권한을 먼저 확인합니다.",
          "수업 중 문제가 발생하면 교실 상태, 네트워크, 카메라·마이크 상태를 함께 확인합니다.",
          "수업 종료 후 녹화 영상과 판서 자료가 정상 저장됐는지 확인합니다.",
          "플레이백은 결석 보강, 강사 피드백, 상담 자료로 활용할 수 있습니다.",
        ],
      },
      {
        heading: "학습 데이터 리포트",
        body: "학습 데이터는 점수만 보는 것이 아니라 참여 시간, 발언, 제출, 피드백 흐름을 함께 봐야 의미가 있습니다.",
        steps: [
          "출석률과 지각·결석 패턴을 확인합니다.",
          "과제 제출률과 마감 후 제출 비율을 확인합니다.",
          "시험과 숙제 점수의 변화 추이를 확인합니다.",
          "수업 참여도, 발언, 퀴즈 응답 같은 참여 지표를 함께 봅니다.",
          "상담 전에는 학생별 요약을 만들어 학부모에게 설명할 수 있는 언어로 정리합니다.",
        ],
      },
      {
        heading: "운영 점검 체크리스트",
        body: "매주 같은 기준으로 운영 데이터를 확인하면 문제를 늦게 발견하는 일을 줄일 수 있습니다.",
        steps: [
          "이번 주 예정 수업이 모두 개설되어 있는지 확인합니다.",
          "교사 계정과 학생 계정의 권한 문제가 없는지 확인합니다.",
          "수업 녹화와 자료 업로드가 정상적으로 완료됐는지 확인합니다.",
          "과제와 시험 마감이 학사 일정과 맞는지 확인합니다.",
          "스토리지 사용량과 오래된 자료 정리 필요 여부를 확인합니다.",
        ],
      },
      {
        heading: "현장 활용 예시",
        body: "관리자 통계는 지표를 보는 데서 끝나지 않고 운영 액션으로 이어져야 합니다.",
        steps: [
          "특정 반의 과제 제출률이 낮으면 안내 문구, 마감 시간, 과제 난이도를 조정합니다.",
          "신규 강사의 수업 참여 지표가 낮으면 수업 도구 사용 교육을 보강합니다.",
          "결석이 많은 학생은 플레이백 시청 여부와 보강 과제 제출 여부를 함께 확인합니다.",
          "수업 품질 편차가 큰 지점은 우수 수업 녹화와 템플릿을 공유합니다.",
        ],
      },
    ],
    relatedSlugs: ["class-monitoring", "statistics-data", "web-live-playback"],
  },
  {
    slug: "board-overview",
    category: "hardware",
    title: "Classin Board 기능 한눈에 보기",
    description: "Classin Board가 일반 전자칠판과 다른 점, 수업 안에서 담당하는 역할, 소프트웨어와 연결되는 구조를 정리했습니다.",
    audience: "도입 검토자, 학원 관리자, 교사, 설치 상담 담당자",
    updatedAt: "2026-05-30",
    readMinutes: 6,
    featured: true,
    tags: ["하드웨어", "Classin Board", "전자칠판", "AI 카메라", "하이브리드 수업"],
    keywords: ["Classin Board", "클래스인 보드", "전자칠판", "하드웨어 기능", "판서", "AI 카메라", "OPS", "NFC", "하이브리드 수업", "무선 미러링", "윈도우 기반", "클라우드", "선 없는 연결", "HDMI 불필요"],
    chatbotSummary: "Classin Board는 판서용 디스플레이, 터치 입력, OPS 컴퓨터, Classin 소프트웨어, AI 카메라와 마이크, 수업 자료 저장과 공유 흐름을 하나로 묶은 수업 장비입니다. 핵심 기능은 자연스러운 판서, 실시간 공유, 자동 녹화와 복습, 하이브리드 수업, LMS 연동입니다. 내장 Intel Core OPS와 클라우드, 무선 미러링 덕분에 HDMI나 외장 PC 없이 단독 구동되고, 수업은 익숙한 윈도우 PC 환경에서 진행되어 기존 프로그램과 자료를 그대로 쓰며 시공간을 넘나드는 쾌적한 연결성을 제공합니다.",
    sections: [
      {
        heading: "Classin Board의 역할",
        body: "Classin Board는 단순히 화면을 크게 보여주는 장비가 아니라 교실 수업을 Classin 소프트웨어와 바로 연결하는 수업 허브입니다. 판서, 자료 설명, 학생 참여, 녹화, 복습 자료 배포가 하나의 흐름으로 이어집니다.",
        steps: [
          "교사는 보드에서 판서하고 자료를 띄우며 수업을 진행합니다.",
          "학생은 교실 또는 원격 환경에서 같은 수업 화면과 판서 흐름을 따라갑니다.",
          "수업이 끝나면 판서 자료와 수업 영상이 복습 자료로 이어집니다.",
          "관리자는 수업, 출결, 과제, 성적, 녹화 데이터를 Classin 운영 흐름에서 확인합니다.",
        ],
      },
      {
        heading: "핵심 기능 묶음",
        body: "하드웨어 기능은 판서, 화면, 카메라와 음성, 내장 컴퓨팅, 소프트웨어 연동으로 나누어 볼 수 있습니다.",
        steps: [
          "판서: 50포인트 멀티터치, 저지연 터치, 50페이지 캔버스로 수업 흐름을 이어갑니다.",
          "화면: 4K 디스플레이, 광시야각, 반사 저감 코팅으로 교실 어디서나 선명하게 보이도록 돕습니다.",
          "카메라와 음성: AI 카메라와 마이크 구성으로 교사 추적, 원격 학생 전달, 수업 녹화를 지원합니다.",
          "컴퓨팅: OPS 모듈로 외장 PC 의존도를 줄이고 보드 자체에서 수업 환경을 구성합니다.",
          "연동: Classin 소프트웨어, LMS, 수업 자료, 녹화와 복습 흐름이 연결됩니다.",
        ],
        media: [
          {
            type: "image",
            src: `${HARDWARE_MEDIA_BASE}/hero/hero-board-angle.png`,
            alt: "Classin Board 각도 이미지",
            caption: "Classin Board는 디스플레이, 터치, 컴퓨팅, 수업 소프트웨어를 한 수업 환경으로 연결합니다.",
            width: 1200,
            height: 900,
          },
        ],
      },
      {
        heading: "일반 전자칠판과 다른 점",
        body: "일반 전자칠판은 주로 화면 출력과 판서에 머무는 경우가 많습니다. Classin Board는 수업 이후의 자료 저장, 학생 복습, 운영 데이터까지 연결한다는 점이 다릅니다.",
        steps: [
          "판서가 수업 자료와 복습 흐름으로 이어집니다.",
          "Classin 수업 도구와 학습 활동을 보드에서 바로 활용할 수 있습니다.",
          "카메라와 마이크를 활용해 현장 수업과 원격 수업을 함께 운영할 수 있습니다.",
          "수업 종료 후 영상과 자료가 LMS 흐름으로 이어집니다.",
        ],
      },
      {
        heading: "선·외장 PC 없이 쓰는 연결성",
        body: "Classin Board의 연결성은 도입 현장에서 체감 차이가 큰 부분입니다. 내장 OPS 컴퓨터와 클라우드, 무선 미러링 덕분에 복잡한 배선 없이 바로 수업을 시작할 수 있습니다.",
        steps: [
          "탈착식 Intel Core OPS 컴퓨터가 내장되어 HDMI나 별도 외부 선, 외장 PC 없이 보드 단독으로 수업 환경을 구동합니다.",
          "패널 자체 안드로이드에만 의존하는 일부 전자칠판과 달리, Intel Core 기반 OPS가 결합되어 수업은 익숙한 윈도우 PC 환경에서 진행됩니다. 익숙한 프로그램과 수업 자료를 그대로 사용할 수 있습니다.",
          "무선 미러링으로 교사·학생 기기 화면을 선 없이 보드에 띄울 수 있습니다.",
          "클라우드로 수업 자료와 녹화가 연결되어, 시공간을 넘나드는 수업과 쾌적한 연결성·수업 쾌적도를 제공합니다.",
        ],
      },
      {
        heading: "도입 상담 때 확인할 항목",
        body: "하드웨어는 공간과 설치 조건에 따라 권장 모델과 구성품이 달라집니다.",
        steps: [
          "교실 크기, 학생 수, 시야 거리, 벽면 구조를 확인합니다.",
          "설치 방식이 벽걸이인지 이동형 스탠드인지 정합니다.",
          "카메라, 마이크, OPS, NFC, 네트워크 구성이 필요한지 확인합니다.",
          "온라인·하이브리드 수업을 함께 운영할지 확인합니다.",
          "설치 후 교사 교육과 A/S 지원 범위를 확인합니다.",
        ],
      },
    ],
    resources: [
      {
        label: "Classin Board 소개",
        href: "/product/hw",
        description: "제품 소개 페이지에서 주요 이미지, 라인업, 도입 흐름을 함께 확인할 수 있습니다.",
      },
    ],
    relatedSlugs: ["board-s-series-safe-use", "board-basic-operation", "board-lineup-specs", "board-writing-touch", "board-ai-camera-mic"],
  },
  {
    slug: "board-basic-operation",
    category: "hardware",
    title: "전자칠판 기본 사용 설명서 (버튼·제스처·미러링·HDMI)",
    description: "Classin 전자칠판(스마트 보드)을 처음 켜는 분을 위해 측면 버튼 위치, 손가락 제스처, 무선 미러링, HDMI 입력 전환 같은 기본 조작법을 정리했습니다.",
    audience: "교사, 신규 강사, 학원 운영팀, 설치 후 인수인계 담당자",
    updatedAt: "2026-05-30",
    readMinutes: 5,
    featured: true,
    tags: ["하드웨어", "전자칠판", "스마트 보드", "기본 사용법", "제스처", "미러링", "HDMI"],
    keywords: ["전자칠판 사용법", "스마트 보드 사용법", "전자칠판 켜는 법", "전자칠판 버튼 위치", "손가락 제스처", "한 손가락 필기", "두 손가락 스크롤", "네 손가락 펜툴", "무선 미러링", "화면 미러링", "노트북 연결", "HDMI 전환", "입력 소스 전환", "소스 변경", "전원 버튼", "OPS 전환", "화면이 안 나와요", "터치가 안 돼요"],
    chatbotSummary: "Classin 전자칠판은 화면을 정면으로 봤을 때 오른쪽 사이드 하단에 전원·볼륨·입력(소스) 등 물리 버튼이 모여 있습니다. 판서 화면에서는 손가락 제스처로 조작하는데, 한 손가락(한 점)은 필기·클릭, 두 손가락(두 점)은 화면 스크롤, 네 손가락(네 점)은 펜 도구(UI) 호출에 사용합니다. 무선 미러링은 보드의 화면 공유(미러링) 기능과 같은 네트워크의 기기를 연결해 쓰고, 외부 노트북·PC는 HDMI 케이블 연결 후 입력(소스) 버튼이나 소스 메뉴에서 HDMI로 전환하며 내장 수업 환경으로는 OPS를 선택해 돌아옵니다. 버튼 명칭·위치와 제스처 동작은 모델·펌웨어에 따라 다를 수 있으니 실제 기기에서 한 번 확인하세요.",
    sections: [
      {
        heading: "버튼은 화면 오른쪽 사이드 하단에 있습니다",
        body: "전자칠판을 처음 켤 때 가장 먼저 찾을 것은 물리 버튼입니다. 대부분의 조작은 화면 터치로 하지만, 전원과 입력 전환 같은 기본 동작은 측면 버튼이 빠릅니다.",
        steps: [
          "전원, 볼륨, 입력(소스) 전환 버튼은 화면을 정면으로 봤을 때 오른쪽 측면 하단에 모여 있습니다.",
          "전원 버튼을 짧게 누르면 화면이 켜지거나 대기 모드로 전환되고, 길게 누르면 완전히 종료됩니다.",
          "볼륨 버튼으로 수업 자료나 영상 소리를 조절합니다.",
          "입력(소스/Source) 버튼은 내장 OPS(윈도우)와 외부 HDMI 입력을 전환할 때 사용합니다.",
          "측면 버튼 외에 화면 하단 가장자리를 쓸어 올리면 나오는 도구 막대(내비게이션 바)에서도 같은 기능을 쓸 수 있습니다.",
        ],
      },
      {
        heading: "손가락 제스처로 판서하고 조작하기",
        body: "판서 화면(칠판)에서는 손가락 개수에 따라 동작이 달라집니다. 펜과 손가락을 함께 쓰면 설명을 끊지 않고 빠르게 전환할 수 있습니다.",
        steps: [
          "한 손가락(한 점): 필기와 클릭에 사용합니다. 글씨를 쓰거나 버튼·메뉴를 선택할 때 씁니다.",
          "두 손가락(두 점): 화면 스크롤에 사용합니다. 판서 페이지나 자료를 위아래로 이동할 때 씁니다.",
          "네 손가락(네 점): 펜 도구(UI) 호출에 사용합니다. 화면 어디서나 네 손가락으로 누르면 펜·지우개 같은 도구 모음을 바로 띄울 수 있습니다.",
          "손바닥처럼 넓은 면이나 지우개로 문지르면 필기를 지울 수 있습니다.",
          "제스처가 의도대로 동작하지 않으면 화면 테두리(베젤)에 손이 닿았는지, 이물질이 끼지 않았는지 확인합니다.",
        ],
      },
      {
        heading: "무선 미러링으로 기기 화면 띄우기",
        body: "노트북·태블릿·스마트폰 화면을 선 없이 보드에 띄울 때는 무선 미러링을 사용합니다. 보드와 기기가 같은 네트워크에 연결되어 있어야 합니다.",
        steps: [
          "보드와 미러링할 기기를 같은 Wi-Fi(또는 네트워크)에 연결합니다.",
          "보드 홈 화면이나 도구 막대에서 미러링(화면 공유) 기능을 실행합니다.",
          "화면에 표시되는 연결 코드나 보드 이름을 확인합니다.",
          "노트북·스마트폰의 화면 미러링·캐스트 기능에서 보드를 선택하고, 필요하면 코드를 입력합니다.",
          "연결되면 기기 화면이 보드에 표시되며, 보드에서 그 위에 바로 판서할 수도 있습니다.",
          "Classin 수업 중에는 소프트웨어의 화면 공유·미러링 기능을 사용하면 원격 학생에게도 같은 화면이 전달됩니다.",
        ],
      },
      {
        heading: "HDMI 입력으로 전환하기",
        body: "외부 노트북이나 PC를 케이블로 연결해 보여줄 때는 입력 소스를 HDMI로 전환합니다.",
        steps: [
          "외부 기기와 보드의 HDMI 입력(IN) 포트를 HDMI 케이블로 연결합니다.",
          "오른쪽 측면 하단의 입력(소스) 버튼을 누르거나 화면의 소스 메뉴를 엽니다.",
          "입력 목록에서 연결한 HDMI 포트(예: HDMI1, HDMI2)를 선택합니다.",
          "외부 기기 화면이 보드에 표시됩니다. 다시 내장 수업 환경으로 돌아가려면 같은 메뉴에서 OPS(내장 PC)를 선택합니다.",
          "소리가 나오지 않으면 외부 기기의 출력 장치가 HDMI(전자칠판)로 설정되어 있는지 확인합니다.",
        ],
      },
      {
        heading: "처음 쓸 때 함께 확인하면 좋은 것",
        body: "기본 조작에 익숙해지면 수업 흐름과 연결되는 기능을 이어서 확인하세요. 버튼 명칭과 제스처 동작은 모델과 펌웨어 버전에 따라 다를 수 있습니다.",
        steps: [
          "판서감, 멀티터치, 무한 캔버스 세부 기능은 '판서·터치·무한 캔버스 가이드'에서 확인합니다.",
          "카메라·마이크를 쓰는 하이브리드 수업은 'AI 카메라와 마이크 사용 가이드'에서 확인합니다.",
          "보드 전체 구조와 소프트웨어 연동은 'Classin Board 기능 한눈에 보기'에서 확인합니다.",
          "버튼 위치나 제스처가 설명과 다르면 실제 기기에서 한 번 눌러 확인하고, 필요하면 설치 담당자에게 문의합니다.",
        ],
      },
    ],
    resources: [
      {
        label: "Classin 하드웨어 소개",
        href: "/product/hw",
        description: "제품 소개 페이지에서 보드 라인업과 도입 흐름을 함께 확인할 수 있습니다.",
      },
    ],
    relatedSlugs: ["board-s-series-safe-use", "board-writing-touch", "board-overview", "board-ai-camera-mic"],
  },
  {
    slug: "board-lineup-specs",
    category: "hardware",
    title: "모델별 스펙과 선택 가이드",
    description: "한국 공급 기준 ClassIn Board S75·S86·S98 Pro·S110의 권장 사용 공간, 화면 크기, 규격서 기준 주요 사양, 선택 기준을 정리했습니다.",
    audience: "도입 검토자, 학원 관리자, 설치 상담 담당자",
    updatedAt: "2026-05-30",
    readMinutes: 7,
    featured: true,
    tags: ["모델 선택", "스펙", "S75", "S86", "S98 Pro", "S110"],
    keywords: ["Classin Board S75", "Classin Board S86", "Classin Board S98 Pro", "Classin Board S110", "BS75A", "BS86C", "BSCP98A", "BS110A", "전자칠판 스펙", "전자칠판 크기", "화면 크기", "OPS", "스탠드", "벽걸이"],
    chatbotSummary: "한국 공급 기준 ClassIn Board는 S75·S86·S98 Pro·S110 사양을 우선 확인합니다. 모델명은 각각 BS75A·BS86C·BSCP98A·BS110A이고 화면은 75·86·98·110인치입니다. 네 모델 모두 4K(3840×2160) 해상도, 16:9 화면, 178° 시야각, 밝기 350cd/m² 이상, 수명 5만 시간 이상, 50점 적외선 터치, Android 11 내장 시스템, 탈착식 OPS, Wi-Fi ax·BT5.0, 2×15W 스피커를 기준으로 봅니다. S75·S86은 13세대 i5-13420H OPS 16GB·256GB SSD, S98 Pro는 13세대 고성능 OPS와 NFC, S110은 120Hz 화면과 4mm 유리, 12세대 i5-12400 OPS가 차별점입니다. S65는 라인업에는 있으나 상세 규격서 확인이 필요합니다.",
    sections: [
      {
        heading: "한국 공급 모델은 공간 기준으로 고릅니다",
        body: "한국 공급 기준 ClassIn Board는 S75, S86, S98 Pro, S110 사양을 우선 확인합니다. 화면 크기만 보고 고르기보다 학생 수, 맨 뒷자리 시야 거리, 교실 폭, 설치 벽면, 이동 여부를 함께 봐야 합니다.",
        steps: [
          "S75(BS75A, 75인치): 10명 안팎 교실이나 세미나실에 적합합니다.",
          "S86(BS86C, 86인치): 10명 이상 일반 강의실에서 가장 범용적으로 검토할 수 있습니다.",
          "S98 Pro(BSCP98A, 98인치): 대형 교실이나 넓은 강의실에서 큰 화면과 13세대 고성능 구성을 함께 볼 때 적합합니다.",
          "S110(BS110A, 110인치): 대형 강의실·강당 등 가장 큰 공간에 적합하며, 120Hz 화면과 4mm 유리로 차별화됩니다.",
          "S65는 라인업에는 있으나 현재 상세 규격서가 미확보되어 견적·제안 전 확인이 필요합니다.",
        ],
      },
      {
        heading: "모델별 크기와 화면 사양",
        body: "규격서 기준 모델명·치수·화면 사양입니다. 모든 모델이 4K(3840×2160) 해상도, 16:9 화면, 178° 시야각, 밝기 350cd/m² 이상, 수명 5만 시간 이상입니다. 견적서·제안서에 넣기 전에는 최신 규격서로 한 번 더 검수하세요.",
        steps: [
          "S75 — 모델명 BS75A, 75인치. 본체 1,718.18 × 1,000.2 × 113.1mm, 순중량 54kg. 60Hz, 명암비 4000:1, 3mm AG/AF 유리.",
          "S86 — 모델명 BS86C, 86인치. 본체 1,964.08 × 1,139.02 × 113.1mm, 순중량 69.5kg. 60Hz, 명암비 4000:1, 3mm AG/AF 유리.",
          "S98 Pro — 모델명 BSCP98A, 98인치. 본체 2,227.92 × 1,287.43 × 100.60mm, 순중량 89kg. 60Hz, 명암비 6000:1, 3.2mm AG/AF 유리, NFC 지원.",
          "S110 — 모델명 BS110A, 110인치. 본체 2,520.55 × 1,457.20 × 110.00mm, 순중량 137kg. 120Hz, 명암비 1200:1, 4mm AG/AF 유리.",
          "치수는 가로 × 세로(높이) × 두께 순서이며, 수치는 규격서 기준입니다.",
        ],
        media: [
          {
            type: "image",
            src: `${HARDWARE_MEDIA_BASE}/lineup/lineup-all-sizes.png`,
            alt: "Classin Board S75 S86 S98 Pro S110 라인업",
            caption: "공간 규모와 시야 거리에 따라 권장 모델이 달라집니다.",
            width: 1440,
            height: 900,
          },
        ],
      },
      {
        heading: "터치와 입력 사양",
        body: "네 모델 모두 수업 중 여러 입력이 동시에 발생하는 상황을 고려해 멀티터치와 빠른 응답을 제공하며, 터치 사양은 공통입니다.",
        steps: [
          "터치 포인트는 S75·S86·S98 Pro·S110 모두 50점입니다.",
          "터치 방식은 적외선(IR) 방식이며, 손가락이나 전용 펜처럼 빛이 통하지 않는 물체를 인식합니다.",
          "터치 응답 속도 2ms, 필기 높이 1mm, 터치 정밀도 ±1mm, 최소 인식 물체 1.5mm입니다.",
          "강화유리는 S75·S86이 3mm, S98 Pro가 3.2mm, S110이 4mm이며 모두 AG 방현·AF 지문방지 처리되어 있습니다.",
          "모델·세대별 제스처바와 부속 구성은 견적 전 최신 규격서로 한 번 더 확인합니다.",
        ],
      },
      {
        heading: "내장 컴퓨터(OPS)·오디오·부속품",
        body: "내장 컴퓨터(OPS), 스피커, 마이크, 부속품 구성입니다. 특히 벽걸이·스탠드는 전 모델 옵션이라는 점을 도입 견적에서 꼭 확인하세요.",
        steps: [
          "S75·S86은 탈착식 Intel Core i5-13420H OPS, 16GB 메모리, 256GB SSD 구성을 기준으로 봅니다.",
          "S98 Pro는 13세대 고성능 OPS, S110은 12세대 i5-12400 OPS·8GB 메모리·256GB SSD 구성을 기준으로 봅니다.",
          "내장 안드로이드는 Android 11, 메모리 4GB·저장 32GB로 공통입니다.",
          "스피커는 전 모델 2.0채널, 2×15W입니다.",
          "내장 마이크는 S75·S86·S98 Pro가 8배열(수음 거리 10m)이고, S110 규격서에는 내장 마이크가 별도 기재되어 있지 않아 도입 시 별도 확인이 필요합니다.",
          "최대 소비전력은 S75 315W, S86 390W, S98 Pro 740W, S110 850W입니다.",
        ],
      },
      {
        heading: "선택 전 현장 체크",
        body: "모델을 확정하기 전에는 실제 교실에서 보는 거리와 설치 조건을 확인해야 합니다.",
        steps: [
          "맨 뒷자리에서 글씨와 도형이 충분히 보이는지 확인합니다.",
          "문, 창문, 조명, 에어컨 위치가 설치와 시야를 방해하지 않는지 확인합니다.",
          "벽걸이 설치 시 벽면 재질과 보강 필요 여부를 확인합니다.",
          "이동형 스탠드 사용 시 이동 동선과 보관 위치를 확인합니다.",
          "네트워크, 전원, 카메라 배선 경로를 함께 확인합니다.",
        ],
      },
    ],
    relatedSlugs: ["board-overview", "board-install-readiness", "board-writing-touch"],
  },
  {
    slug: "board-writing-touch",
    category: "hardware",
    title: "판서·터치·무한 캔버스 가이드",
    description: "Classin Board의 판서감, 멀티터치, 캔버스, 수업 자료 저장과 공유 흐름을 기능별로 설명합니다.",
    audience: "교사, 도입 검토자, 시연 담당자",
    updatedAt: "2026-05-30",
    readMinutes: 6,
    tags: ["판서", "터치", "멀티터치", "무한 캔버스", "PDF 저장"],
    keywords: ["전자칠판 판서", "50포인트 멀티터치", "저지연 터치", "무한 캔버스", "판서 PDF", "실시간 판서 동기화"],
    chatbotSummary: "Classin Board 판서 기능은 50포인트 멀티터치, 적외선 터치, 낮은 지연 시간, 50페이지 캔버스, 실시간 판서 공유, 수업 종료 후 판서 자료 저장과 배포를 중심으로 이해하면 됩니다. 교사는 종이 칠판처럼 자연스럽게 설명하고, 학생은 수업 후에도 판서 자료로 복습할 수 있습니다.",
    sections: [
      {
        heading: "판서 기능의 목적",
        body: "판서 기능은 단순히 글씨를 쓰는 기능이 아니라 수업 흐름을 남기는 기능입니다. 지우고 끝나는 칠판이 아니라 수업 자료, 복습 자료, 결석 보강 자료로 이어지는 판서를 만드는 것이 핵심입니다.",
        steps: [
          "교사는 문제 풀이와 개념 설명을 보드 위에 직접 작성합니다.",
          "필요하면 PDF, 이미지, 교재 자료 위에 바로 필기합니다.",
          "학생은 실시간으로 같은 판서 흐름을 보고 따라갑니다.",
          "수업 후 판서 자료를 저장해 복습 자료로 제공합니다.",
        ],
      },
      {
        heading: "터치 입력과 멀티터치",
        body: "Classin Board는 여러 손가락과 펜 입력을 동시에 처리하는 수업 상황을 고려합니다.",
        steps: [
          "모든 라인업은 50포인트 터치 포인트를 기준으로 안내됩니다.",
          "터치 기술은 적외선 터치 방식입니다.",
          "여러 학생이 동시에 보드 앞에서 조작하거나 교사가 손과 펜을 함께 쓰는 상황에 적합합니다.",
          "수업 전에는 펜 입력, 손 터치, 지우개 동작을 한 번씩 확인하는 것이 좋습니다.",
        ],
        media: [
          {
            type: "image",
            src: `${HARDWARE_MEDIA_BASE}/writing/writing-multitouch.jpg`,
            alt: "Classin Board 멀티터치 판서 예시",
            caption: "멀티터치 입력은 학생 참여형 판서와 교사 시연에 유용합니다.",
            width: 1440,
            height: 900,
          },
        ],
      },
      {
        heading: "캔버스와 수업 흐름",
        body: "판서 공간은 한 화면에 머물지 않고 수업 흐름에 따라 확장됩니다. 긴 풀이, 여러 문항 해설, 단계별 설명이 필요한 수업에서 특히 유용합니다.",
        steps: [
          "한 차시 안에서 여러 페이지의 판서를 이어갈 수 있습니다.",
          "문제 풀이 전개를 지우지 않고 다음 설명으로 넘어갈 수 있습니다.",
          "수업 후 특정 페이지를 다시 열어 복습하거나 추가 설명할 수 있습니다.",
          "판서량이 많은 수학, 과학, 국어 독해, 논술 수업에 적합합니다.",
        ],
        media: [
          {
            type: "image",
            src: `${HARDWARE_MEDIA_BASE}/features/feature-writing.webp`,
            alt: "Classin Board 판서 기능 시각화",
            caption: "판서 공간과 수업 자료가 Classin 수업 흐름 안에서 함께 관리됩니다.",
            width: 1440,
            height: 900,
          },
        ],
      },
      {
        heading: "수업 후 저장과 공유",
        body: "판서의 가치는 수업이 끝난 뒤 더 커집니다. 수업 중 작성한 내용을 복습 자료로 연결하면 결석생과 반복 학습이 필요한 학생에게 도움이 됩니다.",
        steps: [
          "수업 종료 후 판서 자료가 저장되는지 확인합니다.",
          "필요한 경우 PDF 또는 수업 자료 형태로 학생에게 공유합니다.",
          "녹화 영상과 판서 자료를 함께 제공하면 복습 효과가 커집니다.",
          "학부모 상담이나 보강 자료로 활용할 수 있도록 자료명을 일관되게 관리합니다.",
        ],
      },
      {
        heading: "시연 때 보여주면 좋은 장면",
        body: "도입 상담이나 교사 교육에서는 긴 설명보다 실제 판서 흐름을 보여주는 것이 빠릅니다.",
        steps: [
          "교재 PDF를 열고 그 위에 직접 풀이를 작성합니다.",
          "도형이나 수식이 포함된 문제를 풀며 확대와 이동을 보여줍니다.",
          "학생 참여 상황을 가정해 여러 입력이 동시에 되는 장면을 보여줍니다.",
          "수업 종료 후 자료가 저장되고 공유되는 흐름을 보여줍니다.",
        ],
      },
    ],
    relatedSlugs: ["board-basic-operation", "board-overview", "classroom-tools", "classin-607-update"],
  },
  {
    slug: "board-ai-camera-mic",
    category: "hardware",
    title: "AI 카메라와 마이크 사용 가이드",
    description: "Classin Board의 AI 카메라, 자동 추적, 자동 줌, 마이크, 하이브리드 수업과 녹화 활용 기준을 정리했습니다.",
    audience: "교사, 하이브리드 수업 운영팀, 설치 상담 담당자",
    updatedAt: "2026-05-30",
    readMinutes: 6,
    tags: ["AI 카메라", "마이크", "자동 추적", "하이브리드 수업", "녹화"],
    keywords: ["4K AI 카메라", "자동 강사 추적", "자동 줌", "8배열 마이크", "노이즈캔슬링", "수업 영상 자동 생성", "하이브리드 수업"],
    chatbotSummary: "AI 카메라와 마이크는 교사를 자동으로 추적하고 원격 학생에게 교실 수업을 전달하며, 수업 종료 후 복습 영상을 만드는 데 사용됩니다. 하이브리드 수업에서는 카메라 앵글, 마이크 수음 범위, 네트워크 상태, 녹화 저장 여부를 수업 전 점검해야 합니다.",
    sections: [
      {
        heading: "AI 카메라의 역할",
        body: "AI 카메라는 교사가 이동하는 오프라인 수업 장면을 원격 학생과 녹화 영상에 자연스럽게 전달하기 위한 장치입니다.",
        steps: [
          "교사를 자동으로 추적해 화면 중심에 잡히도록 돕습니다.",
          "수업 장면에 맞춰 줌과 앵글을 조정하는 구성을 지원합니다.",
          "교실 수업과 원격 학생이 함께 참여하는 하이브리드 수업에 활용합니다.",
          "수업 종료 후 복습 영상 생성 흐름과 연결됩니다.",
        ],
        media: [
          {
            type: "image",
            src: `${HARDWARE_MEDIA_BASE}/camera/camera-dual-premium-blended.webp`,
            alt: "Classin Board AI 카메라 이미지",
            caption: "AI 카메라는 교사 추적, 원격 송출, 수업 녹화 품질에 영향을 줍니다.",
            width: 1440,
            height: 900,
          },
        ],
      },
      {
        heading: "마이크와 음성 전달",
        body: "하이브리드 수업에서는 영상만큼 음성이 중요합니다. 교사의 목소리가 원격 학생에게 선명하게 전달되어야 수업 이해도가 유지됩니다.",
        steps: [
          "모델별 마이크 구성과 외부 마이크 필요 여부를 확인합니다.",
          "교사가 주로 서는 위치에서 수음이 안정적인지 테스트합니다.",
          "학생 발언까지 받을 경우 교실 크기와 좌석 배치를 함께 확인합니다.",
          "에어컨, 복도 소음, 스피커 울림이 있는지 수업 전 점검합니다.",
        ],
      },
      {
        heading: "하이브리드 수업 전 체크",
        body: "원격 학생이 있는 수업은 수업 전 5분 점검이 중요합니다.",
        steps: [
          "카메라가 올바른 장치로 선택되어 있는지 확인합니다.",
          "교사 위치와 칠판 영역이 카메라 앵글 안에 들어오는지 확인합니다.",
          "마이크 입력과 스피커 출력이 겹쳐 하울링이 생기지 않는지 확인합니다.",
          "네트워크 속도와 안정성을 확인합니다.",
          "녹화가 필요한 수업이라면 녹화 저장 경로와 권한을 확인합니다.",
        ],
      },
      {
        heading: "수업 영상 자동 생성 활용",
        body: "수업 영상은 결석 보강, 반복 복습, 강사 피드백, 학부모 상담 자료로 활용할 수 있습니다.",
        steps: [
          "수업명과 날짜가 영상 제목에서 구분되도록 운영 규칙을 정합니다.",
          "복습용 영상은 학생에게 제공할 범위와 기간을 안내합니다.",
          "강사 피드백용 영상은 내부 공유 범위를 제한합니다.",
          "녹화 영상과 판서 PDF를 함께 제공하면 복습 흐름이 좋아집니다.",
        ],
      },
      {
        heading: "설정이 필요한 경우",
        body: "T1, S1, Panorama 같은 카메라 구성은 현장 네트워크와 CMS 설정이 필요할 수 있습니다. 설치형 카메라는 별도 세팅 문서를 함께 확인하세요.",
        steps: [
          "카메라가 자동 인식되지 않으면 네트워크와 CMS 연결 상태를 확인합니다.",
          "Tracking, Panorama, Close-up 앵글이 수업 목적에 맞는지 확인합니다.",
          "RTSP 주소나 고정 IP를 쓰는 현장은 설치 담당자에게 변경 정보를 남깁니다.",
          "세부 설치 절차는 '웹캠 네트워크 + CMS 카메라 세팅' 문서를 참고합니다.",
        ],
      },
    ],
    relatedSlugs: ["webcam-cms-setup-t1-panorama", "board-install-readiness", "board-overview", "mic-dt2-pro", "cam-t1-s1"],
  },
  {
    slug: "board-install-readiness",
    category: "hardware",
    title: "설치 전 준비 체크리스트",
    description: "Classin Board 설치 전 현장에서 확인해야 할 공간, 전원, 네트워크, 벽면, 카메라, 인수인계 항목을 정리했습니다.",
    audience: "학원 관리자, 설치 엔지니어, 운영팀, 도입 상담 담당자",
    updatedAt: "2026-05-30",
    readMinutes: 9,
    tags: ["설치 준비", "현장 실측", "네트워크", "전원", "인수인계", "사용 주의사항", "관리"],
    keywords: ["전자칠판 설치", "Classin Board 설치", "현장 실측", "벽걸이", "이동형 스탠드", "네트워크", "전원", "카메라 세팅", "A/S", "사용 환경", "작동 온도", "습도", "적외선 터치 관리", "화면 청소", "소비전력"],
    chatbotSummary: "Classin Board 설치 전에는 교실 크기, 벽면 재질, 전원 위치, 네트워크 속도와 배선, 카메라와 마이크 구성, OPS와 주변기기, 설치 방식, 교사 교육 일정, 인수인계 자료를 확인해야 합니다. 설치 당일에는 화면, 터치, 카메라, 마이크, 네트워크, Classin 로그인, 수업 생성, 녹화 저장까지 시연 후 종료합니다. 사용 환경은 작동 온도 0~40℃·습도 80%RH 이하, 전원 100~240V이며 확인된 최대 소비전력은 S75 315W, S86 390W, S98 Pro 740W, S110 850W입니다. S65 상세 소비전력은 최신 규격 확인 전까지 단정하지 않습니다. 적외선 터치 베젤 청소, AG/AF 코팅에 맞는 화면 관리, OPS 분리 시 전원 차단 같은 관리 수칙을 함께 안내합니다.",
    sections: [
      {
        heading: "설치 전 반드시 확인할 것",
        body: "하드웨어 설치는 제품만 도착한다고 끝나지 않습니다. 공간 조건과 수업 운영 방식이 맞아야 설치 후 바로 수업에 투입할 수 있습니다.",
        steps: [
          "설치할 교실의 가로·세로 크기와 천장 높이를 확인합니다.",
          "학생 좌석 배치와 맨 뒷자리 시야 거리를 확인합니다.",
          "벽걸이 설치인지 이동형 스탠드 설치인지 정합니다.",
          "벽걸이 설치라면 벽면 재질과 보강 필요 여부를 확인합니다.",
          "설치 당일 보드 반입 동선과 엘리베이터 사용 가능 여부를 확인합니다.",
        ],
      },
      {
        heading: "전원과 네트워크",
        body: "전원과 네트워크는 수업 안정성에 직접 영향을 줍니다. 특히 하이브리드 수업과 카메라 송출을 한다면 네트워크 확인이 중요합니다.",
        steps: [
          "보드 위치 근처에 안정적인 전원 콘센트가 있는지 확인합니다.",
          "멀티탭 사용 시 정격 용량과 케이블 정리 방식을 확인합니다.",
          "유선 네트워크 사용 여부와 랜선 경로를 확인합니다.",
          "무선 네트워크를 사용할 경우 교실 안 실제 속도와 안정성을 확인합니다.",
          "카메라나 CMS 장비가 별도 네트워크 대역을 쓰는지 확인합니다.",
        ],
      },
      {
        heading: "카메라·마이크·주변기기",
        body: "카메라와 마이크는 설치 후 수업 품질 차이를 크게 만드는 장비입니다. 수업 형태에 따라 필요한 구성이 달라집니다.",
        steps: [
          "오프라인 전용 수업인지, 온라인 송출이 필요한지 확인합니다.",
          "교사 추적 카메라, 학생 앵글, Panorama 앵글 필요 여부를 확인합니다.",
          "마이크 수음 범위가 교실 크기와 맞는지 확인합니다.",
          "OPS, NFC 카드, 스타일러스, 스탠드 등 부속품 구성을 확인합니다.",
          "외부 PC, HDMI, USB 장비를 함께 쓸 경우 연결 포트를 미리 확인합니다.",
        ],
      },
      {
        heading: "설치 당일 검수",
        body: "설치가 끝나면 단순 전원 확인이 아니라 실제 수업 흐름으로 검수해야 합니다.",
        steps: [
          "보드 전원, 화면 밝기, 터치 입력, 펜 입력을 확인합니다.",
          "Classin 로그인과 수업 생성, 수업 입장 흐름을 확인합니다.",
          "PDF 또는 이미지 자료를 열고 판서가 정상 저장되는지 확인합니다.",
          "카메라와 마이크가 Classin에서 올바른 장치로 잡히는지 확인합니다.",
          "녹화가 필요한 경우 테스트 수업을 종료한 뒤 영상과 판서 자료 저장을 확인합니다.",
        ],
      },
      {
        heading: "인수인계와 교사 교육",
        body: "설치 후에는 담당자가 바뀌어도 운영할 수 있도록 최소한의 문서와 교육을 남겨야 합니다.",
        steps: [
          "관리자 계정, 교사 계정, 테스트 학생 계정 정보를 정리합니다.",
          "네트워크 설정, 카메라 IP, CMS 설정 변경 사항을 기록합니다.",
          "기본 수업 생성, 자료 업로드, 판서, 녹화, 복습 자료 공유를 교사와 함께 시연합니다.",
          "A/S 접수 경로와 원격지원 가능 범위를 안내합니다.",
          "설치 후 첫 주에는 실제 수업에서 발견된 문제를 모아 재점검합니다.",
        ],
      },
      {
        heading: "사용 환경 주의사항",
        body: "Classin Board는 규격서 기준 작동 환경을 벗어나면 화면·터치·OPS 안정성에 영향을 받을 수 있습니다. 설치 위치를 정할 때 온도·습도·직사광선 조건을 함께 확인하세요.",
        steps: [
          "작동 환경은 온도 0~40℃, 습도 80%RH 이하 기준입니다. 보관은 -10~60℃, 습도 10~80%RH, 해발 5,000m 이하를 권장합니다.",
          "전원은 100~240V를 사용하며 대기 전력은 0.5W 미만입니다. 확인된 최대 소비전력은 S75 315W, S86 390W, S98 Pro 740W, S110 850W이며, S65 상세 소비전력은 최신 규격 확인 전까지 단정하지 않습니다. 멀티탭 정격 용량은 여유 있게 잡습니다.",
          "적외선 터치 방식이라 화면 테두리(베젤)에 먼지나 이물질이 끼면 터치가 튈 수 있으므로 주기적으로 닦아 줍니다.",
          "강한 직사광선이나 적외선 광원이 화면을 직접 비추면 터치 인식이 불안정해질 수 있어 설치 각도를 조정합니다.",
          "발열과 환기를 위해 보드 뒷면과 통풍구 주변에 여유 공간을 둡니다.",
        ],
      },
      {
        heading: "화면·펜·OPS 관리",
        body: "패널과 부속품은 관리 방법에 따라 수명과 판서감이 달라집니다. 일상 관리 기준을 운영팀과 공유해 두면 좋습니다.",
        steps: [
          "화면은 AG 방현·AF 지문방지 코팅이 적용되어 있어 마른 부드러운 천이나 전용 클리너로 닦고, 알코올·시너 같은 강한 용제는 피합니다.",
          "기본 제공되는 적외선 펜(2개)은 분실·파손에 대비해 여분 보관 위치를 정합니다.",
          "OPS 모듈을 분리하거나 교체할 때는 반드시 전원을 끄고 진행합니다.",
          "TÜV 라인 저블루라이트 등 인증이 적용되어 있으나 장시간 수업 후에는 학생 눈 휴식 시간을 두는 것이 좋습니다.",
          "펌웨어·Classin 업데이트 알림이 뜨면 수업이 없는 시간에 적용해 수업 중 재시작을 피합니다.",
        ],
      },
    ],
    relatedSlugs: ["board-s-series-safe-use", "board-lineup-specs", "board-ai-camera-mic", "webcam-cms-setup-t1-panorama"],
  },
  {
    slug: "electronic-whiteboard-classroom-checklist",
    category: "hardware",
    title: "학원 전자칠판 도입 체크리스트",
    description: "전자칠판이 실제 수업 노동을 줄이는지 확인하기 위한 7개 영역, 40문항 체크리스트입니다.",
    audience: "학원 관리자, 도입 검토자, 설치 상담 담당자, 운영팀",
    updatedAt: "2026-06-02",
    readMinutes: 9,
    status: "review",
    visibility: "unlisted",
    noindex: true,
    docType: "guide",
    productArea: "hardware",
    difficulty: "beginner",
    tags: ["전자칠판 체크리스트", "Classin Board", "학원 장비", "스마트 교실", "도입 검토"],
    keywords: ["전자칠판 구매", "전자칠판 체크리스트", "스마트보드", "Classin Board", "수업 녹화", "OPS", "판서", "교실 크기", "하드웨어 도입"],
    chatbotSummary: "이 체크리스트는 전자칠판 구매 전 수업 준비, 소프트웨어 호환성, 판서와 터치, 녹화·카메라·마이크, 화면 품질, 설치 방식, 새 노동 발생 여부를 40문항으로 점검하는 가이드입니다.",
    sections: [
      {
        heading: "사용 방법",
        body: "각 문항에 대해 현재 검토 중인 전자칠판이 조건을 충족하면 1점, 아니면 0점으로 체크합니다. 총 40점 만점이며, 점수보다 중요한 것은 낮게 나온 영역을 도입 전 테스트 항목으로 바꾸는 것입니다.",
        steps: [
          "검토 중인 모델과 설치 환경을 기준으로 문항을 체크합니다.",
          "데모 시연에서 확인한 항목만 1점으로 표시합니다.",
          "확인하지 못한 항목은 도입 전 질문 목록으로 남깁니다.",
          "교사, 운영팀, 설치 담당자가 함께 낮은 점수 영역을 확인합니다.",
        ],
      },
      {
        heading: "1. 수업 준비와 연결 구조",
        body: "전자칠판이 수업 시작 전 세팅 시간을 줄이는지 확인합니다.",
        steps: [
          "외장 노트북 없이 독립적으로 수업을 시작할 수 있다.",
          "HDMI 케이블 연결이 필수 흐름이 아니다.",
          "수업 자료, 판서 도구, 브라우저, 전자교재를 한 장비에서 열 수 있다.",
          "부팅 후 수업 시작까지 과정이 단순하다.",
          "교실마다 다른 케이블, 젠더, 노트북 상태에 의존하지 않는다.",
          "강사가 바뀌어도 기본 세팅을 쉽게 이해할 수 있다.",
        ],
      },
      {
        heading: "2. 운영체제와 소프트웨어 호환성",
        body: "전자칠판이 실제 학원 수업 프로그램과 안정적으로 맞물리는지 확인합니다.",
        steps: [
          "학원에서 쓰는 주요 수업 프로그램이 설치 또는 실행된다.",
          "PDF, PPT, 전자교재, 웹 기반 수업 도구가 안정적으로 작동한다.",
          "화상수업, 녹화, LMS, 브라우저 기반 도구와 충돌이 적다.",
          "안드로이드 앱 제한 때문에 기능이 막히지 않는다.",
          "윈도우 기반 프로그램이 필요한 경우 OPS 또는 PC 환경이 준비되어 있다.",
          "소프트웨어 업데이트와 계정 로그인이 관리 가능한 구조다.",
        ],
      },
      {
        heading: "3. 판서와 터치 경험",
        body: "수업 중 판서와 조작이 교사의 설명 흐름을 방해하지 않는지 확인합니다.",
        steps: [
          "필기 지연이 수업 흐름을 방해하지 않는다.",
          "펜과 손가락 터치가 안정적으로 구분된다.",
          "여러 학생이 동시에 참여해도 터치가 흔들리지 않는다.",
          "지우기, 확대, 이동, 페이지 전환이 직관적이다.",
          "판서 내용이 저장되고 다시 불러올 수 있다.",
          "수업 후 판서 자료를 PDF 또는 수업 기록으로 공유할 수 있다.",
        ],
      },
      {
        heading: "4. 녹화, 카메라, 마이크",
        body: "수업 기록과 복습 제공이 별도 업무가 되지 않는지 확인합니다.",
        steps: [
          "수업 녹화가 별도 프로그램 설치 없이 가능하다.",
          "강사 화면, 판서, 음성이 함께 기록된다.",
          "카메라를 따로 구매하거나 삼각대 세팅을 반복하지 않아도 된다.",
          "조명 세팅이 매번 새 업무가 되지 않는다.",
          "수업 종료 후 영상 저장 또는 업로드 흐름이 단순하다.",
          "결석 보강, 복습 제공, 강사 피드백으로 이어지는 공유 구조가 있다.",
        ],
      },
      {
        heading: "5. 화면 품질과 내구성",
        body: "교실 조명, 좌석 거리, 반복 사용 환경에서 화면 품질이 유지되는지 확인합니다.",
        steps: [
          "교실 조명 아래에서도 반사가 심하지 않다.",
          "손자국과 얼룩이 쉽게 남지 않는다.",
          "반복 판서와 터치에도 표면 손상이 적다.",
          "뒤쪽과 측면 자리에서도 글씨가 선명하게 보인다.",
          "밝기, 해상도, 시야각이 실제 교실 환경에 충분하다.",
          "프레임과 외관이 교실 분위기와 수업 몰입을 해치지 않는다.",
        ],
      },
      {
        heading: "6. 교실 크기와 설치 방식",
        body: "장비 크기와 설치 방식이 교실 동선, 시야, 안전 조건과 맞는지 확인합니다.",
        steps: [
          "가장 먼 자리에서 글씨와 자료가 보인다.",
          "작은 교실에 과도하게 큰 화면을 넣지 않는다.",
          "큰 교실에는 최소 시인성을 보장하는 크기를 선택한다.",
          "벽걸이, 이동형 스탠드, 배선 위치가 교실 동선과 맞는다.",
          "교사가 화면 앞에서 움직일 공간이 충분하다.",
          "설치 후 전원, 네트워크, 케이블 정리가 안전하다.",
        ],
      },
      {
        heading: "7. 새 노동이 생기지 않는가",
        body: "전자칠판 도입 후 교사와 운영팀의 업무가 실제로 줄어드는지 확인합니다.",
        steps: [
          "수업 시작 전 강사가 해야 할 추가 세팅이 늘지 않는다.",
          "녹화 후 다운로드, 업로드, 알림 발송을 수동으로 반복하지 않는다.",
          "전자칠판, 카메라, 조명, 마이크를 따로 관리하지 않아도 된다.",
          "수업 기록이 학부모 상담과 복습 관리로 이어진다.",
          "운영팀이 파일을 다시 정리하거나 링크를 수동 배포하지 않아도 된다.",
          "장비 도입 후 선생님과 운영팀의 시간이 실제로 줄어든다.",
          "문제가 생겼을 때 A/S와 운영 지원 흐름이 명확하다.",
          "장비가 멋있어 보이는 수준을 넘어 수업 운영 시스템에 포함된다.",
        ],
      },
      {
        heading: "점수 해석",
        body: "총점은 전자칠판이 큰 터치 모니터에 머무는지, 실제 수업 운영 장비로 작동하는지 판단하는 출발점입니다.",
        steps: [
          "0-15점: 큰 터치 모니터형입니다. 외장 PC, HDMI, 별도 녹화 프로그램, 수동 업로드에 계속 의존할 수 있습니다.",
          "16-25점: 부분 스마트보드형입니다. 녹화, 복습 공유, 소프트웨어 호환성에서 추가 노동이 생길 수 있습니다.",
          "26-34점: 수업 운영 연동형입니다. 도입 전 교실 크기와 운영 세팅을 구체화하면 됩니다.",
          "35점 이상: 스마트 교실 준비형입니다. 수업 기록, 복습, 학부모 커뮤니케이션까지 연결하는 단계로 검토할 수 있습니다.",
        ],
      },
      {
        heading: "레드 플래그",
        body: "아래 항목 중 하나라도 있으면 도입 전 재검토가 필요합니다.",
        steps: [
          "매 수업마다 외장 노트북과 HDMI 연결이 필요하다.",
          "주요 수업 프로그램이 안드로이드 환경에서 작동하지 않는다.",
          "녹화는 가능하지만 저장, 업로드, 공유가 수동이다.",
          "카메라, 마이크, 조명을 별도로 세팅해야 한다.",
          "반사나 지문 때문에 실제 교실에서 화면이 잘 보이지 않는다.",
          "수업 후 기록이 학부모 상담이나 복습 관리로 이어지지 않는다.",
        ],
      },
      {
        heading: "Classin Board로 연결되는 지점",
        body: "전자칠판 선택의 핵심은 장비 자체가 아니라 수업 전후의 흐름입니다. Classin Board는 보드, 카메라, 마이크, OPS 컴퓨팅, Classin 소프트웨어 연동을 하나의 수업 환경으로 묶어 판서, 녹화, 저장, 공유가 따로 떨어지지 않도록 설계합니다.",
      },
    ],
    relatedSlugs: [
      "board-overview",
      "board-lineup-specs",
      "board-install-readiness",
      "board-basic-operation",
      "board-ai-camera-mic",
    ],
  },
  {
    slug: "board-s-series-safe-use",
    category: "hardware",
    title: "ClassIn Board S 시리즈 안전 사용 기본 지침",
    description: "ClassIn Board S65·S75·S86·S110 설명서 기준으로 전원, 설치, 이동, 화면 관리, 기본 조작, 포트 사용 시 주의할 점을 한국어로 정리했습니다.",
    audience: "학원 관리자, 교사, 설치 담당자, 운영팀, 상담 담당자",
    updatedAt: "2026-05-30",
    readMinutes: 7,
    tags: ["하드웨어", "ClassIn Board", "S 시리즈", "안전", "사용 설명서", "기본 조작", "관리"],
    keywords: ["ClassIn Board S 시리즈", "Classin Board 안전", "전자칠판 안전 사용", "전자칠판 청소", "전자칠판 전원", "전자칠판 터치 잠금", "전자칠판 입력 소스", "무선 투영", "주석", "작은 제어 화면", "보조 조작 패널", "Type-C", "HDMI Touch", "LAN", "OPS"],
    chatbotSummary: "ClassIn Board S 시리즈는 전원·접지·환기·설치 안정성·화면 보호를 먼저 확인하고 사용해야 합니다. 이상한 소리나 냄새, 액체 유입, 터치 이상이 있으면 즉시 전원을 끄고 플러그를 분리한 뒤 A/S로 연결합니다. 기본 조작은 대형 화면 제어 메뉴에서 투영, 주석, 터치 잠금, 눈 보호, 입력 소스, 설정, 볼륨과 밝기를 조정하는 흐름으로 안내합니다. 청소 전에는 전원을 끄고 부드러운 반건조 천을 사용하며 알코올, 시너, 강한 세제는 피합니다. 포트·네트워크·수동 IP 설정은 현장 담당자가 실제 연결 상태를 확인한 뒤 진행하도록 권장합니다.",
    sections: [
      {
        heading: "먼저 지켜야 할 원칙",
        body: "ClassIn Board S 시리즈는 대형 유리 패널, 전원 장치, OPS 컴퓨터, 네트워크와 외부 입력 포트가 결합된 수업 장비입니다. 상담과 운영 안내에서는 기능 설명보다 안전한 전원, 안정적인 설치, 화면 보호, 이상 증상 대응을 먼저 안내하는 것이 좋습니다.",
        steps: [
          "제품 라벨에 표시된 전원 규격을 사용하고, 접지된 3구 콘센트를 우선 권장합니다.",
          "전원선은 통로를 가로지르지 않게 정리하고, 멀티탭을 쓰면 정격 용량을 확인합니다.",
          "낙뢰가 있거나 장기간 사용하지 않을 때는 전원 플러그와 네트워크 케이블을 분리합니다.",
          "이상한 소리, 냄새, 연기, 액체 유입이 있으면 즉시 전원을 끄고 플러그를 뽑은 뒤 사용을 중지합니다.",
          "제품을 직접 분해하거나 커버를 열지 말고, 점검과 수리는 설치 담당자나 A/S 경로로 연결합니다.",
        ],
      },
      {
        heading: "설치와 이동 시 주의",
        body: "보드는 무겁고 화면이 유리라 이동과 설치 단계에서 가장 큰 사고가 날 수 있습니다. 설치 방식은 벽걸이와 스탠드 모두 안정성을 먼저 확인해야 합니다.",
        steps: [
          "대형 보드 이동은 원문 설명서 기준 6명 이상이 함께 진행하는 것을 전제로 안내합니다.",
          "바닥형 설치는 받침대를 단단히 고정하고 평평하고 안정적인 바닥에 둡니다.",
          "벽걸이 설치는 제품과 브래킷 기준에 맞춰 고정하고, 벽면 재질과 보강 필요 여부를 설치 전에 확인합니다.",
          "직사광선, 습기, 과열·과냉, 먼지가 많은 곳, 통풍이 나쁜 곳, 가연성·부식성 가스가 있는 곳은 피합니다.",
          "통풍구 주변을 막지 않고, 이동형 스탠드는 급정지·급회전·경사 바닥을 피해서 이동합니다.",
        ],
      },
      {
        heading: "화면과 터치 관리",
        body: "화면은 수업 품질과 제품 수명에 직접 영향을 줍니다. 청소와 터치 문제 안내는 강한 세제나 무리한 압력을 피하는 방향으로 통일합니다.",
        steps: [
          "LCD 패널은 유리이므로 화면을 강하게 누르거나 충격을 주지 않습니다.",
          "날카로운 물건이나 금속 물체를 통풍구, 단자, 화면 주변에 넣거나 접촉시키지 않습니다.",
          "같은 화면, 고정 아이콘, 정지된 텍스트를 오래 띄워 두면 잔상이 생길 수 있으므로 화면 보호와 화면 끄기를 권장합니다.",
          "청소 전에는 전원을 끄고 플러그를 분리합니다.",
          "화면은 물을 아주 조금 묻힌 부드러운 반건조 천으로 가볍게 닦습니다.",
          "알코올, 휘발유, 산·알칼리 세제, 시너, 휘발성 용제는 코팅과 외관을 손상시킬 수 있어 피합니다.",
          "저온 공간에서 따뜻한 공간으로 옮긴 직후에는 내부 결로가 생길 수 있으므로 충분히 건조한 뒤 전원을 켭니다.",
        ],
      },
      {
        heading: "대형 화면 제어 메뉴",
        body: "기본 조작은 화면 오른쪽 하단의 전원·설정 버튼과 대형 화면 제어 메뉴를 중심으로 안내하면 됩니다. 실제 버튼 위치와 명칭은 모델과 펌웨어에 따라 다를 수 있습니다.",
        steps: [
          "AC 전원이 연결된 상태에서 전원 버튼을 눌러 시스템을 시작합니다.",
          "시스템 실행 중 전원·설정 버튼을 짧게 누르면 대형 화면 제어 메뉴가 열릴 수 있고, 길게 누르면 종료 흐름으로 들어갑니다.",
          "제어 메뉴에서는 투영, 주석, 터치 잠금, 눈 보호, 입력 소스, 설정, 볼륨, 밝기, 화면 끄기, 재시작, 종료를 안내합니다.",
          "수업 중 학생이 화면을 만지거나 화면을 청소해야 하면 터치 잠금을 먼저 켭니다.",
          "교실 조도와 학생 좌석 거리에 맞춰 눈 보호 모드, 밝기, 볼륨을 조정합니다.",
          "입력 소스가 회색으로 보이거나 선택되지 않으면 해당 포트에 신호가 없는 상태로 보고 케이블, 외부 기기 전원, 입력 포트를 확인합니다.",
        ],
      },
      {
        heading: "투영과 주석",
        body: "수업 중 가장 자주 쓰는 기능은 화면 투영과 주석입니다. 안내할 때는 연결 조건과 수업 중 빠른 복구 방법을 함께 말해 주는 것이 좋습니다.",
        steps: [
          "유선 투영은 HDMI나 Type-C 등 실제 연결된 입력 소스를 선택해 전환합니다.",
          "무선 투영은 보드와 기기가 같은 네트워크 또는 보드가 안내하는 무선 핫스팟에 연결된 상태에서 진행합니다.",
          "주석 기능은 화면 위에 색상별 필기, 강조 표시, 회의 체크를 남길 때 사용합니다.",
          "부분 지우기는 지우개 도구나 넓은 면 터치로, 전체 지우기는 삭제 기능으로 안내합니다.",
          "주석 도구 모음은 흰색 도구 막대를 잡고 옮길 수 있으며, 종료 버튼으로 빠져나옵니다.",
          "수업 중 설명 흐름을 끊지 않으려면 투영 연결, 주석, 지우기, 종료 동작을 교사가 수업 전 한 번씩 연습합니다.",
        ],
      },
      {
        heading: "포트와 네트워크 사용",
        body: "포트 안내는 '어디에 꽂는가'보다 용도 구분이 중요합니다. Android 전용 포트, 공용 USB, HDMI Touch, LAN, Type-C를 혼동하지 않도록 안내합니다.",
        steps: [
          "Android USB 2.0 포트는 Android 시스템 업그레이드 용도 중심으로 안내하고, 일반 USB 장치는 공용 USB 포트를 우선 사용합니다.",
          "무선 키보드·마우스가 끊기면 USB 수신기를 다른 포트로 옮기거나 USB 연장선을 써서 수신 범위를 확보합니다.",
          "HDMI로 외부 기기를 연결할 때 터치 입력까지 필요하면 HDMI 신호 연결과 HDMI Touch 입력 연결을 함께 확인합니다.",
          "Type-C는 충전, DP 신호 표시, USB 연결을 지원할 수 있으나 케이블 규격과 길이에 민감합니다. 원문 설명서 기준 1.5m 이내 케이블을 기본 권장으로 둡니다.",
          "LAN 포트는 유선 네트워크와 네트워크 공유에 쓰일 수 있습니다. IP 설정은 자동을 기본으로 두고, 수동 IP는 주소·서브넷·게이트웨이·DNS를 확인한 뒤 설정합니다.",
        ],
      },
      {
        heading: "작은 제어 화면 활용",
        body: "S 시리즈 설명서의 작은 제어 화면은 큰 보드 조작이 불편하거나 민감한 내용을 다룰 때 쓰는 보조 패널입니다. 한국어 안내에서는 '작은 제어 화면' 또는 '보조 조작 패널'처럼 설명합니다.",
        steps: [
          "화면 어디서나 5손가락 제스처로 작은 제어 화면을 열 수 있습니다.",
          "큰 화면 전체를 직접 조작하기 어렵거나 멀리 있는 버튼을 누르기 힘들 때 사용합니다.",
          "비밀번호 입력, 개인 파일 열기처럼 민감한 조작을 할 때 큰 화면 노출을 줄이는 용도로 안내합니다.",
          "작은 제어 화면 하단의 흰색 도구 막대를 잡고 위치를 옮길 수 있습니다.",
          "패널 밖을 누르면 작은 제어 화면에서 빠져나옵니다.",
        ],
      },
      {
        heading: "운영팀 체크리스트",
        body: "설치 후 첫 주에는 기능을 많이 쓰는 것보다 안전하게 반복 운영되는지 확인하는 것이 중요합니다.",
        steps: [
          "전원선, 멀티탭, LAN선, HDMI선이 발에 걸리지 않게 정리되어 있는지 확인합니다.",
          "벽걸이 또는 스탠드가 흔들리지 않는지 확인합니다.",
          "화면 밝기, 눈 보호 모드, 볼륨 기본값을 교실에 맞춰 정합니다.",
          "교사가 터치 잠금, 투영, 주석, 입력 소스 전환, 화면 끄기, 재시작을 직접 해 봅니다.",
          "청소 도구와 여분 펜 보관 위치를 정합니다.",
          "이상 증상 발생 시 전원 차단, 사용 중지, A/S 접수 경로를 운영팀에 공유합니다.",
        ],
      },
    ],
    resources: [
      {
        label: "Classin 하드웨어 소개",
        href: "/product/hw",
        description: "제품 소개 페이지에서 보드 라인업과 도입 흐름을 함께 확인할 수 있습니다.",
      },
    ],
    relatedSlugs: ["board-basic-operation", "board-install-readiness", "board-lineup-specs"],
  },
  {
    slug: "mic-dt2-pro",
    category: "hardware",
    title: "ClassIn Mic DT2 Pro 천장 마이크 가이드",
    description: "천장형 마이크 어레이 ClassIn Mic DT2 Pro의 역할, 제품 구성, 빔포밍 음성 추적, 두 가지 음장 방안, 교실 규모별 구성, 설치 환경 요구사항, 튜닝 절차를 정리했습니다.",
    audience: "도입 검토자, 설치 담당자, 하이브리드 수업 운영팀",
    updatedAt: "2026-05-30",
    readMinutes: 7,
    tags: ["하드웨어", "마이크", "DT2 Pro", "하이브리드 수업", "음성", "음장 방안", "설치"],
    keywords: ["ClassIn Mic DT2 Pro", "MS21A", "천장 마이크", "마이크 어레이", "빔포밍", "음성 추적", "수음 영역", "분구 균형 확음", "천장 스피커", "AEC", "노이즈 캔슬링", "설치 높이", "하이브리드 수업 음성"],
    chatbotSummary: "ClassIn Mic DT2 Pro(모델 MS21A)는 어레이 마이크·오디오 프로세서·파워 앰프(4×50W)를 한 몸체에 담은 천장형 32채널 마이크로, 빔포밍 음성 자동 추적과 수음 영역 설정, AEC·AFC·AGC·AI 노이즈 제거(ANS)를 제공합니다. 음장은 온라인 송출까지 하는 '분구 균형 확음 방안(천장 스피커)'과 오프라인 확음 위주의 '표준 확음·수음 방안(벽걸이 스피커)' 중 선택합니다. 단일 마이크 최적 60~80㎡, 2~3대 연결로 최대 150㎡까지 커버하며, 설치 높이 2.5~4m(최적 2.7~3.5m), 배경 소음 45dB·잔향 1000ms 이하, 직사각형 교실을 권장합니다.",
    sections: [
      {
        heading: "DT2 Pro의 역할",
        body: "ClassIn Mic DT2 Pro는 책상이나 보드 내장 마이크로는 수음이 어려운 큰 교실·세미나실에서 천장에 설치해 교실 전체 음성을 잡고 확음하는 전문 오디오 시스템입니다. 하이브리드 수업에서 교사와 학생의 목소리를 원격 참여자에게 선명하게 전달하는 것이 핵심 목적입니다.",
        steps: [
          "교사가 이동하며 수업해도 말하는 사람의 위치를 자동 추적해 수음합니다.",
          "원격 학생에게 교실 음성을 선명하게 전달해 하이브리드 수업 이해도를 유지합니다.",
          "보드 내장 마이크(8배열)로 부족한 대형 공간이나 토론형 수업을 보완합니다.",
          "녹화 수업의 음성 품질을 높여 복습 자료의 가치를 키웁니다.",
        ],
      },
      {
        heading: "제품 구성과 성능",
        body: "DT2 Pro는 어레이 마이크, 오디오 프로세서, 파워 앰프를 한 몸체에 담은 일체형 장비라 외장 오디오 프로세서 없이 동작합니다.",
        steps: [
          "구성은 32채널 어레이 마이크 + 오디오 프로세서 + 파워 앰프(4×50W)로, 외장 처리기 없이 단독 동작합니다.",
          "수음과 확음을 동시에 처리하며 지연이 낮아 실시간 수업에 적합합니다.",
          "이전 세대보다 연산·알고리즘 성능이 향상되었습니다.",
          "여러 대를 연결해 더 큰 교실로 확장할 수 있습니다.",
        ],
      },
      {
        heading: "핵심 기능",
        body: "DT2 Pro는 단순 마이크가 아니라 빔포밍 추적과 AI 음성 처리를 함께 갖춘 오디오 시스템입니다.",
        steps: [
          "적응형 빔포밍으로 말하는 사람의 위치를 자동 추적합니다.",
          "수음 영역을 환경에 맞게 설정해 차폐 구역과 우선 구역을 지정할 수 있습니다.",
          "AI 음성 처리로 에코 제거(AEC), 하울링 억제(AFC), 자동 게인(AGC), AI 노이즈 제거(ANS)를 적용합니다.",
          "여러 대를 연결해 더 넓은 공간으로 확장할 수 있습니다.",
        ],
      },
      {
        heading: "두 가지 음장 방안",
        body: "DT2 Pro는 교실 목적에 따라 두 가지 음장 방안 중 하나로 구성합니다. 온라인 송출 품질이 중요하면 방안 1, 오프라인 확음 위주면 방안 2가 적합합니다.",
        steps: [
          "방안 1 '분구 균형 확음'은 강단 교사 음성을 교실 전 좌석에 균등하게 확음하면서 동시에 전체 교실 음성을 온라인으로 송출합니다. 맨 뒷자리도 첫 줄과 같은 선명도로 들려 장시간 수업에도 청각 피로가 적습니다.",
          "방안 1은 천장형 스피커를 쓰며, 단계별 확음으로 발언자가 이동해도 교실 어느 위치에서나 일관된 음장을 유지합니다.",
          "방안 2 '표준 확음·수음 호환'은 벽걸이·라인어레이 스피커로 확음하며 마이크 주변 약 2m 음성을 교실 전체로 키웁니다. 확음 게인은 더 크지만 온라인 음성 수집은 지원하지 않습니다.",
          "방안 2는 가로로 긴 횡형 교실에는 적합하지 않습니다.",
          "하이브리드(온·오프라인 동시) 수업이면 방안 1, 오프라인 확음만 필요하면 방안 2를 선택합니다.",
        ],
      },
      {
        heading: "권장 교실 규모와 마이크·스피커 구성",
        body: "교실 면적과 형태에 따라 마이크 수와 스피커 구성이 달라집니다. 단일 마이크는 강단 음성 확음에, 캐스케이드는 전체 교실 수음·확음에 적합합니다.",
        steps: [
          "단일 마이크 최적 면적은 60~80㎡이며, 강단 영역 음성을 교실 전체로 확음합니다.",
          "2~3대 캐스케이드는 80~120㎡(최대 150㎡)에서 전체 교실 수음과 확음을 구현합니다.",
          "방안 1 예시: 일반 교실 9×7m은 마이크 1·천장 스피커 6, 대형 교실 15×9m은 마이크 2·천장 스피커 8, 횡형 교실 10×15m은 마이크 3·천장 스피커 8.",
          "방안 2 예시: 일반 교실 9×7m은 마이크 1·벽걸이 스피커 2, 대형 교실 15×7m은 마이크 1·벽걸이 스피커 4.",
          "60㎡ 미만은 제품 가치를 충분히 살리기 어렵고, 150㎡ 초과는 마이크·스피커가 공간을 완전히 덮지 못해 음장 균형이 떨어집니다.",
        ],
      },
      {
        heading: "주요 사양",
        body: "공개 견적·제안에 넣기 전에는 최신 규격서로 한 번 더 검수하세요.",
        steps: [
          "모델명 MS21A, 일렉트릿 마이크 32개 어레이.",
          "최적 수음 반경 5m, 유효 수음 반경 8m.",
          "수음 모드는 적응형 빔포밍 추적과 설정형 수음 영역입니다.",
          "크기 595×595×49mm, 순중량 4.3kg, 24V 어댑터 전원.",
          "내장 파워 앰프 4×50W로 별도 앰프 없이 확음합니다.",
        ],
      },
      {
        heading: "설치 환경 요구사항",
        body: "천장 마이크는 설치 높이와 주변 소음·잔향에 민감합니다. 아래 조건을 벗어나면 수음 품질과 온라인 송출이 크게 나빠집니다.",
        steps: [
          "설치 높이는 2.5~4m, 최적은 2.7~3.5m입니다.",
          "배경 소음은 45dB SPL 이하, 잔향은 1000ms 이하(분구 균형 확음 방안은 800ms 이하)를 권장하며, 초과 시 음향 보강 시공을 검토합니다.",
          "마이크 수평면 반경 0.5m(균형 확음 시나리오는 1m) 안에는 에어컨·팬·프로젝터·전류음이 큰 조명 등 소음·진동원을 두지 않습니다. 에어컨·통풍구는 2m 이상 떨어뜨리는 것이 좋습니다.",
          "직사각형 교실이 가장 좋고, 부채꼴·원형·타원형·다각형 같은 부정형 교실은 음장 균형과 온라인 수집 품질을 떨어뜨립니다.",
          "설치 후 원터치 튜닝과 ClassIn 오디오 설정은 설치 담당자가 한 번에 잡아 줍니다.",
        ],
      },
    ],
    resources: [
      {
        label: "Classin 하드웨어 소개",
        href: "/product/hw",
        description: "제품 소개 페이지에서 보드·카메라·마이크 구성과 도입 흐름을 함께 확인할 수 있습니다.",
      },
    ],
    relatedSlugs: ["board-ai-camera-mic", "board-install-readiness", "webcam-cms-setup-t1-panorama"],
  },
  {
    slug: "cam-t1-s1",
    category: "hardware",
    title: "ClassIn Cam T1·S1 추적 카메라 가이드",
    description: "강사를 따라다니며 찍는 T1과 발표하는 학생을 잡아 주는 S1, 두 추적 카메라가 무엇을 하고 언제 쓰는지, 어디에 설치하는지를 쉬운 말로 정리했습니다.",
    audience: "교사, 도입 검토자, 설치 담당자, 하이브리드 수업 운영팀",
    updatedAt: "2026-05-30",
    readMinutes: 7,
    tags: ["하드웨어", "카메라", "T1", "S1", "교사 추적", "학생 추적"],
    keywords: ["ClassIn Cam T1", "ClassIn Cam S1", "CS11A", "CS21A", "강사용 카메라", "학생용 카메라", "교사 추적 카메라", "학생 추적 카메라", "자동 추적", "트래킹", "AI 카메라", "4K 카메라", "하이브리드 수업 카메라", "POE 카메라", "수업 녹화 카메라"],
    chatbotSummary: "ClassIn Cam은 카메라맨 없이도 수업을 자동으로 찍어 주는 추적(트래킹) 카메라입니다. T1(모델명 CS11A)은 강사용으로, 강사가 움직여도 알아서 따라다니며 화면 중앙에 잡습니다. S1(모델명 CS21A)은 학생용으로, 일어서서 발표하는 학생을 자동으로 찾아 잡아 줍니다. 둘 다 4K 화질(1/2.8인치 842만 화소, 최대 4K 30fps)이고, 렌즈 하나로 교실 전체 모습과 인물 확대(클로즈업) 화면을 동시에 만들어 상황에 맞게 자동으로 바꿔 보여 줍니다. 전원은 랜선 하나로 전원·영상을 함께 받는 PoE, 어댑터(DC12V), USB 중 선택할 수 있고 전기는 적게 씁니다(5W 미만). 강사가 서는 위치, 화면에 잡히지 않게 가릴 곳 같은 설정은 설치할 때 한 번만 잡아 두면 됩니다.",
    sections: [
      {
        heading: "한 줄 요약: T1은 강사용, S1은 학생용",
        body: "ClassIn Cam은 사람이 카메라를 돌리지 않아도 수업을 알아서 찍어 주는 '자동 추적(트래킹) 카메라'입니다. 무엇을 따라다니느냐에 따라 두 종류로 나뉩니다.",
        steps: [
          "T1(강사용, 모델명 CS11A): 강사를 따라다닙니다. 강사가 칠판 앞을 오가도 화면 가운데에 계속 잡아 줍니다.",
          "S1(학생용, 모델명 CS21A): 발표하는 학생을 잡아 줍니다. 학생이 일어서면 그 학생을 자동으로 찾아 화면에 담습니다.",
          "둘을 함께 쓰면 강사 설명 장면과 학생 발표 장면을 모두 자동으로 담을 수 있습니다.",
          "원격 수업에 송출하거나 수업을 녹화할 때, 따로 사람이 카메라를 조작할 필요가 없습니다.",
        ],
      },
      {
        heading: "'추적(트래킹)'이 뭔가요?",
        body: "추적(트래킹)은 카메라가 사람을 알아보고 움직임을 따라가며 화면 중앙에 계속 담아 주는 기능입니다. 캠코더를 든 사람이 따라다니는 것처럼, 카메라가 스스로 그 일을 합니다.",
        steps: [
          "강사가 자리를 옮겨도 화면이 같이 움직여 강사를 놓치지 않습니다.",
          "한 화면은 교실 전체를 넓게 보여 주고, 다른 화면은 인물을 가까이 확대(클로즈업)해서 보여 줍니다.",
          "두 화면 중 지금 상황에 맞는 쪽으로 자동으로 전환되어, 보는 사람은 항상 봐야 할 장면을 보게 됩니다.",
          "렌즈가 하나뿐이어도 전체 화면과 확대 화면을 동시에 만들어 냅니다.",
        ],
      },
      {
        heading: "T1 — 강사용 카메라",
        body: "T1은 강사 한 명을 안정적으로 따라가는 데 특화된 카메라입니다. 따라가는 화면이 덜컹거리거나 엉뚱한 곳을 잡지 않는 것이 가장 큰 장점입니다.",
        steps: [
          "강사의 키에 맞춰 확대 크기를 자동으로 조절해 항상 적당한 크기로 잡습니다.",
          "강사가 잠시 멈춰 서 있어도 놓치지 않고, 조명이 바뀌거나 다른 사람이 지나가거나 프로젝터 화면이 켜져도 헷갈리지 않습니다.",
          "판서하는 강사를 가까이 잡아 주는 기능 등 여러 촬영 모드를 제공합니다.",
          "교실이 넓든 좁든, 계단식 교실이든 영향을 거의 받지 않습니다.",
          "강사가 주로 서는 범위와, 화면에 잡히지 않게 가릴 곳(프로젝터·전자칠판·TV 등)은 설치 프로그램(CameraCMS)에서 마우스로 한 번만 지정해 둡니다.",
        ],
      },
      {
        heading: "S1 — 학생용 카메라",
        body: "S1은 발표하는 학생을 자동으로 찾아 잡아 주는 카메라입니다. 별도의 추적 장비 없이 카메라 혼자서 동작합니다.",
        steps: [
          "학생이 일어서고 앉는 동작을 정확히 알아채, 발표하는 학생을 자동으로 화면에 담습니다.",
          "학생이 가까이 있든 멀리 있든 자동으로 확대·축소해 알맞은 크기로 보여 줍니다.",
          "한 명이 일어서면 그 학생을, 여러 명이 일어서면 여러 명을 함께 잡아 줍니다.",
          "일어섰다가 자리를 옮기거나 어정쩡하게 일어서는 동작도 알아챕니다.",
          "교실 정중앙이 아니어도 설치할 수 있어 위치를 잡기 쉽습니다.",
        ],
      },
      {
        heading: "두 카메라의 공통점",
        body: "T1과 S1은 화질·기본 구조가 같고, '누구를 따라가느냐'만 다릅니다.",
        steps: [
          "4K 고화질(1/2.8인치 842만 화소 센서, 최대 4K 30fps)로 또렷하게 찍습니다.",
          "렌즈 하나로 교실 전체 화면과 인물 확대 화면을 동시에 만듭니다.",
          "상황에 맞춰 전체 화면과 확대 화면을 자동으로 바꿔 보여 줍니다.",
          "녹화와 원격 송출에 필요한 여러 화면을 동시에 내보낼 수 있습니다.",
          "랜선 하나로 전원과 영상을 함께 받는 PoE, 또는 USB로 PC·녹화 장비와 연결합니다.",
        ],
      },
      {
        heading: "주요 사양",
        body: "견적서나 제안서에 넣기 전에는 최신 규격서로 한 번 더 확인하세요.",
        steps: [
          "모델명: T1은 CS11A, S1은 CS21A. 둘 다 1/2.8인치 4K 센서, 842만 화소.",
          "렌즈: T1은 7.9mm(멀리 있는 강사를 당겨 잡는 망원), S1은 2.4mm(학생 전체를 넓게 담는 광각).",
          "영상: 최대 4K 30fps, 전체 화면과 확대 화면 동시 출력.",
          "전원: PoE(랜선 하나로 전원+영상)·DC12V 어댑터·USB 중 선택, 전력 소모 5W 미만.",
          "크기 190×76×58mm, 무게 0.5kg 미만, 사용 온도 0~40℃.",
        ],
      },
      {
        heading: "어디에 설치하나요",
        body: "추적이 잘 되려면 설치 높이와 거리가 중요합니다. 벽에 거는 설치를 기준으로 한 권장 위치입니다.",
        steps: [
          "T1(강사용): 칠판에서 약 8m 떨어진 뒤쪽 벽, 높이 약 2.4m, 교실 좌우 가운데 선에 가깝게. (가능 범위: 높이 2~3m, 강단에서 5~10m)",
          "S1(학생용): 높이 약 2.2m로 칠판 위나 옆에 달아, 카메라가 학생 전체를 한눈에 담도록 합니다.",
          "S1 한 대로 가로 10m·세로 8m 정도 교실의 학생을 담을 수 있습니다.",
          "햇빛이나 강한 조명이 카메라 렌즈를 정면으로 비추지 않게 합니다.",
        ],
      },
      {
        heading: "설정은 설치할 때 한 번만",
        body: "추적 범위 같은 설정은 설치할 때 한 번 잡아 두면, 평소 수업에서는 따로 만질 일이 거의 없습니다.",
        steps: [
          "강사가 주로 다니는 범위와 화면에서 가릴 곳(프로젝터·전자칠판 등)을 설치할 때 지정해 둡니다.",
          "수업 중에는 전체 화면과 확대 화면이 알아서 전환되므로 교사가 조작할 필요가 없습니다.",
          "네트워크 연결과 자세한 설치 순서는 '웹캠 네트워크 + CMS 카메라 세팅' 문서를 참고하세요.",
        ],
      },
    ],
    resources: [
      {
        label: "Classin 하드웨어 소개",
        href: "/product/hw",
        description: "제품 소개 페이지에서 보드·카메라·마이크 구성과 도입 흐름을 함께 확인할 수 있습니다.",
      },
    ],
    relatedSlugs: ["board-ai-camera-mic", "webcam-cms-setup-t1-panorama", "board-install-readiness", "mic-dt2-pro"],
  },
  {
    slug: "classin-607-update",
    category: "teacher",
    title: "Classin 6.0.7 업데이트 안내",
    description: "확장형 판서 영역, 매직펜, 개인 칠판 개선, 신규 사용자 온보딩과 스타터 가이드까지 Classin 6.0.7의 주요 변경 사항을 정리했습니다.",
    audience: "학원 관리자, 교사, 운영팀",
    updatedAt: "2026-05-19",
    readMinutes: 7,
    featured: true,
    tags: ["업데이트", "6.0.7", "수업 도구", "판서", "온보딩"],
    keywords: [
      "Classin 6.0.7",
      "클래스인 업데이트",
      "확장형 판서 영역",
      "매직펜",
      "개인 칠판",
      "edb 삽입",
      "스타터 가이드",
      "Plus 1개월",
      "신규 사용자 가이드",
    ],
    chatbotSummary: "Classin 6.0.7은 2026년 5월 18일 그레이 배포, 2026년 5월 25일 정식 배포 예정인 비강제 업데이트입니다. 확장형 판서 영역과 매직펜은 기본 활성화되며, 개인 칠판 무제한 참여와 .edb 삽입은 6.0.7 이상 업데이트 후 담당 매니저를 통한 활성화 신청이 필요합니다. 신규 사용자 온보딩과 스타터 가이드 완료 시 Plus 1개월 혜택도 제공됩니다.",
    sections: [
      {
        heading: "배포 일정과 적용 범위",
        body: "6.0.7은 수업 중 판서 흐름을 끊지 않도록 돕는 수업 도구 개선과, 처음 사용하는 사용자가 더 쉽게 시작하도록 돕는 온보딩 개편을 함께 담은 업데이트입니다.",
        steps: [
          "그레이 배포일은 2026년 5월 18일입니다.",
          "정식 배포일은 2026년 5월 25일 예정입니다.",
          "6.0.6과 동일하게 별도 알림 없는 비강제 업데이트이며, 사용자에게 강제 업데이트 팝업이 뜨지 않습니다.",
          "주요 적용 플랫폼은 Android, iOS, PC, Classin X입니다.",
          "일부 기능은 기본 비활성화 상태이므로 사용을 원하는 고객사는 담당 매니저에게 활성화를 요청해야 합니다.",
        ],
      },
      {
        heading: "이번 업데이트 한눈에 보기",
        body: "이번 업데이트는 수업 도구 개선 4가지와 신규 사용자 첫 경험 개편 1가지로 나뉩니다.",
        steps: [
          "확장형 판서 영역: Android, iOS, PC, Classin X에서 기본 활성화됩니다.",
          "매직펜: Android, iOS, PC, Classin X에서 기본 활성화됩니다.",
          "개인 칠판 인원 제한 해제: Android, iOS, PC, Classin X에서 지원되며 기본 비활성화 상태입니다.",
          "개인 칠판에 .edb 파일 삽입: PC와 Classin X에서 지원되며 기본 비활성화 상태입니다.",
          "신규 사용자 가이드와 스타터 가이드: Android, iOS, PC, Classin X에서 기본 활성화됩니다.",
        ],
      },
      {
        heading: "확장형 판서 영역",
        body: "판서 공간이 부족할 때 화면을 넘기기보다 현재 판서 내용을 아래로 밀어 새 공간을 만들 수 있습니다. 수업 흐름을 유지한 채 칠판을 더 넓게 쓰는 기능입니다.",
        steps: [
          "수업 중 칠판 판서 영역이 가득 차면 마우스 우클릭으로 가로선을 표시합니다.",
          "선을 아래로 드래그하면 새 판서 영역이 추가됩니다.",
          "선을 위로 드래그하면 이미 판서한 내용을 위로 끌어올릴 수 있습니다.",
          "최대 50페이지 판서 제한은 그대로 적용됩니다.",
          "별도 신청 없이 기본 활성화됩니다.",
        ],
        media: [
          {
            type: "image",
            src: `${CLASSIN_607_MEDIA_BASE}/expandable-writing-space.png`,
            alt: "확장형 판서 영역 예시 화면",
            caption: "판서 영역을 아래로 확장해 새 공간을 만드는 예시입니다.",
            width: 2880,
            height: 1704,
          },
          {
            type: "video",
            src: `${CLASSIN_607_MEDIA_BASE}/expandable-writing-space-demo.mp4`,
            alt: "확장형 판서 영역 시연 영상",
            caption: "확장형 판서 영역 사용 흐름입니다.",
          },
        ],
      },
      {
        heading: "매직펜",
        body: "매직펜은 학생의 시선을 잠깐 유도할 때 쓰는 신규 펜 도구입니다. 작성한 획이 1초 후 자동으로 사라지므로 기존 칠판 내용을 지우거나 가리지 않고 핵심을 짚을 수 있습니다.",
        steps: [
          "도구 모음에서 매직펜을 선택합니다.",
          "강조하고 싶은 위치나 풀이 흐름을 짧게 표시합니다.",
          "필기를 멈추면 1초 후 획이 자동으로 사라집니다.",
          "기존 칠판 내용에는 영향을 주지 않습니다.",
          "정답을 미리 노출하지 않고 특정 위치만 안내할 때 유용합니다.",
        ],
        media: [
          {
            type: "image",
            src: `${CLASSIN_607_MEDIA_BASE}/magic-pen.png`,
            alt: "매직펜 도구 예시 화면",
            caption: "매직펜은 흔적을 남기지 않는 임시 강조 도구입니다.",
            width: 421,
            height: 810,
          },
          {
            type: "video",
            src: `${CLASSIN_607_MEDIA_BASE}/magic-pen-demo.mp4`,
            alt: "매직펜 시연 영상",
            caption: "매직펜으로 표시한 획이 자동으로 사라지는 흐름입니다.",
          },
        ],
      },
      {
        heading: "개인 칠판 인원 제한 해제",
        body: "기존에는 개인 칠판에 최대 75명까지 동시 참여할 수 있었지만, 6.0.7에서는 제한을 제거해 교실 내 모든 인원이 함께 협업할 수 있습니다.",
        steps: [
          "교사와 학생 모두 6.0.7 이상으로 업데이트되어 있어야 합니다.",
          "Android, iOS, PC, Classin X에서 지원됩니다.",
          "이 기능은 기본 비활성화 상태입니다.",
          "사용을 원하는 고객사는 클래스인 코리아 담당 매니저에게 활성화 신청을 요청해야 합니다.",
        ],
      },
      {
        heading: "개인 칠판에 .edb 파일 삽입",
        body: "교사가 로컬 칠판이나 수업 준비실에서 만든 개인 칠판 내용을 .edb 파일로 저장한 뒤, 온라인 수업 중 개인 칠판에 바로 삽입할 수 있습니다.",
        steps: [
          "교사와 학생 모두 6.0.7 이상으로 업데이트되어 있어야 합니다.",
          "PC와 Classin X에서 지원되며 모바일에서는 지원되지 않습니다.",
          "이 기능은 기본 비활성화 상태입니다.",
          "사용을 원하는 고객사는 클래스인 코리아 담당 매니저에게 활성화 신청을 요청해야 합니다.",
        ],
        media: [
          {
            type: "image",
            src: `${CLASSIN_607_MEDIA_BASE}/edb-personal-whiteboard.png`,
            alt: "개인 칠판에 edb 파일을 삽입하는 예시 화면",
            caption: "저장해 둔 .edb 판서 파일을 개인 칠판에 삽입할 수 있습니다.",
            width: 1376,
            height: 775,
          },
        ],
      },
      {
        heading: "신규 사용자 가이드와 스타터 가이드",
        body: "처음 클래스인을 켜는 사용자는 역할에 맞는 단계별 온보딩 안내와 핵심 기능을 빠르게 익히는 스타터 가이드를 보게 됩니다. 스타터 가이드를 완료하면 개인 Plus 요금제 1개월 혜택이 제공되며, 한국 고객사에도 적용됩니다.",
        steps: [
          "신규 사용자는 첫 로그인 시 역할에 맞는 안내를 받습니다.",
          "관리자는 기관 운영에 필요한 초기 설정과 할 일 영역을 확인합니다.",
          "교사는 가상 학생이 있는 체험 교실에서 수업 도구를 연습합니다.",
          "학생은 코스 확인, 수업 입장, 과제 제출, 공지 확인 흐름을 안내받습니다.",
          "스타터 가이드 완료 시 개인 Plus 요금제 1개월 혜택이 지급됩니다.",
        ],
      },
      {
        heading: "관리자 온보딩 변화",
        body: "관리자는 첫 로그인 시 기관 역할을 선택한 뒤 환영 배너와 핵심 기능 가이드를 거쳐 메인 홈으로 이동합니다. 할 일 영역에서 스타터 가이드 진행 상황을 확인하고, 코스 생성과 자료·권한 관리 등 기관 운영 항목을 차례로 점검할 수 있습니다.",
        media: [
          {
            type: "image",
            src: `${CLASSIN_607_MEDIA_BASE}/onboarding-admin-1.png`,
            alt: "관리자 온보딩 첫 화면 예시",
            width: 1356,
            height: 756,
          },
          {
            type: "image",
            src: `${CLASSIN_607_MEDIA_BASE}/onboarding-admin-2.png`,
            alt: "관리자 스타터 가이드 진행 화면 예시",
            width: 1356,
            height: 757,
          },
        ],
      },
      {
        heading: "교사 온보딩 변화",
        body: "교사는 첫 로그인 시 교사 역할을 선택하면 실제 수업 환경을 미리 체험하는 가이드로 안내됩니다. 데모 학생 3명이 미리 입장한 체험 교실에서 전자칠판 판서, 인터랙티브 교구, 수업 자료 불러오기를 연습할 수 있습니다.",
        steps: [
          "데모 교실 체험, 코스 생성, 수업 생성, 학생 초대, 수업 1회 진행 흐름을 따라갑니다.",
          "혼자서는 확인하기 어려운 발언 요청과 상호작용 기능을 데모 학생으로 연습할 수 있습니다.",
          "스타터 가이드 완료 시 개인 Plus 요금제 1개월 혜택이 지급됩니다.",
        ],
        media: [
          {
            type: "image",
            src: `${CLASSIN_607_MEDIA_BASE}/onboarding-teacher-1.png`,
            alt: "교사 온보딩 체험 교실 예시",
            width: 1356,
            height: 756,
          },
          {
            type: "image",
            src: `${CLASSIN_607_MEDIA_BASE}/onboarding-teacher-2.png`,
            alt: "교사 스타터 가이드 예시",
            width: 1920,
            height: 1080,
          },
        ],
      },
      {
        heading: "학생 온보딩 변화",
        body: "학생은 첫 로그인 시 학생 역할을 선택하면 학습에 필요한 기본 화면을 안내받습니다. 가입한 코스 확인, 수업 입장, 과제 제출, 교사 공지 확인 방법을 중심으로 첫 사용 흐름이 정리됩니다.",
        steps: [
          "역할 선택 후 환영 배너를 거쳐 메인 홈으로 이동합니다.",
          "가입한 코스가 있다면 수업 입장과 학습 활동 흐름을 안내받습니다.",
          "가입한 코스가 없으면 홈에서 코스 생성 또는 참여 경로를 확인합니다.",
        ],
        media: [
          {
            type: "image",
            src: `${CLASSIN_607_MEDIA_BASE}/onboarding-student-1.png`,
            alt: "학생 온보딩 홈 화면 예시",
            width: 1356,
            height: 756,
          },
          {
            type: "image",
            src: `${CLASSIN_607_MEDIA_BASE}/onboarding-student-2.png`,
            alt: "학생 스타터 가이드 예시",
            width: 1356,
            height: 756,
          },
        ],
      },
    ],
    relatedSlugs: ["classroom-basic-setup", "course-units", "teacher-onboarding", "student-onboarding"],
  },
  {
    slug: "pc-install",
    category: "start",
    title: "PC 설치 (윈도우, 맥)",
    description: "수업을 진행하거나 참여할 PC(윈도우/맥)에 클래스인을 설치하는 방법을 안내합니다. 공식 홈페이지 다운로드 페이지에서 OS와 칩셋에 맞는 설치 파일을 받아 실행하면 됩니다.",
    audience: "신규 학생, 학부모, 교사",
    updatedAt: "2026-06-17",
    readMinutes: 2,
    featured: true,
    tags: ["설치", "PC", "윈도우", "맥", "리눅스", "시작하기"],
    keywords: ["클래스인 설치", "PC 설치", "윈도우 설치", "맥 설치", "리눅스 설치", "Apple Silicon", "Intel 칩", "x86_64", "arm", "32비트", "64비트", "ClassIn X", "다운로드", "설치 파일"],
    chatbotSummary: "클래스인 공식 홈페이지의 다운로드 페이지에서 윈도우(7 이상·32/64비트)·맥(Intel·Apple Silicon)·리눅스(x86_64·arm)용 설치 파일을 내려받아 실행하면 PC 설치가 완료됩니다. 맥은 사용 중인 칩에 맞는 버전을 선택하세요.",
    sections: [
      {
        heading: "설치 개요",
        body: "수업을 진행, 혹은 참여하실 기기에 클래스인을 설치해 주세요. 클래스인 설치는 공식 홈페이지를 통해 쉽고 빠르게 다운로드를 진행하실 수 있습니다.",
      },
      {
        heading: "윈도우 버전 (Windows)",
        body: "공식 홈페이지의 다운로드 페이지에서 윈도우용 설치 파일을 받아 실행하면 간단히 설치가 완료됩니다. Windows 7 이상에서 사용할 수 있으며, 32비트·64비트 설치 파일을 모두 제공합니다.",
        steps: [
          "공식 홈페이지 - [다운로드] 메뉴로 이동합니다.",
          "Windows용 클래스인 [다운로드] 버튼을 클릭하여 설치 파일을 내려받습니다.",
          "다운로드한 설치 파일을 실행하여 클래스인 설치를 완료합니다.",
        ],
      },
      {
        heading: "맥 버전 (Mac)",
        body: "설치 파일 다운로드 전, 사용하시는 기기의 칩(Chip) 버전을 확인해 주세요. Intel 칩 사용 시에는 인텔 프로세서 버전을, M1 혹은 M2 칩 사용 시에는 Apple Silicon 버전을 다운로드해야 합니다.",
        steps: [
          "맥의 [이 Mac에 관하여]에서 사용 중인 칩(Intel / Apple Silicon)을 확인합니다.",
          "공식 홈페이지 다운로드 페이지에서 칩에 맞는 맥용 설치 파일을 내려받습니다. (Intel → 인텔 프로세서 버전, M1·M2 → Apple Silicon 버전)",
          "다운로드한 설치 파일을 실행하여 클래스인 설치를 완료합니다.",
        ],
      },
      {
        heading: "리눅스 버전 (Linux)",
        body: "Linux 데스크톱 사용자도 공식 다운로드 페이지에서 Linux용 클래스인을 받을 수 있습니다. x86_64와 arm 아키텍처를 지원합니다.",
        steps: [
          "공식 홈페이지 - [다운로드] 메뉴로 이동합니다.",
          "Linux용 클래스인에서 사용 중인 아키텍처(x86_64 / arm)에 맞는 파일을 내려받습니다.",
          "내려받은 파일을 실행하여 클래스인 설치를 완료합니다.",
        ],
      },
    ],
    resources: [
      {
        label: "클래스인 공식 다운로드 페이지",
        href: "https://www.classin.com/kr/download/",
        description: "윈도우(7 이상·32/64비트), 맥(Intel·Apple Silicon), 리눅스(x86_64·arm) 설치 파일을 받을 수 있는 공식 다운로드 페이지입니다. 화상수업 보조 앱 ClassIn X·CamIn도 같은 페이지에서 받을 수 있습니다.",
      },
    ],
    relatedSlugs: ["mobile-install", "signup"],
  },
  {
    slug: "mobile-install",
    category: "start",
    title: "모바일 설치 (안드로이드·iOS)",
    description: "안드로이드와 iOS 모바일 기기에 클래스인 앱을 설치하는 방법을 안내합니다. 구글 플레이 또는 앱 스토어에서 '클래스인(Classin)'을 검색해 설치하세요.",
    audience: "신규 학생, 학부모, 교사",
    updatedAt: "2026-06-17",
    readMinutes: 2,
    tags: ["설치", "모바일", "안드로이드", "iOS", "시작하기"],
    keywords: ["클래스인 모바일", "안드로이드 설치", "iOS 설치", "앱 스토어", "App Store", "구글 플레이", "Google Play", "Classin 앱", "다운로드"],
    chatbotSummary: "안드로이드는 구글 플레이, iOS는 앱 스토어에서 '클래스인(Classin)'을 검색해 [설치] 후 [열기] 버튼으로 실행하면 모바일 설치가 완료됩니다. 공식 다운로드 페이지에서 각 스토어 바로가기도 제공합니다.",
    sections: [
      {
        heading: "설치 개요",
        body: "앱 스토어(App Store), 혹은 구글 플레이(Google Play)를 통해 쉽고 빠르게 다운로드를 진행하실 수 있습니다.",
      },
      {
        heading: "Android 설치",
        body: "안드로이드 기기에서는 구글 플레이 스토어를 통해 클래스인을 설치합니다.",
        steps: [
          "플레이 스토어를 실행합니다.",
          "검색창에서 '클래스인(Classin)'을 검색한 후 [설치] 버튼을 클릭합니다.",
          "설치가 완료되면 [열기] 버튼을 클릭하여 앱을 실행합니다.",
        ],
      },
      {
        heading: "iOS 설치",
        body: "iOS 기기에서는 앱 스토어를 통해 클래스인을 설치합니다.",
        steps: [
          "앱 스토어를 실행합니다.",
          "검색창에서 '클래스인(Classin)'을 검색한 후 [설치] 버튼을 클릭합니다.",
          "설치가 완료되면 [열기] 버튼을 클릭하여 앱을 실행합니다.",
        ],
      },
    ],
    resources: [
      {
        label: "App Store — 클래스인 (iOS)",
        href: "https://apps.apple.com/kr/app/classin/id1226361488",
        description: "iPhone·iPad용 클래스인 앱 스토어 페이지입니다.",
      },
      {
        label: "Google Play — 클래스인 (Android)",
        href: "https://play.google.com/store/apps/details?id=cn.eeo.classin",
        description: "안드로이드용 클래스인 구글 플레이 페이지입니다.",
      },
      {
        label: "클래스인 공식 다운로드 페이지",
        href: "https://www.classin.com/kr/download/",
        description: "PC(윈도우·맥·리눅스)와 모바일 등 모든 플랫폼 설치 경로를 안내하는 공식 페이지입니다.",
      },
    ],
    relatedSlugs: ["pc-install", "signup"],
  },
  {
    slug: "signup",
    category: "start",
    title: "회원 가입",
    description: "클래스인의 모든 서비스를 시작하기 위해 필요한 회원 가입 절차를 PC와 모바일 환경별로 안내합니다. 이메일 또는 휴대폰 번호로 인증 후 비밀번호와 프로필을 설정합니다.",
    audience: "신규 학생, 학부모, 교사",
    updatedAt: "2026-05-14",
    readMinutes: 3,
    tags: ["회원가입", "계정", "인증", "프로필", "시작하기"],
    keywords: ["클래스인 회원가입", "회원 가입", "이메일 가입", "휴대폰 인증", "인증코드", "프로필 설정", "닉네임"],
    chatbotSummary: "클래스인 앱을 실행해 [회원 가입] 버튼을 누르고, 이메일 또는 휴대폰 번호로 인증코드를 받아 비밀번호를 설정하면 가입이 완료됩니다. 첫 로그인 시 닉네임 등 프로필을 설정해 주세요.",
    sections: [
      {
        heading: "회원 가입 개요",
        body: "모든 서비스의 시작은 회원 가입부터. 먼저 회원 가입을 진행해 볼까요? 클래스인은 PC와 모바일에서 동일하게 회원 가입을 진행할 수 있습니다.",
      },
      {
        heading: "1단계: 클래스인 실행",
        body: "PC와 모바일 환경에 따라 클래스인을 실행하고 회원 가입 버튼을 눌러 가입 화면으로 진입합니다.",
        steps: [
          "PC(윈도우·맥)에서는 Classin 아이콘을 더블 클릭하여 프로그램을 실행합니다.",
          "PC 첫 화면 하단의 [회원 가입] 버튼을 클릭합니다.",
          "모바일(Android·iOS)에서는 Classin 아이콘을 터치하여 앱을 실행합니다.",
          "모바일 첫 화면 우측 상단의 [회원 가입] 버튼을 클릭합니다.",
        ],
      },
      {
        heading: "2단계: 회원 가입 진행",
        body: "이메일 혹은 휴대폰 번호(해외 번호 가능)를 사용하여 진행할 수 있습니다.",
        steps: [
          "가입 방식으로 이메일 또는 전화번호를 선택합니다.",
          "선택한 이메일 또는 휴대폰 번호로 인증코드를 받아 입력합니다.",
          "사용할 비밀번호를 설정합니다.",
        ],
      },
      {
        heading: "3단계: 회원 가입 확인 및 프로필 설정",
        body: "가입이 완료되면 자동으로 로그인되며, 첫 로그인 시 닉네임 등 기본 프로필을 설정합니다.",
        steps: [
          "회원 가입이 정상적으로 완료되어 로그인이 되었는지 확인합니다.",
          "첫 로그인 시 안내되는 화면에서 닉네임 등 프로필 정보를 설정합니다.",
        ],
      },
    ],
    relatedSlugs: ["pc-install", "password-change-pc"],
  },
  {
    slug: "password-change-pc",
    category: "start",
    title: "비밀번호 변경 (PC)",
    description: "PC 클래스인에서 비밀번호를 잊었거나 변경하려는 경우의 절차를 안내합니다. 아이디로 인증코드를 받아 새 비밀번호를 설정한 뒤 다시 로그인하여 확인합니다.",
    audience: "기존 PC 사용자(학생, 학부모, 교사)",
    updatedAt: "2026-05-14",
    readMinutes: 2,
    tags: ["비밀번호", "계정", "PC", "보안", "시작하기"],
    keywords: ["비밀번호 변경", "비밀번호 재설정", "PC", "인증코드", "자동 로그인", "비밀번호 기억", "로그인"],
    chatbotSummary: "PC 클래스인 로그인 화면 하단의 [비밀번호 변경]을 눌러 아이디(이메일/휴대폰)로 인증코드를 받고 새 비밀번호를 설정한 뒤, 변경된 비밀번호로 다시 로그인하면 됩니다.",
    sections: [
      {
        heading: "변경 개요",
        body: "비밀번호를 잊으셨거나, 변경을 원하신다면 하단의 단계대로 진행해 보세요.",
      },
      {
        heading: "1단계: 프로그램 실행",
        body: "클래스인 실행 후 하단의 [비밀번호 변경]을 클릭해 주세요.",
        steps: [
          "PC에서 클래스인을 실행합니다.",
          "로그인 화면 하단의 [비밀번호 변경] 버튼을 클릭합니다.",
        ],
      },
      {
        heading: "2단계: 인증코드 발송 및 신규 비밀번호 설정",
        body: "나의 아이디(핸드폰 번호 혹은 이메일 주소) 입력 후 [인증코드 받기]를 클릭해 주세요. 문자 메세지, 혹은 이메일로 전달받은 인증코드를 입력 후 새로운 비밀번호를 입력해 주세요. 참고로 인증코드 수신이 어려운 경우, 클래스인 공식 홈페이지 하단의 채팅을 통해 인증 코드를 요청할 수 있습니다.",
        steps: [
          "나의 아이디(핸드폰 번호 혹은 이메일 주소)를 입력합니다.",
          "[인증코드 받기] 버튼을 클릭합니다.",
          "문자 메시지 또는 이메일로 받은 인증코드를 입력합니다.",
          "새로 사용할 비밀번호를 입력하여 변경을 완료합니다.",
          "인증코드 수신이 어렵다면 클래스인 공식 홈페이지 하단의 채팅을 통해 인증 코드를 요청합니다.",
        ],
      },
      {
        heading: "3단계: 로그인하여 변경된 비밀번호 확인",
        body: "변경된 비밀번호로 다시 한 번 로그인을 시도해 주세요. 로그인 시 [자동 로그인] 혹은 [비밀번호 기억] 옵션을 클릭한 후 로그인하시면, 이후 더 편하게 클래스인을 사용할 수 있습니다.",
        steps: [
          "변경된 비밀번호로 클래스인에 다시 로그인합니다.",
          "필요 시 [자동 로그인] 또는 [비밀번호 기억] 옵션을 체크하여 다음 접속을 편리하게 설정합니다.",
        ],
      },
    ],
    resources: [
      {
        label: "클래스인 공식 홈페이지",
        href: "https://www.classin.com/kr",
        description: "인증코드 수신이 어려울 때 하단 채팅으로 문의할 수 있는 공식 홈페이지입니다.",
      },
    ],
    relatedSlugs: ["password-change-mobile", "signup"],
  },
  {
    slug: "password-change-mobile",
    category: "start",
    title: "비밀번호 변경 (모바일)",
    description: "모바일 클래스인에서 비밀번호를 잊었거나 변경하려는 경우의 절차를 안내합니다. [비밀번호를 잊으셨나요?]를 통해 인증코드를 받아 새 비밀번호를 설정한 뒤 약관 동의 후 로그인합니다.",
    audience: "기존 모바일 사용자(학생, 학부모, 교사)",
    updatedAt: "2026-05-14",
    readMinutes: 2,
    tags: ["비밀번호", "계정", "모바일", "보안", "시작하기"],
    keywords: ["비밀번호 변경", "모바일 비밀번호", "비밀번호 잊음", "인증코드", "약관 동의", "재로그인", "Classin"],
    chatbotSummary: "모바일 클래스인 로그인 화면 하단의 [비밀번호를 잊으셨나요?]를 눌러 아이디(이메일/휴대폰)로 인증코드를 받고 새 비밀번호를 설정한 뒤, [약관 동의]를 체크하고 다시 로그인하면 됩니다.",
    sections: [
      {
        heading: "변경 개요",
        body: "비밀번호를 잊으셨거나, 변경을 원하신다면 하단의 단계대로 진행해 보세요.",
      },
      {
        heading: "1단계: 프로그램 실행",
        body: "클래스인 실행 후 하단의 [비밀번호를 잊으셨나요?]를 클릭해 주세요.",
        steps: [
          "모바일에서 클래스인을 실행합니다.",
          "로그인 화면 하단의 [비밀번호를 잊으셨나요?] 버튼을 클릭합니다.",
        ],
      },
      {
        heading: "2단계: 인증코드 발송 및 신규 비밀번호 설정",
        body: "나의 아이디(핸드폰 번호 혹은 이메일 주소) 입력 후 [인증코드 받기]를 클릭해 주세요. 문자 메세지, 혹은 이메일로 전달받은 인증코드를 입력 후 새로운 비밀번호를 입력해 주세요.",
        steps: [
          "나의 아이디(핸드폰 번호 혹은 이메일 주소)를 입력합니다.",
          "[인증코드 받기] 버튼을 클릭합니다.",
          "문자 메시지 또는 이메일로 받은 인증코드를 입력합니다.",
          "새로 사용할 비밀번호를 입력하여 변경을 완료합니다.",
        ],
      },
      {
        heading: "3단계: 로그인하여 변경된 비밀번호 확인",
        body: "비밀번호가 변경되었는지 확인하시려면, 변경된 비밀번호로 다시 한 번 로그인을 시도해 주세요. 모바일 기기에 한해 비밀번호 하단의 [약관 동의]를 체크해야 로그인이 가능합니다.",
        steps: [
          "변경된 비밀번호로 모바일 클래스인에 다시 로그인합니다.",
          "비밀번호 입력 하단의 [약관 동의] 항목을 체크합니다.",
          "로그인 버튼을 눌러 정상 로그인 여부를 확인합니다.",
        ],
      },
    ],
    relatedSlugs: ["password-change-pc", "mobile-install"],
  },
  {
    slug: "admin-operation-standardization",
    category: "admin",
    title: "관리자 운영 표준화 간이 가이드",
    description: "Classin을 단순 수업 도구가 아니라 기관 운영 시스템으로 쓰기 위한 권한, 보안, 수업 전·중·후 관리, EDB, 데이터 연동 기준을 정리했습니다.",
    audience: "학원 관리자, 운영팀, 지점장, 도입 담당자",
    updatedAt: "2026-06-16",
    readMinutes: 9,
    featured: true,
    tags: ["관리자", "운영 표준화", "권한 관리", "수업 전중후", "EDB", "API", "데이터화"],
    keywords: [
      "관리자 운영",
      "관리자 콘솔",
      "관리자 대시보드",
      "기관 관리",
      "스토리지",
      "학습 관리",
      "라이브&플레이백",
      "관리자 기능",
      "계정 정보",
      "API 도킹",
      "API 활성화",
      "자체 관리 시스템",
      "기관 시스템화",
      "권한 보안",
      "수업 전중후",
      "자동 녹화",
      "다시보기",
      "숙제 시험",
      "EDB 템플릿",
      "API 연동",
      "교육 데이터",
      "AI 시대",
    ],
    chatbotSummary: "관리자 운영 표준화 가이드는 Classin을 기관 운영 시스템으로 도입하기 위한 간이 기준입니다. 관리자 콘솔은 기관 관리, 스토리지, 학습 관리, 관리자 기능, 결제, 계정 정보로 나뉘며 홈에서 계정 잔액·서비스 버전·코스·교사·학생 현황을 확인합니다. API 기능이 활성화된 기관은 관리자 콘솔에서 코스·수업·교사·학생을 직접 만들어도 자체 관리 시스템과 자동 동기화되지 않을 수 있으므로, 연동 기준에 맞춰 자체 관리 시스템에서 생성해야 합니다.",
    sections: [
      {
        heading: "이 가이드가 필요한 경우",
        body: "Classin을 처음 도입할 때는 기능을 하나씩 익히는 것보다 기관의 운영 기준을 먼저 정하는 것이 중요합니다. 수업 개설, 교사 권한, 학생 접근, 자료 관리, 녹화와 다시보기, 숙제와 시험, 소통 기준을 처음부터 같은 방식으로 잡아두면 이후 수업 품질을 더 안정적으로 관리할 수 있습니다.",
        steps: [
          "선생님마다 수업 운영 방식이 달라 관리가 어려운 경우",
          "수업 자료, 녹화본, 숙제, 시험, 피드백이 여러 도구에 흩어지는 경우",
          "퇴사자, 대체 강사, 신규 강사 발생 시 수업 인수인계가 흔들리는 경우",
          "기관 공지와 수업 질문이 외부 메신저에서 섞여 누락이 생기는 경우",
          "AI 분석과 리포트에 활용할 수 있는 수업 데이터를 쌓고 싶은 경우",
        ],
      },
      {
        heading: "관리자가 먼저 설계할 운영 구조",
        body: "초기 세팅은 단순한 계정 생성이 아니라 기관의 운영 기준을 Classin 안에 반영하는 과정입니다. 반 이름, 코스 구조, 수업명, 교사 배정, 자료 저장 위치, 녹화 정책, 다시보기 제공 기준을 먼저 정해두면 운영팀과 교사가 같은 기준으로 움직일 수 있습니다.",
        steps: [
          "반과 코스는 학년, 레벨, 과목, 지점 기준 중 무엇을 우선할지 정합니다.",
          "수업명은 날짜, 과목, 레벨, 담당 교사를 포함해 검색 가능한 규칙으로 만듭니다.",
          "교사 권한은 담당 반과 필요한 자료 범위 중심으로 부여합니다.",
          "수업 자료와 녹화본은 개인 저장공간이 아니라 기관 기준의 저장 위치를 사용합니다.",
          "숙제, 시험, 다시보기 제공 기준은 반별로 다르게 두기보다 공통 운영 기준을 먼저 만듭니다.",
        ],
      },
      {
        heading: "관리자 콘솔에서 확인한 메뉴 구조",
        body: "웹 관리자 콘솔은 앱 안의 코스 화면과 역할이 다릅니다. 앱은 강사가 수업과 학습 활동을 운영하는 공간이고, 관리자 콘솔은 기관 전체의 계정, 코스, 수업, 스토리지, 데이터, 결제, 권한을 관리하는 공간입니다.",
        steps: [
          "홈: 계정 잔액, 서비스 버전, 서비스 기간, 진행 중인 코스, 교사 수, 학생 수, 공지사항을 확인합니다.",
          "기관 관리: 코스 관리, 수업 관리, 공개 수업, 교사, 학생을 관리합니다.",
          "스토리지: 데이터 개요, 공유 드라이브, 문제 은행, 수업 리소스, 코스 데이터, 리소스 센터를 확인합니다.",
          "학습 관리: 라이브&플레이백, 학습 데이터, 교사 개발, 숙제 관리, 시험 관리를 확인합니다.",
          "관리자 기능: 수업 모니터링과 사용자 정보를 확인합니다.",
          "결제: 결제 개요, 주문 세부정보, 통계 다운로드, 영수증 관리를 확인합니다.",
          "계정 정보: 인증 자료, 일반 설정, 통계 이력, 권한 관리, API 도킹, 학습 인원 구성, 제품 설명서를 확인합니다.",
        ],
      },
      {
        heading: "권한과 보안으로 리스크 줄이기",
        body: "기관 운영에서 가장 큰 리스크는 수업 권한과 자료가 개인에게 흩어지는 것입니다. 개인 계정, 임시 링크, 외부 메신저, 개인 드라이브 중심으로 운영하면 퇴사, 대체 강사, 학생 접근 오류, 자료 유실 상황에서 기관이 통제하기 어렵습니다.",
        steps: [
          "관리자 계정과 교사 계정의 역할을 분리하고 관리자 권한은 소수 인원에게만 부여합니다.",
          "교사는 담당 코스와 필요한 자료에만 접근하도록 권한 범위를 제한합니다.",
          "학생은 본인이 소속된 반과 수업에만 접근할 수 있도록 점검합니다.",
          "퇴사자 또는 대체 강사가 발생하면 계정 권한, 자료 접근, 담당 수업을 즉시 재정리합니다.",
          "녹화본, 수업 자료, 공유 드라이브 권한은 정기적으로 확인해 외부 공유 리스크를 줄입니다.",
        ],
      },
      {
        heading: "수업 전·중·후 운영 흐름",
        body: "Classin의 강점은 수업을 여는 기능 하나가 아니라 수업 전 준비, 수업 중 진행, 수업 후 복습과 평가를 하나의 흐름으로 연결할 수 있다는 점입니다. 관리자는 각 단계에서 무엇이 완료되어야 하는지 기준을 만들어야 합니다.",
        steps: [
          "수업 전: 수업 개설, 학생 배정, 자료 업로드, EDB 준비, 숙제와 시험 사전 세팅을 확인합니다.",
          "수업 중: 판서, 자료 공유, 참여 도구, 출석 확인, 자동 녹화 상태를 확인합니다.",
          "수업 후: 다시보기 제공, 수업 필기 저장과 공유, 숙제 제출, 시험 결과, 피드백 기록을 확인합니다.",
          "결석 학생은 다시보기 시청 여부와 보강 과제 제출 여부까지 함께 관리합니다.",
          "관리자는 수업 완료 여부만 보지 말고 수업 후 데이터가 남았는지까지 점검합니다.",
        ],
      },
      {
        heading: "EDB로 수업 템플릿 만들기",
        body: "EDB는 단순 자료 파일이 아니라 수업 흐름을 저장하고 재사용하는 템플릿 자산으로 운영해야 합니다. 우수 강사의 판서, 활동 구성, 문제 풀이 방식, 자료 배치를 EDB로 정리하면 신규 강사 온보딩과 지점별 수업 품질 표준화에 활용할 수 있습니다.",
        steps: [
          "과목, 레벨, 커리큘럼 단위로 반복 사용할 EDB 템플릿을 정합니다.",
          "우수 강사의 수업 자료, 판서 흐름, 활동 구성을 기관 표준 템플릿으로 정리합니다.",
          "신규 강사는 빈 화면에서 수업을 준비하기보다 기존 EDB를 기반으로 수업을 시작하게 합니다.",
          "시험 대비, 레벨테스트, 개념 설명, 토론형 수업처럼 목적별 EDB 라이브러리를 만듭니다.",
          "EDB는 정기적으로 업데이트하고 오래된 자료는 별도 보관 또는 폐기 기준을 적용합니다.",
        ],
      },
      {
        heading: "숙제·시험·다시보기 운영 기준",
        body: "수업 후 관리가 선생님의 기억이나 수작업에 의존하면 누락이 생기기 쉽습니다. 관리자 기준에서는 자동 녹화, 다시보기, 필기 저장, 숙제, 시험이 같은 운영 흐름 안에 들어와야 합니다.",
        steps: [
          "정규 수업은 자동 녹화 여부를 기본 점검 항목으로 둡니다.",
          "다시보기 제공 범위와 제공 기간을 반별 운영 정책으로 명확히 정합니다.",
          "수업 필기와 자료는 수업 후 학생이 복습할 수 있는 형태로 저장하고 공유합니다.",
          "숙제와 시험은 수업 후 따로 공지하기보다 수업 계획 단계에서 미리 세팅합니다.",
          "학부모 상담 전에는 출석, 다시보기, 숙제 제출, 시험 결과를 함께 확인합니다.",
        ],
      },
      {
        heading: "소통 공간을 이원화하는 기준",
        body: "기관 공지와 수업 질문이 같은 공간에 섞이면 중요한 안내가 묻히고 운영 이력이 남기 어렵습니다. 관리자는 공지형 소통과 학습형 소통을 분리해 정보 누락을 줄여야 합니다.",
        steps: [
          "기관 공지는 휴강, 보강, 일정, 결제, 정책 안내처럼 전체 운영 정보를 다룹니다.",
          "수업 소통은 질문, 숙제 피드백, 수업 자료 공유, 보강 안내처럼 학습 흐름에 집중합니다.",
          "학생 안내와 학부모 안내가 필요한 경우 문구와 전달 채널을 분리합니다.",
          "외부 메신저에만 남은 결정 사항은 Classin 운영 기록으로 옮겨 누락을 줄입니다.",
          "관리자는 반별 공지 전달 여부와 주요 소통 이력을 정기적으로 확인합니다.",
        ],
      },
      {
        heading: "API와 데이터 활용 방향",
        body: "Classin은 API 제공을 통해 독립적인 수업 도구를 넘어 기존 LMS, CRM, 학사관리, 데이터 분석 시스템과 연결되는 교육 인프라로 확장할 수 있습니다. 실제 연동 범위와 방식은 계약 조건과 공식 API 문서를 기준으로 확인해야 합니다.",
        steps: [
          "사용자, 교실, 자료, 수업 데이터 중 기관 시스템과 연결할 항목을 먼저 정의합니다.",
          "상담 CRM에는 출석, 결석, 숙제 미제출, 시험 결과 같은 상담용 데이터를 연결할 수 있습니다.",
          "학사관리 시스템에는 수업 일정, 반, 교사, 학생 정보를 연결하는 방향을 검토합니다.",
          "지점형 기관은 반별, 교사별, 지점별 운영 현황 대시보드 구축을 검토할 수 있습니다.",
          "AI 분석을 도입하려면 먼저 수업 운영이 표준화되고 데이터가 누락 없이 쌓이는 구조가 필요합니다.",
        ],
      },
      {
        heading: "API 활성화 기관의 생성 기준",
        body: "관리자 콘솔에 API 기능 활성화 알림이 표시되는 기관은 운영 기준을 특히 조심해야 합니다. 콘솔에서 코스, 수업, 교사, 학생을 새로 만들 수 있더라도 그 정보가 자체 관리 시스템과 자동으로 동기화된다고 가정하면 안 됩니다.",
        steps: [
          "자체 LMS, CRM, 학사관리 시스템과 Classin을 연동 중인지 먼저 확인합니다.",
          "연동 중인 기관은 코스, 수업, 교사, 학생 생성을 자체 관리 시스템에서 시작하는 것을 기본 원칙으로 둡니다.",
          "관리자 콘솔에서 직접 생성한 데이터가 자체 시스템으로 역동기화되는지 여부는 계약·API 설계 기준으로 확인합니다.",
          "운영팀과 강사는 어디에서 생성해야 하는지 기준을 공유해 중복 계정, 누락 수업, 데이터 불일치를 줄입니다.",
          "API 도킹 메뉴는 기능 존재 확인용으로만 설명하고, 실제 연동 범위와 인증 정보는 공식 문서와 담당자 확인을 따릅니다.",
        ],
      },
      {
        heading: "관리자 주간 점검표",
        body: "주간 점검은 문제를 찾기 위한 감시가 아니라 수업 품질을 일정하게 유지하는 운영 루틴입니다. 아래 항목을 같은 요일에 반복 확인하면 수업 운영의 빈틈을 빠르게 발견할 수 있습니다.",
        steps: [
          "이번 주 개설된 수업 수와 미진행 또는 취소 수업을 확인합니다.",
          "출석률이 낮은 반과 반복 결석 학생을 확인합니다.",
          "자동 녹화가 누락된 수업과 다시보기가 제공되지 않은 수업을 확인합니다.",
          "숙제 미세팅, 시험 미운영, 과제 미제출 학생을 확인합니다.",
          "EDB 사용률, 수업 자료 재사용률, 교사별 운영 편차를 확인합니다.",
          "권한 변경이 필요한 교사, 퇴사자, 대체 강사, 신규 강사 계정을 확인합니다.",
        ],
      },
    ],
    resources: [
      {
        label: "Classin 소프트웨어 소개",
        href: "/product/sw",
        description: "수업 도구, 학습 활동, LMS, AI, 데이터 기능의 전체 구성을 확인할 수 있습니다.",
      },
      {
        label: "ClassIn API 문서",
        href: "https://docs.classinpaas.com/api/en/introduction.html",
        description: "기관 시스템 연동을 검토할 때 공식 API 제공 범위와 인증 방식을 확인하세요.",
      },
    ],
    relatedSlugs: [
      "institution-settings",
      "course-creation",
      "storage-management",
      "web-live-playback",
      "class-monitoring",
      "statistics-data",
    ],
  },
  {
    slug: "academy-system-checklist",
    category: "admin",
    title: "사람이 바뀌어도 흔들리지 않는 학원 운영 체크리스트",
    description: "수업, 과제, 출결, 학부모 상담, 강사 인수인계까지 학원이 얼마나 시스템으로 운영되고 있는지 5개 영역으로 점검하는 가이드입니다.",
    audience: "학원 관리자, 운영팀, 지점장, 도입 담당자",
    updatedAt: "2026-06-02",
    readMinutes: 8,
    status: "review",
    visibility: "unlisted",
    noindex: true,
    docType: "guide",
    productArea: "admin",
    difficulty: "beginner",
    tags: ["운영 체크리스트", "학원 시스템화", "강사 인수인계", "학부모 상담"],
    keywords: ["학원 운영 체크리스트", "강사 교체", "수업 표준화", "과제 관리", "출결 관리", "학부모 상담", "원장 업무 자동화", "학원 시스템화"],
    chatbotSummary: "이 체크리스트는 학원이 강사 개인기나 원장 기억에 의존하지 않고 운영 기준으로 움직이는지 점검하는 가이드입니다. 수업 표준화, 출결·과제·복습, 학부모 커뮤니케이션, 강사 운영과 인수인계, 원장 업무 자동화의 5개 영역을 32문항으로 확인합니다.",
    sections: [
      {
        heading: "사용 방법",
        body: "각 문항에 대해 현재 학원 상태를 기준으로 체크하고, 체크한 개수로 운영 시스템화 수준을 판단합니다. 총 32점 만점이며, 그렇다는 1점, 아니다 또는 아직 불안정하다는 0점으로 계산합니다.",
        steps: [
          "원장, 운영팀, 강사가 같은 기준으로 각 문항을 읽습니다.",
          "현재 실제로 반복 운영되는 항목만 1점으로 체크합니다.",
          "담당자 한 명의 기억이나 임시 대응에 의존하는 항목은 0점으로 둡니다.",
          "영역별 낮은 점수를 Classin 도입 또는 운영 개선의 우선순위로 삼습니다.",
        ],
      },
      {
        heading: "1. 수업 표준화",
        body: "수업 품질이 특정 강사의 감각에만 묶여 있지 않은지 확인합니다.",
        steps: [
          "강사가 바뀌어도 같은 수업 흐름을 유지할 수 있다.",
          "수업 자료와 판서 자료가 강사 개인 PC가 아니라 학원 기준으로 관리된다.",
          "반별 진도, 과제, 복습 기준을 원장이나 운영팀이 확인할 수 있다.",
          "신규 강사가 들어와도 1주 안에 학원식 수업 기준을 파악할 수 있다.",
          "에이스 강사의 수업 방식이 다른 강사에게 전달 가능한 형태로 남아 있다.",
          "같은 교재를 쓰는 반 사이의 수업 품질 편차를 확인할 수 있다.",
        ],
      },
      {
        heading: "2. 출결, 과제, 복습 관리",
        body: "학생별 학습 흐름이 수업 이후까지 이어지는지 확인합니다.",
        steps: [
          "결석, 지각, 보강 대상 학생을 한눈에 확인할 수 있다.",
          "과제 미제출 학생이 자동으로 드러난다.",
          "복습이 필요한 학생을 수업 후 바로 구분할 수 있다.",
          "학생별 누적 학습 기록을 상담 전에 확인할 수 있다.",
          "수업 기록, 과제 기록, 복습 기록이 따로 흩어져 있지 않다.",
          "누락 학생을 원장님이 직접 기억해서 찾지 않아도 된다.",
        ],
      },
      {
        heading: "3. 학부모 커뮤니케이션",
        body: "상담과 안내가 강사의 기억이 아니라 기록을 바탕으로 이어지는지 확인합니다.",
        steps: [
          "학부모 상담이 강사의 기억이 아니라 기록을 바탕으로 진행된다.",
          "학부모에게 보여줄 수 있는 수업, 과제, 복습 데이터가 있다.",
          "반복되는 질문에 매번 새로 설명하지 않아도 된다.",
          "수업 후 피드백 또는 리포트 발송 기준이 정해져 있다.",
          "상담 이력이 다음 상담자에게 이어진다.",
          "불만이나 이탈 신호를 늦게 발견하지 않는다.",
        ],
      },
      {
        heading: "4. 강사 운영과 인수인계",
        body: "강사 교체, 대체 수업, 신규 온보딩이 운영 품질을 흔들지 않는지 확인합니다.",
        steps: [
          "강사별 수업 품질을 확인할 수 있는 기준이 있다.",
          "신규 강사 온보딩 자료가 구두 설명에만 의존하지 않는다.",
          "강사 퇴사 후에도 수업 자료와 학생 기록이 학원에 남는다.",
          "대체 강사가 들어와도 학생별 상황을 빠르게 파악할 수 있다.",
          "강사에게 반복 안내하는 운영 규칙이 문서나 시스템에 남아 있다.",
          "원장이 직접 개입하지 않아도 강사가 다음 액션을 확인할 수 있다.",
        ],
      },
      {
        heading: "5. 원장 업무 자동화",
        body: "원장이 직접 확인해야만 움직이는 일이 줄고 있는지 확인합니다.",
        steps: [
          "원장이 직접 확인해야만 진행되는 일이 줄고 있다.",
          "미처리 학생, 미제출 과제, 상담 필요 학생을 한 화면에서 볼 수 있다.",
          "학원 운영 데이터를 보고 다음 액션을 정할 수 있다.",
          "여러 도구에 흩어진 데이터를 손으로 합치지 않는다.",
          "수업 운영과 학부모 소통이 하나의 흐름으로 연결되어 있다.",
          "지점이나 반이 늘어나도 같은 기준을 적용할 수 있다.",
          "운영 개선이 감이 아니라 기록을 기준으로 논의된다.",
          "원장이 바쁜 날에도 기본 운영 품질이 유지된다.",
        ],
      },
      {
        heading: "점수 해석",
        body: "총점은 현재 운영 구조가 사람에게 기대는지, 시스템으로 반복되는지 판단하는 출발점입니다.",
        steps: [
          "0-10점: 개인기 의존형 학원입니다. 먼저 수업 기록, 과제 기준, 상담 이력부터 남기는 구조가 필요합니다.",
          "11-20점: 부분 자동화형 학원입니다. 각각의 기록을 학생 단위 흐름으로 연결해야 합니다.",
          "21-28점: 시스템 전환기 학원입니다. 강사 인수인계와 학부모 리포트까지 자동화하면 원장 의존도를 낮출 수 있습니다.",
          "29점 이상: 확장 준비형 학원입니다. 지점 확장, 강사 교체, 학부모 관리까지 더 안정적으로 가져갈 수 있는 단계입니다.",
        ],
      },
      {
        heading: "Classin으로 연결되는 지점",
        body: "체크리스트에서 낮게 나온 영역은 학원의 병목입니다. Classin은 수업, 출결, 과제, 복습 리포트, 학부모 커뮤니케이션을 하나의 흐름으로 연결해 강사 개인에게 의존하던 운영을 학원 기준으로 남기는 데 초점을 둡니다.",
      },
    ],
    relatedSlugs: [
      "admin-operation-standardization",
      "course-creation",
      "teacher-onboarding",
      "student-onboarding",
      "class-monitoring",
      "statistics-data",
    ],
  },
  {
    slug: "billing-upgrade",
    category: "admin",
    title: "유료 계정 전환",
    description: "무료 버전에서 프로 또는 비즈니스 요금제로 전환하여 클래스인을 본격적으로 사용하기 위한 절차를 안내합니다.",
    audience: "학원 관리자, 운영팀",
    updatedAt: "2026-05-14",
    readMinutes: 5,
    tags: ["요금제", "결제", "전환", "프로", "비즈니스"],
    keywords: ["유료 전환", "요금제 선택", "프로 요금제", "비즈니스 요금제", "결제", "플랜"],
    chatbotSummary: "무료로 시작한 클래스인을 학원 운영에 본격적으로 쓰기 위해 유료(프로/비즈니스) 계정으로 전환하는 절차입니다. 메인 관리자 계정 결정 → 운영 규모에 맞는 요금제 검토 → 학원 정보 입력 → 결제 순서로 진행하며, 전환 전 점검 체크리스트와 자주 하는 실수를 함께 안내합니다. 요금·할인 조건은 운영 규모와 시기에 따라 달라지므로 정확한 금액은 상담으로 확인하세요. 결제·세금계산서 등 정산 영역은 외부 회계/결제 시스템과 병행하는 것을 권장합니다.",
    sections: [
      {
        heading: "왜 유료 전환을 하는지부터 정리합니다",
        body: "클래스인은 전자칠판, EDB 교안, 자동 녹화, LMS(코스·출결·과제·성적), 학생관리, 관리자 운영 데이터를 하나의 수업 운영 흐름으로 묶는 수업 시스템 OS입니다. 무료 버전은 체험 용도라 수업 녹화·웹 라이브 같은 운영 핵심 기능이 제한됩니다. 유료 전환의 목적은 '기능을 더 켜는 것'이 아니라, 수업 전·중·후 운영을 한 흐름으로 돌려서 교사와 운영팀의 반복 업무를 줄이는 데 있습니다. 전환을 결정하기 전에 '우리 학원이 매주 반복으로 돌릴 수업 흐름이 무엇인지'를 먼저 정해 두면 요금제 선택과 도입 속도가 모두 빨라집니다.",
      },
      {
        heading: "전환 전에 확인할 체크리스트",
        body: "전환 자체는 몇 분이면 끝나지만, 메인 관리자 계정과 학원 정보는 한 번 정하면 바꾸기 번거롭습니다. 결제 버튼을 누르기 전에 아래를 먼저 점검하세요.",
        steps: [
          "메인 관리자 계정을 누구 명의로 할지 확정합니다. 로그인한 계정이 그대로 학원(기관)의 메인 관리자 계정이 되므로, 퇴사 가능성이 있는 개인보다 학원 공용 운영 계정을 권장합니다.",
          "운영 규모를 정리합니다. 강사 수, 동시 수업 수, 예상 학생 수를 적어 두면 요금제 검토와 상담이 빨라집니다.",
          "학원 정보(정확한 학원명, 비즈니스 범위, 소재지 국가/도시, 담당자)를 미리 준비합니다. 이후 계정 인증 자료와 일치해야 합니다.",
          "정확한 금액·할인·결제 주기는 상담으로 확인합니다. 운영 규모와 시기에 따라 조건이 달라지므로 화면에 보이는 숫자만으로 단정하지 마세요.",
          "세금계산서·정산 처리 방식을 회계 담당과 미리 맞춰 둡니다. 결제·정산은 클래스인 단독으로 끝내기보다 학원의 회계/결제 시스템과 병행하는 것이 안전합니다.",
        ],
      },
      {
        heading: "요금제를 고르는 기준",
        body: "요금제는 '기능 많은 쪽'이 아니라 '운영 구조'에 맞춰 고르는 것이 좋습니다. 혼자 수업하는지, 여러 강사·운영팀이 함께 쓰는지가 가장 큰 갈림길입니다. 정확한 가격과 포함 범위는 시점에 따라 달라질 수 있으므로 마지막에는 반드시 상담으로 확정하세요.",
        steps: [
          "1인 강사이고 본인이 수업·관리·결제를 모두 직접 한다면 프로 요금제 계열을 검토합니다.",
          "강사가 2인 이상이거나 운영팀이 따로 있고, 권한 분리·학생관리·관리자 운영 데이터가 필요하면 비즈니스 요금제 계열을 검토합니다.",
          "곧 강사나 학생 규모를 늘릴 계획이라면 현재 인원이 아니라 6개월 뒤 규모를 기준으로 봅니다.",
          "어느 쪽인지 애매하면 운영 규모를 적어 상담을 요청하세요. 무료 체험·전환 조건은 시기마다 달라질 수 있어 상담에서 확인하는 편이 정확합니다.",
        ],
      },
      {
        heading: "전환 절차",
        body: "메인 관리자 계정과 학원 정보를 준비했다면 실제 전환은 단계대로 진행하면 됩니다. 로그인한 계정이 메인 관리자 계정으로 굳어지므로, 첫 단계에서 계정을 다시 한번 확인하세요.",
        steps: [
          "클래스인 공식 홈페이지에서 메인 관리자로 쓸 계정으로 로그인합니다.",
          "운영 규모에 맞는 요금제를 선택합니다. 판단이 서지 않으면 결제 전에 상담을 먼저 요청합니다.",
          "팝업창에 회사 이름(학원명), 비즈니스 범위, 장소(국가/도시), 담당자 이름을 입력합니다. 이후 계정 인증 자료와 동일하게 맞춥니다.",
          "입력 내용을 검토한 뒤 결제를 진행합니다. 결제가 완료되면 정식 서비스가 시작됩니다.",
          "전환 직후 곧바로 계정 인증을 진행해 수업 녹화·웹 라이브 같은 제한 기능을 풀어 둡니다.",
        ],
      },
      {
        heading: "전환 후 가장 먼저 할 일",
        body: "결제가 끝났다고 운영 준비가 끝난 것은 아닙니다. 전환 직후 며칠 안에 아래를 정리하면 첫 수업까지의 공백을 줄일 수 있습니다.",
        steps: [
          "계정 인증 자료를 업로드해 제한 기능(수업 녹화, 웹 라이브 등)을 해제합니다.",
          "기관 일반 설정에서 코스 기본값, 교실 스킨·스위치, 저장 정책을 학원 기준으로 한 번 잡아 둡니다.",
          "강사·운영팀 계정을 추가하고 권한을 역할에 맞게 분리합니다. 관리자 운영 데이터는 '1분 스크린샷 감시'가 아니라 권한 기반 운영 데이터 가시성으로 활용하는 것이 맞습니다.",
          "대시보드 또는 클라이언트/모바일 앱에서 잔여 금액과 서비스 기간을 확인하는 위치를 운영 담당이 알아 둡니다.",
          "결제·정산 기록은 회계 시스템에도 남겨, 갱신 시점을 학원이 직접 관리하도록 합니다.",
        ],
      },
      {
        heading: "자주 하는 실수",
        body: "전환 단계에서 반복적으로 나오는 실수들입니다. 미리 알아 두면 재작업을 줄일 수 있습니다.",
        steps: [
          "개인 강사 계정으로 결제했다가 그 강사가 퇴사해 메인 관리자 권한이 묶이는 경우 — 처음부터 학원 공용 운영 계정을 쓰세요.",
          "화면이나 광고에 보이는 금액을 그대로 확정 금액으로 안내하는 경우 — 정확한 요금·할인은 상담으로 확인하고, 학생·학부모 대상으로는 단정해서 말하지 마세요.",
          "학원명·소재지를 대충 입력했다가 이후 계정 인증 자료와 달라 인증이 반려되는 경우 — 전환 단계부터 인증 서류 기준으로 입력하세요.",
          "결제만 하고 계정 인증을 미뤄 정작 수업 녹화·웹 라이브가 막혀 있는 경우 — 전환 직후 바로 인증을 진행하세요.",
          "결제·세금계산서를 클래스인 화면 안에서만 처리하려다 학원 회계와 어긋나는 경우 — 정산은 학원의 회계/결제 시스템과 병행하는 것이 안전합니다.",
        ],
      },
    ],
    resources: [
      { label: "클래스인 로그인 페이지", href: "https://www.classin.com/kr/login/" },
    ],
    relatedSlugs: ["account-verification", "institution-settings"],
  },
  {
    slug: "account-verification",
    category: "admin",
    title: "계정 인증",
    description: "수업 녹화·웹 라이브 등 모든 기능을 활용하기 위해 학원(기관) 또는 개인 강사 계정 인증 자료를 업로드하는 방법을 설명합니다.",
    audience: "학원 관리자, 개인 강사",
    updatedAt: "2026-05-14",
    readMinutes: 4,
    tags: ["인증", "사업자등록증", "기관 인증", "개인 교사"],
    keywords: ["계정 인증", "브랜드 로고", "사업자등록증", "법인 증명서", "여권", "신분증"],
    chatbotSummary: "유료 전환 후에도 일부 기능이 제한되어 있어 계정 인증이 필수입니다. 기관/사립학교/일반 학원/개인 강사 유형별 증명서, 파일 형식(JPG·PNG / 5MB 이하), 브랜드 로고(260*90px / 1MB 이하) 요건과 최대 7영업일 처리 일정을 안내합니다.",
    sections: [
      {
        heading: "계정 인증이 필요한 이유",
        body: "유료 계정으로 전환하더라도 수업 녹화, 웹 라이브 등 일부 기능은 여전히 제한되어 있습니다. 모든 기능을 활용하려면 인증 자료를 업로드하여 계정 인증 절차를 완료해야 합니다.",
      },
      {
        heading: "인증 절차",
        body: "주 관리자 계정으로 로그인하여 계정 정보 메뉴에서 인증 자료를 입력하고 증명서를 업로드합니다.",
        steps: [
          "클래스인 공식 홈페이지에서 주 관리자 계정으로 로그인합니다.",
          "계정 정보 → 인증 자료 → [편집] 메뉴로 이동합니다.",
          "브랜드 이름, 브랜드 로고(260*90px / 1MB 이하), 주영 종류, 소재지, 상세 주소, 학교 웹사이트, 담당자 정보를 입력합니다.",
          "기관 유형(공공기관·사립학교·일반 학원·개인 교사)에 맞는 인증 방식과 증명서를 업로드합니다.",
          "저장 후 최대 7영업일 이내 인증 처리가 완료되며, 완료 시 대시보드 메시지가 사라집니다.",
        ],
      },
      {
        heading: "기관 유형별 증명서",
        body: "공공기관·학교는 공립 기관 법인 증명서, 사립학교는 학교 허가증, 일반 학원은 영업 허가증(사업자등록증)을 업로드합니다. 통합사회신용코드/증서 번호란에는 사업자등록번호를 기재하며, 증명서는 JPG 또는 PNG / 5MB 이하 형식이어야 합니다.",
      },
      {
        heading: "개인 과외 강사 인증",
        body: "인증 방식에서 [개인 교사]를 선택하고 여권 또는 기타 증명서(사업자등록증·주민등록증·운전면허증)를 선택해 업로드합니다. 파일 형식은 JPG 또는 PNG / 5MB 이하이며, 해당 등록번호를 기재합니다.",
      },
      {
        heading: "신속 처리 옵션",
        body: "표준 처리 기간이 부족할 경우 담당 매니저에게 연락하면 즉시 처리가 가능합니다.",
      },
    ],
    relatedSlugs: ["billing-upgrade", "institution-settings"],
  },
  {
    slug: "institution-settings",
    category: "admin",
    title: "학원(기관) 일반 설정",
    description: "모든 코스와 수업에 공통 적용되는 기본 설정, 교실 스킨·스위치·파라미터, 다시보기, 저장 정책 등을 관리하는 방법을 안내합니다.",
    audience: "학원 관리자, 대표자",
    updatedAt: "2026-05-14",
    readMinutes: 7,
    featured: true,
    tags: ["일반 설정", "교실 설정", "스킨", "저장 설정", "부가가치 서비스"],
    keywords: ["기본 설정", "교실 스킨", "스위치 설정", "다시보기", "스토리지", "AI 에이전트", "SMS 알림"],
    chatbotSummary: "학원 단위로 적용되는 일반 설정을 관리합니다. 기본 설정·교실 설정(스킨·스위치·파라미터)·다시보기 범위·부가가치 서비스(AI 에이전트, 하이브리드 수업, SMS 알림)·저장 정책·칠판 자동 저장까지 6개 영역을 다루며, 권한은 소수 인원에게만 제한 권장합니다.",
    sections: [
      {
        heading: "일반 설정 개요",
        body: "설정하는 옵션들은 모든 코스와 수업에 영향을 끼치기 때문에 대표자 또는 소수 인원에게만 제한적인 접근 권한을 추천합니다. 모든 설정은 대시보드 좌측 메뉴의 [일반 설정]에서 접근합니다.",
      },
      {
        heading: "기본 설정",
        body: "대시보드 좌측 메뉴 → [일반 설정] → [기본 설정]에서 코스 기본 커버와 브랜드 로고를 변경할 수 있으며, 신규 코스 모두에 자동 적용됩니다. 학교 소개를 작성하면 학습 보고서 등에 표시됩니다.",
      },
      {
        heading: "교실 설정",
        body: "온라인 교실 내부 환경을 커스터마이징합니다. 스킨 설정(라이브러리 테마·단색·사용자 정의 이미지), 스위치 설정(최대 24개 기능 ON/OFF), 파라미터 설정(수업 녹화, 질문 간격, 트로피 이미지, 브라우저 즐겨찾기)으로 구성됩니다.",
        steps: [
          "[일반 설정] → [교실 설정] 메뉴로 이동합니다.",
          "스킨 설정에서 테마·단색·사용자 정의 이미지 중 하나를 선택합니다.",
          "스위치 설정에서 교실 내 기능 및 버튼을 활성화/비활성화합니다.",
          "파라미터 설정에서 녹화·질문 간격·트로피·즐겨찾기를 조정합니다.",
        ],
      },
      {
        heading: "수업 다시보기 설정",
        body: "자동 생성된 녹화본의 다시보기 범위, 신규/퇴원 학생의 접근 권한을 관리합니다. 저장공간은 학원 스토리지에 포함됩니다.",
      },
      {
        heading: "부가가치 서비스",
        body: "AI 에이전트(LMS 내 AI 기능, 한시적 무료), 하이브리드 수업(학생이 칠판 화면과 현장 카메라 화면 중 원하는 뷰를 선택, 요금제별 제한 가능), 스마트 담임 교사 SMS 알림(구독형 또는 충전형: 연 2,988CNY + 메시지당 약 0.2CNY)을 제공합니다. Nobook과 슈퍼 고객 서비스는 국내 미제공입니다.",
      },
      {
        heading: "저장 설정",
        body: "녹화본·수업 캡쳐본의 보관 기간, 무료 저장 범위, 자동 삭제 설정은 계약·기관 설정·최신 정책 기준으로 확인합니다. 과거 저장된 리소스 삭제와 자동 삭제 설정을 사용할 때는 권한 범위와 복구 가능 여부를 먼저 확인해야 합니다.",
      },
      {
        heading: "칠판 내용 및 수업자료 보관",
        body: "블랙보드와 수업 자료 위 필기 내용의 자동 저장 여부를 설정합니다. 저장된 데이터는 학원 스토리지에 포함됩니다.",
      },
    ],
    relatedSlugs: ["storage-management", "teacher-onboarding", "course-creation"],
  },
  {
    slug: "teacher-onboarding",
    category: "admin",
    title: "교사 추가",
    description: "강사 가입 확인부터 기관 등록, 권한 차등 부여, 코스 배정, 첫 수업 준비까지 교사 온보딩 전체 흐름을 순서와 체크리스트로 안내합니다.",
    audience: "학원 관리자, 운영팀",
    updatedAt: "2026-05-14",
    readMinutes: 5,
    tags: ["교사", "권한", "하위 계정"],
    keywords: ["교사 등록", "교사 추가", "하위 계정", "권한 관리", "공개 수업", "교사 온보딩", "권한 차등"],
    chatbotSummary: "교사 온보딩은 가입 확인 → 기관 등록 → 권한 부여 → 코스 배정 → 첫 수업 준비 순서로 묶어서 진행합니다. 강사가 본인 명의로 회원 가입을 마쳤는지 먼저 확인하고, 기관 관리 → 교사에서 가입에 쓴 핸드폰/이메일과 이름으로 등록합니다. 직접 코스를 만드는 강사만 계정 정보 → 권한 관리 → 하위 계정 추가에서 '공개 수업 및 클래스 만들기' 권한을 허용하고, 나머지는 등록 상태로 둡니다. 흔한 실수는 사전 가입 누락, 연락처 불일치, 권한 과다 부여, 코스 미배정입니다.",
    sections: [
      {
        heading: "온보딩 전체 흐름 한눈에 보기",
        body: "교사 추가는 계정 하나를 만드는 일이 아니라, 그 강사가 첫 수업을 클래스인 안에서 표준대로 진행할 수 있게 만드는 과정입니다. 가입 확인 → 기관 등록 → 권한 부여 → 첫 수업 준비까지를 하나의 흐름으로 묶어 두면 강사마다 들쭉날쭉하던 시작을 줄일 수 있습니다. 클래스인은 전자칠판 판서, EDB 교안, 자동 녹화, LMS 숙제·시험, 학생 관리가 한 흐름으로 이어지는 수업 시스템 OS이기 때문에, 강사의 첫 단추를 운영 기준에 맞춰 끼우는 것이 정착 속도를 좌우합니다.",
        steps: [
          "1. 가입 확인: 강사가 본인 명의로 클래스인 회원 가입을 마쳤는지 먼저 확인합니다.",
          "2. 기관 등록: 기관 관리 → 교사에서 핸드폰 또는 이메일로 강사를 우리 학원 소속으로 등록합니다.",
          "3. 권한 부여: 강사가 직접 코스를 만들어야 하는지에 따라 하위 계정 권한을 차등 부여합니다.",
          "4. 코스 배정: 담당 반(코스)에 강사를 배정해 어떤 수업을 맡을지 연결합니다.",
          "5. 첫 수업 준비: EDB 교안, 자료 저장 위치, 녹화·복습 흐름을 강사용 체크리스트로 안내합니다.",
        ],
      },
      {
        heading: "1단계 — 강사 가입부터 확인하기",
        body: "가장 자주 막히는 지점이 바로 여기입니다. 강사가 클래스인 회원 가입을 끝내지 않은 상태에서는 기관에 추가해도 정상적으로 연결되지 않습니다. 등록할 핸드폰 번호 또는 이메일이 실제 가입에 쓴 정보와 같은지 미리 확인해 두면, 오타로 빈 계정이 생기거나 다른 사람이 등록되는 사고를 막을 수 있습니다.",
        steps: [
          "강사에게 클래스인 앱 또는 웹에서 본인 명의로 회원 가입을 먼저 끝내 달라고 안내합니다.",
          "가입에 사용한 핸드폰 번호 또는 이메일을 그대로 받아 둡니다. 이 값이 곧 등록 키가 됩니다.",
          "강사 이름의 정확한 표기를 확인합니다. 학생·학부모에게 노출되는 이름이므로 미리 통일합니다.",
          "여러 강사를 한꺼번에 받을 때는 가입 여부와 연락처를 명단으로 정리해 두면 등록이 빨라집니다.",
        ],
      },
      {
        heading: "2단계 — 기관에 교사 등록하기",
        body: "가입이 확인되면 기관 관리에서 강사를 우리 학원 소속으로 등록합니다. 이 단계는 강사를 '우리 학원 구성원'으로 묶는 작업일 뿐, 코스를 만들 권한까지 주는 것은 아닙니다. 등록만으로는 배정된 수업에 들어가 진행하는 역할에 가깝다고 이해하면 다음 권한 단계를 설계하기 쉽습니다.",
        steps: [
          "기관 관리 → 교사 → [교사 추가] 버튼을 클릭합니다.",
          "강사가 가입에 쓴 핸드폰 번호 또는 이메일과 이름을 입력합니다.",
          "학번·소속·태그 같은 선택 정보가 필요하면 함께 입력합니다.",
          "저장한 뒤 교사 목록에 정상적으로 추가되었는지, 입력한 연락처와 일치하는지 확인합니다.",
        ],
      },
      {
        heading: "3단계 — 권한은 역할에 맞게 차등 부여하기",
        body: "권한은 '있으면 편하다'가 아니라 '이 강사의 역할에 필요한가' 기준으로 줍니다. 직접 코스를 설계하고 운영하는 강사에게만 코스 생성 권한을 주고, 배정된 수업만 진행하는 강사는 등록 상태로 두는 것이 깔끔합니다. 직접 코스를 만들어야 하는 강사라면 계정 정보 → 권한 관리에서 하위 계정으로 추가하고 '공개 수업 및 클래스 만들기' 권한을 허용합니다.",
        steps: [
          "강사를 두 부류로 나눕니다. 직접 코스를 만드는 강사와 배정된 수업만 진행하는 강사입니다.",
          "직접 코스를 만드는 강사는 계정 정보 → 권한 관리 → [하위 계정 추가]로 등록합니다.",
          "강사의 연락처/이메일과 이름을 입력하고, 권한 메뉴에서 부여할 항목만 선택합니다.",
          "코스를 직접 설계하는 강사에게는 '공개 수업 및 클래스 만들기' 권한을 허용합니다.",
          "관리자급 운영 데이터 열람 권한은 꼭 필요한 책임자에게만 줍니다. 이는 감시가 아니라 권한 기반 운영 데이터 가시성을 역할에 맞게 나누는 일입니다.",
        ],
      },
      {
        heading: "4단계 — 코스 배정과 첫 수업 준비",
        body: "등록과 권한이 끝나면 강사를 실제 담당 반(코스)에 연결하고, 첫 수업을 클래스인 흐름대로 준비하게 합니다. 좋은 장비를 들여도 강사가 매번 빈 화면에서 자료를 새로 띄우면 운영은 다시 사람에게 의존합니다. 첫 수업 전에 EDB 교안과 자료 저장 위치, 녹화·복습 흐름을 정해 두면 강사의 준비 시간이 줄고 반별 수업이 표준화됩니다.",
        steps: [
          "기관 관리 → 코스 관리에서 강사를 담당 코스의 담임 또는 협력 교사로 배정합니다.",
          "반복 사용하는 대표 교안을 EDB 파일로 준비해 강사가 처음부터 만들지 않게 합니다.",
          "강사 개인 PC에만 있던 자료를 기관 기준 저장 위치와 계정으로 옮깁니다.",
          "전자칠판 판서 → 자동 녹화 → 다시보기 복습 → LMS 숙제·시험으로 이어지는 첫 수업 순서를 함께 점검합니다.",
          "EDB 교안 만들기, 수업 녹화, 복습 배포 절차를 강사용 체크리스트 한 장으로 전달합니다.",
        ],
      },
      {
        heading: "흔한 실수와 점검 포인트",
        body: "온보딩이 어긋나는 경우는 대부분 정해진 패턴을 따릅니다. 추가하기 전에 아래 항목만 점검해도 다시 등록하거나 권한을 정리하는 반복 작업을 크게 줄일 수 있습니다.",
        steps: [
          "사전 가입 누락: 강사가 가입을 끝내지 않은 채 등록을 시도하면 연결되지 않습니다. 가입 확인을 1단계로 고정하세요.",
          "연락처 불일치: 등록에 쓴 번호·이메일이 가입 정보와 다르면 빈 계정이 생깁니다. 등록 키를 그대로 받아 입력하세요.",
          "권한 과다 부여: 모든 강사에게 코스 생성·관리자 권한을 일괄로 주면 코스가 중복 생성되고 운영 데이터 관리가 흐트러집니다. 역할에 맞게만 부여하세요.",
          "권한 부족: 직접 코스를 만들어야 하는 강사에게 '공개 수업 및 클래스 만들기' 권한이 빠지면 수업을 못 만듭니다.",
          "코스 미배정: 등록과 권한만 하고 코스에 배정하지 않으면 강사가 진행할 수업이 없습니다. 배정까지 한 흐름으로 끝내세요.",
          "퇴사·반 변경 정리: 강사가 나가거나 담당이 바뀌면 권한과 코스 배정을 함께 정리해 데이터 접근 범위를 최신 상태로 유지하세요.",
        ],
      },
    ],
    relatedSlugs: ["student-onboarding", "course-creation", "institution-settings"],
  },
  {
    slug: "student-onboarding",
    category: "admin",
    title: "학생 추가",
    description: "재원생을 개별·텍스트·Excel로 등록하고 대리 등록 옵션으로 학생 ID를 강제 생성하는 방법을 안내합니다.",
    audience: "학원 관리자, 운영팀",
    updatedAt: "2026-05-14",
    readMinutes: 3,
    tags: ["학생", "대량 등록", "Excel", "대리 등록"],
    keywords: ["학생 추가", "Excel 가져오기", "텍스트 가져오기", "대리 등록", "임시 비밀번호"],
    chatbotSummary: "기관 관리 → 학생 메뉴에서 개별 추가, 텍스트 가져오기(회당 100명), Excel 가져오기(회당 300명)로 학생을 등록할 수 있습니다. 대리 등록 옵션을 체크하면 SMS 또는 이메일로 임시 비밀번호가 발송됩니다.",
    sections: [
      {
        heading: "개별 학생 추가",
        body: "기관 관리 → 학생 → [학생 추가]에서 이름과 아이디(핸드폰 번호 또는 이메일)를 입력해 등록합니다. 학번, 태그 등 선택 정보를 함께 입력할 수 있습니다.",
      },
      {
        heading: "텍스트 가져오기 (회당 100명)",
        body: "학생 추가 → [텍스트에서 가져오기]를 사용하면 1회당 최대 100명까지 등록할 수 있습니다. 형식은 82-1012345678#홍길동 또는 example@gmail.com#임꺽정과 같이 아이디#이름 형태로 작성합니다.",
        steps: [
          "기관 관리 → 학생 → [학생 추가] → [텍스트에서 가져오기]를 선택합니다.",
          "아이디#이름 형식으로 학생 정보를 입력합니다.",
          "최대 100명을 한 번에 등록합니다.",
        ],
      },
      {
        heading: "Excel 가져오기 (회당 300명)",
        body: "학생 추가 → [Excel 가져오기]에서 템플릿(예: '[클래스인] 학생 등록 양식.xlsx')을 다운로드한 뒤 1회당 최대 300명까지 일괄 등록할 수 있습니다. 1행은 그대로 두고 2행부터 학생 정보를 기입해야 합니다.",
        steps: [
          "학생 추가 → [Excel 가져오기]를 클릭합니다.",
          "제공되는 학생 등록 양식 템플릿을 다운로드합니다.",
          "1행은 그대로 두고 2행부터 학생 이름과 핸드폰/이메일을 기입합니다.",
          "필요 시 학번·태그 등 선택 항목을 함께 입력합니다.",
          "파일을 업로드해 최대 300명까지 일괄 등록합니다.",
        ],
      },
      {
        heading: "대리 등록으로 ID 강제 생성",
        body: "학생이 직접 가입하기 어려운 경우 팝업에서 [학생 대리 등록] 옵션을 체크하면 입력한 핸드폰 번호 또는 이메일이 그대로 ID로 설정되고, SMS(핸드폰) 또는 이메일로 임시 비밀번호가 포함된 안내가 발송됩니다. 학생은 로그인 후 비밀번호를 변경할 수 있습니다.",
      },
    ],
    relatedSlugs: ["teacher-onboarding", "course-creation", "course-management"],
  },
  {
    slug: "course-creation",
    category: "admin",
    title: "코스 및 수업 개설",
    description: "코스(반)를 생성하고 구성원을 배정한 뒤 개별/일괄로 수업을 추가하는 전 과정을 안내합니다.",
    audience: "학원 관리자, 담임 교사",
    updatedAt: "2026-05-14",
    readMinutes: 8,
    featured: true,
    tags: ["코스", "수업", "시간표", "일괄 생성"],
    keywords: ["코스 만들기", "담임 교사", "수업 생성", "수업 일괄 생성", "온스테이지", "하이브리드 수업", "웹 라이브"],
    chatbotSummary: "코스(반)는 코스 > 과정 > 단원 > 학습 활동 구조입니다. 기관 관리 → 코스 관리에서 코스를 만들고 담임 교사·교사·학생을 배정한 뒤 시간표에서 개별 수업 또는 일괄 수업(2~50개)을 생성합니다. 온스테이지 인원, 화질, 수업 녹화·현장 녹화, 하이브리드 수업, 웹 라이브 등을 함께 설정합니다.",
    sections: [
      {
        heading: "코스와 수업 이해하기",
        body: "코스는 하나의 반(클래스)를 의미하며, 구조는 '코스 > 과정 > 단원 > 학습 활동(수업·숙제·토론 등)'으로 구성됩니다.",
      },
      {
        heading: "코스 추가하기",
        body: "기관 관리 → 코스 관리에서 새 코스를 만들고 담임 교사와 교사를 지정합니다. 담임 교사는 코스·수업 생성과 편집, 구성원 관리 권한을 갖습니다.",
        steps: [
          "기관 관리 → 코스 관리 → [코스 만들기]를 클릭합니다.",
          "코스명을 입력합니다.",
          "담임 교사(코스 관리자)를 지정합니다.",
          "필요한 경우 협력 교사를 추가합니다.",
          "기타 선택 정보를 입력한 뒤 저장합니다.",
        ],
      },
      {
        heading: "구성원 관리하기",
        body: "코스 내부 [구성원] 메뉴에서 교사와 학생을 배정합니다. 교사와 학생 모두 사전에 학원(기관) 대시보드에 등록되어 있어야 합니다.",
        steps: [
          "코스 내부 → [구성원]을 클릭합니다.",
          "[교사로 설정]을 클릭해 교사를 추가합니다.",
          "[코스 내 학생을 설정하기]를 클릭해 학생을 배정합니다.",
        ],
      },
      {
        heading: "개별 수업 추가",
        body: "코스 내부 [시간표]에서 수업을 하나씩 생성합니다. 수업 이름·단원·시작 시간·진행 시간·수업 교사·조교·온스테이지 설정·하이브리드 수업·수업 녹화·현장 녹화·드라이브 리소스 등을 지정할 수 있습니다.",
        steps: [
          "코스 내부 → [시간표] → [수업 생성]을 클릭합니다.",
          "수업 이름, 단원, 시작 시간, 진행 시간을 입력합니다.",
          "수업 교사와 (필요 시) 조교를 지정합니다.",
          "온스테이지 인원수(1v0~1v12)와 화질(SD/HD/FHD)을 선택합니다.",
          "하이브리드 수업·드라이브 리소스·수업 녹화·현장 녹화·웹 라이브 등을 설정합니다.",
          "[게시하기]를 클릭해 수업을 등록합니다.",
        ],
      },
      {
        heading: "수업 녹화, 현장 녹화, 웹 라이브 옵션",
        body: "Classin 수업 녹화는 온라인·오프라인 여부와 무관하게 기본 복습/다시보기 용도로 많이 쓰는 기본 녹화입니다. 칠판·자료·교실 화면을 중심으로 남기며, 교실 안에서 카메라를 켜면 Classin 화면 레이아웃에 포함된 카메라 영역도 함께 보일 수 있습니다. 현장 녹화는 기본 수업 녹화와 병행해 연결된 카메라의 실제 교실 뷰나 트래킹 뷰를 별도로 남깁니다. 다시보기에서는 두 녹화 뷰를 따로 선택해 볼 수 있고, 웹 라이브는 로그인 없이 웹 기반 생중계와 수업 종료 후 플레이백을 지원합니다.",
      },
      {
        heading: "수업 일괄 추가",
        body: "같은 요일·일정한 시간에 진행되는 수업은 [수업 일괄 생성]으로 2~50개를 한 번에 만들 수 있습니다. 앱에서는 지원되지 않으며 대시보드에서만 작업 가능합니다.",
        steps: [
          "코스 내부 → [시간표] → [수업 일괄 생성]을 클릭합니다.",
          "한 번에 생성할 수업 수(2~50개)를 지정합니다.",
          "반복 진행될 요일을 선택합니다.",
          "공통 옵션을 설정한 뒤 저장합니다.",
        ],
      },
    ],
    relatedSlugs: ["teacher-onboarding", "student-onboarding", "course-management", "web-live-playback"],
  },
  {
    slug: "course-management",
    category: "admin",
    title: "코스 및 수업 관리",
    description: "관리자가 개설된 코스와 수업을 검색·점검·종료하고 모니터링·녹화본·학습 보고서 같은 수업 데이터를 권한 기반으로 활용하는 운영 루틴을 단계별로 안내합니다.",
    audience: "학원 관리자, 운영팀",
    updatedAt: "2026-05-14",
    readMinutes: 6,
    tags: ["코스 관리", "수업 검색", "학습 보고서", "녹화본"],
    keywords: ["코스 검색", "코스 종료", "수업 모니터링 데이터", "웹 라이브 관리", "학습 보고서"],
    chatbotSummary: "코스 관리는 검색 → 상세 점검 → 데이터 활용 → 종료 순서로 진행합니다. 코스 이름·교사·기간으로 코스와 수업을 찾고, 조작 메뉴에서 모니터링 데이터·수업 데이터·웹 라이브 다시보기·녹화 데이터·학습 보고서를 권한 기반으로 활용합니다. 코스 종료는 복구가 불가능하고 종료된 코스의 녹화본 재열람은 코스 설정에 따라 달라지므로, 종료 전 체크리스트로 진행 중인 수업·녹화본·미제출 과제를 먼저 확인합니다.",
    sections: [
      {
        heading: "코스 관리가 운영에서 차지하는 자리",
        body: "코스 관리는 단순히 목록을 열어 보는 화면이 아니라, 수업 전 준비부터 수업 후 데이터 활용, 학기 종료 처리까지 하나의 운영 흐름으로 이어지는 관리자 작업입니다. 교사가 만든 코스와 수업이 정상적으로 굴러가는지 점검하고, 모니터링·녹화본·학습 보고서 같은 수업 데이터를 권한 범위 안에서 확인하며, 더 이상 쓰지 않는 코스를 안전하게 종료하는 일을 한 곳에서 처리합니다. 그래서 '검색 → 상세 점검 → 데이터 활용 → 종료'라는 순서를 루틴으로 잡아 두면 매주 반복되는 운영 업무가 줄어듭니다.",
        steps: [
          "검색: 코스 이름·담임 교사·기간으로 대상 코스를 좁힙니다.",
          "상세 점검: 수업 횟수, 참여 학생 수, 담임 교사가 의도한 구성과 맞는지 확인합니다.",
          "데이터 활용: 조작 메뉴에서 모니터링·수업 데이터·녹화본·학습 보고서를 확인합니다.",
          "종료: 학기가 끝나거나 더 이상 쓰지 않는 코스만, 체크리스트를 거친 뒤 종료합니다.",
        ],
      },
      {
        heading: "코스 검색과 상세 점검",
        body: "코스가 많아질수록 이름만으로는 찾기 어렵습니다. 코스 이름, 교사 정보, 시작·종료일 같은 필터를 조합해 대상을 먼저 좁힌 뒤, 상세 정보로 구성이 의도대로인지 확인하는 순서로 점검합니다.",
        steps: [
          "관리자 콘솔에서 코스 관리(코스 목록) 화면으로 이동합니다.",
          "코스 이름, 담임 교사, 시작·종료일 필터를 조합해 검색합니다.",
          "검색된 코스에서 생성일, 수업 횟수, 담임 교사, 참여 학생 수를 확인합니다.",
          "수업 횟수나 학생 수가 예상과 다르면 담임 교사 배정과 코스 구성을 먼저 점검합니다.",
          "담임 교사가 바뀌어야 하는 코스는 담임 교사 변경 기능으로 정리합니다.",
        ],
      },
      {
        heading: "수업 단위로 좁혀서 확인하기",
        body: "코스 안에서 특정 회차에 문제가 있었는지 살펴볼 때는 수업 검색을 사용합니다. 수업 이름·교사·기간으로 찾으면 해당 코스, 시작 시간, 담당 교사, 참여 학생을 한 번에 확인할 수 있어, 결석·입장 지연 같은 이슈를 회차 단위로 추적하기 좋습니다.",
        steps: [
          "수업 검색 화면에서 수업 이름·교사·기간으로 대상 회차를 찾습니다.",
          "해당 수업의 코스, 시작 시간, 담당 교사, 참여 학생을 확인합니다.",
          "특정 학생의 결석·지각이 의심되면 다음 섹션의 모니터링 데이터로 입퇴장 기록을 교차 확인합니다.",
        ],
      },
      {
        heading: "수업 데이터를 권한 기반으로 활용하기",
        body: "각 수업의 조작 메뉴에는 운영에 필요한 데이터가 묶여 있습니다. 여기서 보이는 항목과 다운로드 가능 범위는 관리자 권한과 기관 설정에 따라 달라지므로, '모든 데이터를 자동으로 모아 준다'고 보기보다 '필요한 데이터를 권한 안에서 직접 확인한다'는 관점으로 접근하는 편이 정확합니다.",
        steps: [
          "수업 모니터링 데이터: 1분마다 자동 기록된 캡처 화면과 입·퇴장 기록으로 출결과 참여를 확인합니다.",
          "수업 데이터: 교사·학생의 참여 데이터를 확인해 회차별 진행 상태를 점검합니다.",
          "웹 라이브 및 다시보기 관리: 실시간 시청 현황과 종료 후 다시보기 상태를 확인합니다.",
          "수업 녹화 데이터: 녹화 원본을 확인하고, 권한 범위 안에서 다운로드합니다.",
          "학습 보고서: 강의·학습 보고서를 확인하고, 학부모 공유가 필요하면 링크를 복사해 전달합니다.",
        ],
      },
      {
        heading: "코스 종료 전 체크리스트",
        body: "코스 종료는 학기가 끝났거나 더 이상 운영하지 않는 코스를 정리하는 마지막 단계입니다. 다만 종료된 코스는 복구가 불가능하고, 종료된 코스에 들어 있던 수업 활동과 녹화본의 재열람 여부는 코스 설정에 따라 달라집니다. 그래서 '종료해도 되는 코스인지'를 먼저 확인하는 체크리스트를 반드시 거친 뒤 진행합니다.",
        steps: [
          "진행 중이거나 예정된 수업이 남아 있지 않은지 확인합니다.",
          "보관이 필요한 녹화본을 미리 확인하고, 필요하면 다운로드하거나 보호 보관 여부를 점검합니다.",
          "미제출 과제나 미확인 성적이 남아 학생·학부모 안내가 필요한지 확인합니다.",
          "학부모에게 공유할 학습 보고서 링크가 모두 전달됐는지 확인합니다.",
          "위 항목을 모두 점검한 뒤에만 코스 종료를 실행하고, 종료 후에는 되돌릴 수 없음을 다시 한번 확인합니다.",
        ],
      },
      {
        heading: "흔한 실수와 미리 막는 법",
        body: "코스 관리에서 사고가 나는 지점은 대부분 '되돌릴 수 없는 동작'과 '데이터 접근 범위에 대한 오해'에서 생깁니다. 아래 패턴만 피해도 운영 사고를 크게 줄일 수 있습니다.",
        steps: [
          "복구 불가 동작을 가볍게 실행하지 않기: 코스 종료는 되돌릴 수 없으므로 체크리스트 없이 일괄 종료하지 않습니다.",
          "녹화 재열람 영향 간과하지 않기: 종료 후 녹화본 재열람은 코스 설정에 좌우되므로, 복습이 필요한 코스는 종료 전 설정과 보관 상태를 먼저 확인합니다.",
          "보관 데이터 백업 누락하지 않기: 종료 전에 필요한 녹화본·보고서를 확보하지 않으면 이후 다시 받기 어려울 수 있습니다.",
          "권한 범위를 과대 해석하지 않기: 데이터 표시·다운로드 범위는 권한과 기관 설정에 따라 달라지므로, 보이지 않는 항목은 권한 설정을 먼저 점검합니다.",
          "수업 데이터를 외부 시스템으로 옮길 때: 결제·오프라인 출결 정산이나 고급 리포트 가공이 필요하면 Classin 내부에서 무리하게 처리하기보다, 내보낸 데이터를 별도 시스템에서 다루는 방식을 검토하고 필요 시 상담으로 적합한 연동 방법을 확인합니다.",
        ],
      },
    ],
    relatedSlugs: ["course-creation", "class-monitoring", "web-live-playback", "statistics-data"],
  },
  {
    slug: "storage-management",
    category: "admin",
    title: "스토리지 관리",
    description: "수업 리소스·코스 첨부 파일·공유 드라이브 등 학원 스토리지 구성과 영상·스크린샷 관리, 보호 설정 확인 기준을 안내합니다.",
    audience: "학원 관리자",
    updatedAt: "2026-05-14",
    readMinutes: 5,
    tags: ["스토리지", "수업 리소스", "녹화본", "보호 잠금"],
    keywords: ["스토리지 사용량", "수업 스크린샷", "수업 녹화본", "보호 잠금", "자물쇠", "출결"],
    chatbotSummary: "스토리지 → [데이터 개요]에서 수업 리소스, 코스 첨부 파일, 공유 드라이브, 게시판 문서 사용량을 확인합니다. 녹화본·스크린샷 확인, 다운로드·삭제 권한, 보호 잠금과 자동 삭제 기준은 계약·기관 설정·최신 정책 기준으로 확인합니다.",
    sections: [
      {
        heading: "스토리지에 포함되는 데이터",
        body: "스토리지는 과정 탭의 학습 활동 데이터, 수업 후 생성되는 녹화본·스크린샷·칠판 파일 등 수업 리소스, 기관 공용 공유 드라이브를 모두 포함해 계산합니다.",
      },
      {
        heading: "스토리지 사용량 확인",
        body: "스토리지 → [데이터 개요]에서 기관의 스토리지 사용량과 전체 용량을 확인할 수 있습니다. 항목은 수업 리소스, 코스 첨부 파일, 공유 드라이브, 게시판 문서, 전체 합계로 구분됩니다. 기본 제공 용량, 무료 보관 기간, 추가 용량 단가, 클래스 파일 분류 기준은 최신 계약·기관 설정으로 확인합니다.",
      },
      {
        heading: "수업 리소스 검색",
        body: "수업 이름·기간 등으로 리소스를 검색하면 수업 진행 날짜, 스크린샷 용량, 녹화본 용량 등을 확인할 수 있습니다.",
      },
      {
        heading: "수업 스크린샷 및 출결 확인",
        body: "수업 리소스 → 오퍼레이션 → [수업 스크린샷] 메뉴에서 1분마다 자동 저장된 스크린샷을 확인·저장할 수 있고, 참여자(교사·학생)의 출결 여부와 입장/퇴장 기록을 함께 조회할 수 있습니다.",
      },
      {
        heading: "수업 녹화본 관리",
        body: "녹화본의 확인·다운로드·삭제·대체 업로드 가능 범위는 관리자 권한, 기관 설정, 계약 조건에 따라 달라질 수 있습니다. 삭제나 대체 업로드는 접근 권한과 복구 가능 여부를 먼저 확인한 뒤 진행해야 합니다.",
      },
      {
        heading: "보호 잠금 활용",
        body: "장기 보관이 필요한 리소스는 보호 잠금 또는 별도 보관 설정 가능 여부를 확인합니다. 보호 잠금의 제공 여부, 자동 삭제 제외 기준, 적용 범위는 기관 설정과 최신 정책 기준으로 확인해야 합니다.",
        steps: [
          "스토리지 → 수업 리소스에서 보호할 항목을 찾습니다.",
          "보호 잠금 섹션 위치를 확인합니다.",
          "[자물쇠] 아이콘을 클릭해 보호 잠금을 설정합니다.",
        ],
      },
    ],
    relatedSlugs: ["shared-drive", "institution-settings", "course-management"],
  },
  {
    slug: "shared-drive",
    category: "admin",
    title: "공유 드라이브 관리",
    description: "기관 공용 공유 드라이브를 생성하고 구성원 권한을 차등 부여해 수업 자료를 안전하게 공유하는 방법을 안내합니다.",
    audience: "학원 관리자, 교사",
    updatedAt: "2026-05-14",
    readMinutes: 4,
    tags: ["공유 드라이브", "권한", "파일 업로드", "Google Drive"],
    keywords: ["공유 드라이브 만들기", "구성원 초대", "관리자 권한", "컨텐츠 관리자", "읽기 전용", "Google Drive 연동"],
    chatbotSummary: "스토리지 → 공유 드라이브에서 폴더를 만들고 구성원을 초대해 관리자/컨텐츠 관리자/읽기 전용/감추기 네 단계 권한을 부여합니다. 파일은 업로드 버튼 또는 드래그앤드롭으로 추가하며 폴더는 최대 2,000개까지, HWP는 미지원이므로 PDF 변환이 필요합니다.",
    sections: [
      {
        heading: "공유 드라이브 생성",
        body: "스토리지 → 공유 드라이브 → [공유 드라이브 만들기]에서 폴더명을 입력해 생성합니다. 폴더명은 언제든 수정할 수 있고 구성원 초대와 권한 설정을 함께 진행할 수 있습니다.",
        steps: [
          "스토리지 → 공유 드라이브 메뉴로 이동합니다.",
          "[공유 드라이브 만들기]를 클릭합니다.",
          "폴더명을 입력합니다.",
          "[구성원 초대]를 눌러 교사를 선택하고 [확인]합니다.",
          "구성원별로 권한 등급을 부여합니다.",
        ],
      },
      {
        heading: "권한 등급",
        body: "관리자는 파일 업로드·다운로드와 구성원 추가·삭제가 가능하고, 컨텐츠 관리자는 파일 업로드·다운로드까지 허용됩니다. 읽기 전용은 파일 열람만 가능하며, 감추기는 파일 열람조차 허용되지 않습니다. 권한 편집은 우측 메뉴(···) 클릭으로 변경할 수 있습니다.",
      },
      {
        heading: "자료 업로드",
        body: "좌측 상단 [업로드] 버튼을 클릭하거나 로컬 파일을 대시보드에 드래그&드롭하여 추가합니다. 폴더를 생성해 산발적인 자료를 정리할 수 있습니다.",
      },
      {
        heading: "주의사항과 제한",
        body: "과목·학년·레벨에 따라 폴더를 분류해 사용하는 것을 추천합니다. 무료 제공 용량은 요금제에 따라 다르며, 폴더는 최대 2,000개까지 추가할 수 있습니다. 자료 삭제 시 복구가 불가능하므로 신중히 작업해야 합니다. PPT·PDF·JPG·MP3·MP4 등이 지원되며 HWP(한글) 파일은 미지원이므로 PDF로 변환 후 업로드해야 합니다.",
      },
      {
        heading: "Google Drive 연동",
        body: "PC 클래스인 앱을 실행한 뒤 [드라이브] → [Google Drive] 메뉴를 클릭하면 구글 드라이브를 연동할 수 있고, 구글 드라이브 자료를 온라인 교실에서 바로 활용할 수 있습니다.",
      },
    ],
    relatedSlugs: ["storage-management", "institution-settings"],
  },
  {
    slug: "web-live-playback",
    category: "admin",
    title: "웹 라이브 & 플레이백",
    description: "앱 설치 없이 웹 링크로 수업을 생중계하고 종료 후 다시 시청할 수 있는 웹 라이브/플레이백 기능을 관리하는 방법입니다.",
    audience: "학원 관리자, 운영팀",
    updatedAt: "2026-05-14",
    readMinutes: 3,
    tags: ["웹 라이브", "플레이백", "다시보기", "생중계"],
    keywords: ["웹 라이브", "플레이백", "비밀번호 시청", "좋아요", "채팅", "라이브 커버"],
    chatbotSummary: "대시보드 [라이브&플레이백]에서 웹 참여 링크를 복사해 공유하고, 로그인 요구·비밀번호·좋아요/채팅 권한·라이브 커버 등을 설정합니다. 수업 종료 후에는 오퍼레이션 → 관리에서 시청자 수, 좋아요 수 등 통계를 확인합니다.",
    sections: [
      {
        heading: "웹 라이브와 플레이백 개념",
        body: "웹 라이브는 클래스인 녹화 화면을 실시간 웹 링크로 생중계할 수 있는 기능으로, 시청자는 별도의 앱 설치 없이 참여할 수 있습니다. 플레이백은 녹화된 수업을 웹 링크로 재시청할 수 있게 해 줍니다.",
      },
      {
        heading: "수업 링크 확인 및 공유",
        body: "대시보드에서 [라이브&플레이백] → [웹 페이지 링크]를 클릭하면 웹 참여 링크를 확인·복사해 재원생이나 외부 참여자에게 공유할 수 있습니다.",
        steps: [
          "대시보드 → [라이브&플레이백] 메뉴로 이동합니다.",
          "[웹 페이지 링크]를 클릭합니다.",
          "참여 링크를 복사해 재원생 또는 외부 참여자에게 공유합니다.",
        ],
      },
      {
        heading: "웹 라이브 세부 설정",
        body: "조건 검색으로 수업 목록을 찾아 로그인 요구 여부, 비밀번호 시청 보호, 좋아요 및 채팅 권한, 라이브 커버 및 소개글 등을 일괄로 또는 개별 수업의 우측 [관리] 메뉴에서 편집할 수 있습니다.",
        steps: [
          "조건 검색으로 대상 수업을 찾습니다.",
          "로그인 요구·비밀번호·좋아요/채팅 권한을 설정합니다.",
          "라이브 커버와 소개글을 수정합니다.",
          "개별 수업은 우측 [관리] 메뉴에서 편집합니다.",
        ],
      },
      {
        heading: "라이브/플레이백 데이터 확인",
        body: "수업 종료 후 [라이브&플레이백] → [오퍼레이션] → [관리]를 클릭하면 시청자 수, 좋아요 수 등 통계를 확인할 수 있습니다.",
      },
    ],
    relatedSlugs: ["course-creation", "course-management", "class-monitoring"],
  },
  {
    slug: "class-monitoring",
    category: "admin",
    title: "수업 모니터링",
    description: "관리자가 권한 범위 안에서 진행 중인 수업의 출석·접속 상태를 확인하고, 참여 문제가 생겼을 때 빠르게 운영을 지원하는 방법을 안내합니다.",
    audience: "학원 관리자, 운영팀",
    updatedAt: "2026-05-14",
    readMinutes: 4,
    tags: ["모니터링", "실시간", "출석", "운영"],
    keywords: ["수업 모니터링", "실시간 접속", "출석 확인", "접속 기기", "운영 지원"],
    chatbotSummary: "수업 모니터링은 감시가 아니라 관리자가 권한 범위 안에서 보는 운영 데이터 가시성입니다. 관리자는 진행 중인 수업의 교사·학생 출석 상태와 접속 환경을 확인하고, 입장이 안 되거나 소리·화면 문제가 생긴 수업에 들어가 빠르게 지원할 수 있습니다. 정기 점검은 수업 시작 직후 출석·접속 확인, 문제 수업 우선 대응, 반복 이슈 기록 순서로 운영하면 됩니다. 누가 접근할 수 있는지는 관리자 권한 설정으로 관리하고, 모니터링 목적과 범위는 교사·학생에게 미리 안내하는 것이 좋습니다.",
    sections: [
      {
        heading: "수업 모니터링은 '감시'가 아니라 '운영 가시성'입니다",
        body: "수업 모니터링은 진행 중인 수업이 정상적으로 굴러가는지 관리자가 운영 관점에서 확인하는 기능입니다. Classin은 전자칠판, EDB 교안, 녹화, LMS, 학생관리, 관리자 데이터가 하나의 수업 운영 흐름으로 이어지는 수업 시스템 OS이고, 수업 모니터링은 그 흐름에서 '수업 중' 단계가 막힘 없이 돌아가는지를 관리자가 권한 범위 안에서 보는 역할을 합니다. 화면을 몰래 캡쳐하거나 교사를 평가하기 위한 감시 도구가 아니라, 입장이 안 되거나 소리·화면이 끊긴 수업을 빨리 찾아 돕기 위한 운영 데이터 가시성으로 이해하면 됩니다.",
        steps: [
          "목적을 '문제 수업을 빨리 찾아 지원하기'로 한정합니다.",
          "확인 대상은 출석 여부, 접속 상태, 기기·환경 정보 같은 운영 데이터로 둡니다.",
          "교사 평가나 상시 화면 들여다보기 용도로 쓰지 않습니다.",
          "관리자가 수업에 들어가도 별도 알림은 가지 않으므로, 운영 목적과 범위를 사전에 안내해 신뢰를 지킵니다.",
        ],
      },
      {
        heading: "시작하기 전에 점검할 것",
        body: "모니터링을 운영 루틴으로 만들려면 누가, 어떤 권한으로, 무엇을 보는지를 먼저 정리해 두는 것이 좋습니다. 권한과 안내가 빠진 채 들여다보기만 하면 현장 신뢰가 흔들릴 수 있습니다.",
        steps: [
          "관리자 계정에 수업 조회 권한이 부여돼 있는지 확인합니다. 누가 접근할 수 있는지는 관리자 권한 설정으로 관리합니다.",
          "모니터링을 담당할 운영자와 점검 시간대를 정합니다(예: 매 교시 시작 후 첫 5분).",
          "교사·학생에게 '운영 지원을 위해 관리자가 수업 접속 상태를 확인할 수 있다'는 점을 미리 안내합니다.",
          "문제 발생 시 연락 경로(메신저, 전화 등)를 정해 두어 모니터링과 대응이 한 흐름으로 이어지게 합니다.",
        ],
      },
      {
        heading: "실시간으로 수업 상태 확인하기",
        body: "진행 중인 수업 목록에서 출석과 접속 상태를 먼저 훑고, 이상이 보이는 수업만 골라 들어가 확인하는 순서로 움직이면 효율적입니다. 모든 수업을 처음부터 끝까지 들여다볼 필요는 없습니다.",
        steps: [
          "관리자 환경에서 진행 중인 수업 목록을 엽니다.",
          "수업별 교사·학생 출석 여부와 접속 인원을 먼저 확인합니다.",
          "출석률이 비정상적으로 낮거나 교사 미접속처럼 신호가 잡힌 수업을 우선 대상으로 추립니다.",
          "필요한 수업에 접속해 화면·소리·자료 공유가 정상인지 운영 관점에서 확인합니다.",
          "정상인 수업은 빠르게 닫고, 문제 수업 대응에 시간을 집중합니다.",
        ],
      },
      {
        heading: "참여 문제 발생 시 대응하기",
        body: "학생이 '소리가 안 들려요', '입장이 안 돼요'라고 할 때, 접속·기기 정보를 함께 확인하면 원인을 좁혀 빠르게 안내할 수 있습니다. 모니터링의 가치는 보는 것이 아니라 이 대응 속도에 있습니다.",
        steps: [
          "문제가 신고된 수업과 학생을 특정합니다.",
          "해당 학생의 접속 상태와 기기·환경 정보를 확인해 원인을 좁힙니다(미입장·연결 끊김·기기 권한 등).",
          "원인에 맞춰 재입장, 마이크·카메라 권한 확인, 네트워크 점검 등을 안내합니다.",
          "교사 측 문제(화면 공유 실패 등)는 교사에게 직접 연락해 함께 해결합니다.",
          "현장에서 바로 풀기 어려운 계정·결제·기기 호환성 문제는 별도 지원 채널로 넘겨 기록을 남깁니다.",
        ],
      },
      {
        heading: "흔한 실수와 운영 팁",
        body: "모니터링은 도입 초기에 운영 습관을 잘못 들이면 신뢰를 잃거나 효과를 못 내기 쉽습니다. 아래 실수를 미리 피해 두면 '문제를 빨리 돕는 도구'로 자리 잡습니다.",
        steps: [
          "상시 들여다보기로 운영하지 않습니다. 점검 시간대를 정해 두고 그 외에는 신고 기반으로 움직입니다.",
          "교사 평가 근거로 쓰지 않습니다. 모니터링 데이터는 운영 지원과 문제 해결 용도로만 사용합니다.",
          "사전 안내를 건너뛰지 않습니다. 관리자가 들어가도 알림이 없는 만큼, 목적과 범위를 미리 공유해 두는 것이 신뢰를 지키는 핵심입니다.",
          "관리자 권한을 폭넓게 열어두지 않습니다. 모니터링이 필요한 담당자에게만 권한을 부여합니다.",
          "출석·접속 같은 운영 데이터와, 학습 결과·성적 분석은 구분합니다. 후자는 통계·리포트 기능에서 따로 봅니다.",
        ],
      },
      {
        heading: "함께 보면 좋은 운영 흐름",
        body: "수업 모니터링은 실시간 대응에 강하지만, 기간별 추세나 누적 통계를 보는 도구는 아닙니다. 수업 전·후 운영과 이어서 보면 전체 흐름이 매끄러워집니다.",
        steps: [
          "수업 개설·배정 등 사전 운영은 '코스 관리'에서 점검합니다.",
          "지난 수업의 다시보기·라이브 기록은 '웹 라이브 & 플레이백'에서 확인합니다.",
          "기간별 수업 횟수, 출석 추세 등 누적 통계는 '통계 데이터 활용'에서 Excel로 받아 봅니다.",
          "고급 학습 분석·맞춤 리포트가 필요하면 현재 기능으로 단정하지 말고 별도 시스템 연동 여부를 상담으로 확인합니다.",
        ],
      },
    ],
    relatedSlugs: ["course-management", "web-live-playback", "statistics-data"],
  },
  {
    slug: "statistics-data",
    category: "admin",
    title: "통계 데이터 활용",
    description: "충전제 포인트 차감 내역과 기간별 수업·스토리지 통계 데이터를 Excel로 다운로드해 운영에 활용하는 방법을 안내합니다.",
    audience: "학원 관리자, 운영팀",
    updatedAt: "2026-05-14",
    readMinutes: 5,
    tags: ["통계", "엑셀", "주문 세부정보", "충전제"],
    keywords: ["주문 세부정보", "포인트 차감", "통계 다운로드", "엑셀", "수업 횟수", "스토리지 소비"],
    chatbotSummary: "관리자 통계는 수업 시스템 OS가 쌓아둔 운영 기록을 한곳에서 보는 창입니다. 충전제를 쓰는 학원은 조건 검색으로 기간 내 포인트 차감 내역을 확인하고, 통계 다운로드로 수업 횟수·스토리지 소비를 Excel로 받습니다. 데이터에는 수업일자·지속시간·담당 교사·출석 학생 정보가 담겨, 출결 추세·교사별 수업량·스토리지 증가를 운영 판단에 씁니다. 단, 정산 자료나 고급 학습 분석으로 단정하기보다 회계·LMS 시스템과 교차 점검하세요.",
    sections: [
      {
        heading: "관리자 통계가 운영에서 하는 일",
        body: "관리자 통계는 별도 보고서를 받아 적는 기능이 아니라, 수업 시스템 OS가 수업 전·중·후 흐름에서 자동으로 쌓아둔 기록을 권한 기반으로 들여다보는 창입니다. 교사가 진행한 수업, 출석한 학생, 충전제 포인트 차감, 녹화·자료가 쌓인 스토리지가 같은 데이터로 연결돼 있어, 따로 집계표를 만들지 않아도 운영 현황을 한 화면에서 확인하고 의사결정의 근거로 쓸 수 있습니다.",
        steps: [
          "교사별·기간별 수업 횟수로 강사 운영 부하와 폐강 여부를 가늠합니다.",
          "출석 학생 인원 추세로 반별 참여율 변화와 이탈 신호를 먼저 봅니다.",
          "스토리지 소비 추이로 녹화·자료 용량 증가를 미리 예측합니다.",
          "충전제 포인트 차감 내역으로 사용량 대비 잔여를 점검합니다.",
        ],
      },
      {
        heading: "주문 세부정보(포인트 차감) 확인하기",
        body: "과금 유형 중 충전제를 사용하는 학원(기관)은 조건 검색으로 기간 내 포인트 차감 내역을 확인할 수 있습니다. 어떤 수업과 기능에서 포인트가 빠져나갔는지 단위로 보이기 때문에, 사용량이 예상보다 빠르게 늘 때 원인을 좁혀 보는 출발점이 됩니다. 충전제가 아닌 과금 유형이라면 이 화면 대신 계약 기준으로 안내되므로, 우리 학원의 과금 방식이 헷갈리면 상담으로 확인하세요.",
        steps: [
          "관리자 화면에서 주문/포인트 관련 메뉴로 이동합니다.",
          "조회할 기간과 조건을 설정해 차감 내역을 검색합니다.",
          "차감이 몰린 항목과 날짜를 확인해 사용량 흐름을 읽습니다.",
          "잔여 포인트가 빠르게 줄면 충전 시점을 미리 계획합니다.",
        ],
      },
      {
        heading: "통계 데이터 Excel로 다운로드하기",
        body: "특정 기간의 수업 횟수, 스토리지 소비 현황 등 통계 데이터를 Excel 형식으로 다운로드할 수 있습니다. 다운로드한 파일에서는 수업일자, 수업 지속 시간, 담당 교사, 출석 학생 인원 등 세부 항목을 행 단위로 확인할 수 있어, 화면에서 보는 요약보다 더 깊게 비교·정리하기 좋습니다.",
        steps: [
          "관리자 화면에서 통계 메뉴로 이동합니다.",
          "조회할 기간 등 조건을 먼저 설정합니다.",
          "통계 데이터를 Excel 형식으로 다운로드합니다.",
          "수업일자·지속시간·담당 교사·출석 학생 정보를 확인합니다.",
          "월·반·교사 등 같은 기준으로 시트를 나눠 비교용으로 정리합니다.",
        ],
      },
      {
        heading: "받은 데이터로 운영 판단하기",
        body: "통계는 다운로드가 끝이 아니라 해석이 시작입니다. 숫자 하나로 결론을 내리기보다, 같은 기준으로 기간을 나눠 추세를 보고 다른 운영 기록과 맞춰 보는 것이 안전합니다. 아래는 현장에서 자주 쓰는 활용 시나리오입니다.",
        steps: [
          "출석 점검: 반별 출석 학생 인원을 주 단위로 비교해 참여가 꾸준히 줄어드는 반을 먼저 찾아 상담·보강을 준비합니다.",
          "강사 운영: 교사별 수업 횟수와 지속 시간을 보고 특정 강사에게 수업이 몰리거나 비는 구간을 조정합니다.",
          "용량 계획: 스토리지 소비 증가 속도로 다음 분기 용량을 예측하고, 정리·아카이브 시점을 미리 잡습니다.",
          "포인트 관리: 충전제 차감 추세로 사용량이 가파른 달을 식별하고 충전 주기를 운영 일정에 반영합니다.",
        ],
      },
      {
        heading: "정기 점검 루틴과 해석 기준",
        body: "통계는 가끔 몰아보기보다 짧은 주기로 같은 항목을 보는 편이 변화를 빨리 잡습니다. 한 번 본 숫자를 기록해 두고 다음 점검 때 같은 기준으로 비교하면, 절대값보다 '늘었는지 줄었는지'가 또렷하게 보입니다.",
        steps: [
          "매주: 반별 출석 인원과 수업 횟수를 빠르게 훑어 급격한 감소가 있는 반을 표시합니다.",
          "매월: 교사별 수업량과 스토리지 소비를 Excel로 받아 지난달과 같은 기준으로 비교합니다.",
          "분기: 출석·용량·포인트 추세를 묶어 다음 분기 충전·정리·증원 계획에 반영합니다.",
          "해석 기준: 한 주의 단발 수치보다 3주 이상 이어지는 방향성을 신뢰하고, 시험·방학 등 이벤트가 낀 기간은 따로 표시해 둡니다.",
        ],
      },
      {
        heading: "흔한 실수와 정직한 한계",
        body: "통계를 운영 근거로 쓸 때 자주 어긋나는 지점을 미리 알아 두면 잘못된 판단을 줄일 수 있습니다. 특히 이 데이터로 다룰 수 있는 범위와 다룰 수 없는 범위를 구분하는 것이 중요합니다.",
        steps: [
          "기간 조건을 빼고 비교하지 마세요. 주·월 단위처럼 같은 길이의 기간으로 맞춰야 추세가 의미를 가집니다.",
          "출석 학생 인원을 학습 성취로 단정하지 마세요. 참여 신호일 뿐, 학습 결과는 LMS의 과제·성적과 함께 봐야 합니다.",
          "포인트 차감 내역을 정산 자료로 바로 쓰지 마세요. 회계·결제 정산은 약한 영역이라, 정확한 금액은 회계 시스템과 교차 확인하거나 상담으로 점검합니다.",
          "오프라인 출석·고급 학습 분석을 이 통계만으로 채우려 하지 마세요. 오프라인 출결이나 정교한 학습 리포트가 필요하면 별도 시스템 연동 여부를 상담으로 확인하는 편이 정확합니다.",
          "다운로드 파일에는 학생 정보가 포함되므로, 권한 있는 담당자만 보관·공유하고 외부 전달 시 마스킹·접근 관리를 적용합니다.",
        ],
      },
    ],
    relatedSlugs: ["storage-management", "course-management", "class-monitoring"],
  },
  {
    slug: "teacher-profile",
    category: "teacher",
    title: "클래스인 프로필 설정",
    description: "프로필 사진과 닉네임을 PC와 모바일에서 설정하고, 학원 안에서 강사를 일관되게 식별할 수 있도록 닉네임 규칙을 정하는 방법을 안내합니다. 프로필 이름은 교실 명단·녹화·보고서에 그대로 노출되므로, 처음에 기준을 잡아두면 수업 운영 전반이 깔끔해집니다.",
    audience: "수업을 진행하는 강사",
    updatedAt: "2026-05-14",
    readMinutes: 4,
    featured: true,
    tags: ["프로필", "계정 설정", "시작하기"],
    keywords: ["프로필", "닉네임", "프로필 사진", "계정", "개인정보", "모바일 앱", "강사 식별", "닉네임 규칙", "녹화 이름", "보고서 이름"],
    chatbotSummary: "클래스인 좌측 하단의 [기본 프로필]을 눌러 계정 및 설정 팝업을 연 뒤 [개인정보]에서 사진과 닉네임을 수정하면 됩니다. 모바일 Classin 앱에서도 동일하게 변경할 수 있습니다. 닉네임은 교실 명단·녹화·보고서에 그대로 보이므로, 학원에서 강사 표기 규칙(예: 과목+이름)을 먼저 정한 뒤 통일하는 것이 좋습니다.",
    sections: [
      {
        heading: "프로필이 수업 운영에 미치는 영향",
        body: "프로필 사진과 닉네임은 단순한 개인 설정이 아니라 수업 시스템 전체에서 강사를 식별하는 기준입니다. 교실 참가자 명단, 채팅 발신자, 자동 녹화 영상, 학습 보고서, 관리자 운영 화면까지 같은 닉네임이 그대로 따라다니기 때문에, 처음에 한 번 정리해 두면 수업 전·중·후 모든 화면에서 누가 진행한 수업인지 헷갈릴 일이 줄어듭니다.",
        steps: [
          "수업 전: 학생이 코스 참가자 명단에서 담당 강사를 바로 알아봅니다.",
          "수업 중: 채팅·판서·발표 권한 부여 시 발신자와 진행자가 닉네임으로 표시됩니다.",
          "수업 후: 자동 녹화 영상과 학습 보고서에 진행 강사 이름이 그대로 남습니다.",
          "운영 관리: 관리자가 운영 데이터에서 강사별 수업을 권한 범위 안에서 구분해 봅니다.",
        ],
      },
      {
        heading: "PC에서 프로필 설정하기",
        body: "PC 클래스인 클라이언트에서 좌측 하단 프로필 영역을 클릭하면 개인정보를 빠르게 수정할 수 있습니다. 변경 내용은 저장하는 순간 다른 사용자 화면에도 반영되므로, 수업이 진행 중일 때보다는 수업 사이 시간에 정리하는 것이 안전합니다.",
        steps: [
          "좌측 하단의 [기본 프로필]을 클릭합니다.",
          "계정 및 설정 팝업이 열리면 [개인정보] 탭으로 이동합니다.",
          "프로필 사진을 올리고, 닉네임을 학원에서 정한 표기 규칙에 맞게 입력합니다.",
          "변경 사항을 저장한 뒤, 교실 참가자 명단에서 어떻게 보이는지 한 번 확인합니다.",
        ],
      },
      {
        heading: "모바일에서 프로필 설정하기",
        body: "모바일 Classin 앱(휴대폰·태블릿)에서도 동일하게 프로필을 변경할 수 있어, PC가 없는 상황에서도 사진이나 닉네임을 빠르게 정리할 수 있습니다. PC와 모바일은 같은 계정을 보는 것이므로, 한쪽에서 바꾸면 다른 쪽에도 그대로 반영됩니다.",
        steps: [
          "모바일 Classin 앱에 로그인한 뒤 프로필 영역으로 진입합니다.",
          "프로필 사진과 닉네임을 수정합니다.",
          "저장 후, PC 클라이언트에서도 동일하게 반영되었는지 확인합니다.",
        ],
      },
      {
        heading: "학원 안에서 통하는 닉네임 규칙 정하기",
        body: "강사가 늘어날수록 닉네임이 제각각이면 학생도, 관리자도 누가 누구인지 헷갈리게 됩니다. 개인이 임의로 정하기보다 학원 차원에서 표기 규칙을 하나 정해 두고 신규 강사 온보딩 때 함께 안내하는 편이 운영이 깔끔합니다. 정답이 정해진 것은 아니지만, 아래처럼 식별이 쉬운 형태를 권장합니다.",
        steps: [
          "기본 형태를 하나 정합니다. 예: '실명' 또는 '과목+실명'(수학 김민지)처럼 학생이 바로 알아보는 형태가 좋습니다.",
          "별명·이니셜·이모티콘만으로 된 닉네임은 피합니다. 녹화·보고서에서 누구인지 추적하기 어려워집니다.",
          "동명이인이 있으면 구분자를 더합니다. 예: '김민지(중등)', '김민지A'처럼 명단에서 바로 갈리도록 합니다.",
          "프로필 사진은 얼굴이나 학원 기준 이미지로 통일하면, 명단·녹화 썸네일에서 강사를 빠르게 구분할 수 있습니다.",
          "정한 규칙은 온보딩 안내나 내부 공지로 남겨, 신규 강사도 같은 형식으로 설정하도록 합니다.",
        ],
      },
      {
        heading: "흔한 실수와 점검 포인트",
        body: "프로필은 한 번 설정하면 신경을 덜 쓰게 되지만, 잘못 두면 녹화·보고서를 나중에 다시 정리해야 하는 번거로움이 생깁니다. 아래 항목은 설정 직후 한 번씩 확인해 두면 좋습니다.",
        steps: [
          "수업 직전에 닉네임을 바꾸지 마세요. 진행 중이거나 곧 시작할 수업의 표시 이름이 바뀌어 학생이 혼란스러울 수 있습니다.",
          "녹화나 보고서에 남은 이름은 보통 그 시점의 닉네임을 따릅니다. 과거 영상의 표기를 일괄로 바꾸기는 어려우니, 처음에 규칙을 맞춰두는 것이 가장 깔끔합니다.",
          "개인 계정 닉네임과 학원에서 부여한 계정 정보가 다를 수 있습니다. 표시 이름이 의도와 다르게 나오면 임의로 계속 바꾸기보다 기관 관리자에게 계정 설정을 확인하세요.",
          "프로필 사진에는 학생·동료가 함께 보는 화면에 부적절한 이미지를 쓰지 마세요. 명단·녹화에 그대로 노출됩니다.",
          "변경 후에는 실제 교실에 한 번 들어가 참가자 명단에 표시되는 이름과 사진을 눈으로 확인하는 것을 마지막 단계로 두세요.",
        ],
      },
    ],
    relatedSlugs: ["classroom-basic-setup", "drive-materials"],
  },
  {
    slug: "drive-materials",
    category: "teacher",
    title: "드라이브 - 수업 자료 관리",
    description: "내 드라이브와 공유 드라이브를 활용해 PPT, PDF, 영상 등 수업 자료를 한 곳에서 관리하고 코스에서 바로 활용하는 방법을 정리했습니다.",
    audience: "수업을 진행하는 강사",
    updatedAt: "2026-05-14",
    readMinutes: 4,
    tags: ["드라이브", "수업 자료", "파일 관리"],
    keywords: ["드라이브", "수업 자료", "내 드라이브", "공유 드라이브", "리소스 라이브러리", "문제 은행", "TeacherIn", "FlowIn", "NOBOOK", "Google Drive", "hwp"],
    chatbotSummary: "좌측 메뉴바의 [드라이브]에서 내 드라이브와 공유 드라이브, 리소스 라이브러리, 문제 은행 등을 활용해 수업 자료를 업로드·정리할 수 있습니다. HWP는 지원하지 않으므로 PDF로 변환해 사용하세요.",
    sections: [
      {
        heading: "드라이브 메뉴 한눈에 보기",
        body: "좌측 메뉴바의 [드라이브] 버튼을 클릭하면 최근 열람한 문서, 내 드라이브, 공유 드라이브, 리소스 라이브러리, 문제 은행, TeacherIn, FlowIn, NOBOOK, Google Drive 등 다양한 자료 공간을 확인할 수 있습니다.",
      },
      {
        heading: "내 드라이브에 자료 업로드하기",
        body: "수업과 과정 탭의 학습 활동에서 사용할 자료를 미리 업로드해 두면 수업 진행이 한결 수월합니다. PPT, Word, Excel, PDF, JPG, PNG, BMP, MP3, MP4, TXT, EDB 등 다양한 파일을 지원하지만 HWP(한글) 파일은 호환되지 않습니다.",
        steps: [
          "좌측 메뉴바에서 [드라이브] → [내 드라이브]로 이동합니다.",
          "[업로드] 버튼을 누르거나 파일을 드래그&드롭합니다.",
          "업로드한 자료를 폴더로 정리해 학습 활동에서 손쉽게 불러옵니다.",
        ],
      },
      {
        heading: "공유 드라이브 활용하기",
        body: "소속 기관(학원)의 공유 드라이브에 접근하면 관리자 권한 설정에 따라 자료를 열람·다운로드·업로드할 수 있습니다. 권한이 부족하다면 기관 관리자에게 문의하세요.",
      },
      {
        heading: "자주 묻는 질문",
        body: "한글(.hwp) 파일은 지원하지 않으므로 PDF로 변환 후 업로드해야 합니다. 업로드가 반복적으로 실패한다면 내 드라이브와 공유 드라이브 구분, 용량 상한, 공유 드라이브 권한을 차례로 확인하세요.",
      },
    ],
    relatedSlugs: ["course-create", "course-activities", "classroom-basic-setup"],
  },
  {
    slug: "course-create",
    category: "teacher",
    title: "코스 - 생성·설정·구성·삭제",
    description: "하나의 반(class) 단위로 동작하는 코스를 만들고, 음소거·알림·게시판·AI 에이전트 등 세부 옵션을 설정하며, 폐강까지 처리하는 전체 흐름을 안내합니다.",
    audience: "수업을 진행하는 강사",
    updatedAt: "2026-05-14",
    readMinutes: 5,
    tags: ["코스", "반 관리", "폐강"],
    keywords: ["코스", "코스 만들기", "코스 설정", "코스 종료", "폐강", "게시판", "AI 에이전트", "수업 계획", "구성원"],
    chatbotSummary: "첫 화면의 [코스 만들기]로 코스를 생성하고, 코스 이름을 눌러 설정 팝업에서 알림·게시판·AI 에이전트 등을 조정할 수 있습니다. 종료 시에는 설정 팝업 하단의 [코스 종료]를 통해 폐강할 수 있습니다.",
    sections: [
      {
        heading: "코스 생성하기",
        body: "코스는 하나의 반(class)으로 이해하면 됩니다. 코스를 만들면 실시간 수업, 과제, 시험 등 다양한 학습 활동을 한 공간에서 관리할 수 있습니다.",
        steps: [
          "첫 화면의 [코스 만들기] 버튼을 클릭합니다.",
          "팝업 창에서 소속 학교(기관)를 선택합니다.",
          "코스 명칭을 입력하고 생성 완료합니다.",
        ],
      },
      {
        heading: "코스 설정 조정하기",
        body: "코스 이름을 클릭하면 설정 팝업이 열리며 음소거, 알림, 게시판, AI 에이전트 등 세부 옵션을 활성화·비활성화할 수 있습니다.",
        steps: [
          "코스 목록에서 해당 코스 이름을 클릭합니다.",
          "설정 팝업에서 필요한 옵션을 확인합니다.",
          "음소거, 알림, 게시판, AI 에이전트 등을 코스 성격에 맞게 조정합니다.",
        ],
      },
      {
        heading: "코스 구성 살펴보기",
        body: "좌측 메뉴에는 과정·게시판·AI 튜터·AI 평가가, 중간 영역에는 수업 계획·학습 계획·학습 활동이, 우측 메뉴에는 구성원·공지사항·채팅·할 일 알림이 배치되어 한눈에 운영 상태를 확인할 수 있습니다.",
      },
      {
        heading: "코스 삭제(폐강)하기",
        body: "학사 일정이 끝난 코스는 폐강 처리하여 정리할 수 있습니다. 폐강 시에는 코스 이름을 직접 입력해 확정합니다.",
        steps: [
          "코스 이름을 클릭해 설정 팝업을 엽니다.",
          "설정 팝업 하단의 [코스 종료] 버튼을 클릭합니다.",
          "세부 설정 옵션을 확인합니다.",
          "코스 명칭을 입력하거나 [자동 입력] 버튼을 사용합니다.",
          "[확인] 버튼을 눌러 폐강을 완료합니다.",
        ],
      },
    ],
    relatedSlugs: ["course-members", "course-units", "course-activities"],
  },
  {
    slug: "course-members",
    category: "teacher",
    title: "코스 - 구성원 초대, 변경, 퇴장",
    description: "코스 생성 후 조교 선생님과 학생을 초대하고, 교사/학생 역할을 바꾸거나 강제 퇴장 처리하는 운영 절차를 정리했습니다.",
    audience: "수업을 진행하는 강사",
    updatedAt: "2026-05-14",
    readMinutes: 4,
    tags: ["코스", "구성원", "초대", "역할 관리"],
    keywords: ["구성원 초대", "링크 초대", "QR 코드", "교사로 설정", "멤버 삭제", "조교", "역할 변경", "코스 ID"],
    chatbotSummary: "코스 우측 상단 [구성원]에서 연락처, 링크, QR 코드 중 하나로 초대할 수 있습니다. 멤버 우측의 상세 메뉴(...)에서 [교사로 설정]으로 역할 변경, [멤버 삭제]로 강제 퇴장을 처리합니다.",
    sections: [
      {
        heading: "구성원 초대하기",
        body: "코스가 만들어지면 조교 역할의 선생님과 학생들을 다양한 방법으로 초대할 수 있습니다. 링크 초대 시에는 코스 ID가 함께 복사되어 다이나믹 아일랜드의 돋보기 아이콘으로 검색해 참여할 수도 있습니다.",
        steps: [
          "코스에 입장한 뒤 우측 상단의 [구성원] 메뉴를 클릭합니다.",
          "팝업창에서 [구성원 초대] 버튼을 클릭합니다.",
          "연락처(친구 목록), 링크 초대, QR 코드 초대 중 적절한 방법을 선택합니다.",
          "초대 메시지·코드를 학생/조교에게 전달합니다.",
        ],
      },
      {
        heading: "역할 변경하기 (학생 ↔ 교사)",
        body: "초대 이후에도 학생을 교사(조교)로 승격하거나, 반대로 변경할 수 있습니다.",
        steps: [
          "코스 구성원 및 그룹 구성 팝업창을 엽니다.",
          "역할을 변경할 구성원 우측의 상세 메뉴(...)를 클릭합니다.",
          "[교사로 설정] 또는 [학생으로 설정]을 클릭해 역할을 전환합니다.",
        ],
      },
      {
        heading: "구성원 강제 퇴장시키기",
        body: "교사 퇴사나 학생 수강 종료 등 더 이상 참여가 필요 없는 경우 강제 퇴장 처리할 수 있습니다.",
        steps: [
          "코스 구성원 및 그룹 구성 팝업창을 엽니다.",
          "퇴장시킬 구성원 우측의 상세 메뉴(...)를 클릭합니다.",
          "[멤버 삭제]를 클릭하여 코스에서 제외합니다.",
        ],
      },
    ],
    relatedSlugs: ["course-create", "course-units", "course-activities"],
  },
  {
    slug: "course-units",
    category: "teacher",
    title: "코스 - 과정·단원·수업 추가",
    description: "코스 > 과정 > 단원 > 학습 활동(수업·숙제·토론)으로 이어지는 계층 구조 안에서 과정·단원·수업을 추가하고 옵션을 설정하는 방법을 안내합니다.",
    audience: "수업을 진행하는 강사",
    updatedAt: "2026-05-14",
    readMinutes: 6,
    tags: ["코스", "과정", "단원", "수업 추가", "스테이지"],
    keywords: ["과정 추가", "단원 추가", "수업 추가", "기본 단원", "하이브리드 수업", "스테이지", "온스테이지", "녹화", "수업 준비"],
    chatbotSummary: "과정 탭의 [+]로 과정을 만들고, 코스 페이지 [새로 만들기] → [+ 단원]으로 단원을, [수업]으로 실시간 수업을 추가할 수 있습니다. 수업 추가 시 교사/조교, 하이브리드 수업, 스테이지, 온스테이지 인원, 수업 녹화와 현장 녹화 옵션 등을 설정합니다.",
    sections: [
      {
        heading: "과정 추가하기",
        body: "코스 내부를 학기·과정·과목·영역 단위로 분류하기 위해 과정을 추가합니다. 25년 1·2학기, 정규/특강, 영어/과학/수학, Reading·Listening·Speaking처럼 다양한 기준을 활용할 수 있습니다.",
        steps: [
          "좌측 상단의 과정 탭 우측 [+] 버튼을 클릭합니다.",
          "과정명을 입력하고 생성합니다.",
          "우측 버튼을 통해 상세 설정을 편집합니다.",
        ],
      },
      {
        heading: "단원 추가하기",
        body: "학습 활동을 단원(unit) 단위로 묶어 관리합니다. 단원을 추가하지 않은 채 학습 활동을 게시하면 '기본 단원'이 자동으로 생성되며, 이후에도 수정할 수 있습니다.",
        steps: [
          "[코스]를 클릭합니다.",
          "코스 페이지 중간의 [새로 만들기]를 클릭합니다.",
          "학습 활동 추가 팝업에서 [+ 단원]을 선택합니다.",
          "단원명과 설명을 작성합니다.",
          "[게시] 버튼을 눌러 단원을 등록합니다.",
        ],
      },
      {
        heading: "수업 추가하기",
        body: "수업은 실시간 라이브 진행과 동시 녹화를 지원합니다. 일정에 맞춰 시간을 잡고 교사/조교, 하이브리드 수업, 스테이지 표시, 온스테이지 인원, 자동 온스테이지, 수업 녹화와 현장 녹화 옵션을 설정합니다. 온스테이지 인원은 1v0~1v12 형식이며 좌측이 강사, 우측이 학생 수입니다. 칠판 중심 수업은 수업 녹화 ON을 기본으로 두고, 패드 수업이나 원격 학생이 없는 순수 현장 칠판 수업은 1v0 구성이 자연스럽습니다.",
        steps: [
          "[학습 활동 추가하기]에서 [수업]을 선택합니다.",
          "수업 일정에 맞춰 시작·종료 시간을 설정합니다.",
          "교사와 조교를 지정합니다(조교는 카메라·마이크 노출을 끌 수 있음).",
          "하이브리드 수업, 스테이지 표시, 온스테이지 인원(예: 1v6), 학생 자동 온스테이지 여부를 설정합니다.",
          "Classin 수업 녹화는 기본 복습/다시보기용으로 켜고, 실제 교실 카메라 뷰나 트래킹 뷰가 필요하면 현장 녹화를 병행합니다.",
        ],
      },
      {
        heading: "수업 확인하기",
        body: "등록한 수업은 코스 내 학습 활동 탭에 자동 동기화됩니다. 임박한 수업은 [할 일] 탭이나 최상단 [다이나믹 아일랜드]에 표시되며, [수업 준비] 버튼으로 준비실에 들어가 환경을 미리 점검할 수 있습니다. 준비실은 학생이 입장할 수 없는 연습 공간입니다.",
      },
      {
        heading: "수업 입장과 요금 안내",
        body: "교사는 설정 시간 20분 전, 학생은 10분 전부터 입장할 수 있으며, 수업 시각 앞·뒤로 제공되는 20분의 준비 시간은 유료로 청구되지 않습니다.",
      },
    ],
    relatedSlugs: [
      "lesson-option-concepts",
      "course-create",
      "course-members",
      "course-activities",
      "classroom-basic-setup",
    ],
  },
  {
    slug: "lesson-option-concepts",
    category: "teacher",
    title: "수업 생성 옵션 오개념 정리",
    description: "수업 녹화, 현장 녹화, 온스테이지, 하이브리드 수업, 개인 칠판을 강사가 헷갈리지 않도록 정리한 기준 가이드입니다.",
    audience: "신규 강사, 수업 운영팀, ClassIn 수업 세팅 담당자",
    updatedAt: "2026-06-16",
    readMinutes: 6,
    featured: true,
    tags: ["수업 설정", "수업 녹화", "현장 녹화", "온스테이지", "하이브리드 수업", "개인 칠판"],
    keywords: [
      "수업 생성 옵션",
      "수업 녹화",
      "현장 녹화",
      "녹화 수업",
      "다시보기",
      "온스테이지",
      "학생 자동 온스테이지",
      "스테이지 표시",
      "하이브리드 수업",
      "칠판 화면",
      "현장 카메라",
      "트래킹 뷰",
      "개인 칠판",
      "그림판",
      "배포",
      "BYOD",
      "1v0",
      "1v6",
    ],
    chatbotSummary: "ClassIn 수업 녹화는 온라인·오프라인 여부와 무관하게 칠판·자료·교실 화면을 남기는 기본 복습/다시보기용 녹화입니다. 현장 녹화는 기본 수업 녹화와 병행해 실제 교실 카메라 뷰나 트래킹 뷰를 따로 남기는 옵션이고, 다시보기에서 두 뷰를 선택해 볼 수 있습니다. 온스테이지는 상단 고정 카메라 레이아웃이며 학생 자동 온스테이지는 슬롯 자동 배치로 이해하되 카메라·마이크 강제 ON으로 설명하지 않습니다. 하이브리드 수업 토글은 학생이 칠판 화면과 현장 카메라 화면 중 원하는 뷰를 선택하게 하는 기능입니다.",
    sections: [
      {
        heading: "먼저 구분해야 하는 것",
        body: "수업 생성 화면의 옵션은 이름이 비슷해 보여도 목적이 다릅니다. 특히 수업 녹화, 현장 녹화, 녹화 수업은 서로 다른 개념으로 설명해야 합니다.",
        steps: [
          "수업 녹화는 지금 진행하는 ClassIn 교실의 칠판·자료·교실 화면을 남기는 기본 녹화입니다.",
          "현장 녹화는 실제 교실 카메라 뷰나 트래킹 뷰를 수업 녹화와 별도로 남기는 병행 옵션입니다.",
          "녹화 수업은 이미 만들어진 영상 자료를 학생에게 학습 활동으로 올리는 메뉴입니다.",
          "수업 녹화와 현장 녹화 결과물은 다시보기에서 따로 선택해 볼 수 있습니다.",
        ],
      },
      {
        heading: "수업 녹화와 현장 녹화",
        body: "수업 녹화는 온라인 수업 전용 옵션이 아닙니다. 현장 수업에서도 칠판 중심 복습 자료를 남기기 위해 기본으로 많이 켭니다. 현장 녹화는 이것을 대체하는 옵션이 아니라, 현장 뷰나 트래킹 카메라 뷰를 함께 남기고 싶은 경우 병행합니다.",
        steps: [
          "기본 복습/다시보기 자료가 필요하면 수업 녹화를 켭니다.",
          "실제 교실 분위기, 강사 움직임, 카메라 트래킹 뷰까지 남기려면 현장 녹화를 추가로 켭니다.",
          "ClassIn 교실 안에서 카메라를 켠 경우 수업 녹화 화면 레이아웃에 카메라 영역이 함께 보일 수 있습니다.",
          "현장 녹화는 연결된 웹캠·외장 카메라·트래킹 카메라 화면을 별도 뷰로 남깁니다.",
        ],
      },
      {
        heading: "온스테이지와 스테이지 표시",
        body: "온스테이지는 학생이나 교사를 화면 상단의 고정 카메라 레이아웃에 올리는 개념입니다. Zoom처럼 화면 위에 고정되는 영역으로 이해하면 쉽고, 필요하면 학생이나 교사가 이 영역을 숨기거나 작게 표시할 수 있습니다.",
        steps: [
          "온스테이지 인원수는 1v0, 1v6처럼 표기하며 좌측 숫자는 교사, 우측 숫자는 학생 수입니다.",
          "패드 수업이나 원격 학생이 없는 순수 현장 칠판 수업은 온스테이지 1v0 구성이 자연스럽습니다.",
          "학생 자동 온스테이지는 학생을 온스테이지 슬롯에 자동 배치하는 설정으로 설명합니다.",
          "학생 자동 온스테이지를 카메라·마이크가 강제로 켜지는 기능이라고 설명하지 않습니다.",
          "스테이지 표시를 끄거나 줄이면 칠판과 자료 화면을 더 넓게 볼 수 있습니다.",
        ],
      },
      {
        heading: "하이브리드 수업 토글",
        body: "하이브리드 수업은 운영상으로는 온·오프라인 병행 수업을 뜻하지만, 수업 생성 화면의 기능명으로는 별도 토글입니다. 이 토글을 켜면 학생이 실시간으로 칠판 화면과 현장 카메라 화면 중 원하는 뷰를 선택해서 볼 수 있습니다.",
        steps: [
          "원격 학생에게 칠판 화면과 현장 화면을 모두 보여줘야 하는 수업에서 사용합니다.",
          "현장 카메라나 트래킹 뷰까지 함께 운영하려면 현장 녹화 또는 카메라 세팅을 같이 확인합니다.",
          "하이브리드 수업 토글 하나만으로 온·오프라인 병행 운영 전체가 자동으로 해결된다고 설명하지 않습니다.",
        ],
      },
      {
        heading: "개인 칠판과 BYOD 활용",
        body: "개인 칠판은 학생이 패드나 개인 기기로 문제를 풀고, 교사가 여러 학생의 풀이를 한 화면에서 확인하며 피드백이나 상점을 줄 수 있는 고활용 시나리오입니다. 단순 화상수업보다 ClassIn의 수업 운영 장점이 잘 드러나는 영역입니다.",
        steps: [
          "교실 안에서 칠판을 엽니다.",
          "수업 도구를 선택합니다.",
          "개인 칠판을 엽니다.",
          "그림판을 선택합니다.",
          "학생에게 문제를 배포합니다.",
          "학생 풀이를 확인하고 필요한 학생에게 피드백이나 상점을 줍니다.",
        ],
      },
      {
        heading: "기본 추천값",
        body: "처음 강사를 안내할 때는 기능을 많이 켜기보다 기본값을 짧게 잡아 주는 편이 좋습니다.",
        steps: [
          "복습/다시보기가 필요하면 수업 녹화 ON을 기본으로 안내합니다.",
          "현장 뷰나 트래킹 뷰가 필요한 수업은 현장 녹화를 병행합니다.",
          "패드 수업이나 원격 학생이 없는 순수 현장 칠판 수업은 온스테이지 1v0부터 시작합니다.",
          "원격 학생이 현장 카메라 화면을 선택해서 봐야 하면 하이브리드 수업 토글을 확인합니다.",
        ],
      },
    ],
    relatedSlugs: [
      "course-units",
      "classroom-basic-setup",
      "lesson-web-live",
      "course-activities",
      "class-join-replay",
    ],
  },
  {
    slug: "course-activities",
    category: "teacher",
    title: "코스 - 학습 활동 추가",
    description: "녹화 수업, 숙제, 일일 과제, 시험, OMR, 토론, 학습 자료, AI 스피킹 등 다양한 학습 활동을 코스에 추가하고 AI 자동 생성까지 활용하는 방법을 정리했습니다.",
    audience: "수업을 진행하는 강사",
    updatedAt: "2026-06-16",
    readMinutes: 8,
    tags: ["학습 활동", "과제", "시험", "AI", "OMR", "토론"],
    keywords: [
      "학습 활동",
      "활동 게시하기",
      "녹화 수업",
      "숙제",
      "일일 과제",
      "시험",
      "OMR",
      "OMR 카드",
      "토론",
      "학습 자료",
      "SCORM",
      "AI 스피킹",
      "따라읽기",
      "받아쓰기",
      "외워말하기",
      "선행 학습 조건",
      "AI로 숙제 작성",
      "AI 출제",
      "AI 채점",
      "문제 은행",
      "시청 가능 횟수",
      "플레이바 드래그",
    ],
    chatbotSummary: "코스의 [새로 만들기] 또는 활동 게시하기에서 수업·숙제·시험·녹화 수업·학습 자료·일일 과제·토론·OMR 카드·SCORM과 영어/중국어 AI 활동을 추가할 수 있습니다. 숙제는 AI로 작성하거나 AI 채점을 켤 수 있고, 시험은 문제 은행·문제 추가·대량 추가·AI 출제를 지원합니다. OMR 카드는 객관식·다중 선택·참/거짓·빈칸·서술형을 추가할 수 있으며, 녹화 수업은 재생 속도·플레이바·시청 횟수·토론 공간·저작권 보호 같은 시청 옵션을 설정합니다.",
    sections: [
      {
        heading: "활동 게시하기 메뉴에서 보이는 유형",
        body: "코스 안에서 활동을 추가할 때는 일반 활동과 AI 기반 어학 활동으로 나뉩니다. 이름이 비슷한 '수업 녹화'와 '녹화 수업'은 다른 개념이므로 구분해서 안내해야 합니다.",
        steps: [
          "일반 활동: 수업, 숙제, 시험, 녹화 수업, 학습 자료, 일일 과제, 토론, OMR 카드, SCORM",
          "AI 기반 영어 교육: 따라읽기, 받아쓰기, 외워말하기",
          "AI 기반 중국어 교육: 따라읽기, 받아쓰기, 외워말하기",
          "녹화 수업은 이미 만들어진 영상을 올리는 학습 활동이고, 수업 녹화는 실제 수업 화면을 다시보기용으로 남기는 설정입니다.",
        ],
      },
      {
        heading: "모든 학습 활동의 공통 설정",
        body: "활동 종류와 무관하게 배포 전에는 시작·마감 시간, 게시 대상 구성원, 과정과 단원, 선행 학습 조건을 함께 확인합니다.",
        steps: [
          "시작 및 마감 시간을 설정합니다.",
          "게시 대상(구성원)을 선택합니다.",
          "활동이 속할 과정과 단원을 지정합니다.",
          "필요 시 선행 학습 조건을 설정해 순차 학습을 유도합니다.",
        ],
      },
      {
        heading: "녹화 수업과 학습 자료",
        body: "녹화 수업은 기존 영상 자료를 학생에게 제공하는 활동입니다. 수업 생성 옵션의 '수업 녹화'와 달리, 영상을 업로드하고 학생 시청 조건을 정하는 메뉴입니다. 학습 자료는 PDF·이미지·판서·파일 등을 수업 단원에 올리는 자료형 활동입니다.",
        steps: [
          "[새로 만들기] → [녹화 수업] 또는 [학습 자료]를 선택합니다.",
          "녹화 수업은 영상을 업로드한 뒤 재생 속도 조절, 플레이바 드래그, 시청 가능 횟수, 학습 활동 종료 후 열람 허용 여부를 설정합니다.",
          "필요하면 녹화 수업의 토론 공간, 저작권 보호 설정, 새로 추가된 구성원의 열람 허용, 선행 학습 조건을 확인합니다.",
          "학습 자료는 제목과 본문을 입력하고 파일을 업로드한 뒤 시작 시간, 마감일, 코스·과정·단원을 확인합니다.",
        ],
      },
      {
        heading: "숙제와 일일 과제",
        body: "숙제는 파일과 답안을 붙여 제출·채점 흐름을 만드는 활동이고, 일일 과제는 정해진 요일 반복으로 매일 제출 루틴을 만드는 활동입니다.",
        steps: [
          "[새로 만들기] → [숙제] 또는 [일일 과제]를 선택합니다.",
          "숙제는 제목·본문을 입력하고 파일을 첨부하거나 드라이브에서 불러옵니다.",
          "필요하면 [AI로 숙제 작성]을 사용하고, 채점 규칙과 AI 채점 토글을 확인합니다.",
          "답안이 필요한 숙제는 [답안 추가]로 채점 기준을 함께 준비합니다.",
          "일일 과제는 시작·마감일과 반복 주기를 정하고 월~일 중 운영할 요일을 선택합니다.",
          "반복 과제는 총 제출 일자와 게시 대상이 실제 운영 일정과 맞는지 확인합니다.",
        ],
      },
      {
        heading: "시험과 OMR 카드",
        body: "시험은 문제 은행, 직접 추가, 대량 추가, AI 출제를 통해 시험지를 구성합니다. OMR 카드는 시험지 파일을 올리고 답안 구조를 만들어 채점할 때 사용합니다.",
        steps: [
          "시험은 [문제 은행에서 불러오기], [시험 문제 추가], [시험 문제 대량 추가], [AI 출제] 중 필요한 방식을 선택합니다.",
          "시작·마감, 응시 시간, 채점 규칙, 코스·과정·단원을 확인한 뒤 미리 보기로 검토합니다.",
          "OMR 카드는 시험지 파일을 올린 뒤 [OMR 카드 생성] 또는 문제 유형 버튼으로 답안 구조를 만듭니다.",
          "OMR 카드에서 확인된 문제 유형은 객관식 문제, 다중 선택, 참/거짓, 빈칸 채우기, 서술형입니다.",
          "문항이 많으면 일괄 추가를 사용하고, 필요한 경우 구조 설명 추가로 문항 구성을 보완합니다.",
        ],
      },
      {
        heading: "토론, AI 스피킹 등 상호작용 활동",
        body: "토론은 학생 의견 공유와 댓글형 상호작용에 사용합니다. AI 기반 어학 활동은 영어와 중국어 각각 따라읽기, 받아쓰기, 외워말하기로 구분됩니다.",
        steps: [
          "토론: [새로 만들기] → [토론]을 선택해 주제를 설정합니다.",
          "AI 기반 영어 교육: 따라읽기, 받아쓰기, 외워말하기 중 활동 목적에 맞는 유형을 고릅니다.",
          "AI 기반 중국어 교육: 따라읽기, 받아쓰기, 외워말하기 중 활동 목적에 맞는 유형을 고릅니다.",
          "AI 어학 활동은 언어와 활동 유형을 함께 말해야 학생에게 혼동이 적습니다.",
        ],
      },
      {
        heading: "자주 묻는 질문",
        body: "선행 학습 조건은 특정 활동을 이수해야 다음 활동이 열리도록 만드는 기능입니다. 예를 들어 A 완료 → B 오픈 → B 완료 → C 오픈 같은 흐름을 만들 수 있습니다.",
      },
    ],
    relatedSlugs: [
      "lesson-option-concepts",
      "course-units",
      "course-members",
      "lesson-web-live",
      "drive-materials",
    ],
  },
  {
    slug: "lesson-web-live",
    category: "teacher",
    title: "수업 - 웹 라이브 & 플레이백",
    description: "앱 설치 없이 웹으로 많은 청중에게 일회성 수업·설명회·강연을 송출하고, 라이브 후 플레이백·데이터까지 관리하는 방법을 안내합니다.",
    audience: "수업을 진행하는 강사",
    updatedAt: "2026-05-14",
    readMinutes: 6,
    tags: ["웹 라이브", "플레이백", "대규모 수업", "녹화"],
    keywords: ["웹 라이브", "플레이백", "수업 녹화", "대시보드", "비밀번호", "채팅", "좋아요", "Enterprise", "Business Consumption"],
    chatbotSummary: "수업 추가 시 '수업 녹화'를 켜면 라이브&플레이백 옵션이 활성화됩니다. 대시보드에서 웹 페이지 링크와 비밀번호·로그인·채팅 권한을 설정해 학생이 웹으로 참여하도록 만들 수 있습니다. Enterprise / Business Consumption 요금제에서 사용 가능합니다.",
    sections: [
      {
        heading: "웹 라이브 & 플레이백 개요",
        body: "웹 라이브 & 플레이백은 설명회·강연처럼 일방향적인 정보 전달이 필요한 대규모 수업에 적합합니다. 참여자는 앱 설치 없이 웹에서 접근할 수 있고, 클래스인 ID 제한·비밀번호 설정·좋아요·채팅 등을 세부 조정할 수 있습니다.",
      },
      {
        heading: "1단계 · 수업 추가 및 기능 설정",
        body: "공개 수업 또는 코스 내 수업을 추가한 뒤 '수업 녹화'를 활성화하면 라이브&플레이백 옵션이 노출됩니다. 라이브만 운영하거나 플레이백까지 함께 활성화할 수 있습니다.",
        steps: [
          "공개 수업 또는 코스 내에 수업을 추가합니다.",
          "수업 설정에서 '수업 녹화'를 활성화합니다.",
          "라이브 또는 라이브+플레이백 옵션을 선택합니다.",
          "수업 정보 또는 대시보드 → [라이브&플레이백] → [웹 페이지 링크]로 접근 URL을 확인합니다.",
        ],
      },
      {
        heading: "2단계 · 대시보드에서 세부 설정",
        body: "대시보드에서만 가능한 세부 설정으로 시청자 경험을 다듬습니다.",
        steps: [
          "클래스인 ID 로그인 요구 여부를 설정합니다.",
          "필요 시 비밀번호를 설정합니다.",
          "좋아요 및 채팅 권한을 설정합니다.",
          "라이브 커버 이미지와 소개글을 작성합니다.",
        ],
      },
      {
        heading: "3단계 · 라이브 수업 진행",
        body: "강사는 교실 입장 후 [수업 녹화]를 누르면 송출이 시작됩니다. [수업 도구] → [실시간 채팅]에서 웹 참여자 메시지를 확인할 수 있고, 학생은 전달받은 링크로 접속해 필요 시 닉네임 또는 클래스인 ID로 로그인합니다.",
        steps: [
          "강사: 사전에 자료와 카메라를 세팅한 뒤 교실에 입장합니다.",
          "강사: [수업 녹화]를 클릭해 송출을 시작합니다.",
          "강사: [수업 도구] → [실시간 채팅]에서 웹 참여자의 메시지를 확인합니다.",
          "학생: 전달받은 링크로 접속해 닉네임 또는 클래스인 ID로 로그인합니다.",
          "학생: 비밀번호가 설정된 경우 비밀번호를 입력해 입장합니다.",
        ],
      },
      {
        heading: "4단계 · 수업 종료 후 데이터 확인",
        body: "수업이 끝나면 대시보드의 [라이브&플레이백] → [오퍼레이션] → [관리]에서 시청자 수, 좋아요 수 등 운영 데이터를 확인할 수 있습니다.",
      },
      {
        heading: "자주 묻는 질문 · 요금",
        body: "구독(Classin Learning Space) 요금제에서는 enterprise에서만, 충전(Consumption) 요금제에서는 business에서만 웹 라이브를 사용할 수 있습니다. Business Consumption 요금 예시는 PC 720P 시간당 0.8위안/1인(최대 270MB), PC 1080P 2.1위안/1인(최대 720MB), 전자칠판 720P 1.2위안/1인(최대 405MB), 전자칠판 1080P 3.2위안/1인(최대 1080MB)이며 Enterprise는 별도 요금이 없습니다.",
      },
    ],
    relatedSlugs: ["course-units", "classroom-basic-setup", "course-activities"],
  },
  {
    slug: "classroom-basic-setup",
    category: "teacher",
    title: "교실 - 기본 설정 (PC 및 모바일)",
    description: "수업 입장 전 장비 테스트, 녹화 설정, 스테이지 영역, 가상 배경, 교실 배경 등 교실 운영의 기본 환경을 점검하고 수업 환경을 이해하는 가이드입니다.",
    audience: "수업을 진행하는 강사",
    updatedAt: "2026-05-14",
    readMinutes: 5,
    featured: true,
    tags: ["교실", "장비 테스트", "녹화", "가상 배경", "스테이지"],
    keywords: ["교실 설정", "장비 테스트", "Classin 수업 녹화", "현장 녹화", "스테이지", "가상 배경", "교실 배경", "블랙보드", "툴바", "다이나믹 아일랜드"],
    chatbotSummary: "수업 시작 20분 전 입장해 카메라·마이크·스피커를 테스트하고, [메뉴] → [설정]에서 스테이지·가상 배경·교실 배경을 조정합니다. 복습/다시보기용 Classin 수업 녹화를 기본으로 확인하고, 실제 교실 카메라 뷰나 트래킹 뷰가 필요하면 현장 녹화를 병행합니다.",
    sections: [
      {
        heading: "0. 수업 개설 및 입장",
        body: "수업 성격에 맞게 수업을 개설하고, 교사는 수업 시작 20분 전부터 입장할 수 있습니다. [할 일] 탭이나 [다이나믹 아일랜드]를 통해 빠르게 진입하세요.",
        steps: [
          "수업 성격에 맞게 코스 내 수업을 개설합니다.",
          "수업 시작 20분 전부터 [할 일] 탭 또는 [다이나믹 아일랜드]에서 입장합니다.",
        ],
      },
      {
        heading: "1. 장비 테스트",
        body: "교실 입장 전 임시 페이지에서 카메라·마이크·스피커를 테스트하고, 사용하려는 장비가 올바르게 연결되었는지 확인합니다.",
      },
      {
        heading: "2. 녹화 설정",
        body: "Classin 수업 녹화는 영역 지정 없이 칠판·자료·교실 화면을 중심으로 녹화하며, 온라인·오프라인 수업 모두에서 기본 복습/다시보기 용도로 많이 사용합니다. 교실 안에서 카메라를 켜면 Classin 화면 레이아웃에 포함된 카메라 영역도 함께 보일 수 있습니다. 현장 녹화는 웹캠이나 외장 카메라가 촬영하는 실제 교실 뷰나 트래킹 뷰를 기본 수업 녹화와 병행해 별도로 녹화합니다. 녹화 중에는 우측 상단 아이콘이 녹색으로 표시됩니다.",
        steps: [
          "복습/다시보기를 위해 Classin 수업 녹화를 기본으로 활성화합니다.",
          "현장 뷰나 트래킹 뷰를 함께 남기려면 현장 녹화를 추가로 활성화합니다.",
          "다시보기에서 수업 녹화와 현장 녹화가 각각 선택 가능한지 확인합니다.",
        ],
      },
      {
        heading: "3. 기타 설정 - 스테이지·가상 배경·교실 배경",
        body: "스테이지 영역은 온스테이지 구성원의 카메라 레이아웃입니다. 비활성화하거나 작게 표시하면 학습 자료와 칠판을 더 크게 볼 수 있고, 가상 배경과 교실 배경은 [메뉴] → [설정]에서 직접 선택하거나 직접 제작한 이미지를 업로드할 수 있습니다.",
        steps: [
          "스테이지: 우측 상단 [메뉴] → [설정] → [일반]에서 스테이지 표시 여부를 변경합니다.",
          "가상 배경: [메뉴] → [설정] → [가상 배경]에서 원하는 배경을 선택합니다.",
          "교실 배경: [메뉴] → [설정] → [교실 배경]에서 배경을 선택하거나 직접 제작한 이미지를 업로드합니다.",
        ],
      },
      {
        heading: "4. 수업 환경 이해하기",
        body: "상태 표시줄에서 데이터 환경, 카메라·마이크 상태, 녹화 상태, 메뉴, 수업 종료를 확인할 수 있습니다. 스테이지는 온스테이지 구성원의 카메라가 노출되는 영역, 블랙보드는 수업 자료를 불러오고 판서할 수 있는 영역(최대 50페이지), 툴 바는 판서·드라이브·스크린 캡처·수업도구를 제공합니다.",
      },
      {
        heading: "자주 묻는 질문",
        body: "교실 배경 이미지는 jpg 포맷, 1MB 이하여야 업로드할 수 있습니다. 커스텀 배경은 최대 5개까지 추가할 수 있으며 기본 11개와 합쳐 총 16개까지 사용할 수 있습니다.",
      },
    ],
    relatedSlugs: [
      "lesson-option-concepts",
      "course-units",
      "lesson-web-live",
      "drive-materials",
      "teacher-profile",
    ],
  },
  {
    slug: "student-profile",
    category: "student",
    title: "클래스인 프로필 설정",
    description: "학원이 지정한 닉네임 양식에 맞춰 프로필 사진과 닉네임을 설정하고, 안 바뀔 때 점검하는 방법까지 안내합니다.",
    audience: "처음 클래스인을 사용하는 학생",
    updatedAt: "2026-05-14",
    readMinutes: 4,
    tags: ["프로필", "초기설정", "계정"],
    keywords: ["프로필", "닉네임", "사진", "계정 설정", "개인정보", "닉네임 양식", "출석 확인"],
    chatbotSummary: "학생이 PC 또는 모바일 클래스인 앱에서 프로필 사진과 닉네임을 변경하는 절차를 설명합니다. 닉네임은 선생님이 출석부에서 나를 빠르게 찾는 식별 정보이므로 학원이 지정한 양식(예: 학년+이름)을 그대로 따라야 하며, 변경이 반영되지 않을 때는 코스 표시 이름과 계정 닉네임을 구분해 점검합니다.",
    sections: [
      {
        heading: "닉네임은 '나를 찾는 이름표'입니다",
        body: "프로필 닉네임은 단순한 별명이 아니라, 선생님이 출석을 확인하고 친구들이 채팅·그룹 활동에서 나를 구분하는 식별 정보예요. 한 코스에 같은 이름이 여럿일 수 있고, 선생님은 짧은 수업 시간 안에 출석부와 화면 속 이름을 맞춰 봐야 하기 때문에, 학원이 정한 양식을 지키는 것이 무엇보다 중요합니다. 본명 대신 영어 별명이나 이모지를 넣으면 출석 체크가 늦어지고, 결석으로 잘못 기록될 수도 있어요.",
        steps: [
          "학원에서 받은 닉네임 양식을 먼저 확인합니다(예: 학년+이름 → '중1김민지').",
          "양식에 띄어쓰기·기호 규칙이 있으면 그대로 따릅니다(공백 없이 붙여 쓰기 등).",
          "동명이인이 있는 반이라면 학원 안내대로 뒷자리 번호나 반 표시를 함께 적습니다.",
          "프로필 사진은 얼굴이 보이는 밝은 사진으로 설정해 두면 선생님이 더 빨리 알아봅니다.",
        ],
      },
      {
        heading: "PC에서 설정하기",
        body: "PC 클래스인 클라이언트에서 프로필을 수정하는 가장 기본적인 경로입니다. 수업 시작 전 여유 있게 미리 설정해 두는 것을 권장합니다.",
        steps: [
          "좌측 하단의 기본 프로필 버튼을 클릭합니다.",
          "[계정 및 설정] 팝업에서 [개인정보]를 선택합니다.",
          "닉네임 칸에 학원 지정 양식대로 입력하고, 프로필 사진을 올립니다.",
          "저장을 눌러 마무리한 뒤, 닉네임이 입력한 그대로 표시되는지 한 번 더 확인합니다.",
        ],
      },
      {
        heading: "모바일(안드로이드 / iOS)에서 설정하기",
        body: "스마트폰에서도 동일한 정보를 손쉽게 바꿀 수 있습니다. 사진은 갤러리에서 바로 선택하거나 즉석에서 촬영할 수 있어요.",
        steps: [
          "클래스인 앱 좌측 상단의 프로필 아이콘을 터치합니다.",
          "프로필 사진 또는 닉네임 항목을 선택해 수정합니다.",
          "닉네임은 학원 지정 양식 그대로 입력합니다.",
          "변경 사항을 저장하면 즉시 반영됩니다.",
        ],
      },
      {
        heading: "설정 직후 점검 체크리스트",
        body: "저장만 하고 끝내지 말고, 아래 항목을 빠르게 확인하면 수업 당일 당황할 일이 줄어듭니다.",
        steps: [
          "닉네임 철자·띄어쓰기가 학원 양식과 정확히 일치하는지 확인합니다.",
          "내가 들어갈 코스 화면에서 표시되는 이름이 의도한 닉네임과 같은지 봅니다.",
          "프로필 사진이 흐릿하거나 어둡지 않은지, 다른 사람으로 오해할 여지가 없는지 확인합니다.",
          "여러 기기(PC·모바일)를 함께 쓴다면, 한 기기에서 바꾼 뒤 다른 기기에서도 동일하게 보이는지 점검합니다.",
        ],
      },
      {
        heading: "닉네임이 바뀌지 않을 때 흔한 실수",
        body: "'분명히 바꿨는데 수업에서는 옛날 이름으로 보여요'라는 문의가 가장 많습니다. 대부분은 아래 원인 중 하나예요. 순서대로 확인해 보세요.",
        steps: [
          "저장 버튼을 누르지 않았거나, 입력 후 다른 화면으로 바로 넘어간 경우 → 다시 들어가 저장까지 확인합니다.",
          "코스마다 따로 지정된 '표시 이름'이 계정 닉네임을 덮어쓴 경우 → 해당 코스 안에서 표시 이름을 직접 수정하거나 선생님께 변경을 요청합니다.",
          "수업 화면을 켜 둔 상태에서 바꾼 경우 → 클래스인을 완전히 종료했다가 다시 실행하면 새 정보로 갱신됩니다.",
          "학원이 관리자 계정으로 일괄 등록·관리하는 경우 → 학생이 바꿔도 다시 양식대로 되돌아갈 수 있으므로, 변경이 필요하면 학원에 문의합니다.",
          "다른 계정으로 로그인되어 있는 경우 → 로그인된 아이디(휴대폰/이메일)가 본인 계정이 맞는지 확인합니다.",
        ],
      },
      {
        heading: "그래도 해결되지 않는다면",
        body: "위 항목을 모두 확인했는데도 닉네임이나 사진이 반영되지 않으면, 학생 개인 설정 문제가 아니라 학원 계정 관리 정책이나 코스 설정 때문일 수 있습니다. 이때는 임의로 여러 번 바꾸기보다 학원에 상황을 전달하는 편이 빠릅니다.",
        steps: [
          "어떤 기기(PC/모바일)에서, 어떤 화면까지 보이는지 메모해 둡니다.",
          "현재 표시되는 이름과 원하는 양식을 함께 정리해 학원 담당 선생님께 전달합니다.",
          "관리자 측에서 코스 표시 이름 또는 계정 정보를 맞춰 주면 다음 수업부터 정상 반영됩니다.",
        ],
      },
    ],
    relatedSlugs: ["chat", "todo-calendar", "course-join"],
  },
  {
    slug: "chat",
    category: "student",
    title: "채팅으로 소통하기",
    description: "코스별 채팅창에서 친구·선생님과 소통하고, 임시 교실로 즉석 면대면 대화까지 진행하는 방법을 안내합니다.",
    audience: "코스 내에서 친구·선생님과 소통하려는 학생",
    updatedAt: "2026-05-14",
    readMinutes: 3,
    tags: ["채팅", "소통", "임시교실", "연락처"],
    keywords: ["채팅", "메신저", "임시 교실", "연락처", "@태그", "이모티콘", "파일 전송"],
    chatbotSummary: "클래스인 [채팅] 탭에서 코스 채팅창을 여는 방법, 이모티콘·@태그·스크린 캡쳐·파일 첨부 기능, 최대 15분 임시 교실 개설, 친구 추가 및 연락처 관리 방법을 안내합니다.",
    sections: [
      {
        heading: "채팅 목록 열기",
        body: "홈 화면에서 [채팅] 탭을 누르면 내가 속한 코스별 채팅창이 모여 있는 목록이 표시됩니다. 원하는 코스를 클릭하면 해당 코스 채팅창이 열립니다.",
        steps: [
          "메인 메뉴의 [채팅] 탭으로 이동합니다.",
          "채팅 목록에서 원하는 코스를 클릭합니다.",
          "코스 채팅창에 입장해 메시지를 주고받습니다.",
        ],
      },
      {
        heading: "채팅창에서 쓸 수 있는 기능",
        body: "채팅창에는 단순한 텍스트 입력 외에도 학습에 도움이 되는 다양한 기능이 함께 제공됩니다.",
        steps: [
          "이모티콘으로 감정을 표현합니다.",
          "@를 입력해 같은 코스에 있는 다른 인원을 태그합니다.",
          "스크린 캡쳐 기능으로 화면을 공유합니다(클래스인 창 숨김 지원).",
          "로컬 또는 클라우드 드라이브에서 파일을 첨부합니다.",
          "플랫폼 내 연락처를 다른 사용자에게 공유합니다.",
        ],
      },
      {
        heading: "임시 교실 개설",
        body: "채팅창의 아이콘을 클릭하면 최대 15분간 진행 가능한 임시 교실을 열 수 있습니다. 질문 논의나 짧은 면대면 소통이 필요할 때 유용합니다.",
      },
      {
        heading: "연락처 및 친구 관리",
        body: "[채팅] 탭의 연락처 버튼에서 친구 목록을 관리하거나 새 친구 신청을 처리할 수 있습니다. 친구 추가 시에는 상대방의 ID(휴대폰/이메일), QR 코드, 초대 링크를 활용합니다.",
      },
    ],
    relatedSlugs: ["student-profile", "course-join", "class-join-replay"],
  },
  {
    slug: "todo-calendar",
    category: "student",
    title: "할 일 · 캘린더로 학사 일정 관리",
    description: "마감 임박 과제부터 수업 일정, 자료 공개일까지 [할 일]과 [캘린더]에서 한눈에 관리하는 방법을 안내합니다.",
    audience: "여러 코스의 과제·시험 일정을 챙겨야 하는 학생",
    updatedAt: "2026-05-14",
    readMinutes: 3,
    tags: ["할 일", "캘린더", "일정관리"],
    keywords: ["할 일", "캘린더", "마감일", "과제", "시험", "수업 일정", "개인 일정"],
    chatbotSummary: "[할 일] 탭은 마감 기한 순으로 과제와 시험을 보여 주며 코스·카테고리 필터를 지원합니다. [캘린더] 탭에서는 수업·자료 공개일을 보고 활동을 클릭해 상세 페이지로 이동하거나 [+]로 개인 일정을 추가할 수 있습니다.",
    sections: [
      {
        heading: "[할 일] 탭에서 마감 임박 항목 보기",
        body: "왼쪽 메뉴의 [할 일]을 선택하면 마감 기한 순으로 정렬된 과제·시험 일정을 확인할 수 있어요. 해야 할 일이 너무 많을 때 우선순위를 잡기에 좋습니다.",
        steps: [
          "왼쪽 메뉴에서 [할 일]을 선택합니다.",
          "상단 드롭다운에서 특정 코스나 활동 카테고리로 필터링합니다.",
          "마감이 임박한 항목부터 차례로 처리합니다.",
        ],
      },
      {
        heading: "[캘린더] 탭에서 일정 한눈에 보기",
        body: "[캘린더] 버튼으로 들어가면 수업 일정, 과제 마감일, 학습 자료 공개 일정을 달력 형태로 볼 수 있습니다. 활동을 클릭하면 종료된 수업은 다시보기 페이지로, 학습 자료는 자료 열람 페이지로 이동합니다.",
        steps: [
          "왼쪽 메뉴의 [캘린더]를 클릭합니다.",
          "보고 싶은 날짜의 활동을 클릭해 상세 정보를 확인합니다.",
          "필요 시 우측 상단의 [+] 버튼을 눌러 개인 일정을 추가합니다.",
        ],
      },
      {
        heading: "모바일에서도 동일하게 사용",
        body: "스마트폰과 태블릿에서도 동일한 [할 일] · [캘린더] 화면을 사용할 수 있어, 이동 중에도 일정을 확인하고 관리할 수 있습니다.",
      },
    ],
    relatedSlugs: ["class-join-replay", "course-submit-activity", "course-grades"],
  },
  {
    slug: "course-join",
    category: "student",
    title: "코스 - 코스 참여하기",
    description: "클래스인의 모든 학습 활동이 진행되는 '코스'에 참여하는 첫 단계 안내입니다. 코스명 검색·코드·링크·QR 등 참여 경로별 방법과 참여가 안 될 때의 흔한 원인까지 정리했습니다.",
    audience: "클래스인에서 새 학기·새 강좌를 시작하는 학생",
    updatedAt: "2026-05-14",
    readMinutes: 4,
    featured: true,
    tags: ["코스", "참여", "검색"],
    keywords: ["코스", "코스 참여", "코스 검색", "학습 공간", "실시간 수업", "녹화 수업", "숙제"],
    chatbotSummary: "클래스인의 모든 학습 활동은 코스 단위로 진행됩니다. 학생은 학원이 안내한 방식(코스명 검색, 코스 코드, 초대 링크·QR)에 맞춰 코스에 참여합니다. 코스에 들어가면 실시간 수업, 녹화 다시보기, 숙제·시험이 한 흐름으로 이어집니다. 참여가 안 될 때는 대개 코스명 오기입, 로그인 계정 불일치, 아직 받지 못한 참여 권한이 원인입니다.",
    sections: [
      {
        heading: "'코스'는 수업 운영의 시작점입니다",
        body: "코스는 학생이 한 강좌의 모든 학습 활동을 만나는 공간입니다. 실시간 수업 입장, 종료된 수업 다시보기, 숙제와 시험 제출, 성적·피드백 확인이 모두 이 코스 안에서 이어집니다. 클래스인은 이렇게 수업 전·중·후를 코스 하나로 묶어 두기 때문에, 학생은 매번 다른 링크를 찾아다닐 필요 없이 코스에 한 번 참여해 두면 학기 내내 같은 자리에서 학습을 따라갈 수 있습니다. 그래서 새 학기·새 강좌의 첫 단계는 언제나 '코스 참여'입니다.",
      },
      {
        heading: "먼저 학원이 어떤 방식으로 안내했는지 확인하세요",
        body: "코스에 참여하는 경로는 학원이 어떤 정보를 줬는지에 따라 갈립니다. 무작정 검색부터 하기보다, 받은 안내가 어떤 형태인지 먼저 확인하면 한 번에 들어갈 수 있습니다.",
        steps: [
          "코스명(예: '중2 수학 정규반')만 받았다면 검색으로 참여합니다.",
          "숫자·영문이 섞인 코스 코드를 받았다면 코드로 참여합니다.",
          "문자나 메신저로 초대 링크 또는 QR 코드를 받았다면 링크·QR로 바로 입장합니다.",
          "어떤 형태인지 헷갈리면 학원에 '코스명인지, 코드인지, 링크인지' 한 번만 확인하세요.",
        ],
      },
      {
        heading: "코스명으로 검색해 참여하기",
        body: "학원이 코스명을 알려준 경우, 화면 상단의 검색에서 코스를 찾아 참여 신청합니다. 코스명은 띄어쓰기·기수·반 이름까지 정확히 일치해야 결과에 나오므로, 받은 그대로 입력하는 것이 중요합니다.",
        steps: [
          "화면 상단의 검색 아이콘을 클릭합니다.",
          "검색창에 학원이 안내한 코스명을 그대로 입력합니다.",
          "검색 결과에서 우리 학원·우리 반에 맞는 코스가 맞는지 확인하고 선택합니다.",
          "[참여] 또는 [입장] 버튼을 눌러 코스에 들어갑니다.",
          "학원 설정에 따라 승인 대기 상태가 될 수 있으니, 바로 안 보이면 교사 승인 후 다시 확인합니다.",
        ],
      },
      {
        heading: "코스 코드 · 초대 링크 · QR로 참여하기",
        body: "학원이 코드나 링크를 준 경우에는 검색을 거치지 않고 더 빠르게 입장할 수 있습니다. 같은 코스라도 학원마다 안내 방식이 다를 뿐, 들어가면 모두 동일한 코스 화면입니다.",
        steps: [
          "코스 코드: 검색·참여 화면에서 코드 입력란에 받은 코드를 정확히 입력하고 참여합니다.",
          "초대 링크: 문자·메신저로 받은 링크를 누르면 클래스인이 열리며 해당 코스 참여 화면으로 연결됩니다.",
          "QR 코드: 모바일 앱에서 QR을 촬영하면 코스 참여 화면으로 바로 이동합니다.",
          "링크·QR로 들어갔는데 로그인 화면이 먼저 뜨면, 학원에 등록된 본인 계정으로 로그인한 뒤 다시 참여를 진행합니다.",
        ],
      },
      {
        heading: "참여가 안 될 때 — 흔한 실수와 대응",
        body: "코스가 검색되지 않거나 참여가 막히는 경우는 대부분 정해진 몇 가지 원인입니다. 아래를 위에서부터 순서대로 확인하면 대개 해결됩니다.",
        steps: [
          "코스명 오기입: 한 글자·띄어쓰기·기수까지 안내받은 그대로 입력했는지 확인합니다. 비슷한 다른 반 코스를 고르지 않도록 주의하세요.",
          "로그인 계정 불일치: 학원에 등록된 계정이 아닌 다른 아이디로 로그인했을 수 있습니다. 가입한 휴대폰 번호·이메일 계정이 맞는지 확인합니다.",
          "참여 권한·승인 대기: 학원이 아직 학생을 코스에 배정하지 않았거나 참여 승인이 필요한 설정일 수 있습니다. 이때는 교사·학원에 배정/승인을 요청합니다.",
          "코드·링크 만료: 코드나 초대 링크는 기간이 지나면 막힐 수 있습니다. 최신 코드나 링크를 다시 받습니다.",
          "위를 모두 확인해도 안 되면, 입력한 코스명·코드와 로그인한 계정을 캡처해 학원에 전달하면 확인이 빠릅니다.",
        ],
      },
      {
        heading: "참여 직후 이렇게 확인하세요",
        body: "코스에 들어왔다면 첫 수업 전에 코스 안 구성을 한 번 둘러보는 것을 권장합니다. 어디에서 수업에 입장하고 어디에서 숙제를 내는지 미리 알아 두면 첫 수업이 매끄럽습니다.",
        steps: [
          "코스 화면에서 예정된 수업과 시간표가 보이는지 확인합니다.",
          "[할 일] 또는 코스 내 활동 목록에서 숙제·시험·자료가 들어오는 위치를 확인합니다.",
          "실시간 수업 입장 방법과 다시보기는 '수업 참여하기 & 다시보기' 문서에서 이어 확인합니다.",
          "여러 강좌를 듣는다면 같은 방식으로 다른 코스도 각각 참여해 둡니다.",
        ],
      },
    ],
    relatedSlugs: ["class-join-replay", "course-submit-activity", "course-grades"],
  },
  {
    slug: "class-join-replay",
    category: "student",
    title: "수업 - 수업 참여하기 & 다시보기",
    description: "실시간 수업 입장 방법과 종료 후 녹화본을 다시 보는 방법, 그리고 수업 중 사용할 수 있는 학습 도구를 안내합니다.",
    audience: "실시간 수업에 참여하거나 녹화본을 복습하려는 학생",
    updatedAt: "2026-05-14",
    readMinutes: 4,
    featured: true,
    tags: ["수업", "실시간", "다시보기", "녹화"],
    keywords: ["수업 참여", "다시보기", "녹화 수업", "다이내믹 아일랜드", "카메라", "마이크", "스피커", "왕관", "칠판"],
    chatbotSummary: "학생은 다이내믹 아일랜드, 코스/할 일 탭, 팝업 알림 중 편한 경로로 교실에 입장합니다. 입장 전 카메라·마이크·스피커를 점검하고, 교사가 권한을 주면 왕관 표시와 함께 칠판·이모티콘·@태그 등 도구를 쓸 수 있습니다. 종료된 수업은 설정에 따라 ClassIn 수업 녹화 또는 현장 녹화 뷰로 다시 볼 수 있습니다.",
    sections: [
      {
        heading: "PC에서 수업에 입장하는 3가지 방법",
        body: "클래스인은 학생이 처한 상황에 맞게 여러 경로로 교실에 입장할 수 있도록 합니다.",
        steps: [
          "상단 다이내믹 아일랜드를 클릭해 곧 시작하거나 진행 중인 교실로 입장합니다.",
          "[코스] 또는 [할 일] 탭에서 해당 수업의 교실 입장 버튼을 직접 클릭합니다.",
          "수업 시작 시 표시되는 팝업 알림에서 [입장]을 눌러 들어갑니다.",
        ],
      },
      {
        heading: "입장 전 장비 점검",
        body: "수업 품질을 위해 입장 전 카메라·마이크·스피커를 한 번 점검하는 것을 권장합니다. 수업 중에도 상단 버튼에서 같은 드롭다운 메뉴로 장비를 다시 조정할 수 있습니다.",
        steps: [
          "카메라 드롭다운에서 사용할 카메라를 선택합니다.",
          "마이크 드롭다운에서 입력 장치를 선택합니다.",
          "스피커 드롭다운에서 출력 장치를 확인합니다.",
        ],
      },
      {
        heading: "왕관 권한과 수업 도구",
        body: "교사가 권한을 부여하면 학생 이름 옆에 왕관(👑)이 표시되며, 다음 도구를 사용할 수 있습니다. 칠판 판서 참여, 이모티콘 삽입, @사용자 태그, 스크린 캡처(클래스인 창 숨김 지원), 파일 첨부, 연락처 공유, 임시 교실 개설 등입니다.",
      },
      {
        heading: "수업 다시보기",
        body: "학생으로 등록된 수업은 종료 후에도 다시 볼 수 있습니다. 녹화 설정에 따라 칠판·자료·교실 화면 중심의 ClassIn 수업 녹화와 실제 교실 카메라 뷰 또는 트래킹 뷰 중심의 현장 녹화를 선택해 볼 수 있어요.",
      },
    ],
    relatedSlugs: ["lesson-option-concepts", "course-join", "class-report", "course-submit-activity"],
  },
  {
    slug: "class-report",
    category: "student",
    title: "수업 - 학습 보고서 보기",
    description: "수업 종료 후 자동 생성되는 학습 보고서로 판서·하이라이트 이미지·수업 자료를 복습하는 방법을 안내합니다.",
    audience: "수업 내용을 복습하려는 학생",
    updatedAt: "2026-05-14",
    readMinutes: 4,
    tags: ["학습 보고서", "복습", "판서"],
    keywords: ["학습 보고서", "Highlights", "수업 화면 캡처", "판서", "수업 자료", "복습", "복습 루틴", "다시보기"],
    chatbotSummary: "수업이 끝나면 학습 보고서가 자동으로 만들어집니다. 보고서에는 수업 화면을 1분 간격으로 모은 Highlights 이미지, 교사가 칠판 구역에 남긴 판서, 수업에 함께 쓰인 학습 자료가 한곳에 정리돼 있어요. 따로 필기하거나 화면을 캡처하지 않아도 그날 배운 흐름을 다시 따라가며 복습할 수 있는 복습 자산입니다. 보고서만 보고 끝내기보다 다시보기 영상·녹화 수업과 묶어서 보면 복습 효과가 더 좋습니다.",
    sections: [
      {
        heading: "학습 보고서는 따로 정리하지 않아도 쌓이는 복습 자산입니다",
        body: "학습 보고서는 클래스인이 수업의 흐름을 자동으로 정리해 두는 복습 자료입니다. 수업을 들으면서 화면을 일일이 캡처하거나 칠판을 옮겨 적지 않아도, 수업이 끝나면 그날 다룬 화면과 판서, 자료가 한곳에 모여 있어요. 감시 기록이 아니라, 다시 펼쳐 보며 공부하라고 만들어 두는 내 복습 노트라고 생각하면 됩니다.",
        steps: [
          "Highlights: 온라인 교실 화면을 1분 간격으로 모은 이미지입니다. 모든 참여자에게 동일하게 제공돼 그날 흐름을 장면 단위로 되짚을 수 있습니다.",
          "판서: 교사가 교실 칠판 구역에 남긴 필기가 그대로 보존됩니다. 풀이 과정과 강조 표시까지 다시 볼 수 있습니다.",
          "수업 자료: 수업 중 함께 띄운 PDF, 이미지, 학습 자료가 보고서에 연결돼 따로 찾아다닐 필요가 없습니다.",
        ],
      },
      {
        heading: "학습 보고서 열어 보기",
        body: "학습 보고서는 다시보기가 가능한 수업에서 열 수 있습니다. 처음 찾을 때는 아래 순서대로 따라오면 됩니다.",
        steps: [
          "[수업] 또는 [코스] 메뉴에서 복습하려는 수업을 선택합니다.",
          "해당 수업의 학습 보고서 항목으로 이동합니다.",
          "Highlights 이미지를 시간 순으로 넘기며 그날 수업의 큰 흐름을 먼저 훑습니다.",
          "판서 영역에서 풀이 과정과 교사가 강조한 부분을 확인합니다.",
          "마지막으로 수업 자료를 열어 본문과 예제를 다시 읽습니다.",
        ],
      },
      {
        heading: "보고서로 복습하는 30분 루틴",
        body: "보고서는 한 번 훑어보는 데서 그치지 않고, 짧은 복습 루틴으로 묶을 때 효과가 큽니다. 수업이 끝난 당일이나 다음 날, 기억이 남아 있을 때 아래 흐름으로 돌려 보세요.",
        steps: [
          "1단계(5분): Highlights를 빠르게 넘기며 오늘 어떤 순서로 무엇을 배웠는지 전체 흐름을 머릿속에 다시 그립니다.",
          "2단계(10분): 판서를 보며 이해되지 않았던 풀이나 개념을 찾아 표시하고, 막혔던 부분만 모읍니다.",
          "3단계(10분): 막혔던 부분을 수업 자료의 본문·예제와 맞춰 보며 왜 그렇게 풀리는지 스스로 설명해 봅니다.",
          "4단계(5분): 그래도 풀리지 않는 부분은 따로 적어 두었다가 다음 수업에서 교사에게 질문하거나 숙제·시험 복습으로 이어 갑니다.",
        ],
      },
      {
        heading: "판서와 수업 자료를 묶어서 보면 이해가 빨라집니다",
        body: "판서만 보면 결론은 보이지만 왜 그렇게 됐는지가 흐릿하고, 자료만 보면 흐름이 끊깁니다. 두 가지를 함께 펼쳐 두고 보는 것이 핵심입니다.",
        steps: [
          "Highlights에서 어려웠던 장면을 먼저 찾아 그 부분의 판서를 봅니다.",
          "같은 부분에 해당하는 수업 자료(예제, 본문)를 나란히 열어 판서의 풀이와 대조합니다.",
          "교사가 자료에 표시하거나 추가로 적어 둔 메모가 있으면 그 부분을 우선 챙깁니다.",
          "녹화 수업이나 다시보기 영상이 있는 수업이라면, 막힌 장면의 시간대를 영상에서 다시 들으며 설명을 보충합니다.",
        ],
      },
      {
        heading: "흔한 실수와 점검 사항",
        body: "보고서를 제대로 못 쓰는 경우는 대부분 비슷합니다. 아래만 피해도 복습이 훨씬 수월해집니다.",
        steps: [
          "보고서를 한 번 슥 보고 닫기: 넘겨만 보면 복습이 아닙니다. 막혔던 부분을 표시하고 다시 설명해 보는 단계까지 가야 남습니다.",
          "보고서만 보고 영상은 건너뛰기: 보고서는 장면 요약이라 흐름의 빈칸이 있습니다. 이해가 안 되는 구간은 다시보기·녹화 수업으로 보충하세요.",
          "복습을 한참 미루기: 시간이 지나면 화면만 봐서는 맥락이 잘 떠오르지 않습니다. 당일이나 다음 날 안에 한 번 돌리는 것이 좋습니다.",
          "보고서가 안 보일 때: 학습 보고서는 다시보기가 가능한 수업에서 제공됩니다. 항목이 보이지 않으면 해당 수업이 다시보기·녹화 대상인지 확인하고, 그래도 없으면 교사나 학원 담당자에게 문의하세요.",
        ],
      },
    ],
    relatedSlugs: ["class-join-replay", "course-grades", "course-submit-activity"],
  },
  {
    slug: "course-submit-activity",
    category: "student",
    title: "코스 - 학습 활동 제출하기",
    description: "녹화 수업 시청부터 숙제·일일과제·시험·OMR·토론·자료 열람·AI 스피킹까지 8가지 학습 활동 제출 방법을 정리했습니다.",
    audience: "코스 내 학습 활동을 직접 제출·관리해야 하는 학생",
    updatedAt: "2026-05-14",
    readMinutes: 6,
    tags: ["학습 활동", "숙제", "시험", "토론", "AI 스피킹"],
    keywords: ["녹화 수업", "숙제", "일일 과제", "시험", "OMR", "토론", "학습 자료", "AI 스피킹", "제출", "피드백"],
    chatbotSummary: "클래스인은 처음 한 번만 제출하고 끝나는 것이 아니라 채점·피드백·누적 제출 현황을 직접 관리할 수 있게 설계되어 있습니다. 녹화 수업 시청, 숙제, 일일 과제, 시험, OMR, 토론, 학습 자료 열람, AI 스피킹 등 8가지 학습 활동의 제출·확인 절차를 안내합니다.",
    sections: [
      {
        heading: "녹화 수업 시청하기",
        body: "코스 탭에서 [시청하기] 버튼으로 녹화 수업에 접근합니다. 원하는 시간과 장소에서 학습할 수 있고, 토론 기능이 켜진 영상에서는 하단에 댓글을 작성할 수 있으며 시청 기록이 실시간으로 반영됩니다.",
      },
      {
        heading: "숙제 제출하기",
        body: "[숙제하기] 버튼을 눌러 사진, 음성 녹음, PDF 파일을 업로드합니다. 제출 후 수정이 가능하지만 수정 시 점수와 피드백이 초기화되니 주의하세요. PC, 패드, 핸드폰 모두 지원합니다.",
      },
      {
        heading: "일일 과제 제출하기",
        body: "선생님이 지정한 날짜마다 자동으로 제공되는 일일 과제는 [제출하기]로 진행합니다. [과제 제출 내역]에서 누적 현황·평균 점수·등수를 함께 확인할 수 있습니다.",
      },
      {
        heading: "시험 응시하기",
        body: "[응시하기]를 선택해 시험을 시작하면 남은 시간과 응답한 문제 수를 확인할 수 있습니다. 제출 후에는 소요 시간과 성적을 바로 볼 수 있고, 큰 화면의 기기에서 응시하는 것이 권장됩니다.",
      },
      {
        heading: "OMR 카드 응시하기",
        body: "OMR 카드 활동은 [응시하기]로 진행합니다. PDF·MP3 등 실제 시험 자료가 제공되며, 응시가 끝나면 틀린 문제·점수·정답률을 확인할 수 있습니다.",
      },
      {
        heading: "토론 참여하기",
        body: "[토론하기]로 의견을 작성하고 이미지·음성 녹음·파일을 함께 첨부할 수 있습니다. 참여 기한이 설정될 수 있으며, 누군가 답변을 남기면 알림이 옵니다.",
      },
      {
        heading: "학습 자료 열람하기",
        body: "[자료 확인]을 누르면 PDF, 이미지, 판서 등 다양한 형식의 자료를 볼 수 있습니다. 다운로드 옵션이 활성화돼 있다면 파일을 저장할 수 있고, 열람 기록은 자동으로 저장됩니다.",
      },
      {
        heading: "AI 스피킹 참여하기",
        body: "[제출하기]로 시작하는 AI 스피킹은 원어민 음성을 듣고 따라 말하는 활동입니다. AI가 발음과 유창함을 자동 평가하며, 특정 문장을 다시 녹음할 수도 있습니다. 조용한 환경에서 진행하는 것이 권장됩니다.",
      },
    ],
    relatedSlugs: ["course-join", "class-join-replay", "course-grades", "ai-features"],
  },
  {
    slug: "course-grades",
    category: "student",
    title: "코스 - 내 성적 확인하기",
    description: "수업·시험·숙제 점수와 출석 기록 등 종합 성적을 학생 본인이 직접 확인하고, 피드백을 다음 학습으로 잇는 방법을 안내합니다.",
    audience: "본인의 학습 결과를 직접 점검하려는 학생",
    updatedAt: "2026-05-14",
    readMinutes: 4,
    tags: ["성적", "피드백", "출석"],
    keywords: ["성적", "종합 성적", "학습 과정", "출석", "피드백", "점수"],
    chatbotSummary: "코스 안 [성적] 메뉴에서 수업·시험·숙제 점수와 출석 기록을 한 화면에서 봅니다. 우측 상단 [종합 성적]은 코스 전체 평균, [학습 과정]은 활동별 점수와 교사 피드백입니다. 점수가 안 보이면 대부분 교사 채점 전이거나 활동이 아직 채점 대상이 아니어서이며, 피드백에서 자주 틀린 단원을 골라 복습으로 잇는 것이 핵심입니다.",
    sections: [
      {
        heading: "성적은 코스별로, 한 화면에 모입니다",
        body: "클래스인에서 성적은 코스 단위로 관리됩니다. 화상 수업, 시험, 숙제, 출석이 따로 흩어져 있지 않고 그 코스의 [성적] 화면 한 곳에 모이기 때문에, 내가 무엇을 잘했고 어디가 약한지를 흐름으로 볼 수 있어요. 점수 하나를 확인하는 데서 끝내지 말고, 같은 화면에서 피드백과 출석까지 함께 읽는 것을 권합니다.",
      },
      {
        heading: "PC에서 내 성적 확인 절차",
        body: "PC 클래스인에서는 다음 순서로 종합 성적과 개별 활동 점수를 확인합니다.",
        steps: [
          "확인하려는 코스에 입장한 뒤 화면 상단(또는 좌측)의 [성적] 아이콘을 클릭합니다.",
          "우측 상단의 [종합 성적]에서 이 코스의 현재 평균 성적을 확인합니다.",
          "[학습 과정] 목록에서 참여한 개별 활동을 펼쳐 각 활동의 점수와 교사 피드백을 확인합니다.",
          "출석 기록 항목에서 결석·지각 등 내 참여 상태를 점수와 함께 점검합니다.",
        ],
      },
      {
        heading: "출석·활동별 점수를 읽는 법",
        body: "성적 화면의 숫자는 모두 같은 기준이 아닙니다. 무엇을 보는 점수인지 구분하면 해석이 정확해집니다.",
        steps: [
          "종합 성적: 코스 안 여러 활동을 합산·평균한 값입니다. 한 번의 시험 점수가 아니라 누적 결과이므로, 최근 활동 하나로 크게 출렁이지 않을 수 있습니다.",
          "활동별 점수: 시험·숙제·퀴즈처럼 개별 활동에 매겨진 점수입니다. 어떤 단원·유형에서 점수가 낮은지 여기서 확인합니다.",
          "출석 기록: 출석·지각·결석 등 참여 상태입니다. 코스 설정에 따라 출석이 종합 성적에 반영될 수도, 별도 기록으로만 남을 수도 있어 교사 안내를 함께 확인하세요.",
          "미채점 표시: 점수 대신 빈칸이나 '채점 전'으로 보이면 아직 교사가 채점하지 않았다는 뜻으로, 0점과는 다릅니다.",
        ],
      },
      {
        heading: "피드백을 약점 보완으로 잇는 학습 루틴",
        body: "성적 확인의 목적은 점수 자체가 아니라 다음에 무엇을 공부할지 정하는 것입니다. 활동별 피드백을 복습 계획으로 바꾸는 짧은 루틴을 만들어 두면 좋습니다.",
        steps: [
          "[학습 과정]에서 점수가 낮은 활동 2~3개를 먼저 펼쳐 교사 피드백을 읽습니다.",
          "반복해서 지적된 단원·유형을 한두 개로 좁혀 복습 우선순위로 정합니다.",
          "해당 단원의 녹화 수업 다시보기나 수업 자료를 찾아 틀린 부분만 다시 봅니다.",
          "코스에 AI 평가 기능이 열려 있다면, 성적을 바탕으로 한 정리·피드백을 받아 약점을 한 번 더 확인합니다.",
          "이해가 안 되는 점은 채팅이나 다음 수업에서 교사에게 질문해 매듭짓습니다.",
        ],
      },
      {
        heading: "흔한 오해와 확인 포인트",
        body: "성적 화면을 두고 학생들이 자주 헷갈리는 부분입니다. 점수가 이상해 보이면 먼저 아래를 확인하세요.",
        steps: [
          "'제출했는데 점수가 없다': 시험·숙제 점수는 교사가 채점해야 표시됩니다. 객관식처럼 자동 채점되는 활동이 아니면 채점까지 시간이 걸릴 수 있어요.",
          "'방금 본 시험이 평균에 안 보인다': 종합 성적은 채점 완료된 활동을 기준으로 갱신됩니다. 채점 전 활동은 평균에 반영되지 않습니다.",
          "'출석했는데 결석으로 보인다': 출석 인정 기준(입장 시각·체류 시간)은 코스마다 다를 수 있으니 교사 안내 기준을 확인하고, 기록이 다르면 교사에게 문의합니다.",
          "'오프라인 수업 점수가 안 보인다': 클래스인 성적은 코스 안에서 진행된 활동을 기준으로 합니다. 오프라인에서 본 지필 시험 등은 교사가 별도로 입력하지 않으면 표시되지 않을 수 있어, 통합 성적표가 필요하면 교사·학원에 문의하세요.",
        ],
      },
      {
        heading: "모바일·문제 발생 시 확인할 것",
        body: "기기나 권한 때문에 성적이 다르게 보일 때 점검할 기본 사항입니다.",
        steps: [
          "모바일 앱에서도 코스에 들어가 [성적]을 볼 수 있으나, 화면 구성과 보이는 항목은 PC와 다를 수 있어 자세한 항목은 PC에서 확인하는 편이 편합니다.",
          "성적이 비어 보이면 보고 있는 코스가 맞는지, 같은 학원 계정으로 로그인했는지 먼저 확인합니다.",
          "코스 설정에 따라 학생에게 점수 일부가 공개되지 않을 수 있으니, 보여야 할 항목이 안 보이면 교사에게 공개 범위를 문의합니다.",
        ],
      },
    ],
    relatedSlugs: ["course-submit-activity", "class-report", "ai-features"],
  },
  {
    slug: "drive",
    category: "student",
    title: "드라이브 활용하기",
    description: "자주 쓰는 파일과 숙제 템플릿, 수업 자료를 내 클래스인 계정의 드라이브에서 한 번에 관리하는 방법을 안내합니다.",
    audience: "자주 쓰는 파일·숙제 템플릿을 정리해 두려는 학생",
    updatedAt: "2026-05-14",
    readMinutes: 3,
    tags: ["드라이브", "파일", "숙제 템플릿"],
    keywords: ["드라이브", "파일 업로드", "폴더", "판서", "숙제 템플릿", "200MB"],
    chatbotSummary: "드라이브는 클래스인에서 자주 사용하는 파일을 내 계정 저장 공간에서 한 번에 관리할 수 있게 해 줍니다. PPT/PDF/Word/MP4 등 대부분 형식을 지원하지만 200MB를 초과하는 파일은 업로드할 수 없습니다. [업로드]와 [새로 만들기](폴더/판서/숙제) 기능을 활용합니다.",
    sections: [
      {
        heading: "드라이브를 쓰면 좋은 이유",
        body: "드라이브는 클래스인 내에서 자주 사용하거나 관리해야 하는 많은 파일들을 내 계정의 저장 공간에서 한 번에 관리하고 확인할 수 있는 기능입니다. 학생은 숙제 템플릿 저장, 수업 자료 보관, 복습용 자료 정리에 활용할 수 있어요.",
      },
      {
        heading: "지원 형식 및 용량 제한",
        body: "PPT, PDF, WORD, MP4 등 대부분의 형식을 지원하지만, 200MB를 초과하는 파일은 업로드가 불가능합니다. 드라이브에 올린 파일은 이후 개인 메시지, 채팅, 숙제 제출 등에 그대로 재사용할 수 있습니다.",
      },
      {
        heading: "드라이브 기본 사용 흐름",
        body: "드라이브 접속부터 콘텐츠 생성까지의 기본 절차입니다.",
        steps: [
          "화면 좌측의 [드라이브] 아이콘을 클릭해 접속합니다.",
          "[업로드] 버튼을 눌러 저장할 파일을 선택합니다.",
          "[새로 만들기] 메뉴에서 [폴더]·[판서]·[숙제] 중 필요한 항목을 만들어 정리합니다.",
        ],
      },
      {
        heading: "[새로 만들기] 항목별 활용",
        body: "[폴더]는 드라이브 내부 구조를 정리할 때, [판서]는 가상 칠판 파일을 만들어 직접 필기할 때, [숙제]는 자주 사용하는 숙제 양식을 미리 저장해 두고 재활용할 때 사용합니다.",
      },
    ],
    relatedSlugs: ["chat", "course-submit-activity", "class-report"],
  },
  {
    slug: "ai-features",
    category: "student",
    title: "AI 기능 활용하기",
    description: "코스 사이드바에서 바로 쓸 수 있는 AI 튜터와 AI 평가 기능으로 질문하고 학습 결과를 점검하는 방법을 안내합니다.",
    audience: "AI 도움을 받아 복습·자기평가를 강화하려는 학생",
    updatedAt: "2026-05-14",
    readMinutes: 6,
    tags: ["AI 튜터", "AI 평가", "복습", "피드백"],
    keywords: ["AI 튜터", "AI 평가", "코스 사이드바", "질문", "성적 분석", "학습 피드백"],
    chatbotSummary: "코스 내 좌측 사이드바에서 두 가지 AI 탭을 쓸 수 있습니다. AI 튜터는 해당 코스의 수업 자료와 수업 내용을 기반으로 모르는 내용을 답해 주고, AI 평가는 본인의 성적을 포함한 학습 결과를 정리해 피드백을 제공합니다. 두 기능 모두 코스 안에서 복습을 돕는 보조 도구이며, 코스에 없는 내용까지 답하거나 채점·리포트를 완전히 대신하지는 않습니다. 답변과 분석은 출발점으로 쓰고 수업 자료·교사 피드백과 함께 확인하는 것이 맞습니다.",
    sections: [
      {
        heading: "AI 기능을 쓰기 전에 알아둘 점",
        body: "AI 튜터와 AI 평가는 수업·녹화·과제·성적으로 이어지는 코스 학습 흐름을 보조하는 복습 도구입니다. 만능 채점기나 자동 리포트 생성기가 아니라, 모르는 부분을 다시 짚고 내 학습 상태를 정리해 다음 학습을 정하는 데 쓰는 출발점이라고 생각하면 활용하기 쉽습니다.",
        steps: [
          "AI 튜터는 해당 코스의 수업 자료와 수업 내용을 기반으로 답합니다. 코스 범위 밖의 내용은 정확하지 않을 수 있습니다.",
          "AI 평가는 내 성적과 학습 결과를 정리해 피드백을 주지만, 교사의 최종 채점이나 공식 성적을 대신하지 않습니다.",
          "AI 답변과 분석은 100% 정답이 아니라 복습의 출발점이므로 수업 자료·교사 피드백과 함께 확인합니다.",
          "기관 설정에 따라 AI 탭의 노출 여부나 범위가 달라질 수 있으니, 탭이 보이지 않으면 담당 선생님이나 학원에 문의합니다.",
        ],
      },
      {
        heading: "코스에서 AI 기능 열기",
        body: "AI 기능은 코스 단위로 제공됩니다. 공부할 코스에 들어간 뒤 좌측 사이드바에서 AI 튜터와 AI 평가 탭을 차례로 활용할 수 있습니다. 일반 웹 검색이 아니라 내가 듣는 코스 안에서 여는 것이 핵심입니다.",
        steps: [
          "공부하고자 하는 코스를 클릭해 입장합니다.",
          "좌측 사이드바에서 [AI 튜터] 탭을 열어 궁금한 점을 질문합니다.",
          "[AI 평가] 탭에서 본인의 성적과 학습 결과를 확인합니다.",
          "탭이 보이지 않으면 다른 코스에서 다시 시도하거나, 기관 설정 여부를 학원에 확인합니다.",
        ],
      },
      {
        heading: "AI 튜터 — 모르는 내용을 그때 그때 질문",
        body: "AI 튜터에서는 학습 중 모르는 내용을 질문할 수 있고, 답변은 해당 코스의 수업 자료와 수업 내용을 기반으로 제공됩니다. 일반 검색과 달리 우리 코스 맥락에서 정리된 답을 받을 수 있다는 점이 강점입니다. 다만 코스 자료에 없는 내용은 답이 부정확하거나 빈약할 수 있으니, 자료 범위 안에서 묻고 받은 답은 한 번 더 확인하는 습관이 좋습니다.",
        steps: [
          "녹화 다시보기나 학습 자료를 먼저 본 뒤, 막힌 지점을 정해 질문합니다.",
          "받은 답이 수업 자료와 맞는지 비교하고, 다르면 교사에게 다시 확인합니다.",
          "코스 범위 밖(다른 과목, 시험 정답 요구 등)은 정확도가 떨어질 수 있음을 감안합니다.",
        ],
      },
      {
        heading: "좋은 질문 예시 — 이렇게 물으면 답이 좋아집니다",
        body: "AI 튜터는 막연한 질문보다 어디서 왜 막혔는지가 분명한 질문에 더 잘 답합니다. 코스 자료와 연결된 구체적인 질문일수록 도움이 되는 답을 받습니다.",
        steps: [
          "좋은 예: '3강에서 설명한 함수의 정의역 구하는 과정 중 분모가 0이 되는 부분을 다시 설명해 줘.'",
          "좋은 예: '오늘 숙제 2번 풀이에서 내가 부호를 어디서 틀렸는지 단계별로 짚어 줘.'",
          "좋은 예: '이번 단원 핵심 개념 세 가지를 한 줄씩 정리하고, 헷갈리기 쉬운 부분을 알려 줘.'",
          "피하면 좋은 예: '시험 문제 답 알려 줘', '이거 다 해 줘'처럼 학습 과정을 건너뛰는 요청.",
          "막연한 '몰라요' 대신 '어디까지는 이해했고 무엇부터 막혔는지'를 한 줄 덧붙이면 답이 정확해집니다.",
        ],
      },
      {
        heading: "AI 평가 — 내 학습 결과를 한눈에 정리",
        body: "AI 평가에서는 본인의 성적을 포함한 학습 결과를 종합해 확인할 수 있고, 어떤 부분이 부족하고 어떤 부분이 잘 되고 있는지 피드백을 받습니다. 부족한 단원을 다시 공부할 우선순위를 정하는 데 쓰기 좋습니다. 다만 여기 정리된 내용은 학습 방향을 잡기 위한 참고이며, 공식 성적·진도 판단은 교사와 학원 기록이 기준입니다.",
        steps: [
          "강한 영역과 약한 영역을 확인하고, 약한 단원의 복습 우선순위를 정합니다.",
          "피드백에서 짚어 준 부분을 녹화 다시보기·학습 자료·숙제로 연결해 보완합니다.",
          "분석 결과가 실제 체감과 다르면 교사에게 확인을 요청해 공식 기록과 맞춥니다.",
        ],
      },
      {
        heading: "복습 루틴에 녹이기 — 수업 후 활용 순서",
        body: "AI 기능은 한 번 써 보고 끝내기보다 수업 후 복습 흐름에 끼워 넣을 때 효과가 납니다. 수업·녹화·과제로 이어지는 코스 운영 안에서 AI를 마지막 점검 단계로 두는 방식을 권합니다.",
        steps: [
          "수업 직후: 녹화 다시보기로 흐름을 복습하고, 막힌 지점을 메모해 둡니다.",
          "복습 중: 메모한 막힌 지점을 AI 튜터에 코스 자료 기준으로 질문합니다.",
          "과제 후: AI 평가로 부족한 단원을 확인하고 다음 복습 범위를 정합니다.",
          "주기적으로: 약한 영역이 줄고 있는지 점검하고, 잘 풀리지 않으면 교사 피드백을 함께 받습니다.",
        ],
      },
      {
        heading: "자주 하는 실수와 한계 — 균형 있게 쓰기",
        body: "AI 튜터와 AI 평가를 처음 쓸 때 흔히 겪는 오해를 미리 알아 두면 실망 없이 도구를 잘 활용할 수 있습니다. 핵심은 AI를 정답기로 믿지 않고 복습 보조로 쓰는 것입니다.",
        steps: [
          "AI를 정답으로 그대로 믿는 실수: 답은 출발점으로 쓰고 수업 자료·교사 피드백과 교차 확인합니다.",
          "코스 밖 내용을 묻고 정확하지 않다고 여기는 실수: AI 튜터는 코스 자료 범위 안에서 가장 잘 답합니다.",
          "AI 평가를 공식 성적으로 오해하는 실수: 분석은 학습 방향 참고용이고, 공식 성적은 교사·학원 기록이 기준입니다.",
          "한 번에 다 시키는 실수: '전부 풀어 줘'보다 막힌 단계를 나눠 물을 때 학습에 더 도움이 됩니다.",
          "탭이 안 보일 때 혼자 단정하는 실수: 기관 설정에 따라 노출이 다르므로 학원에 확인합니다.",
        ],
      },
    ],
    relatedSlugs: ["course-submit-activity", "course-grades", "class-report"],
  },
  {
    slug: "webcam-cms-setup-t1-panorama",
    category: "board",
    title: "웹캠 네트워크 + CMS 카메라 세팅 (T1 + Panorama)",
    description: "전자칠판 도입 현장에서 T1·S1 웹캠 네트워크를 구성하고 CMS로 트래킹/파노라마 카메라를 설정한 뒤 클래스인에 등록하는 전 과정을 단계별로 정리한 설치 가이드입니다.",
    audience: "전자칠판 도입 학원의 IT 담당자, 설치 엔지니어, 운영팀",
    updatedAt: "2026-05-14",
    readMinutes: 12,
    visibility: "unlisted",
    tags: ["전자칠판", "웹캠", "CMS", "T1", "Panorama", "설치"],
    keywords: ["웹캠 네트워크", "CMS 카메라 세팅", "T1 카메라", "S1 카메라", "Panorama 카메라", "전자칠판 설치", "트래킹 카메라", "Clip area", "RTSP", "POE", "Lecturer 영역", "Blocking zone", "Preset"],
    chatbotSummary: "T1·S1 웹캠 설치 시 메인 이더넷은 자동 IP, 카메라 이더넷은 고정 IP(192.168.1.222/255.255.255.0)로 설정한 뒤 CameraCMS에서 카메라를 등록합니다. T1은 Preset 1 트래킹 화면, Lecturer/Blocking zone, Basic2·Adv.1 옵션 순으로 설정하고, S1은 Stand up·Close up·Multi-obj·Sit down을 활성화합니다. Panorama는 Clip area 지정으로 잡고, 클래스인에서는 자동 인식되는 'Classin Camera - T1/S1'을 영문명으로 등록합니다.",
    sections: [
      {
        heading: "1. 네트워크 세팅 전 준비사항",
        body: "현장 방문 전 네트워크 환경과 배선 동선을 미리 확인해야 설치 중 가장 흔한 트러블을 줄일 수 있습니다.",
        steps: [
          "메인 네트워크 랜선이 최소 Cat 6.0 이상인지 확인합니다.",
          "메인 네트워크 속도를 체크해 최소 170Mbps 이상이 나오는지 확인합니다.",
          "현장에 설치되는 웹캠 기종(T1, S1, OT1 등)을 파악합니다.",
          "POE 설치 위치와 랜선 연결 기기 현황을 점검합니다.",
          "랜선 1은 메인 네트워크 → 전자칠판 하단 LAN 포트로 연결합니다.",
          "랜선 2는 POE ⇄ T1 LAN 포트로 연결합니다.",
          "랜선 3은 POE ⇄ 전자칠판 OPS로 연결합니다.",
        ],
      },
      {
        heading: "2. 메인 이더넷 자동 IP/DNS 설정",
        body: "Windows의 두 이더넷 중 메인 네트워크용 어댑터는 DHCP로 두어 인터넷과 통신하도록 설정합니다.",
        steps: [
          "바탕화면 시작 표시줄에서 '설정'을 클릭합니다.",
          "'네트워크 및 인터넷'을 클릭한 뒤 이더넷과 이더넷 N(숫자) 두 개를 확인합니다.",
          "'고급 네트워크 설정' → '어댑터 옵션 변경'을 차례로 클릭합니다.",
          "메인 이더넷을 우클릭한 뒤 '설정'을 클릭합니다.",
          "'인터넷 프로토콜 버전4(TCP/IPv4)' → '속성'을 클릭합니다.",
          "'자동으로 IP 주소 받기'와 '자동으로 DNS 서버 주소 받기'에 모두 체크합니다.",
          "'확인'을 눌러 저장합니다.",
        ],
      },
      {
        heading: "3. 카메라 이더넷 고정 IP 설정",
        body: "카메라 전용 네트워크에는 CMS가 인식할 수 있도록 고정 IP를 부여합니다.",
        steps: [
          "카메라 이더넷을 우클릭한 뒤 '설정'을 클릭합니다.",
          "'인터넷 프로토콜 버전4(TCP/IPv4)' → '속성'을 클릭합니다.",
          "'다음 IP 주소 사용'을 체크합니다.",
          "IP 주소에 192.168.1.222를 입력합니다.",
          "서브넷 마스크에 255.255.255.0을 입력합니다.",
          "'확인' → '닫기'를 차례로 클릭합니다.",
        ],
      },
      {
        heading: "4. CameraCMS 실행 및 카메라 등록",
        body: "네트워크 세팅이 끝나면 CameraCMS에서 카메라가 'Connected' 상태로 잡히는지 먼저 확인합니다.",
        steps: [
          "바탕화면의 'CameraCMS' 아이콘을 더블클릭해 실행합니다.",
          "'Start search' 버튼을 클릭해 네트워크 상의 카메라를 검색합니다.",
          "'Add to client' → 'add'를 클릭해 검색된 웹캠을 추가합니다.",
          "카메라 상태가 'Connected'인지 확인합니다. 'connection failed'가 표시되면 네트워크 세팅을 재확인합니다.",
          "상단의 'Main View'를 클릭해 카메라 화면을 띄웁니다.",
        ],
      },
      {
        heading: "5. T1 트래킹 카메라 Preset 1 설정",
        body: "T1의 Preset 0은 초기(줌 아웃) 화면, Preset 1은 교사 트래킹용 클로즈업 화면입니다. Preset 1을 강의 환경에 맞게 잡아 저장합니다.",
        steps: [
          "Main View에서 'Stop'을 클릭해 트래킹을 정지시킵니다.",
          "'Presets'에서 1을 선택합니다.",
          "'PTZ Lens'의 방향 버튼과 줌 버튼으로 교사가 적절한 크기·높이로 잡히도록 앵글을 조정합니다.",
          "'Set'을 클릭해 Preset 1을 저장합니다.",
          "'Settings'를 클릭해 세부 설정 화면으로 진입합니다.",
        ],
      },
      {
        heading: "6. T1 Basic1 - Lecturer 영역 및 Blocking zone 설정",
        body: "Lecturer 영역은 트래킹 대상 범위, Blocking zone은 인물 포스터·마네킹 등 오인식 차단 영역을 의미합니다.",
        steps: [
          "'Basic1'을 클릭합니다.",
          "'Lecturer' 버튼을 클릭합니다.",
          "초록색 교사 트래킹 영역을 우클릭 & 드래그로 지정합니다.",
          "높이 상한선은 칠판 상단 가장자리보다 약간 낮고 교사 머리보다 높게 설정합니다.",
          "높이 하한선은 맨 앞 자리 학생보다 높게 설정합니다.",
          "너비는 전자칠판 너비를 넘지 않으면서 자연스러운 트래킹이 되도록 잡습니다.",
          "'Blocking zone' 체크박스 '1'을 클릭합니다.",
          "포스터·마네킹 등 오인식되는 영역을 우클릭 & 드래그로 지정합니다. (Blocking zone에 교사가 들어가면 트래킹 대상으로 인식되지 않으므로 주의)",
          "'Save'를 클릭합니다.",
        ],
      },
      {
        heading: "7. T1 Basic2·Adv.1 옵션 설정",
        body: "트래킹 동작 모드, 카메라 부팅 시 동작, 디렉터 규칙 등을 지정합니다.",
        steps: [
          "'Basic2'를 클릭합니다.",
          "Tilt motion과 Outside platform을 비활성화합니다.",
          "Target lost action을 'No.1 preset'으로 설정합니다.",
          "Video auto switch를 'Feature switch'로 설정합니다.",
          "Power on state를 'Track'으로 설정한 뒤 'Save'를 클릭합니다.",
          "'Adv.1'을 클릭합니다.",
          "Track model을 'Normal'로 설정합니다.",
          "Director rules를 'Internal director and switch'로 설정한 뒤 'Save' → 'Exit'를 클릭합니다.",
        ],
      },
      {
        heading: "8. T1 트래킹 동작 확인",
        body: "옵션 저장 후 실제 트래킹이 정상 작동하는지 현장에서 확인합니다.",
        steps: [
          "'Track' 항목의 'Start' 버튼을 클릭합니다.",
          "카메라의 녹색등이 점등되는지 확인합니다.",
          "실제 카메라 화면에서 트래킹이 정상 작동하는지 확인합니다.",
          "오작동이 발견되면 이전 단계로 돌아가 Lecturer·Blocking zone·옵션을 재조정합니다.",
        ],
      },
      {
        heading: "9. S1 카메라 트래킹 설정",
        body: "S1은 '앉아 있는 학생이 일어날 때 해당 학생에게 자동 줌인'하는 학생용 트래킹 카메라로, T1보다 트래킹 강도가 약합니다.",
        steps: [
          "'Main View'를 클릭한 뒤 S1 카메라를 더블클릭해 진입합니다.",
          "하단의 '전체 화면' 아이콘을 클릭합니다.",
          "'Stop'을 눌러 트래킹을 멈춥니다.",
          "'Preset 1'을 선택한 뒤 방향·줌 버튼으로 학생이 적절한 크기·높이로 잡히게 조정합니다.",
          "'Set'을 클릭해 화면을 저장하고 'Settings'에 진입합니다.",
          "'Basic1'을 선택한 뒤 'Blocking zone' 체크박스 '1'을 클릭하고 우클릭 & 드래그로 차단 영역을 지정합니다. (복수 설정 가능)",
          "'Save'를 클릭합니다.",
          "'Basic2'를 클릭한 뒤 Target lost action을 'No.1 preset', Video auto switch를 'feature switch', Power On stage를 'Track'으로 설정하고 'Save'를 클릭합니다.",
          "'Adv.1'을 클릭한 뒤 Stand up, Close up, Multi-obj, Sit down 우측 체크박스를 모두 활성화하고 'Save'를 클릭합니다.",
        ],
      },
      {
        heading: "10. T1 Panorama (인강형) 카메라 설정",
        body: "T1의 Panorama 출력은 'Clip area'로 지정한 영역이 그대로 송출됩니다. 트래킹 설정과 별개로 Clip area만 별도로 잡아 줍니다.",
        steps: [
          "전자칠판에서 CMS 프로그램을 실행합니다.",
          "CMS 메인 화면에서 T1을 더블클릭해 Main View로 이동합니다.",
          "화면 아래의 'Stop' 버튼을 클릭해 트래킹을 비활성화합니다.",
          "'Setting'을 클릭해 세부 설정 화면으로 진입합니다.",
          "기존 설정은 그대로 두고 'Clip area' 영역만 원하는 파노라마 범위로 지정합니다.",
          "클래스인 칠판 화면에서 Panorama 카메라 앵글이 의도한 대로 나오는지 확인합니다.",
          "PTZ 카메라(OT1 등)에는 Clip area 기능이 없으므로, 트래킹 종료 후 Preset 1을 줌인·이동시켜 앵글을 저장하는 방식으로 대체합니다.",
        ],
      },
      {
        heading: "11. 클래스인에 웹캠 등록하기",
        body: "CMS 설정이 끝나면 클래스인 칠판 설정에서 네트워크 카메라를 추가해 Closeup/Panorama 두 앵글을 등록합니다.",
        steps: [
          "클래스인을 실행하고 '칠판' 영역으로 진입합니다.",
          "하단 중앙을 쓸어내려 톱니바퀴(설정) 아이콘을 클릭합니다.",
          "'카메라' 항목에서 '설정 더보기'를 클릭합니다.",
          "'네트워크 카메라' → '네트워크 카메라 추가하기'를 클릭합니다.",
          "정상 연결 시 자동으로 노출되는 'Classin Camera - T1/S1'을 선택하면 Closeup/Panorama 두 앵글이 함께 등록됩니다.",
          "웹캠 이름은 영문으로 입력합니다. (예: Classin Cam T1(Close-Up)) 한국어 이름은 재접속 후 공백으로 바뀌는 오류가 발생할 수 있습니다.",
          "자동 입력이 되지 않을 경우 T1-Tracking은 rtsp://192.168.1.180/1, T1-Panorama는 rtsp://192.168.1.180/2로 등록합니다.",
          "S1-Tracking은 rtsp://192.168.1.179/1, S1-Panorama는 rtsp://192.168.1.179/2로 등록합니다. (IP는 CMS 기본값 기준이며 현장에 따라 다를 수 있음)",
          "'확인'을 클릭한 뒤 카메라를 활성화하고 정상 작동을 확인합니다.",
        ],
      },
      {
        heading: "12. 마무리 체크리스트",
        body: "현장 인계 전 시연과 피드백 수렴까지 마쳐야 설치가 종료됩니다.",
        steps: [
          "T1 트래킹·Panorama, S1 트래킹·Panorama 네 앵글이 모두 클래스인에서 송출되는지 확인합니다.",
          "교사 동선과 학생 자리 배치에 맞춰 Lecturer 영역·Blocking zone·Clip area를 재조정합니다.",
          "기관 관계자 시연을 진행하고 피드백을 받아 즉시 반영합니다.",
          "네트워크 세팅 단계에서 발생한 이슈와 변경된 IP 정보를 인수인계 자료에 기록합니다.",
        ],
      },
    ],
  },
  {
    slug: "customer-stories",
    category: "start",
    title: "클래스인 도입 학원 사례와 현장 후기",
    description: "국어·영어·과학·입시·온라인·하이브리드 등 과목과 운영 형태별로 클래스인을 도입한 학원이 수업 운영을 어떻게 바꿨는지, 그리고 원장·강사의 실제 후기를 한곳에 정리했습니다.",
    audience: "학원 원장, 관리자, 운영 책임자, 도입 검토자",
    updatedAt: "2026-06-17",
    readMinutes: 6,
    featured: true,
    tags: ["도입 사례", "고객 후기", "학원 사례", "원장 후기", "강사 후기", "도입 효과"],
    keywords: ["학원 도입 사례","우리 같은 학원 사례","비슷한 학원 사례","국어학원 사례","영어학원 사례","과학학원 사례","입시학원 사례","온라인 수업 사례","하이브리드 수업 사례","원장 후기","강사 후기","고객 후기","도입 후기","도입하면 뭐가 바뀌어요","도입 효과"],
    chatbotSummary: "클래스인은 국어·영어·과학·입시·온라인·하이브리드 등 다양한 학원에서 도입했고, 공통적으로 수업 기록 누적 → 강사별 편차 감소 → 상담·후속관리 표준화로 이어졌습니다. 비슷한 과목·운영 형태의 사례와 원장·강사 후기를 안내해 드릴 수 있고, 우리 학원에 맞는 사례는 도입 상담이나 목동 쇼룸에서 더 구체적으로 확인하실 수 있습니다.",
    sections: [
      { heading: "어떤 학원들이 도입했나요", body: "클래스인은 특정 과목 전용 도구가 아니라 수업 준비·판서·녹화·과제·학생 관리를 하나로 묶는 학원 수업 운영 시스템이라, 국어·영어·과학 같은 단과 전문 학원부터 정규반과 특강을 함께 운영하는 입시 학원, 비대면 중심 온라인 학원, 강의실마다 환경이 다른 하이브리드 학원까지 폭넓게 쓰입니다. 현재 국내 다양한 학원에서 운영 중이며, 대부분 전자칠판 + 수업 녹화 + 수업 관리를 함께 쓰는 스탠다드 구성으로 시작합니다.", steps: ["국어 전문 학원: 첨삭과 과제 피드백을 누적 기록으로 표준화한 사례","영어 학원: 듣기·단어 자동채점으로 반복 채점과 보조 운영 부담을 줄인 사례","과학 전문 학원: 반별 수업 기록과 평가 데이터로 상담 준비를 단축한 사례","입시 전문 학원: 고난도 판서와 풀이 과정을 복습 자산으로 남긴 사례","온라인 수업 전문: 참여형 활동과 수업 기록을 연결해 비대면 참여도를 끌어올린 사례","하이브리드·집중형 강의실: 보드 중심으로 교실 환경을 표준화한 사례"] },
      { heading: "국어 전문 학원 — 첨삭·과제 기록을 누적해 강사 편차를 줄였습니다", body: "국어 수업은 풀이보다 과정 설명과 첨삭이 중요한데, 그 방식이 강사 개인기에 의존하면 학부모에게 전달되는 정보의 깊이가 강사마다 달라집니다. 청주 이** 국어 학원(국어 전문, 내신·수능 대비)은 첨삭 기록과 과제 이력을 클래스인에 누적하면서 강사별 편차를 줄이고, 학생 변화와 다음 과제를 더 선명하게 짚어 학부모 상담의 설득력을 높였습니다.", steps: ["도전 과제: 첨삭과 과제 피드백이 강사 개인 방식에 의존해 학부모 전달 정보의 깊이가 달랐습니다.","변화: 첨삭 기록과 과제 이력을 누적해 강사별 편차를 줄이고 상담 설득력을 높였습니다.","담당 강사 후기: 국어 수업은 과정 설명이 중요한데, 누적 기록이 생기니 학생 변화와 다음 과제를 더 선명하게 전달할 수 있었습니다."] },
      { heading: "영어 학원 — 자동채점으로 반복 업무를 덜었습니다", body: "영어는 듣기와 단어처럼 반복 채점이 많은 과목이라, 채점 자체가 보조 강사와 운영 인력의 시간을 크게 잡아먹습니다. 수능·내신 영어학원인 올***영어는 듣기·단어 자동채점만으로도 보조 강사 업무량과 운영 인력 부담이 눈에 띄게 줄었다고 전합니다. 반복 채점에서 확보한 시간을 수업과 학생 관리로 돌릴 수 있다는 점이 핵심입니다.", steps: ["도전 과제: 듣기·단어 등 반복 채점이 보조 강사와 운영 인력의 업무량을 키웠습니다.","변화: 자동채점으로 반복 채점 부담을 줄여 인력 리소스를 수업·관리로 재배치했습니다.","올***영어 원장 후기: 솔직히 클래스인이 없으면 학원 운영이 안 됩니다. 듣기·단어 자동채점만으로도 보조 강사 업무량과 학원 운영 인력 부담이 확 줄었어요."] },
      { heading: "과학 전문 학원 — 흩어진 평가 데이터를 상담 자산으로 모았습니다", body: "반별 진도와 테스트 결과가 여러 곳에 흩어져 있으면 학생별 약점 파악과 재원 관리가 늦어지고, 상담 때마다 자료를 다시 모으는 일이 반복됩니다. 부산 과** 학원(과학 전문, 중·고등 내신 관리)은 반별 수업 기록과 평가 데이터를 한 흐름으로 정리해 상담 준비 시간을 줄이고 학습 피드백의 일관성을 높였습니다.", steps: ["도전 과제: 반별 진도와 테스트 결과가 흩어져 학생별 약점 파악과 재원 관리가 늦어졌습니다.","변화: 반별 수업 기록과 평가 데이터를 정리해 상담 준비 시간을 줄이고 피드백 일관성을 높였습니다.","원장 후기: 이전에는 상담 전마다 자료를 다시 모아야 했는데, 지금은 학생별 흐름이 바로 보여서 훨씬 빠르게 판단할 수 있습니다."] },
      { heading: "입시 전문 학원 — 휘발되던 판서·풀이를 복습 자산으로 남겼습니다", body: "고난도 수업일수록 판서와 풀이 과정이 그 자리에서 끝나버리면, 결석생이나 복습이 필요한 학생에게 같은 품질로 전달하기 어렵습니다. 대치 세** 학원(입시 전문, 상위권 집중 관리)은 실시간 판서와 수업 자료를 수업 흐름 안에 모아 복습 자료화와 보강 운영의 밀도를 높였습니다. 정규반과 특강을 함께 운영하는 대구 학** 학원은 강의 자료·출결·과제 안내를 한곳에 모아 강사와 운영팀이 같은 기준으로 학생을 관리하게 됐고, 중·고등 수업을 운영하는 평택 윤** 학원은 분산돼 있던 수업 자료와 판서 기록을 클래스인 중심으로 정리해 수업 이후 복습 안내와 보강 관리를 더 빠르게 연결했습니다.", steps: ["대치 세** (상위권 집중 관리): 고난도 판서·풀이가 휘발돼 결석·복습 학생에게 같은 품질 전달이 어려웠으나, 판서와 자료를 수업 흐름에 모아 복습·보강 밀도를 높였습니다.","대구 학** (정규반·특강 병행): 강의 자료·출결·과제 안내를 한곳에 모아 같은 기준으로 학생을 관리하게 됐습니다.","평택 윤** (중·고등 운영): 분산된 수업 자료·판서 기록을 클래스인 중심으로 정리해 복습 안내와 후속 관리를 빠르게 연결했습니다."] },
      { heading: "온라인 수업 전문 — 비대면에서도 참여 흐름이 보입니다", body: "비대면 수업의 가장 큰 어려움은 학생 참여도와 활동 결과를 한눈에 확인하기 어렵다는 점입니다. 온라인 수업을 전문으로 하는 12인 에** 학원은 게임형 참여 활동과 수업 기록을 연결해, 온라인에서도 학생이 직접 움직이는 수업을 만들고 학생별 참여 흐름을 더 선명하게 파악하게 됐습니다. 한국 현장에서는 실시간 전자칠판 판서 → 녹화 → 다시보기, 그리고 LMS 숙제·시험을 클래스인 안에서 해결하는 방식으로 온라인 활용도가 특히 높습니다.", steps: ["도전 과제: 비대면 수업에서 학생 참여도와 활동 결과를 한눈에 확인하기 어려웠습니다.","변화: 게임형 활동과 수업 기록을 연결해 참여 흐름을 파악하고 피드백 속도를 높였습니다.","운영팀 후기: 온라인 수업에서도 학생들이 직접 움직이는 느낌이 생겼습니다. 참여 결과가 보여서 피드백도 빨라졌습니다."] },
      { heading: "하이브리드·집중형 강의실 — 교실 환경을 표준화했습니다", body: "강의실마다 장비와 수업 환경이 다르면 수업 준비와 장비 점검에 매번 같은 시간이 들어갑니다. 하이브리드 수업 환경의 천안 제** 학원(집중형 강의실)은 클래스인 보드 중심으로 교실 환경을 표준화해 수업 준비 부담을 줄이고 운영 안정성을 높였습니다. 윈도우 기반 OPS가 내장된 보드를 기준으로 잡으면 판서·녹화·수업 도구가 한 기기에서 작동해, 강의실마다 PC·케이블·호환 프로그램을 따로 맞추는 번거로움을 줄일 수 있습니다.", steps: ["도전 과제: 강의실마다 장비와 환경이 달라 수업 준비와 점검에 반복 시간이 들었습니다.","변화: 보드 중심으로 교실 환경을 표준화해 준비 부담을 줄이고 운영 안정성을 높였습니다.","운영 담당자 후기: 강의실 세팅이 일정해지니 수업 시작 전 확인해야 할 일이 줄었고, 운영팀도 훨씬 안정적으로 움직입니다."] },
      { heading: "공통 변화 패턴 — 기록 누적 → 표준화 → 후속관리", body: "과목과 운영 형태는 달라도, 도입 학원들이 체감한 변화는 거의 같은 순서를 따릅니다. 먼저 판서·자료·첨삭·평가가 자동으로 기록으로 남고(기록 누적), 그 기록이 강사 개인기에 의존하던 수업을 기관의 반복 가능한 기준으로 바꾸며(표준화), 마지막으로 누적된 데이터가 상담·복습·보강 같은 후속관리로 이어집니다(후속관리). 도입하면 뭐가 바뀌느냐는 질문에는 이 세 단계로 설명드리는 편이 가장 정확합니다.", steps: ["1단계 기록 누적: 판서·수업 화면·자료·첨삭·테스트 결과가 휘발되지 않고 수업 흐름 안에 남습니다.","2단계 표준화: 강사별로 달랐던 수업·피드백 방식이 기관 공통 기준으로 정리되고, 신규 강사 온보딩도 쉬워집니다.","3단계 후속관리: 누적 데이터로 상담 준비 시간이 줄고, 복습·보강 안내와 학생별 후속 관리가 빨라집니다.","도입 기간: 대부분 전자칠판 + 녹화 + 수업 관리의 스탠다드 구성으로 시작하며, 정착까지 평균 3개월(보통 3~4개월) 정도가 걸립니다."] },
      { heading: "원장·강사 후기 모음", body: "제품 기능뿐 아니라 도입 과정의 지원과 운영 케어에 대한 후기도 많습니다. 다른 원장·강사의 목소리가 궁금하시면 아래 후기를 참고해 주세요. 모두 실제 사용자 후기를 출처 방식대로 익명화한 것입니다.", steps: ["국어 전문 학원 권** 대표: 오프라인 수업이 신석기 문화라면, 기존 전자칠판은 청동기, 클래스인은 철기 문화에 가깝습니다.","수능/내신 영어학원 올***영어 원장: 솔직히 클래스인이 없으면 학원 운영이 안 됩니다. 자동채점만으로도 보조 강사·운영 인력 부담이 확 줄었어요.","강사 회원 라**: 클래스인 덕분에 돈 벌면서 유학 공부할 수 있게 됐어요.","입시 학원 천** 부원장: 진심으로 응대해 주시고 잘 케어해 주신 덕분에, 저희가 불편함 없이 쓰고 있다고 직원분들이 입을 모아 말합니다.","어학원 부산 **에듀 원장: 결제 완료했습니다. 아주 잘 사용하고 있어요. 감사합니다.","어학원 고** 원장: 우리 지역에서 클래스인의 전도사가 되어보겠습니다.","국어 전문 학원 김** 대표: 덕분에 좋은 문물을 접했습니다. 감사합니다."] },
      { heading: "우리 학원과 비슷한 사례가 더 궁금하다면", body: "여기 정리한 사례 외에도 과목·규모·운영 방식에 따라 참고할 수 있는 사례가 더 있습니다. 우리 같은 ○○학원 사례 있어요?처럼 구체적으로 물어보시면 가장 가까운 사례를 안내해 드릴 수 있고, 실제 수업 환경과 보드를 직접 보고 싶으시면 목동 쇼룸 방문이나 도입 상담으로 더 구체적인 운영 시나리오를 확인하실 수 있습니다.", steps: ["비슷한 과목·운영 형태(국어·영어·과학·입시·온라인·하이브리드)로 사례를 좁혀 문의해 주세요.","목동 쇼룸에서 전자칠판·녹화·수업 도구가 한 흐름으로 작동하는 모습을 직접 확인할 수 있습니다.","도입 상담에서는 우리 학원의 현재 수업·운영 방식에 맞춘 도입 범위와 일정을 함께 잡습니다."] }
    ],
    resources: [
      { label: "클래스인 도입 사례 모아보기", href: "/#case-studies", description: "과목·운영 형태별 도입 학원의 도전 과제와 결과를 카드로 정리한 페이지입니다." },
      { label: "학원 시스템 OS 진단 체크리스트", href: "/resources/academy-system-checklist", description: "우리 학원의 수업·녹화·교안·과제·학생 관리가 흩어져 있는지 점검하는 진단 자료입니다." },
      { label: "도입 상담·목동 쇼룸 문의", href: "/contact", description: "우리 학원과 비슷한 사례 안내와 쇼룸 방문, 도입 범위 상담을 요청할 수 있습니다." }
    ],
    relatedSlugs: ["academy-system-os-positioning","software-overview","board-overview","why-classin-needs","adoption-journey-90days"],
    status: "published",
    visibility: "public",
    docType: "guide",
    productArea: "general",
    difficulty: "beginner",
  },
  {
    slug: "why-classin-needs",
    category: "start",
    title: "클래스인이 해결하는 문제 — 도입 전 흔한 고민과 답변",
    description: "지금도 수업은 돌아가는데 클래스인이 왜 필요한지, 전자칠판이나 줌과 무엇이 다른지를 기능 비교가 아니라 학원 수업 운영 흐름과 운영비·강사 리소스 관점에서 정리했습니다.",
    audience: "학원 원장, 관리자, 운영 책임자",
    updatedAt: "2026-06-17",
    readMinutes: 6,
    featured: true,
    tags: ["도입 고민", "왜 필요", "전자칠판 차이", "줌 차이", "운영비", "강사 리소스", "학원 시스템 OS"],
    keywords: ["왜 필요","클래스인 왜 필요","지금도 잘 되는데","전자칠판 있는데 왜 바꿔","전자칠판 차이","구형 전자칠판","줌 차이","줌 쓰면 안 돼","줌으로 충분","강사 의존","강사 퇴사","반별 편차","수업 품질 편차","자료 분산","반복 업무","운영비"],
    chatbotSummary: "클래스인은 새 기능을 더 사자는 제안이 아니라, 수업·녹화·교안·과제·학생 데이터가 강사 개인과 여러 도구에 흩어져 운영비와 강사 리소스를 잡아먹는 구조를 한 흐름으로 묶는 학원 시스템 OS입니다. 지금도 되는데, 전자칠판 있는데, 줌이면 충분이라는 고민은 모두 기능이 아니라 운영 흐름과 누적 리소스 관점에서 답합니다.",
    sections: [
      { heading: "핵심: 도구가 흩어지면 운영비와 강사 리소스가 샙니다", body: "클래스인 도입 검토는 보통 기능이 더 필요해서가 아니라 지금 운영이 사람과 도구에 너무 의존해서 시작됩니다. 전자칠판은 전자칠판대로, 녹화는 별도 프로그램으로, 교안은 강사 노트북에, 과제와 성적은 메신저와 엑셀에 흩어져 있으면 장비를 좋은 걸 사도 운영은 다시 사람 손과 기억으로 돌아갑니다. 클래스인이 먼저 보는 문제는 기능 부족이 아니라, 흩어진 도구가 매일 강사 시간과 운영비를 조금씩 잡아먹는 구조 그 자체입니다.", steps: ["수업 준비, 판서, 녹화, 복습 배포, 과제, 학생 관리가 각각 다른 도구에 흩어져 있는지 봅니다.","그 사이를 이어 붙이는 일(파일 찾기, 녹화 업로드, 링크 배포, 기록 정리)을 누가 수동으로 하는지 확인합니다.","그 수동 작업이 강사·운영팀 시간이라는 보이지 않는 운영비라는 점을 기준으로 도입을 판단합니다."] },
      { heading: "강사 의존 리스크 — 에이스가 나가면 그 반은", body: "좋은 수업이 특정 강사의 개인 파일, 개인 판서 스타일, 개인 메신저에만 남아 있으면 그 강사가 빠질 때 반 전체가 흔들립니다. 홈페이지에서도 강사 이탈 후 재등록률이 약 20% 하락하고 신규 강사 적응에 평균 3개월이 든다는 점을 도입 고민의 대표 사례로 듭니다(학원 상황에 따라 다른 예시 수치). 클래스인은 우수 강사의 교안과 수업 흐름을 EDB 교안·녹화·LMS로 학원 자산에 남겨, 사람이 바뀌어도 같은 수업 기준을 이어가도록 돕는 쪽에 초점을 둡니다.", steps: ["수업 자료와 판서가 강사 개인 저장소가 아니라 학원 계정·교안 파일로 남는지 확인합니다.","강사 교체·반 이동 때 계정과 자료를 회수하고 넘길 기준이 있는지 점검합니다.","신규 강사가 에이스 강사의 교안 템플릿을 받아 같은 흐름으로 수업할 수 있게 설계합니다."] },
      { heading: "반별 품질 편차 — 같은 교재인데 결과가 다릅니다", body: "같은 교재, 같은 시간표인데 반마다 성적과 만족도가 다른 일은 흔합니다. 문제는 어느 반이 왜 흔들리는지를 보통 학부모 불만이나 강사 보고가 들어온 뒤에야 알게 된다는 점입니다. 클래스인은 수업이 강사 개인기에 따라 달라지던 방식을, 우수 교안 재사용과 권한 기반 운영 데이터(수업 시간·참여·특이사항)로 들여다볼 수 있는 기준으로 바꿉니다. 감으로 평가하던 수업 품질을 기록과 데이터로 보게 하는 것이 목적입니다.", steps: ["수업 품질을 강사 보고가 아니라 기록·참여 데이터로 먼저 볼 수 있는지 확인합니다.","우수 반의 교안과 수업 흐름을 다른 반·다른 지점에 옮길 수 있는지 점검합니다.","권한이 허용된 관리자만 수업 운영 데이터를 보도록 범위를 정합니다."] },
      { heading: "자료·기록 분산 — 학생 한 명을 보려면 도구 다섯 개", body: "수업 자료는 드라이브에, 녹화는 별도 폴더에, 과제는 메신저에, 출결과 성적은 엑셀에 있으면 학생 한 명의 학습 맥락을 보려고 매번 도구 다섯 개를 뒤져야 합니다. 학부모 상담 직전에 정보를 다시 모으는 일도 반복됩니다. 클래스인은 수업·판서·녹화·과제·복습을 학생 단위로 이어, 상담과 보강 때 흩어진 기록을 다시 짜 맞추지 않도록 묶는 데 초점을 둡니다.", steps: ["수업 자료, 판서, 녹화, 과제, 상담 기록이 학생 단위로 이어지는지 확인합니다.","결석 학생에게 녹화와 과제를 함께 안내할 수 있는지 점검합니다.","학부모 상담 전 학생의 수업·과제·복습 기록을 한 번에 볼 수 있게 정리합니다."] },
      { heading: "반복 운영업무 — 장비가 늘면 손이 더 갑니다", body: "녹화 파일 다운로드·업로드, 복습 링크 수동 배포, 자료 다시 띄우기, 출결 따로 정리 같은 일은 하나하나는 작아도 매주 쌓이면 큰 리소스입니다. 장비를 추가했는데 오히려 관리할 손이 더 늘어나는 경우도 많습니다. 클래스인은 녹화→복습 배포, 교안 재사용, 채팅·과제·LMS를 한 곳에서 잇는 흐름으로 이 반복 작업 자체를 줄이는 것을 목표로 합니다.", steps: ["녹화 업로드와 복습 배포가 수동 반복 업무로 남아 있는지 확인합니다.","강사가 칠판·카메라·마이크·녹화 프로그램을 각각 따로 관리하는지 점검합니다.","EDB 교안과 50페이지 칠판으로 자료를 매번 다시 띄우는 시간을 줄일 수 있는지 봅니다."] },
      { heading: "구형 전자칠판의 페인 — 칠판은 있는데 왜 또 손이 갈까", body: "전자칠판이 이미 있어도 페인이 남는 경우가 많습니다. 매 수업 외장 노트북·HDMI·터치 케이블을 연결해야 하고, 녹화는 칠판과 따로 놀아 별도 프로그램·업로드가 필요하며, 라이선스 유효기간이 지나면 효용이 떨어지고, 다른 시스템과 연동하려면 또 다른 시스템을 새로 구축해야 합니다. 클래스인 보드는 화면 출력·판서에 머무르지 않고 OPS(내장 PC)와 클래스인 소프트웨어로 판서·녹화·EDB·복습·수업 관리를 한 흐름으로 잇는다는 점에서 다릅니다.", steps: ["매 수업 외장 PC·HDMI·터치 케이블 연결이 필요한지 확인합니다.","녹화가 칠판과 따로 놀아 별도 업로드·배포 노동이 생기는지 점검합니다.","라이선스 유효기간·연동 부담 때문에 추가 시스템을 또 만들어야 하는지 봅니다."] },
      { heading: "반론 1 — 지금도 잘 되는데 왜 바꿔야 하나요?", body: "지금 잘 되는 건 보통 시스템이 좋아서가 아니라 사람이 잘 메우고 있어서인 경우가 많습니다. 잘 될 때는 문제없지만 에이스 강사 한 명이 빠지거나 반·지점이 늘면 그 의존이 한 번에 드러납니다. 바꾸자는 제안은 지금이 나쁘다가 아니라, 사람에게 기대 잘 굴러가는 부분을 흔들려도 무너지지 않는 기준으로 남겨두자는 쪽입니다. 한 반·한 강사 파일럿으로 작게 시작해 확인할 수 있습니다.", steps: ["지금 잘 되는 부분이 시스템 덕인지 특정 사람 덕인지 구분합니다.","그 사람이 빠지면 어디가 흔들리는지 한 가지를 꼽아봅니다.","대표 수업 1개·대표 강사 1명으로 작은 파일럿부터 검증합니다."] },
      { heading: "반론 2 — 전자칠판 있는데 왜 또 바꿔요? (전자칠판 차이)", body: "이미 전자칠판이 있다면 더 큰 화면은 이유가 되지 않습니다. 핵심 차이는 디스플레이가 아니라 그 뒤의 운영 흐름입니다. 일반 전자칠판이 화면 출력·판서에 머무는 경우가 많다면, 클래스인 보드는 OPS·소프트웨어로 녹화·EDB·복습·수업 관리까지 한 시스템으로 잇습니다. 즉 칠판을 바꾸는 결정이 아니라 칠판 뒤 수업 운영을 시스템으로 바꾸는 결정으로 보는 편이 맞습니다.", steps: ["비교 기준을 화면 크기가 아니라 녹화·EDB·복습·관리 연결로 바꿉니다.","지금 칠판이 녹화·복습 배포까지 이어지는지 점검합니다.","교체가 아니라 운영 흐름 전환 관점으로 도입 범위를 정합니다."] },
      { heading: "반론 3 — 그냥 줌 쓰면 안 되나요? (줌 차이)", body: "줌은 화상 연결이 필요할 때 좋은 도구지만 화상 회의 중심입니다. 클래스인은 수업 전 준비부터 실시간 판서, 녹화, LMS 숙제·시험, 관리자 운영 데이터까지 수업 운영 전체를 잇는 구조라는 점이 다릅니다. 한국 학원은 온라인보다 오프라인이 크고 학생이 개인 기기 수업을 꺼리는 경우가 많아, 실시간 전자칠판 판서→녹화→다시보기→LMS 과제·시험을 클래스인 안에서 해결하는 방식이 현실적입니다. 줌만으로는 이 흐름을 한 곳에 남기기 어렵습니다.", steps: ["필요한 게 단순 화상 연결인지, 판서·녹화·과제까지 이어지는 수업인지 구분합니다.","실시간 수업 후 녹화와 복습이 학생 관리로 이어지는지 확인합니다.","오프라인 중심 학원이라면 전자칠판 판서→녹화→LMS 흐름으로 검토합니다."] },
      { heading: "정직하게 — 클래스인이 다 해주지는 않습니다", body: "클래스인은 수업·녹화·EDB·LMS·학생 학습 데이터에 강하지만, 만능 제품처럼 말하지는 않습니다. 결제·정산, 오프라인 출입/출석, 고급 경영 리포트는 클래스인이 기본으로 다 대체한다고 보기 어렵고, 학원 운영 방식에 따라 별도 시스템이나 공식 API·커스텀 리포트로 역할을 나누는 편이 정직합니다. 도입 상담에서 클래스인만으로 안 되는 업무를 먼저 정하는 것이 오히려 성공적인 설계로 이어집니다.", steps: ["결제·정산은 기존 시스템과 역할 분담을 먼저 정합니다.","오프라인 출석은 현장 장비·운영 규칙에 따라 별도 프로세스 또는 연동으로 봅니다.","고급 리포트·자체 CRM은 공식 API와 데이터 구독, 커스텀 대시보드 범위로 분리해 검토합니다."] }
    ],
    resources: [
      { label: "학원 시스템 OS 진단 체크리스트", href: "/resources/academy-system-checklist", description: "수업·녹화·교안·과제·학생 관리가 흩어져 있는지 점검하는 진단 자료입니다." },
      { label: "Zoom·전자칠판·LMS 비교 도입 워크시트", href: "/resources/academy-software-selection-worksheet", description: "줌·전자칠판·LMS와 클래스인을 기능명이 아니라 운영 흐름으로 비교합니다." },
      { label: "목동 쇼룸 상담 신청", href: "/contact", description: "우리 학원 수업 한 편을 기준으로 도구 분산 문제와 도입 범위를 점검합니다." }
    ],
    relatedSlugs: ["academy-system-os-positioning","customer-stories","value-and-cost-framing","software-overview","board-overview"],
    status: "published",
    visibility: "public",
    docType: "guide",
    productArea: "general",
    difficulty: "beginner",
  },
  {
    slug: "value-and-cost-framing",
    category: "start",
    title: "도입 비용과 가치 — 견적 구성과 무엇을 비교해야 하나",
    description: "클래스인 도입 비용을 단순 전자칠판 가격표와 비교하기 전에, 견적이 무엇으로 구성되는지와 통합 학원 시스템 OS 관점에서 무엇을 함께 따져야 하는지 정리했습니다. 정확한 금액과 계약 조건은 상담으로 안내합니다.",
    audience: "학원 원장, 관리자, 도입 의사결정자",
    updatedAt: "2026-06-17",
    readMinutes: 6,
    featured: false,
    tags: ["도입 비용", "견적 구성", "TCO", "전자칠판 비교", "소프트웨어 요금", "도입 상담"],
    keywords: ["클래스인 가격","클래스인 비싸","견적 구성","견적에 포함","전자칠판 가격","전자칠판만 구매","OPS 내장","안드로이드 전자칠판 비교","소프트웨어 요금","TCO","총소유비용","도입 상담"],
    chatbotSummary: "클래스인 가격은 학원 규모·상황·패키지에 따라 달라서 한 번에 금액을 단정하지 않습니다. 먼저 규모와 상황을 확인한 뒤 패키지 기준으로 안내드리며(패키지 구성은 Education OS 안내 페이지에서 확인), 정확한 금액과 계약 조건은 상담에서 확정합니다. 견적은 전자칠판 단품이 아니라 전자칠판 + OPS 내장 PC + 카메라 + 스탠드/벽걸이 + 소프트웨어 + 온보딩이 묶인 학원 시스템 OS 구성으로 봅니다.",
    sections: [
      { heading: "견적은 무엇으로 구성되나", body: "가격은 학원 규모·상황·패키지에 따라 달라 한 번에 단정하기 어렵습니다. 규모와 상황을 먼저 확인하면 패키지 기준으로 더 정확히 안내드릴 수 있습니다. 클래스인 도입 견적은 전자칠판 한 대 가격이 아니라 수업이 바로 돌아가는 한 세트로 구성됩니다. 가장 많이 선택되는 조합은 전자칠판에 카메라, 스탠드 또는 벽걸이, 소프트웨어를 더한 구성이며, 여기에 설치와 강사 온보딩이 함께 따라옵니다. 각 항목의 정확한 금액은 모델, 교실 환경, 도입 대수, 소프트웨어 사용 범위에 따라 달라지므로 상담에서 확정합니다.", steps: ["전자칠판(메인 패널): 교실 크기와 수업 형태에 맞춰 모델을 선택합니다.","OPS 내장 PC: 윈도우 기반 컴퓨팅이 칠판 안에 들어가 별도 PC 없이 판서·녹화·소프트웨어가 함께 돕니다.","카메라: 수업 촬영과 녹화, 하이브리드 수업을 위한 구성입니다.","스탠드 또는 벽걸이: 이동형 스탠드 거치 또는 현장 벽걸이 설치 중 교실 환경에 맞게 선택합니다.","소프트웨어: 실시간 수업, EDB 교안, 녹화, LMS, 관리자 데이터를 잇는 클래스인 소프트웨어 사용 범위입니다.","온보딩과 설치: 현장 설치와 강사 교육으로 도입 첫 주부터 수업에 바로 쓰도록 지원합니다."] },
      { heading: "왜 단순 전자칠판 가격과 비교하면 안 되나", body: "클래스인 견적을 일반 전자칠판 단품 가격표와만 비교하면 가치가 작아집니다. 칠판만 따로 사면 녹화 장비, 수업용 PC, 학생 관리·과제·복습 도구, 관리자 데이터를 각각 따로 마련하게 되고, 그 사이를 매번 사람이 손으로 잇는 시간이 운영비로 쌓입니다. 클래스인 보드는 OPS·녹화·소프트웨어가 한 시스템으로 묶여 있어, 비교 기준을 전자칠판 단가가 아니라 학원 시스템 OS 한 세트의 총소유비용(TCO)으로 잡아야 실제 비용이 보입니다.", steps: ["개별 도구 합산: 칠판 + 녹화 장비 + 수업용 PC + 학생관리/과제/복습 도구 + 관리자 도구를 따로 사면 단가는 낮아 보여도 합계와 호환 위험이 커집니다.","수작업 시간: 녹화 파일 정리·업로드, 자료 재호출, 출결·과제·복습 연결을 매 수업 사람이 손으로 잇는 시간이 매달 운영 리소스로 쌓입니다.","통합 시스템 OS: 클래스인은 이 흐름을 한 시스템으로 묶어 강사 준비 시간과 반복 관리 리소스를 줄이고 수업 품질을 표준화합니다.","비교 기준 전환: 칠판이 얼마냐보다 이 구성으로 줄어드는 운영 리소스와 도입 범위가 무엇이냐를 함께 봅니다."] },
      { heading: "경쟁 제품과 비교할 때의 관점", body: "전자칠판을 비교할 때 흔히 보이는 차이는 안드로이드 디스플레이형이냐, 윈도우/OPS 내장 통합형이냐입니다. 안드로이드 기반 디스플레이형은 화면 출력과 판서에 머무는 경우가 많아, 제대로 수업·녹화를 하려면 별도 PC, HDMI·터치 케이블, 여러 호환 프로그램을 추가로 연결해야 하고 연결 노드가 늘수록 번거로움과 불확실성도 커집니다. 클래스인 보드는 윈도우 기반 OPS(PC)가 내장되고 클라우드와 연결되어, 판서 프로그램·소프트웨어·하드웨어가 한 시스템으로 작동합니다.", steps: ["안드로이드 디스플레이형: 별도 PC·케이블·호환 프로그램을 따로 붙여야 수업·녹화가 가능해 구성 노드가 늘어납니다.","윈도우/OPS 내장 통합형(클래스인 보드): 컴퓨팅이 칠판에 내장되어 판서·녹화·소프트웨어가 같은 흐름에서 돕니다.","비교 체크포인트: 외장 PC·HDMI 의존도, 녹화·클라우드 연결, 소프트웨어 호환, 설치·유지보수 단순함을 함께 봅니다.","단, 모델별 정확한 사양·재고·설치 가능 여부는 board-lineup-specs와 상담에서 확인합니다."] },
      { heading: "소프트웨어 요금은 어떻게 보나", body: "소프트웨어는 운영 규모에 맞춰 단계가 나뉩니다. 소규모 운영팀이 바로 시작하는 기본 단계(Standard), 다수 강사와 팀 운영으로 확장하는 단계(Plus)는 직접 시작할 수 있는 자가서비스 플랜으로 제공되고, 대형 기관이나 하드웨어 결합형 도입은 맞춤 계약(Enterprise)으로 설계합니다. 어떤 플랜이 맞는지는 강사·계정 수, 코스 규모, 필요한 기능과 하드웨어 구성에 따라 달라지므로, 정확한 금액과 계약 조건은 견적 상담에서 확정하는 것이 안전합니다.", steps: ["기본(Standard): 소규모 운영팀이 실시간 수업과 기본 수업 도구로 빠르게 시작하는 단계입니다.","확장(Plus): 다수 강사·팀 운영, 더 큰 코스와 고급 활동·리포트가 필요할 때 확장하는 단계입니다.","맞춤(Enterprise): 대형 기관, 하드웨어/설치 연계, 보안·권한 맞춤, 계약 기반 청구가 필요한 경우입니다.","결정 기준: 계정 수와 운영 범위로 단계를 먼저 좁히고, 정확한 금액은 상담에서 확인합니다."] },
      { heading: "정직하게 분리해야 하는 비용 영역", body: "클래스인은 수업·녹화·과제·학생관리·관리자 데이터에 강하지만, 모든 것을 대체하는 만능 제품처럼 안내하지 않습니다. 결제, 오프라인 출석, 고급 리포트는 클래스인 기본 제공이 약한 영역이라, 견적 단계에서 기존 시스템과의 역할 분담과 연동 비용을 함께 보는 편이 정직합니다. 이 영역은 보통 공식 API로 데이터를 가져와 자체 제작하거나 외부 도구와 연동하는 구조로 설계합니다.", steps: ["결제·정산: 학원별 운영 방식 차이가 커서 기존 결제 시스템과의 역할 분담을 먼저 정합니다.","오프라인 출석: 현장 장비·운영 규칙에 따라 외부 시스템이나 별도 프로세스가 필요할 수 있습니다.","고급 리포트·자체 CRM: 공식 API·데이터 구독으로 데이터를 추출해 커스텀 리포트/대시보드로 분리해 검토합니다.","이 연동 범위도 견적에 영향을 주므로 도입 상담에서 함께 잡는 것이 좋습니다."] },
      { heading: "전자칠판만 따로 살 수 있나, 정확한 금액은", body: "전자칠판 자체는 구성의 한 항목이지만, 클래스인의 강점은 칠판 한 대가 아니라 OPS·녹화·소프트웨어·관리자 데이터가 한 흐름으로 묶일 때 나옵니다. 그래서 단품 구매가 목적인지, 학원 시스템 OS로 운영 흐름을 표준화하려는 것인지에 따라 권하는 구성이 달라집니다. 정확한 금액과 계약 조건은 모델·교실 환경·도입 범위에 따라 케이스별로 달라지므로, 이 글에서는 단정하지 않고 상담에서 확정합니다.", steps: ["구성 단위 확인: 칠판은 한 항목이고, 카메라·스탠드/벽걸이·소프트웨어·온보딩과 함께 봐야 실제 비용이 보입니다.","목동 쇼룸에서 실제 수업 흐름을 보며 우리 학원에 맞는 구성을 확인합니다.","도입 문의로 교실 환경과 도입 범위를 공유하면 견적과 일정을 잡아드립니다.","정확한 금액·계약 조건은 상담에서 확정합니다(이 가이드는 비교 관점만 안내합니다)."] }
    ],
    resources: [
      { label: "클래스인 패키지·가격 안내 (Education OS)", href: "https://classin.ai.kr/l/omo1", description: "학원 규모·상황별 패키지 구성을 한눈에 볼 수 있는 안내 페이지입니다." },
      { label: "강사 리소스 절감 계산 워크시트", href: "/resources/academy-resource-reduction-calculator", description: "가격 부담을 줄어드는 강사 리소스와 반복 업무 시간 관점으로 환산해 봅니다." },
      { label: "전자칠판, 카메라, 스탠드/벽걸이, 소프트웨어 포함 견적 상담", href: "/contact", description: "교실 환경과 도입 범위를 공유하면 구성과 정확한 견적을 안내합니다." },
      { label: "목동 쇼룸에서 실제 수업 흐름 보기", href: "/contact", description: "OPS 내장 통합형 보드의 판서·녹화·소프트웨어 흐름을 직접 확인할 수 있습니다." },
      { label: "ClassIn API 공식 문서", href: "https://docs.eeo.cn/api/en/", description: "결제·고급 리포트 등 약한 영역을 외부 시스템과 연동할 때 참고합니다." }
    ],
    relatedSlugs: ["academy-system-os-positioning","board-lineup-specs","board-install-readiness","billing-upgrade","why-classin-needs"],
    status: "published",
    visibility: "unlisted",
    docType: "reference",
    productArea: "billing",
    difficulty: "intermediate",
  },
  {
    slug: "adoption-journey-90days",
    category: "start",
    title: "클래스인 도입 여정 — 90일 로드맵과 단계별 성공 지표",
    description: "도입하면 무엇부터 하는지, 얼마나 걸리는지, 효과는 언제 보이는지를 진단·파일럿·온보딩·정착·확장 5단계와 단계별 성공 지표로 정리했습니다.",
    audience: "학원 원장, 관리자, 운영 책임자",
    updatedAt: "2026-06-17",
    readMinutes: 7,
    featured: false,
    status: "published",
    visibility: "public",
    docType: "guide",
    productArea: "onboarding",
    difficulty: "beginner",
    tags: ["도입 로드맵", "90일", "파일럿", "온보딩", "정착", "성공 지표", "목동 쇼룸"],
    keywords: ["도입하면 뭐부터","클래스인 도입 순서","도입 기간","얼마나 걸려요","효과는 언제","90일 로드맵","3개월 정착","파일럿","교사 온보딩","EDB 템플릿","목동 쇼룸","도입 문의"],
    chatbotSummary: "클래스인 도입은 진단 → 파일럿(목동 쇼룸 방문/체험) → 온보딩(강사 교육·EDB 교안 준비) → 정착(전자칠판 판서·녹화·복습·LMS 숙제/시험) → 확장 순서로 진행하고, 한국 학원에서는 평균 3개월 안팎(보통 3~4개월, 범위가 넓으면 6개월~1년)에 정착됩니다. 첫 도입은 전자칠판+녹화+수업 관리부터 시작해 강사 준비시간 절감, 반별 수업 표준화, 관리자 데이터 가시성 확보를 단계별로 확인하는 방식이 현실적입니다.",
    sections: [
      { heading: "도입하면 뭐부터 해요? — 5단계로 보는 전체 여정", body: "클래스인 도입은 전자칠판 한 대를 들이는 일이 아니라 수업 운영 기준을 다시 세우는 과정입니다. 처음부터 모든 기능을 켜기보다, 진단으로 무엇이 흩어져 있는지 확인하고 한 교실에서 검증한 뒤 단계적으로 넓히는 흐름이 한국 학원 현실에 맞습니다.", steps: ["1단계 진단: 수업 준비, 녹화, 과제, 학생 관리가 어떤 도구에 흩어져 있는지 지도를 그립니다.","2단계 파일럿: 목동 쇼룸 방문이나 데모로 대표 수업 한 편을 기준 삼아 실제 수업 흐름을 확인합니다.","3단계 온보딩: 강사 교육과 EDB 교안 준비로 첫 표준 수업을 만듭니다.","4단계 정착: 전자칠판 판서 → 녹화 → 복습 → LMS 숙제·시험으로 이어지는 운영 루틴을 자리잡게 합니다.","5단계 확장: 파일럿 결과를 근거로 교실·지점 확장과 데이터/API 연동 범위를 정합니다."] },
      { heading: "1단계 진단 — 흩어진 운영을 먼저 지도로 그리기", body: "도입 효과는 장비가 아니라 줄어드는 반복 업무에서 나옵니다. 그래서 첫 단계는 구매가 아니라 현재 수업 전·중·후에 사람이 손으로 처리하는 일을 확인하는 일입니다. 여기서 첫 도입 범위와 성공 기준이 결정됩니다.", steps: ["현재 쓰는 전자칠판, 녹화, 메신저, 과제, 시험, 학생 관리 도구를 모두 적습니다.","수업 준비 시간, 녹화 배포 시간, 보강 안내처럼 가장 오래 걸리는 반복 업무 3개를 고릅니다.","원장, 실장, 강사가 각각 원하는 성공 기준을 한 줄씩 정리합니다.","첫 도입 목적을 전자칠판, 녹화, 수업 관리 중 하나의 핵심 문제로 좁힙니다.","결제, 오프라인 출석, 고급 리포트처럼 클래스인이 약한 영역은 별도 시스템이나 API 연동 후보로 미리 구분합니다."] },
      { heading: "2단계 파일럿 — 목동 쇼룸에서 대표 수업 한 편으로 검증", body: "클래스인은 하드웨어와 소프트웨어가 함께 작동할 때 가치가 드러나기 때문에 스펙표보다 실제 수업 흐름을 직접 보는 편이 빠릅니다. 전 교실 도입을 결정하기 전에 대표 교실 한 곳과 대표 수업 하나로 먼저 검증합니다.", steps: ["목동 쇼룸 방문 또는 온라인 데모에서 자료 열기, 판서, 녹화, 저장 흐름을 직접 확인합니다.","우리 학원 대표 수업 자료 한 개를 가져가 EDB와 녹화 흐름을 그대로 시연해 봅니다.","한 강사가 같은 수업을 3회 이상 반복해 부팅부터 녹화까지의 안정성을 확인합니다.","녹화 품질, 음성, 화면 시인성, 네트워크 상태를 체크합니다.","가격 부담이 있으면 1개 교실 파일럿 성공 후 단계 확장하는 기준을 함께 정합니다."] },
      { heading: "3단계 온보딩 — 강사 교육과 EDB 교안 준비", body: "정착 속도를 좌우하는 단계입니다. 강사가 빈 화면에서 매번 수업을 새로 준비하면 좋은 장비를 사도 운영은 다시 사람에게 의존합니다. EDB는 판서·이미지·텍스트가 상호작용을 유지한 채로 저장되는 클래스인 칠판 파일로, 최대 50페이지 칠판과 함께 쓰면 교안을 재사용할 수 있습니다.", steps: ["반복 사용하는 대표 교안 몇 개를 EDB 파일로 먼저 전환합니다.","50페이지 칠판 흐름을 활용해 매번 자료를 다시 띄우거나 판서를 지우는 시간을 줄이는 수업 순서를 만듭니다.","우수 강사의 EDB 교안을 다른 강사가 따라 할 수 있는 온보딩 자료로 정리합니다.","강사 개인 PC에만 있던 자료를 기관 기준 저장 위치와 계정으로 옮깁니다.","EDB 교안 만들기, 수업 녹화, LMS 복습 배포 절차를 강사용 체크리스트 한 장으로 정리합니다."] },
      { heading: "4단계 정착 — 판서·녹화·복습·LMS로 이어지는 수업 루틴", body: "한국 학원의 스탠다드 도입은 전자칠판 판서 → 녹화 → 다시보기 복습 → LMS 숙제·시험으로 이어지는 흐름을 클래스인 안에서 해결하는 것입니다. 학생이 개인 기기를 잘 쓰지 않는 현장형 학원도 이 루틴은 현실적으로 적용할 수 있습니다.", steps: ["실시간 수업은 전자칠판 판서 중심으로 진행하고 자동 녹화 상태를 기본 점검 항목으로 둡니다.","결석 학생과 복습 대상 학생에게 녹화와 과제를 함께 안내하는 기준을 세웁니다.","숙제, 시험, 복습 자료를 클래스인 LMS 안에서 운영할 반을 정합니다.","강사가 녹화 업로드와 링크 배포를 수동으로 반복하지 않도록 흐름을 점검합니다.","수업 채팅과 피드백이 학생별 관리 기록으로 남게 합니다."] },
      { heading: "5단계 확장 — 관리자 데이터 가시성과 연동 판단", body: "파일럿이 자리잡으면 교실·지점 확장과 운영 고도화를 결정합니다. 이 단계에서 원장과 관리자는 권한이 허용된 범위에서 수업 시간, 출결과 참여, 특이사항, 네트워크 상태 같은 운영 데이터를 감이 아니라 기준으로 확인하게 됩니다.", steps: ["관리자 또는 허가된 교사 계정에서 볼 수업 정보 범위와 권한을 역할별로 나눕니다.","원장이 매주 볼 운영 지표와 강사가 매 수업 후 볼 지표를 구분합니다.","추가 교실 도입 시 같은 패키지 구성을 반복할 수 있는지 점검합니다.","결제, 오프라인 출석, 고급 리포트처럼 클래스인 밖에서 풀 업무를 분리합니다.","보고서 자동화, 수업 일괄 알림, 학생 데이터 기반 개별 리포트처럼 필요한 API 연동 단계를 정합니다."] },
      { heading: "얼마나 걸려요? — 단계별 기간과 성공 지표", body: "한국 학원에서 클래스인 도입은 평균 3개월 안팎으로 정착되는 경우가 많고, 보통 3~4개월, 범위가 넓은 기관은 6개월에서 1년까지 보기도 합니다. 아래 지표는 보장된 수치가 아니라 단계마다 확인하면 좋은 기대 결과입니다.", steps: ["초기(진단·파일럿): 첫 도입 범위와 성공 기준이 정해지고 대표 수업 한 편의 흐름이 검증됩니다.","온보딩: 강사 준비시간이 줄기 시작하고 재사용 가능한 EDB 교안이 쌓입니다.","정착: 반별 수업이 판서·녹화·복습·LMS 흐름으로 표준화되고 복습·보강 제공이 안정됩니다.","확장: 관리자 데이터 가시성이 확보되어 수업 품질과 운영 상태를 주간 리듬으로 점검할 수 있습니다.","효과 체감 시점은 학원마다 다르므로, 도입 후 30·60·90일에 확인할 지표를 미리 정해 두는 편이 좋습니다."] },
      { heading: "다음 단계 — 우리 학원 일정 잡기", body: "도입 순서가 그려졌다면 다음은 우리 학원 대표 수업을 기준으로 일정을 확정하는 일입니다. 목동 쇼룸에서 실제 수업 흐름을 보면 파일럿 범위와 90일 일정을 같은 자리에서 잡을 수 있고, 견적은 전자칠판·OPS·카메라·스탠드/벽걸이·소프트웨어·온보딩 범위까지 함께 검토합니다.", steps: ["목동 쇼룸 방문 또는 온라인 데모에서 대표 수업 한 편으로 도입 흐름을 검증합니다.","설치 예정 교실 사진과 대표 수업 자료 한 개를 준비하면 상담 품질이 높아집니다.","도입 문의로 파일럿 교실과 30/60/90일 일정, 패키지 범위를 함께 확정합니다."] }
    ],
    resources: [
      { label: "ClassIn 90일 파일럿 도입 로드맵", href: "/resources/classin-90-day-adoption-roadmap", description: "도입 일정이 구체화된 학원을 위한 30/60/90일 파일럿 순서와 기준입니다." },
      { label: "학원 시스템 OS 진단 체크리스트", href: "/resources/academy-system-checklist", description: "진단 단계에서 우리 학원의 수업·녹화·과제·관리가 한 시스템으로 이어지는지 점검합니다." },
      { label: "ClassIn EDB 파일 만들기 공식 가이드", href: "https://www.classin.com/kr/how-to-create-edb-files/", description: "온보딩 단계의 EDB 교안 전환에서 참고할 공식 자료입니다." },
      { label: "목동 쇼룸·도입 상담 신청", href: "/contact", description: "파일럿 교실과 90일 일정, 패키지 범위를 함께 잡습니다." }
    ],
    relatedSlugs: ["academy-system-os-positioning","board-install-readiness","teacher-onboarding","student-onboarding","admin-operation-standardization"],
  },
  {
    slug: "app-capabilities-map",
    category: "software",
    title: "클래스인 앱으로 할 수 있는 것 — 전체 기능 지도",
    description: "클래스인 앱과 콘솔로 무엇을 할 수 있고 기능이 어떻게 묶여 있는지 한 장으로 정리한 지도입니다. 학습 활동, 교실 도구, AI, 관리자 데이터 가시성, EDB, API 자동화까지 큰 그림을 잡고 세부 문서로 연결합니다.",
    audience: "교사, 관리자, 학원 원장, 도입 검토자",
    updatedAt: "2026-06-17",
    readMinutes: 8,
    featured: true,
    tags: ["기능 지도", "전체 기능", "앱 활용", "학습 활동", "교실 도구", "API"],
    keywords: ["클래스인 앱","앱으로 뭘 할 수 있어","무슨 기능 있어","어디서 해요","기능 지도","전체 기능","학습 활동","교실 도구","수업","숙제","시험","녹화 수업","학습 자료","일일 과제","토론","OMR 카드","SCORM","따라읽기","받아쓰기","외워말하기","타이머","랜덤 선택","개인 칠판","화면 공유","객관식 퀴즈","선착순 퀴즈","그룹 토론","AI 자동 채점","관리자 콘솔","권한 기반 운영 데이터 가시성","EDB","API","자동화"],
    chatbotSummary: "클래스인 앱으로는 실시간 수업과 9종 학습 활동(수업·숙제·시험·녹화 수업·학습 자료·일일 과제·토론·OMR 카드·SCORM, 그리고 따라읽기·받아쓰기·외워말하기 AI 언어활동)을 만들고, 30가지가 넘는 교실 도구(타이머·랜덤 선택·개인 칠판·화면 공유·객관식/선착순 퀴즈·그룹 토론 등)로 상호작용하며, 관리자는 콘솔에서 권한 기반으로 수업 운영 데이터를 봅니다. AI 채점·출제·첨삭은 일부 활동과 기관 설정·계약 조건에 따라 보조 기능으로 제공될 수 있으므로 모든 과목·문항에 자동 적용된다고 안내하지 않습니다. 결제·오프라인 출결·고급 리포트는 기본 기능이 약해 API/외부 연동으로 보완합니다.",
    sections: [
      { heading: "이 문서는 지도입니다", body: "앱으로 뭘 할 수 있어요?, 무슨 기능이 있어요?, ○○는 어디서 해요?에 한 번에 답하기 위한 전체 기능 지도입니다. 클래스인은 단순 전자칠판이나 화상 수업 도구가 아니라 수업·녹화·과제·학생 관리·데이터·권한 관리를 한곳으로 묶는 학원 수업 OS입니다. 여기서는 큰 묶음만 빠르게 훑고, 세부 사용법은 각 묶음의 전용 문서로 연결합니다.", steps: ["학습 활동: 수업 전·후에 코스에 올리는 9종 활동을 만듭니다.","교실 도구: 실시간 수업 중에 꺼내 쓰는 30가지 이상의 도구입니다.","AI 기능: 활동 유형, 기관 설정, 계약 조건에 따라 채점·출제·첨삭과 AI 언어활동을 보조합니다.","관리자 데이터: 콘솔에서 권한 기반으로 수업 운영 데이터를 봅니다.","EDB·API: 교안 파일(EDB)과 외부 연동(API)으로 수업·운영을 확장합니다."] },
      { heading: "학습 활동 9종 — 코스에 올리는 것", body: "교사가 코스 단원에 추가하는 학습 활동입니다. 일반 활동 9종과 AI 기반 언어활동으로 나뉩니다. 각 활동의 작성 옵션과 운영 체크포인트는 수업·숙제·시험·학습 활동 가이드와 코스 학습 활동 추가 문서에서 자세히 다룹니다.", steps: ["수업: 다양한 실시간 상호작용과 수업 후 AI 분석·요약을 지원하는 실시간 차시입니다.","숙제: 유연한 과제 형식과 AI 자동 채점을 지원합니다.","시험: 문제 은행 불러오기, 시험 문제 추가, AI 출제, 응시 시간, 채점 규칙으로 구성합니다.","녹화 수업: 영상 업로드, 시청 가능 횟수, 선행 학습 조건 등으로 다시보기 학습을 만듭니다.","학습 자료: 자료를 배포하고 코스·과정·단원에 연결합니다.","일일 과제: 요일과 주기를 지정해 반복 과제를 운영합니다.","토론: 학생이 글로 의견을 주고받는 활동입니다.","OMR 카드: 시험지 업로드와 객관식·다중 선택·참/거짓·빈칸 채우기·서술형 문항으로 OMR을 만듭니다.","SCORM: 외부 SCORM 패키지 콘텐츠를 학습 활동으로 올립니다.","AI 언어활동: 영어·중국어 각각 따라읽기·받아쓰기·외워말하기를 제공합니다."] },
      { heading: "교실 도구 30+ — 수업 중에 꺼내 쓰는 것", body: "실시간 교실 안에서 호출하는 도구 팔레트입니다. 목적별로 묶으면 고르기 쉽습니다. 노출되는 도구는 기관 스위치 설정에 따라 달라질 수 있습니다. 사용법과 수업 단계별 활용은 교실과 판서 도구 사용법에서 다룹니다.", steps: ["진행 보조: 타이머, 스톱워치, 주사위, 랜덤 선택(무작위 발표자 지정).","판서: 보조 칠판, 개인 칠판, 레이저 포인터, 판서 저장/공유, 파일 열기.","화면·자료: 화면 공유, 미러링, VNC, 브라우저, 다방향 브라우저, 비디오 갤러리, 수업 자료 라이브러리.","카메라: 보조 카메라(듀얼 POV)로 실물 교구·손동작을 별도로 송출.","참여: 객관식 퀴즈, 선착순 퀴즈, 그룹 토론, 공동 작업, 실시간 채팅.","STEM·체험: 화학 실험, 물리 실험, 기하도형, 측정 도구, 바둑 칠판.","보상·교실 내 호출: 트로피 순위, 그리고 숙제·시험·AI Board를 교실 안에서 바로 호출."] },
      { heading: "AI 기능 — 강사 리소스를 보조하는 것", body: "AI는 별도 화면이 아니라 활동을 만들고 채점하는 흐름 안에 들어올 수 있습니다. 다만 모든 과목·문항·언어에 자동 적용된다고 안내하지 말고, 실제 노출 화면과 기관 설정·계약 조건을 확인해야 합니다. 활용 시나리오는 AI 튜터와 AI 평가 활용하기에서 다룹니다.", steps: ["AI 채점 보조: 일부 숙제·시험·언어활동 흐름에서 채점 보조로 제공될 수 있습니다.","AI 출제 보조: 시험·숙제 초안 생성은 활동 유형과 기관 설정에 따라 노출 범위가 달라질 수 있습니다.","AI 언어활동: 따라읽기·받아쓰기·외워말하기로 영어·중국어 말하기/듣기 연습을 보조합니다.","수업 후 분석: 수업 활동은 AI 분석·요약을 지원할 수 있으나 실제 제공 범위는 설정과 계약 기준을 확인합니다.","참고: 문제 은행 제공 범위는 기관 설정·계약에 따라 달라질 수 있습니다."] },
      { heading: "관리자 데이터 — 권한 기반 운영 데이터 가시성", body: "관리자와 허가된 교사 계정은 권한에 따라 수업 운영 데이터를 콘솔(console.classin.com)에서 봅니다. 이는 실시간 감시가 아니라 수업 안정성·강사 온보딩·학부모 상담 자료를 위한 권한 기반 운영 데이터 가시성입니다. 자세한 기준은 관리자 모니터링과 통계 활용에서 다룹니다.", steps: ["수업이 정상적으로 개설·진행되는지, 수업 시간과 특이사항을 확인합니다.","출결·과제·시험·성적 데이터가 누락 없이 쌓이는지 확인합니다.","웹 라이브·플레이백으로 수업을 검수하고 복습·상담 자료로 활용합니다.","네트워크·카메라·마이크 상태 등 수업 환경 데이터를 점검합니다.","스토리지·계정·권한을 관리해 기관 데이터 축적과 유출 위험을 함께 통제합니다."] },
      { heading: "EDB — 칠판의 파일", body: "EDB는 클래스인 전용 확장자 파일로, 한마디로 칠판의 파일입니다. 필기·이미지·텍스트가 상호작용을 유지한 채 저장되어 교안 제작과 수업 자료 호출에 씁니다. 칠판 50페이지 캔버스와 EDB가 만나면 매번 화면을 지우거나 자료를 하나씩 띄울 필요 없이 미리 만든 교안을 페이지째 불러와 수업을 이어갈 수 있습니다." },
      { heading: "API·자동화 — 데이터로 운영을 확장하는 것", body: "원장·관리자는 API로 수업·학생 데이터를 자동화 흐름에 연결할 수 있습니다. 보고서 자동화, 수업 일괄 알림, 학생 데이터 기반 개별 리포트 같은 운영 사례에 쓰입니다. 단계적으로 보면 다음과 같습니다.", steps: ["1단계 — 클래스인 앱 푸시: 학생·학부모에게 앱 알림을 자동 발송합니다.","2단계 — 코스·수업정보 GET: 하위 코스와 수업 정보를 조회해 자체 시스템·리포트로 가져옵니다.","3단계 — SDK·가상계정·수업 중계: SDK와 가상계정, 수업 중계로 자체 서비스에 클래스인 수업을 깊게 결합합니다.","주의: API가 활성화된 기관은 콘솔에서 코스·수업을 새로 만들어도 자체 시스템과 자동 동기화되지 않으니, 연동을 유지하려면 자체 관리 시스템에서 생성합니다."] },
      { heading: "솔직히 약한 영역 — 외부 연동으로 보완", body: "모든 것을 클래스인 기본 기능으로 해결하려 하지 않는 편이 좋습니다. 다음 영역은 기본 제공이 약하므로 API나 외부 도구와 연동하는 구조로 안내합니다.", steps: ["결제·정산: 클래스인 기본 제공이 아니며, 기존 결제 시스템과 연동하는 방식이 맞습니다.","오프라인 출석: 현장 출결 자동화는 약해 기존 출결 시스템·API 연동으로 보완합니다.","고급 리포트: 리포트 UI가 약해 API로 데이터를 추출해 자체 제작하거나 외부 BI 도구와 연동합니다."] },
      { heading: "어디서 무엇을 하나 — 진입점 정리", body: "같은 클래스인이라도 역할별로 들어가는 곳이 다릅니다.", steps: ["관리자: 웹 콘솔(console.classin.com)에서 코스·수업·교사·학생 관리, 학습 데이터, 결제 개요, 권한·API 도킹을 다룹니다.","교사: 앱에서 코스를 만들고 학습 활동을 추가하며, 교실에 들어가 교실 도구로 수업을 진행합니다.","학생: 앱에서 코스에 참여해 수업에 입장하고, 다시보기·과제 제출·시험 응시·AI 언어활동을 합니다.","더 깊은 사용법이 필요하면 아래 같이 보면 좋은 문서의 전용 가이드로 이동합니다."] }
    ],
    resources: [
      { label: "학원 데이터·API 자동화 설계 브리프", href: "/resources/academy-data-automation-brief", description: "보고서 자동화·수업 일괄 알림·개별 리포트 등 API 자동화 후보를 원장 언어로 정리한 자료입니다." },
      { label: "ClassIn(EEO) API 문서", href: "https://docs.eeo.cn/api/en/", description: "앱 푸시, 코스·수업 정보 조회, SDK·가상계정·수업 중계 등 자동화 연동을 위한 공식 API 레퍼런스입니다." },
      { label: "Classin 소프트웨어 소개", href: "/product/sw", description: "주요 기능과 도입 사례를 제품 소개 페이지에서 함께 확인할 수 있습니다." }
    ],
    relatedSlugs: ["software-overview","classroom-tools","lesson-activities","ai-learning-tools","admin-monitoring-analytics","course-activities","lesson-option-concepts"],
    status: "published",
    visibility: "public",
    docType: "reference",
    productArea: "software",
    difficulty: "beginner",
  },
  {
    slug: "pre-adoption-faq-22-questions",
    category: "start",
    title: "ClassIn 도입 전 꼭 확인할 22가지 질문",
    description: "관리자 권한, 녹화 저장, 스토리지, 개인정보, 서버, OPS, 오프라인 칠판 사용처럼 도입 전에 자주 묻는 리스크 질문을 답변 가능 범위와 확인 필요 범위로 나누어 정리했습니다.",
    audience: "학원 원장, 관리자, 실장, 도입 검토자, 교무 책임자",
    updatedAt: "2026-06-18",
    readMinutes: 7,
    featured: true,
    tags: ["도입 전 질문", "도입 FAQ", "관리자 권한", "녹화 저장", "스토리지", "개인정보", "오프라인 칠판"],
    keywords: ["도입 전 질문","도입 전 체크리스트","도입 FAQ","22가지 질문","궁금한 점","관리자 권한","무료 관리자","유료 관리자","녹화 저장","현장 녹화","수업 녹화","권한 받은 계정","스토리지 용량","콘텐츠 소유권","개인정보","회원가입 개인정보","전화번호 이메일","서버 위치","OPS","외부 컴퓨터 연결","오프라인 칠판","펜 팁","정기 결제 포함 항목"],
    chatbotSummary: "ClassIn 도입 전 질문은 기능 호기심보다 관리자 권한, 녹화 저장, 스토리지, 개인정보, 서버, 계약, 오프라인 사용 같은 리스크 점검에 가깝습니다. 바로 답할 수 있는 항목은 웹 기반 관리자 콘솔, 리포트, 교육·온보딩, 관리자/권한 계정의 녹화 관리, 마이크·카메라, 과제, 전화번호 또는 이메일 가입, OPS 내장, 오프라인 칠판 필기입니다. 무료/유료 권한, 유료 전환, 계약 기간, 정기 결제 포함 항목, 콘텐츠 소유권, 서버 위치, 펜 팁 가격은 최신 계약·정책 확인 후 답해야 합니다. 상담 흐름은 리스크 3개 선정 -> 즉답/확인 필요 분리 -> 쇼룸 검증 -> 견적 범위 -> 90일 파일럿 제안으로 잡습니다.",
    sections: [
      {
        heading: "이 질문들은 도입 전 리스크 점검입니다",
        body: "ClassIn을 이미 관심 있게 보는 선생님과 원장은 기능 이름보다 도입 후 문제가 생길 지점을 먼저 묻습니다. 그래서 답변도 기능 나열이 아니라 '가능한 것', '권한이 필요한 것', '계약·정책 확인이 필요한 것'으로 나누어야 합니다.",
        steps: [
          "가능한 기능은 짧게 답하고, 누가 볼 수 있는지 권한 기준을 붙입니다.",
          "계약·가격·서버·개인정보처럼 정책이 필요한 질문은 확인 필요로 분리합니다.",
          "ClassIn을 전자칠판 단품이 아니라 학원 시스템 OS 구성으로 설명합니다.",
          "답변 끝에는 자료, 쇼룸, 도입 상담 중 하나로 다음 행동을 제안합니다.",
        ],
      },
      {
        heading: "바로 답할 수 있는 질문",
        body: "현재 문서와 제품 기준으로 비교적 바로 답할 수 있는 항목입니다. 다만 기관 설정, 계약, 권한에 따라 화면 노출이 달라질 수 있다는 전제는 유지합니다.",
        steps: [
          "LMS와 관리자 대시보드는 웹 기반 관리자 콘솔에서 운영합니다.",
          "리포트와 통계 데이터는 기관 설정, 요금제, 권한에 따라 확인·다운로드 가능 범위가 달라질 수 있습니다.",
          "자유롭게 쓰기까지는 쇼룸/온라인 데모, 교사 온보딩, EDB 교안 전환, 녹화·복습·LMS 루틴 교육 순서로 잡습니다.",
          "수업 녹화와 현장 녹화는 목적이 다르며, 녹화 기능과 카메라 구성이 설정된 경우 관리자 또는 권한 받은 계정이 계약·권한 범위 안에서 확인합니다.",
          "과제는 숙제, 시험, 녹화 수업, 학습 자료, 일일 과제, 토론, OMR 카드, SCORM, AI 언어활동 등으로 운영할 수 있습니다.",
          "학생·교사 계정은 기관 안내 또는 API 연동 방식에 따라 전화번호 또는 이메일 기반으로 등록·초대할 수 있는지 확인합니다.",
          "OPS 포함 구성에서는 외장 PC 없이 수업 환경을 구동할 수 있습니다. 실제 OPS 포함 여부, 스펙, 외부 PC 연결 필요성은 모델·견적·교실 환경 기준으로 확인합니다.",
          "기본 칠판 필기는 오프라인에서도 사용할 수 있습니다. 클라우드 동기화, 온라인 수업, LMS 배포는 네트워크가 필요합니다.",
        ],
      },
      {
        heading: "22개 질문을 상담 흐름으로 바꾸는 방법",
        body: "목적은 모든 질문에 한 번에 답을 받는 것이 아니라 도입 판단을 막는 리스크를 줄이는 것입니다. 먼저 바로 답할 수 있는 항목으로 기준을 잡고, 계약·정책 확인이 필요한 항목은 상담 담당자에게 넘긴 뒤, 쇼룸이나 온라인 데모에서 실제 수업 장면으로 검증합니다.",
        steps: [
          "1단계: 가장 불안한 항목 3개를 관리자 권한, 녹화, 스토리지, 개인정보, 가격, 교실 설치 중에서 고릅니다.",
          "2단계: 각 질문의 판단자를 원장, 실장, 교사, IT 담당 중 하나로 표시합니다.",
          "3단계: 답변을 즉답 가능, 조건부 가능, 최신 정책 확인 필요, 쇼룸 검증 필요로 나눕니다.",
          "4단계: 데모에서 확인할 장면을 관리자 계정으로 녹화 찾기, 스토리지 사용량 확인, OPS 단독 구동, 오프라인 칠판 필기, 외부 PC 연결 중에서 고릅니다.",
          "5단계: 견적에 포함되어야 할 범위를 장비, 카메라·마이크, 설치, 소프트웨어, 온보딩, 스토리지로 나눠 확인합니다.",
          "6단계: API·리포트 자동화가 필요하면 API 활성화 여부, 데이터 구독 범위, 개발 주체, 자체 시스템과의 동기화 방향을 별도 확인 항목으로 분리합니다.",
          "7단계: 상담 결론을 내부 공유, 추가 정책 회신, 쇼룸 예약, 견적 산정, 90일 파일럿 중 하나로 정리합니다.",
        ],
      },
      {
        heading: "관리자 권한과 녹화 관리",
        body: "관리자·권한 질문은 '무엇이 가능하냐'보다 '누가 볼 수 있냐'가 핵심입니다. 녹화와 수업 데이터는 관리자 또는 권한 받은 계정 기준으로 설명합니다.",
        steps: [
          "관리자 콘솔은 기관 관리, 스토리지, 학습 관리, 관리자 기능, 결제, 계정 정보 영역으로 나뉩니다.",
          "수업 시간, 출결·참여, 네트워크, 카메라·마이크 상태, 녹화·플레이백은 권한 기준으로 확인합니다.",
          "수업 녹화는 ClassIn 교실 안의 칠판·자료·수업 화면 중심으로 남고, 현장 녹화는 카메라 구성이 설정된 경우 실제 교실 뷰나 트래킹 뷰를 별도로 다룹니다.",
          "무료/유료 관리자 권한의 정확한 차이와 향후 유료 전환 여부는 계약·계정 정책 확인이 필요합니다.",
        ],
      },
      {
        heading: "가입과 개인정보",
        body: "가입 단계에서 바로 답할 수 있는 핵심은 전화번호 또는 이메일 기반 등록입니다. 실제 등록·초대 방식은 기관 안내와 API 연동 여부에 따라 달라질 수 있고, 개인정보 처리 방식과 보관 기준은 공식 개인정보처리방침과 기관 권한 정책에 맞춰 확인해야 합니다.",
        steps: [
          "학생·교사 계정은 전화번호 또는 이메일 기반으로 등록·초대할 수 있는지 확인합니다.",
          "가입 후 비밀번호와 기본 프로필을 설정합니다.",
          "기관이 학생을 코스에 연결하거나 초대하는 흐름은 별도 안내에 따라 진행합니다.",
          "개인정보 처리 방식, 보관 기준, 접근 권한은 공개 개인정보처리방침, 기관 관리 기준, 학원 내부 동의 절차를 함께 확인합니다.",
          "상담에서는 학생 학습 데이터와 마케팅 추적 데이터를 섞어 설명하지 않습니다.",
        ],
      },
      {
        heading: "스토리지, 콘텐츠 소유권, 서버 위치",
        body: "이 묶음은 신뢰를 좌우하지만 단정하면 위험합니다. 기본 기능과 확인 필요 항목을 분리해서 답해야 합니다.",
        steps: [
          "스토리지는 학습 활동 데이터, 수업 후 생성되는 녹화본·스크린샷·칠판 파일, 기관 공유 드라이브를 포함합니다.",
          "관리자는 권한 범위 안에서 스토리지 데이터 개요의 사용량과 전체 용량을 확인합니다.",
          "녹화본 확인, 다운로드·삭제 권한, 보호 잠금과 자동 삭제 기준은 계약·기관 설정·최신 정책 기준으로 확인합니다.",
          "기본 제공 용량, 추가 용량, 단가, 장기 보관 조건은 최신 계약 기준으로 확인합니다.",
          "서버 위치, 데이터 처리 지역, 콘텐츠 소유권과 서비스 제공을 위한 이용 권한은 약관·계약·공식 정책으로 확인합니다.",
        ],
      },
      {
        heading: "하드웨어, 카메라, 오프라인 사용",
        body: "ClassIn Board는 OPS와 소프트웨어가 결합된 수업 장비로 설명합니다. 카메라·마이크는 모델과 교실 조건에 따라 구성이 달라집니다.",
        steps: [
          "OPS 포함 구성에서는 외장 PC 없이 수업 환경을 구동할 수 있습니다. 실제 OPS 포함 여부와 스펙은 모델·견적 기준으로 확인합니다.",
          "외부 노트북이나 PC가 필요하면 HDMI 입력으로 연결할 수 있습니다.",
          "T1/S1 등 카메라 구성은 교사 추적, 전경, 클로즈업, CMS 설정을 지원하지만 현장 설치 조건에 따라 다릅니다.",
          "내장 마이크로 부족한 대형 교실이나 하이브리드 수업은 외부 마이크 구성을 검토합니다.",
          "오프라인 상태에서도 기본 칠판 필기는 가능하지만, 네트워크 기반 기능은 온라인 연결이 필요합니다.",
          "전용 펜 팁 같은 소모품 구매 경로와 가격은 최신 공급 조건을 확인합니다.",
        ],
      },
      {
        heading: "상담 전에 준비하면 좋은 것",
        body: "도입 전 질문을 정리해 오면 상담은 훨씬 빨라집니다. 기능 시연보다 먼저 불안 요소를 좁혀야 정확한 견적과 도입 범위가 나옵니다. 상담 요청에는 '우리 학원은 현재 ___ 때문에 ClassIn 도입을 검토하고 있습니다. 가장 확인하고 싶은 항목은 ___, ___, ___이고, 데모에서는 ___ 장면을 보고 싶습니다. 견적에는 ___까지 포함되는지 확인이 필요합니다.'처럼 적으면 됩니다.",
        steps: [
          "현재 쓰는 전자칠판, 외장 PC, 녹화 프로그램, LMS, 메신저 도구를 적습니다.",
          "가장 불안한 항목을 관리자 권한, 녹화 저장, 스토리지, 개인정보, 가격, 오프라인 사용 중에서 고릅니다.",
          "설치 예정 교실 사진, 대표 수업 자료, 온라인/오프라인 수업 비중을 준비합니다.",
          "정기 결제에 포함되어야 할 범위를 장비, 카메라, 스탠드/벽걸이, 소프트웨어, 온보딩으로 나눠 표시합니다.",
          "API·리포트 자동화가 필요하면 API 활성화 여부, 데이터 구독 범위, 개발 주체, 자체 시스템과의 연동 방향을 따로 적습니다.",
          "상담 목표를 내부 공유용 답변, 쇼룸 예약, 견적 산정, 파일럿 검토 중 하나로 정합니다.",
          "확인 필요한 항목은 상담 담당자가 최신 정책·계약 기준으로 답변하도록 남겨 둡니다.",
        ],
      },
    ],
    resources: [
      {
        label: "ClassIn 도입 전 22가지 질문 체크리스트",
        href: "/resources/classin-pre-adoption-questions-checklist",
        description: "관리자 권한, 녹화, 스토리지, 개인정보, 오프라인 사용을 상담 전에 점검하는 자료입니다.",
      },
      {
        label: "관리자 모니터링과 통계 활용",
        href: "/docs/software/admin-monitoring-analytics",
        description: "관리자가 수업 운영 상태와 데이터 가시성을 어떻게 보는지 확인합니다.",
      },
      {
        label: "스토리지 관리",
        href: "/docs/admin/storage-management",
        description: "녹화본, 스크린샷, 칠판 파일, 공유 드라이브 관리 기준을 확인합니다.",
      },
      {
        label: "목동 쇼룸 데모 준비 키트",
        href: "/resources/showroom-demo-readiness-kit",
        description: "대표 수업 자료로 권한, 녹화, OPS, 오프라인 사용을 확인합니다.",
      },
      {
        label: "ClassIn 90일 파일럿 도입 로드맵",
        href: "/resources/classin-90-day-adoption-roadmap",
        description: "질문 정리가 끝난 뒤 실제 도입 순서를 잡습니다.",
      },
      {
        label: "학원 데이터·API 자동화 설계 브리프",
        href: "/resources/academy-data-automation-brief",
        description: "리포트 자동화, 알림, 자체 시스템 연동이 필요한 경우 별도 검토합니다.",
      },
      {
        label: "도입 상담 신청",
        href: "/contact#contact-form",
        description: "확인 필요한 계약·정책 항목은 상담에서 최신 기준으로 정리합니다.",
      },
    ],
    relatedSlugs: ["admin-monitoring-analytics","storage-management","signup","board-basic-operation","board-ai-camera-mic","value-and-cost-framing"],
    status: "published",
    visibility: "public",
    docType: "faq",
    productArea: "onboarding",
    difficulty: "intermediate",
  },
  {
    slug: "company-overview",
    category: "start",
    title: "클래스인은 어떤 회사·서비스인가 — EEO와 제품 라인 소개",
    description: "클래스인을 만든 글로벌 에듀테크 기업 EEO, 제품 라인(Classin·TeacherIn·Nobook·Classin X), 글로벌 규모, 한국 학원에서의 활용, 도입 절차를 회사 소개서 기준으로 정리했습니다.",
    audience: "학원 원장, 관리자, 도입 검토자, 파트너",
    updatedAt: "2026-06-18",
    readMinutes: 6,
    featured: true,
    tags: ["회사 소개", "EEO", "글로벌 규모", "제품 라인", "도입 절차"],
    keywords: ["클래스인 회사","회사 소개","클래스인 소개서","EEO","Empower Education Online","어떤 회사","어떤 서비스","클래스인 글로벌","글로벌 규모","에듀테크 유니콘","제품 라인","TeacherIn","Nobook","Classin X","클래스인 X","도입 절차","도입 순서"],
    chatbotSummary: "클래스인은 글로벌 에듀테크 기업 EEO(Empower Education Online, 2014년 설립)의 핵심 제품으로, 화상수업·채팅·클라우드·LMS·녹화·쌍방향 도구를 묶어 온·오프·하이브리드 수업을 운영하는 교육용 SaaS입니다. 한국 학원에서는 전자칠판·녹화·EDB·LMS·관리자 데이터를 한 흐름으로 잇는 학원 수업 OS로 씁니다. 글로벌 규모 수치는 EEO 공식 소개 기준이며, 국내 도입 기관 수는 상담에서 확인합니다.",
    sections: [
      { heading: "한 줄 소개", body: "클래스인(ClassIn)은 글로벌 에듀테크 기업 EEO(Empower Education Online)가 만든 교육용 SaaS로, 온라인·오프라인·하이브리드 수업을 한 플랫폼에서 운영하도록 돕습니다. 한국 학원에서는 전자칠판·수업 녹화·EDB 교안·LMS·학생 관리·관리자 데이터를 한 흐름으로 묶는 학원 수업 OS로 설명합니다." },
      { heading: "회사 — EEO(Empower Education Online)", body: "EEO는 2014년 설립된 원격·하이브리드 학습 솔루션 에듀테크 SaaS 기업입니다. 핵심 제품 클래스인을 중심으로, 수업 커리큘럼 기획 도구 TeacherIn, 물리·화학 가상실험 Nobook, 하이브리드 교실 하드웨어 Classin X를 함께 제공합니다.", steps: ["Classin — 온·오프·하이브리드 수업 운영과 학습 관리(LMS)","TeacherIn — 수업 커리큘럼·콘텐츠 기획과 공동 창작","Nobook — 물리·화학 가상 실험 도구","Classin X — 하이브리드 스마트교실 하드웨어(전자칠판·카메라·마이크)"] },
      { heading: "글로벌 규모 (EEO 공식 소개 기준)", body: "아래 지표는 EEO 공식 소개 자료 기준의 글로벌 수치입니다. 국내 도입 기관·보드 수는 정확한 데이터 확인 전까지 단정하지 않고 상담에서 안내합니다.", steps: ["160개국에서 사용, 50M+ 교육자·학습자, 200M+ 누적 수업","60K+ 교육기관 채택, 80,000+ 글로벌 파트너","한국어·영어·중국어 등 12개 언어 지원","텐센트·힐하우스·SIG 투자를 받은 에듀테크 SaaS 유니콘"] },
      { heading: "무엇을 하는 서비스인가", body: "클래스인은 화상 수업, 채팅, 클라우드 드라이브, LMS, 자동 녹화, 쌍방향 수업 도구(30종 이상), 가상 실험실, 관리자 대시보드를 한 곳에 묶습니다. 한국 학원에서는 보통 전자칠판 실시간 판서 → 자동 녹화 → 다시보기 복습 → LMS 숙제·시험 흐름으로 활용합니다. 기능 전체 지도는 앱 기능 지도 문서를 참고하세요.", steps: ["수업: 온·오프·하이브리드 실시간 수업과 30종 이상 교실 도구","녹화: 클라우드 자동 녹화, 칠판/카메라 두 가지 뷰, 워터마크 저작권 보호","클라우드: 개인·공유 드라이브, PDF·PPT·Excel 등 다양한 파일 지원","LMS: 커리큘럼, 숙제·시험, 자동 채점, 성적표 자동 생성","대시보드: 대량 인원·수업 관리, 스토리지, 권한 기반 운영 모니터링"] },
      { heading: "누구를 위한 서비스인가", body: "학생은 언제 어디서나 상호작용하며 참여하고, 강사는 자동화된 LMS로 업무 부담을 줄이며, 관리자(원장)는 학습 데이터와 수업 품질을 한눈에 보고 표준화합니다. 한국에서는 학원 원장·관리자·운영 책임자가 1순위 대상입니다." },
      { heading: "하드웨어 — Classin X 스마트교실", body: "Classin X는 큰 화면 한 대가 아니라 하이브리드 교실을 위한 하드웨어 구성입니다. 전자칠판에 강사용·학생용 트래킹 카메라와 천장형 마이크, 비디오 월을 더해 현장·그룹·온라인·하이브리드 강의와 녹화 스튜디오를 만듭니다. 교실 크기에 맞는 모델 선택은 모델별 스펙 가이드와 상담에서 확인합니다.", steps: ["구성: 전자칠판 + 강사(T1)·학생(S1) 트래킹 카메라 + 천장 마이크 + 비디오 월","활용: 현장 강의, 그룹 학습/토론, 온라인 강의, 하이브리드 강의, 녹화·송출 스튜디오","모델·사이즈는 board-lineup-specs와 상담에서 공간에 맞춰 안내"] },
      { heading: "도입 절차", body: "도입은 보통 네 단계로 진행합니다. 더 구체적인 30/60/90일 일정과 단계별 성공 지표는 도입 여정 문서를 참고하세요.", steps: ["1) 제품 안내 — 제공 기능·서비스 안내, 요금제 문의와 Q&A","2) 맞춤 컨설팅 — 기관에 맞는 사용 방식·패턴 결정","3) 서비스 계약 — 계약 진행과 담당 매니저 배정","4) 시스템 설정·온보딩 — 기관별 환경 세팅 + 관리자·강사 대상 교육(기본 2회)"] },
      { heading: "글로벌·국내 활용 레퍼런스", body: "대학 글로벌 오픈 코스(예: 북경대가 코넬·와세다 등 여러 대학과 진행한 다국가 공동 강의), 글로벌 1:1 튜터링, K-12, 그리고 국내 학원까지 폭넓게 쓰입니다. 한국 학원 사례는 도입 사례 문서에서, 우리 학원과 비슷한 사례는 상담에서 더 구체적으로 안내합니다." },
      { heading: "정직하게 — 다 해주지는 않습니다", body: "결제·정산, 오프라인 출입/출석, 고급 경영 리포트, 자체 CRM/ERP 세부 연동은 클래스인 기본 제공이 약한 영역으로, 기존 시스템이나 공식 API 연동으로 역할을 나눕니다. 가격은 학원 규모·상황·패키지에 따라 달라 한 번에 단정하지 않고 상담으로 안내합니다." },
      { heading: "다음 단계", body: "실제 수업 흐름은 목동 쇼룸에서 직접 보는 것이 가장 빠릅니다. 회사·제품 소개나 도입 상담이 필요하면 도입 문의로 연결해 드립니다.", steps: ["목동 쇼룸에서 전자칠판·녹화·수업 도구가 한 흐름으로 작동하는 모습 확인","도입 문의로 우리 학원 상황에 맞는 구성·일정 상담"] }
    ],
    resources: [
      { label: "ClassIn 공식 사이트", href: "https://www.classin.com", description: "EEO와 클래스인의 글로벌 공식 소개입니다." },
      { label: "도입 상담·목동 쇼룸 문의", href: "/contact", description: "회사·제품 소개와 도입 상담을 요청할 수 있습니다." }
    ],
    relatedSlugs: ["academy-system-os-positioning","app-capabilities-map","board-overview","adoption-journey-90days","customer-stories"],
    status: "published",
    visibility: "public",
    docType: "guide",
    productArea: "general",
    difficulty: "beginner",
  },
]

function sortDocsByCategoryThenDate(a: DocArticle, b: DocArticle) {
  const categoryOrderA = docsCategories.find((category) => category.id === a.category)?.order ?? 99
  const categoryOrderB = docsCategories.find((category) => category.id === b.category)?.order ?? 99

  if (categoryOrderA !== categoryOrderB) {
    return categoryOrderA - categoryOrderB
  }

  return b.updatedAt.localeCompare(a.updatedAt)
}

export const featuredDocs = docs.filter((doc) => doc.featured)

export function listDocs() {
  return [...docs].sort(sortDocsByCategoryThenDate)
}

export function getDocBySlug(slug: string, category?: DocCategoryId) {
  return docs.find((doc) => doc.slug === slug && (!category || doc.category === category))
}

export function getDocsByCategory(category: DocCategoryId) {
  return docs.filter((doc) => doc.category === category).sort(sortDocsByCategoryThenDate)
}

export function getDocCategory(categoryId: string) {
  return docsCategories.find((category) => category.id === categoryId)
}

export function getDocPath(doc: Pick<DocArticle, "category" | "slug">) {
  return `/docs/${doc.category}/${doc.slug}`
}

export function getDocCategoryPath(categoryId: DocCategoryId) {
  return `/docs/${categoryId}`
}

export function getRelatedDocs(doc: DocArticle, limit = 3) {
  const related = (doc.relatedSlugs ?? [])
    .map((slug) => getDocBySlug(slug))
    .filter((item): item is DocArticle => Boolean(item))

  if (related.length >= limit) return related.slice(0, limit)

  const fallback = docs
    .filter((item) => item.category === doc.category && item.slug !== doc.slug)
    .filter((item) => !related.some((relatedDoc) => relatedDoc.slug === item.slug))
    .sort(sortDocsByCategoryThenDate)

  return [...related, ...fallback].slice(0, limit)
}
