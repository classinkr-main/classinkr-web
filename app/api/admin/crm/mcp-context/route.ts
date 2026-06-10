import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getAdminCrmMcpContext } from "@/lib/admin-crm-mcp-context"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const context = await getAdminCrmMcpContext()
    return NextResponse.json(context)
  } catch (error) {
    console.error("[GET /api/admin/crm/mcp-context]", error)
    return NextResponse.json({ error: "Failed to load CRM MCP context" }, { status: 500 })
  }
}
