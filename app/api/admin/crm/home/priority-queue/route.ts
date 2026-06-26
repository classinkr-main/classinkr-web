import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getCrmPriorityQueue } from "@/lib/repositories/crm-priority-queue"
import type { CrmPriorityBucket, CrmPrioritySource } from "@/lib/crm/priority"

function parseSource(value: string | null): CrmPrioritySource | "all" {
  return value === "lead" || value === "neo_account" ? value : "all"
}

function parseBucket(value: string | null): CrmPriorityBucket | "all" {
  if (value === "today" || value === "renewal" || value === "stale_recovery" || value === "watch") return value
  return "all"
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const url = new URL(req.url)
    const limit = Number(url.searchParams.get("limit") ?? 12)
    const queue = await getCrmPriorityQueue({
      limit: Number.isFinite(limit) ? limit : 12,
      owner: url.searchParams.get("owner") ?? undefined,
      source: parseSource(url.searchParams.get("source")),
      bucket: parseBucket(url.searchParams.get("bucket")),
    })

    return adminCachedJson(queue)
  } catch (error) {
    console.error("[GET /api/admin/crm/home/priority-queue]", error)
    return NextResponse.json({ error: "Failed to load CRM priority queue" }, { status: 500 })
  }
}
