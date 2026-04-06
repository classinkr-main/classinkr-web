import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { createBugReport, getBugReports } from "@/lib/repositories/bugs"

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err
  return NextResponse.json(await getBugReports())
}

export async function POST(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err
  const body = await req.json()
  const newBug = await createBugReport({
    ...body,
    tags: body.tags ?? [],
  })
  return NextResponse.json(newBug, { status: 201 })
}
