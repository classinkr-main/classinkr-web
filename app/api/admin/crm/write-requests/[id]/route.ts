import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"

import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import { ADMIN_CRM_REVENUE_CACHE_TAG } from "@/lib/admin-crm-revenue"
import { updateCrmWriteRequestStatus } from "@/lib/external-crm/xiaoshouyi-write"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

type RouteContext = {
  params: Promise<{ id: string }>
}

function isWriteRequestAction(value: unknown): value is "approve" | "cancel" | "retry" {
  return value === "approve" || value === "cancel" || value === "retry"
}

export async function GET(req: NextRequest, context: RouteContext) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  const { id } = await context.params
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("crm_write_requests")
    .select("*")
    .eq("id", id)
    .eq("source_system", "xiaoshouyi")
    .maybeSingle()

  if (error) {
    console.error("[GET /api/admin/crm/write-requests/[id]]", error)
    return NextResponse.json({ error: "Failed to read CRM write request" }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: "CRM write request not found" }, { status: 404 })
  }

  const { data: events, error: eventsError } = await sb
    .from("crm_write_request_events")
    .select("*")
    .eq("write_request_id", id)
    .order("created_at", { ascending: false })
    .limit(100)

  if (eventsError) {
    console.error("[GET /api/admin/crm/write-requests/[id]/events]", eventsError)
  }

  return NextResponse.json({
    request: data,
    events: eventsError ? [] : events ?? [],
    eventsWarning: eventsError ? "Failed to read CRM write request audit events" : null,
  })
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  const { id } = await context.params
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null

  if (!isWriteRequestAction(body?.action)) {
    return NextResponse.json({ error: "Invalid CRM write request action" }, { status: 400 })
  }

  try {
    const request = await updateCrmWriteRequestStatus({
      id,
      action: body.action,
      actorUserId: admin.userId,
    })

    revalidateTag(ADMIN_CRM_REVENUE_CACHE_TAG, "max")
    return NextResponse.json({ ok: true, request })
  } catch (error) {
    console.error("[PATCH /api/admin/crm/write-requests/[id]]", error)
    const message = error instanceof Error ? error.message : "Failed to update CRM write request"
    const status = message.includes("not found")
      ? 404
      : message.includes("schema is not ready") || message.startsWith("Only ") || message.includes("retry") || message.includes("limit")
        ? 409
        : 400
    return NextResponse.json({ error: message }, { status })
  }
}
