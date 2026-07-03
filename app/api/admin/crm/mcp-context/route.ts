import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getAdminCrmMcpContext } from "@/lib/admin-crm-mcp-context"

// GET 읽기 전용 — 외부(MCP) 소비 가능성이 있어 읽기 완화만 적용한다.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const context = await getAdminCrmMcpContext()
    return NextResponse.json(context)
  } catch (error) {
    console.error("[GET /api/admin/crm/mcp-context]", error)
    return NextResponse.json({ error: "Failed to load CRM MCP context" }, { status: 500 })
  }
}
