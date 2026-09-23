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
import type { CrmPriorityBucket, CrmPriorityLane } from "@/lib/crm/priority"

function parseSource(value: string | null): CrmPriorityQueueSource {
  return value === "lead" || value === "neo_account" || value === "task" || value === "customer"
    ? value
    : "all"
}

function parseBucket(value: string | null): CrmPriorityBucket | "all" {
  if (value === "today" || value === "renewal" || value === "stale_recovery" || value === "watch") return value
  return "all"
}

function parseLane(value: string | null): CrmPriorityLane | "all" {
  if (value === "sales" || value === "renewal" || value === "customer_care") return value
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
    // 새로고침(?force=1) — overview 라우트와 같은 계약(파라미터 존재 여부로 판정).
    // 서버 소스 스냅샷 캐시를 우회해 신선한 데이터로 계산하고, 응답도 브라우저 캐시에 남기지 않는다.
    const force = url.searchParams.has("force")
    const queue = await getCrmPriorityQueue({
      limit: Number.isFinite(limit) ? limit : 12,
      owner: isMine ? undefined : ownerParam,
      ownerKeys,
      source: parseSource(url.searchParams.get("source")),
      lane: parseLane(url.searchParams.get("lane")),
      bucket: parseBucket(url.searchParams.get("bucket")),
      force,
    })

    const response = adminCachedJson(queue)
    if (force) response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    console.error("[GET /api/admin/crm/home/priority-queue]", error)
    return NextResponse.json({ error: "Failed to load CRM priority queue" }, { status: 500 })
  }
}
