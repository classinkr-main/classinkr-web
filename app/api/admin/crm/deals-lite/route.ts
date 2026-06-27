import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  CURRENT_ADMIN_OWNER_TOKEN,
  findAdminCrmOwner,
  listAdminUserDirectory,
} from "@/lib/repositories/admin-users"
import {
  CRM_DEAL_STAGES,
  CRM_DEAL_STATUSES,
  CRM_DEAL_TARGET_TYPES,
  createCrmDeal,
  isCrmDealsNotReadyError,
  listCrmDeals,
  type CrmDealStage,
  type CrmDealStatus,
} from "@/lib/repositories/crm-deals"
import type { CrmTaskTargetType } from "@/lib/supabase/database.types"

const STAGES = new Set<string>(CRM_DEAL_STAGES)
const STATUSES = new Set<string>(CRM_DEAL_STATUSES)
const TARGET_TYPES = new Set<string>(CRM_DEAL_TARGET_TYPES)

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(Math.floor(parsed), max))
}

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

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const url = new URL(req.url)
    const ownerParam = url.searchParams.get("owner") ?? undefined
    const isMine = ownerParam === CURRENT_ADMIN_OWNER_TOKEN
    const currentOwner = isMine ? findAdminCrmOwner(await listAdminUserDirectory(), admin) : null
    const ownerKeys = isMine
      ? currentOwner?.ownerKeys.length
        ? currentOwner.ownerKeys
        : ["__no_current_admin_owner__"]
      : ownerParam
        ? [ownerParam]
        : undefined

    const status = url.searchParams.get("status")
    const stage = url.searchParams.get("stage")
    const targetType = url.searchParams.get("targetType")

    const deals = await listCrmDeals({
      status: status && STATUSES.has(status) ? (status as CrmDealStatus) : "all",
      stage: stage && STAGES.has(stage) ? (stage as CrmDealStage) : "all",
      ownerKeys,
      targetType: targetType && TARGET_TYPES.has(targetType) ? (targetType as CrmTaskTargetType) : "all",
      targetId: url.searchParams.get("targetId") ?? undefined,
      limit: parseBoundedInt(url.searchParams.get("limit"), 50, 1, 200),
      offset: parseBoundedInt(url.searchParams.get("offset"), 0, 0, 100_000),
    })
    return adminCachedJson(deals)
  } catch (error) {
    console.error("[GET /api/admin/crm/deals-lite]", error)
    return NextResponse.json({ error: "Failed to load CRM deals" }, { status: 500 })
  }
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
      const currentOwner = findAdminCrmOwner(await listAdminUserDirectory(), admin)
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

    return NextResponse.json({ deal }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/admin/crm/deals-lite]", error)
    if (isCrmDealsNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json({ error: "Failed to create CRM deal" }, { status: 500 })
  }
}
