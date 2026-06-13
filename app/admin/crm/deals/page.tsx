"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowRight,
  Check,
  CircleDollarSign,
  Database,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  RotateCcw,
  ServerCog,
  TrendingUp,
  X,
} from "lucide-react"

import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import type {
  CrmRevenueDashboard,
  CrmRevenueDocumentRow,
  CrmRevenueSource,
  CrmRevenueSourceStatus,
} from "@/lib/admin-crm-revenue-types"

const STATUS_TONE: Record<CrmRevenueSourceStatus, string> = {
  connected: "border-emerald-100 bg-emerald-50 text-emerald-700",
  configured: "border-sky-100 bg-sky-50 text-sky-700",
  not_configured: "border-[#e8e8e4] bg-white text-[#1a1a1a]/45",
  error: "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]",
}

const KIND_LABEL: Record<CrmRevenueDocumentRow["kind"], string> = {
  quote: "견적",
  contract: "계약",
  receipt: "수납",
  deal: "거래",
}

const WRITE_STATUS_LABEL: Record<string, string> = {
  draft: "검토 대기",
  approved: "승인됨",
  sent: "전송 중",
  succeeded: "완료",
  failed: "실패",
  cancelled: "취소",
}

const WRITE_STATUS_TONE: Record<string, string> = {
  draft: "border-sky-100 bg-sky-50 text-sky-700",
  approved: "border-amber-100 bg-amber-50 text-amber-700",
  sent: "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/45",
  succeeded: "border-emerald-100 bg-emerald-50 text-emerald-700",
  failed: "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]",
  cancelled: "border-[#e8e8e4] bg-white text-[#1a1a1a]/35",
}

const WRITE_OPERATION_LABEL: Record<string, string> = {
  create: "생성",
  update: "수정",
  transfer_owner: "담당자 변경",
}
const WRITE_MAX_ATTEMPTS = 3

interface ExternalCrmSyncResult {
  ok: boolean
  skipped?: boolean
  error?: string
  objects?: Array<{
    objectApiKey: string
    status: "success" | "failed" | "skipped"
    error?: string
  }>
}

interface ExternalCrmSyncPreflight {
  configured: boolean
  missingEnvGroups: string[]
  pageSize: number
  maxPages: number
  objects: Array<{ objectApiKey: string }>
}

interface WriteMetadataPreflight {
  ok: boolean
  configured: boolean
  error?: string
  objects: Array<{
    objectApiKey: string
    status: "ok" | "failed" | "skipped" | "read_only"
    readOnly: boolean
    error?: string
  }>
}

interface CrmReadinessCheck {
  key: string
  label: string
  status: "ok" | "warning" | "blocked"
  detail: string
  action?: string
}

interface CrmReadinessReport {
  generatedAt: string
  overallStatus: "ok" | "warning" | "blocked"
  summary: {
    ok: number
    warning: number
    blocked: number
  }
  checks: CrmReadinessCheck[]
}

function formatCurrency(value: number) {
  if (Math.abs(value) >= 100_000_000) {
    return `${(value / 100_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`
  }
  if (Math.abs(value) >= 10_000) {
    return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만`
  }
  return value.toLocaleString("ko-KR")
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value)
}

// REV 시트·Neo CRM 스냅샷 금액은 위안화(CNY) — ¥ 만 단위 2자리.
function formatCNY(value: number | null | undefined) {
  const num = Number(value ?? 0)
  if (Math.abs(num) >= 10_000) {
    return `¥${(num / 10_000).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}만`
  }
  return `¥${num.toLocaleString("ko-KR")}`
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

function formatWritePayload(value: Record<string, unknown>) {
  const entries = Object.entries(value).slice(0, 3)
  if (entries.length === 0) return "-"
  const label = entries.map(([key, item]) => `${key}: ${String(item ?? "-")}`).join(" · ")
  return Object.keys(value).length > 3 ? `${label} ...` : label
}

function formatWriteAttempt(request: CrmRevenueDashboard["writeRequests"][number]) {
  const parts = [`시도 ${request.attemptCount}/${WRITE_MAX_ATTEMPTS}`]
  if (request.lastAttemptAt) parts.push(`최근 ${formatDate(request.lastAttemptAt)}`)
  if (request.nextRetryAt) parts.push(`재시도 ${formatDate(request.nextRetryAt)}`)
  if (request.status === "failed" && request.attemptCount >= WRITE_MAX_ATTEMPTS) parts.push("한도 도달")
  return parts.join(" · ")
}

function formatWriteMetadataStatus(result: WriteMetadataPreflight | null) {
  if (!result) return "미검증"
  if (!result.configured) return result.error ?? "credential 필요"
  const okCount = result.objects.filter((object) => object.status === "ok").length
  const failedCount = result.objects.filter((object) => object.status === "failed").length
  const readOnlyCount = result.objects.filter((object) => object.status === "read_only").length
  if (failedCount > 0) return `실패 ${failedCount} · 확인 ${okCount} · read-only ${readOnlyCount}`
  return `확인 ${okCount} · read-only ${readOnlyCount}`
}

function getReadinessLabel(status: CrmReadinessReport["overallStatus"] | CrmReadinessCheck["status"]) {
  if (status === "ok") return "준비됨"
  if (status === "warning") return "확인 필요"
  return "막힘"
}

function getReadinessTone(status: CrmReadinessReport["overallStatus"] | CrmReadinessCheck["status"]) {
  if (status === "ok") return STATUS_TONE.connected
  if (status === "warning") return "border-amber-100 bg-amber-50 text-amber-700"
  return STATUS_TONE.error
}

function StatusBadge({ label, tone }: { label: string; tone?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        tone ?? "border-[#e8e8e4] bg-white text-[#1a1a1a]/45"
      }`}
    >
      {label}
    </span>
  )
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="border-t border-[#f0f0ec] pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-[#111110]">{value}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/42">{hint}</p>
    </div>
  )
}

