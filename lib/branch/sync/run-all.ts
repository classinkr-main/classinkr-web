import "server-only"
import { startSyncRun, finishSyncRun, isAnyRunning, type SyncTrigger } from "@/lib/repositories/branch-sync"
import { syncRev } from "./sync-rev"
import { syncHw } from "./sync-hw"

export interface RunAllResult {
  ok: boolean
  rev?: number
  hw?: { inbound: number; outbound: number; stock: number; sales: number }
  error?: string
  skipped?: boolean
  // 실패로 간주하지 않는 소스별 경고(예: REV 범위 상한 도달 가능성). ok=true여도 있을 수 있다.
  warnings?: string[]
}

export async function runAll(opts: { trigger: SyncTrigger; sources?: Array<"rev"|"hw"> }): Promise<RunAllResult> {
  if (await isAnyRunning()) return { ok: false, skipped: true }
  const sources = opts.sources ?? ["rev", "hw"]
  const id = await startSyncRun("all", opts.trigger)
  try {
    let revRows = 0
    let hw: { inbound: number; outbound: number; stock: number; sales: number } | undefined
    // 소스별 격리: REV 시트 권한/구조 문제로 rev가 죽어도 hw 동기화는 계속 돌아야 한다.
    // (반대도 마찬가지 — 한 스프레드시트 장애가 다른 시트의 데이터 신선도까지 잡아먹지 않게)
    const errors: string[] = []
    const warnings: string[] = []
    if (sources.includes("rev")) {
      try { const r = await syncRev(); revRows = r.rows; if (r.warning) warnings.push(r.warning) }
      catch (e) { errors.push(`rev: ${e instanceof Error ? e.message : String(e)}`) }
    }
    if (sources.includes("hw")) {
      try { hw = await syncHw() }
      catch (e) { errors.push(`hw: ${e instanceof Error ? e.message : String(e)}`) }
    }
    const total = revRows + (hw ? hw.inbound + hw.outbound + hw.stock + hw.sales : 0)
    // 경고는 branch_sync_runs 레코드(error 필드)에는 쓰지 않는다 — 동기화는 여전히 성공이다.
    // 반환 객체에만 실어 호출부(수동 동기화 API/크론)가 그대로 노출할 수 있게 한다.
    const warningsField = warnings.length > 0 ? { warnings } : {}
    if (errors.length > 0) {
      const msg = errors.join(" | ")
      await finishSyncRun(id, { status: "failed", rows_affected: total, error: msg })
      return { ok: false, error: msg, rev: revRows, hw, ...warningsField }
    }
    await finishSyncRun(id, { status: "success", rows_affected: total })
    return { ok: true, rev: revRows, hw, ...warningsField }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await finishSyncRun(id, { status: "failed", error: msg })
    return { ok: false, error: msg }
  }
}
