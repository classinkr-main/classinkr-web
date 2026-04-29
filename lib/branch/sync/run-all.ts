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
    if (sources.includes("rev")) { const r = await syncRev(); revRows = r.rows }
    if (sources.includes("hw"))  { hw = await syncHw() }
    const total = revRows + (hw ? hw.inbound + hw.outbound + hw.stock + hw.sales : 0)
    await finishSyncRun(id, { status: "success", rows_affected: total })
    return { ok: true, rev: revRows, hw }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await finishSyncRun(id, { status: "failed", error: msg })
    return { ok: false, error: msg }
  }
}
