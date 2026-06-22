"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, ChevronDown, Database, RefreshCw } from "lucide-react"
import { adminFetchJson } from "../client-api"

type Severity = "info" | "warn" | "error"
type PanelMode = "ops" | "dev"
type DqCategory = "crm" | "hw" | "kpi" | "geo"
type FilterId = "all" | Severity | DqCategory

interface Issue {
  id: string
  severity: Severity
  message: string
  samples?: unknown[]
}

interface DataQualityResponse {
  issues?: Issue[]
  checkedAt?: string
  ruleCount?: number
  sourceCounts?: Record<string, number>
  error?: string
}

const FALLBACK_RULE_COUNT = 8

const RULE_META: Record<string, {
  category: DqCategory
  categoryLabel: string
  source: string
  owner: string
  operatorHint: string
  devHint: string
}> = {
  "DQ-2": {
    category: "crm",
    categoryLabel: "CRM",
    source: "REV deals · monthly_payments",
    owner: "BD 운영",
    operatorHint: "청구 시작 딜의 월별 납부값을 확인하세요.",
    devHint: "first_payment가 존재하지만 monthly_payments 값이 모두 falsy인 딜을 탐지합니다.",
  },
  "DQ-3": {
    category: "crm",
    categoryLabel: "CRM",
    source: "REV deals · manager",
    owner: "BD 운영",
    operatorHint: "매니저 이름 표기를 하나로 통일하세요.",
    devHint: "trim 후 lower-case 기준은 같지만 원문 표기가 다른 manager 값을 탐지합니다.",
  },
  "DQ-4": {
    category: "crm",
    categoryLabel: "CRM",
    source: "REV sheet headers",
    owner: "데이터 운영",
    operatorHint: "REV 시트의 월 헤더가 최신 템플릿과 맞는지 확인하세요.",
    devHint: "딜은 존재하지만 모든 딜의 monthly_payments key가 비어 있는 상태입니다.",
  },
  "DQ-7": {
    category: "kpi",
    categoryLabel: "KPI",
    source: "DSH rows · team level",
    owner: "KPI 운영",
    operatorHint: "DSH 팀 행에 BD, MKT, CSM이 모두 있는지 확인하세요.",
    devHint: "DSH parser 결과에서 level=team 행의 team set을 기준으로 필수 팀 누락을 탐지합니다.",
  },
  "DQ-9": {
    category: "hw",
    categoryLabel: "HW",
    source: "HW inbound/outbound · product",
    owner: "HW 운영",
    operatorHint: "입출고 제품명을 표준 카탈로그명으로 정리하세요.",
    devHint: "86/75 IFP, T1/S1 카메라, OPS 패턴에 매칭되지 않는 product 값을 탐지합니다.",
  },
  "DQ-10": {
    category: "crm",
    categoryLabel: "CRM",
    source: "REV formatRuns · monthly_confirmed/high_conf",
    owner: "데이터 운영",
    operatorHint: "주차 칸 글자색(빨강=확정, 파랑=임박)이 월별 납부 상태와 함께 추출되는지 확인하세요.",
    devHint: "first_payment와 월별 납부값은 있지만 색 기반 금액(monthly_confirmed/monthly_high_conf)과 monthly_red가 모두 비어 있는 딜을 탐지합니다.",
  },
  "DQ-11": {
    category: "geo",
    categoryLabel: "지역",
    source: "SEG rows · goal/status",
    owner: "지역 운영",
    operatorHint: "히트맵에서 제외되는 지역인지 확인하세요.",
    devHint: "SEG row에서 goal이 0보다 크고 status와 goal이 같은 지역을 참고 이슈로 표시합니다.",
  },
  "DQ-13": {
    category: "kpi",
    categoryLabel: "KPI",
    source: "KPI rows · DSH member map",
    owner: "KPI 운영",
    operatorHint: "KPI 멤버가 DSH 팀 매핑에 포함되어 있는지 확인하세요.",
    devHint: "KPI member가 DSH members map에 없는 경우를 탐지합니다.",
  },
}

const SEVERITY_TONE: Record<Severity, {
  label: string
  dot: string
  chip: string
  row: string
}> = {
  error: {
    label: "위험",
    dot: "bg-rose-500",
    chip: "border-rose-200 bg-rose-50 text-rose-700",
    row: "border-rose-200 bg-rose-50/70 text-rose-900",
  },
  warn: {
    label: "주의",
    dot: "bg-amber-500",
    chip: "border-amber-200 bg-amber-50 text-amber-800",
    row: "border-amber-200 bg-amber-50/75 text-amber-900",
  },
  info: {
    label: "참고",
    dot: "bg-sky-500",
    chip: "border-sky-200 bg-sky-50 text-sky-800",
    row: "border-sky-200 bg-sky-50/70 text-sky-900",
  },
}

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "all", label: "전체" },
  { id: "error", label: "위험" },
  { id: "warn", label: "주의" },
  { id: "info", label: "참고" },
  { id: "crm", label: "CRM" },
  { id: "hw", label: "HW" },
  { id: "kpi", label: "KPI" },
  { id: "geo", label: "지역" },
]

