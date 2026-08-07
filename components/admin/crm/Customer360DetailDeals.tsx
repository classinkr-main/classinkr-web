"use client"

import { AlertTriangle, FileText, Link2, ListTodo, Receipt } from "lucide-react"

import { Panel, StatTile, TableEmpty } from "@/components/admin/viz"
import type { ListCrmDealsResult } from "@/lib/repositories/crm-deals"

import {
  DEAL_STAGE_LABEL,
  DEAL_STATUS_LABEL,
  FieldCell,
  formatDay,
  formatKRW,
} from "./Customer360DetailShared"

function statusClass(status: string): string {
  if (status === "won") return "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]"
  if (status === "lost") return "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]"
  return "border-[#e8e8e4] bg-white text-[#1a1a1a]/55"
}

export default function Customer360DetailDeals({ deals }: { deals: ListCrmDealsResult }) {
  const { summary, rows } = deals

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={<ListTodo className="h-4 w-4" />} label="진행 딜" value={summary.open} tone="brand" />
        <StatTile icon={<Receipt className="h-4 w-4" />} label="완료" value={summary.won} tone="neutral" />
        <StatTile icon={<AlertTriangle className="h-4 w-4" />} label="실패" value={summary.lost} tone="danger" />
        <StatTile
          icon={<FileText className="h-4 w-4" />}
          label="진행 딜 예상금액"
          value={formatKRW(summary.openAmount)}
          // 집계가 전체를 못 덮으면 그 사실을 밝힌다 — 부분 합계를 총액처럼 읽히게 두지 않는다.
          hint={
            summary.aggregateTruncated
              ? `Deal Lite · 내부 ₩ · 상위 ${summary.returned}/${summary.total}건 기준`
              : "Deal Lite · 내부 ₩"
          }
          tone="neutral"
        />
      </div>

      <Panel title={`딜 (${summary.total})`} description="Deal Lite · 예상금액은 내부 Classin 원화(₩)">
        {rows.length === 0 ? (
          <TableEmpty message="진행 중인 딜이 없습니다." />
        ) : (
          <ul className="space-y-3">
            {rows.map((deal) => (
              <li key={deal.id} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-[#111110]">{deal.title}</p>
                    <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
                      {deal.ownerNameSnapshot ?? "담당 미배정"}
                      {deal.expectedCloseAt ? ` · 예상 종료 ${formatDay(deal.expectedCloseAt)}` : " · 종료일 미정"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-2 py-0.5 text-[11px] font-semibold text-[#1a1a1a]/55">
                      {DEAL_STAGE_LABEL[deal.stage] ?? deal.stage}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(deal.status)}`}>
                      {DEAL_STATUS_LABEL[deal.status] ?? deal.status}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  <FieldCell
                    label="예상금액"
                    value={<span className="text-[15px] font-bold tabular-nums">{formatKRW(deal.expectedAmount)}</span>}
                  />
                  <FieldCell
                    label="견적 ref"
                    value={
                      deal.quoteRef ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[12px]">
                          <FileText className="h-3 w-3 text-[#1a1a1a]/35" />
                          {deal.quoteRef}
                        </span>
                      ) : (
                        <span className="text-[#1a1a1a]/35">-</span>
                      )
                    }
                  />
                  <FieldCell
                    label="오더 ref"
                    value={
                      deal.orderRef ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[12px]">
                          <Receipt className="h-3 w-3 text-[#1a1a1a]/35" />
                          {deal.orderRef}
                        </span>
                      ) : (
                        <span className="text-[#1a1a1a]/35">-</span>
                      )
                    }
                  />
                  <FieldCell
                    label="다음 태스크"
                    value={
                      deal.nextTaskId ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[12px]">
                          <Link2 className="h-3 w-3 text-[#1a1a1a]/35" />
                          {deal.nextTaskId.slice(0, 8)}
                        </span>
                      ) : (
                        <span className="text-[#B85C33]">연결 없음</span>
                      )
                    }
                  />
                </div>

                {deal.riskNote ? (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{deal.riskNote}</span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
