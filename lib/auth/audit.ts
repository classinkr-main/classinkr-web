/**
 * Audit Logger — 관리자 행위 감사 로그
 *
 * 사용법:
 *   await logAudit({
 *     actorUserId: user.id,
 *     action: 'post.publish',
 *     targetType: 'blog_post',
 *     targetId: postId,
 *     payload: { title: post.title },
 *   });
 */

import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toAdminActorSnapshot, type VerifiedAdminContext } from "@/lib/admin-auth";
import type { AuditLogInsert } from "@/lib/supabase/database.types";

interface LogAuditParams {
  actorUserId: string | null;
  actorDisplayName?: string | null;
  actorRole?: string | null;
  action: string;
  targetType: string;
  targetId?: string;
  payload?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAudit(params: LogAuditParams) {
  try {
    const supabase = createSupabaseAdminClient();

    const row: AuditLogInsert = {
      actor_user_id: params.actorUserId,
      actor_display_name: params.actorDisplayName ?? null,
      actor_role: params.actorRole ?? null,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId ?? null,
      payload: params.payload ?? null,
      ip_address: params.ipAddress ?? null,
    };

    const { error } = await supabase.from("audit_logs").insert(row);

    if (error) {
      // 감사 로그 실패가 비즈니스 로직을 막으면 안 됨
      console.error("[audit] Failed to write audit log:", error.message);
    }
  } catch (e) {
    console.error("[audit] Unexpected error:", e);
  }
}

export type AuditWriteResult = { ok: true } | { ok: false; code: string };

/**
 * logAudit 와 같은 행을 남기되 실패를 삼키지 않고 돌려준다 — 쓰기 직후의 감사 실패를 결과에 표시해야 하는 곳
 * (홈 MCP·운영 도구 쓰기)용. 로그에는 오류 코드만 싣는다(오류 글 원문에는 값이 섞일 수 있다).
 */
export async function logAuditChecked(params: LogAuditParams): Promise<AuditWriteResult> {
  try {
    const supabase = createSupabaseAdminClient();
    const row: AuditLogInsert = {
      actor_user_id: params.actorUserId,
      actor_display_name: params.actorDisplayName ?? null,
      actor_role: params.actorRole ?? null,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId ?? null,
      payload: params.payload ?? null,
      ip_address: params.ipAddress ?? null,
    };
    const { error } = await supabase.from("audit_logs").insert(row);
    if (error) {
      const code = typeof error.code === "string" && /^[A-Za-z0-9_]{1,16}$/.test(error.code) ? `db_${error.code}` : "db_error";
      console.error(`[audit] write_failed action=${params.action} code=${code}`);
      return { ok: false, code };
    }
    return { ok: true };
  } catch (e) {
    const code = e instanceof Error ? `exception_${e.name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40)}` : "exception";
    console.error(`[audit] write_failed action=${params.action} code=${code}`);
    return { ok: false, code };
  }
}

type LogAdminAuditParams = Omit<LogAuditParams, "actorUserId" | "actorDisplayName" | "actorRole"> & {
  admin: Pick<VerifiedAdminContext, "userId" | "name" | "role">
}

export async function logAdminAudit({ admin, ...params }: LogAdminAuditParams) {
  const actor = toAdminActorSnapshot(admin)
  return logAudit({
    ...params,
    actorUserId: actor.actor_user_id,
    actorDisplayName: actor.actor_display_name,
    actorRole: actor.actor_role,
  })
}
