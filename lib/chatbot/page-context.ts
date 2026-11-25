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
    // 학생·학부모도 홈으로 들어온다 — 앞 4개 안에 수업 들어가는 법 하나를 둔다(2026-11-25 CX-20)
    "아이가 수업에 어떻게 들어가요?",
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

// 문서 종류별 첫 칩(2026-11-25 CX-20). 문구는 이미 쓰던 칩만 쓰고, 빈 환경 /api/chatbot/query 에서
// '찾지 못했어요'가 아닌 답(direct_answer·handoff)이 나오는 것만 골랐다. 티저·인텐트는 DOCS 그대로다.
// 문제 해결 문서: 증상 칩과 사람 연결 칩. 문서 끝 '챗봇에게 묻기'가 문서 제목으로 입력을 미리 채운다.
const DOCS_TROUBLESHOOTING: PageContext = {
  ...DOCS,
  key: "docs-troubleshooting",
  starters: [
    "방금 본 내용을 우리 학원 상황에 맞게 정리해줄 수 있나요?",
    "카메라가 안 켜져요",
    "로그인이 안 돼요",
    "상담원 연결해 주세요",
  ],
}

// 학생 문서: 읽는 사람이 학생·학부모라 원장용 칩('우리 학원 상황에 맞게')을 빼고 수업 들어가기·다시보기·숙제로 둔다.
const DOCS_STUDENT: PageContext = {
  ...DOCS,
  key: "docs-student",
  starters: [
    "아이가 수업에 어떻게 들어가요?",
    "다시보기는 어디서 봐요?",
    "숙제 제출이 안 돼요",
    "카메라가 안 켜져요",
  ],
}

// 전자칠판·장비 문서
const DOCS_HARDWARE: PageContext = {
  ...DOCS,
  key: "docs-hardware",
  starters: [
    "방금 본 내용을 우리 학원 상황에 맞게 정리해줄 수 있나요?",
    "전자칠판 모델 차이가 뭐예요?",
    "전자칠판 화면이 안 켜져요",
    "칠판 A/S는 어떻게 받아요?",
  ],
}

// /about·/faq 처럼 따로 정하지 않은 곳. 첫 칩은 용어 없는 소개다(전에는 '수업 시스템 OS 관점'이 먼저 보였다).
const DEFAULT: PageContext = {
  key: "default",
  teaser: "",
  starters: [
    "클래스인이 뭐예요? 쉽게 알려 주세요",
    "도입 전 확인 질문을 알려주세요",
    "요금과 전자칠판 패키지 견적이 궁금해요",
  ],
  teaserEligible: false,
}

// 문제 해결 문서는 분류(start·teacher·admin·student)에 흩어져 있어 주소 끝 이름으로 가린다.
// lib/docs-troubleshooting 의 문서가 늘면 tests/chatbot/page-context.test.ts 가 빠진 이름을 알려 준다.
const TROUBLESHOOTING_DOC_PATH = /^\/docs\/(?:(?:troubleshooting|help)(?:\/|$)|[^/]+\/(?:[^/]*-troubleshooting|app-update-cache-reinstall)\/?$)/

const ENTRIES: Array<{ match: (path: string) => boolean; context: PageContext }> = [
  { match: (p) => p === "/", context: HOME },
  { match: (p) => p.startsWith("/product"), context: PRODUCT },
  { match: (p) => p.startsWith("/contact"), context: CONTACT },
  { match: (p) => TROUBLESHOOTING_DOC_PATH.test(p), context: DOCS_TROUBLESHOOTING },
  { match: (p) => p.startsWith("/docs/student/"), context: DOCS_STUDENT },
  { match: (p) => p.startsWith("/docs/hardware/") || p.startsWith("/docs/board/"), context: DOCS_HARDWARE },
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
