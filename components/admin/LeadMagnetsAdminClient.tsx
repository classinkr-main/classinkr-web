"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileText,
  Link2,
  Loader2,
  MousePointerClick,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import {
  getLeadMagnetCategoryLabel,
  getLeadMagnetGateLabel,
  getLeadMagnetItemCount,
  getLeadMagnetStatusLabel,
  type LeadMagnet,
  type LeadMagnetActionStep,
  type LeadMagnetCategory,
  type LeadMagnetGate,
  type LeadMagnetScoreBand,
  type LeadMagnetSection,
  type LeadMagnetSourceLink,
  type LeadMagnetStatus,
  type LeadMagnetTier,
} from "@/lib/lead-magnets"

type EditorTab = "basic" | "copy" | "content" | "sales" | "routing"

const STATUS_OPTIONS: Array<{ value: LeadMagnetStatus; label: string }> = [
  { value: "draft", label: "초안" },
  { value: "review", label: "리뷰" },
  { value: "unlisted", label: "링크 공개" },
]
const GATE_OPTIONS: Array<{ value: LeadMagnetGate; label: string }> = [
  { value: "open", label: "공개" },
  { value: "email", label: "이메일 게이트" },
  { value: "login", label: "로그인 게이트" },
]
const TIER_OPTIONS: Array<{ value: LeadMagnetTier; label: string }> = [
  { value: "basic", label: "기본" },
  { value: "advanced", label: "심화" },
]
const CATEGORY_OPTIONS: Array<{ value: LeadMagnetCategory; label: string }> = [
  { value: "operations", label: "운영" },
  { value: "hardware", label: "하드웨어" },
  { value: "software", label: "소프트웨어" },
  { value: "case-study", label: "사례" },
  { value: "security", label: "보안" },
]
const EDITOR_TABS: Array<{ value: EditorTab; label: string }> = [
  { value: "basic", label: "기본" },
  { value: "copy", label: "카피" },
  { value: "content", label: "본문" },
  { value: "sales", label: "세일즈" },
  { value: "routing", label: "추적·배치" },
]

interface Props {
  initialLeadMagnets: LeadMagnet[]
}

interface LeadMagnetsResponse {
  leadMagnets: LeadMagnet[]
}

interface LeadMagnetMetricRow {
  slug: string
  impressions: number
  views: number
  submissions: number
  downloads: number
  ctaClicks: number
  leads: number
  convertedLeads: number
  conversionRate: number
  leadConversionRate: number
  lastEventAt: string | null
}

interface LeadMagnetMetricsResponse {
  days: number
  since: string
  generatedAt: string
  truncated: boolean
  totals: {
    impressions: number
    views: number
    submissions: number
    downloads: number
    ctaClicks: number
    leads: number
    convertedLeads: number
    conversionRate: number
    leadConversionRate: number
  }
  byLeadMagnet: LeadMagnetMetricRow[]
  recentEvents: Array<{
    eventName: string
    leadMagnet: string
    createdAt: string
    page: string | null
    source: string | null
  }>
  warning?: string
}

function cloneLeadMagnet(magnet: LeadMagnet): LeadMagnet {
  return JSON.parse(JSON.stringify(magnet)) as LeadMagnet
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function emptyLeadMagnet(): LeadMagnet {
  const slug = "new-resource"
  return {
    slug,
    title: "새 리드마그넷",
    audience: "학원 원장, 운영팀",
    status: "draft",
    gate: "email",
    tier: "basic",
    category: "operations",
    published: false,
    sourceDetail: `lead_magnet:${slug}`,
    summary: "",
    formatLabel: "10문항 자료 + 실행 플랜",
    estimatedMinutes: 10,
    blogTone: "",
    guideTone: "",
    checklistBullets: [],
    sections: [
      {
        title: "점검 영역",
        description: "이 영역에서 확인할 기준을 적어주세요.",
        items: ["첫 번째 점검 문항", "두 번째 점검 문항"],
      },
    ],
    scoreBands: [
      { range: "0-3점", label: "보완 필요", description: "먼저 기준 정리가 필요합니다." },
    ],
    redFlags: [],
    actionPlan: [
      { day: "Day 1", title: "현재 상태 정리", tasks: ["현재 쓰는 자료와 운영 흐름을 모읍니다."] },
    ],
    deliverables: [],
    consultationPrep: [],
    sourceLinks: [],
    salesPlaybook: {
      intentScore: 15,
      intentLabel: "자료 관심 리드",
      ownerNote: "",
      firstResponse: "",
      qualificationQuestions: [],
      followUpSequence: [
        { day: "D+0", title: "첫 응대", tasks: ["자료 신청 맥락을 확인하고 상담 CTA를 제안합니다."] },
      ],
      nextCtas: [],
    },
    ctaCopy: {
      eyebrow: "무료 자료",
      title: "새 자료를 확인하세요",
      body: "",
      buttonLabel: "자료 보기",
    },
    resourceUrl: `/resources/${slug}`,
    storagePath: "",
    suggestedPlacements: [],
  }
}

function arrayToText(items: readonly string[] | undefined) {
  return (items ?? []).join("\n")
}

function textToArray(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter(Boolean)
}

function sectionsToText(sections: readonly LeadMagnetSection[]) {
  return sections
    .map((section) =>
      [
        `## ${section.title}`,
        section.description,
        ...section.items.map((item) => `- ${item}`),
      ].join("\n")
    )
    .join("\n\n")
}

function textToSections(value: string): LeadMagnetSection[] {
  const sections: LeadMagnetSection[] = []
  let current: { title: string; description: string; items: string[] } | null = null

  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith("## ")) {
      if (current && current.items.length > 0) sections.push(current)
      current = { title: line.replace(/^##\s*/, "").trim(), description: "", items: [] }
      continue
    }

    if (!current) {
      current = { title: "점검 영역", description: "", items: [] }
    }

    if (line.startsWith("- ")) {
      current.items.push(line.replace(/^-\s*/, "").trim())
    } else if (!current.description) {
      current.description = line
    } else {
      current.items.push(line)
    }
  }

  if (current && current.items.length > 0) sections.push(current)
  return sections
}

function scoreBandsToText(scoreBands: readonly LeadMagnetScoreBand[]) {
  return scoreBands
    .map((band) => `${band.range} | ${band.label} | ${band.description}`)
    .join("\n")
}

function textToScoreBands(value: string): LeadMagnetScoreBand[] {
  return value
    .split("\n")
    .map((line) => {
      const [range, label, ...rest] = line.split("|").map((item) => item.trim())
      return { range, label, description: rest.join(" | ") }
    })
    .filter((item) => item.range && item.label)
}

function actionPlanToText(actionPlan: readonly LeadMagnetActionStep[]) {
  return actionPlan
    .map((step) =>
      [`## ${step.day} | ${step.title}`, ...step.tasks.map((task) => `- ${task}`)].join("\n")
    )
    .join("\n\n")
}

function textToActionPlan(value: string): LeadMagnetActionStep[] {
  const steps: LeadMagnetActionStep[] = []
  let current: { day: string; title: string; tasks: string[] } | null = null

  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith("## ")) {
      if (current) steps.push(current)
      const [day, ...titleParts] = line.replace(/^##\s*/, "").split("|").map((item) => item.trim())
      current = { day, title: titleParts.join(" | ") || "실행 단계", tasks: [] }
      continue
    }

    if (!current) current = { day: "Day 1", title: "실행 단계", tasks: [] }
    current.tasks.push(line.replace(/^-\s*/, "").trim())
  }

  if (current) steps.push(current)
  return steps
}

