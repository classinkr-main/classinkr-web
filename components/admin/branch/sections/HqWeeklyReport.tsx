"use client"
// KR Team 본사 주간 보고서(韩国业务周报) — 본사 양식(Flowin 'New周报模版', 2026-10-26 실제 보고서)을 그대로 따른다.
//   一、财年业绩进展表       — DSH(1. DSH) 제품별 회수 목표·누계·달성률(월·분기·연)
//   二、本月收款计划与实施情况 — REV 장부 이번 달 주차별 계획·실제 회수와 고객 명세
//   三、重点KA客户情况跟进     — REV importance=KA 고객(이번 분기) + 진행 서술
//   四、市场活动计划统计表     — 행사 일정 + Compass 리드 퍼널(지난 주 vs 그 전 주)
//   五、其它情况              — 이번 주 요점(AI) · 다음 주 계획(AI) · 분기 팀/멤버 회수 · Compass 과정 평가
// 숫자는 전부 코드가 원천에서 계산한다(DSH · REV · Compass를 서로 더하지 않는다). 서술 칸은 AI 간이 보고(weekly_report —
// 같은 틀로 쓴 초안, KA 진행은 Compass 기록 근거) 또는 직접 입력이며, 우선순위는 직접 입력 > AI 초안 > 자동 기본값이다.
// 입력은 이 브라우저에만 저장된다(공유·서버 저장 아님). 표 복사로 Flowin에 붙여 넣거나 PDF로 내보낸다.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ClipboardCopy, FileDown } from "lucide-react"
import { dedupeDshByKind } from "@/lib/branch/dsh-dedupe"
import { fiscalQuarter } from "@/lib/branch/fiscal"
import { classifySalesLedgerProductCategory } from "@/lib/branch/product-category"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"
import { isCurrentBranchTeam } from "@/lib/branch/current-organization"
import type { BranchWeeklyCompassReport, ReportModule, WeeklyKaCompass, WeeklyReportDraft } from "@/lib/branch/weekly-report-contract"
import { useBranchJson, type BranchJsonState } from "../client-api"
import { buildDshTeamGrid, dshTotalsFromRows, type DshNumbers } from "../ledger/dsh-derive"
import { rowMonthAmount, rowMonthConfirmed, rowWeeklySplit, type LedgerRevenueRow } from "../ledger/shared"
import type { BranchPipelineResponse, BranchSummaryResponse, Team } from "../types"

export type ReportLang = "zh" | "ko"

export interface ReportAction { title: string; why?: string; owner: string; due?: string; module?: ReportModule }

