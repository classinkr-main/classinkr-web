"use client"
import { useState } from "react"
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, Database } from "lucide-react"
import { classifySyncFailure, SYNC_FAILURE_CLASS_LABEL } from "@/lib/admin/sync-health"
import { isImportStale } from "@/lib/branch/data-source-freshness"
import { isSheetAheadOfSync } from "@/lib/branch/sheet-freshness"
import { formatCNY } from "@/lib/crm/money-format"
import type { CrmSyncSummary, RevSyncHealth } from "@/lib/crm/rev-sync-health"
import { useVisibleInterval } from "./use-visible-interval"
import type { BranchDataSourceInfo, BranchDataSources } from "./types"

/**
 * lastError 의 출처. run — 마지막 동기화 실행 기록(branch_sync_runs)이 실패로 남았다(원천 갱신이 실제로 실패).
 * request — 이 화면의 요청(수동 동기화 POST·요약 GET, 타임아웃 포함)이 실패했다. 시트 동기화는 멀쩡할 수 있다.
 */
export type SyncStatusErrorOrigin = "run" | "request"

/**
 * KR Team 대시보드가 상태 줄에 넘길 오류와 그 출처. 화면 요청 오류(수동 동기화 → 요약 불러오기)가 실행 기록 오류보다
 * 앞선다 — 보이는 오류의 출처가 곧 origin 이다. "원천 갱신 실패" 머리말은 run 일 때만 붙는다.
 */
export function pickSyncStatusError(input: {
  syncError: string | null
  summaryError: string | null | undefined
  runError: string | null | undefined
}): { lastError: string | null; lastErrorOrigin: SyncStatusErrorOrigin | null } {
  const requestError = input.syncError ?? input.summaryError ?? null
  if (requestError != null) return { lastError: requestError, lastErrorOrigin: "request" }
  const runError = input.runError ?? null
  if (runError != null) return { lastError: runError, lastErrorOrigin: "run" }
  return { lastError: null, lastErrorOrigin: null }
}

