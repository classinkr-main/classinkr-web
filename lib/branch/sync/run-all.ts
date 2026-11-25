import "server-only"
import type { SyncOutcome } from "@/lib/admin/sync-outcome"
import { currentRevSheetLock } from "@/lib/branch/rev-sheet-lock"
import { startSyncRun, finishSyncRun, findActiveSyncRun, type SyncTrigger } from "@/lib/repositories/branch-sync"
import { businessFy, fiscalYearOfYm } from "@/lib/branch/fiscal"
import { syncDshKpi, syncRev } from "./sync-rev"
import { syncHw } from "./sync-hw"
import { planSyncParts, syncRunSourceFor, type BranchSyncPart, type BranchSyncRequestSource } from "./sync-parts"
import { checkSyncWriteAllowed } from "./write-guard"
import { recaptureActiveRevImport, type RevImportRecaptureResult } from "@/lib/repositories/sales-ledger-rev-import"

export { syncRunSourceFor } from "./sync-parts"
export type { BranchSyncPart } from "./sync-parts"

export interface RunAllResult {
  ok: boolean
  rev?: number
  hw?: { inbound: number; outbound: number; stock: number; sales: number }
  // REV 동기화 성공 여부. rev=0은 "0행 성공"과 "실패"를 구분하지 못해 따로 싣는다. rev를 돌리지 않았으면 undefined.
  revOk?: boolean
  // 동기화 직후 REV 장부 임포트 재캡처 결과. 재캡처를 시도하지 않았거나 실패했으면 undefined(실패는 warnings).
  revImport?: RevImportRecaptureResult
  // 재캡처를 시도했지만 실패한 경우의 원인. warnings에도 같은 내용이 사람이 읽는 문장으로 실린다.
  revImportError?: string
  // 실제로 돌린 부분(시작한 런에만). 시트 고정 중이면 요청의 rev 가 dsh 로 바뀌어 있다 — 완료 처리(complete.ts)가
  // 요청 원천 대신 이 값으로 캐시 만료·링크 유지보수를 고른다.
  ranSources?: BranchSyncPart[]
  // DSH·KPI 만 돌린 부분(시트 고정 뒤)의 행 수와 성공 여부. dsh 를 돌리지 않았으면 undefined.
  dsh?: number
  dshOk?: boolean
  // 시트 고정(lib/branch/rev-sheet-lock.ts)이 active 일 때만 — reread 는 관리자의 "12/1 스냅샷 다시 읽기"로 REV 를 읽었는지.
  revSheetLock?: { lockedAt: string; reread: boolean }
  error?: string
  // 아무것도 하지 않았다 — 다른 실행이 잠금을 잡고 있었거나(이때 startedAt은 그 실행의 시작 시각),
  // 운영 밖 쓰기 가드가 건너뛰었다(이때 outcome="skipped"·outcomeReason).
  skipped?: boolean
  startedAt?: string
  // 결과 종류(lib/admin/sync-outcome.ts 계약). 환경 가드가 건너뛴 런은 "skipped"를 명시한다 — 비우면
  // 화면(describeSyncOutcome)은 skipped=true 를 잠금 충돌("running")로 읽는다. 잠금 충돌은 비워 둔다.
  outcome?: SyncOutcome
  // 사람이 읽는 건너뜀 사유 — 화면에 그대로 나간다. 비밀값·URL 금지.
  outcomeReason?: string
  // 실패로 간주하지 않는 소스별 경고(예: REV 범위 상한 도달 가능성). ok=true여도 있을 수 있다.
  warnings?: string[]
}

// Supabase PostgrestError처럼 Error가 아닌 throw를 "[object Object]"로 뭉개지 않는다 —
// message·code·details·hint를 이어 붙여 동기화 실패 원인이 UI/런 레코드에 그대로 남게 한다.
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === "object") {
    const rec = e as Record<string, unknown>
    const parts = [rec.message, rec.code, rec.details, rec.hint].filter(
      (v): v is string => typeof v === "string" && v.length > 0
    )
    if (parts.length > 0) return parts.join(" · ")
    try { return JSON.stringify(e) } catch { /* circular 등 — String 폴백 */ }
  }
  return String(e)
}

// 실행 기록 값(syncRunSourceFor)·요청 → 부분 매핑(planSyncParts)은 순수 모듈 ./sync-parts.ts 에 있다.

/**
 * 시트 동기화 한 번. 크론(app/api/cron/sync-branch)·수동(app/api/admin/branch/sync) 모두 여기를 탄다.
 *
 * 시트 고정(BRANCH_REV_SHEET_LOCKED_AT)이 active 면 요청의 rev 를 dsh(DSH·KPI 만)로 바꾼다 — REV 파싱·REV 미러 교체·장부
 * 임포트 재캡처를 하지 않고, 실행 기록은 "dsh"·"dsh+hw" 다. allowLockedRevRead(수동 라우트의 revSnapshotReread:true,
 * 관리자만)일 때만 고정 중에도 REV 를 읽는다(12/1 스냅샷 다시 읽기 — 회계연도는 고정 날짜의 것).
 */
