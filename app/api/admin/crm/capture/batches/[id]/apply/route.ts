import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { applyCaptureBatch } from "@/lib/crm/capture/apply"
import { getCaptureBatch } from "@/lib/crm/capture/repository"

export const dynamic = "force-dynamic"

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  try {
    const result = await applyCaptureBatch(id, { createdBy: adminActorName(admin) })
    if (!result) return NextResponse.json({ error: "Batch not found" }, { status: 404 })
    const batch = await getCaptureBatch(id)
    return NextResponse.json({ batch, summary: result.summary })
  } catch (error) {
    console.error(`[POST /api/admin/crm/capture/batches/${id}/apply]`, error)
    return NextResponse.json({ error: "Failed to apply capture batch" }, { status: 500 })
  }
}
