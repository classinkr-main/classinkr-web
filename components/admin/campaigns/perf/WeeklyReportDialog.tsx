"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react"
import { adminFetchJsonCached } from "@/lib/admin-client"
import { ANOMALY_KIND_LABEL, type AnomalyKind } from "@/lib/marketing/anomaly"
import type { PerfKpi } from "@/lib/marketing/perf"
import type {
  WeeklyAdLeadCampaignRow,
  WeeklyAdLeadDailyPoint,
  WeeklyAdLeadReport,
} from "@/lib/marketing/weekly-report"

interface WeeklyReportResponse {
  report: WeeklyAdLeadReport
  source: "stored" | "live"
}

const REPORT_TTL_MS = 60_000
const TOP_CAMPAIGN_COUNT = 3
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "details > summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

const WEEKDAY = new Intl.DateTimeFormat("ko-KR", {
  weekday: "short",
  timeZone: "UTC",
})
const MONTH_DAY = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
})

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`)
}

function formatDate(value: string): string {
  const date = parseIsoDate(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date)
}

function formatDay(value: string): { weekday: string; date: string } {
  const date = parseIsoDate(value)
  if (Number.isNaN(date.getTime())) return { weekday: value, date: "" }
  return {
    weekday: WEEKDAY.format(date),
    date: MONTH_DAY.format(date).replace(/\.$/, ""),
  }
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(date)
}

function usd(value: number | null): string {
  return value == null
    ? "—"
    : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function count(value: number | null): string {
  return value == null ? "—" : value.toLocaleString("ko-KR")
}

function pct(value: number | null): string {
  return value == null ? "—" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`
}

function Delta({ kpi, lowerIsBetter = false }: { kpi: PerfKpi; lowerIsBetter?: boolean }) {
  if (kpi.deltaPct == null) {
    return <span className="text-[#A39E98]">직전 주 대비 —</span>
  }
  const improved = lowerIsBetter ? kpi.deltaPct < 0 : kpi.deltaPct > 0
  const tone =
    kpi.deltaPct === 0 ? "text-[#615D59]" : improved ? "text-[#084734]" : "text-[#B43E3E]"
  return (
    <span className={tone}>
      직전 주 대비 {kpi.deltaPct > 0 ? "+" : ""}
      {kpi.deltaPct}%
    </span>
  )
}

function LeadHero({ kpi }: { kpi: PerfKpi }) {
  return (
    <section className="rounded-xl border border-[#BDEFD8] bg-[#ECFDF5] p-5 sm:p-6">
      <p className="text-[11px] font-semibold text-[#084734]">광고 리드 · CRM</p>
      <div className="mt-2 flex items-end gap-1.5">
        <p className="text-[38px] font-semibold leading-none tabular-nums tracking-[-0.045em] text-[#111110] sm:text-[44px]">
          {count(kpi.value)}
        </p>
        <span className="pb-1 text-[14px] font-medium text-[#615D59]">건</span>
      </div>
      <p className="mt-3 text-[11px] font-semibold tabular-nums">
        <Delta kpi={kpi} />
      </p>
    </section>
  )
}

function CompactMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: ReactNode
}) {
  return (
    <div className="min-w-0 border-b border-[rgba(0,0,0,0.08)] py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:px-4 sm:py-1 sm:first:pl-0 sm:last:border-r-0">
      <p className="text-[10.5px] font-medium text-[#615D59]">{label}</p>
      <p className="mt-1 text-[20px] font-semibold tabular-nums tracking-[-0.025em] text-[#111110]">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-medium tabular-nums text-[#615D59]">{detail}</p>
    </div>
  )
}

function DailyLeadRhythm({
  points,
  weekendLeads,
  weekendSharePct,
}: {
  points: WeeklyAdLeadDailyPoint[]
  weekendLeads: number | null
  weekendSharePct: number | null
}) {
  if (points.length === 0) {
    return (
      <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 sm:p-5">
        <h3 className="text-[13px] font-semibold text-[#111110]">요일별 광고 리드</h3>
        <p className="mt-4 text-[12px] text-[#A39E98]">요일별 CRM 리드를 측정하지 못했습니다.</p>
      </section>
    )
  }

  const maxLeads = Math.max(1, ...points.map((point) => point.leads))
  const description = points
    .map((point) => `${formatDay(point.date).weekday} ${point.leads}건`)
    .join(", ")

  return (
    <section
      className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 sm:p-5"
      aria-labelledby="weekly-lead-rhythm-title"
      aria-describedby="weekly-lead-rhythm-description"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="weekly-lead-rhythm-title" className="text-[13px] font-semibold text-[#111110]">
            요일별 광고 리드
          </h3>
          <p className="mt-0.5 text-[10.5px] text-[#615D59]">
            CRM Meta 리드폼 기준 · 숫자는 실제 건수
          </p>
        </div>
        <p className="text-right text-[11px] font-semibold tabular-nums text-[#084734]">
          주말 {count(weekendLeads)}건
          {weekendSharePct != null ? ` · 전체의 ${pct(weekendSharePct)}` : ""}
        </p>
      </div>

      <p id="weekly-lead-rhythm-description" className="sr-only">
        {description}
      </p>
      <ol className="mt-4 grid grid-cols-7 gap-1.5" aria-label="월요일부터 일요일까지 광고 리드 수">
        {points.map((point) => {
          const day = formatDay(point.date)
          const barHeight = point.leads > 0 ? Math.max(12, (point.leads / maxLeads) * 100) : 2
          return (
            <li
              key={point.date}
              className={
                point.isWeekend
                  ? "flex min-w-0 flex-col rounded-lg bg-[#F6F5F4] px-1.5 py-2"
                  : "flex min-w-0 flex-col rounded-lg px-1.5 py-2"
              }
              aria-label={`${day.weekday} ${day.date}, 광고 리드 ${point.leads}건${point.isWeekend ? ", 주말" : ""}`}
            >
              <p className="text-center text-[10px] font-semibold text-[#615D59]">{day.weekday}</p>
              <p className="mt-1 text-center text-[15px] font-semibold tabular-nums text-[#111110]">
                {point.leads}
              </p>
              <div className="mt-2 flex h-16 items-end justify-center" aria-hidden>
                <div
                  className={
                    point.isWeekend
                      ? "w-full max-w-7 rounded-sm bg-[#A8741A]"
                      : "w-full max-w-7 rounded-sm bg-[#084734]"
                  }
                  style={{ height: `${barHeight}%` }}
                />
              </div>
              <p className="mt-1 truncate text-center text-[9px] tabular-nums text-[#A39E98]">
                {day.date}
              </p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function CampaignHighlights({ campaigns }: { campaigns: WeeklyAdLeadCampaignRow[] }) {
  const top = campaigns.slice(0, TOP_CAMPAIGN_COUNT)
  if (top.length === 0) {
    return (
      <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 sm:p-5">
        <h3 className="text-[13px] font-semibold text-[#111110]">캠페인 TOP 3</h3>
        <p className="mt-4 text-[12px] text-[#A39E98]">기간 내 측정된 연결 캠페인이 없습니다.</p>
      </section>
    )
  }

  const maxLeads = Math.max(1, ...top.map((campaign) => campaign.leads))
  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-[#111110]">캠페인 TOP 3</h3>
          <p className="mt-0.5 text-[10.5px] text-[#615D59]">Meta 플랫폼 귀속 리드 기준</p>
        </div>
        <Link
          href="/admin/campaigns?tab=meta"
          className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#084734] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
        >
          광고 화면 <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>

      <ol className="mt-4 space-y-3">
        {top.map((campaign, index) => {
          const anomaly = campaign.anomalies
            .map((kind) => ANOMALY_KIND_LABEL[kind as AnomalyKind] ?? kind)
            .join(", ")
          return (
            <li
              key={campaign.campaignId}
              className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2.5"
            >
              <span className="pt-0.5 text-[11px] font-semibold tabular-nums text-[#A39E98]">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11.5px] font-semibold text-[#111110]">
                  {campaign.name}
                </p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#F0F0EC]" aria-hidden>
                  <div
                    className="h-full rounded-full bg-[#084734]"
                    style={{
                      width: `${Math.max(4, (campaign.leads / maxLeads) * 100)}%`,
                    }}
                  />
                </div>
                {anomaly ? (
                  <p className="mt-1 text-[9.5px] font-medium text-[#B43E3E]">{anomaly}</p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-[13px] font-semibold tabular-nums text-[#111110]">
                  {count(campaign.leads)}건
                </p>
                <p className="mt-0.5 text-[9.5px] tabular-nums text-[#615D59]">
                  CPL {usd(campaign.cplUsd)}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function DetailedReport({
  report,
  source,
}: {
  report: WeeklyAdLeadReport
  source: WeeklyReportResponse["source"]
}) {
  return (
    <details className="group rounded-xl border border-[rgba(0,0,0,0.08)] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[12px] font-semibold text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] sm:px-5">
        상세 데이터 보기
        <ChevronDown
          className="h-4 w-4 text-[#615D59] transition group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-5 border-t border-[rgba(0,0,0,0.08)] px-4 py-5 sm:px-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-lg bg-[#F6F5F4] p-4">
            <h4 className="text-[11px] font-semibold text-[#111110]">광고 반응 · Meta</h4>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[#615D59]">
              <strong className="text-[17px] tabular-nums text-[#111110]">
                {count(report.funnel.impressions)}
              </strong>
              <span>노출</span>
              <span aria-hidden>→</span>
              <strong className="text-[17px] tabular-nums text-[#111110]">
                {count(report.funnel.clicks)}
              </strong>
              <span>클릭</span>
            </div>
            <p className="mt-2 text-[10.5px] text-[#615D59]">CTR {pct(report.funnel.ctrPct)}</p>
          </section>
          <section className="rounded-lg bg-[#F6F5F4] p-4">
            <h4 className="text-[11px] font-semibold text-[#111110]">리드 운영 · CRM</h4>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[#615D59]">
              <strong className="text-[17px] tabular-nums text-[#111110]">
                {count(report.funnel.adLeads)}
              </strong>
              <span>리드</span>
              <span aria-hidden>→</span>
              <strong className="text-[17px] tabular-nums text-[#111110]">
                {count(report.funnel.contacted)}
              </strong>
              <span>접촉</span>
              <span aria-hidden>→</span>
              <strong className="text-[17px] tabular-nums text-[#111110]">
                {count(report.funnel.convertedLeads)}
              </strong>
              <span>전환</span>
            </div>
            <p className="mt-2 text-[10.5px] text-[#615D59]">
              접촉률 {pct(report.funnel.contactRatePct)}
            </p>
          </section>
        </div>

        <section>
          <h4 className="text-[12px] font-semibold text-[#111110]">전체 캠페인 성과</h4>
          {report.campaigns.length === 0 ? (
            <p className="mt-3 text-[11px] text-[#A39E98]">표시할 캠페인이 없습니다.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead className="border-b border-[rgba(0,0,0,0.08)] text-[10px] font-semibold text-[#615D59]">
                  <tr>
                    <th className="pb-2 pr-3">캠페인</th>
                    <th className="px-3 pb-2 text-right">리드</th>
                    <th className="px-3 pb-2 text-right">광고비</th>
                    <th className="px-3 pb-2 text-right">CPL</th>
                    <th className="pb-2 pl-3">신호</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0EC] text-[11.5px]">
                  {report.campaigns.map((campaign) => (
                    <tr key={campaign.campaignId}>
                      <td className="max-w-[260px] truncate py-2.5 pr-3 font-medium text-[#111110]">
                        {campaign.name}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {count(campaign.leads)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {usd(campaign.spendUsd)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {usd(campaign.cplUsd)}
                      </td>
                      <td className="py-2.5 pl-3 text-[#B43E3E]">
                        {campaign.anomalies.length > 0
                          ? campaign.anomalies
                              .map((kind) => ANOMALY_KIND_LABEL[kind as AnomalyKind] ?? kind)
                              .join(", ")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h4 className="text-[11px] font-semibold text-[#111110]">데이터 기준</h4>
          <ul className="mt-2 space-y-1 text-[10.5px] leading-relaxed text-[#615D59]">
            {report.dataCaveats.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] tabular-nums text-[#A39E98]">
            {source === "stored" ? "주간 자동 생성본" : "원천 데이터 즉시 생성본"} ·{" "}
            {formatGeneratedAt(report.generatedAt)} 생성
          </p>
        </section>
      </div>
    </details>
  )
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const input = document.createElement("textarea")
  input.value = value
  input.style.position = "fixed"
  input.style.opacity = "0"
  document.body.appendChild(input)
  input.select()
  const copied = document.execCommand("copy")
  document.body.removeChild(input)
  if (!copied) throw new Error("클립보드 복사 실패")
}

function downloadMarkdown(report: WeeklyAdLeadReport) {
  const blob = new Blob([`\uFEFF${report.markdown}`], {
    type: "text/markdown;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `marketing-lead-weekly-${report.period.since}_${report.period.until}.md`
  anchor.rel = "noopener"
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function WeeklyReportDialog() {
  const [open, setOpen] = useState(false)
  const [response, setResponse] = useState<WeeklyReportResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)

  const load = useCallback(async ({ fresh = false }: { fresh?: boolean } = {}) => {
    setLoading(true)
    setError(null)
    setCopyState("idle")
    try {
      const url = `/api/admin/marketing/weekly-report${fresh ? "?fresh=1" : ""}`
      const next = await adminFetchJsonCached<WeeklyReportResponse>(url, undefined, {
        ttlMs: REPORT_TTL_MS,
        cacheKey: "marketing-weekly-report",
        force: fresh,
        staleIfError: !fresh,
      })
      setResponse(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "주간 보고서를 만들지 못했습니다")
    } finally {
      setLoading(false)
    }
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  const show = useCallback(() => {
    setOpen(true)
    if (!response && !loading) void load()
  }, [load, loading, response])

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const frame = requestAnimationFrame(() => {
      dialog?.querySelector<HTMLElement>("[data-autofocus]")?.focus()
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== "Tab" || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [close, open])

  async function handleCopy() {
    if (!response) return
    try {
      await copyText(response.report.markdown)
      setCopyState("copied")
    } catch {
      setCopyState("failed")
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={show}
        className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
      >
        <FileText className="h-3.5 w-3.5" aria-hidden />
        주간 보고서
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="weekly-report-title"
            aria-describedby={response ? "weekly-report-summary" : undefined}
            aria-busy={loading}
            className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] shadow-2xl sm:max-h-[88vh] sm:rounded-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[rgba(0,0,0,0.08)] bg-white px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#084734]">
                    Weekly report
                  </p>
                  {response ? (
                    <span
                      className={
                        response.report.dataStatus === "confirmed"
                          ? "border-l-2 border-[#084734] pl-2 text-[10px] font-semibold text-[#084734]"
                          : "border-l-2 border-[#A8741A] pl-2 text-[10px] font-semibold text-[#7A520F]"
                      }
                    >
                      {response.report.dataStatus === "confirmed" ? "확정 데이터" : "잠정 데이터"}
                    </span>
                  ) : null}
                </div>
                <h2
                  id="weekly-report-title"
                  className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-[#111110]"
                >
                  마케팅 광고 리드 주간 보고서
                </h2>
                {response ? (
                  <p className="mt-1 text-[11.5px] text-[#615D59]">
                    {formatDate(response.report.period.since)} ~{" "}
                    {formatDate(response.report.period.until)} · 월~일 완료 주간
                  </p>
                ) : null}
              </div>
              <button
                data-autofocus
                type="button"
                onClick={close}
                aria-label="주간 보고서 닫기"
                className="rounded-md p-1.5 text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {loading && !response ? (
                <div className="flex min-h-72 items-center justify-center gap-2 text-[13px] text-[#615D59]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#084734]" aria-hidden />
                  완료 주간 데이터를 집계하고 있습니다…
                </div>
              ) : error && !response ? (
                <div className="flex min-h-72 flex-col items-center justify-center text-center">
                  <p className="text-[14px] font-semibold text-[#111110]">
                    보고서를 만들지 못했습니다
                  </p>
                  <p className="mt-1 max-w-md text-[12px] leading-relaxed text-[#B43E3E]">
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={() => void load({ fresh: true })}
                    className="mt-4 rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[#065c41] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                  >
                    다시 시도
                  </button>
                </div>
              ) : response ? (
                <div className={loading ? "space-y-4 opacity-60" : "space-y-4"}>
                  {error ? (
                    <p
                      role="alert"
                      className="rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[11.5px] text-[#8F2C2C]"
                    >
                      최신 데이터 재생성에 실패해 이전 보고서를 유지합니다 — {error}
                    </p>
                  ) : null}

                  <section
                    className={
                      response.report.dataStatus === "confirmed"
                        ? "rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 sm:p-5"
                        : "rounded-xl border border-[#ECD29C] bg-[#FBF1E0] p-4 sm:p-5"
                    }
                  >
                    <p
                      id="weekly-report-summary"
                      className="text-[14px] font-semibold leading-relaxed tracking-[-0.01em] text-[#111110] sm:text-[15px]"
                    >
                      {response.report.summary}
                    </p>
                    <p className="mt-2 text-[10.5px] tabular-nums text-[#615D59]">
                      Meta 집계 완료일{" "}
                      {response.report.metaDataThrough
                        ? formatDate(response.report.metaDataThrough)
                        : "미확인"}
                      {response.report.snapshotAt
                        ? ` · ${formatGeneratedAt(response.report.snapshotAt)} 동기화`
                        : ""}
                    </p>
                  </section>

                  <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.72fr)_minmax(0,1.28fr)]">
                    <LeadHero kpi={response.report.kpis.adLeads} />
                    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-1 sm:flex sm:items-center sm:px-5">
                      <CompactMetric
                        label="Meta 광고비 · USD"
                        value={usd(response.report.kpis.spendUsd.value)}
                        detail={<Delta kpi={response.report.kpis.spendUsd} />}
                      />
                      <CompactMetric
                        label="CPL · USD"
                        value={usd(response.report.kpis.cplUsd.value)}
                        detail={<Delta kpi={response.report.kpis.cplUsd} lowerIsBetter />}
                      />
                      <CompactMetric
                        label="미접촉 리드"
                        value={`${count(response.report.uncontactedLeads)}건`}
                        detail={`접촉률 ${pct(response.report.funnel.contactRatePct)}`}
                      />
                    </section>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
                    <DailyLeadRhythm
                      points={response.report.dailyLeads}
                      weekendLeads={response.report.weekendLeads}
                      weekendSharePct={response.report.weekendSharePct}
                    />
                    <section className="rounded-xl border border-[#BDEFD8] bg-white p-4 sm:p-5">
                      <h3 className="text-[13px] font-semibold text-[#084734]">지금 처리할 일</h3>
                      <ol className="mt-3 space-y-3">
                        {response.report.actions.map((action, index) => (
                          <li
                            key={action}
                            className="flex gap-2.5 text-[11.5px] leading-relaxed text-[#111110]"
                          >
                            <span className="mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center border-l-2 border-[#084734] text-[9px] font-bold text-[#084734]">
                              {index + 1}
                            </span>
                            <span>{action}</span>
                          </li>
                        ))}
                      </ol>
                      <Link
                        href="/admin/campaigns?tab=meta"
                        className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold text-[#084734] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                      >
                        광고 리드 확인 <ArrowUpRight className="h-3 w-3" aria-hidden />
                      </Link>
                    </section>
                  </div>

                  <CampaignHighlights campaigns={response.report.campaigns} />
                  <DetailedReport report={response.report} source={response.source} />
                </div>
              ) : null}
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-[rgba(0,0,0,0.08)] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <button
                type="button"
                onClick={() => void load({ fresh: true })}
                disabled={loading}
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] font-semibold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] disabled:opacity-50"
              >
                <RefreshCw
                  className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
                  aria-hidden
                />
                최신 데이터로 다시 만들기
              </button>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                <button
                  type="button"
                  onClick={() => response && downloadMarkdown(response.report)}
                  disabled={!response || loading}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[11.5px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden /> Markdown
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  disabled={!response || loading}
                  aria-live="polite"
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-[#084734] px-3 py-1.5 text-[11.5px] font-bold text-white transition hover:bg-[#065c41] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] disabled:opacity-50"
                >
                  {copyState === "copied" ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {copyState === "copied"
                    ? "복사됨"
                    : copyState === "failed"
                      ? "복사 실패"
                      : "보고서 복사"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  )
}
