import { NextRequest, NextResponse } from "next/server"

import { runHardwareSheetAutoImport } from "@/lib/hardware/sheet-auto-import"
import { checkCronAuth } from "@/lib/server/cron-auth"

// 시트 읽기(4개 범위, 재시도 포함 최악 수 초) + 미러 교체 + 원장 교체·스냅샷까지 한 번에 돈다.
export const maxDuration = 120

/**
 * 하드웨어 구글 시트 → 미러 → 원장 매시간 자동 가져오기.
 * 시트가 그대로면 원장은 건드리지 않고 확인 시각만 남긴다(lib/hardware/sheet-auto-import.ts).
 *
 * 인증은 `Authorization: Bearer ${CRON_SECRET}` 하나뿐이다(AGENTS.md 배포/Cron 안전 규칙).
 * 끄려면 HARDWARE_SHEET_AUTO_IMPORT=0 — 응답은 200 `disabled`.
 */
export async function GET(req: NextRequest) {
  const authResult = checkCronAuth(req)
  if (authResult === "missing_secret") {
    return NextResponse.json({ error: "CRON_SECRET 환경변수가 설정되지 않았습니다." }, { status: 401 })
  }
  if (authResult !== "ok") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    const outcome = await runHardwareSheetAutoImport()
    const failed = outcome.status === "failed"
    return NextResponse.json({ ok: !failed, ...outcome }, { status: failed ? 500 : 200 })
  } catch (error) {
    // 잠금 확인(DB 읽기) 같은 앞단 오류 — 원문 대신 종류만 남긴다.
    console.error("[cron/hardware-sheet-import] failed:", error instanceof Error ? error.name : "Error")
    return NextResponse.json({ ok: false, status: "failed", stage: "precheck" }, { status: 500 })
  }
}
