"use client"

import { memo } from "react"
import type { Dispatch, Ref, SetStateAction } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Clock3, Settings2, Users, X } from "lucide-react"

import {
  formatLotLabel,
  formatNumber,
  isPlannedMovement,
  MOVEMENT_LABEL,
  MOVEMENT_TONE,
  type HardwareMovement,
} from "./shared"

interface MovementDetailSheetProps {
  detailMovement: HardwareMovement | null
  setDetailId: Dispatch<SetStateAction<string | null>>
  reduceMotion: boolean | null
  detailPanelRef: Ref<HTMLElement>
  detailLotLabel: string | null
  detailFacts: Array<{ label: string; value: string }>
  detailCrm: { label: string; reference: string | null; href: string | null } | null
  detailCanEdit: boolean
  editMovement: (movement: HardwareMovement) => void
  voidMovement: (movement: HardwareMovement) => void
}

function MovementDetailSheet({
  detailMovement,
  setDetailId,
  reduceMotion,
  detailPanelRef,
  detailLotLabel,
  detailFacts,
  detailCrm,
  detailCanEdit,
  editMovement,
  voidMovement,
}: MovementDetailSheetProps) {
  return (
    <AnimatePresence>
      {detailMovement && (
        <motion.div
          key="detail-sheet"
          className="fixed inset-0 z-[45] flex justify-end bg-black/35 backdrop-blur-[2px]"
          onClick={() => setDetailId(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
        >
          <motion.aside
            ref={detailPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="기록 상세"
            onClick={(event) => event.stopPropagation()}
            className="flex h-full w-full flex-col overflow-y-auto border-l border-[rgba(0,0,0,0.08)] bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.06)] sm:max-w-[460px]"
            initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] bg-white px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${MOVEMENT_TONE[detailMovement.movement_type]}`}>
                    {MOVEMENT_LABEL[detailMovement.movement_type]} {formatNumber(detailMovement.quantity)}
                  </span>
                  {detailLotLabel ? (
                    <span className="inline-flex rounded-md bg-[#ECFDF5] px-2 py-0.5 text-[12px] font-bold text-[#084734]">{detailLotLabel}</span>
                  ) : (
                    <span className="inline-flex rounded-md border border-dashed border-[rgba(0,0,0,0.14)] bg-[#F6F5F4] px-2 py-0.5 text-[12px] font-bold text-[#A39E98]">물량번호 미지정</span>
                  )}
                  {isPlannedMovement(detailMovement) ? (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-[#FBF1E0] px-2 py-0.5 text-[11px] font-bold text-[#A8741A]">
                      <Clock3 className="h-3 w-3" />
                      배송 예정
                    </span>
                  ) : null}
                  {detailMovement.voided_at ? (
                    <span className="inline-flex rounded-full bg-[#F6F5F4] px-2 py-0.5 text-[11px] font-bold text-[#615D59]">취소됨</span>
                  ) : null}
                </div>
                <p className="mt-2 text-[16px] font-bold tracking-[-0.01em] text-[#111110]">{detailMovement.product_name}</p>
                <p className="mt-0.5 text-[12px] text-[#615D59]">
                  {detailMovement.to_location ? `${detailMovement.to_location} · ` : ""}
                  {formatLotLabel(detailMovement.reference_no) ?? detailMovement.status ?? MOVEMENT_LABEL[detailMovement.movement_type]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                aria-label="닫기"
                className="flex h-8 w-8 shrink-0 items-center justify-center cursor-pointer rounded-md text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4 p-5">
              <div className="grid grid-cols-2 gap-2.5">
                {detailFacts.map((fact) => (
                  <div key={fact.label} className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-[#615D59]">{fact.label}</p>
                    <p className="mt-0.5 text-[13px] font-bold text-[#111110]">{fact.value}</p>
                  </div>
                ))}
              </div>

              {detailMovement.memo?.trim() ? (
                <div className="rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2.5">
                  <p className="text-[11px] font-bold text-[#7A520F]">특이사항</p>
                  <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-[#7A520F]">{detailMovement.memo.trim()}</p>
                </div>
              ) : null}

              {detailCrm ? (
                <div className="overflow-hidden rounded-xl border border-[#BDEFD8] bg-white">
                  <div className="flex items-center gap-2.5 bg-[#ECFDF5] px-4 py-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#084734] text-white">
                      <Users className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-[#084734]">CRM 연계</p>
                      <p className="mt-0.5 truncate text-[11px] text-[#065c41]">{detailCrm.label}</p>
                    </div>
                  </div>
                  {detailCrm.reference || detailCrm.href ? (
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
                      {detailCrm.reference ? (
                        <p className="min-w-0 truncate text-[12px] text-[#31302E]">
                          참조 <span className="font-bold text-[#111110]">{detailCrm.reference}</span>
                        </p>
                      ) : null}
                      {detailCrm.href ? (
                        <Link
                          href={detailCrm.href}
                          className="shrink-0 whitespace-nowrap text-[11px] font-bold text-[#084734] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                        >
                          CRM에서 열기 ↗
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[rgba(0,0,0,0.14)] bg-[#FAFAF8] p-4 text-center">
                  <p className="text-[13px] font-bold text-[#111110]">
                    {detailMovement.movement_type === "inbound" ? "매입 입고 — 연결된 고객 없음" : "연결된 고객사 없음"}
                  </p>
                  <p className="mt-1 text-[11.5px] text-[#615D59]">
                    {detailMovement.movement_type === "inbound"
                      ? `${detailMovement.importer ?? "공급사"} · 물량번호 ${detailLotLabel ?? "-"} 입고 건입니다.`
                      : "출고 기록 시 CRM 실제 오더와 연동하면 여기에 표시됩니다."}
                  </p>
                </div>
              )}

              {detailCanEdit ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!detailMovement) return
                      const target = detailMovement
                      setDetailId(null)
                      editMovement(target)
                    }}
                    className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white text-[13px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100"
                  >
                    <Settings2 className="h-4 w-4" />
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!detailMovement) return
                      const target = detailMovement
                      setDetailId(null)
                      voidMovement(target)
                    }}
                    className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded-md border border-[#F2B8B8] bg-white text-[13px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B43E3E]/40 active:scale-[0.98] motion-reduce:active:scale-100"
                  >
                    기록 취소
                  </button>
                </div>
              ) : detailMovement.source === "sheet_import" && !detailMovement.voided_at ? (
                <p className="rounded-lg bg-[#F6F5F4] px-3 py-2.5 text-center text-[11.5px] font-semibold text-[#615D59]">
                  시트 이관 기록은 여기서 수정·취소할 수 없습니다.
                </p>
              ) : null}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default memo(MovementDetailSheet)
