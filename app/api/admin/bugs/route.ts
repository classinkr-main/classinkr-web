import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import fs from "fs"
import path from "path"

const bugsPath = path.join(process.cwd(), "data", "bugs.json")

export interface BugReport {
  id: string
  title: string
  description: string
  severity: "low" | "medium" | "high" | "critical"
  status: "open" | "in-progress" | "resolved" | "closed"
  reporter: string
  assignee?: string
  createdAt: string
  updatedAt: string
  tags: string[]
  environment?: string
}

function getBugs(): BugReport[] {
  if (!fs.existsSync(bugsPath)) return []
  return JSON.parse(fs.readFileSync(bugsPath, "utf-8"))
}

function saveBugs(bugs: BugReport[]) {
  fs.writeFileSync(bugsPath, JSON.stringify(bugs, null, 2))
}

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err
  return NextResponse.json(getBugs())
}

export async function POST(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err
  const body = await req.json()
  const bugs = getBugs()
  const newBug: BugReport = {
    id: `BUG-${Date.now()}`,
    ...body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "open",
    tags: body.tags || [],
  }
  bugs.unshift(newBug)
  saveBugs(bugs)
  return NextResponse.json(newBug, { status: 201 })
}
