import { NextRequest, NextResponse } from "next/server"

import { toErrorResponse } from "@/app/api/admin/hardware/_validation"
import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import { parseLedgerWorkbook } from "@/lib/branch/parsers/hw-ledger"
import { workbookToLedger } from "@/lib/branch/parsers/xlsx-grid"
import {
  replaceHwInbound,
  replaceHwOutbound,
  replaceHwStock,
  replaceHwSalesMonthly,
} from "@/lib/repositories/branch-hw"
import { importHardwareFromBranchSheets } from "@/lib/repositories/hardware-inventory"

// exceljs relies on Node APIs — pin the Node runtime and allow a longer window.
export const runtime = "nodejs"
export const maxDuration = 60

const MAX_BYTES = 15 * 1024 * 1024

/**
 * File-upload import for the per-lot "Hardware Ledger - Korea v1" workbook.
 * Parses the uploaded .xlsx into the existing branch_hw_* staging shapes and then
 * reuses the standard staging→ledger import (snapshot/backup + replace RPC), so the
 * dashboard reflects the real per-lot transactions. `dryRun` parses + reports without
 * writing anything.
 */
export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  try {
    const form = await req.formData()
    const file = form.get("file")
    const dryRun = String(form.get("dryRun") ?? "") === "true"

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "업로드 파일이 없습니다 (form field 'file')." }, { status: 400 })
    }
    if (!/\.xlsx$/i.test(file.name)) {
      return NextResponse.json({ error: ".xlsx 파일만 업로드할 수 있습니다." }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "파일이 너무 큽니다 (최대 15MB)." }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = await workbookToLedger(buffer)
    const parsed = parseLedgerWorkbook(workbook)

    if (parsed.stats.lots.length === 0 && parsed.outbound.length === 0) {
      return NextResponse.json(
        { error: "per-lot 원장 형식(H1~H8 등의 물량번호 탭)을 찾지 못했습니다. 'Hardware Ledger' 파일이 맞는지 확인하세요." },
        { status: 400 }
      )
    }

    if (dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, file: file.name, parsed: parsed.stats, warnings: parsed.warnings })
    }

    // Map into the branch_hw_* staging row shape (mirrors syncHw) and replace staging.
    // Stock/sales staging are cleared so no stale reconciliation rows survive.
    const inboundRows = parsed.inbound.map((p) => ({
      ...p,
      quantity: String(p.quantity),
      unit_price: p.unit_price == null ? "" : String(p.unit_price),
      amount: p.amount == null ? "" : String(p.amount),
    }))
    const outboundRows = parsed.outbound.map((p) => ({
      ...p,
      quantity: String(p.quantity),
      revenue: p.revenue == null ? "" : String(p.revenue),
    }))

    const [inboundStaged, outboundStaged] = await Promise.all([
      replaceHwInbound(inboundRows),
      replaceHwOutbound(outboundRows),
      replaceHwStock([]),
      replaceHwSalesMonthly([]),
    ])

    const actor = admin.name ?? admin.userId ?? admin.role
    const importResult = await importHardwareFromBranchSheets({ actor })

    return NextResponse.json({
      ok: true,
      file: file.name,
      parsed: parsed.stats,
      warnings: parsed.warnings,
      staging: { inbound: inboundStaged, outbound: outboundStaged },
      import: importResult,
    })
  } catch (error) {
    return toErrorResponse(error, "원장 파일 가져오기 실패")
  }
}
