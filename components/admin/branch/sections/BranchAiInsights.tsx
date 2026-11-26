"use client"
import { useEffect, useMemo, useState } from "react"
import { Sparkles, RefreshCw, AlertTriangle } from "lucide-react"
import type { BranchSummaryResponse, Team } from "../types"
import { adminFetchJson, useBranchJson } from "../client-api"
import { readWeeklyReportDraft, type BranchWeeklyCompassReport, type ReportModule } from "@/lib/branch/weekly-report-contract"
import HqWeeklyReport, { type ReportLang } from "./HqWeeklyReport"
import { cny } from "@/lib/branch/money-format"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { ACTION_GROUP_ORDER, GROUP_LABEL, actionGroup, actionSection, SECTION_KEYS, type SectionKey } from "@/lib/branch/weekly-action-sections"
import { SECTION_TITLES } from "./hq-weekly/ReportSection"

interface NextAction { title: string; why: string; owner: string; due?: string; module?: ReportModule }

interface InsightPayload {
  id: string
  one_liner: string | null
  next_actions: NextAction[]
  generated_at: string
  fiscal_period?: string
  raw_response?: { _model?: string; _mode?: string; _retried?: boolean; _warnings?: unknown[]; _report_notes?: unknown; _weekly_report?: unknown; _compass_week?: string | null; _provider?: string; _fallback_reason?: string | null } | null
}

interface InsightResp {
  from: "cache" | "fresh" | "stale" | "error"
  insight?: InsightPayload
  error?: string
}


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

/** 칩 라벨 — 구획 번호만(三은 KA를 덧붙인다). */
const CHIP_LABEL: Record<SectionKey, string> = { perf: "一", collect: "二", ka: "三 KA", market: "四", other: "五" }

