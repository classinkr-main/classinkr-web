"use client"

import Link from "next/link"
import { ArrowUpRight, Gauge } from "lucide-react"
import { StatTile } from "@/components/admin/viz"
import { KRW, PCT1, won } from "@/components/admin/campaigns/event-format"
import type { MarketingPerfResponse, PerfKpi } from "@/lib/marketing/perf"
import { AD_CHANNEL_COLOR, AD_CHANNEL_LABEL, type AdChannel } from "@/lib/types/event-metrics"

// 채널 믹스(읽기) — 상세 › 퍼널·채널. perf.channelMix(7채널 KRW 배정 vs 수기 집행, 라이브 연동
// 채널(Meta·Google·네이버) 행만 실집행 병기)를 표로 보여준다. 편집(배정 입력)은 데이터 층
// ChannelBudgetTable 이 정본이다.
//
// 정직 규칙: 통화 분리 — KRW 수기 집행 열과 라이브 집행 열을 절대 합치지 않는다. 라이브 집행은
// 채널마다 통화가 다를 수 있어(Meta USD · 네이버 KRW 등) 통화를 아는 값만 그 통화 그대로 적고,
// 합계는 측정된 채널의 통화가 하나일 때만 낸다(lib/marketing/ad-insights mergeSameCurrency 와 같은 규칙).
// 집행 null 은 "—"(미입력·미측정)이지 0 이 아니다.
// 채널 점 색은 DESIGN.md §2 제3자 채널 식별색(차트·표 한정 허용).

const NUM2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 })
// 통화 코드를 앞에 그대로 적는다("USD 4,860" · "KRW 400,000") — 기호($·₩)로 줄이면 열 안에서 통화가 섞여 보인다.
const liveMoney = (value: number, currency: string) => `${currency} ${NUM2.format(value)}`

export function ChannelMixCard({
  channelMix,
  budgetExecution,
  editHref,
}: {
  channelMix: MarketingPerfResponse["channelMix"]
  /** KRW 배정 대비 수기 집행(%) — 한눈에 층에서 내려온 타일. 배정·집행이 기간 개념 없는 누적값이라 델타 없음. */
  budgetExecution: PerfKpi
  editHref: string
}) {
  const rows = channelMix.map((row) => {
    const channel = row.channel as AdChannel
    const executionPct = row.spendKrw != null && row.budget > 0 ? (row.spendKrw / row.budget) * 100 : null
    return {
      channel,
      label: AD_CHANNEL_LABEL[channel] ?? row.channel,
      color: AD_CHANNEL_COLOR[channel] ?? "#A39E98",
      budget: row.budget,
      spendKrw: row.spendKrw,
      executionPct,
      // 통화를 모르는 금액은 표기하지 않는다 — liveCurrency 가 있어야만 liveSpend 를 쓴다.
      liveSpend: row.liveCurrency != null ? row.liveSpend : null,
      liveCurrency: row.liveCurrency,
    }
  })
  const totalBudget = rows.reduce((sum, row) => sum + row.budget, 0)
  const measuredSpend = rows.filter((row) => row.spendKrw != null)
  const totalSpend = measuredSpend.reduce((sum, row) => sum + (row.spendKrw ?? 0), 0)
  // 라이브 집행 합계 — 측정된 행의 통화가 정확히 하나일 때만. 섞이면 합계 칸을 비운다.
  const liveRows = rows.filter(
    (row): row is typeof row & { liveSpend: number; liveCurrency: string } =>
      row.liveSpend != null && row.liveCurrency != null
  )
  const liveCurrencies = new Set(liveRows.map((row) => row.liveCurrency))
  const liveTotal =
    liveCurrencies.size === 1
      ? { currency: liveRows[0].liveCurrency, spend: liveRows.reduce((sum, row) => sum + row.liveSpend, 0) }
      : null

  return (
    <div className="flex flex-col gap-4">
      <StatTile
        compact
        valueSize="lg"
        icon={<Gauge className="h-3.5 w-3.5" />}
        label="예산 집행률 · KRW 축"
        value={budgetExecution.value != null ? `${PCT1.format(budgetExecution.value)}%` : "—"}
        hint={
          budgetExecution.value != null
            ? "KRW 배정 대비 수기 집행 · 기간 비교 없음"
            : "배정 또는 집행 입력이 없어 미산정 — 데이터 › 예산·성과 입력"
        }
        href={editHref}
      />
      <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5" aria-label="채널 믹스">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-[14px] font-semibold text-[#111110]">채널 믹스</h3>
            <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
              배정·집행은 KRW 수기 입력 · 라이브 연동 채널(Meta·Google·네이버) 집행은 통화 그대로 따로 표기(수기 집행과 합산 없음)
            </p>
          </div>
          <Link href={editHref} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#084734] hover:underline">
            배정·집행 입력 → 데이터 <ArrowUpRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-xl bg-[#fafaf8] py-6 text-center text-[12px] text-[#A39E98]">
            채널 예산 조회에 실패했거나 아직 배정이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[520px] w-full text-[12px] tabular-nums">
              <thead className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]/35">
                <tr className="border-b border-[#f0f0ec]">
                  <th className="pb-2 pr-3 text-left">채널</th>
                  <th className="px-3 pb-2 text-right">배정 KRW</th>
                  <th className="px-3 pb-2 text-right">집행 KRW</th>
                  <th className="px-3 pb-2 text-right">집행률</th>
                  <th className="pb-2 pl-3 text-right">라이브 집행</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0ec]">
                {rows.map((row) => (
                  <tr key={row.channel}>
                    <td className="py-2 pr-3 text-left">
                      <span className="inline-flex items-center gap-2 font-medium text-[#111110]">
                        <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                        {row.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-[#111110]">{row.budget > 0 ? won(row.budget) : "—"}</td>
                    <td className="px-3 py-2 text-right text-[#111110]">{row.spendKrw != null ? won(row.spendKrw) : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {row.executionPct != null ? `${PCT1.format(row.executionPct)}%` : <span className="text-[#A39E98]">—</span>}
                    </td>
                    <td className="py-2 pl-3 text-right text-[#615D59]">
                      {row.liveSpend != null && row.liveCurrency != null ? liveMoney(row.liveSpend, row.liveCurrency) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-[#e8e8e4] text-[12px] font-semibold text-[#111110]">
                <tr>
                  <td className="pt-2 pr-3 text-left">합계</td>
                  <td className="px-3 pt-2 text-right">{totalBudget > 0 ? won(totalBudget) : "—"}</td>
                  <td className="px-3 pt-2 text-right">
                    {measuredSpend.length > 0 ? won(totalSpend) : "—"}
                    {measuredSpend.length > 0 && measuredSpend.length < rows.length && (
                      <span className="ml-1 text-[10px] font-normal text-[#A39E98]">({KRW.format(measuredSpend.length)}채널 입력)</span>
                    )}
                  </td>
                  <td className="px-3 pt-2 text-right">
                    {totalBudget > 0 && measuredSpend.length > 0 ? `${PCT1.format((totalSpend / totalBudget) * 100)}%` : "—"}
                  </td>
                  <td className="pt-2 pl-3 text-right text-[#615D59]">
                    {liveTotal ? (
                      liveMoney(liveTotal.spend, liveTotal.currency)
                    ) : liveRows.length > 0 ? (
                      <span className="text-[10px] font-normal text-[#A39E98]">통화 혼재 — 합산 없음</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
