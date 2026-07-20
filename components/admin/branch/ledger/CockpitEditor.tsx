"use client"

// 콕핏 전용 컴팩트 편집기(Cockpit-1c 이식) — 화면 꽉 채우는 2-pane의 우측.
// InputRailSection(플로팅 레일)과 달리 작업 유형·월합계 토글 없이 "항상 주차"만 다룬다:
//   - 속성 4개(담당자·팀·상품군·월)를 한 줄로 컴팩트하게
//   - 확도 전체 일괄 + 주차별(W1~W5) 금액 + 주차별 3단 확도(예정·고확도·확정)
// 저장/확도/주차 산식은 전부 InputRailSection과 동일한 shared 헬퍼·부모 핸들러를 재사용한다
// (draftWeekly*·dominantWeeklyConfidence·saveDraft/saveEditedDraft) — 비즈니스 로직 중복 없음.
// 참고: New/Renew(상태)·Direct/Channel(타입)·지역·규모는 매출 드래프트 모델에 없다(딜 속성, CRM에서 편집).

import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react"
import { Loader2, Lock, Plus, Save, X } from "lucide-react"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import {
  DRAFT_CONFIDENCE_OPTIONS,
  DRAFT_CONFLICT_MESSAGE,
  FORECAST_WEEK_RANGE_LABELS,
  REV_PRODUCT_FILTERS,
  defaultDraftWeeklyConfidence,
  dominantWeeklyConfidence,
  draftWeeklyAmounts,
  draftWeeklyTotal,
  formatMoney,
  productCategoryMeta,
  type DraftForm,
  type DraftKind,
  type DraftSaveResult,
  type LedgerDraft,
  type RevProductCategory,
} from "./shared"
import { TEAMS } from "../types"

interface CockpitEditorProps {
  editingDraft: LedgerDraft | null
  // 선택 딜의 읽기 전용 속성(상태·타입·지역·제품·첫결제) — 매출 드래프트로는 편집 불가(딜 속성, CRM 소관).
  dealContext: {
    status?: string | null
    dealType?: string | null
    region?: string | null
    productVersion?: string | null
    firstPayment?: string | null
  } | null
  draftForm: DraftForm
  setDraftForm: Dispatch<SetStateAction<DraftForm>>
  monthOptions: Array<{ value: string; label: string; current: boolean }>
  draftFormInvalid: boolean
  draftSaving: boolean
  canCreateEditDraft: boolean
  targetCellLocked: boolean
  saveEditedDraft: () => Promise<DraftSaveResult>
  cancelDraftEdit: () => void
  saveDraft: (kind: DraftKind) => Promise<DraftSaveResult>
}

const LOCK_WARNING_TEXT =
  "이 딜의 해당 월 셀은 이미 잠겨 있습니다(시트 확정·장부 반영 등) — 수정 초안을 저장할 수 없습니다. 다른 월을 선택하거나 체크 큐에서 확인하세요."

