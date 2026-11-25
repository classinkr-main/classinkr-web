// 본사 주간 보고서 ② 자세히 보기 — 구획별 요약 수치와 회색 패널. 숫자는 문서 표가 쓰는 원천 계산 결과를 그대로 받는다
// (이 파일은 새로 계산·페치하지 않는다 — DSH · REV · Compass를 서로 더하지 않는다).
import type { ReactNode } from "react"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import type { WeeklyCompassEvaluation, WeeklyCompassFunnel, WeeklyKaCustomer } from "@/lib/branch/weekly-report-contract"
import { kstShort, rate, ratePct, wan, wan2 } from "./format"

export type SummaryLang = "zh" | "ko"

const L = {
  zh: {
    perfMonth: (m: number) => `${m}月回款 / 目标`, perfMonthRate: "月达成率", perfQ: "季累计 / 目标", perfQRate: "季达成率", wan: "万", hw: "硬件", sw: "软件",
    perfSource: "来源 1. DSH(已批准) · 完整表格请点击最小化", perfScoped: "团队/个人范围无产品拆分，仅显示合计。",
    week: "周次", planned: "计划", actual: "实际", customers: "主要客户", expectedTag: "预计", collectSource: "来源 REV 台账 · 确认=实际，高确信+预计=计划",
    customer: "客户", qConfirmed: "季确认", open: "未确认", compass: "Compass", noMatch: "无匹配", weekCount: (n: number) => `本周 ${n} 条`,
    timeline: (name: string) => `${name} · Compass 最近记录(联系方式已遮蔽)`, noRecent: "最近 30 天没有记录", kaDown: "Compass 记录暂不可用", kaEmpty: "本季度没有标记为 KA 的 REV 交易。",
    inflow: "流入", stages: { contact: "接触", consult: "咨询", demo: "演示", quote: "面谈", bd: "BD移交", won: "付款" } as Record<string, string>,
    lastWeek: "上周", prevWeek: "前一周", events: "即将举行", noEvents: "没有已登记的活动", funnelSource: "来源 Compass · 当周流入线索的当前阶段", funnelDown: "无法读取 Compass 线索漏斗。",
    s53: (q: number) => `5.3 成员 Q${q} 回款达成率`, s54: "5.4 Compass 过程评估", evalNone: "Compass 过程评估尚未连接。", evalDown: "无法加载 Compass 过程评估。", noMembers: "没有成员数据",
    loading: "加载中", summaryHead: "小结 · AI 草稿", kaHead: "KA 进展 · AI 草稿 (Compass 记录依据)", pointsHead: "5.1 本周要点 · AI 草稿", noDraft: "暂无 AI 草稿 — 生成洞察后自动填入。",
    todoHead: "本部分待办", todoNone: "没有关联待办", problem: "问题", next: "下一步",
  },
  ko: {
    perfMonth: (m: number) => `${m}월 회수 / 목표`, perfMonthRate: "월 달성률", perfQ: "분기 누계 / 목표", perfQRate: "분기 달성률", wan: "만", hw: "HW", sw: "SW",
    perfSource: "원천 1. DSH(승인) · 표 전체는 최소화하면 보입니다", perfScoped: "팀·개인 범위는 제품 분해가 없어 합계만 보입니다.",
    week: "주차", planned: "계획", actual: "실제", customers: "주요 고객", expectedTag: "예정", collectSource: "원천 REV 장부 · 확정=실제, 고확도+예정=계획",
    customer: "고객", qConfirmed: "분기 확정", open: "미확정", compass: "Compass", noMatch: "매칭 없음", weekCount: (n: number) => `이번 주 ${n}건`,
    timeline: (name: string) => `${name} · Compass 최근 기록(연락처 가림)`, noRecent: "최근 30일 기록 없음", kaDown: "Compass 기록을 읽지 못했습니다", kaEmpty: "이번 분기 KA로 표시된 REV 딜이 없습니다.",
    inflow: "유입", stages: {} as Record<string, string>,
    lastWeek: "지난 주", prevWeek: "그 전 주", events: "예정 행사", noEvents: "등록된 행사 없음", funnelSource: "원천 Compass · 그 주 유입 리드의 현재 단계", funnelDown: "Compass 리드 퍼널을 읽지 못했습니다.",
    s53: (q: number) => `5.3 멤버 Q${q} 회수 달성률`, s54: "5.4 Compass 과정 평가", evalNone: "Compass 과정 평가 연결 전입니다.", evalDown: "Compass 과정 평가를 불러오지 못했습니다.", noMembers: "멤버 데이터 없음",
    loading: "불러오는 중", summaryHead: "요약 · AI 초안", kaHead: "KA 진행 · AI 초안 (Compass 기록 근거)", pointsHead: "5.1 이번 주 요점 · AI 초안", noDraft: "AI 초안 없음 — 인사이트를 생성하면 채워집니다.",
    todoHead: "이 구획의 할 일", todoNone: "연결된 할 일 없음", problem: "문제", next: "다음",
  },
} as const

