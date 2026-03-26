import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getLeads } from "@/lib/repositories/leads"

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err

  try {
    const leads = await getLeads()
    return NextResponse.json({ leads })
  } catch (error) {
    console.error("[GET /api/admin/leads] error:", error)
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 })
  }
}
