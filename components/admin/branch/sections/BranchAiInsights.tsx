"use client"
import { useEffect, useState } from "react"
import { Sparkles, FileDown, RefreshCw, AlertTriangle } from "lucide-react"
import type { BranchDealMixSlice, BranchSummaryResponse, Team } from "../types"
import { adminFetchJson, useBranchJson, type BranchJsonState } from "../client-api"
import { weeklyDelta, type BranchWeeklyCompassReport } from "@/lib/branch/weekly-report-contract"
import { cny } from "@/lib/branch/money-format"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"

interface NextAction { title: string; why: string; owner: string; due?: string }

interface InsightPayload {
  id: string
  one_liner: string | null
  next_actions: NextAction[]
  generated_at: string
  fiscal_period?: string
  raw_response?: { _model?: string; _mode?: string; _retried?: boolean; _warnings?: unknown[]; _report_notes?: unknown; _compass_week?: string | null } | null
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

type ReportText = {
  eyebrow: string; title: string; managerLabel: string; issued: string
  period: (since: string, until: string) => string; pendingWeek: string
  aiSection: string; aiPending: string; aiStale: string
  sectionRevenue: string; revenueLabel: string; goalLabel: string; achievementLabel: string
  revenueLine: (pct: string, open: string) => string; revenueNote: string
  weekConfirmed: (thisWeek: string, lastWeek: string) => string; mixHwSw: string; mixNewRenew: string; mixNote: string
  sectionKa: string; kaShare: (ka: string, share: string) => string; kaSme: (sme: string) => string; kaPrev: (pct: string) => string
  kaWeek: (thisWeek: string, lastWeek: string) => string; kaQuarter: (quarter: string, n: number) => string
  kaCustomer: string; kaConfirmed: string; kaOpen: string; kaEmpty: string; kaNote: string
  sectionKpi: string; sheetKpi: string; compassEval: (month: string) => string
  sectionActivity: string; activityScope: (scope: string) => string; activityDown: string; activityLoading: string
  inflow: string; lost: string; lastWeek: string; prevWeek: string; owner: string; demo: string; won: string
  unassigned: (n: number) => string; lostReasons: string; truncated: string; activityNote: string
  sectionEvaluation: (month: string) => string; evaluationNotConfigured: string; evaluationUnavailable: string; evaluationEmpty: string
  closed: string; live: string; weakest: string
  sectionCompany: string; eventsLabel: string; campaignsLabel: string; openRate: string
  noRisk: string; achievement: string
  footerL: string; footerR: string
}

const REPORT_TEXT: Record<Lang, ReportText> = {
  ko: {
    eyebrow: "CLASSIN · KR BRANCH · 전체팀 통합", title: "본사 주간 보고서", managerLabel: "지사장", issued: "발행일",
    period: (since, until) => `보고 기간 ${since} ~ ${until} · 그 전 주 대비`, pendingWeek: "보고 주를 불러오는 중",
    aiSection: "AI 요약", aiPending: "AI 요약이 아직 없습니다 — 왼쪽 '인사이트 새로 생성'으로 만듭니다(매출 · KA · 주요 영업 활동 · KPI 4줄).", aiStale: "이 요약은 다른 주 기준으로 만들어졌습니다",
    sectionRevenue: "1. 매출 개요 · REV", revenueLabel: "확정 매출", goalLabel: "목표", achievementLabel: "달성률",
    revenueLine: (pct, open) => `이번 기 KR 지사 매출은 목표 대비 ${pct}% 달성. 잔여 목표 ¥${open}.`, revenueNote: "확정: REV 장부 · 목표: 1. DSH(승인)",
    weekConfirmed: (a, b) => `주간 확정(첫 결제 주 기준) 이번 주 ¥${a} · 지난 주 ¥${b}`, mixHwSw: "HW / SW", mixNewRenew: "신규 / 갱신", mixNote: "제품·신규/갱신 분해는 DSH 전사 실적",
    sectionKa: "2. KA · 핵심 고객", kaShare: (ka, share) => `KA 확정 ¥${ka} · REV 확정의 ${share}%`, kaSme: (sme) => `SME ¥${sme}`, kaPrev: (pct) => `전기 대비 ${pct}`,
    kaWeek: (a, b) => `KA 주간 확정 이번 주 ¥${a} · 지난 주 ¥${b}`, kaQuarter: (q, n) => `${q} KA 고객 ${n}곳 · 확정과 미확정(고확도·예정)`,
    kaCustomer: "고객", kaConfirmed: "확정", kaOpen: "미확정", kaEmpty: "이번 분기 KA로 표시된 REV 딜이 없습니다.", kaNote: "KA = REV 장부 '중요도' KA. 매출 장부와 같은 확정 기준.",
    sectionKpi: "4. KPI", sheetKpi: "시트 영업 KPI 병목 · BD", compassEval: (month) => `Compass 과정 평가 ${month}`,
    sectionActivity: "3. 주요 영업 활동 · Compass", activityScope: (scope) => `${scope} · 그 주 유입 리드의 현재 단계`, activityDown: "Compass 리드 퍼널을 읽지 못해 이번 주 활동 비교를 생략합니다.", activityLoading: "Compass 활동을 불러오는 중",
    inflow: "유입", lost: "종료", lastWeek: "지난 주", prevWeek: "그 전 주", owner: "담당", demo: "데모", won: "결제",
    unassigned: (n) => `미배정 유입 ${n}건`, lostReasons: "종료 사유", truncated: "조회 상한에 닿아 'N건 이상'으로 읽습니다.", activityNote: "매출이 아닌 리드 단계 수입니다(매출과 더하지 않음). 그 전 주 유입은 한 주 더 진행돼 뒷단계 수가 커 보일 수 있습니다.",
    sectionEvaluation: (month) => `Compass 과정 평가 ${month}`, evaluationNotConfigured: "Compass 과정 평가 연결 전입니다.", evaluationUnavailable: "Compass 과정 평가를 불러오지 못했습니다.", evaluationEmpty: "평가 대상이 없습니다.",
    closed: "마감", live: "진행 중", weakest: "약한 항목",
    sectionCompany: "전사 참고", eventsLabel: "기간 행사", campaignsLabel: "캠페인", openRate: "평균 오픈율",
    noRisk: "주요 병목 없음", achievement: "달성률",
    footerL: "Classin Korea · 원천: REV 장부 · 1. DSH · Compass(서로 합산하지 않음)", footerR: "본 보고서는 본사 송부용으로 작성됨",
  },
  zh: {
    eyebrow: "CLASSIN · KR 韩国分公司 · 全团队综合", title: "总部周报", managerLabel: "分公司负责人", issued: "签发日",
    period: (since, until) => `报告期间 ${since} ~ ${until} · 与前一周对比`, pendingWeek: "正在加载报告周",
    aiSection: "AI 摘要", aiPending: "尚无 AI 摘要 — 请在左侧点击“重新生成”。", aiStale: "此摘要基于其他周的数据生成",
    sectionRevenue: "1. 销售概况 · REV", revenueLabel: "确认营收", goalLabel: "目标", achievementLabel: "达成率",
    revenueLine: (pct, open) => `本期 KR 分公司销售额达成目标的 ${pct}%。剩余目标 ¥${open}。`, revenueNote: "确认: REV 台账 · 目标: 1. DSH(已批准)",
    weekConfirmed: (a, b) => `每周确认(按首次付款周) 本周 ¥${a} · 上周 ¥${b}`, mixHwSw: "HW / SW", mixNewRenew: "新签 / 续约", mixNote: "产品·新签/续约拆分为 DSH 全公司实绩",
    sectionKa: "2. KA · 核心客户", kaShare: (ka, share) => `KA 确认 ¥${ka} · 占 REV 确认的 ${share}%`, kaSme: (sme) => `SME ¥${sme}`, kaPrev: (pct) => `环比上期 ${pct}`,
    kaWeek: (a, b) => `KA 每周确认 本周 ¥${a} · 上周 ¥${b}`, kaQuarter: (q, n) => `${q} KA 客户 ${n} 家 · 已确认与未确认(高确信·预计)`,
    kaCustomer: "客户", kaConfirmed: "确认", kaOpen: "未确认", kaEmpty: "本季度没有标记为 KA 的 REV 交易。", kaNote: "KA = REV 台账“重要度”KA，确认口径与销售台账相同。",
    sectionKpi: "4. KPI", sheetKpi: "表格销售 KPI 瓶颈 · BD", compassEval: (month) => `Compass 过程评估 ${month}`,
    sectionActivity: "3. 主要销售活动 · Compass", activityScope: (scope) => `${scope} · 当周流入线索的当前阶段`, activityDown: "无法读取 Compass 线索漏斗，本周活动对比从略。", activityLoading: "正在加载 Compass 活动",
    inflow: "流入", lost: "关闭", lastWeek: "上周", prevWeek: "前一周", owner: "负责人", demo: "演示", won: "付款",
    unassigned: (n) => `未分配流入 ${n} 条`, lostReasons: "关闭原因", truncated: "已达查询上限，数值应读作“至少 N 条”。", activityNote: "此为线索阶段数，非营收(不与营收相加)。前一周流入的线索多进展了一周，后段数量可能偏高。",
    sectionEvaluation: (month) => `Compass 过程评估 ${month}`, evaluationNotConfigured: "Compass 过程评估尚未连接。", evaluationUnavailable: "无法加载 Compass 过程评估。", evaluationEmpty: "无评估对象。",
    closed: "已结算", live: "进行中", weakest: "薄弱项",
    sectionCompany: "全公司参考", eventsLabel: "期间活动", campaignsLabel: "营销活动", openRate: "平均打开率",
    noRisk: "无重大瓶颈", achievement: "达成率",
    footerL: "Classin Korea · 来源: REV 台账 · 1. DSH · Compass(互不相加)", footerR: "本报告供总部送呈用",
  },
}

function shortDate(ymd: string) {
  const [, m, d] = ymd.split("-")
  return `${Number(m)}/${Number(d)}`
}

/** 증감 — lowerIsBetter(종료 등)는 줄어든 쪽을 좋은 색으로 칠한다. */
function Delta({ current, previous, lowerIsBetter = false }: { current: number; previous: number; lowerIsBetter?: boolean }) {
  const { diff } = weeklyDelta(current, previous)
  if (diff === 0) return <span className="text-[11px] text-[#615D59]">±0</span>
  const good = lowerIsBetter ? diff < 0 : diff > 0
  return <span className={`text-[11px] font-semibold ${good ? "text-[#084734]" : "text-[#B43E3E]"}`}>{diff > 0 ? "▲" : "▼"} {Math.abs(diff)}</span>
}

function ExternalReport({ summary, lang, weekly, notes, notesWeek }: {
  summary: BranchSummaryResponse | null
  lang: Lang
  weekly: BranchJsonState<BranchWeeklyCompassReport>
  /** AI가 쓴 보고서 4줄(매출 · KA · 주요 영업 활동 · KPI, raw_response._report_notes). 없으면 빈 배열. */
  notes: string[]
  /** 그 줄을 만들 때 입력한 Compass 보고 주 라벨 — 지금 보고 주와 다르면 표시한다. */
  notesWeek: string | null
}) {
  const t = REPORT_TEXT[lang]
  const issuedDate = new Date().toISOString().slice(0, 10).replace(/-/g, ".")
  const report = weekly.data
  const weekLabel = report?.week.label ?? null

  if (!summary) return <div className="h-96 animate-pulse rounded-xl bg-[#f0f0ec]" />

  const rev = summary.revenue
  const open = Math.max(0, rev.goal - rev.confirmed)
  const funnel = report?.funnel
  const evaluation = report?.evaluation
  const mix = summary.deal_mix
  const sumWeek = (slices: BranchDealMixSlice[] | undefined, key: "week_actual" | "prev_week_actual") =>
    slices && slices.some((slice) => slice[key] != null) ? slices.reduce((total, slice) => total + (slice[key] ?? 0), 0) : null
  const weekThis = mix?.meta?.by_category.weekly_available ? sumWeek(mix.by_category, "week_actual") : null
  const weekLast = mix?.meta?.by_category.weekly_available ? sumWeek(mix.by_category, "prev_week_actual") : null
  const pair = (slices: BranchDealMixSlice[] | undefined, a: string, b: string) => {
    const first = slices?.find((slice) => slice.name === a)
    const second = slices?.find((slice) => slice.name === b)
    return first && second ? { a: first, b: second } : null
  }
  const hwSw = pair(mix?.by_category, "Hardware", "Software")
  const newRenew = pair(mix?.by_status_type, "New", "Renew")
  const segment = pair(mix?.by_segment, "KA", "SME")
  // 비중 분모는 같은 기간·같은 확정 캐논의 REV 확정 전체다(KA·SME 표시가 없는 딜이 많아 KA+SME를 분모로 쓰면 100%처럼 보인다).
  const kaSharePct = segment && rev.confirmed > 0 ? (segment.a.actual / rev.confirmed) * 100 : null
  const kaPrevPct = segment && segment.a.prev_actual ? ((segment.a.actual - segment.a.prev_actual) / segment.a.prev_actual) * 100 : null
  const ka = report?.ka
  const scopeLabel = report?.scope.manager
    ? report.scope.manager
    : report?.scope.team && report.scope.team !== "ALL" ? report.scope.team : lang === "zh" ? "全体" : "전체"

  return (
    <div className="min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-6 py-6"
      style={{ fontFamily: lang === "zh" ? 'Inter, "Noto Sans SC", "PingFang SC", system-ui, sans-serif' : 'Inter, Pretendard, system-ui, sans-serif' }}>
      {/* Letterhead */}
      <div className="border-b-2 border-[#084734] pb-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold tracking-[0.12em] text-[#084734]">{t.eyebrow}</p>
            <p className="mt-1.5 text-[22px] font-bold tracking-[-0.02em] text-[#111110]">{t.title}{weekLabel ? ` · ${weekLabel}` : ""}</p>
            <p className="mt-1 text-[11px] text-[#615D59]">{report ? t.period(shortDate(report.week.startDate), shortDate(report.week.endDate)) : t.pendingWeek}</p>
          </div>
          <div className="text-right">
            <p className="text-[10.5px] text-[#615D59]">{t.managerLabel}</p>
            <p className="mt-0.5 text-[14px] font-bold text-[#111110]">{lang === "zh" ? "文俊赫" : "문준혁"}</p>
            <p className="mt-1.5 text-[10.5px] text-[#615D59]">{t.issued} {issuedDate}</p>
          </div>
        </div>
      </div>

      {/* AI summary — 모델이 쓴 4줄(보고 순서와 같음). 숫자는 아래 구획(코드 계산)이 정본이다. */}
      <section className="mt-5">
        <h3 className="flex items-baseline gap-2 text-[14px] font-bold text-[#111110]">{t.aiSection}
          {notes.length > 0 && notesWeek && weekLabel && notesWeek !== weekLabel ? <span className="text-[11px] font-medium text-[#7A520F]">{t.aiStale} ({notesWeek})</span> : null}
        </h3>
        {notes.length > 0 ? (
          <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-[#111110]">
            {notes.map((note, index) => <li key={index} className="flex gap-2"><span className="text-[#615D59]">{index + 1}.</span><span>{note}</span></li>)}
          </ul>
        ) : <p className="mt-2 text-[12px] text-[#615D59]">{t.aiPending}</p>}
      </section>

      {/* 1. Revenue (REV) */}
      <section className="mt-6">
        <h3 className="text-[14px] font-bold text-[#111110]">{t.sectionRevenue}</h3>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          <div className="rounded-lg bg-[#F6F5F4] p-3">
            <p className="text-[10.5px] text-[#615D59]">{t.revenueLabel}</p>
            <p className="mt-1 text-[17px] font-bold leading-none tracking-[-0.01em]" style={{ color: CONFIDENCE_TOKENS.confirmed.color }}>¥{cny(rev.confirmed)}</p>
          </div>
          <div className="rounded-lg bg-[#F6F5F4] p-3">
            <p className="text-[10.5px] text-[#615D59]">{t.goalLabel}</p>
            <p className="mt-1 text-[17px] font-bold leading-none tracking-[-0.01em] text-[#111110]">¥{cny(rev.goal)}</p>
          </div>
          <div className="rounded-lg bg-[#F6F5F4] p-3">
            <p className="text-[10.5px] text-[#615D59]">{t.achievementLabel}</p>
            {/* Status 3단(Success/Warning/Danger) — 팀 색을 페이싱 등급에 쓰지 않는다. */}
            <p className="mt-1 text-[17px] font-bold leading-none" style={{ color: rev.pacing_pct >= 90 ? "#084734" : rev.pacing_pct >= 70 ? "#A8741A" : "#B43E3E" }}>
              {rev.pacing_pct.toFixed(0)}%
            </p>
          </div>
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-[#615D59]">{t.revenueLine(rev.pacing_pct.toFixed(0), cny(open))} <span className="text-[11px]">({t.revenueNote})</span></p>
        <ul className="mt-2 space-y-1 text-[12px] tabular-nums text-[#111110]">
          {weekThis != null && weekLast != null ? <li>{t.weekConfirmed(cny(weekThis), cny(weekLast))}</li> : null}
          {hwSw ? <li>{t.mixHwSw} ¥{cny(hwSw.a.actual)} / ¥{cny(hwSw.b.actual)}</li> : null}
          {newRenew ? <li>{t.mixNewRenew} ¥{cny(newRenew.a.actual)} / ¥{cny(newRenew.b.actual)} <span className="text-[11px] text-[#615D59]">({t.mixNote})</span></li> : null}
        </ul>
      </section>

      {/* 2. KA — 매출 다음으로 가장 중요한 구획. 기간 분해는 summary, 분기 고객 표는 주간 보고 API(REV 딜 importance=KA). */}
      <section className="mt-6">
        <h3 className="text-[14px] font-bold text-[#111110]">{t.sectionKa}</h3>
        {segment ? (
          <p className="mt-2 text-[12.5px] tabular-nums text-[#111110]">
            <b style={{ color: CONFIDENCE_TOKENS.confirmed.color }}>{kaSharePct != null ? t.kaShare(cny(segment.a.actual), kaSharePct.toFixed(0)) : `KA ¥${cny(segment.a.actual)}`}</b>
            {segment.b.actual > 0 ? <span className="ml-2 text-[11.5px] text-[#615D59]">{t.kaSme(cny(segment.b.actual))}</span> : null}
            {kaPrevPct != null ? <span className="ml-2 text-[11.5px] text-[#615D59]">{t.kaPrev(`${kaPrevPct >= 0 ? "+" : ""}${kaPrevPct.toFixed(0)}%`)}</span> : null}
          </p>
        ) : null}
        {segment && segment.a.week_actual != null && segment.a.prev_week_actual != null ? (
          <p className="mt-1 text-[12px] tabular-nums text-[#615D59]">{t.kaWeek(cny(segment.a.week_actual), cny(segment.a.prev_week_actual))}</p>
        ) : null}
        {weekly.error && !report ? <p role="alert" className="mt-2 text-[12px] text-[#8F2C2C]">{weekly.error}</p>
          : !ka ? <p role="status" className="mt-2 text-[12px] text-[#615D59]">{t.activityLoading}</p>
          : ka.customerCount === 0 ? <p className="mt-2 text-[12px] text-[#615D59]">{t.kaEmpty}</p>
          : (
            <>
              <p className="mt-2 text-[11px] text-[#615D59]">{t.kaQuarter(ka.quarter, ka.customerCount)} · ¥{cny(ka.confirmed)} / ¥{cny(ka.open)}</p>
              <table className="mt-1.5 w-full border-collapse text-[12px] tabular-nums">
                <thead>
                  <tr className="text-[10.5px] text-[#615D59]">
                    <th className="py-1 text-left font-semibold">{t.kaCustomer}</th>
                    <th className="py-1 text-left font-semibold">{t.owner}</th>
                    <th className="py-1 text-right font-semibold">{t.kaConfirmed}</th>
                    <th className="py-1 text-right font-semibold">{t.kaOpen}</th>
                  </tr>
                </thead>
                <tbody>
                  {ka.customers.map((customer) => (
                    <tr key={customer.customer} className="border-t border-[#F0F0EC]">
                      <td className="py-1.5 text-[#111110]">{customer.customer}{customer.deals > 1 ? <span className="ml-1 text-[11px] text-[#615D59]">{customer.deals}</span> : null}</td>
                      <td className="py-1.5 text-[#615D59]">{customer.manager ?? "—"}</td>
                      <td className="py-1.5 text-right font-bold" style={{ color: CONFIDENCE_TOKENS.confirmed.color }}>¥{cny(customer.confirmed)}</td>
                      <td className="py-1.5 text-right text-[#111110]">¥{cny(customer.open)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1.5 text-[11px] text-[#615D59]">{t.kaNote}</p>
            </>
          )}
      </section>

      {/* 3. Main sales activity (Compass funnel) */}
      <section className="mt-6">
        <h3 className="text-[14px] font-bold text-[#111110]">{t.sectionActivity}</h3>
        {weekly.error && !report ? <p role="alert" className="mt-2 text-[12px] text-[#8F2C2C]">{t.activityDown}</p>
          : !funnel ? <p role="status" className="mt-2 text-[12px] text-[#615D59]">{t.activityLoading}</p>
          : funnel.state !== "ready" ? <p role="alert" className="mt-2 text-[12px] text-[#8F2C2C]">{t.activityDown}</p>
          : (
            <>
              <p className="mt-1 text-[11px] text-[#615D59]">{t.activityScope(scopeLabel)}</p>
              <table className="mt-2 w-full border-collapse text-[12px] tabular-nums">
                <thead>
                  <tr className="text-[10.5px] text-[#615D59]">
                    <th className="py-1 text-left font-semibold" />
                    <th className="py-1 text-right font-semibold">{t.lastWeek}</th>
                    <th className="py-1 text-right font-semibold">{t.prevWeek}</th>
                    <th className="w-14 py-1 text-right font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {[{ key: "inflow", label: t.inflow, ...funnel.inflow }, ...funnel.stages, { key: "lost", label: t.lost, ...funnel.lost }].map((row) => (
                    <tr key={row.key} className="border-t border-[#F0F0EC]">
                      <td className="py-1.5 text-[#111110]">{row.label}</td>
                      <td className="py-1.5 text-right font-bold text-[#111110]">{row.current}</td>
                      <td className="py-1.5 text-right text-[#615D59]">{row.previous}</td>
                      <td className="py-1.5 text-right"><Delta current={row.current} previous={row.previous} lowerIsBetter={row.key === "lost"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {funnel.owners.length > 0 ? (
                <table className="mt-3 w-full border-collapse text-[12px] tabular-nums">
                  <thead>
                    <tr className="text-[10.5px] text-[#615D59]">
                      <th className="py-1 text-left font-semibold">{t.owner}</th>
                      <th className="py-1 text-right font-semibold">{t.inflow}</th>
                      <th className="py-1 text-right font-semibold">{t.demo}</th>
                      <th className="py-1 text-right font-semibold">BD</th>
                      <th className="py-1 text-right font-semibold">{t.won}</th>
                      <th className="py-1 text-right font-semibold">{t.lost}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.owners.map((owner) => (
                      <tr key={owner.name} className="border-t border-[#F0F0EC]">
                        <td className="py-1.5 text-[#111110]">{owner.name}</td>
                        <td className="py-1.5 text-right">{owner.inflow}</td>
                        <td className="py-1.5 text-right">{owner.demo}</td>
                        <td className="py-1.5 text-right">{owner.bd}</td>
                        <td className="py-1.5 text-right">{owner.won}</td>
                        <td className="py-1.5 text-right text-[#615D59]">{owner.lost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <p className="mt-2 text-[11px] leading-relaxed text-[#615D59]">
                {[
                  funnel.unassigned ? t.unassigned(funnel.unassigned) : null,
                  funnel.lostReasons.length ? `${t.lostReasons}: ${funnel.lostReasons.map((r) => `${r.label} ${r.count}`).join(", ")}` : null,
                  funnel.truncated ? t.truncated : null,
                  t.activityNote,
                ].filter(Boolean).join(" · ")}
              </p>
            </>
          )}
      </section>

      {/* 4. KPI — 시트 영업 KPI 병목(BD) + Compass 월간 과정 평가. 서로 다른 원천이라 따로 적는다. */}
      <section className="mt-6">
        <h3 className="text-[14px] font-bold text-[#111110]">{t.sectionKpi}</h3>
        <div className="mt-2.5 border-l-2 border-[#B43E3E] py-1 pl-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B43E3E]" aria-hidden="true" />
            <div>
              <p className="text-[12.5px] font-bold text-[#B43E3E]">{t.sheetKpi}</p>
              <p className="mt-0.5 text-[12px] text-[#111110]">
                {summary.bottleneck.metric ?? t.noRisk}
                {summary.bottleneck.worst_member && ` · ${summary.bottleneck.worst_member}`}
                <span className="ml-2 text-[11.5px] text-[#615D59]">{t.achievement} {summary.bottleneck.pct.toFixed(0)}%</span>
              </p>
            </div>
          </div>
        </div>
        <h4 className="mt-3 text-[12.5px] font-bold text-[#111110]">{t.sectionEvaluation(evaluation?.month ?? "")}
          {evaluation?.basis ? <span className="ml-2 text-[11px] font-medium text-[#615D59]">{evaluation.basis === "closed" ? t.closed : t.live}</span> : null}
        </h4>
        {!evaluation ? <p role="status" className="mt-2 text-[12px] text-[#615D59]">{t.activityLoading}</p>
          : evaluation.state === "not_configured" ? <p className="mt-2 text-[12px] text-[#615D59]">{t.evaluationNotConfigured}</p>
          : evaluation.state === "unavailable" ? <p role="alert" className="mt-2 text-[12px] text-[#8F2C2C]">{t.evaluationUnavailable}</p>
          : evaluation.people.length === 0 ? <p className="mt-2 text-[12px] text-[#615D59]">{t.evaluationEmpty}</p>
          : (
            <ul className="mt-2 divide-y divide-[#F0F0EC] text-[12px]">
              {evaluation.people.map((person) => (
                <li key={person.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-1.5">
                  <span className="text-[#111110]">{person.name}{person.team ? <span className="ml-1 text-[11px] text-[#615D59]">{person.team}</span> : null}</span>
                  <span className={`text-right font-bold tabular-nums ${person.rate < 50 ? "text-[#B43E3E]" : "text-[#111110]"}`}>{person.rate}% · {person.grade}</span>
                  {person.weakest.length ? (
                    <span className="col-span-2 text-[11px] text-[#615D59]">{t.weakest}: {person.weakest.map((w) => `${w.label} ${w.rate}%`).join(", ")}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
      </section>

      {/* Company-wide reference (events · campaigns) */}
      <section className="mt-6">
        <h3 className="text-[13px] font-bold text-[#615D59]">{t.sectionCompany}</h3>
        <p className="mt-1.5 text-[12px] text-[#111110]">
          {t.eventsLabel} {summary.events_30d.count}{lang === "zh" ? "次" : "건"} · {t.campaignsLabel} {summary.campaigns_30d.count}{lang === "zh" ? "次" : "건"} · {t.openRate} {summary.campaigns_30d.avg_open_pct.toFixed(0)}%
        </p>
      </section>

      <div className="mt-8 flex flex-wrap justify-between gap-2 border-t border-[rgba(0,0,0,0.08)] pt-4 text-[10.5px] text-[#615D59]">
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

  // 본사 주간 보고의 Compass 구획 — 끝난 주 리드 퍼널 + 월간 과정 평가(AI 입력과 같은 조립 함수).
  const weekly = useBranchJson<BranchWeeklyCompassReport>(
    `/api/admin/branch/weekly-report?team=${team}${manager ? `&manager=${encodeURIComponent(manager)}` : ""}`,
    refreshKey,
  )
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
  const rawNotes = insight?.raw_response?._report_notes
  const reportNotes = Array.isArray(rawNotes) ? rawNotes.filter((note): note is string => typeof note === "string" && note.trim() !== "") : []

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
          <ExternalReport summary={summary} lang={lang} weekly={weekly} notes={reportNotes} notesWeek={insight?.raw_response?._compass_week ?? null} />
        </section>
      </div>
    </section>
  )
}
