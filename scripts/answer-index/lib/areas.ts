/**
 * 영역 지정 표(§4.1 영역 12개). 질문이 아니라 문서 slug·절 제목·분류·답 id 로만 정한다.
 *
 * 우선순위
 * - 문서 단위: 절 지정(SECTION_AREA) → 절 제목 규칙(HEADING_AREA_RULES) → 문서 지정(DOC_AREA) → 문서 분류 기본값(CATEGORY_AREA)
 * - 공개 가이드: 제목 규칙(GUIDE_TITLE_RULES) → 가이드 분류 기본값(GUIDE_CATEGORY_AREA)
 * - 정해 둔 답: 근거 문서가 있으면 그 문서 단위의 영역 → 답 id 규칙(ANSWER_ID_RULES) → 답 분류 기본값(ANSWER_CATEGORY_AREA)
 *
 * 표를 바꾸면 units.json·inventory.json 을 다시 만든다(npm run answer-index:extract).
 */
import type { AnswerIndexArea } from "@/lib/chatbot/answer-index/types"

/** 문서 분류(DocCategoryId) 기본값. */
export const CATEGORY_AREA: Record<string, AnswerIndexArea> = {
  "quick-start": "start",
  start: "start",
  guides: "classroom",
  manual: "classroom",
  help: "support",
  troubleshooting: "support",
  updates: "classroom",
  software: "classroom",
  admin: "admin",
  teacher: "course",
  student: "classroom",
  hardware: "board",
  board: "board",
}

/** 문서(<category>/<slug>) 지정. 분류 기본값과 같으면 적지 않는다. */
export const DOC_AREA: Record<string, AnswerIndexArea> = {
  // start
  "start/signup": "account",
  "start/password-change-pc": "account",
  "start/password-change-mobile": "account",
  "start/login-troubleshooting": "account",
  "start/class-connection-troubleshooting": "classroom",
  "start/pre-adoption-faq-22-questions": "company",
  "start/camera-mic-troubleshooting": "classroom",
  "start/academy-system-os-positioning": "company",
  "start/customer-stories": "company",
  "start/why-classin-needs": "company",
  "start/value-and-cost-framing": "pricing",
  "start/adoption-journey-90days": "company",
  "start/company-overview": "company",
  // software
  "software/lesson-activities": "homework",
  "software/ai-learning-tools": "homework",
  "software/admin-monitoring-analytics": "recording",
  "software/app-capabilities-map": "company",
  "software/classin-ai-feature-guide": "company",
  "software/software-overview": "company",
  "software/software-pricing-quote-bundle-faq": "pricing",
  // admin
  "admin/course-creation": "course",
  "admin/course-management": "course",
  "admin/web-live-playback": "classroom",
  "admin/statistics-data": "recording",
  "admin/recording-file-troubleshooting": "recording",
  "admin/replay-troubleshooting": "recording",
  "admin/billing-upgrade": "pricing",
  // teacher
  "teacher/teacher-profile": "account",
  "teacher/drive-materials": "classroom",
  "teacher/course-activities": "homework",
  "teacher/lesson-web-live": "classroom",
  "teacher/classroom-basic-setup": "classroom",
  "teacher/recording-troubleshooting": "recording",
  "teacher/classin-607-update": "classroom",
  // student
  "student/student-profile": "account",
  "student/todo-calendar": "homework",
  "student/course-join": "course",
  "student/class-report": "recording",
  "student/course-submit-activity": "homework",
  "student/course-grades": "homework",
  "student/ai-features": "homework",
  "student/homework-submit-troubleshooting": "homework",
  // updates
  "updates/classin-ai-lesson-analysis": "recording",
  "updates/classin-ai-feature-guide-published": "company",
}

/** 절 지정(<category>/<slug>#<절 번호>). 한 문서 안에 여러 영역의 절이 섞인 경우. */
export const SECTION_AREA: Record<string, AnswerIndexArea> = {
  "start/pre-adoption-faq-22-questions#1": "admin",
  "start/pre-adoption-faq-22-questions#2": "pricing",
  "start/pre-adoption-faq-22-questions#3": "recording",
  "start/pre-adoption-faq-22-questions#4": "trust",
  "start/pre-adoption-faq-22-questions#5": "board",
  "start/company-overview#5": "board",
  "start/why-classin-needs#7": "company",
  "software/app-capabilities-map#1": "homework",
  "software/app-capabilities-map#2": "classroom",
  "software/app-capabilities-map#4": "recording",
  "software/app-capabilities-map#5": "classroom",
  "admin/account-verification#0": "admin",
}

/** 절 제목 규칙. 위에서부터 처음 맞는 규칙을 쓴다. */
export const HEADING_AREA_RULES: { pattern: RegExp; area: AnswerIndexArea }[] = [
  { pattern: /개인정보|보안|데이터\s*(?:삭제|보관)/, area: "trust" },
  { pattern: /요금|가격|견적|결제|비용|무료\s*체험|환불|계약/, area: "pricing" },
  { pattern: /문의할\s*때|문의\s*정보|상담을\s*요청|보낼\s*정보|알려\s*줄\s*정보|함께\s*보내|그래도\s*반복되면\s*문의/, area: "support" },
]