const T = {
  zh: {
    title: "韩国业务周报", period: (a: string, b: string) => `报告周 ${a} ~ ${b}`, issued: "签发日",
    s1: (m: number) => `一、财年业绩进展表(${m}月)`, product: "产品", metric: "指标", collect: "回款",
    monthGoal: "月目标", monthActual: "月累计", monthRate: "月达成率", qGoal: "季目标", qActual: "季累计", qRate: "季达成率",
    yGoal: "年目标", yActual: "年累计", yRate: "年达成率", hw: "硬件", sw: "软件", other: "其它", total: "合计",
    s1Unit: "单位：万元(CNY) · 来源：1. DSH(已批准)", s1Scoped: "团队/个人范围无产品拆分，仅显示合计。",
    s2: "二、本月收款计划与实施情况（按每周进度）", week: "周次", planned: "计划回款", actual: "实际回款", detail: "客户明细", note: "情况说明",
    s2Unit: "单位：万元 · 来源：REV 台账(确认=实际，高确信+预计=计划)", smallRest: (v: string) => `其他小额${v}`, expectedTag: "预计",
    newCustomer: "新客", renew: "续费", hwShort: "硬件", swShort: "软件",
    s3: "三、重点KA客户情况跟进", s3Stages: "客户盘点阶段：从触达 → 拜访 → 方案 → 试用 → 商机推进 → 签约。",
    customer: "项目/客户", stage: "阶段", change: "本周阶段变化", issue: "现存问题", next: "下一步落地动作", hq: "总部支持",
    kaAmount: (c: string, o: string) => `本季确认 ${c} · 未确认 ${o}`, kaEmpty: "本季度没有标记为 KA 的 REV 交易。", stageSigned: "签约", stagePush: "商机推进",
    s4: "四、市场活动计划统计表", no: "序号", activity: "活动名称", type: "类型", time: "时间", targetCount: "目标客户数", budget: "预算", owner: "负责人", output: "预期产出",
    addRow: "+ 添加一行", s4Funnel: "4.2 线索漏斗 · Compass(上周 vs 前一周，当周流入线索的当前阶段)", inflow: "流入", lastWeek: "上周", prevWeek: "前一周", compassDown: "无法读取 Compass 线索漏斗。",
    s5: "五、其它情况", s51: "5.1 本周要点", s52: "5.2 下周主要计划", priority: "优先级", plan: "下周主要计划", module: "对应模块", deadline: "截止时间",
    s53: (q: number) => `5.3 Q${q} 团队收款与目标`, team: "团队", member: "成员", qGoalCol: (q: number) => `Q${q}目标`, qActualCol: (q: number) => `Q${q}累计收款`, qRateCol: (q: number) => `Q${q}达成率`,
    s53Unit: "单位：CNY · 来源：1. DSH 成员行", monthCol: (m: number) => `${m}月 收款/目标`, monthRateCol: (m: number) => `${m}月达成率`, s54: "5.4 过程评估 · Compass", evalNotConfigured: "Compass 过程评估尚未连接。", evalUnavailable: "无法加载 Compass 过程评估。",
    aiDraft: "AI 草稿", editHint: "灰底单元格可直接编辑，仅保存在本浏览器。", loading: "加载中", copy: "复制表格", copied: "已复制", pdf: "PDF 下载",
    modules: { KA: "KA", market: "市场活动", partner: "合作伙伴·公立教育", other: "其它" },
    summaryLine: "小结", compassMatch: (stage: string, last: string, week: number) => `Compass ${stage} · 最近记录 ${last} · 本周 ${week} 条`,
    compassNone: "Compass 未匹配到线索", compassKaDown: "Compass 记录暂不可用，KA 进展无草稿。", nameMatch: "按客户名匹配",
    draftStale: (w: string) => `AI 草稿基于 ${w}，与本报告周不同，请重新生成洞察。`, draftNone: "暂无 AI 草稿 — 生成洞察后自动填入。",
    stageLabels: { contact: "接触", consult: "咨询", demo: "演示", quote: "面谈", bd: "BD移交", won: "付款" } as Record<string, string>,
  },
  ko: {
    title: "한국 업무 주간 보고", period: (a: string, b: string) => `보고 주 ${a} ~ ${b}`, issued: "발행일",
    s1: (m: number) => `1. 회계연도 실적 진척표(${m}월)`, product: "제품", metric: "지표", collect: "회수",
    monthGoal: "월 목표", monthActual: "월 누계", monthRate: "월 달성률", qGoal: "분기 목표", qActual: "분기 누계", qRate: "분기 달성률",
    yGoal: "연 목표", yActual: "연 누계", yRate: "연 달성률", hw: "하드웨어", sw: "소프트웨어", other: "기타", total: "합계",
    s1Unit: "단위: 만 위안(CNY) · 원천: 1. DSH(승인)", s1Scoped: "팀·개인 범위는 제품 분해가 없어 합계만 보입니다.",
    s2: "2. 이번 달 회수 계획과 실행(주차별)", week: "주차", planned: "계획 회수", actual: "실제 회수", detail: "고객 명세", note: "상황 설명",
    s2Unit: "단위: 만 위안 · 원천: REV 장부(확정=실제, 고확도+예정=계획)", smallRest: (v: string) => `기타 소액 ${v}`, expectedTag: "예정",
    newCustomer: "신규", renew: "갱신", hwShort: "HW", swShort: "SW",
    s3: "3. 핵심 KA 고객 진행", s3Stages: "단계: 터치 → 방문 → 제안 → 시범 → 영업 추진 → 계약",
    customer: "고객", stage: "단계", change: "이번 주 변화", issue: "현재 문제", next: "다음 액션", hq: "본사 지원",
    kaAmount: (c: string, o: string) => `이번 분기 확정 ${c} · 미확정 ${o}`, kaEmpty: "이번 분기 KA로 표시된 REV 딜이 없습니다.", stageSigned: "계약", stagePush: "영업 추진",
    s4: "4. 마케팅 활동 계획", no: "번호", activity: "활동명", type: "유형", time: "시간", targetCount: "목표 고객 수", budget: "예산", owner: "담당", output: "예상 산출",
    addRow: "+ 행 추가", s4Funnel: "4.2 리드 퍼널 · Compass(지난 주 vs 그 전 주, 그 주 유입 리드의 현재 단계)", inflow: "유입", lastWeek: "지난 주", prevWeek: "그 전 주", compassDown: "Compass 리드 퍼널을 읽지 못했습니다.",
    s5: "5. 기타", s51: "5.1 이번 주 요점", s52: "5.2 다음 주 주요 계획", priority: "우선순위", plan: "다음 주 계획", module: "모듈", deadline: "마감",
    s53: (q: number) => `5.3 Q${q} 팀 회수와 목표`, team: "팀", member: "구성원", qGoalCol: (q: number) => `Q${q} 목표`, qActualCol: (q: number) => `Q${q} 누계 회수`, qRateCol: (q: number) => `Q${q} 달성률`,
    s53Unit: "단위: CNY · 원천: 1. DSH 구성원 행", monthCol: (m: number) => `${m}월 회수/목표`, monthRateCol: (m: number) => `${m}월 달성률`, s54: "5.4 과정 평가 · Compass", evalNotConfigured: "Compass 과정 평가 연결 전입니다.", evalUnavailable: "Compass 과정 평가를 불러오지 못했습니다.",
    aiDraft: "AI 초안", editHint: "회색 칸은 바로 고칠 수 있고 이 브라우저에만 저장됩니다.", loading: "불러오는 중", copy: "표 복사", copied: "복사됨", pdf: "PDF 다운로드",
    modules: { KA: "KA", market: "마케팅 활동", partner: "파트너·공교육", other: "기타" },
    summaryLine: "요약", compassMatch: (stage: string, last: string, week: number) => `Compass ${stage} · 최근 기록 ${last} · 이번 주 ${week}건`,
    compassNone: "Compass 리드 매칭 없음", compassKaDown: "Compass 기록을 읽지 못해 KA 진행 초안이 없습니다.", nameMatch: "고객명 매칭",
    draftStale: (w: string) => `AI 초안은 ${w} 기준이라 보고 주와 다릅니다. 인사이트를 새로 생성하세요.`, draftNone: "AI 초안 없음 — 인사이트를 생성하면 채워집니다.",
    stageLabels: {} as Record<string, string>,
  },
} as const

