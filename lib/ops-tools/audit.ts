import "server-only"

/**
 * 운영 도구 감사 — 기존 audit_logs 장치(lib/auth/audit.ts)만 쓴다. 새 표는 없다.
 * 감사 실패는 삼키지 않는다: 실패 코드를 돌려받아(logAuditChecked) MCP 로그 줄의 code=audit_… 로 남긴다.
 * 도구 결과 꼴은 바꾸지 않는다(바꾸기 전 logAudit 과 같은 결과).
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
