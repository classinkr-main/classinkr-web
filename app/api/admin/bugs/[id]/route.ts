import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import fs from "fs"
import path from "path"
import { BugReport } from "../route"

const bugsPath = path.join(process.cwd(), "data", "bugs.json")

function getBugs(): BugReport[] {
  if (!fs.existsSync(bugsPath)) return []
  return JSON.parse(fs.readFileSync(bugsPath, "utf-8"))
}

function saveBugs(bugs: BugReport[]) {
  fs.writeFileSync(bugsPath, JSON.stringify(bugs, null, 2))
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req)
  if (err) return err
  const { id } = await params
  const body = await req.json()
  const bugs = getBugs()
  const idx = bugs.findIndex((b) => b.id === id)
  if (idx === -1) return NextResponse.json({ error: "not found" }, { status: 404 })
  bugs[idx] = { ...bugs[idx], ...body, updatedAt: new Date().toISOString() }
  saveBugs(bugs)
  return NextResponse.json(bugs[idx])
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req)
  if (err) return err
  const { id } = await params
  const bugs = getBugs()
  const filtered = bugs.filter((b) => b.id !== id)
  saveBugs(filtered)
  return NextResponse.json({ ok: true })
}
