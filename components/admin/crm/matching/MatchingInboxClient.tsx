"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Check,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react"

import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import { StatTile } from "@/components/admin/viz"
import type {
  AdminCrmMatchingInbox,
  CrmMatchingRow,
  CrmMatchingSourceSystem,
} from "@/lib/admin-crm-matching"
import type { CrmSourceLinkStatus } from "@/lib/admin-crm-revenue-types"

type SourceFilter = "all" | CrmMatchingSourceSystem
type StatusFilter = "review" | "auto" | "confirmed" | "rejected" | "all"

interface ManualLinkTargetOption {
  targetType: "partner_account" | "customer" | "deal"
  targetId: string
  label: string
  confidence: number
  evidence: string[]
}

const SOURCE_LABEL: Record<CrmMatchingSourceSystem, string> = {
  branch_rev_sheet: "REV 시트",
  xiaoshouyi: "Neo CRM",
  lead: "리드",
}

const SOURCE_TONE: Record<CrmMatchingSourceSystem, string> = {
  branch_rev_sheet: "border-amber-100 bg-amber-50 text-amber-700",
  xiaoshouyi: "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55",
  lead: "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]",
}

const STATUS_LABEL: Record<CrmSourceLinkStatus, string> = {
  candidate: "후보",
  confirmed: "확정",
  rejected: "제외",
  stale: "재검수",
}

const STATUS_TONE: Record<CrmSourceLinkStatus, string> = {
  candidate: "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55",
  confirmed: "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]",
  rejected: "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/45",
  stale: "border-amber-100 bg-amber-50 text-amber-700",
}

const SOURCE_FILTERS: Array<{ key: SourceFilter; label: string }> = [
  { key: "all", label: "전체 소스" },
  { key: "xiaoshouyi", label: "Neo CRM" },
  { key: "branch_rev_sheet", label: "REV 시트" },
  { key: "lead", label: "리드" },
]

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "review", label: "검토 필요" },
  { key: "auto", label: "자동 확정" },
  { key: "confirmed", label: "확정" },
  { key: "rejected", label: "제외" },
  { key: "all", label: "전체" },
]

const HIGH_CONFIDENCE_THRESHOLD = 0.9
// 한 번에 그리는 행 수 상한 — 무한 스크롤/대량 렌더링 없이 필터로 좁혀 쓰는 UX.
const MAX_VISIBLE_ROWS = 50

// 매칭 인박스 금액(REV 시트·Neo CRM)은 전부 위안화(CNY) — ¥ 만 단위 2자리.
function formatCurrency(value: number) {
  if (Math.abs(value) >= 10_000) {
    return `¥${(value / 10_000).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}만`
  }
  return `¥${value.toLocaleString("ko-KR")}`
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value)
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

function getStatusLabel(row: CrmMatchingRow) {
  if (row.linkStatus === null) return "미매칭"
  if (row.linkStatus === "confirmed" && row.autoConfirmed) return "자동 확정"
  return STATUS_LABEL[row.linkStatus]
}

function getStatusTone(row: CrmMatchingRow) {
  if (row.linkStatus === null) return "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]"
  return STATUS_TONE[row.linkStatus]
}

