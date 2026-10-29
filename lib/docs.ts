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
    description:
      "클래스인을 처음 설치하거나 도입을 검토하는 분이 먼저 보는 곳입니다. PC·모바일 설치, 회원 가입, 비밀번호 변경과 도입 전에 많이 묻는 질문이 있습니다.",
    order: 1,
  },
  {
    id: "software",
    title: "소프트웨어 가이드",
    description:
      "클래스인 소프트웨어로 무엇을 할 수 있는지 궁금하다면 여기서 시작하세요. 교실과 판서 도구, 숙제·시험 같은 학습 활동, AI 튜터와 AI 평가, 관리자 통계, 요금제가 있습니다.",
    order: 2,
  },
  {
    id: "admin",
    title: "관리자 가이드",
    description:
      "원장·실장이 관리자 대시보드에서 하는 일을 순서대로 담았습니다. 유료 계정 전환과 기관 설정, 교사·학생 추가, 코스 개설, 스토리지, 수업 모니터링과 통계까지 있습니다.",
    order: 3,
  },
  {
    id: "teacher",
    title: "교사 가이드",
    description:
      "수업을 맡은 강사가 보는 곳입니다. 코스를 만들고 학생을 초대하는 법, 숙제·시험 같은 학습 활동 추가, 교실 설정, 수업 자료 관리, 웹 라이브까지 담았습니다.",
    order: 4,
  },
  {
    id: "student",
    title: "학생 가이드",
    description:
      "학생과 학부모를 위한 사용법입니다. 코스에 들어가는 법부터 수업 참여와 다시보기, 학습 보고서, 숙제 제출과 성적 확인, 채팅과 캘린더까지 있습니다.",
    order: 5,
  },
  {
    id: "hardware",
    title: "하드웨어 가이드",
    description:
      "ClassIn Board를 쓰고 있거나 도입을 검토 중이라면 여기부터 보세요. 판서와 기본 조작, AI 카메라와 마이크, 모델별 사양, 설치 전 준비와 안전 수칙을 담았습니다.",
    order: 6,
  },
  {
    id: "board",
    title: "전자칠판 배송·설치",
    description:
      "전자칠판을 들여놓는 학원의 IT 담당자와 설치 엔지니어가 보는 곳입니다. 배송 뒤 설치와 카메라 연결 순서를 다룹니다.",
    order: 7,
  },
  // 제목·설명·순서는 DB 시드(supabase/migrations/20260421_docs_center.sql)의 `updates` 행과 같다.
  // 정적 목록에 없으면 Supabase 폴백 때 /docs/updates/* 가 카테고리를 못 찾아 404 가 된다.
  // (DB 쪽 행은 20260514 마이그레이션이 숨겼고, 숨김 행은 getDocsContent 가 읽지 않는다.)
  {
    id: "updates",
    title: "업데이트",
    description: "학원 운영에 영향을 주는 제품 변경 사항과 권장 조치입니다.",
    order: 60,
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
// "클립 1", 전화/계정 ID 숫자, 직원·테스트 계정명, 한자 원문, 금액, 캡처 파일명)를 걸러
// <meta name="keywords">와 챗봇 청크에 개인정보·내부 표현이 새지 않게 한다. 걸린 키워드는 고쳐 쓰지 않고 뺀다.
const CS_FIGMA_PII_KEYWORD_RE =
  /메인\s*계정|학원\s?[A-Z](?![A-Za-z])|(?:New|Main)\s*Course|클립\s*\d|\d{8,}|EEO[-_ ]?(?:TEST|Trans)|EEO\d{4,}|minjae|Korean_Kay|Wayne\s*Kim|Classin_Hope|zhangsan|예시\s*(?:계정|사용자|학원)|\p{Script=Han}|₩\s?\d|^(?:Frame|image|Group)\s*\d+$|\.(?:png|jpe?g|webp)$/iu

function scrubCsFigmaKeywords(keywords: string[]): string[] {
  return Array.from(
    new Set(
      keywords
        .filter((keyword) => !CS_FIGMA_PII_KEYWORD_RE.test(keyword))
        .map((keyword) => sanitizeCsFigmaText(keyword))
        .filter((keyword) => keyword.length > 0 && !CS_FIGMA_PII_KEYWORD_RE.test(keyword))
    )
  )
}

// 생성 가이드의 audience 는 캡처 작업 메모("CS팀", "학원(학원C) 강사/운영자 — …", "(관리자 대시보드 사용자)")가
// 섞여 있어 공개 페이지 "추천 대상"에 그대로 보이면 안 된다. 괄호·대시 뒤 설명과 내부 표현을 걷어 역할만 남긴다.
const CS_FIGMA_INTERNAL_AUDIENCE_RE = /^(?:CS\s*(?:팀|담당자?)?|학원[A-Z]?)$/i
const CS_FIGMA_DEFAULT_AUDIENCE = "학원 관리자, 강사"

function sanitizeCsFigmaAudience(value: string): string {
  const roles = sanitizeCsFigmaText(value)
    .replace(/\s*[—–]\s.*$/, "")
    .replace(/\s*\([^)]*\)/g, "")
    .split(/[/,·]/)
    .map((role) =>
      role
        .replace(/학원[A-Z]\b/g, "")
        .replace(/\s*(?:및\s*)?(?<![A-Za-z])CS(?![A-Za-z])\s*(?:대응용|담당자?|팀|용)?/g, "")
        .replace(/\s{2,}/g, " ")
        .trim()
    )
    .filter((role) => role.length > 0 && !CS_FIGMA_INTERNAL_AUDIENCE_RE.test(role))
  return roles.length > 0 ? Array.from(new Set(roles)).join(", ") : CS_FIGMA_DEFAULT_AUDIENCE
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
    "사용법",
    "순서 안내",
  ])
  const baseMeta = {
    slug: guide.docSlug,
    category: guide.docCategory,
    audience: sanitizeCsFigmaAudience(guide.audience),
    updatedAt:
      enrichment?.updatedAt ??
      guide.updatedAt ??
      (guide.sourceDigestLineHint.includes("2026-08-05") ? "2026-08-05" : "2026-06-21"),
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
        heading: "전체 순서를 한 장으로",
        body: "누를 곳을 한 장에 모아 표시했습니다. 단계마다 무엇을 하는지는 아래에 있습니다.",
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
      sections.push({ heading: "미리 알아 둘 것", body: "", steps: enrichment.tips })
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
    title: "Classin을 수업 시스템 OS로 이해하기",
    description: "클래스인이 Zoom이나 일반 전자칠판과 무엇이 다른지, 한국 학원은 보통 어디서부터 시작하는지, 클래스인만으로는 해결되지 않는 일은 무엇인지. 도입을 검토하는 원장·실장이 처음 읽으면 좋습니다.",
    audience: "학원 원장, 관리자, 운영 책임자, 기관 도입 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    featured: true,
    tags: ["수업 시스템 OS", "도입 상담", "전자칠판", "EDB", "녹화", "LMS", "관리자 데이터"],
    keywords: [
      "수업 시스템 OS",
      "Classin 차이",
      "Zoom과 차이",
      "일반 전자칠판과 차이",
      "EDB",
      "수업 녹화",
      "LMS",
      "관리자 대시보드",
      "API 연동",
      "학원 도입",
      "학원 OS 의미",
      "OS 뜻",
      "학원 시스템",
      "수업 전중후",
    ],
    chatbotSummary: CLASSIN_POSITIONING.chatbot.identitySummary,
    sections: [
      {
        heading: "한 문장으로 말하면",
        media: [
          {
            type: "image",
            src: "/images/docs/diagrams/lesson-os-map.svg",
            alt: "수업 전 준비, 수업 중 판서·녹화·수업 도구, 수업 후 다시보기·LMS·데이터가 한 흐름으로 이어지는 수업 OS 개념도",
            caption: "수업 전·중·후가 끊기지 않고 한 흐름으로 이어집니다.",
            width: 1440,
            height: 760,
          },
        ],
        body: CLASSIN_POSITIONING.oneLine,
        steps: [
          "여기서 OS는 윈도우 같은 컴퓨터 운영체제가 아니라, 학원 수업이 돌아가는 방식을 하나로 묶는다는 뜻입니다.",
          "수업 전에는 강사가 EDB 교안이나 PDF를 드라이브에 올려 두고, 시간이 되면 코스에 잡힌 수업으로 들어갑니다.",
          "수업 중에는 드라이브의 교안을 칠판에 띄워 판서하고, 수업 녹화를 켜 둡니다.",
          "수업이 끝나면 녹화본과 판서가 담긴 학습 보고서가 코스에 남고, 학생은 다시보기와 숙제·시험으로 복습을 이어 갑니다.",
          "관리자는 웹 대시보드에서 수업 기록, 출결, 녹화, 통계를 봅니다.",
          "그래서 도입은 장비를 바꾸는 일보다, 좋은 수업 방식을 강사 개인이 아니라 학원의 기준으로 남기는 일에 가깝습니다.",
        ],
      },
      {
        heading: "Zoom이나 일반 전자칠판과 다른 점",
        body: CLASSIN_POSITIONING.coreNarrative,
        steps: CLASSIN_POSITIONING.comparisonPoints.map((item) => `${item.label}: ${item.point}`),
      },
      {
        heading: "한국 학원은 보통 여기서 시작합니다",
        body: CLASSIN_POSITIONING.localReality,
        steps: [
          "교실 하나, 대표 수업 하나, 대표 강사 한 명을 정해 파일럿부터 엽니다. 처음부터 전 교실에 깔면 문제가 생겨도 어디서 막혔는지 찾기 어렵습니다.",
          "강사 온보딩은 기존 교안을 EDB로 옮기기, 녹화해서 복습으로 나눠 주기, 숙제·시험을 코스에 올리기 순서로 잡습니다.",
          "온라인·하이브리드 전환은 뒤로 미뤄도 됩니다. 학생이 개인 기기를 쓰지 않는 오프라인 교실에서도 판서·녹화·다시보기만으로 결석생 보강과 복습 자료가 생깁니다.",
          "학생 개인 기기(패드)를 쓰는 수업은 학원 분위기와 수업 방식을 보고 나중에 붙입니다.",
        ],
      },
      {
        heading: "EDB 교안이 쌓이면 달라지는 것",
        body: CLASSIN_POSITIONING.edbSummary,
        steps: [
          "잘 가르치는 강사의 판서 순서, 이미지 배치, 활동 구성이 파일로 남습니다. 그 강사가 자리를 비워도 수업 방식은 학원에 남습니다.",
          "수업 때마다 자료를 다시 찾아 띄우거나 칠판을 지우고 새로 쓰는 시간이 줄어듭니다.",
          "EDB 교안을 공유 드라이브에 올려 두면 신규 강사나 다른 지점 강사도 같은 교안으로 수업을 시작합니다.",
          "EDB만 따로 만들기보다 녹화, 다시보기, 숙제까지 한 번에 설계해야 수업이 끝난 뒤 복습 자료로 이어집니다.",
        ],
      },
      {
        heading: "관리자가 확인하는 데이터",
        body: CLASSIN_POSITIONING.adminDataSummary,
        steps: [
          "진행 중인 수업은 대시보드의 수업 모니터링에서 바로 들어가 봅니다. 이때 교사와 학생에게 알림이 가지 않습니다.",
          "끝난 수업은 1분마다 저장된 수업 화면, 교사·학생의 입장·퇴장 기록, 녹화본, 학습 보고서로 확인합니다.",
          "기간별 수업 횟수와 출석 인원은 통계 파일로 내려받아 월말 점검에 씁니다.",
          "데이터 화면 접근 권한은 꼭 필요한 관리자와 교사 계정에만 줍니다. 화면별 경로는 '관리자 모니터링과 통계 활용' 문서에 있습니다.",
        ],
      },
      {
        heading: "클래스인만으로는 해결되지 않는 일",
        body: CLASSIN_POSITIONING.honestLimit,
        steps: [
          "수강료 결제와 정산은 학원마다 방식이 달라, 지금 쓰는 결제·관리 프로그램과 역할부터 나눕니다.",
          "오프라인 출입·출석 체크는 현장 장비와 운영 규칙이 얽혀 있어 외부 시스템이나 별도 절차와 함께 설계합니다.",
          "경영 리포트나 자체 CRM 연계가 필요하면 공식 API, 데이터 구독, 커스텀 대시보드 범위로 따로 검토합니다.",
          ...CLASSIN_POSITIONING.apiStages,
          "API를 켠 기관은 코스·수업·교사·학생을 관리자 콘솔이 아니라 자체 관리 시스템에서 만들어야 합니다. 콘솔에서 새로 만들면 자체 시스템과 자동으로 맞춰지지 않습니다.",
        ],
      },
    ],
    resources: [
      {
        label: "ClassIn EDB 파일 만들기 공식 가이드",
        href: "https://www.classin.com/kr/how-to-create-edb-files/",
        description: "EDB 파일이 무엇이고 어떻게 만드는지 클래스인 공식 사이트에서 확인합니다.",
      },
      {
        label: "ClassIn API 공식 문서",
        href: "https://docs.eeo.cn/api/en/",
        description: "데이터 구독, 코스·수업 정보 조회, SDK 범위를 개발 담당자와 함께 볼 때 여는 영문 문서입니다.",
      },
      {
        label: "수업 시스템 OS 진단 체크리스트",
        href: "/resources/academy-system-checklist",
        description: "우리 학원이 지금 도입을 준비할 단계인지 스스로 점검하는 자료입니다.",
      },
    ],
    relatedSlugs: ["adoption-journey-90days", "software-overview", "board-overview", "admin-operation-standardization"],
  },
  {
    slug: "software-overview",
    category: "software",
    title: "클래스인 소프트웨어로 할 수 있는 일",
    description: "처음 검토하는 학원도, 막 도입한 학원도 클래스인 전체 기능부터 훑어봅니다. 수업 전·중·후에 무엇을 쓰는지 보고, 관리자·강사·학생이 각자 먼저 익힐 것과 첫 2주를 보낼 순서를 정합니다.",
    audience: "도입 검토자, 학원 관리자, 운영팀, 교사",
    updatedAt: "2026-09-24",
    readMinutes: 5,
    featured: true,
    tags: ["소프트웨어", "기능 지도", "수업 운영", "LMS", "AI"],
    keywords: ["Classin 소프트웨어", "클래스인 기능", "수업 도구", "학습 활동", "LMS", "AI 튜터", "자동 녹화", "학습 데이터", "클래스인이 뭐야", "클래스인 소개"],
    chatbotSummary: "클래스인 소프트웨어는 실시간 교실, 판서와 수업 도구, 숙제·시험·녹화 수업 같은 학습 활동, 출결·과제·성적을 관리하는 LMS, 수업 녹화와 학습 보고서, AI 튜터·AI 평가를 한 앱 안에서 이어서 씁니다. 처음에는 설치와 계정, 코스 구조, 매 수업 쓰는 도구, 수업 뒤 숙제와 성적 순서로 익히고 AI 기능은 그다음에 붙이면 됩니다.",
    sections: [
      {
        heading: "수업 전·중·후에 쓰는 것",
        body: "클래스인은 화상 수업 도구 하나로 끝나지 않습니다. 수업 전에 코스와 자료를 준비하고, 수업 중에 판서하고 녹화하고, 수업이 끝나면 다시보기와 숙제·성적으로 이어지는 과정이 한 앱 안에서 돌아갑니다. 강사와 학생은 PC·모바일 앱을 쓰고, 관리자는 웹 대시보드에서 계정과 수업 기록을 봅니다.",
        steps: [
          "수업 전에는 코스를 만들고 과정·단원을 나눈 뒤, 드라이브에 자료를 올리고 학생을 초대하고 수업 일정을 잡습니다.",
          "수업 중에는 칠판에 판서하고 화면 공유, 채팅, 퀴즈, 그룹 토론, 개인 칠판으로 학생을 참여시킵니다.",
          "수업이 끝나면 녹화 다시보기와 학습 보고서가 남고, 숙제 제출과 채점, 성적 확인으로 복습이 이어집니다.",
          "관리자는 출결, 스토리지, 교사·학생 계정, 웹 라이브, 통계를 대시보드에서 관리합니다.",
          "AI 튜터와 AI 평가는 학생 복습을, AI 출제와 AI 채점은 강사의 준비와 채점을 돕습니다. 보이는 범위는 기관 설정과 계약에 따라 다릅니다.",
        ],
      },
      {
        heading: "과제 관리 도구와 다른 점",
        body: "구글 클래스룸처럼 과제 관리가 중심인 도구와 비교하는 경우가 많습니다. 클래스인은 과제뿐 아니라 실시간 화상 수업, 판서 권한, 학생 발표, 자동 녹화, 다시보기 진도, 퀴즈, 학습 데이터를 한곳에서 운영합니다.",
        steps: [
          "구조는 학생이 초대되고 활동이 쌓이는 코스 아래에 실제 교실인 수업이 생기는 방식입니다. 코스 하나가 반 하나라고 보면 됩니다.",
          "한 수업에 들어올 수 있는 최대 인원과 만들 수 있는 반 수는 요금제마다 달라 상담에서 확인합니다.",
        ],
      },
      {
        heading: "화면에서 찾을 때는 다섯 묶음으로",
        body: "메뉴 이름을 외우기보다 어디서 쓰는 기능인지로 묶어 두면 찾기 빠릅니다.",
        steps: [
          "실시간 교실에는 칠판, 카메라와 마이크, 채팅, 화면 공유, 미러링, VNC가 있습니다.",
          "수업 도구는 교실 툴 바에서 꺼냅니다. 타이머, 스톱워치, 주사위, 랜덤 선택, 레이저 포인터, 매직펜, 객관식·선착순 퀴즈, 그룹 토론, 개인 칠판이 여기 있습니다.",
          "학습 활동은 코스의 과정 탭에서 만듭니다. 수업, 숙제, 시험, 녹화 수업, 학습 자료, 일일 과제, 토론, OMR 카드, SCORM, 영어·중국어 따라읽기가 있습니다.",
          "코스 운영(LMS) 쪽에는 코스, 단원, 출결, 과제, 성적, 보고서, 드라이브, 게시판과 메시지가 있습니다.",
          "AI와 데이터 쪽에는 AI 튜터, AI 평가, 학습 보고서, 관리자 통계가 있습니다. 수업 중 문제를 내고 AI가 채점하는 AI 칠판은 기본으로 꺼져 있어 담당 매니저에게 신청합니다.",
        ],
      },
      {
        heading: "누가 무엇부터 익히나",
        body: "같은 클래스인을 써도 관리자, 강사, 학생이 먼저 익힐 것은 다릅니다. 첫 주에는 각자 아래 것만 해 보면 됩니다.",
        steps: [
          "관리자는 기관 설정, 교사·학생 추가, 코스 권한, 스토리지, 웹 라이브, 통계 화면을 먼저 엽니다. 데이터 화면은 '관리자 모니터링과 통계 활용'에 있습니다.",
          "강사는 프로필, 드라이브에 자료 올리기, 코스와 수업 만들기, 학습 활동 추가, 교실 기본 설정 순서로 익힙니다. 수업 중 도구는 '교실과 판서 도구 사용법', 숙제와 시험은 '수업·숙제·시험·학습 활동 가이드'를 보세요.",
          "학생은 코스 참여, 수업 입장, 다시보기, 과제 제출, 성적 확인만 알면 수업을 따라옵니다. AI 튜터 쓰는 법은 'AI 튜터와 AI 평가 활용하기'에 있습니다.",
          "상담·온보딩 담당자는 설치, 계정 인증, 첫 수업 체크리스트 문서 링크를 모아 두고 문의가 오면 바로 보냅니다.",
        ],
      },
      {
        heading: "첫 2주는 이 순서로",
        body: "기능을 한꺼번에 켜면 강사도 학생도 헤맵니다. 매 수업 쓰는 것부터 자리를 잡고, 수업 뒤 운영과 AI는 그다음에 붙입니다.",
        steps: [
          "설치, 회원가입, 비밀번호 찾기, 계정 인증, 학생이 코스에 들어오는 경로부터 맞춰 둡니다.",
          "강사용 기본 수업 틀과 자료 올리는 규칙(폴더, 파일 이름)을 정합니다.",
          "판서, 채팅, 화면 공유, 타이머, 퀴즈처럼 매 수업 쓰는 도구를 먼저 연습합니다.",
          "숙제, 시험, 성적, 학습 보고서 같은 수업 뒤 기능을 붙입니다.",
          "AI 튜터, AI 평가, 학습 데이터 리포트는 수업 루틴이 자리 잡은 뒤에 켭니다.",
        ],
      },
    ],
    resources: [
      {
        label: "클래스인 소프트웨어 제품 소개",
        href: "/product/sw",
        description: "제품 페이지에서 주요 기능과 도입 사례를 함께 봅니다.",
      },
    ],
    relatedSlugs: ["classroom-tools", "lesson-activities", "admin-monitoring-analytics", "ai-learning-tools"],
  },
  {
    slug: "classroom-tools",
    category: "software",
    title: "교실과 판서 도구 사용법",
    description: "수업 중에 판서를 할지, 화면을 공유할지, 퀴즈나 개인 칠판을 꺼낼지 강사가 고를 때 봅니다. 학생을 무대에 올리고 권한을 주는 방법까지 있어 신규 강사 교육 자료로 그대로 써도 됩니다.",
    audience: "교사, 수업 운영팀, 신규 강사 온보딩 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 8,
    featured: true,
    tags: ["교실", "판서", "수업 도구", "퀴즈", "상호작용", "온스테이지", "STEM 실험", "게이미피케이션"],
    keywords: ["전자칠판", "수업 도구", "타이머", "스톱워치", "화면 공유", "미러링", "개인 칠판", "그룹 토론", "선착순 퀴즈", "온스테이지", "오프스테이지", "발표 권한", "물리 실험", "화학 실험", "기하도형", "측정 도구", "바둑 칠판", "공동 작업", "다방향 브라우저", "보조 카메라", "랜덤 선택", "트로피 순위", "레이저 포인터", "스테이지 숨기기", "교실 스위치 설정", "보조 칠판", "화면 공유 판서", "화면 공유 필기", "공유 화면 메모", "이디비", "EDB 파일", "EDB 만들기", "교안 재사용", "판서 파일", "칠판 파일", "매직펜", "확장형 판서 영역", "판서 공간 늘리기", "개인 칠판 인원", "AI 칠판"],
    chatbotSummary: "교실 도구는 진행 속도를 잡는 도구, 판서와 자료를 보여 주는 도구, 학생이 직접 참여하는 도구로 나누면 고르기 쉽습니다. 타이머·스톱워치·주사위·랜덤 선택·트로피 순위는 진행에, 칠판·보조 칠판·레이저 포인터·브라우저·화면 공유·미러링·VNC는 자료 설명에, 개인 칠판·객관식 퀴즈·선착순 퀴즈·그룹 토론·공동 작업·다방향 브라우저는 참여에 씁니다. 발표할 학생은 온스테이지와 권한 부여로 정하고, 물리·화학 실험, 기하도형, 측정 도구, 바둑 칠판, 보조 카메라로 체험형 수업을 꾸립니다. 교실에 보이는 도구는 기관의 교실 스위치 설정에 따라 다릅니다.",
    sections: [
      {
        heading: "수업 단계마다 꺼내는 도구가 다릅니다",
        body: "도구를 많이 쓴다고 수업이 좋아지지는 않습니다. 한 차시를 시작, 설명, 풀이, 참여, 마무리로 나누고 단계마다 한두 개만 정해 두면 됩니다. 교실에 어떤 도구가 보이는지는 관리자가 대시보드 [일반 설정] > [교실 설정]의 스위치 설정에서 켜고 끈 상태에 따라 달라집니다.",
        steps: [
          "시작할 때는 타이머, 주사위, 랜덤 선택으로 주의를 모읍니다.",
          "설명할 때는 판서, 레이저 포인터, 매직펜, 브라우저, 화면 공유, 미러링으로 자료를 보여 줍니다.",
          "풀이할 때는 개인 칠판, 보조 칠판, 측정 도구, 기하도형을 씁니다.",
          "학생 참여가 필요할 때는 객관식 퀴즈, 선착순 퀴즈, 그룹 토론, 공동 작업을 엽니다.",
          "마무리할 때는 트로피 순위와 채팅으로 결과를 나누고 다음 과제를 알립니다.",
        ],
      },
      {
        heading: "진행 속도를 잡는 도구",
        body: "타이머, 스톱워치, 주사위, 랜덤 선택, 트로피 순위는 수업 속도와 분위기를 조절할 때 씁니다. 수업이 늘어질 때 한 번씩 꺼내면 학생들이 다시 화면을 봅니다.",
        steps: [
          "타이머는 문제 풀이, 토론 준비, 쉬는 시간처럼 끝나는 시각을 정해 둘 때 씁니다.",
          "스톱워치는 발표나 과제에 걸린 시간을 잴 때 씁니다.",
          "주사위는 문제 번호를 고르거나 조를 나누거나 복습 게임을 할 때 씁니다.",
          "랜덤 선택은 발표자를 무작위로 뽑습니다. 질문이 몇몇 학생에게만 몰리지 않습니다.",
          "트로피 순위는 정답을 맞히거나 활발히 참여한 학생에게 바로 보상을 줄 때 씁니다. 트로피 이미지는 관리자가 교실 설정의 파라미터 설정에서 바꿉니다.",
        ],
      },
      {
        heading: "판서하고 자료를 보여 줄 때",
        body: "칠판은 스크롤해서 최대 50페이지까지 이어 씁니다. 수업의 중심 내용은 본 칠판에 남기고, 잠깐 계산하거나 덧붙일 설명은 보조 칠판에 쓰면 본 판서가 흐트러지지 않습니다.",
        steps: [
          "본 칠판에는 수식 풀이, 개념 도식, 문제 해설처럼 수업이 끝나도 남아야 할 내용을 씁니다. 판서는 수업 뒤 학습 보고서에 그대로 담겨 학생에게 갑니다.",
          "칠판이 가득 차면 마우스 오른쪽 버튼으로 가로선을 띄워 아래로 끌어 새 판서 공간을 만듭니다. 위로 끌면 이미 쓴 내용이 위로 올라갑니다. 6.0.7 업데이트부터 기본으로 켜져 있고, 50페이지 한도는 그대로입니다.",
          "보조 칠판은 본 판서를 그대로 둔 채 임시 계산이나 추가 설명을 할 때 엽니다.",
          "레이저 포인터는 학생 시선을 한 곳으로 잠깐 모을 때 씁니다.",
          "매직펜은 필기를 멈추면 1초 뒤 획이 저절로 사라지는 펜입니다. 기존 판서를 지우지 않고 풀이 흐름을 짚거나, 정답을 미리 보여 주지 않고 위치만 가리킬 때 씁니다. 6.0.7 업데이트부터 도구 모음에 기본으로 들어 있습니다.",
          "브라우저는 웹 자료를 교실 안에서 바로 띄울 때 씁니다. 자주 여는 사이트는 관리자에게 교실 설정의 브라우저 즐겨찾기에 등록해 달라고 하면 매번 주소를 치지 않아도 됩니다.",
          "화면 공유, 미러링, VNC는 교재 뷰어, 외부 프로그램, 실습 화면을 보여 줄 때 씁니다.",
          "화면을 공유하는 중에도 공유 화면 아래쪽의 [메모]를 누르면 그 위에 바로 판서합니다.",
        ],
        media: [
          {
            type: "image",
            src: `${SOFTWARE_MEDIA_BASE}/two-way-blackboard.webp`,
            alt: "교사와 학생이 같은 칠판에 함께 판서하는 클래스인 수업 화면",
            caption: "권한을 받은 학생은 교사와 같은 칠판 위에 직접 씁니다.",
            width: 1440,
            height: 900,
          },
        ],
      },
      {
        heading: "EDB 교안 만들고 다시 쓰기",
        body: "EDB(이디비)는 판서, 이미지, 텍스트를 담은 클래스인 고유의 칠판 파일입니다. 한 번 만들어 두면 기존 수업 교안 대신 그대로 불러와 수업합니다.",
        steps: [
          "새로 만들 때는 [칠판]에서 배경을 정하고 필기, 텍스트, 캡처로 내용을 채웁니다.",
          "수업 전에 미리 만들어 두려면 드라이브의 [새로 만들기] > [판서]로 칠판 파일을 만듭니다.",
          "내 컴퓨터나 클라우드 드라이브에 있는 EDB를 불러와 고쳐 씁니다.",
          "작업한 판서는 저장하고 공유합니다. 공유 드라이브에 올려 두면 다른 강사도 같은 교안으로 수업합니다.",
        ],
      },
      {
        heading: "학생이 직접 풀고 답하게 하려면",
        body: "온라인이나 하이브리드 수업은 학생이 보기만 하는 시간이 길어지기 쉽습니다. 학생이 직접 손을 움직이는 순간을 수업 중간중간 넣어 주세요.",
        steps: [
          "경로: 칠판 > [수업 도구] > [개인 칠판] > 그림판 > [배포]",
          "개인 칠판은 학생마다 자기 칠판에 풀게 하고, 교사가 학생별 풀이를 한 화면에서 보며 첨삭할 때 씁니다. 문제는 위 경로대로 배포합니다.",
          "객관식 퀴즈는 개념을 이해했는지 바로 확인할 때 씁니다.",
          "선착순 퀴즈는 누가 먼저 답하는지 겨루게 해 반응 속도와 집중을 끌어올립니다.",
          "그룹 토론은 조별 문제 풀이, 발표 준비, 토의 수업에 씁니다.",
          "공동 작업과 다방향 브라우저는 여러 학생이 같은 자료를 동시에 조작하거나 함께 쓸 때 엽니다.",
          "개인 칠판 인원 제한을 없애는 기능과, 저장해 둔 .edb 파일을 개인 칠판에 넣는 기능(PC·ClassIn X만)은 기본으로 꺼져 있습니다. 쓰려면 담당 매니저에게 켜 달라고 요청하고, 교사와 학생 모두 6.0.7 이상으로 업데이트합니다.",
          "AI 칠판은 수업 중에 문제를 내고 AI가 바로 채점하는 도구입니다. 기본으로 꺼져 있어 담당 매니저에게 켜 달라고 요청해야 하고, 교사와 학생 모두 6.0.8 이상이어야 합니다. 쓰는 흐름은 'AI 튜터와 AI 평가 활용하기'에 있습니다.",
        ],
      },
      {
        heading: "학생을 무대에 올리고 권한 주기",
        body: "클래스인 교실 위쪽에는 카메라가 뜨는 스테이지(무대)가 있고, 누구를 올릴지는 교사가 정합니다. 스테이지에 올라와 있지 않은 학생은 목소리도 들리지 않으니 발표시킬 학생은 먼저 무대에 올리세요. 칠판을 넓게 쓰고 싶으면 [메뉴] > [설정] > [일반]에서 스테이지를 숨깁니다. 숨겨 둔 상태에서도 교사와 학생 카메라는 따로 띄울 수 있습니다.",
        steps: [
          "온스테이지 인원수는 수업을 만들 때 1v0~1v12처럼 정합니다. 왼쪽 숫자가 교사, 오른쪽 숫자가 무대에 올릴 학생 수입니다.",
          "학생 자동 온스테이지는 학생을 무대 자리에 자동으로 배치하는 설정입니다. 카메라와 마이크 상태는 수업을 시작할 때 따로 확인합니다.",
          "특정 학생에게 권한을 주면 그 학생 카메라 오른쪽 위에 왕관 표시가 생기고, 학생이 칠판에 쓰거나 드라이브 자료를 띄워 발표합니다.",
          "발표가 끝나면 권한을 거둬 수업 흐름을 다시 교사 쪽으로 가져옵니다.",
          "인원이 많은 수업에서는 발표할 학생만 무대에 올립니다. 무대 인원이 많을수록 화면이 복잡해지고 네트워크 부담도 커집니다.",
        ],
      },
      {
        heading: "실험·작도 도구와 보조 카메라",
        body: "설명만으로 부족한 과학·수학 수업에는 도구 팔레트의 물리 실험, 화학 실험, 기하도형, 측정 도구를 꺼냅니다. 기관 설정에 따라 보이지 않는 도구가 있으니 수업 전에 교실에서 미리 열어 보세요.",
        steps: [
          "물리 실험과 화학 실험 도구로 실험 장면을 화면 위에서 보여 줍니다.",
          "기하도형과 측정 도구로 도형과 작도를 칠판 위에 그려 보입니다.",
          "바둑 칠판은 바둑·오목처럼 격자 위에서 하는 수업에 씁니다.",
          "보조 카메라를 연결하면 실물 교구나 손동작을 별도 화면으로 비춥니다.",
        ],
      },
      {
        heading: "신규 강사 교육과 수업 전 점검",
        body: "강사마다 쓰는 도구가 제각각이면 같은 과목인데도 반마다 수업 느낌이 달라집니다. 학원에서 기본 도구 몇 개를 정해 두고 신규 강사에게 그것부터 가르치세요.",
        steps: [
          "자주 쓰는 도구 다섯 개를 학원 기본 수업 틀로 정하고, 신규 강사 교육 때 먼저 연습시킵니다.",
          "교사는 수업 시작 20분 전부터 교실에 입장합니다. 이때 카메라, 마이크, 스피커를 테스트하고 화면 공유와 판서 입력을 한 번씩 눌러 봅니다.",
          "퀴즈와 토론 질문은 그날 수업 목표에 맞춰 미리 만들어 둡니다.",
          "참여 도구를 열 때는 제한 시간과 제출 기준을 먼저 말해 줍니다.",
          "수업이 끝나면 녹화, 판서, 과제 안내가 학생에게 갔는지 확인합니다.",
        ],
      },
    ],
    relatedSlugs: ["classroom-basic-setup", "lesson-option-concepts", "lesson-activities", "classin-607-update"],
  },
  {
    slug: "lesson-activities",
    category: "software",
    title: "수업·숙제·시험·학습 활동 가이드",
    description: "숙제, 시험, 녹화 수업 가운데 무엇을 낼지 고민될 때 활동끼리 비교합니다. 활동마다 언제 쓰는지, 만들 때 무엇을 정하는지, 학생이 어디서 막히는지를 강사 입장에서 따져 봅니다.",
    audience: "교사, 커리큘럼 담당자, 학원 운영팀",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    tags: ["학습 활동", "숙제", "시험", "녹화 수업", "SCORM"],
    keywords: ["수업", "숙제", "시험", "녹화 수업", "학습 자료", "일일 과제", "토론", "OMR 카드", "SCORM", "따라읽기", "받아쓰기", "외워말하기", "AI 어학", "문제은행", "테스트 뱅크", "자동 채점", "AI 스피킹", "문제 은행", "플레이바 드래그", "시청 기록", "AI 채점", "답안 추가"],
    chatbotSummary: "클래스인 학습 활동에는 수업, 숙제, 시험, 녹화 수업, 학습 자료, 일일 과제, 토론, OMR 카드, SCORM과 영어·중국어 따라읽기·받아쓰기·외워말하기가 있습니다. 코스의 과정 탭에서 [새로 만들기]로 추가하고, 시작·마감 시간, 게시 대상, 단원, 선행 학습 조건을 함께 정합니다. 시험과 OMR 카드는 주관식을 뺀 문항이 자동 채점되고, 자주 내는 문항은 문제은행(테스트 뱅크)에 모아 다시 씁니다. 문제은행 제공 범위는 기관 설정과 계약에 따라 다를 수 있습니다.",
    sections: [
      {
        heading: "활동을 만들기 전에 정할 것",
        body: "기능 이름부터 고르면 나중에 채점 방식이 안 맞아 다시 만들게 됩니다. 무엇을 확인하려는지, 학생이 무엇을 내야 하는지부터 정하고 활동을 고르세요. 활동은 코스의 과정 탭에서 만듭니다.",
        steps: [
          "경로: 코스 > 과정 탭 > [새로 만들기]",
          "목표를 정합니다. 개념 확인인지, 복습인지, 점수를 매길 평가인지에 따라 맞는 활동이 달라집니다.",
          "학생이 낼 결과물이 답안인지, 파일인지, 음성인지, 토론 댓글인지 정합니다.",
          "시작·마감 시간, 게시 대상, 연결할 단원, 선행 학습 조건을 정합니다. 이 네 가지는 활동 종류와 관계없이 공통 설정입니다.",
          "채점과 피드백을 누가 언제 할지, 성적에 반영할지 정합니다.",
          "학생에게 보낼 안내와 제출 기준을 활동 본문에 적습니다.",
        ],
      },
      {
        heading: "실시간 수업과 녹화 수업",
        body: "실시간 수업은 교사와 학생이 같은 시간에 교실에 들어오는 수업입니다. 녹화 수업은 강사가 가진 영상을 코스에 올려 학생이 각자 보게 하는 활동입니다. 실시간 수업을 녹화하는 '수업 녹화'와 이름이 비슷해 자주 헷갈리는데, 녹화 수업은 따로 올리는 영상입니다.",
        steps: [
          "실시간 수업은 출결, 판서, 채팅, 퀴즈, 토론과 함께 운영합니다. 수업 녹화를 켜 두면 끝난 뒤 학생이 다시보기로 봅니다.",
          "녹화 수업은 결석 보강, 예습 영상, 반복 복습에 씁니다. 영상은 드라이브나 내 컴퓨터에서 불러옵니다.",
          "녹화 수업의 고급 설정에서 재생 속도 조절, 플레이바 드래그, 시청 횟수 제한, 토론 공간을 켜고 끕니다. 끝까지 보게 하려면 플레이바 드래그를 막아 두세요.",
          "학생별 시청 횟수, 시청 시간, 완료율이 기록됩니다. 보강용 영상에는 시청 마감일과 확인 과제를 함께 붙입니다.",
        ],
      },
      {
        heading: "숙제와 일일 과제",
        body: "숙제는 한 번 제출받는 과제이고, 일일 과제는 정한 날짜마다 자동으로 다시 나가는 반복 과제입니다. 단어 암기나 매일 문제 풀이처럼 습관을 만들 때는 일일 과제가 맞습니다.",
        steps: [
          "숙제는 글, 이미지, 음성, 영상으로 제출받습니다. 어떤 형식으로 낼지 본문에 적어 두세요.",
          "다시 제출을 받을지, 학생이 첨부 파일을 내려받게 할지는 숙제 고급 설정에서 정합니다.",
          "[AI로 숙제 작성]으로 숙제 초안을 만들거나 써 둔 내용을 다듬습니다. AI 채점을 쓰려면 [답안 추가]에 AI가 참고할 모범 답안을 넣어 둡니다.",
          "일일 과제는 주기, 요일, 총 제출 일수를 정합니다. 매일 할 분량과 완료 기준은 짧게 적습니다.",
          "첨삭이 필요한 과제는 제출 예시와 피드백 예정일을 함께 알려 둡니다.",
        ],
      },
      {
        heading: "시험과 OMR 카드",
        body: "시험과 OMR 카드는 객관식처럼 답이 정해진 문항을 자동으로 채점합니다. 주관식은 교사가 직접 채점합니다. 학생에게는 무엇을, 언제까지, 어떻게 내는지부터 알려 주세요.",
        steps: [
          "시험은 [시험 문제 추가]로 객관식, 빈칸, 주관식 문항을 직접 넣거나, [문제 은행에서 불러오기]나 [AI 출제]로 시험지를 만듭니다.",
          "응시 시간과 빈칸 문항을 손으로 채점할지는 오른쪽 설정 메뉴에서 정합니다.",
          "자주 내는 문항은 문제 은행(테스트 뱅크)에 모아 두면 다음 시험을 빨리 만듭니다. 문제 은행 제공 범위는 기관 설정과 계약에 따라 다를 수 있습니다.",
          "시험이 끝나면 문제별 정답률, 선지별 선택률, 응시 소요 시간을 보고 다음 수업에서 다시 짚을 문항을 고릅니다.",
          "OMR 카드는 갖고 있는 시험지 파일을 그대로 쓰고 답만 입력받을 때 씁니다. 문제지, 답안·해설지, 문항별 정답과 배점 세 가지를 올리면 됩니다.",
          "OMR 카드를 휴대폰으로 풀면 시험지가 세로로 작게 보입니다. 학생에게 PC나 태블릿으로 응시하라고 미리 알려 주세요.",
          "성적 반영 방식과 결과 공개 시점도 시험 전에 알려 둡니다.",
        ],
      },
      {
        heading: "학습 자료, 토론, SCORM",
        body: "수업 전후에 학생이 자료를 읽고 의견을 남기게 하는 활동입니다.",
        steps: [
          "학습 자료는 PDF, 이미지, 수업 판서 같은 자료를 나눠 주고 학생이 열어 봤는지 확인할 때 씁니다. 첨부 파일 내려받기를 허용할지도 정합니다.",
          "토론은 정답이 하나가 아닌 주제나 조별 발표 준비에 씁니다. 학생이 의견을 올리고 좋아요와 댓글을 달며, 교사는 참여를 평가합니다.",
          "SCORM은 표준 규격으로 만든 외부 학습 콘텐츠를 코스에 넣어야 할 때 씁니다.",
          "자료만 올려 두면 안 보는 학생이 생깁니다. 마감일이나 확인 과제를 붙여 두세요.",
        ],
      },
      {
        heading: "따라읽기·받아쓰기·외워말하기로 어학 연습하기",
        body: "활동 게시 화면에는 AI 기반 어학 활동이 영어와 중국어로 나뉘어 있습니다. 따라읽기와 외워말하기는 학생이 소리 내어 말하면 AI가 녹음을 듣고 발음과 유창성을 점수로 매깁니다. 클래스인 공식 도움말에는 따라읽기가 [AI 스피킹]이라는 이름으로 나와 있으니, 그 이름이 보여도 같은 활동입니다.",
        steps: [
          "따라읽기는 제시된 문장을 소리 내어 읽게 해 발음과 유창성을 연습시킵니다. 6.0.8 업데이트부터 영어 따라읽기에서는 학생이 다시 읽거나 고칠 문장을 직접 골라 연습합니다.",
          "받아쓰기는 듣고 받아쓰게 해 듣기와 철자를 확인합니다.",
          "외워말하기는 외운 문장을 말하게 해 표현을 제대로 외웠는지 봅니다.",
          "연습 문장은 직접 입력하거나 [AI로 스마트 추가]에 난이도, 연령대, 주제를 넣어 만듭니다. 대상 언어(영어·중국어), 마감, 성적 반영 여부도 함께 정합니다.",
          "AI 점수는 참고용입니다. 발음이나 뜻 판단이 중요한 문항은 교사가 한 번 더 듣고 확정합니다.",
        ],
      },
    ],
    relatedSlugs: ["course-activities", "course-submit-activity", "course-grades", "ai-learning-tools"],
  },
  {
    slug: "ai-learning-tools",
    category: "software",
    title: "AI 튜터와 AI 평가 활용하기",
    description: "학생은 AI 튜터와 AI 평가를, 강사는 AI 출제와 AI 채점을 씁니다. 수업 중 문제를 내는 AI 칠판까지 각각 무엇을 하는지 보고, 기능을 켜기 전에 관리자와 강사가 학원 안 사용 기준을 함께 정합니다.",
    audience: "학원 관리자, 교사, 학습 관리 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    tags: ["AI", "AI 튜터", "AI 평가", "첨삭", "피드백"],
    keywords: ["AI 튜터", "AI 평가", "AI 첨삭", "AI 과제 생성", "AI 수식 풀이", "AI 문서 정리", "학습 피드백", "자기주도 학습", "AI 출제", "AI 채점", "AI로 숙제 작성", "AI 에이전트", "부가가치 서비스", "쓰기 과제 채점", "사진 숙제 채점", "답안 추가", "받아쓰기", "AI 강의 분석", "AI 칠판", "수업 중 AI 채점"],
    chatbotSummary: "AI 튜터는 코스의 수업 자료와 수업 내용을 바탕으로 학생 질문에 답하고, AI 평가는 성적을 포함한 학습 결과에 피드백을 줍니다. 강사는 [AI로 숙제 작성], 시험의 AI 출제, 숙제 AI 채점, 어학 활동의 AI 문제 생성으로 준비와 채점 시간을 줄입니다. 기관 계정의 AI 기능은 관리자 대시보드 일반 설정의 [부가가치 서비스]에서 켜고 끄며, 보이는 범위는 기관 설정과 계약에 따라 다릅니다. 수업 중 문제를 내고 AI가 채점하는 AI 칠판은 기본으로 꺼져 있어 담당 매니저에게 신청합니다. AI 결과는 보조 자료이고, 성적에 들어가는 판단은 교사가 확인합니다.",
    sections: [
      {
        heading: "켜기 전에 학원이 정할 것",
        body: "AI 기능이 보이는지는 기관의 계약, 계정 권한, 관리자 설정에 따라 다릅니다. 강사나 학생 화면에 AI 탭이 없다면 먼저 관리자 대시보드에서 켜져 있는지 확인하세요.",
        steps: [
          "경로: 대시보드 > [일반 설정] > [부가가치 서비스]",
          "AI 에이전트 토글을 켜거나 끕니다. 같은 화면에 AI 강의 분석 토글도 있습니다. 스마트 담임 교사는 AI가 아니라 문자 수업 알림 서비스이니, AI를 켜고 끌 때 함께 바꾸지 않습니다.",
          "바꾼 뒤에는 강사 화면과 학생 화면에서 AI 메뉴가 실제로 보이는지 확인합니다.",
          "학생에게 열어 줄 기능과 강사만 쓸 기능을 나눕니다.",
          "학생 개인정보, 상담 내용, 계약 정보는 AI 입력창에 넣지 않는다는 원칙을 강사들과 공유합니다.",
        ],
        media: [
          {
            type: "image",
            src: "/docs/files/cs-figma/classin-ai-비활성화-안내.png",
            alt: "관리자 대시보드 일반 설정의 부가가치 서비스 탭에서 AI 에이전트 토글을 확인하는 화면",
            caption: "기관 계정의 AI 기능은 대시보드 일반 설정 > [부가가치 서비스]의 AI 에이전트 토글에서 켜고 끕니다.",
            width: 1440,
            height: 2000,
          },
        ],
      },
      {
        heading: "학생이 쓰는 AI 튜터",
        body: "AI 튜터는 학생이 코스 안에서 모르는 내용을 바로 묻는 기능입니다. 답은 그 코스의 수업 자료와 수업 내용을 바탕으로 나옵니다. 한국 계정에서는 AgentIn에서 학원 기준으로 튜닝한 에이전트로 제공되며, 어떤 자료를 근거로 답할지는 에이전트 설정을 따릅니다. 일반 검색과 다른 점이 여기 있지만, 코스 자료에 없는 내용을 물으면 답이 틀리기도 합니다.",
        steps: [
          "경로: 코스 > 좌측 사이드바 > [AI 튜터]",
          "질문은 '오늘 수업의 이차함수 꼭짓점 구하는 법을 다시 설명해 줘'처럼 짧고 구체적으로 묻게 합니다.",
          "답을 받은 뒤 이해가 안 되는 부분은 이어서 다시 묻게 합니다.",
          "학생들이 어디서 막혔는지 수업 때 물어보고, 자주 나오는 질문은 다음 수업 설명에 넣습니다.",
          "학생에게는 이렇게 보내면 됩니다. “코스에 들어가 왼쪽 [AI 튜터] 탭에서 모르는 부분을 물어보세요. 답은 우리 수업 자료를 바탕으로 나오지만 틀릴 때도 있으니, 이상하면 선생님께 다시 확인해 주세요.”",
        ],
      },
      {
        heading: "학생이 쓰는 AI 평가",
        body: "AI 평가는 학생 본인의 성적을 포함한 학습 결과와 그에 맞는 피드백을 보여 줍니다. 부족한 단원을 찾아 복습 순서를 정할 때 쓰기 좋습니다.",
        steps: [
          "경로: 코스 > 좌측 사이드바 > [AI 평가]",
          "점수만 보지 말고, 피드백에서 짚은 부족한 부분을 녹화 다시보기나 숙제로 이어 가게 합니다.",
          "상담 전에 학생이 본 AI 평가 내용을 함께 보면 보완 과제를 정하기 쉽습니다.",
          "학부모 상담에서는 AI 평가를 그대로 넘기지 말고, 강사가 수업에서 본 모습과 함께 요약해 전합니다.",
        ],
      },
      {
        heading: "강사가 쓰는 AI 기능",
        body: "강사용 AI는 활동을 만들고 채점하는 화면 안에 들어 있습니다. 따로 AI 메뉴를 찾기보다 숙제·시험·어학 활동을 만들 때 그 화면의 AI 버튼을 쓰면 됩니다. 활동 종류와 기관 설정에 따라 보이는 버튼이 다릅니다.",
        steps: [
          "숙제를 만들 때 [AI로 숙제 작성]으로 초안을 받거나 써 둔 내용을 다듬습니다.",
          "숙제를 AI가 채점하게 하려면 [새로 만들기] > [숙제]에서 내용을 쓰고, [답안 추가]에 AI가 참고할 모범 답안을 넣습니다. [답안 추가됨]으로 바뀌면 학생이 제출할 때 자동으로 평가가 시작되고 잠시 뒤 결과가 나옵니다. 사진으로 찍어 낸 쓰기 과제도 이렇게 채점합니다.",
          "AI 채점 결과는 학생과 강사가 모두 봅니다. 점수는 강사가 확인한 뒤 확정합니다.",
          "시험을 만들 때 [AI 출제]에 주제, 난이도, 문제 유형을 넣어 문항을 생성하고, 쓸 문항만 [적용 및 편집]으로 시험지에 넣습니다.",
          "받아쓰기 같은 어학 활동은 [새로 만들기] > [받아쓰기]처럼 따로 만들고, 영어와 중국어를 지원합니다. 연습 문장은 [AI로 스마트 추가]에 난이도, 연령대, 주제를 넣어 만듭니다.",
          "실시간 수업은 끝난 뒤 AI 분석과 요약을 지원합니다. 제공 범위는 기관 설정과 계약에 따라 다릅니다.",
          "AI 강의 분석 결과가 중국어로 나오면 상담 채널로 문의해 한국어로 보는 방법을 안내받으세요.",
        ],
      },
      {
        heading: "수업 중에 문제를 내는 AI 칠판",
        body: "AI 칠판은 수업 중에 바로 문제를 내고 AI가 채점과 학습 진단까지 이어 주는 도구입니다. 6.0.8 업데이트에서 생겼고 기본으로 꺼져 있습니다. 쓰려면 담당 매니저에게 활성화를 요청하고, 교사와 학생 모두 6.0.8 이상으로 업데이트해야 합니다.",
        steps: [
          "문제는 텍스트로 쓰거나, 판서를 캡처하거나, 음성으로 입력해 냅니다.",
          "문제 유형은 주관식(국어·영어 같은 서술형), 객관식(O/X처럼 답이 정해진 문항), 말하기(학생이 음성으로 답하는 어학 문항) 가운데 고릅니다.",
          "유형마다 기본 채점 AI 에이전트가 있어 바로 씁니다. 학원 채점 기준을 담은 커스텀 에이전트를 연동할 수도 있습니다. 우리 학원에서 쓸 수 있는지와 활성화는 담당 매니저에게 먼저 확인합니다.",
          "참고 답안을 넣어 두면 AI 채점이 더 정확해집니다.",
          "수업 중에는 반 전체의 답안 현황과 제출 진행률을 보고, 학생별 답안과 채점 결과를 열어 봅니다. 학생은 답을 내면 채점 결과를 바로 봅니다.",
          "반 전체 답안을 모은 학습 진단으로 어디를 다시 설명할지 정합니다.",
        ],
      },
      {
        heading: "학원 안에서 정해 둘 기준",
        body: "AI 기능은 강사 일을 덜어 주지만 학원의 판단을 대신하지는 않습니다. 어디까지 학생에게 맡기고 어디부터 강사가 확인할지 정해 두세요.",
        steps: [
          "성적에 들어가는 채점과 평가는 강사가 마지막에 확인합니다.",
          "AI 출제로 만든 문항은 학생에게 내기 전에 강사가 직접 풀어 보고 검수합니다.",
          "학생에게 AI를 써도 되는 곳과 안 되는 곳을 알려 줍니다. 개념 질문은 되고, 숙제 답을 통째로 받아 적는 것은 안 되는 식입니다.",
          "숙제를 AI에 통째로 맡기지 않도록 풀이 과정이나 본인 말로 쓴 설명을 제출 기준에 넣습니다.",
          "반복되는 질문과 오답 유형은 커리큘럼을 고칠 때 근거로 씁니다.",
        ],
      },
    ],
    relatedSlugs: ["ai-features", "institution-settings", "lesson-activities", "course-grades"],
  },
  {
    slug: "admin-monitoring-analytics",
    category: "software",
    title: "관리자 모니터링과 통계 활용",
    description: "수업이 제대로 돌아가는지 보려면 진행 중인 수업에 직접 들어가 보고, 끝난 수업의 기록과 웹 라이브 시청 데이터를 살피고, 통계 파일을 내려받습니다. 원장·실장이 그 숫자를 운영에 옮기는 기준도 있습니다.",
    audience: "학원 관리자, 운영팀, 지점장, 교육 매니저",
    updatedAt: "2026-09-24",
    readMinutes: 7,
    tags: ["관리자", "모니터링", "통계", "웹 라이브", "학습 데이터"],
    keywords: ["수업 모니터링", "웹 라이브", "플레이백", "통계 데이터", "학습 보고서", "출결", "성적", "운영 데이터", "통계 다운로드", "수업 관리", "실제 수업 시간", "포인트 차감", "학생 리포트", "월간 리포트", "PDF 저장", "출석 체크", "오프라인 출석", "문의 방법"],
    chatbotSummary: "관리자는 대시보드에서 진행 중인 수업을 모니터링하고, 끝난 수업의 1분 단위 화면 기록·입퇴장 기록·녹화본·학습 보고서, 웹 라이브와 플레이백 시청 데이터, 기간별 통계 파일을 확인합니다. 목적은 강사 감시가 아니라 수업이 제대로 열렸는지, 기록이 빠짐없이 남았는지, 학부모 상담에 쓸 자료가 있는지 보는 것입니다. 학부모 자동 리포트나 정교한 학습 분석이 필요하면 별도 시스템 연동을 상담에서 확인합니다.",
    sections: [
      {
        heading: "관리자 데이터는 무엇을 확인하려고 보나",
        body: "모니터링과 통계는 강사를 감시하려는 기능이 아닙니다. 수업이 예정대로 열렸는지, 기록이 빠짐없이 남았는지, 상담에 쓸 자료가 있는지 확인하는 용도입니다.",
        steps: [
          "예정된 수업이 개설되고 제시간에 시작됐는지 봅니다.",
          "출결, 과제, 시험, 성적 기록이 빠지지 않고 쌓이는지 봅니다.",
          "강사별로 수업 운영이 얼마나 차이 나는지, 신규 강사가 적응하고 있는지 봅니다.",
          "학부모 상담에 쓸 참여도와 성취도 자료를 모읍니다.",
          "스토리지, 녹화, 웹 라이브 사용량을 보고 비용과 품질을 함께 관리합니다.",
        ],
      },
      {
        heading: "진행 중인 수업 들어가 보기",
        body: "관리자는 지금 진행 중인 수업에 관리자 권한으로 입장합니다. 이때 교사와 학생에게 관리자가 들어왔다는 알림은 가지 않습니다. 감시로 느껴지지 않도록 운영 목적과 범위를 강사와 학생에게 미리 알려 두세요.",
        steps: [
          "경로: 대시보드 > 관리자 기능 > [수업 모니터링]",
          "수업별로 교사와 학생이 출석했는지 확인합니다.",
          "학생이 '소리가 안 들려요', '입장이 안 돼요'라고 하면 그 학생의 접속 기기 정보를 열어 봅니다. 아직 입장하지 않은 것인지, 연결이 끊긴 것인지, 기기 권한 문제인지 가른 뒤 재입장, 마이크·카메라 권한 확인, 네트워크 점검 순서로 알려 줍니다.",
          "원인을 찾기 어려우면 상담 채널에 수업 이름(관리자 페이지에 보이는 그대로), 문제를 겪은 사용자 계정, 수업 시작 날짜와 시각을 함께 보내 주세요. 사용자 아이디가 없으면 확인이 어렵습니다.",
        ],
      },
      {
        heading: "끝난 수업의 기록 보기",
        body: "수업이 끝나면 기관 관리의 수업 관리에서 그 수업을 찾아 [조작] 버튼으로 기록을 엽니다. 수업 이름, 교사, 기간으로 검색합니다.",
        steps: [
          "경로: 대시보드 > 기관 관리 > 수업 관리 > [조작]",
          "수업 모니터링 데이터에는 1분마다 자동으로 저장된 수업 화면과 교사·학생의 입장·퇴장 기록이 있습니다.",
          "수업 녹화 데이터에서는 교사가 화면 녹화나 현장 녹화를 켠 수업의 녹화 원본을 보고 내려받습니다.",
          "학습 보고서에서는 교사의 강의 보고서와 학생의 학습 보고서를 보거나 링크를 복사해 전달합니다.",
          "실제 수업 시간은 반 전체가 아니라 사람마다 따로 계산됩니다. 30분 수업에 강사가 30분, 일찍 들어온 학생이 40분 있었다면 강사는 30분, 학생은 40분으로 남습니다.",
        ],
      },
      {
        heading: "웹 라이브와 플레이백",
        body: "웹 라이브는 수업을 웹 링크로 생중계하는 기능이라, 시청자는 앱을 설치하지 않고 링크로 들어옵니다. 학부모 설명회나 공개 수업처럼 한 방향으로 전달하는 자리에 맞습니다. 플레이백을 켜 두면 수업이 끝난 뒤 같은 링크로 다시보기가 됩니다.",
        steps: [
          "경로: 대시보드 > [라이브&플레이백] > [웹 페이지 링크]",
          "수업마다 웹 참여 링크를 복사해 재원생이나 외부 참여자에게 보냅니다.",
          "로그인 요구, 시청 비밀번호, 좋아요·채팅 권한, 라이브 커버와 소개글은 [라이브&플레이백]의 세부 설정에서 정합니다. 비밀번호를 걸었다면 링크와 함께 꼭 보내 주세요.",
          "송출은 교사가 교실에서 [수업 녹화]를 누르는 순간 시작됩니다. 그 전에 자료와 카메라를 준비해 두라고 강사에게 알려 주세요.",
          "경로: [라이브&플레이백] > [오퍼레이션] > [관리]",
          "수업이 끝난 뒤 위 경로에서 시청자 수, 좋아요 수 같은 시청 데이터를 봅니다.",
          "플레이백은 결석 보강, 강사 피드백, 상담 자료로 씁니다.",
        ],
      },
      {
        heading: "기간별 통계 내려받기",
        body: "월말 보고나 기록 보관용으로 기간별 수업 기록이 필요하면 통계 파일을 내려받습니다.",
        steps: [
          "경로: 대시보드 > 결제 > [통계 다운로드]",
          "기간을 정하면 수업 횟수, 스토리지 소비 현황 같은 통계를 Excel 파일로 받습니다. 파일에서 수업일자, 수업 지속 시간, 담당 교사, 출석 학생 인원을 행 단위로 봅니다.",
          "충전제를 쓰는 학원은 결제 메뉴의 [주문 세부정보]에서 조건 검색으로 기간 내 포인트 차감 내역을 보고 다음 충전 시점을 미리 잡습니다. 이 내역을 정산 자료로 바로 쓰지는 말고, 정확한 금액은 회계 자료와 맞춰 보거나 상담으로 확인합니다.",
          "내려받은 파일에는 학생 정보가 들어 있습니다. 권한 있는 담당자만 보관·공유하고, 밖으로 보낼 때는 이름과 연락처를 가립니다.",
        ],
      },
      {
        heading: "매주 한 번 볼 것",
        body: "매주 같은 요일에 같은 순서로 보면 문제를 늦게 발견하는 일이 줄어듭니다.",
        steps: [
          "이번 주 예정 수업이 모두 개설돼 있는지 봅니다.",
          "교사·학생 계정에 권한 문제가 없는지 봅니다.",
          "지난주 수업의 녹화와 자료 업로드가 끝까지 됐는지 봅니다.",
          "과제와 시험 마감이 학사 일정과 맞는지 봅니다.",
          "스토리지 사용량을 봅니다. 녹화본과 스크린샷 같은 수업 리소스도 스토리지 용량에 들어갑니다. 남길 수업은 보호 잠금을 걸고, 나머지는 자동 삭제 기간을 정해 둡니다. 용량과 비용 기준은 상담에서 확인합니다.",
        ],
      },
      {
        heading: "학습 데이터를 읽을 때",
        body: "점수 하나만 보면 판단이 틀어집니다. 같은 숫자도 기간과 기준이 다르면 다르게 읽히니, 학원 안에서 읽는 기준을 하나로 맞춰 두세요.",
        steps: [
          "출석과 지각·결석 패턴, 과제를 제때 냈는지, 점수가 어떻게 바뀌어 왔는지를 함께 봅니다.",
          "시험은 문제별 정답률과 선지별 선택률로 반 전체가 틀린 문항을 찾습니다.",
          "기간을 맞춰 비교합니다. 주 단위면 주끼리, 월 단위면 월끼리 봐야 추세가 보입니다.",
          "한 주 수치보다 3주 이상 이어지는 방향을 믿습니다. 시험 기간이나 방학이 낀 기간은 따로 표시해 둡니다.",
          "출석 학생 수는 참여 신호일 뿐 학습 성취가 아닙니다. 성취는 과제와 성적으로 봅니다.",
          "상담 전에는 학생별 요약을 만들어 학부모가 알아듣는 말로 바꿔 둡니다.",
          "학생별 월간 리포트가 필요하면 코스의 과정 화면 위쪽 [성적] > [학습 활동]에서 학생을 고르고, 학생 성적 화면 오른쪽 위의 [링크 복사]로 주소를 복사해 브라우저에서 연 뒤 [인쇄] > [PDF로 저장]을 누릅니다. 정해진 주기에 자동으로 만들어 주지는 않으니 매월 말에 저장해 둡니다.",
          "오프라인 출석 체크 기능은 없습니다. 현장 출석은 쓰시던 시스템으로 관리하고, 정교한 학습 리포트가 필요하면 별도 시스템 연동을 상담에서 확인합니다.",
        ],
      },
      {
        heading: "숫자를 보고 이렇게 움직입니다",
        body: "지표는 확인에서 끝나면 의미가 없습니다. 예를 들면 이렇습니다.",
        steps: [
          "한 반의 과제 제출률이 낮으면 안내 문구, 마감 시간, 과제 난이도를 차례로 바꿔 봅니다.",
          "신규 강사 수업의 참여 지표가 낮으면 수업 도구 교육을 다시 잡습니다.",
          "결석이 잦은 학생은 플레이백을 봤는지, 보강 과제를 냈는지 함께 봅니다.",
          "지점별 수업 차이가 크면 잘된 수업의 녹화와 교안을 다른 지점에 공유합니다.",
        ],
      },
    ],
    relatedSlugs: ["class-monitoring", "statistics-data", "web-live-playback", "storage-management"],
  },
  {
    slug: "hardware-spec-installation-faq",
    category: "hardware",
    docType: "faq",
    productArea: "hardware",
    title: "ClassIn Board S시리즈 사양 & 설치 환경 FAQ",
    description: "S65, S75, S86, S110 가운데 어느 모델이 맞을까, 벽걸이로 걸까 스탠드로 세울까. 원장과 설치 담당자의 이런 질문에 모델별 주요 사양과 OPS, 벽체·동선·전원 조건, 설치 뒤 관리, A/S 접수 순서로 답합니다.",
    audience: "학원/학교 관리자, 설치 담당자, IT 구매 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 5,
    featured: true,
    tags: ["전자칠판", "S시리즈", "설치조건", "OPS사양", "AS보증"],
    keywords: [
      "전자칠판 사양",
      "전자칠판 S시리즈 설치 조건",
      "S시리즈 설치 조건",
      "S시리즈 설치",
      "OPS 스펙",
      "OPS 스펙이랑 벽체 보강",
      "벽체 보강",
      "전자칠판 무상 AS 보증기간",
      "AS 보증기간",
      "S65",
      "S75",
      "S86",
      "S110",
      "스탠드 설치",
      "매립 설치",
      "벽걸이 설치",
      "스탠드형",
      "이동식 스탠드",
      "설치 유형",
      "A/S 신청",
      "AS 접수",
      "고장 접수",
      "시리얼 번호",
      "칠판 멈춤",
    ],
    chatbotSummary: "ClassIn Board S시리즈는 제품 페이지 기준 S65, S75, S86, S110이 있고 화면은 65·75·86·110인치이며(98인치 S98 Pro는 '모델별 스펙과 선택 가이드'에서 다룹니다), 모두 4K(3840×2160) 해상도와 50점 적외선 터치를 씁니다. 탈착식 Intel Core OPS 모듈이 기본으로 들어 있어 외장 PC 없이 윈도우 환경에서 수업하며, OPS 사양은 모델마다 달라 스펙 표에서 확인합니다. 벽걸이로 설치하면 전용 브래킷과 벽체 보강(석고보드는 합판 보강)이 필요하고, Type-C 케이블은 1.5m 이내 제품을 씁니다. 무상 A/S 보증 기간은 구입일 기준 기본 1년(프로모션 적용 시 최대 2년)이며, 이 기간에는 출장 점검을 받습니다.",
    sections: [
      {
        heading: "모델별 주요 사양",
        body: "교실 규모에 맞춰 고릅니다. 제품 페이지 기준으로 S65는 소규모 공부방·교습소, S75는 10명 이하 교실, S86은 10명 이상 교실, S110은 대형 강의실·강당에 맞춥니다. 치수·무게·OPS의 규격서 값은 '모델별 스펙과 선택 가이드'와 제품 페이지 스펙 표에 있으니, 견적 전에 한 번 더 맞춰 보세요.",
        steps: [
          "모든 모델이 4K(3840×2160) 해상도와 50점 적외선 터치입니다. 주사율은 S110이 120Hz, 나머지는 60Hz입니다.",
          "화면은 풀 라미네이션 패널에 AG 방현·AF 지문방지 코팅 강화유리를 씁니다.",
          "OPS는 보드에 꽂는 탈착식 Intel Core PC 모듈로, 기본으로 들어 있어 외장 PC 없이 윈도우 환경에서 수업합니다. 보드 자체의 내장 시스템은 Android이고, 윈도우 환경은 OPS가 맡습니다.",
          "OPS 사양은 모델마다 다릅니다. 규격서 기준으로 S75·S86은 Intel Core i5-13420H·16GB·256GB SSD, S110은 i5-12400·8GB·256GB SSD입니다. S65와 최신 공급 사양은 견적 때 스펙 표로 확인합니다.",
        ],
      },
      {
        heading: "설치 방식과 현장 조건",
        body: "설치 방식은 벽걸이, 이동형 스탠드, 벽 안에 넣는 매립 세 가지입니다. 방식에 따라 필요한 인력과 비용이 달라지니 견적 전에 정해 두세요.",
        steps: [
          "벽걸이는 벽이나 기존 칠판 위에 브래킷을 고정해 겁니다. 콘크리트 벽면은 직결 앵커로 고정하고, 석고보드 벽면은 최소 15mm 이상 합판 보강 작업이 필요합니다.",
          "이동형 스탠드는 설치와 이동이 쉽지만 다리가 보드 앞 공간을 차지해 학생과 강사 동선이 좁아집니다. 바닥 수평과 이동 동선의 문폭(최소 90cm 이상)을 미리 봅니다.",
          "매립 설치는 인테리어 단계부터 맞춰야 합니다. 완성도는 높지만 설치와 A/S가 까다로워집니다.",
          "보드는 무겁고 유리 패널이라 여러 명이 함께 옮깁니다. 순중량은 S75 54kg, S86 69.5kg, S110 137kg입니다. 배송 전에는 포장된 보드가 출입문, 엘리베이터, 복도, 계단을 지나갈 수 있는지 확인합니다.",
          "전원은 제품 라벨의 전원 규격에 맞는 접지 3구 콘센트(국내 220V)를 쓰고, 멀티탭을 쓸 때는 정격 용량을 확인합니다.",
          "Type-C로 기기를 연결할 때는 1.5m 이내의 규격이 확실한 케이블을 씁니다.",
        ],
      },
      {
        heading: "설치한 뒤 관리",
        body: "설치 뒤에도 놓인 환경과 평소 관리에 따라 화면, 터치, OPS 상태가 달라집니다. 아래 네 가지는 운영팀과 공유해 두세요.",
        steps: [
          "작동 환경은 온도 0~40℃, 습도 80%RH 이하입니다. 열이 빠지도록 보드 뒷면과 통풍구 주변을 비워 둡니다.",
          "적외선 터치 방식이라 화면 테두리(베젤)에 먼지나 이물질이 끼면 터치가 튑니다. 테두리를 주기적으로 닦아 주세요.",
          "화면을 닦을 때는 전원을 끄고 플러그를 뽑은 뒤, 물을 아주 조금 묻힌 부드러운 반건조 천으로 가볍게 닦습니다. 알코올, 휘발유, 산·알칼리 세제, 시너는 코팅을 상하게 하니 쓰지 않습니다.",
          "OPS 모듈을 빼거나 바꿀 때는 반드시 전원을 먼저 끕니다.",
        ],
      },
      {
        heading: "고장이 의심될 때와 A/S 보증",
        body: "정품 ClassIn Board는 출장 점검을 지원합니다. 증상이 보이면 아래 순서로 접수하세요.",
        steps: [
          "타는 냄새, 이상한 소리, 액체가 들어간 흔적이 있으면 다시 켜 보지 말고 전원을 끈 뒤 플러그를 뽑고 바로 연락합니다.",
          "그 밖의 증상은 전원을 껐다 켜고 케이블 연결을 확인한 뒤, 고객센터나 채널톡으로 접수합니다.",
          "접수할 때 기관명, 구매일, 증상이 처음 나타난 날, 시리얼 번호를 함께 보냅니다. 시리얼 번호는 보드 오른쪽 전원 버튼을 누른 뒤 [Setting] > [about]에서 봅니다.",
          "전원 버튼을 눌렀을 때 메뉴가 뜨고 터치가 되는지, 오른쪽 버튼의 [Note]로 필기가 되는지 찍은 짧은 영상을 함께 보내 주세요.",
          "무상 보증 기간은 구입일 기준 기본 1년(프로모션 적용 시 최대 2년)이며, 이 기간에는 무상 출장 점검을 받습니다.",
        ],
      },
      {
        heading: "다음에 볼 문서",
        body: "이 FAQ는 도입 검토용 요약입니다. 견적, 설치, 운영 단계로 넘어가면 아래 문서를 이어서 보세요.",
        steps: [
          "모델별 치수·터치·OPS 상세 사양은 '모델별 스펙과 선택 가이드'에 규격서 기준으로 있습니다.",
          "설치 전 공간, 전원, 네트워크, 반입 동선 점검은 '설치 전 준비 체크리스트'를 따라갑니다.",
          "전원·접지, 이동, 화면 보호 같은 안전 수칙은 'ClassIn Board S 시리즈 안전 사용 기본 지침'에 있습니다.",
          "설치 뒤 처음 켤 때의 버튼 위치와 기본 조작은 '전자칠판 기본 사용 설명서'를 봅니다.",
        ],
      },
    ],
    relatedSlugs: ["board-lineup-specs", "board-install-readiness", "board-s-series-safe-use", "board-overview"],
  },
  {
    slug: "software-pricing-quote-bundle-faq",
    category: "software",
    docType: "faq",
    productArea: "software",
    title: "ClassIn 소프트웨어 요금제 & 전자칠판 결합 견적 FAQ",
    description: "Pro·비즈니스·Enterprise 소프트웨어 요금제가 각각 누구에게 맞는지, 요금제 표의 용어는 무슨 뜻인지 풀어 봅니다. 전자칠판과 함께 견적을 받으려는 원장·구매 담당자라면 무료 체험과 견적 요청, 결제 뒤에 할 일까지 이어서 확인하면 됩니다.",
    audience: "학원 원장, 교장, IT 구매 담당자, 운영 관리자",
    updatedAt: "2026-09-24",
    readMinutes: 5,
    featured: true,
    tags: ["요금제", "Pro요금제", "Enterprise", "번들할인", "견적서"],
    keywords: [
      "소프트웨어 가격",
      "소프트웨어 Pro 요금제",
      "소프트웨어 Pro 요금제랑 Enterprise 차이",
      "Pro 요금제",
      "Enterprise 요금제",
      "전자칠판 결합 할인",
      "결합 할인",
      "전자칠판 결합 할인 패키지",
      "견적서 발급",
      "데모 신청",
      "동시접속",
      "계정 인증",
      "수업 참여자",
      "온스테이지 인원",
      "학생 청강",
      "요금제 용어",
      "견적 항목",
      "견적 구성",
      "가격",
      "비용",
    ],
    chatbotSummary: "클래스인 소프트웨어 요금제는 학원 규모와 운영 방식에 따라 고릅니다. 공식 안내 기준으로 Pro 요금제는 1인 강사용이고, 강사가 두 명 이상인 학원은 비즈니스 요금제를 권합니다. Enterprise는 대형 기관과 전자칠판을 함께 들이는 기관을 위한 맞춤 계약으로, 전담 매니저의 구축 지원과 하드웨어·설치 연계가 들어가고 가격은 맞춤 견적으로 정합니다. 할인이나 금액은 교실 수와 인원을 알려 주시면 견적으로 알려 드리고, 2주 무료 체험과 견적 요청은 문의 페이지(/contact)에서 합니다. 화면에 보이는 가격과 결제 항목은 체크아웃과 상담 단계에서 최종 확인됩니다.",
    sections: [
      {
        heading: "Pro와 Enterprise, 무엇이 다른가",
        body: "요금제는 학원 규모와 운영 방식에 따라 고릅니다. 결제 방식은 구독형(Learning Space)과 충전형(Business) 두 가지이고, 학원에 맞는 방식과 조건은 상담에서 안내해 드립니다.",
        steps: [
          "Pro 요금제는 혼자 가르치는 1인 강사에게 맞고, 강사가 두 명 이상인 학원은 비즈니스 요금제를 권합니다. Pro로 시작해도 나중에 비즈니스로 바꿀 수 있습니다.",
          "Enterprise는 대형 기관과 전자칠판을 함께 들이는 기관을 위한 맞춤 계약입니다. 전담 매니저의 구축 지원, 하드웨어·설치 연계, 보안·권한 맞춤 설정이 들어가고, 가격은 맞춤 견적으로 정합니다.",
          "요금제마다 한 수업 인원, 온스테이지 인원 같은 한도가 다릅니다. 교실 수와 인원을 알려 주시면 맞는 요금제를 골라 드립니다.",
        ],
      },
      {
        heading: "전자칠판과 함께 도입할 때 견적",
        body: "전자칠판과 소프트웨어를 함께 들이면 한 견적으로 묶어 드립니다.",
        steps: [
          "견적은 전자칠판(OPS 기본 포함), 카메라·마이크, 스탠드나 벽걸이, 설치, 소프트웨어 라이선스, 온보딩 가운데 필요한 것을 묶어 만듭니다.",
          "할인이나 금액이 궁금하면 교실 수와 인원을 알려 주세요. 그 규모에 맞춰 견적으로 안내해 드립니다.",
        ],
      },
      {
        heading: "무료 체험과 견적 요청",
        body: "도입 전에 2주 무료 체험으로 먼저 써 보고 결정합니다.",
        steps: [
          "홈페이지 상단의 [도입 문의]나 소프트웨어 제품 페이지의 [무료 체험 시작]을 누르면 문의 페이지로 이어집니다. 무료 체험과 견적은 여기서 함께 요청합니다.",
          "문의 페이지(/contact)에 학원명, 이름, 연락처를 입력하고, 교실 수는 문의 내용에 적어 주세요.",
          "문의 페이지에 안내된 답변 평균 대기 시간은 2시간 이내입니다. 견적서는 상담에서 교실 수와 인원을 확인한 뒤 보내 드립니다.",
        ],
      },
      {
        heading: "요금제 표에 나오는 용어",
        body: "요금제를 비교하다 보면 수업 참여자, 온스테이지, 학생 청강이라는 말이 나옵니다. 인원 한도는 요금제마다 다를 수 있어 상담에서 확인합니다.",
        steps: [
          "수업 참여자는 한 수업에 들어올 수 있는 최대 학생 수입니다.",
          "온스테이지는 교실 위쪽 스테이지에 동시에 올라올 수 있는 최대 인원입니다. 스테이지 밖 학생은 수업을 보기만 하고, 마이크 송출이나 칠판 권한은 받지 못합니다.",
          "학생 청강은 코스에 없는 사용자에게 특정 수업만 임시로 들을 수 있게 권한을 주는 것입니다.",
        ],
      },
      {
        heading: "상담 전에 준비할 것",
        body: "아래 정보가 미리 정해져 있으면 견적과 답변이 빨리 나옵니다.",
        steps: [
          "강사 수, 동시에 열리는 수업 수, 예상 학생 수를 적어 둡니다. 요금제를 고르는 기준이 됩니다.",
          "학원명, 담당자 연락처, 교실 수를 준비합니다.",
          "메인 관리자 계정을 누구 명의로 할지 정합니다. 결제할 때 로그인한 계정이 그대로 학원의 메인 관리자 계정이 되므로, 개인 계정보다 학원 공용 운영 계정이 낫습니다.",
          "화면이나 안내 자료에 보이는 금액을 확정 금액으로 보지 않습니다. 가격과 결제 가능 항목은 체크아웃과 상담 단계에서 최종 확인됩니다.",
          "전자칠판을 함께 들인다면 벽체 재질, 전원 용량, 이동 동선도 상담 때 같이 봅니다.",
        ],
      },
      {
        heading: "결제한 다음에 할 일",
        body: "요금제를 정한 뒤에는 결제, 유료 전환, 계정 인증 순서로 이어집니다.",
        steps: [
          "소프트웨어 플랜은 체크아웃(/checkout)에서 확인합니다. 하드웨어와 대형 기관 도입은 전담 매니저가 견적과 구축 범위를 알려 드립니다.",
          "유료 전환 절차와 전환 전 체크리스트는 '유료 계정 전환' 문서에 있습니다.",
          "경로: 대시보드 > 계정 정보 > 인증 자료 > [편집]",
          "결제 후에는 위 경로에서 바로 계정 인증을 신청합니다. 유료로 바꿔도 인증 전에는 수업 녹화, 웹 라이브 같은 기능이 막혀 있습니다. 처리에 며칠이 걸리니 급하면 담당 매니저나 상담 채널에 빠른 처리를 요청하세요.",
          "급한 도입 상담은 문의 페이지의 카카오톡 채널로 바로 연결됩니다.",
          "전자칠판 모델별 사양과 설치 조건은 'ClassIn Board S시리즈 사양 & 설치 환경 FAQ'에 있습니다.",
        ],
      },
    ],
    relatedSlugs: ["billing-upgrade", "account-verification", "hardware-spec-installation-faq", "software-overview"],
  },
  {
    slug: "board-overview",
    category: "hardware",
    title: "Classin Board 기능과 구성",
    description: "Classin Board 한 대에는 무엇이 들어 있고, 일반 전자칠판과는 어디가 다를까요? 도입을 검토 중이거나 막 들여온 원장·실장과 강사가 먼저 알아 둘 것, 상담 전에 정해 두면 되는 것까지 봅니다.",
    audience: "도입을 검토하는 원장·실장, 강사, 설치 상담 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 4,
    featured: true,
    tags: ["하드웨어", "Classin Board", "전자칠판", "AI 카메라", "하이브리드 수업"],
    keywords: ["Classin Board", "클래스인 보드", "전자칠판", "하드웨어 기능", "판서", "AI 카메라", "OPS", "NFC", "하이브리드 수업", "무선 미러링", "윈도우 기반", "클라우드", "선 없는 연결", "HDMI 불필요", "Classin Board 구성", "일반 전자칠판 차이", "소프트웨어 내장", "칠판만 구매", "하드웨어 설명", "칠판 종류", "타사 전자칠판 비교"],
    chatbotSummary: "Classin Board는 4K 판서 화면, 50점 적외선 터치, 탈착식 Intel Core OPS 컴퓨터, 스피커를 한 대에 담은 수업용 전자칠판이고(8배열 마이크는 S75·S86·S98 Pro에 들어 있고, S110은 마이크 구성을 견적 때 정합니다), 클래스인 소프트웨어가 기본으로 들어 있어 PC·태블릿에서 한 작업과 실시간으로 이어집니다. OPS가 들어 있어 HDMI 선이나 외장 PC 없이 윈도우 환경에서 수업하고, 노트북·태블릿 화면은 무선 미러링으로 띄웁니다. 판서와 수업 영상은 클래스인 코스에 남아 복습·보강 자료가 되고, 출결·과제·성적 같은 LMS 기능과 이어집니다. AI 카메라와 마이크를 붙이면 교실 수업과 원격 수업을 함께 하는 하이브리드 수업도 합니다. 모델과 카메라·마이크 구성, 칠판만 따로 구매할 수 있는지와 가격은 상담 채널로 문의하면 하드웨어 담당자가 전화로 연락합니다.",
    sections: [
      {
        heading: "보드 한 대가 수업에서 맡는 일",
        body: "Classin Board는 화면을 크게 띄워 주는 모니터에서 끝나지 않습니다. 보드에 쓴 판서와 수업 영상이 클래스인 코스에 남고, 학생은 그걸로 복습합니다. 수업 한 번을 따라가 보면 이렇습니다.",
        steps: [
          "수업 중에는 강사가 보드에 판서하고, PDF나 이미지 자료를 띄워 그 위에 씁니다.",
          "교실 학생과 원격으로 듣는 학생이 같은 화면과 판서를 봅니다.",
          "수업이 끝나면 판서와 수업 영상이 복습 자료로 남습니다.",
          "원장·실장은 수업, 출결, 과제, 성적, 녹화 기록을 클래스인에서 확인합니다.",
        ],
      },
      {
        heading: "보드에 들어 있는 것",
        body: "화면과 터치, 컴퓨터, 소리, 소프트웨어가 한 대에 들어 있습니다. 모델별 수치는 '모델별 스펙과 선택 가이드'에 있습니다.",
        steps: [
          "화면은 4K 해상도에 시야각 178°입니다. AG 방현·AF 지문방지 코팅이라 교실 조명이 덜 비칩니다.",
          "판서는 50점 적외선 멀티터치로 합니다. 한 파일 안에서 최대 50페이지까지 이어 씁니다.",
          "보드 안에 탈착식 Intel Core OPS 컴퓨터가 있어서, 외장 PC 없이 보드만 켜면 윈도우에서 수업합니다.",
          "스피커는 전 모델에, 8배열 마이크는 S75·S86·S98 Pro에 들어 있습니다. 강사를 따라가며 찍는 AI 카메라는 교실과 수업 방식에 맞춰 함께 구성합니다.",
          "소프트웨어는 클래스인입니다. 판서, 수업 도구, 녹화, 과제, 출결이 강사 계정과 코스에 묶여 관리됩니다.",
        ],
        media: [
          {
            type: "image",
            src: `${HARDWARE_MEDIA_BASE}/hero/hero-board-angle.png`,
            alt: "이동형 스탠드에 올린 Classin Board를 비스듬히 본 모습",
            caption: "화면, 터치, 컴퓨터, 수업 소프트웨어가 보드 한 대에 들어 있습니다.",
            width: 1200,
            height: 900,
          },
        ],
      },
      {
        heading: "일반 전자칠판과 다른 점",
        body: "일반 전자칠판은 화면을 띄우고 판서하는 데서 끝나는 경우가 많습니다. Classin Board는 수업이 끝난 뒤가 다릅니다. 판서가 지워지지 않고 클래스인 코스로 넘어가 복습과 보강 자료가 됩니다.",
        steps: [
          "타이머, 객관식 퀴즈, 개인 칠판 같은 클래스인 수업 도구를 보드에서 바로 엽니다.",
          "카메라와 마이크를 붙이면 교실 수업을 원격 학생에게 동시에 보냅니다.",
          "수업 영상과 판서가 코스에 올라가, 결석한 학생도 같은 수업을 다시 봅니다.",
        ],
      },
      {
        heading: "외장 PC와 HDMI 선 없이 켜서 씁니다",
        body: "보드 안에 컴퓨터가 들어 있어서, 전원과 네트워크만 연결되면 보드 하나로 수업을 시작합니다.",
        steps: [
          "탈착식 Intel Core OPS 컴퓨터가 보드에 끼워져 있습니다. HDMI 선이나 외장 PC를 연결하지 않아도 수업 화면이 켜집니다.",
          "보드에는 안드로이드 시스템도 있지만, 수업은 OPS의 윈도우 환경에서 합니다. PC에서 쓰던 프로그램과 수업 파일을 그대로 엽니다.",
          "노트북, 태블릿, 스마트폰 화면은 무선 미러링으로 선 없이 보드에 띄웁니다.",
          "수업 자료와 녹화는 클라우드에 저장됩니다. 다른 교실 보드에서 로그인해도 같은 자료가 열립니다.",
          "외부 노트북을 꼭 연결해야 할 때는 HDMI 입력도 씁니다. 방법은 '전자칠판 기본 사용 설명서'에 있습니다.",
        ],
      },
      {
        heading: "소프트웨어가 들어 있나요, 칠판만 살 수 있나요",
        body: "클래스인은 소프트웨어와 전자칠판을 모두 판매합니다. Classin Board에는 클래스인 소프트웨어가 기본으로 들어 있어, PC나 태블릿에서 만든 자료와 수업이 보드와 실시간으로 이어집니다. 칠판만 따로 구매할 수 있는지, 가격이 어떻게 되는지는 공급 조건에 따라 달라 상담 채널로 문의해 주세요. 하드웨어 상담은 문의를 남기면 전화로 이어집니다.",
      },
      {
        heading: "상담 전에 정해 두면 좋은 것",
        body: "모델과 구성품은 교실 조건에 따라 달라집니다. 아래 다섯 가지를 미리 정리해 오시면 상담에서 모델과 구성을 바로 좁힙니다.",
        steps: [
          "교실 가로·세로 크기, 학생 수, 맨 뒷자리까지의 거리",
          "벽에 걸지, 이동형 스탠드에 올릴지",
          "원격으로 듣는 학생이 있는지, 수업을 녹화할지. 카메라와 마이크 구성이 여기서 갈립니다.",
          "교실에 유선 인터넷을 끌어올 수 있는지",
          "설치 뒤 강사 교육을 언제 받을지, A/S는 누가 접수할지",
        ],
      },
    ],
    resources: [
      {
        label: "Classin Board 제품 소개",
        href: "/product/hw",
        description: "제품 페이지에 라인업 사진과 도입 흐름이 있습니다.",
      },
    ],
    relatedSlugs: ["board-lineup-specs", "board-basic-operation", "board-install-readiness", "board-writing-touch", "board-ai-camera-mic", "board-s-series-safe-use"],
  },
  {
    slug: "board-basic-operation",
    category: "hardware",
    title: "전자칠판 기본 사용 설명서 (버튼·제스처·미러링·HDMI)",
    description: "강사가 보드를 처음 켜는 날, 실장이 설치 뒤 인수인계를 받는 날 옆에 두고 따라 합니다. 버튼 위치, 손가락 제스처, 무선 미러링, HDMI 입력 전환을 차례로 익히고, 화면이나 터치가 이상할 때 어디부터 볼지도 알아 둡니다.",
    audience: "강사(신규 강사 포함), 학원 운영팀, 설치 후 인수인계 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 7,
    featured: true,
    tags: ["하드웨어", "전자칠판", "스마트 보드", "기본 사용법", "제스처", "미러링", "HDMI"],
    keywords: ["전자칠판 사용법", "스마트 보드 사용법", "전자칠판 켜는 법", "전자칠판 버튼 위치", "손가락 제스처", "한 손가락 필기", "두 손가락 스크롤", "네 손가락 펜툴", "무선 미러링", "화면 미러링", "노트북 연결", "HDMI 전환", "입력 소스 전환", "소스 변경", "전원 버튼", "OPS 전환", "화면이 안 나와요", "터치가 안 돼요", "터치 잠금", "작은 제어 화면", "다섯 손가락", "HDMI Touch", "퇴장 버튼", "교실 나가기", "수업 종료", "반에서 나가기", "수업 끝내기", "사용설명서", "매뉴얼", "설명서 다운로드", "전자칠판 교육", "조작법 영상", "화면 안 나옴", "검은 화면", "입력 전환", "A/S 신청", "AS 접수", "시리얼 번호"],
    chatbotSummary: "클래스인 전자칠판(Classin Board)의 전원·볼륨·입력(소스) 버튼은 화면을 정면으로 봤을 때 오른쪽 측면 하단에 있습니다. 판서 화면에서 한 손가락(한 점)은 필기·클릭, 두 손가락(두 점)은 스크롤, 네 손가락(네 점)은 펜 도구(UI) 호출, 다섯 손가락은 작은 제어 화면 열기입니다. 무선 미러링은 보드와 기기를 같은 네트워크에 연결한 뒤 보드의 미러링(화면 공유)을 열어 씁니다. 외부 노트북·PC는 HDMI 케이블로 연결하고 입력(소스) 버튼이나 소스 메뉴에서 HDMI를 고르며, 수업 화면으로 돌아올 때는 OPS를 고릅니다. 수업을 마칠 때는 하단 슬라이드 바를 올려 [슬라이드하여 수업 종료하기]를 누르고, [교실에서 나가기]는 수업을 유지한 채 강사만 나갑니다. 화면이 안 나오면 전원 플러그와 멀티탭, 전원 버튼, 대기 모드, 입력 소스 순서로 봅니다. A/S를 접수할 때는 고객사 이름, 구매일, 증상이 처음 생긴 날, 시리얼 번호([Setting] → [about])와 증상 영상을 보냅니다. 전자칠판 사용 매뉴얼은 상담 채널에서 받습니다. 버튼 이름과 제스처 동작은 모델·펌웨어에 따라 조금씩 다릅니다.",
    sections: [
      {
        heading: "버튼은 화면 오른쪽 사이드 하단에 있습니다",
        body: "보드를 켜고 끄거나 화면 입력을 바꿀 때는 측면 버튼이 가장 빠릅니다. 화면을 정면으로 봤을 때 오른쪽 측면 하단에 전원, 볼륨, 입력(소스) 버튼이 모여 있습니다.",
        steps: [
          "전원 버튼을 누르면 보드가 켜집니다. 켜진 상태에서 길게 누르면 종료됩니다.",
          "켜진 상태에서 전원 버튼을 짧게 누르면 모델과 펌웨어에 따라 대기 모드로 들어가거나 대형 화면 제어 메뉴가 열립니다.",
          "볼륨 버튼으로 수업 자료와 영상 소리를 맞춥니다.",
          "입력(소스/Source) 버튼은 내장 OPS(윈도우)와 외부 HDMI 입력을 오갈 때 누릅니다.",
          "화면 하단 가장자리를 쓸어 올리면 나오는 도구 막대(내비게이션 바)에서도 같은 조작을 합니다.",
        ],
      },
      {
        heading: "손가락 개수에 따라 동작이 다릅니다",
        body: "칠판(판서) 화면에서는 몇 손가락으로 누르느냐에 따라 동작이 나뉩니다. 펜을 쥔 채로 손가락으로 화면을 넘기고 도구를 불러오면 설명이 끊기지 않습니다.",
        steps: [
          "한 손가락(한 점)으로 글씨를 쓰고, 버튼이나 메뉴를 누릅니다.",
          "두 손가락(두 점)으로 끌면 판서 페이지나 자료가 위아래로 움직입니다.",
          "네 손가락(네 점)으로 누르면 화면 어디서든 펜·지우개 도구 모음(펜 도구 UI)이 뜹니다.",
          "다섯 손가락으로 누르면 작은 제어 화면(보조 조작 패널)이 열립니다. 멀리 있는 버튼을 누르기 어려울 때 씁니다.",
          "손바닥처럼 넓은 면이나 지우개로 문지르면 지워집니다.",
          "제스처가 엉뚱하게 먹히면 손이나 옷소매가 화면에 닿아 있지 않은지, 화면 테두리(베젤)에 먼지가 끼지 않았는지 봅니다.",
        ],
      },
      {
        heading: "터치 잠금, 눈 보호, 밝기는 제어 메뉴에서",
        body: "대형 화면 제어 메뉴에는 투영, 주석, 터치 잠금, 눈 보호, 입력 소스, 설정, 볼륨, 밝기, 화면 끄기, 재시작, 종료가 모여 있습니다. 수업 중에 자주 쓰는 건 아래 세 가지입니다. 전원·청소·이동 같은 안전 수칙은 'ClassIn Board S 시리즈 안전 사용 기본 지침'에 따로 있습니다.",
        steps: [
          "학생이 화면을 만지거나 화면을 잠깐 닦아야 하면 터치 잠금부터 켭니다.",
          "교실 조명과 학생 자리까지의 거리에 맞춰 눈 보호 모드, 밝기, 볼륨을 맞춥니다.",
          "쉬는 시간처럼 한동안 화면을 안 쓸 때는 화면 끄기를 누릅니다. 같은 화면을 오래 띄워 두면 잔상이 남기도 합니다.",
        ],
      },
      {
        heading: "무선 미러링으로 기기 화면 띄우기",
        body: "노트북, 태블릿, 스마트폰 화면을 선 없이 보드에 띄울 때 씁니다. 보드와 기기가 같은 Wi-Fi(네트워크)에 연결돼 있어야 화면이 넘어갑니다. 같은 네트워크를 쓰기 어려우면 보드가 안내하는 무선 핫스팟에 기기를 연결합니다.",
        steps: [
          "보드와 기기를 같은 Wi-Fi에 연결합니다.",
          "보드 홈 화면이나 도구 막대에서 미러링(화면 공유)을 엽니다.",
          "보드 화면에 뜬 연결 코드나 보드 이름을 확인합니다.",
          "노트북이나 스마트폰의 화면 미러링(캐스트) 메뉴에서 그 보드를 고르고, 코드를 물으면 입력합니다.",
          "기기 화면이 보드에 뜨면 그 위에 바로 판서해도 됩니다.",
          "클래스인 수업 중이라면 수업 도구의 [미러링]이나 [화면 공유]를 쓰세요. 그래야 원격 학생에게도 같은 화면이 갑니다.",
        ],
      },
      {
        heading: "HDMI 입력으로 전환하기",
        body: "외부 노트북이나 PC를 케이블로 연결할 때는 입력 소스를 HDMI로 바꿉니다. 다 쓰고 나면 OPS로 되돌려 두세요. HDMI로 둔 채 노트북만 뽑으면 신호가 없어 화면이 검게 보입니다.",
        steps: [
          "외부 기기와 보드의 HDMI 입력(IN) 포트를 HDMI 케이블로 연결합니다.",
          "오른쪽 측면 하단의 입력(소스) 버튼을 누르거나 화면의 소스 메뉴를 엽니다.",
          "연결한 HDMI 포트(HDMI1, HDMI2 등)를 고릅니다.",
          "외부 기기에서 터치까지 쓰려면 HDMI 신호 연결과 HDMI Touch 입력 연결이 둘 다 되어 있어야 합니다.",
          "소리가 안 나오면 외부 기기의 소리 출력 장치가 HDMI(전자칠판)로 잡혀 있는지 봅니다.",
          "다 쓰면 같은 메뉴에서 OPS(내장 PC)를 골라 수업 화면으로 돌아옵니다.",
        ],
      },
      {
        heading: "수업이 끝나면 교실에서 이렇게 나갑니다",
        body: "보드 수업 화면에는 퇴장 버튼이 따로 보이지 않습니다. 화면 하단 슬라이드 바를 위로 쓸어 올리면 나가는 버튼 두 개가 나오는데, 결과가 다르니 구분해서 누릅니다.",
        steps: [
          "[교실에서 나가기]는 강사만 나가는 버튼입니다. 수업은 계속 열려 있고 녹화는 멈춥니다.",
          "[슬라이드하여 수업 종료하기]는 수업을 끝내는 버튼입니다. 수업과 녹화가 끝나고 모두 교실에서 나갑니다.",
          "우측 상단 [x]를 누른 뒤 [수업 종료]를 눌러도 수업이 끝납니다.",
        ],
      },
      {
        heading: "화면이나 터치가 이상할 때 먼저 볼 것",
        body: "처음 쓸 때 문의가 많은 증상입니다. 케이블, 입력 소스, 화면 테두리에서 원인이 나오는 경우가 많습니다.",
        steps: [
          "화면이 안 나오면 전원 플러그와 멀티탭, 측면 전원 버튼, 대기 모드, 입력 소스(OPS/HDMI)를 이 순서로 봅니다.",
          "입력 소스가 회색이거나 선택되지 않으면 그 포트에 신호가 없는 상태입니다. 케이블, 외부 기기 전원, 꽂은 포트를 확인합니다.",
          "터치가 튀면 화면 테두리(베젤)에 먼지나 이물질이 끼지 않았는지 보고 닦아 줍니다. 적외선 터치라 테두리가 가려지면 인식이 흔들립니다.",
          "무선 키보드·마우스가 자주 끊기면 USB 수신기를 다른 포트로 옮기거나, USB 연장선으로 수신기를 앞으로 빼 줍니다.",
          "연기, 이상한 냄새, 액체 유입, 파손이 보이면 더 만지지 말고 전원을 끈 뒤 플러그를 뽑고 A/S에 연락합니다.",
        ],
      },
      {
        heading: "A/S를 접수할 때 보낼 것",
        body: "수업 중 화면이 가끔 멈추거나 터치가 안 되는 일이 반복되면 A/S로 접수합니다. 아래 내용을 같이 보내 주세요. 조치 방법은 접수 뒤 안내해 드리니, 보드를 직접 열거나 분해하지 않습니다.",
        steps: [
          "학원(고객사) 이름, 구매일, 증상이 처음 생긴 날을 적습니다.",
          "보드 시리얼 번호를 적습니다. 우측 전원 버튼을 누른 뒤 [Setting] → [about]에서 봅니다.",
          "전원 버튼을 눌렀을 때 메뉴가 뜨고 터치가 되는지, 우측 버튼 → [Note]로 필기가 되는지 찍은 영상을 함께 보냅니다.",
        ],
      },
      {
        heading: "설명서와 교육 영상이 더 필요하면",
        body: "버튼 이름과 제스처 동작은 모델과 펌웨어 버전에 따라 조금씩 다릅니다. 이 문서와 다르면 실제 기기에서 한 번 눌러 보고, 그래도 모르겠으면 설치 담당자에게 물어보세요. 전원 켜기, 편집 도구, 제스처, 로그인, 녹화, 파일 열기, 수업 종료를 담은 전자칠판 사용 매뉴얼은 상담 채널에 요청하면 보내 드립니다. 조작법을 강의 영상으로 보고 싶다면 상담 채널에 기관 교육 코스 초대를 요청하세요. 초대를 받으면 PC나 모바일에서 봅니다.",
      },
    ],
    resources: [
      {
        label: "클래스인 하드웨어 소개",
        href: "/product/hw",
        description: "제품 페이지에 보드 라인업과 도입 흐름이 있습니다.",
      },
    ],
    relatedSlugs: ["board-s-series-safe-use", "board-writing-touch", "board-overview", "board-ai-camera-mic"],
  },
  {
    slug: "board-lineup-specs",
    category: "hardware",
    title: "모델별 스펙과 선택 가이드",
    description: "S75·S86·S98 Pro·S110 가운데 어느 Classin Board가 우리 교실에 맞는지 비교합니다. 규격서 기준 치수, 화면·터치·OPS 사양, 설치 조건, 무상 A/S 기간을 모델별로 나란히 놓고 원장·실장과 설치 상담 담당자가 함께 고릅니다.",
    audience: "도입을 검토하는 원장·실장, 학원 관리자, 설치 상담 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    featured: true,
    tags: ["모델 선택", "스펙", "S75", "S86", "S98 Pro", "S110"],
    keywords: [
      "Classin Board S75",
      "Classin Board S86",
      "Classin Board S98 Pro",
      "Classin Board S110",
      "BS75A",
      "BS86C",
      "BSCP98A",
      "BS110A",
      "전자칠판 스펙",
      "전자칠판 크기",
      "화면 크기",
      "OPS",
      "스탠드",
      "벽걸이",
      "전자칠판 S시리즈 설치 조건",
      "S시리즈 설치 조건",
      "OPS 스펙",
      "벽체 보강",
      "전자칠판 무상 AS 보증기간",
      "전자칠판 무게",
      "소비전력",
      "사이즈",
      "크기",
      "가로세로",
      "인치",
      "몇 인치",
      "모델 종류",
      "라인업",
      "65인치",
      "98인치",
    ],
    chatbotSummary: "ClassIn Board 사양은 규격서로 확인한 S75(BS75A)·S86(BS86C)·S98 Pro(BSCP98A)·S110(BS110A) 기준으로 안내하며, 화면은 각각 75·86·98·110인치입니다. 네 모델 모두 4K(3840×2160) 해상도, 16:9 화면, 178° 시야각, 밝기 350cd/m² 이상, 수명 5만 시간 이상, 50점 적외선 터치, Android 11 내장 시스템, 탈착식 Intel Core OPS(S75·S86 i5-13420H, S98 Pro 13세대 고성능, S110 i5-12400), Wi-Fi ax·BT5.0, 2×15W 스피커를 갖춥니다. 10명 안팎 교실은 S75, 일반 강의실은 S86, 넓은 강의실은 S98 Pro, 강당처럼 가장 큰 공간은 S110을 먼저 봅니다. 벽걸이 설치 시 전용 브래킷과 벽체 보강(석고보드는 15mm 이상 합판 보강)이 필요하고, 무상 A/S는 구매일부터 기본 1년(프로모션 적용 시 최대 2년)이며 출장 점검을 받습니다. S65는 상담에서 사양과 공급 조건을 알려 드립니다.",
    sections: [
      {
        heading: "모델은 교실 크기와 학생 수로 고릅니다",
        body: "이 문서의 수치는 규격서로 확인한 S75, S86, S98 Pro, S110 기준입니다. 화면 크기 하나로 고르지 말고 학생 수, 맨 뒷자리까지의 거리, 교실 폭, 보드를 걸 벽, 교실 사이를 옮겨 쓸지까지 같이 봅니다.",
        steps: [
          "S75(BS75A, 75인치)는 10명 안팎의 교실이나 세미나실에 맞습니다.",
          "S86(BS86C, 86인치)은 10명이 넘는 일반 강의실에서 가장 먼저 검토하는 모델입니다.",
          "S98 Pro(BSCP98A, 98인치)는 넓은 강의실용입니다. 13세대 고성능 OPS가 들어가고 NFC를 지원합니다.",
          "S110(BS110A, 110인치)은 대형 강의실이나 강당처럼 가장 큰 공간용입니다. 화면 주사율이 120Hz이고 유리가 4mm로 가장 두껍습니다.",
          "65인치 S65도 있습니다. 작은 교실에 S65를 생각한다면 상담 때 사양과 공급 조건을 함께 알려 드립니다.",
        ],
      },
      {
        heading: "설치 조건과 무상 A/S",
        body: "모델을 정할 때 설치 조건도 같이 봅니다. 현장 점검 순서는 '설치 전 준비 체크리스트'에 따로 있습니다.",
        steps: [
          "벽걸이로 설치한다면 벽 재질부터 확인합니다. 콘크리트 벽은 앵커로 바로 고정하고, 석고보드 벽은 15mm 이상 합판으로 보강해야 합니다.",
          "이동형 스탠드를 쓴다면 바닥이 평평한지, 옮겨 다닐 길의 문 폭이 90cm 이상인지 봅니다.",
          "벽걸이 브래킷과 이동형 스탠드 중 무엇이 견적에 들어 있는지 확인합니다.",
          "무상 A/S는 구매일부터 기본 1년이고, 프로모션이 적용되면 최대 2년입니다. 이 기간에는 출장 점검을 받습니다.",
        ],
      },
      {
        heading: "모델별 크기와 화면 사양",
        body: "규격서 기준 수치입니다. 네 모델 모두 4K(3840×2160) 해상도, 16:9 화면, 178° 시야각, 밝기 350cd/m² 이상, 수명 5만 시간 이상입니다. 치수는 가로 × 세로(높이) × 두께 순서이고, 순중량은 스탠드와 포장을 뺀 본체 무게입니다.",
        steps: [
          "S75(BS75A, 75인치)는 본체 1,718.18 × 1,000.2 × 113.1mm, 순중량 54kg입니다. 60Hz, 명암비 4000:1, 3mm AG/AF 유리입니다.",
          "S86(BS86C, 86인치)은 본체 1,964.08 × 1,139.02 × 113.1mm, 순중량 69.5kg입니다. 60Hz, 명암비 4000:1, 3mm AG/AF 유리입니다.",
          "S98 Pro(BSCP98A, 98인치)는 본체 2,227.92 × 1,287.43 × 100.60mm, 순중량 89kg입니다. 60Hz, 명암비 6000:1, 3.2mm AG/AF 유리이고 NFC를 지원합니다.",
          "S110(BS110A, 110인치)은 본체 2,520.55 × 1,457.20 × 110.00mm, 순중량 137kg입니다. 120Hz, 명암비 1200:1, 4mm AG/AF 유리입니다.",
        ],
        media: [
          {
            type: "image",
            src: `${HARDWARE_MEDIA_BASE}/lineup/lineup-all-sizes.png`,
            alt: "화면 크기별 Classin Board를 이동형 스탠드에 나란히 세운 이미지",
            caption: "교실 크기와 맨 뒷자리까지의 거리에 따라 맞는 모델이 달라집니다.",
            width: 1440,
            height: 900,
          },
        ],
      },
      {
        heading: "터치와 입력 사양",
        body: "터치 사양은 네 모델이 같습니다.",
        steps: [
          "터치 포인트는 50점입니다. 강사와 학생 여러 명이 동시에 써도 됩니다.",
          "적외선(IR) 터치라 손가락이나 전용 펜처럼 빛이 통하지 않는 물체를 인식합니다.",
          "터치 응답 속도 2ms, 필기 높이 1mm, 터치 정밀도 ±1mm, 최소 인식 물체 1.5mm입니다.",
          "강화유리는 S75·S86이 3mm, S98 Pro가 3.2mm, S110이 4mm이고, 모두 AG 방현·AF 지문방지 처리가 되어 있습니다.",
          "측면 제스처바와 부속 구성은 세대에 따라 다를 수 있어, 견적서에 적힌 모델명으로 한 번 더 확인합니다.",
        ],
      },
      {
        heading: "내장 컴퓨터(OPS)·오디오·부속품",
        body: "보드 안의 윈도우 컴퓨터(OPS), 스피커, 마이크, 전력 사양입니다. OPS 구성은 모델마다 다르니 견적서의 모델명과 맞춰 보세요.",
        steps: [
          "S75·S86의 OPS는 탈착식 Intel Core i5-13420H, 16GB 메모리, 256GB SSD 구성이 기준입니다.",
          "S98 Pro는 13세대 고성능 OPS가 기준입니다.",
          "S110의 OPS는 12세대 i5-12400, 8GB 메모리, 256GB SSD 구성이 기준입니다.",
          "보드 자체 시스템은 네 모델 모두 Android 11(메모리 4GB, 저장 32GB)입니다. 수업은 OPS의 윈도우에서 합니다.",
          "무선은 Wi-Fi(ax) 2.4/5GHz와 블루투스 5.0이고, 스피커는 네 모델 모두 2.0채널 2×15W입니다.",
          "내장 마이크는 S75·S86·S98 Pro가 8배열(수음 거리 10m)입니다. S110은 규격서에 내장 마이크 항목이 없어, 마이크 구성을 견적 때 함께 정합니다.",
          "최대 소비전력은 S75 315W, S86 390W, S98 Pro 740W, S110 850W입니다.",
        ],
      },
      {
        heading: "모델을 정하기 전에 교실에서 볼 것",
        body: "모델을 확정하기 전에 실제 교실에 서서 확인합니다.",
        steps: [
          "맨 뒷자리에 앉아 판서 글씨와 도형이 잘 보일지 가늠합니다.",
          "문, 창문, 조명, 에어컨 위치가 설치와 시야를 가리지 않는지 봅니다.",
          "벽걸이라면 벽 재질과 보강이 필요한지 확인합니다.",
          "이동형 스탠드라면 옮겨 다닐 길과 보관할 자리를 정합니다.",
          "네트워크, 전원, 카메라 배선이 지나갈 길을 함께 봅니다.",
        ],
      },
    ],
    relatedSlugs: ["board-overview", "board-install-readiness", "board-writing-touch"],
  },
  {
    slug: "board-writing-touch",
    category: "hardware",
    title: "판서·터치·무한 캔버스 가이드",
    description: "보드로 수업하는 강사는 손과 펜으로 판서하고, 페이지를 넘기며 이어 쓰고, 수업이 끝나면 판서를 저장해 학생에게 넘깁니다. 터치가 튀거나 안 먹힐 때 먼저 볼 것도 있습니다.",
    audience: "강사, 도입 검토자, 시연 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    tags: ["판서", "터치", "멀티터치", "무한 캔버스", "PDF 저장"],
    keywords: ["전자칠판 판서", "50포인트 멀티터치", "저지연 터치", "무한 캔버스", "판서 PDF", "실시간 판서 동기화", "판서 저장/공유", "판서 저장", "edb", "터치 튐", "고스트 터치", "터치 오인식", "점이 찍혀요", "두 대 간격", "듀얼 칠판 간섭", "칠판 멈춤", "프리징", "터치 안 됨", "화면 멈춤", "확장형 판서 영역", "판서 공간 부족", "매직펜"],
    chatbotSummary: "Classin Board 판서는 네 모델 공통 50점 적외선 멀티터치(응답 2ms)로 손가락과 전용 펜을 인식하고, 한 파일에 최대 50페이지까지 이어 씁니다. 6.0.7부터는 판서 영역이 차면 마우스 우클릭으로 가로선을 표시하고 아래로 끌어 새 공간을 만드는 확장형 판서 영역과, 획이 1초 뒤 사라지는 매직펜이 기본으로 켜져 있습니다. 판서는 원격 학생에게도 실시간으로 보이고, 수업 중에는 [수업 도구] → [판서 저장/공유]에서 드라이브 저장이나 이미지(PNG) 저장을 고릅니다. 수업이 끝나면 판서 PDF와 수업 영상이 복습·보강 자료가 됩니다. 터치가 튀면 화면 테두리(베젤)의 먼지, 화면에 닿은 소매나 물건, 직사광선부터 확인합니다. 보드 두 대를 붙여 쓰다가 점이 여러 개 찍히는 고스트 터치가 생기면 한 대를 꺼서 원인을 좁히고, 두 대 간섭이면 15~20cm 이상 띄우거나 낮은 각도의 사선으로 놓습니다. 멈춤이나 터치 불량이 반복되면 증상 영상과 함께 A/S로 접수합니다.",
    sections: [
      {
        heading: "지우고 끝나는 칠판과 다른 점",
        body: "분필 칠판은 다음 문제로 넘어가려면 앞 풀이를 지워야 합니다. Classin Board에서는 판서가 페이지로 쌓이고, PDF나 이미지 교재 위에도 바로 씁니다. 원격으로 듣는 학생도 쓰는 과정을 실시간으로 봅니다. 수업이 끝나면 그 판서가 복습 자료이자 결석생 보강 자료가 됩니다. 판서를 남기지 않고 한 곳만 잠깐 짚을 때는 도구 모음의 매직펜을 씁니다. 쓴 획이 1초 뒤 사라져 기존 판서를 지우거나 가리지 않습니다. 6.0.7부터 기본으로 켜져 있습니다.",
      },
      {
        heading: "여러 명이 동시에 써도 됩니다",
        body: "네 모델 모두 50점 적외선 터치입니다. 강사와 학생 여러 명이 보드 앞에 나와 함께 써도 됩니다.",
        steps: [
          "터치 응답 속도는 2ms, 필기 높이는 1mm, 정밀도는 ±1mm입니다(규격서 기준).",
          "손가락과 전용 펜을 모두 인식합니다. 적외선 방식이라 빛을 가리는 물체는 무엇이든 터치로 잡히니, 쓸 때 소매나 팔이 화면에 닿지 않게 합니다.",
          "수업 전에 펜, 손가락, 지우개가 제대로 먹는지 한 번씩 써 봅니다.",
        ],
        media: [
          {
            type: "image",
            src: `${HARDWARE_MEDIA_BASE}/writing/writing-multitouch.jpg`,
            alt: "학생 여러 명이 눕혀 놓은 Classin Board에 동시에 마인드맵을 그리는 모습",
            caption: "50점 멀티터치라 여러 학생이 한 화면에 함께 씁니다.",
            width: 1440,
            height: 900,
          },
        ],
      },
      {
        heading: "손가락 개수별 동작",
        body: "칠판(판서) 화면에서는 손가락 개수로 동작이 나뉩니다. 버튼과 미러링 같은 기본 조작은 '전자칠판 기본 사용 설명서'에 있습니다.",
        steps: [
          "한 손가락(한 점)으로 쓰고, 버튼이나 메뉴를 누릅니다.",
          "두 손가락(두 점)으로 끌어 판서 페이지나 자료를 위아래로 옮깁니다.",
          "네 손가락(네 점)으로 누르면 펜·지우개 도구 모음(펜 도구 UI)이 뜹니다.",
          "손바닥처럼 넓은 면이나 지우개로 문지르면 지워집니다. 전체를 지울 때는 삭제 기능을 씁니다.",
          "제스처 동작은 모델과 펌웨어 버전에 따라 조금씩 달라, 수업 전에 실제 기기에서 한 번 해 봅니다.",
        ],
      },
      {
        heading: "페이지를 넘기며 이어 쓰기",
        body: "판서가 한 화면에서 끝나지 않습니다. 한 파일에 최대 50페이지까지 이어 쓰고, 앞 페이지로 돌아가 다시 짚어 줍니다. 풀이가 긴 수학·과학, 지문을 여러 번 짚는 국어 독해·논술 수업에서 차이가 큽니다.",
        steps: [
          "풀이를 지우지 않고 다음 페이지에서 이어 갑니다.",
          "판서 영역이 가득 차면 마우스 우클릭으로 가로선을 표시하고, 선을 아래로 끌어 새 판서 공간을 만듭니다. 선을 위로 끌면 이미 쓴 내용이 위로 올라갑니다. 6.0.7부터 기본으로 켜져 있어 따로 신청하지 않아도 되고, 최대 50페이지 제한은 그대로입니다.",
          "학생이 앞 풀이를 다시 물으면 그 페이지로 돌아가 보여 줍니다.",
          "판서를 미리 만들어 두려면 클래스인 왼쪽 메뉴의 [칠판]에서 작성하고 [수업 도구] → [판서 저장/공유]로 드라이브에 저장합니다.",
          "수업 중에는 [수업 도구] → [파일 열기]나 [클라우드 드라이브]로 미리 만든 판서(edb 파일)를 불러옵니다.",
        ],
        media: [
          {
            type: "image",
            src: `${HARDWARE_MEDIA_BASE}/features/feature-writing.webp`,
            alt: "보드 수업 화면 아래로 판서 페이지가 이어지는 모습을 표현한 이미지",
            caption: "한 파일 안에서 판서 페이지가 계속 이어집니다.",
            width: 1440,
            height: 900,
          },
        ],
      },
      {
        heading: "수업이 끝난 뒤 판서 넘기기",
        body: "판서는 수업이 끝난 뒤에 더 쓸모가 있습니다. 결석한 학생, 다시 봐야 하는 학생에게 그대로 넘기면 됩니다.",
        steps: [
          "수업 중 판서를 따로 저장하려면 [수업 도구] → [판서 저장/공유]를 누르고 [드라이브에 저장], [이미지 복사], [이미지 저장(PNG)] 중에서 고릅니다.",
          "수업이 끝나면 판서 PDF와 수업 영상이 코스에 올라갑니다. 녹화 설정에 따라 달라지니 첫 수업 때 제대로 올라갔는지 한 번 확인합니다.",
          "판서와 녹화 영상을 같이 주면 학생이 설명을 들으며 판서를 따라갑니다.",
          "자료 이름은 '반_날짜_단원'처럼 규칙을 정해 둡니다. 보강하거나 학부모 상담을 할 때 자료를 바로 찾습니다.",
          "학생에게는 이렇게 보내면 됩니다. '오늘 수업 판서와 영상을 클래스인 코스에 올렸어요. 복습할 때 영상을 보면서 판서를 같이 확인해 주세요.'",
        ],
      },
      {
        heading: "시연할 때 보여 줄 순서",
        body: "도입 상담이나 강사 교육에서는 설명보다 한 번 써 보이는 편이 빠릅니다.",
        steps: [
          "교재 PDF를 열고 그 위에 풀이를 씁니다.",
          "도형이나 수식이 들어간 문제를 풀며 확대와 이동을 보여 줍니다.",
          "학생 두세 명을 불러 동시에 쓰게 합니다.",
          "수업을 끝내고 판서가 저장·공유되는 화면까지 보여 줍니다.",
        ],
      },
      {
        heading: "터치가 튀거나 안 먹힐 때",
        body: "적외선 터치라 원인은 대개 화면 테두리(베젤)와 주변 빛에 있습니다. 고장으로 보기 전에 아래부터 확인하세요.",
        steps: [
          "손, 소매, 물건이 화면이나 테두리에 닿아 있지 않은지 봅니다.",
          "테두리에 먼지나 이물질이 끼면 터치가 튑니다. 주기적으로 닦아 줍니다.",
          "창문 햇빛이나 적외선을 내는 조명이 화면을 정면으로 비추면 인식이 흔들립니다. 블라인드를 내리거나 보드 각도를 바꿉니다.",
          "수업 중 잠깐 닦을 때는 터치 잠금을 먼저 켜고, 제대로 닦을 때는 전원을 끈 뒤 물을 아주 조금 묻힌 부드러운 반건조 천을 씁니다.",
          "다 확인했는데도 터치가 계속 이상하거나 수업 중 화면이 가끔 멈추면, 증상을 영상으로 찍어 A/S에 접수합니다. 접수할 때 보낼 내용은 '전자칠판 기본 사용 설명서'에 있습니다.",
        ],
      },
      {
        heading: "보드 두 대를 붙여 쓰다가 점이 찍히면",
        body: "보드 두 대를 가까이 붙여 쓰면 화면에 점이 여러 개 찍히는 터치 오인식(고스트 터치)이 드물게 생깁니다. 두 보드의 센서가 서로 간섭해서 생기는 현상이라, 교실과 설치 환경에 따라 붙여 써도 괜찮은 곳이 있습니다.",
        steps: [
          "먼저 한 대의 전원을 끄고, 남은 한 대에서도 같은 증상이 나는지 봅니다. 한 대만 켜도 계속되면 두 대 사이의 간섭이 아니니 A/S로 접수합니다.",
          "간섭이 맞다면 두 보드를 15~20cm 이상 띄우거나, 낮은 각도의 사선으로 놓습니다.",
        ],
      },
    ],
    relatedSlugs: ["board-basic-operation", "board-overview", "classroom-tools", "classin-607-update"],
  },
  {
    slug: "board-ai-camera-mic",
    category: "hardware",
    title: "AI 카메라와 마이크 사용 가이드",
    description: "원격 학생이 함께 듣거나 교실 수업을 녹화하는 반이라면, 강사와 운영팀은 AI 카메라와 마이크가 하는 일부터 확인합니다. 그다음 수업 전 5분 점검, 현장 녹화를 켜는 순서, 카메라 화면이 이상할 때 먼저 볼 곳으로 넘어갑니다.",
    audience: "강사, 하이브리드 수업 운영팀, 설치 상담 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 7,
    tags: ["AI 카메라", "마이크", "자동 추적", "하이브리드 수업", "녹화"],
    keywords: ["4K AI 카메라", "자동 강사 추적", "자동 줌", "8배열 마이크", "노이즈캔슬링", "수업 영상 자동 생성", "하이브리드 수업", "현장 녹화", "바로 녹화하기", "장비 테스트", "하울링", "칠판 일렁임", "Blocking zone", "네트워크 카메라", "녹화 끊김", "녹화 멈춤", "녹화 초반만", "영상 소리 녹화 안 됨", "녹화 다운로드", "녹화 화면 치우침", "가운데로 안 찍힘", "카메라 각도", "칠판 위치 변경", "학생 목소리 안 들려요"],
    chatbotSummary: "Classin Board와 함께 쓰는 AI 카메라는 강사를 자동으로 따라가며 클로즈업과 파노라마 화면을 만들고, 원격 학생 송출과 수업 녹화에 쓰입니다. 원격 학생이 있는 수업은 입장 전 장비 테스트에서 카메라·마이크·스피커 선택, 하울링, 네트워크를 확인합니다. 카메라가 찍는 교실 화면을 녹화하려면 수업 옵션에서 현장 녹화를 켜고, 교실에서 녹화할 카메라를 고른 뒤 [바로 녹화하기]를 누릅니다. 녹화 중 네트워크가 끊기면 녹화도 멈추고, 녹화 파일은 관리자 대시보드에서 내려받습니다. 카메라가 목록에 안 보이면 클래스인을 다시 실행하고, 녹화 화면에서 칠판이 일렁이면 보드 앞 전열기구를 치웁니다. 보드나 카메라 위치를 옮긴 뒤 화면이 한쪽으로 치우치면 카메라를 다시 설정해야 합니다. 넓은 교실은 천장형 마이크 ClassIn Mic DT2 Pro, 강사 추적은 ClassIn Cam T1, 발표 학생 촬영은 ClassIn Cam S1을 검토합니다.",
    sections: [
      {
        heading: "AI 카메라가 하는 일",
        body: "AI 카메라는 교실 앞을 오가며 설명하는 강사를 따라 찍습니다. 교실 학생과 원격 학생이 함께 듣는 하이브리드 수업에서는 원격 학생이 이 화면으로 수업을 보고, 녹화하면 그대로 복습 영상이 됩니다.",
        steps: [
          "강사를 자동으로 따라가 화면 가운데에 잡습니다.",
          "강사를 가깝게 잡는 클로즈업(트래킹) 화면과 교실 전체를 보여 주는 파노라마 화면을 함께 씁니다.",
        ],
        media: [
          {
            type: "image",
            src: `${HARDWARE_MEDIA_BASE}/camera/camera-dual-premium-blended.webp`,
            alt: "Classin AI 추적 카메라 두 대를 위아래로 놓은 제품 이미지",
            caption: "카메라 위치와 각도에 따라 원격 학생이 보는 화면과 녹화 영상이 달라집니다.",
            width: 1440,
            height: 900,
          },
        ],
      },
      {
        heading: "강사 목소리가 원격 학생에게 들리는지",
        body: "원격 학생은 강사 목소리로 수업을 따라갑니다. S75·S86·S98 Pro에는 8배열 마이크(수음 거리 10m)가 들어 있고, S110은 마이크 구성을 견적 때 함께 정합니다.",
        steps: [
          "강사가 주로 서는 자리에서 말해 보고, 원격 쪽에서 잘 들리는지 확인합니다.",
          "학생 발언까지 담아야 하면 교실 크기와 좌석 배치를 같이 봅니다. 교실이 넓으면 천장형 마이크를 검토합니다.",
          "에어컨, 복도 소음, 스피커 울림이 들어가는지 수업 전에 들어 봅니다.",
          "반대로 원격 학생 목소리가 안 들리면 그 학생이 온스테이지에 올라가 있는지, 강사나 조교가 마이크 권한을 줬는지 먼저 봅니다. 마이크 아이콘이 초록색이면 켜진 상태입니다.",
        ],
      },
      {
        heading: "원격 학생이 있는 수업, 시작 5분 전에",
        body: "교실에 들어가기 전 장비 테스트 화면에 카메라, 마이크, 스피커 선택이 한꺼번에 나옵니다. 여기서 확인하고 입장하세요.",
        steps: [
          "카메라가 실제로 쓸 교실 카메라로 선택돼 있는지 봅니다.",
          "마이크가 '사용 안 함'으로 되어 있으면 실제 쓸 마이크로 바꿉니다.",
          "강사가 서는 자리와 칠판이 카메라 화면 안에 들어오는지 봅니다.",
          "마이크와 스피커 소리가 겹쳐 하울링이 나지 않는지 들어 봅니다.",
          "네트워크가 끊기지 않고 안정적인지 확인합니다.",
          "수업 중에 장치를 바꿔야 하면 우측 상단 톱니바퀴(설정)에서 카메라와 마이크를 다시 고릅니다.",
        ],
      },
      {
        heading: "카메라 화면까지 녹화하려면 현장 녹화를 켭니다",
        body: "클래스인 녹화는 두 가지입니다. 'ClassIn 수업 녹화'는 칠판과 자료 화면을 중심으로 녹화하고, '현장 녹화'는 카메라가 찍는 실제 교실 모습이나 강사를 따라가는 화면을 따로 녹화합니다. 다시보기에서 둘을 골라 봅니다. 현장 녹화의 권장 사양은 CPU 6세대 Intel i5 이상, 상향 대역폭 3Mbps 이상입니다.",
        steps: [
          "코스에서 수업을 만들 때 수업 옵션의 녹화 설정에서 [현장 녹화]를 켭니다. 학생 카메라를 띄우지 않는 교실 수업이면 온스테이지 인원수를 1V0으로 둡니다.",
          "[교실 입장]으로 들어가면 현장 녹화 알림이 뜹니다. [확인]을 누릅니다.",
          "상단 톱니바퀴(설정)에서 녹화할 카메라를 고르고 [바로 녹화하기]를 누릅니다.",
          "보드에서는 하단 슬라이드바를 올려 캠코더 아이콘으로 녹화 상태를 봅니다. 아이콘이 초록색이면 녹화 중입니다.",
        ],
      },
      {
        heading: "녹화가 중간에 끊기거나 소리가 빠졌다면",
        body: "녹화는 수업 중 네트워크 상태를 그대로 따라갑니다. 녹화가 이상하면 네트워크와 앱 버전부터 봅니다.",
        steps: [
          "녹화 중 네트워크가 끊기면 녹화도 멈춥니다. 녹화가 처음 몇십 초만 되고 끊겼다면 그 시간에 교실 네트워크가 끊기지 않았는지 확인합니다.",
          "보드에서 재생한 영상 소리가 녹화에 들어가지 않으면 클래스인을 최신 버전으로 올리고 캐시 파일을 지운 뒤 다시 녹화해 봅니다. 캐시는 PC 앱 기준 왼쪽 아래 프로필 → [계정 및 설정] → [파일 전송]에서 지웁니다.",
          "그래도 같으면 수업 이름, 강사 계정, 수업 시작 시각을 적어 상담 채널로 문의합니다.",
        ],
      },
      {
        heading: "녹화 영상을 쓸 때 정해 둘 것",
        body: "수업 영상은 결석 보강, 복습, 강사 피드백, 학부모 상담에 씁니다. 쓰임새마다 보는 사람이 다르니 공유 범위부터 정합니다.",
        steps: [
          "영상 제목에서 수업명과 날짜가 구분되도록 규칙을 정합니다.",
          "학생에게 주는 복습 영상은 볼 수 있는 범위와 기간을 미리 알립니다.",
          "강사 피드백용 영상은 내부에서만 봅니다.",
          "녹화 영상과 판서 PDF를 같이 주면 학생이 판서를 보며 설명을 다시 듣습니다.",
          "녹화 파일은 관리자 대시보드에서 내려받고 공유합니다. 수업 녹화와 현장 녹화를 둘 다 켰다면 둘 다 받습니다.",
        ],
      },
      {
        heading: "카메라가 안 잡히거나 화면이 이상할 때",
        body: "T1·S1 같은 네트워크(랜) 카메라는 설치할 때 설치 담당자가 네트워크와 CMS(카메라 관리 프로그램)를 설정합니다. 수업 중에 문제가 생기면 아래부터 봅니다.",
        steps: [
          "클래스인 카메라 목록에 카메라가 안 보이면 클래스인을 완전히 종료했다가 다시 실행합니다.",
          "다시 켠 뒤 카메라 이름이 빈칸이 됐다면 이름을 한글 대신 영문으로 등록합니다. 'Classin Cam T1(클로즈업)' 대신 'Classin Cam T1(Close-Up)'처럼 씁니다.",
          "클래스인 설정에 T1·S1 회전·반전 버튼이 없는 것은 정상입니다. 방향은 CMS에서만 바꾸므로 설치 담당자에게 요청합니다.",
          "강사가 특정 자리에 서면 추적이 끊긴다면 그 자리가 추적 제외 영역(Blocking zone)인지 설치 담당자에게 확인합니다. 포스터나 복도 행인이 잡히지 않게 막아 두는 영역인데, 강사가 그 안에 들어가면 추적하지 않습니다.",
          "녹화나 라이브 화면에서만 칠판이 아지랑이처럼 일렁이면 보드 앞에 난로나 온풍기가 있는지 봅니다. 열기 때문에 생기는 현상이라 전열기구를 끄면 바로 사라집니다.",
          "보드나 카메라 위치를 옮긴 뒤 녹화 화면이 한쪽으로 치우치면 카메라 설정을 다시 맞춰야 합니다. 설치 담당자나 상담 채널에 요청하세요. 앵글을 고정해 찍는 교실은 파노라마(Panorama) 화면을 쓰면 가운데로 잡힙니다.",
          "RTSP 주소나 고정 IP를 바꾸는 현장이라면 바뀐 값을 설치 담당자에게 남겨 둡니다.",
        ],
      },
      {
        heading: "카메라·마이크를 새로 달았거나 바꿨다면",
        body: "수업에 쓰기 전에 실제 수업처럼 한 번 돌려 봅니다. 수업 직전 5분 점검과 달리 녹화 저장과 기록까지 확인합니다.",
        steps: [
          "카메라와 마이크가 클래스인에서 올바른 장치로 잡히는지 봅니다.",
          "카메라 앵글은 원장·실장이나 강사가 실제 화면을 보고, 그 자리에서 설치 담당자에게 고쳐 달라고 합니다.",
          "녹화할 반이면 테스트 수업을 끝낸 뒤 영상과 판서가 저장됐는지 확인합니다.",
          "네트워크 설정, 카메라 IP, CMS 설정을 바꾼 내용은 기록해 인수인계 자료로 남깁니다.",
          "첫 주 실제 수업에서 나온 문제를 모아 한 번 더 점검합니다.",
        ],
      },
      {
        heading: "카메라·마이크를 더 붙여야 할 때",
        body: "보드 기본 구성으로 소리나 화면이 부족한 넓은 교실, 토론 수업, 발표 수업은 전용 장비를 함께 봅니다. 구성과 설치 조건은 각 제품 가이드에 있습니다.",
        steps: [
          "넓은 교실이나 토론 수업처럼 보드 내장 마이크(8배열)로 부족하면 천장형 마이크 ClassIn Mic DT2 Pro로 보강합니다. 마이크 한 대가 가장 잘 맡는 면적은 60~80㎡입니다.",
          "강사가 칠판 앞을 오가며 설명하는 수업은 강사용 추적 카메라 ClassIn Cam T1을 봅니다. 강사가 움직여도 화면 가운데에 계속 잡습니다.",
          "일어서서 발표하는 학생을 화면에 담으려면 학생용 추적 카메라 ClassIn Cam S1을 봅니다. 앉아 있던 학생이 일어나면 그 학생 쪽으로 확대합니다.",
        ],
      },
    ],
    relatedSlugs: ["cam-t1-s1", "mic-dt2-pro", "board-install-readiness", "webcam-cms-setup-t1-panorama", "board-overview"],
  },
  {
    slug: "board-install-readiness",
    category: "hardware",
    title: "설치 전 준비 체크리스트",
    description: "Classin Board 설치일 전에 원장·실장이 확인할 것은 설치 방식, 반입 경로, 전원과 네트워크, 카메라 구성입니다. 설치 당일 무엇을 보고 마칠지, 설치 뒤 어떤 기준으로 관리할지도 체크리스트로 챙깁니다.",
    audience: "원장·실장, 학원 운영팀, 설치 엔지니어, 도입 상담 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 7,
    tags: ["설치 준비", "현장 실측", "네트워크", "전원", "인수인계", "사용 주의사항", "관리"],
    keywords: ["전자칠판 설치", "Classin Board 설치", "현장 실측", "벽걸이", "이동형 스탠드", "네트워크", "전원", "카메라 세팅", "A/S", "사용 환경", "작동 온도", "습도", "적외선 터치 관리", "화면 청소", "소비전력", "벽 매립", "반입 경로", "엘리베이터", "랜선 Cat 6", "설치 당일 검수", "결로", "두 대 설치", "듀얼 칠판 간격", "칠판 간격", "스탠드형", "이동식 스탠드", "설치 유형", "설치 전 체크", "설치 준비"],
    chatbotSummary: "Classin Board 설치 전에는 설치 방식(이동형 스탠드·벽걸이·벽 매립), 포장 상자가 출입구·엘리베이터·계단·교실 문을 지나가는지, 교실 크기와 맨 뒷자리 거리, 벽 재질과 보강, 접지된 콘센트와 멀티탭 용량, 유선 네트워크, 카메라·마이크 구성을 확인합니다. 카메라(T1·S1)를 함께 설치하면 랜선은 Cat 6 이상, 유선 속도는 170Mbps 이상이 권장 기준입니다. 설치 당일에는 화면·터치·펜, OPS 한국어 설정, 클래스인 로그인과 수업 생성, 판서 저장, 카메라·마이크 인식, 녹화 저장까지 확인하고 마칩니다. 작동 환경은 0~40℃·습도 80%RH 이하, 전원 100~240V이며 최대 소비전력은 S75 315W, S86 390W, S98 Pro 740W, S110 850W입니다. S65 소비전력은 상담에서 알려 드립니다. 보드 두 대를 나란히 놓을 때는 15~20cm 이상 띄우거나 낮은 각도의 사선으로 배치합니다. 화면은 전원을 끈 뒤 물을 아주 조금 묻힌 부드러운 반건조 천으로 닦고 알코올·시너는 쓰지 않으며, OPS를 뺄 때는 전원을 끕니다.",
    sections: [
      {
        heading: "설치 방식부터 정합니다",
        body: "설치 방식은 이동형 스탠드, 벽걸이, 벽 매립 중에서 고릅니다. 방식에 따라 비용과 필요한 설치 인원이 달라지니 상담 때 가장 먼저 정합니다.",
        steps: [
          "이동형 스탠드는 설치가 간단하고 교실을 옮겨 가며 씁니다. 대신 스탠드 다리가 보드 앞 공간을 차지해 강사와 학생이 오가기 불편해집니다.",
          "벽걸이는 벽이나 기존 칠판 위에 브래킷을 박아 겁니다. 콘크리트 벽은 앵커로 바로 고정하고, 석고보드 벽은 15mm 이상 합판으로 보강해야 합니다.",
          "벽 매립은 벽 안 공간에 보드를 넣는 방식입니다. 완공 뒤 만족도가 높은 편이지만 인테리어 단계부터 설치 담당자와 맞춰야 하고, 설치와 A/S가 까다로워집니다.",
        ],
      },
      {
        heading: "교실 공간과 반입 경로",
        body: "보드는 포장 상자째 들어옵니다. 설치할 교실까지 상자가 지나갈 수 있는지부터 봅니다.",
        steps: [
          "건물 출입구, 엘리베이터, 계단, 복도, 교실 문을 포장 상자가 지나갈 수 있는지 확인합니다.",
          "설치 당일 엘리베이터를 쓸 수 있는지 미리 확인해 둡니다.",
          "교실 가로·세로 크기와 천장 높이를 잽니다.",
          "학생 좌석 배치와 맨 뒷자리까지의 거리를 확인합니다.",
          "이동형 스탠드라면 바닥이 평평한지, 옮겨 다닐 길의 문 폭이 90cm 이상인지 봅니다.",
          "보드 앞에 난로나 온풍기 같은 전열기구를 두지 않습니다. 열기 때문에 녹화나 라이브 화면에서 보드가 일렁여 보입니다.",
        ],
      },
      {
        heading: "전원과 네트워크",
        body: "네트워크 설정은 전자칠판 설치 과정에서 문제가 가장 많이 생기는 단계입니다. 설치 날 시간이 늘어나지 않도록 미리 확인해 둡니다.",
        steps: [
          "보드 자리 가까이에 접지된 3구 콘센트가 있는지 확인합니다.",
          "멀티탭을 쓴다면 정격 용량을 확인하고, 전원선이 통로를 가로지르지 않게 배선 경로를 정합니다.",
          "유선 인터넷 랜선이 보드 자리까지 오는지 확인합니다. 무선만 쓴다면 교실 안에서 실제 속도가 안정적으로 나오는지 재 봅니다.",
          "카메라(T1·S1)를 함께 설치한다면 보드로 들어오는 랜선이 Cat 6 이상인지, 유선 속도가 170Mbps 이상 나오는지 확인합니다.",
          "카메라용 PoE 장비를 둘 자리와 랜선이 지나갈 길을 설치 담당자와 미리 정합니다.",
          "고정 IP를 쓰는 학원이라면 IP 주소, 서브넷, 게이트웨이, DNS 값을 아는 담당자와 설치 날 연락이 닿게 해 둡니다.",
        ],
      },
      {
        heading: "카메라·마이크와 함께 쓸 기기",
        body: "수업 방식에 따라 필요한 구성이 다릅니다. 설치 전에 정해 두면 배선 경로를 같이 잡습니다.",
        steps: [
          "교실 수업만 하는지, 원격 학생에게도 송출하는지 정합니다.",
          "강사 추적 카메라, 학생 카메라, 교실 전체를 보여 주는 파노라마 화면이 필요한지 정합니다.",
          "마이크가 교실 크기에 맞는지 봅니다. 넓은 교실은 천장형 마이크 ClassIn Mic DT2 Pro를 검토합니다.",
          "OPS, NFC 카드, 펜, 스탠드처럼 받을 구성품을 견적서와 맞춰 봅니다.",
          "외부 PC, HDMI, USB 장비를 같이 쓸 계획이면 연결할 포트를 미리 확인합니다.",
        ],
      },
      {
        heading: "설치 당일, 끝내기 전에 확인할 것",
        body: "전원이 켜지는 것만 보고 마치지 않습니다. 설치 기사와 함께 짧은 수업을 한 번 돌려 보고 끝냅니다.",
        steps: [
          "보드를 걸기 전에 전원을 연결하고 OPS를 끼워 화면과 터치에 이상이 없는지 먼저 봅니다.",
          "설치 뒤 다시 켜서 화면 밝기, 손 터치, 펜 입력, 윈도우(OPS) 화면이 한국어로 나오는지 확인합니다.",
          "클래스인에 로그인해 수업을 만들고 입장해 봅니다.",
          "PDF나 이미지 자료를 열어 판서하고 저장되는지 봅니다.",
          "카메라와 마이크가 클래스인에서 올바른 장치로 잡히는지 보고, 카메라 앵글은 화면을 보며 그 자리에서 고쳐 달라고 합니다.",
          "녹화할 교실이면 테스트 수업을 끝낸 뒤 영상과 판서가 저장됐는지 확인합니다.",
        ],
      },
      {
        heading: "설치 뒤 인수인계와 강사 교육",
        body: "담당자가 바뀌어도 운영이 이어지도록 기록과 교육을 남깁니다.",
        steps: [
          "관리자 계정, 강사 계정, 테스트 학생 계정을 정리해 둡니다.",
          "네트워크 설정, 카메라 IP, CMS 설정을 바꿨다면 그 내용을 기록합니다.",
          "수업 만들기, 자료 올리기, 판서, 녹화, 복습 자료 공유를 강사와 한 번씩 같이 해 봅니다.",
          "A/S 접수 경로와 원격 지원 범위를 운영팀과 공유합니다.",
          "첫 주 실제 수업에서 나온 문제를 모아 한 번 더 점검합니다.",
          "설치 뒤 보드나 카메라 위치를 옮기면 녹화 화면이 한쪽으로 치우칩니다. 옮겼다면 카메라 설정을 다시 맞춰 달라고 요청합니다.",
          "강사들에게는 이렇게 보내 두면 됩니다. '○○반 교실에 전자칠판 설치가 끝났습니다. ○월 ○일 ○시에 판서, 자료 열기, 녹화를 같이 해 보겠습니다. 수업 전에 한 번 켜 보시고, 화면이나 터치가 이상하면 운영팀에 바로 알려 주세요.'",
        ],
      },
      {
        heading: "놓을 자리와 사용 환경",
        body: "규격서 기준 사용 환경입니다. 보드는 이 범위 안에서 쓰고 보관합니다.",
        steps: [
          "작동 온도 0~40℃, 습도 80%RH 이하에서 씁니다. 보관은 -10~60℃, 습도 10~80%RH, 해발 5,000m 이하입니다.",
          "전원은 100~240V이고 대기 전력은 0.5W 미만입니다.",
          "최대 소비전력은 S75 315W, S86 390W, S98 Pro 740W, S110 850W입니다. 멀티탭은 이보다 넉넉한 용량으로 고릅니다.",
          "직사광선, 습기, 먼지가 많은 곳, 통풍이 나쁜 곳은 피합니다. 창문 햇빛이나 적외선 조명이 화면을 정면으로 비추면 터치 인식이 흔들리니 보드 각도를 조정합니다.",
          "열이 빠지도록 보드 뒷면과 통풍구 주변을 비워 둡니다. 커튼이나 수납물로 막지 않습니다.",
          "추운 곳에서 따뜻한 교실로 막 옮겼다면 내부 결로가 마를 때까지 기다렸다가 전원을 켭니다.",
          "보드 두 대를 나란히 놓을 때는 15~20cm 이상 띄우거나 낮은 각도의 사선으로 배치합니다. 너무 붙이면 두 보드의 센서가 간섭해 화면에 점이 찍히는 터치 오인식이 생기기도 합니다.",
        ],
      },
      {
        heading: "화면·펜·OPS 관리",
        body: "청소와 부품 관리는 운영팀이 같은 기준으로 합니다.",
        steps: [
          "화면은 전원을 끈 뒤 물을 아주 조금 묻힌 부드러운 반건조 천으로 가볍게 닦습니다. AG 방현·AF 지문방지 코팅이 있어 알코올, 시너, 강한 세제는 쓰지 않습니다.",
          "수업 중 잠깐 닦을 때는 터치 잠금을 먼저 켭니다.",
          "화면 테두리(베젤)도 주기적으로 닦습니다. 먼지가 끼면 터치가 튑니다.",
          "기본 제공 펜은 보관 위치를 정해 둡니다. S75·S86·S98 Pro는 적외선 펜 2개, S110은 적외선 펜과 페이지 펜이 1개씩 들어 있습니다.",
          "OPS를 빼거나 바꿀 때는 반드시 전원을 끄고 합니다.",
          "펌웨어나 클래스인 업데이트는 수업이 없는 시간에 적용합니다. 수업 중에 재시작되는 일을 막습니다.",
          "TÜV 라인 저블루라이트 인증을 받았지만, 긴 수업 뒤에는 학생들이 눈을 쉬게 합니다.",
          "이상한 소리, 냄새, 연기가 나거나 액체가 들어가면 바로 전원을 끄고 플러그를 뽑은 뒤 A/S에 연락합니다.",
        ],
      },
    ],
    relatedSlugs: ["board-s-series-safe-use", "board-lineup-specs", "board-ai-camera-mic", "webcam-cms-setup-t1-panorama"],
  },
  {
    slug: "electronic-whiteboard-classroom-checklist",
    category: "hardware",
    title: "학원 전자칠판 도입 체크리스트",
    description: "전자칠판을 사기 전에 원장·실장과 도입 담당자가 데모 자리에서 쓰는 점검표입니다. 7개 영역 40문항에 체크해 보면 설치 후 강사와 운영팀의 일이 줄어들지, 오히려 늘어날지 미리 보입니다.",
    audience: "원장·실장, 도입 검토자, 설치 상담 담당자, 운영팀",
    updatedAt: "2026-09-24",
    readMinutes: 9,
    status: "review",
    visibility: "unlisted",
    noindex: true,
    docType: "guide",
    productArea: "hardware",
    difficulty: "beginner",
    tags: ["전자칠판 체크리스트", "Classin Board", "학원 장비", "스마트 교실", "도입 검토"],
    keywords: ["전자칠판 구매", "전자칠판 체크리스트", "스마트보드", "Classin Board", "수업 녹화", "OPS", "판서", "교실 크기", "하드웨어 도입", "전자칠판 데모", "전자칠판 비교", "두 대 설치", "칠판 간격"],
    chatbotSummary: "전자칠판을 사기 전에 데모에서 쓰는 40문항 점검표입니다. 수업 준비와 연결, 소프트웨어 호환성, 판서와 터치, 녹화·카메라·마이크, 화면 품질, 교실 크기와 설치, 도입 후 새 업무 여부의 7개 영역을 보고, 데모에서 직접 확인한 문항만 1점으로 셉니다. 총점보다 점수가 낮게 나온 영역을 도입 전 테스트 항목으로 삼습니다.",
    sections: [
      {
        heading: "체크하는 방법",
        body: "검토 중인 전자칠판 한 대를 놓고 문항마다 1점이나 0점을 줍니다. 40점 만점입니다. 데모에서 직접 본 것만 1점이고, 설명으로만 들은 것은 0점으로 둡니다. 총점보다 쓸모 있는 건 점수가 낮게 나온 영역입니다. 그 영역이 도입 전에 따로 테스트할 항목이 됩니다.",
        steps: [
          "설치할 교실과 검토 중인 모델을 정해 두고 시작합니다.",
          "확인하지 못한 문항은 0점으로 두고, 업체에 물어볼 질문 목록으로 옮깁니다.",
          "점수가 낮은 영역은 강사, 운영팀, 설치 담당자가 같이 봅니다. 수업 흐름은 강사가, 교실 조건은 설치 담당자가 가장 잘 압니다.",
        ],
      },
      {
        heading: "1. 수업 준비와 연결 구조",
        body: "강사가 교실에 들어와 수업을 시작하기까지 몇 단계를 거치는지 봅니다.",
        steps: [
          "외장 노트북 없이 보드만 켜서 수업을 시작한다.",
          "매 수업 HDMI 케이블을 꽂지 않아도 된다.",
          "수업 자료, 판서 도구, 브라우저, 전자교재를 보드 한 대에서 연다.",
          "전원을 켜고 수업 화면을 띄우기까지 강사가 따로 설정할 것이 없다.",
          "교실마다 다른 케이블, 젠더, 노트북 상태에 수업이 좌우되지 않는다.",
          "새로 온 강사도 한 번 설명을 듣고 기본 세팅을 따라 한다.",
        ],
      },
      {
        heading: "2. 운영체제와 소프트웨어 호환성",
        body: "학원에서 지금 쓰는 수업 프로그램이 이 보드에서 그대로 돌아가는지 봅니다.",
        steps: [
          "학원에서 쓰는 주요 수업 프로그램을 보드에 설치하거나 실행해 봤다.",
          "PDF, PPT, 전자교재, 웹 기반 수업 도구가 멈추지 않고 열린다.",
          "화상수업, 녹화, LMS, 브라우저 도구를 함께 써도 충돌하지 않는다.",
          "안드로이드 앱 제한 때문에 막히는 기능이 없다.",
          "윈도우 프로그램이 필요하면 OPS나 PC 환경이 갖춰져 있다.",
          "소프트웨어 업데이트와 계정 로그인을 누가 관리할지 정해져 있다.",
        ],
      },
      {
        heading: "3. 판서와 터치 경험",
        body: "판서가 설명 속도를 따라오는지 봅니다. 강사가 데모에서 직접 써 봐야 알 수 있는 영역입니다.",
        steps: [
          "글씨를 빠르게 써도 필기가 늦게 따라오지 않는다.",
          "펜과 손가락 터치를 구분한다.",
          "학생 여러 명이 동시에 써도 터치가 튀지 않는다.",
          "강사가 따로 배우지 않고도 지우기, 확대, 이동, 페이지 넘기기를 한다.",
          "판서 내용을 저장했다가 다시 불러온다.",
          "수업 후 판서를 PDF나 수업 기록으로 학생에게 공유한다.",
        ],
      },
      {
        heading: "4. 녹화, 카메라, 마이크",
        body: "수업을 기록하고 복습 영상을 나눠 주는 일이 강사의 별도 업무가 되지 않는지 봅니다.",
        steps: [
          "별도 프로그램을 설치하지 않고 수업을 녹화한다.",
          "강사 화면, 판서, 음성이 한 영상에 함께 기록된다.",
          "카메라를 따로 사거나 매번 삼각대를 세우지 않아도 된다.",
          "수업마다 조명을 따로 맞추지 않아도 된다.",
          "수업이 끝난 뒤 영상을 저장하고 올리는 일을 강사가 손으로 하지 않아도 된다.",
          "녹화 영상을 결석 보강, 복습, 강사 피드백, 학부모 상담에 쓰도록 공유하는 경로가 있다.",
        ],
      },
      {
        heading: "5. 화면 품질과 내구성",
        body: "교실 조명과 좌석 거리, 매일 쓰는 환경에서 화면 품질이 버티는지 봅니다. 쇼룸보다 실제 교실 조명 아래에서 보는 게 정확합니다.",
        steps: [
          "교실 조명 아래에서 화면 반사가 수업을 방해하지 않는다.",
          "손자국과 얼룩이 잘 남지 않는다.",
          "판서와 터치를 반복해도 표면에 흠이 잘 생기지 않는다.",
          "맨 뒷자리와 옆자리에서도 글씨가 또렷하게 보인다.",
          "밝기, 해상도, 시야각이 우리 교실에 충분하다.",
          "프레임과 외관이 수업 집중을 방해하지 않는다.",
        ],
      },
      {
        heading: "6. 교실 크기와 설치 방식",
        body: "화면 크기와 설치 방식이 교실 동선, 시야, 안전 조건에 맞는지 봅니다. 두 대를 나란히 설치할 계획이라면 15~20cm 이상 띄우거나 낮은 각도의 사선으로 배치하는 것까지 설치 도면에 넣어 두세요. 너무 붙이면 드물게 화면에 점이 찍히는 터치 오인식이 생길 수 있습니다.",
        steps: [
          "가장 먼 자리에서 글씨와 자료가 읽힌다.",
          "작은 교실에 너무 큰 화면을 넣지 않았다.",
          "큰 교실에는 뒷자리까지 보이는 크기를 골랐다.",
          "벽걸이나 이동형 스탠드 방식, 배선 위치가 교실 동선에 맞는다.",
          "강사가 화면 앞에서 움직일 공간이 충분하다.",
          "설치 후 전원선, 랜선, 케이블이 발에 걸리지 않게 정리된다.",
        ],
      },
      {
        heading: "7. 새 노동이 생기지 않는가",
        body: "장비가 늘어난 만큼 관리할 일이 늘면 도입한 의미가 없습니다. 마지막으로 이 부분을 봅니다.",
        steps: [
          "수업 전에 강사가 해야 할 세팅이 지금보다 늘지 않는다.",
          "보드, 카메라, 마이크, 조명을 각각 따로 관리하지 않아도 된다.",
          "녹화 파일 정리, 링크 배포, 알림 발송을 운영팀이 손으로 반복하지 않아도 된다.",
          "문제가 생겼을 때 A/S와 운영 지원을 어디에 요청하는지 정해져 있다.",
        ],
      },
      {
        heading: "점수 해석",
        body: "총점은 이 보드가 큰 터치 모니터에 머무는지, 수업 운영 장비로 쓰일지를 가늠하는 출발점입니다. 총점보다 0점이 몰린 영역을 먼저 보세요.",
        steps: [
          "0~15점이면 큰 터치 모니터에 가깝습니다. 외장 PC, HDMI, 별도 녹화 프로그램, 수동 업로드에 계속 기대게 될 가능성이 큽니다.",
          "16~25점은 일부만 스마트보드입니다. 녹화, 복습 공유, 소프트웨어 호환성에서 새 업무가 생기기 쉽습니다.",
          "26~34점은 수업 운영과 연결되는 수준입니다. 교실 크기와 운영 세팅만 구체적으로 정하면 됩니다.",
          "35점 이상이면 수업 기록, 복습, 학부모 소통까지 이어지는 단계로 검토해도 됩니다.",
        ],
      },
      {
        heading: "하나라도 해당하면 다시 검토하세요",
        body: "점수가 높게 나와도 아래 중 하나에 해당하면 도입 전에 다시 따져 봐야 합니다.",
        steps: [
          "매 수업 외장 노트북과 HDMI 연결이 필요하다.",
          "학원의 주요 수업 프로그램이 안드로이드 환경에서 돌아가지 않는다.",
          "녹화는 되지만 저장, 업로드, 공유를 사람이 직접 한다.",
          "카메라, 마이크, 조명을 따로 세팅해야 한다.",
          "반사나 지문 때문에 실제 교실에서 화면이 잘 보이지 않는다.",
          "수업 기록이 학부모 상담이나 복습 관리로 이어지지 않는다.",
        ],
      },
      {
        heading: "Classin Board를 함께 검토한다면",
        body: "이 체크리스트는 어느 제품에나 쓸 수 있습니다. Classin Board는 OPS(내장 PC)와 클래스인 소프트웨어가 들어 있고 카메라·마이크를 함께 구성해, 판서와 녹화, 저장, 공유가 한 흐름으로 이어지도록 만든 보드입니다. 데모를 볼 때 우리 학원의 대표 수업 하나를 가져와 이 40문항을 그 수업으로 직접 확인해 보세요.",
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
    description: "ClassIn Board S65·S75·S86·S110은 전원·설치·청소 때 지킬 것이 제품 설명서에 정해져 있습니다. 운영팀과 강사가 그 기준과 함께, 이상 증상이 생겼을 때 먼저 할 일, 제어 메뉴와 포트 쓰는 법을 확인합니다.",
    audience: "원장·실장, 강사, 설치 담당자, 운영팀, 상담 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 7,
    tags: ["하드웨어", "ClassIn Board", "S 시리즈", "안전", "사용 설명서", "기본 조작", "관리"],
    keywords: ["ClassIn Board S 시리즈", "Classin Board 안전", "전자칠판 안전 사용", "전자칠판 청소", "전자칠판 전원", "전자칠판 터치 잠금", "전자칠판 입력 소스", "무선 투영", "주석", "작은 제어 화면", "보조 조작 패널", "Type-C", "HDMI Touch", "LAN", "OPS", "전자칠판 이상한 냄새", "전자칠판 김서림", "결로", "잔상", "두 대 설치", "칠판 간격", "고스트 터치", "터치 오인식"],
    chatbotSummary: "ClassIn Board S 시리즈는 제품 라벨의 전원 규격과 접지된 3구 콘센트를 쓰고, 통풍구를 막지 않게 설치합니다. 이상한 소리나 냄새, 연기가 나거나 액체가 들어가면 바로 전원을 끄고 플러그를 뽑은 뒤 사용을 멈추고 A/S로 연결합니다. 커버를 열거나 분해하지 않습니다. 청소는 전원을 끈 뒤 물을 아주 조금 묻힌 반건조 천으로 하고 알코올, 시너, 강한 세제는 쓰지 않습니다. 투영, 주석, 터치 잠금, 눈 보호, 입력 소스, 볼륨과 밝기는 대형 화면 제어 메뉴에서 바꾸고, 수동 IP 같은 네트워크 설정은 현장 담당자가 연결 상태를 확인한 뒤 합니다.",
    sections: [
      {
        heading: "전원 연결과 평소 관리",
        body: "S 시리즈는 큰 유리 패널에 OPS 컴퓨터와 네트워크, 여러 입력 포트가 붙은 장비입니다. 기능을 익히기 전에 전원부터 제대로 연결해 두세요.",
        steps: [
          "제품 라벨에 적힌 전원 규격을 씁니다. 콘센트는 접지된 3구 콘센트가 좋습니다.",
          "멀티탭을 쓴다면 정격 용량을 확인합니다.",
          "전원선이 통로를 가로지르지 않게 정리합니다.",
          "번개가 치거나 오래 쓰지 않을 때는 전원 플러그와 네트워크 케이블을 뽑아 둡니다.",
          "추운 곳에 있던 보드를 따뜻한 교실로 옮긴 직후에는 안쪽에 물기가 맺힐 수 있습니다. 충분히 마른 뒤에 전원을 켭니다.",
        ],
      },
      {
        heading: "이상한 소리·냄새·연기가 나면",
        body: "원인을 찾기보다 전원을 끄는 게 먼저입니다. 액체가 들어갔을 때도 똑같이 합니다.",
        steps: [
          "바로 전원을 끄고 플러그를 뽑습니다.",
          "사용을 멈추고 운영팀이나 설치 담당자에게 알립니다.",
          "커버를 열거나 직접 분해하지 않습니다. 점검과 수리는 설치 담당자나 A/S에 맡깁니다.",
          "습도가 높은 날 화면 안쪽이 잠깐 뿌옇게 보이는 것은 시간이 지나면 사라질 수 있습니다. 물방울이 맺히거나 물이 새거나 동작이 이상하면 사용을 멈추고 점검을 요청합니다.",
          "화면 테두리를 닦아도 터치가 계속 이상하게 반응하면 A/S에 점검을 요청합니다.",
        ],
      },
      {
        heading: "옮기고 설치할 때",
        body: "보드는 무겁고 화면이 유리입니다. 옮기고 설치하는 순간에 큰 사고가 나기 쉬우니, 사람과 자리부터 확보합니다.",
        steps: [
          "큰 보드는 여러 명이 함께 옮깁니다. 제품 설명서는 6명 이상을 기준으로 합니다.",
          "이동형 스탠드는 옮길 길을 먼저 비우고, 급하게 멈추거나 돌리지 말고, 경사진 바닥을 피합니다.",
          "바닥형은 받침대를 단단히 고정하고 평평하고 안정된 바닥에 둡니다.",
          "벽걸이는 제품과 브래킷 기준에 맞춰 단단히 고정합니다. 벽면 재질과 보강이 필요한지는 설치 전에 확인합니다.",
          "직사광선, 습기, 너무 덥거나 추운 곳, 먼지 많은 곳, 통풍이 안 되는 곳, 가연성·부식성 가스가 있는 곳은 피합니다.",
          "통풍구를 신문, 천, 커튼, 수납물로 막지 않습니다.",
          "칠판 두 대를 나란히 설치할 때는 15~20cm 이상 띄우거나 낮은 각도의 사선으로 둡니다. 너무 붙이면 두 칠판의 센서가 서로 간섭해, 드물게 화면에 점이 찍히는 터치 오인식(고스트 터치)이 생길 수 있습니다.",
        ],
      },
      {
        heading: "화면 관리와 청소",
        body: "LCD 패널은 유리라서 세게 누르거나 부딪히면 안 됩니다. 닦을 때는 전원부터 끄고, 물을 아주 조금 묻힌 반건조 천을 씁니다.",
        steps: [
          "날카로운 물건이나 금속을 통풍구, 단자, 화면 주변에 넣거나 대지 않습니다.",
          "같은 화면, 고정 아이콘, 멈춘 글자를 오래 띄워 두면 잔상이 남을 수 있습니다. 쓰지 않을 때는 화면을 끄거나 화면 보호를 켜 둡니다.",
          "청소 전에는 전원을 끄고 플러그를 뽑습니다.",
          "화면은 물을 아주 조금 묻힌 부드러운 반건조 천으로 가볍게 닦습니다.",
          "알코올, 휘발유, 산성·알칼리성 세제, 시너, 휘발성 용제는 코팅과 외관을 상하게 할 수 있어 쓰지 않습니다.",
          "화면 테두리(베젤)에 먼지나 이물질이 끼면 터치가 튈 수 있습니다. 청소할 때 테두리도 함께 닦습니다.",
        ],
      },
      {
        heading: "대형 화면 제어 메뉴",
        body: "수업 중 자주 바꾸는 설정은 대부분 대형 화면 제어 메뉴에 있습니다. 메뉴는 화면 오른쪽 아래의 전원·설정 버튼으로 엽니다. 버튼 위치와 이름은 모델과 펌웨어에 따라 조금 다를 수 있습니다.",
        steps: [
          "AC 전원이 연결된 상태에서 전원 버튼을 누르면 시스템이 켜집니다.",
          "켜진 상태에서 전원·설정 버튼을 짧게 누르면 대형 화면 제어 메뉴가 열리고, 길게 누르면 종료 단계로 넘어갑니다.",
          "메뉴에는 투영, 주석, 터치 잠금, 눈 보호, 입력 소스, 설정, 볼륨, 밝기, 화면 끄기, 재시작, 종료가 있습니다.",
          "수업 중 학생이 화면을 만지면 안 되거나 화면을 닦아야 할 때는 터치 잠금부터 켭니다.",
          "눈 보호 모드, 밝기, 볼륨은 교실 밝기와 학생 자리까지의 거리에 맞춰 조정합니다.",
          "전원을 켜면 기본으로 내장 OPS 화면이 나옵니다. 현장 설정이나 펌웨어에 따라 다를 수 있습니다.",
          "입력 소스가 회색이거나 선택되지 않으면 그 포트에 신호가 없는 상태입니다. 케이블, 외부 기기 전원, 꽂은 포트를 확인합니다.",
        ],
      },
      {
        heading: "투영과 주석",
        body: "수업 중 가장 자주 쓰는 기능입니다. 연결, 필기, 지우기, 종료를 강사가 수업 전에 한 번씩 해 보면 수업 중에 설명이 끊기지 않습니다.",
        steps: [
          "유선 투영은 HDMI나 Type-C처럼 실제로 연결한 입력 소스를 골라 전환합니다.",
          "무선 투영은 보드와 기기를 같은 네트워크나 보드가 안내하는 무선 핫스팟에 연결한 뒤에 합니다.",
          "주석은 화면 위에 색을 바꿔 가며 쓰거나 강조 표시를 할 때 씁니다.",
          "일부만 지울 때는 지우개 도구나 손바닥처럼 넓은 면으로 문지르고, 전부 지울 때는 삭제 기능을 씁니다.",
          "주석 도구 모음은 흰색 도구 막대를 잡아 옮기고, 종료 버튼으로 빠져나옵니다.",
        ],
      },
      {
        heading: "포트와 네트워크 연결",
        body: "포트마다 용도가 정해져 있습니다. Android 전용 포트, 공용 USB, HDMI Touch, LAN, Type-C를 헷갈리지 않게 씁니다.",
        steps: [
          "Android USB 2.0 포트는 주로 Android 시스템 업그레이드에 씁니다. 일반 USB 장치는 공용 USB 포트에 꽂습니다.",
          "무선 키보드·마우스가 자꾸 끊기면 USB 수신기를 다른 포트로 옮기거나 USB 연장선으로 수신기를 가까이 둡니다.",
          "HDMI로 연결한 외부 기기를 보드 화면에서 터치로도 조작하려면 HDMI 신호선과 HDMI Touch 선이 둘 다 연결되어 있어야 합니다.",
          "Type-C는 충전, DP 신호 표시, USB 연결을 지원할 수 있지만 케이블 규격과 길이에 민감합니다. 제품 설명서는 1.5m 이내 케이블을 기준으로 합니다.",
          "LAN 포트는 유선 네트워크와 네트워크 공유에 씁니다. IP는 자동으로 두고, 수동 IP가 필요하면 담당자가 주소, 서브넷, 게이트웨이, DNS를 확인한 뒤 입력합니다.",
        ],
      },
      {
        heading: "작은 제어 화면(보조 조작 패널)",
        body: "큰 화면 끝까지 손이 닿지 않거나, 비밀번호나 개인 파일처럼 교실 전체에 보이면 곤란한 내용을 다룰 때 쓰는 작은 패널입니다.",
        steps: [
          "화면 아무 곳이나 다섯 손가락으로 누르면 작은 제어 화면이 열립니다.",
          "패널 아래쪽 흰색 도구 막대를 잡아 원하는 위치로 옮깁니다.",
          "패널 바깥을 누르면 닫힙니다.",
        ],
      },
      {
        heading: "설치 후 첫 주에 운영팀이 확인할 것",
        body: "첫 주에는 기능을 많이 써 보는 것보다, 매일 안전하게 켜고 쓰고 끄는지 보는 게 먼저입니다.",
        steps: [
          "전원선, 멀티탭, 랜선, HDMI선이 발에 걸리지 않게 정리되어 있는지 확인합니다.",
          "벽걸이나 스탠드가 흔들리지 않는지 확인합니다.",
          "교실별로 화면 밝기, 눈 보호 모드, 볼륨 기본값을 정합니다.",
          "강사가 터치 잠금, 투영, 주석, 입력 소스 전환, 화면 끄기, 재시작을 직접 한 번씩 해 봅니다.",
          "청소 도구와 여분 펜을 둘 자리를 정합니다.",
          "상담 채널의 원격 지원으로 설정을 바꾼 뒤에는 전자칠판을 한 번 껐다가 다시 켭니다.",
          "이상 증상이 생기면 전원을 끄고, 사용을 멈추고, 어디로 A/S를 접수하는지 이 순서를 강사들과 공유합니다.",
        ],
      },
      {
        heading: "강사에게 보낼 안내 문구",
        body: "설치가 끝나면 강사 단톡방에 그대로 붙여 넣어도 되는 문구입니다. '보드에서 이상한 소리나 냄새, 연기가 나거나 물이 들어가면 바로 전원을 끄고 플러그를 뽑아 주세요. 커버는 열지 말고 운영팀에 알려 주세요. 화면을 닦을 때는 전원을 끈 뒤 물을 아주 조금 묻힌 반건조 천으로만 닦고, 알코올이나 강한 세제는 쓰지 말아 주세요. 수업 중 학생이 화면을 만지지 않게 하려면 제어 메뉴에서 터치 잠금을 켜면 됩니다.'",
      },
    ],
    resources: [
      {
        label: "클래스인 하드웨어 소개",
        href: "/product/hw",
        description: "보드 라인업과 도입 흐름이 있는 제품 소개 페이지입니다.",
      },
    ],
    relatedSlugs: ["board-basic-operation", "board-install-readiness", "board-lineup-specs", "board-writing-touch"],
  },
  {
    slug: "mic-dt2-pro",
    category: "hardware",
    title: "ClassIn Mic DT2 Pro 천장 마이크 가이드",
    description: "보드 내장 마이크로는 소리가 모자라는 큰 교실, 교실 소리를 온라인으로 보내야 하는 하이브리드 수업에서는 교실 크기에 맞는 음장 방안과 마이크 대수부터 정합니다. 설치 조건과 설치 후 세팅 순서는 그다음입니다.",
    audience: "도입 검토자, 설치 담당자, 하이브리드 수업 운영팀",
    updatedAt: "2026-09-24",
    readMinutes: 7,
    tags: ["하드웨어", "마이크", "DT2 Pro", "하이브리드 수업", "음성", "음장 방안", "설치"],
    keywords: ["ClassIn Mic DT2 Pro", "MS21A", "천장 마이크", "마이크 어레이", "빔포밍", "음성 추적", "수음 영역", "분구 균형 확음", "천장 스피커", "AEC", "노이즈 캔슬링", "설치 높이", "하이브리드 수업 음성", "원터치 튜닝", "음악 모드", "더킹", "핸드 마이크"],
    chatbotSummary: "ClassIn Mic DT2 Pro(모델 MS21A)는 32채널 어레이 마이크, 오디오 프로세서, 파워 앰프(4×50W)가 한 몸체에 들어간 천장형 마이크입니다. 말하는 사람의 위치를 빔포밍으로 따라가며 소리를 잡고, 에코 제거(AEC)·하울링 억제(AFC)·자동 게인(AGC)·AI 노이즈 제거(ANS)를 적용합니다. 교실 소리를 온라인으로도 보내려면 천장 스피커를 쓰는 '분구 균형 확음 방안', 교실 안 확음만 필요하면 벽걸이 스피커를 쓰는 '표준 확음·수음 방안'을 고릅니다. 마이크 한 대는 60~80㎡에 가장 잘 맞고, 2~3대를 연결하면 최대 150㎡까지 덮습니다. 설치 높이는 2.5~4m(최적 2.7~3.5m)이고, 배경 소음 45dB·잔향 1000ms 이하의 직사각형 교실이 좋습니다.",
    sections: [
      {
        heading: "언제 DT2 Pro가 필요한가",
        body: "보드에는 8배열 마이크가 들어 있어, 내장 마이크로 충분한 교실도 있습니다. 교실이 크거나, 토론처럼 여러 자리에서 말하는 수업이거나, 원격 학생에게 교실 소리를 또렷하게 보내야 한다면 천장에 DT2 Pro를 달아 교실 전체 소리를 잡고 키웁니다.",
        steps: [
          "강사가 교실 안을 옮겨 다녀도 말하는 사람 쪽으로 수음 방향을 따라갑니다.",
          "원격 학생에게 교실 소리를 또렷하게 보내, 하이브리드 수업에서도 설명을 놓치지 않게 합니다.",
          "녹화 수업 영상의 음성도 같이 좋아집니다.",
        ],
      },
      {
        heading: "한 대에 들어 있는 것",
        body: "DT2 Pro는 32채널 어레이 마이크, 오디오 프로세서, 파워 앰프(4×50W)를 한 몸체에 담았습니다. 외장 오디오 프로세서나 별도 앰프 없이 수음과 확음을 함께 처리하고, 지연이 낮아 실시간 수업에 맞습니다.",
        steps: [
          "적응형 빔포밍으로 말하는 사람의 위치를 자동으로 따라가며 소리를 잡습니다.",
          "수음 영역을 교실에 맞게 설정합니다. 소리를 받지 않을 차폐 구역과 먼저 받을 우선 구역을 따로 지정합니다.",
          "에코 제거(AEC), 하울링 억제(AFC), 자동 게인(AGC), AI 노이즈 제거(ANS)를 적용합니다.",
          "여러 대를 연결(캐스케이드)해 더 넓은 교실로 늘립니다.",
        ],
      },
      {
        heading: "음장 방안 고르기",
        body: "먼저 정할 것은 교실 소리를 온라인으로도 보낼지입니다. 온라인과 오프라인을 동시에 하는 하이브리드 수업이면 방안 1, 교실 안 확음만 필요하면 방안 2를 고릅니다.",
        steps: [
          "방안 1 '분구 균형 확음'은 천장 스피커를 씁니다. 강단에서 말하는 강사 목소리를 교실 전 좌석에 고르게 키우면서, 교실 전체 소리를 온라인으로도 보냅니다.",
          "방안 1은 단계별로 확음해서 말하는 사람이 움직여도 교실 어디서나 비슷하게 들립니다. 맨 뒷자리도 첫 줄과 같은 선명도로 들려 긴 수업에서도 귀가 덜 피곤합니다.",
          "방안 2 '표준 확음·수음 호환'은 벽걸이나 라인어레이 스피커를 씁니다. 마이크 주변 약 2m 안의 목소리를 교실 전체로 키웁니다. 확음 게인은 방안 1보다 크지만 온라인 음성 수집은 되지 않습니다.",
          "방안 2는 가로로 넓은 교실에는 맞지 않습니다.",
        ],
      },
      {
        heading: "교실 크기별 마이크·스피커 구성",
        body: "마이크와 스피커 수는 교실 면적과 모양으로 정합니다. 아래는 제조사 자료의 예시 구성이고, 실제 대수는 현장을 본 뒤에 정합니다.",
        steps: [
          "마이크 한 대가 가장 잘 맞는 면적은 60~80㎡입니다. 강단 쪽 목소리를 교실 전체로 키우는 데 알맞습니다.",
          "80~120㎡는 마이크 2~3대를 연결해 교실 전체를 수음하고 확음합니다. 최대 150㎡까지 덮습니다.",
          "방안 1 예시는 9×7m 일반 교실에 마이크 1대와 천장 스피커 6개, 15×9m 대형 교실에 마이크 2대와 천장 스피커 8개, 가로로 넓은 10×15m 교실에 마이크 3대와 천장 스피커 8개입니다.",
          "방안 2 예시는 9×7m 일반 교실에 마이크 1대와 벽걸이 스피커 2개, 15×7m 대형 교실에 마이크 1대와 벽걸이 스피커 4개입니다.",
          "60㎡보다 작은 교실은 DT2 Pro의 효과를 살리기 어렵습니다. 150㎡를 넘으면 마이크와 스피커가 공간을 다 덮지 못해 자리마다 소리 차이가 생깁니다.",
        ],
      },
      {
        heading: "주요 사양",
        body: "견적서나 제안서에 넣기 전에는 최신 규격서와 한 번 더 대조하세요.",
        steps: [
          "모델명은 MS21A이고, 일렉트릿 마이크 32개가 배열되어 있습니다.",
          "최적 수음 반경은 5m, 유효 수음 반경은 8m입니다.",
          "수음 방식은 적응형 빔포밍 추적과 설정형 수음 영역 두 가지입니다.",
          "크기는 595×595×49mm, 순중량은 4.3kg이고 24V 어댑터로 전원을 받습니다.",
          "파워 앰프(4×50W)가 들어 있어 별도 앰프 없이 확음합니다.",
        ],
      },
      {
        heading: "설치 전에 확인할 교실 조건",
        body: "천장 마이크는 설치 높이와 주변 소음, 잔향에 민감합니다. 아래 조건을 벗어나면 수음 품질과 온라인 송출 품질이 크게 떨어집니다.",
        steps: [
          "설치 높이는 2.5~4m이고, 2.7~3.5m가 가장 좋습니다.",
          "배경 소음은 45dB SPL 이하, 잔향은 1000ms 이하로 맞춥니다. 분구 균형 확음 방안이면 잔향을 800ms 이하로 맞춥니다. 넘으면 음향 보강 시공을 검토합니다.",
          "마이크에서 수평으로 반경 0.5m 안에는 에어컨, 팬, 프로젝터, 전류 소리가 큰 조명 같은 소음·진동원을 두지 않습니다. 균형 확음 구성이면 이 거리를 1m로 잡습니다.",
          "에어컨과 통풍구는 마이크에서 2m 이상 떨어뜨리는 것이 좋습니다.",
          "직사각형 교실이 가장 좋습니다. 부채꼴, 원형, 타원형, 다각형처럼 모양이 불규칙하면 자리마다 소리 차이가 커지고 온라인 수집 품질도 떨어집니다.",
        ],
      },
      {
        heading: "설치 후 세팅 순서",
        body: "설치 담당자가 설치를 마치면서 하는 세팅입니다. 한 번 잡아 두면 강사가 수업마다 만질 일은 없습니다.",
        steps: [
          "원터치 튜닝을 실행하고, 교실에 맞는 음장 방안을 선택합니다.",
          "튜닝이 끝나면 강사가 서는 자리에서 말해 보며 볼륨을 미세 조정합니다.",
          "보드의 Windows에서 DT2 Pro를 뺀 나머지 오디오 장치를 비활성화합니다. 다른 장치가 켜져 있으면 엉뚱한 마이크가 잡힐 수 있습니다.",
          "ClassIn X에서 마이크와 스피커를 모두 DT2 Pro로 선택하고 음악 모드를 켭니다.",
          "핸드 마이크를 같이 쓰는 교실은 더킹(한쪽 소리가 들어오면 다른 쪽 소리를 자동으로 줄이는 설정)을 맞춥니다.",
          "수업 중 소리가 안 잡히면 수업 화면 우측 상단 톱니바퀴 설정에서 마이크가 DT2 Pro로 선택되어 있는지 먼저 봅니다.",
        ],
      },
    ],
    resources: [
      {
        label: "클래스인 하드웨어 소개",
        href: "/product/hw",
        description: "보드 라인업과 카메라·마이크 구성, 도입 흐름이 있는 제품 소개 페이지입니다.",
      },
    ],
    relatedSlugs: ["board-ai-camera-mic", "board-install-readiness", "webcam-cms-setup-t1-panorama", "cs-microphone-camera-check"],
  },
  {
    slug: "cam-t1-s1",
    category: "hardware",
    title: "ClassIn Cam T1·S1 추적 카메라 가이드",
    description: "카메라를 조작할 사람 없이 수업을 찍고 싶을 때는 강사를 따라가는 T1과 발표하는 학생을 잡는 S1을 봅니다. 두 카메라가 각각 무엇을 하는지, 어디에 달고 설치 때 무엇을 정해 두는지 확인합니다.",
    audience: "교사, 도입 검토자, 설치 담당자, 하이브리드 수업 운영팀",
    updatedAt: "2026-09-24",
    readMinutes: 7,
    tags: ["하드웨어", "카메라", "T1", "S1", "교사 추적", "학생 추적"],
    keywords: ["ClassIn Cam T1", "ClassIn Cam S1", "CS11A", "CS21A", "강사용 카메라", "학생용 카메라", "교사 추적 카메라", "학생 추적 카메라", "자동 추적", "트래킹", "AI 카메라", "4K 카메라", "하이브리드 수업 카메라", "POE 카메라", "수업 녹화 카메라", "CameraCMS", "인식 제외 구역", "Blocking zone", "카메라 회전 반전", "connection failed", "녹화 화면 치우침", "가운데로 안 찍힘", "카메라 각도", "칠판 위치 변경"],
    chatbotSummary: "ClassIn Cam은 사람이 조작하지 않아도 수업을 찍는 추적(트래킹) 카메라입니다. T1(모델명 CS11A)은 강사용으로, 강사가 움직여도 따라가며 화면 가운데에 잡습니다. S1(모델명 CS21A)은 학생용으로, 앉아 있던 학생이 일어서면 그 학생을 찾아 확대합니다. 둘 다 1/2.8인치 842만 화소 센서로 최대 4K 30fps를 찍고, 렌즈 하나로 교실 전체 화면과 인물 확대(클로즈업) 화면을 함께 만들어 상황에 맞게 바꿔 보여 줍니다. 전원은 랜선 하나로 전원과 영상을 함께 받는 PoE, DC12V 어댑터, USB 중에서 고르고 소비전력은 5W 미만입니다. 강사가 다니는 범위와 인식 제외 구역은 설치할 때 CameraCMS에서 한 번 지정합니다.",
    sections: [
      {
        heading: "T1은 강사를, S1은 발표하는 학생을 찍습니다",
        body: "ClassIn Cam은 사람이 카메라를 돌리지 않아도 수업을 알아서 찍는 추적(트래킹) 카메라입니다. 무엇을 따라가느냐에 따라 두 종류가 있습니다.",
        steps: [
          "T1(모델명 CS11A)은 강사용입니다. 강사가 칠판 앞을 오가도 화면 가운데에 계속 잡습니다.",
          "S1(모델명 CS21A)은 학생용입니다. 앉아 있던 학생이 일어서면 그 학생을 찾아 화면에 담습니다.",
          "둘을 함께 쓰면 강사 설명 장면과 학생 발표 장면이 모두 자동으로 담깁니다.",
          "원격 송출이나 수업 녹화 때 카메라를 조작할 사람이 따로 없어도 됩니다.",
        ],
      },
      {
        heading: "추적(트래킹)이 뭔가요?",
        body: "카메라가 사람을 알아보고 움직임을 따라가며 화면 가운데에 계속 담는 기능입니다. 캠코더를 든 사람이 따라다니는 일을 카메라가 혼자 합니다.",
        steps: [
          "렌즈 하나로 교실 전체를 넓게 보여 주는 화면과 인물을 가까이 잡은 확대(클로즈업) 화면을 동시에 만듭니다.",
          "강사가 자리를 옮기면 확대 화면이 같이 움직입니다.",
          "상황에 맞춰 전체 화면과 확대 화면 중 하나로 자동 전환되어, 보는 사람은 지금 봐야 할 장면을 봅니다.",
        ],
      },
      {
        heading: "T1 강사용 카메라",
        body: "T1은 강사 한 명을 안정적으로 따라가는 데 맞춘 카메라입니다. 따라가는 화면이 덜컹거리거나 엉뚱한 사람을 잡지 않는 것이 가장 큰 장점입니다.",
        steps: [
          "강사 키에 맞춰 확대 크기를 자동으로 조절합니다.",
          "강사가 잠시 멈춰 서 있어도 놓치지 않습니다.",
          "조명이 바뀌거나, 다른 사람이 지나가거나, 프로젝터 화면이 켜져도 따라가던 강사를 바꾸지 않습니다.",
          "판서하는 강사를 가까이 잡는 모드를 비롯해 촬영 모드가 여럿 있습니다.",
          "교실이 넓거나 좁거나 계단식이어도 거의 영향을 받지 않습니다.",
        ],
      },
      {
        heading: "S1 학생용 카메라",
        body: "S1은 발표하려고 일어선 학생을 찾아 잡는 카메라입니다. 별도 추적 장비 없이 카메라 혼자 동작합니다. 강사를 계속 따라가는 T1과 달리 일어선 학생을 확대해 잡는 방식이라, 추적 동작은 T1보다 단순합니다.",
        steps: [
          "학생이 일어서고 앉는 동작을 알아채 발표하는 학생을 화면에 담습니다.",
          "학생이 가까이 있든 멀리 있든 알맞은 크기로 확대하거나 축소합니다.",
          "한 명이 일어서면 그 학생을, 여러 명이 일어서면 여러 명을 함께 잡습니다.",
          "일어섰다가 자리를 옮기거나 반쯤 일어서는 동작도 알아챕니다.",
          "교실 정중앙이 아니어도 설치할 수 있어 자리를 잡기 쉽습니다.",
        ],
      },
      {
        heading: "주요 사양",
        body: "T1과 S1은 렌즈만 다르고 나머지 사양은 같습니다. 견적서나 제안서에 넣기 전에는 최신 규격서와 한 번 더 대조하세요.",
        steps: [
          "모델명은 T1이 CS11A, S1이 CS21A입니다.",
          "센서는 둘 다 1/2.8인치 4K, 842만 화소이고 최대 4K 30fps로 찍습니다.",
          "렌즈는 T1이 7.9mm 망원으로 멀리 있는 강사를 당겨 잡고, S1이 2.4mm 광각으로 학생 전체를 넓게 담습니다.",
          "전체 화면과 확대 화면을 비롯해 녹화와 원격 송출에 쓸 화면 여러 개를 동시에 내보냅니다.",
          "전원은 PoE(랜선 하나로 전원과 영상을 함께 받는 방식), DC12V 어댑터, USB 중에서 고릅니다. 소비전력은 5W 미만입니다.",
          "PC나 녹화 장비와는 PoE 랜선 또는 USB로 연결합니다.",
          "크기는 190×76×58mm, 무게는 0.5kg 미만, 사용 온도는 0~40℃입니다.",
        ],
      },
      {
        heading: "어디에 설치하나요",
        body: "추적이 잘 되려면 높이와 거리가 맞아야 합니다. 벽에 다는 설치를 기준으로 한 권장 위치입니다.",
        steps: [
          "T1은 칠판에서 약 8m 떨어진 뒤쪽 벽, 높이 약 2.4m에 답니다. 교실 좌우 가운데 선에 가깝게 맞춥니다. 가능한 범위는 높이 2~3m, 강단에서 5~10m입니다.",
          "S1은 칠판 위나 옆, 높이 약 2.2m에 달아 학생 전체가 화면에 들어오게 합니다.",
          "S1 한 대가 담는 범위는 가로 10m, 세로 8m 정도 교실입니다.",
          "햇빛이나 강한 조명이 렌즈를 정면으로 비추지 않는 자리를 고릅니다.",
        ],
      },
      {
        heading: "설정은 설치할 때 한 번만",
        body: "추적 범위는 설치 담당자가 카메라 설정 프로그램 CameraCMS에서 한 번 잡아 둡니다. 그 뒤로는 평소 수업에서 강사가 만질 일이 거의 없습니다. 다만 칠판이나 카메라 위치를 옮기면 이 설정을 다시 잡아야 합니다.",
        steps: [
          "T1은 강사가 주로 다니는 범위를 추적 영역으로 지정합니다. 위쪽 경계는 칠판 윗선보다 조금 낮으면서 강사 머리보다 높게, 아래쪽 경계는 맨 앞자리 학생보다 높게 잡습니다.",
          "인물 포스터, 마네킹, 사람이 자주 지나가는 곳처럼 사람으로 잘못 알아볼 만한 곳은 인식 제외 구역(Blocking zone)으로 지정합니다.",
          "인식 제외 구역 안에 서 있는 강사는 추적하지 않습니다. 강단과 겹치지 않게 잡습니다.",
          "앵글은 학원 담당자에게 실제 화면을 보여 주고 의견을 받아 현장에서 고칩니다.",
          "수업 중에는 전체 화면과 확대 화면이 알아서 바뀌므로 강사가 조작하지 않아도 됩니다.",
          "네트워크 연결과 자세한 설정 순서는 '웹캠 네트워크 + CMS 카메라 세팅 (T1 + Panorama)' 문서에 있습니다.",
        ],
      },
      {
        heading: "카메라가 이상할 때 먼저 볼 것",
        body: "고장으로 보기 전에 아래부터 확인합니다.",
        steps: [
          "클래스인 카메라 설정에 회전·반전 버튼이 없는 것은 정상입니다. T1, S1 같은 랜 카메라는 클래스인에서 회전·반전을 할 수 없고, 필요하면 CameraCMS에서 바꿉니다.",
          "클래스인 안에서 카메라 설정(RTSP 등)이 보이지 않으면 클래스인을 종료했다가 다시 실행합니다.",
          "CameraCMS에서 카메라 상태가 'connection failed'로 나오면 네트워크 세팅부터 다시 확인합니다.",
          "T1이 강사를 따라가지 않으면 강사가 인식 제외 구역 안에 서 있지 않은지 봅니다.",
          "칠판을 옆으로 옮긴 뒤 녹화 화면이 한쪽으로 치우치면 추적 영역과 앵글을 다시 잡아야 합니다. 설치 담당자나 상담 채널에 요청하고, 다시 잡은 뒤에는 강사가 카메라 앞과 칠판 좌우를 오가며 추적이 되는지 확인합니다.",
          "추적 없이 교실을 고정된 화면으로 찍고 싶다면 [Panorama] 화면을 쓰면 가운데를 기준으로 찍힙니다.",
          "S1이 앉아 있는 학생을 따라다니지 않는 것은 고장이 아닙니다. 학생이 일어설 때 확대하는 방식입니다.",
        ],
      },
    ],
    resources: [
      {
        label: "클래스인 하드웨어 소개",
        href: "/product/hw",
        description: "보드 라인업과 카메라·마이크 구성, 도입 흐름이 있는 제품 소개 페이지입니다.",
      },
    ],
    relatedSlugs: ["board-ai-camera-mic", "webcam-cms-setup-t1-panorama", "board-install-readiness", "mic-dt2-pro", "cs-microphone-camera-check"],
  },
  {
    slug: "classin-607-update",
    category: "teacher",
    title: "Classin 6.0.7 업데이트 안내",
    description: "Classin 6.0.7에서 달라진 점입니다. 확장형 판서 영역, 매직펜, 개인 칠판 개선, 신규 사용자 온보딩과 스타터 가이드가 새로 들어오거나 바뀌었습니다.",
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
    description: "컴퓨터로 수업을 듣거나 가르치려면 먼저 클래스인을 설치합니다. 공식 다운로드 페이지에서 운영체제와 칩에 맞는 파일을 받아 실행하면 끝납니다. 설치했는데 켜지지 않을 때, 이 컴퓨터로 수업이 될지 궁금할 때 확인할 것도 있습니다.",
    audience: "처음 클래스인을 설치하는 학생, 학부모, 강사",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    featured: true,
    tags: ["설치", "PC", "윈도우", "맥", "리눅스", "시작하기"],
    keywords: ["클래스인 설치", "PC 설치", "윈도우 설치", "맥 설치", "리눅스 설치", "Apple Silicon", "Intel 칩", "x86_64", "arm", "32비트", "64비트", "ClassIn X", "다운로드", "설치 파일", "설치 방법", "컴퓨터 사양", "최소 사양", "macOS", "임시 비밀번호", "설치했는데 안 켜져요", "실행 안 됨", "안 열려요", "백신", "보안 프로그램", "DRM", "인강 플레이어 충돌", "윈도우 11", "맥북 설치", "맥 다운로드", "애플 실리콘", "M3", "Applications 드래그", "맥에서 안 열려요", "다운로드 후", "설치 파일 어디", "원격 설치", "사양", "권장 사양", "맥OS 버전", "리눅스 지원", "Linux 지원 여부", "홈페이지 로그인"],
    chatbotSummary: "클래스인 공식 홈페이지의 다운로드 페이지에서 윈도우(7 이상, 32/64비트), 맥(인텔 또는 Apple Silicon), 리눅스(x86_64 또는 arm)용 설치 파일을 받아 실행하면 PC 설치가 끝납니다. 맥은 사과 메뉴의 [이 Mac에 관하여]에서 칩을 확인해 M 시리즈면 Apple Silicon 버전을 받고, 설치 창에서 [Classin]을 [Applications]로 끌어다 놓아야 설치됩니다. 설치했는데 켜지지 않으면 기기에 맞는 파일인지 보고, 백신이나 인강 재생용 DRM 플레이어 같은 보안 프로그램과 부딪히는지 확인합니다. 최소 사양은 Windows 7 또는 macOS 10.13 이상, 인터넷 속도 2Mbps 이상입니다.",
    sections: [
      {
        heading: "설치는 세 단계입니다",
        media: [
          {
            type: "image",
            src: "/images/docs/diagrams/install-flow.svg",
            alt: "PC 설치 흐름도. 공식 홈페이지 다운로드 페이지에서 설치 파일을 받고, 받은 파일을 실행해 설치한 뒤, 클래스인 계정으로 로그인하는 세 단계",
            caption: "다운로드, 설치 파일 실행, 로그인 순서로 끝납니다.",
            width: 1440,
            height: 760,
          },
        ],
        body: "공식 홈페이지 다운로드 페이지에서 내 컴퓨터에 맞는 설치 파일을 받고, 그 파일을 실행한 뒤, 클래스인 계정으로 로그인합니다. 아래에서 쓰는 컴퓨터(윈도우, 맥, 리눅스)에 해당하는 부분만 보면 됩니다.",
      },
      {
        heading: "윈도우에 설치하기",
        body: "Windows 7 이상에서 설치됩니다. 다운로드 페이지에 32비트용과 64비트용 설치 파일이 모두 있습니다.",
        steps: [
          "경로: 공식 홈페이지 > [다운로드]",
          "Windows용 클래스인의 [다운로드]를 눌러 설치 파일을 받습니다.",
          "브라우저 오른쪽 위 다운로드 목록에서 받은 설치 파일을 열어 설치를 마칩니다.",
          "바탕 화면(또는 설치할 때 정한 위치)의 ClassIn 아이콘을 더블 클릭해 실행합니다.",
        ],
      },
      {
        heading: "맥에 설치하기",
        body: "맥은 칩 종류에 따라 설치 파일이 다릅니다. 칩에 맞지 않는 파일을 받으면 설치가 제대로 되지 않으니, 받기 전에 칩부터 확인하세요. M1, M2, M3처럼 이름이 M으로 시작하는 칩은 모두 Apple Silicon 버전을 받습니다.",
        steps: [
          "화면 왼쪽 위 사과 메뉴에서 [이 Mac에 관하여]를 열어 칩 종류를 확인합니다.",
          "경로: 공식 홈페이지 > [다운로드]",
          "인텔 칩이면 인텔 프로세서 버전을, M 시리즈 칩이면 Apple Silicon 버전을 받습니다.",
          "받은 설치 파일을 엽니다.",
          "설치 창이 뜨면 [Classin] 아이콘을 [Applications] 폴더로 끌어다 놓습니다. 이렇게 해야 설치됩니다.",
        ],
      },
      {
        heading: "리눅스에 설치하기",
        body: "리눅스용은 x86_64와 arm 두 가지가 있습니다. 쓰는 컴퓨터의 아키텍처에 맞는 파일을 받으세요.",
        steps: [
          "경로: 공식 홈페이지 > [다운로드]",
          "Linux용 클래스인에서 아키텍처(x86_64 또는 arm)에 맞는 파일을 받습니다.",
          "받은 파일을 실행해 설치를 마칩니다.",
        ],
      },
      {
        heading: "설치했는데 켜지지 않을 때",
        body: "먼저 기기에 맞는 설치 파일인지 봅니다. 윈도우는 Windows용, 맥은 칩에 맞는 버전이어야 합니다.\n\n파일이 맞는데도 켜지지 않으면 컴퓨터에 깔린 보안 프로그램과 부딪히는 경우가 있습니다. 백신, 보험사나 사내 메신저용 보안 앱, 인강 재생용 DRM 플레이어 같은 프로그램입니다. DRM 플레이어는 저작권 보호를 위해 화면 녹화·녹음·미러링을 하는 다른 프로그램을 막기 때문에 클래스인과 함께 쓰기 어렵습니다. 실제로 DRM 플레이어가 카메라·마이크 권한을 막아 클래스인이 실행되지 않다가, 그 플레이어를 지운 뒤 정상으로 돌아온 사례가 있습니다.",
        steps: [
          "기기에 맞는 설치 파일인지 확인하고, 아니면 맞는 파일로 다시 설치합니다.",
          "백신이나 인강 재생용 DRM 플레이어 같은 보안 프로그램이 깔려 있는지 봅니다.",
          "지워도 되는 프로그램이면 지운 뒤 클래스인을 다시 실행합니다. 계속 써야 하는 프로그램이면 클래스인은 휴대폰이나 태블릿으로 씁니다.",
          "맥에서 맞는 파일인데도 열리지 않으면 기기 보안 설정 때문에 실행이 막혔을 수 있습니다. 이때는 상담 채널(클래스인 공식 홈페이지 하단 채팅)로 문의합니다.",
          "그래도 안 되거나 설치 자체가 어려우면 상담 채널에 원격 설치 도움을 요청합니다. 원격 지원 프로그램은 상담 채널이 보낸 링크로만 설치하세요.",
        ],
      },
      {
        heading: "이 컴퓨터로 수업이 될지 궁금하다면",
        body: "학생, 그리고 녹화를 쓰지 않는 강사라면 아래 최소 사양을 넘으면 됩니다.\n\n수업을 녹화하는 강사는 인텔 Core i5 8세대(AMD Ryzen 5 1세대) 이상, 윈도우 메모리 16GB 이상, 인터넷 속도 4Mbps 이상이 필요합니다. 여유 있게 쓰려면 권장 사양인 Windows 10 또는 macOS 12 이상, 인텔 Core i7 9세대(AMD Ryzen 7 2세대) 이상, 메모리 윈도우 16GB·맥 8GB, 해상도 1920×1080, 인터넷 속도 6Mbps 이상을 기준으로 보세요. 화면에 함께 올라오는 학생이 많은 수업일수록 필요한 사양도 올라갑니다.",
        steps: [
          "Windows 7 이상 또는 macOS 10.13 이상",
          "인텔 Core i3 8세대 또는 AMD Ryzen 3 2세대 이상 프로세서",
          "메모리 윈도우 8GB 이상, 맥 4GB 이상",
          "화면 해상도 1280×720 이상",
          "인터넷 속도 2Mbps 이상",
        ],
      },
      {
        heading: "설치한 다음에는",
        body: "클래스인을 실행하면 로그인 화면이 나옵니다. 가입과 로그인은 이 프로그램에서 합니다. 공식 홈페이지의 로그인은 학원 관리자와 일부 강사가 쓰는 관리자 페이지라서, 학생이 홈페이지에서 가입하거나 로그인하면 체험판 선택 화면이 뜨고 수업에 들어가지 못합니다.\n\n학원에서 문자나 이메일로 임시 비밀번호를 받았다면 학원이 계정을 미리 만들어 둔 것입니다. 그 안내를 받은 휴대폰 번호나 이메일 주소가 아이디이니, 받은 임시 비밀번호로 로그인한 뒤 내 비밀번호로 바꾸세요.\n\n계정이 없다면 로그인 화면의 [회원 가입]에서 새로 만듭니다. 순서는 회원 가입 문서에, 로그인이 막힐 때 볼 것은 로그인이 안 될 때 문서에 있습니다.",
      },
    ],
    resources: [
      {
        label: "클래스인 공식 다운로드 페이지",
        href: "https://www.classin.com/kr/download/",
        description: "윈도우(7 이상, 32/64비트), 맥(Intel, Apple Silicon), 리눅스(x86_64, arm) 설치 파일이 있는 페이지입니다. 터치스크린 디스플레이용 ClassIn X와 CamIn도 여기서 받습니다.",
      },
    ],
    relatedSlugs: ["mobile-install", "signup", "login-troubleshooting", "password-change-pc"],
  },
  {
    slug: "mobile-install",
    category: "start",
    title: "모바일 설치 (안드로이드·iOS)",
    description: "휴대폰이나 태블릿으로 수업에 들어가려면 앱부터 설치합니다. 안드로이드는 플레이 스토어, 아이폰·아이패드는 앱 스토어에서 '클래스인(Classin)'을 검색하면 됩니다. 수업 알림이 오지 않을 때와 오래된 기기의 최소 사양도 여기서 확인합니다.",
    audience: "처음 클래스인을 설치하는 학생, 학부모, 강사",
    updatedAt: "2026-09-24",
    readMinutes: 4,
    tags: ["설치", "모바일", "안드로이드", "iOS", "시작하기"],
    keywords: ["클래스인 모바일", "안드로이드 설치", "iOS 설치", "앱 스토어", "App Store", "구글 플레이", "Google Play", "Classin 앱", "다운로드", "아이폰 설치", "아이패드 설치", "갤럭시 설치", "태블릿 설치", "지원 기기", "최소 사양", "약관 동의", "모바일 앱 어디서", "앱 다운로드", "앱스토어", "플레이스토어", "태블릿 화면 잘림", "버튼이 안 보여요", "기기별 기능 차이", "모바일 UI", "수업 알림", "알림이 안 와요", "10분 전 알림", "푸시 알림", "방해 금지"],
    chatbotSummary: "안드로이드는 플레이 스토어, 아이폰·아이패드는 앱 스토어에서 '클래스인(Classin)'을 검색해 [설치]한 뒤 [열기]로 실행합니다. 가입과 로그인은 공식 홈페이지가 아니라 설치한 앱에서 합니다. 수업 10분 전 알림이 오지 않으면 방해 금지 모드와 기기 설정의 Classin 알림을 확인합니다. 최소 사양은 iOS 11 또는 Android 7.0 이상이고, 아이폰은 6 이후, 아이패드는 5세대 이후 모델입니다.",
    sections: [
      {
        heading: "안드로이드(갤럭시 등)에 설치하기",
        body: "갤럭시 스마트폰이나 일반 안드로이드 태블릿은 플레이 스토어에서 받습니다.",
        steps: [
          "경로: 플레이 스토어 > 검색창 '클래스인(Classin)' > [설치]",
          "[설치]를 누르기 전에 앱 이름이 ClassIn인지, 아이콘이 맞는지 확인합니다. 비슷한 이름의 앱이 함께 나올 수 있습니다.",
          "설치가 끝나면 [열기]를 눌러 앱을 실행합니다.",
        ],
      },
      {
        heading: "아이폰·아이패드에 설치하기",
        body: "아이폰과 아이패드는 앱 스토어에서 받습니다.",
        steps: [
          "경로: 앱 스토어 > 검색창 '클래스인(Classin)' > [설치]",
          "[설치]를 누르기 전에 앱 이름이 ClassIn인지, 아이콘이 맞는지 확인합니다.",
          "설치가 끝나면 [열기]를 눌러 앱을 실행합니다.",
        ],
      },
      {
        heading: "설치한 다음에는",
        body: "앱을 열면 로그인 화면이 나옵니다. 계정이 있으면 바로 로그인하고, 없으면 첫 화면 오른쪽 위 [회원 가입]에서 새로 만듭니다. 가입과 로그인은 이 앱에서 하세요. 공식 홈페이지의 로그인은 학원 관리자용 관리자 페이지입니다.\n\n학원에서 문자나 이메일로 임시 비밀번호를 받았다면, 그 안내를 받은 휴대폰 번호나 이메일 주소가 아이디입니다.\n\n모바일은 비밀번호 칸 아래 [약관 동의]에 체크해야 로그인됩니다. 아이디와 비밀번호가 맞는데 로그인이 안 되면 이것부터 보세요.\n\n컴퓨터로도 수업에 들어갈 예정이라면 PC 설치 문서를 보세요.",
      },
      {
        heading: "수업 알림이 오지 않을 때",
        body: "학생으로 등록된 수업은 시작 10분 전에 앱 알림이 옵니다. 알림이 오다 말다 하면 기기 설정부터 봅니다.",
        steps: [
          "기기의 방해 금지 모드가 켜져 있는지 확인합니다.",
          "기기 설정의 앱 목록에서 Classin을 찾아 알림이 켜져 있는지 확인합니다.",
          "그래도 오지 않으면 앱을 지웠다가 다시 설치하고, 앱이 요청하는 권한을 모두 허용합니다.",
        ],
      },
      {
        heading: "휴대폰·태블릿에서 일부 버튼이 안 보일 때",
        body: "실시간 수업과 채팅 같은 기본 기능은 어느 기기에서나 됩니다. 다만 휴대폰인지 태블릿인지, iOS인지 안드로이드인지, 화면 해상도가 어떤지에 따라 쓸 수 있는 기능과 화면 배치가 다를 수 있습니다. 모바일 화면은 PC와 달라서 도구를 고르거나 영역을 지정하는 방법도 다릅니다.\n\nPC에서 하던 방법이 모바일에서 보이지 않으면 상담 채널(클래스인 공식 홈페이지 하단 채팅)로 문의하세요.",
      },
      {
        heading: "설치가 안 되거나 오래된 기기라면",
        body: "설치가 안 되면 기기의 저장 공간, 운영체제 버전, 네트워크 상태를 먼저 확인합니다.\n\n기기가 오래됐다면 아래 최소 사양을 넘는지 봅니다. 학생, 그리고 녹화를 쓰지 않는 강사 기준입니다. 여유 있게 쓰려면 iOS 14 또는 Android 10.0 이상, 아이폰 XS 이후, 아이패드 8세대 이후 모델, 인터넷 속도 6Mbps 이상을 기준으로 보세요.",
        steps: [
          "iOS 11 이상 또는 Android 7.0 이상",
          "아이폰 6 이후 모델, 아이패드 5세대·아이패드 미니 4세대·아이패드 에어 3세대 이후 모델, 아이패드 프로 전 모델",
          "안드로이드 기기는 메모리 4GB 이상",
          "인터넷 속도 2Mbps 이상",
        ],
      },
    ],
    resources: [
      {
        label: "App Store 클래스인 (아이폰·아이패드)",
        href: "https://apps.apple.com/kr/app/classin/id1226361488",
        description: "아이폰·아이패드용 클래스인 앱 페이지입니다.",
      },
      {
        label: "Google Play 클래스인 (안드로이드)",
        href: "https://play.google.com/store/apps/details?id=cn.eeo.classin",
        description: "안드로이드 휴대폰·태블릿용 클래스인 앱 페이지입니다.",
      },
      {
        label: "클래스인 공식 다운로드 페이지",
        href: "https://www.classin.com/kr/download/",
        description: "PC용 설치 파일과 각 앱 스토어 바로가기가 함께 있는 페이지입니다.",
      },
    ],
    relatedSlugs: ["pc-install", "signup", "login-troubleshooting", "password-change-mobile"],
  },
  {
    slug: "signup",
    category: "start",
    title: "회원 가입",
    description: "설치를 마친 학생, 학부모, 강사는 계정부터 만듭니다. 가입은 공식 홈페이지가 아니라 설치한 앱이나 PC 프로그램에서 하고, 이메일이나 휴대폰 번호로 인증코드를 받아 마칩니다. 학부모님께는 설치·가입 안내 문구를 그대로 복사해 보내면 됩니다.",
    audience: "처음 클래스인을 쓰는 학생, 학부모, 강사",
    updatedAt: "2026-09-24",
    readMinutes: 7,
    tags: ["회원가입", "계정", "인증", "프로필", "시작하기"],
    keywords: ["클래스인 회원가입", "회원 가입", "이메일 가입", "휴대폰 인증", "인증코드", "프로필 설정", "닉네임", "인증번호", "인증코드 안 옴", "국가 번호", "+82", "임시 비밀번호", "약관 동의", "학부모 안내 문구", "로그인 안 돼요", "잘못된 계정", "010", "국가번호", "번호 입력", "가입이 안 됐어요", "계정이 없대요", "인증코드 입력", "인증코드 안 와요", "문자가 안 와요", "스팸", "해외 문자 차단", "홈페이지 로그인", "웹 로그인", "관리자 페이지", "비즈니스 체험판이 떠요", "무료 버전 선택", "아이디 변경", "이메일 변경", "전화번호 변경", "계정 위반", "채팅이 안 돼요", "메시지가 안 보내져요", "신규 계정 제한", "비밀번호 규칙"],
    chatbotSummary: "가입은 공식 홈페이지가 아니라 설치한 앱이나 PC 프로그램에서 [회원 가입]을 눌러 합니다. 휴대폰 번호로 가입할 때는 국가 번호 +82를 고르고 010의 맨 앞 0을 뺀 10부터 입력합니다. 입력칸 아래 약관 동의에 체크해야 [인증코드 받기]가 눌리고, 받은 인증 코드(휴대폰은 4자리)를 넣은 뒤 영문과 숫자를 섞은 6~20자 비밀번호를 정해야 가입이 끝납니다. 6.0.7 이후 버전은 첫 로그인 때 역할(관리자, 교사, 학생)을 고르고 스타터 가이드로 첫 사용 순서를 안내받습니다. 인증코드가 오지 않으면 번호 형식, 스팸함, 문자 차단 설정을 본 뒤 공식 홈페이지 하단 채팅으로 문의합니다. 학원에서 임시 비밀번호를 받았다면 새로 가입하지 않고 그 정보로 로그인합니다.",
    sections: [
      {
        heading: "가입하기 전에",
        body: "가입은 설치한 앱이나 PC 프로그램에서 합니다. 공식 홈페이지의 로그인은 학원 관리자와 일부 강사가 쓰는 관리자 페이지라서, 학생이 홈페이지에서 가입하면 체험판 선택 화면이 뜨고 수업에 들어가지 못합니다. 이미 홈페이지에서 가입했다면 상담 채널(클래스인 공식 홈페이지 하단 채팅)로 문의하세요.\n\n학원에서 문자나 이메일로 임시 비밀번호를 받았다면 새로 가입하지 않아도 됩니다. 학원이 계정을 미리 만들어 둔 것입니다. 그 안내를 받은 휴대폰 번호나 이메일 주소가 아이디이니, 임시 비밀번호로 로그인한 뒤 비밀번호 변경 문서대로 내 비밀번호로 바꾸세요.\n\n그 밖에는 직접 가입합니다. 학원은 학생과 강사를 휴대폰 번호나 이메일(아이디)로 등록하므로, 가입을 마치면 가입한 번호나 이메일을 학원에 알려 주세요. 강사는 먼저 가입해 두어야 학원이 강사로 등록합니다.",
      },
      {
        heading: "클래스인을 열고 회원 가입 누르기",
        body: "가입 순서는 PC와 모바일이 같습니다. 아직 설치하지 않았다면 PC 설치나 모바일 설치 문서부터 보세요.",
        steps: [
          "PC는 바탕 화면(또는 설치할 때 정한 위치)의 ClassIn 아이콘을 더블 클릭해 실행합니다.",
          "경로: PC 첫 화면 > [회원 가입]",
          "모바일은 ClassIn 앱 아이콘을 눌러 실행합니다.",
          "경로: 모바일 첫 화면 오른쪽 위 > [회원 가입]",
        ],
      },
      {
        heading: "이메일이나 휴대폰 번호로 인증하기",
        body: "아이디는 이메일이나 휴대폰 번호로 만듭니다. 해외 번호도 됩니다. 가입한 뒤에는 이메일 아이디를 휴대폰 번호로, 또는 그 반대로 바꿀 수 없으니 어느 쪽으로 만들지 정하고 시작하세요.\n\n휴대폰 번호로 가입한다면 번호 형식에 주의하세요. 국가 번호는 +82이고, 번호는 010의 맨 앞 0을 빼고 10부터 넣습니다. 이 형식이 틀려서 가입과 로그인이 막히는 문의가 많습니다.",
        steps: [
          "가입 창 아래쪽의 [이메일로 등록하기] 또는 [전화 번호로 등록하기]로 가입 방식을 고릅니다. 모바일 앱은 이메일 입력 화면이 먼저 뜨니, 휴대폰 번호로 가입하려면 [전화 번호로 등록하기]를 누릅니다.",
          "이메일 주소나 휴대폰 번호를 입력합니다. 휴대폰 번호는 국가 번호를 +82(Korea)로 고르고 1012345678처럼 입력합니다.",
          "입력칸 아래 약관 동의에 체크합니다. 체크해야 [인증코드 받기] 버튼이 눌립니다.",
          "[인증코드 받기]를 누르고, 문자나 이메일로 받은 인증 코드를 입력합니다. 휴대폰 인증 코드는 4자리입니다. 코드를 넣지 않고 창을 닫으면 가입이 끝나지 않습니다.",
          "사용할 비밀번호를 정합니다. 6~20자로 영문과 숫자를 함께 넣고, 한글, 한자, 특수문자, 공백은 쓸 수 없습니다. 이름 같은 필수 항목이 화면에 더 있으면 함께 채웁니다.",
        ],
      },
      {
        heading: "로그인해 보고 닉네임 정하기",
        body: "가입이 끝나면 로그인 화면으로 돌아가 방금 만든 아이디로 로그인해 봅니다. 여기까지 되면 가입은 끝입니다.\n\n첫 로그인 때 닉네임을 정합니다. 학생 닉네임은 선생님이 출석부에서 학생을 찾는 이름이라, 학원에서 정한 양식이 있으면 그대로 적어야 합니다. 닉네임과 프로필 사진은 나중에 PC 왼쪽 아래 [기본 프로필]을 누르고 [개인정보]에서 바꿉니다.\n\n6.0.7 이후 버전은 첫 로그인 때 역할(관리자, 교사, 학생)을 고르는 화면도 나옵니다. 고른 역할에 맞춰 환영 배너와 핵심 기능 안내를 거쳐 홈으로 가고, 스타터 가이드가 첫 사용 순서를 알려 줍니다. 학생은 가입한 코스 확인, 수업 입장, 과제 제출, 공지 확인을, 교사는 데모 학생이 들어와 있는 체험 교실에서 수업 도구를 연습합니다.",
        steps: [
          "로그인 화면에서 가입한 아이디와 비밀번호를 입력합니다.",
          "모바일은 비밀번호 칸 아래 [약관 동의]에 체크한 뒤 로그인합니다.",
          "첫 로그인 화면에서 닉네임을 정합니다.",
          "역할을 고르는 화면이 나오면 학생은 학생, 강사는 교사를 고릅니다.",
        ],
      },
      {
        heading: "가입이 막힐 때",
        body: "인증코드가 오지 않거나, 가입은 했는데 로그인이 안 되면 아래를 차례로 확인합니다. 그 밖의 로그인 문제는 로그인이 안 될 때 문서에 모아 두었습니다.",
        steps: [
          "[인증코드 받기]가 눌리지 않으면 입력칸 아래 약관 동의에 체크했는지 봅니다.",
          "인증코드가 오지 않으면 국가 번호가 +82인지, 번호를 10부터 넣었는지 먼저 봅니다. 이메일이라면 주소에 오타가 없는지 봅니다. 인증 코드 화면의 타이머(59초)가 끝나면 인증번호를 다시 보냅니다.",
          "문자나 메일 스팸함을 확인합니다. 휴대폰에 해외 발신 문자 차단 서비스나 통신사 문자 차단이 켜져 있어도 인증 문자가 막힐 수 있습니다.",
          "그래도 오지 않으면 상담 채널(클래스인 공식 홈페이지 하단 채팅)로 문의합니다.",
          "로그인하니 계정이 없다고 나오면 인증코드 입력 단계에서 멈춰 가입이 끝나지 않은 것일 수 있습니다. [회원 가입]부터 다시 하고, 받은 인증코드와 비밀번호까지 입력합니다.",
          "모바일에서 로그인이 안 되면 비밀번호 칸 아래 [약관 동의]에 체크했는지 봅니다.",
          "가입 직후에는 메시지 보내기 같은 일부 기능이 잠시 제한될 수 있습니다. 막히면 상담 채널로 문의합니다.",
          "비밀번호가 기억나지 않으면 PC는 로그인 화면 하단 [비밀번호 변경], 모바일은 [비밀번호를 잊으셨나요?]에서 새로 정합니다.",
        ],
      },
      {
        heading: "학부모님께 보낼 안내 문구",
        body: "학원에서 학부모님께 설치와 가입을 부탁드릴 때 아래 문구를 그대로 복사해 보내도 됩니다.\n\n> 안녕하세요. 저희 학원 수업은 클래스인 앱에서 열립니다. 첫 수업 전에 설치와 가입을 부탁드립니다.\n> 1) 설치: 컴퓨터는 www.classin.com/kr/download 에서 설치 파일을 받아 실행하고, 휴대폰·태블릿은 앱 스토어나 플레이 스토어에서 '클래스인'을 검색해 설치해 주세요.\n> 2) 가입: 홈페이지가 아니라 설치한 앱을 열고 [회원 가입]을 눌러, 학생이 쓸 휴대폰 번호나 이메일로 가입해 주세요. 휴대폰 번호는 국가 번호 +82를 고르고, 010의 맨 앞 0을 빼고 입력해 주세요(예: 1012345678).\n> 3) 가입한 번호나 이메일을 학원으로 보내 주시면 수업 반에 등록해 드립니다.\n> 휴대폰에서 로그인이 안 되면 비밀번호 칸 아래 [약관 동의]에 체크해 주세요.",
      },
    ],
    relatedSlugs: ["pc-install", "mobile-install", "login-troubleshooting", "password-change-pc", "student-profile", "course-join"],
  },
  {
    slug: "password-change-pc",
    category: "start",
    title: "비밀번호 변경 (PC)",
    description: "PC에서 비밀번호가 기억나지 않거나 학원에서 받은 임시 비밀번호를 바꾸려면 로그인 화면 하단의 [비밀번호 변경]에서 시작합니다. 아이디로 인증코드를 받아 새 비밀번호를 정하고, 다시 로그인해 보면 끝입니다.",
    audience: "PC로 클래스인을 쓰는 학생, 학부모, 강사",
    updatedAt: "2026-09-24",
    readMinutes: 3,
    tags: ["비밀번호", "계정", "PC", "보안", "시작하기"],
    keywords: ["비밀번호 변경", "비밀번호 재설정", "PC", "인증코드", "자동 로그인", "비밀번호 기억", "로그인", "비밀번호 찾기", "비밀번호 분실", "임시 비밀번호", "로그인 안 됨", "국가 번호", "비밀번호 규칙", "비밀번호 조건", "비밀번호 오류", "비밀번호 몇 자리", "비밀번호 까먹었어요", "비번", "인증코드 안 와요", "잘못된 계정", "+82", "계정 및 보안이 없어요"],
    chatbotSummary: "PC 클래스인 로그인 화면 하단의 [비밀번호 변경]을 눌러 아이디(휴대폰 번호 또는 이메일)를 입력하고, [인증코드 받기]로 받은 코드를 넣은 뒤 새 비밀번호를 정합니다. 새 비밀번호는 영문과 숫자를 섞은 6~20자이고 한글, 한자, 특수문자, 공백은 쓸 수 없습니다. 학원에서 받은 임시 비밀번호도 같은 방법으로 바꿉니다. 인증코드가 오지 않으면 국가 번호 +82와 10으로 시작하는 번호 형식, 스팸함을 확인한 뒤 클래스인 공식 홈페이지 하단 채팅으로 문의합니다.",
    sections: [
      {
        heading: "비밀번호 변경 화면 열기",
        body: "비밀번호를 잊었을 때도, 학원에서 받은 임시 비밀번호를 바꿀 때도 설치한 프로그램의 로그인 화면에서 시작합니다. 공식 홈페이지는 학원 관리자용 페이지라서, 학생과 강사가 거기서 찾으면 [계정 및 보안] 메뉴가 보이지 않습니다.",
        steps: [
          "PC에서 클래스인을 실행합니다.",
          "경로: 로그인 화면 하단 > [비밀번호 변경]",
        ],
      },
      {
        heading: "인증코드 받고 새 비밀번호 정하기",
        body: "아이디는 가입할 때 쓴 휴대폰 번호나 이메일 주소입니다. 휴대폰 번호면 문자로, 이메일이면 메일로 인증코드가 옵니다.\n\n새 비밀번호는 6~20자로 영문과 숫자를 함께 넣어야 합니다. 한글, 한자, 특수문자, 공백은 쓸 수 없어서, 이런 글자가 들어가면 변경할 때 오류가 납니다.",
        steps: [
          "아이디(휴대폰 번호 또는 이메일 주소)를 입력합니다. 휴대폰 번호는 국가 번호 +82를 고르고 10부터 넣습니다.",
          "[인증코드 받기]를 누릅니다.",
          "문자나 이메일로 받은 인증코드를 입력합니다.",
          "새로 쓸 비밀번호를 입력해 변경을 마칩니다.",
        ],
      },
      {
        heading: "새 비밀번호로 다시 로그인하기",
        body: "바꾼 비밀번호로 한 번 로그인해 봅니다. 혼자 쓰는 컴퓨터라면 로그인할 때 [자동 로그인]이나 [비밀번호 기억]에 체크해 두세요. 다음부터 비밀번호를 다시 넣지 않아도 됩니다.",
      },
      {
        heading: "그래도 로그인이 안 될 때",
        body: "인증코드가 오지 않거나, 새 비밀번호로도 로그인이 안 되면 아래를 차례로 확인합니다. 증상별로 더 자세한 내용은 로그인이 안 될 때 문서에 있습니다.",
        steps: [
          "인증코드가 오지 않으면 아이디를 맞게 넣었는지 봅니다. 휴대폰 번호는 010의 맨 앞 0을 빼고 10부터, 이메일은 오타 없이 넣어야 합니다.",
          "문자나 메일 스팸함, 휴대폰의 해외 발신 문자 차단 서비스도 확인합니다.",
          "그래도 인증코드가 오지 않으면 상담 채널(클래스인 공식 홈페이지 하단 채팅)로 문의합니다.",
          "잘못된 계정 또는 비밀번호라고 나오면 번호 앞 국가 번호를 봅니다. PC 로그인 창은 국가 번호가 +1로 잡혀 있을 때가 있으니, 한국 번호라면 +82로 바꿉니다.",
          "로그인 버튼이 회색이면 아이디와 비밀번호가 둘 다 입력됐는지 확인합니다.",
          "아이디가 이메일인지 휴대폰 번호인지 헷갈리면 가입할 때 인증코드를 받은 쪽을 확인합니다. 학원이 만들어 준 계정이라면 임시 비밀번호를 받은 번호나 이메일이 아이디입니다.",
        ],
      },
    ],
    resources: [
      {
        label: "클래스인 공식 홈페이지",
        href: "https://www.classin.com/kr",
        description: "인증코드가 오지 않을 때 페이지 하단 채팅으로 문의하는 곳입니다.",
      },
    ],
    relatedSlugs: ["password-change-mobile", "login-troubleshooting", "signup", "pc-install"],
  },
  {
    slug: "password-change-mobile",
    category: "start",
    title: "비밀번호 변경 (모바일)",
    description: "휴대폰이나 태블릿에서는 로그인 화면 하단의 [비밀번호를 잊으셨나요?]에서 비밀번호를 새로 정합니다. 학원에서 받은 임시 비밀번호를 바꿀 때도 같습니다. 다시 로그인할 때 [약관 동의]에 체크해야 하는 것만 PC와 다릅니다.",
    audience: "휴대폰·태블릿으로 클래스인을 쓰는 학생, 학부모, 강사",
    updatedAt: "2026-09-24",
    readMinutes: 3,
    tags: ["비밀번호", "계정", "모바일", "보안", "시작하기"],
    keywords: ["비밀번호 변경", "모바일 비밀번호", "비밀번호 잊음", "인증코드", "약관 동의", "재로그인", "Classin", "비밀번호 찾기", "비밀번호 분실", "임시 비밀번호", "로그인 안 됨", "비밀번호 규칙", "비밀번호 조건", "비밀번호 오류", "비밀번호 몇 자리", "비밀번호 까먹었어요", "비번", "인증코드 안 와요", "+82"],
    chatbotSummary: "모바일 클래스인 로그인 화면 하단의 [비밀번호를 잊으셨나요?]를 눌러 아이디(휴대폰 번호 또는 이메일)를 입력하고, [인증코드 받기]로 받은 코드를 넣은 뒤 새 비밀번호를 정합니다. 새 비밀번호는 영문과 숫자를 섞은 6~20자입니다. 다시 로그인할 때는 비밀번호 칸 아래 [약관 동의]에 체크해야 로그인됩니다. 인증코드가 오지 않으면 번호 형식(+82, 10으로 시작)과 스팸함을 확인한 뒤, 휴대폰 브라우저로 클래스인 공식 홈페이지에 들어가 하단 채팅으로 문의합니다.",
    sections: [
      {
        heading: "비밀번호 변경 화면 열기",
        body: "비밀번호를 잊었을 때도, 학원에서 받은 임시 비밀번호를 바꿀 때도 설치한 앱의 로그인 화면에서 시작합니다.",
        steps: [
          "휴대폰이나 태블릿에서 클래스인 앱을 엽니다.",
          "경로: 로그인 화면 하단 > [비밀번호를 잊으셨나요?]",
        ],
      },
      {
        heading: "인증코드 받고 새 비밀번호 정하기",
        body: "아이디는 가입할 때 쓴 휴대폰 번호나 이메일 주소입니다. 휴대폰 번호면 문자로, 이메일이면 메일로 인증코드가 옵니다.\n\n새 비밀번호는 6~20자로 영문과 숫자를 함께 넣어야 합니다. 한글, 한자, 특수문자, 공백은 쓸 수 없어서, 이런 글자가 들어가면 변경할 때 오류가 납니다.",
        steps: [
          "아이디(휴대폰 번호 또는 이메일 주소)를 입력합니다. 휴대폰 번호는 국가 번호 +82를 고르고 10부터 넣습니다.",
          "[인증코드 받기]를 누릅니다.",
          "문자나 이메일로 받은 인증코드를 입력합니다.",
          "새로 쓸 비밀번호를 입력해 변경을 마칩니다.",
        ],
      },
      {
        heading: "약관 동의에 체크하고 다시 로그인하기",
        body: "모바일은 비밀번호 칸 아래 [약관 동의]에 체크해야 로그인됩니다. 새 비밀번호를 맞게 넣었는데도 로그인이 안 되면 이 체크부터 보세요.",
        steps: [
          "아이디와 새 비밀번호를 입력합니다.",
          "비밀번호 칸 아래 [약관 동의]에 체크합니다.",
          "로그인 버튼을 누르고 첫 화면이 열리는지 확인합니다.",
        ],
      },
      {
        heading: "인증코드가 오지 않을 때",
        body: "먼저 아이디를 맞게 넣었는지 봅니다. 휴대폰 번호라면 국가 번호가 +82인지, 010의 맨 앞 0을 빼고 10부터 넣었는지 확인합니다. 이메일이라면 주소에 오타가 없는지 봅니다. 학원이 만들어 준 계정이라면 임시 비밀번호를 받은 번호나 이메일이 아이디입니다.\n\n다음으로 문자나 메일 스팸함을 보고, 휴대폰에 해외 발신 문자 차단 서비스가 켜져 있는지도 확인합니다.\n\n그래도 오지 않으면 휴대폰 브라우저에서 클래스인 공식 홈페이지(classin.com/kr)를 열고 하단 채팅으로 문의합니다. 다른 로그인 문제는 로그인이 안 될 때 문서에, 컴퓨터에서 바꾸는 방법은 비밀번호 변경 (PC) 문서에 있습니다.",
      },
    ],
    relatedSlugs: ["password-change-pc", "login-troubleshooting", "mobile-install", "signup"],
  },
  {
    slug: "login-troubleshooting",
    category: "start",
    title: "로그인이 안 될 때",
    description: "아이디와 비밀번호를 넣었는데 로그인이 안 되거나, 로그인은 되는데 수업이 보이지 않을 때 증상별로 먼저 할 일입니다. 상담에서 자주 확인되는 원인은 휴대폰 번호 입력 형식, 홈페이지와 앱 혼동, 다른 아이디로 로그인한 경우입니다.",
    audience: "로그인이 막힌 학생, 학부모, 강사",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    docType: "troubleshooting",
    productArea: "onboarding",
    difficulty: "beginner",
    tags: ["로그인", "계정", "인증", "문제 해결", "시작하기"],
    keywords: ["로그인 안 돼요", "로그인이 안되요", "로그인이 자꾸 안 됩니다", "로그인 오류", "잘못된 계정", "잘못된 계정 또는 비밀번호", "비밀번호가 틀렸대요", "계정이 없대요", "+82", "010", "국가번호", "국가 번호", "번호 입력", "홈페이지 로그인", "웹 로그인", "관리자 페이지", "비즈니스 체험판이 떠요", "무료 버전 선택", "계정 및 보안이 없어요", "인증코드 안 와요", "문자가 안 와요", "인증번호", "스팸", "해외 문자 차단", "약관 동의", "비밀번호 분실", "비번", "가입한 이메일 모름", "아이디 찾기", "수업이 안 보여요", "코스가 안 보여요", "교실이 안 보여요", "수업 목록이 없어요", "입장 못해요", "다른 계정으로 로그인", "혼자만 들어가 있어요", "초대 수락", "코스 등록"],
    chatbotSummary: "로그인이 안 되면 먼저 공식 홈페이지가 아니라 설치한 앱이나 PC 프로그램에서 로그인하는지 확인합니다. 홈페이지 로그인은 학원 관리자용입니다. 휴대폰 번호 아이디는 국가 번호 +82를 고르고 010의 맨 앞 0을 뺀 10부터 입력하고, 모바일은 비밀번호 칸 아래 [약관 동의]에 체크해야 로그인됩니다. 로그인은 되는데 수업이 안 보이면 프로필에서 학원이 등록한 아이디로 로그인했는지, 코스 초대를 수락했는지 확인합니다. 인증코드가 오지 않으면 번호 형식, 스팸함, 문자 차단 설정을 본 뒤 공식 홈페이지 하단 채팅으로 문의합니다.",
    sections: [
      {
        heading: "잘못된 계정 또는 비밀번호라고 나올 때",
        body: "번호와 비밀번호가 맞는데도 이 문구가 뜬다면 휴대폰 번호 입력 형식부터 봅니다. 상담에서 가장 많이 확인되는 원인입니다.",
        steps: [
          "국가 번호를 +82로 고릅니다. PC 로그인 창은 국가 번호가 +1로 잡혀 있을 때가 있습니다.",
          "번호는 010의 맨 앞 0을 빼고 10부터 넣습니다. 1012345678처럼 입력합니다.",
          "가입할 때 쓴 아이디로 넣었는지 확인합니다. 이메일로 가입했으면 이메일로, 휴대폰 번호로 가입했으면 번호로 로그인해야 합니다.",
          "그래도 안 되면 비밀번호를 새로 정합니다. 방법은 아래 '비밀번호가 기억나지 않을 때'에 있습니다.",
        ],
      },
      {
        heading: "홈페이지에서 로그인했더니 체험판 선택 화면이 뜰 때",
        body: "공식 홈페이지의 로그인은 학원 관리자와 일부 강사가 쓰는 관리자 페이지입니다. 학생과 강사는 앱이나 PC 프로그램을 설치해서 그 안에서 로그인합니다. 홈페이지에서 [계정 및 보안] 메뉴를 찾을 수 없는 것도 같은 이유입니다.",
        steps: [
          "컴퓨터는 공식 다운로드 페이지에서, 휴대폰·태블릿은 앱 스토어나 플레이 스토어에서 클래스인을 설치합니다.",
          "설치한 프로그램(앱)을 열고 가입한 아이디로 로그인합니다.",
          "홈페이지에서 새로 가입해 체험판 사용자로 등록돼 버렸다면 상담 채널(클래스인 공식 홈페이지 하단 채팅)로 문의합니다.",
        ],
      },
      {
        heading: "로그인 버튼을 눌러도 들어가지지 않을 때",
        body: "모바일은 비밀번호 칸 아래 [약관 동의]에 체크해야 로그인됩니다. 체크한 뒤 다시 로그인하세요.\n\nPC에서 로그인 버튼이 회색이면 아이디와 비밀번호가 아직 다 입력되지 않은 상태입니다.",
      },
      {
        heading: "계정이 없다고 나올 때",
        body: "가입할 때 인증코드 입력 단계에서 멈췄다면 계정이 만들어지지 않은 상태입니다. 받은 인증코드를 넣고 비밀번호까지 정해야 가입이 끝납니다.",
        steps: [
          "앱에서 [회원 가입]을 다시 누릅니다. 아이디를 넣고 약관 동의에 체크한 뒤 [인증코드 받기]를 누르고, 인증 코드 입력과 비밀번호 설정까지 마칩니다.",
          "어떤 이메일로 가입했는지 모르겠다면, [회원 가입]에서 짐작 가는 이메일을 넣고 [인증코드 받기]를 눌러 봅니다. 이미 가입된 이메일이면 가입이 막히니, 그 이메일이 내 아이디입니다.",
          "확인한 이메일로 비밀번호를 새로 정합니다. PC는 로그인 화면 하단 [비밀번호 변경], 모바일은 [비밀번호를 잊으셨나요?]에서 합니다.",
          "학원이 만들어 준 계정이라면 임시 비밀번호 안내를 받은 휴대폰 번호나 이메일이 아이디입니다.",
        ],
      },
      {
        heading: "인증코드가 오지 않을 때",
        body: "인증코드는 휴대폰 번호 아이디면 문자로, 이메일 아이디면 메일로 옵니다. 아래 순서로 확인하세요.",
        steps: [
          "가입 중 [인증코드 받기]가 눌리지 않으면 입력칸 아래 약관 동의에 체크했는지 봅니다.",
          "국가 번호가 +82인지, 번호를 10부터 넣었는지 봅니다. 이메일이면 주소에 오타가 없는지 봅니다.",
          "인증 코드 화면의 타이머(59초)가 끝나면 인증번호를 다시 보냅니다.",
          "문자나 메일 스팸함을 확인합니다.",
          "휴대폰에 해외 발신 문자 차단 서비스나 통신사 문자 차단이 켜져 있으면 인증 문자가 막힐 수 있습니다.",
          "학원이 만들어 준 계정인데 임시 비밀번호 문자가 오지 않았다면 학원에도 알립니다. 같은 이유로 문자가 막혔을 수 있습니다.",
          "그래도 오지 않으면 상담 채널(클래스인 공식 홈페이지 하단 채팅)로 문의합니다.",
        ],
      },
      {
        heading: "비밀번호가 기억나지 않을 때",
        body: "로그인 화면에서 바로 새로 정합니다. PC는 하단의 [비밀번호 변경], 모바일은 하단의 [비밀번호를 잊으셨나요?]를 누르고, 아이디로 인증코드를 받아 새 비밀번호를 입력합니다. 모바일 로그인 화면에는 비밀번호 대신 인증 코드로 들어가는 [인증 코드로 로그인]도 있습니다.\n\n새 비밀번호는 6~20자로 영문과 숫자를 함께 넣어야 하고, 한글, 한자, 특수문자, 공백은 쓸 수 없습니다. 자세한 순서는 비밀번호 변경 (PC), 비밀번호 변경 (모바일) 문서에 있습니다.",
      },
      {
        heading: "로그인은 되는데 수업이나 코스가 보이지 않을 때",
        body: "가장 먼저 지금 로그인한 아이디를 봅니다. 자동 로그인 때문에 학원이 등록한 아이디가 아니라 예전 이메일 계정이나 새로 만든 계정으로 들어가 있던 사례가 있습니다. 선생님과 학생이 각자 교실에 혼자 들어가 있다면 이 경우부터 의심하세요.",
        steps: [
          "프로필(모바일은 왼쪽 위, PC는 왼쪽 아래)을 눌러 지금 로그인한 아이디가 학원이 등록한 아이디인지 확인합니다.",
          "다르면 로그아웃하고, 학원이 등록한 아이디로 다시 로그인합니다. 휴대폰 번호라면 +82를 고르고 10부터 넣습니다.",
          "코스 초대를 받았다면 초대를 눌러 수락했는지 확인합니다. 수락하지 않으면 코스와 수업이 보이지 않을 수 있습니다.",
          "앱이 오래된 버전이면 최신 버전으로 업데이트합니다. PC는 공식 다운로드 페이지에서, 휴대폰·태블릿은 스토어에서 받습니다.",
          "그래도 수업이 없다면 학원에 코스 등록을 요청합니다. 코스와 수업에 학생을 넣는 일은 클래스인 상담이 아니라 수업을 운영하는 학원이 합니다.",
        ],
      },
      {
        heading: "문의할 때 함께 보내 주세요",
        body: "위 방법으로 해결되지 않으면 상담 채널(클래스인 공식 홈페이지 하단 채팅)로 문의하세요. 아래 정보를 같이 보내면 원인을 더 빨리 찾습니다.",
        steps: [
          "문제를 겪은 사람의 클래스인 아이디(+82로 시작하는 휴대폰 번호 또는 이메일)",
          "쓰는 기기(윈도우 PC, 맥, 휴대폰, 태블릿)와 어느 화면에서 무엇이 안 되는지",
          "화면에 뜬 문구가 보이는 화면 캡처",
          "수업이 안 보이는 경우라면 수업 이름과 시작 날짜·시각",
        ],
      },
    ],
    relatedSlugs: ["password-change-pc", "password-change-mobile", "signup", "course-join", "pc-install", "mobile-install"],
  },
  {
    slug: "admin-operation-standardization",
    category: "admin",
    title: "관리자 운영 표준화 간이 가이드",
    description: "클래스인을 막 들인 학원이라면 첫 수업 전후로 운영 기준부터 세웁니다. 원장·실장이 정할 권한과 자료 저장 위치, 수업 전·중·후 점검, EDB 교안, API 연동 기관의 생성 원칙, 주간 점검표를 관리자 콘솔의 실제 메뉴와 짝지어 봅니다.",
    audience: "원장·실장, 운영팀, 지점장, 도입 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 12,
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
      "주간 점검표",
      "강사 퇴사 인수인계",
      "하위 계정 추가",
      "홈페이지 연동",
      "워드프레스",
      "CRM 연동",
      "자동 계정 생성",
      "관리자 페이지",
      "관리자 페이지 한국어",
      "홈페이지 로그인",
    ],
    chatbotSummary: "관리자 운영 표준화 가이드는 클래스인을 도입한 학원의 원장·실장이 먼저 정할 운영 기준을 다룹니다. 관리자 콘솔은 홈, 기관 관리, 스토리지, 학습 관리, 관리자 기능, 결제, 계정 정보 메뉴로 나뉘고, 홈에서 계정 잔액·서비스 버전·서비스 기간·코스·교사·학생 현황을 봅니다. API 기능이 켜진 기관은 콘솔에서 코스·수업·교사·학생을 새로 만들면 자체 관리 시스템과 자동 동기화되지 않으므로, 연동을 유지하려면 자체 관리 시스템에서 만들어야 합니다.",
    sections: [
      {
        heading: "기능보다 기준을 먼저 정하는 이유",
        body: "클래스인을 들인 초기에 흔들리는 건 대개 기능이 아니라 기준입니다. 반 이름을 강사마다 다르게 짓고, 녹화본은 누구는 올리고 누구는 안 올리고, 휴강 공지는 단톡방에 묻힙니다. 아래 중 두 개 이상이 지금 학원 이야기라면, 기능을 하나씩 익히기 전에 이 문서 순서대로 기준부터 정하세요.",
        steps: [
          "강사마다 수업 운영 방식이 달라 반끼리 비교가 안 된다.",
          "수업 자료, 녹화본, 숙제, 시험, 피드백이 여러 도구에 흩어져 있다.",
          "강사가 그만두거나 대체 강사가 들어오면 인수인계가 흔들린다.",
          "학원 공지와 수업 질문이 외부 메신저에 섞여 빠지는 안내가 생긴다.",
          "나중에 리포트나 AI 분석에 쓸 수업 기록을 지금부터 쌓고 싶다.",
        ],
      },
      {
        heading: "처음 세팅할 때 정할 이름과 저장 위치",
        body: "계정을 만들기 전에 이름 규칙과 저장 위치부터 정하세요. 반과 코스를 나누는 기준, 수업명, 교사 배정, 자료를 둘 곳, 녹화와 다시보기 기준이 먼저 서 있으면 운영팀과 강사가 같은 화면을 보고 같은 판단을 합니다.",
        steps: [
          "반과 코스를 학년, 레벨, 과목, 지점 중 무엇을 기준으로 나눌지 정합니다.",
          "수업명에는 날짜, 과목, 레벨, 담당 교사를 넣습니다. 관리자 콘솔의 [코스 관리]와 [수업 관리]는 이름, 교사, 기간으로 검색하기 때문에 이름 규칙이 곧 검색 규칙입니다.",
          "교사 권한은 담당 반과 그 반에 필요한 자료만큼만 줍니다.",
          "수업 자료는 강사 개인 드라이브가 아니라 [스토리지] > [공유 드라이브]에 둡니다. 과목, 학년, 레벨별로 폴더를 나누고 폴더마다 구성원과 권한을 따로 줍니다.",
          "숙제, 시험, 다시보기 제공 기준은 반마다 따로 만들기 전에 학원 공통 기준부터 정합니다.",
        ],
      },
      {
        heading: "관리자 콘솔 메뉴는 이렇게 나뉩니다",
        body: "웹 관리자 콘솔과 클래스인 앱은 하는 일이 다릅니다. 앱은 강사가 수업과 학습 활동을 운영하는 곳이고, 관리자 콘솔은 학원 전체의 계정, 코스, 수업, 스토리지, 결제, 권한을 보는 곳입니다. 관리자 콘솔은 한국어를 지원합니다.\n\n공식 홈페이지에서 로그인하는 화면은 원장·실장 같은 기관 관리자와 일부 강사를 위한 관리자 페이지입니다. 학생과 일반 강사는 기기에 클래스인 앱이나 프로그램을 설치해 가입하고 로그인해야 합니다. 홈페이지에서 로그인했다가 요금제 선택 화면이 떠서 막혔다는 문의가 꾸준히 들어오니, 강사와 학생에게 처음부터 알려 주세요.\n\n메뉴마다 들어 있는 것은 아래와 같습니다.",
        steps: [
          "[홈]에서 계정 잔액, 서비스 버전과 서비스 기간, 진행 중인 코스, 교사 수, 학생 수, 공지사항을 봅니다.",
          "[기관 관리]에서 코스, 수업, 공개 수업, 교사, 학생을 관리합니다. 교사 등록과 코스 담임 교사 변경도 여기서 합니다.",
          "[스토리지]의 데이터 개요에서 사용 용량과 전체 용량을 보고, 공유 드라이브, 문제 은행, 수업 리소스, 코스 데이터, 리소스 센터를 관리합니다.",
          "[학습 관리]에는 라이브&플레이백, 학습 데이터, 교사 개발, 숙제 관리, 시험 관리가 있습니다. 웹 라이브 링크와 시청 데이터는 라이브&플레이백에서 봅니다.",
          "[관리자 기능]의 수업 모니터링에서 지금 진행 중인 수업을 실시간으로 봅니다. 사용자 정보도 이 메뉴에 있습니다.",
          "[결제]에는 결제 개요, 주문 세부정보, 통계 다운로드, 영수증 관리가 있습니다. 요금과 결제 조건은 상담 채널로 문의합니다.",
          "[계정 정보]에는 인증 자료, 일반 설정, 통계 이력, 권한 관리, API 도킹, 학습 인원 구성, 제품 설명서가 있습니다. 계정 인증과 하위 계정 권한은 여기서 처리합니다.",
        ],
      },
      {
        heading: "권한은 좁게, 자료는 학원에",
        body: "운영에서 제일 곤란한 순간은 강사가 그만둘 때입니다. 수업 권한과 자료가 그 사람의 개인 계정, 임시 링크, 외부 메신저, 개인 드라이브에 있으면 학원이 손쓸 곳이 없습니다. 권한은 필요한 만큼만 주고, 자료는 처음부터 학원 공간에 두세요.",
        steps: [
          "관리자 권한은 원장과 소수 담당자에게만 줍니다. [일반 설정]은 학원에서 만드는 코스와 수업 전체에 한꺼번에 적용되기 때문입니다.",
          "교사는 [기관 관리] > [교사] > [교사 추가]로 등록합니다. 앱에서 직접 코스를 만들고 관리하게 할 교사에게만 [계정 정보] > [권한 관리] > [하위 계정 추가]로 메뉴 권한을 더 줍니다.",
          "학생이 자기 반과 수업에만 들어가 있는지 코스 구성원을 점검합니다.",
          "강사가 그만두거나 대체 강사가 들어오면 그날 계정 권한, 자료 접근, 담당 수업을 정리합니다. 코스의 담임 교사는 [코스 관리]에서 바꿉니다.",
          "하위 계정 권한을 받은 강사가 그만둘 때는 순서가 있습니다. [권한 관리]에서 하위 계정 권한을 먼저 지워야 교사 목록에서 뺄 수 있습니다.",
          "공유 드라이브는 구성원마다 관리자, 컨텐츠 관리자, 읽기 전용, 감추기 중 하나로 권한을 나누고 주기적으로 다시 봅니다.",
        ],
      },
      {
        heading: "수업 전·중·후에 확인할 것",
        body: "관리자가 볼 것은 '수업이 열렸는가'에서 끝나지 않습니다. 수업이 끝난 뒤 녹화본, 필기, 숙제 제출 같은 기록이 남아 있어야 한 수업이 끝난 것입니다.",
        steps: [
          "수업 전에는 수업이 개설됐는지, 학생이 배정됐는지, 자료와 EDB가 올라가 있는지, 숙제와 시험이 미리 만들어져 있는지 봅니다.",
          "수업 중에는 [관리자 기능] > [수업 모니터링]에서 진행 중인 수업과 교사·학생의 출석을 봅니다. 접속이 불안정한 학생은 같은 화면에서 접속 기기 정보를 확인합니다.",
          "관리자가 진행 중인 교실에 들어가도 교사와 학생에게는 입장 사실이 전달되지 않습니다. 수업 흐름을 끊지 않고 볼 수 있습니다.",
          "수업 후에는 다시보기가 열렸는지, 필기가 저장·공유됐는지, 숙제 제출과 시험 결과, 피드백 기록이 남았는지 봅니다.",
          "결석한 학생은 다시보기를 봤는지, 보강 과제를 냈는지까지 확인합니다.",
          "수업 중 문제가 생겨 상담 채널에 문의할 때는 수업 이름(관리자 콘솔에 보이는 그대로), 문제를 겪은 사람의 클래스인 아이디, 수업 시작 날짜와 시각을 함께 보냅니다. 아이디가 없으면 원인을 확인하기 어렵습니다.",
        ],
      },
      {
        heading: "EDB로 수업 템플릿 만들기",
        body: "EDB는 판서, 이미지, 텍스트가 그대로 살아 있는 클래스인 칠판 파일입니다. 잘 가르치는 강사의 수업 한 편을 EDB로 남겨 두면 신규 강사는 빈 화면이 아니라 그 파일에서 준비를 시작하고, 지점이 달라도 같은 흐름으로 수업합니다.",
        steps: [
          "과목, 레벨, 커리큘럼별로 반복해서 쓸 EDB를 정합니다.",
          "잘 가르치는 강사의 자료, 판서 흐름, 활동 구성, 문제 풀이 방식을 학원 표준 EDB로 옮깁니다.",
          "신규 강사는 기존 EDB를 열어 수업 준비를 시작하게 합니다.",
          "시험 대비, 레벨테스트, 개념 설명, 토론 수업처럼 목적별로 EDB를 묶어 공유 드라이브에 둡니다.",
          "학기가 바뀔 때마다 EDB를 손보고, 더 쓰지 않는 파일은 따로 보관하거나 지웁니다. 공유 드라이브에서 지운 자료는 복구되지 않으니 지우기 전에 한 번 더 확인하세요.",
        ],
      },
      {
        heading: "숙제·시험·다시보기 운영 기준",
        body: "수업 뒤 관리가 강사의 기억이나 손에 기대면 빠지는 반이 생깁니다. 녹화, 다시보기, 필기 저장, 숙제, 시험을 학원 기준 하나로 묶어 두세요.",
        steps: [
          "정규 수업은 녹화가 켜져 있는지를 기본 점검 항목으로 둡니다.",
          "다시보기를 어느 범위까지, 얼마 동안 열어 줄지 반별로 정합니다. 코스에 새로 들어온 학생이나 중간에 나간 학생의 다시보기는 [일반 설정] > [수업 다시보기]에서 정합니다.",
          "녹화본과 수업 캡처는 쌓일수록 학원 스토리지 용량을 차지하고, 무료로 제공되는 범위는 요금제·계약마다 달라 상담 채널에서 확인합니다. 자동 삭제는 기본으로 꺼져 있어 켜지 않으면 지워지지 않습니다. [일반 설정] > [저장 설정]에서 자동 삭제 기간을 정하고, 오래 남겨야 할 수업은 [수업 리소스]에서 자물쇠 아이콘을 눌러 보호 잠금을 겁니다.",
          "판서와 수업 자료 위에 쓴 필기를 자동 저장하려면 [일반 설정] > [칠판 내용 및 수업자료 보관]에서 설정합니다. 저장된 필기도 학원 스토리지 용량에 들어갑니다.",
          "숙제와 시험은 수업이 끝난 뒤 따로 공지하지 말고 수업 계획 단계에서 미리 만들어 둡니다.",
          "학부모 상담 전에는 출석, 다시보기, 숙제 제출, 시험 결과를 한 번에 확인합니다.",
        ],
      },
      {
        heading: "공지와 수업 질문은 나눠서 받기",
        body: "학원 공지와 수업 질문이 한곳에 섞이면 휴강 안내가 질문 사이에 묻히고, 나중에 무슨 안내를 했는지 찾기도 어렵습니다. 전체 공지와 반별 학습 소통을 나눠 두세요.",
        steps: [
          "학원 공지 채널에는 휴강, 보강, 일정, 결제, 정책 안내처럼 전체에 해당하는 내용만 올립니다.",
          "수업 소통은 질문, 숙제 피드백, 자료 공유, 보강 안내처럼 그 반의 학습에 관한 것만 다룹니다.",
          "학생용 안내와 학부모용 안내는 문구와 보내는 곳을 따로 둡니다.",
          "외부 메신저에서만 정해진 일은 클래스인 쪽 기록으로 옮겨 둡니다.",
          "반별 공지가 제대로 전달됐는지, 주요 소통 기록이 남았는지 주기적으로 봅니다.",
        ],
      },
      {
        heading: "강사들에게 보낼 기준 안내 문구",
        body: "기준을 정했으면 강사 전체에게 한 번에 알립니다. 아래 문구에서 이름 규칙과 공지 채널만 학원에 맞게 바꿔 보내세요.\n\n> 선생님들께 안내드립니다. 이번 달부터 수업 자료는 공유 드라이브의 과목별 폴더에 올려 주세요. 수업명은 '날짜_과목_레벨_강사명' 형식으로 만들고, 정규 수업은 녹화를 켜 둡니다. 숙제와 시험은 수업을 만들 때 함께 등록해 주세요. 휴강·보강 같은 학원 공지는 공지 채널로, 학생 질문은 클래스인 코스 안에서 받아 주시면 됩니다. 선생님과 학생 모두 홈페이지가 아니라 클래스인 앱으로 로그인해 주세요.",
      },
      {
        heading: "API로 자체 시스템과 연결한 기관이라면",
        body: "클래스인은 API를 제공합니다. 계정 생성과 관리, 수업 개설, 수업 입장, 스케줄 관리처럼 앱과 관리자 콘솔에서 하는 일을 API로 연결합니다. 학원 홈페이지(예를 들어 워드프레스)와 붙일 때는 홈페이지 쪽에서 API를 호출하도록 개발 작업이 필요합니다. 기존 LMS, CRM, 학사관리 시스템과 어디까지, 어떤 방식으로 연결할지는 계약 조건과 공식 API 문서를 기준으로 담당자와 정합니다.\n\n이미 API 기능이 켜진 기관은 한 가지를 꼭 지켜야 합니다. 관리자 콘솔에는 여기서 새로 만든 코스, 수업, 교사, 학생이 자체 관리 시스템과 자동 동기화되지 않는다는 경고가 뜹니다. 연동을 유지하려면 자체 관리 시스템에서 만들어야 합니다.",
        steps: [
          "지금 자체 LMS, CRM, 학사관리 시스템과 클래스인이 연동돼 있는지 먼저 확인합니다.",
          "연동 중이라면 코스, 수업, 교사, 학생은 자체 관리 시스템에서 만드는 것을 원칙으로 합니다.",
          "어디에서 만들어야 하는지 운영팀과 강사에게 미리 알립니다. 이 기준이 없으면 계정 중복, 수업 누락, 데이터 불일치가 생깁니다.",
          "콘솔에서 이미 만든 데이터를 자체 시스템과 어떻게 맞출지는 계약과 API 설계를 보고 담당자와 확인합니다.",
          "새로 연동을 검토한다면 사용자, 교실, 자료, 수업 기록 중 무엇을 주고받을지부터 정합니다. 상담용 CRM이라면 출석, 결석, 숙제 미제출, 시험 결과가, 학사관리 시스템이라면 수업 일정, 반, 교사, 학생 정보가 필요합니다.",
          "API 도킹 메뉴는 [계정 정보]에 있습니다. 인증 정보와 실제 연동 범위는 공식 API 문서와 담당자 안내를 따릅니다.",
          "지점별 대시보드나 AI 분석은 수업 운영이 표준화되고 기록이 빠짐없이 쌓인 다음에 검토합니다.",
        ],
      },
      {
        heading: "관리자 주간 점검표",
        body: "매주 같은 요일에 아래 항목을 봅니다. 누구를 감시하려는 게 아니라, 빠진 수업과 학생을 문제가 커지기 전에 찾으려는 루틴입니다.",
        steps: [
          "[기관 관리] > [수업 관리]에서 이번 주 수업 수와 진행되지 않았거나 취소된 수업을 확인합니다.",
          "출석률이 낮은 반과 결석이 반복되는 학생을 찾습니다. 수업별 출결과 입장·퇴장 기록은 [스토리지] > [수업 리소스]의 [수업 스크린샷]에서도 보입니다.",
          "녹화가 빠진 수업과 다시보기를 열지 않은 수업을 확인합니다.",
          "[학습 관리]의 [숙제 관리]와 [시험 관리]에서 숙제·시험이 세팅되지 않은 반과 과제를 내지 않은 학생을 확인합니다.",
          "강사들이 학원 표준 EDB와 공유 드라이브 자료를 쓰고 있는지, 반마다 운영 방식이 벌어지지 않았는지 봅니다.",
          "퇴사자, 대체 강사, 신규 강사처럼 권한을 바꿔야 할 계정이 남아 있지 않은지 봅니다.",
          "한 달에 한 번은 [결제] > [통계 다운로드]에서 기간별 수업 횟수와 스토리지 사용량을 엑셀로 받아 둡니다. 수업일자, 수업 시간, 담당 교사, 출석 학생 수가 함께 나옵니다.",
        ],
      },
    ],
    resources: [
      {
        label: "클래스인 소프트웨어 소개",
        href: "/product/sw",
        description: "수업 도구, 학습 활동, LMS, AI, 데이터 기능이 어떻게 이어지는지 봅니다.",
      },
      {
        label: "ClassIn API 문서",
        href: "https://docs.classinpaas.com/api/en/introduction.html",
        description: "기관 시스템 연동을 검토할 때 공식 API 제공 범위와 인증 방식을 여기서 확인하세요.",
      },
    ],
    relatedSlugs: [
      "institution-settings",
      "teacher-onboarding",
      "shared-drive",
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
    description: "원장·운영팀이 우리 학원이 사람에 기대어 돌아가는지, 기준으로 돌아가는지 직접 점검하는 32문항 체크리스트입니다. 수업, 출결·과제·복습, 학부모 상담, 강사 인수인계, 원장 업무 다섯 영역으로 나뉘고 점수대별 해석이 붙어 있습니다.",
    audience: "원장·실장, 운영팀, 지점장, 도입 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 8,
    status: "review",
    visibility: "unlisted",
    noindex: true,
    docType: "guide",
    productArea: "admin",
    difficulty: "beginner",
    tags: ["운영 체크리스트", "학원 시스템화", "강사 인수인계", "학부모 상담"],
    keywords: ["학원 운영 체크리스트", "강사 교체", "수업 표준화", "과제 관리", "출결 관리", "학부모 상담", "원장 업무 자동화", "학원 시스템화", "운영 진단", "자가 점검"],
    chatbotSummary: "이 체크리스트는 학원 운영이 강사 개인기나 원장 기억에 기대는지, 기준으로 반복되는지 점검합니다. 수업 표준화, 출결·과제·복습, 학부모 커뮤니케이션, 강사 운영과 인수인계, 원장 업무 자동화 5개 영역 32문항이며, 실제로 반복 운영되는 항목만 1점으로 셉니다. 점수가 낮은 영역이 개선을 시작할 곳입니다.",
    sections: [
      {
        heading: "점수 매기는 법",
        body: "문항마다 지금 학원 상태 그대로 체크합니다. 실제로 매주 반복되는 항목만 1점, 아니거나 아직 들쭉날쭉하면 0점입니다. 모두 32문항이라 32점 만점입니다. 점수는 합격선이 아니라 어디부터 손볼지 정하는 출발점으로 쓰세요.",
        steps: [
          "원장, 운영팀, 강사가 같은 문항을 같은 기준으로 읽습니다. 사람마다 답이 갈리는 문항은 아직 기준이 없는 것입니다.",
          "지금 실제로 반복해서 돌아가는 항목만 1점으로 체크합니다.",
          "담당자 한 명이 기억하고 있거나 그때그때 처리하는 일은 0점으로 둡니다.",
          "점수가 낮은 영역부터 클래스인 도입이나 운영 개선 순서를 정합니다.",
        ],
      },
      {
        heading: "1. 수업 표준화",
        body: "수업 품질이 특정 강사의 감각에 묶여 있지 않은지 봅니다.",
        steps: [
          "강사가 바뀌어도 같은 수업 흐름을 유지할 수 있다.",
          "수업 자료와 판서 자료가 강사 개인 PC가 아니라 학원 공간에 있다.",
          "반별 진도, 과제, 복습 기준을 원장이나 운영팀이 확인할 수 있다.",
          "신규 강사가 1주 안에 학원식 수업 기준을 파악할 수 있다.",
          "에이스 강사의 수업 방식이 다른 강사에게 넘겨줄 수 있는 형태로 남아 있다.",
          "같은 교재를 쓰는 반끼리 수업 품질 차이를 확인할 수 있다.",
        ],
      },
      {
        heading: "2. 출결, 과제, 복습 관리",
        body: "학생별 학습 흐름이 수업이 끝난 뒤까지 이어지는지 봅니다.",
        steps: [
          "결석, 지각, 보강 대상 학생을 한 화면에서 확인할 수 있다.",
          "과제를 내지 않은 학생이 따로 찾지 않아도 보인다.",
          "복습이 필요한 학생을 수업 직후 바로 가려낼 수 있다.",
          "상담 전에 학생별 누적 학습 기록을 확인할 수 있다.",
          "수업 기록, 과제 기록, 복습 기록이 따로 흩어져 있지 않다.",
          "빠진 학생을 원장이 기억에 의지해 찾지 않아도 된다.",
        ],
      },
      {
        heading: "3. 학부모 커뮤니케이션",
        body: "상담과 안내가 기록을 보고 이루어지는지 봅니다.",
        steps: [
          "학부모 상담 때 강사의 기억이 아니라 기록을 보고 이야기한다.",
          "학부모에게 보여 줄 수업, 과제, 복습 기록이 있다.",
          "반복되는 질문을 매번 처음부터 설명하지 않는다.",
          "수업 후 피드백이나 리포트를 보내는 기준이 정해져 있다.",
          "상담 이력이 다음 상담자에게 넘어간다.",
          "불만이나 그만두려는 신호를 늦게 알아채지 않는다.",
        ],
      },
      {
        heading: "4. 강사 운영과 인수인계",
        body: "강사 교체, 대체 수업, 신규 강사 적응이 운영 품질을 흔들지 않는지 봅니다.",
        steps: [
          "강사별 수업 품질을 확인하는 기준이 있다.",
          "신규 강사 온보딩 자료가 말로만 전해지지 않는다.",
          "강사가 그만둔 뒤에도 수업 자료와 학생 기록이 학원에 남는다.",
          "대체 강사가 들어와도 학생별 상황을 빨리 파악할 수 있다.",
          "강사에게 반복해서 안내하는 운영 규칙이 문서나 시스템에 남아 있다.",
          "원장이 직접 나서지 않아도 강사가 다음에 할 일을 확인할 수 있다.",
        ],
      },
      {
        heading: "5. 원장 업무 자동화",
        body: "원장이 직접 챙겨야만 굴러가는 일이 얼마나 되는지 봅니다.",
        steps: [
          "원장이 직접 확인해야만 진행되는 일이 줄고 있다.",
          "처리 안 된 학생, 안 낸 과제, 상담이 필요한 학생을 한 화면에서 볼 수 있다.",
          "운영 데이터를 보고 다음 할 일을 정한다.",
          "여러 도구에 흩어진 데이터를 손으로 합치지 않는다.",
          "수업 운영과 학부모 소통이 한 흐름으로 이어져 있다.",
          "지점이나 반이 늘어도 같은 기준을 적용할 수 있다.",
          "운영 개선을 감이 아니라 기록을 두고 논의한다.",
          "원장이 바쁜 날에도 기본 운영 품질이 유지된다.",
        ],
      },
      {
        heading: "점수 해석",
        body: "총점은 지금 운영이 사람에게 기대는지, 기준으로 반복되는지 보는 출발점입니다. 같은 점수대라도 영역별 점수가 고르지 않다면 가장 낮은 영역부터 봅니다.",
        steps: [
          "0~10점은 개인기 의존형입니다. 수업 기록, 과제 기준, 상담 이력부터 남기기 시작하세요.",
          "11~20점은 부분 자동화형입니다. 따로따로 남는 기록을 학생 한 명 단위로 이어 붙이는 것이 다음 단계입니다.",
          "21~28점은 시스템 전환기입니다. 강사 인수인계와 학부모 리포트까지 기준으로 돌아가면 원장이 직접 챙길 일이 줄어듭니다.",
          "29점 이상은 확장 준비형입니다. 지점을 늘리거나 강사가 바뀌어도 같은 품질을 유지할 기반이 있습니다.",
        ],
      },
      {
        heading: "점수가 낮게 나온 영역이 있다면",
        body: "점수가 낮은 칸이 대개 지금 손이 가장 많이 가는 업무입니다. 클래스인은 수업, 출결, 과제, 복습 리포트, 학부모 안내를 한 흐름으로 이어, 강사 개인에게 남던 기록을 학원에 남기는 데 초점을 둡니다.\n\n전체를 한 번에 바꾸려 하기보다 낮게 나온 영역 두세 개를 골라 상담에 가져오세요. 대표 수업 한 편으로 그 부분부터 같이 확인합니다.",
      },
    ],
    relatedSlugs: [
      "admin-operation-standardization",
      "adoption-journey-90days",
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
    description: "무료로 가입한 클래스인을 학원에서 정식으로 쓰려면 유료 계정으로 바꿔야 합니다. 원장·실장이 메인 관리자 계정을 정하고, 요금제를 고르고, 결제한 뒤 계정 인증으로 넘어가기까지의 순서입니다.",
    audience: "원장·실장, 운영 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    tags: ["요금제", "결제", "전환", "프로", "비즈니스"],
    keywords: ["유료 전환", "요금제 선택", "프로 요금제", "비즈니스 요금제", "결제", "플랜", "무료 체험판", "메인 관리자 계정", "세금계산서", "잔여 금액", "업그레이드", "결제 방법", "체험 종료", "비즈니스 체험", "체험판 자동결제", "녹화 조건", "녹화 권한", "홈페이지 로그인", "비즈니스 체험판이 떠요"],
    chatbotSummary: "클래스인은 회원 가입 후 무료 버전으로 시작하고, 학원에서 쓰려면 유료 계정 전환이 필요합니다. 공식 홈페이지에서 메인 관리자로 쓸 아이디로 로그인해 요금제를 고르고(1인 강사는 프로, 강사 2명 이상 학원은 비즈니스 추천), [지금 구매] 또는 [무료 체험판 시작]을 누른 뒤 팝업에 학원명·비즈니스 범위·장소·담당자 이름을 입력합니다. 정확한 금액과 할인 조건은 운영 규모와 시기에 따라 달라 상담에서 안내하며, 전환 후 계정 인증까지 마쳐야 수업 녹화와 웹 라이브가 풀립니다.",
    sections: [
      {
        heading: "유료 전환이 필요한 때",
        body: "클래스인은 회원 가입을 마치면 무료 버전으로 시작합니다. 학원(기관)에서 클래스인을 쓰려면 유료 계정으로 전환해야 합니다. 전환한 뒤에도 계정 인증을 마쳐야 수업 녹화와 웹 라이브 같은 기능이 풀리니, 전환과 인증을 한 번에 끝낸다고 생각하고 준비하세요.\n\n결제 전에 우리 학원이 매주 반복해서 돌릴 수업 흐름을 한 줄로 적어 보세요. 예를 들면 '전자칠판 판서 수업을 녹화해 복습으로 주고 숙제로 이어 간다' 같은 문장입니다. 이 한 줄이 있으면 상담에서 필요한 규모와 기능이 빨리 좁혀집니다.",
      },
      {
        heading: "결제 버튼을 누르기 전에",
        body: "전환 자체는 몇 분이면 끝납니다. 다만 메인 관리자 계정과 학원 정보는 계정 인증과 이후 운영에 계속 쓰이니 먼저 정해 두세요.",
        steps: [
          "누구 아이디로 로그인할지 정합니다. 전환할 때 로그인한 아이디가 그대로 학원의 메인 관리자 계정이 됩니다. 언제든 그만둘 수 있는 강사 개인 아이디보다 원장 본인이나 학원 공용 운영 아이디를 쓰세요.",
          "운영 규모를 적어 둡니다. 강사 수, 동시에 열리는 수업 수, 예상 학생 수가 있으면 요금제 상담이 빨라집니다.",
          "팝업에 넣을 학원 정보를 준비합니다. 학원명, 비즈니스 범위, 소재 국가와 도시, 담당자 이름입니다. 학원명과 소재지는 계정 인증 때 올릴 사업자등록증과 똑같이 적습니다.",
          "세금계산서, 영수증, 환불처럼 결제 뒤에 처리할 일은 결제 전에 상담 채널에서 방법을 묻고, 학원 회계 담당과 처리 방식을 맞춥니다.",
          "금액, 할인, 결제 주기는 운영 규모와 시기에 따라 달라집니다. 화면이나 광고에 보이는 숫자로 정하지 말고 상담에서 확인하세요.",
        ],
      },
      {
        heading: "프로와 비즈니스 중 고르기",
        body: "공식 안내 기준은 간단합니다. 1인 강사는 프로 요금제, 강사가 2명 이상인 학원은 비즈니스 요금제를 추천합니다. 프로로 시작했다가 나중에 비즈니스로 바꿀 수도 있으니, 지금 혼자라면 규모가 커질 때를 미리 걱정하지 않아도 됩니다. 바꿀 때가 되면 상담 채널로 문의하세요.",
        steps: [
          "혼자 수업하고 관리와 결제까지 직접 한다면 프로 요금제를 봅니다. 프로는 결제하면 바로 정식 서비스가 시작됩니다.",
          "강사가 2명 이상이거나 운영팀이 따로 있어 권한을 나눠야 한다면 비즈니스 요금제를 봅니다. 비즈니스는 체험판으로 먼저 시작합니다.",
          "요금제별 결제 방식과 금액, 체험 기간과 혜택은 시기에 따라 달라질 수 있어 상담 채널에서 확인합니다. 체험이 끝난 뒤 어떻게 되는지, 체험을 그만두려면 어떻게 하는지도 같은 채널로 물어보세요.",
          "어느 쪽이 맞는지 애매하면 요금제 화면의 [상담 요청하기]를 누릅니다. 학원 운영 형태에 맞는 요금제를 추천받습니다.",
        ],
      },
      {
        heading: "전환 절차",
        body: "메인 관리자로 쓸 아이디와 학원 정보가 준비됐다면 아래 순서대로 하면 됩니다.",
        steps: [
          "클래스인 공식 홈페이지 로그인 페이지에서 메인 관리자로 쓸 아이디로 로그인합니다.",
          "사용할 요금제를 고릅니다.",
          "요금제에 맞춰 [지금 구매] 또는 [무료 체험판 시작]을 누릅니다.",
          "팝업에 회사 이름(학원명), 비즈니스 범위, 장소(나라와 도시), 당신의 이름(담당자 이름)을 입력합니다. 비즈니스 범위에 맞는 항목이 없으면 [해당 없음]을 고릅니다.",
          "전환이 끝나면 프로는 바로 정식 서비스가 시작되고, 비즈니스는 체험판으로 시작합니다.",
          "잔여 금액과 서비스 기간은 관리자 대시보드 첫 페이지에서 확인합니다. 프로는 클래스인 클라이언트나 모바일 앱에서도 잔여 금액이 보입니다.",
        ],
      },
      {
        heading: "전환 직후에 할 일",
        body: "결제가 끝났다고 첫 수업 준비가 끝난 것은 아닙니다. 아래 순서로 이어 가면 첫 수업까지 비는 시간이 줄어듭니다.",
        steps: [
          "[계정 정보] > [인증 자료]에서 계정 인증을 신청합니다. 인증까지 며칠 걸리니 결제한 날 바로 올리세요.",
          "녹화는 유료 요금제를 결제하고 계정 인증까지 마친 학원에서, 교사로 등록된 계정만 켤 수 있습니다. 보안과 개인정보 보호 때문입니다. 녹화본은 앱에서 교사와 학생이 보고, 관리자 콘솔에서 열람하거나 내려받습니다.",
          "[일반 설정]에서 코스 기본 커버, 교실 설정, 수업 다시보기, 저장 설정을 학원 기준으로 정합니다.",
          "녹화본과 수업 캡처는 쌓일수록 학원 스토리지 용량을 차지하고, 무료로 제공되는 범위는 요금제·계약마다 달라 상담 채널에서 확인합니다. 자동 삭제는 기본으로 꺼져 있으니 [저장 설정]에서 기간을 이때 함께 정해 두세요.",
          "강사를 등록합니다. 강사가 먼저 클래스인에 가입해 있어야 [기관 관리] > [교사] > [교사 추가]로 등록됩니다.",
          "앱에서 직접 코스를 만들게 할 강사는 [계정 정보] > [권한 관리] > [하위 계정 추가]로 권한을 더 줍니다.",
          "잔여 금액과 서비스 기간을 어디서 보는지 운영 담당자에게 알려 두고, 결제 기록은 학원 회계 장부에도 남겨 갱신 시점을 학원이 직접 챙깁니다.",
        ],
      },
      {
        heading: "자주 하는 실수",
        body: "상담하면서 자주 보는 경우입니다. 대부분 결제 전에 막을 수 있습니다.",
        steps: [
          "학생이나 강사가 공식 홈페이지에서 가입하거나 로그인했다가 요금제 선택 화면을 보고 체험판을 눌러 버립니다. 홈페이지 로그인은 기관 관리자용이고, 학생과 강사는 앱을 설치해 가입합니다. 이미 잘못 등록됐다면 상담 채널로 문의하세요.",
          "강사 개인 아이디로 결제했는데 그 강사가 그만두면서 메인 관리자 계정을 쓸 수 없게 됩니다. 처음부터 원장 본인이나 학원 공용 아이디로 로그인하세요.",
          "화면이나 광고에서 본 금액을 확정 금액으로 보고 예산을 잡습니다. 정확한 요금과 할인은 상담에서 확인한 뒤 정하세요.",
          "학원명과 소재지를 대충 넣었다가 계정 인증 서류와 달라 인증이 반려됩니다. 전환 팝업부터 사업자등록증에 적힌 대로 입력하세요.",
          "결제만 하고 계정 인증을 미뤄, 첫 수업 날 녹화와 웹 라이브가 막혀 있습니다. 결제한 날 인증 자료까지 올리세요.",
          "세금계산서나 증빙을 결제 뒤에 찾다가 학원 회계와 어긋납니다. 필요한 증빙은 결제 전에 상담 채널에서 확인하세요.",
        ],
      },
      {
        heading: "상담을 요청할 때 보낼 문구",
        body: "운영 규모를 함께 보내면 요금제 추천과 견적 안내가 빨라집니다. 아래 문구에 숫자만 채워 보내세요.\n\n> 안녕하세요, ○○학원입니다. 클래스인 유료 전환을 준비하고 있습니다. 강사는 ○명, 동시에 여는 수업은 ○개, 학생은 약 ○명입니다. 우리 규모에 맞는 요금제와 견적, 세금계산서 발급 방법을 안내 부탁드립니다.",
      },
    ],
    resources: [
      { label: "클래스인 로그인 페이지", description: "메인 관리자로 쓸 아이디로 로그인해 요금제를 고르는 곳입니다.", href: "https://www.classin.com/kr/login/" },
    ],
    relatedSlugs: ["account-verification", "institution-settings", "teacher-onboarding", "software-pricing-quote-bundle-faq"],
  },
  {
    slug: "account-verification",
    category: "admin",
    title: "계정 인증",
    description: "유료 전환을 마친 학원이나 개인 강사가 수업 녹화와 웹 라이브까지 쓰려면 계정 인증을 거쳐야 합니다. 메인 관리자가 인증 자료를 입력하고 사업자등록증이나 신분증 이미지를 올리는 순서, 유형별 서류, 처리 기간입니다.",
    audience: "원장·실장, 개인 강사",
    updatedAt: "2026-09-24",
    readMinutes: 5,
    tags: ["인증", "사업자등록증", "기관 인증", "개인 교사"],
    keywords: ["계정 인증", "브랜드 로고", "사업자등록증", "법인 증명서", "여권", "신분증", "교습소 등록증", "영업 허가증", "인증 처리 기간", "메인 관리자", "학생 대리 등록", "대리 등록 옵션", "인증 전 기능 제한", "기관 인증 언제", "인증 대기", "인증이 안 돼요", "녹화 조건"],
    chatbotSummary: "유료 계정으로 전환해도 수업 녹화, 웹 라이브, 학생 대리 등록 같은 일부 기능은 계정 인증을 마쳐야 풀립니다. 메인 관리자 계정으로 로그인해 [계정 정보] > [인증 자료] > [편집]에서 학원 정보를 입력하고, 학원은 사업자등록증이나 학교·교습소 설립·운영등록증명서, 개인 강사는 여권이나 신분증 앞면 이미지를 올립니다(JPG·PNG, 5MB 이하, 브랜드 로고는 260×90px·1MB 이하). 처리는 보통 며칠 걸리고, 입력하지 않은 칸이 있으면 멈춘 채 기다립니다. 급하면 상담 채널이나 담당 매니저에게 요청하면 확인 후 바로 처리해 드립니다.",
    sections: [
      {
        heading: "인증 전에는 녹화와 웹 라이브가 막혀 있습니다",
        body: "유료 계정으로 전환해도 수업 녹화, 웹 라이브, 학생 대리 등록 같은 일부 기능은 계정 인증을 마치기 전까지 제한됩니다. 녹화는 인증을 마친 학원에서도 교사로 등록된 계정만 켤 수 있습니다.\n\n학생을 추가하려는데 대리 등록 옵션이 보이지 않는다면 인증이 끝났는지부터 확인하세요. 인증은 보통 며칠 걸리니, 첫 수업부터 녹화를 쓰거나 학생을 대신 등록할 계획이라면 결제한 날 바로 자료를 올리세요.",
      },
      {
        heading: "인증 절차",
        body: "인증은 메인 관리자 계정으로 합니다. 운영 담당자가 따로 있다면 메인 관리자 계정으로 로그인할 수 있는지부터 확인하세요.",
        steps: [
          "클래스인 공식 홈페이지에서 메인 관리자 계정으로 로그인합니다.",
          "[계정 정보] > [인증 자료]에서 [편집]을 누릅니다.",
          "학원 정보를 입력합니다. 별표 표시가 있는 칸은 필수이고, 나머지는 있는 만큼 채웁니다.",
          "아래쪽 인증 정보 칸에서 기관 유형에 맞는 인증 방식을 고르고 증명서 이미지를 올립니다.",
          "저장하면 보통 며칠 안에 인증이 처리됩니다. 처리가 끝나면 대시보드 메시지가 사라집니다.",
        ],
      },
      {
        heading: "학원 정보 칸에 넣을 것",
        body: "인증 자료 화면 위쪽은 학원 기본 정보입니다. 유료 전환 때 입력한 학원명, 소재지와 같게 적으세요.",
        steps: [
          "브랜드 이름에는 학원명을 넣습니다.",
          "브랜드 로고는 260×90px, 1MB 이하 이미지로 올립니다.",
          "주영 종류는 학원 성격에 맞게 고르고, 맞는 항목이 없으면 [해당 없음]을 고릅니다.",
          "소재지는 나라와 도시를 고르고, 상세 주소를 적습니다.",
          "학교 웹 사이트 주소에는 학원 대표 사이트를 넣습니다. 공식 홈페이지가 없다면 블로그나 인스타그램 주소도 됩니다.",
          "담당자 이름, 전화번호, 이메일을 적습니다.",
        ],
      },
      {
        heading: "기관 유형별 증명서",
        body: "인증 방식 버튼 이름과 실제로 올리는 서류 이름이 다릅니다. 일반 학원이라면 [영업 허가증]을 누르고 사업자등록증을 올리면 됩니다. 버튼은 기관 유형대로 고르고, 서류는 아래 기준을 따릅니다.",
        steps: [
          "공공 기관이나 학교는 [공립 기관의 법인의 증명서]를 누릅니다.",
          "사립 학교는 [학교 허가증]을 누릅니다.",
          "일반 학원은 [영업 허가증]을 누릅니다.",
          "증명서 칸에 사업자등록증 또는 학교·교습소 설립·운영등록증명서 이미지를 올립니다. JPG나 PNG, 5MB 이하입니다.",
          "기관/회사 이름에는 학원명을, 법정 대리인에는 증명서에 적힌 대표자 이름을 적습니다.",
          "칸 이름이 낯설지만 통합사회신용코드/증서 번호에는 사업자등록번호를 적으면 됩니다.",
        ],
      },
      {
        heading: "개인 과외 강사 인증",
        body: "학원이 아니라 개인으로 과외를 하는 강사는 인증 방식에서 [개인 교사]를 누릅니다.",
        steps: [
          "신분 증명에서 여권이 있으면 [여권]을 고릅니다. 공식 안내에서 추천하는 방법입니다.",
          "여권 대신 사업자등록증, 주민등록증, 운전면허증을 쓰려면 [기타 증명서]를 고르고 앞면 이미지를 올립니다. JPG나 PNG, 5MB 이하입니다.",
          "이름에는 대표자 이름을, 등록 번호에는 올린 서류에 맞는 번호(사업자등록번호, 주민등록번호, 운전면허번호 중 하나)를 적습니다.",
        ],
      },
      {
        heading: "인증이 급할 때",
        body: "인증은 보통 며칠 걸립니다. 첫 수업이 코앞이라면 자료를 올린 뒤 상담 채널이나 담당 매니저에게 빠른 처리를 요청하세요. 확인하는 대로 바로 처리해 드립니다. 연락할 때는 이렇게 보내면 됩니다.\n\n> 안녕하세요, ○○학원입니다. 오늘 계정 인증 자료를 올렸습니다. ○월 ○일 첫 수업부터 녹화를 써야 해서, 인증을 먼저 처리해 주실 수 있을까요?",
      },
      {
        heading: "인증이 반려되거나 늦어지는 경우",
        body: "인증이 늦어지는 건 대개 서류와 입력 정보가 맞지 않거나 빠진 칸이 있을 때입니다. 올리기 전에 아래만 보세요.",
        steps: [
          "입력하지 않았거나 덜 입력한 칸이 있으면 인증이 멈춘 채 기다립니다. 며칠이 지나도 소식이 없다면 [인증 자료] 화면에서 빠진 칸부터 채우세요.",
          "유료 전환 때 적은 학원명·소재지와 인증 서류가 다르면 반려될 수 있습니다. 두 곳 모두 사업자등록증에 적힌 대로 입력하세요.",
          "증명서는 JPG나 PNG, 5MB 이하 이미지여야 합니다. 스캔본이 PDF라면 이미지로 바꿔 올리세요.",
          "로고는 260×90px, 1MB 이하로 맞춰 둡니다.",
          "인증은 메인 관리자 계정으로 로그인해서 합니다. 담당자가 여럿이면 누가 메인 관리자 계정에 들어갈 수 있는지 먼저 정리하세요.",
          "결제만 하고 인증을 미루면 첫 수업 날 녹화와 웹 라이브가 막혀 있습니다. 결제한 날 같이 끝내세요.",
        ],
      },
    ],
    relatedSlugs: ["billing-upgrade", "institution-settings", "web-live-playback"],
  },
  {
    slug: "institution-settings",
    category: "admin",
    title: "학원(기관) 일반 설정",
    description: "코스 커버와 로고, 교실 화면, 다시보기 권한, 부가가치 서비스, 녹화본 자동 삭제. 학원 전체에 적용되는 이 기본값을 원장·실장이 [일반 설정] 한 곳에서 바꿉니다.",
    audience: "학원 관리자, 대표자",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    featured: true,
    tags: ["일반 설정", "교실 설정", "스킨", "저장 설정", "부가가치 서비스"],
    keywords: ["기본 설정", "교실 스킨", "스위치 설정", "다시보기", "스토리지", "AI 에이전트", "SMS 알림", "관리자용 대시보드", "새로 들어온 학생 다시보기", "리소스 자동 삭제", "스마트 담임 교사", "브라우저 즐겨찾기", "전화번호로 표시", "이름이 번호로 나와요", "닉네임 동기화", "실명 표시", "클래스 닉네임 설정 동기화"],
    chatbotSummary: "학원 전체 코스와 수업에 공통으로 적용되는 설정은 관리자용 대시보드의 [계정 정보] > [일반 설정]에서 바꿉니다. 기본 설정, 교실 설정(스킨·스위치·파라미터), 수업 다시보기, 부가가치 서비스(AI 에이전트·하이브리드 수업·스마트 담임 교사), 저장 설정, 칠판 내용 자동 저장이 모두 여기 있고, 바꾼 값이 학원 전체에 적용되므로 이 화면의 권한은 대표자나 소수 담당자에게만 줍니다. 스마트 담임 교사(문자 수업 알림)는 유료이며 요금은 기관별 계약 조건에 따라 달라 담당 매니저에게 문의합니다.",
    sections: [
      {
        heading: "누가, 어디서 바꾸나",
        body: "여기서 바꾼 값은 학원에서 만드는 코스와 수업 전체에 적용됩니다. 그래서 이 화면을 여는 권한은 대표자나 소수 담당자에게만 줍니다. 하위 계정마다 어떤 메뉴를 열어 줄지는 [계정 정보] > [권한 관리]에서 정합니다.",
        steps: [
          "경로: PC 앱 프로필 > [계정 및 설정] > [관리자용 대시보드] > [계정 정보] > [일반 설정]",
          "관리자용 대시보드는 웹으로 열립니다. [일반 설정]의 항목은 화면 위쪽 탭으로 나뉘어 있습니다.",
        ],
      },
      {
        heading: "기본 설정",
        body: "코스 기본 커버와 브랜드 로고 이미지를 바꿉니다. 새 이미지는 학원에서 만든 코스 전체의 커버 사진에 적용됩니다. 아래쪽 학교 소개를 채워 두면 학생에게 가는 학습 보고서 같은 곳에 함께 표시됩니다.",
        steps: ["경로: 관리자 대시보드 > [일반 설정] > [기본 설정]"],
      },
      {
        heading: "교실 설정",
        body: "온라인 교실의 배경, 교실 안 버튼, 녹화와 질문 간격 같은 세부값을 정합니다. [시스템 교실 설정]의 기본 프리셋을 그대로 써도 되고, 학원에 맞춘 값이 필요하면 [사용자 정의 교실 설정]에서 새 설정을 추가합니다. 설정 창에서 바꾸는 것은 스킨, 스위치, 파라미터 세 가지입니다.",
        steps: [
          "경로: 관리자 대시보드 > [일반 설정] > [교실 설정] > [사용자 정의 교실 설정]",
          "새 설정을 추가하면 스킨, 스위치, 파라미터를 바꾸는 창이 열립니다.",
          "스킨 설정에서 교실 배경을 고릅니다. 기본 배경은 [스킨 라이브러리 테마 사용], 한 가지 색은 [단색](색상값과 투명도 입력), 직접 만든 이미지는 [사용자 정의 이미지]입니다.",
          "직접 만든 이미지를 쓸 때는 화면 아래 이미지 요구 사항을 먼저 봅니다. 제목 표시줄, 좌석, 배경마다 크기와 비율, 용량이 정해져 있습니다.",
          "스위치 설정에서 교실 안 기능과 버튼을 켜고 끕니다. 최대 24개 항목을 수업 방식에 맞춰 조정합니다.",
          "파라미터 설정에서 수업 녹화, 질문 간격, 트로피 이미지를 바꿉니다.",
          "교실에서 [브라우저]를 자주 쓴다면 파라미터 설정의 [브라우저 즐겨찾기 설정]에 자주 여는 링크를 넣어 둡니다. 수업 중에 링크를 다시 복사하지 않아도 됩니다.",
        ],
      },
      {
        heading: "학생 이름 대신 전화번호가 보일 때",
        body: "수업이나 코스에서 학생이 이름 대신 전화번호로 보인다면, 코스 닉네임이 가입 때 이름과 맞춰지지 않은 상태입니다. [일반 설정] > [클래스 설정] 탭의 '클래스 닉네임 설정 동기화'를 켜면, 그 뒤로 코스에 들어오는 학생은 코스 닉네임이 가입 때 입력한 이름으로 맞춰집니다. 학생이 가입할 때 닉네임에 실명을 넣어 두어야 제대로 맞춰집니다.",
        steps: [
          "경로: 관리자 대시보드 > [일반 설정] > [클래스 설정]",
          "'클래스 닉네임 설정 동기화'를 켭니다.",
          "이미 코스에 있던 학생은 코스에서 내보냈다가 다시 추가해야 반영됩니다. 가입 닉네임이 실명이 아니면 학생이 계정 설정에서 먼저 바꾸게 합니다.",
          "그 전까지는 강사가 앱에서 그 학생의 코스 닉네임을 실명으로 바꾸거나, 학생에게 직접 바꾸도록 알립니다.",
        ],
      },
      {
        heading: "수업 다시보기 설정",
        body: "수업에서 자동으로 만들어진 녹화본을 누가 다시 볼 수 있는지 정합니다. 코스에 새로 들어온 학생과 중간에 나간 학생의 다시보기도 여기서 관리합니다. 자동 녹화본은 학원 스토리지 용량에 포함됩니다.\n\n개강 뒤에 들어온 학생에게 지난 수업을 보여 주려면 아래 고급 설정 옵션을 켭니다. 이 옵션이 꺼져 있으면 새로 들어온 학생은 지난 수업에서 전출생으로 처리되어 다시보기를 볼 수 없습니다.\n\n옵션은 켜는 시점에 있는 코스 전체에 적용되고, 그 뒤에 코스에 들어오는 학생부터 반영됩니다. 이미 코스에 있던 학생은 코스에서 나갔다가 다시 들어와야 바뀐 설정을 받습니다. 코스마다 다시보기 기간을 따로 두려면 코스 [설정]의 [다시 보기 유효 기간]을 씁니다.",
        steps: [
          "경로: 관리자 대시보드 > [일반 설정] > [수업 다시보기]",
          "고급 설정에서 '코스에 새로 가입된 학생이 이전 수업의 다시보기 시청을 허용합니다'를 켭니다.",
        ],
        media: [
          {
            type: "image",
            src: "/docs/files/cs-figma/새로-들어온-학생도-수업-다시보기-시청.png",
            alt: "관리자 대시보드 [계정 정보] > [일반 설정] > [수업 다시보기] 탭에서 새로 가입한 학생의 이전 수업 다시보기 허용 옵션을 켜는 화면",
            caption: "개강 뒤에 들어온 학생도 지난 수업 다시보기를 볼 수 있게 하는 옵션",
            width: 1440,
            height: 2357,
          },
        ],
      },
      {
        heading: "부가가치 서비스",
        body: "기본 서비스 외에 따로 켜는 기능들입니다. 설명을 읽고 필요한 것만 켭니다. 국내에서 쓰는 것은 아래 세 가지이고, Nobook과 슈퍼 고객 서비스는 국내에서 제공하지 않습니다.\n\n**AI 에이전트**는 LMS 안의 AI 기능입니다. 수업 요약, AI 첨삭, 시험 문제 자동 생성 같은 기능이 여기에 묶여 있고, 지금은 한시적으로 무료입니다. 학원에서 AI 기능을 쓰지 않기로 했다면 이 토글을 끕니다.\n\n**하이브리드 수업 기능**을 켜면 학생이 수업 중에 클래스인 칠판 화면과 카메라 화면을 골라 봅니다. 요금제에 따라 일부 기관에만 제공되므로, 메뉴가 보이지 않거나 켜지지 않으면 상담 채널에서 확인합니다.\n\n**스마트 담임 교사**는 학생과 교사에게 수업 알림 문자를 자동으로 보내는 유료 서비스입니다. 요금은 기관별 계약 조건에 따라 다르니, 쓰려면 담당 매니저에게 문의하세요. 켜기 전에 [부가가치 서비스] 화면의 안내를 먼저 읽어 봅니다.",
        steps: ["경로: 관리자 대시보드 > [일반 설정] > [부가가치 서비스]"],
      },
      {
        heading: "저장 설정",
        body: "녹화본, 수업 캡처, 학습 활동 파일처럼 스토리지를 차지하는 데이터를 지우는 곳입니다. 자동 삭제는 처음에 꺼져 있고, 켜지 않으면 데이터가 저절로 지워지지 않습니다. 제공 용량과 요금은 요금제·계약마다 달라 상담 채널에서 확인하고, 학원 운영 방식에 맞춰 자동 삭제를 켜 두거나 지난 데이터를 주기적으로 비웁니다. 여기서 지운 파일과 자료는 복구되지 않습니다.",
        steps: [
          "경로: 관리자 대시보드 > [일반 설정] > [저장 설정]",
          "지난 기간의 데이터를 한 번에 지우려면 [과거 저장된 리소스 삭제]에서 [삭제 작업 생성]을 누릅니다.",
          "지울 기간(콘텐츠가 만들어진 시점 기준)과 콘텐츠 종류를 고르고 [확인]을 누르면 삭제 작업이 만들어집니다. 작업은 순서대로 처리되며, 양이 많으면 최대 24시간까지 걸립니다.",
          "기간이 지난 데이터를 앞으로 자동으로 지우려면 [리소스 자동 삭제 설정]에서 항목별 기간을 정하고 켭니다. 켜면 학원 안 학습 활동과 데이터 전체에 적용됩니다.",
          "코스 첨부 파일, 코스 파일, 게시판 문서의 삭제 기간은 강사들이 LMS 자료를 얼마나 오래 다시 쓰는지 보고 정합니다.",
          "자동 삭제에서 빼야 할 수업은 켜기 전에 [스토리지] > [수업 리소스]에서 보호 잠금을 걸어 둡니다.",
        ],
        media: [
          {
            type: "image",
            src: "/docs/files/cs-figma/클래스인-스토리지-삭제-안내.png",
            alt: "관리자 대시보드 [일반 설정] > [저장 설정]에서 리소스 자동 삭제 옵션을 켜고 삭제 작업을 만드는 화면과 복구 불가 경고",
            caption: "자동 삭제 옵션과 삭제 작업 생성 화면. 서버에서 데이터가 지워지므로 되돌릴 수 없습니다.",
            width: 1551,
            height: 3543,
          },
        ],
      },
      {
        heading: "칠판 내용 및 수업자료 보관",
        body: "온라인 교실에서 칠판과 수업 자료 위에 쓴 필기를 자동으로 저장할지 켜고 끕니다. 자동 저장된 필기도 학원 스토리지 용량에 포함됩니다.",
        steps: ["경로: 관리자 대시보드 > [일반 설정] > [칠판 내용 및 수업자료 보관]"],
      },
    ],
    relatedSlugs: ["storage-management", "course-management", "teacher-onboarding", "course-creation"],
  },
  {
    slug: "teacher-onboarding",
    category: "admin",
    title: "교사 추가",
    description: "새 강사가 들어오면 원장·실장은 세 가지를 합니다. 강사 계정을 학원에 등록하고, 직접 코스를 만들 강사에게만 권한을 더 주고, 담당 코스에 배정합니다.",
    audience: "학원 관리자, 운영팀",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    tags: ["교사", "권한", "하위 계정"],
    keywords: ["교사 등록", "교사 추가", "하위 계정", "권한 관리", "공개 수업", "교사 온보딩", "권한 차등", "공개 수업 및 클래스 만들기", "교사로 설정", "담임 교사로 설정", "국가번호", "교사 비활성화", "퇴사 처리", "하위 계정 삭제", "비활성화할 수 없습니다", "강사 삭제", "강사 교육", "교육 영상"],
    chatbotSummary: "교사를 추가하려면 강사가 먼저 본인 휴대폰 번호나 이메일로 클래스인에 가입해 있어야 하고, 관리자는 [기관 관리] > [교사] > [교사 추가]에서 그 ID와 이름을 입력해 등록합니다. 앱에서 직접 코스를 만들 강사에게만 [계정 정보] > [권한 관리] > [하위 계정 추가]에서 '공개 수업 및 클래스 만들기' 권한을 더 주고, 코스 배정은 코스의 [구성원] > [교사로 설정]에서 합니다. 퇴사한 강사는 하위 계정 권한을 먼저 지운 뒤 [기관 관리] > [교사]에서 비활성화합니다.",
    sections: [
      {
        heading: "시작 전에 정할 한 가지",
        body: "강사를 등록하는 방식은 두 가지입니다. 관리자가 만든 코스만 맡는 강사는 [교사 추가]로 등록하면 끝입니다. 강사가 앱에서 직접 코스를 만들고 관리해야 한다면 하위 계정 권한까지 줍니다. 새 강사가 어느 쪽인지 먼저 정해 두면 권한을 필요 이상으로 주지 않게 됩니다.\n\n순서는 강사 가입 확인, 교사 등록, 권한 추가(필요한 강사만), 코스 배정입니다.",
      },
      {
        heading: "강사 가입부터 확인하기",
        body: "교사로 등록하려면 강사가 클래스인에 먼저 가입해 있어야 합니다. 등록할 때 입력하는 값이 바로 강사의 클래스인 ID, 즉 가입에 쓴 휴대폰 번호나 이메일입니다. 아직 가입 전이라면 아래 문구를 보내 가입부터 부탁합니다.\n\n> 선생님, 우리 학원은 수업을 클래스인으로 운영합니다. 클래스인 앱이나 PC 프로그램을 설치해 본인 휴대폰 번호로 회원 가입을 먼저 해 주세요. 홈페이지 로그인은 학원 관리자용이라, 가입과 로그인은 앱이나 PC 프로그램에서 해 주시면 됩니다.\n> 가입이 끝나면 가입에 쓴 번호(또는 이메일)와 이름을 알려 주세요. 학원 계정에 바로 등록하겠습니다.",
        steps: [
          "가입에 쓴 휴대폰 번호나 이메일은 강사에게 직접 받아 그대로 씁니다.",
          "여러 명을 한꺼번에 받을 때는 이름과 ID를 명단 하나로 모아 둡니다.",
        ],
      },
      {
        heading: "교사 등록하기",
        body: "등록하면 강사가 우리 학원 소속이 됩니다. 이 상태의 강사는 관리자가 배정한 코스의 수업을 맡습니다. 코스를 직접 만드는 권한은 다음 단계에서 따로 줍니다.",
        steps: [
          "경로: 관리자 대시보드 > [기관 관리] > [교사] > [교사 추가]",
          "강사의 휴대폰 번호나 이메일, 이름을 입력합니다. 나머지 항목은 필요할 때만 채웁니다.",
          "휴대폰 번호로 등록할 때는 국가번호가 한국(+82)인지 먼저 봅니다. 입력 창의 국가번호가 다른 나라로 잡혀 있을 수 있습니다.",
          "저장한 뒤 [교사] 목록에 이름과 연락처가 맞게 올라왔는지 확인합니다.",
        ],
      },
      {
        heading: "코스를 직접 만드는 강사에게만 권한 더 주기",
        body: "관리자가 배정한 코스만 맡는 강사라면 이 단계는 건너뜁니다. 강사가 앱에서 직접 코스를 만들고 관리해야 할 때만 하위 계정으로 추가해 권한을 줍니다. 하위 계정인 강사도 수업 생성과 관리 권한이 모두 켜져 있으면 수업을 만들고 녹화할 수 있습니다.",
        steps: [
          "경로: 관리자 대시보드 > [계정 정보] > [권한 관리] > [하위 계정 추가]",
          "강사의 휴대폰 번호나 이메일, 이름을 입력합니다.",
          "권한 목록에서 이 강사에게 필요한 메뉴만 체크합니다. 권한은 기관 관리, 스토리지, 학습 관리, 관리자 기능, 재무 센터처럼 메뉴 묶음별로 나뉘어 있습니다.",
          "직접 코스를 만들게 하려면 클라이언트 권한의 '공개 수업 및 클래스 만들기'까지 허용합니다.",
          "[확인]을 눌러 저장합니다. 이미 등록한 계정의 권한은 목록 오른쪽 [편집]에서 바꾸고, 필요 없어지면 [삭제]합니다.",
        ],
      },
      {
        heading: "담당 코스에 배정하기",
        body: "강사를 코스 구성원으로 넣어야 그 반 수업을 맡게 됩니다. 코스에 넣을 수 있는 강사는 학원 대시보드에 교사로 등록된 계정뿐입니다. 담임 교사는 그 코스의 수업을 만들고 고치며 구성원을 관리하고, 교사는 같은 코스에서 수업과 학습 활동을 함께 추가하고 점검합니다.",
        steps: [
          "경로: 관리자 대시보드 > [기관 관리] > [코스 관리] > 코스 이름 > [구성원] > [교사로 설정]",
          "강사를 골라 [확인]을 누릅니다.",
          "이 강사를 반 담임으로 두려면 강사 이름 아래 더보기(···) 메뉴에서 [담임 교사로 설정]을 누릅니다.",
        ],
      },
      {
        heading: "첫 수업 전에 강사와 같이 볼 것",
        body: "계정과 코스가 준비되면 첫 수업 전에 한 번 같이 점검합니다.",
        steps: [
          "학원 공용 자료를 공유 드라이브에 두었다면 강사를 그 드라이브 구성원으로 초대합니다. 수업 중에 열어 쓰기만 하고 파일은 내려받지 않게 하려면 [읽기 전용]으로 줍니다.",
          "수업을 만들 때 [드라이브 리소스]에 그 수업에서 쓸 공유 드라이브 위치를 지정합니다.",
          "강사가 수업할 PC나 전자칠판에서 교실에 들어가, 장비 테스트로 카메라와 마이크, 스피커를 미리 확인하게 합니다.",
          "수업 녹화를 켤지, 다시보기를 학생에게 열지 학원 기준을 강사에게 미리 알려 줍니다.",
          "전자칠판, 수업 도구, 관리자 페이지 사용법을 녹화 강의로 익히게 하려면 클래스인 상담 채널에 기관 교육 코스 초대를 요청합니다.",
        ],
      },
      {
        heading: "강사가 그만둘 때",
        body: "퇴사한 강사는 맡던 코스를 넘기고, 교사 목록에서 비활성화하고, 하위 계정 권한도 정리합니다. 한 계정이 하위 계정과 교사로 함께 등록돼 있다면 하위 계정 권한부터 지워야 교사에서 뺄 수 있습니다.",
        steps: [
          "맡던 코스마다 담임 교사와 수업 교사를 새 강사로 넘깁니다. 순서는 코스 및 수업 관리 문서에 있습니다.",
          "하위 계정으로도 등록된 강사라면 [계정 정보] > [권한 관리]에서 그 하위 계정을 먼저 삭제합니다.",
          "[기관 관리] > [교사] 목록에서 그 강사를 비활성화합니다.",
          "'하위 계정은 비활성화할 수 없다'는 문구가 뜨면, 지금 로그인한 계정이 권한이 부족한 하위 계정일 수 있습니다. 메인 관리자 계정으로 비활성화하거나, 메인 관리자 계정에서 이 계정의 권한 중 '교사' 항목을 켭니다.",
        ],
      },
      {
        heading: "강사 등록에서 자주 하는 실수",
        body: "등록한 뒤에 다시 손보게 되는 경우들입니다. 새 강사를 받을 때마다 한 번씩 확인하세요.",
        steps: [
          "강사가 아직 가입하지 않았는데 등록부터 합니다. 가입했는지 먼저 확인하세요.",
          "가입에 쓴 번호·이메일과 다른 값을 입력합니다. 강사에게 ID를 직접 받아 그대로 넣으세요.",
          "국가번호를 보지 않고 휴대폰 번호를 입력합니다. +82인지 먼저 확인하세요.",
          "강사 전원에게 코스 생성이나 관리자 메뉴 권한을 한꺼번에 줍니다. 직접 코스를 만드는 강사에게만 '공개 수업 및 클래스 만들기'를 주세요.",
          "직접 코스를 만들어야 하는 강사에게 '공개 수업 및 클래스 만들기'를 빠뜨립니다. 이 권한이 없으면 강사가 앱에서 코스를 만들지 못합니다.",
          "등록만 하고 코스에 배정하지 않습니다. 코스 [구성원]의 [교사로 설정]까지 끝내세요.",
          "강사가 그만두거나 담당 반이 바뀌었는데 코스와 권한을 그대로 둡니다. 코스에서는 [교사 삭제]나 [멤버 삭제]로 빼고, 하위 계정 권한도 [편집]이나 [삭제]로 정리하세요.",
          "강사가 홈페이지에서 가입하거나 로그인합니다. 홈페이지 로그인은 관리자 페이지이니, 강사는 앱이나 PC 프로그램으로 가입·로그인하게 하세요.",
        ],
      },
    ],
    relatedSlugs: ["signup", "student-onboarding", "course-management", "course-creation", "shared-drive", "institution-settings"],
  },
  {
    slug: "student-onboarding",
    category: "admin",
    title: "학생 추가",
    description: "재원생을 클래스인에 처음 올릴 때는 인원에 맞춰 방법을 고릅니다. 한 명씩, 텍스트로 100명씩, 엑셀로 300명씩 등록할 수 있고, 아직 가입하지 않은 학생의 계정은 관리자가 대리 등록으로 대신 만들어 줍니다.",
    audience: "학원 관리자, 운영팀",
    updatedAt: "2026-09-24",
    readMinutes: 5,
    tags: ["학생", "대량 등록", "Excel", "대리 등록"],
    keywords: ["학생 추가", "Excel 가져오기", "텍스트 가져오기", "대리 등록", "임시 비밀번호", "학생 대리 등록", "학생 일괄 등록", "스텐실 다운로드", "학생 등록 양식", "국가번호", "편입생", "대리 등록 문자 안 옴", "SMS 안 옴", "초기 비밀번호", "기본 비밀번호", "학생 비밀번호 설정", "학생 추가 안 됨", "등록되지 않은 번호", "대리 등록 옵션이 안 보여요"],
    chatbotSummary: "학생은 [기관 관리] > [학생] > [학생 추가]에서 한 명씩, [텍스트에서 가져오기]로 한 번에 100명까지(82-1012345678#홍길동 형식), [Excel 가져오기]로 한 번에 300명까지 등록하고, 등록한 학생은 코스의 [구성원]에서 반에 배정해야 수업에 들어옵니다. 아직 가입하지 않은 학생은 [학생 대리 등록](기관 인증 뒤에 보임)으로 계정을 만들며, 공통 기본 비밀번호는 없고 임시 비밀번호가 문자나 이메일로만 가므로, 문자가 안 오면 스팸함과 번호 형식을 확인한 뒤 상담 채널로 문의합니다.",
    sections: [
      {
        heading: "등록 방법 고르기",
        body: "코스(반)에 넣을 수 있는 학생은 학원 대시보드에 등록된 학생뿐입니다. 재원생 등록은 수업을 열기 전에 끝내 둡니다. 그래야 수업을 만들 때 학생을 교실에 바로 넣을 수 있습니다.\n\n몇 명뿐이면 한 명씩, 100명 이하는 텍스트로, 그보다 많으면 엑셀로 올립니다. 학생이 아직 클래스인에 가입하지 않았다면 한 명씩 추가하거나 텍스트로 가져올 때 [학생 대리 등록]을 함께 체크합니다.\n\n가입하지 않은 번호를 그냥 넣으면 등록되지 않은 전화번호·이메일이라는 안내가 뜨고 추가되지 않습니다. 이때 학생을 따로 가입시킬 필요 없이 대리 등록을 쓰면 됩니다.",
      },
      {
        heading: "한 명씩 추가하기",
        body: "학생 이름과 아이디(휴대폰 번호나 이메일)만 있으면 됩니다.",
        steps: [
          "경로: 관리자 대시보드 > [기관 관리] > [학생] > [학생 추가]",
          "학생 이름과 아이디를 입력합니다. 다른 항목은 선택입니다.",
          "휴대폰 번호라면 국가번호가 한국(+82)인지 확인하고 저장합니다.",
        ],
      },
      {
        heading: "텍스트로 한 번에 100명까지",
        body: "명단을 복사해 붙여 넣는 방식입니다. 한 줄에 한 명씩 아이디#이름 형식으로 씁니다. 휴대폰 번호는 맨 앞 0을 빼고 국가번호 82를 붙입니다. 010-1234-5678이 아니라 82-1012345678 형식입니다.\n\n- 82-1012345678#홍길동\n- example@gmail.com#임꺽정",
        steps: [
          "경로: [기관 관리] > [학생] > [학생 추가] > [텍스트에서 가져오기]",
          "위 형식으로 학생 정보를 붙여 넣습니다. 한 번에 100명까지 등록됩니다.",
          "아직 가입하지 않은 학생이라면 [학생 대리 등록]을 체크한 뒤 [확인]을 누릅니다.",
        ],
      },
      {
        heading: "Excel로 한 번에 300명까지",
        body: "학생이 많을 때는 양식 파일로 올립니다. 양식은 [Excel 가져오기] 화면의 [스텐실 다운로드]에서 받습니다. 양식의 열 이름은 영어로 되어 있습니다.",
        steps: [
          "경로: [기관 관리] > [학생] > [학생 추가] > [Excel 가져오기]",
          "[스텐실 다운로드]를 눌러 양식을 받습니다.",
          "1행(열 이름)은 고치지 않고, 2행부터 한 줄에 한 명씩 적습니다.",
          "student name(학생 이름)은 꼭 적고, Phone number(휴대폰 번호)와 Email(이메일) 중 하나를 적습니다. Student ID(학번)와 Tag(학생 태그)는 선택입니다.",
          "파일을 올립니다. 한 번에 300명까지 등록됩니다.",
        ],
      },
      {
        heading: "가입 전인 학생은 대리 등록으로",
        body: "학생이 아직 클래스인 ID를 만들지 않았다면 관리자가 대신 만듭니다. 학생 추가 창에서 [학생 대리 등록]을 체크하고 정보를 입력하면, 입력한 휴대폰 번호나 이메일이 그대로 학생의 ID가 됩니다. 공통 기본 비밀번호는 없습니다. 휴대폰 번호로 만들면 문자로, 이메일로 만들면 이메일로 임시 비밀번호가 발송되고, 학생은 로그인 화면에서 이 비밀번호를 바꿀 수 있습니다.\n\n[학생 대리 등록]은 기관 인증을 마친 뒤에 보입니다. 학생 추가 창에 이 옵션이 없으면 기관 인증이 끝났는지부터 확인합니다.\n\n만든 계정은 학원 학생 목록에 자동으로 들어갑니다. 휴대폰으로 가는 안내 문자에는 별도 요금이 붙으니 요금은 상담 채널에서 확인하세요. 실제로 등록할 학생이 아닌 번호로 임의 등록하는 것은 금지되어 있습니다.\n\n코스 안 [구성원] > [코스 내 학생을 설정하기] > [학생 추가]에도 같은 옵션이 있습니다. 여기서 만들면 계정 생성과 반 배정이 한 번에 끝납니다. 이 창에서는 한 번에 300명까지 추가되고, 넘는 인원은 입력한 순서대로 빠집니다.\n\n학생이나 보호자에게 이렇게 보내면 됩니다.\n\n> 학원에서 클래스인 계정을 만들어 드렸습니다. 아이디는 등록한 휴대폰 번호입니다.\n> 휴대폰, 태블릿, PC 중 쓰실 기기에 클래스인 앱을 설치하고, 문자로 받은 임시 비밀번호로 앱에서 로그인해 주세요. 홈페이지 로그인은 학원 관리자용이라 학생은 앱에서 로그인합니다.\n> 비밀번호는 로그인 화면에서 새로 바꿀 수 있습니다.",
        media: [
          {
            type: "image",
            src: "/docs/files/cs-figma/클래스인-학생-대리등록-코스-입장.png",
            alt: "코스 구성원의 학생 추가 창에서 [학생 대리 등록]을 체크하고 아이디#이름 형식으로 입력해 새 계정을 만드는 화면",
            caption: "학생 추가 창에서 [학생 대리 등록]을 체크하고 82-1012345678#홍길동 형식으로 입력하는 예",
            width: 1440,
            height: 4132,
          },
        ],
      },
      {
        heading: "대리 등록했는데 문자가 안 갈 때",
        body: "대리 등록 계정은 임시 비밀번호가 문자나 메일로만 가기 때문에, 이걸 받지 못하면 학생이 처음 로그인할 수 없습니다. 학생이 문자를 못 받았다고 하면 아래 순서로 확인합니다.",
        steps: [
          "학생에게 스팸 문자함을 먼저 확인하게 합니다. 이메일 아이디라면 메일함과 스팸 메일함을 봅니다.",
          "[학생] 목록에서 번호가 국가번호 +82에 10으로 시작하게 들어갔는지 확인합니다.",
          "학생 휴대폰에 해외 발신 문자 차단 서비스가 켜져 있거나 통신사에서 막으면 문자가 가지 않을 수 있습니다.",
          "그래도 받지 못했다면 클래스인 상담 채널로 문의합니다.",
        ],
      },
      {
        heading: "등록한 뒤에 할 일",
        body: "등록은 계정을 만드는 데까지입니다. 학생이 실제 수업에 들어오려면 반 배정까지 끝나야 합니다.",
        steps: [
          "코스의 [구성원]에서 [코스 내 학생을 설정하기]로 학생을 반에 넣습니다.",
          "대리 등록한 학생에게는 첫 로그인 뒤 비밀번호를 바꾸도록 알립니다.",
          "학생이 로그인했는데 무료 체험판·비즈니스 체험판을 고르라는 화면이 뜬다면 홈페이지로 로그인한 경우입니다. 앱을 설치해 앱에서 로그인하게 합니다.",
          "개강 뒤에 들어온 학생이 지난 수업을 봐야 한다면 [일반 설정] > [수업 다시보기]에서 새로 가입한 학생의 다시보기 허용 옵션을 확인합니다.",
          "학기 중간에 편입생(참관생)으로 넣어야 한다면 [기관 관리] > [코스 관리]의 코스 상세 화면에서 편입생으로 추가합니다.",
          "수강이 끝난 학생은 코스 구성원에서 [멤버 삭제]로 뺍니다.",
        ],
      },
    ],
    relatedSlugs: ["course-creation", "account-verification", "institution-settings", "teacher-onboarding", "course-management"],
  },
  {
    slug: "course-creation",
    category: "admin",
    title: "코스 및 수업 개설",
    description: "교사와 학생 등록이 끝나면 관리자가 반을 엽니다. 대시보드에서 코스를 만들고 교사와 학생을 넣은 다음, 수업을 하나씩 또는 한 번에 최대 50개까지 만듭니다.",
    audience: "학원 관리자, 담임 교사",
    updatedAt: "2026-09-24",
    readMinutes: 5,
    featured: true,
    tags: ["코스", "수업", "시간표", "일괄 생성"],
    keywords: ["코스 만들기", "담임 교사", "수업 생성", "수업 일괄 생성", "온스테이지", "하이브리드 수업", "웹 라이브", "코스 구조", "수업 교사", "조교", "학생 자동 온스테이지", "대량 작업", "반복 요일", "짧은 강의 여러 개", "연속 녹화", "수업 여러 개 만들기", "녹화 켜기", "녹화 끄기", "녹화 옵션 선택"],
    chatbotSummary: "코스는 반 하나이고, 구조는 코스 > 과정 > 단원 > 학습 활동입니다. [기관 관리] > [코스 관리] > [코스 만들기]에서 코스명과 담임 교사를 정해 만들고 코스 안 [구성원]에서 교사와 학생을 넣은 뒤, [시간표] > [수업 생성]으로 수업을 하나씩, 같은 요일·시간에 반복되는 수업은 [수업 일괄 생성]으로 한 번에 2~50개 만듭니다(일괄 생성은 대시보드에서만 됩니다).",
    sections: [
      {
        heading: "코스 하나가 반 하나입니다",
        body: "클래스인에서 코스는 반 하나입니다. 코스를 먼저 만들고, 그 안에 수업을 넣습니다. 구조는 코스 > 과정 > 단원 > 학습 활동 순서이고, 실시간 수업도 숙제·토론과 같은 학습 활동 중 하나입니다.\n\n대시보드에서 만든 코스와 수업은 강사의 앱과 프로그램 화면에 바로 나타납니다. 작업 순서는 코스 만들기, 교사와 학생 넣기, 수업 만들기입니다. 교사와 학생은 미리 학원 대시보드에 등록되어 있어야 합니다.",
      },
      {
        heading: "코스 만들기",
        body: "코스를 만들 때 담임 교사를 정합니다. 담임 교사는 그 코스의 관리자로, 코스와 수업을 만들고 고치며 구성원을 관리합니다. 교사는 코스를 함께 맡는 사람으로, 같은 코스에서 수업과 학습 활동을 추가하고 점검합니다.",
        steps: [
          "경로: 관리자 대시보드 > [기관 관리] > [코스 관리] > [코스 만들기]",
          "코스명을 입력하고 담임 교사를 지정합니다.",
          "함께 맡을 교사가 있으면 추가합니다.",
          "기타 정보는 필요할 때만 입력하고 저장합니다.",
        ],
      },
      {
        heading: "교사와 학생 넣기",
        body: "코스 안 [구성원]에서 교사와 학생을 넣습니다. 여기서 고를 수 있는 사람은 학원 대시보드에 이미 등록된 계정뿐입니다. 목록에 없는 강사나 학생은 [교사 추가], [학생 추가]부터 합니다. 강사가 앱에서 링크나 QR 코드로 학생을 초대하는 방법도 있습니다.",
        steps: [
          "경로: 코스 > [구성원]",
          "교사는 [교사로 설정]을 눌러 추가합니다.",
          "학생은 [코스 내 학생을 설정하기]를 눌러 추가합니다.",
        ],
      },
      {
        heading: "수업 하나 만들기",
        body: "코스 안 [시간표]에서 [수업 생성]을 누르면 수업 정보 창이 열립니다. 정하는 항목은 이렇습니다.\n\n- **수업 이름**, **단원**: 수업 이름과 이 수업이 들어갈 단원\n- **수업 시작 시간**, **수업 진행 시간**: 수업 날짜와 시작 시각, 수업 길이\n- **수업 교사**: 이 수업을 맡을 교사. 담임 교사와 다른 사람이어도 됩니다.\n- **조교**: 수업을 돕는 사람. 수업에서 강사와 같은 권한을 가지며, 카메라와 마이크는 보이지 않게 할 수 있습니다.\n- **기본으로 스테이지 표시**: 켜면 교실에 들어갈 때 카메라 영역이 보이고, 끄면 화면 전체가 칠판이 됩니다.\n- **학생 자동 온스테이지**: 켜면 학생이 입장할 때 온스테이지 자리에 자동으로 올라갑니다. 끄면 교사나 조교가 직접 올립니다.\n- **온스테이지 인원수**: 카메라 영역에 보일 인원(1v0~1v12)과 강사 카메라 화질(SD/HD/FHD)\n- **하이브리드 수업**: 학생이 교실에서 오프라인·온라인 수업 화면 중 골라 봅니다.\n- **드라이브 리소스**: 이 수업에서 쓸 공유 드라이브 위치\n- **수업 녹화**, **웹 라이브 & 다시 보기**: 바로 아래 녹화 옵션 항목을 보세요.",
        steps: [
          "경로: 코스 > [시간표] > [수업 생성]",
          "수업 이름, 단원, 시작 시간, 진행 시간을 입력합니다.",
          "수업 교사를 정하고, 필요하면 조교를 넣습니다.",
          "온스테이지 인원수와 화질, 스테이지 표시 옵션을 정합니다.",
          "하이브리드 수업, 드라이브 리소스, 수업 녹화, 웹 라이브를 필요한 것만 켭니다.",
          "[게시하기]를 누르면 수업이 만들어집니다.",
        ],
      },
      {
        heading: "수업 녹화, 현장 녹화, 웹 라이브 옵션",
        body: "수업 녹화는 온라인이든 현장 수업이든 복습과 다시보기용으로 많이 쓰는 기본 녹화입니다. 칠판, 자료, 교실 화면 같은 클래스인 화면을 녹화하고, 영상은 클래스인 스토리지에 저장됩니다. 교실 안에서 카메라를 켜 두면 화면 레이아웃에 들어간 카메라 영역도 같이 녹화됩니다.\n\n녹화는 교사가 교실에 들어와 있는 동안 진행됩니다. 교사가 교실을 나가 다른 수업으로 옮기면 원래 수업의 녹화는 멈춥니다. 녹화본은 수업이 끝난 뒤 서버에서 처리하는 데 시간이 걸려, 끝나자마자 보이지 않을 수 있습니다. 녹화 옵션마다 옆의 (?) 아이콘을 누르면 설명이 나옵니다.\n\n현장 녹화는 수업 녹화를 대신하는 옵션이 아니라 함께 켜는 옵션입니다. 클래스인에 연결된 카메라가 비추는 실제 교실 모습이나 트래킹 화면을 따로 녹화합니다. 두 영상은 다시보기에서 골라 봅니다.\n\n웹 라이브 & 다시 보기를 켜면 수업을 웹으로 생중계합니다. 보는 사람은 로그인하지 않아도 되고, 수업이 끝난 뒤에는 같은 링크로 영상을 다시 봅니다. 링크만 있으면 열리므로 누구에게 보낼지 정한 뒤 공유합니다.",
      },
      {
        heading: "반복 수업은 한 번에 만들기",
        body: "매주 같은 요일, 같은 시간에 하는 수업은 하나씩 만들지 말고 [수업 일괄 생성]으로 한 번에 만듭니다. 한 번에 2개에서 50개까지 만들어집니다. 이 기능은 앱에는 없고 대시보드에서만 됩니다. 5~10분짜리 짧은 강의를 여러 개 이어서 녹화할 때도 수업을 한 번에 여러 개 만들어 두고 하나씩 들어가 녹화하면 됩니다.\n\n이미 만든 수업 여러 개의 교사, 시작 시간, 녹화 설정을 한꺼번에 바꿀 때는 코스의 [학습 활동] 탭에서 수업을 선택하고 [대량 작업]을 씁니다.",
        steps: [
          "경로: 코스 > [시간표] > [수업 일괄 생성]",
          "만들 수업 수(2~50개)와 반복 요일을 정합니다.",
          "나머지 옵션은 수업 하나 만들 때와 같이 정하고 저장합니다.",
        ],
      },
    ],
    relatedSlugs: ["lesson-option-concepts", "course-management", "web-live-playback", "teacher-onboarding", "student-onboarding", "course-members"],
  },
  {
    slug: "course-management",
    category: "admin",
    title: "코스 및 수업 관리",
    description: "이미 개설된 코스와 수업을 찾고, 수업 기록을 확인하고, 학기가 끝난 코스를 종료하는 관리자 업무입니다. 강사가 바뀌어 담임 교사와 수업 교사를 넘겨야 할 때, 코스를 종료하기 전에 확인할 것도 함께 봅니다.",
    audience: "학원 관리자, 운영팀",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    tags: ["코스 관리", "수업 검색", "학습 보고서", "녹화본"],
    keywords: ["코스 검색", "코스 종료", "수업 모니터링 데이터", "웹 라이브 관리", "학습 보고서", "담임 교사 변경", "수업 교사 변경", "대량 작업", "다시 보기 유효 기간", "수업 관리", "조작", "수업 삭제", "코스 삭제 안 됨", "지난 수업 정리", "휴지통 단원", "수업 목록 숨기기", "수업 이동"],
    chatbotSummary: "[기관 관리] > [코스 관리]에서 코스 이름·교사·시작/종료일로 코스를 찾고 담임 교사 변경과 코스 종료를 하며, [수업 관리]에서 찾은 수업의 [조작] 메뉴로 모니터링 데이터, 수업 데이터, 웹 라이브 기록, 녹화 데이터, 학습 보고서를 봅니다. 종료한 코스는 복구할 수 없고 종료 뒤 녹화본을 다시 볼 수 있는지는 코스 설정에 따라 다르므로, 남은 수업과 보관할 녹화본을 먼저 확인한 뒤 종료합니다. 끝난 수업은 앱 목록에서 지울 수 없으니 '휴지통' 같은 단원을 만들어 옮겨 정리하고, 수업 데이터는 [스토리지] > [수업 리소스]에서 지웁니다.",
    sections: [
      {
        heading: "코스 찾기",
        body: "코스가 많아지면 이름만으로는 찾기 어렵습니다. 조건을 넣어 좁힌 뒤, 목록에 나온 숫자가 예상과 맞는지 봅니다.",
        steps: [
          "경로: 관리자 대시보드 > [기관 관리] > [코스 관리]",
          "코스 이름, 교사, 코스 시작·종료일 같은 조건을 넣어 검색합니다.",
          "목록에서 코스 생성일, 추가된 수업 횟수, 담임 교사, 참여 학생 수를 봅니다.",
          "수업 횟수나 학생 수가 예상과 다르면 코스 이름을 눌러 [시간표]와 [구성원]을 확인합니다.",
        ],
      },
      {
        heading: "강사가 바뀔 때 담임·수업 교사 넘기기",
        body: "강사가 그만두거나 다른 강사가 반을 넘겨받을 때 씁니다. 수업마다 정해 둔 수업 교사는 담임 교사와 별개 설정이라, 담임을 바꾼 뒤 이미 만든 수업의 수업 교사도 따로 바꿉니다.\n\n[대량 작업]에서는 수업 교사 말고도 수업 시작 시간, 온스테이지 인원 수, 수업 녹화·웹 라이브·다시 보기 설정을 여러 수업에 한 번에 바꿉니다.",
        steps: [
          "경로: [기관 관리] > [코스 관리] > 코스 이름 > [구성원] > [교사로 설정]",
          "새 강사를 골라 [확인]을 누릅니다. 목록에 없으면 창 아래 [교사 추가]로 휴대폰 번호나 이메일과 이름을 넣어 추가합니다.",
          "새 강사 이름 아래 더보기(···) 메뉴에서 [담임 교사로 설정]을 누릅니다.",
          "[학습 활동] 탭에서 수업을 전체 선택하고 [대량 작업] > [수업 교사 설정하기]에서 새 강사를 고른 뒤 [확인]을 누릅니다.",
          "[구성원]으로 돌아가 이전 강사의 더보기 메뉴에서 [교사 삭제]를 누릅니다.",
        ],
      },
      {
        heading: "특정 수업 찾기",
        body: "한 회차에 문제가 있었는지 볼 때는 수업 단위로 찾습니다. 수업 이름, 교사, 기간으로 검색하면 그 수업이 속한 코스와 시작 시간, 교사, 학생이 나옵니다. 특정 학생의 결석이나 지각을 확인하려면 이어서 수업 모니터링 데이터의 입장·퇴장 기록을 봅니다.",
        steps: ["경로: 관리자 대시보드 > [기관 관리] > [수업 관리]"],
      },
      {
        heading: "수업 기록 확인하기",
        body: "수업 목록의 [조작] 버튼을 누르면 그 수업의 기록을 여는 메뉴가 나옵니다. 녹화 데이터와 웹 라이브 기록은 교사가 수업을 만들 때 그 옵션을 켰을 때만 남습니다. 메뉴가 보이지 않으면 내 관리자 계정에 그 메뉴 권한이 있는지 먼저 확인합니다.\n\n학습 보고서 링크를 학부모에게 보낼 때는 이렇게 보내면 됩니다.\n\n> 오늘 수업의 학습 보고서입니다. 수업 중 칠판 화면과 판서 내용을 아래 링크에서 보실 수 있습니다.",
        steps: [
          "경로: [기관 관리] > [수업 관리] > [조작]",
          "수업 모니터링 데이터에서는 1분마다 자동으로 찍힌 교실 캡처와 교사·학생의 입장, 퇴장 기록을 봅니다. 출결을 확인할 때 씁니다.",
          "수업 데이터에서는 교사와 학생의 수업 참여 데이터를 봅니다.",
          "웹 라이브 및 다시보기 관리에서는 웹 라이브를 켠 수업의 실시간 시청 현황을 봅니다.",
          "수업 녹화 데이터에서는 화면 녹화와 현장 녹화 원본을 보고 내려받습니다.",
          "학습 보고서에서는 교사의 강의 보고서와 학생의 학습 보고서를 보거나 링크를 복사합니다.",
        ],
      },
      {
        heading: "코스를 종료하기 전에",
        body: "학기가 끝났거나 더 이상 운영하지 않는 코스는 [코스 관리]에서 종료합니다. 종료한 코스는 복구할 수 없습니다. 종료 뒤 그 코스의 수업 활동과 녹화본을 다시 볼 수 있는지는 코스 설정에 따라 달라집니다. 자동 삭제 작업을 만들지 않았다면 코스를 종료해도 판서, 스크린샷, 녹화 같은 수업 콘텐츠는 지워지지 않습니다. 종료 버튼을 누르기 전에 아래를 먼저 봅니다.",
        steps: [
          "진행 중이거나 예정된 수업이 남아 있지 않은지 [시간표]에서 확인합니다.",
          "종료 뒤에도 학생이 녹화본을 봐야 한다면 코스 [설정]에서 [다시 보기 유효 기간]과 코스 자료 열람 허용 항목을 먼저 확인합니다. 유효 기간은 특정 날짜까지 여는 방식과 수업 종료 후 며칠 동안 여는 방식 중에서 고르고 [설정 저장하기]를 누릅니다.",
          "학원에서 따로 보관할 녹화본은 수업 녹화 데이터에서 미리 내려받습니다.",
          "학부모에게 보낼 학습 보고서 링크가 남아 있으면 먼저 보냅니다.",
          "미제출 과제나 채점이 남은 활동이 있으면 학생에게 먼저 알립니다.",
          "모두 확인했으면 [코스 관리]에서 코스를 종료합니다.",
        ],
      },
      {
        heading: "지난 수업이 앱에서 지워지지 않을 때",
        body: "이미 진행했거나 끝난 수업은 구성원 기록과 연결돼 있어 앱 목록에서 지울 수 없습니다. 시범 강의용으로 만든 수업이나 지난 수업이 목록에 쌓여 있다면, 코스 안에 '휴지통' 같은 이름의 단원을 따로 만들어 그 단원으로 옮겨 정리합니다.\n\n끝난 학습 활동은 같은 코스의 같은 과정 안에서만 끌어서 옮길 수 있습니다. 단원 사이 이동은 되지만, 다른 과정이나 다른 코스로는 옮기지 못합니다.\n\n녹화나 스크린샷 같은 수업 데이터는 관리자 대시보드의 [스토리지] > [수업 리소스]에서 지웁니다. 여기서 녹화를 지우면 수업 상세에서 그 녹화만 볼 수 없게 되고, 수업 페이지와 진행 기록은 그대로 남습니다.",
        steps: [
          "코스 안에 '휴지통'처럼 알아보기 쉬운 이름으로 단원을 새로 만듭니다.",
          "정리할 지난 수업을 그 단원으로 끌어다 옮깁니다.",
          "용량을 비워야 한다면 [스토리지] > [수업 리소스]에서 그 수업의 데이터를 지웁니다.",
        ],
      },
      {
        heading: "종료와 교사 변경에서 자주 하는 실수",
        body: "주로 되돌릴 수 없는 작업과 메뉴 권한에서 생깁니다.",
        steps: [
          "여러 코스를 확인 없이 한꺼번에 종료합니다. 종료는 되돌릴 수 없으니 코스마다 위 항목을 보고 닫습니다.",
          "담임 교사만 바꾸고 수업 교사는 그대로 둡니다. 이전 강사가 수업 교사로 남아 있으면 [대량 작업]으로 바꿉니다.",
          "메뉴가 안 보여서 기능이 없다고 판단합니다. 하위 계정은 받은 권한의 메뉴만 보이므로 [권한 관리]부터 확인합니다.",
          "결제나 오프라인 출결 정산을 클래스인 관리 화면 안에서 끝내려고 합니다. 이런 정산은 [통계 다운로드]로 수업 일자, 수업 시간, 담당 교사, 출석 학생 수를 엑셀로 받아 학원 시스템에서 따로 정리합니다. 연동이 필요하면 상담에서 방법을 확인하세요.",
        ],
      },
    ],
    relatedSlugs: ["course-creation", "class-monitoring", "web-live-playback", "statistics-data", "storage-management", "teacher-onboarding", "course-units"],
  },
  {
    slug: "storage-management",
    category: "admin",
    title: "스토리지 관리",
    description: "학원 스토리지가 얼마나 찼는지 보고, 녹화본과 수업 캡처를 확인해 정리합니다. 지우면 안 되는 수업에 보호 잠금을 거는 방법, 삭제 전에 관리자가 확인할 것도 있습니다.",
    audience: "학원 관리자",
    updatedAt: "2026-09-24",
    readMinutes: 4,
    tags: ["스토리지", "수업 리소스", "녹화본", "보호 잠금"],
    keywords: ["스토리지 사용량", "수업 스크린샷", "수업 녹화본", "보호 잠금", "자물쇠", "출결", "데이터 개요", "녹화된 수업 비디오", "모든 수업 데이터 삭제하기", "잠금 해제", "스토리지 초과", "녹화 저장 기간", "자동 삭제", "스토리지 용량", "오래된 녹화", "녹화 저장 위치"],
    chatbotSummary: "[스토리지] > [데이터 개요]에서 수업 리소스, 코스 첨부 파일, 공유 드라이브, 게시판 문서별 사용량과 전체 용량을 보고, [스토리지] > [수업 리소스]에서 수업별 스크린샷·출결·녹화본을 확인하고 내려받거나 지웁니다. 자동 삭제는 처음에 꺼져 있어 켜지 않으면 녹화가 저절로 지워지지 않고, 남겨야 할 수업은 [자물쇠] 아이콘으로 보호 잠금을 걸면 삭제 작업에서 빠지며, 무료 제공 용량과 요금은 요금제·계약에 따라 달라 상담 채널에서 확인합니다.",
    sections: [
      {
        heading: "스토리지에 잡히는 데이터",
        body: "학원 스토리지 용량에는 세 가지가 함께 계산됩니다. 코스 [과정] 탭의 학습 활동 파일, 수업이 끝난 뒤 생기는 녹화본·스크린샷·칠판 파일 같은 수업 리소스, 학원 구성원이 같이 쓰는 공유 드라이브입니다. 무료로 제공되는 용량과 그보다 많이 쓸 때의 요금은 요금제·계약마다 달라 상담 채널에서 확인합니다.",
      },
      {
        heading: "사용량 확인",
        body: "사용 중인 용량과 전체 용량을 봅니다. 항목은 이렇게 나뉩니다.\n\n- **수업 리소스**: 수업 녹화본, 스크린샷, 판서 같은 수업 데이터\n- **코스 첨부 파일**: 코스 [과정]의 학습 활동에 올린 자료\n- **공유 드라이브**: 학원이 쓰는 공유 드라이브\n- **게시판 문서**: 코스 게시판에 쓴 용량\n- **전체**: 위 항목의 합계",
        steps: ["경로: 관리자 대시보드 > [스토리지] > [데이터 개요]"],
      },
      {
        heading: "수업별 리소스 찾기",
        body: "수업이 끝난 뒤 생긴 녹화본, 스크린샷, 출결 기록은 [스토리지] > [수업 리소스]에 모입니다. 수업 이름이나 코스 이름, 수업 기간, 태그, 보호 잠금 여부로 검색하면 수업 날짜와 스크린샷·녹화본 용량이 함께 나옵니다. 용량을 많이 차지하는 수업을 찾을 때도 여기서 봅니다.",
      },
      {
        heading: "수업 스크린샷과 출결 확인",
        body: "수업 중 1분마다 자동 저장된 스크린샷을 보고 저장합니다. 같은 화면을 아래로 내리면 교사와 학생의 출결, 입장·퇴장 기록이 나옵니다. 학생이 그 수업에 실제로 들어왔는지 확인할 때 씁니다.",
        steps: [
          "경로: [스토리지] > [수업 리소스] > [오퍼레이션] > [수업 스크린샷]",
          "확인할 수업을 찾아 스크린샷을 보고, 필요한 장면은 저장합니다.",
          "아래로 내려 참여자의 출결과 입장·퇴장 기록을 봅니다.",
        ],
      },
      {
        heading: "수업 녹화본 보기, 내려받기, 공유하기",
        body: "[수업 리소스]에서 수업 오른쪽의 [녹화된 수업 비디오]를 누르면 그 수업에 저장된 영상이 나옵니다. 여기서 영상을 보고 내려받고, 필요 없으면 지웁니다. 지운 영상은 구성원 누구도 더 볼 수 없습니다. 학원에서 따로 편집한 영상이 있으면 동영상 파일을 올려 둘 수도 있습니다.\n\n재생 링크는 로그인 없이 열릴 수 있으므로, 받을 사람을 정한 뒤 보냅니다.",
        steps: [
          "경로: [스토리지] > [수업 리소스] > [오퍼레이션] > [녹화된 수업 비디오]",
          "클립 목록에서 파일 상태와 크기를 보고, 받을 클립의 [다운로드]를 누릅니다. 플레이어에서 받을 때는 오른쪽 아래 더보기(···) 메뉴의 [다운로드]를 씁니다.",
          "공유가 필요하면 브라우저 주소창의 재생 링크를 복사해 보냅니다.",
        ],
        media: [
          {
            type: "image",
            src: "/docs/files/cs-figma/대시보드-수업-내용-다운로드-및-공유.png",
            alt: "관리자 대시보드 수업 리소스에서 녹화된 수업 비디오를 열어 클립을 내려받고 재생 링크를 복사해 공유하는 화면",
            caption: "[녹화된 수업 비디오]에서 클립을 내려받거나 재생 링크로 공유합니다.",
            width: 1440,
            height: 2000,
          },
        ],
      },
      {
        heading: "보호 잠금으로 남길 수업 지키기",
        body: "자동 삭제는 처음에 꺼져 있어, 켜지 않으면 녹화와 스크린샷이 저절로 지워지지 않습니다. 용량을 관리하려고 자동 삭제를 켜 두는 학원이 많은데, 그중 꼭 남겨야 하는 수업은 보호 잠금을 걸어 둡니다. [수업 리소스] 화면의 삭제 작업은 보호 잠금이 풀린 수업에만 적용됩니다.",
        steps: [
          "경로: 관리자 대시보드 > [스토리지] > [수업 리소스]",
          "남길 수업을 찾아 보호 잠금 칸의 [자물쇠] 아이콘을 누릅니다.",
          "여러 수업을 한 번에 잠그거나 풀려면 수업을 체크하고 위쪽 [보호 잠금] 또는 [잠금 해제] 버튼을 누릅니다.",
          "잠가 둔 수업은 검색 조건의 보호 잠금 필터로 모아 봅니다.",
        ],
      },
      {
        heading: "수업 데이터 지우기",
        body: "용량을 비우려면 [수업 리소스]에서 수업을 골라 지웁니다. 지운 스크린샷, 녹화 영상, 칠판 내용은 복구되지 않고, 학생의 다시보기 화면에는 저장된 다시보기 영상이 없다는 안내가 나옵니다. 녹화를 지워도 수업 페이지와 수업 진행 기록은 남고, 앱의 지난 수업 목록도 그대로입니다. 목록 정리는 코스 안에 '휴지통' 단원을 만들어 옮기는 방식으로 합니다.\n\n기간을 정해 한꺼번에 지우거나 자동 삭제를 켜는 방법은 [일반 설정] > [저장 설정]에 있습니다.",
        steps: [
          "경로: 관리자 대시보드 > [스토리지] > [수업 리소스]",
          "지우기 전에 학원에서 보관할 영상은 먼저 내려받고, 남길 수업에는 보호 잠금을 겁니다.",
          "수업 시간이나 코스 이름으로 대상을 좁히고, 지울 수업을 체크합니다.",
          "[모든 수업 데이터 삭제하기]를 누릅니다. 스크린샷이나 영상만 지우려면 [이미지 삭제], [동영상 삭제]를 씁니다.",
          "알림 창에서 삭제될 수업 수가 맞는지 확인하고 [확인]을 누릅니다. 보호 잠금이 걸린 수업은 이때 빠집니다.",
          "코스 종료를 앞둔 반은 지우기 전에 필요한 녹화본과 학습 보고서를 먼저 챙깁니다.",
        ],
      },
    ],
    relatedSlugs: ["shared-drive", "institution-settings", "course-management"],
  },
  {
    slug: "shared-drive",
    category: "admin",
    title: "공유 드라이브 관리",
    description: "학원 공용 수업 자료는 공유 드라이브에 모아 강사들과 나눠 씁니다. 관리자가 드라이브를 만들고, 강사마다 올리기·내려받기·보기 권한을 다르게 준 뒤 자료를 올리는 순서를 따라가면 됩니다.",
    audience: "학원 관리자, 교사",
    updatedAt: "2026-09-24",
    readMinutes: 4,
    tags: ["공유 드라이브", "권한", "파일 업로드", "Google Drive"],
    keywords: ["공유 드라이브 만들기", "구성원 초대", "관리자 권한", "컨텐츠 관리자", "읽기 전용", "Google Drive 연동", "구성원 관리", "감추기", "HWP", "폴더 2,000개", "내 드라이브", "드라이브 리소스", "공유 드라이브 안 보여요", "공유 드라이브 권한", "다른 계정"],
    chatbotSummary: "공유 드라이브는 개인용 내 드라이브와 달리 학원에 등록된 교사들과 함께 쓰는 자료 공간으로, 관리자 대시보드 [스토리지] > [공유 드라이브] > [공유 드라이브 만들기]에서 폴더명을 정하고 [구성원 초대]로 교사를 넣은 뒤 관리자·컨텐츠 관리자·읽기 전용·감추기 중 하나를 줍니다. 수업에서 쓰기만 하게 하려면 읽기 전용이 맞고, 폴더는 최대 2,000개까지 만들며, 지운 자료는 복구되지 않고 HWP 파일은 PDF로 바꿔 올립니다.",
    sections: [
      {
        heading: "내 드라이브와 무엇이 다른가",
        body: "내 드라이브는 강사 개인 공간이고, 공유 드라이브는 학원에 등록된 교사들과 같이 쓰는 공간입니다. 반별 교재나 공통 시험지처럼 여러 강사가 쓰는 자료를 한곳에 두고, 강사마다 할 수 있는 일을 권한으로 나눕니다. 무료로 제공되는 용량은 요금제에 따라 다르고, 공유 드라이브 사용량도 학원 스토리지에 포함됩니다.",
      },
      {
        heading: "공유 드라이브 만들기",
        body: "폴더명을 정해 만들고, 만들면서 구성원과 권한도 같이 정합니다. 폴더명은 나중에 바꿀 수 있습니다.",
        steps: [
          "경로: 관리자 대시보드 > [스토리지] > [공유 드라이브] > [공유 드라이브 만들기]",
          "폴더명을 입력합니다.",
          "[구성원 초대]를 누르고 함께 쓸 교사를 골라 [확인]을 누릅니다.",
          "교사 이름 오른쪽 메뉴에서 권한을 정합니다.",
          "이미 만든 드라이브는 오른쪽 더보기(···) 메뉴에서 [구성원 관리], 이름 변경, 삭제를 합니다.",
        ],
      },
      {
        heading: "권한 네 가지",
        body: "권한은 네 단계입니다.\n\n- **관리자**: 파일을 올리고 내려받으며, 구성원을 추가하거나 뺍니다.\n- **컨텐츠 관리자**: 파일을 올리고 내려받습니다.\n- **읽기 전용**: 파일을 열어 보기만 합니다.\n- **감추기**: 파일을 볼 수 없습니다.\n\n수업 중에 자료를 쓰게 하되 파일을 내려받지 못하게 하려면 읽기 전용으로 줍니다. 자료를 함께 만드는 강사는 컨텐츠 관리자, 드라이브를 같이 관리할 담당자만 관리자로 둡니다. 권한은 교사 이름 오른쪽 메뉴(···)에서 언제든 바꿉니다.",
      },
      {
        heading: "자료 올리기",
        body: "왼쪽 위 [업로드] 버튼을 누르거나, 컴퓨터에 있는 파일을 대시보드 화면으로 끌어다 놓으면 올라갑니다. 흩어진 자료는 드라이브 안에 폴더를 만들어 정리합니다.\n\nPPT, PDF, JPG, MP3, MP4 같은 대부분의 파일은 올려서 수업에 바로 씁니다. HWP(한글) 파일은 지원하지 않으니 PDF로 바꿔서 올립니다.",
      },
      {
        heading: "폴더 정리와 삭제 전 주의",
        body: "과목, 학년, 레벨별로 폴더를 나누고, 폴더마다 구성원과 권한을 다르게 주면 강사가 자기 반 자료를 바로 찾습니다. 공유 드라이브 안에는 폴더를 최대 2,000개까지 만들 수 있습니다.\n\n공유 드라이브에서 지운 자료는 복구되지 않습니다. 여러 강사가 같이 쓰는 자료라면 지우기 전에 담당 강사와 먼저 확인합니다.",
      },
      {
        heading: "강사 화면에서는 어디에 보이나",
        body: "강사는 클래스인 앱 왼쪽 메뉴의 [드라이브] > [공유 드라이브]에서 학원을 고르면, 받은 권한 안에서 자료를 엽니다. 수업을 만들 때 [드라이브 리소스]에 이 공유 드라이브 위치를 지정해 두면 그 수업에서 쓸 자료 위치가 정해집니다.\n\n강사가 공유 드라이브가 안 보인다고 하면, 드라이브 구성원으로 등록한 계정과 강사가 지금 로그인한 계정이 같은지부터 봅니다. 휴대폰 번호 계정을 구성원으로 넣었는데 구글 계정처럼 다른 계정으로 로그인하면 공유 드라이브가 보이지 않습니다. 등록한 계정으로 다시 로그인하게 합니다.\n\n자료를 올린 뒤 강사에게 이렇게 알리면 됩니다.\n\n> 선생님, 학원 공유 드라이브에 이번 학기 교재를 올려 두었습니다.\n> 클래스인 앱 왼쪽 [드라이브] > [공유 드라이브]에서 우리 학원을 선택하면 보입니다. 수업 중에 바로 열어 쓰시면 됩니다.",
      },
      {
        heading: "Google Drive 연동",
        body: "구글 드라이브에 있는 자료를 클래스인에서 바로 쓰려면 연동합니다. 구글 계정으로 로그인해 연결하는 방식입니다.",
        steps: [
          "경로: PC 클래스인 앱 > [드라이브] > [Google Drive]",
          "구글 계정으로 로그인해 연동합니다.",
          "연동한 뒤에는 구글 드라이브 자료를 온라인 교실에서 바로 엽니다.",
        ],
      },
    ],
    relatedSlugs: ["storage-management", "drive-materials", "institution-settings", "teacher-onboarding"],
  },
  {
    slug: "web-live-playback",
    category: "admin",
    title: "웹 라이브 & 플레이백",
    description: "학부모 설명회나 샘플 수업처럼 앱 설치 없이 링크 하나로 수업을 보여 줘야 할 때는 웹 라이브 수업을 엽니다. 관리자가 수업을 만들고, 링크를 보내고, 볼 수 있는 사람을 정하고, 끝난 뒤 시청 기록을 확인하는 데까지 따라갑니다.",
    audience: "학원 관리자, 운영팀",
    updatedAt: "2026-09-24",
    readMinutes: 5,
    tags: ["웹 라이브", "플레이백", "다시보기", "생중계"],
    keywords: ["웹 라이브", "플레이백", "비밀번호 시청", "좋아요", "채팅", "라이브 커버", "설명회", "샘플 수업", "웹 페이지 링크", "QR", "시청 데이터", "실시간 채팅", "웹 라이브 요금제", "웹 라이브 가능 요금제"],
    chatbotSummary: "웹 라이브는 수업을 만들 때 수업 녹화 옵션을 하나 이상 켜고 [웹 라이브 & 플레이백]을 켜면 생깁니다. 링크는 코스 [시간표]나 대시보드 [라이브&플레이백] > [웹 페이지 링크]에서 복사하고, 로그인·비밀번호·좋아요·채팅 권한은 관리자 대시보드에서만 정합니다. 송출은 강사가 교실에서 [수업 녹화]를 누를 때 시작되고, 끝난 뒤 시청자 수와 좋아요 수는 [라이브&플레이백] > [오퍼레이션] > [관리]에서 봅니다.",
    sections: [
      {
        heading: "웹 라이브와 플레이백이 하는 일",
        body: "웹 라이브는 클래스인 수업 화면을 웹 링크로 실시간 중계합니다. 보는 사람은 앱을 설치하지 않아도 되고, 로그인을 요구하도록 설정하지 않았다면 로그인도 필요 없습니다. 플레이백까지 켜 두면 라이브가 끝난 뒤 같은 링크가 다시보기 링크가 됩니다.\n\n학부모 설명회, 샘플 수업, 참여자가 많은 일회성 강연처럼 한 방향으로 전달하는 자리에 맞습니다. 학생과 주고받는 수업이 목적이라면 학생이 교실에 직접 들어오는 평소 방식이 맞습니다. 강사가 교실 안에서 웹 라이브를 여는 방법은 '수업 - 웹 라이브 & 플레이백' 문서에 따로 있습니다.\n\n라이브와 플레이백을 쓸 수 있는 조건과 비용은 요금제·계약마다 다릅니다. 참여자가 많은 행사를 열기 전에는 상담으로 조건을 먼저 확인하세요.",
      },
      {
        heading: "웹 라이브 수업 만들기",
        body: "웹 라이브는 [라이브&플레이백] 메뉴에서 따로 만드는 것이 아니라, 수업을 만들 때 옵션으로 켭니다. 수업 녹화 옵션을 하나 이상 켜야 [웹 라이브 & 플레이백] 옵션이 나타납니다.",
        steps: [
          "경로: 관리자 대시보드 > [코스 관리] > 코스 이름 > [시간표] > [수업 생성]",
          "수업 시간을 정하고 수업 녹화 옵션을 하나 이상 켭니다.",
          "[웹 라이브 & 플레이백] 옵션을 켭니다. 생중계만 할지, 끝난 뒤 다시보기(플레이백)까지 열지 여기서 고릅니다.",
          "시청 권한, 로그인·비밀번호, 채팅, 커버 이미지, 소개를 수업 성격에 맞게 정한 뒤 [게시하기]를 누릅니다.",
        ],
      },
      {
        heading: "링크 복사해서 보내기",
        body: "게시한 수업의 링크는 두 곳에서 복사합니다. 비밀번호를 걸었다면 링크와 비밀번호를 꼭 같이 보내세요. 비밀번호가 빠지면 시청자가 들어오지 못합니다.\n\n학부모에게는 이렇게 보내면 됩니다.\n\n> ○월 ○일 ○시 설명회는 아래 링크에서 보실 수 있습니다. 앱을 설치하지 않아도 링크를 누르면 바로 열립니다. 시청 비밀번호는 ○○○○입니다.",
        steps: [
          "코스의 [시간표]에서 아래쪽 다이얼을 좌우로 움직여 그 수업의 [웹 라이브 & 플레이백] 링크를 찾고, QR이나 웹 링크로 복사합니다.",
          "시간표에서 찾기 어려우면 관리자 대시보드 [라이브&플레이백] > [웹 페이지 링크]를 엽니다. 기관에 추가된 수업마다 웹 참여 링크가 있어 여기서도 복사됩니다.",
          "복사한 링크를 재원생이나 외부 참여자에게 보냅니다.",
        ],
        media: [
          {
            type: "image",
            src: "/docs/files/cs-figma/웹-라이브-사용-방법-안내-대시보드.png",
            alt: "관리자 대시보드 코스 관리에서 수업을 만들며 웹 라이브 & 플레이백을 켜고, 시간표에서 QR·웹 링크를 복사한 뒤 관리 메뉴에서 시청 데이터를 보는 단계별 화면",
            caption: "대시보드에서 웹 라이브 수업을 만들고 QR·웹 링크를 복사하는 순서",
            width: 1440,
            height: 4700,
          },
        ],
      },
      {
        heading: "누가 볼 수 있는지 정하기",
        body: "아무 설정 없이 두면 링크를 받은 사람은 누구나 들어옵니다. 외부 공개용 설명회가 아니라 재원생만 볼 수업이라면 로그인 요구나 비밀번호를 걸어 두세요. 이 세부 설정은 관리자 대시보드에서만 바꿀 수 있어서, 강사가 요청하면 관리자가 대신 설정해 줘야 합니다.",
        steps: [
          "경로: 관리자 대시보드 > [라이브&플레이백] > 세부 설정",
          "조건 검색으로 대상 수업을 찾습니다.",
          "로그인 요구, 비밀번호 시청, 좋아요·채팅 권한을 정합니다. 로그인을 요구하면 시청자는 클래스인 ID로 로그인해야 하고, 요구하지 않으면 닉네임만 입력하고 들어옵니다.",
          "라이브 커버와 소개글을 작성합니다.",
          "수업 하나만 다르게 하려면 목록에서 그 수업 오른쪽 오퍼레이션의 [관리]를 눌러 따로 편집합니다. 기관 전체의 라이브 설정은 '웹 생방송 다시 보기 설정'에서 바꿉니다.",
        ],
      },
      {
        heading: "수업 당일 강사에게 알려 줄 것",
        body: "웹 라이브 송출은 강사가 교실에 들어가 [수업 녹화]를 누르는 순간 시작됩니다. 녹화를 누르기 전에 수업 자료와 카메라를 먼저 맞춰 두도록 강사에게 미리 말해 주세요.\n\n시청자가 남긴 채팅은 강사가 교실 안 [수업 도구] > [실시간 채팅]에서 봅니다. 이 채팅 창은 교실에 있는 학생에게는 보이지 않고 녹화에도 남지 않습니다. 학생들과 나눠야 할 질문이 있으면 캡처해서 전달합니다.",
      },
      {
        heading: "끝난 뒤 시청 기록 보기",
        body: "몇 명이 봤는지, 채팅이 얼마나 오갔는지는 수업이 끝난 뒤 두 곳에서 봅니다.",
        steps: [
          "경로: 관리자 대시보드 > [라이브&플레이백] > [오퍼레이션] > [관리]",
          "시청자 수와 좋아요 수를 봅니다.",
          "수업 목록에서 보려면 [기관 관리] > [수업 관리]에서 그 수업을 찾아 [조작] > [웹 라이브 및 다시보기 관리]를 엽니다. 시청한 사용자, 채팅, 시청 데이터가 나옵니다.",
        ],
      },
      {
        heading: "옵션이 안 보이거나 시청자가 못 들어올 때",
        body: "대부분 아래 네 가지 가운데 하나입니다. 위에서부터 차례로 확인하세요.",
        steps: [
          "[웹 라이브 & 플레이백] 옵션이 없으면 수업 녹화 옵션이 꺼져 있는지 봅니다. 녹화 옵션을 하나 이상 켜야 나타납니다.",
          "녹화 옵션까지 막혀 있다면 계정 인증을 마쳤는지 봅니다. 계정 인증을 끝내지 않은 기관은 유료 전환 뒤에도 수업 녹화와 웹 라이브가 제한됩니다.",
          "시청자가 들어오지 못하면 로그인 요구와 비밀번호 설정을 봅니다. 로그인을 요구해 두면 클래스인 ID가 없는 학부모는 들어오지 못합니다.",
          "링크는 열리는데 화면이 나오지 않으면 강사가 교실에서 [수업 녹화]를 눌렀는지 확인합니다.",
        ],
      },
    ],
    relatedSlugs: ["lesson-web-live", "course-creation", "course-management", "account-verification", "class-monitoring"],
  },
  {
    slug: "class-monitoring",
    category: "admin",
    title: "수업 모니터링",
    description: "수업 중에 '학생이 못 들어와요', '소리가 안 들려요' 연락이 오면 관리자는 진행 중인 수업의 출석과 접속 상태부터 봅니다. 그다음 못 들어온 학생의 원인을 좁혀 가고, 강사에게 미리 알려 둘 것을 챙깁니다.",
    audience: "학원 관리자, 운영팀",
    updatedAt: "2026-09-24",
    readMinutes: 5,
    tags: ["모니터링", "실시간", "출석", "운영"],
    keywords: ["수업 모니터링", "실시간 접속", "출석 확인", "접속 기기", "운영 지원", "학생 수 도표", "교실 스크린샷", "수업 모니터링 데이터", "학생 입장 기록", "코스 추가 시간", "어떤 계정으로 수강", "수업 못 들어옴", "문의 방법", "오류 신고", "수업 이름 찾기"],
    chatbotSummary: "관리자 대시보드 [관리자 기능] > [수업 모니터링]에서 진행 중인 수업의 교사·학생 출석 여부와 접속 기기 정보를 보고, 필요하면 관리자 권한으로 그 교실에 들어갑니다. 관리자가 들어가도 교사와 학생에게 알림이 가지 않으므로 강사에게 목적을 미리 알려 두세요. 학생이 수업에 못 들어왔다면 [코스 관리] > 코스 > [구성원]에서 코스 추가 시간과 들어와 있는 계정을 확인하고, 원인이 안 보이면 수업 이름·클래스인 아이디·수업 시작 시각을 상담 채널로 보내 함께 확인합니다.",
    sections: [
      {
        heading: "모니터링 화면에서 보이는 것",
        body: "관리자 대시보드 [관리자 기능] > [수업 모니터링]에서 학원에 지금 열려 있는 수업을 실시간으로 봅니다. 수업마다 교사와 학생의 출석 여부가 나오고, 필요하면 관리자 권한으로 그 교실에 직접 들어갑니다. 관리자가 들어가도 교사와 학생에게는 알림이 가지 않습니다.\n\n수업 하나를 열면 세 가지가 함께 나옵니다. 약 1분 간격으로 자동 저장되는 교실 스크린샷, 시간대별 접속 인원을 그린 학생 수 도표, 참여자별 출석 상태와 입장·퇴장 시각을 적은 출석 표입니다. 결석·지각·조퇴는 빨간 글씨로 표시됩니다.",
      },
      {
        heading: "시작하기 전에 정해 둘 것",
        body: "관리자가 교실에 들어가도 알림이 없기 때문에, 강사들에게 미리 말해 두지 않으면 나중에 오해가 생깁니다. 목적은 '문제가 생긴 수업을 빨리 찾아 돕는 것' 하나로 정하고 시작하세요.\n\n강사에게는 이렇게 알리면 됩니다.\n\n> 수업 중 학생 입장이나 소리 문제가 생기면 운영팀이 바로 도울 수 있도록, 관리자가 출석과 접속 상태를 확인하고 필요하면 교실에 잠깐 들어갈 수 있습니다. 평가 목적이 아니며, 문제가 생기면 ○○로 바로 연락 주세요.",
        steps: [
          "모니터링을 맡을 사람을 정합니다. 그 사람에게 하위 계정을 만들어 줄 때 권한 메뉴에 [관리자 기능]을 포함합니다. 하위 계정은 [계정 정보] > [권한 관리] > [하위 계정 추가]에서 만듭니다.",
          "점검 시간을 정합니다. 예를 들어 교시가 시작된 직후 몇 분만 보고, 그 밖에는 연락이 온 수업만 봅니다.",
          "강사와 학생이 문제를 알릴 연락 창구(전화, 메신저)를 하나로 정합니다.",
        ],
      },
      {
        heading: "수업 시작 직후 점검하는 순서",
        body: "교실마다 처음부터 끝까지 볼 필요는 없습니다. 목록에서 이상해 보이는 수업만 골라 들어갑니다.",
        steps: [
          "경로: 관리자 대시보드 > [관리자 기능] > [수업 모니터링]",
          "진행 중인 수업 목록에서 교사가 아직 입장하지 않았거나 출석 학생이 유난히 적은 수업을 먼저 찾습니다.",
          "그 수업의 학생 수 도표를 봅니다. 접속 인원이 갑자기 떨어진 시점이 있으면 출석 표에서 그 시각에 누가 나갔는지 확인합니다.",
          "화면이나 소리를 직접 봐야 할 때만 교실에 들어가고, 문제가 없으면 바로 나옵니다.",
        ],
      },
      {
        heading: "학생이 못 들어오거나 소리가 안 들린다고 할 때",
        body: "누가, 어느 수업에서 겪는 문제인지부터 확인합니다. 그다음 모니터링 화면에서 그 학생의 출석 상태와 입장·퇴장 시각을 봅니다. 입장 기록이 아예 없는지, 들어왔다 나가기를 반복했는지에 따라 볼 곳이 달라집니다.",
        steps: [
          "입장 기록이 없으면 관리자 대시보드 [코스 관리]에서 그 코스를 열고 [구성원]을 봅니다. 학생이 목록에 있는지, [코스 추가 시간]이 수업 전인지, 어느 계정으로 들어와 있는지 확인합니다.",
          "학원이 배정한 계정과 학생이 로그인한 계정이 다르면 로그아웃한 뒤 배정된 계정으로 다시 로그인하게 합니다. 자동 로그인 때문에 다른 아이디로 들어가 있는 경우가 많습니다.",
          "계정이 맞는데도 수업이 안 보이면 코스 초대를 눌러 참여했는지, 앱이 최신 버전인지 확인합니다.",
          "들어왔다 나가기를 반복하거나 소리·화면 문제라면 모니터링 화면에서 그 학생의 접속 기기 정보를 보고, 마이크·카메라 권한과 네트워크를 확인하게 한 뒤 다시 들어오게 합니다.",
          "화면 공유가 안 되는 것처럼 강사 쪽 문제라면 강사에게 바로 연락해 함께 봅니다.",
          "그래도 원인이 보이지 않으면 상담 채널에 수업 정보를 보내 주세요. 원인을 함께 확인합니다. 보낼 것은 관리자 대시보드에 표시된 수업 이름 그대로, 문제를 겪은 사람의 클래스인 아이디, 수업 시작 날짜와 시각입니다. 아이디가 없으면 확인이 어렵습니다.",
        ],
      },
      {
        heading: "끝난 수업의 기록을 다시 볼 때",
        body: "끝난 수업은 [기관 관리] > [수업 관리]에서 수업을 찾은 뒤 [조작] > [수업 모니터링 데이터]를 엽니다. 1분마다 자동 기록된 캡처 화면과 교사·학생의 입장·퇴장 기록이 남아 있습니다.\n\n이 캡처 이미지도 녹화본과 함께 기관 스토리지 용량에 포함됩니다. 보관 기준은 '스토리지 관리' 문서를 보세요. 오래 둘 필요가 없다면 [일반 설정] > [저장 설정]에서 자동 삭제 기간을 정해 두세요.",
      },
      {
        heading: "모니터링 기록을 쓸 때 지킬 것",
        body: "처음 운영 습관을 잘못 들이면 강사들이 모니터링을 감시로 받아들입니다. 아래 네 가지만 지키면 됩니다.",
        steps: [
          "정해 둔 점검 시간과 연락이 온 수업만 봅니다. 상시로 교실을 들여다보지 않습니다.",
          "강사 평가 근거로 쓰지 않습니다. 강사에게 알린 목적(수업 지원) 안에서만 씁니다.",
          "권한은 모니터링을 맡은 사람에게만 줍니다.",
          "출석·접속 기록과 학습 결과는 따로 봅니다. 기간별 수업 횟수나 출석 인원 흐름은 [통계 다운로드]로 받아 보고, 학생별 성적과 출석 리포트는 코스의 [성적]에서 봅니다.",
        ],
      },
    ],
    relatedSlugs: ["course-management", "statistics-data", "web-live-playback", "storage-management", "classroom-basic-setup"],
  },
  {
    slug: "statistics-data",
    category: "admin",
    title: "통계 데이터 활용",
    description: "월말이면 관리자와 강사는 강사별 수업량, 반별 출석 인원, 포인트 사용량을 확인하고 학부모에게 보낼 학생별 리포트를 준비합니다. 충전제 포인트 차감 내역을 보는 곳, 통계를 Excel로 받는 방법, 파일 속 수업 시간 계산 방식, 학생별 리포트를 PDF로 저장하는 순서를 따라가면 됩니다.",
    audience: "학원 관리자, 운영팀, 강사",
    updatedAt: "2026-09-24",
    readMinutes: 5,
    tags: ["통계", "엑셀", "주문 세부정보", "충전제"],
    keywords: ["주문 세부정보", "포인트 차감", "통계 다운로드", "엑셀", "수업 횟수", "스토리지 소비", "수업 소비", "결제 개요", "실제 수업 시간", "학습 데이터", "다시보기 시청 기록", "학생 리포트", "성적표", "월간 리포트", "PDF 저장", "학부모 보고서", "학습 보고서 출력", "출석 체크", "출결 관리", "오프라인 출석"],
    chatbotSummary: "충전제를 쓰는 기관은 관리자 대시보드 [결제] > [주문 세부정보]에서 기간별 포인트 차감 내역을 보고, [결제] > [통계 다운로드]에서 수업 횟수와 스토리지 소비 통계를 Excel로 받습니다. 파일에는 수업일자, 수업 지속 시간, 담당 교사, 출석 학생 인원이 나오고, 실제 수업 시간은 반 전체가 아니라 강사와 학생 한 사람씩 교실에 있던 시간으로 계산됩니다. 학생별 월간 리포트는 코스 [성적] > [학습 활동]에서 학생을 골라 [링크 복사] 뒤 브라우저 인쇄로 PDF 저장합니다. 차감 내역은 사용량 확인용이라 회계 정산 자료로 쓰기 전에 상담으로 기준을 확인하세요.",
    sections: [
      {
        heading: "통계에서 볼 수 있는 것",
        body: "관리자 대시보드의 [결제] 메뉴에서 두 가지를 봅니다. 충전제 기관의 포인트 차감 내역([주문 세부정보])과, 기간을 정해 내려받는 통계 파일([통계 다운로드])입니다.\n\n통계 파일은 Excel로 받고, 수업마다 수업일자, 수업 지속 시간, 담당 교사, 출석 학생 인원이 나옵니다. 강사별 수업량, 반별 출석 인원 변화, 스토리지가 늘어나는 속도를 따로 집계하지 않고 이 파일 하나로 봅니다.",
      },
      {
        heading: "포인트 차감 내역 보기",
        body: "충전제를 쓰는 기관만 해당합니다. 포인트가 예상보다 빨리 줄었을 때 어느 날, 어떤 항목에서 빠졌는지 여기서 좁혀 봅니다. 우리 기관이 어떤 요금제인지 모르겠다면 상담으로 확인하세요.",
        steps: [
          "경로: 관리자 대시보드 > [결제] > [주문 세부정보]",
          "조회할 기간과 조건을 넣어 차감 내역을 검색합니다.",
          "차감이 몰린 날짜와 항목을 봅니다.",
          "날짜별 비용 합계를 월 단위로 보려면 [결제] > [결제 개요]를 엽니다.",
        ],
      },
      {
        heading: "통계 파일 내려받기",
        body: "받은 Excel 파일은 바로 보고서로 쓸 수 있게 정리돼 있지는 않습니다. 월, 교사, 반 가운데 기준 하나를 정해 한 번 정리해야 비교가 됩니다.",
        steps: [
          "경로: 관리자 대시보드 > [결제] > [통계 다운로드]",
          "화면 위쪽에서 조회할 기간을 정합니다.",
          "[수업 소비] 항목의 [다운로드]를 누릅니다. 스토리지 사용량이 필요하면 같은 화면에서 스토리지 소비 항목을 받습니다.",
          "파일을 열어 수업일자, 수업 지속 시간, 담당 교사, 출석 학생 인원을 확인합니다.",
          "강사 한 명의 수업 일정만 빨리 보고 싶다면 [기관 관리] > [교사]에서 그 계정의 [보기]를 누릅니다. 수업 이름과 일정이 나오고, 한 화면에 최대 100개까지 봅니다.",
        ],
        media: [
          {
            type: "image",
            src: "/docs/files/cs-figma/관리자-대시보드-현재-수업-진행.png",
            alt: "관리자 대시보드에서 결제 → 결제 개요의 일자별 비용 내역과 결제 → 통계 다운로드의 수업 소비 Excel 다운로드를 확인하는 화면",
            caption: "결제 → [통계 다운로드]에서 수업 소비 데이터를 Excel로 받는 화면 (결제 개요의 일자별 비용 포함)",
            width: 1551,
            height: 3643,
          },
        ],
      },
      {
        heading: "수업 시간이 사람마다 다르게 나오는 이유",
        body: "통계의 실제 수업 시간은 반 전체 기준이 아니라 강사와 학생 한 사람씩 교실에 있었던 시간으로 계산됩니다. 30분 수업에 강사가 30분 있었고 학생이 일찍 들어와 40분 있었다면, 강사는 30분, 그 학생은 40분으로 적힙니다.\n\n그래서 같은 수업이라도 사람마다 시간이 다르게 나옵니다. 오류가 아니니 반 단위로 합칠 때는 이 점을 감안하세요.",
      },
      {
        heading: "학생이 다시보기를 봤는지 확인하려면",
        body: "결석한 학생이 녹화 영상을 봤는지는 통계 파일이 아니라 학습 데이터에서 봅니다. 유효 시청 횟수는 10분 이상 봤을 때만 올라갑니다.",
        steps: [
          "경로: 관리자 대시보드 > [학습 관리] > [학습 데이터]",
          "확인할 수업의 [수업 데이터]를 누르고, 왼쪽 위 [학습 분석]을 엽니다.",
          "[수업 선택]과 [학생 선택]에서 수업과 학생을 고릅니다.",
          "[표 사용자 정의 지표]에서 '수업 다시보기'를 고르고 [확인]을 누릅니다.",
          "오른쪽 [수업 다시보기] 항목에서 유효 시청 횟수와 실제 시청 시간을 봅니다.",
        ],
      },
      {
        heading: "학생별 리포트를 PDF로 저장하기",
        body: "학부모에게 한 달 학습 결과를 보내려면 코스의 [성적] 화면을 씁니다. 학생마다 학습 활동 진행률, 수업 출석, 단원 데이터, 단원별 성적 추이, 활동 분석이 나옵니다. 교사와 조교는 그 코스 학생 전체를, 학생은 자기 것만 봅니다.\n\n정해진 주기에 리포트를 자동으로 만들어 주는 기능은 없고, 화면을 여는 시점까지 쌓인 값이 나옵니다. 월별 기록을 남기려면 매달 말에 PDF로 저장해 두세요. 데이터는 과정 단위로 나오니 과정이 여러 개면 과정마다 따로 저장합니다.",
        steps: [
          "코스에 들어가 과정 화면 위쪽의 [성적]을 누르고 [학습 활동] 탭을 엽니다.",
          "리포트를 만들 학생을 고릅니다.",
          "학생 성적 화면 오른쪽 위 [링크 복사]를 누르고, 복사한 링크를 브라우저에서 엽니다.",
          "화면에서 마우스 오른쪽 버튼을 눌러 [인쇄]를 고른 뒤 [PDF로 저장]을 누릅니다.",
        ],
      },
      {
        heading: "한 달에 한 번 보는 방법",
        body: "매달 같은 시점에 지난달 파일을 받아, 전달 파일과 같은 기준으로 나란히 놓고 봅니다. 기간 길이가 다르면 비교가 의미 없으니 월 단위나 주 단위로 맞춥니다.\n\n볼 것은 세 가지입니다. 출석 학생 인원이 몇 주째 줄고 있는 반, 한 강사에게 수업이 몰리거나 비는 주, 스토리지가 빠르게 늘어난 달입니다. 시험 기간이나 방학처럼 원래 수업이 줄어드는 기간은 표시해 두어야 잘못 읽지 않습니다. 스토리지가 빨리 늘면 [일반 설정] > [저장 설정]의 자동 삭제 기간을 확인하세요.",
      },
      {
        heading: "통계만으로 판단하면 안 되는 것",
        body: "이 통계는 수업이 열리고 사람이 들어왔다는 기록입니다. 그 밖의 판단에는 다른 자료를 같이 봐야 합니다.",
        steps: [
          "출석 학생 인원은 참여 기록이지 학습 성과가 아닙니다. 숙제와 시험 결과는 위의 학생별 리포트에서 따로 봅니다.",
          "주문 세부정보의 차감 내역은 사용량 확인용입니다. 회계 정산이나 증빙 자료로 쓰려면 상담으로 기준을 먼저 확인하세요.",
          "클래스인은 오프라인 출석 체크 기능을 지원하지 않습니다. 교실 출결은 학원이 쓰는 출결 방식으로 따로 관리하고, 연동이 필요하면 상담에서 확인합니다.",
          "파일에는 교사 이름과 수업 정보가 들어 있습니다. 권한 있는 담당자만 보관하고, 외부로 보낼 때는 이름을 가립니다.",
        ],
      },
    ],
    relatedSlugs: ["storage-management", "course-management", "class-monitoring", "institution-settings"],
  },
  {
    slug: "teacher-profile",
    category: "teacher",
    title: "클래스인 프로필 설정",
    description: "강사는 첫 수업 전에 프로필 사진과 닉네임을 정리해 둡니다. PC와 휴대폰에서 바꾸는 경로, 코스마다 따로 쓰는 닉네임을 보고, 학원 안에서 강사 이름 표기를 하나로 맞춥니다.",
    audience: "수업을 진행하는 강사",
    updatedAt: "2026-09-24",
    readMinutes: 3,
    featured: true,
    tags: ["프로필", "계정 설정", "시작하기"],
    keywords: ["프로필", "닉네임", "프로필 사진", "계정", "개인정보", "모바일 앱", "강사 식별", "닉네임 규칙", "녹화 이름", "보고서 이름", "코스 내 나의 닉네임", "코스 닉네임", "전화번호로 표시", "닉네임 동기화"],
    chatbotSummary: "PC에서는 왼쪽 아래 [기본 프로필]을 눌러 계정 및 설정 팝업의 [개인정보]에서, 모바일 앱에서는 홈 화면 왼쪽 위 프로필 아이콘을 눌러 사진과 닉네임을 바꿉니다. 코스 안에서만 쓰는 이름은 코스 설정의 '코스 내 나의 닉네임'에서 따로 바꿉니다. 강사 이름 표기는 학원에서 정한 형식(예: 과목+실명)이 있으면 그대로 따르면 됩니다.",
    sections: [
      {
        heading: "프로필을 먼저 정리하는 이유",
        body: "학생과 동료 강사는 코스, 채팅, 교실에서 프로필 사진과 닉네임으로 선생님을 알아봅니다. 첫 수업 전에 맞춰 두면 학생이 '우리 반 선생님이 맞나' 헷갈리지 않습니다. 학원에서 정해 준 프로필 양식이 있다면 그대로 따르면 됩니다.",
      },
      {
        heading: "PC에서 바꾸기",
        body: "PC와 모바일 앱은 같은 계정이라 한쪽에서 바꾸면 다른 쪽에도 반영됩니다.",
        steps: [
          "경로: 왼쪽 아래 [기본 프로필] > 계정 및 설정 > [개인정보]",
          "프로필 사진을 올립니다.",
          "닉네임 옆 연필 아이콘을 눌러 학원 표기 규칙에 맞게 고칩니다.",
        ],
      },
      {
        heading: "휴대폰·태블릿에서 바꾸기",
        body: "PC가 없을 때는 클래스인 모바일 앱에서 바꿉니다.",
        steps: [
          "앱 홈 화면 왼쪽 위의 프로필 아이콘을 누릅니다.",
          "설정 화면에서 내 닉네임을 누르고 [개인 정보]로 들어갑니다.",
          "사진이나 닉네임을 바꾸고 [저장]을 누릅니다.",
        ],
      },
      {
        heading: "코스마다 다른 이름이 보일 때",
        body: "계정 닉네임과 별도로, 코스마다 '코스 내 나의 닉네임'이 따로 있습니다. 코스 이름을 눌러 코스 설정을 열면 이 항목이 보이고, 여기서 바꾼 이름은 그 코스에서 쓰입니다. 프로필을 바꿨는데 어떤 코스에서만 예전 이름이 보인다면 이 항목을 확인하세요.\n\n학생의 코스 닉네임도 같은 방식입니다. 학생이 직접 코스 닉네임을 바꾸게 하려면 코스 설정 > [코스 관리]에서 '학생의 코스 내 닉네임 수정을 허용'을 켭니다. 꺼져 있으면 학생 화면에 '담임 선생님이 닉네임 수정 권한을 비활성화했습니다.'라는 안내가 나옵니다.\n\n학생 이름이 전화번호로 보인다면 선생님이 앱에서 그 학생의 코스 닉네임을 실명으로 바꿔 줄 수 있습니다. 근본적인 해결 방법은 '코스 - 구성원 초대, 변경, 퇴장' 문서에 있습니다.",
      },
      {
        heading: "학원 안에서 이름 표기 맞추기",
        body: "강사가 여러 명이면 이름 형식이 제각각일 때 학생도 운영팀도 누가 누구인지 헷갈립니다. 학원에서 형식을 하나 정해 새 강사가 올 때마다 같이 알려 주세요.\n\n예를 들어 '실명'이나 '과목+실명'(수학 김민지)처럼 학생이 바로 알아보는 형태로 정하고, 같은 이름이 있으면 '김민지(중등)'처럼 구분을 붙입니다. 별명이나 이니셜만 쓰면 나중에 수업 기록에서 강사를 찾기 어렵습니다. 사진은 얼굴 사진이나 학원에서 정한 이미지로 맞추면 구성원 목록에서 강사를 구분하기 쉽습니다.",
      },
      {
        heading: "바꾼 뒤 확인할 것",
        body: "설정을 저장했다면 아래 네 가지를 한 번씩 봅니다.",
        steps: [
          "코스 구성원 목록에 내 이름과 사진이 의도대로 보이는지 봅니다.",
          "학기 중에는 이름을 자주 바꾸지 않습니다. 학생이 채팅이나 구성원 목록에서 선생님을 못 찾습니다.",
          "학원에서 계정을 만들어 준 경우, 표시 이름이 이상하면 여러 번 고치기 전에 기관 관리자에게 먼저 물어봅니다.",
          "사진은 학생과 동료가 함께 보는 화면에 나오니 수업에 맞는 이미지를 씁니다.",
        ],
      },
    ],
    relatedSlugs: ["classroom-basic-setup", "course-create", "drive-materials"],
  },
  {
    slug: "drive-materials",
    category: "teacher",
    title: "드라이브 - 수업 자료 관리",
    description: "수업에 쓸 PPT, PDF, 영상, 판서 파일과 시험지는 미리 드라이브에 올려 둡니다. 강사가 알아 둘 것은 내 드라이브와 공유 드라이브의 차이, 올릴 수 있는 파일, 문제 은행에 시험지를 모아 두는 방법, 업로드가 안 될 때 확인할 곳입니다.",
    audience: "수업을 진행하는 강사",
    updatedAt: "2026-09-24",
    readMinutes: 4,
    tags: ["드라이브", "수업 자료", "파일 관리"],
    keywords: ["드라이브", "수업 자료", "내 드라이브", "공유 드라이브", "리소스 라이브러리", "문제 은행", "TeacherIn", "FlowIn", "NOBOOK", "Google Drive", "hwp", "읽기 전용", "EDB", "판서 저장", "파일 용량", "시험지 업로드", "시험지 저장", "시험 재사용", "이디비", "edb 불러오기", "교안 파일"],
    chatbotSummary: "왼쪽 메뉴바 [드라이브] > [내 드라이브]에서 [업로드]를 누르거나 파일을 끌어다 놓아 수업 자료를 올립니다. 학원 강사들과 같이 쓰는 자료는 공유 드라이브에 있고, 관리자가 준 권한에 따라 열람만 되거나 업로드까지 됩니다. HWP는 지원하지 않으니 PDF로 바꾸고, 파일 하나당 크기 제한이 있어 큰 영상은 나누거나 줄여서 올립니다. 시험지는 [문제 은행]에 저장해 두고 시험 활동에서 다시 불러옵니다.",
    sections: [
      {
        heading: "드라이브에 있는 공간",
        body: "왼쪽 메뉴바의 [드라이브]를 누르면 자료 공간이 여러 개 보입니다. 강사가 주로 쓰는 곳은 나만 쓰는 내 드라이브와, 학원 강사들이 함께 쓰는 공유 드라이브입니다.\n\n나머지도 알아 두면 편합니다. 최근 열람한 문서에는 최근에 연 자료가 모입니다. 리소스 라이브러리에는 클래스인이 제공하는 샘플 수업 자료와 1분 가이드가 있고, 문제 은행에는 [과정] 탭의 시험에 쓸 문제가 모입니다. TeacherIn은 [과정] 탭의 커리큘럼을 저장하고 다른 사용자와 공유하는 곳이고, FlowIn은 혼자 또는 여럿이 문서를 만드는 작업 공간입니다. NOBOOK은 물리·화학 실험 도구이고, Google Drive는 구글 계정으로 연결해 그 안의 자료를 가져옵니다.",
      },
      {
        heading: "내 드라이브에 수업 자료 올리기",
        body: "수업이나 [과정] 탭 학습 활동에 쓸 자료는 수업 전에 미리 올려 두세요. 수업 중에 파일을 찾는 동안 학생들은 기다려야 합니다.\n\nPPT, Word, Excel, PDF, JPG, PNG, BMP, MP3, MP4, TXT, EDB 파일이 올라갑니다. 한글(HWP) 파일은 열리지 않으니 PDF로 바꿔 올립니다. 파일 하나에 올릴 수 있는 크기에도 제한이 있어서 긴 수업 영상 같은 큰 파일은 올라가지 않을 수 있습니다. 이때는 파일을 나누거나 용량을 줄여 올립니다. 한 번 올려 둔 파일은 채팅이나 숙제에 첨부할 때 다시 올리지 않고 드라이브에서 골라 보냅니다.",
        steps: [
          "경로: 왼쪽 메뉴바 > [드라이브] > [내 드라이브]",
          "[업로드]를 누르거나 파일을 끌어다 놓습니다.",
          "[새로 만들기] > [폴더]로 과목이나 반별 폴더를 만들어 파일을 나눠 둡니다.",
        ],
      },
      {
        heading: "판서 파일(EDB)을 드라이브에 두고 쓰기",
        body: "수업 전에 만든 판서를 드라이브에 저장해 두면 다음 수업이나 다른 반에서 그대로 불러옵니다.",
        steps: [
          "왼쪽 메뉴의 [칠판]에서 수업 전에 판서를 만듭니다.",
          "이미 저장해 둔 판서를 이어서 쓰려면 오른쪽 [클라우드 드라이브] 버튼을 눌러 드라이브의 EDB 파일을 불러옵니다.",
          "다 만든 판서는 오른쪽 [수업 도구] > [판서 저장/공유]에서 [드라이브에 저장]을 고릅니다.",
        ],
      },
      {
        heading: "시험지를 문제 은행에 모아 두고 다시 쓰기",
        body: "같은 시험지를 여러 반이나 다음 학기에 다시 쓸 거라면 드라이브의 문제 은행에 저장해 둡니다. 시험 활동을 만들 때 저장한 문제를 골라 넣기만 하면 됩니다. 시험 활동을 만드는 전체 순서는 '코스 - 학습 활동 추가' 문서에 있습니다.",
        steps: [
          "경로: [드라이브] > [문제 은행] > [+시험지 추가]",
          "문제를 추가합니다. [계속 추가하기]를 누르면 창을 닫지 않고 다음 문제를 이어서 넣습니다.",
          "[시험 문제 저장]을 누르면 시험지로 보관됩니다.",
          "나중에 시험 활동을 만들 때 [+문제 은행에서 불러오기]를 누르고, 쓸 문제를 [시험 문제 장바구니에 넣기]로 담습니다.",
        ],
      },
      {
        heading: "공유 드라이브 쓰기",
        body: "공유 드라이브는 학원에 등록된 강사들이 함께 쓰는 자료 공간입니다. [드라이브]에서 소속 학원을 고르면 들어갈 수 있고, 무엇을 할 수 있는지는 관리자가 정한 권한에 따라 다릅니다.\n\n관리자나 컨텐츠 관리자 권한이면 파일을 올리고 내려받는 것까지 됩니다. 읽기 전용이면 파일을 열어 수업에 띄울 수는 있지만 내려받거나 새로 올릴 수는 없고, 감추기면 그 드라이브의 파일이 보이지 않습니다. 필요한 권한이 없으면 기관 관리자에게 요청하세요.\n\n공유 드라이브에서 지운 파일은 되살릴 수 없습니다. 다른 강사도 쓰는 교안이니 지우기 전에 한 번 더 확인하세요.",
      },
      {
        heading: "업로드가 안 될 때",
        body: "대부분 파일 형식, 파일 크기, 권한 중 하나입니다.",
        steps: [
          "HWP 파일이면 PDF로 바꿔 다시 올립니다.",
          "영상처럼 큰 파일이면 나누거나 용량을 줄여 다시 올립니다.",
          "공유 드라이브라면 내 권한이 읽기 전용이나 감추기가 아닌지 기관 관리자에게 확인합니다.",
          "공유 드라이브의 무료 용량은 요금제마다 다릅니다. 권한이 맞는데도 안 올라가면 용량이 찼는지 관리자에게 물어봅니다.",
        ],
      },
    ],
    relatedSlugs: ["course-create", "course-activities", "classroom-basic-setup", "shared-drive"],
  },
  {
    slug: "course-create",
    category: "teacher",
    title: "코스 - 생성·설정·구성·삭제",
    description: "강사가 새 반을 열 때 코스를 만들고 알림·게시판·AI 에이전트 같은 옵션을 정합니다. 학기가 끝나 폐강하는 순서까지 이어서 따라 하면 됩니다.",
    audience: "수업을 진행하는 강사",
    updatedAt: "2026-09-24",
    readMinutes: 4,
    tags: ["코스", "반 관리", "폐강"],
    keywords: ["코스", "코스 만들기", "코스 설정", "코스 종료", "폐강", "게시판", "AI 에이전트", "수업 계획", "구성원", "코스 나가기", "코스 가입 허용", "전체 학생 채팅 금지", "코스 관리", "코스 삭제 안 됨", "수업 삭제"],
    chatbotSummary: "첫 화면 [코스 만들기]에서 소속 학원을 고르고 코스 이름을 입력하면 코스(반)가 생깁니다. 코스 이름을 눌러 여는 설정 팝업에서 음소거·알림·게시판·AI 에이전트를 정하고, 학기가 끝나면 같은 팝업 아래쪽 [코스 종료]로 폐강합니다. 종료한 코스는 되살릴 수 없으니, 종료 후 학생 자료 열람 옵션을 먼저 확인하세요.",
    sections: [
      {
        heading: "코스는 반 하나입니다",
        body: "코스 하나가 반 하나입니다. 실시간 수업, 숙제, 시험을 모두 이 코스 안에서 만들고 관리합니다.\n\n학원 설정에 따라 강사가 직접 코스를 만들지 못하게 되어 있을 수 있습니다. [코스 만들기]가 안 되면 기관 관리자에게 코스 생성 권한을 요청하거나, 관리자가 만들어 준 코스를 쓰면 됩니다.",
      },
      {
        heading: "코스 만들기",
        body: "코스 이름은 학생이 코스 목록에서 자기 반을 찾는 기준입니다. '중2 수학 A반'처럼 학년, 과목, 반이 드러나게 짓습니다.",
        steps: [
          "경로: 첫 화면 > [코스 만들기]",
          "팝업에서 [소속 학교(기관)]를 눌러 우리 학원을 고릅니다.",
          "코스 이름을 입력하면 코스가 만들어집니다.",
        ],
      },
      {
        heading: "코스 설정에서 정할 것",
        body: "코스 이름을 누르면 코스 설정 팝업이 열립니다. 음소거와 알림, 게시판, AI 에이전트를 여기서 켜고 끄고, 코스 소개와 코스 내 나의 닉네임도 여기서 정합니다. 학생 초대와 채팅 범위는 팝업 안 [코스 관리]에서 따로 정합니다.",
        steps: [
          "코스 목록에서 코스 이름을 누릅니다.",
          "음소거, 알림, 게시판, AI 에이전트를 반 운영 방식에 맞게 켜거나 끕니다. 쓰지 않을 기능은 꺼 둬도 됩니다.",
          "[코스 관리]에서 '코스 가입 허용'이 켜져 있는지 봅니다. 꺼져 있으면 QR이나 링크로 학생을 초대할 수 없습니다.",
          "학생들의 채팅을 막고 싶으면 [코스 관리]에서 '전체 학생 채팅 금지'를 켭니다.",
        ],
      },
      {
        heading: "코스 화면 구성",
        body: "코스에 들어가면 화면이 세 부분으로 나뉩니다.\n\n왼쪽에는 과정, 게시판, AI 튜터와 AI 평가가 있습니다. 게시판은 교사와 학생이 같이 쓰고 고치는 문서 공간입니다. AI 튜터는 학생이 수업 내용을 물으면 선생님이 올린 학습 자료를 출처로 붙여 답하고, AI 평가는 선생님이 학생 한 명이나 반 전체의 출석률, 성적 변화를 물어보는 도구입니다.\n\n가운데에는 수업 계획, 학습 계획, 학습 활동이 있습니다. 수업 계획은 코스의 교사끼리만 보는 계획서라 학생에게는 보이지 않습니다. 실시간 수업, 숙제, 시험은 학습 활동에서 추가합니다.\n\n오른쪽에는 구성원, 공지사항, 채팅, 할 일 알림이 있습니다. 할 일 알림에는 마감이 가까운 활동이 뜹니다.",
      },
      {
        heading: "코스 삭제(폐강)하기",
        body: "코스를 종료하기 전에 두 가지만 확인하세요. 학생이 다시 봐야 할 자료가 남아 있는지, 학생들에게 종료를 미리 알렸는지입니다. 종료한 코스는 되살릴 수 없습니다. 기관에서 자동 삭제를 설정하지 않았다면 코스를 끝내도 판서, 스크린샷, 녹화 파일은 지워지지 않고, 학생이 다시 볼 수 있는지는 종료 옵션에 따라 달라집니다.\n\n코스는 두고 지난 수업 몇 개만 지우고 싶다면 폐강할 필요가 없습니다. 끝난 수업은 앱에서 지울 수 없으니 '코스 - 과정·단원·수업 추가' 문서의 정리 방법을 보세요.\n\n학생에게는 이렇게 알리면 됩니다.\n\n> ○○반 코스는 ○월 ○일에 종료됩니다. 다시 볼 자료가 있으면 그 전에 확인해 주세요.",
        steps: [
          "경로: 코스 이름 > 설정 팝업 > [코스 종료]",
          "팝업의 세부 옵션을 확인합니다. 종료 후에도 학생이 자료를 열람하게 할지 여기서 정합니다.",
          "코스 이름을 그대로 입력하거나 [자동 입력]을 누릅니다.",
          "[확인]을 누르면 폐강됩니다. 코스 목록에서 상태가 종료됨으로 바뀌었는지 봅니다.",
        ],
      },
      {
        heading: "모바일에서 설정을 바꾸거나 코스에서 나가려면",
        body: "코스 설정은 모바일 앱에서도 열립니다. 코스를 없애지 않고 나만 빠지고 싶을 때는 [코스 나가기]를 쓰는데, 수업이 잡혀 있는 코스에서는 스스로 나갈 수 없습니다. 이때는 담임 교사나 관리자가 구성원에서 삭제해 줘야 하고, 코스의 수업이 끝난 지 60일이 지나면 직접 나갈 수 있습니다.",
        steps: [
          "앱 홈에서 코스로 들어간 뒤, 코스 정보 카드 오른쪽 화살표(>)를 누르면 코스 설정이 열립니다.",
          "코스 구성원, 코스 소개, 코스 내 나의 닉네임, 채팅 상단 고정, 알림 끄기를 여기서 바꿉니다.",
          "코스를 종료하려면 코스 설정 맨 아래 [코스 종료/클래스 탈퇴]를 누릅니다.",
          "PC에서 나만 빠지려면 코스 설정 아래쪽 [코스 나가기]를 누릅니다.",
        ],
      },
    ],
    relatedSlugs: ["course-members", "course-units", "course-activities"],
  },
  {
    slug: "course-members",
    category: "teacher",
    title: "코스 - 구성원 초대, 변경, 퇴장",
    description: "코스를 만든 다음 할 일은 학생과 조교 선생님 초대, 역할 변경, 그만둔 사람 내보내기입니다. 학생이 초대 링크로 못 들어오거나 코스에서 스스로 나가지 못할 때 왜 그런지도 짚습니다.",
    audience: "수업을 진행하는 강사",
    updatedAt: "2026-09-24",
    readMinutes: 4,
    tags: ["코스", "구성원", "초대", "역할 관리"],
    keywords: ["구성원 초대", "링크 초대", "QR 코드", "교사로 설정", "멤버 삭제", "조교", "역할 변경", "코스 ID", "코스 가입 허용", "코스 탈퇴", "강제 퇴장", "QR 코드 스캔", "코스 추가 시간", "다른 계정으로 로그인", "수업이 안 보여요", "초대 수락", "전화번호로 표시", "이름이 번호로 나와요", "닉네임 동기화", "실명 표시"],
    chatbotSummary: "코스 오른쪽 위 [구성원] > [구성원 초대]에서 연락처, 링크, QR 코드로 학생과 조교를 초대합니다. 역할은 구성원 오른쪽 상세 메뉴(…)의 [교사로 설정]으로 바꾸고, 내보낼 때는 같은 메뉴의 [멤버 삭제]를 씁니다. 수업이 있는 코스는 학생이 스스로 나갈 수 없어 교사나 관리자가 삭제해야 하며, 수업이 끝난 지 60일이 지나면 학생이 직접 나갈 수 있습니다. 학생이 수업이 안 보인다고 하면 학원이 알려 준 계정으로 로그인했는지, 코스 초대를 눌렀는지부터 확인합니다.",
    sections: [
      {
        heading: "구성원 초대하기",
        body: "초대 방법은 세 가지입니다. 클래스인 연락처(친구 목록)에서 바로 고르거나, 초대 링크나 QR 코드를 보내 학생이 직접 들어오게 합니다. 링크를 복사하면 코스 ID도 함께 복사되고, 링크가 열리지 않는 학생은 클래스인 위쪽 다이나믹 아일랜드 왼쪽의 돋보기 아이콘에서 코스 ID로 검색해 들어오면 됩니다.",
        steps: [
          "경로: 코스 > 오른쪽 위 [구성원] > [구성원 초대]",
          "연락처, 링크, QR 코드 가운데 하나를 고릅니다.",
          "링크나 QR은 오른쪽 아래 [복사하기]로 복사해 학생과 조교에게 보냅니다.",
        ],
      },
      {
        heading: "학생에게 보낼 초대 안내 문구",
        body: "카톡이나 문자에 그대로 붙여 써도 됩니다. 학생이 클래스인에 가입돼 있어야 코스에 들어오니, 가입 안내를 먼저 보냈는지도 확인하세요.\n\n> ○○반 클래스인 코스 초대 링크입니다. 클래스인에 로그인한 상태에서 링크를 눌러 들어와 주세요. 휴대폰에서는 앱 홈 화면 오른쪽 위 [+] > [QR 코드 스캔]으로 QR을 찍고 [코스 가입]을 누르면 됩니다. 링크가 열리지 않으면 앱 위쪽 돋보기에서 코스 ID ○○○○를 검색해 주세요.",
      },
      {
        heading: "초대했는데 학생이 못 들어올 때",
        body: "초대 링크를 보냈는데도 학생이 들어오지 못하거나 수업이 안 보인다고 하면 아래 순서로 봅니다. 가장 흔한 원인은 학원이 알려 준 계정이 아닌 다른 아이디로 로그인해 있는 경우입니다.",
        steps: [
          "코스 이름 > 코스 설정 > [코스 관리]에서 '코스 가입 허용'이 켜져 있는지 봅니다. 꺼져 있으면 QR이나 링크로 들어올 수 없습니다.",
          "[구성원] 목록에 그 학생이 있는지, 어느 계정으로 들어와 있는지 봅니다.",
          "학생에게 앱 왼쪽 위 프로필에서 지금 로그인한 계정을 확인하게 합니다. 자동 로그인 때문에 이메일 계정이나 새로 만든 계정으로 들어가 있으면 로그아웃한 뒤 학원이 알려 준 계정으로 다시 로그인하게 합니다.",
          "계정이 맞으면 코스 초대를 눌러 참여했는지, 앱이 최신 버전인지 확인합니다.",
          "링크가 열리지 않으면 코스 ID로 검색해 들어오게 합니다.",
          "그래도 안 되면 수업 이름, 학생의 클래스인 아이디, 수업 시작 날짜와 시각을 상담 채널에 보내 주세요. 원인을 함께 확인합니다.",
        ],
      },
      {
        heading: "역할 변경하기 (학생 ↔ 교사)",
        body: "조교 선생님이 학생으로 들어왔다면 다시 초대할 필요 없이 역할만 바꾸면 됩니다.",
        steps: [
          "[구성원]을 눌러 코스 구성원 및 그룹 구성 팝업을 엽니다.",
          "역할을 바꿀 사람 오른쪽의 상세 메뉴(…)를 누릅니다.",
          "[교사로 설정]을 누릅니다. 교사를 학생으로 되돌릴 때는 담임 교사·교사 탭에 있는 그 사람의 같은 메뉴에서 바꿉니다.",
        ],
      },
      {
        heading: "구성원 강제 퇴장시키기",
        body: "강사가 퇴사했거나 학생이 수강을 마쳤다면 코스에서 삭제합니다. 수업이 잡혀 있는 코스는 학생이 스스로 나갈 수 없어서 선생님이나 관리자가 직접 삭제해야 합니다. 이 제한은 설정으로 끌 수 없고, 코스의 수업이 끝난 지 60일이 지나면 학생이 직접 나갈 수 있습니다.",
        steps: [
          "[구성원]을 눌러 코스 구성원 및 그룹 구성 팝업을 엽니다.",
          "내보낼 사람 오른쪽의 상세 메뉴(…)를 누릅니다.",
          "이름과 역할(교사·학생)을 다시 확인한 뒤 [멤버 삭제]를 누릅니다. 담임 교사나 운영 담당자를 잘못 지우지 않도록 조심합니다.",
          "모바일에서는 코스 정보 카드 오른쪽 화살표(>) > [코스 멤버]에서 같은 메뉴(···)를 엽니다. [교사로 설정], [채팅 금지], [멤버 삭제]가 나란히 있으니 [멤버 삭제]를 정확히 누릅니다.",
          "삭제한 뒤 구성원 수와 역할이 의도대로인지 확인합니다.",
        ],
      },
      {
        heading: "학생 이름이 전화번호로 보일 때",
        body: "학원 관리자 설정에서 코스 닉네임 동기화가 꺼져 있으면 학생 이름 대신 전화번호가 보일 수 있습니다. 급하면 선생님이 앱에서 그 학생의 코스 닉네임을 실명으로 바꾸거나, 학생에게 직접 바꾸라고 알려 줍니다.\n\n근본적으로 고치려면 기관 관리자가 '클래스 닉네임 설정 동기화'를 켠 뒤, 그 학생을 코스에서 내보냈다가 다시 추가합니다. 동기화는 코스에 새로 들어오는 학생부터 적용되기 때문입니다.",
      },
      {
        heading: "관리자에게 요청할 일",
        body: "기관 관리자는 코스 밖에서도 구성원을 관리합니다. 관리자 대시보드 [기관 관리] > [코스 관리]에서 코스 이름을 눌러 상세 화면을 열면 편입생(참관생)을 추가하고, 같은 화면의 [구성원]에서 담임 교사를 다른 교사로 바꿉니다. 학생이 코스에 언제 추가됐는지도 이 [구성원] 화면의 [코스 추가 시간]에서 확인합니다. 강사 화면에서 안 되는 변경은 관리자에게 요청하세요.\n\n학기가 끝나 코스 자체를 닫을 때는 '코스 - 생성·설정·구성·삭제' 문서의 폐강 순서를 따릅니다.",
      },
    ],
    relatedSlugs: ["course-create", "course-units", "course-activities", "course-join"],
  },
  {
    slug: "course-units",
    category: "teacher",
    title: "코스 - 과정·단원·수업 추가",
    description: "강사는 코스 안을 과정과 단원으로 나누고 실시간 수업을 추가합니다. 수업을 만들 때 나오는 스테이지·온스테이지·하이브리드·녹화 옵션 가운데 무엇을 고를지 기준을 세우고, 수업 전에 준비실에 들어가는 방법도 익혀 둡니다.",
    audience: "수업을 진행하는 강사",
    updatedAt: "2026-09-24",
    readMinutes: 5,
    tags: ["코스", "과정", "단원", "수업 추가", "스테이지"],
    keywords: ["과정 추가", "단원 추가", "수업 추가", "기본 단원", "하이브리드 수업", "스테이지", "온스테이지", "녹화", "수업 준비", "수업 준비실", "학생 자동 온스테이지", "현장 녹화", "입장 시간", "좌석 설정", "수업 이동", "과정 이동", "단원 이동", "잘못 만든 과정", "녹화 강의 코스", "VOD 코스", "인강 코스", "지난 수업 정리", "휴지통 단원", "수업 삭제"],
    chatbotSummary: "코스 구조는 코스 > 과정 > 단원 > 학습 활동입니다. 과정은 과정 탭의 [+]로, 단원은 [새로 만들기] > [+ 단원]으로, 실시간 수업은 [새로 만들기] > [수업]으로 추가하고, 수업을 만들 때 교사·조교, 스테이지 표시, 온스테이지 인원(1v0~1v12), 학생 자동 온스테이지, 하이브리드 수업, 수업 녹화·현장 녹화를 정합니다. 교사는 수업 20분 전, 학생은 10분 전부터 교실에 들어갈 수 있고, 앞뒤 20분 준비 시간에는 요금이 붙지 않습니다. 끝난 수업은 같은 과정 안의 단원 사이로만 옮길 수 있고 앱에서 지울 수 없으니, 목록 정리는 '휴지통' 같은 단원을 만들어 옮기는 방식으로 합니다.",
    sections: [
      {
        heading: "코스 안은 과정 > 단원 > 학습 활동으로 나뉩니다",
        body: "코스(반) 안에 과정을 만들고, 과정 안에 단원을, 단원 안에 수업·숙제·토론 같은 학습 활동을 넣습니다. 책으로 치면 과정은 한 학기 교재, 단원은 목차의 장, 학습 활동은 그 장에서 하는 수업과 숙제입니다.\n\n이미 끝난 수업은 나중에 다른 과정으로 옮길 수 없으니, 과정은 수업을 만들기 전에 나눠 두세요.\n\n녹화 강의만으로 인강형 코스를 꾸릴 때도 같은 구조를 씁니다. 단원을 만들고 차시마다 [녹화 수업]을 하나씩 만들어 영상을 한 개씩 올리면, 영상별 시청 현황과 평균 이수율이 따로 나옵니다.",
      },
      {
        heading: "과정 추가하기",
        body: "한 코스에서 여러 과정을 돌릴 때 나눕니다. 학기(25년 1학기, 2학기), 과정 성격(정규, 여름 특강, 겨울 방학), 과목(영어, 수학, 과학), 영역(Reading, Listening, Speaking) 가운데 반 운영에 맞는 기준을 고르면 됩니다.",
        steps: [
          "경로: 왼쪽 위 과정 탭 > [+]",
          "과정명을 입력하면 과정이 만들어집니다.",
          "상세 설정은 과정 오른쪽의 톱니바퀴 버튼에서 고칩니다.",
        ],
      },
      {
        heading: "단원 추가하기",
        body: "단원은 학습 활동을 묶는 단위입니다. 단원 없이 학습 활동부터 게시하면 '기본 단원'이 저절로 생기고, 이 단원은 나중에 이름을 바꾸거나 고치면 됩니다. 단원 구성이 아직 정해지지 않았다면 수업부터 만들어도 괜찮습니다.",
        steps: [
          "경로: [코스] > [새로 만들기] > [+ 단원]",
          "단원명과 설명을 씁니다.",
          "[게시]를 누릅니다. 이제 이 단원 안에 학습 활동을 추가합니다.",
        ],
      },
      {
        heading: "수업 추가하기",
        body: "수업은 실시간 라이브 수업입니다. 전자칠판, PC, 모바일 어디서 열든 수업과 녹화가 함께 돌아갑니다. 요금제에 따라 녹화나 하이브리드 수업 같은 일부 옵션은 제한될 수 있습니다.",
        steps: [
          "경로: [코스] > [새로 만들기] > [수업]",
          "수업 일정에 맞춰 시작 시간과 수업 시간을 정합니다.",
          "교사와 조교를 지정합니다. 조교는 수업을 돕는 보조 교사이고, 설정에 따라 조교의 카메라와 마이크가 화면에 나오지 않게 할 수 있습니다.",
          "스테이지 표시, 온스테이지 인원, 학생 자동 온스테이지, 하이브리드 수업을 정합니다. 옵션별 차이는 바로 아래에 있습니다.",
          "녹화 방식을 고릅니다. 복습·다시보기용으로 ClassIn 수업 녹화를 켜고, 교실 카메라 화면도 남기려면 현장 녹화를 함께 켭니다.",
          "[게시]를 누릅니다.",
        ],
      },
      {
        heading: "수업 옵션을 고르는 기준",
        body: "처음이라면 이렇게 시작하세요. 칠판 중심 수업은 수업 녹화를 켜고, 원격 학생 없이 교실에서만 하는 칠판 수업이나 패드 수업은 온스테이지 1v0으로 둡니다. 나머지 옵션은 아래 설명을 보고 필요할 때 켭니다.",
        steps: [
          "스테이지 표시를 켜면 교실 화면 위쪽에 교사와 학생 카메라가 나오는 영역이 생깁니다. 이 영역에는 판서하거나 드라이브 자료를 띄울 수 없으니, 칠판을 넓게 쓰려면 끕니다.",
          "온스테이지 인원은 1v0부터 1v12까지 고르고(요금제마다 다름), 왼쪽 숫자가 강사, 오른쪽 숫자가 학생 카메라 수입니다. 학생이 12명이어도 1v6이면 학생 카메라는 6개까지만 보이고, 누구를 올릴지 또는 돌아가며 보여 줄지는 수업 안에서 정합니다.",
          "학생 자동 온스테이지를 켜면 학생이 교실에 들어오자마자 스테이지에 올라갑니다. 끄면 출석부를 보거나 손을 든 학생을 선생님이 직접 올립니다.",
          "하이브리드 수업은 기기에 카메라가 따로 연결돼 있을 때 씁니다. 켜면 학생이 칠판 화면과 카메라 화면을 골라 보고, 끄면 칠판 화면만 봅니다.",
          "ClassIn 수업 녹화는 클래스인 수업 화면을, 현장 녹화는 연결된 카메라 화면을 녹화합니다. 녹화본은 클래스인 스토리지에 저장되고, 수업이 끝나면 교사와 학생이 앱에서 바로 봅니다.",
        ],
      },
      {
        heading: "수업 확인하기",
        body: "만든 수업은 코스의 학습 활동 탭에 바로 나타납니다. 시간이 가까워지면 오른쪽 [할 일] 탭과 화면 맨 위 [다이나믹 아일랜드]에도 뜹니다.\n\n수업 전에 교실을 미리 점검하려면 [수업 준비]를 눌러 수업 준비실에 들어갑니다. 준비실은 연습 공간이라 학생이 들어올 수 없습니다. 수업 시간이 되면 준비실이 아니라 실제 교실로 들어가야 합니다.\n\n이미 만든 여러 수업의 스테이지 설정을 한꺼번에 바꿔야 한다면 관리자에게 요청하세요. 관리자는 대시보드 [코스 관리]에서 코스를 열고 [시간표]에서 수업을 여러 개 고른 뒤 [대량 작업] > [좌석 설정]으로 한 번에 바꿉니다.",
      },
      {
        heading: "끝난 수업을 옮기거나 목록에서 정리하려면",
        body: "이미 진행했거나 끝난 학습 활동은 같은 코스, 같은 과정 안에서만 끌어다 옮길 수 있습니다. 단원 사이로는 옮겨지지만 다른 과정이나 다른 코스로는 옮겨지지 않습니다. 엉뚱한 과정에 수업을 만들었다면 앞으로 할 수업부터 맞는 과정에 새로 만듭니다.\n\n끝난 수업은 구성원 기록과 연결돼 있어 앱에서 지울 수 없습니다. 목록이 복잡하면 '휴지통'처럼 이름을 붙인 단원을 하나 만들어 지난 수업을 그쪽으로 옮겨 정리하세요. 녹화나 판서 같은 수업 데이터를 지우는 일은 관리자 대시보드에서 관리자가 합니다.",
      },
      {
        heading: "수업 입장과 요금 안내",
        body: "교사는 설정한 수업 시간 20분 전부터, 학생은 10분 전부터 교실에 들어옵니다. 수업 시각 앞뒤로 주어지는 20분 준비 시간에는 요금이 붙지 않으니, 장비 점검은 이 시간에 하면 됩니다.",
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
    description: "수업 녹화와 현장 녹화는 무엇이 다르고, 온스테이지와 하이브리드 수업 토글을 켜면 실제로 무엇이 바뀔까요? 수업을 만드는 강사가 옵션을 켜기 전에 확인하고, 수업 모습에 맞는 조합을 고릅니다.",
    audience: "수업을 만드는 강사, 강사에게 수업 세팅을 알려 주는 운영 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 10,
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
      "기본으로 스테이지 표시",
      "전체 음소거",
      "온스테이지 인원수",
      "학생 목소리 안 들림",
      "즉시 녹화",
      "로컬 녹화",
      "부가가치 서비스",
      "수업 편집",
      "녹화 끊김",
      "녹화 중단",
      "녹화가 멈춰요",
      "기기 바꿨더니 녹화",
      "녹화가 안 보여요",
      "녹화본 언제",
      "온스테이지 변경",
      "학생 소리 안 들림",
      "마이크 권한",
      "스테이지 인원",
      "학생 카메라 꺼짐",
      "화면 표시 인원",
      "학생 필기 보기",
      "학생 청강",
      "개인 칠판 인원 제한 해제",
      "개인 칠판 edb",
      ".edb 삽입",
    ],
    chatbotSummary: "수업 녹화는 칠판과 자료가 보이는 클래스인 교실 화면을 녹화하고, 현장 녹화는 연결한 웹캠·외장 카메라가 찍는 교실 모습을 따로 녹화합니다. 둘은 서로를 대신하지 않아 함께 켤 수 있고, 다시보기에서 두 영상을 골라 봅니다. 온스테이지 인원수는 스테이지에 올라갈 카메라 수로 수업 시작 전에 정하며, 스테이지 밖 학생은 카메라와 마이크가 모두 꺼지고 스테이지에 올린 뒤에도 강사나 조교가 마이크 권한을 줘야 마이크가 켜집니다. 학생 자동 온스테이지는 입장한 학생을 스테이지에 바로 올리는 설정이고, 하이브리드 수업 토글은 학생이 칠판 화면과 현장 카메라 화면 중 볼 화면을 고르게 합니다.",
    sections: [
      {
        heading: "옵션마다 켜면 달라지는 것",
        media: [
          {
            type: "image",
            src: "/images/docs/diagrams/lesson-options.svg",
            alt: "수업 녹화, 현장 녹화, 온스테이지, 하이브리드 수업이 각각 하는 일을 나란히 비교한 그림. 두 녹화 결과는 다시보기에서 골라 봅니다.",
            caption: "이름은 비슷해도 네 옵션이 하는 일은 다릅니다.",
            width: 1440,
            height: 760,
          },
        ],
        body: "수업 생성 화면의 옵션은 이름이 비슷해 자주 헷갈립니다. 켜면 실제로 무엇이 달라지는지부터 보세요.\n\n| 옵션 | 켜면 달라지는 것 | 이럴 때 씁니다 |\n| --- | --- | --- |\n| ClassIn 수업 녹화 | 칠판과 자료가 보이는 교실 화면이 녹화돼 다시보기로 남습니다 | 복습이나 결석 보강 영상이 필요한 수업 |\n| 현장 녹화 | 연결한 웹캠이나 외장 카메라가 찍는 교실 모습이 따로 녹화됩니다 | 강사 모습과 교실 현장까지 영상으로 남길 때 |\n| 기본으로 스테이지 표시 | 입장하면 화면 위쪽에 카메라 영역이 보입니다. 끄면 화면 전체가 칠판입니다 | 강사와 학생이 서로 얼굴을 보며 하는 수업 |\n| 학생 자동 온스테이지 | 학생이 입장하자마자 스테이지 자리에 올라갑니다 | 원격 학생과 들어오자마자 말을 주고받는 수업 |\n| 온스테이지 인원수 | 스테이지에 올라갈 수 있는 카메라 수가 정해집니다 | 스테이지에 올릴 원격 학생 수에 맞춰 정합니다 |\n| 하이브리드 수업 | 학생이 칠판 화면과 현장 카메라 화면 중 볼 화면을 고릅니다 | 원격 학생이 칠판과 교실 모습을 오가며 봐야 할 때 |\n\n표에 없는 이름도 셋 있습니다. **녹화 수업**은 수업 생성 옵션이 아니라 이미 있는 영상을 코스에 올리는 학습 활동입니다. **로컬 녹화**는 전자칠판 도구 모음의 카메라 아이콘으로 교실 화면과 소리를 mp4 파일로 저장하는 기능이고, 이 파일을 녹화 수업으로 올려 학생에게 보여 줍니다. **개인 칠판**은 수업 중에 [수업 도구]에서 여는 도구입니다.",
      },
      {
        heading: "수업 녹화와 현장 녹화",
        body: "흔한 오해는 수업 녹화를 온라인 수업용, 현장 녹화를 오프라인 수업용으로 나눠 생각하는 것입니다. 둘은 무엇을 찍느냐가 다릅니다.\n\n수업 녹화는 클래스인 교실 화면을 녹화합니다. 판서와 띄운 자료가 보이는 그대로 남고, 교실에서 카메라를 켰다면 화면 속 카메라 영역도 같이 찍힙니다. 녹화할 영역은 따로 고르지 않습니다. 현장 수업이라도 판서 복습 영상이 필요하면 켭니다.\n\n현장 녹화는 기기에 연결한 웹캠, 외장 카메라, 트래킹 카메라가 찍는 교실 모습을 별도 영상으로 남깁니다. 수업 녹화를 대신하지 않고 하나 더 붙는 녹화라서, 판서와 강사 모습을 모두 남기려면 둘 다 켭니다. 둘 다 켠 수업은 학생이 다시보기에서 '수업화면 녹화'와 '라이브 현장녹화' 중 골라 봅니다.",
        steps: [
          "녹화 옵션을 켠 수업은 교실에 들어가면 녹화 확인 창이 먼저 뜹니다.",
          "수업 녹화는 이 창에서 [즉시 녹화]를 누른 순간부터 녹화됩니다. 화면에 따라 [바로 녹화하기]로 보입니다.",
          "현장 녹화는 어떤 카메라로 찍을지 묻습니다. 카메라가 두 대 이상 연결돼 있으면 교실을 비추는 카메라인지 미리보기로 확인하고 고릅니다.",
          "녹화가 돌고 있으면 녹화 아이콘이 초록색입니다. PC는 오른쪽 위, 전자칠판은 화면 아래쪽 캠코더 아이콘을 봅니다.",
          "수업 녹화는 강사가 교실 안에 있을 때 돌아갑니다. 강사가 교실을 나가거나, 기기를 끄고 다른 기기로 다시 들어오거나, 다른 수업으로 옮겨 가면 녹화가 멈출 수 있습니다. 다시 들어온 뒤 녹화 아이콘을 보고, 멈춰 있으면 다시 시작합니다.",
          "현장 녹화를 PC로 돌릴 때 권장 사양은 Intel 6세대 i5 이상 CPU, 업로드(상향) 대역폭 3Mbps 이상입니다.",
          "녹화본은 학원 스토리지를 씁니다. 보관 기간과 자동 삭제는 학원 관리자가 대시보드 [일반 설정] > [저장 설정]에서 정합니다.",
        ],
      },
      {
        heading: "온스테이지와 스테이지 표시",
        body: "스테이지는 교실 화면 위쪽에 카메라가 나란히 뜨는 자리입니다. 화상회의에서 참가자 얼굴이 모이는 줄을 떠올리면 됩니다. 먼저 알아 둘 점이 있습니다. **스테이지에 올라와 있지 않은 학생은 카메라와 마이크가 모두 꺼집니다.** 수업을 볼 수는 있지만 말을 하거나 칠판 권한을 받을 수는 없습니다.\n\n온스테이지 인원수는 1v6처럼 씁니다. 왼쪽 숫자가 교사, 오른쪽 숫자가 학생 카메라 수입니다. 1v0부터 1v12까지 있고, 고를 수 있는 범위는 요금제마다 다릅니다. 반 학생 수와 상관없이 이 숫자만큼만 스테이지에 올라갑니다. 학생 12명에 1v6이면 한 번에 6명까지 보이고, 누구를 올릴지, 돌아가며 보여 줄지는 수업 안에서 정합니다. 인원수는 수업이 시작되기 전에 정해 두어야 하고, 시작한 뒤에는 바꿀 수 없습니다.",
        steps: [
          "[기본으로 스테이지 표시]를 켜면 입장하자마자 카메라 영역이 보입니다. 끄면 카메라 영역 없이 화면 전체가 칠판이 됩니다.",
          "[학생 자동 온스테이지]를 켜면 학생이 교실에 들어오는 순간 스테이지 자리에 올라갑니다. 끄면 학생은 스테이지 밖에서 시작하고, 강사가 출석부에서 올리거나 손을 든 학생을 불러 올립니다.",
          "학생 자동 온스테이지는 자리를 잡아 주는 설정입니다. 스테이지에 올라온 뒤에도 강사나 조교가 마이크 권한을 줘야 학생 마이크가 켜집니다.",
          "스테이지에 올린 학생은 수업 중에도 강사나 조교가 바꿔 올립니다. 정한 인원을 넘겨 올리면 먼저 올라간 학생부터 내려옵니다.",
          "수업 중에는 오른쪽 위 [메뉴] > [설정] > [일반]에서 스테이지를 숨기거나 다시 보이게 합니다. 숨기면 PPT·PDF 자료가 더 크게 보이고, 숨긴 상태에서도 강사와 학생 카메라는 따로 띄울 수 있습니다.",
          "코스에 없는 사람에게 특정 수업만 들을 수 있게 하려면 학생 청강 권한을 줍니다. 청강 인원은 요금제마다 다를 수 있습니다.",
        ],
      },
      {
        heading: "하이브리드 수업 토글",
        body: "운영에서 하이브리드 수업이라고 하면 교실 학생과 원격 학생이 같은 수업을 듣는 방식 전체를 말합니다. 수업 생성 화면의 [하이브리드 수업] 토글은 그중 한 기능입니다. 켜면 학생이 수업에 들어와서 칠판 화면과 현장 카메라 화면을 골라 가며 봅니다.\n\n그래서 토글을 켰다고 병행 수업 준비가 끝나지는 않습니다. 현장 화면은 교실에 연결한 카메라가 찍는 화면이니 카메라 연결과 현장 녹화 설정을 함께 확인합니다. 원격 학생과 말을 주고받으려면 온스테이지 인원수도 그 인원에 맞춰 둡니다.",
      },
      {
        heading: "개인 칠판으로 학생별 풀이 받기",
        body: "개인 칠판은 학생이 각자 패드나 개인 기기로 교실에 들어와 있을 때 씁니다. 강사가 문제를 나눠 주면 학생이 자기 칠판에 풀고, 강사는 여러 학생의 풀이를 한 화면에서 보며 바로 피드백하거나 상점을 줍니다. 수업을 만들 때 켜는 옵션이 아니라 수업 중에 여는 도구입니다.\n\n[수업 도구]에 개인 칠판이 보이지 않으면 학원 교실 설정에서 이 도구가 꺼져 있을 수 있습니다. 학원 관리자에게 확인을 요청하세요.\n\n개인 칠판에는 기본으로 꺼져 있는 기능이 두 가지 있습니다. 하나는 **참여 인원 제한 해제**로, 교실에 있는 인원 전부가 개인 칠판에 함께 참여하게 합니다. Android, iOS, PC, ClassIn X에서 됩니다. 다른 하나는 **.edb 파일 삽입**으로, 로컬 칠판이나 수업 준비실에서 만든 개인 칠판 내용을 .edb 파일로 저장해 두었다가 온라인 수업 중 개인 칠판에 바로 넣습니다. PC와 ClassIn X에서만 되고 모바일에서는 되지 않습니다. 둘 다 쓰려면 클래스인 코리아 담당 매니저에게 활성화를 신청하고, 교사와 학생 모두 6.0.7 이상으로 업데이트해야 합니다.",
        steps: [
          "교실에서 칠판을 엽니다.",
          "[수업 도구]를 누르고 [개인 칠판]을 엽니다.",
          "[그림판]을 고릅니다.",
          "학생에게 문제를 배포합니다.",
          "학생이 많으면 풀이가 여러 페이지로 나뉩니다. 아래 페이지 번호로 넘겨 가며 보고, 필요한 학생에게 피드백이나 상점을 줍니다.",
        ],
      },
      {
        heading: "처음 세팅할 때의 기본값",
        body: "처음부터 옵션을 다 켤 필요는 없습니다. 수업 모습에 맞는 조합 하나로 시작하고, 필요할 때 하나씩 더합니다.",
        steps: [
          "칠판 중심 수업은 대부분 [ClassIn 수업 녹화]를 켜는 것에서 시작합니다.",
          "원격 학생 없이 교실에서만 하는 칠판 수업, 학생 모두가 교실에서 패드로 참여하는 수업은 온스테이지를 1v0으로 둡니다. 모두 교실에 함께 있으니 학생 카메라를 스테이지에 올릴 필요가 없습니다.",
          "강사 모습까지 영상으로 남기는 현장 강의는 온스테이지 1v0, [ClassIn 수업 녹화]와 [현장 녹화] 모두 켜기, [기본으로 스테이지 표시] 끄기로 맞춥니다.",
          "원격 학생이 있으면 인원에 맞춰 온스테이지 인원수를 정하고, 들어오자마자 대화해야 하면 [학생 자동 온스테이지]를 켭니다.",
        ],
      },
      {
        heading: "옵션이 안 보이거나 녹화가 안 될 때",
        body: "수업을 만들거나 녹화하다 막히면 아래를 차례로 봅니다.",
        steps: [
          "[학생 자동 온스테이지]가 회색이라 눌리지 않으면 [기본으로 스테이지 표시]부터 켭니다. 학생 자동 온스테이지와 전체 음소거는 스테이지 표시를 켜야 선택됩니다.",
          "녹화나 웹 라이브 옵션이 보이지 않으면 학원 계정 인증이 끝났는지 관리자에게 확인합니다. 유료로 전환했어도 인증을 마치지 않으면 수업 녹화와 웹 라이브가 제한됩니다.",
          "[하이브리드 수업]이 보이지 않으면 요금제에 따라 제공되지 않는 기능일 수 있습니다. 관리자에게 대시보드 [일반 설정] > [부가가치 서비스]에서 하이브리드 수업 기능이 켜져 있는지 확인해 달라고 하세요.",
          "원격 학생 목소리가 들리지 않으면 장비보다 먼저 그 학생이 스테이지에 올라와 있는지, 마이크 권한을 받았는지 봅니다.",
          "이미 만든 수업의 스테이지 옵션은 수업이 시작되기 전에 고칩니다. 관리자 대시보드 [코스 관리]에서 코스를 고르고, 그 수업의 [조작] > [수업 편집]에서 고친 뒤 [확인]을 누릅니다.",
          "녹화 아이콘이 초록색으로 바뀌지 않았다면 입장할 때 [즉시 녹화]를 눌렀는지 먼저 확인합니다.",
          "수업이 끝났는데 녹화본이 안 보이면 잠시 뒤 다시 확인합니다. 수업이 끝난 뒤 앱에서 볼 수 있게 변환하는 데 시간이 걸립니다.",
        ],
      },
    ],
    relatedSlugs: [
      "course-units",
      "classroom-basic-setup",
      "class-join-replay",
      "lesson-web-live",
      "course-activities",
      "institution-settings",
      "storage-management",
      "class-connection-troubleshooting",
      "cam-t1-s1",
    ],
  },
  {
    slug: "course-activities",
    category: "teacher",
    title: "코스 - 학습 활동 추가",
    description: "강사가 코스에 숙제, 시험, 녹화 수업 같은 학습 활동을 올릴 때 따라 합니다. 수업에 맞는 활동을 고르고, 게시 전에 정할 것을 확인하고, AI로 과제·문제를 만드는 순서입니다.",
    audience: "코스에 과제·시험·자료를 올리는 강사",
    updatedAt: "2026-09-24",
    readMinutes: 11,
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
      "영어 따라읽기",
      "중국어 따라읽기",
      "AI 기반 영어 교육",
      "다시 읽을 문장 선택",
      "받아쓰기",
      "외워말하기",
      "선행 학습 조건",
      "AI로 숙제 작성",
      "AI 출제",
      "AI 채점",
      "문제 은행",
      "시청 가능 횟수",
      "플레이바 드래그",
      "AI로 과제 작성",
      "AI로 스마트 추가",
      "OMR 카드 생성",
      "시험 문제 대량 추가",
      "시험 데이터",
      "기본 단원",
      "게시 대상",
      "AI 요약",
      "로컬 녹화",
      "랭킹",
      "다른 코스로 복사",
      "활동 가져오기",
      "다른 코스에서 가져오기",
      "템플릿 코스",
      "초안 저장",
      "반마다 같은 수업",
      "커리큘럼 복사",
      "숙제 다시 제출",
      "중복 제출",
      "첨삭",
      "재채점",
      "숙제 되돌리기",
      "미제출 알림",
      "일괄 알림",
      "알림 전달",
      "숙제 독촉",
      "담당 교사",
      "할 일에 안 보여요",
      "성적 공개",
      "다른 학생 성적 안 보이게",
      "상호 열람",
      "점수 비공개",
      "점수 일괄 입력",
      "오프라인 시험 점수",
      "인강 올리기",
      "녹화 다시 올리기",
      "IP 제한",
    ],
    chatbotSummary: "코스의 [새로 만들기]에서 수업 말고도 녹화 수업, 숙제, 일일 과제, 시험, OMR 카드, 토론, 학습 자료, SCORM, AI 기반 영어·중국어 교육의 따라읽기(공식 도움말의 AI 스피킹), 받아쓰기, 외워말하기를 올립니다. 어떤 활동이든 시작·마감 시간, 게시 대상, 과정과 단원, 선행 학습 조건을 정하고 게시합니다. 숙제는 [AI로 과제 작성]과 AI 채점을, 시험은 문제 은행·직접 추가·대량 추가·AI 출제를 지원하고, OMR 카드는 객관식·다중 선택·참/거짓·빈칸·서술형 문항을 넣습니다. 녹화 수업은 재생 속도, 플레이바 드래그, 시청 가능 횟수 같은 시청 조건을 정합니다.",
    sections: [
      {
        heading: "어떤 활동을 올릴지 고르기",
        body: "코스는 실시간 수업만 하는 곳이 아닙니다. 수업 전후로 과제를 내고, 시험을 보고, 자료를 나눠 주는 일도 코스 안에서 합니다. 올린 활동마다 학생 제출 현황을 보고, 필요하면 점수를 매깁니다.\n\n| 활동 | 이럴 때 씁니다 |\n| --- | --- |\n| 녹화 수업 | 찍어 둔 영상을 보게 하고 누가 얼마나 봤는지 확인할 때 |\n| 숙제 | 글, 사진, 음성, 영상으로 과제물을 받아 평가할 때 |\n| 일일 과제 | 정한 요일마다 같은 과제를 반복해서 낼 때 |\n| 시험 | 문제를 만들어 시험지로 묶고 자동 채점할 때 |\n| OMR 카드 | 가진 시험지 파일을 그대로 쓰고 답안만 입력받을 때 |\n| 토론 | 주제를 던지고 학생 의견과 댓글을 받을 때 |\n| 학습 자료 | PDF, 이미지, 수업 판서를 나눠 주고 열람 여부를 볼 때 |\n| 따라읽기 | 문장이나 단어를 듣고 따라 말하게 하고 AI가 발음과 유창함에 점수를 매길 때 |\n\n따라읽기는 받아쓰기, 외워말하기와 함께 활동 게시하기 메뉴의 AI 기반 영어 교육과 AI 기반 중국어 교육 아래에 각각 있습니다. 공식 도움말과 이전 화면에서는 이 말하기 연습 활동이 [AI 스피킹]으로 나옵니다. 학생에게 알릴 때는 '영어 따라읽기'처럼 언어와 유형을 같이 말해 주세요.\n\n이 밖에 실시간 수업인 [수업]과 SCORM이 있습니다.\n\n녹화 수업은 수업 생성 옵션인 수업 녹화와 다릅니다. 수업 녹화는 실시간 수업 화면을 다시보기로 남기는 설정이고, 녹화 수업은 이미 있는 영상을 올리는 활동입니다.",
      },
      {
        heading: "게시 전에 정하는 것",
        body: "어떤 활동이든 작성 화면 오른쪽 메뉴에서 아래를 정하고 게시합니다.",
        steps: [
          "시작 시간과 마감 시간을 정합니다.",
          "게시 대상(구성원)을 고릅니다. 대상에서 빠진 학생에게는 활동이 가지 않습니다.",
          "활동을 넣을 과정과 단원을 고릅니다. 단원을 만들지 않고 게시하면 '기본 단원'이 자동으로 생기고 그 안에 들어갑니다. 기본 단원은 나중에 고치면 됩니다.",
          "순서대로 풀게 하려면 선행 학습 조건을 겁니다. A를 끝내야 B가 열리고, B를 끝내야 C가 열리는 식입니다.",
          "담당 교사를 확인합니다. 활동을 만들면 담임 교사가 기본 담당 교사가 되고, 담당 교사는 활동마다 한 명입니다. 같은 코스의 교사라도 담당 교사가 아니면 [할 일]에 그 활동의 진행 상황이 나오지 않습니다.",
        ],
      },
      {
        heading: "반마다 같은 활동을 쓰려면",
        body: "같은 커리큘럼을 여러 반에 쓴다면 활동을 반마다 새로 만들지 않고 다른 코스에서 가져옵니다.",
        steps: [
          "새로 쓸 코스에서 [새로 만들기] > [다른 코스에서 가져오기]를 누르고 가져올 활동을 고릅니다.",
          "코스 학생 명단이나 지난 성적처럼 활동에 딸리지 않은 정보는 복사되지 않을 수 있습니다.",
          "견본 코스를 하나 만들어 두면 편합니다. 견본 코스의 활동은 게시하지 말고 왼쪽 아래 [초안 저장]으로 대기 상태로 둔 뒤, 반마다 가져다 씁니다.",
        ],
      },
      {
        heading: "녹화 수업과 학습 자료 올리기",
        body: "녹화 수업은 이미 찍어 둔 영상을 학생에게 보여 주는 활동입니다. 학생별 시청 횟수, 시청 시간, 완료율이 남고, 학생은 영상을 보다 생긴 질문을 댓글로 남깁니다. 전자칠판에서 로컬 녹화로 저장한 mp4 파일도 녹화 수업으로 올립니다.\n\n학습 자료는 PDF, 이미지, 클래스인 수업 판서 같은 자료를 나눠 주고 학생이 열어 봤는지 확인하는 활동입니다.",
        steps: [
          "과정 탭에서 [새로 만들기] > [녹화 수업]을 누르거나, [녹화 수업] 버튼을 바로 누릅니다.",
          "클래스인 드라이브나 내 컴퓨터에서 영상을 불러옵니다.",
          "오른쪽 고급 설정에서 재생 속도 조절, 플레이바 드래그, 시청 가능 횟수, 토론 공간을 정합니다. 학습 활동 종료 후 열람 허용, 저작권 보호 설정, 새로 추가된 구성원 열람 허용도 여기서 봅니다.",
          "게시한 뒤에는 [학생 데이터]에서 학생별, 반 전체 시청 기록을 봅니다. 토론 공간을 켰다면 오른쪽 [토론]에서 학생 댓글에 답합니다.",
          "[AI 요약]은 영어와 중국어 영상에서만 됩니다.",
          "내려받은 수업 녹화를 학생에게 다시 보여 줄 때도 [녹화 수업]으로 올립니다. 올린 파일은 순서대로 나열되니, 수업 화면과 카메라 영상 중 한 종류만 올리면 보기 편합니다. 지역이나 IP로 시청을 막는 기능은 없습니다.",
          "학습 자료는 [새로 만들기] > [학습 자료]에서 내용을 쓰고 파일을 올립니다. 오른쪽에서 열람 시간과 대상 학생을 정하고, [고급 설정]에서 파일 다운로드 허용과 신규 학생 열람 허용을 정한 뒤 [확인]을 누릅니다.",
        ],
      },
      {
        heading: "숙제와 일일 과제 내기",
        body: "숙제는 한 번 내고 제출물을 받아 평가하는 활동입니다. 학생은 글, 사진, 음성, 영상으로 제출합니다. 일일 과제는 정한 요일마다 같은 과제가 자동으로 나가는 활동이라 매일 반복하는 과제에 맞고, 학생별 누적 기록이 쌓입니다.",
        steps: [
          "[새로 만들기] > [숙제] 또는 [일일 과제]를 누릅니다.",
          "제목과 본문을 쓰고, 필요한 파일을 드라이브나 내 컴퓨터에서 붙입니다. word, ppt, pdf, 이미지, 영상 파일이 올라갑니다.",
          "숙제 내용을 AI에게 맡기려면 [AI로 과제 작성]을 누릅니다. 처음부터 쓰게 해도 되고, 써 둔 초안을 다듬게 해도 됩니다. 화면에 따라 [AI로 숙제 작성]으로 보입니다.",
          "채점 기준이 필요하면 [답안 추가]로 답안을 붙이고, 채점 규칙과 AI 채점 토글을 확인합니다.",
          "고급 설정에서 추가 제출 허용과 첨부 파일 다운로드 허용을 정합니다.",
          "일일 과제는 시작일과 마감일, 반복 주기를 정하고 월요일부터 일요일 중 과제를 낼 요일을 고릅니다. 총 제출 일자가 실제 수업 일정과 맞는지 봅니다.",
          "게시한 일일 과제를 누르면 위쪽에서 제출 현황을 보고 채점합니다. 왼쪽 위 [랭킹]에서는 누적 참여 순위를 봅니다.",
          "아직 내지 않은 학생에게 한꺼번에 알리려면 [일일 과제] 페이지에서 [알림 전달]을 누릅니다. 미제출 학생 전원에게 앱 알림이 갑니다.",
          "학생이 숙제를 여러 번 내면 마지막 제출본만 남습니다. 이전 제출본은 볼 수 없어 제출본마다 코멘트를 달 수는 없습니다. 마감 전에 코멘트를 주고 학생이 보완해 다시 내게 하는 방식으로 쓰기도 합니다.",
          "피드백은 숙제에 직접 첨삭(빨간색 표시)하거나 피드백 항목에 코멘트로 씁니다. 피드백 항목에서 우수 숙제 선정, 되돌리기, 점수 주기도 하고, 이미 쓴 피드백은 [재채점]으로 고칩니다.",
        ],
      },
      {
        heading: "시험 만들기",
        body: "시험은 문제를 하나씩 만들어 시험지로 묶는 활동입니다. 학생이 제출하면 자동으로 채점되고, 주관식 문항만 자동 채점에서 빠집니다. 게시한 시험을 누르면 [시험 데이터]에서 문제별 정답률과 선지별 선택률을, [채점 완료]에서 응시를 마친 학생 결과를 봅니다.",
        steps: [
          "[새로 만들기] > [시험]을 누릅니다.",
          "문제는 네 가지 방법으로 넣습니다. [문제 은행에서 불러오기], [시험 문제 추가], [시험 문제 대량 추가], [AI 출제]입니다.",
          "직접 넣을 때는 [+시험 문제 추가]에서 유형, 내용, 답안, 난이도 순으로 입력합니다. 문제에 사진을 붙일 수 있고, [저장하고 계속]을 누르면 다음 문제로 이어집니다.",
          "[문제 은행 - 시험지에 저장합니다]를 눌러 두면 다음 시험에서 다시 씁니다. 저장할 때 학습 단계(학년, 반, 레벨 같은 큰 분류)와 학습 과목(국어, 영어 같은 세부 분류)을 정해 두면 나중에 찾기 쉽습니다.",
          "문제가 많으면 대량 추가에서 워드나 엑셀 템플릿을 내려받아 채운 뒤 올립니다. 인식에 실패한 문제는 게시 전에 고칩니다.",
          "AI로 만들 때는 주제, 난이도, 문제 유형을 입력하고 [생성하기]를 누른 뒤 [적용 및 편집]으로 시험지에 넣습니다.",
          "응시 시간, 빈칸 문제 직접 채점, 활동 종료 후 제출 허용, 답안과 설명 공개 여부를 정하고 [미리 보기]로 PC와 모바일 화면을 본 뒤 게시합니다.",
          "학생에게 자기 성적만 보이게 하려면 [시험] > [설정] > [설정 더 보기]에서 [숙제 내용, 성적 상호 열람 허용]을 끕니다. 켤 때는 학생 제출 후, 교사 채점 후, 마감일 이후 중에서 서로 볼 수 있는 시점을 고릅니다.",
          "시험 점수를 한꺼번에 입력하거나 오프라인 시험 점수를 한꺼번에 올리는 기능은 없습니다.",
        ],
      },
      {
        heading: "OMR 카드로 가진 시험지 그대로 쓰기",
        body: "OMR 카드는 이미 있는 시험지 파일을 올리고, 학생이 시험지를 보면서 별도 답안 칸에 답을 적게 하는 활동입니다. 채점 방식은 시험과 같습니다. 휴대폰에서는 시험지가 세로로 작게 보이니 학생에게 미리 알려 주세요.\n\n> 이번 시험은 OMR 카드로 봅니다. 휴대폰에서는 시험지가 작게 보이니 PC나 패드로 응시해 주세요.",
        steps: [
          "[새로 만들기] > [OMR 카드]를 누릅니다.",
          "문제지 파일을 올립니다. PDF, PPT, 이미지 파일이면 됩니다.",
          "학생이 제출한 뒤 볼 답안·해설지를 붙입니다.",
          "[OMR 카드 생성]을 누르면 AI가 답안 구조를 만들어 줍니다. 직접 만들 때는 객관식, 다중 선택, 참/거짓, 빈칸 채우기, 서술형 중에서 문항을 넣고, 문항이 많으면 일괄 추가를 씁니다.",
          "문항별 배점을 고치고 응시 시간을 정합니다. [고급 설정]에서 빈칸 문제 직접 채점, 답안과 설명 공개를 정한 뒤 게시합니다.",
        ],
      },
      {
        heading: "토론 열기",
        body: "토론은 주제를 던지고 학생 의견을 받는 활동입니다. 학생은 글과 함께 이미지, 음성 녹음, 파일을 올리고, 서로 좋아요와 댓글을 남깁니다. 강사는 학생 의견에 점수를 줄 수 있습니다.",
        steps: [
          "[새로 만들기] > [토론]을 누르고 주제를 씁니다. 필요하면 PDF, MP3, MP4 같은 파일을 붙입니다.",
          "오른쪽에서 마감 시간과 점수를 정합니다. [고급 설정]에서 학생 간 성적 열람과 신규 학생 참여 허용을 정한 뒤 [확인]을 누릅니다.",
          "게시한 뒤에는 활동 페이지 오른쪽 [댓글]에서 학생 댓글과 좋아요 수를 봅니다. 댓글 아래 [답변]으로 대댓글을 달고, 화면 아래 [댓글 남기기]로 강사도 의견을 남깁니다.",
        ],
      },
      {
        heading: "따라읽기로 말하기 연습시키기",
        body: "따라읽기는 강사가 넣은 단어나 문장을 학생이 듣고 따라 말하면, AI가 녹음을 듣고 발음과 유창함에 점수를 매기는 활동입니다. 주변 소리가 녹음에 섞이지 않게 조용한 곳에서 하라고 학생에게 알려 주세요.",
        steps: [
          "[새로 만들기]에서 AI 기반 영어 교육이나 AI 기반 중국어 교육의 [따라읽기]를 고릅니다. 화면에 따라 [AI 스피킹]으로 보입니다.",
          "[스피킹 과제 추가]로 영어 문장이나 단어를 넣고, 문장 끝의 [인식]을 눌러 음성을 만듭니다. 뜻은 넣어도 되고 비워 둬도 됩니다.",
          "문장을 AI로 만들려면 [AI로 스마트 추가]에 요청을 적고 [생성하기]를 누른 뒤 [적용 및 편집]으로 문제에 넣습니다. 요청은 '초등학교 3학년 수준 날씨 설명 문장 5개'처럼 구체적으로 적습니다.",
          "오른쪽 기본 설정에서 시험 시간과 응시 인원을, [고급 설정]에서 학생 간 성적과 발음 녹음 파일 열람 허용을 정합니다.",
          "게시한 뒤 활동 페이지에서 제출 현황과 평균 점수를 봅니다. 학생을 누르면 점수가 낮은 문장이나 단어를 보고, 그 학생의 녹음을 들어 봅니다.",
          "6.0.8부터 영어 따라읽기에서는 학생이 다시 읽거나 고칠 카드·문장을 직접 골라 연습합니다. 전체를 처음부터 다시 읽지 않아도 됩니다.",
        ],
      },
    ],
    relatedSlugs: [
      "course-units",
      "lesson-option-concepts",
      "course-submit-activity",
      "course-members",
      "drive-materials",
      "lesson-web-live",
    ],
  },
  {
    slug: "lesson-web-live",
    category: "teacher",
    title: "수업 - 웹 라이브 & 플레이백",
    description: "참여자가 앱 없이 웹 링크로 들어오는 수업입니다. 학부모 설명회나 공개 강연처럼 여러 사람에게 한 번에 수업을 보여 줄 때, 강사는 수업을 만들고 링크를 보낸 뒤 송출하고, 끝나면 시청 데이터를 확인합니다.",
    audience: "설명회·공개 수업을 여는 강사와 운영 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 5,
    tags: ["웹 라이브", "플레이백", "대규모 수업", "녹화"],
    keywords: [
      "웹 라이브",
      "플레이백",
      "수업 녹화",
      "대시보드",
      "비밀번호",
      "채팅",
      "좋아요",
      "Enterprise",
      "Business Consumption",
      "설명회",
      "공개 수업",
      "웹 페이지 링크",
      "생방송 리플레이",
      "코스 다시보기",
      "실시간 채팅",
      "라이브 커버",
      "시청자 수",
      "웹 라이브 요금제",
    ],
    chatbotSummary: "웹 라이브는 클래스인 녹화 화면을 웹 링크로 실시간 중계하는 기능이라, 수업을 만들 때 녹화 옵션을 하나 이상 켜야 라이브 & 플레이백 옵션이 보입니다. 참여자는 앱 없이 링크로 들어오고, 로그인 요구·비밀번호·좋아요와 채팅 권한은 관리자 대시보드 [라이브&플레이백]에서 정합니다. 구독형은 Enterprise, 충전형은 Business Consumption 요금제에서 쓸 수 있고, 계정 인증을 마치지 않은 학원은 웹 라이브가 제한됩니다.",
    sections: [
      {
        heading: "웹 라이브와 플레이백은 언제 쓰나",
        body: "웹 라이브는 클래스인 녹화 화면을 웹 링크로 실시간 중계합니다. 참여자는 앱을 설치하지 않고 링크만 눌러 봅니다. 학부모 설명회, 샘플 수업, 강연처럼 많은 사람에게 한 번 보여 주는 자리에 맞고, 참여자는 채팅과 좋아요로 강사와 소통합니다. 학생과 주고받는 활동이 많은 수업이라면 일반 수업으로 여는 편이 낫습니다.\n\n플레이백을 함께 켜 두면 라이브가 끝난 뒤 같은 링크에서 다시보기가 열립니다.",
      },
      {
        heading: "수업 만들 때 웹 라이브 켜기",
        body: "웹 라이브는 따로 만드는 메뉴가 없습니다. 공개 수업이나 코스 안에 수업을 추가하면서 옵션으로 켭니다. 녹화 화면을 그대로 중계하는 기능이라 녹화 옵션을 하나 이상 켜야 고를 수 있습니다.",
        steps: [
          "코스에서 [새로 만들기]를 눌러 수업을 추가합니다. 공개 수업으로 만들어도 됩니다.",
          "수업 시간을 정하고 녹화 옵션을 하나 이상 켭니다. 그러면 라이브 & 플레이백 옵션이 나타납니다.",
          "라이브만 쓸지, 플레이백까지 켤지 고릅니다. 플레이백을 켜면 끝난 뒤 로그인 없이 다시보기를 볼 수 있는 링크가 생깁니다.",
          "[게시]를 눌러 수업을 만듭니다.",
          "만든 수업의 점 세 개 메뉴에서 [생방송 리플레이] 링크를 복사합니다. 이 코스 전체 수업의 다시보기 링크가 필요하면 [코스 다시보기]를 복사합니다.",
          "링크가 보이지 않으면 대시보드 [라이브&플레이백] > [웹 페이지 링크]에서 찾습니다.",
          "관리자 대시보드에서 만들 때는 [코스 관리]에서 코스를 고르고 [시간표] > [수업 생성]으로 들어갑니다. 만든 뒤 [시간표]에서 링크나 QR을 복사합니다.",
        ],
        media: [
          {
            type: "image",
            src: "/docs/files/cs-figma/웹-라이브-사용-방법-안내-앱.png",
            alt: "클래스인 앱에서 [새로 만들기]로 수업을 만들고 녹화 옵션과 웹 라이브를 켠 뒤 게시해 링크를 확인하는 단계별 화면",
            caption: "앱에서 웹 라이브 수업을 만드는 순서. 녹화 옵션을 하나 이상 켜야 웹 라이브와 플레이백을 고를 수 있습니다.",
            width: 1440,
            height: 8175,
          },
        ],
      },
      {
        heading: "시청 조건은 대시보드에서 정하기",
        body: "로그인 요구, 비밀번호, 채팅 권한 같은 세부 설정은 관리자 대시보드에서만 바꿉니다. 대시보드 권한이 없는 강사는 학원 관리자와 같이 정하세요.",
        steps: [
          "경로: 대시보드 > [라이브&플레이백] > 세부 설정",
          "참여자가 클래스인 ID로 로그인해야 볼 수 있게 할지 정합니다. 로그인을 요구하지 않으면 참여자는 닉네임만 입력하고 들어옵니다.",
          "링크가 밖으로 퍼지면 안 되는 수업은 시청 비밀번호를 겁니다.",
          "좋아요와 채팅 권한을 정합니다.",
          "라이브 커버 이미지와 소개글을 넣습니다.",
          "수업 하나만 따로 바꾸려면 목록에서 그 수업 오른쪽 [오퍼레이션] > [관리]로 들어갑니다.",
        ],
      },
      {
        heading: "참여자에게 링크 보내기",
        body: "참여자는 받은 링크를 눌러 들어옵니다. 로그인을 요구했다면 클래스인 ID로 로그인하고, 아니면 닉네임만 입력합니다. 비밀번호를 걸었다면 링크와 함께 꼭 미리 알려 주세요. 아래 문구를 고쳐 쓰면 됩니다.\n\n> 안녕하세요, (학원 이름)입니다. (날짜와 시간) 설명회는 아래 링크로 보실 수 있습니다. 앱을 설치하지 않아도 링크만 누르면 됩니다. 입장 비밀번호는 (비밀번호)입니다.\n> (웹 라이브 링크)\n\n비밀번호를 걸지 않았다면 마지막 문장은 빼고 보내세요.",
      },
      {
        heading: "라이브 시작과 진행",
        body: "참여자 화면에는 강사의 클래스인 녹화 화면이 그대로 나갑니다.",
        steps: [
          "교실에 들어가 그날 쓸 자료를 띄우고 카메라를 맞춥니다.",
          "[수업 녹화]를 누르면 그 순간부터 웹 라이브 송출이 시작됩니다. 누르기 전 화면은 중계되지 않습니다.",
          "[수업 도구] > [실시간 채팅]을 열면 웹 참여자가 남긴 채팅이 앱 안에 함께 보입니다. 수업 중간중간 확인해 질문에 답합니다.",
          "실시간 채팅 창은 교실 안 학생에게 보이지 않고 녹화에도 담기지 않습니다. 웹 참여자의 질문을 모두와 나눠야 하면 캡처해서 보여 줍니다.",
        ],
      },
      {
        heading: "끝난 뒤 시청 데이터 보기",
        body: "수업이 끝나면 대시보드에서 시청자 수와 좋아요 수를 봅니다. 대시보드 [코스 관리]에서 그 수업의 [관리] > [웹 라이브 및 다시 보기 관리]로 들어가면 참여자, 채팅, 시청 데이터를 함께 봅니다.\n\n플레이백을 켰다면 라이브가 끝난 뒤 같은 링크에서 다시보기가 열립니다. 로그인 없이 열리는 링크라면 누구에게까지 보낼지 미리 정해 두세요.",
        steps: [
          "경로: 대시보드 > [라이브&플레이백] > [오퍼레이션] > [관리]",
        ],
      },
      {
        heading: "쓸 수 있는 요금제",
        body: "웹 라이브는 요금제에 따라 쓸 수 있는지가 다릅니다. 구독형(Classin Learning Space)은 Enterprise에서, 충전형(Consumption)은 Business에서 씁니다. 유료로 전환했어도 학원 계정 인증을 마치지 않았으면 웹 라이브가 제한되니, 옵션이 보이지 않으면 관리자에게 인증 상태부터 확인해 달라고 하세요.\n\n웹 라이브와 플레이백 시청에 드는 비용은 요금제와 계약 조건에 따라 달라집니다. 학원에 적용되는 기준은 상담 채널로 문의해 주세요.",
      },
    ],
    relatedSlugs: ["web-live-playback", "course-units", "classroom-basic-setup", "account-verification", "course-activities"],
  },
  {
    slug: "classroom-basic-setup",
    category: "teacher",
    title: "교실 - 기본 설정 (PC 및 모바일)",
    description: "수업 당일 강사가 교실에 들어가기 전후로 확인할 것들입니다. 입장 시각, 카메라·마이크 점검, 녹화가 시작됐는지 확인, 소리가 안 들릴 때 볼 곳, 스테이지와 배경 설정, 수업을 마치고 나가는 방법을 차례로 봅니다.",
    audience: "수업하는 강사",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    featured: true,
    tags: ["교실", "장비 테스트", "녹화", "가상 배경", "스테이지"],
    keywords: [
      "교실 설정",
      "장비 테스트",
      "Classin 수업 녹화",
      "현장 녹화",
      "스테이지",
      "가상 배경",
      "교실 배경",
      "블랙보드",
      "툴바",
      "다이나믹 아일랜드",
      "교실 입장",
      "수업 준비실",
      "20분 전 입장",
      "즉시 녹화",
      "바로 녹화하기",
      "초록색 녹화 아이콘",
      "소리 없음",
      "마이크 사용 안 함",
      "학생 목소리 안 들림",
      "교실 설정 스킨",
      "기기 테스트",
      "마이크 검사",
      "마이크 테스트",
      "초록색 마이크",
      "마이크 권한",
      "외장 마이크",
      "소리가 작아요",
      "웅웅거려요",
      "배경 바꾸기",
      "교실 배경 변경",
      "교실 나가기",
      "수업 종료",
      "수업 끝내기",
      "퇴장 버튼",
      "확장형 판서 영역",
      "판서 공간 부족",
      "칠판 늘리기",
    ],
    chatbotSummary: "강사는 수업 20분 전, 학생은 10분 전부터 교실에 들어올 수 있습니다. 입장 직전 테스트 화면에서 카메라·마이크·스피커를 고르고, 녹화 옵션을 켠 수업은 입장 때 [즉시 녹화]를 눌러 녹화를 시작한 뒤 녹화 아이콘이 초록색인지 확인합니다. 원격 학생 목소리가 안 들리면 그 학생이 스테이지에 올라와 있는지, 마이크 권한을 받았는지 먼저 보고, 스테이지·가상 배경·교실 배경은 교실 오른쪽 위 [메뉴] > [설정]에서 바꿉니다.",
    sections: [
      {
        heading: "교실 입장은 20분 전부터",
        body: "강사는 수업 시작 20분 전부터, 학생은 10분 전부터 교실에 들어올 수 있습니다. 일찍 들어가 장비와 자료를 맞춰 두세요.",
        steps: [
          "PC에서는 상단 [다이나믹 아일랜드]나 오른쪽 [할 일] 탭에서 [교실 입장]을 누릅니다.",
          "수업 시간 전에 교실을 미리 둘러보려면 수업의 [수업 준비]를 눌러 수업 준비실에 들어갑니다. 준비실에는 학생이 들어올 수 없으니, 수업 시간이 되면 실제 교실로 옮겨 수업합니다.",
          "수업을 아직 만들지 않았다면 코스에서 먼저 수업을 추가합니다.",
        ],
      },
      {
        heading: "입장 전 장비 테스트",
        body: "교실에 들어가기 직전 카메라, 마이크, 스피커를 고르는 테스트 화면이 뜹니다. PC나 모바일 기기에 장비가 두 개 이상 연결돼 있다면 실제로 쓸 장비가 선택돼 있는지 여기서 봅니다.",
        steps: [
          "카메라 미리보기에 교실이 제대로 보이는지 확인합니다.",
          "마이크에 말했을 때 사운드 바가 초록색으로 움직이는지 봅니다.",
          "스피커 소리가 들리는지 확인하고 교실에 들어갑니다.",
          "수업 전에 미리 해 보려면 PC 앱 왼쪽 아래 프로필 > [계정 및 설정] > [기기 테스트] > [마이크 검사]에서 테스트하고 볼륨을 맞춥니다.",
        ],
        media: [
          {
            type: "image",
            src: "/docs/files/cs-figma/클래스인-교실-내-카메라-마이크-설정-확인-pc.png",
            alt: "교실 오른쪽 위 아이콘이나 설정 메뉴에서 마이크, 스피커, 카메라를 골라 테스트하는 화면",
            caption: "사운드 바가 초록색으로 움직이는지, 선택된 카메라가 맞는지 봅니다.",
            width: 2330,
            height: 5213,
          },
        ],
      },
      {
        heading: "녹화가 시작됐는지 확인",
        body: "수업을 만들 때 녹화 옵션을 켰다면 교실에 들어가자마자 녹화 확인 창이 먼저 뜹니다. 녹화 옵션을 켜지 않았다면 이 단계는 넘어갑니다. 수업 녹화와 현장 녹화가 어떻게 다른지는 [수업 생성 옵션 오개념 정리](/docs/teacher/lesson-option-concepts)에 있습니다.",
        steps: [
          "수업 녹화는 녹화할 영역을 고르지 않습니다. [즉시 녹화]를 누른 시점부터 칠판과 자료가 보이는 교실 화면이 녹화됩니다. 화면에 따라 [바로 녹화하기]로 보입니다.",
          "현장 녹화를 켰다면 어떤 카메라로 찍을지 묻는 창이 뜹니다. 웹캠이나 외장 카메라 중 교실을 비추는 카메라를 고릅니다.",
          "녹화가 제대로 돌면 오른쪽 위 녹화 아이콘이 초록색으로 바뀝니다. 전자칠판에서는 화면 아래쪽 캠코더 아이콘이 초록색입니다.",
          "두 녹화를 모두 켰다면 학생은 다시보기에서 두 영상을 골라 봅니다.",
        ],
      },
      {
        heading: "수업 중 소리가 안 들릴 때",
        body: "수업 중에는 장비를 다시 고르는 것부터 합니다. 장비 테스트에서는 괜찮았는데 원격 학생 목소리만 안 들린다면, 장비보다 먼저 그 학생이 스테이지에 올라와 있는지 보세요. 스테이지 밖 학생은 카메라와 마이크가 모두 꺼집니다.\n\n끊김이나 튕김까지 겹치거나 계속 반복되면 [수업 중 끊기거나 튕길 때](/docs/start/class-connection-troubleshooting)를 보세요.",
        steps: [
          "오른쪽 위 톱니바퀴 설정을 열고 카메라와 마이크를 다시 고릅니다. 마이크가 '사용 안 함'으로 돼 있으면 실제로 쓸 마이크로 바꿉니다. 교실 안 마이크 아이콘 옆 삼각형 아이콘으로도 장치를 고를 수 있습니다.",
          "말할 때 카메라 화면 왼쪽 아래에 볼륨이 잡히는지 봅니다. 마이크 아이콘이 초록색이면 켜진 상태입니다.",
          "학생 마이크는 스테이지에 올라온 뒤 강사나 조교가 마이크 권한을 줘야 켜집니다.",
          "소리가 작으면 노트북 내장 마이크 대신 줄 이어폰 같은 외장 마이크를 씁니다. PC는 [계정 및 설정] > [기기 테스트] > [마이크 검사]에서 입력 볼륨을 올립니다. 안드로이드 기기는 앱 안에 마이크 입력 조절이 없으니 외장 마이크를 씁니다.",
          "소리 없음 경고가 계속 뜨면 기기의 마이크 권한과 입력 장치를 다시 확인합니다.",
          "소리가 웅웅거리거나 교재 음원이 한 사람에게만 안 들리면 최신 버전으로 업데이트합니다.",
        ],
      },
      {
        heading: "스테이지·가상 배경·교실 배경 바꾸기",
        body: "셋 다 교실 오른쪽 위 설정 창에서 바꿉니다.",
        steps: [
          "경로: [메뉴] > [설정]",
          "[일반]에서 스테이지를 보이거나 숨깁니다. 원격 학생 얼굴을 계속 볼 필요가 없으면 숨기세요. PPT·PDF 자료가 더 크게 보이고, 숨긴 상태에서도 강사와 학생 카메라는 따로 띄울 수 있습니다.",
          "[가상 배경]에서 배경을 고르면 카메라 뒤쪽이 가려집니다.",
          "[교실 배경]에서 교실 화면 배경을 고르거나 직접 만든 이미지를 올립니다. 과목에 맞춘 배경이나 학원 로고를 넣은 배경을 만들어 쓰기도 합니다.",
        ],
      },
      {
        heading: "교실 화면 구성",
        body: "교실 화면은 네 부분으로 나뉩니다.\n\n| 영역 | 여기서 하는 일 |\n| --- | --- |\n| 상태 표시줄 | 왼쪽에서 네트워크 상태를, 오른쪽에서 카메라·마이크 켜고 끄기, 녹화 상태, 메뉴, 수업 종료를 봅니다 |\n| 스테이지 | 스테이지에 올라온 강사와 학생의 카메라가 뜹니다. 스테이지에 올라와 있지 않은 사람은 목소리도 들리지 않습니다 |\n| 블랙보드(칠판) | 자료를 불러오고 판서합니다. 스크롤해서 최대 50페이지까지 이어 씁니다 |\n| 툴 바 | 판서 도구, 드라이브, 스크린 캡처, [수업 도구]가 있습니다 |\n\n판서하다 공간이 모자라면 칠판을 넘기지 않고 늘려 씁니다. 마우스 우클릭으로 가로선을 표시하고 선을 아래로 끌면 새 판서 공간이 생기고, 위로 끌면 이미 쓴 내용을 끌어올립니다. 늘려 써도 최대 50페이지 제한은 같습니다. 이 확장형 판서 영역은 6.0.7부터 따로 신청하지 않아도 켜져 있습니다.",
      },
      {
        heading: "수업을 마치고 나갈 때",
        body: "교실에서 나가는 방법은 두 가지이고 결과가 다릅니다. [교실에서 나가기]는 수업을 그대로 두고 강사만 나가며, 이때 녹화는 멈춥니다. 수업 종료는 수업과 녹화를 모두 끝내고 전원을 내보냅니다.",
        steps: [
          "PC에서는 오른쪽 위 [x] > [수업 종료]로 수업을 끝냅니다.",
          "전자칠판에서는 화면 아래 슬라이드 바를 위로 쓸어 올리면 [교실에서 나가기]와 [슬라이드하여 수업 종료하기]가 나옵니다.",
          "설정한 수업 시간이 다 되면 수업이 끝나면서 교실에 있던 사람도 함께 나가집니다.",
        ],
      },
      {
        heading: "직접 만든 교실 배경을 올릴 때",
        body: "교실 배경 이미지는 jpg 파일, 1MB 이하만 올라갑니다. 직접 올린 배경은 5개까지 추가되고, 기본 배경 11개와 합쳐 16개까지 씁니다.\n\n학원 교실 전체에 같은 배경을 쓰려면 관리자가 대시보드 [일반 설정] > [교실 설정]의 스킨 설정에서 정합니다.",
      },
    ],
    relatedSlugs: [
      "lesson-option-concepts",
      "class-connection-troubleshooting",
      "course-units",
      "drive-materials",
      "lesson-web-live",
      "teacher-profile",
      "institution-settings",
    ],
  },
  {
    slug: "class-connection-troubleshooting",
    category: "start",
    title: "수업 중 끊기거나 튕길 때",
    description: "수업 중에 화면이 끊기거나, 교실에서 튕겨 나가거나, 소리가 안 들릴 때 강사와 학생이 차례로 해 볼 조치입니다. 그래도 반복되면 상담 채널에 무엇을 보내면 되는지도 여기 있습니다.",
    audience: "수업하는 강사, 수업을 듣는 학생과 학부모, 학원 운영 담당자",
    updatedAt: "2026-09-24",
    readMinutes: 5,
    docType: "troubleshooting",
    productArea: "classroom",
    difficulty: "beginner",
    tags: ["문제 해결", "수업 끊김", "튕김", "네트워크", "소리"],
    keywords: [
      "튕겨요",
      "끊겨요",
      "수업에서 나가져요",
      "수업 중 튕김",
      "수업 끊김",
      "렉",
      "네트워크 불안정",
      "와이파이",
      "공유기",
      "핫스팟",
      "모바일 데이터",
      "노트북에서만",
      "기기 1대",
      "중복 로그인",
      "화면 잘림",
      "화면 깨짐",
      "느려요",
      "버벅여요",
      "CPU",
      "작업 관리자",
      "업데이트",
      "최신 버전",
      "캐시 삭제",
      "구버전",
      "보안 프로그램",
      "백신",
      "DRM",
      "인강 플레이어 충돌",
      "실행 안 됨",
      "수업 시간 종료",
      "소리가 작아요",
      "목소리 안 들려요",
      "마이크 감지 안 됨",
      "웅웅거려요",
      "외장 마이크",
      "이어폰",
      "마이크 권한",
      "온스테이지",
      "장애 문의",
      "문의할 때 보낼 정보",
      "원격 지원",
    ],
    chatbotSummary: "수업 중 끊기거나 튕기면 먼저 공유기를 껐다 켜거나 와이파이 가까이 옮기고, 다른 인터넷이나 휴대폰 핫스팟으로 다시 들어가 봅니다. 한 계정은 수업에 기기 1대로만 들어가고, 클래스인 외 프로그램을 닫고, 최신 버전 업데이트와 캐시 삭제를 합니다. 학생 소리가 안 들리면 온스테이지와 마이크 권한부터 확인합니다. 그래도 반복되면 수업 이름, 문제를 겪은 사람의 클래스인 아이디, 수업 시작 날짜와 시각, 화면 캡처나 영상을 상담 채널로 보내 주세요.",
    sections: [
      {
        heading: "수업 중이라 급하다면 이것부터",
        body: "끊김과 튕김은 네트워크가 불안정해서 생기는 경우가 가장 많습니다. 수업이 진행 중이라면 아래 두 가지부터 해 보세요.",
        steps: [
          "와이파이가 약하면 공유기 가까이 옮기거나, 휴대폰 핫스팟이나 모바일 데이터로 바꿔 교실에 다시 들어갑니다.",
          "클래스인 말고 켜 둔 프로그램과 인터넷 창을 닫습니다.",
        ],
      },
      {
        heading: "자꾸 끊기거나 교실에서 튕길 때",
        body: "같은 사람이 계속 튕긴다면 그 사람의 네트워크와 로그인 상태부터 봅니다. 어떤 기기에서는 괜찮은데 특정 기기에서만 튕긴다면 그 기기의 네트워크와 성능부터 봅니다.",
        steps: [
          "먼저 공유기 전원을 껐다 켜고, 기기를 공유기 가까이 둡니다.",
          "그래도 끊기면 다른 인터넷, 4G 이상 모바일 데이터, 휴대폰 핫스팟 중 하나로 바꿔 다시 들어갑니다. 바꾼 뒤 괜찮다면 원래 쓰던 네트워크가 원인입니다.",
          "한 계정은 수업에 기기 1대로만 들어갑니다. 같은 계정으로 휴대폰과 PC에 함께 들어가 있다면 한쪽은 나옵니다.",
          "구버전이면 최신 버전으로 업데이트합니다. 방법은 아래 '오래된 버전이 원인일 때'에 있습니다.",
          "튕긴 시각이 수업 끝나는 시각과 같다면 오류가 아닙니다. 설정한 수업 시간이 다 되면 수업이 끝나면서 교실에 있던 사람도 함께 나가집니다.",
        ],
      },
      {
        heading: "화면이 깨지거나 느릴 때",
        body: "네트워크는 괜찮은데 화면이 잘리거나 깨져 보이고 버벅인다면 컴퓨터에 부담이 큰 경우입니다. 다른 프로그램을 함께 띄워 둔 채 수업하다 이렇게 된 사례가 있습니다.",
        steps: [
          "먼저 클래스인 말고 켜 둔 프로그램과 인터넷 창을 닫습니다.",
          "Windows에서는 Ctrl+Shift+Esc로 작업 관리자를 열고, CPU를 많이 쓰는 불필요한 항목을 끝냅니다.",
          "그래도 느리면 최신 버전으로 업데이트하고 캐시를 지웁니다.",
          "계속되면 성능이 더 좋은 기기로 들어가고, 증상이 보이는 화면을 캡처해 둡니다.",
        ],
      },
      {
        heading: "오래된 버전이 원인일 때",
        body: "소리가 웅웅거리거나, 교재 음원이 한 사람에게만 안 들리거나, 수업이 안 보이거나, 들어가자마자 튕기는 문제는 최신 버전 업데이트나 캐시 삭제로 해결된 경우가 많았습니다. 강사만이 아니라 학생도 최신 버전이어야 합니다. 화면과 함께 보려면 [클래스인 캐시 삭제와 PC 업데이트](/docs/teacher/cs-cache-update-pc)를 여세요.",
        steps: [
          "PC 앱 왼쪽 아래 프로필 > [계정 및 설정] > [소프트웨어 정보]에서 현재 버전과 최신 버전을 비교하고, 다르면 [업그레이드]를 누릅니다.",
          "[계정 및 설정] > [파일 전송]에서 캐시 파일 항목의 [내용 삭제]를 누릅니다. 바로 아래 데이터 파일의 [내용 삭제]와 헷갈리지 마세요.",
          "휴대폰과 태블릿은 앱스토어나 구글 플레이에서 클래스인을 최신 버전으로 업데이트합니다.",
          "업데이트한 뒤 다시 로그인해 같은 동작을 해 봅니다.",
        ],
      },
      {
        heading: "PC에서 앱이 안 켜지거나 카메라·마이크가 막힐 때",
        body: "보안 기능을 켜는 다른 프로그램이 클래스인을 막는 경우가 있습니다. 백신, 회사나 보험 업무용 보안 앱, 인강 재생용 저작권 보호(DRM) 플레이어가 대표적입니다. 특히 인강 재생 플레이어는 화면 녹화·녹음·미러링을 하는 다른 프로그램을 막기 때문에, 클래스인의 카메라·마이크 권한까지 막아 실행이 안 된 사례가 있습니다.",
        steps: [
          "먼저 기기에 맞는 설치 파일인지 봅니다. Windows는 Windows용, 맥은 인텔과 Apple Silicon 중 칩에 맞는 파일입니다.",
          "최근에 설치한 보안 프로그램이 있는지 봅니다. 필요 없는 프로그램이면 지운 뒤 클래스인을 다시 실행합니다.",
          "지울 수 없는 프로그램이라면 클래스인은 휴대폰이나 태블릿으로 들어갑니다.",
        ],
      },
      {
        heading: "학생 소리가 안 들릴 때",
        body: "장비 테스트에서는 괜찮았는데 수업에서만 학생 소리가 안 들린다면, 장비보다 교실 설정을 먼저 봅니다.",
        steps: [
          "그 학생이 교실 위쪽 스테이지에 올라와 있는지 봅니다. 스테이지 밖 학생은 카메라와 마이크가 모두 꺼집니다.",
          "스테이지에 올린 뒤에도 강사나 조교가 마이크 권한을 줘야 학생 마이크가 켜집니다. 마이크 아이콘이 초록색이면 켜진 상태입니다.",
          "그래도 작게 들리면 노트북 내장 마이크 대신 줄 이어폰 같은 외장 마이크를 씁니다.",
          "PC는 왼쪽 아래 프로필 > [계정 및 설정] > [기기 테스트] > [마이크 검사]에서 입력 볼륨을 올립니다.",
          "안드로이드 기기는 앱 안에 마이크 입력 조절이 없습니다. 올린 것이 스피커 볼륨은 아닌지 보고, 외장 마이크를 씁니다.",
          "웅웅거리거나 한쪽 소리만 안 들리면 최신 버전으로 업데이트합니다.",
        ],
      },
      {
        heading: "그래도 반복되면 문의할 때 보낼 정보",
        body: "위 조치를 해도 반복되면 상담 채널로 문의해 주세요. 아래 정보가 있으면 상담원이 그 수업 기록으로 원인을 확인할 수 있습니다. 비밀번호는 보내지 않아도 됩니다.\n\n> 수업 이름:\n> 문제를 겪은 사람의 클래스인 아이디:\n> 수업 시작 날짜와 시각:\n> 어떤 문제가 몇 시쯤 생겼는지:\n> 화면 캡처나 짧은 영상: 첨부\n\n원격 지원이 필요하면 상담 채널에서 안내받은 방법으로만 받으세요.",
      },
    ],
    relatedSlugs: [
      "classroom-basic-setup",
      "class-join-replay",
      "pc-install",
      "mobile-install",
      "lesson-option-concepts",
      "cs-microphone-camera-check",
      "cs-cache-update-pc",
    ],
  },
  {
    slug: "student-profile",
    category: "student",
    title: "클래스인 프로필 설정",
    description: "처음 클래스인에 로그인한 학생이 수업 전에 해 둘 일입니다. 학원이 정한 양식대로 닉네임과 사진을 바꾸고, 수업에서 예전 이름이 보이면 코스마다 따로 있는 닉네임을 확인합니다.",
    audience: "클래스인을 처음 쓰는 학생과, 설정을 도와주는 학부모",
    updatedAt: "2026-09-24",
    readMinutes: 4,
    tags: ["프로필", "초기설정", "계정"],
    keywords: ["프로필", "닉네임", "사진", "계정 설정", "개인정보", "닉네임 양식", "출석 확인", "닉네임 변경", "코스 내 나의 닉네임", "닉네임 수정 권한", "전화번호로 표시", "이름이 번호로 나와요", "실명 표시", "닉네임 동기화", "청소년 모드", "자녀 보호", "기능 제한"],
    chatbotSummary: "PC는 왼쪽 아래 [기본 프로필] > [계정 및 설정] > [개인정보]에서, 모바일은 앱 왼쪽 위 프로필 아이콘에서 사진과 닉네임을 바꿉니다. 닉네임은 학원이 정한 양식을 따르고, 바꿨는데 수업에서 예전 이름이 보이면 코스 설정의 [코스 내 나의 닉네임]을 확인합니다. 선생님이 이 항목을 막아 두었다면 선생님께 변경을 부탁합니다.",
    sections: [
      {
        heading: "닉네임은 선생님이 나를 찾는 이름입니다",
        body: "선생님은 수업 중에 화면에 보이는 이름으로 출석을 확인합니다. 채팅이나 모둠 활동에서 친구들이 나를 알아보는 것도 이 닉네임입니다. 영어 별명이나 기호만 적어 두면 선생님이 누구인지 바로 알기 어렵습니다. 학원이 정한 양식이 있으면 그대로 따르세요.",
        steps: [
          "학원에서 받은 닉네임 양식을 먼저 확인합니다. 학년과 이름을 붙여 쓰는 학원이라면 '중1김민지'처럼 적습니다.",
          "같은 반에 이름이 같은 친구가 있으면 학원이 알려 준 방식대로 반이나 번호를 덧붙입니다.",
          "프로필 사진은 얼굴이 보이는 밝은 사진이 좋습니다. 학원이 정한 사진 기준이 있으면 그것을 따릅니다.",
        ],
      },
      {
        heading: "PC에서 바꾸기",
        body: "수업 중이 아닐 때 미리 바꿔 두세요.",
        steps: [
          "경로: 왼쪽 아래 [기본 프로필] > [계정 및 설정] > [개인정보]",
          "닉네임 옆 연필 아이콘을 눌러 학원 양식대로 입력하고, 프로필 사진을 올립니다.",
          "저장한 뒤 닉네임이 입력한 그대로 보이는지 한 번 더 봅니다.",
        ],
      },
      {
        heading: "휴대폰·태블릿에서 바꾸기",
        body: "안드로이드와 iOS 앱 모두 방법이 같습니다. PC와 같은 계정이라 한쪽에서 바꾸면 다른 쪽에도 반영됩니다.",
        steps: [
          "경로: 앱 왼쪽 위 프로필 아이콘 > 내 닉네임 > [개인정보]",
          "[닉네임]을 눌러 학원 양식대로 입력하고 [저장]을 누릅니다.",
          "프로필 사진을 바꿀 때도 같은 경로로 들어갑니다.",
        ],
      },
      {
        heading: "바꿨는데 수업에서는 예전 이름이 보일 때",
        body: "클래스인에는 계정 닉네임과 별도로, 코스마다 따로 정하는 '코스 내 나의 닉네임'이 있습니다. 계정 닉네임을 바꿔도 이 코스 닉네임이 예전 그대로면 수업과 채팅에는 예전 이름이 나옵니다. 위에서부터 차례로 확인하세요.",
        steps: [
          "경로: 코스 설정 > [코스 내 나의 닉네임]",
          "저장을 눌렀는지 다시 봅니다. 입력만 하고 다른 화면으로 넘어가면 바뀌지 않습니다.",
          "PC에서는 코스 화면 왼쪽 위의 코스 이름을 눌러 코스 설정을 엽니다. 휴대폰에서는 코스 화면 위쪽 코스 정보 오른쪽의 화살표(>)를 누릅니다.",
          "코스 설정에서 [코스 내 나의 닉네임]을 눌러 학원 양식대로 고칩니다. 수업에서 이름 대신 전화번호가 보일 때도 여기서 실명으로 바꾸면 됩니다.",
          "'담임 선생님이 닉네임 수정 권한을 비활성화했습니다.'라는 문구가 뜨면 학생이 직접 바꿀 수 없는 상태입니다. 선생님께 바꿀 이름을 알려 드리고 변경을 부탁합니다.",
          "수업 화면을 켜 둔 채로 바꿨다면 클래스인을 완전히 껐다가 다시 켭니다.",
          "로그인한 아이디(휴대폰 번호나 이메일)가 내 계정이 맞는지 확인합니다.",
        ],
      },
      {
        heading: "학원이 이름을 한꺼번에 맞추는 경우",
        body: "학원에 따라 코스 닉네임을 가입할 때 등록한 이름으로 자동으로 맞춰 두기도 합니다. 이런 학원에서는 계정 닉네임에 본명이 들어가 있어야 이름이 제대로 나옵니다. 이미 들어가 있는 코스에 새 이름을 반영하려면 학원이 코스에서 한 번 뺐다가 다시 넣어야 할 수도 있으니, 혼자 여러 번 바꾸기보다 학원에 알리는 편이 빠릅니다.",
        steps: [
          "계정 닉네임이 본명인지 먼저 확인하고, 아니라면 본명으로 고칩니다.",
          "어떤 기기(PC, 휴대폰)의 어느 화면에서 예전 이름이 보이는지 적어 둡니다.",
          "지금 보이는 이름과 바꾸고 싶은 이름을 함께 학원 선생님께 보냅니다.",
        ],
      },
      {
        heading: "자녀가 쓰는 앱 기능을 제한하고 싶은 학부모님께",
        body: "클래스인에는 청소년 모드가 있습니다. 계정에 비밀번호를 걸어 일부 기능을 막고, 풀 때는 그 비밀번호를 입력합니다. 설정 방법이나 비밀번호를 잊었을 때의 해제는 클래스인 상담 채널에 문의해 주세요.",
      },
    ],
    relatedSlugs: ["course-join", "class-join-replay", "chat", "todo-calendar"],
  },
  {
    slug: "chat",
    category: "student",
    title: "채팅으로 소통하기",
    description: "반 채팅방에서 선생님과 친구에게 질문하고, 파일을 보내고, 글로 설명하기 어려우면 15분짜리 임시 교실을 여는 방법입니다. 친구 추가와 연락처도 채팅 탭에서 관리합니다.",
    audience: "반 친구·선생님과 채팅으로 이야기하려는 학생",
    updatedAt: "2026-09-24",
    readMinutes: 3,
    tags: ["채팅", "소통", "임시교실", "연락처"],
    keywords: ["채팅", "메신저", "임시 교실", "연락처", "@태그", "이모티콘", "파일 전송", "친구 추가", "코스 입장", "전체 학생 채팅 금지", "채팅 안됨", "채팅이 안 돼요", "메시지 못 보내요", "메시지가 안 보내져요", "계정 위반", "신규 계정 제한", "학생 채팅 금지", "코스 메시지", "수업 후 평가 알림", "학습 리포트"],
    chatbotSummary: "왼쪽 메뉴의 [채팅]에서 코스를 누르면 그 반의 채팅방이 열립니다. 채팅창에서는 이모티콘, @태그, 화면 캡처, 파일 첨부(내 컴퓨터 또는 클래스인 드라이브), 연락처 공유, 최대 15분짜리 임시 교실 열기를 쓰고, 친구 추가는 [채팅] 안의 연락처 버튼에서 합니다. 가입 직후에는 메시지 보내기가 잠시 제한될 수 있고, 그래도 채팅이 안 써지면 선생님이 코스 관리에서 '전체 학생 채팅 금지'를 켜 두었는지 학원에 확인합니다. 선생님이 수업 후 평가를 마치면 코스 메시지로 알림과 학습 리포트가 옵니다.",
    sections: [
      {
        heading: "반 채팅방 열기",
        body: "[채팅]에는 내가 들어가 있는 코스마다 채팅방이 하나씩 있습니다. 코스 공지사항도 여기서 봅니다. 휴대폰 앱에서는 아래쪽 탭의 [채팅]을 누르면 같은 목록이 나옵니다. 채팅방에 보이는 내 이름은 닉네임이니, 선생님과 친구가 알아보도록 학원 양식을 지켜 주세요.",
        steps: [
          "경로: 왼쪽 메뉴 > [채팅]",
          "채팅 목록에서 이야기할 코스를 누르면 그 반 채팅방이 열립니다.",
          "채팅방 오른쪽 위 [코스 입장]을 누르면 그 코스 화면으로 바로 넘어갑니다.",
          "선생님이 수업 후 평가를 마치면 그 코스의 메시지로 알림이 옵니다. 여기서 그 수업의 학습 리포트와 선생님 평가를 확인합니다(6.0.8 이상).",
        ],
      },
      {
        heading: "채팅창 아이콘으로 하는 일",
        body: "메시지 입력창 아래 아이콘 줄에 기능이 모여 있습니다.",
        steps: [
          "이모티콘을 넣습니다.",
          "@를 입력하고 같은 코스에 있는 사람을 골라 부릅니다.",
          "가위 모양 아이콘으로 화면을 캡처해 보냅니다. 캡처할 때 클래스인 창을 숨기는 기능도 있습니다.",
          "폴더 아이콘으로 파일을 보냅니다. 내 컴퓨터의 파일과 클래스인 드라이브에 올려 둔 파일 둘 다 됩니다.",
          "클래스인 연락처를 다른 사람에게 공유합니다.",
          "15분짜리 임시 교실을 엽니다.",
        ],
      },
      {
        heading: "잠깐 만나서 묻고 싶을 때는 임시 교실",
        body: "글로 설명하기 어려운 질문은 임시 교실을 열어 선생님이나 친구와 온라인 교실에서 바로 만납니다. 임시 교실은 최대 15분 동안 열립니다.",
        steps: [
          "경로: 코스 채팅방 > 입력창 아래 아이콘 줄 > [임시 교실]",
          "수업 이름을 정하고, 참여 구성원에서 함께 들어올 사람을 고릅니다.",
          "만들면 고른 사람들이 자동으로 태그되고, 채팅방에 [수업 입장] 카드가 올라옵니다. 이 카드를 눌러 들어갑니다.",
        ],
      },
      {
        heading: "친구 추가와 연락처",
        body: "[채팅] 탭 안의 연락처 버튼을 누르면 친구 목록 창이 뜹니다. 여기서 친구 목록을 정리하고, 들어온 친구 신청을 수락하거나 거절합니다.",
        steps: [
          "경로: [채팅] > 연락처 버튼 > [+] > [친구 추가]",
          "상대방 아이디(휴대폰 번호 또는 이메일)를 입력해 찾습니다.",
          "상대방 아이디를 모르면 내 아이디의 QR 코드나 링크를 만들어 상대에게 보냅니다.",
        ],
      },
      {
        heading: "채팅이 안 될 때",
        body: "메시지가 안 써지거나 친구 추가가 안 되는 것이 학생 기기 문제가 아닌 경우가 있습니다. 가입 직후의 제한이나 선생님의 코스 설정 때문일 수 있습니다.",
        steps: [
          "가입한 지 얼마 안 된 계정은 메시지 보내기가 잠시 제한될 수 있습니다. 상대에게 '계정 위반'처럼 보여도 로그인과 수업 참여는 그대로 됩니다. 계속 막히면 학원이나 클래스인 상담 채널에 문의합니다.",
          "코스 채팅에 글이 안 써지면 선생님이 코스 관리에서 '전체 학생 채팅 금지'를 켜 두었을 수 있습니다. 채팅이 필요하면 학원에 물어봅니다.",
          "같은 반 친구를 친구로 추가할 수 없다면, 코스에서 구성원끼리 친구 추가를 허용했는지 선생님께 물어봅니다.",
          "채팅방이 목록에 아예 없으면 그 코스에 아직 들어가 있지 않은 것입니다. 코스 참여 방법부터 확인합니다.",
        ],
      },
    ],
    relatedSlugs: ["student-profile", "drive", "class-join-replay", "course-join"],
  },
  {
    slug: "todo-calendar",
    category: "student",
    title: "할 일 · 캘린더로 숙제와 수업 일정 챙기기",
    description: "숙제·시험 마감과 수업 날짜를 놓치지 않으려면 [할 일]과 [캘린더]를 봅니다. [할 일]은 마감이 가까운 순서로 오늘 할 일을 보여 주고, [캘린더]는 날짜별 일정을 보여 주며 개인 일정도 넣을 수 있습니다.",
    audience: "여러 코스의 숙제·시험 마감을 챙겨야 하는 학생",
    updatedAt: "2026-09-24",
    readMinutes: 3,
    tags: ["할 일", "캘린더", "일정관리"],
    keywords: ["할 일", "캘린더", "마감일", "과제", "시험", "수업 일정", "개인 일정", "다시보기", "할 일 알림", "필터", "수업 알림", "알림이 안 와요", "10분 전 알림", "푸시 알림", "방해 금지"],
    chatbotSummary: "[할 일]은 숙제와 시험을 마감이 가까운 순서로 보여 주고, 위쪽 드롭다운으로 코스나 활동 종류를 골라 볼 수 있습니다. [캘린더]는 수업 일정과 과제 마감일을 달력으로 보여 주며, 끝난 수업을 누르면 다시보기로, 학습 자료를 누르면 자료 화면으로 넘어갑니다. 오른쪽 위 [+]로 개인 일정을 넣고, 모바일 앱에서는 아래쪽 탭에서 [할 일]과 [캘린더]를 엽니다. 수업 알림은 시작 10분 전에 오며, 안 오면 휴대폰의 방해 금지 모드와 Classin 앱 알림 설정을 확인합니다.",
    sections: [
      {
        heading: "오늘 할 일은 [할 일]에서",
        body: "[할 일]은 지금을 기준으로 마감이 가까운 것부터 보여 줍니다. 숙제와 시험이 여러 코스에 흩어져 있어도 여기 한곳에 모입니다.",
        steps: [
          "경로: 왼쪽 메뉴 > [할 일]",
          "특정 코스나 활동 종류만 보고 싶으면 위쪽 드롭다운에서 고릅니다.",
          "맨 위 항목부터 처리합니다. 마감이 가장 가까운 순서입니다.",
        ],
      },
      {
        heading: "날짜로 보고 싶으면 [캘린더]",
        body: "[캘린더]에는 예정된 수업, 이미 끝난 수업, 과제 마감일이 달력에 표시됩니다. 일정을 누르면 자세한 화면으로 넘어갑니다. 끝난 수업은 다시보기 화면으로, 학습 자료는 자료 보기 화면으로 열립니다.",
        steps: [
          "경로: 왼쪽 메뉴 > [캘린더]",
          "확인할 날짜의 일정을 누릅니다.",
          "학원 밖 일정도 같이 적어 두려면 오른쪽 위 [+]를 눌러 개인 일정을 추가합니다.",
        ],
      },
      {
        heading: "휴대폰에서 볼 때",
        body: "클래스인 앱 아래쪽 탭에 [할 일]과 [캘린더]가 있습니다. 휴대폰과 태블릿에서도 PC와 같은 일정이 보이니, 밖에서는 앱으로 확인하면 됩니다.",
      },
      {
        heading: "[할 일]에서 바로 수업과 숙제로",
        body: "[할 일]에서 목록만 보고 끝낼 필요는 없습니다. 항목에서 바로 수업에 들어가거나 숙제를 냅니다.",
        steps: [
          "실시간 수업은 [할 일]이나 코스 화면의 [교실 입장] 버튼으로 들어갑니다. 학생은 수업 시작 10분 전부터 들어갈 수 있습니다.",
          "숙제는 [숙제하기], 일일 과제는 [제출하기], 시험은 [응시하기]를 누릅니다.",
          "낸 활동의 점수와 선생님 피드백은 코스의 [성적]에서 봅니다.",
        ],
      },
      {
        heading: "찾는 일정이 안 보일 때",
        body: "있어야 할 숙제나 수업이 목록에 없으면 아래를 차례로 봅니다.",
        steps: [
          "위쪽 드롭다운이 특정 코스나 활동 종류로 좁혀져 있지 않은지 확인합니다.",
          "그 코스에 아직 들어가 있지 않으면 일정도 나오지 않습니다. 홈의 코스 목록에 그 반이 있는지 봅니다.",
          "일일 과제는 선생님이 정한 날짜가 되어야 새로 올라옵니다.",
          "코스 화면 오른쪽의 [할 일 알림]에도 그 코스에서 마감이 가까운 일이 따로 뜹니다.",
        ],
      },
      {
        heading: "수업 알림이 안 올 때",
        body: "학생으로 등록된 수업은 시작 10분 전에 앱 알림이 옵니다. 알림이 올 때도 있고 안 올 때도 있다면 휴대폰 설정부터 봅니다.",
        steps: [
          "경로: 휴대폰 설정 > 앱 > Classin > 알림",
          "휴대폰의 방해 금지 모드가 켜져 있지 않은지 확인합니다.",
          "Classin 앱 알림이 꺼져 있으면 켭니다.",
          "그래도 안 오면 앱을 지웠다가 다시 설치하고, 권한을 묻는 창이 뜨면 모두 허용합니다.",
        ],
      },
    ],
    relatedSlugs: ["class-join-replay", "course-submit-activity", "course-grades"],
  },
  {
    slug: "course-join",
    category: "student",
    title: "코스 - 코스 참여하기",
    description: "새 학기나 새 반을 시작할 때 봅니다. 학원이 보내 준 초대 링크, QR 코드, 코스 검색으로 반(코스)에 들어가고, 들어가지지 않으면 로그인한 아이디와 선생님의 코스 가입 허용 여부부터 확인합니다.",
    audience: "새 학기·새 반을 시작하는 학생과 학부모",
    updatedAt: "2026-09-24",
    readMinutes: 5,
    featured: true,
    tags: ["코스", "참여", "검색"],
    keywords: ["코스", "코스 참여", "코스 검색", "학습 공간", "실시간 수업", "녹화 수업", "숙제", "초대 링크", "QR 코드", "코스 ID", "코스 가입", "코스 가입 허용", "코스 나가기", "대리 등록", "초대 수락", "초대 링크 눌렀는데", "코스가 안 보여요", "학원에 등록 요청", "코스 등록", "수업 신청했는데", "돋보기", "역할 선택"],
    chatbotSummary: "코스는 클래스인 안의 반입니다. 학원이 학생을 코스에 직접 넣어 두었다면 로그인만 하면 홈의 코스 목록에 보이고, 아니라면 학원이 보낸 초대 링크, QR 코드(모바일 앱 홈 오른쪽 위 [+] > [QR 코드 스캔]), 화면 위쪽 돋보기 버튼의 코스 검색으로 들어갑니다. 코스가 안 보이면 학원에 등록된 아이디로 로그인했는지, 받은 코스 초대를 눌러 수락했는지 확인하고, 링크나 QR로 가입이 안 되면 선생님이 코스 관리에서 '코스 가입 허용'을 켜야 합니다. 코스에 학생을 등록하는 일은 학원만 할 수 있으니 코스가 아예 없으면 학원에 요청합니다.",
    sections: [
      {
        heading: "코스는 클래스인 안의 '반'입니다",
        body: "코스 하나가 반 하나입니다. 실시간 수업 입장, 끝난 수업 다시보기, 숙제와 시험, 성적 확인이 그 코스 안에서 이어집니다. 한 번 들어가 두면 학기 내내 같은 자리에서 수업을 따라가면 되니, 새 학기에 가장 먼저 할 일이 코스 참여입니다.",
      },
      {
        heading: "이미 들어가 있는지 먼저 보세요",
        body: "학원이 학생을 코스에 직접 넣어 두는 경우도 있습니다. 그렇다면 따로 참여할 필요가 없습니다. 코스에 학생을 등록하는 일은 수업을 운영하는 학원만 할 수 있습니다. 학원 수업을 신청했는데 코스가 없다면 학원 담당자에게 등록을 요청하세요.",
        steps: [
          "학원에 등록한 아이디(휴대폰 번호 또는 이메일)로 클래스인에 로그인합니다. 휴대폰 번호는 국가번호 +82를 고르고, 010의 맨 앞 0을 빼고 10부터 입력합니다.",
          "코스 초대를 받았다면 눌러서 수락합니다. 로그인한 뒤 초대를 누르지 않으면 코스와 수업이 보이지 않을 수 있습니다.",
          "홈의 코스 목록에서 [학생] 탭을 누르고 내 반 이름이 있는지 봅니다.",
          "처음 로그인할 때 역할을 고르는 화면이 나오면 학생을 고릅니다. 가입한 코스가 없으면 홈에서 코스에 참여하는 경로가 안내됩니다(6.0.7 이상).",
          "학원이 계정을 대신 만들어 준 경우에는 문자나 이메일로 임시 비밀번호가 옵니다. 그 아이디로 로그인한 뒤 비밀번호를 바꿉니다.",
          "목록에 반이 없으면 아래 방법 가운데 학원이 보내 준 것으로 들어갑니다.",
        ],
      },
      {
        heading: "초대 링크를 받았다면",
        body: "문자나 메신저로 받은 링크를 누르면 클래스인이 열리고 코스 참여 화면으로 넘어갑니다. 로그인 화면이 먼저 뜨면 학원에 등록된 내 아이디로 로그인한 뒤 링크를 다시 누릅니다.",
      },
      {
        heading: "QR 코드를 받았다면",
        body: "QR 코드는 휴대폰의 클래스인 앱으로 찍습니다.",
        steps: [
          "경로: 앱 홈 오른쪽 위 [+] > [QR 코드 스캔]",
          "학원이 준 QR 코드를 비춥니다.",
          "코스 정보 화면이 뜨면 반 이름과 담임 선생님이 맞는지 확인합니다.",
          "아래쪽 초록색 [코스 가입] 버튼을 누릅니다.",
        ],
        media: [
          {
            type: "image",
            src: "/docs/files/cs-figma/frame-24.png",
            alt: "모바일 앱 홈 오른쪽 위 + 메뉴에서 QR 코드 스캔을 고른 뒤, 코스 정보 화면 아래의 코스 가입 버튼을 누르는 3단계 화면",
            caption: "휴대폰 앱에서 QR 코드로 코스에 가입하는 순서",
            width: 1440,
            height: 6325,
          },
        ],
      },
      {
        heading: "검색해서 들어가기",
        body: "링크나 QR 없이 코스를 검색해서 들어갈 수도 있습니다. 초대 링크를 복사하면 코스 ID도 함께 복사되니, 학원에서 코스 ID를 받았다면 그것으로 찾는 것이 정확합니다.",
        steps: [
          "경로: 화면 위쪽(다이내믹 아일랜드) 돋보기 버튼 > 검색창",
          "검색창에 학원이 알려 준 코스를 검색합니다.",
          "찾은 코스가 우리 반이 맞는지 반 이름과 선생님을 확인한 뒤 참여합니다.",
          "휴대폰 앱에서는 홈 오른쪽 위 [+]를 누른 뒤 [코스 가입]을 고릅니다.",
        ],
      },
      {
        heading: "들어가지지 않을 때",
        body: "링크나 QR을 눌러도 가입이 안 되거나 코스가 보이지 않으면 위에서부터 확인합니다.",
        steps: [
          "로그인한 아이디가 학원에 등록한 휴대폰 번호나 이메일과 같은지 봅니다. 자동 로그인 때문에 예전 이메일 계정이나 새로 만든 계정으로 들어가 있으면 학원이 넣어 둔 코스가 보이지 않습니다. 이때는 로그아웃하고 등록된 아이디로 다시 로그인합니다.",
          "받은 코스 초대를 눌러 수락했는지 확인합니다.",
          "링크나 QR로 가입이 안 되면 선생님께 알려 주세요. 선생님이 코스 관리에서 '코스 가입 허용'을 켜 두어야 링크와 QR로 들어옵니다.",
          "비슷한 이름의 다른 반에 들어가지 않았는지 반 이름과 담임 선생님을 다시 봅니다.",
          "그래도 안 되면 보이는 화면과 로그인한 아이디를 캡처해 학원에 보냅니다.",
        ],
      },
      {
        heading: "학원에 물어볼 때 보낼 문구",
        body: "학생이나 학부모가 학원에 그대로 보내도 되는 문구입니다. ○○ 부분만 바꿔 주세요.\n\n> 안녕하세요, ○○반 ○○○입니다. 클래스인 코스에 들어가려는데 가입이 되지 않습니다.\n> 로그인한 아이디는 ○○○입니다. 초대 링크나 QR 코드를 한 번 더 보내 주실 수 있을까요?",
      },
      {
        heading: "코스에 들어간 뒤 첫 수업 전에",
        body: "코스 왼쪽에서 [과정]을 고르면 수업, 숙제, 시험이 순서대로 보입니다. 오른쪽에는 구성원, 공지사항, 채팅, 할 일 알림이 있습니다.",
        steps: [
          "예정된 첫 수업의 날짜와 시간을 확인합니다.",
          "공지사항에 첫 수업 안내가 올라와 있는지 봅니다.",
          "여러 반을 듣는다면 반마다 같은 방법으로 들어가 둡니다.",
        ],
      },
      {
        heading: "코스에서 나가려면",
        body: "PC는 코스 이름을, 휴대폰은 코스 정보 오른쪽 화살표(>)를 누르면 코스 설정이 열리고, 그 아래쪽에 [코스 나가기]가 있습니다. 다만 수업이 들어 있는 코스는 학생이 직접 나갈 수 없고, 선생님이나 학원 관리자가 코스에서 빼 주어야 합니다. 코스 안 수업이 끝난 지 60일이 지나면 학생이 직접 나갈 수 있습니다.",
      },
    ],
    relatedSlugs: ["login-troubleshooting", "class-join-replay", "course-submit-activity", "course-grades", "student-profile"],
  },
  {
    slug: "class-join-replay",
    category: "student",
    title: "수업 - 수업 참여하기 & 다시보기",
    description: "실시간 수업은 시작 10분 전부터 들어갈 수 있습니다. 입장 방법과 카메라·마이크 확인, 끝난 수업 다시보기, 그리고 수업이 안 보이거나 목소리가 안 들리거나 자꾸 끊길 때 먼저 볼 것까지 있습니다.",
    audience: "실시간 수업에 들어가거나 끝난 수업을 다시 보려는 학생, 자녀의 수업 참여를 돕는 학부모",
    updatedAt: "2026-09-24",
    readMinutes: 7,
    featured: true,
    tags: ["수업", "실시간", "다시보기", "녹화"],
    keywords: ["수업 참여", "다시보기", "녹화 수업", "다이내믹 아일랜드", "카메라", "마이크", "스피커", "왕관", "칠판", "다이나믹 아일랜드", "교실 입장", "10분 전 입장", "다시보기 기간", "소리 없음", "마이크 안됨", "수업 입장 안됨", "수업이 안 보여요", "교실이 안 보여요", "입장 못해요", "혼자만 들어가 있어요", "다른 계정으로 로그인", "수업 목록이 없어요", "목소리 안 들려요", "학생 소리 안 들림", "소리가 작아요", "마이크 권한", "외장 마이크", "이어폰", "웅웅거려요", "기기 테스트", "마이크 검사", "튕겨요", "끊겨요", "수업에서 나가져요", "핫스팟", "화면 깨짐", "느려요", "작업 관리자", "해외 수업", "해외 접속", "VPN", "수업화면 녹화", "라이브 현장녹화"],
    chatbotSummary: "학생은 수업 시작 10분 전부터 들어갈 수 있습니다. 화면 위쪽 다이내믹 아일랜드, 코스나 [할 일]의 [교실 입장] 버튼, 수업 시작 알림 가운데 하나로 들어가고, 입장 전 창에서 카메라·마이크·스피커를 고릅니다. 수업이 안 보이면 학원에 등록된 아이디(휴대폰 번호는 +82 뒤 10부터)로 로그인했는지와 코스 초대를 수락했는지 먼저 보고, 목소리가 안 들리면 스테이지에 올라가 있는지와 선생님이 마이크 권한을 줬는지 확인합니다. 자꾸 끊기면 공유기 재시작, 핫스팟 연결, 기기 1대만 로그인을 해 보고, 다시보기가 안 보이면 녹화 여부와 학원이 정한 다시보기 기간을 확인합니다.",
    sections: [
      {
        heading: "수업에 들어가는 세 가지 방법",
        body: "학생은 수업 시작 10분 전부터 들어갈 수 있고, 그때 앱 알림도 옵니다. 아래 가운데 편한 곳에서 들어가면 됩니다.",
        steps: [
          "화면 위쪽 다이내믹 아일랜드를 누르면 곧 시작하거나 진행 중인 수업으로 들어갑니다.",
          "코스 화면이나 [할 일]에서 그 수업의 [교실 입장] 버튼을 누릅니다.",
          "수업 시작 때 뜨는 알림 팝업에서 입장 버튼을 누릅니다.",
        ],
      },
      {
        heading: "들어가기 전에 카메라·마이크·스피커 고르기",
        body: "입장하면 장비 확인 창이 먼저 뜹니다. 드롭다운마다 실제로 쓸 장비가 골라져 있는지 보고 들어갑니다.",
        steps: [
          "카메라 드롭다운에서 쓸 카메라를 고르고, 미리보기에 내 얼굴이 나오는지 봅니다.",
          "마이크 드롭다운에서 쓸 마이크를 고릅니다. 말할 때 소리 막대가 움직이면 됩니다.",
          "스피커 드롭다운에서 소리가 나올 장치를 고릅니다.",
          "수업 중에 바꾸려면 화면 위쪽 버튼이나 오른쪽 위 톱니바퀴(설정)를 누릅니다.",
          "수업 전에 미리 해 보려면 PC 왼쪽 아래 프로필 > [계정 및 설정] > [기기 테스트]에서 확인합니다.",
        ],
        media: [
          {
            type: "image",
            src: "/docs/files/cs-figma/클래스인-교실-내-카메라-마이크-설정-확인-pc.png",
            alt: "클래스인 교실 설정 창에서 마이크 소리 막대와 카메라 미리보기, 기기 드롭다운을 확인하는 PC 화면",
            caption: "교실 설정 창에서 카메라·마이크·스피커를 확인하는 PC 화면",
            width: 2330,
            height: 5213,
          },
        ],
      },
      {
        heading: "선생님이 권한을 주면 생기는 왕관",
        body: "선생님이 권한을 주면 내 카메라 화면 오른쪽 위에 왕관 표시가 나타납니다. 이때부터 칠판 판서에 참여하고, 오른쪽에 있는 상호작용 도구도 쓰게 됩니다. 칠판에 풀이를 써야 하는데 왕관이 없다면 선생님께 권한을 부탁합니다.",
      },
      {
        heading: "끝난 수업 다시 보기",
        body: "내가 학생으로 추가된 수업은 녹화가 켜져 있으면 끝난 뒤에 다시 봅니다. 학원이 다시보기 기간을 정해 두었다면 그 기간 안에서만 열립니다. 코스에 들어가 끝난 수업을 누르거나, [캘린더]에서 끝난 수업을 누르면 다시보기 화면이 열립니다. 녹화 설정에 따라 칠판·자료·교실 화면을 담은 '수업화면 녹화'와, 실제 교실을 카메라로 찍은 '라이브 현장녹화' 가운데 골라서 봅니다.",
      },
      {
        heading: "수업이 안 보이거나 입장이 안 될 때",
        body: "로그인했는데 수업이 안 보이거나, 선생님과 각자 다른 교실에 혼자 들어가 있는 일이 있습니다. 로그인한 아이디부터 확인하세요.",
        steps: [
          "수업 시작 10분 전보다 이르면 아직 들어갈 수 없습니다. 시간이 되면 다시 누릅니다.",
          "프로필(PC는 왼쪽 아래, 휴대폰 앱은 왼쪽 위)을 눌러 지금 로그인한 아이디가 학원에 등록된 아이디인지 봅니다. 자동 로그인 때문에 예전 이메일 계정이나 새로 만든 계정으로 들어가 있는 경우가 있습니다.",
          "아이디가 다르면 로그아웃하고 등록된 아이디로 다시 로그인합니다. 휴대폰 번호는 국가번호 +82를 고르고, 010의 맨 앞 0을 빼고 10부터 입력합니다.",
          "새로 만든 계정으로 수업을 직접 만들면 선생님과 다른 교실에 혼자 들어가게 됩니다. 수업은 학원이 만든 수업으로 들어갑니다.",
          "코스 초대를 받았다면 눌러서 수락했는지 확인합니다. 초대를 누르지 않으면 코스와 수업이 보이지 않을 수 있습니다.",
          "앱이 오래된 버전이면 최신 버전으로 업데이트합니다. PC는 왼쪽 아래 프로필 > [계정 및 설정] > [소프트웨어 정보]에서 [업그레이드]를 누릅니다.",
        ],
      },
      {
        heading: "선생님이 내 목소리가 안 들린다고 할 때",
        body: "기기 테스트에서는 괜찮았는데 수업에서만 소리가 안 들린다면 스테이지와 마이크 권한부터 봅니다. 학생은 교실 위쪽 스테이지에 올라가 있어야 카메라와 마이크를 쓸 수 있고, 스테이지에 없으면 둘 다 꺼집니다. 스테이지에 올라가도 선생님이 마이크 권한을 주지 않으면 마이크는 꺼져 있습니다.",
        steps: [
          "내가 스테이지에 올라가 있는지, 화면 아래 마이크 아이콘이 초록색(켜짐)인지 봅니다. 아니라면 선생님께 스테이지와 마이크 권한을 부탁합니다.",
          "마이크 드롭다운이 '사용 안 함'으로 되어 있으면 실제로 쓰는 마이크로 바꿉니다.",
          "소리가 작으면 노트북 내장 마이크 대신 줄 이어폰이나 무선 이어폰 같은 별도 마이크를 씁니다. 내장 마이크는 소리를 잘 잡지 못할 때가 있습니다.",
          "PC는 왼쪽 아래 프로필 > [계정 및 설정] > [기기 테스트] > [마이크 검사]에서 마이크 볼륨을 올립니다.",
          "안드로이드 앱에는 마이크 입력 볼륨을 조절하는 메뉴가 없습니다. 휴대폰 볼륨을 끝까지 올렸다면 그건 스피커 볼륨일 수 있으니, 외장 마이크를 연결해 봅니다.",
          "'소리 없음' 경고가 계속 뜨면 기기 설정에서 클래스인의 마이크·카메라 사용을 허용했는지 확인합니다.",
          "소리가 웅웅거리거나 교재 음원이 한쪽에만 안 들리면 앱을 최신 버전으로 업데이트합니다.",
        ],
      },
      {
        heading: "수업 중에 튕기거나 끊길 때",
        body: "수업 중에 계속 튕겨 나가거나 말이 자주 끊긴다면, 가장 흔한 원인은 학생 쪽 인터넷이 불안정한 것입니다.",
        steps: [
          "공유기를 껐다 켜고, 기기를 와이파이 공유기 가까이 둡니다.",
          "다른 인터넷이나 휴대폰 핫스팟(4G 이상)으로 다시 들어가 봅니다.",
          "수업에는 기기 1대만 로그인합니다.",
          "클래스인 말고 켜 둔 프로그램과 인터넷 창을 닫습니다. 화면이 깨지거나 느리면 윈도우에서 Ctrl+Shift+Esc로 작업 관리자를 열어 CPU를 많이 쓰는 항목을 끕니다.",
          "수업 시간이 끝나 수업이 닫히면서 같이 나가진 것일 수도 있으니 수업 종료 시각도 확인합니다.",
        ],
      },
      {
        heading: "다시보기가 안 보일 때",
        body: "다시보기가 보이는지는 녹화 여부와 학원 설정에 달려 있습니다. 학생이 바꿀 수 있는 설정이 아니니, 아래를 확인한 뒤 학원에 알려 주세요.",
        steps: [
          "그 수업에서 녹화를 하지 않았다면 다시보기가 없습니다.",
          "학원이 코스마다 다시보기 기간을 정해 두기도 합니다. 정해진 날짜가 지났거나, 수업이 끝나고 정한 날수가 지나면 다시보기가 닫힙니다.",
          "수업이 끝난 뒤에 코스에 들어왔다면 그 전 수업은 보이지 않을 수 있습니다. 학원이 설정을 켠 뒤에도 코스에서 나갔다가 다시 들어와야 보이는 경우가 있습니다.",
          "학원이 설정을 바꿨다고 하면 새로고침하거나 다시 로그인해 봅니다.",
        ],
      },
      {
        heading: "학원이나 상담 채널에 알릴 때",
        body: "위를 다 해도 안 되면 아래 정보를 함께 보내 주세요. 수업 이름과 시각을 알려 주면 상담에서 그 수업 정보로 원인을 더 빨리 확인합니다.",
        steps: [
          "수업 이름(앱에 보이는 그대로)",
          "문제를 겪은 사람의 클래스인 아이디",
          "수업 날짜와 시작 시각",
          "문제가 보이는 화면 캡처나 영상",
        ],
      },
      {
        heading: "해외에서 수업을 들을 때",
        body: "중국, 필리핀, 싱가포르 같은 해외에서도 VPN 없이 로그인, 학습 활동, 수업 입장이 대부분 됩니다. 다만 외부 프로그램을 막는 보안 내부망이나, 앱의 카메라·마이크 접근을 막아 둔 기기에서는 제한될 수 있습니다.",
      },
      {
        heading: "학부모님이 아이에게 보낼 안내",
        body: "처음 실시간 수업을 듣는 아이에게 아래 문구를 그대로 보내셔도 됩니다.\n\n> 학원에서 받은 아이디로 로그인해야 수업이 보여. 수업 시작 10분 전부터 들어갈 수 있고, 화면 위쪽 다이내믹 아일랜드나 [할 일]에서 입장 버튼을 누르면 돼.\n> 들어가기 전에 뜨는 창에서 카메라, 마이크, 스피커가 맞게 골라졌는지 보고 들어가. 선생님 목소리가 안 들리면 스피커부터 확인해.",
      },
    ],
    relatedSlugs: ["class-connection-troubleshooting", "login-troubleshooting", "class-report", "course-join", "course-submit-activity", "lesson-option-concepts"],
  },
  {
    slug: "class-report",
    category: "student",
    title: "수업 - 학습 보고서 보기",
    description: "수업이 끝나면 학습 보고서가 자동으로 만들어집니다. 끝난 수업의 [학습 보고서] 탭에서 Highlights, 판서, 수업 자료를 열어 그날 수업을 복습합니다.",
    audience: "그날 수업을 복습하려는 학생",
    updatedAt: "2026-09-24",
    readMinutes: 3,
    tags: ["학습 보고서", "복습", "판서"],
    keywords: ["학습 보고서", "Highlights", "수업 화면 캡처", "판서", "수업 자료", "복습", "복습 루틴", "다시보기", "학습 보고서 탭", "출석", "참여도", "판서 어디서 봐요", "수업 판서 확인", "칠판 내용 다시 보기", "코스 메시지", "수업 후 평가 알림", "학습 리포트", "교사 평가"],
    chatbotSummary: "수업이 끝나면 학습 보고서가 자동으로 만들어집니다. 코스에서 끝난 수업을 열고 위쪽 [학습 보고서] 탭을 누르면, 수업 화면을 1분마다 저장한 Highlights 이미지, 선생님이 칠판에 쓴 판서, 수업 자료, 출석과 참여 기록이 나옵니다. 선생님이 수업 후 평가를 마치면 코스 메시지로 알림이 오고 거기서도 학습 리포트와 선생님 평가를 봅니다. Highlights는 1분 간격 장면이라 그 사이 설명은 빠져 있으니, 이해가 안 되는 부분은 다시보기로 채웁니다.",
    sections: [
      {
        heading: "학습 보고서에 들어 있는 것",
        body: "학습 보고서는 수업이 끝나면 자동으로 만들어집니다. 수업 중에 필기하거나 화면을 캡처하지 않아도 그날 수업이 한곳에 남습니다.",
        steps: [
          "Highlights는 온라인 교실 화면을 1분마다 저장한 이미지입니다. 수업이 끝나면 수업 구성원 전원에게 똑같이 제공됩니다.",
          "판서에는 선생님이 칠판 구역에 쓴 내용이 쓴 그대로 남습니다.",
          "수업 중에 띄운 수업 자료도 함께 붙어 있어 따로 찾지 않아도 됩니다.",
          "출석 기록과 수업 참여 정도(스테이지에 오른 시간, 말한 시간 등)도 나옵니다. 참여 정도는 같은 반 친구들과 비교한 비율로 표시됩니다.",
        ],
      },
      {
        heading: "보고서 여는 방법",
        body: "보고서는 끝난 수업 화면 안에 있습니다. 선생님이 수업 후 평가를 마치면 코스 메시지로 알림이 오고, 그 메시지에서도 이번 수업의 학습 리포트와 선생님 평가를 바로 확인합니다(6.0.8 이상).",
        steps: [
          "경로: 코스 > 끝난 수업 > [학습 보고서] 탭",
          "수업 화면 위쪽에는 [수업 정보], [수업 평가], [학습 보고서] 탭이 있습니다. 아직 끝나지 않은 수업에는 보고서가 없습니다.",
          "판서는 좌우 화살표로 페이지를 넘기며 봅니다.",
          "보고서 글자가 영어로 나오면 오른쪽 위 언어 선택 메뉴를 확인합니다.",
        ],
      },
      {
        heading: "보고서로 복습하는 순서",
        body: "수업 당일이나 다음 날, 기억이 남아 있을 때 이 순서로 봅니다.",
        steps: [
          "Highlights를 넘기며 오늘 무엇을 어떤 순서로 배웠는지 먼저 떠올립니다.",
          "판서에서 이해가 안 됐던 풀이를 찾아 표시해 둡니다.",
          "표시한 부분을 수업 자료의 설명·예제와 맞춰 보며, 왜 그렇게 되는지 스스로 말로 설명해 봅니다.",
          "그래도 모르겠는 부분은 적어 두었다가 다시보기로 그 장면을 다시 듣거나, 채팅이나 다음 수업에서 선생님께 묻습니다.",
        ],
      },
      {
        heading: "보고서만으로는 부족한 부분",
        body: "Highlights는 1분 간격으로 찍은 장면이라 그 사이에 선생님이 한 설명은 빠져 있습니다. 보고서 아래에도 이 보고서가 학습 결과를 전부 담지는 않는다는 안내가 있습니다. 설명을 다시 들어야 하는 부분은 다시보기로 채우세요.",
      },
      {
        heading: "보고서가 안 보일 때",
        body: "보고서는 수업이 끝난 뒤에 만들어집니다. 아직 시작하지 않았거나 진행 중인 수업에는 없습니다. 끝난 수업인데도 [학습 보고서] 탭이 없거나 비어 있으면 선생님이나 학원에 물어봅니다.",
      },
    ],
    relatedSlugs: ["class-join-replay", "course-grades", "course-submit-activity"],
  },
  {
    slug: "course-submit-activity",
    category: "student",
    title: "코스 - 학습 활동 제출하기",
    description: "녹화 수업, 숙제, 일일 과제, 시험, OMR 카드, 토론, 학습 자료, AI 스피킹은 활동마다 누르는 버튼과 내는 순서가 다릅니다. 휴대폰으로 숙제 사진을 올리는 방법과 제출이 안 될 때 확인할 것도 있습니다.",
    audience: "코스에 올라온 숙제·시험을 직접 내야 하는 학생",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    tags: ["학습 활동", "숙제", "시험", "토론", "AI 스피킹"],
    keywords: ["녹화 수업", "숙제", "일일 과제", "시험", "OMR", "토론", "학습 자료", "AI 스피킹", "제출", "피드백", "숙제하기", "시청하기", "응시하기", "자료 확인", "나의 참여 내역", "과제 제출 내역", "숙제 역사", "숙제 업로드", "숙제 안 올라감", "숙제 다시 제출", "중복 제출", "첨삭", "AI 채점", "사진 숙제 채점", "숙제 화면 밀림", "줄간격", "숙제 표시 오류", "따라읽기", "영어 따라읽기", "다시 읽기"],
    chatbotSummary: "코스의 [과정]에서 활동마다 누르는 버튼이 다릅니다. 녹화 수업은 [시청하기], 숙제는 [숙제하기](모바일은 [제출하기]), 일일 과제와 AI 스피킹은 [제출하기], 시험과 OMR 카드는 [응시하기], 토론은 [토론하기], 학습 자료는 [자료 확인]을 누릅니다. 숙제는 사진·음성 녹음·PDF로 내고 제출 뒤에도 고칠 수 있지만, 고치면 선생님이 준 점수와 피드백이 지워지고 여러 번 내면 마지막 제출본만 남습니다.",
    sections: [
      {
        heading: "코스에서 활동 찾기",
        body: "숙제와 시험은 코스 안 [과정]에 올라옵니다. 마감이 가까운 활동은 [할 일]에도 모여 있습니다. 활동마다 누르는 버튼이 다르니 아래에서 내 활동을 찾아보세요. 낸 뒤에는 점수, 피드백, 지금까지 낸 기록을 같은 곳에서 다시 봅니다.",
      },
      {
        heading: "녹화 수업 시청하기",
        body: "선생님이 올린 영상을 원하는 시간에 봅니다. 선생님 설정에 따라 볼 수 있는 횟수나 배속이 제한될 수 있습니다.",
        steps: [
          "[과정]에서 [녹화 수업]의 [시청하기]를 누릅니다.",
          "본 기록은 바로 반영됩니다. [나의 참여 내역]에서 시청 완료율과 누적 시청 시간을 확인합니다.",
          "토론이 켜진 영상은 아래에 댓글을 남깁니다. 선생님이나 친구가 답글을 달거나 좋아요를 누르기도 합니다.",
        ],
      },
      {
        heading: "숙제 제출하기",
        body: "숙제는 사진, 음성 녹음, PDF 파일로 냅니다. PC, 태블릿, 휴대폰 어디서든 낼 수 있고, 점수나 피드백이 달리면 알림이 옵니다.",
        steps: [
          "[과정]에서 [숙제]의 [숙제하기]를 누릅니다.",
          "사진, 음성 녹음, PDF 파일을 올리고 제출 버튼을 누릅니다.",
          "선생님이 쓴 숙제 설명이 필요하면 아래쪽 [숙제 내용 불러오기]로 복사해 옵니다.",
          "낸 숙제는 고칠 수 있습니다. 다만 고치면 선생님이 준 점수와 피드백이 지워집니다.",
          "여러 번 내도 마지막으로 낸 것만 남고, 이전 제출본은 다시 볼 수 없습니다.",
          "선생님 피드백은 숙제 위에 빨간색으로 직접 첨삭되거나, 피드백 칸의 코멘트로 옵니다.",
          "선생님이 AI 채점을 켜 둔 숙제는 제출하면 AI가 자동으로 평가하고, 잠시 뒤 결과가 나옵니다. 이 AI 평가는 학생도 봅니다.",
        ],
      },
      {
        heading: "휴대폰으로 숙제 사진 올리기",
        body: "휴대폰 앱에서는 [숙제하기] 대신 [제출하기] 버튼이 보입니다.",
        steps: [
          "앱에서 숙제가 있는 코스를 고릅니다.",
          "숙제를 열고 [제출하기]를 누릅니다.",
          "제출 화면 가운데의 [제출하기]를 한 번 더 눌러 작성을 시작합니다.",
          "아래쪽 사진 아이콘을 눌러 찍은 사진이나 앨범 사진을 붙입니다.",
          "붙인 사진을 확인하고 제출을 마칩니다. 제출이 끝나면 [숙제 역사]가 보이고, 채점이 되면 점수가 나옵니다.",
        ],
        media: [
          {
            type: "image",
            src: "/docs/files/cs-figma/숙제-업로드-모바일.png",
            alt: "모바일 앱에서 코스를 골라 숙제의 제출하기를 누르고, 아래쪽 사진 아이콘으로 사진을 붙여 제출하는 4단계 화면",
            caption: "휴대폰에서 코스를 고르고 [제출하기], 사진 첨부, 숙제 제출 순서로 내는 화면",
            width: 1440,
            height: 1974,
          },
        ],
      },
      {
        heading: "일일 과제 제출하기",
        body: "일일 과제는 선생님이 정한 날짜마다 자동으로 올라옵니다. 정해진 날짜, 추가 제출 기간, 제출 횟수에 맞춰 꾸준히 냅니다.",
        steps: [
          "[과정]에서 [일일 과제]의 [제출하기]를 누릅니다.",
          "낸 뒤 선생님의 점수와 피드백을 확인합니다.",
          "위쪽 [과제 제출 내역]에서 지금까지 낸 기록과 평균 점수, 등수를 봅니다.",
          "선생님 설정에 따라 추가로 내거나 친구의 과제를 볼 수도 있습니다.",
        ],
      },
      {
        heading: "시험 응시하기",
        body: "시험은 되도록 PC, 노트북, 태블릿처럼 화면이 큰 기기로 봅니다. 기기에 따라 시험 화면이 가로나 세로로 나옵니다.",
        steps: [
          "[과정]에서 볼 시험의 [응시하기]를 누릅니다.",
          "시험 중에는 남은 시간, 답한 문제 수, 문제 설명이 화면에 나옵니다.",
          "제출한 뒤 [과정]에서 그 시험을 다시 누르면 걸린 시간과 성적, 틀린 문제, 오답 비율이 나옵니다.",
        ],
      },
      {
        heading: "OMR 카드 응시하기",
        body: "실제 OMR 카드처럼 따로 마련된 답안 칸에 답을 입력하는 시험입니다. 이것도 화면이 큰 기기로 보는 편이 편합니다.",
        steps: [
          "[과정]에서 [OMR 카드]의 [응시하기]를 누릅니다.",
          "PDF나 MP3 파일이 붙어 있으면 함께 보고 들으며 답을 입력합니다.",
          "끝나면 틀린 문제, 점수, 정답률을 확인합니다.",
        ],
      },
      {
        heading: "토론 참여하기",
        body: "선생님이 올린 주제나 자료를 두고 의견을 남기고, 친구 의견에 댓글과 좋아요를 다는 활동입니다. 글과 함께 이미지, 음성 녹음, 파일을 붙여도 됩니다. 선생님이 참여 기한을 정해 두었을 수 있으니 기한도 봅니다.",
        steps: [
          "[토론]의 [토론하기]를 누릅니다.",
          "의견이나 댓글을 씁니다.",
          "내 글에 답글이 달리면 클래스인 알림으로 알려 줍니다.",
        ],
      },
      {
        heading: "학습 자료 보기",
        body: "선생님이 올린 PDF, 이미지, 수업 판서를 봅니다. 자료를 열면 [나의 참여 내역]에 본 기록이 자동으로 남습니다.",
        steps: [
          "[학습 자료]의 [자료 확인]을 누릅니다.",
          "내려받기가 허용된 자료는 자료 창 아래 [다운로드] 버튼으로 저장합니다. 버튼이 없으면 선생님이 내려받기를 열어 두지 않은 자료입니다.",
        ],
      },
      {
        heading: "따라읽기(AI 스피킹) 참여하기",
        body: "선생님이 만든 문장을 듣고 따라 읽으면 AI가 발음과 유창함을 평가해 점수를 줍니다. 주변 소리가 섞이지 않게 조용한 곳에서 하세요. 중간에 멈췄다가 이어서 해도 됩니다.",
        steps: [
          "[AI 스피킹]의 [제출하기]를 눌러 시작합니다.",
          "왼쪽에 읽을 문장이 나옵니다. 아래 스피커 버튼으로 원어민 음성을 듣습니다.",
          "가운데 초록색 마이크 버튼을 눌러 녹음하고, [다음]을 눌러 다음 문장으로 넘어갑니다.",
          "다시 읽고 싶은 문장은 제출 전에 그 문장을 눌러 다시 녹음합니다. 6.0.8 이상에서는 다시 읽거나 고칠 카드·문장을 직접 골라 그 부분만 다시 연습합니다.",
          "문장을 다 읽으면 오른쪽 아래 [제출하기]를 누릅니다. 문장별 점수와 평가가 나오고, [학생 녹음 파일 재생] 아이콘으로 내 목소리를 들어 봅니다.",
        ],
      },
      {
        heading: "숙제가 안 올라가거나 화면이 이상할 때",
        body: "제출이 안 되거나, 제대로 냈는지 헷갈리거나, 숙제 화면이 이상하게 보이면 아래를 확인합니다.",
        steps: [
          "코스와 숙제 제목이 맞는지, 마감 시간이 지나지 않았는지 봅니다. 마감이 지났다면 선생님께 물어봅니다.",
          "휴대폰에서 사진이 안 붙으면 기기 설정에서 클래스인의 사진 접근 권한을 허용했는지 확인합니다.",
          "붙인 사진이 미리보기에 보이는지 확인한 뒤 제출을 누릅니다.",
          "제출 후에도 초록색 [제출하기] 버튼이 그대로 있으면 아직 제출되지 않은 것입니다. 다시 붙이고 제출합니다.",
          "휴대폰 앱에서 숙제 화면이 뒤로 밀리거나 줄 간격이 넓게 보이면 앱을 최신 버전으로 업데이트합니다.",
          "그래도 계속되면 활동 이름, 담당 선생님, 내 클래스인 아이디, 화면 사진이나 영상을 학원이나 클래스인 상담 채널에 보냅니다.",
        ],
      },
    ],
    relatedSlugs: ["course-grades", "todo-calendar", "ai-features", "course-join", "class-join-replay"],
  },
  {
    slug: "course-grades",
    category: "student",
    title: "코스 - 내 성적 확인하기",
    description: "코스의 [성적]에서 내 점수, 출석, 선생님 피드백을 확인합니다. 점수가 비어 있거나 이상해 보이면 채점이 끝났는지부터 봅니다.",
    audience: "내 점수와 피드백을 직접 확인하려는 학생",
    updatedAt: "2026-09-24",
    readMinutes: 3,
    tags: ["성적", "피드백", "출석"],
    keywords: ["성적", "종합 성적", "학습 과정", "출석", "피드백", "점수", "채점 전", "점수 안 보임", "정답률", "과제 제출 내역", "성적 확인", "내 점수", "성적 뭐 볼 수 있어", "성적 공개", "다른 학생 성적"],
    chatbotSummary: "코스 화면 위쪽 [성적] 아이콘을 누르면 그 코스의 수업·시험·숙제 점수와 출석 기록이 모여 있습니다. 오른쪽 위 [종합 성적]은 이 코스의 현재 평균이고, [학습 과정]에서는 활동별 점수와 선생님 피드백을 봅니다. 숙제는 선생님이 채점해야 점수가 나오고 채점되면 알림이 오며, 학원에서 본 종이 시험처럼 클래스인 밖에서 한 활동은 선생님이 따로 입력하지 않으면 보이지 않을 수 있습니다.",
    sections: [
      {
        heading: "성적은 코스마다 따로 모입니다",
        body: "클래스인의 성적은 코스별로 봅니다. 그 코스에서 받은 수업·시험·숙제 점수와 출석 기록이 [성적] 한곳에 모이고, 새 점수가 나오면 바로 반영됩니다. 점수만 보지 말고 같은 화면의 피드백까지 읽어야 다음에 무엇을 공부할지 보입니다.",
      },
      {
        heading: "PC에서 내 성적 보기",
        body: "[성적]은 코스마다 따로 있으니 확인할 코스를 먼저 엽니다.",
        steps: [
          "경로: 코스 > 화면 위쪽 [성적] 아이콘",
          "오른쪽 위 [종합 성적]에서 이 코스의 현재 평균 성적을 봅니다.",
          "[학습 과정]에서 활동을 하나씩 열어 점수와 선생님 피드백을 봅니다.",
          "출석 기록에서 결석이나 지각으로 잘못 남은 것이 없는지 봅니다.",
        ],
      },
      {
        heading: "숫자 읽는 법",
        body: "성적 화면의 숫자는 기준이 서로 다릅니다.",
        steps: [
          "[종합 성적]은 여러 활동을 합쳐 낸 평균입니다. 시험 한 번의 점수가 아니라서 최근 활동 하나로 크게 바뀌지 않을 수 있습니다.",
          "활동별 점수는 시험이나 숙제처럼 활동 하나에 매겨진 점수입니다. 어느 단원에서 점수가 낮은지는 여기서 찾습니다.",
          "시험과 OMR 카드는 활동을 눌러 들어가면 틀린 문제와 정답률까지 나옵니다.",
          "일일 과제는 [과제 제출 내역]에서 누적 기록, 평균 점수, 등수를 따로 봅니다.",
          "점수 칸이 비어 있으면 아직 채점 전이라는 뜻입니다. 0점과는 다릅니다.",
          "친구의 점수나 숙제가 보이는지는 선생님 설정에 따릅니다. 선생님이 서로 보기를 꺼 두면 내 성적만 보이고, 켜 두면 제출 후, 채점 후, 마감일 이후 가운데 선생님이 정한 시점부터 보입니다.",
        ],
      },
      {
        heading: "피드백을 다음 공부로 잇기",
        body: "성적을 보는 이유는 다음에 무엇을 공부할지 정하기 위해서입니다.",
        steps: [
          "[학습 과정]에서 점수가 낮은 활동 두세 개를 먼저 열어 피드백을 읽습니다.",
          "여러 번 지적된 단원을 한두 개로 좁혀 이번 주 복습 범위로 정합니다.",
          "그 단원의 다시보기, 학습 보고서, 수업 자료에서 틀린 부분만 다시 봅니다.",
          "코스에 [AI 평가] 탭이 있으면 약한 부분을 한 번 더 확인합니다.",
          "그래도 이해가 안 되면 채팅이나 다음 수업에서 선생님께 묻습니다.",
        ],
      },
      {
        heading: "점수가 안 보이거나 이상할 때",
        body: "점수가 이상해 보이면 먼저 아래를 확인합니다.",
        steps: [
          "숙제는 선생님이 채점해야 점수가 나옵니다. 점수나 피드백이 달리면 알림이 옵니다.",
          "방금 본 시험이 [종합 성적]에 반영되지 않았다면 채점이 아직 끝나지 않았을 가능성이 큽니다. 평균에는 채점이 끝난 활동이 들어갑니다.",
          "제출한 숙제를 나중에 고치면 선생님이 준 점수와 피드백이 지워집니다. 고친 뒤에는 다시 채점을 받아야 합니다.",
          "학원에서 본 종이 시험처럼 클래스인 밖에서 한 활동은 선생님이 따로 입력하지 않으면 보이지 않을 수 있습니다.",
          "성적이 통째로 비어 있으면 보고 있는 코스가 맞는지, 학원에 등록된 아이디로 로그인했는지 확인합니다.",
          "출석 기록이 실제와 다르거나, 여러 코스를 합친 성적표가 필요하면 선생님이나 학원에 문의합니다.",
        ],
      },
    ],
    relatedSlugs: ["course-submit-activity", "class-report", "ai-features"],
  },
  {
    slug: "drive",
    category: "student",
    title: "드라이브 활용하기",
    description: "숙제 양식, 코스에서 받은 수업 자료, 복습용 파일을 내 계정 드라이브에 모아 둘 때 봅니다. 파일은 [업로드]로 올리고, 폴더와 숙제 양식은 [새로 만들기]로 만듭니다.",
    audience: "자주 쓰는 파일과 숙제 양식을 모아 두려는 학생",
    updatedAt: "2026-09-24",
    readMinutes: 3,
    tags: ["드라이브", "파일", "숙제 템플릿"],
    keywords: ["드라이브", "파일 업로드", "폴더", "판서", "숙제 템플릿", "200MB", "업로드", "새로 만들기", "다운로드", "숙제 양식", "내 드라이브", "파일 저장", "파일 크기 제한", "드라이브 용량"],
    chatbotSummary: "드라이브는 내 클래스인 계정의 파일 보관함입니다. 왼쪽 메뉴 [드라이브]에서 [업로드]로 파일을 올리고, [새로 만들기]에서 폴더, 판서, 숙제 양식을 만듭니다. PPT·PDF·Word·MP4 같은 대부분의 파일을 올릴 수 있지만 파일 하나의 크기에는 제한이 있고, 올려 둔 파일은 개인 메시지, 채팅, 숙제에 다시 붙일 수 있습니다.",
    sections: [
      {
        heading: "드라이브는 내 계정의 파일 보관함입니다",
        body: "클래스인에서 자주 쓰는 파일을 내 계정 저장 공간에 모아 두는 곳입니다. 코스에서 내려받은 수업 자료를 복습용으로 모아 두거나, 자주 쓰는 숙제 양식을 저장해 둡니다. 여기 올려 둔 파일은 개인 메시지, 채팅, 숙제를 보낼 때 다시 꺼내 씁니다.",
      },
      {
        heading: "파일 올리기",
        body: "PPT, PDF, Word, MP4처럼 대부분의 파일 형식이 올라갑니다. 다만 파일 하나에 올릴 수 있는 크기에는 제한이 있습니다.",
        steps: [
          "경로: 왼쪽 메뉴 > [드라이브]",
          "휴대폰 앱에서는 아래쪽 탭의 [드라이브]로 들어갑니다.",
          "[업로드]를 누르고 올릴 파일을 고릅니다.",
        ],
      },
      {
        heading: "[새로 만들기]로 폴더·판서·숙제 양식 만들기",
        body: "[새로 만들기]에서는 파일을 올리는 대신 클래스인 안에서 바로 만듭니다.",
        steps: [
          "경로: [드라이브] > [새로 만들기]",
          "[폴더]는 드라이브 안에 새 폴더를 만듭니다. 과목이나 코스별로 나눠 두면 찾기 쉽습니다.",
          "[판서]는 선생님처럼 가상 칠판 파일을 만들어 직접 필기합니다.",
          "[숙제]는 자주 쓰는 숙제 양식을 만들어 두었다가 나중에 숙제를 쓸 때 불러옵니다.",
        ],
      },
      {
        heading: "올라가지 않거나 받을 수 없을 때",
        body: "파일이 안 올라가거나 코스 자료를 내려받을 수 없으면 아래를 봅니다.",
        steps: [
          "파일이 올라가지 않으면 크기가 너무 크지 않은지 봅니다. 영상처럼 큰 파일은 크기를 줄여서 올리고, 그래도 안 되면 학원에 물어봅니다.",
          "코스 학습 자료에 [다운로드] 버튼이 없으면 선생님이 내려받기를 허용하지 않은 자료입니다. 이런 자료는 코스 안에서 봅니다.",
        ],
      },
    ],
    relatedSlugs: ["chat", "course-submit-activity", "class-report"],
  },
  {
    slug: "ai-features",
    category: "student",
    title: "AI 기능 활용하기",
    description: "코스 안의 [AI 튜터]에 모르는 것을 묻고, [AI 평가]로 내 학습 결과와 피드백을 봅니다. AI 답은 복습의 출발점이라, 받은 답은 수업 자료와 맞춰 보고 공식 성적은 선생님 기록을 따릅니다.",
    audience: "AI 튜터와 AI 평가로 복습하려는 학생",
    updatedAt: "2026-09-24",
    readMinutes: 3,
    tags: ["AI 튜터", "AI 평가", "복습", "피드백"],
    keywords: ["AI 튜터", "AI 평가", "코스 사이드바", "질문", "성적 분석", "학습 피드백", "AI 탭 안 보임", "출처", "좋은 질문", "AI 채점", "쓰기 과제 채점", "사진 숙제 채점"],
    chatbotSummary: "공부할 코스에 들어가면 왼쪽에 [AI 튜터]와 [AI 평가] 탭이 있습니다. AI 튜터는 그 코스의 수업 자료와 수업 내용을 바탕으로 질문에 답하고 선생님이 올린 자료 출처를 함께 보여 주며, AI 평가는 내 성적을 포함한 학습 결과와 피드백을 보여 줍니다. 답과 분석은 복습의 출발점으로 쓰고 공식 성적은 선생님과 학원 기록을 따릅니다. 탭이 안 보이면 학원이 AI 기능을 꺼 두었을 수 있으니 학원에 확인합니다.",
    sections: [
      {
        heading: "AI 튜터와 AI 평가는 무엇이 다른가요",
        body: "두 기능 모두 코스 안에 있고, 일반 검색과 달리 내가 듣는 코스를 기준으로 답합니다.",
        steps: [
          "[AI 튜터]는 공부하다 모르는 것을 묻는 곳입니다. 그 코스의 수업 자료와 수업 내용을 바탕으로 답하고, 선생님이 올린 학습 자료 출처를 함께 보여 줍니다.",
          "[AI 평가]는 내 성적을 포함한 학습 결과와 그에 대한 피드백을 보는 곳입니다. 어느 부분이 약하고 어느 부분이 잘 되고 있는지 확인합니다.",
        ],
      },
      {
        heading: "코스에서 AI 탭 열기",
        body: "AI 탭은 코스마다 따로 있습니다.",
        steps: [
          "경로: 코스 > 왼쪽 사이드바 > [AI 튜터] 또는 [AI 평가]",
          "[AI 튜터] 탭에서는 궁금한 점을 질문합니다.",
          "[AI 평가] 탭에서는 내 학습 결과와 피드백을 봅니다.",
        ],
      },
      {
        heading: "AI 튜터에 이렇게 물어보세요",
        body: "막연하게 묻기보다 어디서 막혔는지 적을수록 답이 정확해집니다. 다시보기나 학습 자료를 먼저 보고, 막힌 곳을 정해서 묻습니다.",
        steps: [
          "'3강에서 설명한 정의역 구하는 과정 중 분모가 0이 되는 부분을 다시 설명해 줘'처럼 수업과 막힌 곳을 같이 적습니다.",
          "'오늘 숙제 2번에서 내가 부호를 어디서 틀렸는지 단계별로 짚어 줘'처럼 내 풀이를 기준으로 묻습니다.",
          "'이번 단원 핵심 개념 세 가지를 한 줄씩 정리해 줘'처럼 복습 범위를 정해 달라고 해도 됩니다.",
          "어디까지는 이해했고 어디부터 막혔는지 한 줄 덧붙입니다.",
          "'시험 답 알려 줘', '이거 다 해 줘'처럼 공부 과정을 건너뛰는 질문은 피합니다.",
          "이름, 전화번호 같은 개인정보는 질문에 적지 않습니다.",
        ],
      },
      {
        heading: "받은 답은 이렇게 확인하세요",
        body: "AI 튜터는 코스 자료 범위 안에서 가장 잘 답합니다. 다른 과목이나 코스에 없는 내용을 물으면 답이 틀리거나 빈약할 수 있습니다.",
        steps: [
          "답과 함께 나온 출처 자료를 코스에서 찾아 답이 맞는지 비교합니다.",
          "수업 자료와 다르면 선생님께 다시 확인합니다.",
        ],
      },
      {
        heading: "AI 평가로 다음 복습 범위 정하기",
        body: "AI 평가는 공부 방향을 잡는 참고 자료입니다. 공식 성적과 진도는 선생님과 학원 기록이 기준입니다. 선생님이 숙제에 AI 채점을 켜 두었다면, 사진으로 낸 숙제도 AI가 평가하고 그 결과를 학생도 봅니다.",
        steps: [
          "잘하는 부분과 약한 부분을 확인하고, 약한 단원부터 복습 순서를 정합니다.",
          "피드백에서 짚은 부분을 다시보기, 학습 자료, 숙제로 이어서 보완합니다.",
          "분석이 내가 느끼는 것과 다르면 선생님께 확인을 부탁합니다.",
        ],
      },
      {
        heading: "수업 뒤 복습에 끼워 넣는 순서",
        body: "AI는 복습 마지막에 확인하는 단계로 두면 쓰기 편합니다.",
        steps: [
          "수업이 끝나면 다시보기나 학습 보고서로 흐름을 복습하고, 막힌 곳을 적어 둡니다.",
          "적어 둔 곳을 AI 튜터에 묻습니다.",
          "숙제와 시험을 낸 뒤에는 AI 평가로 약한 단원을 보고 다음 복습 범위를 정합니다.",
        ],
      },
      {
        heading: "AI 탭이 안 보일 때",
        body: "학원은 관리자 설정에서 AI 기능을 끌 수 있습니다. 그래서 학원이나 코스에 따라 AI 탭이 아예 없기도 합니다.",
        steps: [
          "다른 코스에는 AI 탭이 있는지 봅니다.",
          "어느 코스에도 없으면 학원에 AI 기능을 쓰는지 물어봅니다.",
        ],
      },
    ],
    relatedSlugs: ["course-grades", "class-report", "course-submit-activity", "ai-learning-tools"],
  },
  {
    slug: "webcam-cms-setup-t1-panorama",
    category: "board",
    title: "웹캠 네트워크 + CMS 카메라 세팅 (T1 + Panorama)",
    description: "설치 담당자가 전자칠판에 T1·S1 카메라를 연결하는 현장 순서입니다. 칠판의 네트워크를 메인용과 카메라용으로 나누고, CameraCMS에서 트래킹과 파노라마 앵글을 잡은 뒤, 클래스인에 네트워크 카메라로 등록하면 끝납니다.",
    audience: "전자칠판 도입 학원의 IT 담당자, 설치 엔지니어, 운영팀",
    updatedAt: "2026-09-24",
    readMinutes: 11,
    visibility: "unlisted",
    tags: ["전자칠판", "웹캠", "CMS", "T1", "Panorama", "설치"],
    keywords: ["웹캠 네트워크", "CMS 카메라 세팅", "T1 카메라", "S1 카메라", "Panorama 카메라", "전자칠판 설치", "트래킹 카메라", "Clip area", "RTSP", "POE", "Lecturer 영역", "Blocking zone", "Preset", "인강형", "인강 촬영", "가운데 촬영", "녹화 화면 치우침"],
    chatbotSummary: "T1·S1 카메라를 칠판에 연결할 때는 칠판 윈도우의 메인 이더넷을 자동 IP로 두고, 카메라 이더넷에 고정 IP 192.168.1.222(서브넷 마스크 255.255.255.0)를 준 뒤 CameraCMS의 [Start search]로 카메라를 찾아 등록합니다. T1은 Preset 1 트래킹 화면, Lecturer 영역과 Blocking zone, Basic2·Adv.1 옵션 순서로 설정하고, S1은 Adv.1에서 Stand up·Close up·Multi-obj·Sit down을 켭니다. 인강형 Panorama는 Clip area로 범위를 정하고, 클래스인 칠판 설정의 [네트워크 카메라 추가하기]에서 자동으로 뜨는 'Classin Camera - T1/S1'을 골라 영문 이름으로 등록합니다.",
    sections: [
      {
        heading: "1. 방문 전에 확인할 네트워크와 배선",
        body: "전자칠판 설치에서 문제가 가장 많이 나는 단계가 네트워크 세팅입니다. 칠판을 배송하기 전에 현장 네트워크를 미리 확인해 두면 설치 당일 시간이 늘어나지 않습니다. 아래 배선은 POE를 거쳐 카메라를 칠판에 연결할 때의 권장 구성입니다.",
        steps: [
          "메인 네트워크 랜선이 Cat 6.0 이상인지 확인합니다. 어느 선이 메인인지 헷갈리면 USB-LAN 커넥터로 노트북에 꽂아 보거나, 칠판에서 랜선을 뺐다 꽂아 보면 구분됩니다.",
          "메인 네트워크 속도를 재서 170Mbps 이상 나오는지 봅니다.",
          "설치할 카메라가 T1, S1, OT1 중 무엇인지 확인합니다. OT1 같은 PTZ 카메라를 쓰거나 기존 고정 IP 방식으로 연결해야 하는 현장은 이 문서가 아니라 별도 설정 자료를 따릅니다.",
          "POE를 어디에 둘지, 랜선이 어떤 기기에 연결되는지 봅니다.",
          "랜선 1은 메인 네트워크에서 칠판 하단 LAN 포트로 연결합니다.",
          "랜선 2는 POE와 T1의 LAN 포트를 연결합니다.",
          "랜선 3은 POE와 칠판 OPS를 연결합니다.",
        ],
      },
      {
        heading: "2. 메인 이더넷은 자동 IP로 두기",
        body: "배선을 마치고 칠판의 윈도우 네트워크 설정을 열면 이더넷이 두 개 보여야 합니다. 하나는 인터넷을 받는 메인 이더넷이고, 다른 하나는 카메라와 연결된 이더넷입니다. 메인 이더넷은 IP와 DNS를 자동으로 받게 둡니다. 이렇게 하면 칠판 안에 내부망이 자동으로 잡히고, 이후에는 카메라 쪽 주소만 정해 주면 CMS가 카메라를 찾습니다.",
        steps: [
          "칠판 바탕화면의 윈도우 시작 메뉴에서 [설정]을 누르고 [네트워크 및 인터넷]으로 들어갑니다.",
          "[이더넷]과 [이더넷 N(숫자)] 두 개가 보이는지 확인합니다. 하나만 보이면 랜선 연결과 POE 전원을 먼저 보고, 그래도 안 되면 담당 매니저에게 요청합니다.",
          "경로: [고급 네트워크 설정] > [어댑터 옵션 변경]",
          "인터넷을 받는 메인 이더넷을 마우스 오른쪽 버튼으로 누르고 [설정]을 누릅니다.",
          "[인터넷 프로토콜 버전4(TCP/IPv4)]를 고르고 [속성]을 누릅니다.",
          "[자동으로 IP 주소 받기]와 [자동으로 DNS 서버 주소 받기]가 모두 체크돼 있는지 보고 [확인]을 누릅니다.",
        ],
      },
      {
        heading: "3. 카메라 이더넷에 고정 IP 주기",
        body: "카메라와 연결된 이더넷에는 고정 IP를 줍니다. 카메라의 고정 IP와 같은 대역이면서 주소는 달라야 합니다. 교실에 카메라가 여러 대이거나 한 네트워크에 카메라가 여러 대 물려 있어도 설정값은 같습니다.",
        steps: [
          "카메라 이더넷을 마우스 오른쪽 버튼으로 누르고 [설정]을 누릅니다.",
          "[인터넷 프로토콜 버전4(TCP/IPv4)]를 고르고 [속성]을 누릅니다.",
          "[다음 IP 주소 사용]을 고릅니다.",
          "IP 주소에 192.168.1.222, 서브넷 마스크에 255.255.255.0을 입력합니다.",
          "[확인]을 누르고 [닫기]를 누릅니다.",
        ],
      },
      {
        heading: "4. CameraCMS에서 카메라 찾기",
        body: "CMS(Camera Management System)는 랜으로 연결하는 클래스인 카메라의 설정값과 트래킹 화각을 잡는 프로그램입니다. CMS에서 바꾼 값은 CMS와 클래스인 화면에 바로 반영됩니다.",
        steps: [
          "바탕화면의 [CameraCMS] 아이콘을 눌러 실행합니다.",
          "하단의 [Start search]를 눌러 연결된 카메라를 찾습니다.",
          "찾은 카메라를 [Add to client]로 선택하고 [add]를 눌러 추가합니다.",
          "카메라 오른쪽 상태 표시가 Connected인지 확인합니다. connection failed가 보이면 2단계와 3단계 네트워크 설정으로 돌아가 다시 확인합니다.",
          "상단 [Main View]를 눌러 카메라별 화면 설정으로 넘어갑니다.",
        ],
      },
      {
        heading: "5. T1 트래킹 화면(Preset 1) 잡기",
        body: "Preset은 카메라가 기억해 두는 앵글입니다. Preset 0은 카메라가 처음 켜질 때 보이는 전체 화면(최대 줌 아웃)이고, Preset 1은 트래킹 모드에서 교사를 따라가는 클로즈업 화면입니다. 처음 잡은 뒤에도 교실이 너무 좁거나 넓으면 기관 요청에 맞춰 다시 조정합니다.",
        steps: [
          "[Main View]에서 T1 카메라를 더블클릭하고 하단의 [전체 화면] 아이콘을 누릅니다.",
          "하단 [Stop]을 눌러 트래킹을 멈춥니다.",
          "[Presets]에서 1을 고릅니다.",
          "[PTZ Lens]의 방향 버튼과 줌 버튼으로 교사가 클로즈업 화면에 알맞은 크기와 높이로 잡히게 맞춥니다.",
          "[Set]을 눌러 저장하고, [Settings]를 눌러 트래킹 설정으로 들어갑니다.",
        ],
      },
      {
        heading: "6. T1 트래킹 범위와 제외 영역 (Basic1)",
        body: "Lecturer 영역은 카메라가 교사를 따라다니는 범위이고, Blocking zone은 사람으로 잘못 인식하지 않도록 빼 두는 영역입니다. 교실에 인물 포스터나 마네킹이 있거나 창밖으로 지나가는 사람이 보이면 그 자리를 Blocking zone으로 지정합니다. 교사가 Blocking zone 안에 서 있으면 트래킹 대상으로 잡히지 않으니 강단에 걸치지 않게 그립니다.",
        steps: [
          "[Basic1]을 누르고 [Lecturer]를 누릅니다.",
          "초록색으로 표시되는 교사 트래킹 영역을 마우스 오른쪽 버튼으로 드래그해 그립니다.",
          "위쪽 선은 칠판 윗변보다 조금 낮게, 강단에 선 교사의 머리보다는 높게 둡니다.",
          "아래쪽 선은 맨 앞자리에 앉은 학생보다 높게 둡니다.",
          "너비는 칠판 폭을 크게 넘지 않으면서, 교사가 좌우로 움직여도 자연스럽게 따라갈 만큼 잡습니다.",
          "[Blocking zone]의 1번 체크박스를 누르고, 제외할 영역을 마우스 오른쪽 버튼으로 드래그해 그립니다. 여러 곳을 지정할 수 있습니다.",
          "[Save]를 누릅니다.",
        ],
      },
      {
        heading: "7. T1 트래킹 동작 옵션 (Basic2·Adv.1)",
        body: "아래 값이 설치 기준값입니다. 교사를 놓치면 Preset 1 화면으로 돌아가고, 카메라가 켜지면 바로 트래킹을 시작하도록 맞춥니다.",
        steps: [
          "[Basic2]를 누릅니다.",
          "Tilt motion과 Outside platform을 끕니다.",
          "Target lost action은 No.1 preset, Video auto switch는 Feature switch, Power on state는 Track으로 두고 [Save]를 누릅니다.",
          "[Adv.1]을 누릅니다.",
          "Track model은 Normal, Director rules는 Internal director and switch로 두고 [Save]를 누른 뒤 [Exit]을 누릅니다.",
        ],
      },
      {
        heading: "8. T1이 교사를 따라가는지 확인",
        body: "옵션을 저장했으면 실제로 움직여 보며 확인합니다.",
        steps: [
          "[Track] 아래 [Start]를 누르고 카메라의 녹색등이 켜지는지 봅니다.",
          "카메라 화면을 띄워 두고 강단을 좌우로 걸으며 트래킹이 따라오는지 확인합니다.",
          "교사를 놓치거나 엉뚱한 곳을 잡으면 6단계와 7단계로 돌아가 Lecturer 영역, Blocking zone, 옵션을 다시 맞춥니다.",
        ],
      },
      {
        heading: "9. S1 학생 카메라 설정",
        body: "S1은 앉아 있던 학생이 일어서면 그 학생에게 자동으로 줌인하는 학생용 카메라입니다. 트래킹은 T1보다 약하니, 이 차이를 알고 앵글을 잡습니다.",
        steps: [
          "[Main View]에서 S1 카메라를 더블클릭하고 하단의 [전체 화면] 아이콘을 누릅니다.",
          "[Stop]을 눌러 트래킹을 멈추고 Preset 1을 고릅니다.",
          "방향 버튼과 줌 버튼으로 학생이 클로즈업 화면에 알맞은 크기와 높이로 잡히게 맞추고 [Set]을 누릅니다.",
          "[Settings]를 누르고 [Basic1]에서 Blocking zone 1번 체크박스를 누른 뒤, 제외할 영역을 마우스 오른쪽 버튼으로 드래그해 그리고 [Save]를 누릅니다. 여러 곳을 지정할 수 있습니다.",
          "[Basic2]에서 Target lost action은 No.1 preset, Video auto switch는 feature switch, Power On stage는 Track으로 두고 [Save]를 누릅니다.",
          "[Adv.1]에서 Stand up, Close up, Multi-obj, Sit down 오른쪽 체크박스를 모두 켜고 [Save]를 누릅니다.",
        ],
      },
      {
        heading: "10. 인강형 화면이 필요할 때 (T1 Panorama)",
        body: "기관에서 카메라 화면을 시청 화면에 꽉 차게 보여 주는 인강 스타일을 원하면 Panorama 범위를 따로 잡습니다. T1의 Panorama 화면에는 Clip area로 지정한 영역이 그대로 나갑니다. 트래킹 설정은 건드리지 않고 Clip area만 바꿉니다.",
        steps: [
          "칠판에서 CMS를 실행하고, 메인 화면에서 T1을 더블클릭해 [Main View]로 들어갑니다.",
          "화면 아래 [Stop]을 눌러 트래킹을 잠시 끕니다.",
          "[Setting]을 눌러 세부 설정으로 들어갑니다.",
          "다른 값은 그대로 두고 Clip area만 원하는 범위로 지정합니다.",
          "클래스인 칠판 화면에서 Panorama 앵글이 의도한 대로 나오는지 봅니다.",
          "OT1 같은 PTZ 카메라에는 Clip area가 없습니다. 트래킹을 끈 뒤 Preset 1을 줌인하고 옮겨 Clip area와 비슷한 앵글을 만든 다음 저장합니다.",
        ],
      },
      {
        heading: "11. 클래스인에 웹캠 등록하기",
        body: "T1과 S1은 카메라 한 대가 클로즈업(트래킹) 화면과 전경(Panorama) 화면을 함께 내보냅니다. 그래서 클래스인에는 카메라 한 대당 두 앵글이 등록됩니다. CMS 설정을 마쳤으면 클래스인 칠판 설정에서 네트워크 카메라로 추가합니다.",
        steps: [
          "클래스인을 실행하고 [칠판]으로 들어갑니다.",
          "화면 하단 가운데를 쓸어내려 도구 모음을 열고 톱니바퀴(설정)를 누릅니다.",
          "[카메라] 항목에서 [설정 더보기]를 누릅니다.",
          "[네트워크 카메라]를 누르고 [네트워크 카메라 추가하기]를 누릅니다.",
          "카메라가 네트워크에 정상 연결돼 있으면 목록에 'Classin Camera - T1/S1'이 자동으로 뜹니다. 이걸 고르면 주소를 따로 입력하지 않아도 Closeup과 Panorama 두 앵글이 함께 등록됩니다.",
          "카메라 이름은 Classin Cam T1(Close-Up)처럼 영문으로 적습니다. 한글로 적으면 클래스인을 다시 켰을 때 이름이 공백으로 바뀌는 오류가 생길 수 있습니다.",
          "목록에 자동으로 뜨지 않으면 주소를 직접 넣습니다. T1-Tracking은 rtsp://192.168.1.180/1, T1-Panorama는 rtsp://192.168.1.180/2, S1-Tracking은 rtsp://192.168.1.179/1, S1-Panorama는 rtsp://192.168.1.179/2입니다. 180과 179는 CMS 기본 IP라서, 현장에서 IP를 바꿨다면 CMS에서 실제 IP를 확인해 넣습니다.",
          "[확인]을 누르고 카메라를 켜서 화면이 제대로 나오는지 확인합니다.",
        ],
      },
      {
        heading: "12. 막힐 때 먼저 볼 것",
        body: "현장에서 가장 자주 멈추는 곳은 네트워크입니다. 카메라가 안 잡히면 CMS 설정보다 2단계와 3단계를 먼저 다시 봅니다.",
        steps: [
          "윈도우 네트워크 설정에 이더넷이 하나만 보이면 랜선 연결과 POE 전원을 확인합니다. 그래도 두 개가 보이지 않으면 담당 매니저에게 요청합니다.",
          "CMS에 connection failed가 뜨면 카메라 이더넷의 고정 IP와 서브넷 마스크가 3단계 값과 같은지 확인합니다.",
          "클래스인 카메라 설정에 네트워크 카메라(RTSP) 항목이 보이지 않으면 클래스인을 종료했다가 다시 실행합니다.",
          "화면을 회전하거나 뒤집어야 하면 CMS에서 바꿉니다. T1·S1 같은 랜 카메라는 클래스인 카메라 설정에 회전·반전 버튼이 나오지 않습니다.",
          "칠판을 옮긴 뒤 녹화 화면이 한쪽으로 치우쳐 찍히면 카메라 앵글을 다시 잡습니다. 고정 촬영으로 가운데를 찍으려면 10단계 Panorama 설정을 쓰고, 트래킹은 카메라 앞과 칠판 좌우를 걸어 보며 다시 확인합니다.",
          "등록한 카메라 이름이 공백으로 바뀌었다면 한글 이름 때문입니다. 영문 이름으로 다시 등록합니다.",
        ],
      },
      {
        heading: "13. 인계 전 마무리",
        body: "CMS에서 바꾼 앵글은 클래스인에 바로 반영되니, 기관 관계자 앞에서 직접 보여 주고 그 자리에서 받은 의견을 반영한 뒤 인계합니다.",
        steps: [
          "T1 트래킹·Panorama, S1 트래킹·Panorama 네 앵글이 모두 클래스인에서 나오는지 확인합니다.",
          "교사 동선과 학생 자리에 맞춰 Lecturer 영역, Blocking zone, Clip area를 다시 맞춥니다.",
          "기관 관계자에게 시연하고 받은 의견을 현장에서 바로 반영합니다.",
          "네트워크 세팅 중 생긴 문제와 바뀐 IP 정보를 인수인계 자료에 적습니다.",
          "나중에 칠판이나 카메라 위치를 바꾸면 앵글을 다시 잡아야 한다고 기관에 알려 둡니다.",
        ],
      },
    ],
    relatedSlugs: ["cam-t1-s1", "board-ai-camera-mic", "board-install-readiness"],
  },
  {
    slug: "customer-stories",
    category: "start",
    title: "클래스인 도입 학원 사례와 현장 후기",
    description: "우리 학원과 비슷한 곳은 클래스인을 어떻게 쓰고 있을까요? 국어·영어·과학·입시·온라인·하이브리드 학원이 도입 전에 겪던 문제와 도입 후 달라진 점을 원장·강사 후기와 함께 봅니다.",
    audience: "학원 원장, 관리자, 운영 책임자, 도입 검토자",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    featured: true,
    tags: ["도입 사례", "고객 후기", "학원 사례", "원장 후기", "강사 후기", "도입 효과", "레퍼런스", "사용하는 학원"],
    keywords: ["학원 도입 사례","우리 같은 학원 사례","비슷한 학원 사례","국어학원 사례","영어학원 사례","과학학원 사례","입시학원 사례","온라인 수업 사례","하이브리드 수업 사례","원장 후기","강사 후기","고객 후기","도입 후기","도입하면 뭐가 바뀌어요","도입 효과","사용하는 학원","사용하는 곳","다른 사용하는 곳","레퍼런스","레퍼런스 학원","도입 학원","설치 학원","어디서 사용","어느 학원","사용 중인 학원","실제 사용 학원"],
    chatbotSummary: "클래스인은 국어·영어·과학·입시 학원부터 온라인 수업 학원, 하이브리드 강의실까지 과목과 운영 형태가 서로 다른 학원에서 씁니다. 학원들이 공통으로 겪은 변화는 수업 기록이 쌓이고, 강사별 편차가 줄고, 상담과 후속 관리가 같은 기준으로 돌아가는 순서입니다. 비슷한 과목·운영 형태의 사례와 원장·강사 후기를 안내해 드리고, 우리 학원에 맞는 사례는 도입 상담이나 목동 쇼룸에서 더 자세히 보여 드립니다.",
    sections: [
      { heading: "어떤 학원들이 도입했나요", body: "클래스인은 특정 과목 전용 도구가 아니라 수업 준비, 판서, 녹화, 과제, 학생 관리를 한 흐름으로 묶는 수업 시스템 OS입니다. 그래서 국어·영어·과학 단과 학원부터 정규반과 특강을 함께 여는 입시 학원, 비대면 중심의 온라인 학원, 강의실마다 환경이 다른 하이브리드 학원까지 씁니다. 대부분 전자칠판, 수업 녹화, 수업 관리를 묶은 기본 구성으로 시작합니다. 아래 사례 가운데 우리 학원과 과목이나 운영 방식이 가까운 곳부터 보시면 됩니다." },
      { heading: "국어 학원은 첨삭 기록을 상담 근거로 씁니다", body: "국어 수업은 답보다 풀이 과정 설명과 첨삭이 중요합니다. 그런데 첨삭 방식이 강사 개인에게 달려 있으면 학부모에게 전달되는 내용의 깊이도 강사마다 달라집니다. 청주 이** 국어 학원(국어 전문, 내신·수능 대비)은 첨삭 기록과 과제 이력을 클래스인에 쌓으면서 강사별 편차를 줄였고, 학부모 상담에서 학생의 변화와 다음 과제를 더 분명하게 짚게 됐습니다.\n\n> 국어 수업은 과정 설명이 중요한데, 누적 기록이 생기니 학생 변화와 다음 과제를 더 선명하게 전달할 수 있었습니다. (담당 강사)" },
      { heading: "영어 학원은 자동채점으로 채점 업무를 덜었습니다", body: "영어는 듣기와 단어처럼 반복 채점이 많은 과목이라 채점에 보조 강사와 운영 인력의 시간이 많이 묶입니다. 수능·내신 영어학원 올***영어는 듣기·단어 자동채점을 쓰면서 보조 강사 업무량과 운영 인력 부담이 크게 줄었다고 말합니다.\n\n> 솔직히 클래스인이 없으면 학원 운영이 안 됩니다. 듣기·단어 자동채점만으로도 보조 강사 업무량과 학원 운영 인력 부담이 확 줄었어요. (올***영어 원장)" },
      { heading: "과학 학원은 흩어진 평가 기록을 한곳에 모았습니다", body: "반별 진도와 테스트 결과가 여러 곳에 흩어져 있으면 학생별 약점을 늦게 알아채고, 상담 때마다 자료를 다시 모으게 됩니다. 부산 과** 학원(과학 전문, 중·고등 내신 관리)은 반별 수업 기록과 평가 데이터를 한곳에 정리해 상담 준비 시간을 줄이고, 학생에게 주는 피드백을 같은 기준으로 맞췄습니다.\n\n> 이전에는 상담 전마다 자료를 다시 모아야 했는데, 지금은 학생별 흐름이 바로 보여서 훨씬 빠르게 판단할 수 있습니다. (원장)" },
      { heading: "입시 학원은 판서와 풀이를 복습 자료로 남깁니다", body: "고난도 수업은 판서와 풀이 과정이 그 자리에서 사라지면 결석한 학생이나 복습이 필요한 학생에게 같은 수업을 다시 전하기 어렵습니다. 입시 학원 세 곳은 이 문제를 이렇게 풀었습니다.", steps: ["대치 세**(입시 전문, 상위권 집중 관리)는 실시간 판서와 수업 자료를 수업 흐름 안에 모아 두고, 복습 자료와 보강 수업에 그대로 씁니다.","대구 학**(정규반·특강 병행)은 강의 자료, 출결, 과제 안내를 한곳에 모아 강사와 운영팀이 같은 기준으로 학생을 관리합니다.","평택 윤**(중·고등 운영)은 흩어져 있던 수업 자료와 판서 기록을 클래스인으로 모아, 수업 뒤 복습 안내와 보강 관리를 더 빨리 이어 줍니다."] },
      { heading: "온라인 학원은 비대면 수업의 참여 흐름을 봅니다", body: "비대면 수업에서 가장 답답한 점은 학생이 얼마나 참여했고 활동 결과가 어떤지 바로 보이지 않는다는 것입니다. 온라인 수업 전문인 12인 에** 학원은 게임형 참여 활동과 수업 기록을 연결해, 온라인에서도 학생이 직접 움직이는 수업을 만들고 학생별 참여 흐름을 확인합니다.\n\n> 온라인 수업에서도 학생들이 직접 움직이는 느낌이 생겼습니다. 참여 결과가 보여서 피드백도 빨라졌습니다. (운영팀)" },
      { heading: "하이브리드 강의실은 교실 환경을 하나로 맞췄습니다", body: "강의실마다 장비와 수업 환경이 다르면 수업 준비와 장비 점검에 매번 시간이 듭니다. 천안 제** 학원(집중형 강의실, 하이브리드 수업 환경)은 클래스인 보드를 기준으로 강의실 환경을 맞춰 수업 준비 부담을 줄이고 운영을 안정시켰습니다. 윈도우 기반 OPS가 내장된 보드에서는 판서, 녹화, 수업 도구가 한 기기에서 돌아가서, 강의실마다 PC와 케이블, 호환 프로그램을 따로 맞출 일이 줄어듭니다.\n\n> 강의실 세팅이 일정해지니 수업 시작 전 확인해야 할 일이 줄었고, 운영팀도 훨씬 안정적으로 움직입니다. (운영 담당자)" },
      { heading: "학원들이 공통으로 겪은 변화", body: "과목과 운영 형태는 달라도 변화는 대개 같은 순서로 옵니다. 도입하면 뭐가 바뀌느냐고 물으시면 이 세 단계로 말씀드립니다.", steps: ["먼저 판서, 수업 화면, 자료, 첨삭, 테스트 결과가 수업이 끝나도 사라지지 않고 기록으로 남습니다.","그 기록을 바탕으로 강사마다 달랐던 수업과 피드백 방식이 학원 공통 기준으로 맞춰지고, 새 강사도 그 기준을 보고 빨리 적응합니다.","쌓인 기록 덕분에 상담 준비 시간이 줄고, 복습·보강 안내와 학생별 후속 관리가 빨라집니다.","대부분 전자칠판, 녹화, 수업 관리를 묶은 기본 구성으로 시작하고, 자리 잡기까지 평균 3개월, 보통 3~4개월이 걸립니다."] },
      { heading: "원장·강사 후기 모음", body: "기능 이야기만큼 도입 과정의 지원과 운영 관리에 대한 후기도 많습니다. 학원명과 이름은 일부를 가려 옮겼습니다.", steps: ["“오프라인 수업이 신석기 문화라면, 기존 전자칠판은 청동기, 클래스인은 철기 문화에 가깝습니다.” (국어 전문 학원 권** 대표)","“진심으로 응대해 주시고 잘 케어해 주신 덕분에, 저희가 불편함 없이 쓰고 있다고 직원분들이 입을 모아 말합니다.” (입시 학원 천** 부원장)","“클래스인 덕분에 돈 벌면서 유학 공부할 수 있게 됐어요.” (강사 회원 라**)","“우리 지역에서 클래스인의 전도사가 되어보겠습니다.” (어학원 고** 원장)","“결제 완료했습니다. 아주 잘 사용하고 있어요. 감사합니다.” (어학원 부산 **에듀 원장)","“덕분에 좋은 문물을 접했습니다. 감사합니다.” (국어 전문 학원 김** 대표)"] },
      { heading: "우리 학원과 비슷한 사례가 더 궁금하다면", body: "여기 실린 곳 말고도 과목, 규모, 운영 방식별로 참고할 사례가 더 있습니다. '우리 같은 ○○학원 사례 있어요?'처럼 과목과 운영 형태를 붙여 물어보시면 가장 가까운 사례를 찾아 드립니다. 실제 수업 환경과 보드를 직접 보고 싶으시면 목동 쇼룸 방문이나 도입 상담을 신청하시면 됩니다.", steps: ["문의하실 때 과목(국어·영어·과학·입시)과 운영 형태(오프라인·온라인·하이브리드)를 함께 알려 주세요.","목동 쇼룸에서는 전자칠판, 녹화, 수업 도구가 한 흐름으로 돌아가는 모습을 직접 봅니다.","도입 상담에서는 지금의 수업·운영 방식에 맞춰 도입 범위와 일정을 함께 정합니다."] }
    ],
    resources: [
      { label: "클래스인 도입 사례 모아보기", href: "/#case-studies", description: "학원별로 도입 전 고민과 도입 후 달라진 점을 카드로 봅니다." },
      { label: "수업 시스템 OS 진단 체크리스트", href: "/resources/academy-system-checklist", description: "우리 학원의 수업·녹화·교안·과제·학생 관리가 여러 도구에 흩어져 있는지 점검하는 자료입니다." },
      { label: "도입 상담·목동 쇼룸 문의", href: "/contact", description: "비슷한 학원 사례, 쇼룸 방문, 도입 범위를 문의합니다." }
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
    description: "지금도 수업은 잘 돌아가는데 굳이 바꿔야 할지 고민하는 원장님이라면, 기능 목록 말고 강사 시간과 운영비로 따져 봅니다. 전자칠판이나 줌과 무엇이 다른지, 클래스인이 맡지 않는 일은 무엇인지도 그 기준으로 짚습니다.",
    audience: "학원 원장, 관리자, 운영 책임자",
    updatedAt: "2026-09-24",
    readMinutes: 7,
    featured: true,
    tags: ["도입 고민", "왜 필요", "전자칠판 차이", "줌 차이", "운영비", "강사 리소스", "수업 시스템 OS"],
    keywords: ["왜 필요","클래스인 왜 필요","지금도 잘 되는데","전자칠판 있는데 왜 바꿔","전자칠판 차이","구형 전자칠판","줌 차이","줌 쓰면 안 돼","줌으로 충분","강사 의존","강사 퇴사","반별 편차","수업 품질 편차","자료 분산","반복 업무","운영비","줌이랑 뭐가 달라","zoom 비교","줌 대신","줌이 더 좋은 거 아닌가","뭐가 다른 거예요"],
    chatbotSummary: "클래스인은 기능을 더 사자는 제안이 아니라, 수업·녹화·교안·과제·학생 기록이 강사 개인과 여러 도구에 흩어져 강사 시간과 운영비가 새는 구조를 한 흐름으로 묶는 수업 시스템 OS입니다. '지금도 잘 된다', '전자칠판이 이미 있다', '줌이면 충분하다'는 고민에는 기능 비교보다 수업 운영 흐름과 반복 업무 기준으로 답합니다. 결제·오프라인 출석·고급 리포트는 기존 시스템이나 공식 API 연동으로 역할을 나눕니다.",
    sections: [
      { heading: "도구가 흩어지면 강사 시간과 운영비가 샙니다", body: "클래스인을 검토하는 학원은 대개 기능이 모자라서가 아니라 운영이 사람과 도구에 너무 기대고 있어서 시작합니다. 전자칠판은 전자칠판대로, 녹화는 별도 프로그램으로, 교안은 강사 노트북에, 과제와 성적은 메신저와 엑셀에 흩어져 있으면 좋은 장비를 사도 결국 사람 손과 기억으로 이어 붙이게 됩니다. 파일 찾기, 녹화 올리기, 링크 보내기, 기록 정리는 하나하나는 작아도 매일 강사와 운영팀의 시간을 가져갑니다. 클래스인이 먼저 보는 건 기능이 아니라 이 구조입니다.", steps: ["수업 준비, 판서, 녹화, 복습 배포, 과제, 학생 관리를 지금 각각 어떤 도구로 하는지 적어 봅니다.","그 도구 사이를 누가 손으로 잇고 있는지 봅니다. 파일 찾기, 녹화 업로드, 링크 배포, 기록 정리가 대표적입니다.","그 수작업에 드는 강사·운영팀 시간을 운영비로 계산해 도입을 판단합니다."] },
      { heading: "좋은 수업이 강사 개인 파일에만 있다면", body: "좋은 수업이 특정 강사의 개인 파일, 판서 습관, 개인 메신저에만 남아 있으면 그 강사가 빠질 때 반 전체가 흔들립니다. 새 강사가 같은 수준으로 수업하기까지도 시간이 걸립니다. 클래스인은 우수 강사의 교안과 수업 흐름을 EDB 교안, 녹화, LMS로 학원 계정에 남겨, 강사가 바뀌어도 같은 기준으로 수업을 이어 가도록 합니다.", steps: ["수업 자료와 판서가 강사 개인 저장소가 아니라 학원 계정과 교안 파일로 남는지 확인합니다.","강사가 바뀌거나 반을 옮길 때 계정과 자료를 넘겨받는 기준이 있는지 봅니다.","새 강사가 우수 강사의 EDB 교안을 받아 같은 흐름으로 수업하도록 준비합니다."] },
      { heading: "같은 교재인데 반마다 결과가 다를 때", body: "같은 교재, 같은 시간표인데 반마다 성적과 만족도가 다른 일은 흔합니다. 어느 반이 왜 흔들리는지는 보통 학부모 불만이나 강사 보고가 들어온 뒤에야 알게 됩니다. 클래스인에서는 잘 되는 반의 교안을 다른 반에서 다시 쓰고, 권한을 받은 관리자가 수업 시간·참여·특이사항 같은 운영 데이터를 봅니다. 감으로 하던 수업 평가를 기록을 보며 하게 됩니다.", steps: ["수업 상태를 강사 보고보다 먼저 기록과 참여 데이터로 보는지 확인합니다.","잘 되는 반의 교안과 수업 흐름을 다른 반이나 다른 지점으로 옮길 수 있는지 봅니다.","수업 운영 데이터는 권한을 받은 관리자만 보도록 범위를 정합니다."] },
      { heading: "학생 한 명을 보려고 도구 다섯 개를 열 때", body: "수업 자료는 드라이브에, 녹화는 별도 폴더에, 과제는 메신저에, 출결과 성적은 엑셀에 있으면 학생 한 명의 학습 상황을 보려고 매번 여러 곳을 뒤져야 합니다. 학부모 상담 직전에 자료를 다시 모으는 일도 반복됩니다. 클래스인은 수업, 판서, 녹화, 과제, 복습 기록을 학생 단위로 이어 둡니다.", steps: ["수업 자료, 판서, 녹화, 과제, 상담 기록이 학생별로 이어지는지 확인합니다.","결석한 학생에게 녹화와 과제를 한 번에 보낼 수 있는지 봅니다.","학부모 상담 전에 학생의 수업·과제·복습 기록을 한 화면에서 보는지 확인합니다."] },
      { heading: "장비를 늘렸는데 손이 더 간다면", body: "녹화 파일 내려받아 다시 올리기, 복습 링크 보내기, 자료 다시 띄우기, 출결 따로 정리하기는 하나하나는 작아도 매주 쌓이면 큰 시간이 됩니다. 장비를 추가했는데 관리할 일이 오히려 늘어나는 경우도 많습니다. 클래스인은 녹화에서 복습 배포까지, 교안 재사용, 채팅·과제·LMS를 한곳에서 이어 이 반복 작업 자체를 줄이도록 설계돼 있습니다.", steps: ["녹화 업로드와 복습 배포를 지금 누가 손으로 하고 있는지 확인합니다.","강사가 칠판, 카메라, 마이크, 녹화 프로그램을 각각 따로 켜고 관리하는지 봅니다.","EDB 교안과 50페이지 칠판을 쓰면 수업 중 자료를 다시 띄우는 시간이 얼마나 줄지 따져 봅니다."] },
      { heading: "지금도 잘 되는데 왜 바꿔야 하나요?", body: "지금 잘 돌아가는 건 시스템보다 사람이 빈틈을 잘 메우고 있어서인 경우가 많습니다. 에이스 강사 한 명이 빠지거나 반과 지점이 늘면 그 의존이 한꺼번에 드러납니다. 지금 방식이 나쁘다는 이야기가 아닙니다. 사람 덕에 잘 되는 부분을, 사람이 바뀌어도 유지되는 기준으로 남겨 두자는 것입니다. 한 반, 한 강사로 작게 시작해 확인하면 됩니다.", steps: ["지금 잘 되는 부분이 시스템 덕인지, 특정 사람 덕인지 나눠 봅니다.","그 사람이 빠지면 가장 먼저 흔들릴 곳을 하나 꼽습니다.","대표 수업 1개와 대표 강사 1명으로 작은 파일럿부터 해 봅니다."] },
      { heading: "전자칠판이 이미 있는데 또 바꿔야 하나요?", body: "화면이 더 커진다는 건 바꿀 이유가 되지 않습니다. 차이는 화면이 아니라 그 뒤의 수업 운영입니다. 전자칠판이 있어도 매 수업 외장 노트북과 HDMI·터치 케이블을 연결해야 하고, 녹화는 칠판과 따로 돌아 별도 프로그램으로 올려야 하는 경우가 많습니다. 라이선스 기간이 끝나면 쓸 수 있는 기능이 줄고, 다른 시스템과 연결하려면 또 새 시스템을 붙여야 합니다. 클래스인 보드는 OPS(내장 PC)와 클래스인 소프트웨어로 판서, 녹화, EDB 교안, 복습, 수업 관리를 한 흐름으로 잇습니다. 칠판을 바꾸는 결정이라기보다 칠판 뒤의 수업 운영을 바꾸는 결정에 가깝습니다.", steps: ["매 수업 외장 PC, HDMI, 터치 케이블을 연결하고 있는지 확인합니다.","녹화가 칠판과 따로 돌아 업로드와 배포를 사람이 따로 하는지 봅니다.","비교 기준을 화면 크기에서 녹화·EDB·복습·관리 연결로 바꿔 봅니다."] },
      { heading: "그냥 줌을 쓰면 안 되나요?", body: "줌은 화상 연결이 필요할 때 좋은 도구지만 화상회의 중심입니다. 클래스인은 수업 전 준비부터 실시간 판서, 녹화, LMS 숙제·시험, 관리자 데이터까지 수업 운영 전체를 잇습니다. 한국 학원은 온라인보다 오프라인 수업 비중이 크고, 학생이 개인 기기로 수업받는 걸 꺼리는 경우도 많습니다. 그래서 전자칠판 판서, 녹화, 다시보기, LMS 과제·시험을 클래스인 안에서 해결하는 방식이 현실적입니다. 줌만으로는 이 흐름이 한곳에 남지 않습니다.", steps: ["필요한 게 단순 화상 연결인지, 판서·녹화·과제까지 이어지는 수업인지 먼저 나눕니다.","실시간 수업이 끝난 뒤 녹화와 복습이 학생 관리로 이어지는지 확인합니다.","오프라인 수업이 중심이라면 전자칠판 판서, 녹화, LMS로 이어지는 흐름을 기준으로 봅니다."] },
      { heading: "구글 클래스룸을 쓰고 있다면", body: "구글 클래스룸은 과제 관리가 중심입니다. 클래스인은 실시간 화상 수업, 판서 권한, 학생 발표, 자동 녹화, 다시보기 진도, 퀴즈, 학습 데이터를 한곳에서 운영합니다. 구조도 조금 다릅니다. 학생을 초대하고 활동이 쌓이는 [코스]가 반 하나이고, 그 코스 아래에 실제 교실인 [수업]이 생깁니다. 반을 몇 개까지 만들고 한 반에 몇 명까지 넣을 수 있는지는 요금제마다 달라서 상담에서 확인합니다." },
      { heading: "클래스인이 맡지 않는 일", body: "클래스인은 수업, 녹화, EDB, LMS, 학생 학습 데이터에 강하지만 학원 업무 전부를 대신하지는 않습니다. 결제·정산, 오프라인 출입과 출석, 고급 경영 리포트는 기본 기능만으로 대체하기 어렵습니다. 학원 운영 방식에 따라 기존 시스템을 계속 쓰거나 공식 API와 커스텀 리포트로 역할을 나눕니다. 도입 상담에서 클래스인이 맡지 않을 업무를 먼저 정해 두면 도입 범위가 분명해집니다.", steps: ["결제·정산은 지금 쓰는 시스템과 어떻게 나눌지 먼저 정합니다.","오프라인 출석은 현장 장비와 운영 규칙에 따라 별도 절차나 연동으로 봅니다.","고급 리포트나 자체 CRM이 필요하면 공식 API, 데이터 구독, 커스텀 대시보드 범위로 따로 검토합니다."] }
    ],
    resources: [
      { label: "수업 시스템 OS 진단 체크리스트", href: "/resources/academy-system-checklist", description: "수업·녹화·교안·과제·학생 관리가 여러 도구에 흩어져 있는지 점검하는 자료입니다." },
      { label: "Zoom·전자칠판·LMS 비교 도입 워크시트", href: "/resources/academy-software-selection-worksheet", description: "줌·전자칠판·LMS와 클래스인을 기능 이름이 아니라 운영 흐름으로 비교합니다." },
      { label: "목동 쇼룸 방문 예약", href: "/showroom", description: "우리 학원 수업 한 편을 기준으로 도구가 얼마나 흩어져 있는지, 어디까지 도입할지 함께 봅니다." }
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
    description: "견적을 받기 전이든 받은 뒤든, 전자칠판 가격표와 무엇을 비교해야 할지 헷갈린다면 견적에 들어가는 항목부터 봅니다. 소프트웨어 플랜 구분과 따로 계산해야 하는 연동 비용도 짚고, 정확한 금액과 계약 조건은 상담에서 정합니다.",
    audience: "학원 원장, 관리자, 도입 의사결정자",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    featured: false,
    tags: ["도입 비용", "견적 구성", "TCO", "전자칠판 비교", "소프트웨어 요금", "도입 상담"],
    keywords: [
      "클래스인 가격",
      "클래스인 비싸",
      "견적 구성",
      "견적에 포함",
      "전자칠판 가격",
      "전자칠판만 구매",
      "OPS 내장",
      "안드로이드 전자칠판 비교",
      "소프트웨어 요금",
      "TCO",
      "총소유비용",
      "도입 상담",
      "ClassIn Pro 요금제",
      "Pro 요금제",
      "Enterprise 요금제",
      "전자칠판 결합 할인",
      "결합 할인",
      "소프트웨어 맞춤 견적서",
      "원비 수납",
      "학원 결제",
      "수강료 결제",
      "결제 관리",
      "타사 전자칠판 비교",
    ],
    chatbotSummary: "클래스인 비용은 학원 규모와 구성에 따라 달라 한 가지 가격으로 말하기 어렵습니다. 견적은 전자칠판(OPS 내장), 카메라, 스탠드 또는 벽걸이, 소프트웨어, 설치와 강사 온보딩을 묶어 산정합니다. 소프트웨어는 직접 결제해 시작하는 Standard·Plus 플랜과 대형 기관·하드웨어 결합 도입을 위한 Enterprise 맞춤 계약으로 나뉘고, 전자칠판과 함께 도입하면 소프트웨어까지 한 견적으로 묶어 드립니다. 문의 페이지(/contact)에 교실 수와 계정 수를 남기시면 맞춤 견적서를 보내 드립니다.",
    sections: [
      { heading: "견적은 무엇으로 구성되나", body: "클래스인 견적은 전자칠판 한 대 값이 아니라 수업을 바로 시작할 수 있는 한 세트 값입니다. 가장 많이 고르는 조합은 전자칠판에 카메라, 스탠드 또는 벽걸이, 소프트웨어를 더한 구성이고, 여기에 설치와 강사 온보딩이 붙습니다. 항목별 금액은 모델, 교실 환경, 도입 대수, 소프트웨어 사용 범위에 따라 달라서 상담에서 확정합니다.", steps: ["전자칠판은 교실 크기와 수업 형태에 맞춰 모델을 고릅니다.","OPS(내장 PC)는 칠판 안에 들어가는 윈도우 PC입니다. 별도 PC 없이 판서, 녹화, 소프트웨어가 칠판에서 함께 돌아갑니다.","카메라는 수업 촬영과 녹화, 하이브리드 수업에 씁니다.","스탠드와 벽걸이 중에서는 교실을 옮겨 가며 쓸지, 벽면 보강이 되는지를 보고 설치 방식을 정합니다.","소프트웨어는 실시간 수업, EDB 교안, 녹화, LMS, 관리자 데이터를 어느 범위까지 쓸지에 따라 정합니다.","설치와 온보딩에는 현장 설치와 강사 교육이 들어갑니다. 도입 첫 주부터 수업에 쓰는 것을 목표로 합니다."] },
      { heading: "소프트웨어 플랜은 세 가지입니다", body: "소프트웨어는 운영 규모에 따라 Standard, Plus, Enterprise로 나뉩니다. 공식 도움말에는 Pro·비즈니스라는 이름으로 나올 수 있어, 지금 결제 화면에 보이는 플랜 이름을 기준으로 상담에서 맞춰 드립니다. Standard와 Plus는 직접 결제해 바로 시작하는 플랜이고, Enterprise는 대형 기관이나 전자칠판과 함께 도입하는 경우를 위한 맞춤 계약입니다. 요금은 계정 수를 기준으로 하니, 강사·운영 계정이 몇 개 필요한지 먼저 세어 보면 플랜이 좁혀집니다.", steps: ["Standard는 소규모 운영팀이 실시간 수업과 기본 수업 도구로 바로 시작하는 플랜입니다.","Plus는 강사가 여럿이고 팀으로 운영할 때, 더 큰 코스와 고급 활동·리포트가 필요할 때 고릅니다. 결제 전에 먼저 써 보고 싶으시면 문의 페이지(/contact)에서 2주 무료 체험을 신청하시면 됩니다.","Enterprise는 대형 기관, 하드웨어·설치 연계, 보안·권한 맞춤, 계약 기반 청구가 필요할 때 맞춤 계약으로 설계합니다.","전자칠판과 함께 도입하면 소프트웨어까지 한 견적으로 묶어 드립니다. 할인이나 금액은 견적서에서 확인합니다.","문의 페이지(/contact)에 교실 수와 계정 수를 남기시면 맞춤 견적서를 보내 드립니다."] },
      { heading: "왜 단순 전자칠판 가격과 비교하면 안 되나", body: "클래스인 견적을 전자칠판 단품 가격표와 나란히 놓으면 비교가 맞지 않습니다. 칠판만 사면 녹화 장비, 수업용 PC, 과제·복습·학생 관리 도구, 관리자 도구를 따로 마련해야 하고, 그 사이를 매 수업 사람이 손으로 잇는 시간이 운영비로 쌓이기 때문입니다. 그래서 비교 단위는 칠판 한 대 값이 아니라 수업이 돌아가는 한 세트의 총소유비용(TCO)입니다.", steps: ["칠판, 녹화 장비, 수업용 PC, 과제·복습·학생 관리 도구, 관리자 도구를 따로 샀을 때의 합계를 냅니다. 하나하나는 싸 보여도 합치면 커지고, 기기끼리 호환이 안 될 위험도 따라옵니다.","녹화 파일 정리와 업로드, 자료 다시 띄우기, 출결·과제·복습 연결에 강사와 운영팀이 한 달에 쓰는 시간을 적어 봅니다.","클래스인 구성으로 그 시간이 얼마나 줄어드는지와 도입 범위를 함께 놓고 비교합니다. 시간 계산은 아래 '강사 리소스 절감 계산 워크시트'로 해 보셔도 됩니다."] },
      { heading: "다른 전자칠판과 비교할 때 볼 것", body: "전자칠판을 비교할 때 가장 큰 차이는 안드로이드 디스플레이형이냐, 윈도우 OPS가 내장된 통합형이냐입니다. 안드로이드 디스플레이형은 화면 출력과 판서에 머무는 경우가 많아서, 수업과 녹화를 제대로 하려면 별도 PC, HDMI·터치 케이블, 호환 프로그램을 따로 붙여야 합니다. 붙이는 기기가 늘수록 수업 전에 확인할 연결도 늘어납니다. 클래스인 보드는 윈도우 기반 OPS가 들어 있고 클라우드와 연결돼 있어 판서 프로그램, 소프트웨어, 하드웨어가 한 시스템으로 움직입니다.", steps: ["외장 PC와 HDMI에 얼마나 기대는지 봅니다.","녹화가 칠판에서 바로 되는지, 녹화본이 클라우드로 이어지는지 봅니다.","지금 쓰는 수업 프로그램과 자료가 그대로 열리는지 봅니다.","설치와 유지보수가 단순한지 봅니다.","모델별 정확한 사양, 재고, 설치 가능 여부는 '모델별 스펙과 선택 가이드'와 상담에서 확인합니다."] },
      { heading: "견적에 같이 넣어야 하는 연동 비용", body: "클래스인은 수업, 녹화, 과제, 학생 관리, 관리자 데이터에 강하지만 학원 업무 전부를 대신하지는 않습니다. 결제, 오프라인 출석, 고급 리포트는 기본 기능이 약한 영역이라, 기존 시스템과 어떻게 나눌지와 연동 비용을 견적 단계에서 같이 봐야 합니다. 이 영역은 보통 공식 API로 데이터를 가져와 직접 만들거나 외부 도구와 연결합니다.", steps: ["학생 원비 수납이나 학원 결제를 클래스인이 자동으로 처리하지는 않습니다. 결제·정산은 학원마다 방식 차이가 커서, 지금 쓰는 결제 시스템과 역할을 먼저 나눕니다.","오프라인 출석은 현장 장비와 운영 규칙에 따라 외부 시스템이나 별도 절차가 필요할 수 있습니다.","고급 리포트나 자체 CRM은 공식 API와 데이터 구독으로 데이터를 가져와 커스텀 리포트나 대시보드로 따로 검토합니다.","이 연동 범위도 견적에 들어가니 도입 상담 때 함께 정합니다."] },
      { heading: "전자칠판만 따로 사도 되나요", body: "칠판만 따로 살 수 있는지는 견적과 공급 조건에 따라 달라서 상담에서 확인합니다. 다만 클래스인의 장점은 칠판 한 대가 아니라 칠판에 OPS, 녹화, 소프트웨어, 관리자 데이터가 한 흐름으로 묶일 때 나옵니다. 그래서 칠판 단품이 필요한지, 수업 운영 방식을 학원 기준으로 맞추려는지에 따라 권하는 구성이 달라집니다. 정확한 금액과 계약 조건은 모델, 교실 환경, 도입 범위마다 달라 상담에서 정합니다.", steps: ["칠판 가격만 보지 말고 카메라, 스탠드 또는 벽걸이, 소프트웨어, 온보딩까지 함께 봅니다.","목동 쇼룸에서 실제 수업 흐름을 보면서 우리 학원에 맞는 구성을 고릅니다.","도입 문의에 교실 환경과 도입 범위를 남기시면 견적과 일정을 잡아 드립니다."] }
    ],
    resources: [
      { label: "클래스인 패키지·가격 안내 (Education OS)", href: "https://classin.ai.kr/l/omo1", description: "학원 규모와 상황별 패키지 구성을 볼 수 있는 안내 페이지입니다." },
      { label: "강사 리소스 절감 계산 워크시트", href: "/resources/academy-resource-reduction-calculator", description: "도입 비용과 줄어드는 강사 시간, 반복 업무 시간을 나란히 놓고 계산해 봅니다." },
      { label: "전자칠판, 카메라, 스탠드/벽걸이, 소프트웨어 포함 견적 상담", href: "/contact", description: "교실 환경과 도입 범위를 알려 주시면 구성과 정확한 견적을 드립니다." },
      { label: "목동 쇼룸에서 실제 수업 흐름 보기", href: "/showroom", description: "OPS 내장 보드에서 판서, 녹화, 소프트웨어가 어떻게 이어지는지 직접 봅니다." },
      { label: "ClassIn API 공식 문서", href: "https://docs.eeo.cn/api/en/", description: "결제나 고급 리포트처럼 클래스인이 약한 영역을 외부 시스템과 연동할 때 봅니다." }
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
    description: "진단, 파일럿, 온보딩, 정착, 확장. 도입을 정했거나 거의 정한 원장님이 5단계마다 할 일과 확인할 기준을 보고, 무엇부터 하고 언제쯤 자리 잡을지 가늠합니다.",
    audience: "학원 원장, 관리자, 운영 책임자",
    updatedAt: "2026-09-24",
    readMinutes: 6,
    featured: false,
    status: "published",
    visibility: "public",
    docType: "guide",
    productArea: "onboarding",
    difficulty: "beginner",
    tags: ["도입 로드맵", "90일", "파일럿", "온보딩", "정착", "성공 지표", "목동 쇼룸"],
    keywords: ["도입하면 뭐부터","클래스인 도입 순서","도입 기간","얼마나 걸려요","효과는 언제","90일 로드맵","3개월 정착","파일럿","교사 온보딩","EDB 템플릿","목동 쇼룸","도입 문의","도입 순서","학원 도입 방식"],
    chatbotSummary: "클래스인 도입은 진단, 파일럿(목동 쇼룸 방문이나 데모), 온보딩(강사 교육과 EDB 교안 준비), 정착(전자칠판 판서·녹화·복습·LMS 숙제와 시험), 확장 순서로 합니다. 한국 학원은 평균 3개월 안팎, 보통 3~4개월이면 자리 잡고, 범위가 넓은 기관은 6개월에서 1년까지 봅니다. 처음에는 전자칠판, 녹화, 수업 관리부터 시작해 강사 준비 시간, 반별 수업 표준화, 관리자 데이터 확인을 단계마다 점검합니다.",
    sections: [
      { heading: "도입하면 뭐부터 해요?", body: "처음부터 기능을 다 켜지 않습니다. 무엇이 흩어져 있는지 먼저 확인하고, 교실 한 곳에서 검증한 뒤 조금씩 넓힙니다. 클래스인 도입은 전자칠판을 한 대 들이는 일이라기보다 수업 운영 기준을 다시 세우는 일이라서, 이 순서가 한국 학원 현장에 맞습니다.", steps: ["1단계 진단에서는 수업 준비, 녹화, 과제, 학생 관리가 어떤 도구에 흩어져 있는지 적습니다.","2단계 파일럿에서는 목동 쇼룸 방문이나 데모로 대표 수업 한 편을 실제로 돌려 봅니다.","3단계 온보딩에서는 강사 교육과 EDB 교안 준비로 첫 표준 수업을 만듭니다.","4단계 정착에서는 전자칠판 판서, 녹화, 복습, LMS 숙제·시험으로 이어지는 루틴을 매주 반복합니다.","5단계 확장에서는 파일럿 결과를 보고 교실·지점을 늘릴지, 데이터와 API 연동을 어디까지 할지 정합니다."] },
      { heading: "1단계 진단", body: "도입 효과는 장비가 아니라 줄어드는 반복 업무에서 나옵니다. 그래서 첫 단계는 구매가 아니라, 수업 전·중·후에 사람이 손으로 처리하는 일을 찾는 것입니다. 첫 도입 범위와 성공 기준이 여기서 정해집니다.", steps: ["지금 쓰는 전자칠판, 녹화, 메신저, 과제, 시험, 학생 관리 도구를 모두 적습니다.","수업 준비, 녹화 배포, 보강 안내처럼 시간이 가장 많이 드는 반복 업무 3개를 고릅니다.","원장, 실장, 강사가 각자 생각하는 성공 기준을 한 줄씩 적습니다.","첫 도입 목적을 전자칠판, 녹화, 수업 관리 중 가장 급한 문제 하나로 좁힙니다.","결제, 오프라인 출석, 고급 리포트처럼 클래스인이 약한 영역은 별도 시스템이나 API 연동 후보로 미리 빼 둡니다."] },
      { heading: "2단계 파일럿", body: "클래스인은 하드웨어와 소프트웨어가 같이 돌아갈 때 차이가 보여서, 스펙표보다 실제 수업 흐름을 보는 편이 빠릅니다. 전 교실 도입을 정하기 전에 대표 교실 한 곳, 대표 수업 하나로 먼저 확인합니다.", steps: ["목동 쇼룸이나 온라인 데모에서 자료 열기, 판서, 녹화, 저장까지 직접 해 봅니다.","우리 학원 대표 수업 자료 한 개를 가져가 EDB 교안과 녹화 흐름으로 그대로 돌려 봅니다.","한 강사가 같은 수업을 3회 이상 반복해 부팅부터 녹화까지 매번 문제없이 되는지 봅니다.","녹화 품질과 음성, 뒷자리에서도 화면이 잘 보이는지, 네트워크가 안정적인지 확인합니다.","비용이 부담되면 1개 교실 파일럿이 성공한 뒤 넓히는 기준을 이때 함께 정합니다."] },
      { heading: "3단계 온보딩", body: "정착 속도는 이 단계에서 갈립니다. 강사가 매번 빈 화면에서 수업을 새로 준비하면 좋은 장비를 사도 운영은 다시 사람에게 기댑니다. EDB는 판서, 이미지, 텍스트를 상호작용이 살아 있는 상태로 저장하는 클래스인 칠판 파일입니다. 최대 50페이지 칠판과 함께 쓰면 한 번 만든 교안을 다음 수업에서 그대로 불러옵니다.", steps: ["자주 쓰는 대표 교안 몇 개를 EDB 파일로 먼저 바꿉니다.","50페이지 칠판을 써서 수업 중에 자료를 다시 띄우거나 판서를 지우는 시간이 줄도록 수업 순서를 짭니다.","우수 강사의 EDB 교안을 다른 강사가 따라 할 수 있게 온보딩 자료로 만듭니다.","강사 개인 PC에만 있던 자료를 학원 공용 저장 위치와 계정으로 옮깁니다.","EDB 교안 만들기, 수업 녹화, LMS 복습 배포 절차를 강사용 체크리스트 한 장으로 만듭니다."] },
      { heading: "4단계 정착", media: [{ type: "image", src: "/images/docs/diagrams/adoption-routine.svg", alt: "수업 운영 루틴 다이어그램. 전자칠판 판서에서 수업 녹화, 다시보기 복습, LMS 숙제·시험으로 이어진 뒤 다시 판서로 돌아오는 매주 반복 루틴", caption: "판서, 녹화, 다시보기 복습, LMS 숙제·시험이 매주 반복되면서 수업 루틴이 자리를 잡습니다.", width: 1440, height: 760 }], body: "한국 학원에서 가장 흔한 기본 도입은 전자칠판 판서, 녹화, 다시보기 복습, LMS 숙제·시험을 클래스인 안에서 이어 가는 것입니다. 학생이 개인 기기를 잘 쓰지 않는 현장 중심 학원에도 이 루틴은 그대로 들어맞습니다.", steps: ["실시간 수업은 전자칠판 판서 중심으로 하고, 자동 녹화가 켜져 있는지를 매 수업 기본 점검 항목으로 둡니다.","결석한 학생과 복습이 필요한 학생에게 녹화와 과제를 함께 보내는 기준을 정합니다.","숙제, 시험, 복습 자료를 클래스인 LMS 안에서 운영할 반을 정합니다.","강사가 녹화 업로드와 링크 배포를 손으로 반복하고 있지 않은지 확인합니다.","수업 채팅과 피드백이 학생별 기록으로 남는지 봅니다."] },
      { heading: "5단계 확장", body: "파일럿이 자리 잡으면 교실과 지점을 넓힐지, 운영을 어디까지 고도화할지 정합니다. 이 단계부터 원장과 관리자는 권한이 허용된 범위에서 수업 시간, 출결과 참여, 특이사항, 네트워크 상태 같은 운영 데이터를 기준 삼아 판단합니다.", steps: ["관리자 계정과 허가된 교사 계정이 각각 어떤 수업 정보를 볼지 역할별로 나눕니다.","원장이 매주 볼 지표와 강사가 수업마다 볼 지표를 나눕니다.","교실을 추가할 때 같은 패키지 구성을 그대로 반복할 수 있는지 봅니다.","결제, 오프라인 출석, 고급 리포트처럼 클래스인 밖에서 처리할 업무를 분리합니다.","보고서 자동화, 수업 일괄 알림, 학생 데이터 기반 개별 리포트처럼 API 연동이 필요한 일을 정합니다."] },
      { heading: "얼마나 걸려요?", body: "한국 학원은 평균 3개월 안팎이면 자리를 잡는 경우가 많습니다. 보통 3~4개월이고, 범위가 넓은 기관은 6개월에서 1년까지 봅니다. 아래는 단계마다 확인할 결과이고, 보장하는 수치는 아닙니다.", steps: ["진단과 파일럿이 끝나면 첫 도입 범위와 성공 기준이 정해지고, 대표 수업 한 편이 실제로 돌아가는지 확인됩니다.","온보딩 단계에서는 강사 준비 시간이 줄기 시작하고, 다시 쓸 수 있는 EDB 교안이 쌓입니다.","정착 단계에서는 반별 수업이 판서·녹화·복습·LMS 흐름으로 맞춰지고, 복습과 보강 안내가 안정됩니다.","확장 단계에서는 관리자가 수업 품질과 운영 상태를 주 단위로 점검합니다.","체감 시점은 학원마다 다르니, 도입 후 30일·60일·90일에 볼 지표를 미리 정해 둡니다."] },
      { heading: "우리 학원 일정 잡기", body: "순서가 그려졌다면 다음은 우리 학원 대표 수업을 기준으로 일정을 정하는 일입니다. 목동 쇼룸에서 실제 수업 흐름을 보면 파일럿 범위와 90일 일정을 그 자리에서 함께 잡습니다. 견적은 전자칠판, OPS, 카메라, 스탠드 또는 벽걸이, 소프트웨어, 온보딩까지 같이 봅니다.", steps: ["목동 쇼룸이나 온라인 데모에서 대표 수업 한 편으로 도입 흐름을 확인합니다.","설치할 교실 사진과 대표 수업 자료 한 개를 챙겨 오시면 상담이 구체적으로 됩니다.","도입 문의에서 파일럿 교실, 30·60·90일 일정, 패키지 범위를 함께 확정합니다."] }
    ],
    resources: [
      { label: "ClassIn 90일 파일럿 도입 로드맵", href: "/resources/classin-90-day-adoption-roadmap", description: "도입 일정이 구체화된 학원이 30·60·90일 파일럿 순서와 기준을 잡을 때 씁니다." },
      { label: "수업 시스템 OS 진단 체크리스트", href: "/resources/academy-system-checklist", description: "진단 단계에서 우리 학원의 수업·녹화·과제·관리가 한 시스템으로 이어지는지 점검합니다." },
      { label: "ClassIn EDB 파일 만들기 공식 가이드", href: "https://www.classin.com/kr/how-to-create-edb-files/", description: "온보딩 단계에서 교안을 EDB로 바꿀 때 참고하는 공식 자료입니다." },
      { label: "목동 쇼룸 방문 예약", href: "/showroom", description: "파일럿 교실과 90일 일정, 패키지 범위를 함께 잡습니다." }
    ],
    relatedSlugs: ["academy-system-os-positioning","board-install-readiness","teacher-onboarding","student-onboarding","admin-operation-standardization"],
  },
  {
    slug: "app-capabilities-map",
    category: "software",
    title: "클래스인 앱으로 할 수 있는 것 — 전체 기능 지도",
    description: "클래스인 앱과 관리자 콘솔에서 무엇을 할 수 있는지 한 장에 모은 기능 지도입니다. 학습 활동, 교실 도구, AI, 관리자 데이터, EDB, API가 각각 무엇인지 보고, 자세한 사용법은 연결된 문서로 넘어가면 됩니다.",
    audience: "교사, 관리자, 학원 원장, 도입 검토자",
    updatedAt: "2026-09-24",
    readMinutes: 7,
    featured: true,
    tags: ["기능 지도", "전체 기능", "앱 활용", "학습 활동", "교실 도구", "API"],
    keywords: ["클래스인 앱","앱으로 뭘 할 수 있어","무슨 기능 있어","어디서 해요","기능 지도","전체 기능","학습 활동","교실 도구","수업","숙제","시험","녹화 수업","학습 자료","일일 과제","토론","OMR 카드","SCORM","따라읽기","받아쓰기","외워말하기","타이머","랜덤 선택","개인 칠판","화면 공유","객관식 퀴즈","선착순 퀴즈","그룹 토론","AI 자동 채점","관리자 콘솔","권한 기반 운영 데이터 가시성","EDB","API","자동화","수업 흐름"],
    chatbotSummary: "클래스인 앱에서는 실시간 수업과 학습 활동 9종(수업, 숙제, 시험, 녹화 수업, 학습 자료, 일일 과제, 토론, OMR 카드, SCORM)을 만들고, 영어·중국어 따라읽기·받아쓰기·외워말하기 AI 언어활동을 씁니다. 수업 중에는 타이머, 랜덤 선택, 개인 칠판, 화면 공유, 객관식·선착순 퀴즈, 그룹 토론 같은 교실 도구 30가지 이상을 쓰고, 관리자는 웹 콘솔에서 권한에 따라 수업 운영 데이터를 봅니다. AI 채점·출제·첨삭은 일부 활동에서 기관 설정과 계약 조건에 따라 보조로 제공되므로 과목과 문항에 상관없이 늘 적용된다고 안내하지 않습니다. 결제·오프라인 출결·고급 리포트는 기본 기능이 약해 API나 외부 연동으로 보완합니다.",
    sections: [
      { heading: "이 문서는 지도입니다", body: "'앱으로 뭘 할 수 있어요?', '○○는 어디서 해요?' 하고 물으실 때 먼저 펴 보는 지도입니다. 클래스인은 전자칠판이나 화상 수업 도구 하나가 아니라 수업, 녹화, 과제, 학생 관리, 데이터, 권한을 한곳에 묶는 수업 시스템 OS라서 기능이 여러 묶음으로 나뉩니다. 학습 활동, 교실 도구, AI 기능, 관리자 데이터, EDB, API 순서로 무엇이 있는지만 짚고, 사용법은 각 묶음의 전용 문서로 넘깁니다." },
      { heading: "코스에 올리는 학습 활동 9종", body: "교사가 코스 단원에 추가하는 활동입니다. 일반 활동 9종과 AI 언어활동으로 나뉩니다. 활동별 작성 옵션은 '수업·숙제·시험·학습 활동 가이드'와 '코스 - 학습 활동 추가' 문서에 있습니다.", steps: ["수업은 실시간 차시입니다. 수업 중 상호작용과 수업 후 AI 분석·요약을 지원합니다.","숙제는 여러 과제 형식을 받고 AI 자동 채점을 지원합니다.","시험은 문제 은행 불러오기, 문제 추가, AI 출제, 응시 시간, 채점 규칙으로 구성합니다.","녹화 수업은 영상을 올리고 시청 가능 횟수, 선행 학습 조건을 정해 다시보기 학습을 만듭니다.","학습 자료는 파일을 배포하고 코스·과정·단원에 연결합니다.","일일 과제는 요일과 주기를 정해 반복 과제를 냅니다.","토론은 학생이 글로 의견을 주고받는 활동입니다.","OMR 카드는 시험지를 올리고 객관식, 다중 선택, 참/거짓, 빈칸 채우기, 서술형 문항으로 답안지를 만듭니다.","SCORM은 외부 SCORM 패키지 콘텐츠를 활동으로 올립니다.","AI 언어활동은 영어와 중국어 각각 따라읽기, 받아쓰기, 외워말하기를 제공합니다."] },
      { heading: "수업 중에 꺼내 쓰는 교실 도구", body: "실시간 교실 안에서 여는 도구가 30가지 넘게 있습니다. 목적별로 묶으면 고르기 쉽습니다. 보이는 도구는 기관 스위치 설정에 따라 다를 수 있고, 수업 단계별 사용법은 '교실과 판서 도구 사용법'에 있습니다.", steps: ["수업 진행을 돕는 도구로 타이머, 스톱워치, 주사위, 랜덤 선택(무작위 발표자 지정)이 있습니다.","판서 도구는 보조 칠판, 개인 칠판, 레이저 포인터, 매직펜, 판서 저장·공유, 파일 열기입니다. 매직펜은 쓴 획이 1초 뒤 사라지는 강조용 펜이라, 기존 판서를 지우지 않고 위치만 짚어 줄 때 씁니다.","판서 공간이 가득 차면 마우스 오른쪽 버튼으로 가로선을 긋고 아래로 끌어 새 판서 영역을 만듭니다. 최대 50페이지 제한은 그대로입니다. 매직펜과 이 확장형 판서 영역은 기본으로 켜져 있습니다.","개인 칠판의 참여 인원 제한 해제와, 개인 칠판에 .edb 파일 넣기(PC·Classin X)는 기본으로 꺼져 있습니다. 쓰려면 담당 매니저에게 활성화를 요청하고, 교사와 학생 모두 6.0.7 이상으로 업데이트합니다.","화면과 자료를 띄울 때는 화면 공유, 미러링, VNC, 브라우저, 다방향 브라우저, 비디오 갤러리, 수업 자료 라이브러리를 씁니다.","보조 카메라(듀얼 POV)로 실물 교구나 손동작을 따로 보여 줍니다.","학생 참여에는 객관식 퀴즈, 선착순 퀴즈, 그룹 토론, 공동 작업, 실시간 채팅을 씁니다.","STEM·체험 도구로 화학 실험, 물리 실험, 기하도형, 측정 도구, 바둑 칠판이 있습니다.","트로피 순위로 보상하고, 숙제·시험·AI Board는 교실 안에서 바로 엽니다."] },
      { heading: "AI 기능은 보조로 씁니다", body: "AI는 따로 떨어진 화면이 아니라 활동을 만들고 채점하는 흐름 안에 들어 있습니다. 다만 과목, 문항, 언어에 상관없이 늘 적용되는 기능은 아니어서 실제 화면에 보이는지, 기관 설정과 계약 조건이 어떤지 확인해야 합니다. 활용 예시는 'AI 튜터와 AI 평가 활용하기'에 있습니다.", steps: ["AI 채점은 일부 숙제·시험·언어활동에서 채점을 보조합니다.","AI 출제로 시험과 숙제 초안을 만들며, 보이는 범위는 활동 유형과 기관 설정에 따라 다릅니다.","AI 언어활동의 따라읽기, 받아쓰기, 외워말하기로 영어·중국어 말하기와 듣기를 연습합니다. 따라읽기에서는 학생이 다시 읽을 문장을 골라 연습합니다.","AI 칠판은 수업 중에 텍스트, 판서 캡처, 음성으로 문제를 내고 주관식, 객관식(O/X), 말하기 문항을 AI가 채점하는 기능입니다. 교사는 반 전체 답안 현황과 학습 진단을 봅니다. 기본으로 꺼져 있어 담당 매니저에게 활성화를 요청해야 하고, 교사와 학생 모두 6.0.8 이상이어야 합니다.","수업 활동은 수업 후 AI 분석·요약을 지원하지만 실제 제공 범위는 설정과 계약을 확인합니다.","문제 은행 제공 범위도 기관 설정과 계약에 따라 다릅니다."] },
      { heading: "관리자가 보는 운영 데이터", body: "관리자와 허가된 교사 계정은 웹 콘솔(console.classin.com)에서 권한에 따라 수업 운영 데이터를 봅니다. 실시간 감시가 목적이 아니라, 수업이 안정적으로 돌아가는지 보고 강사 온보딩과 학부모 상담에 쓸 근거를 모으는 기능입니다. 자세한 기준은 '관리자 모니터링과 통계 활용'에 있습니다.", steps: ["수업이 제대로 열리고 진행되는지, 수업 시간과 특이사항을 봅니다.","출결, 과제, 시험, 성적 데이터가 빠짐없이 쌓이는지 봅니다.","웹 라이브와 플레이백으로 수업을 확인하고 복습·상담 자료로 씁니다.","네트워크, 카메라, 마이크 같은 수업 환경 상태를 점검합니다.","스토리지, 계정, 권한을 관리해 학원 데이터를 쌓으면서 유출 위험도 막습니다."] },
      { heading: "EDB는 칠판 파일입니다", body: "EDB는 클래스인 전용 확장자로, 쉽게 말해 칠판을 통째로 저장한 파일입니다. 판서, 이미지, 텍스트가 상호작용이 살아 있는 상태로 저장돼 교안을 만들고 수업 중에 불러오는 데 씁니다. 최대 50페이지 칠판과 함께 쓰면 수업 중에 화면을 지우거나 자료를 하나씩 띄우지 않고, 미리 만든 교안을 페이지째 불러와 이어 갑니다." },
      { heading: "API로 운영 업무 자동화하기", body: "원장과 관리자는 API로 수업·학생 데이터를 학원의 자동화 흐름에 연결합니다. 보고서 자동화, 수업 일괄 알림, 학생 데이터 기반 개별 리포트 같은 일에 씁니다. 보통 아래 순서로 넓혀 갑니다.", steps: ["1단계는 클래스인 앱 푸시로 학생과 학부모에게 알림을 자동으로 보내는 것입니다.","2단계는 코스와 수업 정보를 조회(GET)해 자체 시스템이나 리포트로 가져오는 것입니다.","3단계는 SDK, 가상계정, 수업 중계로 자체 서비스에 클래스인 수업을 깊이 붙이는 것입니다. 이 단계는 공식 API 문서를 기준으로 따로 설계합니다.","API가 켜진 기관은 콘솔에서 코스나 수업을 새로 만들면 자체 시스템과 자동으로 맞춰지지 않습니다. 연동을 유지하려면 자체 관리 시스템에서 만듭니다."] },
      { heading: "클래스인만으로 부족한 영역", body: "클래스인 기본 기능만으로 해결하려 하지 않는 편이 좋은 영역이 있습니다. 아래 업무는 API나 외부 도구와 연결하는 구조로 설계합니다.", steps: ["결제·정산은 클래스인 기본 기능이 아니므로 기존 결제 시스템과 연동합니다.","오프라인 출석은 현장 출결 자동화가 약해 기존 출결 시스템이나 API 연동으로 보완합니다.","고급 리포트는 리포트 화면이 약해 API로 데이터를 꺼내 직접 만들거나 외부 BI 도구와 연결합니다."] },
      { heading: "역할별로 어디서 하나요", body: "같은 클래스인이라도 역할에 따라 들어가는 곳이 다릅니다.", steps: ["관리자는 웹 콘솔(console.classin.com)에서 코스·수업·교사·학생 관리, 학습 데이터, 결제 개요, 권한과 API 도킹을 다룹니다.","교사는 앱에서 코스를 만들고 학습 활동을 추가한 뒤, 교실에 들어가 교실 도구로 수업합니다.","학생은 앱에서 코스에 참여해 수업에 들어가고, 다시보기, 과제 제출, 시험 응시, AI 언어활동을 합니다. 교사가 수업 후 평가를 마치면 코스 메시지로 알림을 받고 학습 리포트와 교사 평가를 확인합니다."] }
    ],
    resources: [
      { label: "학원 데이터·API 자동화 설계 브리프", href: "/resources/academy-data-automation-brief", description: "보고서 자동화, 수업 일괄 알림, 개별 리포트 같은 API 자동화 후보를 원장 입장에서 풀어 쓴 자료입니다." },
      { label: "ClassIn(EEO) API 문서", href: "https://docs.eeo.cn/api/en/", description: "앱 푸시, 코스·수업 정보 조회, SDK·가상계정·수업 중계 연동에 쓰는 공식 API 레퍼런스입니다." },
      { label: "클래스인 소프트웨어 소개", href: "/product/sw", description: "주요 기능과 도입 사례를 제품 페이지에서 봅니다." }
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
    title: "클래스인 도입 전에 꼭 확인할 22가지 질문",
    description: "도입을 거의 정한 원장·실장님이 계약 전에 짚어 보는 질문 22개와 답입니다. 관리자 권한, 녹화 저장, 스토리지, 개인정보, 서버, OPS, 오프라인 칠판처럼 도입 뒤 문제가 생길 만한 지점을 바로 답할 수 있는 것과 계약·정책을 확인해야 하는 것으로 나눴습니다.",
    audience: "학원 원장, 관리자, 실장, 도입 검토자, 교무 책임자",
    updatedAt: "2026-09-24",
    readMinutes: 9,
    featured: true,
    tags: ["도입 전 질문", "도입 FAQ", "관리자 권한", "녹화 저장", "스토리지", "개인정보", "오프라인 칠판"],
    keywords: ["도입 전 질문","도입 전 체크리스트","도입 FAQ","22가지 질문","궁금한 점","관리자 권한","무료 관리자","유료 관리자","녹화 저장","현장 녹화","수업 녹화","권한 받은 계정","스토리지 용량","콘텐츠 소유권","개인정보","회원가입 개인정보","전화번호 이메일","서버 위치","OPS","외부 컴퓨터 연결","오프라인 칠판","펜 팁","정기 결제 포함 항목","해외 수업","해외 접속","VPN"],
    chatbotSummary: "도입 전 질문은 기능보다 관리자 권한, 녹화 저장, 스토리지, 개인정보, 서버, 계약, 오프라인 사용 같은 위험 점검에 가깝습니다. 바로 답할 수 있는 것은 웹 관리자 콘솔, 리포트, 교육과 온보딩, 관리자·권한 계정의 녹화 관리, 마이크와 카메라, 과제, 전화번호 또는 이메일 가입, OPS 내장, 오프라인 칠판 필기입니다. 무료·유료 권한, 유료 전환, 계약 기간, 정기 결제 포함 항목, 콘텐츠 소유권, 서버 위치, 스토리지 용량과 단가, 펜 팁 가격은 최신 계약과 정책을 확인한 뒤 답합니다. 상담은 가장 불안한 항목 3개를 고르고, 바로 답할 것과 확인할 것을 나눈 뒤, 쇼룸에서 직접 보고, 견적 범위와 90일 파일럿으로 이어 갑니다.",
    sections: [
      {
        heading: "질문마다 답의 종류가 다릅니다",
        body: "도입을 앞둔 원장님이 묻는 건 기능 이름보다 도입 뒤에 문제가 생길 만한 지점입니다. 그래서 아래 22개 질문의 답은 세 가지로 나뉩니다. 바로 답할 수 있는 것, 권한이나 설치 환경에 따라 달라지는 것, 계약과 정책을 확인해야 하는 것입니다. 확인이 필요한 항목은 상담 담당자가 최신 계약·정책 기준으로 답을 드립니다.",
      },
      {
        heading: "관리자 화면과 권한",
        body: "관리자 질문의 핵심은 무엇이 되느냐보다 누가 볼 수 있느냐입니다.",
        steps: [
          "LMS와 관리자 대시보드는 웹에서 보나요? 네. 관리자 대시보드는 웹 브라우저로 접속하는 관리자 콘솔이고, 앱 안의 코스 화면과는 따로 씁니다.",
          "리포트를 출력할 수 있나요? 네. 통계 다운로드, 수업·스토리지 통계, 학습 데이터 리포트를 확인하고 내려받습니다. 학생별 성적 화면은 PDF로 저장해 학부모 보고에 씁니다. 정해진 주기로 리포트를 자동 발행하는 기능은 없어서, 월 단위로 보고하려면 매월 말에 저장해 둡니다. 볼 수 있는 범위는 기관 설정, 요금제, 권한에 따라 다르고, 고급 경영 리포트는 API로 따로 만드는 영역입니다.",
          "무료 관리자 권한으로 어디까지 쓸 수 있나요? 계정, 계약, 기관 설정에 따라 달라서 상담에서 지금 쓰시는 계정을 기준으로 확인해 드립니다. 먼저 써 보고 싶으시면 문의 페이지(/contact)에서 2주 무료 체험을 신청하시면 됩니다.",
          "유료 관리자 권한에는 무엇이 있나요? 관리자 콘솔은 기관 관리, 스토리지, 학습 관리, 관리자 기능, 결제, 계정 정보 메뉴로 나뉩니다. 이 가운데 요금제별로 열리는 권한은 계약 기준으로 확인합니다.",
          "나중에 유료로 바뀌지는 않나요? 지금 제공되는 범위와 앞으로의 과금 정책은 계약 조건과 제품 정책에 따라 달라질 수 있어, 최신 기준을 확인한 뒤 답을 드립니다.",
        ],
      },
      {
        heading: "교육·계약·결제",
        body: "교육 순서는 바로 답할 수 있고, 계약 기간과 결제 범위는 견적과 계약서에서 확정합니다.",
        steps: [
          "선생님들이 자유롭게 쓰기까지 교육은 어떻게 하나요? 쇼룸이나 온라인 데모, 교사 온보딩, EDB 교안 전환, 녹화·복습·LMS 루틴 교육 순서로 합니다. 한국 학원은 보통 3개월 안팎이면 자리를 잡습니다.",
          "언제까지 사용할 수 있나요? 계약 기간, 계정 상태, 스토리지 보관 정책이 따로 적용되니 세 가지를 나눠 확인합니다. 계약이 끝나는 날과 자료가 보관되는 기간은 따로 봐야 합니다.",
          "정기 결제에는 무엇이 들어가나요? 구성에 따라 달라 견적에서 확인합니다. 전자칠판, OPS, 카메라, 스탠드 또는 벽걸이, 소프트웨어, 설치, 온보딩 중 어디까지 들어가는지 항목별로 물어보시면 됩니다.",
        ],
      },
      {
        heading: "녹화·과제·스토리지",
        body: "녹화는 수업 녹화와 현장 녹화를 먼저 구분하면 답이 쉬워집니다. 저장 용량과 보관 조건은 계약마다 달라 확인이 필요합니다.",
        steps: [
          "실시간 수업 녹화와 현장 녹화를 따로 저장하고 관리할 수 있나요? 네. 수업 녹화는 클래스인 교실 안의 칠판·자료·수업 화면을 남기고, 현장 녹화는 카메라 구성이 설정된 경우 실제 교실 뷰나 트래킹 뷰를 따로 남깁니다. 다시보기에서도 둘을 따로 골라 봅니다. 녹화본은 관리자 또는 권한 받은 계정이 계약과 권한 범위 안에서 확인하고, 관리자 대시보드에서 내려받습니다. 녹화는 교사로 등록된 계정만 켤 수 있고, 유료 요금제 결제와 계정 인증(사업자등록증, 신분증 등)을 마친 계정에서 쓸 수 있습니다.",
          "과제는 어떤 방식까지 낼 수 있나요? 숙제, 시험, 녹화 수업, 학습 자료, 일일 과제, 토론, OMR 카드, SCORM, AI 언어활동(따라읽기·받아쓰기·외워말하기)으로 냅니다. AI 채점과 출제는 활동 유형, 기관 설정, 계약에 따라 보이는 범위가 다릅니다.",
          "자료를 따로 저장해 둬야 하나요? 기본 저장은 클래스인 스토리지에서 합니다. 녹화본, 스크린샷, 칠판 파일, 공유 드라이브를 여기서 관리합니다. 자동 삭제는 기본으로 꺼져 있어서, 따로 켜지 않으면 코스가 끝나도 판서, 스크린샷, 녹화가 지워지지 않습니다. 관리자 페이지에서 녹화를 지우면 그 녹화만 볼 수 없게 되고 수업 페이지와 진행 기록은 남습니다. 오래 보관할 자료의 보호 잠금, 다운로드·삭제 권한은 계약과 기관 설정 기준으로 확인합니다.",
          "클라우드 저장 용량은 얼마나 되나요? 지금 쓰는 용량과 전체 용량은 관리자 콘솔 [스토리지] > [데이터 개요]에서 봅니다. 기본 제공량, 추가 용량, 단가는 계약마다 달라 최신 계약 기준으로 알려 드립니다.",
          "올린 콘텐츠의 소유권은 누구에게 있나요? 약관과 계약에 정해진 기준을 확인해 답을 드립니다. 클래스인은 기관 자료와 접근 권한을 나눠 관리합니다.",
        ],
      },
      {
        heading: "가입과 개인정보",
        body: "가입 방법은 바로 답할 수 있습니다. 개인정보를 어떻게 처리하고 어디에 보관하는지는 공식 개인정보처리방침과 계약을 확인한 뒤 답합니다.",
        steps: [
          "학생은 앱에서 가입하나요? 네. PC나 모바일 클래스인 앱에서 가입하고, 학원 안내에 따라 코스나 수업에 참여합니다. API로 계정을 연동하는 학원은 등록·초대 방식이 다를 수 있습니다.",
          "가입할 때 어떤 개인정보가 필요한가요? 전화번호 또는 이메일로 가입합니다. 인증을 마치면 비밀번호와 기본 프로필을 설정합니다.",
          "개인정보는 어떻게 처리되나요? 클래스인 개인정보처리방침과 학원의 권한 관리 기준을 따르고, 학원 내부 동의 절차도 함께 확인합니다. 구체적인 보관·처리 위치는 정책을 확인한 뒤 답을 드립니다. 상담에서는 학생 학습 데이터와 마케팅 목적 데이터를 섞어 설명하지 않습니다.",
          "메인 서버는 어디에 있나요? 서버 위치와 데이터 처리 지역은 공식 정책과 계약을 확인해 답을 드립니다. 추정으로 답하지 않는 항목입니다.",
        ],
      },
      {
        heading: "칠판·카메라·마이크",
        body: "하드웨어 답은 모델과 교실 환경에 따라 달라지는 경우가 많아, 쇼룸이나 현장 실측에서 직접 보는 편이 가장 빠릅니다.",
        steps: [
          "칠판에 컴퓨터를 따로 연결해야 하나요? OPS가 포함된 구성이라면 연결하지 않아도 됩니다. 칠판 안의 PC로 수업 환경이 돌아가고, 필요하면 HDMI로 노트북이나 외부 PC를 연결합니다. OPS 포함 여부와 사양은 모델과 견적에서 확인합니다.",
          "인터넷이 끊겨도 칠판에 필기할 수 있나요? 네. 기본 칠판 필기는 오프라인에서도 됩니다. 클라우드 동기화, 온라인 수업, 녹화 업로드, LMS 배포는 네트워크가 있어야 합니다.",
          "카메라 화각이나 추적을 조정할 수 있나요? 네. T1·S1 같은 카메라는 교사 추적, 전경, 클로즈업을 CMS에서 설정합니다. 다만 교실 크기, 설치 위치, 네트워크에 따라 결과가 달라서 데모나 실측 때 교사 동선과 뒷자리 시야를 같이 봅니다.",
          "내장 마이크로 충분한가요? 외부 마이크도 연결되나요? 보드에는 마이크가 내장돼 있고 외부 마이크도 연결합니다. 대형 교실이나 하이브리드 수업처럼 내장 마이크로 부족한 곳은 천장형 ClassIn Mic DT2 Pro 같은 외부 마이크를 함께 검토합니다.",
          "전용 펜 팁이 부러지면 어디서 사나요? 구매 경로, 재고, 가격은 공급 조건이 바뀔 수 있어 문의하신 시점 기준으로 확인해 드립니다.",
        ],
      },
      {
        heading: "22가지 말고도 상담에서 자주 나오는 질문",
        body: "위 22개에는 없지만 실제 상담 채팅에서 자주 들어오는 질문입니다.",
        steps: [
          "해외에서도 VPN 없이 수업할 수 있나요? 대부분 됩니다. 중국, 필리핀, 싱가포르 같은 해외에서도 VPN 없이 로그인, 학습 활동, 수업 입장이 됩니다. 다만 외부 프로그램을 막는 보안 내부망이나, 앱의 카메라·마이크 접근을 막아 둔 기기에서는 제한될 수 있습니다.",
          "반은 몇 개까지 만들고, 한 반에 몇 명까지 넣을 수 있나요? 요금제마다 달라서 상담에서 확인해 드립니다. 카메라와 마이크를 쓰는 온스테이지 인원은 수업을 시작하기 전에 정하고, 시작한 뒤에는 바꿀 수 없습니다.",
          "특정 IP나 지역에서만 수업과 녹화를 보게 막을 수 있나요? 아니요. 지금은 IP나 지역 기준으로 접근을 제한하는 기능을 지원하지 않습니다.",
          "오프라인 출석 체크도 되나요? 아니요. 오프라인 출석 체크 기능은 없습니다. 현장 출결은 지금 쓰는 출결 시스템을 계속 쓰거나 API로 연결합니다.",
        ],
      },
      {
        heading: "상담 전에 준비하면 좋은 것",
        body: "질문을 미리 추려 오시면 상담이 빨라집니다. 기능 시연보다 불안한 항목을 먼저 좁혀야 정확한 견적과 도입 범위가 나옵니다. 상담을 요청할 때 아래 문장을 채워 보내 주시면 됩니다.\n\n> 우리 학원은 현재 ___ 때문에 클래스인 도입을 검토하고 있습니다. 가장 확인하고 싶은 항목은 ___, ___, ___이고, 데모에서는 ___ 장면을 보고 싶습니다. 견적에는 ___까지 포함되는지 확인이 필요합니다.",
        steps: [
          "지금 쓰는 전자칠판, 외장 PC, 녹화 프로그램, LMS, 메신저를 적습니다.",
          "위 22개 가운데 가장 불안한 항목 3개를 고릅니다. 관리자 권한, 녹화 저장, 스토리지, 개인정보, 가격, 교실 설치 중에서 고르시면 됩니다.",
          "설치할 교실 사진, 대표 수업 자료 한 개, 온라인과 오프라인 수업 비중을 챙깁니다.",
          "데모에서 볼 장면을 정합니다. 관리자 계정으로 녹화 찾기, 스토리지 사용량 확인, OPS 단독 구동, 오프라인 필기, 외부 PC 연결 가운데 고르시면 됩니다.",
          "견적에 들어가야 할 범위를 장비, 카메라·마이크, 스탠드 또는 벽걸이, 설치, 소프트웨어, 온보딩, 스토리지로 나눠 표시합니다.",
          "리포트 자동화나 자체 시스템 연동이 필요하면 API 활성화 여부, 데이터 구독 범위, 누가 개발할지, 자체 시스템과 어느 방향으로 동기화할지를 따로 적습니다.",
          "상담에서 얻고 싶은 것을 하나 정합니다. 내부 공유용 답변, 쇼룸 예약, 견적, 파일럿 검토 가운데 하나면 됩니다.",
        ],
      },
    ],
    resources: [
      {
        label: "ClassIn 도입 전 22질문 + 자체평가 키트",
        href: "/resources/classin-pre-adoption-questions-checklist",
        description: "대표 수업 시나리오를 먼저 그린 뒤 관리자 권한, 녹화, 스토리지, 개인정보, 오프라인 사용을 43문항으로 점검하는 자료입니다.",
      },
      {
        label: "관리자 모니터링과 통계 활용",
        href: "/docs/software/admin-monitoring-analytics",
        description: "관리자가 수업 운영 상태와 데이터를 어디서 어떻게 보는지 확인합니다.",
      },
      {
        label: "스토리지 관리",
        href: "/docs/admin/storage-management",
        description: "녹화본, 스크린샷, 칠판 파일, 공유 드라이브 관리 기준을 확인합니다.",
      },
      {
        label: "목동 쇼룸 데모 준비 키트",
        href: "/resources/showroom-demo-readiness-kit",
        description: "대표 수업 자료로 권한, 녹화, OPS, 오프라인 사용을 직접 확인합니다.",
      },
      {
        label: "ClassIn 90일 파일럿 도입 로드맵",
        href: "/resources/classin-90-day-adoption-roadmap",
        description: "질문 정리가 끝난 뒤 실제 도입 순서를 잡습니다.",
      },
      {
        label: "학원 데이터·API 자동화 설계 브리프",
        href: "/resources/academy-data-automation-brief",
        description: "리포트 자동화, 알림, 자체 시스템 연동이 필요할 때 따로 검토합니다.",
      },
      {
        label: "도입 상담 신청",
        href: "/contact#contact-form",
        description: "확인이 필요한 계약·정책 항목은 상담에서 최신 기준으로 답을 드립니다.",
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
    description: "클래스인을 만든 회사는 EEO입니다. 처음 검토하는 원장님이나 파트너라면 제품 라인(Classin·TeacherIn·Nobook·Classin X), 글로벌 규모, 한국 학원에서 쓰는 방식, 도입 절차 순으로 회사와 서비스를 확인합니다.",
    audience: "학원 원장, 관리자, 도입 검토자, 파트너",
    updatedAt: "2026-09-24",
    readMinutes: 5,
    featured: true,
    tags: ["회사 소개", "EEO", "글로벌 규모", "제품 라인", "도입 절차"],
    keywords: ["클래스인 회사","회사 소개","클래스인 소개서","EEO","Empower Education Online","어떤 회사","어떤 서비스","클래스인 글로벌","글로벌 규모","에듀테크 유니콘","제품 라인","TeacherIn","Nobook","Classin X","클래스인 X","도입 절차","도입 순서","무슨 회사"],
    chatbotSummary: "클래스인은 2014년 설립된 글로벌 에듀테크 기업 EEO(Empower Education Online)의 핵심 제품으로, 화상 수업, 채팅, 클라우드, LMS, 녹화, 쌍방향 수업 도구를 묶어 온라인·오프라인·하이브리드 수업을 운영하는 교육용 SaaS입니다. 한국 학원에서는 전자칠판, 녹화, EDB 교안, LMS, 관리자 데이터를 한 흐름으로 잇는 수업 시스템 OS로 씁니다. 글로벌 규모 수치는 전 세계 누적 기준으로 EEO 공식 소개를 따르고, 국내 도입 기관 수는 상담에서 확인합니다.",
    sections: [
      { heading: "한 줄 소개", body: "클래스인(ClassIn)은 글로벌 에듀테크 기업 EEO(Empower Education Online)가 만든 교육용 SaaS로, 온라인·오프라인·하이브리드 수업을 한 플랫폼에서 운영합니다. 한국 학원에서는 전자칠판, 수업 녹화, EDB 교안, LMS, 학생 관리, 관리자 데이터를 한 흐름으로 묶는 수업 시스템 OS로 씁니다." },
      { heading: "EEO는 어떤 회사인가요", body: "EEO는 2014년에 설립된 에듀테크 SaaS 기업으로 원격·하이브리드 수업 솔루션을 만듭니다. 창업자이자 CEO는 Song Junbo입니다. 핵심 제품인 클래스인과 함께 아래 제품을 제공합니다. 한국 법인 이이오클래스인코리아는 2022년 10월 서울 목동에 설립됐습니다.", steps: ["Classin은 온라인·오프라인·하이브리드 수업 운영과 학습 관리(LMS)를 맡습니다.","TeacherIn은 수업 커리큘럼과 콘텐츠를 기획하고 함께 만드는 도구입니다.","Nobook은 물리·화학 가상 실험 도구입니다.","Classin X는 전자칠판, 카메라, 마이크로 꾸리는 하이브리드 스마트교실 하드웨어입니다."] },
      { heading: "글로벌 규모 (EEO 공식 소개 기준)", body: "아래 숫자는 한국이 아니라 전 세계 누적 수치이며, EEO 공식 소개(classin.com)를 기준으로 합니다. 국내 도입 기관 수와 보드 수는 정확한 데이터를 확인하기 전까지 단정하지 않고 상담에서 알려 드립니다.", steps: ["160개가 넘는 국가에서 쓰고, 교육자와 학습자는 5,000만 명이 넘습니다.","6만 곳이 넘는 교육기관이 도입했습니다.","누적 수업은 2억 회가 넘고, 한 달에 3,000만 회 이상 수업이 열립니다.","시리즈 D 투자를 받은 에듀테크 SaaS 유니콘이며, 누적 투자 유치액은 5억 달러가 넘습니다(EEO 공식 기준)."] },
      { heading: "무엇을 하는 서비스인가", body: "클래스인은 화상 수업, 채팅, 클라우드 드라이브, LMS, 자동 녹화, 30종이 넘는 쌍방향 수업 도구, 가상 실험실, 관리자 대시보드를 한곳에 묶습니다. 한국 학원에서는 보통 전자칠판 실시간 판서, 자동 녹화, 다시보기 복습, LMS 숙제·시험 순서로 씁니다. 기능 전체는 '클래스인 앱으로 할 수 있는 것' 문서에 있습니다.", steps: ["수업은 온라인·오프라인·하이브리드 실시간 수업과 30종이 넘는 교실 도구로 합니다.","녹화는 클라우드에 자동으로 남고, 칠판 화면과 카메라 화면 두 가지로 보며, 워터마크로 저작권을 보호합니다.","클라우드 드라이브는 개인 드라이브와 공유 드라이브로 나뉘고 PDF, PPT, Excel 같은 파일을 엽니다.","LMS에서는 커리큘럼, 숙제·시험, 자동 채점, 성적표 자동 생성을 합니다.","관리자 대시보드에서는 많은 인원과 수업, 스토리지를 관리하고 권한에 따라 운영 상황을 봅니다."] },
      { heading: "누구를 위한 서비스인가", body: "학생은 장소에 매이지 않고 수업에 참여하고, 강사는 LMS 자동화로 반복 업무를 덜고, 원장과 관리자는 학습 데이터와 수업 품질을 기준 삼아 운영을 표준화합니다. 한국에서는 학원 원장, 관리자, 운영 책임자와 함께 도입을 준비합니다." },
      { heading: "Classin X 스마트교실 하드웨어", body: "Classin X는 큰 화면 한 대가 아니라 하이브리드 교실을 위한 하드웨어 구성입니다. 전자칠판에 강사용 트래킹 카메라(T1), 학생용 카메라(S1), 천장형 마이크, 비디오 월을 더해 현장 강의, 그룹 학습과 토론, 온라인 강의, 하이브리드 강의, 녹화·송출 스튜디오를 꾸립니다. 교실 크기에 맞는 모델은 '모델별 스펙과 선택 가이드'를 보고 상담에서 함께 고릅니다." },
      { heading: "도입 절차", body: "도입은 보통 네 단계로 합니다. 30·60·90일 일정과 단계마다 확인할 기준은 '클래스인 도입 여정' 문서에 있습니다.", steps: ["제품 안내 단계에서 제공 기능과 서비스를 듣고 요금제와 궁금한 점을 문의합니다.","맞춤 컨설팅 단계에서 우리 기관에 맞는 사용 방식을 정합니다.","서비스 계약을 맺으면 담당 매니저가 배정됩니다.","시스템 설정과 온보딩 단계에서 기관별 환경을 세팅하고, 관리자와 강사 대상 교육을 기본 2회 합니다."] },
      { heading: "어디에서 쓰고 있나요", body: "대학 간 글로벌 공개 강의(예를 들어 북경대가 코넬대, 와세다대 등과 함께 연 다국가 공동 강의), 글로벌 1:1 튜터링, K-12 학교, 국내 학원에서 씁니다. 한국 학원 사례는 '클래스인 도입 학원 사례와 현장 후기'에 있고, 우리 학원과 비슷한 사례는 상담에서 더 자세히 알려 드립니다." },
      { heading: "클래스인이 맡지 않는 일", body: "결제·정산, 오프라인 출입과 출석, 고급 경영 리포트, 자체 CRM·ERP와의 세부 연동은 클래스인 기본 기능이 약한 영역입니다. 이런 업무는 기존 시스템을 쓰거나 공식 API로 연결해 역할을 나눕니다. 가격은 학원 규모와 구성에 따라 달라서 상담에서 확정합니다." },
      { heading: "직접 보고 싶다면", body: "실제 수업 흐름은 목동 쇼룸에서 직접 보는 편이 가장 빠릅니다. 회사·제품 소개나 도입 상담이 필요하면 도입 문의로 연락 주세요.", steps: ["목동 쇼룸에서 전자칠판, 녹화, 수업 도구가 한 흐름으로 돌아가는 모습을 봅니다.","도입 문의에서 우리 학원 상황에 맞는 구성과 일정을 상담합니다."] }
    ],
    resources: [
      { label: "ClassIn 공식 사이트", href: "https://www.classin.com", description: "EEO와 클래스인을 소개하는 글로벌 공식 사이트입니다." },
      { label: "도입 상담·목동 쇼룸 문의", href: "/contact", description: "회사·제품 소개와 도입 상담을 요청합니다." }
    ],
    relatedSlugs: ["academy-system-os-positioning","app-capabilities-map","board-overview","adoption-journey-90days","customer-stories"],
    status: "published",
    visibility: "public",
    docType: "guide",
    productArea: "general",
    difficulty: "beginner",
  },
  {
    slug: "classin-609-update",
    category: "updates",
    title: "ClassIn 6.0.9 업데이트 안내 — AI 칠판·AgentIn·AI 강의평가",
    description: "AI 칠판 고도화(수식 인식·실시간 채점), 교실 안 AgentIn 대화, AI 강의 품질 진단(4대 영역 11개 지표), 과제 연속 채점 등 ClassIn 6.0.9의 모든 새로운 기능과 개선사항을 한눈에 확인하세요.",
    audience: "학원 원장, 관리자, 강사, 교사",
    updatedAt: "2026-10-14",
    readMinutes: 7,
    featured: true,
    tags: ["6.0.9", "업데이트", "AI 칠판", "AgentIn", "AI 강의평가", "실시간 자막"],
    keywords: ["6.0.9", "ClassIn 6.0.9", "클래스인 업데이트", "AI 칠판", "AgentIn", "AI 강의평가", "수업 품질 진단", "실시간 자막 번역", "과제 채점"],
    chatbotSummary: "ClassIn 6.0.9는 교실 내 AgentIn 대화, AI 칠판 손글씨 STEM 수식 인식 및 실시간 자동 채점, 수업 녹화본 기반 AI 강의 품질 진단(4대 영역 11개 지표 리포트), 과제 연속 채점, 20+ 언어 실시간 자막 번역, 클라우드 드라이브 2GB 이상 대용량 비디오 재생 등 교육 현장에 필요한 AI 기능을 전면 탑재한 메이저 업데이트입니다.",
    sections: [
      {
        heading: "교실 안 AgentIn 대화 지원",
        body: "수업 중 AI 에이전트와 직접 실시간으로 상호작용할 수 있습니다. 교사와 학생이 교실 도구함에서 AgentIn을 열어 실시간 질의응답 및 브레인스토밍을 진행할 수 있습니다.",
        steps: ["교실 우측 도구함에서 AgentIn 아이콘 클릭", "텍스트 또는 음성으로 실시간 질문 입력", "교실 전체 공유 또는 개인 학습 보조로 활용"]
      },
      {
        heading: "AI 칠판 고도화 및 STEM 수식 인식",
        body: "수학 및 과학 등 STEM 분야의 복잡한 수식과 손글씨 풀이를 AI가 정밀하게 인식합니다. 학생의 풀이 과정을 실시간으로 분석하고 맞춤형 자동 채점 및 피드백을 제공합니다.",
        steps: ["교실 도구함 > AI 칠판 실행", "문항 입력 및 AI 자동 정답/루브릭 생성", "학생 손글씨 답안 실시간 수집 및 자동 채점", "단계별 감점 요인 및 1:1 맞춤 피드백 즉시 전송"]
      },
      {
        heading: "과제 임시저장 및 연속 채점 기능",
        body: "교사의 과제 채점 워크플로우가 대폭 단축되었습니다. 채점 도중 임시 저장이 가능하며, 이전/다음 학생으로 바로 넘어가는 연속 채점 네비게이션이 추가되었습니다.",
        steps: ["LMS 과제 관리 메뉴 진입", "학생 제출물 확인 및 자동/수동 채점", "임시저장 후 언제든 이어서 작업", "상단 학생 전환 버튼으로 연속 채점"]
      },
      {
        heading: "다국어 실시간 자막 및 음성 번역",
        body: "수업 중 발화자의 음성을 실시간으로 인식하여 화면 하단에 자막으로 띄우고, 20개 이상의 다국어로 실시간 번역을 제공하여 글로벌 수업 및 다문화 학생 참여도를 극대화합니다.",
        steps: ["상단 오디오/비디오 설정 메뉴 진입", "실시간 자막 번역 기능 활성화", "원문 언어 및 번역 대상 언어 선택"]
      },
      {
        heading: "수업 녹화본 기반 AI 강의 품질 진단 리포트",
        body: "수업이 끝나면 클래스인 실시간 수업 녹화본을 바탕으로 AI가 수업 전달, 수업 분위기, 수업 상호작용, 언어 표현의 4개 영역 11개 항목을 분석해 강사와 관리자에게 보고서를 제공합니다. 강사가 먼저 자기 수업 보고서를 보고, 관리자는 강사 코칭의 근거로 씁니다.",
        steps: ["수업 종료 후 클라우드 녹화본 자동 생성", "분석이 끝나면 AI 강의 분석 보고서 자동 생성", "관리자 콘솔 > 교사 개발 리포트 또는 교사 개인 페이지에서 확인"]
      },
      {
        heading: "클라우드 드라이브 2GB 이상 대용량 영상 재생",
        body: "기존 용량 제한을 넘어 2GB 이상의 고화질 대용량 비디오 파일도 클라우드 드라이브에서 끊김 없이 교실 내 즉시 스트리밍 재생이 가능합니다.",
        steps: ["드라이브에 대용량 영상 업로드", "수업 중 클라우드 파일함에서 즉시 재생"]
      }
    ],
    resources: [
      { label: "ClassIn 6.0.9 비주얼 업데이트 가이드", href: "/classin-609-update.html", description: "스크린샷과 인터랙티브 필터로 확인하는 전체 업데이트 가이드" },
      { label: "AI 칠판 완벽 활용 가이드", href: "/docs/updates/classin-ai-blackboard-609", description: "AI 칠판 문항 작성부터 손글씨 수식 채점까지" },
      { label: "AI 강의 분석(수업 품질 진단) 소개", href: "/docs/updates/classin-ai-lesson-analysis", description: "4개 영역 11개 항목 기반 강사·관리자 보고서" }
    ],
    relatedSlugs: ["classin-ai-blackboard-609", "classin-ai-lesson-analysis", "academy-system-os-positioning"],
    status: "published",
    visibility: "public",
    docType: "release_note",
    productArea: "classroom",
    difficulty: "beginner",
  },
  {
    slug: "classin-ai-blackboard-609",
    category: "updates",
    title: "AI 칠판 완벽 활용 가이드 — ClassIn 6.0.9 수식 인식·실시간 채점",
    description: "ClassIn 6.0.9의 핵심 기능인 AI 칠판의 문항 작성부터 손글씨 수식 인식, 실시간 학생 답안 그리드, AI 자동 채점 및 1:1 맞춤 피드백 생성까지 전 과정을 단계별로 상세히 안내합니다.",
    audience: "수학/과학/어학 강사, 교사, 학원 운영자",
    updatedAt: "2026-10-14",
    readMinutes: 8,
    featured: true,
    tags: ["AI 칠판", "6.0.9", "수식 인식", "실시간 채점", "LaTeX", "피드백"],
    keywords: ["AI 칠판", "클래스인 AI 칠판", "수식 인식", "손글씨 수식", "자동 채점", "AI 피드백", "학생 풀이 과정", "LaTeX 칠판"],
    chatbotSummary: "ClassIn 6.0.9 AI 칠판은 교사가 문항을 제시하면 AI가 모범 답안과 루브릭(채점 기준)을 자동 생성하고, 학생의 손글씨 수식 및 풀이 과정을 실시간으로 수집하여 단계별 정답/오답 판정과 1:1 맞춤 피드백을 즉시 제공하는 혁신적인 쌍방향 교실 도구입니다.",
    sections: [
      {
        heading: "1. AI 칠판 실행 및 교실 모드 준비",
        body: "온라인/하이브리드 교실 진입 후 교실 우측 도구함에서 'AI 칠판'을 실행합니다. 전체 화면 또는 분할 화면으로 판서 영역을 배치할 수 있습니다.",
        steps: ["교실 우측 도구함 목록에서 'AI 칠판' 아이콘 선택", "칠판 배경(블랙/화이트/그리드) 선택", "참여 학생 판서 권한 확인"]
      },
      {
        heading: "2. 문항 출제 및 AI 루브릭(채점 기준) 자동 생성",
        body: "교사가 문제를 텍스트, 이미지 또는 손글씨로 적으면, AI가 해당 문제를 파악하여 표준 답안과 단계별 배점 기준(루브릭)을 자동으로 생성합니다.",
        steps: ["문항 입력 창에 텍스트 또는 이미지 첨부", "'AI 답안 생성' 버튼 클릭", "제시된 모범 풀이 및 채점 기준 확인/수정"]
      },
      {
        heading: "3. 학생 손글씨 수식 인식 및 풀이 과정 수집",
        body: "학생들은 자신의 태블릿, PC 또는 전자칠판 화면에서 손글씨로 수식과 풀이 과정을 작성합니다. 고도화된 수식 인식 모델이 분수, 거듭제곱, 미적분, 기하 기호 등을 실시간으로 인식합니다.",
        steps: ["학생 화면에 개별 풀이 캔버스 활성화", "손글씨 펜 또는 수식 에디터로 풀이 작성", "실시간 자동 저장 및 교사 화면 전송"]
      },
      {
        heading: "4. 실시간 학생 답안 그리드 및 모니터링",
        body: "교사는 학급 전체 학생들의 풀이 현황을 바둑판식 카드 그리드로 한눈에 모니터링할 수 있습니다. 지각자, 미제출자, 진행 중, 제출 완료 상태가 색상으로 구분됩니다.",
        steps: ["교사 화면의 '학생 답안 그리드' 뷰 전환", "실시간 작성 중인 학생 화면 클릭 시 1:1 확대 확인", "필요 시 학생 화면에 실시간 첨삭 및 힌트 제공"]
      },
      {
        heading: "5. AI 자동 채점 및 1:1 맞춤 피드백 전송",
        body: "학생이 제출을 완료하면 AI가 모범 답안과 비교하여 최종 정답뿐 아니라 중간 풀이 과정의 오류까지 감지하여 단계별 감점 요인과 맞춤 피드백을 생성합니다.",
        steps: ["'일괄 AI 채점' 실행", "학생별 세부 점수 및 피드백 검토", "'피드백 전송'으로 학생 화면에 즉시 결과 공유"]
      },
      {
        heading: "6. 학급 학습 분석 및 취약점 리포트",
        body: "수업 후 학급 전체의 정답률, 주요 오답 패턴, 공통 취약 단원을 도표로 요약하여 다음 수업 설계에 바로 활용할 수 있습니다.",
        steps: ["AI 칠판 상단 '학습 결과 분석' 탭 클릭", "오답률 상위 문항 및 개념 분석 확인", "리포트 내보내기(PDF/Excel)로 학부모 상담 활용"]
      }
    ],
    resources: [
      { label: "ClassIn 6.0.9 비주얼 가이드", href: "/classin-609-update.html", description: "스크린샷과 함께 보는 전체 가이드" },
      { label: "AI 강의 분석 보고서 소개", href: "/docs/updates/classin-ai-lesson-analysis", description: "수업 후 제공되는 AI 강의 분석 보고서" }
    ],
    relatedSlugs: ["classin-609-update", "classin-ai-lesson-analysis"],
    status: "published",
    visibility: "public",
    docType: "guide",
    productArea: "classroom",
    difficulty: "intermediate",
  },
  {
    slug: "classin-ai-lesson-analysis",
    category: "updates",
    title: "AI 강의 분석(수업 품질 진단) 기능 소개 — 4개 영역 11개 항목 보고서",
    description: "클래스인 실시간 수업 녹화본을 AI가 수업 전달, 수업 분위기, 수업 상호작용, 언어 표현의 4개 영역 11개 항목으로 분석해 강사와 관리자에게 보고서를 제공합니다. 강사 자기 점검, 교사 성장 처방, 학원 평가표를 반영한 맞춤 분석 에이전트까지 안내합니다.",
    audience: "학원 원장, 교수부장, 강사, 교육 운영 관리자",
    updatedAt: "2026-10-28",
    readMinutes: 7,
    featured: true,
    tags: ["AI 강의 분석", "수업 품질 진단", "교사 성장 처방", "4개 영역", "녹화 분석", "AgentIn"],
    keywords: ["AI 강의 분석", "수업 품질 진단", "강의 평가", "교사 개발", "강사 자기 점검", "수업 분위기", "상호작용", "스캐폴딩", "맞춤 분석 에이전트"],
    chatbotSummary: "ClassIn AI 강의 분석(수업 품질 진단)은 클래스인 실시간 수업 녹화본을 AI가 분석해 수업 전달(효과성·흥미 몰입도·스캐폴딩), 수업 분위기(적극적 참여·협업·정서적 안전감), 수업 상호작용(공평성·반응성·자율성), 언어 표현(명료성·유창성, 표현력·전달력)의 4개 영역 11개 항목으로 보고서를 만듭니다. 핵심 강점·핵심 리스크·교사 성장 처방이 함께 나오고, 강사는 자기 수업 보고서만, 관리자는 강사별 비교를 봅니다. 관리자 일반 설정의 부가가치 서비스에서 켜고 수업 생성 시 옵션을 선택하며, 직접 업로드한 영상은 분석하지 않습니다. 학원 자체 평가표는 AgentIn 맞춤 분석 에이전트로 반영합니다.",
    sections: [
      {
        heading: "1. AI 강의 분석(수업 품질 진단)이란?",
        body: "관리자가 모든 수업을 참관하지 않아도 강사별 수업 품질을 같은 기준으로 확인하는 기능입니다. 클래스인 실시간 수업이 끝나면 녹화본을 AI가 분석해 종합 점수, 영역별 득점, 핵심 강점과 핵심 리스크, 다음 수업에서 바꿔 볼 행동(교사 성장 처방)을 한국어 보고서로 정리합니다. 점수는 참고 기준이고, 강사 면담과 코칭의 출발점으로 씁니다.",
        steps: ["수업 종료 후 클라우드 녹화본이 생성되면 자동 분석", "핵심 강점·핵심 리스크·교사 성장 처방을 근거 장면과 함께 정리", "강사는 자기 수업 보고서, 관리자는 강사별 비교 화면에서 확인"]
      },
      {
        heading: "2. 4개 영역 11개 항목",
        body: "평가 항목은 아래 4개 영역으로 구성됩니다. 강사에게 무엇을 기준으로 보는지 설명할 때 이 목록을 그대로 씁니다.\n\n1) 수업 전달: 효과성, 흥미·몰입도, 스캐폴딩(스스로 해결하도록 돕는 단계별 발판)\n2) 수업 분위기: 적극적 참여, 협업, 정서적 안전감(오답에도 위축되지 않는 환경)\n3) 수업 상호작용: 공평성(소외 없는 질문 분배), 반응성(학생 답변에 대한 즉각 피드백), 자율성(선택권 보장)\n4) 언어 표현: 명료성·유창성, 표현력·전달력",
        steps: ["영역별 득점과 종합 점수를 레이더 차트로 표시", "잘된 장면과 보완할 장면을 근거와 함께 제시", "학원 자체 평가표가 있으면 맞춤 분석 에이전트로 항목·배점을 바꿀 수 있음"]
      },
      {
        heading: "3. 보는 순서 — 강사 자기 점검, 코칭 근거, 관리자 비교",
        body: "보고서는 강사가 먼저 봅니다. 강사는 녹화 영상과 점수를 함께 보며 자기 수업을 복기하고, 관리자는 그 보고서를 강사 면담과 온보딩의 근거로 씁니다. 강사별 비교는 관리자만 볼 수 있고, 강사는 본인 수업 보고서만 봅니다.",
        steps: ["강사: ClassIn 앱 코스 → 수업 다시보기 → [AI 강의 분석] 탭 (해당 수업 강사만 열람)", "관리자: 관리자 페이지 학습 관리 → 교사 개발에서 강사별 최근 수업 점수·주요 이슈 비교, 보고서 열람·다운로드", "면담에서는 점수보다 핵심 강점·핵심 리스크·다음 수업에서 바꿀 행동을 이야기합니다"]
      },
      {
        heading: "4. 활성화 설정과 분석 범위",
        body: "원장 또는 기관 최고 관리자가 관리자 설정에서 기능을 켜고, 수업을 만들 때 분석 여부를 선택합니다. 분석 대상은 클래스인 실시간 수업 녹화본이며, 외부에서 녹화해 직접 업로드한 영상은 분석하지 않습니다.",
        steps: ["관리자 계정 정보 → 일반 설정 → 부가가치 서비스 → [AI 강의 분석] 켜기", "수업 생성 화면에서 [AI 강의 분석] 옵션 선택, 필요하면 분석 에이전트 선택", "평소처럼 수업을 진행하면 녹화본이 자동 저장되고 분석이 이어집니다"]
      },
      {
        heading: "5. 맞춤 분석 에이전트 — 우리 학원 평가표로 분석하기",
        body: "학원 자체 강의 평가표가 있다면 AgentIn에서 「수업 분석」 템플릿으로 에이전트를 만들어 항목·배점·차트를 학원 기준으로 바꿀 수 있습니다. 만든 에이전트는 기관 강사 수업에 공통으로 적용합니다.",
        steps: ["AgentIn → AI 에이전트 생성 → 템플릿으로 생성 → 「수업 분석」 템플릿 선택", "이름·소개를 입력하고 분석 항목, 차트 항목, 배점 규칙을 학원 기준으로 수정", "공개 범위(본인·기관 전용 또는 스토어 공개)를 고른 뒤 저장", "수업 생성 → AI 강의 분석 ON → 「AgentIn 에이전트 추가」에서 선택 (AgentIn·강의 분석 권한 개통 필요)"]
      }
    ],
    resources: [
      { label: "클래스인 AI 기능 소개서", href: "/classin-ai-feature-guide.html", description: "AI 강의 분석 보고서 화면과 역할별 사용 순서" },
      { label: "ClassIn 6.0.9 비주얼 가이드", href: "/classin-609-update.html", description: "대시보드 스크린샷과 평가 영역 확인" },
      { label: "AI 칠판 완벽 활용 가이드", href: "/docs/updates/classin-ai-blackboard-609", description: "AI 칠판과 실시간 채점 가이드" }
    ],
    relatedSlugs: ["classin-609-update", "classin-ai-blackboard-609"],
    status: "published",
    visibility: "public",
    docType: "guide",
    productArea: "admin",
    difficulty: "intermediate",
  },
  {
    slug: "classin-ai-feature-guide",
    category: "software",
    title: "클래스인 AI 기능 소개서",
    description: "AI 강의 분석·AI 칠판·AI 에이전트의 주요 기능과 사용 방법, 역할별 활용과 활성화 조건을 확인합니다.",
    audience: "AI 기능 도입을 검토하는 원장·관리자, 수업에 활용하는 강사와 학생",
    updatedAt: "2026-10-26",
    readMinutes: 3,
    tags: ["AI", "기능 소개서", "AI 강의 분석", "AI 칠판", "AI 에이전트"],
    keywords: ["AI 소개서", "AI 기능", "AgentIn", "AI 채점", "따라 읽기", "받아쓰기", "외워 말하기", "수업 분석", "활성화", "사용 방법"],
    chatbotSummary: "클래스인 AI 기능 소개서는 AI 강의 분석·AI 칠판·AI 에이전트의 기능과 사용 순서를 제공합니다. AI 칠판과 교실 안 AgentIn은 담당 매니저에게 활성화를 요청하며, AI 칠판은 강사·학생 앱 6.0.9 이상이 필요합니다.",
    sections: [
      {
        heading: "AI 기능을 화면과 함께 살펴보세요",
        body: "원장·관리자는 도입 전 기능과 제공 조건을 비교하고, 강사·학생은 수업에서 사용할 기능의 순서를 확인할 때 읽는 소개서입니다. 아래 ‘AI 기능 소개서 열기’에서 원본을 열면 기능 검색, 목차 이동, 화면 확대를 사용할 수 있습니다.",
        steps: [
          "AI 강의 분석: 녹화 수업의 분석 보고서, 강사별 수업 품질 확인, 맞춤 분석 에이전트 설정을 살펴봅니다.",
          "AI 칠판: 문항 출제, 학생 답안 확인, AI 채점, 반 전체 진단 순서를 확인합니다.",
          "AI 에이전트: 따라 읽기·받아쓰기·외워 말하기, 숙제 생성과 채점, 수업 요약과 교실 안 AgentIn을 살펴봅니다. 학생 질문에 답하는 AI 튜터는 AgentIn에서 학원 기준으로 튜닝한 에이전트로 제공됩니다.",
        ],
      },
      {
        heading: "사용 전에 확인하세요",
        body: "소개서는 ClassIn 6.0.9 기준입니다. 기능 제공 범위는 계약 플랜과 지원 환경에 따라 다를 수 있으므로, 소개서의 지원 환경과 참고 항목을 함께 확인하세요.",
        steps: [
          "AI 칠판·교실 안 AgentIn은 담당 매니저에게 활성화를 요청합니다.",
          "AI 칠판을 사용하기 전에 강사·학생 앱을 모두 6.0.9 이상으로 업데이트합니다.",
          "AI 강의 분석은 관리자 일반 설정에서 켜고 수업 생성 시 옵션을 선택합니다.",
          "AI 채점 결과는 강사가 검토하고, 서술형 숙제의 점수·총평 초안은 확인 후 게시합니다.",
        ],
      },
    ],
    resources: [
      { label: "AI 기능 소개서 열기", href: "/classin-ai-feature-guide.html", description: "주요 AI 기능과 사용 방법을 실제 화면으로 확인하는 원본 소개서입니다." },
      { label: "클래스인 전체 기능 소개서", href: "/classin-feature-guide.html", description: "수업·과제·운영 기능도 함께 살펴보세요." },
    ],
    relatedSlugs: ["ai-features", "ai-learning-tools", "classin-609-update", "classin-ai-blackboard-609"],
    status: "published",
    visibility: "public",
    docType: "guide",
    productArea: "software",
    difficulty: "beginner",
  },
  {
    slug: "classin-ai-feature-guide-published",
    category: "updates",
    title: "클래스인 AI 기능 소개서 공개",
    description: "AI 강의 분석·AI 칠판·AI 에이전트를 모은 소개서를 공개하고, 소프트웨어·가이드·업데이트 화면에 바로가기를 추가했습니다.",
    audience: "클래스인 AI 기능을 살펴보는 원장·관리자·강사",
    updatedAt: "2026-10-26",
    readMinutes: 2,
    tags: ["가이드 업데이트", "AI", "기능 소개서"],
    keywords: ["AI 소개서 공개", "AI 강의 분석", "AI 칠판", "AI 에이전트", "사용 가이드"],
    chatbotSummary: "2026년 10월 26일 클래스인 AI 기능 소개서를 공개했습니다. 소프트웨어 페이지, 가이드와 업데이트에서 열 수 있으며, AI 강의 분석·AI 칠판·AI 에이전트의 주요 기능과 사용 방법을 확인할 수 있습니다.",
    sections: [
      {
        heading: "AI 기능 소개서를 추가했습니다",
        body: "AI 강의 분석·AI 칠판·AI 에이전트의 기능, 주 사용자, 지원 환경과 사용 순서를 한 문서에 모았습니다. 기존 전체 기능 소개서와 함께 소프트웨어 페이지와 가이드에서 열 수 있습니다.",
      },
      {
        heading: "우리 학원의 사용 조건을 확인하세요",
        body: "소개서에서 사용하려는 기능을 검색한 뒤 지원 환경과 활성화 순서를 확인하세요. AI 칠판·교실 안 AgentIn의 활성화는 담당 매니저에게 요청하고, AI 칠판은 강사·학생 앱 6.0.9 이상에서 사용합니다.",
      },
    ],
    resources: [{ label: "AI 기능 소개서 보기", href: "/classin-ai-feature-guide.html" }],
    relatedSlugs: ["classin-ai-feature-guide", "classin-609-update", "classin-ai-blackboard-609"],
    status: "published",
    visibility: "public",
    docType: "release_note",
    productArea: "software",
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
