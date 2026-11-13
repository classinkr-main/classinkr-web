/**
 * 첫 방문자가 한 줄로 묻는 '기본 사실' 질문의 정해 둔 답.
 * 회사·대표, 전자칠판 필수 여부, 지원 기기, 인원·보관 기간 같은 한도, 그리고 원가·고객사 이름처럼 답하지 않는 것까지 다룬다.
 *
 * 왜 따로 두나
 * - quick-answers-field.ts 의 답은 길고 구체적인 상황 질문에 맞춘 좁은 패턴이다. 그래서 "맥북에도 깔리나요?",
 *   "대표는 누구인가요?", "한 교실에 최대 몇 명?" 같은 한 줄 질문은 거기에 닿지 못하고 약한 문서 검색으로 빠져
 *   엉뚱한 문서 조각이나 되묻기가 나갔다(2026-11-13 점검: 첫 방문자 질문 180개 가운데 제대로 답한 것이 24%).
 *
 * 지키는 것 (quick-answers-field.ts 와 같다)
 * - 사실은 공개 문서(lib/docs.ts, lib/docs-troubleshooting/*.ts, lib/classin-positioning.ts)에 있는 것만 쓴다.
 *   답마다 근거 문서(docPath)를 달고, 테스트(tests/chatbot/basics-quick-answers.test.ts)가 그 문서가 실제로 공개돼 있는지 본다.
 * - 문서에 없는 숫자·기간·가격·위치는 말하지 않는다. "공개 안내에 없다"고 밝히고 상담으로 넘긴다.
 * - 가격·할인·환불·복구를 약속하지 않는다. 아이디·전화번호·카드 번호를 채팅창에 적으라고 하지 않는다.
 * - 짧고 단순한 질문에만 쓴다(isPlainFactQuestion). 길거나 증상이 섞인 질문은 기존 정해 둔 답·증상 안내·문서 검색이 맡는다.
 * - 기존 정해 둔 답(quick-answers-field.ts, service.ts 의 buildServiceQuickAnswer)이 모두 빗나간 뒤에만 본다.
 */

import type { FieldQuickAnswer } from "./quick-answers-field"

export interface BasicQuickAnswer extends FieldQuickAnswer {
  /**
   * 답의 근거가 되는 공개 문서 경로(/docs/<category>/<slug>).
   * 원가·고객사 이름처럼 문서 근거 없이 정책으로 거절하는 답은 null.
   */
  docPath: string | null
}

// 공백을 뺀 길이. 첫 방문자의 기본 질문은 대부분 한 줄이다.
const PLAIN_QUESTION_MAX_LENGTH = 60

// 증상·장애 신호. "~하면 안 되나요?"는 허락을 묻는 말이라 증상이 아니다.
const TROUBLE_SIGNAL_RE =
  /(?<!면\s?)안\s*(?:돼|되|됨|됐|됩|나와|나옴|들려|보여|켜져|떠요|열려|먹)|(?<!면\s?)안돼|(?<!면\s?)안되|안됨|오류|에러|끊겨|끊김|튕겨|튕김|멈춰|멈춤|먹통|고장|이상해|이상하|실패|막혔|막혀/

/** 기본 사실 답을 써도 되는 짧고 단순한 질문인지 본다. */
export function isPlainFactQuestion(text: string) {
  const compact = text.replace(/\s+/g, "")
  if (compact.length === 0 || compact.length > PLAIN_QUESTION_MAX_LENGTH) return false
  return !TROUBLE_SIGNAL_RE.test(text)
}

// 두 가지를 함께 물은 질문("맥북에도 깔리나요? 학생은 아이패드 쓰는데", "최대 인원이랑 수업 시간 제한").
const COMPOUND_QUESTION_RE = /[?？]\s*\S|이?랑\s|하고\s|그리고|및\s|,\s*\S/

export const BASIC_QUICK_ANSWERS: BasicQuickAnswer[] = []

/**
 * 질문에 맞는 기본 사실 답을 찾는다. 두 가지를 함께 물은 질문이면 서로 다른 답을 두 개까지 돌려준다.
 * text 는 소문자로 바꾼 질문이다.
 */
export function findBasicQuickAnswers(text: string): BasicQuickAnswer[] {
  if (!isPlainFactQuestion(text)) return []
  const matches = BASIC_QUICK_ANSWERS.filter((entry) => entry.match(text))
  if (matches.length <= 1) return matches
  return COMPOUND_QUESTION_RE.test(text) ? matches.slice(0, 2) : matches.slice(0, 1)
}
