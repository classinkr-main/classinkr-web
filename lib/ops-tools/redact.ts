/**
 * 도구 결과의 사람 연락처(전화·이메일) 가림 — 응답을 글로 직렬화하기 직전 한 곳(lib/mcp/tools.ts callTool)에서만 부른다.
 *
 * 기준은 Compass MCP 와 같다(lib/compass/next-actions.ts maskContactsInText: 전화 "010-****-5678", 이메일 "***@도메인").
 * 여기서는 국제 표기(+82 10-1234-5678)도 같이 가린다. 순수 함수다.
 *
 * 값을 글자 단위로 고치지 JSON 글을 통째로 고치지 않는다(따옴표·이스케이프를 깨지 않도록).
 * id·번호 칸(…_id, …Id, …_number, …_no)은 전화 꼴처럼 보여도 건드리지 않는다 — 다음 호출 인자로 그대로 쓰이기 때문이다.
 */
import { maskContactsInText } from "@/lib/compass/next-actions"

const INTL_PHONE_PATTERN = /\+82[-.\s]?(\d{1,2})[-.\s]?(\d{3,4})[-.\s]?(\d{4})(?!\d)/g
/** 가린 뒤에도 남아 있으면 안 되는 꼴 — 시험이 같은 식을 쓴다 */
export const RAW_PHONE_PATTERN = /(?<!\d)0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/
export const RAW_EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/

const KEEP_KEY = /(^id$|_id$|Id$|_ids$|Ids$|_number$|Number$|_no$|No$)/

export function maskContactText(text: string): string {
  return maskContactsInText(text.replace(INTL_PHONE_PATTERN, (_m, head: string, _mid: string, tail: string) => `+82-${head}-****-${tail}`))
}

/** 값 안의 모든 글자를 가린다. masked = 가린 글자 칸 수(개인정보 읽기 감사에 쓴다) */
export function redactContacts<T>(value: T): { value: T; masked: number } {
  let masked = 0
  const walk = (v: unknown, key: string | null): unknown => {
    if (typeof v === "string") {
      if (key && KEEP_KEY.test(key)) return v
      const next = maskContactText(v)
      if (next !== v) masked += 1
      return next
    }
    if (Array.isArray(v)) return v.map((item) => walk(item, key))
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const out: Record<string, unknown> = {}
      for (const [k, item] of Object.entries(v as Record<string, unknown>)) out[k] = walk(item, k)
      return out
    }
    return v
  }
  const value2 = walk(value, null) as T
  return { value: value2, masked }
}

/** 가림 없이 연락처 꼴이 몇 칸에 들었는지만 센다(pii 범위로 원문을 내줄 때 감사용) */
export function countContacts(value: unknown): number {
  return redactContacts(value).masked
}
