"use client"
import { useEffect, useState } from "react"
import { RefreshCw, AlertTriangle, CheckCircle2, Clock } from "lucide-react"

interface SyncStatusBarProps {
  lastSync: string | null
  lastError: string | null
  sheetModifiedAt?: string | null
  onRefresh: () => Promise<void>
  syncEnabled?: boolean
}

// Threshold above which a sheet edit that postdates the last sync is loud
// enough to warn the user — short edits (cell renames, typo fixes) within a
// minute or two of the last sync don't warrant a banner.
const SHEET_AHEAD_WARN_MS = 2 * 60_000

function relativeTime(iso: string, now: number): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return "방금"
  const diff = Math.max(0, now - t)
  if (diff < 60_000) return "방금"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`
  return `${Math.floor(diff / 86_400_000)}일 전`
}

export default function SyncStatusBar({ lastSync, lastError, sheetModifiedAt, onRefresh, syncEnabled = true }: SyncStatusBarProps) {
  const [busy, setBusy] = useState(false)
  // Tick once a minute so relative timestamps stay current without a refetch.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const sheetAhead =
    !lastError &&
    lastSync &&
    sheetModifiedAt &&
    Date.parse(sheetModifiedAt) - Date.parse(lastSync) > SHEET_AHEAD_WARN_MS

  const tone = lastError
    ? { border: "border-rose-200", bg: "bg-rose-50" }
    : sheetAhead
      ? { border: "border-amber-200", bg: "bg-amber-50" }
      : { border: "border-[#e8e8e4]", bg: "bg-white" }

  return (
    <div className={`sticky top-0 z-30 border-b ${tone.border} ${tone.bg} px-4 py-3 text-[12px]`}>
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {lastError
            ? <AlertTriangle className="h-4 w-4 text-rose-600" />
            : sheetAhead
              ? <Clock className="h-4 w-4 text-amber-600" />
              : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          <span className="text-[#1a1a1a]/75">
            {lastError
              ? lastError
              : sheetAhead
                ? `시트가 ${relativeTime(sheetModifiedAt!, now)} 수정 — DB는 ${relativeTime(lastSync!, now)} 동기화`
                : `마지막 동기화: ${lastSync ? relativeTime(lastSync, now) : "없음"}`}
          </span>
          {sheetAhead && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">
              시트가 더 새로움
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => { setBusy(true); try { await onRefresh() } finally { setBusy(false) } }}
          className="inline-flex items-center gap-1 rounded-full bg-[#111110] px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          {busy ? (syncEnabled ? "동기화 중..." : "불러오는 중...") : (syncEnabled ? "지금 동기화" : "다시 불러오기")}
        </button>
      </div>
    </div>
  )
}
