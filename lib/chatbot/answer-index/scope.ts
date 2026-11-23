/**
 * 범위 관문(사양 §3.2 ⑤). 답 색인으로 정할 짧은 한국어 질문인지 본다. 밖이면 지금(legacy) 흐름으로 간다.
 *
 * 참인 조건(모두):
 * - 한국어다(한글이 한 글자 이상). 영문 글자만 있는 질문은 앞 단계(isEnglishSupportRequest)나 legacy 가 맡는다.
 * - 공백을 뺀 길이가 CHATBOT_COMPILED_MAX_CHARS(기본 80) 이하다.
 * - 문장이 3개 이하다.
 * '공개 위젯'인지는 부르는 쪽(service.ts 의 publicShortcuts)이 정한다.
 */

export const COMPILED_MAX_CHARS_DEFAULT = 80
export const COMPILED_MAX_SENTENCES = 3

export type CompiledScopeReason = "ok" | "empty" | "not_korean" | "too_long" | "too_many_sentences"

export interface CompiledScopeCheck {
  inScope: boolean
  reason: CompiledScopeReason
  /** 공백 뺀 글자 수. */
  chars: number
  sentences: number
  maxChars: number
}

/** CHATBOT_COMPILED_MAX_CHARS(양의 정수). 없거나 잘못되면 기본값. */
export function compiledMaxChars(env: Record<string, string | undefined> = process.env) {
  const value = Number.parseInt(env.CHATBOT_COMPILED_MAX_CHARS ?? "", 10)
  return Number.isFinite(value) && value > 0 ? value : COMPILED_MAX_CHARS_DEFAULT
}

// 문장 끝: 마침표·물음표·느낌표·줄바꿈, 또는 공백 앞의 종결 어미("…돼요 그리고 …", "…했어요 근데 …").
const SENTENCE_END_RE = /[.!?？！。]+|\n+|(?<=(?:세요|해요|돼요|되요|어요|아요|에요|예요|네요|죠|습니다|니다|었다|했다|군요|던데요|는데요))\s+(?=\S)/g

/** 문장 수(내용이 두 글자 이상인 조각만 센다). */
export function countSentences(text: string) {
  return text
    .split(SENTENCE_END_RE)
    .map((part) => part.replace(/[\s\p{P}\p{S}]+/gu, ""))
    .filter((part) => part.length >= 2).length
}

export function checkCompiledScope(question: string, env: Record<string, string | undefined> = process.env): CompiledScopeCheck {
  const maxChars = compiledMaxChars(env)
  const text = (question ?? "").normalize("NFC").trim()
  const chars = text.replace(/\s+/g, "").length
  const sentences = countSentences(text)
  const result = (inScope: boolean, reason: CompiledScopeReason): CompiledScopeCheck => ({ inScope, reason, chars, sentences, maxChars })
  if (chars === 0) return result(false, "empty")
  if (!/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(text)) return result(false, "not_korean")
  if (chars > maxChars) return result(false, "too_long")
  if (sentences > COMPILED_MAX_SENTENCES) return result(false, "too_many_sentences")
  return result(true, "ok")
}

/** §3.2 ⑤ 범위 관문. */
export function isCompiledScope(question: string, env: Record<string, string | undefined> = process.env) {
  return checkCompiledScope(question, env).inScope
}
