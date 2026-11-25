"use client"
// KR Team 파이프라인 — 할 일 먼저(2026-11-24 시안 '파이프라인 A+B ③' 채택).
// 결론 한 문장 + 확도별 누적 막대 + 세 목록('이번에 닫을 것' 고확도 상위, '확도를 올릴 것' 예정 상위,
// '페이스 미달 담당')을 탭 맨 위에 둔다. 분류·합산은 아래 칸반과 같은 함수
// (lib/branch/pipeline-confidence-groups.ts)라 막대·목록·칸반 열 합계가 서로 맞는다.
// 같은 pipeline URL을 칸반과 함께 읽으므로 요청은 캐시에서 한 번만 나간다.
import { useMemo } from "react"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { branchTeamLabel, isCurrentBranchTeam, isLegacyBranchTeam, SHEET_KPI_ACTIVE_TEAMS } from "@/lib/branch/current-organization"
import { cnyExact } from "@/lib/branch/money-format"
import {
  groupPipelineByConfidence,
  pipelineGroupTotals,
  type MergedPipelineRow,
} from "@/lib/branch/pipeline-confidence-groups"
import { teamColorOf } from "@/lib/branch/team-colors"
import { useBranchJson } from "../client-api"
import MoneyValue from "../MoneyValue"
import { PIPELINE_ACTION_LIST_SIZE } from "./pipeline-action-constants"
import type { BranchKpiResponse, BranchPipelineResponse, BranchPipelineRow, BranchSummaryResponse, Period, Team } from "../types"


const KPI_METRIC_LABELS: Record<string, string> = { LD: "리드", ACC: "계정", OPP: "기회", SOL: "솔루션", VST: "방문" }

// 활동 병목·KPI 표와 같은 기준 — 30% 미만이면 페이스 미달.
const PACE_SHORTFALL_PCT = 30

type Row = BranchPipelineRow
type MergedRow = MergedPipelineRow<Row>

export interface PipelineActionDealClick {
  id: string
  customer: string
  manager: string | null
  team: string | null
  region: string | null
  revenue: number
  stageLabel: string
  stageColor: string
}

interface PaceRow {
  member: string
  team: string | null
  pct: number
  bottleneck: { metric: string; actual: number; goal: number; pct: number } | null
}

function pct(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0
}

