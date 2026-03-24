import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { createRoadmapItem, getRoadmapItems, updateRoadmapItem } from "@/lib/roadmap-data"

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err
  return NextResponse.json(getRoadmapItems())
}

export async function PATCH(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err
  const body = await req.json()
  const updated = updateRoadmapItem(body.id, body)
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function POST(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err
  const body = await req.json()
  const created = createRoadmapItem(body)
  return NextResponse.json(created, { status: 201 })
}
