"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  PencilLine,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react"

import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import { StatTile } from "@/components/admin/viz"
import { postBranchSync } from "@/components/admin/branch/client-api"
import { SyncOutcomeNotice } from "@/components/admin/branch/SyncOutcomeNotice"
import { describeSyncOutcome, type SyncOutcomeNotice as SyncOutcomeNoticeValue } from "@/lib/admin/sync-outcome"
import { SESSION_CRM_STAFF_ROLES, SESSION_SHEET_SYNC_ROLES, sessionRoleIn } from "@/lib/admin/session-role"
import {
  LEDGER_MANUAL_ENTRIES_HREF,
  REVENUE_SHEET_STATUS_FILTERS,
  buildLedgerEntryHref,
  buildRevenueSheetCsvRows,
  isRevenueSheetSyncStale,
  parseRevenueSheetUrlState,
  serializeRevenueSheetUrlState,
  type RevenueSheetStatusFilter,
} from "@/lib/crm/revenue-sheet-view"
import { downloadCsvFile } from "@/lib/export/browser-download"
import { fileDateStamp, toCsv } from "@/lib/export/delimited"
// 고확도(임박) 금액 색은 확도 신호 토큰 SSOT — 원시 sky 리터럴 재정의 금지(DESIGN.md 확도 신호 토큰 절).
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import type {
  AdminCrmRevenueSheetBreakdownRow,
  AdminCrmRevenueSheetCompassCompare,
  AdminCrmRevenueSheetManualLedgerGap,
  AdminCrmRevenueSheetRow,
  AdminCrmRevenueSheetWorkspace,
  RevenueSheetLinkStatus,
} from "@/lib/admin-crm-revenue-sheet-types"

// 상태 필터 목록·URL 보존·장부 딥링크·CSV 조립은 lib/crm/revenue-sheet-view.ts(순수, 테스트 대상)가 정본이다.
type StatusFilter = RevenueSheetStatusFilter
const STATUS_FILTERS = REVENUE_SHEET_STATUS_FILTERS

const STATUS_LABEL: Record<Exclude<RevenueSheetLinkStatus, null>, string> = {
  candidate: "후보",
  confirmed: "확정",
  rejected: "제외",
  stale: "재검수",
}

const STATUS_TONE: Record<Exclude<RevenueSheetLinkStatus, null>, string> = {
  candidate: "border-sky-100 bg-sky-50 text-sky-700",
  confirmed: "border-emerald-100 bg-emerald-50 text-emerald-700",
  rejected: "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/45",
  stale: "border-amber-100 bg-amber-50 text-amber-700",
}

const MAX_VISIBLE_ROWS = 80
const MOBILE_VISIBLE_ROWS = 25

function formatCny(value: number | null | undefined) {
  const amount = Number(value ?? 0)
  if (Math.abs(amount) >= 10_000) {
    return `¥${(amount / 10_000).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}만`
  }
  return `¥${amount.toLocaleString("ko-KR")}`
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("ko-KR").format(Number(value ?? 0))
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "-"
  return `${Math.round(value * 100)}%`
}

// 기준 시각을 "N분 전"으로 — 절대 시각은 title로 병기한다(S-6).
function formatRelative(value: string | null | undefined, now: number) {
  if (!value) return "기록 없음"
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return "기록 없음"
  const diff = Math.max(0, now - time)
  if (diff < 60_000) return "방금"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`
  return `${Math.floor(diff / 86_400_000)}일 전`
}

function getStatusLabel(status: RevenueSheetLinkStatus) {
  return status ? STATUS_LABEL[status] : "미매칭"
}

function getStatusTone(status: RevenueSheetLinkStatus) {
  return status ? STATUS_TONE[status] : "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]"
}

function getTargetLabel(row: AdminCrmRevenueSheetRow) {
  if (!row.targetType || !row.targetId) return "연결 없음"
  const typeLabel =
    row.targetType === "customer"
      ? "고객"
      : row.targetType === "deal"
        ? "거래"
        : row.targetType === "partner_account"
          ? "파트너"
          : row.targetType
  return row.targetLabel ? `${typeLabel} · ${row.targetLabel}` : `${typeLabel} ${row.targetId.slice(0, 8)}`
}

function matchesStatusFilter(row: AdminCrmRevenueSheetRow, filter: StatusFilter) {
  if (filter === "all") return true
  if (filter === "review") return row.linkStatus === null || row.linkStatus === "candidate" || row.linkStatus === "stale"
  if (filter === "unmatched") return row.linkStatus === null
  return row.linkStatus === filter
}

function StatusBadge({ status }: { status: RevenueSheetLinkStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusTone(status)}`}>
      {getStatusLabel(status)}
    </span>
  )
}

