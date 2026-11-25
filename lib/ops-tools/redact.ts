/**
 * 도구 결과의 사람 연락처(전화·이메일) 가림 — 응답을 글로 직렬화하기 직전(lib/ops-tools/run.ts presentOpsResult)에서만 부른다.
 *
 * 꼴은 Compass MCP 와 같다(전화 "010-****-5678", 이메일 "***@도메인", 국제 "+82-10-****-5678"). 순수 함수다.
 * 값을 글자 단위로 고치지 JSON 글을 통째로 고치지 않는다(따옴표·이스케이프를 깨지 않도록).
 *
 * 무엇을 가리나(키 이름으로 먼저 가른다):
 * - 회사 정보 칸(supplier…·footer… — 견적의 공급자 담당 연락처·꼬리말)은 가리지 않는다. 고객에게 나가는 회사 연락처다.
 * - 식별자 칸(id·…_id·…Ids·uuid·…code·serials·견적/문서/줄 번호·물류번호)은 가리지 않는다 — 다음 호출 인자로 쓰이고,
 *   시리얼·주문코드 같은 숫자열이 전화 꼴로 잘못 가려지지 않게 한다. 단 키에 phone·tel·mobile·email·contact 가 들어 있으면
 *   식별자처럼 보여도 가린다(phone_number·mobile_no·contactNumber).
 * - 나머지 글자 값은 전화·이메일 꼴만 고친다. uuid 꼴 값은 건드리지 않는다.
 * 전화 꼴: 앞뒤가 영문자·숫자가 아니어야 한다(SN0212345678·uuid 조각 제외). 구분자(-·.·공백·여러 dash·_·~, 앞뒤 공백 허용)나
 * 괄호 지역번호가 있으면 지역번호까지, 구분자가 없으면 휴대전화(01X)만 본다. +82 와 + 없는 "82-" 도 본다. 전각 글자는 NFKC 로 맞춘다.
 */

const DASH = "[-.\\u2010-\\u2015\\u2212\\uFE58\\uFE63\\uFF0D_~]"
const SEP_REQ = `(?:\\s*${DASH}\\s*|\\s+)`
const SEP_OPT = `(?:\\s*${DASH}\\s*|\\s*)`
const BEFORE = "(?<![A-Za-z0-9])"
const AFTER = "(?![A-Za-z0-9])"

const INTL_PHONE = new RegExp(`${BEFORE}(?:\\+\\s*82${SEP_OPT}|82${SEP_REQ})(?:\\(0\\)\\s*)?0?(\\d{1,2})${SEP_OPT}(\\d{3,4})${SEP_OPT}(\\d{4})${AFTER}`, "g")
const DOMESTIC_PHONE = new RegExp(`${BEFORE}(?:\\((0\\d{1,2})\\)\\s*|(0\\d{1,2})${SEP_REQ})(\\d{3,4})${SEP_REQ}(\\d{4})${AFTER}`, "g")
const MOBILE_PLAIN = new RegExp(`${BEFORE}(01[016789])(\\d{3,4})(\\d{4})${AFTER}`, "g")
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g
const EMAIL_OBFUSCATED = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+\s*[[(]\s*at\s*[\])]\s*([A-Za-z0-9-]+(?:\s*(?:\.|[[(]\s*dot\s*[\])])\s*[A-Za-z0-9-]+)+)/gi
const FULLWIDTH = /[！-～]/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 가린 꼴 — 이 값이 쓰기 인자로 다시 들어오면 거절한다(lib/ops-tools/run.ts) */
export const MASKED_VALUE_PATTERN = /\*{4}\s*-?\s*\d{4}|\*{3}@/

export function maskContactText(text: string): string {
  const source = FULLWIDTH.test(text) ? text.normalize("NFKC") : text
  const masked = source
    .replace(INTL_PHONE, (_m, head: string, _mid: string, tail: string) => `+82-${head}-****-${tail}`)
    .replace(DOMESTIC_PHONE, (_m, paren: string | undefined, head: string | undefined, _mid: string, tail: string) => `${paren ?? head}-****-${tail}`)
    .replace(MOBILE_PLAIN, (_m, head: string, _mid: string, tail: string) => `${head}-****-${tail}`)
    .replace(EMAIL_OBFUSCATED, (_m, domain: string) => `***@${domain.replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, ".").replace(/\s+/g, "")}`)
    .replace(EMAIL, (_m, domain: string) => `***@${domain}`)
  return masked === source ? text : masked
}

const keyTokens = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

const CONTACT_TOKENS = new Set(["phone", "tel", "mobile", "cell", "fax", "email", "mail", "contact", "hp"])
const COMPANY_FIRST = new Set(["supplier", "footer"])
const ID_LAST = new Set(["id", "ids", "uuid", "code", "codes", "serial", "serials", "sku", "hash", "fingerprint"])
const ID_EXACT = new Set(["quote_number", "document_number", "version_number", "line_number", "lot_no"])

type KeyKind = "company" | "identifier" | "text"

/** 키 이름 → 가림 방식 */
export function contactKeyKind(key: string | null): KeyKind {
  if (!key) return "text"
  const tokens = keyTokens(key)
  if (!tokens.length) return "text"
  if (COMPANY_FIRST.has(tokens[0])) return "company"
  if (tokens.some((t) => CONTACT_TOKENS.has(t))) return "text"
  if (ID_LAST.has(tokens[tokens.length - 1]) || ID_EXACT.has(tokens.join("_"))) return "identifier"
  return "text"
}

/** 값 안의 글자를 가린다. masked = 가린 글자 칸 수(개인정보 읽기 감사에 쓴다) */
export function redactContacts<T>(value: T): { value: T; masked: number } {
  let masked = 0
  const walk = (v: unknown, key: string | null): unknown => {
    if (typeof v === "string") {
      if (contactKeyKind(key) !== "text" || UUID.test(v)) return v
      const next = maskContactText(v)
      if (next !== v) masked += 1
      return next
    }
    if (Array.isArray(v)) {
      // 배열 원소는 배열의 키를 따른다(serials·supplier… 배열 안 글자도 같은 방식)
      return v.map((item) => walk(item, key))
    }
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if (contactKeyKind(key) === "company") return v
      const out: Record<string, unknown> = {}
      for (const [k, item] of Object.entries(v as Record<string, unknown>)) out[k] = walk(item, k)
      return out
    }
    return v
  }
  const value2 = walk(value, null) as T
  return { value: value2, masked }
}

/** 인자 안에 가린 값이 들었으면 그 키 경로(없으면 null) */
export function findMaskedInput(value: unknown, path = ""): string | null {
  if (typeof value === "string") return MASKED_VALUE_PATTERN.test(value) ? path || "(값)" : null
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findMaskedInput(value[i], `${path}[${i}]`)
      if (hit) return hit
    }
    return null
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const hit = findMaskedInput(v, path ? `${path}.${k}` : k)
      if (hit) return hit
    }
  }
  return null
}
