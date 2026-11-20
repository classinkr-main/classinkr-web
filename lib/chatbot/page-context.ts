export type ChatbotIntent = "demo" | "support"

export interface PageContext {
  key: string
  teaser: string
  starters: string[]
  intent?: ChatbotIntent
  teaserEligible: boolean
}

// 홈은 처음 온 사람이 가장 많이 본다. 위젯은 앞의 4개만 보여 주므로, 용어(EDB·LMS) 없이 묻는 쉬운 말 칩을 맨 앞에 둔다
// (2026-11-20 조사 G9). 소개 답은 '무엇인지 → 누가 쓰는지 → 다음 할 일' 순서다(lib/chatbot/service.ts getIdentityAnswer).
const HOME: PageContext = {
  key: "home",
  teaser: "도입부터 운영까지, 막히는 지점 편하게 물어보세요.",
  starters: [
    "클래스인이 뭐예요? 쉽게 알려 주세요",
    "Classin이 Zoom이나 일반 전자칠판과 뭐가 다른가요?",
    "요금/견적은 어떤 항목으로 구성되나요?",
    "우리 학원 90일 도입 순서를 어떻게 잡으면 좋을까요?",
    "전자칠판·녹화·EDB·LMS를 수업 흐름으로 쓰는 방법이 궁금해요",
  ],
  intent: "demo",
  teaserEligible: true,
}

const PRODUCT: PageContext = {
  key: "product",
  teaser: "전자칠판·녹화·EDB·LMS, 수업 흐름으로 어떻게 쓰는지 정리해드려요.",
  starters: [
    "전자칠판·녹화·EDB·LMS를 수업 흐름으로 쓰는 방법이 궁금해요",
    "Classin 전자칠판은 일반 전자칠판과 뭐가 다른가요?",
    "EDB 교안은 어떻게 재사용하나요?",
    "우리 학원 도입 순서를 어떻게 잡으면 좋을까요?",
  ],
  intent: "demo",
  teaserEligible: true,
}

const CONTACT: PageContext = {
  key: "contact",
  teaser: "상담 전에 미리 정리해드릴까요? 도입·운영·견적 무엇이든요.",
  starters: [
    "도입 전 확인해야 할 것들을 알려주세요",
    "우리 학원 90일 도입 순서가 궁금해요",
    "요금/견적은 어떤 항목으로 구성되나요?",
    "전자칠판 설치·온보딩은 어떻게 진행되나요?",
  ],
  intent: "demo",
  teaserEligible: true,
}

// 문서 페이지의 "방금 본 내용…" 칩은 위젯이 보내는 문서 경로(context.path)로 그 문서 절을 먼저 찾는다
// (lib/chatbot/conversation-context.ts page_context, 2026-11-20 조사 G10).
const DOCS: PageContext = {
  key: "docs",
  teaser: "이 문서 관련해서 더 궁금한 점, 바로 물어보세요.",
  starters: [
    "방금 본 내용을 우리 학원 상황에 맞게 정리해줄 수 있나요?",
    "수업 전 10분 루틴은 어떻게 잡나요?",
    "교사 온보딩은 어떤 순서로 하나요?",
    "출결·보강 운영은 어떻게 하나요?",
  ],
  intent: "support",
  teaserEligible: true,
}

const DEFAULT: PageContext = {
  key: "default",
  teaser: "",
  starters: [
    "수업 시스템 OS 관점으로 설명해 주세요",
    "도입 전 확인 질문을 알려주세요",
    "요금과 전자칠판 패키지 견적이 궁금해요",
  ],
  teaserEligible: false,
}

const ENTRIES: Array<{ match: (path: string) => boolean; context: PageContext }> = [
  { match: (p) => p === "/", context: HOME },
  { match: (p) => p.startsWith("/product"), context: PRODUCT },
  { match: (p) => p.startsWith("/contact"), context: CONTACT },
  { match: (p) => p.startsWith("/docs"), context: DOCS },
]

export function resolvePageContext(pathname: string | null | undefined): PageContext {
  const path = pathname ?? ""
  return ENTRIES.find((entry) => entry.match(path))?.context ?? DEFAULT
}

export function mergeStarters(
  pageStarters: string[],
  dynamicStarters: string[],
  limit: number
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of [...pageStarters, ...dynamicStarters]) {
    const trimmed = value?.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
    if (out.length >= limit) break
  }
  return out
}
