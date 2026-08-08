import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { applyCaptureBatch, CaptureApplyConflictError } from "@/lib/crm/capture/apply"
import { getCaptureBatchWithRows } from "@/lib/crm/capture/repository"

export const dynamic = "force-dynamic"

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const rowIds = (body as Record<string, unknown>).rowIds
    if (!Array.isArray(rowIds) || rowIds.some((value) => typeof value !== "string")) {
      return NextResponse.json({ error: "rowIds 문자열 배열이 필요합니다." }, { status: 400 })
    }
    const selectedRowIds = [...new Set(rowIds.map((value) => value.trim()).filter(Boolean))]
    if (selectedRowIds.length === 0) {
      return NextResponse.json({ error: "적용할 행을 1개 이상 선택하세요." }, { status: 400 })
    }

    const result = await applyCaptureBatch(id, {
      createdBy: adminActorName(admin),
      selectedRowIds,
    })
    if (!result) return NextResponse.json({ error: "Batch not found" }, { status: 404 })
    const loaded = await getCaptureBatchWithRows(id)
    return NextResponse.json({ batch: loaded?.batch ?? null, rows: loaded?.rows ?? [], summary: result.summary })
  } catch (error) {
    if (error instanceof CaptureApplyConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error(`[POST /api/admin/crm/capture/batches/${id}/apply]`, error)
    return NextResponse.json({ error: "Failed to apply capture batch" }, { status: 500 })
  }
}
