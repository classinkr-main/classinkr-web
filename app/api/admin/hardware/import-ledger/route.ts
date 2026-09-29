import { NextRequest, NextResponse } from "next/server"

import { toErrorResponse } from "@/app/api/admin/hardware/_validation"
import {
  HARDWARE_EDITOR_ADMIN_API_ROLES,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import { parseLedgerWorkbook } from "@/lib/branch/parsers/hw-ledger"
import { workbookToLedger } from "@/lib/branch/parsers/xlsx-grid"
import {
  replaceHwInbound,
  replaceHwOutbound,
  replaceHwStock,
  replaceHwSalesMonthly,
} from "@/lib/repositories/branch-hw"
import { findRunningSyncRun } from "@/lib/repositories/branch-sync"
import { findRunningHardwareImportRun, importHardwareFromBranchSheets } from "@/lib/repositories/hardware-inventory"
import { hardwareImportWarnings } from "@/lib/hardware/import-outcome"
import { expireSyncCacheTags } from "@/lib/server/sync-cache-tags"

// exceljs relies on Node APIs — pin the Node runtime and allow a longer window.
// 15MB 파싱 + 미러 교체 + 스냅샷 + 원장 교체를 60초에 넣기 빠듯했다 — 가져오기 라우트와 같은 300초(하드웨어 라운드 2 S-13).
export const runtime = "nodejs"
export const maxDuration = 300

const MAX_BYTES = 15 * 1024 * 1024

/**
 * File-upload import for the per-lot "Hardware Ledger - Korea v1" workbook.
 * Parses the uploaded .xlsx into the existing branch_hw_* staging shapes and then
 * reuses the standard staging→ledger import (snapshot/backup + replace RPC), so the
 * dashboard reflects the real per-lot transactions. `dryRun` parses + reports without
 * writing anything.
 */
export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, HARDWARE_EDITOR_ADMIN_API_ROLES)
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

    // 다른 가져오기나 시트 동기화가 미러를 쓰는 중이면 시작하지 않는다 — 업로드가 미러를 교체하는 사이에
    // 크론 싱크가 시트로 덮으면 업로드 원장이 아니라 섞인 미러를 가져온다(하드웨어 라운드 2 S-4).
    const [runningImport, runningSync] = await Promise.all([findRunningHardwareImportRun(), findRunningSyncRun()])
    const running = runningImport ?? runningSync
    if (running) {
      return NextResponse.json(
        { ok: false, skipped: true, outcome: "running", startedAt: running.started_at, stage: "lock", ledgerChanged: false },
        { status: 200 }
      )
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
    let importResult: Awaited<ReturnType<typeof importHardwareFromBranchSheets>>
    try {
      importResult = await importHardwareFromBranchSheets({ actor, origin: "ledger_file", fileName: file.name })
    } finally {
      // 미러는 이미 교체됐고 이관 기록도 바뀌었다 — 성공·실패 모두 다음 조회가 새 값을 받게 즉시 만료한다(S-1).
      expireSyncCacheTags("hardwareImport")
    }

    // warnings(파서 경고, 기존 필드)는 그대로 두고 가져오기 경고는 importWarnings로 따로 싣는다.
    const importWarnings = hardwareImportWarnings(importResult)
    return NextResponse.json({
      ok: true,
      outcome: "done",
      stage: "import",
      ledgerChanged: true,
      file: file.name,
      parsed: parsed.stats,
      warnings: parsed.warnings,
      ...(importWarnings.length > 0 ? { importWarnings } : {}),
      staging: { inbound: inboundStaged, outbound: outboundStaged },
      import: importResult,
    })
  } catch (error) {
    return toErrorResponse(error, "원장 파일 가져오기 실패")
  }
}