/** 공개 가이드 제목 규칙. 위에서부터 처음 맞는 규칙을 쓴다. */
export const GUIDE_TITLE_RULES: { pattern: RegExp; area: AnswerIndexArea }[] = [
  { pattern: /로그인|회원\s*가입|회원가입|계정\s*삭제|탈퇴|하위\s*계정|비밀번호/, area: "account" },
  { pattern: /데이터\s*로그|에러\s*안내/, area: "support" },
  { pattern: /다운로드\s*\/|Windows|안드로이드|업데이트|캐시|재설치|앱\s*다운로드|설치/, area: "start" },
  { pattern: /녹화|다시\s*보기|다시보기|플레이백|학습\s*보고서|참여\s*내역|통계|답안\s*현황|모니터링|수업\s*상세|수업\s*정보|사용\s*내역/, area: "recording" },
  { pattern: /시험|숙제|과제|학습\s*활동|따라\s*읽기|따라읽기|스피킹|AI\s*Board|AI\s*채점|채점/, area: "homework" },
  { pattern: /스토리지|공유\s*드라이브|AI\s*비활성화/, area: "admin" },
  { pattern: /코스|구성원|멤버|초대|수업\s*삭제|온스테이지|닉네임|교사\s*설[정졍]|New\s*Course|편입생|참관생|임시\s*수업|과정|대리\s*등록|QR/i, area: "course" },
  { pattern: /웹\s*라이브|카메라|마이크|판서|EDX|EDB|링크\s*자료|비디오\s*갤러리|전자칠판|IFP/i, area: "classroom" },
]

export const GUIDE_CATEGORY_AREA: Record<string, AnswerIndexArea> = {
  classroom: "classroom",
  admin: "admin",
  troubleshooting: "support",
  onboarding: "start",
}

/** 정해 둔 답 id(접두 없는 모듈 안 id) 규칙. 위에서부터 처음 맞는 규칙을 쓴다. */
export const ANSWER_ID_RULES: { pattern: RegExp; area: AnswerIndexArea }[] = [
  { pattern: /phishing|privacy|personal-info|pii|security|dpa|gdpr|server|encrypt|isms|leak|hack|consent|cctv|data-(?:location|delete|deletion|retention|export|transfer)|china-company|overseas-transfer/, area: "trust" },
  { pattern: /refund|payment|price|pricing|billing|invoice|receipt|tax|vat|discount|quote|contract|installment|subscription|charge|cost|fee|trial|renew|cancel|plan-|-plan|card-/, area: "pricing" },
  { pattern: /login|password|signup|sign-up|account|verification-code|nickname|profile|withdraw|id-/, area: "account" },
  { pattern: /record|replay|playback|statistic|analytics|attendance|report/, area: "recording" },
  { pattern: /homework|exam|quiz|assignment|lms|grade|activity|ai-tutor|ai-eval/, area: "homework" },
  { pattern: /course|member|invite|enroll|lesson-create|schedule|timetable/, area: "course" },
  { pattern: /app-|download|update|cache|install-app|macbook|ipad|tablet|android|ios|windows|chromebook|device|pc-/, area: "start" },
  { pattern: /board|ifp|hardware|camera|mic|speaker|ops|stand|wall-mount|monitor|hdmi|pen|showroom-device/, area: "board" },
  { pattern: /admin|institution|teacher-add|storage|drive|dashboard|sub-account|staff/, area: "admin" },
  { pattern: /company|ceo|founded|office|showroom|competitor|zoom|compare|case|customer|reference|adoption|demo|partner|entity|overseas/, area: "company" },
  { pattern: /chat|whiteboard|screen-share|classroom|breakout|stage|raise-hand|kick|mute|web-live/, area: "classroom" },
  { pattern: /contact|support|handoff|consult|human|agent|error|bug|vague/, area: "support" },
]

/** 정해 둔 답 분류 기본값. */
export const ANSWER_CATEGORY_AREA: Record<string, AnswerIndexArea> = {
  billing: "pricing",
  consultation: "company",
  hardware: "board",
  admin: "admin",
  troubleshooting: "support",
  classroom: "classroom",
  onboarding: "start",
  general: "company",
  event: "company",
  security: "trust",
  concern: "support",
}

export function docKey(category: string, slug: string) {
  return `${category}/${slug}`
}

/** 문서 절(또는 요약: sectionIndex null)의 영역. */
export function areaForDocSection(category: string, slug: string, sectionIndex: number | null, heading: string | null): AnswerIndexArea {
  const key = docKey(category, slug)
  if (sectionIndex !== null) {
    const section = SECTION_AREA[`${key}#${sectionIndex}`]
    if (section) return section
    if (heading) {
      const rule = HEADING_AREA_RULES.find((candidate) => candidate.pattern.test(heading))
      if (rule) return rule.area
    }
  }
  return DOC_AREA[key] ?? CATEGORY_AREA[category] ?? "support"
}

export function areaForGuide(title: string, category: string): AnswerIndexArea {
  const rule = GUIDE_TITLE_RULES.find((candidate) => candidate.pattern.test(title))
  if (rule) return rule.area
  return GUIDE_CATEGORY_AREA[category] ?? "support"
}

export function areaForAnswerId(sourceId: string, category: string | null): AnswerIndexArea {
  const rule = ANSWER_ID_RULES.find((candidate) => candidate.pattern.test(sourceId))
  if (rule) return rule.area
  return (category && ANSWER_CATEGORY_AREA[category]) || "support"
}

/** 자기소개·잡담 답(self-knowledge.ts key). */
export const SELF_AREA: Record<string, AnswerIndexArea> = {
  privacy_boundary: "trust",
  input_privacy: "trust",
  memory_boundary: "trust",
  event_inquiry: "company",
  event_apply_assist: "company",
  tutor_pricing_recommend: "pricing",
  feature_limit_consulting: "company",
}
