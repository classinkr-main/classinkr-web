"use client"

import { useState } from "react"
import { ExternalLink } from "lucide-react"
import type { ChannelSettlementOverview } from "@/lib/branch/channel-settlement"
import { comparisonDomain } from "@/lib/branch/compass-overview"
import { cny, cnyExact } from "@/lib/branch/money-format"
import { formatBusinessDateTimeLabel } from "@/lib/business-time"
import { ComparisonBarChart } from "@/components/admin/viz/ComparisonBarChart"
import { useBranchJson } from "../client-api"
import type { Period } from "../types"
import ComparisonBar from "./ComparisonBar"

const SHEET_URL = "https://docs.google.com/spreadsheets/d/1vBYyKc_pd5Kb2xyhDWG8lWMAd7fGsRcBoF_wK1wUc7Q/edit#gid=658082117"
const amount = (value: number | null) => value == null ? "미입력" : `¥${cnyExact(value)}`

export default function ChannelSettlementSection({ period, selectedMonth, refreshKey }: {
  period: Period
  selectedMonth: string
  refreshKey: number
}) {
  const [retry, setRetry] = useState(0)
  const monthQuery = period === "M" ? `&month=${encodeURIComponent(selectedMonth)}` : ""
  const resource = useBranchJson<ChannelSettlementOverview>(`/api/admin/branch/channel-settlement?period=${period}${monthQuery}`, refreshKey + retry)
  const data = resource.data
  const partnerDomain = comparisonDomain(data?.partners.map((partner) => partner.feeAmountRmb) ?? [])
  const monthlyDomain = comparisonDomain(data?.months.map((month) => month.feeAmountRmb) ?? [])
  const monthlyData = data?.months.map((month) => ({ ...month, label: `${Number(month.month.slice(5))}월` })) ?? []

  return <section aria-label="파트너 정산 현황" className="min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
      <div>
        <h2 className="text-[16px] font-bold text-[#111110]">파트너 정산 현황</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[#615D59]">전사 정산 · 결제일 기준 · CNY · 팀 필터와 별도 범위</p>
      </div>
      <a href={SHEET_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-[12px] font-medium text-[#084734] underline underline-offset-2">원본 시트 <ExternalLink aria-hidden="true" className="h-3 w-3" /></a>
    </div>
    <div className="space-y-5 px-5 py-5">
      {resource.loading && !data ? <p role="status" className="text-[13px] text-[#615D59]">채널 정산 시트를 불러오는 중입니다.</p>
        : resource.error && !data ? <div role="alert" className="text-[13px] text-[#7A520F]">
          <p>채널 정산 시트를 확인하지 못했습니다. 매출 차트와 별도로 연결 상태를 확인해 주세요.</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 min-h-11 rounded-md border border-[rgba(0,0,0,0.08)] px-3 font-medium text-[#084734]">다시 불러오기</button>
        </div>
        : !data ? <p role="status" className="text-[13px] text-[#615D59]">채널 정산 조회 결과가 없습니다.</p>
        : <>
          {resource.stale ? <p role="status" className="rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[12px] text-[#7A520F]">정산 갱신 실패 — 이전 조회 결과를 표시합니다. 아래 조회 시각을 확인해 주세요.</p> : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div><p className="text-[12px] text-[#615D59]">계약금액 · CNY</p><strong className="mt-1 block break-words text-[24px] font-bold tabular-nums text-[#111110]">{amount(data.totals.contractAmountRmb)}</strong><p className="mt-1 text-[12px] text-[#615D59]">입력 {data.totals.contractAmountRmbCount} / {data.totals.contracts}건</p></div>
            <div><p className="text-[12px] text-[#615D59]">수수료 계산액 · CNY</p><strong className="mt-1 block break-words text-[24px] font-bold tabular-nums text-[#084734]">{amount(data.totals.feeAmountRmb)}</strong><p className="mt-1 text-[12px] text-[#615D59]">입력 {data.totals.feeAmountRmbCount} / {data.totals.contracts}건 · 매출에 합산하지 않음</p></div>
            <div><p className="text-[12px] text-[#615D59]">정산일 미입력</p><strong className="mt-1 block text-[24px] font-bold tabular-nums text-[#111110]">{data.totals.settlementDateMissing}<span className="ml-1 text-[14px] font-normal text-[#615D59]">건</span></strong><p className="mt-1 text-[12px] text-[#615D59]">정산일 입력 {data.totals.settlementDateEntered}건 · 지급 여부 판단 아님</p></div>
          </div>

          {!data.totals.contracts ? <p role="status" className="rounded-lg bg-[#F6F5F4] px-4 py-3 text-[13px] text-[#615D59]">선택한 기간에 결제일이 있는 정산 내역이 없습니다.</p> : <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-[#111110]">파트너별 수수료 계산액</h3>
              <p className="mt-1 text-[12px] text-[#615D59]">CNY · 공통 축 · 음수·0 포함</p>
              <ul className="mt-3 space-y-4">
                {data.partners.map((partner) => <li key={partner.partner}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[13px]"><strong className="min-w-0 break-words text-[#31302E]">{partner.partner}</strong><span className="tabular-nums text-[#111110]">{amount(partner.feeAmountRmb)}</span></div>
                  {partner.feeAmountRmb == null ? <p className="text-[12px] text-[#615D59]">수수료 금액 미입력</p> : <ComparisonBar value={partner.feeAmountRmb} domain={partnerDomain} label={`${partner.partner} 수수료 계산액 ${amount(partner.feeAmountRmb)}`} />}
                  <p className="mt-1 text-[11px] text-[#615D59]">계약 {partner.contracts}건 · 수수료 입력 {partner.feeAmountRmbCount}건 · 정산일 미입력 {partner.settlementDateMissing}건</p>
                </li>)}
              </ul>
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-[#111110]">월별 수수료 계산액</h3>
              <p className="mt-1 text-[12px] text-[#615D59]">내역이 있는 결제 월 · CNY · 상세에서 입력 건수 확인</p>
              {data.months.some((month) => month.feeAmountRmb != null) ? <div role="img" aria-label="결제 월별 수수료 계산액 차트, 정확한 금액과 미입력은 아래 월별 원값에서 확인">
                <ComparisonBarChart data={monthlyData} xKey="label" bars={[{ key: "feeAmountRmb", label: "수수료 계산액 · CNY", color: "#084734", formatValue: (value) => amount(value) }]} height={220} leftDomain={[monthlyDomain.min, monthlyDomain.max]} formatLeftTick={(value) => cny(value)} labelFormatter={(_, payload) => (payload[0]?.payload as { month?: string } | undefined)?.month ?? ""} animate={false} />
              </div> : <p className="py-8 text-[13px] text-[#615D59]">수수료 금액이 입력된 내역이 없습니다.</p>}
              <details className="mt-2 border-t border-[rgba(0,0,0,0.08)]">
                <summary className="min-h-11 cursor-pointer py-3 text-[12px] font-medium text-[#084734] focus-visible:outline-2 focus-visible:outline-[#084734]">월별 원값 · 입력 건수</summary>
                <dl className="space-y-3 pb-2">{data.months.map((month) => <div key={month.month} className="text-[12px]"><dt className="font-semibold text-[#31302E]">{month.month}</dt><dd className="mt-1 text-[#615D59]">수수료 {amount(month.feeAmountRmb)} · 입력 {month.feeAmountRmbCount}/{month.contracts}건 · 정산일 미입력 {month.settlementDateMissing}건</dd></div>)}</dl>
              </details>
            </div>
          </div>}

          <div className="space-y-1 border-t border-[rgba(0,0,0,0.08)] pt-4 text-[12px] leading-relaxed text-[#615D59]">
            <p>계약금액 · KRW: {data.totals.contractAmountKrw == null ? "미입력 · 임의 환산하지 않습니다." : `₩${cnyExact(data.totals.contractAmountKrw)} · 원화 입력 ${data.totals.contractAmountKrwCount}건, CNY와 별도 표시합니다.`}</p>
            {data.quality.missingPaymentDate ? <p>원본 전체에서 결제일 미입력 {data.quality.missingPaymentDate}건은 기간을 판단할 수 없어 집계에서 제외했습니다.</p> : null}
            <p>수수료는 원본 계산액이며 지급 완료액을 뜻하지 않습니다. 정산일 공란만으로 미지급을 판단하지 않습니다.</p>
            <p>조회 범위 {data.periodStart.slice(0, 7)} ~ {new Date(Date.parse(data.periodEnd) - 86_400_000).toISOString().slice(0, 7)} · 기간 내 {data.totals.contracts}건</p>
            <p>원본 읽기 전용 · {data.source.sheetTitle} · 조회 {formatBusinessDateTimeLabel(data.source.readAt)}</p>
          </div>
        </>}
    </div>
  </section>
}
