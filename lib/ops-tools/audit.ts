import "server-only"

/**
 * 운영 도구 감사 — 기존 audit_logs 장치(lib/auth/audit.ts)만 쓴다. 새 표는 없다.
 * 쓰기의 감사 실패는 삼키지 않는다: 코드로 로그를 남기고(logAuditChecked) 결과에 audit_warning 을 싣는다.
 */
import { type AuditWriteResult, logAuditChecked } from "@/lib/auth/audit"
import { type OpsActor, actorDisplayName } from "@/lib/ops-tools/actor"

export const OPS_AUDIT_ROLE = "MCP"

export function auditOps(
  actor: OpsActor,
  entry: { action: string; targetType: string; targetId?: string; payload?: Record<string, unknown> }
): Promise<AuditWriteResult> {
  return logAuditChecked({
    actorUserId: null,
    actorDisplayName: actorDisplayName(actor),
    actorRole: OPS_AUDIT_ROLE,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    payload: {
      ...entry.payload,
      token_format: actor.legacy ? "legacy" : "scoped",
      ...(actor.adminEmail ? { admin_email: actor.adminEmail } : {}),
    },
  })
}

/** 감사 실패를 결과에 싣는 칸 — 성공이면 빈 객체 */
export function auditWarningField(result: AuditWriteResult): { audit_warning?: string } {
  return result.ok ? {} : { audit_warning: `감사 기록을 남기지 못했다(코드 ${result.code}). 쓰기는 끝났다 — 관리자에게 알린다.` }
}