export function CockpitEditor({
  editingDraft,
  dealContext,
  draftForm,
  setDraftForm,
  monthOptions,
  draftFormInvalid,
  draftSaving,
  canCreateEditDraft,
  targetCellLocked,
  saveEditedDraft,
  cancelDraftEdit,
  saveDraft,
}: CockpitEditorProps) {
  // 저장 인라인 피드백 — 다른 초안 편집으로 넘어가면 초기화(렌더 중 상태 조정, InputRailSection과 동일 패턴).
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null)
  const [feedbackForDraftId, setFeedbackForDraftId] = useState<string | null>(editingDraft?.id ?? null)
  if (feedbackForDraftId !== (editingDraft?.id ?? null)) {
    setFeedbackForDraftId(editingDraft?.id ?? null)
    setFeedback(null)
  }

  const weeklyAmounts = draftWeeklyAmounts(draftForm.weekly)
  const weeklySum = draftWeeklyTotal(draftForm.weekly)
  const dominant = dominantWeeklyConfidence(weeklyAmounts, draftForm.weeklyConfidence)
  const blockedByLock = targetCellLocked
  const primaryDraftKind: DraftKind = canCreateEditDraft ? "edit-row" : "new-row"

  // 읽기 전용 컨텍스트 칩 — 값 있는 속성만. New/Renew·Direct/Channel 등 딜 속성을 참고용으로만 보여준다.
  const contextChips = dealContext
    ? (
        [
          { key: "상태", value: dealContext.status },
          { key: "타입", value: dealContext.dealType },
          { key: "지역", value: dealContext.region },
          { key: "제품", value: dealContext.productVersion },
          { key: "첫결제", value: dealContext.firstPayment },
        ] as Array<{ key: string; value: string | null | undefined }>
      ).filter((chip): chip is { key: string; value: string } => Boolean(chip.value))
    : []

  const runSave = async (action: () => Promise<DraftSaveResult>) => {
    setFeedback(null)
    const result = await action()
    if (result.conflict) setFeedback({ kind: "error", text: DRAFT_CONFLICT_MESSAGE })
    else if (result.validationMessage) setFeedback({ kind: "error", text: result.validationMessage })
    else if (!result.persisted)
      setFeedback({ kind: "error", text: "서버 저장에 실패했습니다(장부 적용 불가) — 잠시 후 다시 시도하세요." })
    else setFeedback({ kind: "success", text: "저장 완료 — 체크 큐에서 검수(체크 → 적용) 후 장부에 반영됩니다." })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (draftSaving || draftFormInvalid) return
    if (blockedByLock) {
      setFeedback({ kind: "error", text: LOCK_WARNING_TEXT })
      return
    }
    if (editingDraft) void runSave(saveEditedDraft)
    else void runSave(() => saveDraft(primaryDraftKind))
  }

  const fieldLabel = "block text-[11px] font-bold text-[#615D59]"
  const fieldControl =
    "mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"

  return (
    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        {/* 고객 · 계정 — 상단 타이틀(사진의 큰 계정명) */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A39E98]">고객 · Account</p>
          <input
            value={draftForm.customer}
            onChange={(event) => setDraftForm((current) => ({ ...current, customer: event.target.value }))}
            placeholder="고객명"
            aria-label="고객명"
            className="mt-1 w-full border-0 border-b border-[rgba(0,0,0,0.08)] bg-transparent px-0.5 pb-2 text-[22px] font-bold tracking-[-0.3px] text-[#111110] outline-none placeholder:text-[#D5D2CB] focus:border-[#084734]"
          />
        </div>

        {/* 읽기 전용 컨텍스트 칩 — 상태(New/Renew)·타입(Direct/Channel)·지역·제품·첫결제. 딜 속성이라 CRM 소관. */}
        {contextChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {contextChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2.5 py-1 text-[11px]"
              >
                <span className="font-semibold uppercase tracking-[0.04em] text-[#A39E98]">{chip.key}</span>
                <span className="font-bold text-[#111110]">{chip.value}</span>
              </span>
            ))}
            <span className="text-[10px] font-semibold text-[#A39E98]">읽기 전용 · 딜 속성은 CRM에서</span>
          </div>
        )}

        {/* 속성 4개 한 줄 — 담당자·팀·상품군·월 (드래프트 편집 가능 필드) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className={fieldLabel}>
            담당자
            <input
              value={draftForm.manager}
              onChange={(event) => setDraftForm((current) => ({ ...current, manager: event.target.value }))}
              className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 text-[12px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
            />
          </label>
          <label className={fieldLabel}>
            팀
            <select
              value={draftForm.team}
              onChange={(event) => setDraftForm((current) => ({ ...current, team: event.target.value }))}
              className={fieldControl}
            >
              {TEAMS.filter((value) => value !== "ALL").map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className={fieldLabel}>
            상품군
            <select
              value={draftForm.productCategory}
              onChange={(event) =>
                setDraftForm((current) => ({
                  ...current,
                  productCategory: event.target.value as Exclude<RevProductCategory, "all">,
                }))
              }
              className={fieldControl}
            >
              {REV_PRODUCT_FILTERS.filter((item) => item.id !== "all").map((item) => (
                <option key={item.id} value={item.id}>{productCategoryMeta(item.id).label}</option>
              ))}
            </select>
          </label>
          <label className={fieldLabel}>
            월
            <select
              value={draftForm.month}
              onChange={(event) => setDraftForm((current) => ({ ...current, month: event.target.value }))}
              className={fieldControl}
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        {/* 확도 전체 일괄 적용 — 주차별로 개별 변경 가능 */}
        <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-2.5">
          <p className="mb-2 text-[11px] font-bold text-[#615D59]">확도 · 전체 일괄 적용</p>
          <div className="grid grid-cols-3 gap-2">
            {DRAFT_CONFIDENCE_OPTIONS.map((option) => {
              const pressed = draftForm.weeklyConfidence.every((value) => value === option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() =>
                    setDraftForm((current) => ({
                      ...current,
                      confidence: option.id,
                      weeklyConfidence: defaultDraftWeeklyConfidence(option.id),
                    }))
                  }
                  className={`h-9 rounded-md text-[12px] font-bold transition ${
                    pressed
                      ? `${CONFIDENCE_TOKENS[option.id].bgClass} text-white`
                      : "border border-[rgba(0,0,0,0.08)] bg-white text-[#615D59] hover:text-[#111110]"
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* 주차별 입력 · W1~W5 — 금액 + 주차별 3단 확도. 월 합은 주차 자동합계(직접 수정 불가) */}
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-bold text-[#615D59]">주차별 입력 · Weekly</p>
            <p className="text-[10px] font-semibold text-[#A39E98]">금액만 넣으면 월 합 자동</p>
          </div>
          <div className="space-y-2">
            {FORECAST_WEEK_RANGE_LABELS.map((rangeLabel, index) => {
              const zeroWeek = weeklyAmounts[index] <= 0
              return (
                <div key={rangeLabel} className="grid grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-2">
                  <span className="text-[12px] font-bold text-[#111110]">
                    W{index + 1}
                    <span className="ml-1 text-[10px] font-semibold text-[#A39E98]">{rangeLabel}</span>
                  </span>
                  <span className="relative block">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[#A39E98]"
                    >
                      ¥
                    </span>
                    <input
                      value={draftForm.weekly[index] ?? ""}
                      onChange={(event) => {
                        const nextValue = event.target.value.replace(/[^\d]/g, "")
                        setDraftForm((current) => ({
                          ...current,
                          weekly: current.weekly.map((value, i) => (i === index ? nextValue : value)),
                        }))
                      }}
                      inputMode="numeric"
                      aria-label={`W${index + 1} 금액`}
                      className="h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white pl-7 pr-3 text-right text-[13px] font-semibold tabular-nums text-[#111110] outline-none focus:border-[#084734]"
                    />
                  </span>
                  <div role="group" aria-label={`W${index + 1} 확도`} className="flex gap-1">
                    {DRAFT_CONFIDENCE_OPTIONS.map((option) => {
                      const active = !zeroWeek && draftForm.weeklyConfidence[index] === option.id
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={zeroWeek}
                          aria-pressed={active}
                          title={`W${index + 1} ${option.label}`}
                          onClick={() =>
                            setDraftForm((current) => ({
                              ...current,
                              weeklyConfidence: current.weeklyConfidence.map((value, i) => (i === index ? option.id : value)),
                            }))
                          }
                          className={`h-10 rounded-md px-2.5 text-[11px] font-bold transition ${
                            zeroWeek
                              ? "cursor-not-allowed border border-[rgba(0,0,0,0.06)] bg-white text-[#DDD9D3]"
                              : active
                                ? `${CONFIDENCE_TOKENS[option.id].bgClass} text-white`
                                : "border border-[rgba(0,0,0,0.08)] bg-white text-[#615D59] hover:text-[#111110]"
                          }`}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 월 합계(자동) + 저장 확도(우세 버킷) */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-3">
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[#615D59]">
            <Lock className="h-3.5 w-3.5 text-[#084734]" />
            월 합계 · 자동
          </span>
          <span className="flex items-baseline gap-3" aria-live="polite">
            <span className={`text-[20px] font-bold tabular-nums ${weeklySum > 0 ? "text-[#111110]" : "text-[#A39E98]"}`}>
              {formatMoney(weeklySum)}
            </span>
            <span className={`text-[11px] font-bold ${weeklySum > 0 ? CONFIDENCE_TOKENS[dominant].textClass : "text-[#A39E98]"}`}>
              {CONFIDENCE_TOKENS[dominant].label}
              <span className="ml-1 text-[9.5px] font-semibold text-[#A39E98]">우세 버킷</span>
            </span>
          </span>
        </div>

        {draftFormInvalid && (
          <p className="rounded-md border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[11px] font-semibold text-[#8F2C2C]" role="alert">
            고객명을 입력하고 주차 금액을 1칸 이상 넣어야(월 합 0보다 큼) 저장할 수 있습니다.
          </p>
        )}
        {blockedByLock && (
          <p className="rounded-md border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[11px] font-semibold leading-relaxed text-[#7A520F]" role="alert">
            {LOCK_WARNING_TEXT}
          </p>
        )}
        {feedback && (
          <p
            role="status"
            className={`rounded-md border px-3 py-2 text-[11px] font-semibold leading-relaxed ${
              feedback.kind === "success"
                ? "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]"
                : "border-[#F2B8B8] bg-[#FCE9E9] text-[#8F2C2C]"
            }`}
          >
            {feedback.text}
          </p>
        )}

        {editingDraft ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <button
              type="submit"
              disabled={draftSaving || draftFormInvalid || blockedByLock}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#084734] px-4 text-[13px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {draftSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              초안 업데이트
            </button>
            <button
              type="button"
              onClick={() => {
                setFeedback(null)
                cancelDraftEdit()
              }}
              disabled={draftSaving}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="초안 편집 취소"
              title="초안 편집 취소"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type={primaryDraftKind === "edit-row" ? "submit" : "button"}
              onClick={
                primaryDraftKind === "edit-row"
                  ? undefined
                  : () => {
                      if (blockedByLock) {
                        setFeedback({ kind: "error", text: LOCK_WARNING_TEXT })
                        return
                      }
                      void runSave(() => saveDraft("edit-row"))
                    }
              }
              disabled={draftSaving || !canCreateEditDraft || draftFormInvalid || blockedByLock}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#BDEFD8] bg-[#ECFDF5] px-4 text-[13px] font-bold text-[#084734] transition hover:bg-[#D1FAE5] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {draftSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              수정 초안
            </button>
            <button
              type={primaryDraftKind === "new-row" ? "submit" : "button"}
              onClick={primaryDraftKind === "new-row" ? undefined : () => void runSave(() => saveDraft("new-row"))}
              disabled={draftSaving || draftFormInvalid}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#084734] px-4 text-[13px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {draftSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              신규 입력
            </button>
          </div>
        )}
      </form>
    </section>
  )
}
