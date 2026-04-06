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
import type { AuditLogInsert } from "@/lib/supabase/database.types";

interface LogAuditParams {
  actorUserId: string | null;
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
