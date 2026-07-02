import { NextRequest, NextResponse } from "next/server"

import { BRANCH_READ_ADMIN_API_ROLES, CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  captureWeeklyCloseSnapshot,
  diffWeeklyClose,
  listWeeklyCloseRuns,
} from "@/lib/repositories/sales-ledger-weekly-close"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function isMissingTableError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes("does not exist") || message.includes("42p01") || message.includes("schema cache")
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, BRANCH_READ_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const url = new URL(req.url)
    const base = url.searchParams.get("base")
    const head = url.searchParams.get("head")
    const month = url.searchParams.get("month")

    const runs = await listWeeklyCloseRuns()

    if (base && head && month) {
      if (!UUID_RE.test(base) || !UUID_RE.test(head)) {
        return NextResponse.json({ error: "base/head 스냅샷 id가 잘못됐습니다." }, { status: 400 })
      }
      if (!MONTH_RE.test(month)) {
        return NextResponse.json({ error: "month 형식이 잘못됐습니다 (YYYY-MM)." }, { status: 400 })
      }
      const diff = await diffWeeklyClose(base, head, month)
      return NextResponse.json({ runs, diff })
    }

    return NextResponse.json({ runs })
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "주간 마감 스냅샷 테이블이 아직 준비되지 않았습니다. sales_ledger_db_native_import 마이그레이션을 적용하세요." },
        { status: 503 },
      )
    }
    console.error("[GET /api/admin/branch/ledger/weekly-close]", error)
    return NextResponse.json({ error: "주간 마감 데이터를 불러오지 못했습니다." }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const result = await captureWeeklyCloseSnapshot(adminActorName(admin))
    return NextResponse.json(result, { status: result.unchanged ? 200 : 201 })
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "주간 마감 스냅샷 테이블이 아직 준비되지 않았습니다. sales_ledger_db_native_import 마이그레이션을 적용하세요." },
        { status: 503 },
      )
    }
    console.error("[POST /api/admin/branch/ledger/weekly-close]", error)
    const message = error instanceof Error ? error.message : "스냅샷 기록에 실패했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