const SOURCE_LABELS: Record<string, string> = {
  deals: "REV 딜",
  dshRows: "DSH 행",
  dshMembers: "DSH 멤버",
  kpiRows: "KPI 행",
  segRows: "SEG 행",
  hwInbound: "HW 입고",
  hwOutbound: "HW 출고",
  hwStock: "HW 재고",
}

function formatTime(iso?: string) {
  if (!iso) return "미확인"
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso
  return d.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function sampleLabel(sample: unknown) {
  if (sample === null) return "null"
  if (typeof sample === "string" || typeof sample === "number" || typeof sample === "boolean") return String(sample)
  return JSON.stringify(sample)
}

function filterIssue(issue: Issue, filter: FilterId) {
  if (filter === "all") return true
  if (filter === "error" || filter === "warn" || filter === "info") return issue.severity === filter
  return (RULE_META[issue.id]?.category ?? "crm") === filter
}

function IssueSamples({ samples, mode }: { samples?: unknown[]; mode: PanelMode }) {
  if (!samples?.length) return null

  if (mode === "dev") {
    return (
      <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-black/5 bg-white/70 p-3 text-[11px] leading-relaxed text-[#111110]">
        {JSON.stringify(samples, null, 2)}
      </pre>
    )
  }

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {samples.slice(0, 8).map((sample, index) => (
        <span key={`${sampleLabel(sample)}-${index}`} className="max-w-full truncate rounded-full bg-white/70 px-2 py-1 text-[11px] font-medium text-[#111110]/70">
          {sampleLabel(sample)}
        </span>
      ))}
      {samples.length > 8 && (
        <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-medium text-[#111110]/45">
          +{samples.length - 8}
        </span>
      )}
    </div>
  )
}

export default function DataQualityPanel({
  refreshKey = 0,
  mode = "ops",
}: {
  refreshKey?: number
  mode?: PanelMode
}) {
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [checkedAt, setCheckedAt] = useState<string | undefined>()
  const [ruleCount, setRuleCount] = useState(FALLBACK_RULE_COUNT)
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterId>("all")
  const [showAll, setShowAll] = useState(false)
  const [localRefreshKey, setLocalRefreshKey] = useState(0)

  useEffect(() => {
    let active = true

    queueMicrotask(() => {
      if (!active) return
      setLoading(true)
      setError(null)
    })

    void adminFetchJson<DataQualityResponse>("/api/admin/branch/data-quality")
      .then((data) => {
        if (!active) return
        if (data.error) throw new Error(data.error)
        setIssues(data.issues ?? [])
        setCheckedAt(data.checkedAt)
        setRuleCount(data.ruleCount ?? FALLBACK_RULE_COUNT)
        setSourceCounts(data.sourceCounts ?? {})
      })
      .catch((e) => {
        if (!active) return
        setError(e instanceof Error ? e.message : String(e))
        setIssues([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [refreshKey, localRefreshKey])

  const counts = useMemo(() => {
    const list = issues ?? []
    const triggeredRules = new Set(list.map((issue) => issue.id))
    return {
      error: list.filter((issue) => issue.severity === "error").length,
      warn: list.filter((issue) => issue.severity === "warn").length,
      info: list.filter((issue) => issue.severity === "info").length,
      passed: Math.max(0, ruleCount - triggeredRules.size),
    }
  }, [issues, ruleCount])

  const filteredIssues = useMemo(() => {
    return (issues ?? []).filter((issue) => filterIssue(issue, filter))
  }, [filter, issues])

  const visibleLimit = mode === "ops" && !showAll ? 3 : filteredIssues.length
  const visibleIssues = filteredIssues.slice(0, visibleLimit)
  const hiddenCount = Math.max(0, filteredIssues.length - visibleIssues.length)
  const isDev = mode === "dev"

  if (issues === null && loading) {
    return <div className="h-44 animate-pulse rounded-xl bg-[#f0f0ec]" />
  }

  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">
                {isDev ? "지사 데이터 품질 점검" : "데이터 품질 점검"}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                통과 {counts.passed}
              </span>
              {counts.error > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10.5px] font-bold text-rose-700">
                  <AlertTriangle className="h-3 w-3" />
                  위험 {counts.error}
                </span>
              )}
              {counts.warn > 0 && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">
                  주의 {counts.warn}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#615D59]">
              {isDev
                ? "운영 화면과 같은 DQ 결과에 rule id, 소스, 샘플 payload를 함께 표시합니다."
                : "REV · DSH · KPI · SEG · HW 데이터가 분석에 들어가기 전 막히는 지점을 먼저 보여줍니다."}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-[11px] text-[#615D59] sm:inline">점검 {formatTime(checkedAt)}</span>
            <button
              type="button"
              onClick={() => setLocalRefreshKey((key) => key + 1)}
              disabled={loading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] text-[#615D59] transition hover:text-[#111110] disabled:opacity-50"
              title="데이터 품질 다시 점검"
              aria-label="데이터 품질 다시 점검"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="데이터 품질 필터">
          {FILTERS.map((item) => {
            const active = filter === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setFilter(item.id)
                  setShowAll(false)
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                  active
                    ? "bg-[#111110] text-white"
                    : "border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#615D59] hover:text-[#111110]"
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2.5 p-5">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] leading-relaxed text-rose-700">
            데이터 품질 점검을 불러오지 못했습니다. {error}
          </div>
        )}

        {(issues ?? []).length === 0 && !error && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-[12px] leading-relaxed text-emerald-800">
            현재 검출된 데이터 품질 이슈가 없습니다. 분석 입력 데이터가 정상 범위로 보입니다.
          </div>
        )}

        {filteredIssues.length === 0 && (issues ?? []).length > 0 && (
          <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-4 text-[12px] text-[#615D59]">
            선택한 필터에 해당하는 이슈가 없습니다.
          </div>
        )}

        {visibleIssues.map((issue) => {
          const tone = SEVERITY_TONE[issue.severity]
          const meta = RULE_META[issue.id] ?? {
            category: "crm" as const,
            categoryLabel: "기타",
            source: "branch data-quality",
            owner: "데이터 운영",
            operatorHint: "원본 데이터와 대시보드 계산 결과를 함께 확인하세요.",
            devHint: "등록되지 않은 DQ rule입니다. runDataQuality 정의를 확인하세요.",
          }

          return (
            <details
              key={`${issue.id}-${issue.message}`}
              open={isDev && issue.severity === "error"}
              className={`group rounded-xl border p-3.5 text-[12px] ${tone.row}`}
            >
              <summary className="flex cursor-pointer list-none items-start gap-3">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone.chip}`}>{tone.label}</span>
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-[#111110]/60">{meta.categoryLabel}</span>
                    <span className="font-mono text-[11px] font-bold text-[#111110]/70">{issue.id}</span>
                  </span>
                  <span className="mt-1.5 block text-[13px] font-bold leading-snug text-[#111110]">{issue.message}</span>
                  <span className="mt-1 block text-[11.5px] leading-relaxed text-[#615D59]">{meta.operatorHint}</span>
                </span>
                <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-[#615D59] transition group-open:rotate-180" />
              </summary>

              <IssueSamples samples={issue.samples} mode={mode} />

              {isDev && (
                <div className="mt-3 grid gap-2 border-t border-black/5 pt-3 text-[11px] text-[#111110]/65 md:grid-cols-2">
                  <div className="rounded-lg bg-white/55 p-2.5">
                    <p className="font-bold text-[#111110]">Rule</p>
                    <p className="mt-1 font-mono">{issue.id} · {issue.severity}</p>
                    <p className="mt-1">{meta.devHint}</p>
                  </div>
                  <div className="rounded-lg bg-white/55 p-2.5">
                    <p className="font-bold text-[#111110]">Source</p>
                    <p className="mt-1">{meta.source}</p>
                    <p className="mt-1">Owner: {meta.owner}</p>
                  </div>
                  <div className="rounded-lg bg-white/55 p-2.5">
                    <p className="font-bold text-[#111110]">Endpoint</p>
                    <p className="mt-1 font-mono">GET /api/admin/branch/data-quality</p>
                  </div>
                  <div className="rounded-lg bg-white/55 p-2.5">
                    <p className="font-bold text-[#111110]">Last Run</p>
                    <p className="mt-1">{formatTime(checkedAt)}</p>
                    <p className="mt-1">Samples: {issue.samples?.length ?? 0}</p>
                  </div>
                </div>
              )}
            </details>
          )
        })}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-3 py-2 text-[12px] font-bold text-[#111110] transition hover:bg-[#EFEDEA]"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            {hiddenCount}건 더 보기
          </button>
        )}

        {isDev && Object.keys(sourceCounts).length > 0 && (
          <div className="mt-4 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-[#111110]">
              <Database className="h-3.5 w-3.5" />
              입력 소스 카운트
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(sourceCounts).map(([key, value]) => (
                <span key={key} className="rounded-full border border-[rgba(0,0,0,0.06)] bg-white px-2 py-1 text-[11px] font-medium text-[#615D59]">
                  {SOURCE_LABELS[key] ?? key} {value.toLocaleString("ko-KR")}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
