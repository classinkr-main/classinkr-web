"use client"

import type { Dispatch, SetStateAction } from "react"
import { CalendarDays, ChevronRight, Target, TrendingUp } from "lucide-react"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import {
  BreakdownNumbersTable,
  RevWeekNumbersTable,
  formatMonthLabel,
  formatMoney,
  formatPercent,
  type BreakdownNumbersRow,
  type RevWeekPoint,
} from "./shared"

interface RevAuxAnalysisSectionProps {
  revAuxOpen: boolean
  setRevAuxOpen: Dispatch<SetStateAction<boolean>>
  selectedMonth: string
  revComparableGoal: number | null
  revGoalMutedByFilter: boolean
  revMonthConfirmed: number
  revMonthPlanned: number
  revMonthHighConfidence: number
  revMonthCovered: number
  revMonthMonthlyOnly: number
  revMonthRemaining: number | null
  revMonthScale: number
  revMonthOpen: number
  revPeakWeek: RevWeekPoint | undefined
  revWeekProjection: RevWeekPoint[]
  revMonthRowCount: number
  revManagerTableRows: BreakdownNumbersRow[]
  revManagerTotalCount: number
  revManagerSummaryExpanded: boolean
  onToggleManagerSummaryExpanded: () => void
  onManagerRowClick: (manager: string) => void
  revProductTableRows: BreakdownNumbersRow[]
}

