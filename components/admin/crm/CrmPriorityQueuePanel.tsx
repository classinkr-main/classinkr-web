"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Building2, CheckCircle2, Clock3, ExternalLink, Filter, PhoneCall, RefreshCw } from "lucide-react"

import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import type { CrmPriorityBucket, CrmPriorityItem, CrmPrioritySource } from "@/lib/crm/priority"
import { buildOwnerSelectOptions, useCrmOwners } from "./useCrmOwners"

type SourceFilter = "all" | CrmPrioritySource
type BucketFilter = "all" | CrmPriorityBucket

interface CrmPriorityQueue {
  generatedAt: string
  sources: {
    leadsOk: boolean
    neoAccountsOk: boolean
    warnings: string[]
  }
  summary: {
    total: number
    critical: number
    high: number
    leadCount: number
    neoAccountCount: number
    ownerCount: number
    bucketCounts: Record<CrmPriorityBucket, number>
  }
  buckets: Array<{ bucket: CrmPriorityBucket; label: string; count: number }>
  owners: Array<{ ownerName: string; count: number }>
  items: CrmPriorityItem[]
}

const SOURCE_FILTERS: Array<{ key: SourceFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "lead", label: "리드" },
  { key: "neo_account", label: "고객" },
]

const FALLBACK_BUCKETS: Array<{ bucket: CrmPriorityBucket; label: string; count: number }> = [
  { bucket: "today", label: "오늘 처리", count: 0 },
  { bucket: "renewal", label: "연장 관리", count: 0 },
  { bucket: "watch", label: "관찰", count: 0 },
  { bucket: "stale_recovery", label: "장기 회복", count: 0 },
]

const QUEUE_TTL_MS = 90_000
const CURRENT_OWNER_VALUE = "__me"

