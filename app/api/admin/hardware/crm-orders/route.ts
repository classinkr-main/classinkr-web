import { NextRequest, NextResponse } from "next/server"

import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import {
  listHardwareCrmOrderBacklog,
  listHardwareCrmOrderCandidates,
} from "@/lib/repositories/hardware-crm-orders"

function readPositiveInt(value: string | null) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES)
  if (err) return err

  const { searchParams } = new URL(req.url)

  // 대사 목록(입력 가속 P2-1) — CRM 에 있는데 원장에 없는 출고. 홈 패널이 펼칠 때만 부른다
  // (원장 스캔이 붙어 대시보드 기본 왕복에 얹지 않는다).
  if (searchParams.get("scope") === "backlog") {
    try {
      return adminCachedJson(await listHardwareCrmOrderBacklog())
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to read CRM order backlog" },
        { status: 500 }
      )
    }
  }

  const productName = searchParams.get("productName")
  const quantity = readPositiveInt(searchParams.get("quantity"))
  // 기록 중인 고객사 — 같은 품목·수량의 다른 딜이 섞일 때 후보를 가른다(입력 가속 P1-2).
  const customerName = searchParams.get("customer")?.trim() || null

  try {
    const result = await listHardwareCrmOrderCandidates({ productName, quantity, customerName })
    return adminCachedJson(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read CRM order candidates" },
      { status: 500 }
    )
  }
}
