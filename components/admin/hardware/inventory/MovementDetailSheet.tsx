"use client"

import { memo, useState } from "react"
import type { Dispatch, Ref, SetStateAction } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Clock3, Copy, Link2, Settings2, Users, X } from "lucide-react"

import { copyTextToClipboard } from "@/lib/export/browser-download"

import {
  formatLotLabel,
  formatNumber,
  isPlannedMovement,
  MOVEMENT_LABEL,
  MOVEMENT_TONE,
  type HardwareMovement,
} from "./shared"

// 값이 길어 truncate될 수 있는(시리얼 목록·보관 장소 등 자유 텍스트) detailFacts 항목만
// 복사 버튼을 붙인다 — 날짜·수량처럼 짧고 자명한 값까지 도배하지 않는다.
function isCopyableFact(label: string): boolean {
  return label.startsWith("시리얼") || label === "보관 장소" || label === "참조번호"
}

// 복사 버튼 — 비보안 컨텍스트·권한 거부에도 폴백이 있는 공용 복사(lib/export/browser-download)를 쓰고, 실패하면 "복사됨"이라 말하지 않는다.
function CopyButton({ value, label }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle")
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyTextToClipboard(value)
        setState(ok ? "ok" : "fail")
        window.setTimeout(() => setState("idle"), 1500)
      }}
      aria-label={label ? `${label} 복사` : "클립보드에 복사"}
      title={state === "fail" ? "복사하지 못했습니다" : "복사"}
      className="shrink-0 cursor-pointer rounded-md p-1 text-[#A39E98] transition hover:bg-[#F0F0EC] hover:text-[#31302E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
    >
      {state === "ok" ? <Check className="h-3.5 w-3.5 text-[#084734]" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      <span aria-live="polite" className="sr-only">{state === "ok" ? "복사되었습니다" : state === "fail" ? "복사하지 못했습니다" : ""}</span>
    </button>
  )
}

interface MovementDetailSheetProps {
  detailMovement: HardwareMovement | null
  setDetailId: Dispatch<SetStateAction<string | null>>
  reduceMotion: boolean | null
  detailPanelRef: Ref<HTMLElement>
  detailLotLabel: string | null
  detailFacts: Array<{ label: string; value: string }>
  detailCrm: { label: string; reference: string | null; href: string | null } | null
  detailCanEdit: boolean
  // hardware.finalize 표시용 — 취소 버튼 비활성 판단(강제는 서버 게이트).
  canFinalize: boolean
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
  canFinalize,
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
                    <span className="inline-flex items-center gap-0.5">
                      <span className="inline-flex rounded-md bg-[#ECFDF5] px-2 py-0.5 text-[12px] font-bold text-[#084734]">{detailLotLabel}</span>
                      <CopyButton value={detailLotLabel} label="물량번호" />
                    </span>
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
              {/* 이 기록으로 바로 오는 링크(?tab=history&m=<id>) — 메신저로 "이 건 확인해 주세요"를 보낼 때(L-10·L-4). */}
              <LinkCopyButton movementId={detailMovement.id} />
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
                {detailFacts.map((fact) => {
                  const copyable = fact.value !== "-" && isCopyableFact(fact.label)
                  return (
                    <div key={fact.label} className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-[#615D59]">{fact.label}</p>
                      {copyable ? (
                        <div className="mt-0.5 flex items-center gap-1">
                          <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#111110]">{fact.value}</p>
                          <CopyButton value={fact.value} label={fact.label} />
                        </div>
                      ) : (
                        <p className="mt-0.5 text-[13px] font-bold text-[#111110]">{fact.value}</p>
                      )}
                    </div>
                  )
                })}
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
                        <div className="flex min-w-0 items-center gap-1">
                          <p className="min-w-0 truncate text-[12px] text-[#31302E]">
                            참조 <span className="font-bold text-[#111110]">{detailCrm.reference}</span>
                          </p>
                          <CopyButton value={detailCrm.reference} />
                        </div>
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
                      // 상세는 연 채로 두고 확인 모달만 띄운다(L-12) — 모달에서 닫기를 누르면 상세로 돌아온다.
                      // 성공하면 부모가 상세를 닫는다.
                      voidMovement(detailMovement)
                    }}
                    disabled={!canFinalize}
                    title={canFinalize ? undefined : "기록 취소에는 확정 권한(hardware.finalize)이 필요합니다"}
                    className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded-md border border-[#F2B8B8] bg-white text-[13px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B43E3E]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    기록 취소
                  </button>
                </div>
              ) : detailMovement.source === "sheet_import" && !detailMovement.voided_at ? (
                <p className="rounded-lg bg-[#F6F5F4] px-3 py-2.5 text-center text-[11.5px] font-semibold text-[#615D59]">
                  시트 이관 기록은 여기서 수정·취소할 수 없습니다.
                </p>
              ) : null}
              {/* 비활성 버튼의 title 은 떠오르지 않는다(pointer-events-none) — 이유를 글로 보인다(L-17). */}
              {detailCanEdit && !canFinalize ? (
                <p className="text-center text-[11px] font-semibold text-[#615D59]">기록 취소에는 확정 권한(hardware.finalize)이 필요합니다.</p>
              ) : null}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default memo(MovementDetailSheet)

function LinkCopyButton({ movementId }: { movementId: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle")
  return (
    <button
      type="button"
      onClick={async () => {
        const url = `${window.location.origin}/admin/hardware?tab=history&m=${encodeURIComponent(movementId)}`
        const ok = await copyTextToClipboard(url)
        setState(ok ? "ok" : "fail")
        window.setTimeout(() => setState("idle"), 1800)
      }}
      aria-label="이 기록 링크 복사"
      title={state === "ok" ? "링크를 복사했습니다" : state === "fail" ? "복사하지 못했습니다" : "이 기록 링크 복사"}
      className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-[11px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
    >
      {state === "ok" ? <Check className="h-3.5 w-3.5 text-[#084734]" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
      <span aria-live="polite">{state === "ok" ? "복사됨" : "링크"}</span>
    </button>
  )
}
