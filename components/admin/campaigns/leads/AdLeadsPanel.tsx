"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Loader2,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react"

import ShowMore, { useVisibleCount } from "@/components/admin/ui/ShowMore"
import { CampaignExportButton } from "@/components/admin/campaigns/CampaignExportButton"
import { Skeleton } from "@/components/admin/viz"
import { KRW, won } from "@/components/admin/campaigns/event-format"
import { adminFetchJson } from "@/lib/admin-client"
import {
  AD_LEAD_CSV_COLUMNS,
  AD_LEAD_LENS_OPTIONS,
  AD_LEAD_PERIOD_OPTIONS,
  AD_LEAD_PERIOD_TO_META_PRESET,
  AD_LEAD_STATUS_OPTIONS,
  buildAdLeadCsvRows,
  buildAdLeadScopes,
  buildAdLeadStats,
  isConvertibleLead,
  type AdLeadLens,
  type AdLeadPeriod,
  type AdLeadStatusFilter,
} from "@/lib/campaigns/ad-leads"
import {
  TRACKING_DIMENSIONS,
  getLeadAdLabel,
  getLeadCampaignLabel,
  getLeadChannelLabel,
  getLeadLandingPath,
  getLeadSourceGroup,
  getLeadTrackingKey,
  SOURCE_GROUP_DOT,
  type TrackingDimension,
} from "@/lib/crm/lead-attribution"
import { buildTrackingRollup } from "@/lib/crm/lead-ranking"
import { getLeadMagnetLabel } from "@/components/admin/crm/leads/shared"
import type { LeadRecord } from "@/lib/repositories/leads"
const AdLeadImportDialog = dynamic(() => import("./AdLeadImportDialog"), { ssr: false })

// 광고 탭 안의 "광고 리드" 섹션 — 캠페인 성과 옆에서 리드를 모아보고, 바로 CRM으로 올린다.
//
// 리드 보드(/admin/crm/customers/leads)와 역할이 다르다: 저기는 리드 1건을 끝까지 다루는
// 작업대고, 여기는 "이 광고가 만든 리드 묶음"을 광고비·CPL과 나란히 보고 한꺼번에 넘기는
// 자리다. 그래서 목록은 컴팩트하게(한 행 = 한 줄) 유지하고, 상세 편집은 리드 보드로 보낸다.

const ROW_STEP = 12
const ROLLUP_STEP = 6
/** 서버(app/api/admin/leads/bulk-convert)의 한 요청 상한과 같아야 한다. */
const CONVERT_CHUNK = 25

interface BulkConvertRow {
  leadId: string
  ok: boolean
  code?: string
  error?: string
  dealUrl?: string
}

interface BulkConvertResponse {
  requested: number
  converted: number
  skipped: number
  failed: number
  results: BulkConvertRow[]
}

interface ConvertOutcome {
  converted: number
  skipped: number
  failed: number
  firstError: string | null
  lastDealUrl: string | null
}

const DATE = new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" })

function formatLeadDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : DATE.format(date)
}

// DESIGN.md 운영 상태 스케일 — 연락중=Warning, 전환됨=Success (Tailwind 기본 팔레트 금지).
const STATUS_TONE: Record<string, string> = {
  new: "border-[#e8e8e4] bg-white text-[#111110]",
  contacted: "border-[#ECD29C] bg-[#FBF1E0] text-[#A8741A]",
  converted: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]",
  closed: "border-[#e8e8e4] bg-[#f0f0ec] text-[#1a1a1a]/45",
}

const STATUS_TEXT: Record<string, string> = {
  new: "신규",
  contacted: "연락중",
  converted: "전환됨",
  closed: "종료",
}

