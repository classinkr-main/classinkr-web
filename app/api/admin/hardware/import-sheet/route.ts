import { NextRequest, NextResponse } from "next/server"

import {
  readRequestBody,
  toErrorResponse,
} from "@/app/api/admin/hardware/_validation"
import {
  HARDWARE_EDITOR_ADMIN_API_ROLES,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import { branchSyncBundles } from "@/lib/branch/sync/cache-bundles"
import { runAll } from "@/lib/branch/sync/run-all"
import { hardwareImportWarnings } from "@/lib/hardware/import-outcome"
import {
  findRunningHardwareImportRun,
  importHardwareFromBranchSheets,
} from "@/lib/repositories/hardware-inventory"
import { expireSyncCacheTags } from "@/lib/server/sync-cache-tags"

// 시트 4개 읽기 + 미러 교체 + 스냅샷 + 원장 교체 — 정상적으로 수십 초. 클라이언트는 이 경로의 타임아웃을 끈다
// (lib/admin-client.ts LONG_RUNNING_ADMIN_PATHS). 설계 §7.3 HW 행(docs/superpowers/specs/2026-09-14-…-design.md).
export const maxDuration = 300

/**
 * 싱크·백업 후 가져오기 — 하드웨어 라운드 2 §4.1(docs/active/hardware-view-ux-round2-plan-2026-09-23.md).
 *
 * 1. 가져오기 잠금: 다른 탭·사람의 가져오기가 도는 중이면 시작하지 않는다(교체가 겹치면 스냅샷 기준이 꼬인다).
 * 2. 시트 싱크는 runAll 잠금·실행 기록을 함께 쓴다 — 크론·지사 동기화가 미러를 바꾸는 도중에 읽지 않는다.
 *    예전엔 syncHw()를 직접 불러 잠금을 우회했고 "이미 실행 중"을 말할 수 없었다(S-4).
 * 3. 원장이 바뀌면 hardwareImport 묶음을 { expire: 0 }으로 즉시 만료한다 — 예전 "max"(SWR)는 직후 조회가
 *    옛 대시보드였다(S-1). 실패해도 이관 기록(failed)이 바뀌었으니 만료한다.
 * 기존 응답 필드(ok·sync·import)와 성공 200은 그대로 두고 outcome·stage·ledgerChanged·warnings를 더한다(설계 §7.2).
 */
export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, HARDWARE_EDITOR_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    await readRequestBody(req)
  } catch (error) {
    return toErrorResponse(error, "Failed to import hardware sheet")
  }

  let runningImport: Awaited<ReturnType<typeof findRunningHardwareImportRun>>
  try {
    runningImport = await findRunningHardwareImportRun()
  } catch (error) {
    return toErrorResponse(error, "Failed to check hardware import lock")
  }
  if (runningImport) {
    return NextResponse.json(
      { ok: false, skipped: true, outcome: "running", startedAt: runningImport.started_at, stage: "lock", ledgerChanged: false },
      { status: 200 }
    )
  }

  const sync = await runAll({ trigger: "manual", sources: ["hw"] })
  if (sync.skipped) {
    return NextResponse.json(
      { ok: false, skipped: true, outcome: "running", startedAt: sync.runningSince, stage: "lock", ledgerChanged: false },
      { status: 200 }
    )
  }
  // 미러를 쓴 만큼만 만료한다(싱크 실패여도 실행 기록 묶음은 만료 — cache-bundles 규칙).
  expireSyncCacheTags(...branchSyncBundles(sync, ["hw"]))
  if (!sync.hw) {
    return NextResponse.json(
      {
        ok: false,
        outcome: "failed",
        stage: "sync",
        ledgerChanged: false,
        sync: null,
        error: sync.error ?? "시트 싱크에 실패했습니다.",
      },
      { status: 500 }
    )
  }

  const actor = admin.name ?? admin.userId ?? admin.role
  try {
    const importResult = await importHardwareFromBranchSheets({ actor, origin: "sheet" })
    expireSyncCacheTags("hardwareImport")
    const warnings = hardwareImportWarnings(importResult)
    return NextResponse.json({
      ok: true,
      outcome: "done",
      stage: "import",
      ledgerChanged: true,
      sync: sync.hw,
      import: importResult,
      ...(warnings.length > 0 ? { warnings } : {}),
    })
  } catch (error) {
    expireSyncCacheTags("hardwareImport")
    const failure = toErrorResponse(error, "Failed to import hardware sheet")
    const body = (await failure.json().catch(() => ({}))) as { error?: string }
    return NextResponse.json(
      { ok: false, outcome: "failed", stage: "import", ledgerChanged: false, sync: sync.hw, error: body.error },
      { status: failure.status }
    )
  }
}
