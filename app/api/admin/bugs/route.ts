import { NextRequest, NextResponse } from "next/server"

import { requireVerifiedAdminContext, STAFF_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import { createBugReport, getBugReports } from "@/lib/repositories/bugs"
import { sanitizeBugReportInput } from "@/lib/admin/dev-workflow"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, STAFF_ADMIN_API_ROLES)
  if (err) return err
  return adminCachedJson(await getBugReports())
}

export async function POST(req: NextRequest) {
  // 같은 출처 검사 + 세션 이름(신고자) — 클라이언트가 보낸 reporter 는 세션 이름이 없을 때만 쓴다.
  const admin = await requireVerifiedAdminContext(req, STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => null)
  const input = sanitizeBugReportInput(body, admin.name)
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 })

  let newBug
  try {
    newBug = await createBugReport(input)
  } catch (error) {
    console.error("[POST /api/admin/bugs] create failed:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "버그 리포트를 저장하지 못했습니다." }, { status: 500 })
  }

  const severity =
    newBug.severity === "critical"
      ? "critical"
      : newBug.severity === "high"
        ? "warning"
        : "info"

  void emitNotificationEvent({
    eventType: "bug.created",
    notificationType: severity === "critical" ? "incident" : "warning",
    categoryTag: "bug",
    severity,
    scopeTag: severity === "critical" ? "critical_control" : "org_admin",
    title: `버그 등록: ${newBug.title}`,
    message: [newBug.reporter, newBug.environment, newBug.severity]
      .filter(Boolean)
      .join(" / "),
    routeUrl: "/admin/dev",
    source: "bug_report",
    sourceId: newBug.id,
    payload: {
      bugId: newBug.id,
      severity: newBug.severity,
      reporter: newBug.reporter,
      tags: newBug.tags,
      environment: newBug.environment,
    },
    channels: severity === "critical" ? ["wecom_webhook"] : [],
  }).catch((error) => {
    console.error("[POST /api/admin/bugs] notification emit failed:", error)
  })

  return NextResponse.json(newBug, { status: 201 })
}
