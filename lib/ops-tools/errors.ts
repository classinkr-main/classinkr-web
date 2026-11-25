/**
 * 운영 도구 오류 판정 — 고칠 수 있는 입력·규칙 오류는 글을, 모르는 오류(DB 접속·버그)는 고정 문구를 호출자에게 낸다.
 *
 * 판정은 바꾸기 전과 같다: HW 입출고 API 의 toErrorResponse(검증·규칙·중복·재고 부족 → 4xx). 4xx 는 글을 그대로 돌려준다.
 * 이 판정은 Postgres 영문 오류("duplicate key value violates …")도 4xx 로 보아 원문을 돌려준다(점검 R30) — 이를 코드만으로
 * 바꾸는 일은 총괄 결정 밖이라 이번에는 되돌렸다(docs/active/home-mcp-operations.md §7). 돌려주는 글의 연락처는 가린다(run.ts).
 * 로그에는 글 원문 없이 닫힌 코드만 싣는다.
 */
import { HardwareApiValidationError, toErrorResponse } from "@/app/api/admin/hardware/_validation"
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

/** 모르는 오류일 때 호출자가 받는 글 — 바꾸기 전과 같다(코드는 로그에만) */
export const UNKNOWN_TOOL_ERROR_TEXT = "서버 쪽에서 실패했다. 잠시 뒤 다시 시도한다"

export async function classifyToolError(e: unknown): Promise<ClassifiedToolError> {
  if (e instanceof OpsToolError) return { kind: "user", message: e.message, code: safeCode(e.code) }
  const res = toErrorResponse(e, "")
  if (res.status >= 500) return { kind: "unknown", code: opsErrorCode(e) }
  const body = (await res.json()) as { error?: string }
  const known = e instanceof HardwareApiValidationError || e instanceof MovementRuleError || e instanceof LotRuleError
  return { kind: "user", message: body.error || "입력을 확인한다.", code: known ? "invalid_input" : e instanceof Error && e.constructor === Error ? "rule_rejected" : opsErrorCode(e) }
}
