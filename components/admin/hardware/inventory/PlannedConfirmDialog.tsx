"use client"

// 예상 출고 확정 확인창(하드웨어 라운드 3 H-9) — 선택 확정과 딜 "전체 확정"이 같이 쓴다.
// 확정일(오늘이 아니면 경고) · 행별 "확정 시 배정"(확정과 같은 잔량 계산, H-3) · lot 배정/미지정 합계 · 거절 예상 행을 한 화면에 둔다.
// 판정은 planned-confirm-model.ts(순수)가 하고, 이 파일은 그리기만 한다. 포커스 가두기·Esc 는 공용 Dialog(Radix)가 맡는다.

import { memo, useMemo } from "react"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  formatConfirmDateLong,
  formatConfirmDateShort,
  plannedAllocationSegments,
  summarizePlannedConfirm,
  type AllocationTone,
  type PlannedConfirmEntry,
} from "./planned-confirm-model"
import { formatNumber } from "./shared"

interface PlannedConfirmDialogProps {
  open: boolean
  title: string
  entries: PlannedConfirmEntry[]
  today: string
  onConfirm: () => void
  onClose: () => void
}

const TONE_CLASS: Record<AllocationTone, string> = {
  ok: "text-[#084734]",
  warn: "text-[#A8741A]",
  danger: "text-[#8F2C2C]",
  muted: "text-[#A39E98]",
}

function PlannedConfirmDialog({ open, title, entries, today, onConfirm, onClose }: PlannedConfirmDialogProps) {
  const summary = useMemo(() => summarizePlannedConfirm(entries, today), [entries, today])
  const singleDate = summary.dates.length === 1 ? summary.dates[0] : null
  // 거절이 확실한 행(지정 lot 잔량 부족)은 확정에서 뺀다 — 호출부(PlannedOutboundPanel)가 같은 판정으로 걸러 실행한다.
  const confirmable = summary.count - summary.rejected.length
  const confirmableQuantity = summary.quantity - summary.rejected.reduce((sum, row) => sum + row.quantity, 0)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-[13px]">
            {formatNumber(summary.count)}건 · {formatNumber(summary.quantity)}대 · 고객사 {formatNumber(summary.customers)}곳
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] font-bold text-[#615D59]">확정일</span>
            <span className="text-[14px] font-bold tabular-nums text-[#111110]">
              {singleDate ? formatConfirmDateLong(singleDate) : `행마다 다름 (${formatNumber(summary.dates.length)}개 날짜)`}
            </span>
          </div>
          {summary.nonToday && (
            <p role="note" className="rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[12px] font-semibold leading-relaxed text-[#7A520F]">
              {singleDate
                ? `오늘(${formatConfirmDateShort(today)})이 아닌 날짜입니다. 출고일과 판매 기간 집계가 ${formatConfirmDateShort(singleDate)}로 잡힙니다.`
                : `오늘(${formatConfirmDateShort(today)})이 아닌 확정일이 있습니다. 행마다 적힌 날짜로 출고일과 판매 기간 집계가 잡힙니다.`}
            </p>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-[rgba(0,0,0,0.08)]">
          <div
            aria-hidden
            className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,9rem)] gap-2 border-b border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-3 py-1.5 text-[11px] font-bold text-[#615D59]"
          >
            <span>품목 · 고객사</span>
            <span className="text-right">수량</span>
            <span>확정 시 배정</span>
          </div>
          <ul className="max-h-[40vh] divide-y divide-[rgba(0,0,0,0.05)] overflow-y-auto overscroll-contain">
            {entries.map((entry) => (
              <li key={entry.id} className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,9rem)] items-baseline gap-2 px-3 py-2 text-[12.5px]">
                <span className="min-w-0">
                  <span title={entry.productName} className="block truncate font-bold text-[#111110]">
                    {entry.productName}
                  </span>
                  <span title={entry.customer} className="block truncate text-[11.5px] text-[#615D59]">
                    {entry.customer}
                    {!singleDate ? ` · ${formatConfirmDateShort(entry.occurredAt)}` : ""}
                  </span>
                </span>
                <span className="text-right font-bold tabular-nums text-[#111110]">{formatNumber(entry.quantity)}</span>
                <span className="min-w-0 text-[12px] font-bold tabular-nums">
                  {plannedAllocationSegments(entry.preview, entry.quantity).map((segment, index) => (
                    <span key={index} className={TONE_CLASS[segment.tone]}>
                      {index > 0 ? " · " : ""}
                      {segment.text}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1.5 text-[12px] leading-relaxed">
          <p className="font-semibold text-[#31302E]">
            lot 배정 {formatNumber(summary.lotAssigned)}대
            {summary.unassigned > 0 && (
              <span className="text-[#7A520F]"> · 로트 미지정 {formatNumber(summary.unassigned)}대 — 확정 뒤 내역에서 로트를 채울 수 있습니다</span>
            )}
            {summary.unknown > 0 && <span className="text-[#615D59]"> · 미리보기 없음 {formatNumber(summary.unknown)}대(확정 때 배정)</span>}
          </p>
          {summary.rejected.length > 0 && (
            <p role="alert" className="rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 font-semibold text-[#8F2C2C]">
              지정 lot 잔량이 모자란 {formatNumber(summary.rejected.length)}건(
              {summary.rejected.map((row) => `${row.productName} ${row.label}`).join(", ")})은 서버가 거절하므로 이번 확정에서 뺍니다. 수정에서
              로트를 비우면 자동 배정됩니다.
            </p>
          )}
          <p className="text-[11.5px] text-[#615D59]">배정은 확정과 같은 계산(이 예약을 뺀 lot 잔량)입니다. 출고 확정은 되돌릴 수 없습니다.</p>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="h-10 cursor-pointer rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-4 text-[13px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmable === 0}
            className="h-10 cursor-pointer rounded-lg bg-[#084734] px-4 text-[13px] font-bold text-white transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50"
          >
            {formatNumber(confirmableQuantity)}대 확정
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default memo(PlannedConfirmDialog)
