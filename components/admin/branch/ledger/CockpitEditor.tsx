"use client"

// 콕핏 전용 컴팩트 편집기(Cockpit-1c 이식) — 화면 꽉 채우는 2-pane의 우측.
// InputRailSection(플로팅 레일)과 달리 작업 유형·월합계 토글 없이 "항상 주차"만 다룬다:
//   - 속성 4개(담당자·팀·상품군·월)를 한 줄로 컴팩트하게
//   - 확도 전체 일괄 + 주차별(W1~W5) 금액 + 주차별 3단 확도(예정·고확도·확정)
// 저장/확도/주차 산식은 전부 InputRailSection과 동일한 shared 헬퍼·부모 핸들러를 재사용한다
// (draftWeekly*·dominantWeeklyConfidence·saveDraft/saveEditedDraft) — 비즈니스 로직 중복 없음.
// 참고: New/Renew(상태)·Direct/Channel(타입)·지역·규모는 매출 드래프트 모델에 없다(딜 속성, CRM에서 편집).

import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react"
import { ArrowRight, Loader2, Lock, Plus, Save, X } from "lucide-react"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import {
  DRAFT_CONFIDENCE_OPTIONS,
  FORECAST_WEEK_RANGE_LABELS,
  LOCK_WARNING_TEXT,
  REV_PRODUCT_FILTERS,
  defaultDraftWeeklyConfidence,
  dominantWeeklyConfidence,
  draftWeeklyAmounts,
  draftWeeklyTotal,
  formatMoney,
  operationSupportsWeeklySplit,
  productCategoryMeta,
  resultToDraftFeedback,
  type DraftForm,
  type DraftKind,
  type DraftSaveResult,
  type LedgerDraft,
  type RevProductCategory,
} from "./shared"
import { WeeklyAmountGrid } from "./WeeklyAmountGrid"
import { TEAMS } from "../types"