function getTargetLabel(row: CrmMatchingRow) {
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

function matchesStatusFilter(row: CrmMatchingRow, filter: StatusFilter) {
  if (filter === "all") return true
  // 임시(HW/SW/MKT) 고객은 후순위 — "전체" 필터에서만 노출한다.
  if (row.placeholder) return false
  if (filter === "review") return row.linkStatus === null || row.linkStatus === "candidate" || row.linkStatus === "stale"
  if (filter === "auto") return row.linkStatus === "confirmed" && row.autoConfirmed
  if (filter === "confirmed") return row.linkStatus === "confirmed"
  return row.linkStatus === "rejected"
}

// KPI 타일 로컬 재구현 금지(W2-2b) — 마크업은 viz StatTile(bare 변형)에 위임하는 어댑터.
// deals/rev-sheet/matching 3중복이던 MetricCard의 단일 시각 원천은 이제 viz/primitives다.
function MetricCard({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return <StatTile icon={null} iconLayout="inline" variant="bare" compact label={label} value={value} hint={hint} />
}

// 콜드 로드 '...' 금지 — 값 자리 크기의 저대비 펄스 스켈레톤(레이아웃 일치, CRM-5).
function ValueSkeleton({ className = "h-6 w-20" }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-block animate-pulse rounded-md bg-[#f0f0ec] align-middle ${className}`} />
  )
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  )
}

interface MatchingInboxClientProps {
  /** 커버리지 밴드 칩 클릭 시 인박스를 이 계정명으로 좁힌다(부분 일치). */
  nameFilter?: string
  /** 활성 이름 필터를 지울 때 상위 상태를 초기화한다. */
  onClearNameFilter?: () => void
}

export default function MatchingInboxClient({ nameFilter, onClearNameFilter }: MatchingInboxClientProps = {}) {
  const [data, setData] = useState<AdminCrmMatchingInbox | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("review")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingLinkId, setPendingLinkId] = useState<string | null>(null)
  const [bulkPending, setBulkPending] = useState(false)
  const [manualQueries, setManualQueries] = useState<Record<string, string>>({})
  const [manualTargets, setManualTargets] = useState<Record<string, ManualLinkTargetOption[]>>({})
  const [searchingSourceKey, setSearchingSourceKey] = useState<string | null>(null)
  const [creatingManualKey, setCreatingManualKey] = useState<string | null>(null)

  const load = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true)
    setError(null)
    try {
      const next = await adminFetchJsonCached<AdminCrmMatchingInbox>(`/api/admin/crm/matching`, undefined, {
        ttlMs: 30_000,
        force: options?.force,
      })
      setData(next)
      setSelectedIds(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : "매칭 데이터를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Single-row actions patch local state instead of refetching the whole inbox.
  const applyRowStatus = useCallback((linkId: string, status: CrmSourceLinkStatus) => {
    setData((current) => {
      if (!current) return current
      return {
        ...current,
        rows: current.rows.map((row) =>
          row.linkId === linkId
            ? {
                ...row,
                linkStatus: status,
                autoConfirmed: status === "confirmed" ? row.autoConfirmed : false,
                confirmedAt: status === "confirmed" ? new Date().toISOString() : null,
              }
            : row
        ),
      }
    })
    setSelectedIds((current) => {
      if (!current.has(linkId)) return current
      const next = new Set(current)
      next.delete(linkId)
      return next
    })
  }, [])

  const updateSourceLink = useCallback(
    async (linkId: string, action: "confirm" | "reject" | "stale") => {
      setPendingLinkId(linkId)
      setError(null)
      try {
        await adminFetchJson(`/api/admin/crm/source-links/${linkId}`, {
          method: "PATCH",
          body: JSON.stringify({ action }),
        })
        applyRowStatus(linkId, action === "confirm" ? "confirmed" : action === "reject" ? "rejected" : "stale")
      } catch (err) {
        setError(err instanceof Error ? err.message : "매칭 상태 변경에 실패했습니다.")
      } finally {
        setPendingLinkId(null)
      }
    },
    [applyRowStatus]
  )

  const bulkUpdate = useCallback(
    async (ids: string[], action: "confirm" | "reject") => {
      if (ids.length === 0) return
      setBulkPending(true)
      setError(null)
      setNotice(null)
      try {
        const result = await adminFetchJson<{ updated: number; failed: Array<{ id: string; error: string }> }>(
          `/api/admin/crm/source-links/bulk`,
          {
            method: "PATCH",
            body: JSON.stringify({ ids, action }),
          }
        )
        setNotice(
          `${action === "confirm" ? "확정" : "제외"} ${formatNumber(result.updated)}건 처리${
            result.failed.length > 0 ? ` · 실패 ${formatNumber(result.failed.length)}건` : ""
          }`
        )
        await load({ force: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : "일괄 처리에 실패했습니다.")
      } finally {
        setBulkPending(false)
      }
    },
    [load]
  )

  const generateCandidates = useCallback(async () => {
    setGenerating(true)
    setError(null)
    setNotice(null)
    try {
      const result = await adminFetchJson<{
        branchRev?: { insertedCandidates: number; autoConfirmed: number }
        leads?: { insertedCandidates: number; autoConfirmed: number }
        xiaoshouyi?: { insertedCandidates: number; autoConfirmed: number }
      }>(`/api/admin/crm/source-links/generate`, {
        method: "POST",
        body: JSON.stringify({ source: "all" }),
      })
      const inserted =
        (result.branchRev?.insertedCandidates ?? 0) +
        (result.leads?.insertedCandidates ?? 0) +
        (result.xiaoshouyi?.insertedCandidates ?? 0)
      const autoConfirmed =
        (result.branchRev?.autoConfirmed ?? 0) +
        (result.leads?.autoConfirmed ?? 0) +
        (result.xiaoshouyi?.autoConfirmed ?? 0)
      setNotice(`후보 ${formatNumber(inserted)}건 생성 · 자동 확정 ${formatNumber(autoConfirmed)}건`)
      await load({ force: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "매칭 후보 생성에 실패했습니다.")
    } finally {
      setGenerating(false)
    }
  }, [load])

  const searchManualTargets = useCallback(
    async (sourceKey: string, fallbackQuery: string) => {
      const query = (manualQueries[sourceKey] ?? fallbackQuery).trim()
      if (query.length < 2) {
        setManualTargets((current) => ({ ...current, [sourceKey]: [] }))
        return
      }

      setSearchingSourceKey(sourceKey)
      setError(null)
      try {
        const params = new URLSearchParams({ query, sourceKey })
        const result = await adminFetchJson<{ targets: ManualLinkTargetOption[] }>(
          `/api/admin/crm/source-links/targets?${params.toString()}`
        )
        setManualTargets((current) => ({ ...current, [sourceKey]: result.targets }))
      } catch (err) {
        setError(err instanceof Error ? err.message : "연결 대상 검색에 실패했습니다.")
      } finally {
        setSearchingSourceKey(null)
      }
    },
    [manualQueries]
  )

  const createManualCandidate = useCallback(
    async (sourceKey: string, target: ManualLinkTargetOption) => {
      setCreatingManualKey(`${sourceKey}:${target.targetType}:${target.targetId}`)
      setError(null)
      try {
        await adminFetchJson(`/api/admin/crm/source-links/manual`, {
          method: "POST",
          body: JSON.stringify({
            sourceRecordKey: sourceKey,
            targetType: target.targetType,
            targetId: target.targetId,
          }),
        })
        setManualTargets((current) => ({ ...current, [sourceKey]: [] }))
        await load({ force: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : "수동 후보 추가에 실패했습니다.")
      } finally {
        setCreatingManualKey(null)
      }
    },
    [load]
  )

  // 커버리지 밴드에서 넘어온 이름 필터. 활성일 땐 상태 필터를 우회해 확정 행까지 모두 보여준다.
  const normalizedNameFilter = (nameFilter ?? "").trim().toLowerCase()

  const filteredRows = useMemo(() => {
    return (data?.rows ?? []).filter((row) => {
      if (sourceFilter !== "all" && row.sourceSystem !== sourceFilter) return false
      if (normalizedNameFilter) {
        return row.sourceLabel.toLowerCase().includes(normalizedNameFilter)
      }
      return matchesStatusFilter(row, statusFilter)
    })
  }, [data, sourceFilter, statusFilter, normalizedNameFilter])

  const visibleRows = useMemo(() => filteredRows.slice(0, MAX_VISIBLE_ROWS), [filteredRows])
  const hiddenRowCount = Math.max(0, filteredRows.length - visibleRows.length)

  const selectableRows = useMemo(
    () =>
      visibleRows.filter(
        (row) => row.linkId !== null && (row.linkStatus === "candidate" || row.linkStatus === "stale")
      ),
    [visibleRows]
  )

  const highConfidenceIds = useMemo(
    () =>
      selectableRows
        .filter((row) => (row.confidence ?? 0) >= HIGH_CONFIDENCE_THRESHOLD)
        .map((row) => row.linkId as string),
    [selectableRows]
  )

  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedIds.has(row.linkId as string))

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((current) => {
      if (selectableRows.length === 0) return current
      const next = new Set(current)
      const everySelected = selectableRows.every((row) => next.has(row.linkId as string))
      for (const row of selectableRows) {
        if (everySelected) next.delete(row.linkId as string)
        else next.add(row.linkId as string)
      }
      return next
    })
  }, [selectableRows])

  const toggleSelect = useCallback((linkId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(linkId)) next.delete(linkId)
      else next.add(linkId)
      return next
    })
  }, [])

  const totals = data?.totals

  // 행 액션(확정/제외/되돌리기) — 데스크톱 표 셀과 <sm 카드 폴백이 같은 핸들러·마크업을 공유한다(W2-6).
  const renderRowActions = (row: CrmMatchingRow) => {
    if (row.linkId && (row.linkStatus === "candidate" || row.linkStatus === "stale")) {
      return (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => void updateSourceLink(row.linkId as string, "confirm")}
            disabled={pendingLinkId === row.linkId}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#D7EBDD] bg-[#ECFDF5] text-[#084734] transition-colors hover:bg-[#D7EBDD] disabled:opacity-50"
            title="확정"
            aria-label="확정"
          >
            {pendingLinkId === row.linkId ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => void updateSourceLink(row.linkId as string, "reject")}
            disabled={pendingLinkId === row.linkId}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33] transition-colors hover:bg-[#FBE8DD] disabled:opacity-50"
            title="제외"
            aria-label="제외"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )
    }
    if (row.linkId && row.linkStatus === "confirmed") {
      return (
        <button
          type="button"
          onClick={() => void updateSourceLink(row.linkId as string, "stale")}
          disabled={pendingLinkId === row.linkId}
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-amber-100 bg-amber-50 px-2 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
          title="확정을 되돌리고 재검수로 보냅니다"
        >
          {pendingLinkId === row.linkId ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          되돌리기
        </button>
      )
    }
    return <span className="text-[11px] text-[#1a1a1a]/30">-</span>
  }

  // 수동 연결 검색·후보 추가 블록 — 표 셀(w-[250px])과 카드 폴백(w-full)이 마크업을 공유한다.
  const renderManualLink = (row: CrmMatchingRow, className: string) => (
    <div className={`space-y-2 ${className}`}>
      <div className="flex gap-1.5">
        <input
          type="search"
          value={manualQueries[row.sourceRecordKey] ?? row.sourceLabel}
          onChange={(event) =>
            setManualQueries((current) => ({
              ...current,
              [row.sourceRecordKey]: event.target.value,
            }))
          }
          className="h-8 min-w-0 flex-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#111110] outline-none transition-colors focus:border-[#111110]"
        />
        <button
          type="button"
          onClick={() => void searchManualTargets(row.sourceRecordKey, row.sourceLabel)}
          disabled={searchingSourceKey === row.sourceRecordKey}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e8e4] text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
          title="검색"
          aria-label="검색"
        >
          {searchingSourceKey === row.sourceRecordKey ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {(manualTargets[row.sourceRecordKey] ?? []).map((target) => {
        const createKey = `${row.sourceRecordKey}:${target.targetType}:${target.targetId}`
        return (
          <button
            key={createKey}
            type="button"
            onClick={() => void createManualCandidate(row.sourceRecordKey, target)}
            disabled={creatingManualKey === createKey}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#e8e8e4] px-2 py-1.5 text-left text-[11px] text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
          >
            <span className="min-w-0 truncate">
              {target.targetType === "partner_account"
                ? "파트너"
                : target.targetType === "customer"
                  ? "고객"
                  : "거래"}{" "}
              · {target.label}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[#1a1a1a]/35">
              {formatPercent(target.confidence)}
              {creatingManualKey === createKey ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
            </span>
          </button>
        )
      })}
    </div>
  )

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">CRM Matching</p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-[#111110]">데이터 매칭 인박스</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#1a1a1a]/45">
            외부 CRM 스냅샷, REV 시트, 리드를 ClassIn 고객 DB에 연결합니다. 고확신 매칭은 자동 확정되고, 여기서는
            검토가 필요한 항목만 처리하면 됩니다.
          </p>
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
          <button
            type="button"
            onClick={() => void generateCandidates()}
            disabled={generating || loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            후보 생성
          </button>
          <Link
            href="/admin/crm/deals"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
          >
            매출·정합성
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {error ? <div className="mb-6 border-l-2 border-[#F6D5C5] pl-3 text-[13px] text-[#B85C33]">{error}</div> : null}
      {notice ? (
        <div className="mb-6 border-l-2 border-[#D7EBDD] pl-3 text-[13px] text-[#084734]">{notice}</div>
      ) : null}
      {(data?.warnings ?? []).map((warning) => (
        <div key={warning} className="mb-6 border-l-2 border-amber-200 pl-3 text-[13px] text-amber-800">
          {warning}
        </div>
      ))}

      <section className="mb-8 grid gap-8 border-y border-[#f0f0ec] py-6 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="검토 대기"
          value={loading && !data ? <ValueSkeleton /> : formatNumber(totals?.reviewCount ?? 0)}
          hint="후보·재검수 상태로 admin 확인이 필요한 연결"
        />
        <MetricCard
          label="미매칭 REV"
          value={loading && !data ? <ValueSkeleton /> : formatNumber(data?.summary.branch_rev_sheet.unmatchedCount ?? 0)}
          hint={`따로 노는 시트 금액 ${formatCurrency(data?.summary.branch_rev_sheet.unmatchedAmount ?? 0)}`}
        />
        <MetricCard
          label="자동 확정"
          value={loading && !data ? <ValueSkeleton /> : formatNumber(totals?.autoConfirmedCount ?? 0)}
          hint="고확신 자동 확정 — 잘못된 건은 행에서 되돌리기"
        />
        <MetricCard
          label="시트 매칭률"
          value={
            loading && !data ? (
              <ValueSkeleton />
            ) : totals?.sheetMatchedRatio == null ? (
              "-"
            ) : (
              formatPercent(totals.sheetMatchedRatio)
            )
          }
          hint={`확정 ${formatNumber(totals?.confirmedCount ?? 0)}건 · 전체 소스 기준`}
        />
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {SOURCE_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setSourceFilter(filter.key)}
              className={`h-8 rounded-lg border px-3 text-[12px] font-semibold transition-colors ${
                sourceFilter === filter.key
                  ? "border-[#111110] bg-[#111110] text-white"
                  : "border-[#e8e8e4] bg-white text-[#111110] hover:bg-[#f5f5f2]"
              }`}
            >
              {filter.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-[#e8e8e4]" />
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setStatusFilter(filter.key)}
              className={`h-8 rounded-lg border px-3 text-[12px] font-semibold transition-colors ${
                statusFilter === filter.key
                  ? "border-[#111110] bg-[#111110] text-white"
                  : "border-[#e8e8e4] bg-white text-[#111110] hover:bg-[#f5f5f2]"
              }`}
            >
              {filter.label}
            </button>
          ))}
          {normalizedNameFilter ? (
            <>
              <span className="mx-1 h-5 w-px bg-[#e8e8e4]" />
              <button
                type="button"
                onClick={() => onClearNameFilter?.()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#084734]/25 bg-[#ECFDF5] px-3 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#D7EBDD]"
                title="이름 필터 해제"
              >
                <Search className="h-3.5 w-3.5" />
                {nameFilter}
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}
        </div>
        <span className="text-[11px] text-[#1a1a1a]/35">
          {formatNumber(visibleRows.length)}건 표시
          {hiddenRowCount > 0 ? ` (전체 ${formatNumber(filteredRows.length)}건)` : ""} · {formatDate(data?.generatedAt)}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void bulkUpdate(Array.from(selectedIds), "confirm")}
          disabled={bulkPending || selectedIds.size === 0}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#D7EBDD] bg-[#ECFDF5] px-2.5 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#D7EBDD] disabled:opacity-50"
        >
          {bulkPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          선택 {formatNumber(selectedIds.size)}건 확정
        </button>
        <button
          type="button"
          onClick={() => void bulkUpdate(Array.from(selectedIds), "reject")}
          disabled={bulkPending || selectedIds.size === 0}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] px-2.5 text-[12px] font-semibold text-[#B85C33] transition-colors hover:bg-[#FBE8DD] disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          선택 제외
        </button>
        <button
          type="button"
          onClick={() => void bulkUpdate(highConfidenceIds, "confirm")}
          disabled={bulkPending || highConfidenceIds.length === 0}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          고확신({Math.round(HIGH_CONFIDENCE_THRESHOLD * 100)}%↑) {formatNumber(highConfidenceIds.length)}건 일괄 확정
        </button>
      </div>

      {/* <sm 카드 폴백(W2-6·CRM-9) — 동일 visibleRows·핸들러(선택/확정/제외/되돌리기/수동연결)를
          카드 행으로 공유해 기능 손실 0. 넓은 표는 데스크톱 전용. */}
      <div className="space-y-2 sm:hidden">
        {loading && !data ? (
          <p className="rounded-xl bg-[#fafaf8] px-3 py-10 text-center text-[13px] text-[#1a1a1a]/35">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            매칭 데이터를 불러오는 중입니다.
          </p>
        ) : visibleRows.length === 0 ? (
          <p className="rounded-xl bg-[#fafaf8] px-3 py-10 text-center text-[13px] text-[#1a1a1a]/35">
            {statusFilter === "review"
              ? "검토할 매칭이 없습니다. 모두 처리됐어요."
              : "표시할 매칭 데이터가 없습니다."}
          </p>
        ) : (
          visibleRows.map((row) => {
            const selectable = row.linkId !== null && (row.linkStatus === "candidate" || row.linkStatus === "stale")
            const isManualOpen = row.sourceSystem === "branch_rev_sheet" && row.linkStatus !== "confirmed"
            return (
              <div key={row.key} className="rounded-xl border border-[#e8e8e4] bg-white p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {selectable ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.linkId as string)}
                      onChange={() => toggleSelect(row.linkId as string)}
                      aria-label="선택"
                      className="h-3.5 w-3.5 accent-[#111110]"
                    />
                  ) : null}
                  <StatusBadge label={SOURCE_LABEL[row.sourceSystem]} tone={SOURCE_TONE[row.sourceSystem]} />
                  <StatusBadge label={getStatusLabel(row)} tone={getStatusTone(row)} />
                  {row.placeholder ? (
                    <StatusBadge label="임시" tone="border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/40" />
                  ) : null}
                  <span className="ml-auto text-[12px] font-semibold tabular-nums text-[#111110]">
                    {row.amount == null ? "-" : formatCurrency(row.amount)}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-[13px] font-semibold text-[#111110]">{row.sourceLabel}</p>
                <p className="mt-0.5 text-[11px] text-[#1a1a1a]/35">{row.sourceDetail}</p>
                <p className="mt-1.5 text-[11px] text-[#1a1a1a]/45">
                  {row.sourceOwner ?? "담당 미지정"} · {row.sourceStatus ?? "-"}
                </p>
                <p className="mt-1 text-[11px] text-[#1a1a1a]/45">
                  {getTargetLabel(row)} · 신뢰도 {formatPercent(row.confidence)}
                </p>
                {row.linkStatus === "confirmed" && row.confirmedAt ? (
                  <p className="mt-1 text-[11px] text-[#1a1a1a]/30">{formatDate(row.confirmedAt)}</p>
                ) : null}
                {isManualOpen ? (
                  <div className="mt-2 border-t border-[#f0f0ec] pt-2">{renderManualLink(row, "w-full")}</div>
                ) : null}
                <div className="mt-2 flex justify-end border-t border-[#f0f0ec] pt-2">{renderRowActions(row)}</div>
              </div>
            )
          })
        )}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <table className="min-w-[1240px] w-full text-left">
          <thead className="text-[11px] uppercase tracking-[0.12em] text-[#1a1a1a]/35">
            <tr>
              <th className="py-3 pr-3 font-semibold">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="전체 선택"
                  className="h-3.5 w-3.5 accent-[#111110]"
                />
              </th>
              <th className="py-3 pr-4 font-semibold">소스</th>
              <th className="py-3 pr-4 font-semibold">상태</th>
              <th className="py-3 pr-4 font-semibold">원천 레코드</th>
              <th className="py-3 pr-4 font-semibold">담당</th>
              <th className="py-3 pr-4 font-semibold">연결 대상</th>
              <th className="py-3 pr-4 text-right font-semibold">신뢰도</th>
              <th className="py-3 pr-4 text-right font-semibold">금액</th>
              <th className="py-3 pl-4 font-semibold">수동 연결</th>
              <th className="py-3 pl-4 text-right font-semibold">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0ec]">
            {loading && !data ? (
              <tr>
                <td colSpan={10} className="py-16 text-center text-[13px] text-[#1a1a1a]/35">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  매칭 데이터를 불러오는 중입니다.
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-16 text-center text-[13px] text-[#1a1a1a]/35">
                  {statusFilter === "review"
                    ? "검토할 매칭이 없습니다. 모두 처리됐어요."
                    : "표시할 매칭 데이터가 없습니다."}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const selectable = row.linkId !== null && (row.linkStatus === "candidate" || row.linkStatus === "stale")
                const isManualOpen = row.sourceSystem === "branch_rev_sheet" && row.linkStatus !== "confirmed"
                return (
                  <tr key={row.key} className="align-top">
                    <td className="py-4 pr-3">
                      {selectable ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.linkId as string)}
                          onChange={() => toggleSelect(row.linkId as string)}
                          aria-label="선택"
                          className="h-3.5 w-3.5 accent-[#111110]"
                        />
                      ) : null}
                    </td>
                    <td className="py-4 pr-4">
                      <StatusBadge label={SOURCE_LABEL[row.sourceSystem]} tone={SOURCE_TONE[row.sourceSystem]} />
                    </td>
                    <td className="py-4 pr-4">
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusBadge label={getStatusLabel(row)} tone={getStatusTone(row)} />
                        {row.placeholder ? (
                          <StatusBadge label="임시" tone="border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/40" />
                        ) : null}
                      </div>
                      {row.linkStatus === "confirmed" && row.confirmedAt ? (
                        <p className="mt-1 text-[11px] text-[#1a1a1a]/30">{formatDate(row.confirmedAt)}</p>
                      ) : null}
                    </td>
                    <td className="py-4 pr-4">
                      <p className="line-clamp-2 text-[13px] font-semibold text-[#111110]">{row.sourceLabel}</p>
                      <p className="mt-1 text-[11px] text-[#1a1a1a]/35">{row.sourceDetail}</p>
                    </td>
                    <td className="py-4 pr-4 text-[12px] text-[#1a1a1a]/50">
                      <p>{row.sourceOwner ?? "담당 미지정"}</p>
                      <p className="mt-1 text-[11px] text-[#1a1a1a]/35">{row.sourceStatus ?? "-"}</p>
                    </td>
                    <td className="py-4 pr-4 text-[12px] text-[#1a1a1a]/50">{getTargetLabel(row)}</td>
                    <td className="py-4 pr-4 text-right text-[12px] text-[#1a1a1a]/45">
                      {formatPercent(row.confidence)}
                    </td>
                    <td className="py-4 pr-4 text-right text-[12px] font-semibold text-[#111110]">
                      {row.amount == null ? "-" : formatCurrency(row.amount)}
                    </td>
                    <td className="py-4 pl-4">
                      {isManualOpen ? (
                        renderManualLink(row, "w-[250px]")
                      ) : (
                        <span className="text-[11px] text-[#1a1a1a]/30">-</span>
                      )}
                    </td>
                    <td className="py-4 pl-4 text-right">
                      <div className="flex justify-end">{renderRowActions(row)}</div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {hiddenRowCount > 0 ? (
        <p className="mt-4 border-t border-[#f0f0ec] pt-3 text-center text-[12px] text-[#1a1a1a]/40">
          외 {formatNumber(hiddenRowCount)}건은 표시하지 않았습니다. 소스/상태 필터로 좁혀서 확인하세요.
        </p>
      ) : null}
    </div>
  )
}
