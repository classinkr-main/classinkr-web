import { NextRequest, NextResponse } from "next/server"

import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { listHardwareCrmOrderCandidates } from "@/lib/repositories/hardware-crm-orders"

function readPositiveInt(value: string | null) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES)
  if (err) return err

  const { searchParams } = new URL(req.url)
  const productName = searchParams.get("productName")
  const quantity = readPositiveInt(searchParams.get("quantity"))

  try {
    const result = await listHardwareCrmOrderCandidates({ productName, quantity })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read CRM order candidates" },
      { status: 500 }
    )
  }
}
