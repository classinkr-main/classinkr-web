import { NextRequest, NextResponse } from "next/server"
import { STAFF_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { createRoadmapItem, getRoadmapItems, updateRoadmapItem } from "@/lib/repositories/roadmap"
import { hasValidRoadmapStatuses } from "@/lib/admin/dev-workflow"
import type { RoadmapItem } from "@/lib/roadmap-data"

async function readObjectBody(req: NextRequest) {
  const body = await req.json().catch(() => null)
  return body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, STAFF_ADMIN_API_ROLES)
  if (err) return err
  return NextResponse.json(await getRoadmapItems())
}

export async function PATCH(req: NextRequest) {
  const err = await verifyAdmin(req, STAFF_ADMIN_API_ROLES)
  if (err) return err
  const body = await readObjectBody(req)
  if (!body || typeof body.id !== "string" || !hasValidRoadmapStatuses(body)) {
    return NextResponse.json({ error: "Invalid roadmap update" }, { status: 400 })
  }
  const updated = await updateRoadmapItem(body.id, body as unknown as Partial<RoadmapItem>)
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req, STAFF_ADMIN_API_ROLES)
  if (err) return err
  const body = await readObjectBody(req)
  if (!body || !hasValidRoadmapStatuses(body)) {
    return NextResponse.json({ error: "Invalid roadmap input" }, { status: 400 })
  }
  const created = await createRoadmapItem(body as unknown as RoadmapItem)
  return NextResponse.json(created, { status: 201 })
}
