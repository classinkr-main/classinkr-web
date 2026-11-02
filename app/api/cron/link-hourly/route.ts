import { NextRequest, NextResponse } from "next/server"

import { runHardwareSheetAutoImport, type HardwareSheetAutoImportOutcome } from "@/lib/hardware/sheet-auto-import"
import { checkCronAuth } from "@/lib/server/cron-auth"
import { runRecentLeadCustomerAutoLink, type LeadCustomerAutoLinkReport } from "@/lib/server/lead-customer-autolink"

// 하드웨어 잡: 시트 읽기(4개 범위, 재시도 포함 최악 수 초) + 미러 교체 + 원장 교체·스냅샷.
// 리드 잡: 최근 리드 최대 200건 × 고객 매칭(수 초). 둘을 순서대로 돌려도 이 안에 끝난다.
export const maxDuration = 120

/**
 * 하드웨어·오더·매출 연결 로직의 매시간 작업(docs/active/hardware-order-revenue-link-plan-2026-10-22.md).
 *
 * 1. hardwareSheetImport — 하드웨어 구글 시트 → 미러 → 원장. 시트가 그대로면 원장은 건드리지 않고
 *    확인 시각만 남긴다(lib/hardware/sheet-auto-import.ts). 끄기: HARDWARE_SHEET_AUTO_IMPORT=0.
 * 2. leadCustomerLink — 최근 3시간에 들어오거나 재문의한 리드를 기존 고객에 자동 연결한다
 *    (lib/server/lead-customer-autolink.ts). 자동 확정 여부는 DB 정책(crm_source_priorities)이 정한다.
 *
 * 잡끼리 격리한다 — 한쪽이 실패해도 다른 쪽은 돈다. 하나라도 실패하면 500 이라 크론 로그에 보인다.
 * 인증은 `Authorization: Bearer ${CRON_SECRET}` 하나뿐이다(AGENTS.md 배포/Cron 안전 규칙).
 */
export async function GET(req: NextRequest) {
  const authResult = checkCronAuth(req)
  if (authResult === "missing_secret") {
    return NextResponse.json({ error: "CRON_SECRET 환경변수가 설정되지 않았습니다." }, { status: 401 })
  }
  if (authResult !== "ok") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let hardwareSheetImport: HardwareSheetAutoImportOutcome | { status: "failed"; stage: "precheck" }
  try {
    hardwareSheetImport = await runHardwareSheetAutoImport()
  } catch (error) {
    // 잠금 확인(DB 읽기) 같은 앞단 오류 — 원문 대신 종류만 남긴다.
    console.error("[cron/link-hourly] hardwareSheetImport failed:", error instanceof Error ? error.name : "Error")
    hardwareSheetImport = { status: "failed", stage: "precheck" }
  }

  // runRecentLeadCustomerAutoLink 는 자체적으로 오류를 잡아 failed 보고서로 돌려준다.
  const leadCustomerLink: LeadCustomerAutoLinkReport = await runRecentLeadCustomerAutoLink()

  const ok = hardwareSheetImport.status !== "failed" && leadCustomerLink.status !== "failed"
  return NextResponse.json({ ok, hardwareSheetImport, leadCustomerLink }, { status: ok ? 200 : 500 })
}
