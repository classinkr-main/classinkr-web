import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getAllCampaigns } from "@/lib/repositories/marketing"

export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  const campaigns = await getAllCampaigns()

  return NextResponse.json({ campaigns })
}
