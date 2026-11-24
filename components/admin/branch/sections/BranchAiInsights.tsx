"use client"
import { useEffect, useState } from "react"
import { Sparkles, FileDown, RefreshCw, AlertTriangle } from "lucide-react"
import type { BranchSummaryResponse, Team } from "../types"
import { adminFetchJson } from "../client-api"
import { cny } from "@/lib/branch/money-format"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"

interface NextAction { title: string; why: string; owner: string; due?: string }

interface InsightPayload {
  id: string
  one_liner: string | null
  next_actions: NextAction[]
  generated_at: string
  fiscal_period?: string
  raw_response?: { _model?: string; _mode?: string; _retried?: boolean; _warnings?: unknown[] } | null
}

interface InsightResp {
  from: "cache" | "fresh" | "stale" | "error"
  insight?: InsightPayload
  error?: string
}

type Lang = "ko" | "zh"

const TONE = {
  risk:        { bg: "#FCE9E9", fg: "#B43E3E", label: "리스크" },
  opportunity: { bg: "#E8F6EF", fg: "#084734", label: "기회" },
  // "팀" 태그는 코칭/교육 등 팀 운영 액션 카테고리일 뿐 특정 팀(MKT)이 아니다 — 팀 아이덴티티
  // 올리브를 카테고리 색으로 빌려 쓰던 오용을 걷어내고 뉴트럴로 둔다(DESIGN.md Team Identity 원칙).
  team:        { bg: "#F6F5F4", fg: "#31302E", label: "팀" },
  inventory:   { bg: "#FBF1E0", fg: "#A8741A", label: "재고" },
  // 파이프라인 태그는 확도 신호가 아니라 액션 카테고리라 확도 예외 파랑(#1E5DA8)을
  // 쓸 이유가 없다 — 비확도 맥락은 뉴트럴(#615D59/#F6F5F4)로.
  pipeline:    { bg: "#F6F5F4", fg: "#615D59", label: "파이프라인" },
  general:     { bg: "rgba(0,0,0,0.05)", fg: "#111110", label: "일반" },
} as const

type ToneKey = keyof typeof TONE

function classifyAction(a: NextAction): ToneKey {
  const text = `${a.title} ${a.why}`.toLowerCase()
  if (/risk|위험|이슈|delay|지연|충돌/.test(text)) return "risk"
  if (/opportun|기회|성장|확장/.test(text)) return "opportunity"
  if (/inventory|재고|입고|hw/.test(text)) return "inventory"
  if (/pipeline|파이프|딜|deal/.test(text)) return "pipeline"
  if (/team|팀|coach|코칭|교육/.test(text)) return "team"
  return "general"
}

function todayYmd() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

/** 액션 한 줄 — 유형(글자색만) · 액션 · 근거 · 담당 · 기한. 기한이 지난 항목은 '기한 경과'로 표시한다. */
function InsightRow({ action, idx, overdue }: { action: NextAction; idx: number; overdue: boolean }) {
  const t = TONE[classifyAction(action)]
  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-[#E8E8E4] px-5 py-3.5 sm:grid-cols-[24px_72px_minmax(0,1fr)_minmax(0,120px)_88px]">
      <span className="pt-0.5 text-[11px] tabular-nums text-[#615D59]">{idx + 1}</span>
      <span className="pt-0.5 text-[12px] font-bold" style={{ color: t.fg }}>{t.label}</span>
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <p className="text-[14px] font-bold leading-snug text-[#111110]">{action.title}</p>
        {action.why ? <p className="mt-1 text-[12.5px] leading-relaxed text-[#615D59]">{action.why}</p> : null}
      </div>
      <span className="col-start-2 text-[12.5px] text-[#111110] sm:col-start-auto">{action.owner}</span>
      <span className="col-start-2 text-[12.5px] tabular-nums sm:col-start-auto">
        {action.due ? <span className={overdue ? "text-[#615D59] line-through" : "text-[#111110]"}>{action.due}</span> : <span className="text-[#615D59]">—</span>}
        {overdue ? <b className="block text-[11.5px] text-[#B43E3E]">기한 경과</b> : null}
      </span>
    </li>
  )
}

