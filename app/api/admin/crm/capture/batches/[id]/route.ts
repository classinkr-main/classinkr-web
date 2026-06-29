import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getCaptureBatchWithRows } from "@/lib/crm/capture/repository"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  try {
    const result = await getCaptureBatchWithRows(id)
    if (!result) return NextResponse.json({ error: "Batch not found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (error) {
    console.error(`[GET /api/admin/crm/capture/batches/${id}]`, error)
    return NextResponse.json({ error: "Failed to load capture batch" }, { status: 500 })
  }
}
