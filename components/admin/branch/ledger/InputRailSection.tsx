"use client"

import type { Dispatch, SetStateAction } from "react"
import { Loader2, Plus, Save, X } from "lucide-react"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import {
  DRAFT_CONFIDENCE_OPTIONS,
  DRAFT_OPERATIONS,
  REV_PRODUCT_FILTERS,
  formatMonthLabel,
  formatMoney,
  productCategoryMeta,
  safeAmount,
  type DraftForm,
  type DraftKind,
  type DraftOperation,
  type DraftQueueMode,
  type LedgerDraft,
  type RevProductCategory,
} from "./shared"
import { TEAMS } from "../types"

interface InputRailSectionProps {
  editingDraft: LedgerDraft | null
  queueMode: DraftQueueMode
  draftForm: DraftForm
  setDraftForm: Dispatch<SetStateAction<DraftForm>>
  selectedDraftOperation: { id: DraftOperation; label: string; description: string }
  monthOptions: Array<{ value: string; label: string; current: boolean }>
  selectedMonth: string
  draftAmountInvalid: boolean
  draftQuantityInvalid: boolean
  draftFormInvalid: boolean
  draftSaving: boolean
  canCreateEditDraft: boolean
  saveEditedDraft: () => Promise<void>
  cancelDraftEdit: () => void
  saveDraft: (kind: DraftKind) => Promise<void>
}

