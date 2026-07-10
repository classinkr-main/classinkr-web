"use client"

import { ChevronRight, SlidersHorizontal } from "lucide-react"
import {
  ChartLegend,
  DonutGauge,
  KpiActivityChart,
  KpiBottleneckMatrix,
  KpiGapChart,
  KpiRevenueActivityScatter,
  KpiTeamChart,
  LoadingPanel,
  MemberBarChart,
  formatMoney,
  formatPercent,
  kpiStatusTone,
  type KpiMemberView,
  type KpiMetricView,
} from "../SalesLedgerWorkbench"
import type { BranchKpiMemberRow, BranchKpiResponse } from "../types"
import type { BranchJsonState } from "./types"

type LedgerLens = "dsh" | "rev" | "kpi"

interface GaugeRow {
  id: string
  label: string
  pct: number
  value: string
  goal: string
}

interface KpiLensSectionProps {
  kpi: BranchJsonState<BranchKpiResponse>
  kpiMemberRows: KpiMemberView[]
  kpiTeamRows: Array<{ team: string; goal: number; status: number; pacing_pct: number }>
  kpiActivityRows: KpiMetricView[]
  kpiActivityPct: number
  kpiActivityActual: number
  kpiActivityGoal: number
  kpiTeamGaugeRows: GaugeRow[]
  kpiMemberGaugeRows: GaugeRow[]
  members: BranchKpiMemberRow[]
  setQuery: (value: string) => void
  setManagerFilter: (value: string) => void
  setRegionFilter: (value: string) => void
  setRevPage: (value: number) => void
  selectLens: (lens: LedgerLens) => void
}

