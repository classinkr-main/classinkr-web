"use client"
import { useEffect, useState } from "react"
import { Sparkles, FileDown, RefreshCw, AlertTriangle } from "lucide-react"
import type { BranchSummaryResponse, Team } from "../types"
import { adminFetchJson } from "../client-api"
import { cny } from "@/lib/branch/money-format"

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
type View = "internal" | "external"

const TONE = {
  risk:        { bg: "#FCE9E9", fg: "#B43E3E", label: "리스크" },
  opportunity: { bg: "#ECFDF5", fg: "#084734", label: "기회" },
  team:        { bg: "#F1F4DE", fg: "#7B8B36", label: "팀" },
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

function InternalInsightCard({ action, idx }: { action: NextAction; idx: number }) {
  const kind = classifyAction(action)
  const t = TONE[kind]
  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ background: t.bg, color: t.fg }}>
          {t.label}
        </span>
        <span className="text-[10px] font-bold tracking-[0.04em] text-[#615D59]">#{idx + 1}</span>
      </div>
      <p className="mt-3 text-[15px] font-bold leading-tight tracking-[-0.01em] text-[#111110]">{action.title}</p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-[#615D59]">{action.why}</p>
      <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-dashed border-[rgba(0,0,0,0.08)] pt-3 text-[11px]">
        <span className="rounded-full bg-[#F6F5F4] px-2 py-0.5 font-semibold text-[#111110]">{action.owner}</span>
        {action.due && <span className="text-[#615D59]">마감 <span className="font-semibold text-[#111110]">{action.due}</span></span>}
      </div>
    </div>
  )
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
    <div className="mx-auto max-w-[880px] rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-9 py-9 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
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
            <p className="mt-1 text-[18px] font-bold leading-none tracking-[-0.01em]" style={{ color: "#B43E3E" }}>
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
            <p className="mt-1 text-[18px] font-bold leading-none" style={{ color: rev.pacing_pct >= 90 ? "#084734" : rev.pacing_pct >= 70 ? "#7B8B36" : "#A8741A" }}>
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
            <p className="text-[10.5px] text-[#615D59]">{t.eventsLabel}</p>
            <p className="mt-1 text-[16px] font-bold text-[#111110]">{summary.events_30d.count}{lang === "zh" ? "次" : "건"}</p>
            <p className="mt-0.5 text-[10.5px] text-[#615D59]">{lang === "zh" ? `${summary.events_30d.regions} 个地区` : `${summary.events_30d.regions}개 지역`}</p>
          </div>
          <div className="rounded-lg bg-[#F6F5F4] p-3">
            <p className="text-[10.5px] text-[#615D59]">{t.campaignsLabel}</p>
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