/** 모델·네트워크 오류 원문(JSON 등)을 사람이 읽는 한 문장으로 바꾼다. 원문은 접어서 따로 보여 준다. */
function describeInsightError(raw: string) {
  if (/402|429|RESOURCE_EXHAUSTED|credit|quota|한도/i.test(raw)) return "AI 서비스 사용 한도를 넘어 새로 만들지 못했습니다."
  if (/timeout|timed out|abort|시간/i.test(raw)) return "AI 응답이 늦어 새로 만들지 못했습니다."
  if (/401|403|권한/i.test(raw)) return "AI 인사이트를 만들 권한이 없습니다."
  return "AI 인사이트를 새로 만들지 못했습니다."
}

const FROM_LABEL: Record<InsightResp["from"], string> = {
  cache: "저장된 결과",
  fresh: "방금 생성",
  stale: "오래된 결과 · 갱신 실패",
  error: "생성 실패",
}

function formatGeneratedAt(iso: string | undefined) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" })
}

function isoToWeekLabel(_dateStr: string | undefined, lang: Lang) {
  const d = new Date()
  const onejan = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7)
  return lang === "zh" ? `${d.getFullYear()} W${week}` : `${d.getFullYear()} W${week}`
}

function ExternalReport({ summary, lang }: { summary: BranchSummaryResponse | null; lang: Lang }) {
  const t = lang === "zh" ? {
    eyebrow: "CLASSIN · KR 韩国分公司 · 全团队综合",
    title: "总部周报",
    sub: "以周 (W) 为单位 · 与上周对比",
    managerLabel: "分公司负责人", managerName: "文俊赫",
    issued: "签发日", reportPeriod: "报告期间",
    sectionRevenue: "1. 销售概况", sectionDeals: "2. 关键客户", sectionRisks: "3. 风险与对策",
    revenueLabel: "确认营收", goalLabel: "目标", achievementLabel: "达成率",
    eventsLabel: "本期活动", campaignsLabel: "营销活动", openRate: "平均打开率",
    risk: "风险", action: "对策",
    footerL: "Classin Korea · 首尔特别市江南区德黑兰路",
    footerR: "本报告供总部送呈用",
  } : {
    eyebrow: "CLASSIN · KR BRANCH · 전체팀 통합",
    title: "본사 주간 보고서",
    sub: "주차 (W) 기준 · 지난 주 대비 비교",
    managerLabel: "지사장", managerName: "문준혁",
    issued: "발행일", reportPeriod: "보고 기간",
    sectionRevenue: "1. 매출 개요", sectionDeals: "2. 주요 거래", sectionRisks: "3. 리스크와 대응",
    revenueLabel: "확정 매출", goalLabel: "목표", achievementLabel: "달성률",
    eventsLabel: "기간 행사", campaignsLabel: "캠페인", openRate: "평균 오픈율",
    risk: "리스크", action: "대응 방안",
    footerL: "Classin Korea · 서울특별시 강남구 테헤란로",
    footerR: "본 보고서는 본사 송부용으로 작성됨",
  }

  const issuedDate = new Date().toISOString().slice(0, 10).replace(/-/g, ".")
  const weekLabel = isoToWeekLabel(undefined, lang)

  if (!summary) return <div className="h-96 animate-pulse rounded-xl bg-[#f0f0ec]" />

  const rev = summary.revenue
  const open = Math.max(0, rev.goal - rev.confirmed)

  return (
    <div className="min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-6 py-6"
      style={{ fontFamily: lang === "zh" ? 'Inter, "Noto Sans SC", "PingFang SC", system-ui, sans-serif' : 'Inter, "Noto Serif KR", Pretendard, system-ui, sans-serif' }}>
      {/* Letterhead */}
      <div className="border-b-2 border-[#084734] pb-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold tracking-[0.12em] text-[#084734]">{t.eyebrow}</p>
            <p className="mt-1.5 text-[24px] font-bold tracking-[-0.02em] text-[#111110]">{t.title} · {weekLabel}</p>
            <p className="mt-1 text-[11px] text-[#615D59]">{t.sub}</p>
          </div>
          <div className="text-right">
            <p className="text-[10.5px] text-[#615D59]">{t.managerLabel}</p>
            <p className="mt-0.5 text-[14px] font-bold text-[#111110]">{t.managerName}</p>
            <p className="mt-1.5 text-[10.5px] text-[#615D59]">{t.issued} {issuedDate}</p>
          </div>
        </div>
      </div>

      {/* Section 1: Revenue */}
      <section className="mt-6">
        <h3 className="text-[15px] font-bold text-[#111110]">{t.sectionRevenue}</h3>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-[#F6F5F4] p-3">
            <p className="text-[10.5px] text-[#615D59]">{t.revenueLabel}</p>
            {/* 확정 매출 = 캐논 그린(CONFIDENCE_TOKENS.confirmed) — 이 카드는 본사 발송
                인쇄 리포트라 위험(Danger) 빨강과 절대 혼동돼선 안 된다(품질 웨이브 5 — 항목 1). */}
            <p className="mt-1 text-[18px] font-bold leading-none tracking-[-0.01em]" style={{ color: CONFIDENCE_TOKENS.confirmed.color }}>
              ¥{cny(rev.confirmed)}
            </p>
          </div>
          <div className="rounded-lg bg-[#F6F5F4] p-3">
            <p className="text-[10.5px] text-[#615D59]">{t.goalLabel}</p>
            <p className="mt-1 text-[18px] font-bold leading-none tracking-[-0.01em] text-[#111110]">
              ¥{cny(rev.goal)}
            </p>
          </div>
          <div className="rounded-lg bg-[#F6F5F4] p-3">
            <p className="text-[10.5px] text-[#615D59]">{t.achievementLabel}</p>
            {/* Status 3단(Success/Warning/Danger) 재사용 — 팀 아이덴티티 올리브를
                페이싱 등급에 쓰던 오용을 정리(2026-07-17). */}
            <p className="mt-1 text-[18px] font-bold leading-none" style={{ color: rev.pacing_pct >= 90 ? "#084734" : rev.pacing_pct >= 70 ? "#A8741A" : "#B43E3E" }}>
              {rev.pacing_pct.toFixed(0)}%
            </p>
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-[#615D59]">
          {lang === "zh"
            ? `本期 KR 分公司销售额达 ${rev.pacing_pct.toFixed(0)}%。剩余目标 ¥${cny(open)}。`
            : `이번 기 KR 지사 매출은 목표 대비 ${rev.pacing_pct.toFixed(0)}% 달성. 잔여 목표 ¥${cny(open)}.`}
        </p>
      </section>

      {/* Section 2: Key deals */}
      <section className="mt-6">
        <h3 className="text-[15px] font-bold text-[#111110]">{t.sectionDeals}</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
          <div className="rounded-lg bg-[#F6F5F4] p-3">
            <p className="text-[10.5px] text-[#615D59]">{t.eventsLabel} · {lang === "zh" ? "全公司参考" : "전사 참고"}</p>
            <p className="mt-1 text-[16px] font-bold text-[#111110]">{summary.events_30d.count}{lang === "zh" ? "次" : "건"}</p>
            <p className="mt-0.5 text-[10.5px] text-[#615D59]">{lang === "zh" ? `${summary.events_30d.regions} 个地区` : `${summary.events_30d.regions}개 지역`}</p>
          </div>
          <div className="rounded-lg bg-[#F6F5F4] p-3">
            <p className="text-[10.5px] text-[#615D59]">{t.campaignsLabel} · {lang === "zh" ? "全公司参考" : "전사 참고"}</p>
            <p className="mt-1 text-[16px] font-bold text-[#111110]">{summary.campaigns_30d.count}{lang === "zh" ? "次" : "건"}</p>
            <p className="mt-0.5 text-[10.5px] text-[#615D59]">{t.openRate} {summary.campaigns_30d.avg_open_pct.toFixed(0)}%</p>
          </div>
        </div>
      </section>

      {/* Section 3: Risks */}
      <section className="mt-6">
        <h3 className="text-[15px] font-bold text-[#111110]">{t.sectionRisks}</h3>
        <div className="mt-3 rounded-lg border border-[#FCE9E9] bg-[#FCE9E9]/40 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B43E3E]" />
            <div>
              <p className="text-[12.5px] font-bold text-[#B43E3E]">{t.risk}</p>
              <p className="mt-0.5 text-[12px] text-[#111110]">
                {summary.bottleneck.metric ?? (lang === "zh" ? "无重大风险" : "주요 병목 없음")}
                {summary.bottleneck.worst_member && ` · ${summary.bottleneck.worst_member}`}
              </p>
              <p className="mt-1.5 text-[11.5px] text-[#615D59]">{lang === "zh" ? "达成率" : "달성률"} {summary.bottleneck.pct.toFixed(0)}%</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-8 flex justify-between border-t border-[rgba(0,0,0,0.08)] pt-4 text-[10.5px] text-[#615D59]">
        <span>{t.footerL}</span>
        <span>{t.footerR}</span>
      </div>
    </div>
  )
}

export default function BranchAiInsights({ team, refreshKey, summary, canGenerate = true, manager }: {
  team: Team
  refreshKey: number
  summary: BranchSummaryResponse | null
  canGenerate?: boolean
  manager?: string
}) {
  // 2026-11-24 시안 'AI 인사이트 B'(왼쪽은 목록) — 운영 액션 목록과 본사 보고서 미리보기를 나란히 둔다.
  // 예전 내부/외부 보기 전환은 없앴다: 두 화면이 같은 summary 수치를 보므로 오가지 않고 함께 본다.
  const [lang, setLang] = useState<Lang>("ko")
  const [insight, setInsight] = useState<InsightPayload | null>(null)
  const [from, setFrom] = useState<InsightResp["from"] | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const requestKey = `${refreshKey}:${team}`
  const [stateKey, setStateKey] = useState<string | null>(null)
  const stale = stateKey !== requestKey

  useEffect(() => {
    let cancelled = false
    setLoading(true); setErrorMsg(null)
    void adminFetchJson<InsightResp>(`/api/admin/branch/insights?team=${team}`)
      .then((d: InsightResp) => {
        if (cancelled) return
        if (d.error) setErrorMsg(d.error)
        setInsight(d.insight ?? null)
        setFrom(d.from)
        setStateKey(requestKey)
        setLoading(false)
      })
      .catch((e) => { if (!cancelled) { setErrorMsg(e instanceof Error ? e.message : String(e)); setLoading(false); setStateKey(requestKey) } })
    return () => { cancelled = true }
  }, [requestKey, team])

  const handleRegenerate = async () => {
    if (!canGenerate || refreshing) return
    setRefreshing(true); setErrorMsg(null)
    try {
      const d = await adminFetchJson<InsightResp>(`/api/admin/branch/insights?team=${team}&force=1`)
      if (d.error) setErrorMsg(d.error)
      // 실패 응답에 결과가 없으면 이전 결과를 지우지 않는다 — 오류 문장과 함께 마지막 결과를 계속 보여 준다.
      if (d.insight) { setInsight(d.insight); setFrom(d.from) }
    } catch (e) { setErrorMsg(e instanceof Error ? e.message : String(e)) }
    finally { setRefreshing(false) }
  }

  const today = todayYmd()
  const rows = (insight?.next_actions ?? [])
    .map((action, index) => ({ action, index, overdue: Boolean(action.due && action.due < today) }))
    // 기한이 지난 항목은 아래로 — 원래 순서는 그대로 유지한다.
    .sort((a, b) => Number(a.overdue) - Number(b.overdue) || a.index - b.index)
  const overdueCount = rows.filter((row) => row.overdue).length
  const showLoading = loading || stale
  const generatedAt = formatGeneratedAt(insight?.generated_at)
  const rev = summary?.revenue

  return (
    <section className="space-y-4">
      {summary ? (
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white md:grid-cols-4" aria-label="AI가 본 기준 수치">
          <div className="border-b border-r border-[#E8E8E4] px-4 py-3 md:border-b-0">
            <p className="text-[11.5px] text-[#615D59]">기준 · 확정 매출</p>
            <p className="text-[18px] font-bold tabular-nums" style={{ color: CONFIDENCE_TOKENS.confirmed.color }}>¥{cny(rev?.confirmed ?? 0)}</p>
          </div>
          <div className="border-b border-[#E8E8E4] px-4 py-3 md:border-b-0 md:border-r">
            <p className="text-[11.5px] text-[#615D59]">목표 · 달성률</p>
            <p className="text-[18px] font-bold tabular-nums text-[#111110]">{rev && rev.goal > 0 ? `¥${cny(rev.goal)} · ${rev.pacing_pct.toFixed(1)}%` : "목표 없음"}</p>
          </div>
          <div className="border-r border-[#E8E8E4] px-4 py-3">
            <p className="text-[11.5px] text-[#615D59]">남은 목표</p>
            <p className="text-[18px] font-bold tabular-nums text-[#111110]">{rev && rev.goal > 0 ? `¥${cny(Math.max(0, rev.goal - rev.confirmed))}` : "—"}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11.5px] text-[#615D59]">시트 영업 KPI 병목</p>
            <p className="text-[15px] font-bold text-[#111110]">
              {summary.bottleneck.metric ? `${summary.bottleneck.metric.toUpperCase()} ${summary.bottleneck.pct.toFixed(0)}%` : "없음"}
              {summary.bottleneck.worst_member ? <span className="font-medium text-[#615D59]"> · {summary.bottleneck.worst_member}</span> : null}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white" aria-label="운영 액션">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-4">
            <h2 className="text-[14px] font-bold text-[#111110]">{manager || summary?.scope?.manager ? "내 담당 · 이번 주 할 일" : "팀 공용 · 이번 주 할 일"}</h2>
            <span className="text-[11.5px] text-[#615D59]">
              {[generatedAt ? `생성 ${generatedAt}` : null, insight?.fiscal_period ? `기준 ${insight.fiscal_period}` : null, from && insight ? FROM_LABEL[from] : null].filter(Boolean).join(" · ")}
            </span>
            {canGenerate ? (
              <button type="button" onClick={handleRegenerate} disabled={refreshing}
                className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-md bg-[#084734] px-3.5 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:opacity-60 md:min-h-8">
                {refreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                인사이트 새로 생성
              </button>
            ) : null}
          </div>
          {insight?.one_liner ? (
            <p className="px-5 pb-3 pt-2 text-[17px] font-bold leading-snug tracking-[-0.01em] text-[#111110]">{insight.one_liner}</p>
          ) : <div className="pb-3" />}

          {errorMsg ? (
            <div role="alert" className="mx-5 mb-3 rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3.5 py-2.5 text-[12.5px] text-[#8F2C2C]">
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <b>{describeInsightError(errorMsg)}</b>
                {insight ? <span>아래는 이전 결과입니다.</span> : null}
                {canGenerate ? (
                  <button type="button" onClick={handleRegenerate} disabled={refreshing}
                    className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-md border border-[#F2B8B8] bg-white px-2.5 text-[11.5px] font-bold text-[#8F2C2C] hover:bg-[#FCE9E9] disabled:opacity-60 md:min-h-7">
                    <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
                    다시 시도
                  </button>
                ) : null}
              </div>
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[11.5px] font-semibold">오류 원문 보기</summary>
                <p className="mt-1 break-all font-mono text-[11px] leading-relaxed">{errorMsg}</p>
              </details>
            </div>
          ) : null}

          {showLoading ? (
            <div className="space-y-2 px-5 pb-5" role="status" aria-label="AI 인사이트를 불러오는 중">
              {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-[#F0F0EC]" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="border-t border-[#E8E8E4] px-5 py-8 text-center text-[12px] text-[#615D59]">
              {canGenerate ? "생성된 인사이트가 없습니다. '인사이트 새로 생성'을 눌러 주세요." : "생성된 인사이트가 없습니다."}
            </p>
          ) : (
            <>
              <div className="hidden grid-cols-[24px_72px_minmax(0,1fr)_minmax(0,120px)_88px] gap-x-3 border-t border-[#E8E8E4] bg-[#F6F5F4] px-5 py-2 text-[11px] font-semibold text-[#615D59] sm:grid" aria-hidden="true">
                <span>#</span><span>유형</span><span>액션 · 근거</span><span>담당</span><span>기한</span>
              </div>
              <ol>
                {rows.map((row, position) => <InsightRow key={`${row.action.title}-${row.index}`} action={row.action} idx={position} overdue={row.overdue} />)}
              </ol>
              <p className="border-t border-[#E8E8E4] px-5 py-2.5 text-[11.5px] text-[#615D59]">
                액션 {rows.length}건{overdueCount ? ` · 기한 경과 ${overdueCount}건(아래로 내림)` : ""} · 유형은 문장에서 자동 분류
              </p>
            </>
          )}
        </section>

        <section className="min-w-0 space-y-2" aria-label="본사 주간 보고서">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-[14px] font-bold text-[#111110]">{summary?.scope?.manager ? "내 담당 · 매출 보고" : "본사 주간 보고서"} <span className="text-[11.5px] font-medium text-[#615D59]">미리보기</span></h2>
            <div className="inline-flex rounded-md border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="보고서 언어">
              {([{ id: "ko", label: "한국어" }, { id: "zh", label: "中文" }] as const).map((o) => (
                <button key={o.id} type="button" onClick={() => setLang(o.id)} aria-pressed={lang === o.id}
                  className={`min-h-11 rounded-[5px] px-3 text-[12px] font-bold transition md:min-h-7 ${lang === o.id ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => window.print()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#111110] md:min-h-8">
              <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
              {lang === "zh" ? "PDF 下载" : "PDF 다운로드"}
            </button>
          </div>
          <ExternalReport summary={summary} lang={lang} />
        </section>
      </div>
    </section>
  )
}
