import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { ADMIN_CRM_REVENUE_CACHE_TAG } from "@/lib/admin-crm-revenue"
import { findAdminCrmOwner, listAdminUserDirectoryCached } from "@/lib/repositories/admin-users"
import {
  CRM_DEAL_STAGES,
  CRM_DEAL_TARGET_TYPES,
  createCrmDeal,
  isCrmDealsNotReadyError,
  type CrmDealStage,
} from "@/lib/repositories/crm-deals"
import type { CrmTaskTargetType } from "@/lib/supabase/database.types"

const STAGES = new Set<string>(CRM_DEAL_STAGES)
const TARGET_TYPES = new Set<string>(CRM_DEAL_TARGET_TYPES)

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function optionalString(value: unknown) {
  if (value == null) return undefined
  return typeof value === "string" ? value : null
}

function optionalNumber(value: unknown) {
  if (value == null || value === "") return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const actor = adminActorName(admin)

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const raw = body as Record<string, unknown>
    const title = typeof raw.title === "string" ? raw.title.trim() : ""
    if (!title) return NextResponse.json({ error: "딜 제목은 필수입니다." }, { status: 400 })

    let ownerKey = optionalString(raw.ownerKey)
    let ownerNameSnapshot = optionalString(raw.ownerNameSnapshot)
    if (raw.assignToMe === true) {
      const currentOwner = findAdminCrmOwner(await listAdminUserDirectoryCached(), admin)
      ownerKey = currentOwner.owner?.ownerKey ?? currentOwner.ownerKeys[0] ?? ownerKey ?? null
      ownerNameSnapshot = currentOwner.owner?.displayName ?? ownerNameSnapshot ?? admin.name ?? null
    }

    const targetType = typeof raw.targetType === "string" ? raw.targetType : undefined
    const stage = typeof raw.stage === "string" ? raw.stage : undefined

    const deal = await createCrmDeal({
      targetType: targetType && TARGET_TYPES.has(targetType) ? (targetType as CrmTaskTargetType) : "unknown",
      targetId: optionalString(raw.targetId),
      targetLabel: optionalString(raw.targetLabel),
      ownerKey: ownerKey ?? undefined,
      ownerNameSnapshot: ownerNameSnapshot ?? undefined,
      title,
      stage: stage && STAGES.has(stage) ? (stage as CrmDealStage) : "consult",
      expectedAmount: optionalNumber(raw.expectedAmount),
      expectedCloseAt: optionalString(raw.expectedCloseAt),
      quoteRef: optionalString(raw.quoteRef),
      orderRef: optionalString(raw.orderRef),
      riskNote: optionalString(raw.riskNote),
      createdBy: actor,
    })

    revalidateTag(ADMIN_CRM_REVENUE_CACHE_TAG, "max")
    return NextResponse.json({ deal }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/admin/crm/deals-lite]", error)
    if (isCrmDealsNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json({ error: "Failed to create CRM deal" }, { status: 500 })
  }
}
