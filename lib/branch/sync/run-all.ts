import "server-only"
import { startSyncRun, finishSyncRun, isAnyRunning, type SyncTrigger } from "@/lib/repositories/branch-sync"
import { syncRev } from "./sync-rev"
import { syncHw } from "./sync-hw"
import { recaptureActiveRevImport, type RevImportRecaptureResult } from "@/lib/repositories/sales-ledger-rev-import"

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
  error?: string
  skipped?: boolean
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

export async function runAll(opts: { trigger: SyncTrigger; sources?: Array<"rev"|"hw"> }): Promise<RunAllResult> {
  if (await isAnyRunning()) return { ok: false, skipped: true }
  const sources = opts.sources ?? ["rev", "hw"]
  const id = await startSyncRun("all", opts.trigger)
  try {
    let revRows = 0
    let revOk: boolean | undefined
    let revImport: RevImportRecaptureResult | undefined
    let revImportError: string | undefined
    let hw: { inbound: number; outbound: number; stock: number; sales: number } | undefined
    // 소스별 격리: REV 시트 권한/구조 문제로 rev가 죽어도 hw 동기화는 계속 돌아야 한다.
    // (반대도 마찬가지 — 한 스프레드시트 장애가 다른 시트의 데이터 신선도까지 잡아먹지 않게)
    const errors: string[] = []
    const warnings: string[] = []
    if (sources.includes("rev")) {
      try { const r = await syncRev(); revRows = r.rows; revOk = true; if (r.warning) warnings.push(r.warning) }
      catch (e) { revOk = false; errors.push(`rev: ${describeError(e)}`) }
      // 서빙 원천이 액티브 임포트면 미러만 갱신해서는 화면이 안 바뀐다. 크론·KR Team·장부·CRM
      // 어느 트리거든 여기서 한 번 재캡처한다(액티브 임포트가 없으면 recapture가 아무것도 안 함).
      // 실패해도 시트 동기화는 성공이다 — 경고로만 싣고, 화면의 스테일 임포트 배지가 드러낸다.
      if (revOk) {
        try { revImport = await recaptureActiveRevImport(`sync:${opts.trigger}`) }
        catch (e) {
          revImportError = describeError(e)
          warnings.push(`REV 장부 임포트 재캡처 실패 — 화면은 이전 캡처를 보여줍니다: ${revImportError}`)
        }
      }
    }
    if (sources.includes("hw")) {
      try { hw = await syncHw() }
      catch (e) { errors.push(`hw: ${describeError(e)}`) }
    }
    const total = revRows + (hw ? hw.inbound + hw.outbound + hw.stock + hw.sales : 0)
    // 경고는 branch_sync_runs 레코드(error 필드)에는 쓰지 않는다 — 동기화는 여전히 성공이다.
    // 반환 객체에만 실어 호출부(수동 동기화 API/크론)가 그대로 노출할 수 있게 한다.
    const warningsField = warnings.length > 0 ? { warnings } : {}
    const revFields = {
      ...(revOk !== undefined ? { revOk } : {}),
      ...(revImport ? { revImport } : {}),
      ...(revImportError ? { revImportError } : {}),
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
    return { ok: false, error: msg }
  }
}
