"use client"
import { useEffect, useState } from "react"
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, Database } from "lucide-react"
import { isImportStale } from "@/lib/branch/data-source-freshness"
import type { BranchDataSourceInfo, BranchDataSources } from "./types"

interface SyncStatusBarProps {
  lastSync: string | null
  lastError: string | null
  sheetModifiedAt?: string | null
  dataSources?: BranchDataSources | null
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

// 항목 5: 이 바의 "라벨·시간 표기(상대시간)"를 기준으로 삼아 소스별 asOf도 절대시각(formatDateTime)
// 대신 relativeTime으로 통일한다 — 위 헤더(마지막 동기화·시트 수정)와 동일한 표기라야 "REV 임포트가
// 13일 전"처럼 스테일 정도가 한눈에 비교된다(2026-07-16 사고 재발 감지력).
function sourceLabel(source: BranchDataSourceInfo, now: number): string {
  if (source.kind === "import") return `장부 임포트${source.asOf ? ` (${relativeTime(source.asOf, now)})` : ""}`
  if (source.kind === "mirror") return "시트 미러"
  return "라이브 시트"
}

export default function SyncStatusBar({ lastSync, lastError, sheetModifiedAt, dataSources, onRefresh, syncEnabled = true }: SyncStatusBarProps) {
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

  // 임포트 원천이 시트 동기화보다 오래됐는지 — 2026-07-16 사고(7/3 스테일 임포트가 13일간
  // 최신 시트를 가림) 재발 시 이 배너로 드러난다. sheetAhead(시트가 미러보다 앞섬)와는
  // 별개 신호다: sheetAhead는 라이브 시트 대 미러 동기화 시각을 비교하고, 이건 "서빙 중인
  // 임포트 런"이 그 미러 동기화보다도 뒤처졌는지를 본다.
  const revImportStale = dataSources?.rev.kind === "import" && isImportStale(dataSources.rev.asOf, lastSync)
  const dshImportStale = dataSources?.dsh.kind === "import" && isImportStale(dataSources.dsh.asOf, lastSync)
  const importStale = Boolean(revImportStale || dshImportStale)

  const tone = lastError
    ? { border: "border-rose-200", bg: "bg-rose-50" }
    : importStale
      ? { border: "border-[#ECD29C]", bg: "bg-[#FBF1E0]" }
      : sheetAhead
        ? { border: "border-amber-200", bg: "bg-amber-50" }
        : { border: "border-[#e8e8e4]", bg: "bg-white" }

  return (
    <div className={`sticky top-0 z-30 border-b ${tone.border} ${tone.bg} px-4 py-3 text-[12px]`}>
      <div className="mx-auto max-w-screen-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {lastError
              ? <AlertTriangle className="h-4 w-4 text-rose-600" />
              : importStale
                ? <AlertTriangle className="h-4 w-4 text-[#A8741A]" />
                : sheetAhead
                  ? <Clock className="h-4 w-4 text-amber-600" />
                  : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            <span className="text-[#1a1a1a]/75">
              {lastError
                ? lastError
                : importStale
                  ? "임포트가 시트 동기화보다 오래됨 — 장부에서 재동기화 필요"
                  : sheetAhead
                    ? `시트가 ${relativeTime(sheetModifiedAt!, now)} 수정 — DB는 ${relativeTime(lastSync!, now)} 동기화`
                    : `마지막 동기화: ${lastSync ? relativeTime(lastSync, now) : "없음"}`}
            </span>
            {importStale && (
              <a
                href="/admin/branch/ledger"
                className="ml-2 inline-flex items-center rounded-full bg-[#ECD29C]/40 px-2 py-0.5 text-[10.5px] font-semibold text-[#7A520F] underline underline-offset-2 hover:bg-[#ECD29C]/60"
              >
                장부에서 재동기화 →
              </a>
            )}
            {!importStale && sheetAhead && (
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
        {dataSources && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-[10.5px]">
            <span className="inline-flex items-center gap-1 font-semibold text-[#615D59]">
              <Database className="h-3 w-3" />
              원천
            </span>
            <span className={revImportStale ? "font-semibold text-[#7A520F]" : "text-[#615D59]"}>
              REV {sourceLabel(dataSources.rev, now)}
            </span>
            <span className={dshImportStale ? "font-semibold text-[#7A520F]" : "text-[#615D59]"}>
              DSH {sourceLabel(dataSources.dsh, now)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
