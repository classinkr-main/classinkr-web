import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getSettings, updateSettings } from "@/lib/db"

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err

  return NextResponse.json(getSettings())
}

export async function PATCH(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err

  const patch = await req.json()
  const next = updateSettings(patch)
  return NextResponse.json(next)
}