export async function runAll(opts: {
  trigger: SyncTrigger
  sources?: BranchSyncRequestSource[]
  allowLockedRevRead?: boolean
}): Promise<RunAllResult> {
  // 운영 런타임이 아니면 쓰기 0회로 끝낸다 — 잠금 조회(findActiveSyncRun)·런 기록(startSyncRun)보다 앞에 둔다.
  // 크론·수동 라우트 모두 이 함수를 타므로 가드는 여기 한 곳이다(규칙·배경: ./write-guard.ts).
  const guard = checkSyncWriteAllowed()
  if (!guard.allowed) {
    console.warn(`[branch-sync] ${opts.trigger} 동기화 건너뜀 — ${guard.outcomeReason}`)
    return { ok: false, skipped: true, outcome: guard.outcome, outcomeReason: guard.outcomeReason }
  }
  // 잠금 충돌은 outcome 을 비운다 — completeBranchSync·describeSyncOutcome 이 skipped=true 를 "running"으로
  // 읽고, startedAt 으로 "N분 전 시작"을 보여 준다.
  const activeRun = await findActiveSyncRun()
  if (activeRun) return { ok: false, skipped: true, startedAt: activeRun.started_at }
  // 빈 배열은 "전부"로 본다 — 아무것도 돌리지 않은 런이 성공("all")으로 남아 두 원천의 연속 실패를
  // 지우는 일이 없게 한다(수동 동기화 라우트도 빈 배열을 undefined로 넘긴다).
  const now = new Date()
  const plan = planSyncParts(opts.sources, currentRevSheetLock(now), { allowLockedRevRead: opts.allowLockedRevRead })
  const parts = plan.parts
  // REV·DSH 를 어느 회계연도로 읽나 — KST 업무일(F-26). 고정 중 스냅샷 다시 읽기는 고정 날짜의 회계연도로 읽는다
  // (12/1 스냅샷을 4월 이후에 다시 읽어도 "3" 이 2027-03 으로 남게).
  const refFy = plan.revSheetLock?.reread ? fiscalYearOfYm(plan.revSheetLock.lockedAt) : businessFy(now)
  const lockFields = plan.revSheetLock ? { revSheetLock: plan.revSheetLock } : {}
  // 실행 기록에 어느 환경·배포·커밋이 썼는지 남긴다(branch_sync_runs.runtime — 컬럼이 없으면 best-effort).
  const id = await startSyncRun(syncRunSourceFor(parts), opts.trigger, guard.runtime)
  try {
    let revRows = 0
    let revOk: boolean | undefined
    let revImport: RevImportRecaptureResult | undefined
    let revImportError: string | undefined
    let dshRows = 0
    let dshOk: boolean | undefined
    let hw: { inbound: number; outbound: number; stock: number; sales: number } | undefined
    // 소스별 격리: REV 시트 권한/구조 문제로 rev가 죽어도 hw 동기화는 계속 돌아야 한다.
    // (반대도 마찬가지 — 한 스프레드시트 장애가 다른 시트의 데이터 신선도까지 잡아먹지 않게)
    const errors: string[] = []
    const warnings: string[] = []
    if (parts.includes("rev")) {
      try { const r = await syncRev({ refFy }); revRows = r.rows; revOk = true; if (r.warning) warnings.push(r.warning) }
      catch (e) { revOk = false; errors.push(`rev: ${describeError(e)}`) }
      // 서빙 원천이 액티브 임포트면 미러만 갱신해서는 화면이 안 바뀐다. 크론·KR Team·장부·CRM
      // 어느 트리거든 여기서 한 번 재캡처한다(액티브 임포트가 없으면 recapture가 아무것도 안 함).
      // 실패해도 시트 동기화는 성공이다 — 경고로만 싣고, 화면의 스테일 임포트 배지가 드러낸다.
      if (revOk) {
        try { revImport = await recaptureActiveRevImport(`sync:${opts.trigger}`, { fiscalYear: refFy }) }
        catch (e) {
          revImportError = describeError(e)
          warnings.push(`REV 장부 임포트 재캡처 실패 — 화면은 이전 캡처를 보여줍니다: ${revImportError}`)
        }
      }
    }
    if (parts.includes("dsh")) {
      // 오류 접두사를 일부러 "rev:" 로 둔다 — 연속 실패 판정(failure-streak.ts)의 원천 키는 스프레드시트 단위라
      // DSH·KPI 실패도 매출 시트("rev")의 실패다. "[DSH·KPI]" 로 REV 를 읽지 않은 런임을 구분한다.
      try { const r = await syncDshKpi({ refFy }); dshRows = r.rows; dshOk = true; if (r.warning) warnings.push(r.warning) }
      catch (e) { dshOk = false; errors.push(`rev: [DSH·KPI] ${describeError(e)}`) }
    }
    if (parts.includes("hw")) {
      try { hw = await syncHw() }
      catch (e) { errors.push(`hw: ${describeError(e)}`) }
    }
    const total = revRows + dshRows + (hw ? hw.inbound + hw.outbound + hw.stock + hw.sales : 0)
    // 경고는 branch_sync_runs 레코드(error 필드)에는 쓰지 않는다 — 동기화는 여전히 성공이다.
    // 반환 객체에만 실어 호출부(수동 동기화 API/크론)가 그대로 노출할 수 있게 한다.
    const warningsField = warnings.length > 0 ? { warnings } : {}
    const revFields = {
      ...(revOk !== undefined ? { revOk } : {}),
      ...(revImport ? { revImport } : {}),
      ...(revImportError ? { revImportError } : {}),
      ...(dshOk !== undefined ? { dsh: dshRows, dshOk } : {}),
      ranSources: parts,
      ...lockFields,
    }
    if (errors.length > 0) {
      const msg = errors.join(" | ")
      await finishSyncRun(id, { status: "failed", rows_affected: total, error: msg })
      return { ok: false, error: msg, rev: revRows, hw, ...revFields, ...warningsField }
    }
    await finishSyncRun(id, { status: "success", rows_affected: total })
    return { ok: true, rev: revRows, hw, ...revFields, ...warningsField }
  } catch (e) {
    const msg = describeError(e)
    await finishSyncRun(id, { status: "failed", error: msg })
    return { ok: false, error: msg, ranSources: parts, ...lockFields }
  }
}