const CELL = "border border-[#E8E8E4] px-2 py-1.5 align-top"
const HEAD = `${CELL} bg-[#F6F5F4] text-[11px] font-semibold text-[#615D59]`
const NUM = `${CELL} text-right tabular-nums`

/** 만 단위 1자리(1,000만 이상은 정수). 0·없음은 "-". */
function wan(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value === 0) return "-"
  const w = value / 10_000
  return Math.abs(w) >= 1000 ? Math.round(w).toLocaleString("en-US") : w.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
/** 고객 명세용 만 단위 2자리(템플릿 표기 '9.74'). */
function wan2(value: number) {
  return (value / 10_000).toLocaleString("en-US", { maximumFractionDigits: 2 })
}
function rate(actual: number, goal: number) {
  return goal > 0 ? `${((actual / goal) * 100).toFixed(1)}%` : "-"
}
function kstToday() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}
function shortDate(ymd: string) {
  const [, m, d] = ymd.split("-")
  return `${Number(m)}/${Number(d)}`
}

/** ISO 시각 → KST 날짜(M/D). */
function kstShort(iso: string | null) {
  if (!iso) return "-"
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? "-" : shortDate(new Date(ms + 9 * 3600_000).toISOString().slice(0, 10))
}

/** 고객명 비교 키 — 공백·대소문자 무시. */
export function customerKey(name: string) {
  return name.replace(/\s+/g, "").toLowerCase()
}

/** AI 초안 KA 행을 REV KA 고객에 맞춘다 — 같은 이름 우선, 없으면 한쪽이 다른 쪽을 포함. */
export function matchDraftKaRow<T extends { customer: string }>(rows: readonly T[], customer: string): T | null {
  const key = customerKey(customer)
  if (!key) return null
  return rows.find((row) => customerKey(row.customer) === key)
    ?? rows.find((row) => { const other = customerKey(row.customer); return other.length > 1 && (other.includes(key) || key.includes(other)) })
    ?? null
}

function classifyModule(text: string): keyof (typeof T)["zh"]["modules"] {
  if (/KA|핵심 고객|대형|계약|追加|추가 구매/i.test(text)) return "KA"
  if (/설명회|세미나|행사|캠페인|광고|박람회|沙龙|说明会|活动|Meta/i.test(text)) return "market"
  if (/파트너|공립|공교육|교육청|총판|채널|合作|公立/i.test(text)) return "partner"
  return "other"
}

/** 회색 편집 칸 — 값은 상위가 localStorage로 저장한다. AI·자동 초안이 있으면 그 값이 기본값. */
function EditCell({ id, value, placeholder, onChange, className = "" }: {
  id: string; value: string; placeholder?: string; onChange: (id: string, value: string) => void; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  // 첫 그림(서버 렌더 포함)에 초안이 보이도록 처음 값만 자식으로 둔다 — 이후 값(저장본 로드 등)은 아래 효과가 DOM에 직접 쓴다.
  // 자식이 바뀌지 않으므로 React가 사용자가 입력 중인 내용을 덮지 않는다.
  const [initial] = useState(value)
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current && ref.current.innerText !== value) ref.current.innerText = value
  }, [value])
  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline="true"
      aria-label={placeholder ?? id}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onBlur={(event) => onChange(id, event.currentTarget.innerText.trim())}
      className={`min-h-[1.6em] whitespace-pre-wrap rounded-sm bg-[#FAFAF8] px-1 outline-none empty:before:text-[#A39E98] empty:before:content-[attr(data-placeholder)] focus:bg-white focus:ring-1 focus:ring-[#084734] print:bg-transparent ${className}`}
    >{initial}</div>
  )
}

interface WeekCustomer { key: string; customer: string; amount: number; pending: number; category: "hw" | "sw"; status: string | null; managers: Set<string> }

