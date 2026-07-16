"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react"

import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import type {
  AdminCrmRevenueSheetBreakdownRow,
  AdminCrmRevenueSheetRow,
  AdminCrmRevenueSheetWorkspace,
  RevenueSheetLinkStatus,
} from "@/lib/admin-crm-revenue-sheet-types"

type StatusFilter = "all" | "review" | "confirmed" | "candidate" | "stale" | "rejected" | "unmatched"

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "review", label: "검토 필요" },
  { key: "all", label: "전체" },
  { key: "confirmed", label: "확정" },
  { key: "candidate", label: "후보" },
  { key: "stale", label: "재검수" },
  { key: "unmatched", label: "미매칭" },
  { key: "rejected", label: "제외" },
]

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

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div data-panel="metric-card" className="flex h-full min-h-[132px] flex-col rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-[#111110]">{value}</p>
      <p className="mt-auto pt-2 text-[12px] leading-relaxed text-[#1a1a1a]/42">{hint}</p>
    </div>
  )
}

function BreakdownTable({ title, rows }: { title: string; rows: AdminCrmRevenueSheetBreakdownRow[] }) {
  return (
    <section data-panel="breakdown-table" className="flex min-w-0 flex-col rounded-2xl border border-[#e8e8e4] bg-white p-4 lg:min-h-[188px]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-[#111110]">{title}</h2>
        <span className="text-[11px] text-[#1a1a1a]/35">{formatNumber(rows.length)} groups</span>
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto">
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
                <td className="py-2.5 pr-3 text-right text-[12px] text-sky-700">{formatCny(row.highConfidenceAmount)}</td>
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
  const deferredQuery = useDeferredValue(query)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const filtering = query !== deferredQuery

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

  const syncSheet = useCallback(async () => {
    setSyncing(true)
    setError(null)
    setNotice(null)
    try {
      await adminFetchJson("/api/admin/branch/sync", {
        method: "POST",
        body: JSON.stringify({ sources: ["rev"] }),
      })
      setNotice("REV 시트 동기화와 매칭 유지보수를 완료했습니다.")
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
      setNotice("REV 행 기준 매칭 후보를 다시 생성했습니다.")
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
    const needle = deferredQuery.trim().toLowerCase()
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
  }, [data?.rows, deferredQuery, statusFilter, teamFilter])

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
    <div>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Admin 3.0 Revenue Snapshot</p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-[#111110]">REV 스냅샷</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#1a1a1a]/45">
            어드민 DB에 저장된 마지막 REV 동기화본을 기준으로 운영합니다. 원본 Google Sheet는 가져오기 원천일 뿐이고,
            매칭·통계·CRM 연결 판단은 자체 DB 스냅샷에서 먼저 처리합니다.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:max-w-[620px] lg:justify-end">
          <button
            type="button"
            onClick={() => void load({ force: true })}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </button>
          <button
            type="button"
            onClick={() => void generateLinks()}
            disabled={generatingLinks || loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
          >
            {generatingLinks ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            매칭 후보
          </button>
          <button
            type="button"
            onClick={() => void syncSheet()}
            disabled={syncing || loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            원본 REV 가져오기
          </button>
          <Link
            href="/admin/crm/matching?source=branch_rev_sheet&status=review"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41]"
          >
            매칭 검수
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {notice ? <div className="mb-6 border-l-2 border-[#D6EFE5] pl-3 text-[13px] text-[#084734]">{notice}</div> : null}
      {error ? <div className="mb-6 border-l-2 border-[#F6D5C5] pl-3 text-[13px] text-[#B85C33]">{error}</div> : null}

      {(data?.warnings.length ?? 0) > 0 ? (
        <div className="mb-6 border-l-2 border-amber-200 pl-3">
          <div className="flex gap-2 text-[13px] text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">{data?.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
          </div>
        </div>
      ) : null}

      <section className="mb-8 grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="확정 표시"
          value={loading && !data ? "..." : formatCny(data?.summary.confirmedAmount)}
          hint="주차 칸 빨간 글자 금액 합계"
        />
        <MetricCard
          label="확정 임박"
          value={loading && !data ? "..." : formatCny(data?.summary.highConfidenceAmount)}
          hint="주차 칸 파란 글자 금액 합계"
        />
        <MetricCard
          label="예정"
          value={loading && !data ? "..." : formatCny(data?.summary.expectedAmount)}
          hint="당월 이후 무색 예정 금액"
        />
        <MetricCard
          label="전환 대기"
          value={loading && !data ? "..." : formatCny(data?.summary.pastUnconfirmedAmount)}
          hint="지난달 이전 무색 예정 금액"
        />
        <MetricCard
          label="매칭 커버리지"
          value={
            loading && !data
              ? "..."
              : `${formatNumber(data?.summary.linkedRowCount)} / ${formatNumber(data?.summary.activeRowCount)}`
          }
          hint={`미연결 ${formatCny(data?.summary.unmatchedAmount)} · 후보 ${formatNumber(data?.summary.candidateRowCount)}`}
        />
      </section>

      <section className="mb-8 grid min-w-0 items-stretch gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div data-panel="monthly-flow" className="flex min-w-0 flex-col rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold text-[#111110]">월별 DB 스냅샷 흐름</h2>
              <p className="mt-1 text-[12px] text-[#1a1a1a]/42">저장된 REV 스냅샷의 확정·임박·예정·전환 대기를 한 달 단위로 분리해서 봅니다.</p>
            </div>
            <span className="text-[11px] text-[#1a1a1a]/35">current {data?.currentMonth ?? "-"}</span>
          </div>
          <div className="mt-2 flex min-h-[260px] flex-1 items-end gap-2 overflow-x-auto border-b border-[#f0f0ec] pb-4">
            {(data?.monthly ?? []).map((point) => (
              <div key={point.month} className="flex min-w-[46px] flex-1 flex-col items-stretch justify-end gap-1">
                {[
                  ["confirmedAmount", "bg-[#084734]"],
                  ["highConfidenceAmount", "bg-sky-500"],
                  ["expectedAmount", "bg-[#6EE7B7]"],
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
            <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#084734]" />확정</span>
            <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-sky-500" />임박</span>
            <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#6EE7B7]" />예정</span>
            <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#B85C33]" />전환 대기</span>
          </div>
        </div>

        <div data-panel="breakdown-stack" className="grid min-w-0 content-start gap-6 md:grid-cols-2 lg:grid-cols-1">
          <BreakdownTable title="팀별" rows={data?.teams ?? []} />
          <BreakdownTable title="담당자별" rows={data?.managers ?? []} />
        </div>
      </section>

      <section data-panel="rev-rows" className="mb-8 min-w-0 rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-[#111110]">REV 스냅샷 행</h2>
            <p className="mt-1 text-[12px] text-[#1a1a1a]/42">
              원본 시트 주소가 바뀌어도 마지막 DB 저장본으로 검수하고, 고객명 불일치는 매칭 인박스에서 CRM/통계와 연결합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3">
              <Search className="h-4 w-4 text-[#1a1a1a]/35" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="스냅샷 고객, 담당, 메모 검색"
                className="h-full w-44 bg-transparent text-[13px] text-[#111110] outline-none placeholder:text-[#1a1a1a]/30"
              />
            </div>
            <div className="flex h-9 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3">
              <Filter className="h-4 w-4 text-[#1a1a1a]/35" />
              <select
                value={teamFilter}
                onChange={(event) => setTeamFilter(event.target.value)}
                className="h-full bg-transparent text-[13px] font-semibold text-[#111110] outline-none"
              >
                <option value="all">전체 팀</option>
                {teams.map((team) => <option key={team} value={team}>{team}</option>)}
              </select>
            </div>
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
            href="/admin/crm/matching?source=branch_rev_sheet&status=review"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] sm:ml-auto"
          >
            매칭 인박스
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className={`min-w-0 overflow-x-auto transition-opacity ${filtering ? "opacity-70" : ""}`}>
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
                <th className="py-3 text-right font-semibold">Sync</th>
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
                visibleRows.slice(0, MAX_VISIBLE_ROWS).map((row) => (
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
                    <td className="py-4 pr-4 text-right text-[12px] text-sky-700">{formatCny(row.highConfidenceAmount)}</td>
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
                      {row.linkStatus === "confirmed" ? (
                        <CheckCircle2 className="ml-auto h-4 w-4 text-[#084734]" />
                      ) : (
                        <Link
                          href={`/admin/crm/matching?source=branch_rev_sheet&status=review&q=${encodeURIComponent(row.customerName)}`}
                          className="text-[11px] font-semibold text-[#084734] hover:underline"
                        >
                          연결하기
                        </Link>
                      )}
                      <p className="mt-1 text-[10.5px] text-[#1a1a1a]/30">{formatDate(row.syncedAt)}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {visibleRows.length > MAX_VISIBLE_ROWS ? (
          <p className="mt-4 border-t border-[#f0f0ec] pt-3 text-center text-[12px] text-[#1a1a1a]/40">
            외 {formatNumber(visibleRows.length - MAX_VISIBLE_ROWS)}건은 표시하지 않았습니다. 검색/필터로 좁혀 확인하세요.
          </p>
        ) : null}
      </section>
    </div>
  )
}