export default function BranchAiInsights({ team, refreshKey, summary, canGenerate = true }: {
  team: Team
  refreshKey: number
  summary: BranchSummaryResponse | null
  canGenerate?: boolean
}) {
  const [view, setView] = useState<View>("internal")
  const [lang, setLang] = useState<Lang>("ko")
  const [insight, setInsight] = useState<InsightPayload | null>(null)
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
        setStateKey(requestKey)
        setLoading(false)
      })
      .catch((e) => { if (!cancelled) { setErrorMsg(e instanceof Error ? e.message : String(e)); setLoading(false); setStateKey(requestKey) } })
    return () => { cancelled = true }
  }, [requestKey, team])

  const handleRegenerate = async () => {
    if (!canGenerate) return
    setRefreshing(true); setErrorMsg(null)
    try {
      const d = await adminFetchJson<InsightResp>(`/api/admin/branch/insights?team=${team}&force=1`)
      if (d.error) setErrorMsg(d.error)
      setInsight(d.insight ?? null)
    } catch (e) { setErrorMsg(e instanceof Error ? e.message : String(e)) }
    finally { setRefreshing(false) }
  }

  const actions = insight?.next_actions ?? []
  const highCount = actions.length // we don't have priority field, treat all as actionable
  const showLoading = loading || stale

  return (
    <section className="space-y-4">
      {/* Toggle bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-[9px] border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-1">
          {(["internal", "external"] as const).map((v) => {
            const active = view === v
            const labels = v === "internal"
              ? { label: "내부용 · 운영 인사이트", sub: "액션 중심" }
              : { label: "외부용 · 본사 보고", sub: "리포트 형식" }
            return (
              <button key={v} type="button" onClick={() => setView(v)}
                className={`flex flex-col items-start gap-0 rounded-md px-4 py-2 text-left transition ${
                  active ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "bg-transparent"
                }`}>
                <span className={`text-[13px] font-bold ${active ? "text-[#111110]" : "text-[#615D59]"}`}>{labels.label}</span>
                <span className="text-[10px] font-medium text-[#615D59]">{labels.sub}</span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view === "external" && (
            <div className="inline-flex rounded-md border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]">
              {([{ id: "ko", label: "한국어", sub: "KR" }, { id: "zh", label: "中文", sub: "CN" }] as const).map((o) => {
                const active = lang === o.id
                return (
                  <button key={o.id} type="button" onClick={() => setLang(o.id)}
                    className={`flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-[12px] font-bold transition ${
                      active ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] text-[#111110]" : "text-[#615D59]"
                    }`}>
                    <span className={`rounded-sm px-1 py-px text-[8.5px] font-bold tracking-[0.04em] ${
                      active ? "bg-[#084734] text-white" : "bg-[rgba(0,0,0,0.06)] text-[#615D59]"
                    }`}>{o.sub}</span>
                    {o.label}
                  </button>
                )
              })}
            </div>
          )}
          {canGenerate && (
            <button type="button" onClick={handleRegenerate} disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3.5 py-2 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:opacity-60">
              {refreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              인사이트 새로 생성
            </button>
          )}
          {view === "external" && (
            <button type="button" onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3.5 py-2 text-[12px] font-bold text-[#111110]">
              <FileDown className="h-3.5 w-3.5" />
              {lang === "zh" ? "PDF 下载" : "PDF 다운로드"}
            </button>
          )}
        </div>
      </div>

      {/* AI banner */}
      <div className="flex items-center gap-3.5 rounded-[10px] border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[#084734] text-[16px] font-bold text-white">AI</div>
        <div className="flex-1">
          <p className="text-[13px] font-bold text-[#111110]">
            {view === "internal"
              ? `${actions.length}개 액션 · 우선순위 ${highCount}건`
              : (lang === "zh" ? `${isoToWeekLabel(undefined, "zh")} 总部周报 · 自动生成` : `${isoToWeekLabel(undefined, "ko")} 본사 주간 보고서 · 자동 생성`)}
          </p>
          <p className="mt-0.5 text-[11.5px] text-[#615D59]">
            {view === "internal"
              ? (insight?.one_liner ?? "지난 4주간 매출/딜/팀 활동 분석 결과 · 마지막 업데이트: 직전 동기화 시점")
              : (lang === "zh" ? "环比上周销售/HW·SW/KA·SME 对比" : "지난 주 대비 매출 / HW·SW / 신규·갱신 비교")}
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-700">
          <span>{errorMsg}</span>
          {canGenerate && (
            <button type="button" onClick={handleRegenerate} disabled={refreshing}
              className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60">
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              다시 시도
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {showLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-[#f0f0ec]" />)}
        </div>
      ) : view === "internal" ? (
        actions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[rgba(0,0,0,0.12)] bg-[#F6F5F4] p-8 text-center text-[12px] text-[#615D59]">
            생성된 인사이트가 없습니다. 우상단 &lsquo;인사이트 새로 생성&rsquo; 버튼을 눌러보세요.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {actions.map((a, i) => <InternalInsightCard key={`${a.title}-${i}`} action={a} idx={i} />)}
          </div>
        )
      ) : (
        <ExternalReport summary={summary} lang={lang} />
      )}
    </section>
  )
}