export default function HqWeeklyReport({ team, manager, refreshKey, lang, weekly, draft = null, draftWeek = null, notes, actions }: {
  team: Team
  manager?: string
  refreshKey: number
  lang: ReportLang
  weekly: BranchJsonState<BranchWeeklyCompassReport>
  /** AI 간이 보고(본사 양식 틀) — 구획별 요약·KA 진행·5.1·5.2 초안 */
  draft?: WeeklyReportDraft | null
  /** AI 초안을 만든 보고 주 라벨 — 지금 보고 주와 다르면 알린다 */
  draftWeek?: string | null
  /** 이전 캐시의 AI 보고 줄 — draft가 없을 때 5.1 초안 */
  notes: string[]
  /** AI 다음 액션 — draft가 없을 때 5.2 초안 */
  actions: ReportAction[]
}) {
  const t = T[lang]
  const today = kstToday()
  const month = today.slice(0, 7)
  const monthNo = Number(month.slice(5, 7))
  const quarterNo = fiscalQuarter(monthNo)
  const managerQuery = manager ? `&manager=${encodeURIComponent(manager)}` : ""
  const summary = useBranchJson<BranchSummaryResponse>(`/api/admin/branch/summary?team=${team}&period=Q&breakdown=1${managerQuery}`, refreshKey)
  const pipeline = useBranchJson<BranchPipelineResponse>(`/api/admin/branch/pipeline?team=${team}&period=M&month=${month}${managerQuery}`, refreshKey)
  const report = weekly.data

  // ── 편집 칸 저장(이 브라우저만) ─────────────────────────────────────────────
  const storageKey = report ? `branch-hq-weekly:v1:${team}:${manager ?? ""}:${report.week.label}` : null
  // 저장 키(보고 주)가 정해질 때 한 번 읽는다 — 렌더 중 상태 조정 패턴(키는 클라이언트 페치 뒤에만 생겨 하이드레이션과 겹치지 않는다).
  const [store, setStore] = useState<{ key: string | null; cells: Record<string, string>; extraEvents: number }>({ key: null, cells: {}, extraEvents: 0 })
  if (storageKey && storageKey !== store.key && typeof window !== "undefined") {
    let saved: { cells?: Record<string, string>; extraEvents?: number } = {}
    try { saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") } catch { saved = {} }
    setStore({ key: storageKey, cells: saved.cells ?? {}, extraEvents: saved.extraEvents ?? 0 })
  }
  const edits = store.cells
  const extraEvents = store.extraEvents
  const persist = useCallback((cells: Record<string, string>, extra: number) => {
    if (!storageKey) return
    try { window.localStorage.setItem(storageKey, JSON.stringify({ cells, extraEvents: extra })) } catch { /* 저장 불가 브라우저 — 화면 값만 유지 */ }
  }, [storageKey])
  const onEdit = useCallback((id: string, value: string) => {
    setStore((current) => {
      const next = { ...current, cells: { ...current.cells, [id]: value } }
      persist(next.cells, next.extraEvents)
      return next
    })
  }, [persist])
  const addEventRow = () => setStore((current) => {
    const next = { ...current, extraEvents: current.extraEvents + 1 }
    persist(next.cells, next.extraEvents)
    return next
  })
  const cell = (id: string, fallback = "", placeholder?: string, className?: string) => (
    <EditCell id={id} value={edits[id] ?? fallback} placeholder={placeholder} onChange={onEdit} className={className} />
  )

  // ── 一、财年业绩进展表 ─────────────────────────────────────────────────────
  const performance = useMemo(() => {
    const data = summary.data
    if (!data) return null
    const qIndex = quarterNo - 1
    const pick = (numbers: Pick<DshNumbers, "annual" | "quarters" | "months"> | null | undefined) => ({
      month: numbers?.months[month] ?? 0, quarter: numbers?.quarters[qIndex] ?? 0, year: numbers?.annual ?? 0,
    })
    const scoped = Boolean(manager) || team !== "ALL"
    if (scoped) {
      const rows = data.dsh_rows ?? []
      const totals = manager ? dshTotalsFromRows(rows) : (() => {
        const entry = buildDshTeamGrid(rows).teams.find((row) => row.team === team)
        return entry ? { goal: entry.goal, status: entry.status } : null
      })()
      if (!totals) return { scoped, rows: [] }
      return { scoped, rows: [{ key: "total", label: t.total, goal: pick(totals.goal), status: pick(totals.status) }] }
    }
    const dedup = dedupeDshByKind(data.dsh_breakdown ?? [])
    const sum = (map: Map<string, { category: string; annual: number; months: Record<string, number> } & { quarters?: readonly number[] }>, match: (category: string) => boolean) => {
      const out = { month: 0, quarter: 0, year: 0 }
      for (const row of map.values()) {
        if (!match(row.category)) continue
        out.month += row.months[month] ?? 0
        out.quarter += (row as { quarters?: readonly number[] }).quarters?.[qIndex] ?? 0
        out.year += row.annual
      }
      return out
    }
    const groups = [
      { key: "hw", label: t.hw, match: (c: string) => c === "Hardware" },
      { key: "sw", label: t.sw, match: (c: string) => c === "Software" },
      { key: "other", label: t.other, match: (c: string) => c !== "Hardware" && c !== "Software" },
      { key: "total", label: t.total, match: () => true },
    ]
    return { scoped, rows: groups.map((group) => ({ key: group.key, label: group.label, goal: sum(dedup.goal, group.match), status: sum(dedup.status, group.match) })) }
  }, [summary.data, manager, team, month, quarterNo, t])

  // ── 二、本月收款(주차별) ───────────────────────────────────────────────────
  const weeks = useMemo(() => {
    const rows = pipeline.data?.rows
    if (!rows) return null
    const buckets = Array.from({ length: 5 }, () => ({ confirmed: 0, pending: 0, customers: new Map<string, WeekCustomer>() }))
    for (const raw of rows) {
      const row: LedgerRevenueRow = { ...raw, ledgerOrigin: "sheet" }
      const amount = rowMonthAmount(row, month)
      if (amount <= 0) continue
      const split = rowWeeklySplit(row, month)
      const weekValues = split.source === "explicit" || split.source === "inferred" ? split.weeks : [0, 0, 0, 0, amount]
      const confirmedRatio = Math.min(rowMonthConfirmed(row, month) / amount, 1)
      const category = classifySalesLedgerProductCategory({ product: row.productVersion ?? null, account: row.customer }) === "hardware" ? "hw" : "sw"
      weekValues.forEach((value, index) => {
        if (value <= 0) return
        const confirmed = value * confirmedRatio
        const pending = value - confirmed
        const bucket = buckets[index]
        bucket.confirmed += confirmed
        bucket.pending += pending
        const key = row.customer.trim().toLowerCase()
        const entry = bucket.customers.get(key) ?? { key, customer: row.customer.trim(), amount: 0, pending: 0, category, status: row.status ?? null, managers: new Set<string>() }
        entry.amount += value
        entry.pending += pending
        const name = normalizeBranchMemberName(row.manager)
        if (name) entry.managers.add(name)
        bucket.customers.set(key, entry)
      })
    }
    return buckets.map((bucket) => {
      const customers = [...bucket.customers.values()].sort((a, b) => b.amount - a.amount)
      const major = customers.filter((customer) => customer.amount >= 3_000).slice(0, 5)
      const rest = customers.filter((customer) => !major.includes(customer)).reduce((sum, customer) => sum + customer.amount, 0)
      return { confirmed: bucket.confirmed, pending: bucket.pending, major, rest }
    })
  }, [pipeline.data, month])

  const customerLine = (customer: WeekCustomer) => {
    const status = (customer.status ?? "").toLowerCase()
    const kind = status === "new" || status === "신규" ? t.newCustomer : status === "renew" || status === "갱신" ? t.renew : null
    const tag = [customer.category === "hw" ? t.hwShort : t.swShort, kind].filter(Boolean).join(lang === "zh" ? "，" : ", ")
    const expected = customer.pending >= customer.amount - 1 ? ` [${t.expectedTag}]` : ""
    return `${customer.customer} ${wan2(customer.amount)}（${tag}）/${[...customer.managers].join(",") || "-"}${expected}`
  }

  // ── 四、市场活动 ───────────────────────────────────────────────────────────
  const events = useMemo(() => {
    const list = summary.data?.monthly_series?.events ?? []
    const from = report?.week.startDate ?? today
    const until = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10)
    return list.filter((event) => event.date.slice(0, 10) >= from && event.date.slice(0, 10) <= until).slice(0, 8)
  }, [summary.data, report?.week.startDate, today])

  // ── 5.3 팀/멤버 분기 회수 ─────────────────────────────────────────────────
  const memberRows = useMemo(() => {
    const rows = summary.data?.dsh_rows
    if (!rows) return null
    const grid = buildDshTeamGrid(rows)
    const qIndex = quarterNo - 1
    const members = grid.teams
      .filter((entry) => isCurrentBranchTeam(entry.team) && (team === "ALL" || entry.team === team))
      .flatMap((entry) => entry.members.map((member) => ({ team: entry.team, member: normalizeBranchMemberName(member.member) ?? member.member, goal: member.goal, status: member.status })))
      .filter((row) => !manager || normalizeBranchMemberName(row.member)?.toLowerCase() === normalizeBranchMemberName(manager)?.toLowerCase())
    const all = grid.teams.find((entry) => entry.team === (team === "ALL" ? "ALL" : team))
    const view = (goal: DshNumbers | null, status: DshNumbers | null) => ({
      qGoal: goal?.quarters[qIndex] ?? 0, qActual: status?.quarters[qIndex] ?? 0, mGoal: goal?.months[month] ?? 0, mActual: status?.months[month] ?? 0,
    })
    return {
      members: members.map((row) => ({ team: row.team, member: row.member, ...view(row.goal, row.status) })),
      total: all && !manager ? view(all.goal, all.status) : null,
    }
  }, [summary.data, quarterNo, team, manager, month])

  // ── 복사 · PDF ─────────────────────────────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const copyReport = async () => {
    const node = rootRef.current
    if (!node) return
    try {
      const html = node.innerHTML
      const text = node.innerText
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })])
      } else {
        await navigator.clipboard.writeText(text)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch { /* 클립보드 권한 없음 — 버튼 상태만 그대로 둔다 */ }
  }

  const evaluation = report?.evaluation
  const funnel = report?.funnel
  const ka = report?.ka
  const draftKa = draft?.ka ?? []
  const keyPoints = draft?.key_points.filter((point) => point.trim() !== "") ?? []
  const noteFallback = keyPoints.length ? keyPoints.map((point, index) => `${index + 1}. ${point}`).join("\n") : notes.join("\n")
  const hasPointsDraft = keyPoints.length > 0 || notes.length > 0
  // 5.2 초안은 기한이 지나지 않은 계획만 쓴다(오래된 캐시가 다음 주 계획처럼 보이지 않게).
  // AI 간이 보고의 next_week가 우선이고, 없으면(이전 캐시) AI 액션을 쓴다.
  const planDrafts: Array<{ plan: string; module: ReportModule; due: string }> = (() => {
    const fromDraft = (draft?.next_week ?? []).filter((plan) => plan.plan.trim() !== "" && (!plan.due || plan.due >= today))
    if (fromDraft.length) return fromDraft
    return actions
      .filter((action) => !action.due || action.due >= today)
      .map((action) => ({
        plan: `${action.title}${action.owner ? ` (${action.owner})` : ""}`,
        module: action.module ?? classifyModule(`${action.title} ${action.why ?? ""}`),
        due: action.due ?? "",
      }))
  })()
  const draftStale = Boolean(draft && draftWeek && report && draftWeek !== report.week.label)

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <span className="mr-auto text-[11.5px] text-[#615D59]">
          {t.editHint}
          {draftStale && draftWeek ? <b className="ml-1 font-semibold text-[#7A520F]">{t.draftStale(draftWeek)}</b>
            : !draft && !notes.length ? <span className="ml-1">{t.draftNone}</span> : null}
        </span>
        <button type="button" onClick={copyReport} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#111110] md:min-h-8">
          <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />{copied ? t.copied : t.copy}
        </button>
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#111110] md:min-h-8">
          <FileDown className="h-3.5 w-3.5" aria-hidden="true" />{t.pdf}
        </button>
      </div>
      <div ref={rootRef} className="min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-5 py-5 text-[12px] text-[#111110]"
        style={{ fontFamily: lang === "zh" ? 'Inter, "Noto Sans SC", "PingFang SC", Pretendard, system-ui, sans-serif' : "Pretendard, Inter, system-ui, sans-serif" }}>
        <div className="border-b-2 border-[#084734] pb-3">
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">{today.replace(/-/g, "")} {t.title}{report ? ` · ${report.week.label}` : ""}</h2>
          <p className="mt-1 text-[11px] text-[#615D59]">
            {report ? t.period(shortDate(report.week.startDate), shortDate(report.week.endDate)) : t.loading} · {t.issued} {today.replace(/-/g, ".")}
          </p>
        </div>

        {/* 一 */}
        <h3 className="mt-5 text-[14px] font-bold">{t.s1(monthNo)}</h3>
        {!performance ? <p className="mt-2 text-[#615D59]">{summary.error ? summary.error : t.loading}</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[11.5px]">
              <thead><tr>
                {[t.product, t.metric, t.monthGoal, t.monthActual, t.monthRate, t.qGoal, t.qActual, t.qRate, t.yGoal, t.yActual, t.yRate].map((label) => <th key={label} className={HEAD}>{label}</th>)}
              </tr></thead>
              <tbody>
                {performance.rows.map((row) => {
                  const empty = row.goal.year === 0 && row.status.year === 0
                  return (
                    <tr key={row.key} className={row.key === "total" ? "font-bold" : ""}>
                      <td className={CELL}>{row.label}</td>
                      <td className={CELL}>{empty ? "-" : t.collect}</td>
                      <td className={NUM}>{wan(row.goal.month)}</td><td className={NUM}>{wan(row.status.month)}</td><td className={NUM}>{empty ? "-" : rate(row.status.month, row.goal.month)}</td>
                      <td className={NUM}>{wan(row.goal.quarter)}</td><td className={NUM}>{wan(row.status.quarter)}</td><td className={NUM}>{empty ? "-" : rate(row.status.quarter, row.goal.quarter)}</td>
                      <td className={NUM}>{wan(row.goal.year)}</td><td className={NUM}>{wan(row.status.year)}</td><td className={NUM}>{empty ? "-" : rate(row.status.year, row.goal.year)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-1 text-[10.5px] text-[#615D59]">{t.s1Unit}{performance.scoped ? ` · ${t.s1Scoped}` : ""}</p>
          </div>
        )}
        <SummaryLine label={t.summaryLine} ai={Boolean(draft?.performance)} aiLabel={t.aiDraft}>{cell("s1-summary", draft?.performance ?? "", t.summaryLine)}</SummaryLine>

        {/* 二 */}
        <h3 className="mt-6 text-[14px] font-bold">{t.s2}</h3>
        {!weeks ? <p className="mt-2 text-[#615D59]">{pipeline.error ? pipeline.error : t.loading}</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[11.5px]">
              <thead><tr>{[t.week, t.planned, t.actual, t.detail, t.note].map((label) => <th key={label} className={HEAD}>{label}</th>)}</tr></thead>
              <tbody>
                {weeks.map((week, index) => (
                  <tr key={index}>
                    <td className={`${CELL} font-semibold`}>W{index + 1}</td>
                    <td className={NUM}>{wan(week.pending)}</td>
                    <td className={NUM}>{wan(week.confirmed)}</td>
                    <td className={`${CELL} min-w-[260px]`}>
                      {week.major.map((customer) => <div key={customer.key}>{customerLine(customer)}；</div>)}
                      {week.rest > 0 ? <div className="text-[#615D59]">{t.smallRest(wan2(week.rest))}</div> : null}
                    </td>
                    <td className={`${CELL} min-w-[140px]`}>{cell(`w${index + 1}-note`, "", t.note)}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className={CELL}>{t.total}</td>
                  <td className={NUM}>{wan(weeks.reduce((sum, week) => sum + week.pending, 0))}</td>
                  <td className={NUM}>{wan(weeks.reduce((sum, week) => sum + week.confirmed, 0))}</td>
                  <td className={CELL} colSpan={2} />
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-[10.5px] text-[#615D59]">{t.s2Unit}</p>
          </div>
        )}
        <SummaryLine label={t.summaryLine} ai={Boolean(draft?.collections)} aiLabel={t.aiDraft}>{cell("s2-summary", draft?.collections ?? "", t.summaryLine)}</SummaryLine>

        {/* 三 */}
        <h3 className="mt-6 text-[14px] font-bold">{t.s3}</h3>
        <p className="mt-1 text-[11px] text-[#615D59]">{t.s3Stages}{draftKa.length ? ` · ${t.aiDraft}` : ""}</p>
        {ka?.compassState === "down" ? <p className="mt-1 text-[11px] text-[#8F2C2C]">{t.compassKaDown}</p> : null}
        {!ka ? <p className="mt-2 text-[#615D59]">{weekly.error ?? t.loading}</p> : ka.customerCount === 0 ? <p className="mt-2 text-[#615D59]">{t.kaEmpty}</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[11.5px]">
              <thead><tr>{[t.customer, t.stage, t.change, t.issue, t.next, t.hq].map((label) => <th key={label} className={HEAD}>{label}</th>)}</tr></thead>
              <tbody>
                {ka.customers.map((customer) => {
                  const id = `ka-${customer.customer}`
                  const ai = matchDraftKaRow(draftKa, customer.customer)
                  return (
                    <tr key={customer.customer}>
                      <td className={`${CELL} min-w-[140px]`}>
                        <div className="font-semibold">{customer.customer}</div>
                        <div className="text-[10.5px] text-[#615D59]">{customer.manager ?? "-"} · {t.kaAmount(wan(customer.confirmed), wan(customer.open))}</div>
                        {ka.compassState === "ready" ? <KaCompassLine compass={customer.compass ?? null} t={t} /> : null}
                      </td>
                      <td className={`${CELL} min-w-[90px]`}>{cell(`${id}-stage`, ai?.stage || (customer.open > 0 ? t.stagePush : t.stageSigned))}</td>
                      <td className={`${CELL} min-w-[150px]`}>{cell(`${id}-change`, ai?.change ?? "", t.change)}</td>
                      <td className={`${CELL} min-w-[120px]`}>{cell(`${id}-issue`, ai?.issue ?? "", t.issue)}</td>
                      <td className={`${CELL} min-w-[150px]`}>{cell(`${id}-next`, ai?.next_action ?? "", t.next)}</td>
                      <td className={`${CELL} min-w-[70px]`}>{cell(`${id}-hq`, ai?.hq_support ?? "", "-")}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 四 */}
        <h3 className="mt-6 text-[14px] font-bold">{t.s4}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[11.5px]">
            <thead><tr>{[t.no, t.activity, t.type, t.time, t.targetCount, t.budget, t.owner, t.output].map((label) => <th key={label} className={HEAD}>{label}</th>)}</tr></thead>
            <tbody>
              {[...events.map((event, index) => ({ id: `ev-${index}`, title: event.title, time: event.date.slice(0, 10) })), ...Array.from({ length: extraEvents }, (_, index) => ({ id: `ev-extra-${index}`, title: "", time: "" }))].map((event, index) => (
                <tr key={event.id}>
                  <td className={`${CELL} text-center`}>{index + 1}</td>
                  <td className={`${CELL} min-w-[140px]`}>{cell(`${event.id}-title`, event.title, t.activity)}</td>
                  <td className={CELL}>{cell(`${event.id}-type`, "", t.type)}</td>
                  <td className={CELL}>{cell(`${event.id}-time`, event.time, t.time)}</td>
                  <td className={CELL}>{cell(`${event.id}-target`, "", t.targetCount)}</td>
                  <td className={CELL}>{cell(`${event.id}-budget`, "", t.budget)}</td>
                  <td className={CELL}>{cell(`${event.id}-owner`, "", t.owner)}</td>
                  <td className={`${CELL} min-w-[140px]`}>{cell(`${event.id}-output`, "", t.output)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addEventRow}
            className="mt-1 inline-flex min-h-11 items-center text-[11.5px] font-semibold text-[#084734] hover:underline md:min-h-7 print:hidden">{t.addRow}</button>
        </div>
        <h4 className="mt-3 text-[12.5px] font-bold">{t.s4Funnel}</h4>
        {!funnel ? <p className="mt-1 text-[#615D59]">{weekly.error ?? t.loading}</p> : funnel.state !== "ready" ? <p className="mt-1 text-[#8F2C2C]">{t.compassDown}</p> : (
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[11.5px]">
              <thead><tr><th className={HEAD} />{[{ key: "inflow", label: t.inflow }, ...funnel.stages].map((stage) => <th key={stage.key} className={HEAD}>{t.stageLabels[stage.key] ?? stage.label}</th>)}</tr></thead>
              <tbody>
                <tr><td className={CELL}>{t.lastWeek}</td><td className={NUM}>{funnel.inflow.current}</td>{funnel.stages.map((stage) => <td key={stage.key} className={NUM}>{stage.current}</td>)}</tr>
                <tr><td className={CELL}>{t.prevWeek}</td><td className={NUM}>{funnel.inflow.previous}</td>{funnel.stages.map((stage) => <td key={stage.key} className={NUM}>{stage.previous}</td>)}</tr>
              </tbody>
            </table>
          </div>
        )}
        <SummaryLine label={t.summaryLine} ai={Boolean(draft?.activities)} aiLabel={t.aiDraft}>{cell("s4-summary", draft?.activities ?? "", t.summaryLine)}</SummaryLine>

        {/* 五 */}
        <h3 className="mt-6 text-[14px] font-bold">{t.s5}</h3>
        <h4 className="mt-2 text-[12.5px] font-bold">{t.s51} {hasPointsDraft ? <span className="text-[10.5px] font-medium text-[#615D59]">· {t.aiDraft}</span> : null}</h4>
        <div className="mt-1 rounded-sm border border-[#E8E8E4] p-2">{cell("s51", noteFallback, t.s51)}</div>

        <h4 className="mt-3 text-[12.5px] font-bold">{t.s52} {planDrafts.length ? <span className="text-[10.5px] font-medium text-[#615D59]">· {t.aiDraft}</span> : null}</h4>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[11.5px]">
            <thead><tr>{[t.priority, t.plan, t.module, t.deadline].map((label) => <th key={label} className={HEAD}>{label}</th>)}</tr></thead>
            <tbody>
              {(planDrafts.length ? planDrafts : [null]).map((plan, index) => (
                <tr key={index}>
                  <td className={`${CELL} text-center`}>{index + 1}</td>
                  <td className={`${CELL} min-w-[260px]`}>{cell(`s52-${index}-plan`, plan?.plan ?? "", t.plan)}</td>
                  <td className={CELL}>{cell(`s52-${index}-module`, plan ? t.modules[plan.module] : "", t.module)}</td>
                  <td className={CELL}>{cell(`s52-${index}-due`, plan?.due ?? "", t.deadline)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="mt-3 text-[12.5px] font-bold">{t.s53(quarterNo)}</h4>
        {!memberRows ? <p className="mt-1 text-[#615D59]">{summary.error ?? t.loading}</p> : (
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[11.5px]">
              <thead><tr>{[t.team, t.member, t.qGoalCol(quarterNo), t.qActualCol(quarterNo), t.qRateCol(quarterNo), t.monthCol(monthNo), t.monthRateCol(monthNo)].map((label) => <th key={label} className={HEAD}>{label}</th>)}</tr></thead>
              <tbody>
                {memberRows.members.map((row) => (
                  <tr key={`${row.team}-${row.member}`}>
                    <td className={CELL}>{row.team}</td><td className={CELL}>{row.member}</td>
                    <td className={NUM}>{Math.round(row.qGoal).toLocaleString("en-US")}</td>
                    <td className={NUM}>{Math.round(row.qActual).toLocaleString("en-US")}</td>
                    <td className={NUM}>{rate(row.qActual, row.qGoal)}</td>
                    <td className={NUM}>{Math.round(row.mActual).toLocaleString("en-US")} / {Math.round(row.mGoal).toLocaleString("en-US")}</td>
                    <td className={NUM}>{rate(row.mActual, row.mGoal)}</td>
                  </tr>
                ))}
                {memberRows.total ? (
                  <tr className="font-bold">
                    <td className={CELL} colSpan={2}>{t.total}</td>
                    <td className={NUM}>{Math.round(memberRows.total.qGoal).toLocaleString("en-US")}</td>
                    <td className={NUM}>{Math.round(memberRows.total.qActual).toLocaleString("en-US")}</td>
                    <td className={NUM}>{rate(memberRows.total.qActual, memberRows.total.qGoal)}</td>
                    <td className={NUM}>{Math.round(memberRows.total.mActual).toLocaleString("en-US")} / {Math.round(memberRows.total.mGoal).toLocaleString("en-US")}</td>
                    <td className={NUM}>{rate(memberRows.total.mActual, memberRows.total.mGoal)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <p className="mt-1 text-[10.5px] text-[#615D59]">{t.s53Unit}</p>
          </div>
        )}

        <h4 className="mt-3 text-[12.5px] font-bold">{t.s54}{evaluation ? ` ${evaluation.month}` : ""}</h4>
        {!evaluation ? <p className="mt-1 text-[#615D59]">{weekly.error ?? t.loading}</p>
          : evaluation.state === "not_configured" ? <p className="mt-1 text-[#615D59]">{t.evalNotConfigured}</p>
          : evaluation.state === "unavailable" ? <p className="mt-1 text-[#8F2C2C]">{t.evalUnavailable}</p>
          : (
            <ul className="mt-1 space-y-0.5">
              {evaluation.people.map((person) => (
                <li key={person.name}>{person.name}{person.team ? ` (${person.team})` : ""} · {person.rate}% · {person.grade}{person.weakest.length ? ` — ${person.weakest.map((w) => `${w.label} ${w.rate}%`).join(", ")}` : ""}</li>
              ))}
            </ul>
          )}
      </div>
    </div>
  )
}

/** 구획 아래 한 줄 요약 칸(AI 초안 또는 직접 입력). */
function SummaryLine({ label, ai, aiLabel, children }: { label: string; ai: boolean; aiLabel: string; children: ReactNode }) {
  return (
    <div className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 text-[11.5px]">
      <span className="pt-0.5 font-semibold text-[#615D59]">{label}{ai ? <span className="ml-1 text-[10.5px] font-medium">· {aiLabel}</span> : null}</span>
      {children}
    </div>
  )
}

/** KA 고객명으로 맞춘 Compass 리드 — 단계 · 최근 기록 · 이번 주 기록 수. 이름 매칭이라 확정 연결은 아니다. */
function KaCompassLine({ compass, t }: { compass: WeeklyKaCompass | null; t: (typeof T)[ReportLang] }) {
  if (!compass) return <div className="mt-0.5 text-[10.5px] text-[#A39E98]">{t.compassNone}</div>
  const stage = (compass.stage ? t.stageLabels[compass.stage] : undefined) ?? compass.stageLabel ?? "-"
  return (
    <div className="mt-0.5 text-[10.5px] text-[#615D59]">
      <a href={compass.url} target="_blank" rel="noreferrer" title={`${t.nameMatch}: ${compass.academy ?? "-"}`}
        className="font-semibold text-[#084734] hover:underline">{t.compassMatch(stage, kstShort(compass.lastActivityAt), compass.weekActivityCount)}</a>
    </div>
  )
}
