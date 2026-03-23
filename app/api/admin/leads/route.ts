import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getLeads } from "@/lib/db"

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err

  const leads = getLeads()
  return NextResponse.json({ leads })
}
