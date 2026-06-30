import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getCrmRevenueTarget, setCrmRevenueTarget } from "@/lib/crm/revenue-target"

// 월 매출 목표(CNY) — 코크핏 매출추이 목표선·달성률 배지용. 목표 없으면 { target: null }.
export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const month = new URL(req.url).searchParams.get("month") ?? ""
    const target = await getCrmRevenueTarget(month)
    return adminCachedJson({ target })
  } catch (error) {
    console.error("[GET /api/admin/crm/revenue-target]", error)
    return NextResponse.json({ error: "Failed to load CRM revenue target" }, { status: 500 })
  }
}

// 월 목표 저장(upsert). 본문 { month: "YYYY-MM", amount: number(CNY) }.
export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  let body: { month?: unknown; amount?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const month = typeof body.month === "string" ? body.month : ""
  const amount = Number(body.amount)
  if (!/^[0-9]{4}-[0-9]{2}$/.test(month) || !Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "month(YYYY-MM)과 0 이상 amount가 필요합니다." }, { status: 400 })
  }

  try {
    const target = await setCrmRevenueTarget(month, amount)
    return NextResponse.json({ target })
  } catch (error) {
    // 테이블 미적용(마이그레이션 전) 등 — 사용자에게 사유 노출.
    console.error("[POST /api/admin/crm/revenue-target]", error)
    return NextResponse.json(
      { error: "목표 저장 실패 — crm_revenue_target 마이그레이션이 적용되었는지 확인하세요." },
      { status: 500 }
    )
  }
}
