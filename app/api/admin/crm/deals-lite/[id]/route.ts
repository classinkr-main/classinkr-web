import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { ADMIN_CRM_REVENUE_CACHE_TAG } from "@/lib/admin-crm-revenue"
import {
  CRM_DEAL_STAGES,
  isCrmDealsNotReadyError,
  setCrmDealStage,
  updateCrmDeal,
  type CrmDealRecord,
  type CrmDealStage,
} from "@/lib/repositories/crm-deals"

const STAGES = new Set<string>(CRM_DEAL_STAGES)

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function optionalNumber(value: unknown) {
  if (value === undefined) return undefined
  if (value == null || value === "") return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function notReadyResponse(error: unknown) {
  if (isCrmDealsNotReadyError(error)) return NextResponse.json({ error: (error as Error).message }, { status: 503 })
  return null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const actor = adminActorName(admin)
  const { id } = await params

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const raw = body as Record<string, unknown>
    const action = typeof raw.action === "string" ? raw.action : "update"

    let deal: CrmDealRecord | null = null
    if (action === "stage") {
      const stage = typeof raw.stage === "string" && STAGES.has(raw.stage) ? (raw.stage as CrmDealStage) : null
      if (!stage) return NextResponse.json({ error: "Invalid stage" }, { status: 400 })
      deal = await setCrmDealStage(id, stage, { closedBy: actor })
    } else if (action === "update") {
      deal = await updateCrmDeal(id, {
        title: optionalString(raw.title),
        expectedAmount: optionalNumber(raw.expectedAmount),
        expectedCloseAt: optionalString(raw.expectedCloseAt),
        quoteRef: optionalString(raw.quoteRef),
        orderRef: optionalString(raw.orderRef),
        riskNote: optionalString(raw.riskNote),
        nextTaskId: optionalString(raw.nextTaskId),
      })
    } else {
      return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 })
    }

    if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 })
    revalidateTag(ADMIN_CRM_REVENUE_CACHE_TAG, "max")
    return NextResponse.json({ deal })
  } catch (error) {
    console.error(`[PATCH /api/admin/crm/deals-lite/${id}]`, error)
    return notReadyResponse(error) ?? NextResponse.json({ error: "Failed to update CRM deal" }, { status: 500 })
  }
}
