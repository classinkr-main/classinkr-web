"use client"
import { useState } from "react"
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, Database } from "lucide-react"
import { isImportStale } from "@/lib/branch/data-source-freshness"
import { isSheetAheadOfSync } from "@/lib/branch/sheet-freshness"
import { formatCNY } from "@/lib/crm/money-format"
import type { CrmSyncSummary, RevSyncHealth } from "@/lib/crm/rev-sync-health"
import { useVisibleInterval } from "./use-visible-interval"
import type { BranchDataSourceInfo, BranchDataSources } from "./types"

interface SyncStatusBarProps {
  lastSync: string | null
  lastError: string | null
  sheetModifiedAt?: string | null
  dataSources?: BranchDataSources | null
  onRefresh: () => Promise<void>
  syncEnabled?: boolean
  /** 품질 웨이브 3 — 항목 1. summary GET 요청이 실패해 오래된 캐시로 조용히 대체된 경우
   *  그 캐시가 저장된 시각(ms epoch). null/undefined면 정상(최신 데이터 또는 실패 없음). */
  staleSince?: number | null
  /** CRM 싱크 칩(B안 — 시안 rev-crm-sync-visual-2026-07-18) — 옵션. 데이터는 부모가
   *  /api/admin/crm/coverage 응답을 buildCrmSyncSummary로 접어 1회 전달한다(자체 fetch 없음).
   *  미전달(장부 등 다른 사용처)이면 칩 미표시 — 장부는 A안 스트립이 있어 중복 방지. */
  crmSync?: CrmSyncSummary | null
}

// 칩 톤 — 계정 커버리지 3단계(낮음=테라코타/부분=앰버/건강=그린). 확도 전용 파랑 금지 축.
const CRM_CHIP_TONE: Record<RevSyncHealth, { border: string; text: string; dot: string }> = {
  low: { border: "border-[#EFC9B8]", text: "text-[#8A3F1D]", dot: "bg-[#B85C33]" },
  partial: { border: "border-[#ECD29C]", text: "text-[#7A520F]", dot: "bg-[#A8741A]" },
  healthy: { border: "border-[#BDEFD8]", text: "text-[#084734]", dot: "bg-[#084734]" },
}

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

