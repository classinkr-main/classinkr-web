import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
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
    value === "my_owner"
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
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const url = new URL(req.url)
    const customers = await getCrmUnifiedCustomers({
      q: url.searchParams.get("q") ?? undefined,
      source: parseSource(url.searchParams.get("source")),
      lifecycle: parseLifecycle(url.searchParams.get("lifecycle")),
      view: parseSavedView(url.searchParams.get("view")),
      owner: url.searchParams.get("owner") ?? undefined,
      limit: parseBoundedInt(url.searchParams.get("limit"), 100, 1, 200),
      offset: parseBoundedInt(url.searchParams.get("offset"), 0, 0, 100_000),
    })
    return adminCachedJson(customers)
  } catch (error) {
    console.error("[GET /api/admin/crm/customers/unified]", error)
    return NextResponse.json({ error: "Failed to load unified CRM customers" }, { status: 500 })
  }
}