function sourceLinksToText(sourceLinks: readonly LeadMagnetSourceLink[] | undefined) {
  return (sourceLinks ?? [])
    .map((link) => [link.label, link.href, link.description ?? ""].join(" | ").replace(/\s+\|\s+$/, ""))
    .join("\n")
}

function textToSourceLinks(value: string): LeadMagnetSourceLink[] {
  return value
    .split("\n")
    .map((line) => {
      const [label, href, ...rest] = line.split("|").map((item) => item.trim())
      return { label, href, description: rest.join(" | ") }
    })
    .filter((item) => item.label && item.href)
}

function selectValue<T extends string>(
  value: T,
  onChange: (value: T) => void,
  options: Array<{ value: T; label: string }>,
  id: string
) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="h-10 w-full rounded-[6px] border border-black/[0.08] bg-white px-3 text-sm outline-none focus:border-[#084734]"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value)
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%"
  return `${Math.round(value * 10) / 10}%`
}

function formatDateTime(value: string | null) {
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

function eventLabel(eventName: string) {
  if (eventName === "view_resource_card") return "노출"
  if (eventName === "view_resource") return "조회"
  if (eventName === "submit_newsletter") return "신청"
  if (eventName === "download_materials") return "열람"
  if (eventName === "click_cta") return "CTA"
  return eventName
}

function getOperationIssues(magnet: LeadMagnet) {
  const issues: string[] = []
  const itemCount = getLeadMagnetItemCount(magnet)

  if (!magnet.summary.trim()) issues.push("자료 요약이 비어 있습니다.")
  if (!magnet.ctaCopy.title.trim() || !magnet.ctaCopy.body.trim() || !magnet.ctaCopy.buttonLabel.trim()) {
    issues.push("CTA 제목, 본문, 버튼 라벨을 모두 채워야 합니다.")
  }
  if (itemCount < 10) issues.push("점검 문항은 최소 10개 이상으로 유지하세요.")
  if (magnet.sections.length < 3) issues.push("본문 섹션을 3개 이상으로 나누면 자료 품질이 안정적입니다.")
  if (magnet.scoreBands.length < 2) issues.push("점수 해석 구간을 2개 이상 준비하세요.")
  if (magnet.actionPlan.length < 3) issues.push("실행 플랜은 최소 3단계 이상이면 상담 전환에 유리합니다.")
  if (magnet.deliverables.length < 3) issues.push("포함 자료는 3개 이상 명확히 적어주세요.")
  if (!magnet.salesPlaybook?.firstResponse?.trim()) issues.push("자료 신청 후 첫 응대 문구를 세일즈 탭에 적어두세요.")
  if ((magnet.salesPlaybook?.followUpSequence?.length ?? 0) < 3) issues.push("후속 시퀀스는 최소 3단계 이상이면 리드 누수가 줄어듭니다.")
  if ((magnet.sourceLinks?.length ?? 0) < 1) issues.push("자료 안 참고 링크를 1개 이상 연결해 다음 행동을 명확히 하세요.")
  if (!magnet.resourceUrl?.trim()) issues.push("신청 후 연결할 자료 URL이 비어 있습니다.")
  if (magnet.gate === "login" && !magnet.storagePath?.trim()) {
    issues.push("로그인 게이트 자료는 비공개 Storage 경로를 연결하는 것이 안전합니다.")
  }
  if (magnet.sourceDetail !== `lead_magnet:${magnet.slug}`) {
    issues.push(`sourceDetail 기본값은 lead_magnet:${magnet.slug} 입니다.`)
  }
  if (magnet.suggestedPlacements.length < 2) {
    issues.push("추천 배치를 2곳 이상 적어두면 CTA 운영이 쉬워집니다.")
  }

  return issues
}

function appendQueryParams(url: string, params: Record<string, string>) {
  const [withoutHash, hash = ""] = url.split("#")
  const separator = withoutHash.includes("?") ? "&" : "?"
  const query = new URLSearchParams(params).toString()
  return `${withoutHash}${separator}${query}${hash ? `#${hash}` : ""}`
}

function toAbsoluteUrl(value: string) {
  const normalized = value.trim() || "/"
  if (/^https?:\/\//i.test(normalized)) return normalized
  if (typeof window === "undefined") return normalized
  return `${window.location.origin}${normalized.startsWith("/") ? normalized : `/${normalized}`}`
}

function buildTrackedResourceUrl(resourceUrl: string, slug: string) {
  return appendQueryParams(toAbsoluteUrl(resourceUrl), {
    utm_source: "lead_magnet",
    utm_medium: "resource",
    utm_campaign: slug,
  })
}

function PerformancePanel({
  leadMagnets,
  selectedSlug,
  metrics,
  days,
  loading,
  failed,
  onDaysChange,
  onRefresh,
  onSelect,
}: {
  leadMagnets: LeadMagnet[]
  selectedSlug: string
  metrics: LeadMagnetMetricsResponse | null
  days: number
  loading: boolean
  failed: boolean
  onDaysChange: (days: number) => void
  onRefresh: () => void
  onSelect: (leadMagnet: LeadMagnet) => void
}) {
  const titleBySlug = new Map(leadMagnets.map((item) => [item.slug, item.title]))
  const metricBySlug = new Map(metrics?.byLeadMagnet.map((item) => [item.slug, item]) ?? [])
  const rows = leadMagnets.map((item) => ({
    leadMagnet: item,
    metrics: metricBySlug.get(item.slug) ?? {
      slug: item.slug,
      impressions: 0,
      views: 0,
      submissions: 0,
      downloads: 0,
      ctaClicks: 0,
      leads: 0,
      convertedLeads: 0,
      conversionRate: 0,
      leadConversionRate: 0,
      lastEventAt: null,
    },
  }))

  return (
    <section className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-[0_1px_0_rgba(17,17,16,0.02)] sm:p-6 lg:col-span-2">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
            <BarChart3 className="h-4 w-4 text-[#084734]" />
            리드마그넷 성과
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#A39E98]" /> : null}
          </div>
          <p className="mt-1 text-[12px] leading-5 text-[#615D59]">
            조회, 신청, 자료 열람, 상담 CTA 클릭을 최근 기간 기준으로 집계합니다.
          </p>
          {metrics?.generatedAt ? (
            <p className="mt-1 text-[11px] text-[#A39E98]">
              갱신 {formatDateTime(metrics.generatedAt)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {[7, 14, 30, 90].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onDaysChange(option)}
              className={`h-8 rounded-[6px] border px-3 text-[12px] font-semibold ${
                days === option
                  ? "border-[#084734]/20 bg-[#ECFDF5] text-[#084734]"
                  : "border-black/[0.08] bg-white text-[#615D59] hover:bg-[#F6F5F4]"
              }`}
            >
              {option}일
            </button>
          ))}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex h-8 items-center gap-1.5 rounded-[6px] border border-black/[0.08] bg-white px-3 text-[12px] font-semibold text-[#615D59] hover:bg-[#F6F5F4] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            갱신
          </button>
        </div>
      </div>

      {failed ? (
        <p className="mt-4 rounded-[6px] bg-[#F6F5F4] px-3 py-2 text-[12px] text-[#615D59]">
          아직 성과 데이터를 불러오지 못했습니다. 이벤트 테이블 설정 또는 관리자 권한을 확인하세요.
        </p>
      ) : (
        <>
          {(metrics?.warning || metrics?.truncated) ? (
            <div className="mt-4 flex gap-2 rounded-[6px] bg-[#F6F5F4] px-3 py-2 text-[12px] leading-5 text-[#615D59]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B85C33]" />
              <span>
                {metrics.warning
                  ? `성과 데이터 일부를 불러오지 못했습니다: ${metrics.warning}`
                  : "이 기간의 이벤트가 50,000건 이상이라 최신 이벤트 기준으로 집계했습니다."}
              </span>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            <MetricTile icon={<Eye />} label="노출" value={metrics?.totals.impressions ?? 0} />
            <MetricTile icon={<Eye />} label="조회" value={metrics?.totals.views ?? 0} />
            <MetricTile icon={<Send />} label="신청" value={metrics?.totals.submissions ?? 0} />
            <MetricTile icon={<Download />} label="열람" value={metrics?.totals.downloads ?? 0} />
            <MetricTile icon={<FileText />} label="저장 리드" value={metrics?.totals.leads ?? 0} />
            <MetricTile icon={<BarChart3 />} label="전환 리드" value={metrics?.totals.convertedLeads ?? 0} />
            <MetricTile icon={<MousePointerClick />} label="CTA" value={metrics?.totals.ctaClicks ?? 0} />
            <div className="rounded-xl border border-black/[0.08] bg-[#ECFDF5] p-4">
              <p className="text-[11px] font-semibold text-[#084734]/70">전환율</p>
              <p className="mt-1 text-[22px] font-bold text-[#084734]">
                {formatPercent(metrics?.totals.conversionRate ?? 0)}
              </p>
              <p className="mt-1 text-[11px] text-[#084734]/55">신청 / 노출·조회</p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-black/[0.08]">
            <div className="grid grid-cols-[minmax(180px,1.7fr)_repeat(9,minmax(64px,0.7fr))_96px] gap-2 bg-[#F6F5F4] px-4 py-2 text-[11px] font-bold text-[#615D59] max-xl:hidden">
              <span>자료</span>
              <span>노출</span>
              <span>조회</span>
              <span>신청</span>
              <span>열람</span>
              <span>리드</span>
              <span>전환</span>
              <span>CTA</span>
              <span>신청률</span>
              <span>전환율</span>
              <span>최근</span>
            </div>
            <div className="divide-y divide-black/[0.08]">
              {rows.map(({ leadMagnet, metrics: row }) => (
                <button
                  key={leadMagnet.slug}
                  type="button"
                  onClick={() => onSelect(leadMagnet)}
                  className={`grid w-full gap-3 px-4 py-3 text-left text-[13px] transition-colors xl:grid-cols-[minmax(180px,1.7fr)_repeat(9,minmax(64px,0.7fr))_96px] xl:items-center ${
                    selectedSlug === leadMagnet.slug ? "bg-[#ECFDF5]" : "bg-white hover:bg-[#F6F5F4]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#111110]">{leadMagnet.title}</p>
                    <p className="truncate text-[11px] text-[#A39E98]">{leadMagnet.slug}</p>
                  </div>
                  <MetricCell label="노출" value={row.impressions} />
                  <MetricCell label="조회" value={row.views} />
                  <MetricCell label="신청" value={row.submissions} />
                  <MetricCell label="열람" value={row.downloads} />
                  <MetricCell label="리드" value={row.leads} />
                  <MetricCell label="전환" value={row.convertedLeads} />
                  <MetricCell label="CTA" value={row.ctaClicks} />
                  <span className="text-[#084734]">{formatPercent(row.conversionRate)}</span>
                  <span className="text-[#084734]">{formatPercent(row.leadConversionRate)}</span>
                  <span className="text-[11px] text-[#615D59]">{formatDateTime(row.lastEventAt)}</span>
                </button>
              ))}
            </div>
          </div>

          {metrics?.recentEvents.length ? (
            <div className="mt-4 rounded-xl border border-black/[0.08] bg-white p-4">
              <p className="text-[12px] font-bold text-[#111110]">최근 이벤트</p>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {metrics.recentEvents.slice(0, 6).map((event) => (
                  <div key={`${event.createdAt}-${event.eventName}-${event.leadMagnet}`} className="flex items-center justify-between gap-3 rounded-[6px] bg-[#F6F5F4] px-3 py-2 text-[12px]">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#111110]">
                        {eventLabel(event.eventName)} · {titleBySlug.get(event.leadMagnet) ?? event.leadMagnet}
                      </p>
                      <p className="truncate text-[#A39E98]">{event.source ?? event.page ?? "-"}</p>
                    </div>
                    <span className="shrink-0 text-[#615D59]">{formatDateTime(event.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

function MetricTile({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-black/[0.08] bg-white p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-[#615D59]">
        <span className="text-[#084734] [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        {label}
      </div>
      <p className="mt-1 text-[22px] font-bold text-[#111110]">{formatNumber(value)}</p>
    </div>
  )
}

function MetricCell({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center justify-between gap-2 xl:block">
      <span className="text-[11px] font-semibold text-[#A39E98] xl:hidden">{label}</span>
      <span className="font-semibold text-[#31302E]">{formatNumber(value)}</span>
    </span>
  )
}

function TrackingLinkRow({
  label,
  value,
  onCopy,
}: {
  label: string
  value: string
  onCopy: () => void
}) {
  return (
    <div className="rounded-xl border border-black/[0.08] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-[#111110]">{label}</p>
          <p className="mt-1 truncate text-[12px] text-[#615D59]">{value}</p>
        </div>
        <Button type="button" variant="outline" onClick={onCopy} className="h-9 shrink-0">
          <Copy className="h-4 w-4" />
          복사
        </Button>
      </div>
    </div>
  )
}

function OperationCheckPanel({ issues }: { issues: string[] }) {
  return (
    <div className="rounded-xl border border-black/[0.08] bg-white p-4 xl:col-span-2">
      <div className="flex items-center gap-2 font-bold text-[#111110]">
        {issues.length ? (
          <AlertTriangle className="h-4 w-4 text-[#B85C33]" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-[#084734]" />
        )}
        운영 체크
      </div>
      {issues.length ? (
        <ul className="mt-3 grid gap-2 lg:grid-cols-2">
          {issues.map((issue) => (
            <li key={issue} className="flex gap-2 text-[12px] leading-5 text-[#615D59]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B85C33]" />
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[12px] leading-5 text-[#084734]">
          공개 배치에 필요한 기본 항목이 채워져 있습니다.
        </p>
      )}
    </div>
  )
}

export default function LeadMagnetsAdminClient({ initialLeadMagnets }: Props) {
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>(initialLeadMagnets)
  const [selectedSlug, setSelectedSlug] = useState(initialLeadMagnets[0]?.slug ?? "")
  const [draft, setDraft] = useState<LeadMagnet>(() =>
    initialLeadMagnets[0] ? cloneLeadMagnet(initialLeadMagnets[0]) : emptyLeadMagnet()
  )
  const [originalSlug, setOriginalSlug] = useState(initialLeadMagnets[0]?.slug ?? "")
  const [tab, setTab] = useState<EditorTab>("basic")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [metricsDays, setMetricsDays] = useState(30)
  const [metricsRefreshNonce, setMetricsRefreshNonce] = useState(0)
  const [metrics, setMetrics] = useState<LeadMagnetMetricsResponse | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsFailed, setMetricsFailed] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")

  const [checklistText, setChecklistText] = useState(arrayToText(draft.checklistBullets))
  const [sectionsText, setSectionsText] = useState(sectionsToText(draft.sections))
  const [scoreBandsText, setScoreBandsText] = useState(scoreBandsToText(draft.scoreBands))
  const [redFlagsText, setRedFlagsText] = useState(arrayToText(draft.redFlags))
  const [actionPlanText, setActionPlanText] = useState(actionPlanToText(draft.actionPlan))
  const [deliverablesText, setDeliverablesText] = useState(arrayToText(draft.deliverables))
  const [consultationPrepText, setConsultationPrepText] = useState(arrayToText(draft.consultationPrep))
  const [sourceLinksText, setSourceLinksText] = useState(sourceLinksToText(draft.sourceLinks))
  const [qualificationQuestionsText, setQualificationQuestionsText] = useState(
    arrayToText(draft.salesPlaybook?.qualificationQuestions)
  )
  const [followUpSequenceText, setFollowUpSequenceText] = useState(
    actionPlanToText(draft.salesPlaybook?.followUpSequence ?? [])
  )
  const [nextCtasText, setNextCtasText] = useState(arrayToText(draft.salesPlaybook?.nextCtas))
  const [placementsText, setPlacementsText] = useState(arrayToText(draft.suggestedPlacements))

  const summaryMetrics = useMemo(() => {
    const published = leadMagnets.filter((item) => item.published).length
    const items = leadMagnets.reduce((total, item) => total + getLeadMagnetItemCount(item), 0)
    return { published, items }
  }, [leadMagnets])

  useEffect(() => {
    void refresh(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    setMetricsLoading(true)
    setMetricsFailed(false)

    adminFetchJsonCached<LeadMagnetMetricsResponse>(
      `/api/admin/lead-magnets/metrics?days=${metricsDays}`,
      undefined,
      { ttlMs: 60_000, force: metricsRefreshNonce > 0, staleIfError: metricsRefreshNonce === 0 }
    )
      .then((data) => {
        if (!cancelled) setMetrics(data)
      })
      .catch(() => {
        if (!cancelled) {
          setMetrics(null)
          setMetricsFailed(true)
        }
      })
      .finally(() => {
        if (!cancelled) setMetricsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [metricsDays, metricsRefreshNonce])

  function syncEditor(next: LeadMagnet, nextOriginalSlug = next.slug) {
    setDraft(cloneLeadMagnet(next))
    setSelectedSlug(next.slug)
    setOriginalSlug(nextOriginalSlug)
    setChecklistText(arrayToText(next.checklistBullets))
    setSectionsText(sectionsToText(next.sections))
    setScoreBandsText(scoreBandsToText(next.scoreBands))
    setRedFlagsText(arrayToText(next.redFlags))
    setActionPlanText(actionPlanToText(next.actionPlan))
    setDeliverablesText(arrayToText(next.deliverables))
    setConsultationPrepText(arrayToText(next.consultationPrep))
    setSourceLinksText(sourceLinksToText(next.sourceLinks))
    setQualificationQuestionsText(arrayToText(next.salesPlaybook?.qualificationQuestions))
    setFollowUpSequenceText(actionPlanToText(next.salesPlaybook?.followUpSequence ?? []))
    setNextCtasText(arrayToText(next.salesPlaybook?.nextCtas))
    setPlacementsText(arrayToText(next.suggestedPlacements))
  }

  async function refresh(showLoading = true) {
    if (showLoading) setLoading(true)
    try {
      const data = await adminFetchJsonCached<LeadMagnetsResponse>(
        "/api/admin/lead-magnets",
        undefined,
        { ttlMs: 30_000, force: !showLoading }
      )
      setLeadMagnets(data.leadMagnets)
      const current = data.leadMagnets.find((item) => item.slug === selectedSlug) ?? data.leadMagnets[0]
      if (current && !selectedSlug) syncEditor(current)
    } catch {
      // 초기 서버 데이터가 있으므로 조용히 유지한다.
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  function updateDraft(patch: Partial<LeadMagnet>) {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  function updateCtaCopy(field: keyof LeadMagnet["ctaCopy"], value: string) {
    setDraft((prev) => ({
      ...prev,
      ctaCopy: { ...prev.ctaCopy, [field]: value },
    }))
  }

  function updateSalesPlaybook(patch: Partial<NonNullable<LeadMagnet["salesPlaybook"]>>) {
    setDraft((prev) => ({
      ...prev,
      salesPlaybook: {
        intentScore: 15,
        intentLabel: "자료 관심 리드",
        ownerNote: "",
        firstResponse: "",
        qualificationQuestions: [],
        followUpSequence: [],
        nextCtas: [],
        ...prev.salesPlaybook,
        ...patch,
      },
    }))
  }

  function selectMagnet(magnet: LeadMagnet) {
    syncEditor(magnet)
    setNotice("")
    setError("")
  }

  function createNew() {
    const next = emptyLeadMagnet()
    syncEditor(next, "")
    setTab("basic")
    setNotice("새 자료 초안을 작성한 뒤 저장하세요.")
    setError("")
  }

  function duplicateCurrent() {
    const baseSlug = `${draft.slug}-copy`
    const slug = slugify(baseSlug)
    const next = {
      ...cloneLeadMagnet(draft),
      slug,
      title: `${draft.title} 복사본`,
      status: "draft" as LeadMagnetStatus,
      published: false,
      sourceDetail: `lead_magnet:${slug}` as `lead_magnet:${string}`,
      resourceUrl: `/resources/${slug}`,
    }
    syncEditor(next, "")
    setTab("basic")
    setNotice("복사본을 만들었습니다. 저장하면 새 자료로 추가됩니다.")
    setError("")
  }

  function buildPayload(): LeadMagnet {
    const slug = slugify(draft.slug || draft.title)
    const sections = textToSections(sectionsText)
    return {
      ...draft,
      slug,
      sourceDetail: (draft.sourceDetail.trim() || `lead_magnet:${slug}`) as `lead_magnet:${string}`,
      resourceUrl: draft.resourceUrl?.trim() || `/resources/${slug}`,
      checklistBullets: textToArray(checklistText),
      sections,
      scoreBands: textToScoreBands(scoreBandsText),
      redFlags: textToArray(redFlagsText),
      actionPlan: textToActionPlan(actionPlanText),
      deliverables: textToArray(deliverablesText),
      consultationPrep: textToArray(consultationPrepText),
      sourceLinks: textToSourceLinks(sourceLinksText),
      salesPlaybook: {
        intentScore: Math.max(0, Math.min(40, draft.salesPlaybook?.intentScore ?? 15)),
        intentLabel: draft.salesPlaybook?.intentLabel?.trim() || "자료 관심 리드",
        ownerNote: draft.salesPlaybook?.ownerNote?.trim() || "",
        firstResponse: draft.salesPlaybook?.firstResponse?.trim() || "",
        qualificationQuestions: textToArray(qualificationQuestionsText),
        followUpSequence: textToActionPlan(followUpSequenceText),
        nextCtas: textToArray(nextCtasText),
      },
      suggestedPlacements: textToArray(placementsText),
      formatLabel:
        draft.formatLabel.trim() ||
        `${sections.reduce((total, section) => total + section.items.length, 0)}문항 자료`,
    }
  }

  async function save() {
    setSaving(true)
    setNotice("")
    setError("")
    try {
      const payload = buildPayload()
      const url = originalSlug
        ? `/api/admin/lead-magnets/${encodeURIComponent(originalSlug)}`
        : "/api/admin/lead-magnets"
      const method = originalSlug ? "PUT" : "POST"
      const data = await adminFetchJson<{ leadMagnet: LeadMagnet }>(url, {
        method,
        body: JSON.stringify(payload),
      })

      setLeadMagnets((prev) => {
        const exists = prev.some((item) => item.slug === originalSlug)
        if (!exists) return [...prev, data.leadMagnet]
        return prev.map((item) => (item.slug === originalSlug ? data.leadMagnet : item))
      })
      syncEditor(data.leadMagnet)
      setNotice("저장했습니다. 공개 자료실과 블로그 게이트 캐시가 갱신됩니다.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "저장하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!originalSlug) {
      createNew()
      return
    }
    if (!window.confirm("이 리드마그넷을 삭제할까요? 이미 블로그에 연결된 slug라면 먼저 연결을 해제해야 합니다.")) return

    setSaving(true)
    setError("")
    setNotice("")
    try {
      await adminFetchJson<{ ok: boolean }>(`/api/admin/lead-magnets/${encodeURIComponent(originalSlug)}`, {
        method: "DELETE",
      })
      const next = leadMagnets.filter((item) => item.slug !== originalSlug)
      setLeadMagnets(next)
      if (next[0]) syncEditor(next[0])
      else createNew()
      setNotice("삭제했습니다.")
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "삭제하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function copyToClipboard(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(successMessage)
      setError("")
    } catch {
      setError("클립보드에 복사하지 못했습니다. 브라우저 권한을 확인하세요.")
    }
  }

  const currentPayload = buildPayload()
  const currentItemCount = getLeadMagnetItemCount(currentPayload)
  const operationIssues = getOperationIssues(currentPayload)
  const currentResourceUrl = currentPayload.resourceUrl?.trim() || `/resources/${currentPayload.slug}`
  const previewTrackedResourceUrl = appendQueryParams(currentResourceUrl, {
    utm_source: "lead_magnet",
    utm_medium: "resource",
    utm_campaign: currentPayload.slug,
  })

  return (
    <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:p-8">
      <PerformancePanel
        leadMagnets={leadMagnets}
        selectedSlug={selectedSlug}
        metrics={metrics}
        days={metricsDays}
        loading={metricsLoading}
        failed={metricsFailed}
        onDaysChange={setMetricsDays}
        onRefresh={() => setMetricsRefreshNonce((value) => value + 1)}
        onSelect={selectMagnet}
      />

      <aside className="space-y-4">
        <div className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-[0_1px_0_rgba(17,17,16,0.02)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#084734]/70">
            Lead Magnets
          </p>
          <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.03em] text-[#111110]">
            리드마그넷 편집
          </h1>
          <p className="mt-2 text-[13px] leading-6 text-[#615D59]">
            자료실, 블로그 게이트, CRM 리드 태그에 연결되는 자료 콘텐츠를 관리합니다.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-[#F6F5F4] p-3">
              <p className="text-[18px] font-bold text-[#111110]">{leadMagnets.length}</p>
              <p className="text-[11px] text-[#615D59]">자료</p>
            </div>
            <div className="rounded-xl bg-[#ECFDF5] p-3">
              <p className="text-[18px] font-bold text-[#084734]">{summaryMetrics.published}</p>
              <p className="text-[11px] text-[#084734]/70">공개</p>
            </div>
            <div className="rounded-xl bg-[#F6F5F4] p-3">
              <p className="text-[18px] font-bold text-[#111110]">{summaryMetrics.items}</p>
              <p className="text-[11px] text-[#615D59]">문항</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="button" onClick={createNew} className="h-10 flex-1">
              <Plus className="h-4 w-4" />
              새 자료
            </Button>
            <Button type="button" variant="outline" onClick={() => refresh()} disabled={loading} className="h-10">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "새로고침"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {leadMagnets.map((item) => (
            <button
              key={item.slug}
              type="button"
              onClick={() => selectMagnet(item)}
              className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                selectedSlug === item.slug
                  ? "border-[#084734]/25 bg-[#ECFDF5]"
                  : "border-black/[0.08] bg-white hover:bg-[#F6F5F4]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-[#615D59]">{item.slug}</p>
                  <p className="mt-1 line-clamp-2 text-[15px] font-bold leading-5 text-[#111110]">
                    {item.title}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#084734]">
                  {getLeadMagnetItemCount(item)}문항
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-[#615D59]">
                <span>{getLeadMagnetStatusLabel(item.status)}</span>
                <span>·</span>
                <span>{getLeadMagnetGateLabel(item.gate)}</span>
                <span>·</span>
                <span>{getLeadMagnetCategoryLabel(item.category)}</span>
                {item.salesPlaybook?.intentScore ? (
                  <>
                    <span>·</span>
                    <span>의도 +{item.salesPlaybook.intentScore}</span>
                  </>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="min-w-0 rounded-2xl border border-black/[0.08] bg-white shadow-[0_1px_0_rgba(17,17,16,0.02)]">
        <div className="flex flex-col gap-4 border-b border-black/[0.08] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#084734]/70">
              Editor
            </p>
            <h2 className="mt-1 truncate text-[22px] font-bold tracking-[-0.03em] text-[#111110]">
              {draft.title}
            </h2>
            <p className="mt-1 text-[12px] text-[#615D59]">
              {currentItemCount}문항 · {draft.estimatedMinutes}분 · {draft.published ? "공개" : "비공개"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {draft.resourceUrl ? (
              <Button asChild type="button" variant="outline" className="h-10">
                <Link href={draft.resourceUrl} target="_blank">
                  <ArrowUpRight className="h-4 w-4" />
                  보기
                </Link>
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={duplicateCurrent} className="h-10">
              <Copy className="h-4 w-4" />
              복사
            </Button>
            <Button type="button" variant="outline" onClick={remove} disabled={saving} className="h-10 text-[#B85C33]">
              <Trash2 className="h-4 w-4" />
              삭제
            </Button>
            <Button type="button" onClick={save} disabled={saving} className="h-10">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              저장
            </Button>
          </div>
        </div>

        {(notice || error) && (
          <div className="border-b border-black/[0.08] px-4 py-3 sm:px-6">
            {notice ? <p className="text-[13px] text-[#084734]">{notice}</p> : null}
            {error ? <p className="text-[13px] text-[#B85C33]">{error}</p> : null}
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto border-b border-black/[0.08] px-4 py-3 sm:px-6">
          {EDITOR_TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={`h-9 shrink-0 rounded-[6px] border px-4 text-sm font-semibold ${
                tab === item.value
                  ? "border-[#084734]/20 bg-[#ECFDF5] text-[#084734]"
                  : "border-black/[0.08] bg-white text-[#615D59] hover:bg-[#F6F5F4]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="space-y-6 p-4 sm:p-6">
          {tab === "basic" && (
            <div className="grid gap-5 xl:grid-cols-2">
              <Field label="제목">
                <Input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} />
              </Field>
              <Field label="슬러그">
                <Input value={draft.slug} onChange={(event) => {
                  const slug = slugify(event.target.value)
                  updateDraft({
                    slug,
                    sourceDetail: `lead_magnet:${slug}`,
                    resourceUrl: `/resources/${slug}`,
                  })
                }} />
              </Field>
              <Field label="추천 대상">
                <Input value={draft.audience} onChange={(event) => updateDraft({ audience: event.target.value })} />
              </Field>
              <Field label="포맷 라벨">
                <Input value={draft.formatLabel} onChange={(event) => updateDraft({ formatLabel: event.target.value })} />
              </Field>
              <Field label="상태">
                {selectValue(draft.status, (value) => updateDraft({ status: value }), STATUS_OPTIONS, "lead-status")}
              </Field>
              <Field label="게이트">
                {selectValue(draft.gate, (value) => updateDraft({ gate: value }), GATE_OPTIONS, "lead-gate")}
              </Field>
              <Field label="티어">
                {selectValue(draft.tier, (value) => updateDraft({ tier: value }), TIER_OPTIONS, "lead-tier")}
              </Field>
              <Field label="카테고리">
                {selectValue(draft.category, (value) => updateDraft({ category: value }), CATEGORY_OPTIONS, "lead-category")}
              </Field>
              <Field label="예상 소요 시간(분)">
                <Input
                  type="number"
                  min={1}
                  value={draft.estimatedMinutes}
                  onChange={(event) => updateDraft({ estimatedMinutes: Number(event.target.value) || 1 })}
                />
              </Field>
              <label className="flex min-h-10 items-center gap-2 rounded-[6px] border border-black/[0.08] px-3 text-sm font-semibold text-[#31302E]">
                <input
                  type="checkbox"
                  checked={draft.published}
                  onChange={(event) => updateDraft({ published: event.target.checked })}
                  className="h-4 w-4 accent-[#084734]"
                />
                자료실과 개별 페이지에 공개
              </label>
              <Field label="요약" className="xl:col-span-2">
                <Textarea rows={4} value={draft.summary} onChange={(event) => updateDraft({ summary: event.target.value })} />
              </Field>
            </div>
          )}

          {tab === "copy" && (
            <div className="grid gap-5 xl:grid-cols-2">
              <Field label="CTA Eyebrow">
                <Input value={draft.ctaCopy.eyebrow} onChange={(event) => updateCtaCopy("eyebrow", event.target.value)} />
              </Field>
              <Field label="CTA 버튼 라벨">
                <Input value={draft.ctaCopy.buttonLabel} onChange={(event) => updateCtaCopy("buttonLabel", event.target.value)} />
              </Field>
              <Field label="CTA 제목" className="xl:col-span-2">
                <Input value={draft.ctaCopy.title} onChange={(event) => updateCtaCopy("title", event.target.value)} />
              </Field>
              <Field label="CTA 본문" className="xl:col-span-2">
                <Textarea rows={3} value={draft.ctaCopy.body} onChange={(event) => updateCtaCopy("body", event.target.value)} />
              </Field>
              <Field label="블로그 톤">
                <Textarea rows={5} value={draft.blogTone} onChange={(event) => updateDraft({ blogTone: event.target.value })} />
              </Field>
              <Field label="가이드 톤">
                <Textarea rows={5} value={draft.guideTone} onChange={(event) => updateDraft({ guideTone: event.target.value })} />
              </Field>
            </div>
          )}

          {tab === "content" && (
            <div className="grid gap-5">
              <Field label="카드 미리보기 체크 항목" hint="한 줄에 하나씩 입력합니다. 허브 카드와 블로그 게이트의 짧은 미리보기에 사용됩니다.">
                <Textarea rows={5} value={checklistText} onChange={(event) => setChecklistText(event.target.value)} />
              </Field>
              <Field label="전체 점검 섹션" hint="형식: ## 섹션명 / 다음 줄 설명 / - 문항. 저장하면 구조화됩니다.">
                <Textarea rows={14} value={sectionsText} onChange={(event) => setSectionsText(event.target.value)} />
              </Field>
              <Field label="점수 해석" hint="형식: 0-10점 | 라벨 | 설명">
                <Textarea rows={6} value={scoreBandsText} onChange={(event) => setScoreBandsText(event.target.value)} />
              </Field>
              <Field label="7일 실행 플랜" hint="형식: ## Day 1 | 제목 / - 할 일">
                <Textarea rows={8} value={actionPlanText} onChange={(event) => setActionPlanText(event.target.value)} />
              </Field>
              <div className="grid gap-5 xl:grid-cols-2">
                <Field label="포함 자료">
                  <Textarea rows={5} value={deliverablesText} onChange={(event) => setDeliverablesText(event.target.value)} />
                </Field>
                <Field label="상담 준비 자료">
                  <Textarea rows={5} value={consultationPrepText} onChange={(event) => setConsultationPrepText(event.target.value)} />
                </Field>
              </div>
              <Field label="레드 플래그">
                <Textarea rows={5} value={redFlagsText} onChange={(event) => setRedFlagsText(event.target.value)} />
              </Field>
            </div>
          )}

          {tab === "sales" && (
            <div className="grid gap-5 xl:grid-cols-2">
              <Field label="리드 의도 점수" hint="CRM 리드 점수에 더해지는 자료 관심 점수입니다. 0~40 사이로 운영합니다.">
                <Input
                  type="number"
                  min={0}
                  max={40}
                  value={draft.salesPlaybook?.intentScore ?? 15}
                  onChange={(event) =>
                    updateSalesPlaybook({
                      intentScore: Math.max(0, Math.min(40, Number(event.target.value) || 0)),
                    })
                  }
                />
              </Field>
              <Field label="의도 라벨">
                <Input
                  value={draft.salesPlaybook?.intentLabel ?? ""}
                  onChange={(event) => updateSalesPlaybook({ intentLabel: event.target.value })}
                />
              </Field>
              <Field label="담당자 메모" className="xl:col-span-2" hint="리드가 이 자료를 받았을 때 내부에서 어떻게 해석할지 적습니다.">
                <Textarea
                  rows={3}
                  value={draft.salesPlaybook?.ownerNote ?? ""}
                  onChange={(event) => updateSalesPlaybook({ ownerNote: event.target.value })}
                />
              </Field>
              <Field label="첫 응대 문구" className="xl:col-span-2" hint="자료 신청 직후 전화·카카오·이메일 첫 문장으로 쓰는 문구입니다.">
                <Textarea
                  rows={3}
                  value={draft.salesPlaybook?.firstResponse ?? ""}
                  onChange={(event) => updateSalesPlaybook({ firstResponse: event.target.value })}
                />
              </Field>
              <Field label="자격 확인 질문" hint="한 줄에 하나씩 입력합니다.">
                <Textarea
                  rows={7}
                  value={qualificationQuestionsText}
                  onChange={(event) => setQualificationQuestionsText(event.target.value)}
                />
              </Field>
              <Field label="다음 CTA" hint="한 줄에 하나씩 입력합니다. 쇼룸, 상담, 비교표 회신 등 다음 행동을 적습니다.">
                <Textarea
                  rows={7}
                  value={nextCtasText}
                  onChange={(event) => setNextCtasText(event.target.value)}
                />
              </Field>
              <Field label="빠른 후속 시퀀스" className="xl:col-span-2" hint="형식: ## D+0 5분 | 제목 / - 할 일">
                <Textarea
                  rows={10}
                  value={followUpSequenceText}
                  onChange={(event) => setFollowUpSequenceText(event.target.value)}
                />
              </Field>
              <Field label="자료 안 참고 링크" className="xl:col-span-2" hint="형식: 라벨 | URL | 설명. 외부 픽셀 대신 내부 CTA와 공식 문서 링크를 넣습니다.">
                <Textarea
                  rows={6}
                  value={sourceLinksText}
                  onChange={(event) => setSourceLinksText(event.target.value)}
                />
              </Field>
            </div>
          )}

          {tab === "routing" && (
            <div className="grid gap-5 xl:grid-cols-2">
              <Field label="추적 SourceDetail" hint="CRM/구독자 source_detail에 남는 값입니다. 기본값은 lead_magnet:{slug}.">
                <Input value={draft.sourceDetail} onChange={(event) => updateDraft({ sourceDetail: event.target.value as `lead_magnet:${string}` })} />
              </Field>
              <Field label="자료 URL" hint="신청 완료 후 열리는 링크입니다. 보통 /resources/{slug}.">
                <Input value={draft.resourceUrl ?? ""} onChange={(event) => updateDraft({ resourceUrl: event.target.value })} />
              </Field>
              <Field label="Storage 경로" hint="materials 버킷 안의 비공개 파일 경로입니다. 예: checklists/academy-system.pdf">
                <Input value={draft.storagePath ?? ""} onChange={(event) => updateDraft({ storagePath: event.target.value })} />
              </Field>
              <div className="rounded-xl border border-black/[0.08] bg-[#F6F5F4] p-4 xl:col-span-2">
                <div className="mb-3 flex items-center gap-2 font-bold text-[#111110]">
                  <Link2 className="h-4 w-4 text-[#084734]" />
                  운영 링크
                </div>
                <div className="grid gap-3">
                  <TrackingLinkRow
                    label="공개 자료 링크"
                    value={currentResourceUrl}
                    onCopy={() =>
                      void copyToClipboard(
                        toAbsoluteUrl(currentResourceUrl),
                        "공개 자료 링크를 복사했습니다."
                      )
                    }
                  />
                  <TrackingLinkRow
                    label="CTA 배치용 UTM 링크"
                    value={previewTrackedResourceUrl}
                    onCopy={() =>
                      void copyToClipboard(
                        buildTrackedResourceUrl(currentResourceUrl, currentPayload.slug),
                        "CTA 배치용 추적 링크를 복사했습니다."
                      )
                    }
                  />
                </div>
              </div>
              <OperationCheckPanel issues={operationIssues} />
              <Field label="추천 배치" className="xl:col-span-2" hint="어떤 블로그/제품/이메일 CTA에 붙일지 한 줄에 하나씩 적습니다.">
                <Textarea rows={6} value={placementsText} onChange={(event) => setPlacementsText(event.target.value)} />
              </Field>
              <div className="rounded-xl border border-black/[0.08] bg-[#F6F5F4] p-4 text-[13px] leading-6 text-[#615D59] xl:col-span-2">
                <div className="mb-2 flex items-center gap-2 font-bold text-[#111110]">
                  <FileText className="h-4 w-4 text-[#084734]" />
                  픽셀과 링크 운영 기준
                </div>
                자료 본문에는 외부 픽셀을 직접 삽입하지 않고, 페이지 조회·신청·열람·상담 CTA 클릭을
                내부 이벤트와 동의 기반 광고 픽셀로 추적합니다. 자료 안에 넣을 링크는 제품 페이지,
                상담 신청, 관련 블로그처럼 다음 행동이 분명한 내부 링크를 우선 사용하세요.
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string
  hint?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-[12px] font-bold text-[#31302E]">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] leading-5 text-[#A39E98]">{hint}</p> : null}
    </div>
  )
}
