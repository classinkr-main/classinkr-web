import { NextRequest, NextResponse } from "next/server"

import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import { executeCrmWriteRequest } from "@/lib/external-crm/xiaoshouyi-write"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, context: RouteContext) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  const { id } = await context.params

  try {
    const request = await executeCrmWriteRequest(id, admin.userId)
    const ok = request.status === "succeeded"
    return NextResponse.json({ ok, request }, { status: ok ? 200 : 409 })
  } catch (error) {
    console.error("[POST /api/admin/crm/write-requests/[id]/execute]", error)
    const message = error instanceof Error ? error.message : "Failed to execute CRM write request"
    const status = message.includes("not found")
      ? 404
      : message.includes("schema is not ready") || message.includes("approved") || message.includes("limit")
        ? 409
        : 400
    return NextResponse.json({ error: message }, { status })
  }
}
