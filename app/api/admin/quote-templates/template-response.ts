import { NextResponse } from "next/server"

import { STAFF_ADMIN_API_ROLES, hasAdminApiRole, type VerifiedAdminContext } from "@/lib/admin-auth"
import type { QuoteTemplateViewer } from "@/lib/quote-team-templates"
import { QuoteTeamTemplatesNotReadyError } from "@/lib/repositories/quote-team-templates"

// /api/admin/quote-templates 두 라우트 공용(라우트 파일은 HTTP 메서드만 내보낼 수 있다).

export function quoteTemplateViewer(admin: Pick<VerifiedAdminContext, "userId" | "role">): QuoteTemplateViewer {
  return { userId: admin.userId ?? null, isStaffAdmin: hasAdminApiRole(admin.role, STAFF_ADMIN_API_ROLES) }
}

export function quoteTemplateActor(admin: Pick<VerifiedAdminContext, "name" | "userId" | "role">) {
  return admin.name?.trim() || admin.userId || admin.role
}

export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  return body as Record<string, unknown>
}

export function quoteTemplateWriteError(error: unknown, label: string) {
  if (error instanceof QuoteTeamTemplatesNotReadyError) {
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
  console.error(`[${label}]`, error instanceof Error ? error.message : error)
  return NextResponse.json({ error: "팀 템플릿을 저장하지 못했습니다." }, { status: 500 })
}
