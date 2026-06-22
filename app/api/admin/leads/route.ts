import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getLeads, getDashboardLeads } from "@/lib/repositories/leads"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    // ?scope=dashboard 는 화면에 쓰는 컬럼만 가져와 페이로드를 줄인다.
    const scope = new URL(req.url).searchParams.get("scope")
    const leads = scope === "dashboard" ? await getDashboardLeads() : await getLeads()
    return adminCachedJson({ leads })
  } catch (error) {
    console.error("[GET /api/admin/leads] error:", error)
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 })
  }
}
