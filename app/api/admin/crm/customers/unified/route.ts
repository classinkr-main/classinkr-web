import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import {
  CURRENT_ADMIN_OWNER_TOKEN,
  findAdminCrmOwner,
  listAdminUserDirectory,
} from "@/lib/repositories/admin-users"
import {
  getCrmUnifiedCustomers,
  type CrmUnifiedSavedView,
  type CrmUnifiedCustomerSource,
  type CrmUnifiedLifecycle,
} from "@/lib/repositories/crm-unified-customers"

function parseSource(value: string | null): CrmUnifiedCustomerSource | "all" {
  return value === "lead" || value === "neo_account" ? value : "all"
}

function parseLifecycle(value: string | null): CrmUnifiedLifecycle | "all" {
  if (
    value === "new_lead" ||
    value === "active_lead" ||
    value === "account_risk" ||
    value === "active_account" ||
    value === "closed"
  ) {
    return value
  }
  return "all"
}

function parseSavedView(value: string | null): CrmUnifiedSavedView {
  if (
    value === "priority" ||
    value === "new_leads" ||
    value === "needs_care" ||
    value === "my_owner" ||
    value === "expiring" ||
    value === "dormant" ||
    value === "hot_lead" ||
    value === "upsell"
  ) {
    return value
  }
  return "all"
}

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(Math.floor(parsed), max))
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
      : undefined
    const customers = await getCrmUnifiedCustomers({
      q: url.searchParams.get("q") ?? undefined,
      source: parseSource(url.searchParams.get("source")),
      lifecycle: parseLifecycle(url.searchParams.get("lifecycle")),
      view: parseSavedView(url.searchParams.get("view")),
      owner: isMine ? undefined : ownerParam,
      ownerKeys,
      tag: url.searchParams.get("tag") ?? undefined,
      limit: parseBoundedInt(url.searchParams.get("limit"), 100, 1, 200),
      offset: parseBoundedInt(url.searchParams.get("offset"), 0, 0, 100_000),
    })
    return adminCachedJson(customers)
  } catch (error) {
    console.error("[GET /api/admin/crm/customers/unified]", error)
    return NextResponse.json({ error: "Failed to load unified CRM customers" }, { status: 500 })
  }
}