export default function SyncStatusBar({ lastSync, lastError, sheetModifiedAt, dataSources, onRefresh, syncEnabled = true, staleSince = null, crmSync = null }: SyncStatusBarProps) {
  const [busy, setBusy] = useState(false)
  // Tick once a minute so relative timestamps stay current without a refetch.
  // visibility-aware(코덱스 감사 #15): 백그라운드 탭에서는 멈추고 복귀 즉시 1회 따라잡는다.
  const [now, setNow] = useState(() => Date.now())
  useVisibleInterval(() => setNow(Date.now()), 60_000)

  // 판정 로직은 lib/branch/sheet-freshness.ts로 추출(품질 웨이브 4 — 항목 4) — 장부 화면의
  // "장부 원천 스트립"도 같은 함수로 동일 경고를 낸다.
  const sheetAhead = !lastError && isSheetAheadOfSync(sheetModifiedAt, lastSync)

  // 임포트 원천이 시트 동기화보다 오래됐는지 — 2026-07-16 사고(7/3 스테일 임포트가 13일간
  // 최신 시트를 가림) 재발 시 이 배너로 드러난다. sheetAhead(시트가 미러보다 앞섬)와는
  // 별개 신호다: sheetAhead는 라이브 시트 대 미러 동기화 시각을 비교하고, 이건 "서빙 중인
  // 임포트 런"이 그 미러 동기화보다도 뒤처졌는지를 본다.
  const revImportStale = dataSources?.rev.kind === "import" && isImportStale(dataSources.rev.asOf, lastSync)
  const dshImportStale = dataSources?.dsh.kind === "import" && isImportStale(dataSources.dsh.asOf, lastSync)
  const importStale = Boolean(revImportStale || dshImportStale)

  // 갱신 실패 배너(staleSince) — GET 요청이 실패해 adminFetchJsonCachedWithMeta가 오래된
  // 캐시로 조용히 대체한 경우다(품질 웨이브 3 — 항목 1). lastError(동기화 POST 실패 등
  // 데이터 자체가 없는 완전 실패)보다는 덜 심각하지만("일단 예전 데이터는 보여줄 수 있음"),
  // importStale/sheetAhead보다는 우선한다 — 이번 요청이 실제로 실패했다는 신호가 더 시급하다.
  const staleRefresh = !lastError && staleSince != null

  const tone = lastError
    ? { border: "border-[#F2B8B8]", bg: "bg-[#FCE9E9]" }
    : staleRefresh
      ? { border: "border-[#ECD29C]", bg: "bg-[#FBF1E0]" }
      : importStale
        ? { border: "border-[#ECD29C]", bg: "bg-[#FBF1E0]" }
        : sheetAhead
          // 품질 웨이브 4 — 항목 5: Tailwind 기본 amber-* → 캐논 Warning hex(DESIGN.md §2) 통일.
          ? { border: "border-[#ECD29C]", bg: "bg-[#FBF1E0]" }
          : { border: "border-[#e8e8e4]", bg: "bg-white" }

  return (
    <div className={`sticky top-0 z-30 border-b ${tone.border} ${tone.bg} px-4 py-3 text-[12px]`}>
      <div className="mx-auto max-w-screen-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {lastError
              ? <AlertTriangle className="h-4 w-4 text-[#B43E3E]" />
              : staleRefresh
                ? <AlertTriangle className="h-4 w-4 text-[#A8741A]" />
                : importStale
                  ? <AlertTriangle className="h-4 w-4 text-[#A8741A]" />
                  : sheetAhead
                    ? <Clock className="h-4 w-4 text-[#A8741A]" />
                    : <CheckCircle2 className="h-4 w-4 text-[#084734]" />}
            <span className="text-[#1a1a1a]/75">
              {lastError
                ? lastError
                : staleRefresh
                  ? `갱신 실패 — ${relativeTime(new Date(staleSince as number).toISOString(), now)} 데이터 표시 중`
                  : importStale
                    ? "임포트가 시트 동기화보다 오래됨 — 장부에서 재동기화 필요"
                    : sheetAhead
                      ? `시트가 ${relativeTime(sheetModifiedAt!, now)} 수정 — DB는 ${relativeTime(lastSync!, now)} 동기화`
                      : `마지막 동기화: ${lastSync ? relativeTime(lastSync, now) : "없음"}`}
            </span>
            {importStale && (
              <a
                href="/admin/branch/ledger"
                className="ml-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#ECD29C]/40 px-2 py-0.5 text-[10.5px] font-semibold text-[#7A520F] underline underline-offset-2 hover:bg-[#ECD29C]/60 md:min-h-0 md:min-w-0"
              >
                장부에서 재동기화 →
              </a>
            )}
            {!importStale && sheetAhead && (
              <span className="ml-2 rounded-full bg-[#FBF1E0] px-2 py-0.5 text-[10.5px] font-semibold text-[#7A520F]">
                시트가 더 새로움
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onRefresh() } finally { setBusy(false) } }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full bg-[#111110] px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50 md:min-h-0 md:min-w-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            {busy ? (syncEnabled ? "동기화 중..." : "불러오는 중...") : (syncEnabled ? "지금 동기화" : "다시 불러오기")}
          </button>
        </div>
        {(dataSources || crmSync) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-[10.5px]">
            <span className="inline-flex items-center gap-1 font-semibold text-[#615D59]">
              <Database className="h-3 w-3" />
              원천
            </span>
            {dataSources && (
              <>
                <span className={revImportStale ? "font-semibold text-[#7A520F]" : "text-[#615D59]"}>
                  REV {sourceLabel(dataSources.rev, now)}
                </span>
                <span className={dshImportStale ? "font-semibold text-[#7A520F]" : "text-[#615D59]"}>
                  DSH {sourceLabel(dataSources.dsh, now)}
                </span>
              </>
            )}
            {crmSync && (
              // B안 컴팩트 칩 — 호버(title) 요약, 클릭 시 장부의 A안 CRM 싱크 스트립으로.
              // <a>라 키보드 포커스가 되고, title은 포커스/호버 양쪽에서 읽힌다.
              <a
                href="/admin/branch/ledger"
                title={`계정 ${crmSync.accountConnected}/${crmSync.accountTotal} · 매출 ${formatCNY(crmSync.revenueLinked)}/${formatCNY(crmSync.revenueTotal)} (${crmSync.revenuePctLabel}) · 현재 검토 대기 ${crmSync.rows.review}행 · 과거 후보 이력 ${crmSync.hygiene.orphanCandidates}행 — 클릭하면 장부의 CRM 싱크 패널`}
                className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border bg-white px-2 py-0.5 font-semibold md:min-h-0 md:min-w-0 ${CRM_CHIP_TONE[crmSync.health].border} ${CRM_CHIP_TONE[crmSync.health].text}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${CRM_CHIP_TONE[crmSync.health].dot}`}
                  aria-hidden="true"
                />
                CRM 연결 {crmSync.accountPctLabel}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