function DealList({ title, tag, tagColor, rows, total, onDealClick, stage }: {
  title: string
  tag: string
  tagColor: string
  rows: MergedRow[]
  total: number
  onDealClick?: (deal: PipelineActionDealClick) => void
  stage: { label: string; color: string }
}) {
  const shown = rows.slice(0, PIPELINE_ACTION_LIST_SIZE)
  return (
    <section className="min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-3.5" aria-label={title}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-[13.5px] font-bold text-[#111110]">{title}</h3>
        <span className="text-[11.5px] font-semibold" style={{ color: tagColor }}>{tag}</span>
      </div>
      {shown.length === 0 ? (
        <p className="border-t border-[#E8E8E4] py-4 text-[12px] text-[#615D59]">해당 딜이 없습니다.</p>
      ) : (
        <ol>
          {shown.map((deal, index) => (
            <li key={deal.id} className="border-t border-[#E8E8E4]">
              <button
                type="button"
                onClick={() => onDealClick?.({
                  id: deal.id, customer: deal.customer, manager: deal.manager, team: deal.team,
                  region: deal.region, revenue: deal.revenue, stageLabel: stage.label, stageColor: stage.color,
                })}
                className="grid min-h-11 w-full grid-cols-[18px_minmax(0,1fr)_auto] items-baseline gap-2 py-2 text-left text-[13px] hover:bg-[#FAFAF8] focus-visible:outline-2 focus-visible:outline-[#084734] md:min-h-0"
              >
                <span className="text-[11px] tabular-nums text-[#615D59]">{index + 1}</span>
                <span className="min-w-0 truncate">
                  <span className="font-bold text-[#111110]">{deal.customer}</span>{" "}
                  <span className="text-[11.5px] text-[#615D59]">
                    {[deal.manager, deal.region, deal.count > 1 ? `${deal.count}건` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="font-bold tabular-nums" style={{ color: tagColor }} title={`¥${cnyExact(deal.revenue)} · 시트 원값`}>
                  <MoneyValue value={deal.revenue} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="border-t border-[#E8E8E4] pt-2 text-[11.5px] text-[#615D59]">
        전체 {rows.length}곳 · <MoneyValue value={total} /> — 아래 칸반에서 이어 보기
      </p>
    </section>
  )
}

export default function PipelineActionBoard({
  scopeManager, team, period, selectedMonth, refreshKey, kpi, summary, onDealClick,
}: {
  scopeManager?: string
  team: Team
  period: Period
  selectedMonth: string
  refreshKey: number
  kpi: BranchKpiResponse | null
  summary: BranchSummaryResponse | null
  onDealClick?: (deal: PipelineActionDealClick) => void
}) {
  // 칸반(BranchPipelineKanban)과 같은 URL — 캐시 키가 같아 요청이 한 번만 나간다.
  const monthQuery = period === "M" ? `&month=${encodeURIComponent(selectedMonth)}` : ""
  const pipeline = useBranchJson<BranchPipelineResponse>(
    `/api/admin/branch/pipeline?team=${team}&period=${period}${monthQuery}${scopeManager ? `&manager=${encodeURIComponent(scopeManager)}` : ""}`,
    refreshKey,
  )
  const rows = pipeline.data?.rows ?? null
  const groups = useMemo(() => groupPipelineByConfidence(rows ?? []), [rows])
  const totals = useMemo(() => pipelineGroupTotals(groups), [groups])
  const legacy = isLegacyBranchTeam(team)

  const paceRows = useMemo<PaceRow[]>(() => {
    if (!kpi || legacy) return []
    const members = kpi.members.filter((member) => kpi.scope?.manager
      ? true
      : (team === "ALL" ? isCurrentBranchTeam(member.team) : member.team === team))
    return members
      .filter((member) => member.goal > 0)
      .map((member) => {
        let bottleneck: PaceRow["bottleneck"] = null
        if (member.team && SHEET_KPI_ACTIVE_TEAMS.has(member.team)) {
          for (const [metric, pair] of Object.entries(member.kpi ?? {})) {
            if (!pair || pair.goal <= 0) continue
            const metricPct = pct(pair.actual, pair.goal)
            if (!bottleneck || metricPct < bottleneck.pct) bottleneck = { metric, actual: pair.actual, goal: pair.goal, pct: metricPct }
          }
        }
        return { member: member.member, team: member.team, pct: pct(member.confirmed, member.goal), bottleneck }
      })
      .sort((a, b) => a.pct - b.pct || a.member.localeCompare(b.member, "ko"))
      .slice(0, PIPELINE_ACTION_LIST_SIZE)
  }, [kpi, team, legacy])

  if (pipeline.loading && !pipeline.data) return <div className="h-48 animate-pulse rounded-xl bg-[#F0F0EC]" role="status" aria-label="파이프라인 요약을 불러오는 중" />
  // 오류는 아래 칸반이 재시도 버튼과 함께 보여 준다 — 여기서는 0원 요약으로 위장하지 않고 한 줄만 남긴다.
  if (pipeline.error && !pipeline.data) return (
    <p role="alert" className="rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[12px] font-semibold text-[#8F2C2C]">
      파이프라인을 불러오지 못해 요약을 만들 수 없습니다 · {pipeline.error}
    </p>
  )

  const classifiedTotal = totals.confirmed + totals["high-confidence"] + totals.expected
  const dealCount = rows?.length ?? 0
  const customerCount = groups.confirmed.length + groups["high-confidence"].length + groups.expected.length + groups.unclassified.length
  const confirmedShare = pct(totals.confirmed, classifiedTotal)
  const goal = summary?.revenue.goal ?? 0
  const remaining = goal > 0 ? Math.max(0, goal - (summary?.revenue.confirmed ?? 0)) : null
  const segments = [
    { key: "confirmed" as const, value: totals.confirmed, count: groups.confirmed.length },
    { key: "high-confidence" as const, value: totals["high-confidence"], count: groups["high-confidence"].length },
    { key: "expected" as const, value: totals.expected, count: groups.expected.length },
  ]

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-5 py-4" aria-label="파이프라인 요약">
        {pipeline.stale ? <p role="status" className="mb-2 text-[11.5px] text-[#7A520F]">갱신 실패 — 저장된 파이프라인으로 계산했습니다.</p> : null}
        <p className="text-[18px] font-bold leading-snug tracking-[-0.02em] text-[#111110] md:text-[19px]">
          파이프라인 <MoneyValue value={classifiedTotal} /> 중 확정으로 분류된 딜이{" "}
          <span className="tabular-nums" style={{ color: CONFIDENCE_TOKENS.confirmed.color }}>{confirmedShare.toFixed(0)}%</span>입니다.
          {" "}고확도 딜 <span style={{ color: CONFIDENCE_TOKENS["high-confidence"].color }}><MoneyValue value={totals["high-confidence"]} /></span>
          {remaining != null ? <>, 남은 목표는 <MoneyValue value={remaining} />입니다.</> : "."}
        </p>
        {classifiedTotal > 0 ? (
          <>
            <div className="mt-3 flex h-6 overflow-hidden rounded-md" role="img"
              aria-label={segments.map((s) => `${CONFIDENCE_TOKENS[s.key].label} ${cnyExact(s.value)} CNY ${s.count}곳`).join(", ")}>
              {segments.map((s) => s.value > 0 ? (
                <div key={s.key} style={{
                  width: `${pct(s.value, classifiedTotal)}%`,
                  background: s.key === "expected" ? CONFIDENCE_TOKENS.expected.tintBg : CONFIDENCE_TOKENS[s.key].color,
                  boxShadow: s.key === "expected" ? `inset 0 0 0 1px ${CONFIDENCE_TOKENS.expected.tintBorder}` : undefined,
                }} />
              ) : null)}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] tabular-nums">
              {segments.map((s) => (
                <span key={s.key}>
                  <b style={{ color: CONFIDENCE_TOKENS[s.key].strongColor }}>{CONFIDENCE_TOKENS[s.key].label} <MoneyValue value={s.value} /></b>
                  <span className="text-[#615D59]"> · {s.count}곳</span>
                </span>
              ))}
            </div>
          </>
        ) : null}
        <p className="mt-1.5 text-[11.5px] text-[#615D59]">
          미분류 {groups.unclassified.length}곳은 월별 매출이 없어 막대에서 뺐습니다 · 딜 {dealCount}건 · 고객 {customerCount}곳
          {remaining != null ? " · 남은 목표는 개요의 확정 매출 기준" : ""}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <DealList
          title="이번에 닫을 것"
          tag="고확도 상위"
          tagColor={CONFIDENCE_TOKENS["high-confidence"].color}
          rows={groups["high-confidence"]}
          total={totals["high-confidence"]}
          onDealClick={onDealClick}
          stage={{ label: CONFIDENCE_TOKENS["high-confidence"].label, color: CONFIDENCE_TOKENS["high-confidence"].color }}
        />
        <DealList
          title="확도를 올릴 것"
          tag="예정 상위"
          tagColor={CONFIDENCE_TOKENS.expected.strongColor}
          rows={groups.expected}
          total={totals.expected}
          onDealClick={onDealClick}
          stage={{ label: CONFIDENCE_TOKENS.expected.label, color: CONFIDENCE_TOKENS.expected.color }}
        />
        <section className="min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-3.5" aria-label="페이스 미달 담당">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h3 className="text-[13.5px] font-bold text-[#111110]">페이스 미달 담당</h3>
            <span className="text-[11.5px] text-[#615D59]">매출 달성률 낮은 순 · BD 병목</span>
          </div>
          {legacy ? (
            <p className="border-t border-[#E8E8E4] py-4 text-[12px] text-[#615D59]">{branchTeamLabel(team)}은 이력 조회라 현재 페이스를 판정하지 않습니다.</p>
          ) : !kpi ? (
            <p role="status" className="border-t border-[#E8E8E4] py-4 text-[12px] text-[#615D59]">담당자 KPI를 불러오는 중입니다.</p>
          ) : paceRows.length === 0 ? (
            <p className="border-t border-[#E8E8E4] py-4 text-[12px] text-[#615D59]">목표가 설정된 담당자가 없습니다.</p>
          ) : (
            <ol>
              {paceRows.map((row, index) => (
                <li key={row.member} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-baseline gap-2 border-t border-[#E8E8E4] py-2 text-[13px]">
                  <span className="text-[11px] tabular-nums text-[#615D59]">{index + 1}</span>
                  <span className="min-w-0 truncate">
                    <span className="font-bold text-[#111110]">{row.member}</span>{" "}
                    {row.team ? <span className="text-[11.5px] font-semibold" style={{ color: teamColorOf(row.team) }}>{branchTeamLabel(row.team)}</span> : null}
                    {row.bottleneck ? (
                      <span className="text-[11.5px] text-[#615D59]"> · {KPI_METRIC_LABELS[row.bottleneck.metric] ?? row.bottleneck.metric} {row.bottleneck.actual}/{row.bottleneck.goal}</span>
                    ) : null}
                  </span>
                  <span className={`font-bold tabular-nums ${row.pct < PACE_SHORTFALL_PCT ? "text-[#B43E3E]" : "text-[#111110]"}`}>{row.pct.toFixed(0)}%</span>
                </li>
              ))}
            </ol>
          )}
          <p className="border-t border-[#E8E8E4] pt-2 text-[11.5px] text-[#615D59]">{PACE_SHORTFALL_PCT}% 미만은 빨강 · 아래 KPI 표에서 전체 보기</p>
        </section>
      </div>
    </div>
  )
}