export function KpiLensSection({
  kpi,
  kpiMemberRows,
  kpiTeamRows,
  kpiActivityRows,
  kpiActivityPct,
  kpiActivityActual,
  kpiActivityGoal,
  kpiTeamGaugeRows,
  kpiMemberGaugeRows,
  members,
  setQuery,
  setManagerFilter,
  setRegionFilter,
  setRevPage,
  selectLens,
}: KpiLensSectionProps) {
  return (
    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-[#084734]" />
                    <h2 className="text-[13px] font-bold text-[#111110]">KPI 병목과 담당자 상세</h2>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#615D59]">
                    활동 목표/실적, 매출 달성, 딜 수를 담당자별로 비교하고 REV 매출 행으로 바로 좁혀봅니다.
                  </p>
                </div>
                <span className="rounded-full bg-[#F6F5F4] px-2.5 py-1 text-[11px] font-bold text-[#615D59]">
                  {kpiMemberRows.length}명
                </span>
              </div>

              {kpi.loading && !kpi.data ? (
                <LoadingPanel label="KPI 데이터를 불러오는 중" />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["팀", `${kpiTeamRows.length}개`, "목표/실적 집계", "text-[#111110]"],
                      ["활동 KPI", formatPercent(kpiActivityPct), `${kpiActivityActual}/${kpiActivityGoal}`, "text-[#1E5DA8]"],
                    ].map(([label, value, hint, tone]) => (
                      <div key={String(label)} className="rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 py-3">
                        <p className="text-[10.5px] font-bold uppercase text-[#615D59]">{label}</p>
                        <p className={`mt-1 text-[18px] font-bold leading-none ${tone}`}>{value}</p>
                        <p className="mt-1.5 text-[11px] font-semibold text-[#615D59]">{hint}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
                    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">KPI 달성률</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">LD 우선</span>
                      </div>
                      <DonutGauge
                        label="활동 KPI"
                        pct={kpiActivityPct}
                        value={`${kpiActivityActual}/${kpiActivityGoal}`}
                        goal="LD · ACC · OPP · SOL · VST"
                        color="#1E5DA8"
                        size={112}
                      />
                    </section>

                    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">팀별 달성률</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">{kpiTeamGaugeRows.length}팀</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                        {kpiTeamGaugeRows.map((row) => (
                          <DonutGauge
                            key={row.id}
                            label={row.label}
                            pct={row.pct}
                            value={row.value}
                            goal={row.goal}
                            color="#084734"
                            size={82}
                          />
                        ))}
                      </div>
                    </section>

                    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">개인별 KPI 달성률</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">{kpiMemberGaugeRows.length}명</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                        {kpiMemberGaugeRows.map((row) => (
                          <DonutGauge
                            key={row.id}
                            label={row.label}
                            pct={row.pct}
                            value={row.value}
                            goal={row.goal}
                            color="#084734"
                            size={76}
                          />
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">팀별 목표/실적</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">overview 연동</span>
                      </div>
                      <KpiTeamChart rows={kpiTeamRows} />
                      <ChartLegend items={[{ label: "목표", color: "#D9D6D0" }, { label: "실적", color: "#084734" }]} />
                    </div>

                    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">활동 KPI 합산</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">{formatPercent(kpiActivityPct)}</span>
                      </div>
                      <KpiActivityChart rows={kpiActivityRows} />
                      <ChartLegend items={[{ label: "목표", color: "#D9D6D0" }, { label: "실적", color: "#1E5DA8" }]} />
                    </div>

                    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">개인별 매출 Gap</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">부족 큰 순</span>
                      </div>
                      <KpiGapChart rows={kpiMemberRows} />
                      <ChartLegend items={[{ label: "초과", color: "#084734" }, { label: "부족", color: "#B43E3E" }]} />
                    </div>

                    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">활동 × 매출 사분면</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">75% 기준선</span>
                      </div>
                      <KpiRevenueActivityScatter rows={kpiMemberRows} />
                    </div>

                    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">개인별 목표/실적</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">KR Team</span>
                      </div>
                      <MemberBarChart rows={members} />
                    </div>

                    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">개인별 활동 병목</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">낮은 순</span>
                      </div>
                      <KpiBottleneckMatrix
                        rows={kpiMemberRows}
                        onMemberClick={(member) => {
                          setQuery("")
                          setManagerFilter(member)
                          setRegionFilter("ALL")
                          setRevPage(1)
                          selectLens("rev")
                        }}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[940px] w-full text-left text-[12px]">
                  <thead className="bg-[#FAFAF8] text-[11px] uppercase tracking-[0.08em] text-[#615D59]">
                    <tr>
                      <th className="px-3 py-3 font-bold">담당자</th>
                      <th className="px-3 py-3 font-bold">팀</th>
                      <th className="px-3 py-3 text-right font-bold">매출</th>
                      <th className="px-3 py-3 text-right font-bold">딜</th>
                      <th className="px-3 py-3 font-bold">활동 KPI</th>
                      <th className="px-3 py-3 text-right font-bold">연동</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiMemberRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-[#615D59]">
                          KPI 담당자 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : kpiMemberRows.map(({ row, metrics, activityActual, activityGoal, activityPct }) => {
                      const activityTone = kpiStatusTone(activityPct)
                      const revenueTone = kpiStatusTone(row.achievement_pct)
                      return (
                        <tr key={row.member} className="border-t border-[#F0F0EC] transition hover:bg-[#FAFAF8]">
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => {
                                setQuery("")
                                setManagerFilter(row.member)
                                setRegionFilter("ALL")
                                setRevPage(1)
                                selectLens("rev")
                              }}
                              className="cursor-pointer font-bold text-[#111110] underline-offset-2 hover:text-[#084734] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                              aria-label={`${row.member} REV 행 보기`}
                            >
                              {row.member}
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <span className="rounded-full bg-[#F6F5F4] px-2 py-1 text-[11px] font-bold text-[#615D59]">
                              {row.team ?? "-"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <p className="font-bold text-[#111110]">{formatMoney(row.status)}</p>
                            <p className="mt-0.5 text-[10.5px] text-[#615D59]">목표 {formatMoney(row.goal)}</p>
                            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${revenueTone.className}`}>
                              {formatPercent(row.achievement_pct)} {revenueTone.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <p className="font-bold text-[#111110]">{row.deals_confirmed}/{row.deals_total}</p>
                            <p className="mt-0.5 text-[10.5px] text-[#615D59]">신규 {row.new_renew.new} · 갱신 {row.new_renew.renew}</p>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {metrics.map((metric) => (
                                <span
                                  key={`${row.member}-${metric.metric}`}
                                  className={`rounded-full px-2 py-1 text-[10px] font-bold ${kpiStatusTone(metric.pct).className}`}
                                  title={`${metric.metric} ${metric.actual}/${metric.goal}`}
                                >
                                  {metric.metric} {metric.actual}/{metric.goal}
                                </span>
                              ))}
                            </div>
                            <p className="mt-1.5 text-[10.5px] font-semibold text-[#615D59]">
                              활동 합계 {activityActual}/{activityGoal} · {formatPercent(activityPct)}
                            </p>
                            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${activityTone.className}`}>
                              활동 {activityTone.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setQuery("")
                                setManagerFilter(row.member)
                                setRegionFilter("ALL")
                                setRevPage(1)
                                selectLens("rev")
                              }}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#BDEFD8] px-2.5 py-1.5 text-[11px] font-bold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                            >
                              REV 보기
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              </section>
  )
}
