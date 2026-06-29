import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getCaptureBatch, setCaptureBatchStatus } from "@/lib/crm/capture/repository"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  try {
    const batch = await getCaptureBatch(id)
    if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 })
    if (batch.status === "applied") {
      return NextResponse.json({ error: "이미 적용된 배치는 취소할 수 없습니다." }, { status: 409 })
    }
    const updated = await setCaptureBatchStatus(id, "canceled")
    return NextResponse.json({ batch: updated })
  } catch (error) {
    console.error(`[POST /api/admin/crm/capture/batches/${id}/cancel]`, error)
    return NextResponse.json({ error: "Failed to cancel capture batch" }, { status: 500 })
  }
}
