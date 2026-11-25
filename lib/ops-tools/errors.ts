/**
 * 운영 도구 오류 판정 — 고칠 수 있는 입력·규칙 오류는 글을 그대로, 모르는 오류(DB·버그)는 코드만 밖으로 낸다.
 *
 * 전에는 HW 입출고 API 의 toErrorResponse 정규식으로 4xx/5xx 를 갈랐는데, Postgres 영문 오류
 * ("duplicate key value violates …")가 4xx 로 분류돼 원문이 응답에 실렸다(점검 R30). 이제는
 * 알려진 오류 클래스와 저장소가 던지는 한국어 규칙 문구만 원문으로 돌려준다.
 */
import { HardwareApiValidationError } from "@/app/api/admin/hardware/_validation"
import { LotRuleError } from "@/lib/hardware/inventory-process"
import { MovementRuleError } from "@/lib/hardware/movement-rules"

/** 도구가 직접 던지는 입력·규칙 오류 — 글을 그대로 호출자에게 돌려준다 */
export class OpsToolError extends Error {
  readonly code: string
  constructor(message: string, code = "invalid_input") {
    super(message)
    this.name = "OpsToolError"
    this.code = code
  }
}

const HANGUL = /[가-힣]/
/** 저장소가 던지는 한국어 규칙 문구 중 사람이 고칠 수 있는 것(중복·재고·수량·없음) */
const USER_FIXABLE = /찾을 수 없|찾지 못|이미|중복|처리된|예정.*아니|부족|재고|수량|물류번호/

const safeCode = (v: string) => v.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "unknown"

/** 로그·응답에 싣는 오류 코드 — 오류 글 원문은 싣지 않는다 */
export function opsErrorCode(e: unknown): string {
  if (e instanceof OpsToolError) return safeCode(e.code)
  if (e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string") {
    const code = (e as { code: string }).code
    if (/^[A-Za-z0-9_]{1,16}$/.test(code)) return `db_${code}`
  }
  if (e instanceof Error) return safeCode(e.name)
  return "unknown"
}

export type ClassifiedToolError = { kind: "user"; message: string; code: string } | { kind: "unknown"; code: string }

export function classifyToolError(e: unknown): ClassifiedToolError {
  if (e instanceof OpsToolError) return { kind: "user", message: e.message, code: safeCode(e.code) }
  if (e instanceof HardwareApiValidationError || e instanceof MovementRuleError || e instanceof LotRuleError) {
    return { kind: "user", message: e.message, code: "invalid_input" }
  }
  // Supabase 오류는 Error 가 아니라 { message, code } 객체로 온다 → 여기서 걸러지지 않고 unknown 이 된다
  if (e instanceof Error && e.constructor === Error && HANGUL.test(e.message) && USER_FIXABLE.test(e.message)) {
    return { kind: "user", message: e.message.slice(0, 300), code: "rule_rejected" }
  }
  return { kind: "unknown", code: opsErrorCode(e) }
}