// M8 — Compass(마케팅팀 앱) 대조 배지. "월별 매출시트 흐름"이 실제로 표시하는 달들의 합계
// (scheduledAmount, 어드민 monthly 밴드와 같은 기준)를 Compass 쪽 같은 달 합계와 병기한다.
// 차이가 0이 아니면 주의 톤 — 두 앱 다 같은 REV 원장을 읽으므로 차이는 버그가 아니라 셀 색
// 해석·동기화 지연 문제일 가능성이 높다(캡션에 명시).
function CompassCompareBadge({ compass, loading }: { compass: AdminCrmRevenueSheetCompassCompare | undefined; loading: boolean }) {
  if (loading && !compass) {
    return <ValueSkeleton className="h-5 w-28" />
  }
  if (!compass) return null
  if (compass.down) {
    return (
      <span className="inline-flex items-center rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/40">
        Compass 연결 끊김
      </span>
    )
  }
  const mismatched = compass.diffAmount !== 0
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        mismatched ? "border-amber-200 bg-amber-50 text-amber-800" : "border-[#D6E8DE] bg-[#ECFDF5] text-[#084734]"
      }`}
    >
      Compass {formatCny(compass.compassAmount)}
      {mismatched ? ` · 차이 ${formatCny(Math.abs(compass.diffAmount))}` : " · 일치"}
    </span>
  )
}

// KPI 타일 로컬 재구현 금지(W2-2b) — 마크업은 viz StatTile(bare 변형)에 위임하는 어댑터.
// deals/rev-sheet/matching 3중복이던 MetricCard의 단일 시각 원천은 이제 viz/primitives다.
function MetricCard({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return <StatTile icon={null} iconLayout="inline" variant="bare" compact label={label} value={value} hint={hint} />
}

// 콜드 로드 '...' 금지 — 값 자리 크기의 저대비 펄스 스켈레톤(레이아웃 일치, CRM-5).
function ValueSkeleton({ className = "h-6 w-24" }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-block animate-pulse rounded-md bg-[#f0f0ec] align-middle ${className}`} />
  )
}

