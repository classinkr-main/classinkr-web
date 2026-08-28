import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  getAdminCrmMatchingInbox,
  type CrmMatchingSourceFilter,
  type CrmMatchingStatusFilter,
} from "@/lib/admin-crm-matching"

const MATCHING_ROUTE_TIMEOUT_MS = 12_000
const MATCHING_MAX_NAME_LENGTH = 120
const SOURCE_FILTERS = new Set<CrmMatchingSourceFilter>(["all", "branch_rev_sheet", "xiaoshouyi", "lead"])
const STATUS_FILTERS = new Set<CrmMatchingStatusFilter>(["review", "invalid", "auto", "confirmed", "rejected", "all"])

class MatchingRouteTimeoutError extends Error {}

function readNonNegativeInt(value: string | null, fallback: number) {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

async function withRouteBudget<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new MatchingRouteTimeoutError()), MATCHING_ROUTE_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const url = new URL(req.url)
  const source = (url.searchParams.get("source") ?? "all") as CrmMatchingSourceFilter
  const status = (url.searchParams.get("status") ?? "review") as CrmMatchingStatusFilter
  const limit = readNonNegativeInt(url.searchParams.get("limit"), 50)
  const offset = readNonNegativeInt(url.searchParams.get("offset"), 0)
  const name = (url.searchParams.get("name") ?? "").trim()

  if (!SOURCE_FILTERS.has(source) || !STATUS_FILTERS.has(status) || limit === null || limit < 1 || offset === null) {
    return NextResponse.json({ error: "Invalid matching inbox query" }, { status: 400 })
  }
  if (name.length > MATCHING_MAX_NAME_LENGTH) {
    return NextResponse.json({ error: "Matching name filter is too long" }, { status: 400 })
  }

  try {
    const inbox = await withRouteBudget(
      getAdminCrmMatchingInbox({
        source,
        status,
        limit,
        offset,
        name,
        fresh: url.searchParams.get("fresh") === "1",
      })
    )
    return NextResponse.json(inbox)
  } catch (error) {
    console.error("[GET /api/admin/crm/matching]", error)
    if (error instanceof MatchingRouteTimeoutError) {
      return NextResponse.json(
        { error: "매칭 조회가 지연되어 중단했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 504 }
      )
    }
    return NextResponse.json({ error: "Failed to load CRM matching inbox" }, { status: 500 })
  }
}
