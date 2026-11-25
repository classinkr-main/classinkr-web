/**
 * 챗봇 → 채널톡 상담 전환 글(봇 글)의 머리말·쉬운 말 라벨·읽기 규칙.
 *
 * 쓰는 쪽(lib/chatbot/channel-handoff.ts formatHandoffMessage)과 읽는 쪽(lib/channel-talk-sync.ts 첫 질문 대체값)이
 * 같은 규칙을 보게 한 곳에 둔다. 서버 전용 의존이 없는 순수 함수만 둔다.
 *
 * 글 형식은 두 가지가 섞여 남아 있다. 읽는 쪽은 둘 다 읽어야 한다.
 * - 옛 형식(2026-11 이전): "[챗봇 상담 전환]" → 전환 사유·문의 유형 등 코드 줄 → "[고객 질문]" → "[AI 답변]" → "[참고 문서]"
 * - 새 형식: "[챗봇 상담 전환] <목적> — <쉬운 말 사유>" → "[고객 질문]" → "[앞서 물은 내용]"(있으면) → "[연락 방법]"
 *   → "[챗봇 답 요약]" → "[사용자 피드백]"(있으면) → "[참고 문서]" → 맨 끝 "[기술 정보]"(코드 값)
 */

export const HANDOFF_MESSAGE_MARKER = "[챗봇 상담 전환]"
export const HANDOFF_QUESTION_HEADER = "[고객 질문]"
export const HANDOFF_ROUTING_QUESTION_PREFIX = "검색용 질문(직전 대화로 넓힘):"

const REASON_LABELS: Record<string, string> = {
  not_helpful_feedback: "고객이 챗봇 답에 '별로예요'를 눌렀어요",
  needs_handoff: "챗봇이 상담원 연결이 필요하다고 판단했어요",
  answer_mode_handoff: "챗봇이 상담원 연결로 안내했어요",
  answer_mode_fallback: "챗봇이 알맞은 답을 찾지 못했어요",
  unresolved: "질문이 풀리지 않은 채 남았어요",
  low_confidence: "챗봇 답에 확신이 낮았어요",
  category_billing: "결제·요금 문의예요",
  intent_billing_support: "결제·요금 문의예요",
  category_hardware: "기기(하드웨어) 문의예요",
  intent_hardware_support: "기기(하드웨어) 문의예요",
  category_troubleshooting: "오류·장애 문의예요",
  intent_troubleshooting: "오류·장애 문의예요",
  category_consultation: "도입 상담 문의예요",
  intent_sales_consulting: "도입 상담 문의예요",
  question_keyword: "질문에 상담·견적·오류 같은 말이 들어 있어요",
}

/** 전환 사유 코드를 상담원이 읽을 쉬운 말로 바꾼다. 같은 뜻은 한 번만, 모르는 코드는 그대로 둔다. */
export function describeHandoffReasons(reasons: string[], max = 3): string {
  const labels: string[] = []
  for (const reason of reasons) {
    const label = REASON_LABELS[reason] ?? reason
    if (!labels.includes(label)) labels.push(label)
  }
  if (labels.length === 0) return "챗봇이 상담원 연결을 요청했어요"
  return labels.slice(0, max).join(" · ")
}

export function describeHandoffIntent(intent: string | null | undefined): string {
  if (intent === "support") return "이용 지원"
  if (intent === "demo") return "도입 상담"
  return "상담"
}

const SECTION_HEADER_RE = /^\[[^\]\n]{1,40}\]\s*$/

/** 상담 전환 봇 글인지(옛·새 형식 공통 머리말). */
export function isHandoffMessage(text: string | null | undefined): boolean {
  return typeof text === "string" && text.trimStart().startsWith(HANDOFF_MESSAGE_MARKER)
}

/**
 * 상담 전환 봇 글에서 [고객 질문] 본문만 뽑는다(옛·새 형식 둘 다). 검색용 질문 줄은 뺀다.
 * 전환 글이 아니거나 질문 칸이 비었으면 undefined.
 */
export function extractHandoffCustomerQuestion(text: string | null | undefined): string | undefined {
  if (!isHandoffMessage(text)) return undefined
  const lines = (text as string).replace(/\r\n?/g, "\n").split("\n")
  const start = lines.findIndex((line) => line.trim() === HANDOFF_QUESTION_HEADER)
  if (start < 0) return undefined
  const body: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (SECTION_HEADER_RE.test(line.trim())) break
    if (line.trim().startsWith("────")) break
    if (line.trim().startsWith(HANDOFF_ROUTING_QUESTION_PREFIX)) continue
    body.push(line)
  }
  const question = body.join("\n").trim()
  return question || undefined
}