function StatCell({
  label,
  value,
  hint,
  tone = "neutral",
  loading = false,
}: {
  label: string
  value: string
  hint?: string
  tone?: "neutral" | "success" | "warn"
  loading?: boolean
}) {
  const valueTone =
    tone === "success" ? "text-[#084734]" : tone === "warn" ? "text-[#B85C33]" : "text-[#111110]"
  return (
    <div className="px-3.5 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1a1a1a]/35">{label}</p>
      {loading ? (
        <Skeleton className="mt-1.5 h-4 w-14" />
      ) : (
        <p className={`mt-1 text-[17px] font-bold leading-none tracking-[-0.02em] tabular-nums ${valueTone}`}>
          {value}
        </p>
      )}
      {hint ? <p className="mt-1 text-[10.5px] leading-tight text-[#1a1a1a]/40">{hint}</p> : null}
    </div>
  )
}

export default function AdLeadsPanel({
  leads,
  loading,
  error,
  onRefresh,
  onLeadsUpdate,
  metaSpend,
  metaCurrency,
  metaDatePreset,
}: {
  leads: LeadRecord[]
  loading: boolean
  error: string | null
  onRefresh: () => void
  /** 전환 결과를 목록에 반영한다(전량 재조회 없이 상태만 갱신 — 스크롤·선택 위치 보존). */
  onLeadsUpdate: (updater: (prev: LeadRecord[]) => LeadRecord[]) => void
  /** Meta 라이브 광고비 — 실측 CPL 대조용. 통화가 KRW가 아닐 수 있어 표기에 통화를 붙인다. */
  metaSpend: number | null
  metaCurrency: string
  /** 광고비가 집계된 기간 — 리드 기간 필터와 일치할 때만 CPL을 계산한다(분자·분모 기간 정합). */
  metaDatePreset: string
}) {
  const [lens, setLens] = useState<AdLeadLens>("paid")
  const [period, setPeriod] = useState<AdLeadPeriod>("30d")
  const [status, setStatus] = useState<AdLeadStatusFilter>("all")
  const [dimension, setDimension] = useState<TrackingDimension>("campaign")
  const [trackingKey, setTrackingKey] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [includeTestLeads, setIncludeTestLeads] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [convertProgress, setConvertProgress] = useState<{ done: number; total: number } | null>(null)
  const [outcome, setOutcome] = useState<ConvertOutcome | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const deferredSearch = useDeferredValue(search)

  // 기간 필터(7일/30일/90일) 경계가 렌더마다 흔들리지 않도록 now를 고정하되, 상태 변경은
  // 15분에 한 번만 허용한다 — 60초마다 갱신하면 아래 파생 체인(스코프→통계→롤업)이
  // 사용자가 아무것도 안 해도 매분 리드 전량을 다시 훑는다. 30일 창에서 15분 오차는 무의미하다.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(
      () => setNowMs((prev) => (Date.now() - prev >= 15 * 60_000 ? Date.now() : prev)),
      60_000
    )
    return () => clearInterval(timer)
  }, [])

  const getKey = useCallback(
    (lead: LeadRecord) => getLeadTrackingKey(lead, dimension),
    [dimension]
  )

  const { scoped, rows, hiddenTestCount } = useMemo(
    () =>
      buildAdLeadScopes(leads, {
        lens,
        period,
        status,
        search: deferredSearch,
        trackingKey,
        getTrackingKey: getKey,
        nowMs,
        includeTestLeads,
      }),
    [leads, lens, period, status, deferredSearch, trackingKey, getKey, nowMs, includeTestLeads]
  )

  // 실측 CPL 은 광고비(metaDatePreset)와 리드 목록(period)의 기간이 일치할 때만 계산한다.
  const periodMatchesMetaSpend = AD_LEAD_PERIOD_TO_META_PRESET[period] === metaDatePreset
  const stats = useMemo(
    () => buildAdLeadStats(scoped, periodMatchesMetaSpend ? metaSpend : null),
    [scoped, metaSpend, periodMatchesMetaSpend]
  )
  const rollup = useMemo(() => buildTrackingRollup(scoped, getKey), [scoped, getKey])

  const rowsVisible = useVisibleCount(rows.length, ROW_STEP)
  const rollupVisible = useVisibleCount(rollup.rows.length, ROLLUP_STEP)

  // CSV 행은 클릭 시점에 생성한다 — 선행 생성하면 내보내기를 안 눌러도 필터 변경마다 전량을 순회한다.
  const buildCsvRows = useCallback(() => buildAdLeadCsvRows(rows, getLeadLandingPath), [rows])

  // 선택은 화면에 보이는 전환 대상만 유효하다 — 필터를 바꿔 사라진 리드가 유령 선택으로
  // 남아 "12건 전환"을 눌렀는데 엉뚱한 리드가 넘어가는 일을 막는다.
  const selectableIds = useMemo(
    () => rows.filter(isConvertibleLead).map((lead) => lead.id),
    [rows]
  )
  const effectiveSelection = useMemo(
    () => selectableIds.filter((id) => selectedIds.has(id)),
    [selectableIds, selectedIds]
  )
  const allSelected = selectableIds.length > 0 && effectiveSelection.length === selectableIds.length

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const everySelected = selectableIds.length > 0 && selectableIds.every((id) => next.has(id))
      for (const id of selectableIds) {
        if (everySelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }, [selectableIds])

  const converting = convertProgress !== null
  // setState는 비동기라 상태만으로는 연타를 막지 못한다 — 같은 리드가 두 번 전환되면
  // 고객·거래가 중복 생성될 수 있으므로 동기 ref로 실행 중 여부를 잠근다.
  const convertingRef = useRef(false)

  /**
   * 전환 실행. 단건 버튼과 단체 전환이 같은 경로를 쓴다 — 서버 상한(25건)에 맞춰 끊어 보내고
   * 청크마다 진행률을 올린다. 중간 청크가 실패해도 앞 청크의 성공은 이미 반영돼 있으므로
   * 목록 갱신은 청크 단위로 즉시 하고, 요약은 끝에 한 번 보여준다.
   */
  const runConvert = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0 || convertingRef.current) return
      convertingRef.current = true
      setOutcome(null)
      setConvertProgress({ done: 0, total: ids.length })

      const summary: ConvertOutcome = {
        converted: 0,
        skipped: 0,
        failed: 0,
        firstError: null,
        lastDealUrl: null,
      }

      try {
        for (let i = 0; i < ids.length; i += CONVERT_CHUNK) {
          const chunk = ids.slice(i, i + CONVERT_CHUNK)
          try {
            const data = await adminFetchJson<BulkConvertResponse>("/api/admin/leads/bulk-convert", {
              method: "POST",
              body: JSON.stringify({ ids: chunk }),
            })
            summary.converted += data.converted
            summary.skipped += data.skipped
            summary.failed += data.failed

            const convertedIds = new Set<string>()
            for (const row of data.results) {
              if (row.ok) {
                convertedIds.add(row.leadId)
                if (row.dealUrl) summary.lastDealUrl = row.dealUrl
              } else if (row.code === "already_converted") {
                // 이미 전환된 리드도 목록에서는 전환됨으로 맞춰준다(새로고침 없이 정합).
                convertedIds.add(row.leadId)
              } else if (!summary.firstError && row.error) {
                summary.firstError = row.error
              }
            }
            if (convertedIds.size > 0) {
              onLeadsUpdate((prev) =>
                prev.map((lead) =>
                  convertedIds.has(lead.id) ? { ...lead, status: "converted" as const } : lead
                )
              )
              setSelectedIds((prev) => {
                const next = new Set(prev)
                for (const id of convertedIds) next.delete(id)
                return next
              })
            }
          } catch (chunkError) {
            // 청크 단위 사고(네트워크·권한)는 그 청크만 실패로 세고 다음 청크를 계속 시도한다.
            summary.failed += chunk.length
            if (!summary.firstError) {
              summary.firstError =
                chunkError instanceof Error ? chunkError.message : "리드를 전환하지 못했습니다."
            }
          }
          setConvertProgress({ done: Math.min(i + CONVERT_CHUNK, ids.length), total: ids.length })
        }
      } finally {
        convertingRef.current = false
        setConvertProgress(null)
        setOutcome(summary)
      }
    },
    [onLeadsUpdate]
  )

  const handleBulkConvert = useCallback(() => {
    if (effectiveSelection.length === 0) return
    if (
      !window.confirm(
        `선택한 ${effectiveSelection.length}건을 CRM 고객·거래로 전환할까요?\n\n` +
          "각 리드마다 고객과 거래가 만들어지고 리드 상태가 '전환됨'으로 바뀝니다. 되돌리기는 없습니다."
      )
    )
      return
    void runConvert(effectiveSelection)
  }, [effectiveSelection, runConvert])

  const activeDimensionHint = TRACKING_DIMENSIONS.find((item) => item.key === dimension)?.hint ?? ""
  const trackedShare =
    stats.total > 0 ? Math.round(((stats.total - rollup.untrackedCount) / stats.total) * 100) : null

  return (
    <div className="space-y-3">
      {/* 헤더 — 렌즈·기간·입출력 */}
      <div className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3.5 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-[#111110]">광고 리드</h2>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#1a1a1a]/45">
              {AD_LEAD_LENS_OPTIONS.find((option) => option.value === lens)?.hint}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]"
              role="group"
              aria-label="리드 렌즈"
            >
              {AD_LEAD_LENS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setLens(option.value)
                    setTrackingKey(null)
                  }}
                  aria-pressed={lens === option.value}
                  className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition ${
                    lens === option.value
                      ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      : "text-[#615D59]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div
              className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]"
              role="group"
              aria-label="리드 기간"
            >
              {AD_LEAD_PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPeriod(option.value)}
                  aria-pressed={period === option.value}
                  className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition ${
                    period === option.value
                      ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      : "text-[#615D59]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4]"
            >
              <Upload className="h-3.5 w-3.5" />
              가져오기
            </button>
            <CampaignExportButton
              columns={[...AD_LEAD_CSV_COLUMNS]}
              rows={buildCsvRows}
              rowCount={rows.length}
              filename="ad-leads"
              label="리드 CSV"
              disabled={loading}
            />
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              aria-label="광고 리드 새로고침"
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[13px] text-[#B43E3E]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 통계 스트립 — 카드를 겹치지 않고 한 카드 안에서 divide로만 구분한다. */}
      <div className="grid grid-cols-2 divide-y divide-[#f0f0ec] rounded-2xl border border-[#e8e8e4] bg-white sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6 [&>*:not(:first-child)]:border-l [&>*:not(:first-child)]:border-[#f0f0ec]">
        <StatCell
          label="리드"
          value={KRW.format(stats.total)}
          hint={`${AD_LEAD_PERIOD_OPTIONS.find((o) => o.value === period)?.label} 기준`}
          loading={loading}
        />
        <StatCell
          label="전환"
          value={KRW.format(stats.converted)}
          hint={stats.convRate != null ? `전환율 ${Math.round(stats.convRate * 100)}%` : "전환율 —"}
          tone={stats.converted > 0 ? "success" : "neutral"}
          loading={loading}
        />
        <StatCell
          label="전환 대상"
          value={KRW.format(stats.convertible)}
          hint={`신규 ${stats.newCount} · 연락중 ${stats.contacted}`}
          loading={loading}
        />
        <StatCell
          label="미확인"
          value={KRW.format(stats.unconfirmed)}
          hint="공개 채널 · 검토 전"
          tone={stats.unconfirmed > 0 ? "warn" : "neutral"}
          loading={loading}
        />
        <StatCell
          label="실측 CPL"
          value={
            stats.cpl == null
              ? "—"
              : metaCurrency === "KRW"
                ? won(stats.cpl)
                : `${metaCurrency} ${stats.cpl.toFixed(2)}`
          }
          hint={
            stats.cpl != null
              ? "같은 기간 Meta 광고비 ÷ 목록 리드"
              : !periodMatchesMetaSpend
                ? "기간 불일치 — Meta 성과 기간과 맞추면 표시"
                : "Meta 광고비 연동 대기"
          }
          loading={loading}
        />
        <StatCell
          label="캠페인 태깅"
          value={stats.total > 0 ? `${Math.round((stats.campaignTagged / stats.total) * 100)}%` : "—"}
          hint={`${stats.campaignTagged}건에 캠페인 값 있음`}
          tone={stats.total > 0 && stats.campaignTagged < stats.total / 2 ? "warn" : "neutral"}
          loading={loading}
        />
      </div>

      {/* 트래킹 롤업 — "무엇이 이 리드를 만들었나". 행을 누르면 아래 목록이 그 키로 좁혀진다. */}
      <div className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3.5 sm:px-5">
        <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="inline-flex flex-wrap items-center gap-1.5">
            {TRACKING_DIMENSIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setDimension(item.key)
                  setTrackingKey(null)
                }}
                aria-pressed={dimension === item.key}
                className={`inline-flex h-[27px] items-center rounded-full px-2.5 text-[11.5px] font-medium transition-colors ${
                  dimension === item.key
                    ? "bg-[#111110] text-white"
                    : "border border-[#e8e8e4] bg-white text-[#111110] hover:border-[#c8c8c4]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="text-[10.5px] text-[#1a1a1a]/40">{activeDimensionHint}</span>
          <span className="ml-auto flex items-center gap-2">
            {trackedShare != null && (
              <span className="rounded-full bg-[#f0f0ec] px-2.5 py-0.5 text-[11px] text-[#1a1a1a]/55">
                귀속 {trackedShare}%
              </span>
            )}
            {trackingKey && (
              <button
                type="button"
                onClick={() => setTrackingKey(null)}
                className="text-[11.5px] font-medium text-[#084734] hover:underline"
              >
                필터 해제
              </button>
            )}
          </span>
        </div>

        {loading && rollup.rows.length === 0 ? (
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-4/5" />
          </div>
        ) : rollup.rows.length === 0 ? (
          <p className="rounded-xl bg-[#fafaf8] px-3 py-6 text-center text-[12.5px] text-[#1a1a1a]/35">
            이 축으로 기록된 리드가 없습니다.
          </p>
        ) : (
          <div className="divide-y divide-[#f0f0ec]">
            {rollup.rows.slice(0, rollupVisible.visible).map((row) => {
              const active = trackingKey === row.key
              const share = rollup.rows[0]?.total ? Math.round((row.total / rollup.rows[0].total) * 100) : 0
              const label = dimension === "magnet" ? getLeadMagnetLabel(row.label) || row.label : row.label
              return (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => setTrackingKey(active ? null : row.key)}
                  aria-pressed={active}
                  className={`relative flex w-full items-center justify-between gap-3 overflow-hidden px-2 py-2 text-left transition-colors ${
                    active ? "bg-[#ECFDF5]" : "hover:bg-[#fafaf8]"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 ${active ? "bg-[#D7EBDD]/60" : "bg-[#f0f0ec]/70"}`}
                    style={{ width: `${share}%` }}
                  />
                  <span className="relative min-w-0 flex-1 truncate text-[12.5px] font-medium text-[#111110]">
                    {label}
                  </span>
                  <span className="relative flex shrink-0 items-center gap-3 text-[11px] text-[#1a1a1a]/45">
                    <span className={row.converted > 0 ? "font-medium text-[#084734]" : ""}>
                      전환 {row.converted}
                    </span>
                    <span className="w-[2.6rem] text-right tabular-nums">
                      {row.total > 0 ? `${Math.round(row.convRate * 100)}%` : "—"}
                    </span>
                    <span className="min-w-[2.2rem] text-right text-[13px] font-bold tabular-nums text-[#111110]">
                      {row.total}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="mt-2 flex flex-col items-center gap-1.5">
          {rollup.untrackedCount > 0 && (
            <p className="text-[10.5px] text-[#1a1a1a]/40">
              이 축에 값이 없는 리드 {KRW.format(rollup.untrackedCount)}건은 집계에서 빠집니다.
            </p>
          )}
          {(rollupVisible.canMore || rollupVisible.canCollapse) && (
            <ShowMore
              visible={rollupVisible.visible}
              total={rollup.rows.length}
              step={ROLLUP_STEP}
              onMore={rollupVisible.showMore}
              onCollapse={rollupVisible.canCollapse ? rollupVisible.collapse : undefined}
            />
          )}
        </div>
      </div>

      {/* 전환 결과 요약 — 단체 전환은 부분 성공이 흔하므로 성공/건너뜀/실패를 나눠 남긴다. */}
      {outcome && (
        <div
          className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-4 py-3 text-[12.5px] ${
            outcome.failed > 0
              ? "border-[#ECD29C] bg-[#FBF1E0] text-[#A8741A]"
              : "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]"
          }`}
        >
          {outcome.failed > 0 ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          <span className="font-semibold">
            전환 {outcome.converted}건
            {outcome.skipped > 0 ? ` · 건너뜀 ${outcome.skipped}건` : ""}
            {outcome.failed > 0 ? ` · 실패 ${outcome.failed}건` : ""}
          </span>
          {outcome.firstError && <span className="text-[11.5px] opacity-80">{outcome.firstError}</span>}
          {outcome.lastDealUrl && (
            <Link
              href={outcome.lastDealUrl}
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
            >
              거래로 이동
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOutcome(null)}
            className="ml-auto text-[11.5px] font-medium opacity-70 hover:opacity-100"
          >
            닫기
          </button>
        </div>
      )}

      {/* 목록 */}
      <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#f0f0ec] px-3 py-2.5 sm:px-4">
          <div className="inline-flex flex-wrap items-center gap-1.5">
            {AD_LEAD_STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatus(option.value)}
                aria-pressed={status === option.value}
                className={`inline-flex h-[27px] items-center rounded-full px-2.5 text-[11.5px] font-medium transition-colors ${
                  status === option.value
                    ? "bg-[#111110] text-white"
                    : "border border-[#e8e8e4] bg-white text-[#111110] hover:border-[#c8c8c4]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="relative ml-auto w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="학원·이름·캠페인·광고 검색"
              aria-label="광고 리드 검색"
              className="h-[30px] w-full rounded-lg border border-[#e8e8e4] bg-[#fafaf8] pl-8 pr-2.5 text-[12px] text-[#111110] outline-none focus:border-[#084734] focus:bg-white"
            />
          </label>
        </div>

        {/* 선택 바 — 선택이 있을 때만 뜬다(평소 목록 높이를 먹지 않게). */}
        {effectiveSelection.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-[#f0f0ec] bg-[#ECFDF5] px-3 py-2.5 sm:px-4">
            <span className="text-[12.5px] font-semibold text-[#084734]">
              {effectiveSelection.length}건 선택
            </span>
            <button
              type="button"
              onClick={handleBulkConvert}
              disabled={converting}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:opacity-60"
            >
              {converting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
              {converting && convertProgress
                ? `전환 중 ${convertProgress.done}/${convertProgress.total}`
                : "선택 단체 전환"}
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={converting}
              className="text-[11.5px] font-medium text-[#084734] hover:underline disabled:opacity-60"
            >
              선택 해제
            </button>
          </div>
        )}

        {/* header + rows — 6열 고정 그리드는 좁은 화면에서 잘리므로 가로 스크롤 컨테이너로 감싼다. */}
        <div className="overflow-x-auto">
        <div className="min-w-[560px]">
        <div className="grid grid-cols-[28px_44px_minmax(0,1.4fr)_minmax(0,1.6fr)_64px_60px] items-center gap-2 border-b border-[#f0f0ec] bg-[#fafaf8] px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-[#1a1a1a]/40 sm:px-4">
          <span className="flex items-center">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={selectableIds.length === 0 || converting}
              aria-label="현재 목록의 전환 대상 모두 선택"
              className="h-3.5 w-3.5 accent-[#084734]"
            />
          </span>
          <span>유입</span>
          <span>학원 · 이름</span>
          <span>채널 · 캠페인</span>
          <span className="text-center">상태</span>
          <span className="text-right">전환</span>
        </div>

        {loading && rows.length === 0 ? (
          <div className="divide-y divide-[#f0f0ec]">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="px-3 py-2.5 sm:px-4">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-[12.5px] text-[#1a1a1a]/35">
            조건에 맞는 리드가 없습니다.
          </p>
        ) : (
          <div className="divide-y divide-[#f0f0ec]">
            {rows.slice(0, rowsVisible.visible).map((lead) => {
              const convertible = isConvertibleLead(lead)
              const campaign = getLeadCampaignLabel(lead)
              const ad = getLeadAdLabel(lead)
              const group = getLeadSourceGroup(lead)
              return (
                <div
                  key={lead.id}
                  className="grid grid-cols-[28px_44px_minmax(0,1.4fr)_minmax(0,1.6fr)_64px_60px] items-center gap-2 px-3 py-2 hover:bg-[#fafaf8] sm:px-4"
                >
                  <span className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                      disabled={!convertible || converting}
                      aria-label={`${lead.org || lead.name || lead.id} 선택`}
                      className="h-3.5 w-3.5 accent-[#084734] disabled:opacity-30"
                    />
                  </span>
                  <span className="text-[11px] tabular-nums text-[#1a1a1a]/45">
                    {formatLeadDate(lead.timestamp)}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: SOURCE_GROUP_DOT[group] }}
                    />
                    <Link
                      href={`/admin/crm/customers/leads?q=${encodeURIComponent(lead.org || lead.name || lead.email || lead.id)}`}
                      className="min-w-0 truncate text-[12.5px] font-medium text-[#111110] hover:underline"
                      title={[lead.org, lead.name, lead.phone, lead.email].filter(Boolean).join(" · ")}
                    >
                      {lead.org || lead.name || lead.email || lead.phone || "이름 없는 리드"}
                    </Link>
                    {lead.org && lead.name ? (
                      <span className="shrink-0 text-[11px] text-[#1a1a1a]/40">{lead.name}</span>
                    ) : null}
                  </span>
                  <span className="min-w-0 truncate text-[11.5px] text-[#1a1a1a]/55">
                    <span className="text-[#1a1a1a]/40">{getLeadChannelLabel(lead)}</span>
                    {campaign ? <span className="text-[#111110]"> · {campaign}</span> : null}
                    {ad ? <span className="text-[#1a1a1a]/45"> · {ad}</span> : null}
                  </span>
                  <span className="flex justify-center">
                    <span
                      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${
                        STATUS_TONE[lead.status] ?? STATUS_TONE.new
                      }`}
                    >
                      {STATUS_TEXT[lead.status] ?? lead.status}
                    </span>
                  </span>
                  <span className="flex justify-end">
                    {convertible ? (
                      <button
                        type="button"
                        onClick={() => void runConvert([lead.id])}
                        disabled={converting}
                        className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1 text-[11px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        전환
                      </button>
                    ) : (
                      <span className="text-[11px] text-[#A39E98]">—</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        </div>
        </div>

        <div className="flex flex-col items-center gap-1.5 px-3 py-2.5">
          <p className="text-[10.5px] text-[#1a1a1a]/40">
            {KRW.format(rows.length)}건 표시
            {hiddenTestCount > 0 && (
              <>
                {" · "}
                테스트 리드 {hiddenTestCount}건 숨김{" "}
                <button
                  type="button"
                  onClick={() => setIncludeTestLeads(true)}
                  className="font-medium text-[#084734] hover:underline"
                >
                  보기
                </button>
              </>
            )}
            {includeTestLeads && (
              <>
                {" · "}
                테스트 리드 포함{" "}
                <button
                  type="button"
                  onClick={() => setIncludeTestLeads(false)}
                  className="font-medium text-[#084734] hover:underline"
                >
                  숨기기
                </button>
              </>
            )}
          </p>
          {(rowsVisible.canMore || rowsVisible.canCollapse) && (
            <ShowMore
              visible={rowsVisible.visible}
              total={rows.length}
              step={ROW_STEP}
              onMore={rowsVisible.showMore}
              onCollapse={rowsVisible.canCollapse ? rowsVisible.collapse : undefined}
            />
          )}
        </div>
      </div>

      <AdLeadImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={onRefresh} />
    </div>
  )
}
