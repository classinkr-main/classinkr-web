"use client"
import { useState } from "react"
import { RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react"

interface SyncStatusBarProps { lastSync: string | null; lastError: string | null; onRefresh: () => Promise<void> }

export default function SyncStatusBar({ lastSync, lastError, onRefresh }: SyncStatusBarProps) {
  const [busy, setBusy] = useState(false)
  return (
    <div className={`sticky top-0 z-30 border-b ${lastError ? "border-rose-200 bg-rose-50" : "border-[#e8e8e4] bg-white"} px-4 py-3 text-[12px]`}>
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {lastError ? <AlertTriangle className="h-4 w-4 text-rose-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          <span className="text-[#1a1a1a]/70">{lastError ?? `마지막 동기화: ${lastSync ? new Date(lastSync).toLocaleString("ko-KR") : "없음"}`}</span>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => { setBusy(true); try { await onRefresh() } finally { setBusy(false) } }}
          className="inline-flex items-center gap-1 rounded-full bg-[#111110] px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          {busy ? "동기화 중..." : "지금 새로고침"}
        </button>
      </div>
    </div>
  )
}
