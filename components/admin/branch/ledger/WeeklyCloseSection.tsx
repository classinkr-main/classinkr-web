"use client"

import { CalendarDays, ChevronRight, Loader2, Save } from "lucide-react"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import {
  WEEKLY_CLOSE_BUCKET_META,
  formatDateTime,
  formatMonthLabel,
  formatMoney,
  formatSignedMoney,
  numberCell,
  type WeeklyCloseDiffView,
  type WeeklyCloseRunView,
} from "./shared"

interface WeeklyCloseSectionProps {
  selectedMonth: string
  captureWeeklySnapshot: () => Promise<void>
  wcSnapshotting: boolean
  wcNotice: string | null
  wcError: string | null
  wcRuns: WeeklyCloseRunView[]
  wcBase: string
  setWcBase: (value: string) => void
  wcHead: string
  setWcHead: (value: string) => void
  wcLoading: boolean
  wcDiff: WeeklyCloseDiffView | null
}

export function WeeklyCloseSection({
  selectedMonth,
  captureWeeklySnapshot,
  wcSnapshotting,
  wcNotice,
  wcError,
  wcRuns,
  wcBase,
  setWcBase,
  wcHead,
  setWcHead,
  wcLoading,
  wcDiff,
}: WeeklyCloseSectionProps) {
  return (
    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
                        <CalendarDays className="h-4 w-4 text-[#084734]" />
                        주간 마감 (Weekly Close)
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[#615D59]">
                        스냅샷 두 개를 {formatMonthLabel(selectedMonth)} 기준으로 비교 — 신규/증액/감액/소멸과 확도 전환을 수치로 봅니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void captureWeeklySnapshot()}
                      disabled={wcSnapshotting}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#084734] px-3 text-[11.5px] font-bold text-white transition hover:bg-[#065c41] disabled:opacity-60"
                    >
                      {wcSnapshotting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      지금 스냅샷
                    </button>
                  </div>

                  {(wcNotice || wcError) && (
                    <div className={`mb-3 rounded-md border px-3 py-2 text-[11.5px] font-semibold ${
                      wcError ? "border-[#F2B8B8] bg-[#FCE9E9] text-[#8F2C2C]" : "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]"
                    }`}>
                      {wcError ?? wcNotice}
                    </div>
                  )}

                  {wcRuns.length < 2 ? (
                    <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-5 text-[12px] leading-relaxed text-[#615D59]">
                      저장된 스냅샷 {wcRuns.length.toLocaleString("ko-KR")}개 — 스냅샷이 2개 이상 쌓이면 주간 비교가 열립니다. 매주 금요일
                      23:30(KST)에 자동으로 기록되며, 필요할 때만 &ldquo;지금 스냅샷&rdquo;으로 즉시 남기면 됩니다.
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-bold text-[#615D59]">
                        <label className="inline-flex items-center gap-1.5">
                          기준
                          <select
                            value={wcBase}
                            onChange={(event) => setWcBase(event.target.value)}
                            className="h-8 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[11.5px] font-semibold text-[#111110] outline-none"
                          >
                            {wcRuns.map((run) => (
                              <option key={run.id} value={run.id} disabled={run.id === wcHead}>
                                {formatDateTime(run.startedAt)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <ChevronRight className="h-3.5 w-3.5 text-[#A39E98]" />
                        <label className="inline-flex items-center gap-1.5">
                          현재
                          <select
                            value={wcHead}
                            onChange={(event) => setWcHead(event.target.value)}
                            className="h-8 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[11.5px] font-semibold text-[#111110] outline-none"
                          >
                            {wcRuns.map((run) => (
                              <option key={run.id} value={run.id} disabled={run.id === wcBase}>
                                {formatDateTime(run.startedAt)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {wcLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#615D59]" />}
                        {wcDiff && (
                          <span className="ml-auto tabular-nums">
                            합계 {formatMoney(wcDiff.baseTotal)} → {formatMoney(wcDiff.headTotal)}
                            <span className={`ml-1.5 font-bold ${wcDiff.delta >= 0 ? "text-[#084734]" : "text-[#B43E3E]"}`}>
                              {formatSignedMoney(wcDiff.delta)}
                            </span>
                          </span>
                        )}
                      </div>

                      {wcDiff ? (
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                          <div>
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[380px] text-right text-[11.5px] tabular-nums">
                                <thead>
                                  <tr className="text-[10px] uppercase tracking-[0.08em] text-[#615D59]">
                                    <th className="py-1.5 pr-2 text-left font-bold">구분</th>
                                    <th className="px-2 py-1.5 font-bold">건수</th>
                                    <th className="px-2 py-1.5 font-bold">기준</th>
                                    <th className="px-2 py-1.5 font-bold">현재</th>
                                    <th className="py-1.5 pl-2 font-bold">Δ</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {WEEKLY_CLOSE_BUCKET_META.map((meta) => {
                                    const bucket = wcDiff.buckets[meta.id]
                                    return (
                                      <tr key={meta.id} className="border-t border-[#F0F0EC]">
                                        <td className={`py-2 pr-2 text-left font-bold ${meta.tone}`}>{meta.label}</td>
                                        <td className="px-2 py-2 font-semibold text-[#615D59]">{bucket.count.toLocaleString("ko-KR")}</td>
                                        <td className="px-2 py-2">{numberCell(bucket.baseAmount)}</td>
                                        <td className="px-2 py-2">{numberCell(bucket.headAmount)}</td>
                                        <td className={`py-2 pl-2 font-bold ${bucket.delta > 0 ? "text-[#084734]" : bucket.delta < 0 ? "text-[#B43E3E]" : "text-[#A39E98]"}`}>
                                          {formatSignedMoney(bucket.delta)}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                  <tr className="border-t-2 border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] text-[12px]">
                                    <td className="py-2 pr-2 text-left font-bold text-[#111110]">합계</td>
                                    <td className="px-2 py-2 font-semibold text-[#615D59]">
                                      {Object.values(wcDiff.buckets).reduce((sum, bucket) => sum + bucket.count, 0).toLocaleString("ko-KR")}
                                    </td>
                                    <td className="px-2 py-2">{numberCell(wcDiff.baseTotal)}</td>
                                    <td className="px-2 py-2">{numberCell(wcDiff.headTotal)}</td>
                                    <td className={`py-2 pl-2 font-bold ${wcDiff.delta >= 0 ? "text-[#084734]" : "text-[#B43E3E]"}`}>
                                      {formatSignedMoney(wcDiff.delta)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-[#615D59]">
                              <span>
                                확정 전환 <span className={`font-bold tabular-nums ${wcDiff.confirmedDelta >= 0 ? CONFIDENCE_TOKENS.confirmed.textClass : "text-[#B43E3E]"}`}>{formatSignedMoney(wcDiff.confirmedDelta)}</span>
                              </span>
                              <span>
                                고확도 전환 <span className={`font-bold tabular-nums ${wcDiff.highConfidenceDelta >= 0 ? CONFIDENCE_TOKENS["high-confidence"].textClass : "text-[#B43E3E]"}`}>{formatSignedMoney(wcDiff.highConfidenceDelta)}</span>
                              </span>
                            </div>
                          </div>

                          <div>
                            <p className="mb-1.5 text-[11px] font-bold text-[#615D59]">변동 상위 {wcDiff.movers.length}건</p>
                            {wcDiff.movers.length === 0 ? (
                              <div className="rounded-md border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-3 text-[11px] text-[#615D59]">
                                {formatMonthLabel(selectedMonth)}에 두 스냅샷 간 변동이 없습니다.
                              </div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full min-w-[420px] text-right text-[11.5px] tabular-nums">
                                  <thead>
                                    <tr className="text-[10px] uppercase tracking-[0.08em] text-[#615D59]">
                                      <th className="py-1.5 pr-2 text-left font-bold">고객</th>
                                      <th className="px-2 py-1.5 text-left font-bold">담당</th>
                                      <th className="px-2 py-1.5 font-bold">기준 → 현재</th>
                                      <th className="py-1.5 pl-2 font-bold">Δ</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {wcDiff.movers.map((mover) => {
                                      const meta = WEEKLY_CLOSE_BUCKET_META.find((item) => item.id === mover.bucket)
                                      return (
                                        <tr key={mover.key} className="border-t border-[#F0F0EC]">
                                          <td className="max-w-[150px] truncate py-2 pr-2 text-left font-bold text-[#111110]">
                                            {mover.account}
                                            {meta && <span className={`ml-1.5 text-[9.5px] font-bold ${meta.tone}`}>{meta.label}</span>}
                                          </td>
                                          <td className="px-2 py-2 text-left text-[11px] text-[#615D59]">{mover.manager ?? "-"}</td>
                                          <td className="px-2 py-2 font-semibold text-[#615D59]">
                                            {formatMoney(mover.baseAmount)} → {formatMoney(mover.headAmount)}
                                          </td>
                                          <td className={`py-2 pl-2 font-bold ${mover.delta > 0 ? "text-[#084734]" : "text-[#B43E3E]"}`}>
                                            {formatSignedMoney(mover.delta)}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-4 text-[12px] text-[#615D59]">
                          기준과 현재 스냅샷을 서로 다르게 선택하면 {formatMonthLabel(selectedMonth)} 비교 수치가 나옵니다.
                        </div>
                      )}
                    </>
                  )}
                </section>
  )
}
