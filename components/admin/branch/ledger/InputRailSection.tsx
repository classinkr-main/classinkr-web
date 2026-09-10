"use client"

import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react"
import { Loader2, Plus, Save, X } from "lucide-react"
import { AdminMoneyInput, parseMoneyInput } from "@/components/admin/AdminMoneyInput"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import {
  DRAFT_CONFIDENCE_OPTIONS,
  DRAFT_OPERATIONS,
  LOCK_WARNING_TEXT,
  REV_PRODUCT_FILTERS,
  defaultDraftWeeklyConfidence,
  dominantWeeklyConfidence,
  draftWeeklyAmounts,
  draftWeeklyTotal,
  formatMonthLabel,
  formatMoney,
  operationSupportsWeeklySplit,
  productCategoryMeta,
  resultToDraftFeedback,
  safeAmount,
  type DraftForm,
  type DraftKind,
  type DraftOperation,
  type DraftQueueMode,
  type DraftSaveResult,
  type LedgerDraft,
  type RevProductCategory,
} from "./shared"
import { WeeklyAmountGrid } from "./WeeklyAmountGrid"
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
  // 품질 웨이브 7 — 항목 1: 지금 저장하면 targeting할 (행, 월) 셀이 이미 확정/장부반영으로 잠긴
  // 상태인지(SalesLedgerWorkbench의 isMatrixCellLocked 사전검사, correctedMonths 포함). true면
  // 제출 자체를 막고 인라인 경고만 보여준다 — 서버가 어차피 409로 튕길 걸 미리 걸러 헛수고를 없앤다.
  targetCellLocked: boolean
  // Task B(2026-07-23): 확정으로 잠긴 달의 explicit 주차 중 값이 있는 칸(5칸 boolean) — WeeklyAmountGrid에
  // 그대로 넘겨 그 주차만 읽기전용(🔒)으로 만든다(확정 주차 덮어쓰기 방지, 빈 칸에만 추가 허용).
  lockedWeeks?: boolean[]
  // DraftSaveResult.persisted: 서버에 실제로 저장됐으면 true, 로컬 폴백(장부 적용 불가)이면 false.
  // DraftSaveResult.deduped: 이중계상 가드(품질 웨이브 3, 항목 3)가 새 초안 대신 이미 열린 초안을
  // 갱신했으면 true. DraftSaveResult.duplicateWarning(품질 웨이브 4, 항목 2): new-row 저장인데 같은
  // 고객명·월에 이미 열린 신규 초안이 있으면 true(저장은 그대로 진행, 경고만) — 셋 다 저장 인라인
  // 피드백(성공/실패/중복 안내 메시지)에 쓴다.
  saveEditedDraft: () => Promise<DraftSaveResult>
  cancelDraftEdit: () => void
  saveDraft: (kind: DraftKind) => Promise<DraftSaveResult>
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
  targetCellLocked,
  lockedWeeks,
  saveEditedDraft,
  cancelDraftEdit,
  saveDraft,
}: InputRailSectionProps) {
  // 저장 성공/실패 인라인 피드백(버튼 인근) — 다른 초안을 편집하기 시작하면 이전 결과는 지운다.
  // useEffect로 setState하면 커밋 후 리렌더가 한 번 더 도는 캐스케이드가 생겨(react-hooks 경고),
  // React가 권장하는 "렌더 중 상태 조정" 패턴으로 처리한다 — editingDraft.id가 바뀐 그 렌더에서
  // 바로 초기화해 깜빡임 없이 한 번에 반영된다.
  const [feedback, setFeedback] = useState<{ kind: "success" | "error" | "warning"; text: string } | null>(null)
  const [feedbackForDraftId, setFeedbackForDraftId] = useState<string | null>(editingDraft?.id ?? null)
  if (feedbackForDraftId !== (editingDraft?.id ?? null)) {
    setFeedbackForDraftId(editingDraft?.id ?? null)
    setFeedback(null)
  }

  // 공용 금액 입력(숫자|null) ↔ 폼 버퍼(문자열) 어댑터 — 상위 상태·저장 payload 형태는 그대로 둔다
  // (draftForm.amount/quantity는 계속 문자열이고 safeAmount가 파싱하는 계약 유지).
  const pushAmount = (next: number | null) =>
    setDraftForm((current) => ({ ...current, amount: next == null ? "" : String(next) }))
  const pushQuantity = (next: number | null) =>
    setDraftForm((current) => ({ ...current, quantity: next == null ? "" : String(next) }))

  const runSave = async (action: () => Promise<DraftSaveResult>) => {
    setFeedback(null)
    const result = await action()
    // 저장 피드백 매핑은 shared.resultToDraftFeedback로 공용화(M9-2) — 콕핏 편집기와 문구·분기 동일
    // (웨이브 7 2단 I4의 6분기: conflict → validationMessage → !persisted → dedupedRecent → deduped
    //  → duplicateWarning → 성공을 그대로 담는다).
    setFeedback(resultToDraftFeedback(result))
  }

  // 편집 중이 아닐 때 Enter로 제출될 "기본" 저장 종류 — 선택된 행이 있어 수정 초안이 가능하면
  // 그쪽을, 없으면 신규 입력을 우선한다. 이 kind의 버튼만 type="submit"이라 브라우저가 텍스트
  // 필드에서 Enter를 눌렀을 때 그 버튼을 기본 제출 대상으로 인식한다(제출 버튼이 없으면 크롬은
  // Enter를 아예 무시한다 — 실측 확인됨). 나머지 버튼은 type="button"으로 자기 kind를 직접 저장한다.
  const primaryDraftKind: DraftKind = canCreateEditDraft ? "edit-row" : "new-row"

  // 주차 분해 입력(Ledger-1a "주차별 입력 — 금액만 넣으면 월 합 자동" + Cockpit-1c 주차 그리드).
  // 노출 조건: forecast-add·amount-change 한정 — 기간 이동(period-shift)·수량 변경(quantity-change)은
  // 기존 단일 금액 UX를 유지한다(shared.operationSupportsWeeklySplit — buildDraftInput 저장 계약과
  // 같은 게이트). weeklySum은 검증(draftAmountInvalid)·저장(draftWeeklySaveContract)과 동일 산식.
  const weeklySplitAvailable = operationSupportsWeeklySplit(draftForm.operation)
  const weeklySplitActive = weeklySplitAvailable && draftForm.weeklyMode
  const weeklySum = draftWeeklyTotal(draftForm.weekly)
  // 라운드 3(P1) — 주차별 확도: 금액 5칸(seg 비활성 판정)과 우세 확도 미리보기("저장 확도" 줄,
  // buildDraftInput이 metadata.confidence로 자동 기록하는 값과 동일 산식 — draftWeeklySaveContract).
  const weeklyAmounts = draftWeeklyAmounts(draftForm.weekly)
  const railDominantConfidence = dominantWeeklyConfidence(weeklyAmounts, draftForm.weeklyConfidence)

  // 품질 웨이브 7 — 항목 1: targetCellLocked는 부모가 이미 "지금 제출이 edit-row 경로로 가는지"
  // (editingDraft.kind==="edit-row" 또는 canCreateEditDraft)까지 반영해 계산해준다 — new-row
  // 저장·new-row 초안 편집은 대응 매트릭스 행이 없어 부모 쪽에서 항상 false로 내려온다. 여기서는
  // 그대로 소비만 한다(중복 판정 없음).
  const blockedByLock = targetCellLocked

  // form 래핑으로 Enter 제출 — 편집 중이면 그 초안 갱신, 아니면 primaryDraftKind로 저장.
  // 실제 버튼 클릭도 동일 코드 경로를 타 두 번 저장되지 않는다(submit 버튼은 onClick 없음).
  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (draftSaving || draftFormInvalid) return
    if (blockedByLock) {
      setFeedback({ kind: "warning", text: LOCK_WARNING_TEXT })
      return
    }
    if (editingDraft) {
      void runSave(saveEditedDraft)
    } else {
      void runSave(() => saveDraft(primaryDraftKind))
    }
  }

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
            <form onSubmit={handleFormSubmit} className="space-y-3 p-4">
              <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-2">
                <p className="mb-2 text-[11px] font-bold text-[#615D59]">작업 유형</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {DRAFT_OPERATIONS.map((operation) => (
                    <button
                      key={operation.id}
                      type="button"
                      onClick={() => setDraftForm((current) => ({
                        ...current,
                        operation: operation.id,
                        // 주차 분해 유지 상태로 작업 유형을 오가면 week 토큰이 남을 수 있다 —
                        // 주차 분해가 다시 활성화되는 유형이면 저장 계약(week:"month")과 재일치.
                        week: current.weeklyMode && operationSupportsWeeklySplit(operation.id) ? "month" : current.week,
                      }))}
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
                {weeklySplitAvailable ? (
                  // 주차 분해 노출 유형(forecast-add·amount-change)에서만 '주차' select 자리가
                  // 모드 토글로 바뀐다 — 월합계 모드는 기존 UX 그대로(단일 금액 + week 토큰 select 유지).
                  <div className="block text-[11px] font-bold text-[#615D59]">
                    주차
                    <div
                      role="group"
                      aria-label="금액 입력 방식"
                      className="mt-1 grid h-9 grid-cols-2 gap-0.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white p-0.5"
                    >
                      <button
                        type="button"
                        aria-pressed={!weeklySplitActive}
                        onClick={() => setDraftForm((current) => ({ ...current, weeklyMode: false }))}
                        className={`rounded-[5px] px-1 text-[10px] font-bold transition ${
                          !weeklySplitActive ? "bg-[#111110] text-white" : "text-[#615D59] hover:text-[#111110]"
                        }`}
                      >
                        월합계 한 줄
                      </button>
                      <button
                        type="button"
                        aria-pressed={weeklySplitActive}
                        // week 토큰을 month로 고정 — 저장 계약(metadata.week="month")·이중계상
                        // dedup 좌표(railDedupTarget)가 같은 셀(월)을 가리키게 한다.
                        onClick={() => setDraftForm((current) => ({ ...current, weeklyMode: true, week: "month" }))}
                        className={`rounded-[5px] px-1 text-[10px] font-bold transition ${
                          weeklySplitActive ? "bg-[#111110] text-white" : "text-[#615D59] hover:text-[#111110]"
                        }`}
                      >
                        주차 분해
                      </button>
                    </div>
                    {!weeklySplitActive && (
                      <select
                        value={draftForm.week}
                        onChange={(event) => setDraftForm((current) => ({ ...current, week: event.target.value }))}
                        aria-label="주차 선택"
                        className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                      >
                        <option value="month">월합계</option>
                        {[1, 2, 3, 4, 5].map((week) => <option key={week} value={`w${week}`}>W{week}</option>)}
                      </select>
                    )}
                  </div>
                ) : (
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
                )}
              </div>
              <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-2">
                <p className="mb-1.5 text-[11px] font-bold text-[#615D59]">
                  {weeklySplitActive ? "확도 · 전체 일괄 적용" : "확도"}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {DRAFT_CONFIDENCE_OPTIONS.map((option) => {
                    // 주차 분해 모드(라운드 3 P1)에서는 이 블록이 "전체 일괄 적용" — 클릭 시 주차별
                    // 확도 5칸이 전부 이 확도로 세트되고, 그 뒤 그리드의 주차 seg로 개별 변경한다.
                    // pressed 판정도 5칸 전부 일치일 때만(개별 변경 후 혼합 상태는 아무 버튼도 눌리지
                    // 않은 표시). 단일 모드는 기존 그대로 confidence 1값 — 버퍼도 함께 시드해 나중에
                    // 주차 분해로 전환했을 때 마지막 선택 확도가 기본값이 되게 한다.
                    const pressed = weeklySplitActive
                      ? draftForm.weeklyConfidence.every((value) => value === option.id)
                      : draftForm.confidence === option.id
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setDraftForm((current) => ({
                          ...current,
                          confidence: option.id,
                          weeklyConfidence: defaultDraftWeeklyConfidence(option.id),
                        }))}
                        aria-pressed={pressed}
                        className={`min-h-8 rounded-md px-2 py-1 text-[11px] font-bold transition ${
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
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-[#615D59]">
                  {weeklySplitActive
                    ? "전체 일괄 적용 — 주차별로 개별 변경 가능 · 저장 확도는 우세 버킷 자동"
                    : "초안 적용 시 확도가 함께 기록됩니다. 예정 → 고확도 → 확정 전환도 이 폼으로 남깁니다."}
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
                <label className={`block text-[11px] font-bold text-[#615D59] ${weeklySplitActive ? "col-span-2" : ""}`}>
                  {draftForm.operation === "period-shift" ? "이동 월" : "월"}
                  <select
                    value={draftForm.month}
                    onChange={(event) => setDraftForm((current) => ({ ...current, month: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                  >
                    {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                {/* 주차 분해 모드에서는 단일 금액 입력을 숨긴다 — draftForm.amount는 저장 시 무시되고
                    (buildDraftInput의 draftWeeklySaveContract) 월 합은 아래 그리드의 자동합계가 정본. */}
                {!weeklySplitActive && (
                  <label className="block text-[11px] font-bold text-[#615D59]">
                    금액
                    {/* 공용 금액 입력 — 천단위 콤마·한글 IME 안전(조합 종료 후 정규화)·비숫자 안내.
                        버퍼는 계속 문자열(draftForm.amount)이라 여기서만 어댑트한다. onLiveChange가
                        필요한 이유: 저장 버튼이 draftFormInvalid로 비활성이라, blur에만 커밋하면
                        비활성 버튼 클릭이 blur를 못 일으켜 영영 저장할 수 없는 막다른 길이 된다. */}
                    <AdminMoneyInput
                      value={parseMoneyInput(draftForm.amount)}
                      onCommit={pushAmount}
                      onLiveChange={pushAmount}
                      blurOnEnter={false}
                      invalid={draftAmountInvalid}
                      ariaLabel="금액"
                      className="mt-1 w-full"
                      fieldClassName="h-9"
                    />
                  </label>
                )}
              </div>
              {weeklySplitActive && (
                <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-2">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <p className="text-[11px] font-bold text-[#615D59]">주차별 입력</p>
                    <p className="text-[10px] font-semibold text-[#A39E98]">금액만 넣으면 월 합 자동</p>
                  </div>
                  {/* M9-1: 주차 행 그리드는 공용 WeeklyAmountGrid로 — 레일 variant(축약 라벨·소형 버튼·확도 seg 중간 열). */}
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
                    variant="rail"
                  />
                  {/* 월 합은 읽기전용 자동합계 — 입력 필드가 아니라 표시 전용(직접 수정 불가 원칙). */}
                  <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-[rgba(0,0,0,0.08)] pt-2" aria-live="polite">
                    <span className="text-[11px] font-bold text-[#615D59]">월 합</span>
                    <span className={`text-[14px] font-bold tabular-nums ${weeklySum > 0 ? "text-[#111110]" : "text-[#A39E98]"}`}>
                      {formatMoney(weeklySum)}
                    </span>
                  </div>
                  {/* 우세 확도 미리보기(라운드 3 P1) — 저장 시 metadata.confidence로 자동 기록되는
                      값(dominantWeeklyConfidence: 금액 합 최대 버킷, 동률은 낮은 확도). */}
                  <div className="mt-1 flex items-baseline justify-between gap-2" aria-live="polite">
                    <span className="text-[10.5px] font-bold text-[#615D59]">저장 확도</span>
                    <span className={`text-[11px] font-bold ${weeklySum > 0 ? CONFIDENCE_TOKENS[railDominantConfidence].textClass : "text-[#A39E98]"}`}>
                      {CONFIDENCE_TOKENS[railDominantConfidence].label}
                      <span className="ml-1 text-[9.5px] font-semibold text-[#A39E98]">우세 버킷 자동</span>
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-[#615D59]">
                    월 합 = 주차 자동합계(직접 수정 불가) · 확도는 주차별로 기록됩니다.
                  </p>
                </div>
              )}
              {draftForm.operation === "quantity-change" && (
                <label className="block text-[11px] font-bold text-[#615D59]">
                  예상 수량
                  {/* 수량은 금액이 아니라 개수 — 통화 prefix 없이 같은 입력 규칙(정수·IME 안전)만 쓴다. */}
                  <AdminMoneyInput
                    value={parseMoneyInput(draftForm.quantity)}
                    onCommit={pushQuantity}
                    onLiveChange={pushQuantity}
                    blurOnEnter={false}
                    invalid={draftQuantityInvalid}
                    ariaLabel="예상 수량"
                    className="mt-1 w-full"
                    fieldClassName="h-9"
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
                  {weeklySplitActive
                    ? "고객명을 입력하고 주차 금액을 1칸 이상 넣어야(월 합 0보다 큼) 저장할 수 있습니다."
                    : "고객명과 0보다 큰 금액을 입력해야 저장할 수 있습니다."}
                </p>
              )}
              {/* 품질 웨이브 7 — 항목 1: 제출을 시도하기 전에도 잠금 사실을 미리 보여준다(사전검사가
                  버튼 disabled로만 조용히 막으면 왜 막혔는지 알기 어렵다) — 인라인 경고 + 차단. */}
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
                  {/* type="submit" — 이 화면의 유일한 저장 동작이라 form onSubmit(Enter)이 그대로
                      이 버튼과 같은 저장을 수행한다. onClick을 따로 달면 클릭 시 두 번 저장된다. */}
                  <button
                    type="submit"
                    disabled={draftSaving || draftFormInvalid || blockedByLock}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {draftSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    초안 업데이트
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFeedback(null)
                      cancelDraftEdit()
                    }}
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
                  {/* 둘 중 primaryDraftKind와 일치하는 쪽만 type="submit"(onClick 없음) — 그래야
                      form의 기본 제출 버튼이 되어 Enter가 그 kind로 저장한다. 나머지는 type="button" +
                      onClick으로 자기 kind를 직접 저장(클릭 시 이중 저장 방지). */}
                  <button
                    type={primaryDraftKind === "edit-row" ? "submit" : "button"}
                    onClick={primaryDraftKind === "edit-row" ? undefined : () => {
                      if (blockedByLock) { setFeedback({ kind: "warning", text: LOCK_WARNING_TEXT }); return }
                      void runSave(() => saveDraft("edit-row"))
                    }}
                    disabled={draftSaving || !canCreateEditDraft || draftFormInvalid || blockedByLock}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#BDEFD8] bg-[#ECFDF5] px-3 text-[12px] font-bold text-[#084734] transition hover:bg-[#D1FAE5] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {draftSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    수정 초안
                  </button>
                  <button
                    type={primaryDraftKind === "new-row" ? "submit" : "button"}
                    onClick={primaryDraftKind === "new-row" ? undefined : () => void runSave(() => saveDraft("new-row"))}
                    disabled={draftSaving || draftFormInvalid}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {draftSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    신규 입력
                  </button>
                </div>
              )}
            </form>
          </section>
  )
}
