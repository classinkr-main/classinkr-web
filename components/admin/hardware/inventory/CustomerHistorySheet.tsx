"use client"

import type { Dispatch, SetStateAction } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Users, X } from "lucide-react"

import {
  formatCurrency,
  formatDate,
  formatNumber,
  ledgerHref,
  MOVEMENT_LABEL,
  MOVEMENT_TONE,
  outboundSaleType,
  SALE_TYPE_META,
  UNSPECIFIED_CUSTOMER,
  type HardwareMovement,
} from "./shared"

interface CustomerHistoryData {
  name: string
  rows: HardwareMovement[]
  totalQty: number
  totalRevenue: number
  hasRevenue: boolean
  count: number
}

interface CustomerHistorySheetProps {
  customerHistory: CustomerHistoryData | null
  setCustomerDetail: Dispatch<SetStateAction<string | null>>
  setDetailId: Dispatch<SetStateAction<string | null>>
  reduceMotion: boolean | null
}

export default function CustomerHistorySheet({
  customerHistory,
  setCustomerDetail,
  setDetailId,
  reduceMotion,
}: CustomerHistorySheetProps) {
  return (
    <AnimatePresence>
      {customerHistory && (
        <motion.div
          key="customer-sheet"
          className="fixed inset-0 z-[46] flex justify-end bg-black/35 backdrop-blur-[2px]"
          onClick={() => setCustomerDetail(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
        >
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="고객사 거래이력"
            onClick={(event) => event.stopPropagation()}
            className="flex h-full w-full flex-col overflow-y-auto border-l border-[rgba(0,0,0,0.08)] bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.06)] sm:max-w-[480px]"
            initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] bg-white px-5 py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#615D59]">
                  <Users className="h-3.5 w-3.5" />
                  고객사 거래이력
                </p>
                <p className="mt-1 truncate text-[16px] font-bold tracking-[-0.01em] text-[#111110]">{customerHistory.name}</p>
                {customerHistory.name !== UNSPECIFIED_CUSTOMER ? (
                  <Link
                    href={ledgerHref(customerHistory.name)}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#084734] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                  >
                    매출 장부 ↗
                  </Link>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setCustomerDetail(null)}
                aria-label="닫기"
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4 p-5">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-[#615D59]">거래 건수</p>
                  <p className="mt-0.5 text-[16px] font-bold tabular-nums text-[#111110]">{formatNumber(customerHistory.count)}</p>
                </div>
                <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-[#615D59]">총 수량</p>
                  <p className="mt-0.5 text-[16px] font-bold tabular-nums text-[#111110]">{formatNumber(customerHistory.totalQty)}대</p>
                </div>
                <div className="rounded-lg border border-[#BDEFD8] bg-[#ECFDF5] px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-[#065c41]">총 매출</p>
                  <p className="mt-0.5 text-[15px] font-bold tabular-nums text-[#084734]">{customerHistory.hasRevenue ? formatCurrency(customerHistory.totalRevenue, "USD") : "-"}</p>
                </div>
              </div>

              {!customerHistory.hasRevenue ? (
                <p className="rounded-lg bg-[#F6F5F4] px-3 py-2 text-[11px] font-semibold text-[#615D59]">매출은 실판매 기준이며, 시트 재가져오기 후 반영됩니다.</p>
              ) : null}

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#615D59]">거래 타임라인</p>
                <div className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)]">
                  {customerHistory.rows.map((movement) => {
                    const saleType = outboundSaleType(movement)
                    return (
                      <button
                        key={movement.id}
                        type="button"
                        onClick={() => {
                          setCustomerDetail(null)
                          setDetailId(movement.id)
                        }}
                        className="grid w-full cursor-pointer grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-[rgba(0,0,0,0.06)] px-3.5 py-2.5 text-left transition first:border-t-0 hover:bg-[#FAFAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40"
                      >
                        <span className="text-[11px] font-semibold tabular-nums text-[#615D59]">{formatDate(movement.occurred_at)}</span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[12.5px] font-bold text-[#111110]">{movement.product_name}</span>
                            <span className={`inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${MOVEMENT_TONE[movement.movement_type]}`}>{MOVEMENT_LABEL[movement.movement_type]}</span>
                            {saleType && saleType !== "sales" ? (
                              <span className={`inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${SALE_TYPE_META[saleType].tone}`}>{SALE_TYPE_META[saleType].label}</span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[11px] tabular-nums text-[#615D59]">
                            {formatNumber(movement.quantity)}대{movement.status ? ` · ${movement.status}` : ""}
                          </span>
                        </span>
                        <span className="text-right text-[12px] font-bold tabular-nums text-[#084734]">
                          {movement.movement_type === "outbound" && movement.amount_usd != null ? formatCurrency(movement.amount_usd, "USD") : ""}
                        </span>
                      </button>
                    )
                  })}
                  {customerHistory.rows.length === 0 ? (
                    <p className="px-3.5 py-8 text-center text-[12px] text-[#615D59]">거래 기록이 없습니다.</p>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
