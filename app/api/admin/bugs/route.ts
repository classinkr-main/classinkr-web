import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import { createBugReport, getBugReports } from "@/lib/repositories/bugs"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  return NextResponse.json(await getBugReports())
}

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const body = await req.json()
  const newBug = await createBugReport({
    ...body,
    tags: body.tags ?? [],
  })

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