function SourceIcon({ source }: { source: CrmRevenueSource }) {
  if (source.key.includes("sheet")) return <FileSpreadsheet className="h-4 w-4" />
  if (source.key.includes("crm")) return <ServerCog className="h-4 w-4" />
  return <Database className="h-4 w-4" />
}

function SourcePanel({ source }: { source: CrmRevenueSource }) {
  const statusLabel =
    source.status === "connected"
      ? "연결됨"
      : source.status === "configured"
        ? "설정됨"
        : source.status === "error"
          ? "오류"
          : "미설정"

  return (
    <div className="border-t border-[#f0f0ec] pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fafaf8] text-[#1a1a1a]/45">
            <SourceIcon source={source} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[#111110]">{source.label}</p>
            <p className="mt-0.5 text-[11px] text-[#1a1a1a]/35">
              {source.mode === "read" ? "읽기 전용" : source.mode === "planned" ? "연동 준비" : "읽기/쓰기"}
              {source.latencyMs == null ? "" : ` · ${source.latencyMs}ms`}
            </p>
          </div>
        </div>
        <StatusBadge label={statusLabel} tone={STATUS_TONE[source.status]} />
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-[#1a1a1a]/45">{source.description}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#1a1a1a]/35">
        <span>{formatNumber(source.recordCount)} records</span>
        <span>sync {formatDate(source.lastSyncedAt)}</span>
      </div>
    </div>
  )
}

function ReadinessPanel({
  report,
  checking,
  onCheck,
}: {
  report: CrmReadinessReport | null
  checking: boolean
  onCheck: () => void
}) {
  return (
    <div className="border-t border-[#f0f0ec] pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-[#111110]">운영 준비도</p>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/35">
            {report ? formatDate(report.generatedAt) : "아직 점검하지 않음"}
          </p>
        </div>
        <StatusBadge
          label={report ? getReadinessLabel(report.overallStatus) : "미점검"}
          tone={report ? getReadinessTone(report.overallStatus) : STATUS_TONE.not_configured}
        />
      </div>

      {report ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="border-t border-emerald-100 pt-2 text-emerald-700">OK {report.summary.ok}</div>
          <div className="border-t border-amber-100 pt-2 text-amber-700">주의 {report.summary.warning}</div>
          <div className="border-t border-[#F6D5C5] pt-2 text-[#B85C33]">막힘 {report.summary.blocked}</div>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {(report?.checks ?? []).map((check) => (
          <div key={check.key} className="border-t border-[#f0f0ec] pt-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[12px] font-semibold text-[#111110]">{check.label}</p>
              <StatusBadge label={getReadinessLabel(check.status)} tone={getReadinessTone(check.status)} />
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#1a1a1a]/45">{check.detail}</p>
            {check.action ? (
              <p className="mt-1 text-[11px] leading-relaxed text-[#B85C33]">{check.action}</p>
            ) : null}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onCheck}
        disabled={checking}
        className="mt-3 inline-flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
      >
        {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        운영 점검
      </button>
    </div>
  )
}

export default function AdminCrmRevenuePage() {
  const [data, setData] = useState<CrmRevenueDashboard | null>(null)
  const [months, setMonths] = useState(6)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncingExternal, setSyncingExternal] = useState(false)
  const [generatingLinks, setGeneratingLinks] = useState(false)
  const [updatingWriteRequestId, setUpdatingWriteRequestId] = useState<string | null>(null)
  const [validatingWriteMetadata, setValidatingWriteMetadata] = useState(false)
  const [writeMetadataStatus, setWriteMetadataStatus] = useState<WriteMetadataPreflight | null>(null)
  const [checkingReadiness, setCheckingReadiness] = useState(false)
  const [readiness, setReadiness] = useState<CrmReadinessReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true)
    setError(null)
    try {
      const next = await adminFetchJsonCached<CrmRevenueDashboard>(`/api/admin/crm/revenue?months=${months}`, undefined, {
        ttlMs: 30_000,
        force: options?.force,
      })
      setData(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : "매출 데이터를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [months])

  useEffect(() => {
    void load()
  }, [load])

  const syncSheet = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      await adminFetchJson(`/api/admin/branch/sync`, {
        method: "POST",
        body: JSON.stringify({ sources: ["rev"] }),
      })
      await load({ force: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "시트 동기화에 실패했습니다.")
    } finally {
      setSyncing(false)
    }
  }, [load])

  const generateLinkCandidates = useCallback(async () => {
    setGeneratingLinks(true)
    setError(null)
    try {
      await adminFetchJson(`/api/admin/crm/source-links/generate`, {
        method: "POST",
        body: JSON.stringify({ source: "all" }),
      })
      await load({ force: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "CRM 매칭 후보 생성에 실패했습니다.")
    } finally {
      setGeneratingLinks(false)
    }
  }, [load])

  const syncExternalCrm = useCallback(async () => {
    setSyncingExternal(true)
    setError(null)
    try {
      const readinessReport = await adminFetchJson<CrmReadinessReport>(`/api/admin/crm/readiness`)
      setReadiness(readinessReport)
      const blockedSync = readinessReport.checks.find((check) =>
        check.status === "blocked" && ["external_crm_sync_runs", "external_crm_records"].includes(check.key)
      )
      if (blockedSync) {
        const action = blockedSync.action ? ` · ${blockedSync.action}` : ""
        setError(`외부 CRM 동기화 준비 필요: ${blockedSync.label} · ${blockedSync.detail}${action}`)
        return
      }

      const preflight = await adminFetchJson<ExternalCrmSyncPreflight>(`/api/admin/crm/external-sync`)
      if (!preflight.configured) {
        const missing = preflight.missingEnvGroups.length > 0 ? preflight.missingEnvGroups.join(", ") : "credential"
        setError(`외부 CRM 동기화 준비 필요: ${missing}`)
        return
      }

      const result = await adminFetchJson<ExternalCrmSyncResult>(`/api/admin/crm/external-sync`, { method: "POST" })
      await load({ force: true })
      if (result.skipped) {
        const reason = result.error ?? result.objects?.find((item) => item.error)?.error
        setError(reason ? `외부 CRM 동기화 skipped: ${reason}` : "외부 CRM credential 미설정으로 동기화를 건너뛰었습니다.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "외부 CRM 동기화에 실패했습니다.")
    } finally {
      setSyncingExternal(false)
    }
  }, [load])

  const updateWriteRequest = useCallback(
    async (requestId: string, action: "approve" | "cancel" | "retry") => {
      setUpdatingWriteRequestId(`${requestId}:${action}`)
      setError(null)
      try {
        await adminFetchJson(`/api/admin/crm/write-requests/${requestId}`, {
          method: "PATCH",
          body: JSON.stringify({ action }),
        })
        await load({ force: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : "CRM 쓰기 요청 상태 변경에 실패했습니다.")
      } finally {
        setUpdatingWriteRequestId(null)
      }
    },
    [load]
  )

  const validateWriteMetadata = useCallback(async () => {
    setValidatingWriteMetadata(true)
    setError(null)
    try {
      const result = await adminFetchJson<WriteMetadataPreflight>(
        `/api/admin/crm/write-requests?preflight=metadata`
      )
      setWriteMetadataStatus(result)
      if (!result.ok) {
        const failed = result.objects.find((object) => object.status === "failed")
        setError(failed?.error ?? result.error ?? "외부 CRM metadata 검증이 필요합니다.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "외부 CRM metadata 검증에 실패했습니다.")
    } finally {
      setValidatingWriteMetadata(false)
    }
  }, [])

  const checkReadiness = useCallback(async () => {
    setCheckingReadiness(true)
    setError(null)
    try {
      const report = await adminFetchJson<CrmReadinessReport>(`/api/admin/crm/readiness`)
      setReadiness(report)
    } catch (err) {
      setError(err instanceof Error ? err.message : "CRM 운영 준비도 점검에 실패했습니다.")
    } finally {
      setCheckingReadiness(false)
    }
  }, [])

  const maxMonthlyAmount = useMemo(() => {
    const values =
      data?.monthly.flatMap((point) => [
        point.quotedAmount,
        point.contractedAmount,
        point.paidAmount,
        point.expectedAmount,
        point.sheetConfirmedAmount,
        point.sheetHighConfidenceAmount,
        point.sheetExpectedAmount,
      ]) ?? []
    return Math.max(1, ...values)
  }, [data])

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">
            CRM Revenue
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-[#111110]">
            매출·연결 대시보드
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#1a1a1a]/45">
            견적, 계약, 수납, V2 거래 파이프라인을 한 번에 집계하고 회사 CRM·시트 연결 상태를 함께 확인합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[6, 12].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMonths(value)}
              className={`h-9 rounded-lg border px-3 text-[13px] font-semibold transition-colors ${
                months === value
                  ? "border-[#111110] bg-[#111110] text-white"
                  : "border-[#e8e8e4] bg-white text-[#111110] hover:bg-[#f5f5f2]"
              }`}
            >
              {value}개월
            </button>
          ))}
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
            onClick={() => void syncExternalCrm()}
            disabled={syncingExternal || loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
          >
            {syncingExternal ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ServerCog className="h-4 w-4" />
            )}
            외부 CRM
          </button>
          <button
            type="button"
            onClick={() => void syncSheet()}
            disabled={syncing || loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            시트 동기화
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-6 border-l-2 border-[#F6D5C5] pl-3 text-[13px] text-[#B85C33]">
          {error}
        </div>
      ) : null}

      {(data?.warnings.length ?? 0) > 0 ? (
        <div className="mb-6 border-l-2 border-amber-200 pl-3">
          <div className="flex gap-2 text-[13px] text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              {data?.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          </div>
        </div>
      ) : null}

      <section className="mb-8 grid gap-8 border-y border-[#f0f0ec] py-6 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="딜리버리 총매출"
          value={loading && !data ? "..." : formatCurrency(data?.summary.deliveryTotalAmount ?? 0)}
          hint="본사 기준 CRM Delivery 합산"
        />
        <MetricCard
          label="계약 기준"
          value={loading && !data ? "..." : formatCurrency(data?.summary.contractedAmount ?? 0)}
          hint="보조 확인용 계약 금액 합계"
        />
        <MetricCard
          label="입금 완료"
          value={loading && !data ? "..." : formatCurrency(data?.summary.paidAmount ?? 0)}
          hint="영수증 수납과 V2 paid amount 기준"
        />
        <MetricCard
          label="미수/대기"
          value={loading && !data ? "..." : formatCurrency(data?.summary.outstandingAmount ?? 0)}
          hint="확정 대비 미수, 부분 수납 리스크"
        />
      </section>

      <section className="mb-8 grid gap-8 border-b border-[#f0f0ec] pb-6 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="예상 파이프라인"
          value={loading && !data ? "..." : formatCurrency(data?.summary.expectedPipelineAmount ?? 0)}
          hint={`${formatNumber(data?.summary.activeDealCount ?? 0)}건의 active 거래`}
        />
        <MetricCard
          label="견적 총액"
          value={formatCurrency(data?.summary.quotedAmount ?? 0)}
          hint={`승인/전환 ${formatCurrency(data?.summary.acceptedQuoteAmount ?? 0)}`}
        />
        <MetricCard
          label="고객사"
          value={formatNumber(data?.summary.customerCount ?? 0)}
          hint="V2 고객사 테이블 기준"
        />
        <MetricCard
          label="파트너/계정"
          value={formatNumber(data?.summary.partnerCount ?? 0)}
          hint="레거시 파트너 + 파트너 계정"
        />
        <MetricCard
          label="소스 레코드"
          value={formatNumber(data?.summary.sourceRecordCount ?? 0)}
          hint="필드 제한 쿼리로 집계한 원천 데이터"
        />
      </section>

      {data?.sheet ? (
        <section className="mb-8 border-b border-[#f0f0ec] pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-[#1a1a1a]/35" />
            <h2 className="text-[14px] font-semibold text-[#111110]">회사 시트 (REV) 내부 대조</h2>
            <span className="text-[11px] text-[#1a1a1a]/35">
              계약 목표 총액 {formatCNY(data.sheet.targetAmount)} · 진행{" "}
              {formatNumber(data.sheet.activeDealCount)}건/전체 {formatNumber(data.sheet.dealCount)}건 ·
              오류 체크용 병기 지표 (본사 CRM 매출과 합산하지 않음)
            </span>
          </div>
          <div className="mt-2 grid gap-8 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="매칭 완료 금액"
              value={formatCNY(data.sheet.linkedAmount)}
              hint={`확정 link ${formatNumber(data.sheet.linkedDealCount)}건 · 미연결 ${formatCNY(data.sheet.unlinkedAmount)}`}
            />
            <MetricCard
              label="시트 확정 표시"
              value={formatCNY(data.sheet.confirmedAmount)}
              hint="주차 칸 빨간 글자(확정) 금액 누적 합계"
            />
            <MetricCard
              label="확정 임박 표시"
              value={formatCNY(data.sheet.highConfidenceAmount)}
              hint="주차 칸 파란 글자 — 높은 확률로 클로징 예정"
            />
            <MetricCard
              label="시트 예정 표시"
              value={formatCNY(data.sheet.expectedAmount)}
              hint="당월~미래의 색 표시 없는 납부 스케줄 합계"
            />
            <MetricCard
              label="확정 전환 대기"
              value={formatCNY(data.sheet.unconfirmedPastAmount)}
              hint="지난달 이전 예정이었지만 아직 확정 표시가 없는 금액"
            />
          </div>
        </section>
      ) : null}

      {data?.externalSnapshot ? (
        <section className="mb-8 border-b border-[#f0f0ec] pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ServerCog className="h-4 w-4 text-[#1a1a1a]/35" />
              <h2 className="text-[14px] font-semibold text-[#111110]">Neo CRM Snapshot</h2>
            </div>
            <span className="text-[11px] text-[#1a1a1a]/35">
              {formatNumber(data.externalSnapshot.totalRecordCount)} active records · stale{" "}
              {formatNumber(data.externalSnapshot.staleRecordCount)} · synced{" "}
              {formatDate(data.externalSnapshot.latestSyncedAt)}
            </span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {data.externalSnapshot.objectCounts.map((object) => (
              <div key={object.objectApiKey} className="rounded-xl bg-[#fafaf8] px-3 py-3">
                <p className="truncate text-[11px] font-semibold text-[#1a1a1a]/45">
                  {object.objectApiKey}
                </p>
                <p className="mt-1 text-[16px] font-bold text-[#111110]">
                  {formatNumber(object.recordCount)}
                </p>
                <p className="mt-0.5 text-[11px] text-[#1a1a1a]/35">
                  {formatDate(object.latestSyncedAt)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[980px] w-full text-left">
              <thead className="text-[11px] uppercase tracking-[0.12em] text-[#1a1a1a]/35">
                <tr>
                  <th className="py-3 pr-4 font-semibold">Object</th>
                  <th className="py-3 pr-4 font-semibold">Record</th>
                  <th className="py-3 pr-4 font-semibold">Owner / Status</th>
                  <th className="py-3 pr-4 text-right font-semibold">Amount</th>
                  <th className="py-3 pr-4 font-semibold">Occurred</th>
                  <th className="py-3 text-right font-semibold">Synced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0ec]">
                {data.externalRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[13px] text-[#1a1a1a]/35">
                      Neo CRM snapshot records are not loaded yet.
                    </td>
                  </tr>
                ) : (
                  data.externalRecords.map((record) => (
                    <tr key={`${record.objectApiKey}:${record.externalId}`} className="align-top">
                      <td className="py-4 pr-4">
                        <p className="text-[12px] font-semibold text-[#111110]">{record.objectApiKey}</p>
                        <p className="mt-1 text-[11px] text-[#1a1a1a]/35">{record.externalId}</p>
                      </td>
                      <td className="py-4 pr-4">
                        <p className="line-clamp-2 text-[13px] font-semibold text-[#111110]">
                          {record.displayName ?? record.externalId}
                        </p>
                      </td>
                      <td className="py-4 pr-4 text-[12px] text-[#1a1a1a]/50">
                        <p>{record.ownerName ?? "-"}</p>
                        <p className="mt-1 text-[11px] text-[#1a1a1a]/35">{record.status ?? "-"}</p>
                      </td>
                      <td className="py-4 pr-4 text-right text-[12px] font-semibold text-[#111110]">
                        {record.amount == null
                          ? "-"
                          : record.objectApiKey === "opportunity"
                            ? `$${record.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                            : formatCNY(record.amount)}
                      </td>
                      <td className="py-4 pr-4 text-[12px] text-[#1a1a1a]/45">
                        {formatDate(record.occurredAt)}
                      </td>
                      <td className="py-4 text-right text-[12px] text-[#1a1a1a]/45">
                        {formatDate(record.syncedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data?.identity ? (
        <section className="mb-8 border-b border-[#f0f0ec] pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[#1a1a1a]/35" />
              <h2 className="text-[14px] font-semibold text-[#111110]">CRM 정합성</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void generateLinkCandidates()}
                disabled={generatingLinks || loading}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
              >
                {generatingLinks ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Database className="h-3.5 w-3.5" />
                )}
                후보 생성
              </button>
              <Link
                href="/admin/crm/customers/accounts"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e8e8e4] px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
              >
                고객사
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="mt-2 grid gap-8 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="확정 매칭"
              value={`${formatNumber(data.identity.linkedSheetDealCount)} / ${formatNumber(data.sheet?.activeDealCount ?? 0)}`}
              hint={`고객 ${formatNumber(data.identity.targetCustomerCount)} · 거래 ${formatNumber(data.identity.targetDealCount)}`}
            />
            <MetricCard
              label="매칭 후보"
              value={formatNumber(data.identity.candidateLinks)}
              hint={`제외 ${formatNumber(data.identity.rejectedLinks)} · 재검수 ${formatNumber(data.identity.staleLinks)}`}
            />
            <MetricCard
              label="미매칭 REV"
              value={formatNumber(data.identity.unmatchedSheetDealCount)}
              hint="확정 link가 없는 활성 시트 고객"
            />
            <MetricCard
              label="최근 연결"
              value={formatDate(data.identity.lastLinkedAt)}
              hint={`${formatNumber(data.identity.totalLinks)}개 source link`}
            />
          </div>


          <div className="mt-6 flex flex-col gap-3 rounded-xl bg-[#fafaf8] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[13px] font-semibold text-[#111110]">매칭 검수는 데이터 매칭 인박스로 이동했습니다</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                REV 시트 행, Neo CRM 후보, 리드 연결을 한 화면에서 일괄 확정/제외하고 자동 확정 내역을 검토합니다.
              </p>
            </div>
            <Link
              href="/admin/crm/matching"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[#111110] bg-[#111110] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#2a2a28]"
            >
              매칭 인박스 열기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-8 border-t border-[#f0f0ec] pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ServerCog className="h-4 w-4 text-[#1a1a1a]/35" />
                <h3 className="text-[13px] font-semibold text-[#111110]">외부 CRM 쓰기 승인 큐</h3>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <StatusBadge
                  label={writeMetadataStatus?.ok ? "metadata 확인" : "metadata 미검증"}
                  tone={writeMetadataStatus?.ok ? STATUS_TONE.connected : STATUS_TONE.not_configured}
                />
                <span className="text-[11px] text-[#1a1a1a]/35">
                  {formatWriteMetadataStatus(writeMetadataStatus)}
                </span>
                <button
                  type="button"
                  onClick={() => void validateWriteMetadata()}
                  disabled={validatingWriteMetadata}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
                >
                  {validatingWriteMetadata ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  검증
                </button>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-[1220px] w-full text-left">
                <thead className="text-[11px] uppercase tracking-[0.12em] text-[#1a1a1a]/35">
                  <tr>
                    <th className="py-3 pr-4 font-semibold">상태</th>
                    <th className="py-3 pr-4 font-semibold">작업</th>
                    <th className="py-3 pr-4 font-semibold">객체</th>
                    <th className="py-3 pr-4 font-semibold">외부 ID</th>
                    <th className="py-3 pr-4 font-semibold">Payload</th>
                    <th className="py-3 pr-4 font-semibold">승인</th>
                    <th className="py-3 pr-4 font-semibold">실행</th>
                    <th className="py-3 pr-4 font-semibold">재시도</th>
                    <th className="py-3 pr-4 font-semibold">오류</th>
                    <th className="py-3 pl-4 text-right font-semibold">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0ec]">
                  {(data.writeRequests ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-[13px] text-[#1a1a1a]/35">
                        대기 중인 외부 CRM 쓰기 요청이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    data.writeRequests.map((request) => {
                      const approveKey = `${request.id}:approve`
                      const cancelKey = `${request.id}:cancel`
                      const retryKey = `${request.id}:retry`
                      return (
                        <tr key={request.id} className="align-top">
                          <td className="py-4 pr-4">
                            <StatusBadge
                              label={WRITE_STATUS_LABEL[request.status] ?? request.status}
                              tone={WRITE_STATUS_TONE[request.status]}
                            />
                          </td>
                          <td className="py-4 pr-4 text-[12px] font-semibold text-[#111110]">
                            {WRITE_OPERATION_LABEL[request.operation] ?? request.operation}
                          </td>
                          <td className="py-4 pr-4">
                            <p className="text-[12px] font-semibold text-[#111110]">{request.objectApiKey}</p>
                            <p className="mt-1 text-[11px] text-[#1a1a1a]/35">{request.sourceSystem}</p>
                          </td>
                          <td className="py-4 pr-4 text-[12px] text-[#1a1a1a]/50">
                            {request.externalId ?? "신규"}
                          </td>
                          <td className="max-w-[260px] py-4 pr-4 text-[12px] text-[#1a1a1a]/50">
                            <p className="line-clamp-2">{formatWritePayload(request.payload)}</p>
                          </td>
                          <td className="py-4 pr-4 text-[12px] text-[#1a1a1a]/45">
                            {formatDate(request.approvedAt)}
                          </td>
                          <td className="py-4 pr-4 text-[12px] text-[#1a1a1a]/45">
                            {formatDate(request.executedAt)}
                          </td>
                          <td className="max-w-[220px] py-4 pr-4 text-[12px] text-[#1a1a1a]/45">
                            <p className="line-clamp-2">{formatWriteAttempt(request)}</p>
                          </td>
                          <td className="max-w-[220px] py-4 pr-4 text-[12px] text-[#B85C33]">
                            <p className="line-clamp-2">{request.error ?? request.lastAttemptError ?? "-"}</p>
                          </td>
                          <td className="py-4 pl-4 text-right">
                            {request.status === "draft" ? (
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void updateWriteRequest(request.id, "approve")}
                                  disabled={updatingWriteRequestId === approveKey}
                                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                                >
                                  {updatingWriteRequestId === approveKey ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5" />
                                  )}
                                  승인
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void updateWriteRequest(request.id, "cancel")}
                                  disabled={updatingWriteRequestId === cancelKey}
                                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] px-2 text-[11px] font-semibold text-[#B85C33] transition-colors hover:bg-[#FBE8DD] disabled:opacity-50"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  취소
                                </button>
                              </div>
                            ) : request.status === "approved" ? (
                              <button
                                type="button"
                                onClick={() => void updateWriteRequest(request.id, "cancel")}
                                disabled={updatingWriteRequestId === cancelKey}
                                className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] px-2 text-[11px] font-semibold text-[#B85C33] transition-colors hover:bg-[#FBE8DD] disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                                취소
                              </button>
                            ) : request.status === "failed" ? (
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void updateWriteRequest(request.id, "retry")}
                                  disabled={
                                    updatingWriteRequestId === retryKey ||
                                    request.attemptCount >= WRITE_MAX_ATTEMPTS ||
                                    Boolean(request.nextRetryAt && new Date(request.nextRetryAt).getTime() > Date.now())
                                  }
                                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-amber-100 bg-amber-50 px-2 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                                >
                                  {updatingWriteRequestId === retryKey ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  )}
                                  재시도
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void updateWriteRequest(request.id, "cancel")}
                                  disabled={updatingWriteRequestId === cancelKey}
                                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] px-2 text-[11px] font-semibold text-[#B85C33] transition-colors hover:bg-[#FBE8DD] disabled:opacity-50"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  취소
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-[#1a1a1a]/30">-</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mb-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#1a1a1a]/35" />
            <h2 className="text-[14px] font-semibold text-[#111110]">월별 흐름</h2>
          </div>
          <div className="mt-4 space-y-3">
            {(data?.monthly ?? []).map((point) => (
              <div key={point.month} className="grid gap-3 border-t border-[#f0f0ec] pt-3 sm:grid-cols-[88px_minmax(0,1fr)] sm:items-center">
                <p className="text-[12px] font-semibold text-[#111110]">{point.month}</p>
                <div className="grid gap-2">
                  {[
                    ["견적", point.quotedAmount, "bg-sky-300"],
                    ["계약", point.contractedAmount, "bg-[#084734]"],
                    ["입금", point.paidAmount, "bg-emerald-400"],
                    ["예상", point.expectedAmount, "bg-amber-300"],
                    ["시트 확정", point.sheetConfirmedAmount, "bg-[#065c41]"],
                    ["시트 임박", point.sheetHighConfidenceAmount, "bg-blue-400"],
                    ["시트 예상", point.sheetExpectedAmount, "bg-[#6EE7B7]"],
                  ].map(([label, amount, color]) => {
                    const numericAmount = Number(amount)
                    // 시트 계열 금액은 CNY, 앱(견적/계약/입금/예상)은 KRW.
                    const isSheetRow = String(label).startsWith("시트")
                    return (
                      <div key={label} className="grid grid-cols-[60px_minmax(0,1fr)_72px] items-center gap-2">
                        <span className="text-[11px] text-[#1a1a1a]/40">{label}</span>
                        <div className="h-2 overflow-hidden rounded-full bg-[#f0f0ec]">
                          <div
                            className={`h-full rounded-full ${color}`}
                            style={{ width: `${Math.max(2, (numericAmount / maxMonthlyAmount) * 100)}%` }}
                          />
                        </div>
                        <span className="text-right text-[11px] font-semibold text-[#111110]">
                          {isSheetRow ? formatCNY(numericAmount) : formatCurrency(numericAmount)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            {loading && !data ? (
              <div className="flex items-center justify-center py-16 text-[13px] text-[#1a1a1a]/35">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                매출 흐름을 집계하는 중입니다.
              </div>
            ) : null}
          </div>
        </div>

        <aside>
          <div className="flex items-center gap-2">
            <ServerCog className="h-4 w-4 text-[#1a1a1a]/35" />
            <h2 className="text-[14px] font-semibold text-[#111110]">연결 상태</h2>
          </div>
          <div className="mt-4 space-y-4">
            <ReadinessPanel
              report={readiness}
              checking={checkingReadiness}
              onCheck={() => void checkReadiness()}
            />
            {(data?.sources ?? []).map((source) => (
              <SourcePanel key={source.key} source={source} />
            ))}
          </div>
        </aside>
      </section>

      <section className="mb-8 grid gap-8 xl:grid-cols-2">
        <div>
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-[#1a1a1a]/35" />
            <h2 className="text-[14px] font-semibold text-[#111110]">고객/파트너별 매출</h2>
          </div>
          <div className="mt-4 divide-y divide-[#f0f0ec]">
            {(data?.partners.length ?? 0) === 0 ? (
              <p className="py-10 text-center text-[13px] text-[#1a1a1a]/35">
                아직 집계할 매출 데이터가 없습니다.
              </p>
            ) : (
              data?.partners.map((partner) => (
                <div key={partner.id} className="py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[#111110]">{partner.name}</p>
                      <p className="mt-1 text-[11px] text-[#1a1a1a]/35">
                        진행 {formatNumber(partner.activeDealCount)}건 · 최근 {formatDate(partner.latestActivityAt)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right text-[11px] sm:shrink-0">
                      <span className="text-[#1a1a1a]/35">계약</span>
                      <span className="font-semibold text-[#111110]">{formatCurrency(partner.contractedAmount)}</span>
                      <span className="text-[#1a1a1a]/35">입금</span>
                      <span className="font-semibold text-[#111110]">{formatCurrency(partner.paidAmount)}</span>
                      <span className="text-[#1a1a1a]/35">미수</span>
                      <span className="font-semibold text-[#B85C33]">{formatCurrency(partner.outstandingAmount)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[#B85C33]" />
            <h2 className="text-[14px] font-semibold text-[#111110]">매출 리스크</h2>
          </div>
          <div className="mt-4 divide-y divide-[#f0f0ec]">
            {(data?.risks.length ?? 0) === 0 ? (
              <p className="py-10 text-center text-[13px] text-[#1a1a1a]/35">
                현재 큰 미수 리스크가 없습니다.
              </p>
            ) : (
              data?.risks.map((risk) => (
                <Link
                  key={risk.id}
                  href={risk.href}
                  className="flex items-start justify-between gap-4 py-4 transition-colors hover:text-[#084734]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[#111110]">{risk.title}</p>
                    <p className="mt-1 text-[11px] text-[#1a1a1a]/35">
                      {risk.ownerName} · {risk.reason}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[13px] font-bold text-[#B85C33]">
                      {formatCurrency(risk.amount)}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-[#1a1a1a]/30" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-[#1a1a1a]/35" />
          <h2 className="text-[14px] font-semibold text-[#111110]">최근 매출 원천 데이터</h2>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[820px] w-full text-left">
            <thead className="text-[11px] uppercase tracking-[0.12em] text-[#1a1a1a]/35">
              <tr>
                <th className="py-3 pr-4 font-semibold">구분</th>
                <th className="py-3 pr-4 font-semibold">문서/거래</th>
                <th className="py-3 pr-4 font-semibold">고객/파트너</th>
                <th className="py-3 pr-4 font-semibold">상태</th>
                <th className="py-3 pr-4 text-right font-semibold">금액</th>
                <th className="py-3 text-right font-semibold">일시</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0ec]">
              {(data?.documents.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[13px] text-[#1a1a1a]/35">
                    표시할 원천 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                data?.documents.map((document) => (
                  <tr key={`${document.kind}:${document.id}`} className="align-top">
                    <td className="py-4 pr-4">
                      <StatusBadge label={KIND_LABEL[document.kind]} />
                    </td>
                    <td className="py-4 pr-4">
                      <Link href={document.href} className="text-[13px] font-semibold text-[#111110] hover:text-[#084734]">
                        {document.title}
                      </Link>
                    </td>
                    <td className="py-4 pr-4 text-[12px] text-[#1a1a1a]/50">{document.ownerName}</td>
                    <td className="py-4 pr-4 text-[12px] text-[#1a1a1a]/50">{document.status}</td>
                    <td className="py-4 pr-4 text-right text-[12px] font-semibold text-[#111110]">
                      {formatCurrency(document.amount)}
                    </td>
                    <td className="py-4 text-right text-[12px] text-[#1a1a1a]/45">
                      {formatDate(document.occurredAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
