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
    if (sources.includes("rev")) {
      try { const r = await syncRev(); revRows = r.rows }
      catch (e) { errors.push(`rev: ${e instanceof Error ? e.message : String(e)}`) }
    }
    if (sources.includes("hw")) {
      try { hw = await syncHw() }
      catch (e) { errors.push(`hw: ${e instanceof Error ? e.message : String(e)}`) }
    }
    const total = revRows + (hw ? hw.inbound + hw.outbound + hw.stock + hw.sales : 0)
    if (errors.length > 0) {
      const msg = errors.join(" | ")
      await finishSyncRun(id, { status: "failed", rows_affected: total, error: msg })
      return { ok: false, error: msg, rev: revRows, hw }
    }
    await finishSyncRun(id, { status: "success", rows_affected: total })
    return { ok: true, rev: revRows, hw }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await finishSyncRun(id, { status: "failed", error: msg })
    return { ok: false, error: msg }
  }
}