/** 액션 한 줄(컴팩트) — 유형 색 글자 · 액션 · 근거 · 담당·기한. 기한이 지난 항목은 '기한 경과'로 표시한다. 누르면 그 구획의 자세히 보기. */
function InsightRow({ action, overdue, picked, onPick }: { action: NextAction; overdue: boolean; picked: boolean; onPick: () => void }) {
  const t = TONE[classifyAction(action)]
  return (
    <li>
      <button type="button" onClick={onPick} aria-pressed={picked}
        className={`group -mx-2 grid min-h-11 w-[calc(100%+1rem)] grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border-t border-[#E8E8E4] px-2 py-2.5 text-left transition-colors duration-200 motion-reduce:transition-none md:min-h-0 ${picked ? "bg-[#E8F6EF]" : "hover:bg-[#FAFAF8]"}`}>
        <span className="min-w-0">
          <span className="block text-[13px] font-bold leading-snug text-[#111110]">
            <span className="mr-1.5 text-[11px] font-bold" style={{ color: t.fg }}>{t.label}</span>{action.title}
          </span>
          {action.why ? <span className="mt-0.5 block text-[11.5px] leading-normal text-[#615D59]">{action.why}</span> : null}
        </span>
        <span className="shrink-0 text-right text-[11.5px] tabular-nums text-[#615D59]">
          <span className={overdue ? "line-through" : undefined}>{[action.owner, action.due ? action.due.slice(5).replace("-", "/") : null].filter(Boolean).join(" · ")}</span>
          {overdue ? <b className="block text-[11px] text-[#B43E3E]">기한 경과</b> : null}
          <span className={`block text-[11px] font-bold text-[#084734] transition-opacity duration-200 motion-reduce:transition-none ${picked ? "opacity-100" : "opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-visible:opacity-100"}`}>자세히 ›</span>
        </span>
      </button>
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

export default function BranchAiInsights({ team, refreshKey, summary, canGenerate = true, manager }: {
  team: Team
  refreshKey: number
  summary: BranchSummaryResponse | null
  canGenerate?: boolean
  manager?: string
}) {
  // 2026-11-24 시안 'AI 인사이트 B'(왼쪽은 목록) — 운영 액션 목록과 본사 보고서 미리보기를 나란히 둔다.
  // 예전 내부/외부 보기 전환은 없앴다: 두 화면이 같은 summary 수치를 보므로 오가지 않고 함께 본다.
  // 본사 보고서는 중국어 양식(韩国业务周报)이 기본이다.
  const [lang, setLang] = useState<ReportLang>("zh")
  const [insight, setInsight] = useState<InsightPayload | null>(null)
  const [from, setFrom] = useState<InsightResp["from"] | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // 시안 '간이 보고 ①→② 모핑' — 한 구획만 ②(자세히 보기)로 펼친다. null이면 보고서 전체(①).
  const actions = useMemo(() => insight?.next_actions ?? [], [insight])
  const [focus, setFocus] = useState<SectionKey | null>(null)
  const [pickedAction, setPickedAction] = useState<number | null>(null)

  // 본사 주간 보고의 Compass 구획 — 끝난 주 리드 퍼널 + 월간 과정 평가(AI 입력과 같은 조립 함수).
  const weekly = useBranchJson<BranchWeeklyCompassReport>(
    `/api/admin/branch/weekly-report?team=${team}${manager ? `&manager=${encodeURIComponent(manager)}` : ""}`,
    refreshKey,
  )
  const requestKey = `${refreshKey}:${team}`
  const [stateKey, setStateKey] = useState<string | null>(null)
  const stale = stateKey !== requestKey
  // 팀·새로고침이 바뀌면 자세히 보기를 닫는다(렌더 중 상태 조정 — 효과 안 setState 금지).
  const [focusKey, setFocusKey] = useState(requestKey)
  if (focusKey !== requestKey) { setFocusKey(requestKey); setFocus(null); setPickedAction(null) }
  const resetFocus = () => { setFocus(null); setPickedAction(null) }
  const focusSection = (section: SectionKey | null) => {
    if (section === null || section === focus) { resetFocus(); return }
    setFocus(section); setPickedAction(null)
  }
  const pickAction = (index: number) => {
    if (pickedAction === index) { resetFocus(); return }
    setFocus(actionSection(actions[index])); setPickedAction(index)
  }
  // Esc → 보고서 전체로 복귀
  useEffect(() => {
    if (focus === null) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setFocus(null); setPickedAction(null) } }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [focus])

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
  const rows = actions
    .map((action, index) => ({ action, index, overdue: Boolean(action.due && action.due < today) }))
    // 기한이 지난 항목은 아래로 — 원래 순서는 그대로 유지한다.
    .sort((a, b) => Number(a.overdue) - Number(b.overdue) || a.index - b.index)
  const overdueCount = rows.filter((row) => row.overdue).length
  const validPicked = pickedAction !== null && pickedAction < actions.length ? pickedAction : null
  // 모듈별 묶음 — 기한 경과는 각 묶음 안에서 아래로(위 정렬 유지).
  const groups = ACTION_GROUP_ORDER
    .map((group) => ({ group, items: rows.filter((row) => actionGroup(row.action) === group) }))
    .filter((entry) => entry.items.length > 0)
  const showLoading = loading || stale
  const generatedAt = formatGeneratedAt(insight?.generated_at)
  const rev = summary?.revenue
  // 본사 양식 간이 보고(AI 초안). 이전 캐시는 4줄 report_notes만 있어 5.1 초안으로만 쓴다.
  const reportDraft = readWeeklyReportDraft(insight?.raw_response?._weekly_report)
  const rawNotes = insight?.raw_response?._report_notes
  const reportNotes = Array.isArray(rawNotes) ? rawNotes.filter((note): note is string => typeof note === "string" && note.trim() !== "") : []
  const draftWeek = insight?.raw_response?._compass_week ?? null
  // 어느 모델이 썼는지 — Claude가 실패해 Gemini가 대신 쓴 경우를 구분한다(예전 캐시는 표시 없음).
  const providerLabel = insight?.raw_response?._provider === "claude" ? "Claude"
    : insight?.raw_response?._provider?.startsWith("gemini") ? (insight.raw_response._fallback_reason ? "Gemini(대체)" : "Gemini") : null

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

      {/* 시안 '간이 보고 ①→②' — 왼쪽 360px 할 일 카드, 오른쪽 본사 주간 보고서. 구획을 고르면 그 구획만 ②로 바뀌고 왼쪽은 290px로 좁아진다. */}
      <div className={`grid grid-cols-1 items-start gap-4 transition-[grid-template-columns] duration-[450ms] ease-in-out motion-reduce:transition-none print:block ${focus ? "lg:grid-cols-[290px_minmax(0,1fr)]" : "lg:grid-cols-[360px_minmax(0,1fr)]"}`}>
        <section className="min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-[18px] py-4 print:hidden" aria-label="운영 액션">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-[13.5px] font-bold text-[#111110]">{manager || summary?.scope?.manager ? "내 담당 · 이번 주 할 일" : "이번 주 할 일"}</h2>
            <span className="text-[11.5px] text-[#615D59]">
              {[generatedAt ? `생성 ${generatedAt}` : null, insight?.fiscal_period ? `기준 ${insight.fiscal_period}` : null, from && insight ? FROM_LABEL[from] : null, providerLabel].filter(Boolean).join(" · ")}
            </span>
            {canGenerate ? (
              <button type="button" onClick={handleRegenerate} disabled={refreshing}
                className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-md bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:opacity-60 md:min-h-8">
                {refreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                인사이트 새로 생성
              </button>
            ) : null}
          </div>
          {insight?.one_liner ? (
            <p className="mb-0.5 mt-2.5 text-[15px] font-bold leading-snug tracking-[-0.01em] text-[#111110]">{insight.one_liner}</p>
          ) : null}

          <div className="mt-3 flex gap-1" role="group" aria-label="보고 구획 바로 보기">
            {SECTION_KEYS.map((key) => (
              <button key={key} type="button" onClick={() => focusSection(key)} aria-pressed={focus === key} aria-label={SECTION_TITLES[key]}
                className={`min-h-11 flex-1 rounded-md border text-[12px] font-bold transition-colors duration-200 motion-reduce:transition-none md:min-h-[30px] ${focus === key ? "border-[#084734] bg-[#084734] text-white" : "border-[#E8E8E4] bg-white text-[#615D59] hover:bg-[#FAFAF8]"}`}>
                {CHIP_LABEL[key]}
              </button>
            ))}
          </div>

          {errorMsg ? (
            <div role="alert" className="mt-3 rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2.5 text-[12.5px] text-[#8F2C2C]">
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
            <div className="mt-3 space-y-2" role="status" aria-label="AI 인사이트를 불러오는 중">
              {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-[#F0F0EC]" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="mt-3 border-t border-[#E8E8E4] py-8 text-center text-[12px] text-[#615D59]">
              {canGenerate ? "생성된 인사이트가 없습니다. '인사이트 새로 생성'을 눌러 주세요." : "생성된 인사이트가 없습니다."}
            </p>
          ) : (
            <>
              {groups.map(({ group, items }) => (
                <div key={group}>
                  <div className="flex justify-between pb-1 pt-3.5 text-[11px] font-bold tracking-[0.04em] text-[#615D59]">
                    <span>{GROUP_LABEL[group]}</span><span className="tabular-nums">{items.length}</span>
                  </div>
                  <ol className="m-0 list-none p-0">
                    {items.map((row) => (
                      <InsightRow key={`${row.action.title}-${row.index}`} action={row.action} overdue={row.overdue}
                        picked={validPicked === row.index} onPick={() => pickAction(row.index)} />
                    ))}
                  </ol>
                </div>
              ))}
              <p className="mt-3 text-[11.5px] text-[#615D59]">
                액션 {rows.length}건{overdueCount ? ` · 기한 경과 ${overdueCount}건(묶음 안에서 아래로 내림)` : ""} · 항목이나 구획 번호를 누르면 오른쪽이 그 구획의 자세히 보기로 바뀝니다. 다시 누르거나 최소화하면 보고서로 돌아갑니다.
              </p>
            </>
          )}
        </section>

        {/* 본사 주간 보고서(韩国业务周报) — 본사 양식 5개 구획 */}
        <section className="min-w-0" aria-label="본사 주간 보고서">
          <HqWeeklyReport team={team} manager={manager} refreshKey={refreshKey} lang={lang} weekly={weekly}
            draft={reportDraft} draftWeek={draftWeek} notes={reportNotes} actions={actions}
            focus={focus} pickedActionIndex={validPicked} onFocus={focusSection}
            title={summary?.scope?.manager ? "내 담당 · 주간 보고" : "본사 주간 보고서"}
            langToggle={(
              <div className="inline-flex rounded-md border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="보고서 언어">
                {([{ id: "zh", label: "中文" }, { id: "ko", label: "한국어" }] as const).map((o) => (
                  <button key={o.id} type="button" onClick={() => setLang(o.id)} aria-pressed={lang === o.id}
                    className={`min-h-11 rounded-[5px] px-3 text-[12px] font-bold transition md:min-h-7 ${lang === o.id ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            )} />
        </section>
      </div>
    </section>
  )
}