export function InputRailSection({
  editingDraft,
  queueMode,
  draftForm,
  setDraftForm,
  selectedDraftOperation,
  monthOptions,
  selectedMonth,
  draftAmountInvalid,
  draftQuantityInvalid,
  draftFormInvalid,
  draftSaving,
  canCreateEditDraft,
  saveEditedDraft,
  cancelDraftEdit,
  saveDraft,
}: InputRailSectionProps) {
  return (
    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
            <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-bold text-[#111110]">입력 / 수정</p>
                  <p className="mt-1 text-[11px] text-[#615D59]">
                    {editingDraft
                      ? `${editingDraft.customer || "초안"} 항목을 다시 수정하는 중입니다.`
                      : `${queueMode === "server" ? "서버 큐" : "로컬 fallback"}에 검토 초안으로 저장됩니다.`}
                  </p>
                </div>
                {editingDraft && (
                  <span className="shrink-0 rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 text-[10px] font-bold text-[#7A520F]">
                    편집 중
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-2">
                <p className="mb-2 text-[11px] font-bold text-[#615D59]">작업 유형</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {DRAFT_OPERATIONS.map((operation) => (
                    <button
                      key={operation.id}
                      type="button"
                      onClick={() => setDraftForm((current) => ({ ...current, operation: operation.id }))}
                      className={`min-h-9 rounded-md px-2 py-1.5 text-left text-[11px] font-bold transition ${
                        draftForm.operation === operation.id
                          ? "bg-[#111110] text-white"
                          : "border border-[rgba(0,0,0,0.08)] bg-white text-[#615D59] hover:text-[#111110]"
                      }`}
                    >
                      {operation.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-[#615D59]">{selectedDraftOperation.description}</p>
              </div>
              <label className="block text-[11px] font-bold text-[#615D59]">
                고객/계정
                <input
                  value={draftForm.customer}
                  onChange={(event) => setDraftForm((current) => ({ ...current, customer: event.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 text-[12px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[11px] font-bold text-[#615D59]">
                  담당자
                  <input
                    value={draftForm.manager}
                    onChange={(event) => setDraftForm((current) => ({ ...current, manager: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 text-[12px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
                  />
                </label>
                <label className="block text-[11px] font-bold text-[#615D59]">
                  팀
                  <select
                    value={draftForm.team}
                    onChange={(event) => setDraftForm((current) => ({ ...current, team: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                  >
                    {TEAMS.filter((value) => value !== "ALL").map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[11px] font-bold text-[#615D59]">
                  상품군
                  <select
                    value={draftForm.productCategory}
                    onChange={(event) => setDraftForm((current) => ({
                      ...current,
                      productCategory: event.target.value as Exclude<RevProductCategory, "all">,
                    }))}
                    className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                  >
                    {REV_PRODUCT_FILTERS.filter((item) => item.id !== "all").map((item) => (
                      <option key={item.id} value={item.id}>{productCategoryMeta(item.id).label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-[11px] font-bold text-[#615D59]">
                  주차
                  <select
                    value={draftForm.week}
                    onChange={(event) => setDraftForm((current) => ({ ...current, week: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                  >
                    <option value="month">월합계</option>
                    {[1, 2, 3, 4, 5].map((week) => <option key={week} value={`w${week}`}>W{week}</option>)}
                  </select>
                </label>
              </div>
              <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-2">
                <p className="mb-1.5 text-[11px] font-bold text-[#615D59]">확도</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {DRAFT_CONFIDENCE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setDraftForm((current) => ({ ...current, confidence: option.id }))}
                      aria-pressed={draftForm.confidence === option.id}
                      className={`min-h-8 rounded-md px-2 py-1 text-[11px] font-bold transition ${
                        draftForm.confidence === option.id
                          ? `${CONFIDENCE_TOKENS[option.id].bgClass} text-white`
                          : "border border-[rgba(0,0,0,0.08)] bg-white text-[#615D59] hover:text-[#111110]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-[#615D59]">
                  초안 적용 시 확도가 함께 기록됩니다. 예정 → 고확도 → 확정 전환도 이 폼으로 남깁니다.
                </p>
              </div>
              {draftForm.operation === "period-shift" && (
                <label className="block text-[11px] font-bold text-[#615D59]">
                  기존 월
                  <select
                    value={draftForm.fromMonth}
                    onChange={(event) => setDraftForm((current) => ({ ...current, fromMonth: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                  >
                    {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[11px] font-bold text-[#615D59]">
                  {draftForm.operation === "period-shift" ? "이동 월" : "월"}
                  <select
                    value={draftForm.month}
                    onChange={(event) => setDraftForm((current) => ({ ...current, month: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                  >
                    {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="block text-[11px] font-bold text-[#615D59]">
                  금액
                  <input
                    value={draftForm.amount}
                    onChange={(event) => setDraftForm((current) => ({ ...current, amount: event.target.value }))}
                    inputMode="numeric"
                    aria-invalid={draftAmountInvalid}
                    className={`mt-1 h-9 w-full rounded-md border bg-[#FAFAF8] px-3 text-right text-[12px] font-semibold text-[#111110] outline-none focus:border-[#084734] ${
                      draftAmountInvalid ? "border-[#B43E3E]" : "border-[rgba(0,0,0,0.08)]"
                    }`}
                  />
                </label>
              </div>
              {draftForm.operation === "quantity-change" && (
                <label className="block text-[11px] font-bold text-[#615D59]">
                  예상 수량
                  <input
                    value={draftForm.quantity}
                    onChange={(event) => setDraftForm((current) => ({ ...current, quantity: event.target.value }))}
                    inputMode="numeric"
                    aria-invalid={draftQuantityInvalid}
                    className={`mt-1 h-9 w-full rounded-md border bg-[#FAFAF8] px-3 text-right text-[12px] font-semibold text-[#111110] outline-none focus:border-[#084734] ${
                      draftQuantityInvalid ? "border-[#B43E3E]" : "border-[rgba(0,0,0,0.08)]"
                    }`}
                  />
                </label>
              )}
              {(draftForm.operation === "period-shift" || draftForm.operation === "quantity-change") && (
                <div className="rounded-lg border border-[#ECD29C] bg-[#FBF1E0] p-3 text-[11.5px] leading-relaxed text-[#7A520F]">
                  {draftForm.operation === "period-shift"
                    ? `${formatMonthLabel(draftForm.fromMonth || selectedMonth)} -${formatMoney(safeAmount(draftForm.amount))} → ${formatMonthLabel(draftForm.month || selectedMonth)} +${formatMoney(safeAmount(draftForm.amount))}`
                    : `${productCategoryMeta(draftForm.productCategory).label} · 수량 ${draftForm.quantity || "-"} · 금액 ${formatMoney(safeAmount(draftForm.amount))}`}
                </div>
              )}
              <label className="block text-[11px] font-bold text-[#615D59]">
                메모 / 체크
                <textarea
                  value={draftForm.note}
                  onChange={(event) => setDraftForm((current) => ({ ...current, note: event.target.value }))}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 py-2 text-[12px] leading-relaxed text-[#111110] outline-none focus:border-[#084734]"
                />
              </label>
              {draftFormInvalid && (
                <p className="rounded-md border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[11px] font-semibold text-[#8F2C2C]" role="alert">
                  고객명과 0보다 큰 금액을 입력해야 저장할 수 있습니다.
                </p>
              )}
              {editingDraft ? (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <button
                    type="button"
                    onClick={() => void saveEditedDraft()}
                    disabled={draftSaving || draftFormInvalid}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {draftSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    초안 업데이트
                  </button>
                  <button
                    type="button"
                    onClick={cancelDraftEdit}
                    disabled={draftSaving}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label="초안 편집 취소"
                    title="초안 편집 취소"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void saveDraft("edit-row")}
                    disabled={draftSaving || !canCreateEditDraft || draftFormInvalid}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#BDEFD8] bg-[#ECFDF5] px-3 text-[12px] font-bold text-[#084734] transition hover:bg-[#D1FAE5] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {draftSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    수정 초안
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveDraft("new-row")}
                    disabled={draftSaving || draftFormInvalid}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {draftSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    신규 입력
                  </button>
                </div>
              )}
            </div>
          </section>
  )
}
