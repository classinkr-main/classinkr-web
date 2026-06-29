import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { matchCaptureRows } from "@/lib/crm/capture/matching"
import { parseTabularGrid, parseUnstructuredLines, type ColumnMap } from "@/lib/crm/capture/parsers"
import { getCaptureBatch, replaceCaptureRows } from "@/lib/crm/capture/repository"
import { getCrmUnifiedCustomers } from "@/lib/repositories/crm-unified-customers"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  try {
    const batch = await getCaptureBatch(id)
    if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 })
    if (batch.status === "applied" || batch.status === "canceled") {
      return NextResponse.json({ error: "이미 적용되었거나 취소된 배치는 다시 파싱할 수 없습니다." }, { status: 409 })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const rawInput = typeof (body as Record<string, unknown>).raw === "string" ? ((body as Record<string, unknown>).raw as string) : ""
    if (!rawInput.trim()) return NextResponse.json({ error: "입력 텍스트가 비어 있습니다." }, { status: 400 })

    const mode = (body as Record<string, unknown>).mode === "text" ? "text" : "table"
    const hasHeader = typeof (body as Record<string, unknown>).hasHeader === "boolean" ? ((body as Record<string, unknown>).hasHeader as boolean) : undefined
    const mapping = Array.isArray((body as Record<string, unknown>).mapping) ? ((body as Record<string, unknown>).mapping as ColumnMap) : undefined

    const parsed = mode === "text" ? parseUnstructuredLines(rawInput) : parseTabularGrid(rawInput, { hasHeader, mapping }).rows
    if (parsed.length === 0) return NextResponse.json({ error: "해석된 행이 없습니다." }, { status: 400 })

    const customers = await getCrmUnifiedCustomers({ limit: 2000 })
    const matched = matchCaptureRows(parsed, customers.rows)
    const rows = await replaceCaptureRows(batch, matched)

    const refreshed = await getCaptureBatch(id)
    return NextResponse.json({ batch: refreshed ?? batch, rows })
  } catch (error) {
    console.error(`[POST /api/admin/crm/capture/batches/${id}/parse]`, error)
    return NextResponse.json({ error: "Failed to parse capture batch" }, { status: 500 })
  }
}
