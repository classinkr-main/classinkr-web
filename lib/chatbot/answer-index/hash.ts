/**
 * 답 색인 자료의 해시. 추출기(scripts/answer-index)와 런타임(load·respond)이 같은 함수를 써야
 * 문장·답 글이 바뀐 카드를 알아챈다.
 */
import { createHash } from "node:crypto"

/** 문장·답 글 비교용 정규화: NFC, 공백 하나로 접기, 앞뒤 공백 제거. */
export function normalizeForHash(text: string) {
  return text.normalize("NFC").replace(/\s+/g, " ").trim()
}

/** sha256 hex 앞 16자. */
export function sha16(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16)
}

/** 문서 문장 해시(units.json·site-facts.json·카드 sentences.hashes). */
export function sentenceHash(text: string) {
  return sha16(normalizeForHash(text))
}

/** 답 글 해시(inventory textHash, 카드 curatedRef.textHash·answer.textHash). */
export function answerTextHash(text: string) {
  return sha16(normalizeForHash(text))
}
