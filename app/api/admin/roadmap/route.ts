import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import fs from "fs"
import path from "path"

const roadmapPath = path.join(process.cwd(), "data", "roadmap.json")

function getRoadmap() {
  if (!fs.existsSync(roadmapPath)) return []
  return JSON.parse(fs.readFileSync(roadmapPath, "utf-8"))
}

function saveRoadmap(data: unknown) {
  fs.writeFileSync(roadmapPath, JSON.stringify(data, null, 2))
}

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err
  return NextResponse.json(getRoadmap())
}

export async function PATCH(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err
  const body = await req.json()
  const roadmap = getRoadmap()
  const idx = roadmap.findIndex((v: { id: string }) => v.id === body.id)
  if (idx === -1) return NextResponse.json({ error: "not found" }, { status: 404 })
  roadmap[idx] = { ...roadmap[idx], ...body }
  saveRoadmap(roadmap)
  return NextResponse.json(roadmap[idx])
}

export async function POST(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err
  const body = await req.json()
  const roadmap = getRoadmap()
  roadmap.push(body)
  saveRoadmap(roadmap)
  return NextResponse.json(body, { status: 201 })
}