function queueUrl(source: SourceFilter, owner: string, bucket: BucketFilter) {
  const params = new URLSearchParams({ limit: "12" })
  if (source !== "all") params.set("source", source)
  if (owner) params.set("owner", owner)
  if (bucket !== "all") params.set("bucket", bucket)
  return `/api/admin/crm/home/priority-queue?${params.toString()}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function severityClass(item: CrmPriorityItem) {
  if (item.severity === "critical") return "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]"
  if (item.severity === "high") return "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]"
  return "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55"
}

function sourceIcon(source: CrmPrioritySource) {
  return source === "lead" ? <PhoneCall className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />
}

function leadIdFromPriorityItem(item: CrmPriorityItem) {
  return item.source === "lead" && item.id.startsWith("lead:") ? item.id.slice("lead:".length) : null
}

function tomorrowMorningIso() {
  const next = new Date()
  next.setDate(next.getDate() + 1)
  next.setHours(9, 0, 0, 0)
  return next.toISOString()
}

export default function CrmPriorityQueuePanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [source, setSource] = useState<SourceFilter>("all")
  const [bucket, setBucket] = useState<BucketFilter>("today")
  const [owner, setOwner] = useState("")
  const [data, setData] = useState<CrmPriorityQueue | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const { owners: crmOwners, currentOwner, health: ownerHealth } = useCrmOwners()

  const url = useMemo(() => queueUrl(source, owner, bucket), [source, owner, bucket])
  const bucketOptions = data?.buckets.length ? data.buckets : FALLBACK_BUCKETS
  const ownerOptions = useMemo(() => buildOwnerSelectOptions(data?.owners, crmOwners), [crmOwners, data?.owners])

  const load = useCallback(
    async (options?: { force?: boolean }) => {
      const cached = getCachedAdminJson<CrmPriorityQueue>(url, { cacheKey: url })
      if (cached && !options?.force) setData(cached)

      setLoading(!cached)
      setRefreshing(Boolean(options?.force))
      setError(null)
      try {
        const next = await adminFetchJsonCached<CrmPriorityQueue>(
          options?.force ? `${url}&force=1` : url,
          undefined,
          {
            cacheKey: url,
            ttlMs: QUEUE_TTL_MS,
            staleWhileRevalidateMs: 5 * 60_000,
            force: options?.force,
          }
        )
        setData(next)
      } catch (err) {
        setError(err instanceof Error ? err.message : "우선순위를 불러오지 못했습니다.")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [url]
  )

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const handleLeadAction = useCallback(
    async (item: CrmPriorityItem, action: "done" | "tomorrow") => {
      const leadId = leadIdFromPriorityItem(item)
      if (!leadId) return

      setActingId(`${item.id}:${action}`)
      setActionMessage(null)
      setError(null)
      try {
        const followUpAt = action === "tomorrow" ? tomorrowMorningIso() : null
        await adminFetchJsonCached<{ log: unknown }>(`/api/admin/leads/${encodeURIComponent(leadId)}/logs`, {
          method: "POST",
          body: JSON.stringify({
            type: "call",
            result: action === "done" ? "answered" : "no_answer",
            notes:
              action === "done"
                ? "CRM 우선순위 큐에서 연락 완료 처리"
                : "CRM 우선순위 큐에서 부재 기록 후 내일 팔로업",
          }),
        })
        await adminFetchJsonCached<{ ok: true }>(`/api/admin/leads/${encodeURIComponent(leadId)}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "contacted",
            follow_up_at: followUpAt,
          }),
        })
        setActionMessage(action === "done" ? "연락 기록을 남기고 리드를 연락중으로 옮겼습니다." : "부재 기록을 남기고 내일 팔로업으로 넘겼습니다.")
        await load({ force: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : "리드 처리에 실패했습니다.")
      } finally {
        setActingId(null)
      }
    },
    [load]
  )

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">
            ClassIn Operation
          </p>
          <h2 className="mt-1 text-[18px] font-bold text-[#111110]">고객 운영 우선순위</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-1">
            {SOURCE_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setSource(filter.key)}
                className={`h-7 rounded-md px-3 text-[12px] font-semibold transition-colors ${
                  source === filter.key
                    ? "bg-[#111110] text-white"
                    : "text-[#1a1a1a]/55 hover:bg-white hover:text-[#111110]"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <label className="flex h-9 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#1a1a1a]/50">
            <Filter className="h-3.5 w-3.5" />
            <select
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
              className="h-full min-w-[112px] bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
              aria-label="담당자 필터"
            >
              <option value="">담당 전체</option>
              {currentOwner ? (
                <option value={CURRENT_OWNER_VALUE}>내 담당 · {currentOwner.displayName}</option>
              ) : null}
              {ownerOptions.map((option) => (
                <option key={option.ownerName} value={option.ownerName}>
                  {option.label}
                  {option.teamRoleLabel ? ` · ${option.teamRoleLabel}` : ""}
                  {option.count > 0 ? ` (${option.count})` : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load({ force: true })}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>
      </div>

      {data ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-[#fafaf8] p-3">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/35">선택 후보</p>
            <p className="mt-1 text-xl font-bold text-[#111110]">{data.summary.total.toLocaleString("ko-KR")}</p>
          </div>
          <div className="rounded-xl bg-[#fafaf8] p-3">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/35">긴급</p>
            <p className="mt-1 text-xl font-bold text-[#B85C33]">{data.summary.critical.toLocaleString("ko-KR")}</p>
          </div>
          <div className="rounded-xl bg-[#fafaf8] p-3">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/35">리드</p>
            <p className="mt-1 text-xl font-bold text-[#111110]">{data.summary.leadCount.toLocaleString("ko-KR")}</p>
          </div>
          <div className="rounded-xl bg-[#fafaf8] p-3">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/35">ClassIn 고객</p>
            <p className="mt-1 text-xl font-bold text-[#111110]">
              {data.summary.neoAccountCount.toLocaleString("ko-KR")}
            </p>
          </div>
        </div>
      ) : null}

      {ownerHealth?.ok === false && ownerHealth.message ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{ownerHealth.message}</span>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setBucket("all")}
          className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
            bucket === "all"
              ? "border-[#084734] bg-[#084734] text-white"
              : "border-[#e8e8e4] bg-white text-[#1a1a1a]/60 hover:bg-[#fafaf8] hover:text-[#111110]"
          }`}
        >
          전체
        </button>
        {bucketOptions.map((option) => (
          <button
            key={option.bucket}
            type="button"
            onClick={() => setBucket(option.bucket)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
              bucket === option.bucket
                ? "border-[#084734] bg-[#084734] text-white"
                : "border-[#e8e8e4] bg-white text-[#1a1a1a]/60 hover:bg-[#fafaf8] hover:text-[#111110]"
            }`}
          >
            <span>{option.label}</span>
            <span className={bucket === option.bucket ? "text-white/70" : "text-[#1a1a1a]/35"}>
              {option.count.toLocaleString("ko-KR")}
            </span>
          </button>
        ))}
      </div>

      {error ? (
        <div className="mb-3 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] font-medium text-[#B85C33]">
          {error}
        </div>
      ) : null}

      {actionMessage ? (
        <div className="mb-3 rounded-xl border border-[#D7EBDD] bg-[#ECFDF5] px-3 py-2 text-[12px] font-medium text-[#084734]">
          {actionMessage}
        </div>
      ) : null}

      {data?.sources.warnings.length ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{data.sources.warnings.join(" ")}</span>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[#f0f0ec]">
        {loading && !data ? (
          <div className="p-6 text-center text-[13px] text-[#1a1a1a]/40">우선순위를 계산 중입니다...</div>
        ) : data && data.items.length > 0 ? (
          <div className="divide-y divide-[#f0f0ec]">
            {data.items.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 p-3 transition-colors hover:bg-[#fafaf8] lg:grid-cols-[minmax(0,1fr)_120px_112px_160px]"
              >
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityClass(
                        item
                      )}`}
                    >
                      {sourceIcon(item.source)}
                      {item.actionLabel}
                    </span>
                    <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-semibold text-[#084734]">
                      {item.bucketLabel}
                    </span>
                    <span className="text-[11px] font-medium text-[#1a1a1a]/35">{item.statusLabel}</span>
                  </div>
                  <Link href={item.href} className="group inline-flex max-w-full items-center gap-1.5">
                    <span className="truncate text-[14px] font-bold text-[#111110]">{item.title}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/25 group-hover:text-[#111110]" />
                  </Link>
                  <p className="mt-0.5 truncate text-[12px] text-[#1a1a1a]/45">{item.subtitle ?? item.reason}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">근거</p>
                  <p className="mt-1 text-[12px] font-medium text-[#111110]">{item.reason}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">담당·기준일</p>
                  <p className="mt-1 truncate text-[12px] font-medium text-[#111110]">{item.ownerName ?? "미배정"}</p>
                  <p className="text-[11px] text-[#1a1a1a]/35">{formatDate(item.dueAt ?? item.updatedAt)}</p>
                </div>
                <div className="flex flex-col gap-2 lg:items-end">
                  <div className="flex items-center justify-between gap-2 lg:justify-end">
                    <span className="text-[18px] font-bold tabular-nums text-[#111110]">{item.score}</span>
                    <Link
                      href={item.href}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
                    >
                      열기
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  {item.source === "lead" ? (
                    <div className="flex flex-wrap gap-1.5 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => void handleLeadAction(item, "done")}
                        disabled={actingId === `${item.id}:done` || actingId === `${item.id}:tomorrow`}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#D7EBDD] bg-[#ECFDF5] px-2 text-[11px] font-semibold text-[#084734] transition-colors hover:bg-[#D7EBDD] disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        연락 완료
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLeadAction(item, "tomorrow")}
                        disabled={actingId === `${item.id}:done` || actingId === `${item.id}:tomorrow`}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[11px] font-semibold text-[#1a1a1a]/60 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] disabled:opacity-50"
                      >
                        <Clock3 className="h-3 w-3" />
                        내일 팔로업
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-[13px] text-[#1a1a1a]/40">오늘 표시할 우선순위가 없습니다.</div>
        )}
      </div>
    </section>
  )
}