interface CockpitEditorProps {
  editingDraft: LedgerDraft | null
  // 선택 딜의 읽기 전용 속성(상태·타입·지역·제품·첫결제·계약목표) — 매출 드래프트로는 편집 불가(딜 속성, CRM 소관).
  dealContext: {
    status?: string | null
    dealType?: string | null
    region?: string | null
    productVersion?: string | null
    firstPayment?: string | null
    contractTarget?: number | null
  } | null
  draftForm: DraftForm
  setDraftForm: Dispatch<SetStateAction<DraftForm>>
  monthOptions: Array<{ value: string; label: string; current: boolean }>
  draftFormInvalid: boolean
  draftSaving: boolean
  canCreateEditDraft: boolean
  targetCellLocked: boolean
  // Task B(2026-07-23): 확정으로 잠긴 달의 explicit 주차 중 값이 있는 칸(5칸 boolean). true면 그 주차
  // 입력을 읽기전용(🔒)으로 렌더한다 — 확정 주차 덮어쓰기 방지, 빈 칸에만 아직 안 지난 주차 추가 허용.
  lockedWeeks?: boolean[]
  // M1(a): 선택 딜의 편집 대상 월 실장부금액(rowMonthAmount). 월합계-only 딜은 주차 버퍼가 비어
  // 편집기 월 합이 ¥0으로 보이는데, 이 값이 >0이면 "전액을 특정 주에" 원클릭 참조를 노출한다.
  currentMonthAmount: number
  saveEditedDraft: () => Promise<DraftSaveResult>
  cancelDraftEdit: () => void
  saveDraft: (kind: DraftKind) => Promise<DraftSaveResult>
  // M6: 특수 작업(기간 이동/수량 변경) 초안은 콕핏에서 편집 불가 — REV 렌즈로 전환해 편집하도록 콜백.
  onSwitchToRev: () => void
}

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
  lockedWeeks,
  currentMonthAmount,
  saveEditedDraft,
  cancelDraftEdit,
  saveDraft,
  onSwitchToRev,
}: CockpitEditorProps) {
  // 저장 인라인 피드백 — 다른 초안 편집으로 넘어가면 초기화(렌더 중 상태 조정, InputRailSection과 동일 패턴).
  const [feedback, setFeedback] = useState<{ kind: "success" | "error" | "warning"; text: string } | null>(null)
  const [feedbackForDraftId, setFeedbackForDraftId] = useState<string | null>(editingDraft?.id ?? null)
  // M1(a): "전액을 [Wn] 주에 넣기"의 대상 주차 인덱스(0~4) — 사용자 액션 전용 로컬 상태.
  const [prefillWeekIndex, setPrefillWeekIndex] = useState(0)
  if (feedbackForDraftId !== (editingDraft?.id ?? null)) {
    setFeedbackForDraftId(editingDraft?.id ?? null)
    setFeedback(null)
  }

  // M6: 편집 중인 초안이 주차 미지원 작업(기간 이동/수량 변경)이면 콕핏 주차 폼으로는 그 의미를
  // 담을 수 없다(부모 force-weekly effect도 coerce를 건너뛴다) — 폼 대신 안내 + REV 전환만 노출한다.
  // 모든 훅 호출 이후에 조건 분기해 hooks 순서를 고정한다.
  if (!operationSupportsWeeklySplit(draftForm.operation)) {
    return (
      <section className="rounded-lg border border-[#ECD29C] bg-white">
        <div className="space-y-4 p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A39E98]">고객 · Account</p>
            <p className="mt-1 text-[20px] font-bold tracking-[-0.3px] text-[#111110]">
              {editingDraft?.customer || draftForm.customer || "초안"}
            </p>
          </div>
          <div className="rounded-lg border border-[#ECD29C] bg-[#FBF1E0] p-4 text-[12px] leading-relaxed text-[#7A520F]">
            <p className="font-bold">특수 작업 초안 — 콕핏에서 편집 불가</p>
            <p className="mt-1.5">
              이 초안은 특수 작업(기간 이동/수량 변경)입니다. 콕핏은 주차별 입력만 다루므로 여기서 편집하면 그
              의미가 사라집니다. REV 렌즈 빠른 입력에서 수정하세요.
            </p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <button
              type="button"
              onClick={onSwitchToRev}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#084734] px-4 text-[13px] font-bold text-white transition hover:bg-[#065c41]"
            >
              REV 렌즈에서 수정
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={cancelDraftEdit}
              className="inline-flex h-10 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] px-4 text-[13px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110]"
            >
              편집 취소
            </button>
          </div>
        </div>
      </section>
    )
  }

  const weeklyAmounts = draftWeeklyAmounts(draftForm.weekly)
  const weeklySum = draftWeeklyTotal(draftForm.weekly)
  const dominant = dominantWeeklyConfidence(weeklyAmounts, draftForm.weeklyConfidence)
  const blockedByLock = targetCellLocked
  const primaryDraftKind: DraftKind = canCreateEditDraft ? "edit-row" : "new-row"
  // M1(a): 주차 합이 비었는데 월 장부금액이 있으면(월합계-only 딜) 원클릭 참조를 노출한다.
  const showMonthAmountReference = weeklySum <= 0 && currentMonthAmount > 0

  // 읽기 전용 컨텍스트 칩 — 값 있는 속성만. New/Renew·Direct/Channel 등 딜 속성 + 계약목표(M12)를 참고용으로만 보여준다.
  const contextChips = dealContext
    ? (
        [
          { key: "상태", value: dealContext.status },
          { key: "타입", value: dealContext.dealType },
          { key: "지역", value: dealContext.region },
          { key: "제품", value: dealContext.productVersion },
          { key: "첫결제", value: dealContext.firstPayment },
          {
            key: "계약목표",
            value: dealContext.contractTarget && dealContext.contractTarget > 0 ? formatMoney(dealContext.contractTarget) : null,
          },
        ] as Array<{ key: string; value: string | null | undefined }>
      ).filter((chip): chip is { key: string; value: string } => Boolean(chip.value))
    : []

  const runSave = async (action: () => Promise<DraftSaveResult>) => {
    setFeedback(null)
    const result = await action()
    // 저장 피드백 매핑은 shared.resultToDraftFeedback로 공용화(M9-2) — 입력 레일과 문구·분기 동일.
    setFeedback(resultToDraftFeedback(result))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (draftSaving || draftFormInvalid) return
    if (blockedByLock) {
      setFeedback({ kind: "warning", text: LOCK_WARNING_TEXT })
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

        {/* 읽기 전용 컨텍스트 칩 — 상태(New/Renew)·타입(Direct/Channel)·지역·제품·첫결제·계약목표. 딜 속성이라 CRM 소관. */}
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

        {/* M1(a): 월합계-only 딜 — 주차 합이 비었지만 월 장부금액이 있을 때 원클릭 참조.
            자동 채움 없이 사용자가 명시적으로 특정 주에 전액을 넣는다. */}
        {showMonthAmountReference && (
          <div className="rounded-lg border border-[#ECD29C] bg-[#FBF1E0] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[#7A520F]">
                현재 월 장부금액 <span className="font-bold tabular-nums">{formatMoney(currentMonthAmount)}</span>
              </span>
              <span className="text-[10px] font-bold text-[#A8741A]">주차 합이 비어 있어요 (월합계만)</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-[#7A520F]">전액을</span>
              <select
                value={prefillWeekIndex}
                onChange={(event) => setPrefillWeekIndex(Number(event.target.value))}
                aria-label="전액 반영할 주차 선택"
                className="h-8 rounded-md border border-[#ECD29C] bg-white px-2 text-[11px] font-bold text-[#7A520F] outline-none"
              >
                {FORECAST_WEEK_RANGE_LABELS.map((rangeLabel, index) => (
                  <option key={rangeLabel} value={index}>W{index + 1} · {rangeLabel}</option>
                ))}
              </select>
              <span className="text-[11px] font-bold text-[#7A520F]">주에</span>
              <button
                type="button"
                onClick={() =>
                  setDraftForm((current) => ({
                    ...current,
                    weekly: current.weekly.map((value, i) => (i === prefillWeekIndex ? String(Math.round(currentMonthAmount)) : value)),
                  }))
                }
                className="inline-flex h-8 items-center gap-1 rounded-md bg-[#084734] px-3 text-[11px] font-bold text-white transition hover:bg-[#065c41]"
              >
                <Plus className="h-3.5 w-3.5" />
                넣기
              </button>
            </div>
          </div>
        )}

        {/* 주차별 입력 · W1~W5 — 금액 + 주차별 3단 확도. 월 합은 주차 자동합계(직접 수정 불가) */}
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-bold text-[#615D59]">주차별 입력 · Weekly</p>
            <p className="text-[10px] font-semibold text-[#A39E98]">금액만 넣으면 월 합 자동</p>
          </div>
          {/* M9-1: 주차 행 그리드는 공용 WeeklyAmountGrid로 — 콕핏 variant(전체 라벨·큰 입력). */}
          <WeeklyAmountGrid
            weekly={draftForm.weekly}
            weeklyConfidence={draftForm.weeklyConfidence}
            onAmountChange={(index, rawValue) =>
              setDraftForm((current) => ({
                ...current,
                weekly: current.weekly.map((value, i) => (i === index ? rawValue : value)),
              }))
            }
            onConfidenceChange={(index, key) =>
              setDraftForm((current) => ({
                ...current,
                weeklyConfidence: current.weeklyConfidence.map((value, i) => (i === index ? key : value)),
              }))
            }
            lockedWeeks={lockedWeeks}
            variant="cockpit"
          />
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
                : feedback.kind === "warning"
                  ? "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]"
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
        ) : canCreateEditDraft ? (
          // M7: 딜 선택 상태 — 프라이머리 1개("이 딜 저장", edit-row) + 보조("새 딜", new-row).
          // 이 딜 저장은 form submit(Enter도 동일 — primaryDraftKind==="edit-row"). 성공 후 폼 유지(연속 편집).
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <button
              type="submit"
              disabled={draftSaving || draftFormInvalid || blockedByLock}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#084734] px-4 text-[13px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {draftSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              이 딜 저장
            </button>
            <button
              type="button"
              onClick={() => void runSave(() => saveDraft("new-row"))}
              disabled={draftSaving || draftFormInvalid}
              className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-4 text-[13px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Plus className="h-4 w-4" />
              새 딜
            </button>
          </div>
        ) : (
          // 선택 딜 없음 — 신규 입력만(new-row). form submit이 곧 신규 입력(primaryDraftKind==="new-row").
          <button
            type="submit"
            disabled={draftSaving || draftFormInvalid}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#084734] px-4 text-[13px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {draftSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            신규 입력
          </button>
        )}
      </form>
    </section>
  )
}
