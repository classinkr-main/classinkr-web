"use client"

import type { Dispatch, SetStateAction } from "react"
import Link from "next/link"
import { ExternalLink, Link2, Save, X } from "lucide-react"

import {
  confidenceClass,
  confidenceCopy,
  formatCurrency,
  formatDate,
  formatNumber,
  MOVEMENT_LABEL,
  type HardwareCrmOrderCandidate,
  type HardwareMovementDraft,
} from "./shared"

interface CrmConfirmModalProps {
  pendingMovement: HardwareMovementDraft
  closeCrmConfirmation: () => void
  crmAutoReflect: boolean
  setCrmAutoReflect: Dispatch<SetStateAction<boolean>>
  crmCandidates: HardwareCrmOrderCandidate[]
  crmLoading: boolean
  crmError: string | null
  crmWarnings: string[]
  selectedCrmCandidateId: string | null
  setSelectedCrmCandidateId: Dispatch<SetStateAction<string | null>>
  selectedCrmCandidate: HardwareCrmOrderCandidate | null
  busy: string | null
  createMovementFromDraft: (draft: HardwareMovementDraft, crmCandidate: HardwareCrmOrderCandidate | null) => Promise<void>
}

export default function CrmConfirmModal({
  pendingMovement,
  closeCrmConfirmation,
  crmAutoReflect,
  setCrmAutoReflect,
  crmCandidates,
  crmLoading,
  crmError,
  crmWarnings,
  selectedCrmCandidateId,
  setSelectedCrmCandidateId,
  selectedCrmCandidate,
  busy,
  createMovementFromDraft,
}: CrmConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-3 py-4 backdrop-blur-[2px] sm:items-center"
      onClick={closeCrmConfirmation}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="CRM 실제 오더 확인"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
          <div>
            <h2 className="text-[16px] font-bold tracking-[-0.01em] text-[#111110]">CRM 실제 오더 확인</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[#615D59]">
              출고 기록을 저장하기 전에 CRM 오더와 자동 반영할지 확인합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={closeCrmConfirmation}
            className="flex h-8 w-8 shrink-0 items-center justify-center cursor-pointer rounded-md text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-150px)] overflow-y-auto px-5 py-4">
          <div className="grid gap-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#615D59]">기록 예정</p>
              <p className="mt-1 text-[13px] font-bold text-[#111110]">{pendingMovement.productName}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#615D59]">수량/상태</p>
              <p className="mt-1 text-[13px] font-bold text-[#111110]">
                {formatNumber(pendingMovement.quantity)}대 · {pendingMovement.status || MOVEMENT_LABEL[pendingMovement.movementType]}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#615D59]">위치</p>
              <p className="mt-1 text-[13px] font-bold text-[#111110]">
                {pendingMovement.fromLocation || "-"} → {pendingMovement.toLocation || "-"}
              </p>
            </div>
          </div>

          <label className="mt-4 flex items-start gap-3 rounded-lg border border-[#BDEFD8] bg-[#ECFDF5] px-3 py-3">
            <input
              type="checkbox"
              checked={crmAutoReflect}
              onChange={(event) => setCrmAutoReflect(event.target.checked)}
              disabled={crmCandidates.length === 0}
              className="mt-0.5 h-4 w-4 cursor-pointer rounded-[3px] accent-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 focus-visible:ring-offset-1"
            />
            <span>
              <span className="block text-[13px] font-bold text-[#084734]">CRM 실제 오더와 연동해서 기록</span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[#084734]/75">
                선택한 CRM 후보의 참조번호와 링크가 하드웨어 원장에 같이 저장됩니다.
              </span>
            </span>
          </label>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[13px] font-bold text-[#111110]">매칭 후보</h3>
              {crmLoading ? <span className="text-[11px] font-semibold text-[#615D59]">CRM 확인 중...</span> : null}
            </div>

            {crmError && (
              <div className="mt-2 rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[12px] font-semibold text-[#8F2C2C]">
                {crmError}
              </div>
            )}

            {crmWarnings.length > 0 && (
              <div className="mt-2 rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[12px] font-semibold text-[#7A520F]">
                {crmWarnings.slice(0, 2).join(" / ")}
              </div>
            )}

            <div className="mt-2 space-y-2">
              {crmLoading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-20 animate-pulse rounded-lg bg-[#F6F5F4]" />
                ))
              ) : crmCandidates.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] px-4 py-8 text-center">
                  <p className="text-[13px] font-bold text-[#111110]">매칭되는 CRM 오더가 없습니다.</p>
                  <p className="mt-1 text-[12px] text-[#615D59]">연동 없이 하드웨어 원장에만 기록할 수 있습니다.</p>
                </div>
              ) : (
                crmCandidates.map((candidate) => {
                  const selected = selectedCrmCandidateId === candidate.id
                  const selectCandidate = () => {
                    setSelectedCrmCandidateId(candidate.id)
                    setCrmAutoReflect(true)
                  }
                  return (
                    <div
                      key={candidate.id}
                      className={`overflow-hidden rounded-lg border transition ${
                        selected
                          ? "border-[#084734] bg-[#ECFDF5]"
                          : "border-[rgba(0,0,0,0.08)] bg-white hover:bg-[#F6F5F4]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={selectCandidate}
                        className="w-full cursor-pointer px-3 pt-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 active:scale-[0.99] motion-reduce:active:scale-100"
                      >
                        <span className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[13px] font-bold text-[#111110]">{candidate.title}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${confidenceClass(candidate.confidence)}`}>
                                매칭 {confidenceCopy(candidate.confidence)}
                              </span>
                            </span>
                            <span className="mt-1 block text-[11.5px] leading-relaxed text-[#615D59]">
                              {candidate.sourceLabel} · {candidate.productName ?? "품목 미상"} · {candidate.quantity != null ? `${formatNumber(candidate.quantity)}대` : "수량 미상"}
                            </span>
                            <span className="mt-1 block text-[11.5px] text-[#615D59]">
                              {candidate.customerName ?? "고객 미상"} · {candidate.owner ?? "담당자 미상"} · {candidate.status ?? "상태 미상"}
                            </span>
                          </span>
                          <span className="shrink-0 text-left sm:text-right">
                            <span className="block text-[12px] font-bold text-[#111110]">{formatCurrency(candidate.amount)}</span>
                            <span className="mt-1 block text-[11px] text-[#615D59]">{formatDate(candidate.occurredAt)}</span>
                          </span>
                        </span>
                      </button>
                      {/* 링크는 버튼 밖 푸터에 둔다(버튼 안 anchor는 invalid HTML). 푸터 클릭도 후보 선택으로 동작. */}
                      <div
                        onClick={selectCandidate}
                        className="flex cursor-pointer flex-wrap items-center gap-2 px-3 pb-3 pt-2 text-[11px] font-semibold text-[#084734]"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {candidate.reason}
                        {candidate.href ? (
                          <Link
                            href={candidate.href}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[#615D59] transition hover:text-[#111110] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                          >
                            <ExternalLink className="h-3 w-3" />
                            CRM에서 확인 ↗
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => void createMovementFromDraft(pendingMovement, null)}
            disabled={busy === "movement"}
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-4 text-[13px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            연동 없이 기록
          </button>
          <button
            type="button"
            onClick={() => void createMovementFromDraft(pendingMovement, crmAutoReflect ? selectedCrmCandidate : null)}
            disabled={busy === "movement" || crmLoading || (crmAutoReflect && !selectedCrmCandidate)}
            className="inline-flex h-10 items-center justify-center gap-2 cursor-pointer rounded-md bg-[#084734] px-4 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {crmAutoReflect ? "CRM 연동 후 기록" : "기록 저장"}
          </button>
        </div>
      </section>
    </div>
  )
}
