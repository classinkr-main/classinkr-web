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
 * - 국제 전화(+82), 은행 이름 뒤 숫자열 → [phone]·[account]
 * - 표시 없는 10~12자리 숫자열(전화 꼴 제외) → [account]
 *
 * 가리기 전에 꼴을 고른다(normalizeForRedaction): 전각 숫자·영문·＠·－·＋ → 반각, 숫자 사이 대시 변형(– — − 등)과
 * 그 앞뒤 공백·줄바꿈 → '-', 이메일 '@' 앞뒤 공백·줄바꿈 제거, 공백으로 나눈 숫자 묶음(합 9자리 이상) → '-'로 잇기,
 * '공/영'으로 시작하는 한글 숫자열(9자 이상) → 숫자, 폭 없는 문자(U+200B 등) 제거. 돌려주는 글은 고른 뒤의 글이다
 * (원문 위치로 되돌리지 않는다 — 가린 칸 주변의 공백·대시 꼴이 바뀔 수 있다). 중국어 문장부호(：，（）)는 건드리지 않는다.
 *
 * 가리지 못하는 것(사람이 직접 확인해야 한다): 사람 이름, 주소, 표시 없는 9자리 이하 숫자 ID, 이미지 속 글자.
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
/** 계정 ID 이름표. escalation-routing 의 '대화에 계정 ID 있음' 판정도 같은 목록을 쓴다. */
export const ACCOUNT_ID_LABEL_SOURCE =
  "(?<![A-Za-z])(?:UID|User\\s*ID|Account(?:\\s*ID)?|회원\\s*(?:번호|ID|아이디)|계정\\s*(?:ID|번호)?|아이디(?:는|가|:)?|(?<!(?:수업|강의|코스|lesson|class|course)\\s*)ID)"
const UID_DIGITS_PATTERN = new RegExp(
  `(${ACCOUNT_ID_LABEL_SOURCE}\\s*[:：#]?\\s*)\\d(?:[ -]?\\d){4,13}(?!\\d)`,
  "gi"
)
/** 영문이 섞인 UID(abc12345). 이름표와 값 사이에 공백이나 ':' 가 있어야 하고, 값에 숫자가 하나 이상 있어야 한다. */
const UID_ALNUM_PATTERN = new RegExp(
  `(${ACCOUNT_ID_LABEL_SOURCE}(?:\\s*[:：#]\\s*|\\s+))(?=[A-Za-z0-9_-]*\\d)[A-Za-z][A-Za-z0-9_-]{3,23}(?![A-Za-z0-9_-])`,
  "gi"
)
/** 이 글에 계정 ID 꼴(이름표 + 값)이 있는지. 가림 전 꼴 고르기를 거친 뒤 본다. */
export function hasAccountIdentifier(value: string | null | undefined) {
  const text = normalizeForRedaction(value ?? "")
  return new RegExp(UID_DIGITS_PATTERN.source, "i").test(text) || new RegExp(UID_ALNUM_PATTERN.source, "i").test(text)
}
const INTL_PHONE_PATTERN = /(?<![\d+])\+?82[ \t-]?0?1\d[ \t-]?\d{3,4}[ \t-]?\d{4}(?!\d)/g
const BANK_PATTERN =
  /((?:[가-힣]{1,8}은행|농협|우체국|새마을금고|신협|카카오뱅크|토스뱅크|케이뱅크)\s*(?:(?:계좌\s*(?:번호)?)?\s*(?:는|은)?\s*[:：]?\s*))\d[\d -]{8,}\d/g
const BARE_LONG_DIGITS = /(?<![\d\[-])\d{10,12}(?![\d\]-])/g
const PHONE_DIGITS = /^0(?:1\d{8,9}|[2-6]\d{7,9})$/
const UNLABELLED_BIRTH = /(?<!\d)(?:19|20)\d{2}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일\s*생/g

const KOREAN_DIGITS: Record<string, string> = {
  공: "0", 영: "0", 일: "1", 이: "2", 삼: "3", 사: "4", 오: "5", 육: "6", 칠: "7", 팔: "8", 구: "9",
}

/**
 * 가리기 전 꼴 고르기. 멱등이다(두 번 적용해도 같다).
 * 전각 숫자·영문·＠·－·＋만 반각으로 바꾸고(NFKC 전체를 쓰지 않는다 — 본사 중국어 문장부호 ：，（）를 지키려고),
 * 숫자 사이 대시·공백·줄바꿈만 고른다.
 */
export function normalizeForRedaction(value: string) {
  return value
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF20\uFF0B\uFF0D]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .replace(/(?<![가-힣])[공영](?:[ \t-]*[공영일이삼사오육칠팔구]){8,}(?![가-힣])/g, (run) =>
      run.replace(/[공영일이삼사오육칠팔구]/g, (ch) => KOREAN_DIGITS[ch] ?? ch)
    )
    .replace(/(\d)[ \t]*(?:\r?\n[ \t]*)?[-\u2010-\u2015\u2212\uFE58\uFE63][ \t]*(?:\r?\n[ \t]*)?(?=\d)/g, "$1-")
    .replace(/([A-Za-z0-9._%+-])[ \t]*(?:\r?\n[ \t]*)?@[ \t]*(?:\r?\n[ \t]*)?(?=[A-Za-z0-9-]+\.[A-Za-z]{2,})/g, "$1@")
    .replace(/(?<![\d:.\-])\d{2,6}(?:[ \t]+\d{2,6}){1,3}(?![\d:.\-])/g, (run) => {
      const digits = run.replace(/\D/g, "")
      return digits.length >= 9 ? run.split(/[ \t]+/).join("-") : run
    })
}

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

  const bump = (replacement: string) => () => {
    count += 1
    return replacement
  }
  const bumpLabel = (placeholder: string) => (_match: string, label: string) => {
    count += 1
    return `${label}${placeholder}`
  }

  let text = normalizeForRedaction(source)
  text = text.replace(RRN_PATTERN, bump("[rrn]"))
  text = text.replace(BIRTH_PATTERN, bumpLabel("[birthdate]"))
  text = text.replace(UNLABELLED_BIRTH, bump("[birthdate]생"))
  text = text.replace(INTL_PHONE_PATTERN, bump("[phone]"))
  text = text.replace(ACCOUNT_LABEL_PATTERN, bumpLabel("[account]"))
  text = text.replace(BANK_PATTERN, bumpLabel("[account]"))
  text = text.replace(DASHED_GROUPS_PATTERN, (match) => {
    if (DATE_SHAPE.test(match) || PHONE_SHAPE.test(match)) return match
    count += 1
    return "[account]"
  })
  text = text.replace(UID_DIGITS_PATTERN, bumpLabel("[uid]"))
  text = text.replace(UID_ALNUM_PATTERN, bumpLabel("[uid]"))
  text = text.replace(BARE_LONG_DIGITS, (match) => {
    if (PHONE_DIGITS.test(match)) return match
    count += 1
    return "[account]"
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