// 품질 감사 2026-09-10 — #1(P0): 장부 수기 입력·정정이 이 화면에 반영되지 않는 이중 진실을
// 운영자가 항상 인지하게 하는 배지. 위 warnings 배너(데이터 조회 실패 등)와 톤은 같은 amber
// 계열이지만 문구·아이콘(AlertCircle)을 분리해 "조회 실패"와 "구조적 미반영"을 혼동하지 않게 한다.
// 라운드 5 S-7: 신규(장부에서 만든 행 — 이 화면에 아예 없는 매출)와 정정(시트 행 대체값 — 이 화면은 정정 전
// 값을 보임)을 나눠 말한다. 예전엔 정정 대체값까지 금액에 더해 "빠진 매출"이 과대하게 읽혔고, 장부의
// "장부 가감" 타일(신규만)과 정의가 달랐다. 링크는 장부의 적용 초안 원천만·회계연도 전체로 연다.
function ManualLedgerGapBanner({ gap }: { gap: AdminCrmRevenueSheetManualLedgerGap }) {
  const newCount = gap.newCount ?? gap.count
  const editCount = gap.editCount ?? 0
  const newAmount = gap.newAmount ?? gap.amount
  return (
    <div role="status" className="mb-6 flex flex-wrap items-center gap-2 border-l-2 border-amber-200 bg-amber-50/60 px-3 py-2 text-[13px] text-amber-800">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>
        장부에서 적용한 수기 입력이 이 화면에 반영되지 않았습니다 —{" "}
        {newCount > 0 ? (
          <>
            신규 <strong className="font-bold">{formatNumber(newCount)}건</strong>({formatCny(newAmount)} 이 화면 합계 밖)
          </>
        ) : null}
        {newCount > 0 && editCount > 0 ? " · " : null}
        {editCount > 0 ? (
          <>
            정정 <strong className="font-bold">{formatNumber(editCount)}건</strong>(이 화면은 정정 전 값)
          </>
        ) : null}
        {" "}· 최근 적용 {formatDate(gap.latestAppliedAt)}.
      </span>
      <Link href={LEDGER_MANUAL_ENTRIES_HREF} className="ml-auto inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-amber-900">
        장부에서 확인 <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}

function BreakdownTable({ title, rows }: { title: string; rows: AdminCrmRevenueSheetBreakdownRow[] }) {
  return (
    <section className="min-w-0 border-t border-[#f0f0ec] pt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-[#111110]">{title}</h2>
        <span className="text-[11px] text-[#1a1a1a]/35">{formatNumber(rows.length)} groups</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[520px] w-full text-left">
          <thead className="text-[10.5px] uppercase tracking-[0.12em] text-[#1a1a1a]/35">
            <tr>
              <th className="py-2 pr-3 font-semibold">구분</th>
              <th className="py-2 pr-3 text-right font-semibold">건수</th>
              <th className="py-2 pr-3 text-right font-semibold">확정</th>
              <th className="py-2 pr-3 text-right font-semibold">임박</th>
              <th className="py-2 text-right font-semibold">예정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0ec]">
            {rows.slice(0, 8).map((row) => (
              <tr key={row.key}>
                <td className="py-2.5 pr-3">
                  <p className="truncate text-[12px] font-semibold text-[#111110]">{row.label}</p>
                  <p className="mt-0.5 text-[10.5px] text-[#1a1a1a]/35">{formatCny(row.scheduledAmount)}</p>
                </td>
                <td className="py-2.5 pr-3 text-right text-[12px] text-[#1a1a1a]/50">{formatNumber(row.rowCount)}</td>
                <td className="py-2.5 pr-3 text-right text-[12px] font-semibold text-[#084734]">{formatCny(row.confirmedAmount)}</td>
                <td className={`py-2.5 pr-3 text-right text-[12px] ${CONFIDENCE_TOKENS["high-confidence"].textClass}`}>{formatCny(row.highConfidenceAmount)}</td>
                <td className="py-2.5 text-right text-[12px] text-[#1a1a1a]/60">{formatCny(row.expectedAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function AdminCrmRevenueSheetPage() {
  const [data, setData] = useState<AdminCrmRevenueSheetWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [generatingLinks, setGeneratingLinks] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("review")
  const [teamFilter, setTeamFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  // 동기화·매칭 결과 한 줄 — 완료·이미 실행 중·일부 성공을 구분한다(라운드 5 S-1, 오류는 error 배너).
  const [notice, setNotice] = useState<SyncOutcomeNoticeValue | null>(null)
  // 눌러도 403만 날 버튼은 미리 숨긴다(S-5) — 보안 경계가 아니라 표시 판정이다(서버가 다시 검사한다).
  const [canSync, setCanSync] = useState(false)
  const [canGenerateLinks, setCanGenerateLinks] = useState(false)
  // 표시 상한 — "더 보기"로 늘린다(필터가 바뀌면 처음 상한으로).
  const [visibleLimit, setVisibleLimit] = useState(MAX_VISIBLE_ROWS)
  const [mobileVisibleLimit, setMobileVisibleLimit] = useState(MOBILE_VISIBLE_ROWS)
  const [now, setNow] = useState(() => Date.now())
  const [urlReady, setUrlReady] = useState(false)

  useEffect(() => {
    setCanSync(sessionRoleIn(SESSION_SHEET_SYNC_ROLES))
    setCanGenerateLinks(sessionRoleIn(SESSION_CRM_STAFF_ROLES))
  }, [])

  // 필터 URL 보존(S-9) — 새로고침·링크 공유·뒤로가기에서 검색어·상태·팀이 유지된다. 복원은 마운트 1회,
  // 기록은 replaceState(기록 스택을 늘리지 않음). 기본값은 URL에 적지 않는다(장부 워크벤치와 같은 규약).
  useEffect(() => {
    const restored = parseRevenueSheetUrlState(window.location.search)
    setStatusFilter(restored.status)
    setTeamFilter(restored.team)
    setQuery(restored.q)
    setUrlReady(true)
  }, [])

  useEffect(() => {
    if (!urlReady) return
    const search = serializeRevenueSheetUrlState({ status: statusFilter, team: teamFilter, q: query })
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (nextUrl !== currentUrl) window.history.replaceState(window.history.state, "", nextUrl)
  }, [query, statusFilter, teamFilter, urlReady])

  useEffect(() => {
    setVisibleLimit(MAX_VISIBLE_ROWS)
    setMobileVisibleLimit(MOBILE_VISIBLE_ROWS)
  }, [query, statusFilter, teamFilter])

  // 기준 시각 상대 표기("N분 전")가 멈춰 보이지 않게 1분마다 갱신한다.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const load = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true)
    setError(null)
    try {
      const next = await adminFetchJsonCached<AdminCrmRevenueSheetWorkspace>(
        "/api/admin/crm/revenue-sheet",
        undefined,
        { ttlMs: 30_000, force: options?.force }
      )
      setData(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : "매출시트 데이터를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // REV 동기화 — 응답을 결과 계약으로 읽는다(라운드 5 S-1). 예전엔 응답을 보지 않고 "완료했습니다"를 띄워,
  // 다른 동기화가 도는 중이라 건너뛴 200 { skipped } 응답도 완료로 보였다. 부분 실패(500)의 경고도 살린다.
  const syncSheet = useCallback(async () => {
    setSyncing(true)
    setError(null)
    setNotice(null)
    try {
      const { status, body } = await postBranchSync(["rev"])
      const outcome = describeSyncOutcome(body, { httpStatus: status })
      if (outcome.tone === "error") setError(outcome.message)
      else setNotice(outcome)
      await load({ force: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "REV 시트 동기화에 실패했습니다.")
    } finally {
      setSyncing(false)
    }
  }, [load])

  const generateLinks = useCallback(async () => {
    setGeneratingLinks(true)
    setError(null)
    setNotice(null)
    try {
      await adminFetchJson("/api/admin/crm/source-links/generate", {
        method: "POST",
        body: JSON.stringify({ source: "branch_rev_sheet" }),
      })
      setNotice({ tone: "success", message: "REV 행 기준 매칭 후보를 다시 생성했습니다." })
      await load({ force: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "매칭 후보 생성에 실패했습니다.")
    } finally {
      setGeneratingLinks(false)
    }
  }, [load])

  const teams = useMemo(() => {
    const values = new Set((data?.rows ?? []).map((row) => row.team?.trim()).filter((value): value is string => Boolean(value)))
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ko"))
  }, [data])

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (data?.rows ?? [])
      .filter((row) => matchesStatusFilter(row, statusFilter))
      .filter((row) => teamFilter === "all" || row.team === teamFilter)
      .filter((row) => {
        if (!needle) return true
        return [
          row.customerName,
          row.branchContact,
          row.manager,
          row.status,
          row.region,
          row.note,
          row.targetLabel,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle)
      })
      .sort((a, b) => {
        const riskDelta = b.pastUnconfirmedAmount - a.pastUnconfirmedAmount
        if (riskDelta !== 0) return riskDelta
        const linkDelta = Number(a.linkStatus === "confirmed") - Number(b.linkStatus === "confirmed")
        if (linkDelta !== 0) return linkDelta
        return b.scheduledAmount - a.scheduledAmount
      })
  }, [data?.rows, query, statusFilter, teamFilter])

  const exportCsv = useCallback(() => {
    if (visibleRows.length === 0) return
    downloadCsvFile(`매출시트_REV_${fileDateStamp()}.csv`, toCsv(buildRevenueSheetCsvRows(visibleRows)))
    setNotice({ tone: "success", message: `현재 필터 결과 ${formatNumber(visibleRows.length)}행을 CSV로 내려받았습니다.` })
  }, [visibleRows])

  // 행 → 장부의 그 행(라운드 4 P2-10). 월은 이 화면의 당월(서버 기준) — 행 데이터에 월별 금액이 없다.
  const ledgerMonth = data?.currentMonth ?? ""

  const maxMonthlyAmount = useMemo(() => {
    const values = (data?.monthly ?? []).flatMap((point) => [
      point.confirmedAmount,
      point.highConfidenceAmount,
      point.expectedAmount,
      point.pastUnconfirmedAmount,
    ])
    return Math.max(1, ...values)
  }, [data?.monthly])

  return (
    <div className="[&_button]:min-h-11 [&_button]:min-w-11 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-[#084734] [&_input:not([type=checkbox]):not([type=file])]:min-h-11 [&_input:not([type=checkbox]):not([type=file])]:focus-visible:outline-none [&_input:not([type=checkbox]):not([type=file])]:focus-visible:ring-2 [&_input:not([type=checkbox]):not([type=file])]:focus-visible:ring-[#084734] [&_section_a]:inline-flex [&_section_a]:min-h-11 [&_section_a]:min-w-11 [&_section_a]:items-center [&_section_a]:focus-visible:outline-none [&_section_a]:focus-visible:ring-2 [&_section_a]:focus-visible:ring-[#084734] [&_select]:min-h-11 [&_select]:focus-visible:outline-none [&_select]:focus-visible:ring-2 [&_select]:focus-visible:ring-[#084734] sm:[&_button]:min-h-0 sm:[&_button]:min-w-0 sm:[&_input:not([type=checkbox]):not([type=file])]:min-h-0 sm:[&_section_a]:min-h-0 sm:[&_section_a]:min-w-0 sm:[&_select]:min-h-0">
      {/* 역할 배너 — 매출시트 = REV 분석·검수 READ 표면, 링크 확정 액션은 매칭 인박스(CRM-1 역할 확정) */}
      <p className="mb-4 border-b border-[#f0f0ec] pb-3 text-[12px] text-[#1a1a1a]/45">
        <span className="font-semibold text-[#111110]">분석·검수 전용</span> — 링크 확정은{" "}
        <Link href="/admin/crm/matching" className="inline-flex min-h-11 items-center font-semibold text-[#084734] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] sm:min-h-0">
          매칭 인박스 ↗
        </Link>
        에서.
      </p>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Admin 3.0 Revenue Sheet</p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-[#111110]">매출시트</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#1a1a1a]/45">
            동기화본 기준 운영 — 매칭·통계·CRM 연결 안정화 후 자체 원장으로 승격 예정
          </p>
          {/* 기준 시각(S-6) — 이 화면의 모든 숫자는 REV 시트 동기화본 기준이다. 하루 한 번 크론이라 26시간을
              넘기면 "어제 크론도 실패했다"는 뜻 — 경고 톤으로 보인다(행마다 반복되던 동기화 시각의 요약). */}
          {data ? (
            <p
              className={`mt-1.5 text-[12px] ${
                isRevenueSheetSyncStale(data.summary.latestSyncedAt, now) ? "font-semibold text-amber-800" : "text-[#1a1a1a]/45"
              }`}
              title={`시트 동기화 ${formatDate(data.summary.latestSyncedAt)} · 화면 생성 ${formatDate(data.generatedAt)}`}
            >
              시트 동기화 {formatRelative(data.summary.latestSyncedAt, now)} 기준
              {isRevenueSheetSyncStale(data.summary.latestSyncedAt, now)
                ? " — 하루 넘게 동기화되지 않았습니다. 장부 상단 상태 줄에서 동기화 실패 사유를 확인하세요."
                : null}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load({ force: true })}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </button>
          {canGenerateLinks ? (
            <button
              type="button"
              onClick={() => void generateLinks()}
              disabled={generatingLinks || loading}
              title="REV 행 기준으로 CRM 매칭 후보를 다시 만듭니다 — 확정은 매칭 인박스에서"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
            >
              {generatingLinks ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              매칭 후보
            </button>
          ) : null}
          {canSync ? (
            <button
              type="button"
              onClick={() => void syncSheet()}
              disabled={syncing || loading}
              aria-busy={syncing}
              title="REV 시트를 다시 읽어 이 화면과 매출 장부에 반영합니다 — 보통 수십 초 걸립니다"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#084734] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-50"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              {syncing ? "동기화 중…" : "REV 동기화"}
            </button>
          ) : null}
        </div>
      </div>

      <SyncOutcomeNotice notice={notice} onDismiss={() => setNotice(null)} className="mb-6" />
      {error ? <div role="alert" className="mb-6 border-l-2 border-[#F6D5C5] pl-3 text-[13px] text-[#B85C33]">{error}</div> : null}

      {(data?.warnings.length ?? 0) > 0 ? (
        <div className="mb-6 border-l-2 border-amber-200 pl-3">
          <div className="flex gap-2 text-[13px] text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">{data?.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
          </div>
        </div>
      ) : null}

      {/* 품질 감사 2026-09-10 — #1(P0, 이중 진실): 이 화면은 branch_rev_deals(REV 시트 동기화)만
          본다 — 장부 콕핏/입력 레일에서 저장→적용까지 마친 수기 입력·정정(branch_sales_ledger_
          entries)은 여기 절대 반영되지 않는다(서버 병합은 오매칭 위험이 커 이번 범위에서 보류,
          scratchpad 보고서 참고). 화면이 "최신"으로 오인되지 않도록 항상 눈에 띄는 배지로 알린다. */}
      {data && data.manualLedgerGap.count > 0 ? <ManualLedgerGapBanner gap={data.manualLedgerGap} /> : null}

      <section className="mb-8 grid gap-8 border-y border-[#f0f0ec] py-6 md:grid-cols-2 xl:grid-cols-5">
        {/* '확정' 두 의미 구분(CRM-6): 여기 '확정'=시트 확정 표시(¥) — 코크핏 '인식 매출'(딜리버리 인식 ₩)과 다른 기준 */}
        <MetricCard
          label="확정 표시"
          value={loading && !data ? <ValueSkeleton /> : formatCny(data?.summary.confirmedAmount)}
          hint="주차 칸 빨간 글자 합계 · 시트 전 월(FY)·동기화본 ¥ — 장부 '확정 매출'(선택 기간)·딜리버리 '인식 매출'(₩)과 다른 기준"
        />
        <MetricCard
          label="확정 임박"
          value={loading && !data ? <ValueSkeleton /> : formatCny(data?.summary.highConfidenceAmount)}
          hint="주차 칸 파란 글자 합계 · 시트 전 월(FY) ¥"
        />
        <MetricCard
          label="예정"
          value={loading && !data ? <ValueSkeleton /> : formatCny(data?.summary.expectedAmount)}
          hint="당월 이후 무색 예정 금액 · 시트 전 월(FY) ¥"
        />
        <MetricCard
          label="전환 대기"
          value={loading && !data ? <ValueSkeleton /> : formatCny(data?.summary.pastUnconfirmedAmount)}
          hint="지난달 이전 무색 예정 금액 · 시트 전 월(FY) ¥"
        />
        <MetricCard
          label="매칭 커버리지"
          value={
            loading && !data ? (
              <ValueSkeleton />
            ) : (
              `${formatNumber(data?.summary.linkedRowCount)} / ${formatNumber(data?.summary.activeRowCount)}`
            )
          }
          hint={`확정 link 행 / 활성 행 · 미연결 ${formatCny(data?.summary.unmatchedAmount)} · 후보 ${formatNumber(data?.summary.candidateRowCount)}`}
        />
      </section>

      <section className="mb-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="border-t border-[#f0f0ec] pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold text-[#111110]">월별 매출시트 흐름</h2>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-[11px] text-[#1a1a1a]/35">current {data?.currentMonth ?? "-"}</span>
              <CompassCompareBadge compass={data?.compass} loading={loading} />
            </div>
          </div>
          <div className="flex h-64 items-end gap-2 overflow-x-auto border-b border-[#f0f0ec] pb-4">
            {(data?.monthly ?? []).map((point) => (
              <div key={point.month} className="flex min-w-[46px] flex-1 flex-col items-stretch justify-end gap-1">
                {[
                  ["confirmedAmount", CONFIDENCE_TOKENS.confirmed.bgClass],
                  ["highConfidenceAmount", CONFIDENCE_TOKENS["high-confidence"].bgClass],
                  ["expectedAmount", CONFIDENCE_TOKENS.expected.bgClass],
                  ["pastUnconfirmedAmount", "bg-[#B85C33]"],
                ].map(([field, tone]) => {
                  const amount = Number(point[field as keyof typeof point] ?? 0)
                  if (amount <= 0) return null
                  return (
                    <div
                      key={field}
                      title={`${point.month} ${formatCny(amount)}`}
                      className={`min-h-[3px] rounded-sm ${tone}`}
                      style={{ height: `${Math.max(3, (amount / maxMonthlyAmount) * 210)}px` }}
                    />
                  )
                })}
                <p className="mt-1 text-center text-[10.5px] font-medium text-[#1a1a1a]/35">{point.month.slice(5)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#1a1a1a]/45">
            <span className="inline-flex items-center gap-1"><i className={`h-2 w-2 rounded-sm ${CONFIDENCE_TOKENS.confirmed.bgClass}`} />확정</span>
            <span className="inline-flex items-center gap-1"><i className={`h-2 w-2 rounded-sm ${CONFIDENCE_TOKENS["high-confidence"].bgClass}`} />임박</span>
            <span className="inline-flex items-center gap-1"><i className={`h-2 w-2 rounded-sm ${CONFIDENCE_TOKENS.expected.bgClass}`} />예정</span>
            <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#B85C33]" />전환 대기</span>
          </div>
          {data?.compass && !data.compass.down ? (
            <p className="mt-2 text-[10.5px] leading-relaxed text-[#1a1a1a]/35">
              두 앱이 같은 원장을 읽지만 셀 색 해석이 달라 차이가 날 수 있음 · 시간당 동기화분
            </p>
          ) : null}
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1">
          <BreakdownTable title="팀별" rows={data?.teams ?? []} />
          <BreakdownTable title="담당자별" rows={data?.managers ?? []} />
        </div>
      </section>

      <section className="mb-8 border-t border-[#f0f0ec] pt-4">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-[#111110]">REV 행 운영 테이블</h2>
            <p className="mt-1 text-[12px] text-[#1a1a1a]/42">
              행 이동·고객명 불일치가 있는 동안은 매칭 인박스에서 확정 후 CRM/통계와 연결합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3">
              <Search className="h-4 w-4 text-[#1a1a1a]/35" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="고객, 담당, 메모 검색"
                aria-label="REV 행 검색 — 고객·담당·상태·지역·메모"
                className="h-full w-44 bg-transparent text-[13px] text-[#111110] outline-none placeholder:text-[#1a1a1a]/30"
              />
            </div>
            <div className="flex h-9 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3">
              <Filter className="h-4 w-4 text-[#1a1a1a]/35" />
              <select
                value={teamFilter}
                onChange={(event) => setTeamFilter(event.target.value)}
                aria-label="팀 필터"
                className="h-full bg-transparent text-[13px] font-semibold text-[#111110] outline-none"
              >
                <option value="all">전체 팀</option>
                {/* URL로 들어온 팀이 목록에 없어도(동기화 뒤 사라진 팀 등) 선택 상태가 보이게 남긴다. */}
                {teamFilter !== "all" && !teams.includes(teamFilter) ? <option value={teamFilter}>{teamFilter}</option> : null}
                {teams.map((team) => <option key={team} value={team}>{team}</option>)}
              </select>
            </div>
            {/* 출력(B3) — 표시 상한과 무관하게 현재 필터 결과 전체를 ¥ 정수로. 엑셀 한글 호환(BOM). */}
            <button
              type="button"
              onClick={exportCsv}
              disabled={loading || visibleRows.length === 0}
              title="현재 필터·검색 결과 전체를 CSV로 내려받습니다 — 표시 상한과 무관, 금액은 시트 통화(¥) 정수"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              CSV {visibleRows.length > 0 ? `${formatNumber(visibleRows.length)}행` : ""}
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setStatusFilter(filter.key)}
              className={`h-8 rounded-lg border px-2.5 text-[12px] font-semibold transition-colors ${
                statusFilter === filter.key
                  ? "border-[#111110] bg-[#111110] text-white"
                  : "border-[#e8e8e4] bg-white text-[#111110] hover:bg-[#f5f5f2]"
              }`}
            >
              {filter.label}
            </button>
          ))}
          <Link
            // 검색 중이면 그 컨텍스트를 들고 인박스로 — 재검색 없이 이어서 링크 확정(CRM-1).
            href={
              query.trim()
                ? `/admin/crm/matching?name=${encodeURIComponent(query.trim())}`
                : "/admin/crm/matching"
            }
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
          >
            매칭 인박스
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* <sm 카드 폴백(W2-6·CRM-9) — risk 정렬 그대로 상위 필드(고객/상태/금액/링크상태)를 카드 행으로.
            동일 visibleRows·포매터·딥링크 소비라 기능 손실 0, 넓은 표는 데스크톱 전용. */}
        <div className="space-y-2 sm:hidden">
          {loading && !data ? (
            <p className="rounded-xl bg-[#fafaf8] px-3 py-10 text-center text-[13px] text-[#1a1a1a]/35">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              매출시트를 불러오는 중입니다.
            </p>
          ) : visibleRows.length === 0 ? (
            <p className="rounded-xl bg-[#fafaf8] px-3 py-10 text-center text-[13px] text-[#1a1a1a]/35">
              표시할 REV 행이 없습니다.
            </p>
          ) : (
            visibleRows.slice(0, mobileVisibleLimit).map((row) => (
              <div key={row.id} className="rounded-xl border border-[#e8e8e4] bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[13px] font-semibold text-[#111110]">{row.customerName}</p>
                    <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
                      #{row.sheetRow}
                      {row.placeholder ? <span className="ml-1 font-semibold text-[#B85C33]">임시명</span> : null}
                      {" · "}
                      {[row.team, row.manager, row.region].filter(Boolean).join(" · ") || "-"}
                    </p>
                  </div>
                  <StatusBadge status={row.linkStatus} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-[#f0f0ec] pt-2 text-[11px] tabular-nums">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="text-[#1a1a1a]/40">확정</span>
                    <span className="font-semibold text-[#084734]">{formatCny(row.confirmedAmount)}</span>
                  </p>
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="text-[#1a1a1a]/40">임박</span>
                    <span className={CONFIDENCE_TOKENS["high-confidence"].textClass}>{formatCny(row.highConfidenceAmount)}</span>
                  </p>
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="text-[#1a1a1a]/40">예정</span>
                    <span className="text-[#1a1a1a]/60">{formatCny(row.expectedAmount)}</span>
                  </p>
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="text-[#1a1a1a]/40">대기</span>
                    <span className="font-semibold text-[#B85C33]">{formatCny(row.pastUnconfirmedAmount)}</span>
                  </p>
                </div>
                <p className="mt-2 text-[11px] text-[#1a1a1a]/45">
                  상태 {row.status ?? "-"} · 초입금 {row.firstPayment ?? "-"} · {row.branchContact ?? row.dealType ?? "-"}
                </p>
                <p className="mt-1 text-[11px] text-[#1a1a1a]/45">
                  {getTargetLabel(row)} · 신뢰도 {formatPercent(row.confidence)}
                </p>
                {(row.note ?? row.productVersion) ? (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#1a1a1a]/40">
                    {row.note ?? row.productVersion}
                  </p>
                ) : null}
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#f0f0ec] pt-2">
                  {row.linkStatus === "confirmed" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#084734]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      연결 확정
                    </span>
                  ) : (
                    <Link
                      // 행 고객명을 인박스 이름 필터로 프리필 — 이탈+재검색 없는 핸드오프(CRM-1).
                      href={`/admin/crm/matching?name=${encodeURIComponent(row.customerName)}`}
                      className="text-[11px] font-semibold text-[#084734] hover:underline"
                    >
                      연결하기
                    </Link>
                  )}
                  {/* 입력이 필요하면 장부의 이 행으로(라운드 4 P2-10) — 매출시트는 읽기 표면이라 금액 입력을 두지 않는다. */}
                  <Link
                    href={buildLedgerEntryHref(row, ledgerMonth)}
                    prefetch={false}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#111110] hover:underline"
                  >
                    <PencilLine className="h-3.5 w-3.5" aria-hidden />
                    장부에서 입력
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>

        {visibleRows.length > mobileVisibleLimit ? (
          <div className="mt-4 flex flex-col items-center gap-2 border-t border-[#f0f0ec] pt-3 text-center text-[12px] text-[#1a1a1a]/40 sm:hidden">
            <p>
              우선순위 상위 {formatNumber(mobileVisibleLimit)}건을 표시합니다. 나머지 {formatNumber(visibleRows.length - mobileVisibleLimit)}건은 이어서 보거나 검색·필터로 좁혀 확인하세요.
            </p>
            <button
              type="button"
              onClick={() => setMobileVisibleLimit((limit) => limit + MOBILE_VISIBLE_ROWS)}
              className="inline-flex min-h-11 items-center rounded-lg border border-[#e8e8e4] bg-white px-4 text-[13px] font-semibold text-[#111110]"
            >
              {formatNumber(Math.min(MOBILE_VISIBLE_ROWS, visibleRows.length - mobileVisibleLimit))}건 더 보기
            </button>
          </div>
        ) : null}

        <div className="hidden overflow-x-auto sm:block">
          <table className="min-w-[1320px] w-full text-left">
            <thead className="text-[11px] uppercase tracking-[0.12em] text-[#1a1a1a]/35">
              <tr>
                <th className="py-3 pr-4 font-semibold">행</th>
                <th className="py-3 pr-4 font-semibold">고객 / 담당</th>
                <th className="py-3 pr-4 font-semibold">상태</th>
                <th className="py-3 pr-4 text-right font-semibold">확정</th>
                <th className="py-3 pr-4 text-right font-semibold">임박</th>
                <th className="py-3 pr-4 text-right font-semibold">예정</th>
                <th className="py-3 pr-4 text-right font-semibold">대기</th>
                <th className="py-3 pr-4 font-semibold">CRM 연결</th>
                <th className="py-3 pr-4 font-semibold">메모</th>
                <th className="py-3 text-right font-semibold">작업 · Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0ec]">
              {loading && !data ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-[13px] text-[#1a1a1a]/35">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    매출시트를 불러오는 중입니다.
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-[13px] text-[#1a1a1a]/35">
                    표시할 REV 행이 없습니다.
                  </td>
                </tr>
              ) : (
                visibleRows.slice(0, visibleLimit).map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="py-4 pr-4">
                      <p className="text-[12px] font-semibold text-[#111110]">#{row.sheetRow}</p>
                      {row.placeholder ? <p className="mt-1 text-[10.5px] font-semibold text-[#B85C33]">임시명</p> : null}
                    </td>
                    <td className="py-4 pr-4">
                      <p className="line-clamp-2 text-[13px] font-semibold text-[#111110]">{row.customerName}</p>
                      <p className="mt-1 text-[11px] text-[#1a1a1a]/40">
                        {[row.team, row.manager, row.region].filter(Boolean).join(" · ") || "-"}
                      </p>
                      <p className="mt-1 text-[11px] text-[#1a1a1a]/35">{row.branchContact ?? row.dealType ?? "-"}</p>
                    </td>
                    <td className="py-4 pr-4">
                      <p className="text-[12px] font-semibold text-[#111110]">{row.status ?? "-"}</p>
                      <p className="mt-1 text-[11px] text-[#1a1a1a]/35">초입금 {row.firstPayment ?? "-"}</p>
                    </td>
                    <td className="py-4 pr-4 text-right text-[12px] font-semibold text-[#084734]">{formatCny(row.confirmedAmount)}</td>
                    <td className={`py-4 pr-4 text-right text-[12px] ${CONFIDENCE_TOKENS["high-confidence"].textClass}`}>{formatCny(row.highConfidenceAmount)}</td>
                    <td className="py-4 pr-4 text-right text-[12px] text-[#1a1a1a]/60">{formatCny(row.expectedAmount)}</td>
                    <td className="py-4 pr-4 text-right text-[12px] font-semibold text-[#B85C33]">{formatCny(row.pastUnconfirmedAmount)}</td>
                    <td className="py-4 pr-4">
                      <div className="flex flex-col items-start gap-1.5">
                        <StatusBadge status={row.linkStatus} />
                        <p className="line-clamp-2 text-[11px] text-[#1a1a1a]/45">{getTargetLabel(row)}</p>
                        <p className="text-[10.5px] text-[#1a1a1a]/30">신뢰도 {formatPercent(row.confidence)}</p>
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <p className="line-clamp-3 max-w-[240px] text-[11px] leading-relaxed text-[#1a1a1a]/45">
                        {row.note ?? row.productVersion ?? "-"}
                      </p>
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        {row.linkStatus === "confirmed" ? (
                          <CheckCircle2 className="h-4 w-4 text-[#084734]" aria-label="CRM 연결 확정" />
                        ) : (
                          <Link
                            // 행 고객명을 인박스 이름 필터로 프리필 — 이탈+재검색 없는 핸드오프(CRM-1).
                            href={`/admin/crm/matching?name=${encodeURIComponent(row.customerName)}`}
                            className="text-[11px] font-semibold text-[#084734] hover:underline"
                          >
                            연결하기
                          </Link>
                        )}
                        {/* 입력이 필요하면 장부의 이 행으로(라운드 4 P2-10) — 당월·REV 렌즈·고객명 검색으로 착지. */}
                        <Link
                          href={buildLedgerEntryHref(row, ledgerMonth)}
                          prefetch={false}
                          title={`매출 장부에서 ${row.customerName} 행을 열어 금액을 입력·정정합니다`}
                          className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-[#111110] hover:underline"
                        >
                          <PencilLine className="h-3 w-3" aria-hidden />
                          장부에서 입력
                        </Link>
                      </div>
                      <p className="mt-1 text-[10.5px] text-[#1a1a1a]/30">{formatDate(row.syncedAt)}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {visibleRows.length > visibleLimit ? (
          <div className="mt-4 hidden items-center justify-center gap-3 border-t border-[#f0f0ec] pt-3 text-[12px] text-[#1a1a1a]/40 sm:flex">
            <span>
              외 {formatNumber(visibleRows.length - visibleLimit)}건은 아직 표시하지 않았습니다 — 검색·필터로 좁히거나 이어서 보세요.
            </span>
            <button
              type="button"
              onClick={() => setVisibleLimit((limit) => limit + MAX_VISIBLE_ROWS)}
              className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
            >
              {formatNumber(Math.min(MAX_VISIBLE_ROWS, visibleRows.length - visibleLimit))}건 더 보기
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