const TD = "border-b border-[#F0F0EC] px-1.5 py-1.5 align-top"
const TH = "border-b border-[#E8E8E4] px-1.5 py-1 text-left text-[11px] font-semibold text-[#615D59]"
const BAR = "flex h-2 overflow-hidden rounded bg-[#E8E8E4]"
const NOTE = "mt-2 text-[11px] text-[#615D59]"

const CONFIRMED = CONFIDENCE_TOKENS.confirmed.color
const OPEN = CONFIDENCE_TOKENS.expected.color
const PLANNED = CONFIDENCE_TOKENS.expected.color

function Bars({ items }: { items: Array<{ key: string; label: string; pct: number; text: string }> }) {
  return (
    <div className="mt-2.5 grid grid-cols-[56px_minmax(0,1fr)_52px] items-center gap-x-2.5 gap-y-1.5 text-[11.5px]">
      {items.map((item) => (
        <div key={item.key} className="contents">
          <span>{item.label}</span>
          <div className={BAR} role="img" aria-label={`${item.label} ${item.text}`}><span className="block h-full bg-[#084734]" style={{ width: `${item.pct}%` }} /></div>
          <span className="tabular-nums">{item.text}</span>
        </div>
      ))}
    </div>
  )
}

// ── 一 ────────────────────────────────────────────────────────────────────────
export interface PerfRow { key: string; label: string; goal: { month: number; quarter: number; year: number }; status: { month: number; quarter: number; year: number } }
export function PerfSummary({ rows, scoped, monthNo, lang }: { rows: PerfRow[] | null; scoped: boolean; monthNo: number; lang: SummaryLang }) {
  const t = L[lang]
  if (!rows) return <p className={NOTE}>{t.loading}</p>
  const total = rows.find((row) => row.key === "total") ?? rows[0]
  if (!total) return <p className={NOTE}>-</p>
  const cards: Array<{ label: string; main: string; sub?: string; color?: string }> = [
    { label: t.perfMonth(monthNo), main: wan(total.status.month), sub: `/ ${wan(total.goal.month)}${t.wan}` },
    { label: t.perfMonthRate, main: rate(total.status.month, total.goal.month) },
    { label: t.perfQ, main: wan(total.status.quarter), sub: `/ ${wan(total.goal.quarter)}${t.wan}`, color: CONFIRMED },
    { label: t.perfQRate, main: rate(total.status.quarter, total.goal.quarter) },
  ]
  const bars = rows.filter((row) => row.key === "hw" || row.key === "sw")
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="min-w-0 rounded-lg border border-[#E8E8E4] px-2.5 py-2">
            <span className="block text-[11px] text-[#615D59]">{card.label}</span>
            <strong className="text-[17px] tabular-nums" style={card.color ? { color: card.color } : undefined}>{card.main}</strong>
            {card.sub ? <span className="ml-1 text-[11px] tabular-nums text-[#615D59]">{card.sub}</span> : null}
          </div>
        ))}
      </div>
      {bars.length ? <Bars items={bars.map((row) => ({ key: row.key, label: row.key === "hw" ? t.hw : t.sw, pct: ratePct(row.status.month, row.goal.month), text: rate(row.status.month, row.goal.month) }))} /> : null}
      <p className={NOTE}>{t.perfSource}{scoped ? ` · ${t.perfScoped}` : ""}</p>
    </div>
  )
}

