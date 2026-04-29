"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Mail,
  Plus,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  Wallet,
  X,
  Trash2,
} from "lucide-react"
import AdminMarketingPage from "../marketing/page"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { adminFetch, adminFetchJson } from "@/lib/admin-client"
import type { LeadRecord } from "@/lib/db"
import type { PublicEvent, EventStatus } from "@/lib/types/public-events"
import {
  AD_CHANNEL_COLOR,
  AD_CHANNEL_LABEL,
  computeEconomics,
  DEFAULT_EVENT_METRICS,
  type AdChannel,
  type AdSpendEntry,
  type EventFunnel,
  type EventMetrics,
} from "@/lib/types/event-metrics"

// ─── helpers ──────────────────────────────────────────────────────────────────

const KRW = new Intl.NumberFormat("ko-KR")
const cny = (n: number | null | undefined) => (n == null ? "—" : `¥${KRW.format(Math.round(n))}`)
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`)

function statusTone(status: EventStatus): string {
  switch (status) {
    case "진행 중":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "예정":
      return "bg-blue-50 text-blue-700 border-blue-200"
    case "마감":
      return "bg-[#f0f0ec] text-[#1a1a1a]/40 border-[#e8e8e4]"
  }
}

function formatRange(startsAt: string, endsAt: string | null) {
  const s = new Date(startsAt)
  const sLabel = `${s.getMonth() + 1}/${s.getDate()}`
  if (!endsAt) return sLabel
  const e = new Date(endsAt)
  const eLabel = `${e.getMonth() + 1}/${e.getDate()}`
  return `${sLabel} ~ ${eLabel}`
}

function leadsInRange(leads: LeadRecord[], start: string, end: string | null): LeadRecord[] {
  const startMs = new Date(start).getTime()
  const endMs = end ? new Date(end).getTime() : Date.now()
  return leads.filter((l) => {
    const t = new Date(l.timestamp).getTime()
    return t >= startMs && t <= endMs
  })
}

// ─── attribution: 행사 ↔ 리드 ──────────────────────────────────────────────────
//   1) source/notes 필드에 event:<id> 또는 event:<slug> 토큰이 있으면 우선 매칭
//   2) 그 외에는 행사 기간 내 발생한 리드를 보조 집계로 사용
function attributedLeads(leads: LeadRecord[], event: PublicEvent): LeadRecord[] {
  const tokenId = `event:${event.id}`.toLowerCase()
  const tokenSlug = event.slug ? `event:${event.slug}`.toLowerCase() : null
  return leads.filter((l) => {
    const haystack = `${l.source ?? ""} ${l.notes ?? ""}`.toLowerCase()
    if (haystack.includes(tokenId)) return true
    if (tokenSlug && haystack.includes(tokenSlug)) return true
    return false
  })
}

function buildFunnel(
  event: PublicEvent,
  metrics: EventMetrics,
  attributedCount: number,
  duringCount: number
): EventFunnel {
  // 명시적 매칭이 있으면 그것을, 없으면 기간 내 리드를 fallback
  const leads = attributedCount > 0 ? attributedCount : duringCount
  return {
    impressions: metrics.impressionsCount ?? 0,
    leads,
    applications: metrics.applicationsCount ?? 0,
    qualifiedLeads: metrics.qualifiedLeadsCount ?? 0,
    attendees: metrics.attendeesCount ?? 0,
    deals: metrics.dealsCount ?? 0,
  }
}

// ─── sub-tabs ─────────────────────────────────────────────────────────────────

type CampaignTab = "summary" | "events" | "email"

const CAMPAIGN_TABS: Array<{ id: CampaignTab; label: string; sub: string }> = [
  { id: "summary", label: "요약", sub: "KPI · 타임라인 · 채널 분포" },
  { id: "events", label: "행사", sub: "행사별 깔때기 · 광고 효율" },
  { id: "email", label: "이메일", sub: "구독자 · 이메일 발송 · 이력" },
]

// ─── period filter ────────────────────────────────────────────────────────────

type Period = "active" | "30d" | "90d" | "all"

function eventInPeriod(event: PublicEvent, period: Period): boolean {
  if (period === "all") return true
  if (period === "active") return event.status === "진행 중" || event.status === "예정"
  const days = period === "30d" ? 30 : 90
  const cutoff = Date.now() - days * 24 * 3600 * 1000
  const end = event.endsAt ? new Date(event.endsAt).getTime() : new Date(event.startsAt).getTime()
  return end >= cutoff
}

// ─── UI primitives ────────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  tone?: "neutral" | "success" | "warn"
}) {
  const accent =
    tone === "success"
      ? "bg-[#ECFDF5] text-[#084734]"
      : tone === "warn"
        ? "bg-[#FEF3EE] text-[#B85C33]"
        : "bg-[#f0f0ec] text-[#1a1a1a]/55"
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <span className={`inline-flex rounded-xl p-2 ${accent}`}>{icon}</span>
      <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">{label}</p>
      <p className="mt-1.5 text-[22px] font-bold leading-none tracking-[-0.02em] text-[#111110]">{value}</p>
      {hint && <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">{hint}</p>}
    </div>
  )
}

function FunnelStage({
  label,
  value,
  prevValue,
  tone = "neutral",
}: {
  label: string
  value: number
  prevValue?: number | null
  tone?: "neutral" | "primary"
}) {
  const rate =
    prevValue != null && prevValue > 0 && value > 0 ? Math.round((value / prevValue) * 100) : null
  const bar =
    prevValue != null && prevValue > 0
      ? Math.max(8, Math.min(100, Math.round((value / prevValue) * 100)))
      : value > 0
        ? 100
        : 8
  const accent = tone === "primary" ? "bg-[#084734]" : "bg-[#111110]"
  return (
    <div className="rounded-xl border border-[#e8e8e4] bg-white px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium text-[#1a1a1a]/50">{label}</p>
        {rate != null && (
          <span className="text-[10px] font-medium text-[#1a1a1a]/35">{rate}%</span>
        )}
      </div>
      <p className="mt-1 text-[18px] font-bold leading-none tracking-[-0.02em] text-[#111110]">
        {KRW.format(value)}
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#f0f0ec]">
        <div className={`h-full ${accent}`} style={{ width: `${bar}%` }} />
      </div>
    </div>
  )
}

// ─── timeline (calendar bar) ──────────────────────────────────────────────────

function TimelineRow({ events }: { events: PublicEvent[] }) {
  const now = new Date()
  // 표시 범위: 현재 월 ±2개월 (5개월)
  const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 3, 0)
  const totalMs = end.getTime() - start.getTime()
  const months: { label: string; left: number }[] = []
  for (let m = -2; m <= 2; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() + m, 1)
    months.push({
      label: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`,
      left: ((d.getTime() - start.getTime()) / totalMs) * 100,
    })
  }
  const todayLeft = Math.max(0, Math.min(100, ((now.getTime() - start.getTime()) / totalMs) * 100))

  const sorted = [...events].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  )

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-3 sm:px-6">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">캘린더 타임라인</h2>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">현재 월 ±2개월의 행사 진척 현황입니다.</p>
        </div>
        <Link
          href="/admin/calendar"
          className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110]"
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          전체 캘린더
        </Link>
      </div>

      <div className="relative px-4 pb-5 pt-4 sm:px-6">
        {/* month grid */}
        <div className="relative h-6 border-b border-dashed border-[#e8e8e4]">
          {months.map((m) => (
            <div
              key={m.label}
              className="absolute top-0 -translate-x-1/2 text-[10px] font-medium text-[#1a1a1a]/40"
              style={{ left: `${m.left}%` }}
            >
              {m.label}
            </div>
          ))}
          {/* today marker */}
          <div
            className="absolute top-0 h-full w-px bg-[#B85C33]"
            style={{ left: `${todayLeft}%` }}
          />
        </div>

        {sorted.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-[#1a1a1a]/30">표시할 행사가 없습니다.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {sorted.map((event) => {
              const s = new Date(event.startsAt).getTime()
              const e = event.endsAt ? new Date(event.endsAt).getTime() : s + 24 * 3600 * 1000
              const left = Math.max(0, ((s - start.getTime()) / totalMs) * 100)
              const right = Math.min(100, ((e - start.getTime()) / totalMs) * 100)
              const width = Math.max(4, right - left)
              const color =
                event.status === "진행 중"
                  ? "bg-[#084734]"
                  : event.status === "예정"
                    ? "bg-[#1a73e8]"
                    : "bg-[#84827a]"
              return (
                <div key={event.id} className="relative h-7">
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 rounded-md ${color} px-2 py-1 text-[11px] font-medium text-white truncate shadow-sm`}
                    style={{ left: `${left}%`, width: `${width}%`, minWidth: "60px" }}
                    title={`${event.title} · ${formatRange(event.startsAt, event.endsAt)}`}
                  >
                    {event.title}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── event card ───────────────────────────────────────────────────────────────

function EventFunnelCard({
  event,
  metrics,
  attributedLeadCount,
  duringLeadCount,
  onEdit,
}: {
  event: PublicEvent
  metrics: EventMetrics
  attributedLeadCount: number
  duringLeadCount: number
  onEdit: () => void
}) {
  const funnel = buildFunnel(event, metrics, attributedLeadCount, duringLeadCount)
  const economics = computeEconomics(funnel, metrics)

  const targetProgress =
    metrics.targetLeads != null && metrics.targetLeads > 0
      ? Math.min(100, Math.round((funnel.leads / metrics.targetLeads) * 100))
      : null

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      {/* header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone(event.status)}`}
            >
              {event.status}
            </span>
            <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/55">
              {event.category}
            </span>
            {event.tag && (
              <span className="rounded-full bg-[#FEF3EE] px-2 py-0.5 text-[11px] font-medium text-[#B85C33]">
                {event.tag}
              </span>
            )}
          </div>
          <h3 className="truncate text-[15px] font-bold tracking-[-0.01em] text-[#111110]">
            {event.title}
          </h3>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
            {formatRange(event.startsAt, event.endsAt)}
            {event.location ? ` · ${event.location}` : ""}
          </p>
        </div>
        <button
          onClick={onEdit}
          className="shrink-0 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/60 transition-colors hover:text-[#111110]"
        >
          성과 입력
        </button>
      </div>

      {/* economics row */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">광고비</p>
          <p className="mt-0.5 text-[14px] font-bold text-[#111110]">{cny(economics.adSpendTotal)}</p>
        </div>
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">매출</p>
          <p className="mt-0.5 text-[14px] font-bold text-[#111110]">{cny(economics.revenue)}</p>
        </div>
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">CPL</p>
          <p className="mt-0.5 text-[14px] font-bold text-[#111110]">{economics.cpl != null ? cny(economics.cpl) : "—"}</p>
        </div>
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">ROI</p>
          <p
            className={`mt-0.5 text-[14px] font-bold ${
              economics.roi == null
                ? "text-[#1a1a1a]/30"
                : economics.roi >= 0
                  ? "text-[#084734]"
                  : "text-[#B85C33]"
            }`}
          >
            {pct(economics.roi)}
          </p>
        </div>
      </div>

      {/* target progress */}
      {targetProgress != null && (
        <div className="mb-3 rounded-xl bg-[#ECFDF5] px-3 py-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-[#084734]">리드 목표 달성</span>
            <span className="text-[#084734]">
              {KRW.format(funnel.leads)} / {KRW.format(metrics.targetLeads ?? 0)} · {targetProgress}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
            <div className="h-full bg-[#084734]" style={{ width: `${targetProgress}%` }} />
          </div>
        </div>
      )}

      {/* funnel */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        <FunnelStage label="노출" value={funnel.impressions} />
        <FunnelStage label="리드" value={funnel.leads} prevValue={funnel.impressions || null} tone="primary" />
        <FunnelStage label="신청" value={funnel.applications} prevValue={funnel.leads || null} />
        <FunnelStage label="유효 리드" value={funnel.qualifiedLeads} prevValue={funnel.applications || null} />
        <FunnelStage label="참석" value={funnel.attendees} prevValue={funnel.applications || null} />
        <FunnelStage label="딜" value={funnel.deals} prevValue={funnel.qualifiedLeads || null} tone="primary" />
      </div>

      {/* sub metrics */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-lg border border-[#e8e8e4] px-2.5 py-1.5">
          <span className="text-[#1a1a1a]/40">유효 전환</span>
          <span className="ml-1 font-semibold text-[#111110]">{pct(economics.leadConversionRate)}</span>
        </div>
        <div className="rounded-lg border border-[#e8e8e4] px-2.5 py-1.5">
          <span className="text-[#1a1a1a]/40">참석률</span>
          <span className="ml-1 font-semibold text-[#111110]">{pct(economics.attendanceRate)}</span>
        </div>
        <div className="rounded-lg border border-[#e8e8e4] px-2.5 py-1.5">
          <span className="text-[#1a1a1a]/40">딜 전환</span>
          <span className="ml-1 font-semibold text-[#111110]">{pct(economics.dealConversionRate)}</span>
        </div>
      </div>

      {/* attribution hint */}
      {attributedLeadCount === 0 && duringLeadCount > 0 && (
        <p className="mt-3 text-[11px] text-[#1a1a1a]/40">
          ⓘ 행사 기간 내 리드 {duringLeadCount}건을 fallback 집계로 사용 중. 정확한 집계를 위해 리드의 source/notes에{" "}
          <code className="rounded bg-[#f0f0ec] px-1 font-mono text-[10px] text-[#111110]">
            event:{event.slug ?? event.id}
          </code>{" "}
          토큰을 추가하세요.
        </p>
      )}
    </div>
  )
}

// ─── metrics edit drawer ──────────────────────────────────────────────────────

function MetricsEditor({
  event,
  metrics,
  onClose,
  onSaved,
}: {
  event: PublicEvent
  metrics: EventMetrics
  onClose: () => void
  onSaved: (m: EventMetrics) => void
}) {
  const [form, setForm] = useState({
    targetLeads: metrics.targetLeads,
    targetRevenue: metrics.targetRevenue,
    impressionsCount: metrics.impressionsCount,
    applicationsCount: metrics.applicationsCount,
    qualifiedLeadsCount: metrics.qualifiedLeadsCount,
    attendeesCount: metrics.attendeesCount,
    dealsCount: metrics.dealsCount,
    dealsRevenue: metrics.dealsRevenue,
    notes: metrics.notes ?? "",
  })
  const [adSpend, setAdSpend] = useState<AdSpendEntry[]>(metrics.adSpendEntries ?? [])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const updateNum = (key: keyof typeof form, v: string) => {
    if (v === "") return update(key, null as never)
    const n = Number(v)
    if (Number.isFinite(n)) update(key, n as never)
  }

  async function handleSave() {
    setSaving(true)
    setErr(null)
    try {
      const saved = await adminFetchJson<EventMetrics>(
        `/api/admin/event-metrics/${event.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...form,
            notes: form.notes.trim() || null,
            adSpendEntries: adSpend,
          }),
        }
      )
      onSaved(saved)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setSaving(false)
    }
  }

  function addAdEntry() {
    setAdSpend((arr) => [...arr, { channel: "google", amount: 0, note: "" }])
  }
  function updateAdEntry(idx: number, patch: Partial<AdSpendEntry>) {
    setAdSpend((arr) => arr.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }
  function removeAdEntry(idx: number) {
    setAdSpend((arr) => arr.filter((_, i) => i !== idx))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">
              성과 입력
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-[#111110]">{event.title}</h2>
            <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">{formatRange(event.startsAt, event.endsAt)}</p>
          </div>
          <button onClick={onClose} className="text-[#1a1a1a]/40 hover:text-[#111110]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[calc(100dvh-9rem)] space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {err}
            </div>
          )}

          {/* 목표 */}
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
              목표
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumInput label="목표 리드 수" value={form.targetLeads} onChange={(v) => updateNum("targetLeads", v)} />
              <NumInput label="목표 매출 (KRW)" value={form.targetRevenue} onChange={(v) => updateNum("targetRevenue", v)} />
            </div>
          </section>

          {/* 깔때기 */}
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
              깔때기 단계
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumInput label="노출 수" value={form.impressionsCount} onChange={(v) => updateNum("impressionsCount", v)} />
              <NumInput label="신청자 수" value={form.applicationsCount} onChange={(v) => updateNum("applicationsCount", v)} />
              <NumInput label="유효 리드 수" value={form.qualifiedLeadsCount} onChange={(v) => updateNum("qualifiedLeadsCount", v)} />
              <NumInput label="참석자 수" value={form.attendeesCount} onChange={(v) => updateNum("attendeesCount", v)} />
              <NumInput label="딜 수" value={form.dealsCount} onChange={(v) => updateNum("dealsCount", v)} />
              <NumInput label="딜 매출 (KRW)" value={form.dealsRevenue} onChange={(v) => updateNum("dealsRevenue", v)} />
            </div>
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">
              ※ 리드 수는 리드 DB에서 자동 집계됩니다 (수동 입력 불필요).
            </p>
          </section>

          {/* 광고비 */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
                광고비 (채널별)
              </h3>
              <button
                onClick={addAdEntry}
                className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110]"
              >
                <Plus className="w-3 h-3" />
                채널 추가
              </button>
            </div>
            {adSpend.length === 0 ? (
              <p className="py-3 text-center text-[12px] text-[#1a1a1a]/30">
                채널을 추가하여 광고비를 입력하세요.
              </p>
            ) : (
              <div className="space-y-2">
                {adSpend.map((entry, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[110px_1fr_auto] items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-2 py-1.5 sm:grid-cols-[140px_1fr_1fr_auto]"
                  >
                    <select
                      value={entry.channel}
                      onChange={(e) => updateAdEntry(idx, { channel: e.target.value as AdChannel })}
                      className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px]"
                    >
                      {(Object.keys(AD_CHANNEL_LABEL) as AdChannel[]).map((c) => (
                        <option key={c} value={c}>
                          {AD_CHANNEL_LABEL[c]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="금액 (KRW)"
                      value={entry.amount === 0 ? "" : entry.amount}
                      onChange={(e) =>
                        updateAdEntry(idx, { amount: e.target.value === "" ? 0 : Number(e.target.value) })
                      }
                      className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px]"
                    />
                    <input
                      type="text"
                      placeholder="메모 (선택)"
                      value={entry.note ?? ""}
                      onChange={(e) => updateAdEntry(idx, { note: e.target.value })}
                      className="hidden rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px] sm:block"
                    />
                    <button
                      onClick={() => removeAdEntry(idx)}
                      className="rounded-md p-1.5 text-[#1a1a1a]/40 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 메모 */}
          <section>
            <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/55">메모</label>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={3}
              placeholder="회고, 학습, 다음 액션 메모"
              className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
            />
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#e8e8e4] px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-[#1a1a1a]/55 hover:text-[#111110]">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[#111110] px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#084734] disabled:opacity-40"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  )
}

function NumInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">{label}</label>
      <input
        type="number"
        value={value == null ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
      />
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function AdminCampaignsPage() {
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [metricsMap, setMetricsMap] = useState<Record<string, EventMetrics>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>("active")
  const [editing, setEditing] = useState<PublicEvent | null>(null)
  const [activeTab, setActiveTab] = useState<CampaignTab>("summary")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [evRes, leadRes, metRes] = await Promise.all([
        adminFetch("/api/admin/events"),
        adminFetch("/api/admin/leads"),
        adminFetch("/api/admin/event-metrics"),
      ])
      if (!evRes.ok) throw new Error("행사 목록 불러오기 실패")
      const ev = (await evRes.json()) as PublicEvent[]
      const ld = leadRes.ok ? ((await leadRes.json()) as { leads: LeadRecord[] }).leads : []
      const mt = metRes.ok ? ((await metRes.json()) as { metrics: Record<string, EventMetrics> }).metrics : {}
      setEvents(ev)
      setLeads(ld)
      setMetricsMap(mt)
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 로딩 실패")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(
    () => events.filter((ev) => eventInPeriod(ev, period)),
    [events, period]
  )

  // 집계 (전체 KPI)
  const aggregate = useMemo(() => {
    let totalSpend = 0
    let totalRevenue = 0
    let totalLeads = 0
    let totalDeals = 0
    let totalAttendees = 0
    const channelTotals: Record<AdChannel, number> = {
      google: 0,
      meta: 0,
      naver: 0,
      kakao: 0,
      youtube: 0,
      offline: 0,
      other: 0,
    }
    for (const ev of filtered) {
      const metrics = metricsMap[ev.id] ?? {
        ...DEFAULT_EVENT_METRICS,
        eventId: ev.id,
        updatedAt: "",
      }
      const attributed = attributedLeads(leads, ev).length
      const during = leadsInRange(leads, ev.startsAt, ev.endsAt).length
      const funnel = buildFunnel(ev, metrics, attributed, during)
      const econ = computeEconomics(funnel, metrics)
      totalSpend += econ.adSpendTotal
      totalRevenue += econ.revenue
      totalLeads += funnel.leads
      totalDeals += funnel.deals
      totalAttendees += funnel.attendees
      for (const e of metrics.adSpendEntries) channelTotals[e.channel] += e.amount
    }
    const avgCpl = totalLeads > 0 ? Math.round(totalSpend / totalLeads) : null
    const overallRoi = totalSpend > 0 ? Math.round(((totalRevenue - totalSpend) / totalSpend) * 100) : null
    return { totalSpend, totalRevenue, totalLeads, totalDeals, totalAttendees, avgCpl, overallRoi, channelTotals }
  }, [filtered, leads, metricsMap])

  const channelChartData = useMemo(
    () =>
      (Object.entries(aggregate.channelTotals) as [AdChannel, number][])
        .filter(([, v]) => v > 0)
        .map(([channel, value]) => ({
          channel,
          name: AD_CHANNEL_LABEL[channel],
          value,
          color: AD_CHANNEL_COLOR[channel],
        })),
    [aggregate.channelTotals]
  )

  const compareChartData = useMemo(
    () =>
      filtered
        .map((ev) => {
          const metrics = metricsMap[ev.id] ?? {
            ...DEFAULT_EVENT_METRICS,
            eventId: ev.id,
            updatedAt: "",
          }
          const attributed = attributedLeads(leads, ev).length
          const during = leadsInRange(leads, ev.startsAt, ev.endsAt).length
          const funnel = buildFunnel(ev, metrics, attributed, during)
          return {
            name: ev.title.length > 14 ? ev.title.slice(0, 13) + "…" : ev.title,
            리드: funnel.leads,
            신청: funnel.applications,
            참석: funnel.attendees,
            딜: funnel.deals,
          }
        })
        .slice(0, 10),
    [filtered, leads, metricsMap]
  )

  const showFilterRow = activeTab === "summary" || activeTab === "events"

  return (
    <div className="pb-24">
      {/* TopBar — branch admin과 동일한 패턴 */}
      <header className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 pb-5 pt-6 sm:px-6 lg:px-9 lg:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#615D59]">
              <span>ADMIN</span>
              <span className="opacity-50">›</span>
              <span>그로스</span>
              <span className="opacity-50">›</span>
              <span>캠페인</span>
            </div>
            <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#111110] sm:text-[30px]">
              캠페인
            </h1>
            <p className="mt-2 max-w-[720px] text-[13px] leading-relaxed text-[#615D59]">
              행사·이메일·자동화를 한 화면에서 운영합니다. 깔때기 전환, 광고 효율, 캘린더 진척을 동시에 추적합니다.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </button>
            <Link
              href="/admin/events"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#063d2a]"
            >
              <Plus className="w-3.5 h-3.5" />
              행사 관리
            </Link>
          </div>
        </div>

        {showFilterRow && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="기간 필터">
              {(["active", "30d", "90d", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  aria-pressed={period === p}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                    period === p ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
                  }`}
                >
                  {p === "active" ? "진행중·예정" : p === "30d" ? "30일" : p === "90d" ? "90일" : "전체"}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Sub-tabs — branch admin 스타일 */}
      <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#EBE8E2] px-2 sm:px-4 lg:px-9">
        <div className="-mb-px flex flex-nowrap gap-0 overflow-x-auto" role="tablist" aria-label="캠페인 보기">
          {CAMPAIGN_TABS.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`relative mt-1 flex shrink-0 flex-col items-start gap-0.5 rounded-t-lg px-4 py-3 text-left transition sm:px-5 ${
                  active
                    ? "bg-[#FAFAF8] text-[#111110]"
                    : "bg-transparent text-[#615D59] hover:text-[#111110]"
                }`}
              >
                <span className="whitespace-nowrap text-[13px] font-bold tracking-[-0.01em] inline-flex items-center gap-1.5">
                  {tab.id === "email" && <Mail className="w-3 h-3" />}
                  {tab.label}
                </span>
                <span className="whitespace-nowrap text-[10.5px] font-medium text-[#615D59]">{tab.sub}</span>
                {active && (
                  <span className="absolute inset-x-3 -bottom-px h-[2.5px] rounded-sm bg-[#084734]" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "email" ? (
        <div className="bg-[#FAFAF8]">
          <AdminMarketingPage />
        </div>
      ) : (
        <div className="px-4 pt-6 sm:px-6 lg:px-9">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              {error}
            </div>
          )}

      {activeTab === "summary" && (
        <>
      {/* KPI strip */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={<CalendarIcon className="w-3.5 h-3.5" />}
          label="대상 행사"
          value={loading ? "..." : KRW.format(filtered.length)}
          hint={`전체 ${events.length}건 중`}
        />
        <KpiCard
          icon={<Wallet className="w-3.5 h-3.5" />}
          label="총 광고비"
          value={loading ? "..." : cny(aggregate.totalSpend)}
        />
        <KpiCard
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          label="총 매출"
          value={loading ? "..." : cny(aggregate.totalRevenue)}
          tone="success"
        />
        <KpiCard
          icon={<Target className="w-3.5 h-3.5" />}
          label="평균 CPL"
          value={loading ? "..." : aggregate.avgCpl != null ? cny(aggregate.avgCpl) : "—"}
          hint={`총 리드 ${KRW.format(aggregate.totalLeads)}`}
        />
        <KpiCard
          icon={<Users className="w-3.5 h-3.5" />}
          label="총 참석자"
          value={loading ? "..." : KRW.format(aggregate.totalAttendees)}
          hint={`딜 ${KRW.format(aggregate.totalDeals)}건`}
        />
        <KpiCard
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          label="누적 ROI"
          value={loading ? "..." : aggregate.overallRoi != null ? pct(aggregate.overallRoi) : "—"}
          tone={aggregate.overallRoi != null && aggregate.overallRoi >= 0 ? "success" : "warn"}
        />
      </div>

      {/* timeline */}
      <div className="mb-5">
        <TimelineRow events={filtered} />
      </div>

      {/* charts */}
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5 lg:col-span-2">
          <h2 className="mb-3 text-[14px] font-semibold text-[#111110]">행사별 깔때기 비교</h2>
          {compareChartData.length === 0 ? (
            <p className="py-12 text-center text-[12px] text-[#1a1a1a]/30">표시할 데이터가 없습니다.</p>
          ) : (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={compareChartData}>
                  <CartesianGrid stroke="#f0f0ec" vertical={false} />
                  <XAxis dataKey="name" fontSize={11} stroke="#84827a" />
                  <YAxis fontSize={11} stroke="#84827a" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111110",
                      border: "none",
                      borderRadius: 12,
                      color: "white",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="리드" fill="#84827a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="신청" fill="#1a73e8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="참석" fill="#084734" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="딜" fill="#B85C33" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-[14px] font-semibold text-[#111110]">광고비 채널 분포</h2>
          {channelChartData.length === 0 ? (
            <p className="py-12 text-center text-[12px] text-[#1a1a1a]/30">광고비가 입력되지 않았습니다.</p>
          ) : (
            <>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={channelChartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                    >
                      {channelChartData.map((entry) => (
                        <Cell key={entry.channel} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number | undefined) => cny(v ?? 0)}
                      contentStyle={{
                        backgroundColor: "#111110",
                        border: "none",
                        borderRadius: 12,
                        color: "white",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1">
                {channelChartData.map((entry) => (
                  <div key={entry.channel} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-[#1a1a1a]/55">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: entry.color }} />
                      {entry.name}
                    </span>
                    <span className="font-semibold text-[#111110]">{cny(entry.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
        </>
      )}

      {activeTab === "events" && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[#111110]">행사별 상세</h2>
            <button
              onClick={() => {
                setPeriod((p) => (p === "all" ? "active" : "all"))
              }}
              className="flex items-center gap-1 text-[12px] font-medium text-[#1a1a1a]/45 hover:text-[#111110]"
            >
              {period === "all" ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {period === "all" ? "축소" : "전체 기간 보기"}
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] py-16 text-center text-[13px] text-[#1a1a1a]/30">
              불러오는 중...
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] py-12 text-center">
              <p className="text-[14px] font-medium text-[#111110]">표시할 행사가 없습니다</p>
              <p className="mx-auto mt-1 max-w-md text-[12px] text-[#1a1a1a]/40">
                기간 필터를 바꾸거나 행사 관리에서 새 행사를 등록하세요.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((event) => {
                const metrics = metricsMap[event.id] ?? {
                  ...DEFAULT_EVENT_METRICS,
                  eventId: event.id,
                  updatedAt: "",
                }
                const attributedCount = attributedLeads(leads, event).length
                const duringCount = leadsInRange(leads, event.startsAt, event.endsAt).length
                return (
                  <EventFunnelCard
                    key={event.id}
                    event={event}
                    metrics={metrics}
                    attributedLeadCount={attributedCount}
                    duringLeadCount={duringCount}
                    onEdit={() => setEditing(event)}
                  />
                )
              })}
            </div>
          )}
        </>
      )}
        </div>
      )}

      {editing && (
        <MetricsEditor
          event={editing}
          metrics={
            metricsMap[editing.id] ?? {
              ...DEFAULT_EVENT_METRICS,
              eventId: editing.id,
              updatedAt: "",
            }
          }
          onClose={() => setEditing(null)}
          onSaved={(saved) => setMetricsMap((m) => ({ ...m, [saved.eventId]: saved }))}
        />
      )}
    </div>
  )
}
