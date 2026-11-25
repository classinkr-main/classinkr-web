import "server-only"

// DSH 실적을 장부에서 — 서버 진입점(D4). summary 조립(lib/branch/summary-payload.ts)과 KPI 라우트가 scopeDshToManager
// 전에 한 번 부른다. 시트 고정(BRANCH_REV_SHEET_LOCKED_AT)이 적용 중일 때만 일한다 — 그 밖에는 입력을 그대로(같은 참조)
// 돌려주고 info 는 null 이다(응답에 dsh_ledger 키를 싣지 않는다 — 지금 동작과 같다).
//
// 딜은 호출부가 넘긴다 — D1 한 정의(시트 스냅샷 + 적용된 장부 항목, lib/branch/ledger-overlay.ts mergeLedgerIntoDeals)를
// 이미 적용한 전 팀 딜이다. 이 모듈은 장부 항목을 직접 읽지 않는다. 읽기가 비싸면 함수(로더)로 넘겨 고정이 적용 중일 때만
// 읽게 할 수 있다. 계산 중 무엇이 던져도 summary 를 깨지 않는다 — 시트 실적 그대로 + info.error(화면이 알린다).

import type { DshOutput } from "@/lib/branch/parsers/dsh"
import { getBusinessDateParts } from "@/lib/business-time"
import { currentRevSheetLock, isRevSheetLockActive, type RevSheetLock } from "@/lib/branch/rev-sheet-lock"
import {
  spliceDshWithLedger,
  type BranchDshLedgerInfo,
  type DshLedgerDeal,
} from "@/lib/branch/computations/dsh-ledger-status"

export type { BranchDshLedgerInfo } from "@/lib/branch/computations/dsh-ledger-status"

/** 장부 실적 계산 실패 코드 — 화면은 이 값이 있으면 시트 값을 보여 준다고 알린다. */
export const DSH_LEDGER_STATUS_FAILED = "ledger_status_failed"

export interface ApplyLedgerStatusToDshParams {
  dsh: DshOutput
  /** summary 의 회계연도(fyOf(periodDate)) — New/Renew 판정(첫 결제일 ≥ 그해 4/1)에 쓴다. */
  fiscalYear: number
  /** 지금 — 고정 상태와 읽는 시점(KST 영업일)을 정한다. */
  now: Date
  /** D1 딜(전 팀). 함수면 고정이 적용 중일 때만 부른다. */
  deals: ReadonlyArray<DshLedgerDeal> | (() => Promise<ReadonlyArray<DshLedgerDeal>>)
  /** 고정 상태 — 없으면 currentRevSheetLock(now)(env 를 읽는다). 테스트·호출부가 이미 구했으면 넘긴다. */
  lock?: RevSheetLock
  /** 읽는 시점 KST 'YYYY-MM-DD' — 없으면 now 의 KST 영업일. (KPI 라우트처럼 now 를 달 1일로 낮춘 호출부가 실제 오늘을 넘긴다.) */
  today?: string
}

export interface ApplyLedgerStatusToDshResult {
  dsh: DshOutput
  info: BranchDshLedgerInfo | null
}

export async function applyLedgerStatusToDsh(params: ApplyLedgerStatusToDshParams): Promise<ApplyLedgerStatusToDshResult> {
  const lock = params.lock ?? currentRevSheetLock(params.now)
  if (!isRevSheetLockActive(lock)) return { dsh: params.dsh, info: null }
  try {
    const deals = typeof params.deals === "function" ? await params.deals() : params.deals
    return spliceDshWithLedger({
      dsh: params.dsh,
      deals,
      fiscalYear: params.fiscalYear,
      lockedAt: lock.lockedAt,
      lockMonth: lock.lockMonth,
      today: params.today ?? getBusinessDateParts(params.now).date,
    })
  } catch (error) {
    console.error("[branch/dsh-ledger] 장부 실적 계산 실패 — 시트 DSH 실적을 그대로 씁니다:", error)
    return {
      dsh: params.dsh,
      info: { lockedAt: lock.lockedAt, lockMonth: lock.lockMonth, ledgerMonths: [], error: DSH_LEDGER_STATUS_FAILED },
    }
  }
}
