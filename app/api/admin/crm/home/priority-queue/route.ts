import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import {
  CURRENT_ADMIN_OWNER_TOKEN,
  findAdminCrmOwner,
  listAdminUserDirectory,
} from "@/lib/repositories/admin-users"
import {
  getCrmPriorityQueue,
  type CrmPriorityQueueSource,
} from "@/lib/repositories/crm-priority-queue"
import type { CrmPriorityBucket } from "@/lib/crm/priority"

function parseSource(value: string | null): CrmPriorityQueueSource {
  return value === "lead" || value === "neo_account" || value === "task" || value === "customer"
    ? value
    : "all"
}

function parseBucket(value: string | null): CrmPriorityBucket | "all" {
  if (value === "today" || value === "renewal" || value === "stale_recovery" || value === "watch") return value
  return "all"
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const url = new URL(req.url)
    const limit = Number(url.searchParams.get("limit") ?? 12)
    const ownerParam = url.searchParams.get("owner") ?? undefined
    const isMine = ownerParam === CURRENT_ADMIN_OWNER_TOKEN
    const currentOwner = isMine ? findAdminCrmOwner(await listAdminUserDirectory(), admin) : null
    const ownerKeys = isMine
      ? currentOwner?.ownerKeys.length
        ? currentOwner.ownerKeys
        : ["__no_current_admin_owner__"]
      : undefined
    const queue = await getCrmPriorityQueue({
      limit: Number.isFinite(limit) ? limit : 12,
      owner: isMine ? undefined : ownerParam,
      ownerKeys,
      source: parseSource(url.searchParams.get("source")),
      bucket: parseBucket(url.searchParams.get("bucket")),
    })

    return adminCachedJson(queue)
  } catch (error) {
    console.error("[GET /api/admin/crm/home/priority-queue]", error)
    return NextResponse.json({ error: "Failed to load CRM priority queue" }, { status: 500 })
  }
}