// ── 二 ────────────────────────────────────────────────────────────────────────
export interface CollectWeek { confirmed: number; pending: number; major: Array<{ key: string; customer: string; amount: number; pending: number }>; rest: number }
export function CollectSummary({ weeks, lang }: { weeks: CollectWeek[] | null; lang: SummaryLang }) {
  const t = L[lang]
  if (!weeks) return <p className={NOTE}>{t.loading}</p>
  return (
    <div>
      <table className="w-full border-collapse text-[11.5px]">
        <thead><tr><th className={TH}>{t.week}</th><th className={`${TH} text-right`}>{t.planned}</th><th className={`${TH} text-right`}>{t.actual}</th><th className={TH}>{t.customers}</th></tr></thead>
        <tbody>
          {weeks.map((week, index) => (
            <tr key={index}>
              <td className={TD}>W{index + 1}</td>
              <td className={`${TD} text-right tabular-nums`} style={week.pending > 0 ? { color: PLANNED } : undefined}>{wan(week.pending)}</td>
              <td className={`${TD} text-right tabular-nums`} style={week.confirmed > 0 ? { color: CONFIRMED } : undefined}>{wan(week.confirmed)}</td>
              <td className={TD}>{week.major.length
                ? week.major.map((c) => `${c.customer} ${wan2(c.amount)}${c.pending >= c.amount - 1 ? ` [${t.expectedTag}]` : ""}`).join(" · ")
                : <span className="text-[#615D59]">-</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={NOTE}>{t.collectSource}</p>
    </div>
  )
}

// ── 三 ────────────────────────────────────────────────────────────────────────
/** 고른 액션 문장에 고객명이 들어 있으면 그 고객, 없으면 첫 고객. */
export function pickKaCustomer(customers: readonly WeeklyKaCustomer[], text: string | null) {
  const key = (value: string) => value.replace(/\s+/g, "").toLowerCase()
  if (text) {
    const haystack = key(text)
    const hit = customers.find((customer) => key(customer.customer).length > 1 && haystack.includes(key(customer.customer)))
    if (hit) return hit
  }
  return customers[0] ?? null
}
export function KaSummary({ customers, compassState, pickedText, lang }: {
  customers: WeeklyKaCustomer[] | null; compassState?: "ready" | "down"; pickedText: string | null; lang: SummaryLang
}) {
  const t = L[lang]
  if (!customers) return <p className={NOTE}>{t.loading}</p>
  if (customers.length === 0) return <p className={NOTE}>{t.kaEmpty}</p>
  const current = pickKaCustomer(customers, pickedText)
  const recent = current?.compass?.recent ?? []
  return (
    <div>
      <table className="w-full border-collapse text-[11.5px]">
        <thead><tr><th className={TH}>{t.customer}</th><th className={`${TH} text-right`}>{t.qConfirmed}</th><th className={`${TH} text-right`}>{t.open}</th><th className={TH}>{t.compass}</th></tr></thead>
        <tbody>
          {customers.map((customer) => {
            const compass = customer.compass
            const stage = compass ? (compass.stage ? t.stages[compass.stage] : undefined) ?? compass.stageLabel ?? "-" : null
            return (
              <tr key={customer.customer} className={customer === current ? "bg-[#E8F6EF]" : undefined}>
                <td className={TD}><b>{customer.customer}</b> <span className="text-[11px] text-[#615D59]">{customer.manager ?? "-"}</span></td>
                <td className={`${TD} text-right tabular-nums`} style={customer.confirmed > 0 ? { color: CONFIRMED } : undefined}>{wan(customer.confirmed)}</td>
                <td className={`${TD} text-right tabular-nums`} style={customer.open > 0 ? { color: OPEN } : undefined}>{wan(customer.open)}</td>
                <td className={TD}>{compassState === "down" ? <span className="text-[#615D59]">{t.kaDown}</span>
                  : compass ? `${stage} · ${kstShort(compass.lastActivityAt)} · ${t.weekCount(compass.weekActivityCount)}`
                  : <span className="text-[#615D59]">{t.noMatch}</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {current ? (
        <>
          <p className="mt-3 text-[11.5px] font-bold text-[#615D59]">{t.timeline(current.customer)}</p>
          {recent.length ? (
            <ul className="m-0 mt-1 list-none p-0">
              {recent.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="grid grid-cols-[40px_minmax(0,1fr)] gap-2 py-0.5 text-[11.5px] leading-snug">
                  <span className="tabular-nums text-[#615D59]">{kstShort(entry.at)}</span>
                  <span>{entry.text}{entry.actor ? ` · ${entry.actor}` : ""}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-[11.5px] text-[#615D59]">{t.noRecent}</p>}
        </>
      ) : null}
    </div>
  )
}

// ── 四 ────────────────────────────────────────────────────────────────────────
export function MarketSummary({ funnel, events, lang }: { funnel: WeeklyCompassFunnel | null | undefined; events: Array<{ date: string; title: string }>; lang: SummaryLang }) {
  const t = L[lang]
  const eventLine = events.length ? events.map((event) => `${Number(event.date.slice(5, 7))}/${Number(event.date.slice(8, 10))} ${event.title}`).join(" · ") : t.noEvents
  if (!funnel) return <p className={NOTE}>{t.loading}</p>
  return (
    <div>
      {funnel.state !== "ready" ? <p className="text-[11.5px] text-[#8F2C2C]">{t.funnelDown}</p> : (
        <div className="grid items-end gap-x-1 gap-y-1 text-[11.5px]" style={{ gridTemplateColumns: `64px repeat(${funnel.stages.length + 1}, minmax(0, 1fr))` }}>
          <span />
          {[{ key: "inflow", label: t.inflow }, ...funnel.stages].map((stage) => <span key={stage.key} className="text-[11px] text-[#615D59]">{t.stages[stage.key] ?? stage.label}</span>)}
          <span className="text-[11px] text-[#615D59]">{t.lastWeek}</span>
          <b className="tabular-nums">{funnel.inflow.current}</b>
          {funnel.stages.map((stage) => <b key={stage.key} className="tabular-nums">{stage.current}</b>)}
          <span className="text-[11px] text-[#615D59]">{t.prevWeek}</span>
          <span className="tabular-nums">{funnel.inflow.previous}</span>
          {funnel.stages.map((stage) => <span key={stage.key} className="tabular-nums">{stage.previous}</span>)}
        </div>
      )}
      <p className={NOTE}>{t.events} · {eventLine}</p>
      <p className="mt-1 text-[11px] text-[#615D59]">{t.funnelSource}</p>
    </div>
  )
}

// ── 五 ────────────────────────────────────────────────────────────────────────
export interface MemberRows { members: Array<{ team: string; member: string; qGoal: number; qActual: number }>; total: { qGoal: number; qActual: number } | null }
export function OtherSummary({ memberRows, evaluation, quarterNo, lang }: {
  memberRows: MemberRows | null; evaluation: WeeklyCompassEvaluation | undefined; quarterNo: number; lang: SummaryLang
}) {
  const t = L[lang]
  const items = memberRows ? [
    ...memberRows.members.map((row) => ({ key: `${row.team}-${row.member}`, label: row.member, pct: ratePct(row.qActual, row.qGoal), text: rate(row.qActual, row.qGoal) })),
    ...(memberRows.total ? [{ key: "total", label: lang === "zh" ? "合计" : "합계", pct: ratePct(memberRows.total.qActual, memberRows.total.qGoal), text: rate(memberRows.total.qActual, memberRows.total.qGoal) }] : []),
  ] : []
  const evalLine = !evaluation ? t.loading
    : evaluation.state === "not_configured" ? t.evalNone
    : evaluation.state === "unavailable" ? t.evalDown
    : evaluation.people.slice(0, 4).map((person) => `${person.name} ${person.grade}(${person.rate}%)`).join(" · ") || "-"
  return (
    <div>
      <p className="text-[11.5px] font-bold text-[#615D59]">{t.s53(quarterNo)}</p>
      {!memberRows ? <p className={NOTE}>{t.loading}</p> : items.length ? <Bars items={items} /> : <p className={NOTE}>{t.noMembers}</p>}
      <p className="mt-2.5 text-[11.5px] text-[#615D59]"><b>{t.s54}</b> · {evalLine}</p>
    </div>
  )
}

// ── 회색 패널 ─────────────────────────────────────────────────────────────────
export interface PanelAction { index: number; title: string; owner: string; due?: string }
export function SectionPanel({ heading, children, actions, pickedIndex, lang }: {
  heading: string; children: ReactNode; actions: PanelAction[]; pickedIndex: number | null; lang: SummaryLang
}) {
  const t = L[lang]
  return (
    <div className={lang === "zh" ? "font-[Inter,'Noto_Sans_SC','PingFang_SC',Pretendard,system-ui,sans-serif]" : undefined}>
      <p className="mb-1.5 text-[11px] font-bold text-[#615D59]">{heading}</p>
      <div className="rounded-md border border-[#E8E8E4] bg-white px-2.5 py-2 text-[12.5px] leading-relaxed">{children}</div>
      <p className="mb-1 mt-3 text-[11px] font-bold text-[#615D59]">{t.todoHead}</p>
      {actions.length === 0 ? <p className="text-[11.5px] text-[#615D59]">{t.todoNone}</p> : (
        <ul className="m-0 list-none p-0">
          {actions.map((action) => (
            <li key={action.index} data-picked={action.index === pickedIndex ? "true" : undefined}
              className={`-mx-1.5 flex justify-between gap-2 rounded px-1.5 py-1.5 text-[12px] ${action.index === pickedIndex ? "bg-[#E8F6EF] font-bold" : "border-t border-[#E8E8E4]"}`}>
              <span className="min-w-0">{action.title}</span>
              <span className="shrink-0 text-[11.5px] font-normal tabular-nums text-[#615D59]">{[action.owner, action.due].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function summaryLabels(lang: SummaryLang) { return L[lang] }
