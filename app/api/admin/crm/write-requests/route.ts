import { NextRequest, NextResponse } from "next/server"

import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  buildCrmWritePreview,
  createCrmWriteRequest,
  getXiaoshouyiWriteMetadataPreflight,
  type CrmWriteOperation,
} from "@/lib/external-crm/xiaoshouyi-write"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

function isCrmWriteOperation(value: unknown): value is CrmWriteOperation {
  return value === "create" || value === "update" || value === "transfer_owner"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  if (req.nextUrl.searchParams.get("preflight") === "metadata") {
    try {
      return NextResponse.json(await getXiaoshouyiWriteMetadataPreflight())
    } catch (error) {
      console.error("[GET /api/admin/crm/write-requests?preflight=metadata]", error)
      const message = error instanceof Error ? error.message : "Failed to validate CRM write metadata"
      return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
  }

  const status = req.nextUrl.searchParams.get("status")
  const scope = req.nextUrl.searchParams.get("scope")
  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 50)
  const limit = Number.isFinite(limitParam) ? Math.min(200, Math.max(1, Math.floor(limitParam))) : 50
  const sb = createSupabaseAdminClient()

  let query = sb
    .from("crm_write_requests")
    .select("*")
    .eq("source_system", "xiaoshouyi")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (status) query = query.eq("status", status)
  else if (scope === "active") query = query.in("status", ["draft", "approved", "sent", "failed"])
  else if (scope === "history") query = query.in("status", ["succeeded", "cancelled", "failed"])

  const { data, error } = await query
  if (error) {
    console.error("[GET /api/admin/crm/write-requests]", error)
    return NextResponse.json({ error: "Failed to list CRM write requests" }, { status: 500 })
  }

  return NextResponse.json({ requests: data ?? [] })
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as {
    objectApiKey?: unknown
    operation?: unknown
    externalId?: unknown
    payload?: unknown
    dryRun?: unknown
  } | null

  if (
    typeof body?.objectApiKey !== "string" ||
    !isCrmWriteOperation(body.operation) ||
    !isRecord(body.payload)
  ) {
    return NextResponse.json({ error: "Invalid CRM write request payload" }, { status: 400 })
  }

  const externalId = typeof body.externalId === "string" ? body.externalId : null

  try {
    const preview = buildCrmWritePreview({
      objectApiKey: body.objectApiKey,
      operation: body.operation,
      externalId,
      payload: body.payload,
    })

    if (body.dryRun === true) {
      return NextResponse.json({ ok: true, preview })
    }

    const request = await createCrmWriteRequest({
      objectApiKey: body.objectApiKey,
      operation: body.operation,
      externalId,
      payload: body.payload,
      requestedBy: admin.userId,
    })

    return NextResponse.json({ ok: true, request }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/admin/crm/write-requests]", error)
    const message = error instanceof Error ? error.message : "Failed to create CRM write request"
    return NextResponse.json({ error: message }, { status: message.includes("schema is not ready") ? 409 : 400 })
  }
}