interface SyncStatusBarProps {
  lastSync: string | null
  lastSyncStartedAt?: string | null
  lastError: string | null
  /** lastError 의 출처(pickSyncStatusError). 생략하면 request — 실행 기록으로 확인되지 않은 실패를 원천 갱신 실패로 단정하지 않는다. */
  lastErrorOrigin?: SyncStatusErrorOrigin | null
  sheetModifiedAt?: string | null
  dataSources?: BranchDataSources | null
  onRefresh: () => Promise<void>
  syncEnabled?: boolean
  /** 품질 웨이브 3 — 항목 1. summary GET 요청이 실패해 오래된 캐시로 조용히 대체된 경우
   *  그 캐시가 저장된 시각(ms epoch). null/undefined면 정상(최신 데이터 또는 실패 없음). */
  staleSince?: number | null
  /** 품질 감사 2026-09-10 — #2. true면 Drive 시트 신선도 조회 자체가 실패했다는 뜻 —
   *  sheetModifiedAt=null이 "시트에 값 없음"과 구분되지 않던 무음 실패를 명시적으로 알린다. */
  sheetFreshnessError?: boolean
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

export default function SyncStatusBar({ lastSync, lastSyncStartedAt, lastError, lastErrorOrigin = null, sheetModifiedAt, dataSources, onRefresh, syncEnabled = true, staleSince = null, crmSync = null, sheetFreshnessError = false }: SyncStatusBarProps) {
  const [busy, setBusy] = useState(false)
  // Tick once a minute so relative timestamps stay current without a refetch.
  // visibility-aware(코덱스 감사 #15): 백그라운드 탭에서는 멈추고 복귀 즉시 1회 따라잡는다.
  const [now, setNow] = useState(() => Date.now())
  useVisibleInterval(() => setNow(Date.now()), 60_000)

  // 판정 로직은 lib/branch/sheet-freshness.ts로 추출(품질 웨이브 4 — 항목 4) — 장부 화면의
  // "장부 원천 스트립"도 같은 함수로 동일 경고를 낸다.
  const sheetAhead = !lastError && isSheetAheadOfSync(sheetModifiedAt, lastSync)

  // 오류 분류 라벨 — 상태 줄 본문과 "실패 원인 보기" 펼침이 같은 값을 쓴다. 원문(lastError)은 화면에 싣지 않는다.
  const lastErrorLabel = lastError ? SYNC_FAILURE_CLASS_LABEL[classifySyncFailure("sheets", lastError).failureClass] : null
  // 실행 기록으로 확인된 실패만 "원천 갱신 실패"다 — 요약 불러오기 타임아웃 등 화면 요청 오류는 시트가 멀쩡할 수 있다.
  const runFailed = Boolean(lastError) && lastErrorOrigin === "run"

  // 임포트 원천이 시트 동기화보다 오래됐는지 — 2026-07-16 사고(7/3 스테일 임포트가 13일간
  // 최신 시트를 가림) 재발 시 이 배너로 드러난다. sheetAhead(시트가 미러보다 앞섬)와는
  // 별개 신호다: sheetAhead는 라이브 시트 대 미러 동기화 시각을 비교하고, 이건 "서빙 중인
  // 임포트 런"이 그 미러 동기화보다도 뒤처졌는지를 본다.
  const revImportStale = dataSources?.rev.kind === "import" && isImportStale(dataSources.rev.asOf, lastSync, lastSyncStartedAt)
  const dshImportStale = dataSources?.dsh.kind === "import" && isImportStale(dataSources.dsh.asOf, lastSync, lastSyncStartedAt)
  const importStale = Boolean(revImportStale || dshImportStale)

  // 갱신 실패 배너(staleSince) — GET 요청이 실패해 adminFetchJsonCachedWithMeta가 오래된
  // 캐시로 조용히 대체한 경우다(품질 웨이브 3 — 항목 1). lastError(동기화 POST 실패 등
  // 데이터 자체가 없는 완전 실패)보다는 덜 심각하지만("일단 예전 데이터는 보여줄 수 있음"),
  // importStale/sheetAhead보다는 우선한다 — 이번 요청이 실제로 실패했다는 신호가 더 시급하다.
  const staleRefresh = !lastError && staleSince != null

  // 품질 감사 2026-09-10 — #2: sheetFreshnessError는 sheetAhead와 배타적이지 않게 둔다
  // (sheetModifiedAt이 null이면 isSheetAheadOfSync가 항상 false라 실제로는 겹치지 않지만,
  // 판정 순서 자체를 "확인 실패"가 "확인해보니 앞섬"보다 먼저 오게 해 무음 실패를 우선 드러낸다).
  const tone = lastError
    ? { border: "border-[#F2B8B8]", bg: "bg-[#FCE9E9]" }
    : staleRefresh
      ? { border: "border-[#ECD29C]", bg: "bg-[#FBF1E0]" }
      : importStale
        ? { border: "border-[#ECD29C]", bg: "bg-[#FBF1E0]" }
        : sheetFreshnessError
          ? { border: "border-[#ECD29C]", bg: "bg-[#FBF1E0]" }
          : sheetAhead
            // 품질 웨이브 4 — 항목 5: Tailwind 기본 amber-* → 캐논 Warning hex(DESIGN.md §2) 통일.
            ? { border: "border-[#ECD29C]", bg: "bg-[#FBF1E0]" }
            : { border: "border-[#e8e8e4]", bg: "bg-white" }

  return (
    <div className={`sticky top-0 z-30 border-b ${tone.border} ${tone.bg} px-4 py-3 text-[12px]`}>
      <div className="mx-auto max-w-screen-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {lastError
              ? <AlertTriangle className="h-4 w-4 text-[#B43E3E]" />
              : staleRefresh
                ? <AlertTriangle className="h-4 w-4 text-[#A8741A]" />
                : importStale
                  ? <AlertTriangle className="h-4 w-4 text-[#A8741A]" />
                  : sheetFreshnessError
                    ? <AlertTriangle className="h-4 w-4 text-[#A8741A]" />
                    : sheetAhead
                      ? <Clock className="h-4 w-4 text-[#A8741A]" />
                      : <CheckCircle2 className="h-4 w-4 text-[#084734]" />}
            <span role={lastError ? "alert" : "status"} className="text-[#1a1a1a]/75">
              {lastError
                ? // 원문 오류(예: 시트 API 의 권한 문구)는 키·내부 URL 이 섞일 수 있어 싣지 않고, 동기화 경고 띠와
                  // 같은 분류로 말한다(lib/admin/sync-health.ts 정직 규칙).
                  // lastError 에는 동기화 실패만 오지 않는다 — 수동 동기화 요청 실패(권한·타임아웃 포함)·요약
                  // 불러오기 실패·마지막 실행 기록 오류가 섞여 온다(BranchDashboardClient pickSyncStatusError).
                  // 머리말 "원천 갱신 실패"(10-14 KR Team 정리)는 실행 기록 오류(run)에만 붙인다 — 화면 요청 오류는
                  // "동기화 실패"로도 "원천 갱신 실패"로도 단정하지 않는다(09-mooni 3cb0e382).
                  runFailed
                    ? `원천 갱신 실패 · 동기화 실행 오류 — ${lastErrorLabel}`
                    : `불러오기·동기화 오류 — ${lastErrorLabel}`
                : staleRefresh
                  ? `갱신 실패 — ${relativeTime(new Date(staleSince as number).toISOString(), now)} 데이터 표시 중`
                  : importStale
                    ? "임포트가 시트 동기화보다 오래됨 — 장부에서 재동기화 필요"
                    : sheetFreshnessError
                      ? `동기화 ${lastSync ? relativeTime(lastSync, now) : "없음"} — 시트 신선도 확인 실패`
                      : sheetAhead
                        ? `시트가 ${relativeTime(sheetModifiedAt!, now)} 수정 — DB는 ${relativeTime(lastSync!, now)} 동기화`
                        : `동기화 ${lastSync ? relativeTime(lastSync, now) : "없음"}`}
            </span>
            {importStale && !lastError && (
              <a
                href="/admin/branch/ledger"
                className="ml-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#ECD29C]/40 px-2 py-0.5 text-[10.5px] font-semibold text-[#7A520F] underline underline-offset-2 hover:bg-[#ECD29C]/60 md:min-h-0 md:min-w-0"
              >
                장부에서 재동기화 →
              </a>
            )}
            {/* 품질 감사 2026-09-10 — #2: "확인 실패"(원인 불명)와 "확인해보니 시트가 더 새로움"
                (구체적 사실)을 다른 문구로 구분한다 — 실패를 조용히 "정상"처럼 보이게 하지 않는다. */}
            {!importStale && sheetFreshnessError && (
              <span
                className="ml-2 rounded-full bg-[#FBF1E0] px-2 py-0.5 text-[10.5px] font-semibold text-[#7A520F]"
                title="Google Drive에서 시트 수정 시각을 가져오지 못했습니다(권한/네트워크). 시트가 DB보다 앞서 있어도 이 경고가 뜨지 않을 수 있습니다."
              >
                시트 신선도 확인 불가
              </span>
            )}
            {!importStale && !sheetFreshnessError && sheetAhead && (
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
        {lastError ? <details className="mt-1 text-[#615D59]">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-[12px] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[#084734] md:min-h-0">실패 원인 보기</summary>
          {/* 10-14 의 펼침은 원문을 보여 줬지만, 09-25 정직 규칙(원문에 키·내부 URL 이 섞일 수 있음)에 따라
              분류와 출처만 알린다. 원문을 보여 주는 화면은 없다 — 운영 상태(/admin/ops)도 분류만 보이므로 그곳을
              가리키지 않는다. 실행 기록 오류의 원문은 DB(branch_sync_runs.error)에만, 화면 요청 오류는 어디에도
              저장되지 않는다. */}
          <p className="mt-2 break-words">
            {runFailed
              ? `분류: ${lastErrorLabel}. 마지막 동기화 실행 기록의 오류입니다. 원문은 키·내부 주소가 섞일 수 있어 화면에 싣지 않고 DB 실행 기록(branch_sync_runs.error)에만 남습니다.`
              : `분류: ${lastErrorLabel}. 이 화면의 요청(요약 불러오기·수동 동기화 요청)에서 받은 오류라 시트 원천의 문제로 단정하지 않습니다. 원문은 키·내부 주소가 섞일 수 있어 화면에 싣지 않습니다. 다시 불러와도 계속되면 개발 담당에게 알려 주세요.`}
          </p>
          {importStale ? <a href="/admin/branch/ledger" className="inline-flex min-h-11 items-center text-[#7A520F] underline underline-offset-2">장부에서 재동기화 →</a> : null}
        </details> : null}
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
