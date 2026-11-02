import "server-only"

import { revalidateTag } from "next/cache"

import { syncHw } from "@/lib/branch/sync/sync-hw"
import { BRANCH_HW_CACHE_TAG } from "@/lib/repositories/branch-hw"
import { isAnyRunning } from "@/lib/repositories/branch-sync"
import {
  importHardwareFromBranchSheetsIfChanged,
  isHardwareSheetImportRunning,
  recordHardwareSheetImportFailure,
} from "@/lib/repositories/hardware-inventory"

// 하드웨어 시트 매시간 자동 가져오기(2026-10-22 운영자 결정 — docs/active/hardware-order-revenue-link-plan-2026-10-22.md).
//
// 과도기에는 팀이 하드웨어 기록을 구글 시트에 쓴다. 예전에는 시트 → 미러(branch_hw_*) 복사가 하루 한 번이고
// 미러 → 원장(hardware_movements) 반영은 "싱크·백업 후 가져오기" 버튼으로만 됐다. 이 작업은 둘을 매시간
// 이어서 돌리되, 시트가 마지막 성공 가져오기 때와 같으면 원장을 건드리지 않는다.
//
// 동기화 실행 기록(branch_sync_runs)은 남기지 않는다. 그 표의 최근 60회 창으로 매출 시트 연속 실패를
// 판정하므로(lib/branch/sync/failure-streak.ts), 매시간 24줄이 쌓이면 매출 쪽 판정이 이틀 반 만에 잘린다.
// 결과는 하드웨어 가져오기 기록(hardware_import_runs)에만 남고, 하드웨어 화면의 신선도 표시가 읽는다.

export const HARDWARE_SHEET_AUTO_IMPORT_ACTOR = "자동 가져오기(매시간)"

/** 끄는 스위치 — HARDWARE_SHEET_AUTO_IMPORT=0|false|off 면 아무것도 하지 않는다. 기본은 켜짐. */
export function isHardwareSheetAutoImportEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.HARDWARE_SHEET_AUTO_IMPORT?.trim().toLowerCase()
  return !(value === "0" || value === "false" || value === "off")
}

export type HardwareSheetAutoImportOutcome =
  | { status: "disabled" }
  | { status: "busy"; reason: "branch_sync_running" | "hardware_import_running" }
  | { status: "unchanged"; runId: string; checkedAt: string }
  | {
      status: "imported"
      runId: string
      imported: number
      skipped: number
      sheetWinsVoided: number
      sheetWinsKept: number
      sheetWinsError: string | null
    }
  | { status: "failed"; stage: "sheet_sync" | "import"; error: string }

const MAX_ERROR_LENGTH = 300

function describeError(error: unknown): string {
  let text: string
  if (error instanceof Error) text = error.message
  else if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    text = (error as { message: string }).message
  } else text = String(error)
  return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH)}…` : text
}

export async function runHardwareSheetAutoImport(): Promise<HardwareSheetAutoImportOutcome> {
  if (!isHardwareSheetAutoImportEnabled()) return { status: "disabled" }

  // 하루 한 번 도는 전체 동기화(sync-branch)나 사람이 누른 가져오기와 겹치면 이번 회차는 건너뛴다.
  // 미러 표를 동시에 비우고 다시 채우면 서로의 행을 지울 수 있다. 다음 회차가 이어받는다.
  if (await isAnyRunning()) return { status: "busy", reason: "branch_sync_running" }
  if (await isHardwareSheetImportRunning()) return { status: "busy", reason: "hardware_import_running" }

  try {
    await syncHw()
  } catch (error) {
    const message = describeError(error)
    // 기록 실패가 원래 실패를 덮지 않게 가둔다.
    await recordHardwareSheetImportFailure(`시트 읽기 실패: ${message}`, { trigger: "auto" }).catch((recordError) => {
      console.error("[hardware-sheet-auto-import] failure record failed:", describeError(recordError))
    })
    return { status: "failed", stage: "sheet_sync", error: message }
  }
  revalidateTag(BRANCH_HW_CACHE_TAG, "max")

  try {
    const outcome = await importHardwareFromBranchSheetsIfChanged({ actor: HARDWARE_SHEET_AUTO_IMPORT_ACTOR })
    if (outcome.status === "unchanged") {
      return { status: "unchanged", runId: outcome.runId, checkedAt: outcome.checkedAt }
    }
    const { result } = outcome
    return {
      status: "imported",
      runId: result.runId,
      imported: result.imported,
      skipped: result.skipped,
      sheetWinsVoided: result.sheetWinsVoided,
      sheetWinsKept: result.sheetWinsKept,
      sheetWinsError: result.sheetWinsError,
    }
  } catch (error) {
    // 가져오기 자체의 실패는 importHardwareFromBranchSheets가 실행 기록에 이미 남긴다.
    return { status: "failed", stage: "import", error: describeError(error) }
  }
}
