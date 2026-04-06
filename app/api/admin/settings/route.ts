import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getSettings, updateSettings } from "@/lib/repositories/settings"

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err
  return NextResponse.json(await getSettings())
}

export async function PATCH(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err
  const patch = await req.json()
  const next = await updateSettings(patch)
  return NextResponse.json(next)
}
