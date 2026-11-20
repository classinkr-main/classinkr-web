/**
 * 못 찾음·확정 못 함 고정 답.
 *
 * 문구는 service.ts 의 같은 이름 상수와 글자 하나까지 같아야 한다(tests/chatbot/after-gate-fixed-answers.test.ts 가 확인한다).
 * tone.ts(첫마디)·follow-up.ts(끝 질문)·service.ts(isUnverifiedFixedAnswer)가 같은 목록을 보도록 한 곳에서 내보낸다.
 * 이 파일은 다른 모듈을 가져오지 않는다(tone·follow-up 과 순환하지 않게).
 */

export const NO_SOURCE_FACT_ANSWER = [
  "이 질문에 대한 내용은 공개 안내에서 찾지 못했어요. 확인되지 않은 내용을 추측해 말씀드리지 않을게요.",
  "정확한 답이 필요하시면 \"상담원 연결\"이라고 남겨 주세요. 담당자가 확인해 이어서 도와드려요.",
].join("\n\n")

export const WEAK_SOURCE_DRAFT_ANSWER = [
  "이 질문에 딱 맞는 안내는 아직 찾지 못했어요. 엉뚱한 내용을 붙여 드리기보다 정확히 확인해 드릴게요.",
  "궁금한 점을 조금만 더 구체적으로 적어 주시거나, \"상담원 연결\"이라고 남겨 주시면 담당자가 이어서 도와드려요.",
].join("\n\n")

export const POLICY_TOPIC_AFTER_GATE_ANSWER = [
  "이 질문은 채팅에서 확정해 말씀드리기 어려운 내용이라, 추측해 답하지 않을게요.",
  "아래 상담 버튼으로 남겨 주시면 담당자가 확인해 정확히 안내해 드려요.",
].join("\n\n")

export const MODEL_UNAVAILABLE_ANSWER = [
  "지금은 안내 문서에서 답을 확인하지 못했어요. 추측해서 답하지는 않을게요.",
  "잠시 뒤 다시 물어봐 주시거나, 아래 상담 버튼으로 남겨 주시면 담당자가 확인해 안내해 드려요.",
].join("\n\n")

export const SYMPTOM_AFTER_GATE_ANSWER = [
  "딱 맞는 해결 안내를 아직 찾지 못했어요. 추측해서 안내하지는 않을게요.",
  "아래 상담 버튼으로 증상을 남겨 주시면 기술지원 담당자가 확인해 드려요.",
].join("\n\n")

/**
 * 모델 차단기가 열려 있어 호출 자체를 하지 않은 경우의 MODEL_UNAVAILABLE 변형.
 * 차단기가 열린 동안은 곧바로 다시 물어도 같은 결과라 "잠시 뒤 다시"를 뺀다. 첫 문단은 MODEL_UNAVAILABLE_ANSWER 와 같아 같은 목록으로 알아본다.
 */
export const MODEL_UNAVAILABLE_CIRCUIT_OPEN_ANSWER = [
  "지금은 안내 문서에서 답을 확인하지 못했어요. 추측해서 답하지는 않을게요.",
  "아래 상담 버튼으로 남겨 주시면 담당자가 확인해 안내해 드려요.",
].join("\n\n")

/** 못 찾음·확정 못 함 고정 답 전체(차단기용 변형 제외). */
export const UNVERIFIED_FIXED_ANSWERS: readonly string[] = [
  NO_SOURCE_FACT_ANSWER,
  WEAK_SOURCE_DRAFT_ANSWER,
  POLICY_TOPIC_AFTER_GATE_ANSWER,
  MODEL_UNAVAILABLE_ANSWER,
  SYMPTOM_AFTER_GATE_ANSWER,
]

function firstParagraph(text: string) {
  return text.split("\n\n")[0]
}

/** 고정 답의 첫 문단 목록. 말투 층이 앞뒤에 문장을 붙여도 알아보는 데 쓴다. */
export const UNVERIFIED_FIXED_FIRST_PARAGRAPHS: readonly string[] = [
  ...new Set([...UNVERIFIED_FIXED_ANSWERS, MODEL_UNAVAILABLE_CIRCUIT_OPEN_ANSWER].map(firstParagraph)),
]

/** 답이 '못 찾음·확정 못 함' 고정 답인지. 앞에 첫마디가 붙었거나 뒤에 문장이 붙어도 첫 문단으로 알아본다. */
export function isUnverifiedFixedAnswerText(answer: string) {
  return UNVERIFIED_FIXED_FIRST_PARAGRAPHS.some((paragraph) => answer.includes(paragraph))
}
