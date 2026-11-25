/**
 * 내부 CS 소통 초안(본사 WeCom·고정 본사 틀·사내 인수인계·고객 안내)과 지식 승격 글에서 고객 식별정보를 가리는
 * 순수 함수. 서버와 브라우저가 함께 쓴다(server-only 아님 — 초안은 브라우저에서 조립된다).
 *
 * 공개 챗봇의 redactPii(lib/chatbot/pii.ts: 이메일·사업자번호·카드·전화)를 그대로 쓰고, 그 앞에서 내부 상담 글에
 * 자주 섞이는 꼴을 더 가린다.
 * - 주민등록번호(6-7자리) → [rrn]
 * - 계좌번호: 2~6-2~6-2~7 묶음(날짜·전화 꼴은 제외), "계좌" 뒤 숫자열 → [account]
 * - 생년월일: "생년월일·생일·DOB" 뒤 날짜·숫자 → [birthdate]
 * - 계정 ID·UID: "UID·User ID·Account·계정·아이디·회원번호" 뒤 5~12자리 숫자 → [uid]
 *
 * 가리지 못하는 것(사람이 직접 확인해야 한다): 사람 이름, 주소, 표시 없는 숫자 ID, 이미지 속 글자.
 */
import { redactPii } from "@/lib/chatbot/pii"

export interface RedactionResult {
  text: string
  /** 가린 값의 개수. 0 이면 원문과 같다. */
  count: number
}

const PII_TOKENS = ["[email]", "[business_number]", "[payment_number]", "[phone]"] as const

const RRN_PATTERN = /(?<!\d)\d{6}\s?-\s?[1-8]\d{6}(?!\d)/g
const DASHED_GROUPS_PATTERN = /(?<![\d-])\d{2,6}-\d{2,6}-\d{2,7}(?![\d-])/g
const DATE_SHAPE = /^(?:19|20)\d{2}-\d{1,2}-\d{1,2}$/
const PHONE_SHAPE = /^0\d{1,2}-\d{3,4}-\d{4}$/
const ACCOUNT_LABEL_PATTERN = /((?:입금\s*)?계좌(?:\s*번호)?\s*[:：]?\s*(?:[가-힣A-Za-z]{1,10}(?:은행)?\s*)?)\d[\d -]{6,}\d/g
const BIRTH_PATTERN =
  /((?:생년월일|생일|출생일|DOB|date\s+of\s+birth|birth\s*date)\s*[:：]?\s*)(?:(?:19|20)?\d{2}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*일?|\d{6,8})/gi
const UID_PATTERN =
  /((?<![A-Za-z])(?:UID|User\s*ID|Account(?:\s*ID)?|계정\s*ID|계정|아이디|회원\s*번호)\s*[:：#]?\s*)\d{5,12}(?!\d)/gi

function countTokens(value: string) {
  let total = 0
  for (const token of PII_TOKENS) total += value.split(token).length - 1
  return total
}

/** 글 하나를 가리고, 가린 개수를 함께 돌려준다. 같은 글에 두 번 적용해도 결과가 같다. */
export function redactInternalCsDraft(value: string | null | undefined): RedactionResult {
  const source = value ?? ""
  if (!source) return { text: "", count: 0 }
  let count = 0

  let text = source.replace(RRN_PATTERN, () => {
    count += 1
    return "[rrn]"
  })
  text = text.replace(BIRTH_PATTERN, (_match, label: string) => {
    count += 1
    return `${label}[birthdate]`
  })
  text = text.replace(ACCOUNT_LABEL_PATTERN, (_match, label: string) => {
    count += 1
    return `${label}[account]`
  })
  text = text.replace(DASHED_GROUPS_PATTERN, (match) => {
    if (DATE_SHAPE.test(match) || PHONE_SHAPE.test(match)) return match
    count += 1
    return "[account]"
  })
  text = text.replace(UID_PATTERN, (_match, label: string) => {
    count += 1
    return `${label}[uid]`
  })

  const before = countTokens(text)
  text = redactPii(text)
  count += countTokens(text) - before

  return { text, count }
}

/** 개수가 필요 없는 칸(이름 한 줄 등)에 쓰는 줄임. */
export function redactInternalCsValue(value: string | null | undefined) {
  return redactInternalCsDraft(value).text
}

/** "개인정보 N건을 가렸습니다" — 0 이면 null(문구를 띄우지 않는다). */
export function redactionNotice(count: number) {
  return count > 0 ? `개인정보 ${count}건을 가렸습니다` : null
}