export function RevAuxAnalysisSection({
  revAuxOpen,
  setRevAuxOpen,
  selectedMonth,
  revComparableGoal,
  revGoalMutedByFilter,
  revMonthConfirmed,
  revMonthPlanned,
  revMonthHighConfidence,
  revMonthCovered,
  revMonthMonthlyOnly,
  revMonthRemaining,
  revMonthScale,
  revMonthOpen,
  revPeakWeek,
  revWeekProjection,
  revMonthRowCount,
  revManagerTableRows,
  revManagerTotalCount,
  revManagerSummaryExpanded,
  onToggleManagerSummaryExpanded,
  onManagerRowClick,
  revProductTableRows,
}: RevAuxAnalysisSectionProps) {
  return (
    <>
                {/* 보조 분석(강등): 선택 월 목표대비·주차별·담당자/상품군. 기본 접힘 — 1차 뷰는 아래 매트릭스. */}
                <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8]">
                  <button
                    type="button"
                    onClick={() => setRevAuxOpen((value) => !value)}
                    aria-expanded={revAuxOpen}
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition hover:bg-[#F0F0EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/30"
                  >
                    <span className="flex shrink-0 items-center gap-2 text-[12px] font-bold text-[#111110]">
                      <Target className="h-3.5 w-3.5 text-[#084734]" />
                      {formatMonthLabel(selectedMonth)} 보조 분석 · 목표 대비 · 주차별 · 담당자/상품군
                    </span>
                    {!revAuxOpen && (
                      <span className="hidden min-w-0 flex-1 items-center justify-end gap-x-3 overflow-hidden whitespace-nowrap text-[11px] font-semibold tabular-nums text-[#615D59] md:flex">
                        <span>목표 <span className="font-bold text-[#111110]">{revComparableGoal !== null ? formatMoney(revComparableGoal) : revGoalMutedByFilter ? "필터 중 생략" : "–"}</span></span>
                        <span>확정 <span className="font-bold text-[#084734]">{formatMoney(revMonthConfirmed)}</span></span>
                        {revComparableGoal !== null && (
                          <span>
                            달성률{" "}
                            <span className={`font-bold ${revMonthConfirmed >= revComparableGoal ? "text-[#084734]" : "text-[#B43E3E]"}`}>
                              {formatPercent((revMonthConfirmed / revComparableGoal) * 100)}
                            </span>
                          </span>
                        )}
                        <span>예정 <span className="font-bold text-[#7A520F]">{formatMoney(revMonthPlanned)}</span></span>
                      </span>
                    )}
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-[#615D59]">
                      {revAuxOpen ? "접기" : "펼치기"}
                      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${revAuxOpen ? "rotate-90" : ""}`} />
                    </span>
                  </button>
                </div>
                {revAuxOpen && (
                <div className="space-y-4 border-b border-[rgba(0,0,0,0.08)] p-4">
                  <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
                          <Target className="h-4 w-4 text-[#084734]" />
                          {formatMonthLabel(selectedMonth)} 목표 대비 수치
                        </p>
                        <p className="mt-1 text-[11px] text-[#615D59]">
                          현재 검색/필터가 반영된 REV 집계 · 월 목표는 DSH 시리즈(팀 스코프) 기준
                        </p>
                      </div>
                      {revGoalMutedByFilter ? (
                        <span
                          className="rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2.5 py-1 text-[10.5px] font-bold text-[#7A520F]"
                          title="월 목표는 팀 전체 기준이라 담당자·지역·상품·검색 필터가 걸린 집계와 비교할 수 없습니다. 필터를 초기화하면 달성률이 다시 표시됩니다."
                        >
                          필터 중 — 팀 목표 비교 생략
                        </span>
                      ) : revComparableGoal === null ? (
                        <span className="rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2.5 py-1 text-[10.5px] font-bold text-[#7A520F]">
                          선택 월 목표 없음
                        </span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                      <div className="rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5">
                        <p className="text-[10.5px] font-bold text-[#615D59]">월 목표</p>
                        <p className="mt-1 text-[17px] font-bold tabular-nums text-[#111110]">
                          {revComparableGoal !== null ? formatMoney(revComparableGoal) : "–"}
                        </p>
                        <p className="mt-0.5 text-[10px] font-semibold text-[#A39E98]">
                          {revGoalMutedByFilter ? "필터 중 — 비교 생략" : "DSH 월간 목표"}
                        </p>
                      </div>
                      <div className="rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5">
                        <p className="text-[10.5px] font-bold text-[#615D59]">확정</p>
                        <p className={`mt-1 text-[17px] font-bold tabular-nums ${CONFIDENCE_TOKENS.confirmed.textClass}`}>{formatMoney(revMonthConfirmed)}</p>
                        <p className="mt-0.5 text-[10px] font-semibold text-[#A39E98]">
                          {revComparableGoal !== null
                            ? `달성률 ${formatPercent((revMonthConfirmed / revComparableGoal) * 100)}`
                            : revGoalMutedByFilter
                              ? "필터 중 — 달성률 생략"
                              : "월 목표 미설정"}
                        </p>
                      </div>
                      <div className="rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5">
                        <p className="text-[10.5px] font-bold text-[#615D59]">고확도</p>
                        <p className={`mt-1 text-[17px] font-bold tabular-nums ${CONFIDENCE_TOKENS["high-confidence"].textClass}`}>{formatMoney(revMonthHighConfidence)}</p>
                        <p className="mt-0.5 text-[10px] font-semibold text-[#A39E98]">
                          {revComparableGoal !== null
                            ? `확정+고확도 ${formatPercent((revMonthCovered / revComparableGoal) * 100)}`
                            : `확정+고확도 ${formatMoney(revMonthCovered)}`}
                        </p>
                      </div>
                      <div className="rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5">
                        <p className="text-[10.5px] font-bold text-[#615D59]">예정·월합계만</p>
                        <p className={`mt-1 text-[17px] font-bold tabular-nums ${CONFIDENCE_TOKENS.expected.textClass}`}>{formatMoney(revMonthPlanned)}</p>
                        <p className="mt-0.5 text-[10px] font-semibold text-[#A39E98]">월합계만 {formatMoney(revMonthMonthlyOnly)}</p>
                      </div>
                      <div className="rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5">
                        <p className="text-[10.5px] font-bold text-[#615D59]">목표까지</p>
                        {revMonthRemaining === null ? (
                          <>
                            <p className="mt-1 text-[17px] font-bold tabular-nums text-[#111110]">–</p>
                            <p className="mt-0.5 text-[10px] font-semibold text-[#A39E98]">
                              {revGoalMutedByFilter ? "필터 중 — 비교 생략" : "월 목표 미설정"}
                            </p>
                          </>
                        ) : revMonthRemaining > 0 ? (
                          <>
                            <p className="mt-1 text-[17px] font-bold tabular-nums text-[#B43E3E]">{formatMoney(revMonthRemaining)}</p>
                            <p className="mt-0.5 text-[10px] font-semibold text-[#A39E98]">확정 기준 부족</p>
                          </>
                        ) : (
                          <>
                            <p className="mt-1 text-[17px] font-bold tabular-nums text-[#084734]">+{formatMoney(Math.abs(revMonthRemaining))}</p>
                            <p className="mt-0.5 text-[10px] font-semibold text-[#A39E98]">목표 초과 달성</p>
                          </>
                        )}
                      </div>
                    </div>
                    {revComparableGoal !== null && (
                      <div className="mt-3">
                        <div className="relative h-2.5 overflow-hidden rounded-full bg-[#F0F0EC]">
                          <div className="absolute inset-y-0 left-0 flex w-full">
                            <span className={`h-full ${CONFIDENCE_TOKENS.confirmed.bgClass}`} style={{ width: `${(revMonthConfirmed / revMonthScale) * 100}%` }} />
                            <span className={`h-full ${CONFIDENCE_TOKENS["high-confidence"].bgClass}`} style={{ width: `${(revMonthHighConfidence / revMonthScale) * 100}%` }} />
                            <span className={`h-full ${CONFIDENCE_TOKENS.expected.bgClass}`} style={{ width: `${(revMonthOpen / revMonthScale) * 100}%` }} />
                            <span className="h-full bg-[#D9D6D0]" style={{ width: `${(revMonthMonthlyOnly / revMonthScale) * 100}%` }} />
                          </div>
                          <span
                            className="absolute inset-y-0 w-[2px] bg-[#111110]"
                            style={{ left: `calc(${Math.min((revComparableGoal / revMonthScale) * 100, 100)}% - 1px)` }}
                            aria-label={`월 목표 ${formatMoney(revComparableGoal)} 위치`}
                          />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-[#615D59]">
                          <span className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${CONFIDENCE_TOKENS.confirmed.bgClass}`} />{CONFIDENCE_TOKENS.confirmed.label}</span>
                          <span className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${CONFIDENCE_TOKENS["high-confidence"].bgClass}`} />{CONFIDENCE_TOKENS["high-confidence"].label}</span>
                          <span className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${CONFIDENCE_TOKENS.expected.bgClass}`} />{CONFIDENCE_TOKENS.expected.label}</span>
                          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#D9D6D0]" />월합계만</span>
                          <span className="inline-flex items-center gap-1"><span className="h-3 w-[2px] bg-[#111110]" />월 목표 {formatMoney(revComparableGoal)}</span>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
                          <CalendarDays className="h-4 w-4 text-[#084734]" />
                          {formatMonthLabel(selectedMonth)} 주차별 수치 (W1–W5)
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-[#615D59]">
                          REV w1-w5 입력 기준 · 월합계만 입력된 행은 W5 열에 합산 · 주차 흐름 차트는 KR Team 개요
                        </p>
                      </div>
                      <span className="rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#084734]">
                        피크 {revPeakWeek?.week ?? "-"} · {formatMoney(revPeakWeek?.total)}
                      </span>
                    </div>
                    <RevWeekNumbersTable data={revWeekProjection} month={selectedMonth} monthGoal={revComparableGoal} monthRowCount={revMonthRowCount} />
                  </section>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-[12px] font-bold text-[#111110]">
                          <TrendingUp className="h-3.5 w-3.5 text-[#A8741A]" />
                          담당자별 월 수치
                        </p>
                        <button
                          type="button"
                          onClick={onToggleManagerSummaryExpanded}
                          className="text-[10.5px] font-bold text-[#615D59] underline decoration-dotted underline-offset-2 transition hover:text-[#084734]"
                        >
                          {revManagerSummaryExpanded
                            ? `전체 ${revManagerTotalCount}명 · 접기`
                            : `상위 ${revManagerTableRows.length}명 · 전체 보기(${revManagerTotalCount})`}
                        </button>
                      </div>
                      <BreakdownNumbersTable
                        rows={revManagerTableRows}
                        emptyLabel="선택 월에 담당자별 REV 금액이 없습니다."
                        onRowClick={onManagerRowClick}
                      />
                      <p className="mt-1.5 text-[10px] text-[#615D59]">행 클릭 시 해당 담당자로 필터링됩니다.</p>
                    </section>
                    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">상품군 수치</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">HW 판정 외 전부 SW</span>
                      </div>
                      <BreakdownNumbersTable rows={revProductTableRows} emptyLabel="선택 월에 상품군을 추정할 수 있는 REV 금액이 없습니다." />
                    </section>
                  </div>
                </div>
                )}
    </>
  )
}
