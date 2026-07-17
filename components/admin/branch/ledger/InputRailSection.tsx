"use client"

import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react"
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
  type DraftSaveResult,
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
  // 품질 웨이브 7 — 항목 1: 지금 저장하면 targeting할 (행, 월) 셀이 이미 확정/장부반영으로 잠긴
  // 상태인지(SalesLedgerWorkbench의 isMatrixCellLocked 사전검사, correctedMonths 포함). true면
  // 제출 자체를 막고 인라인 경고만 보여준다 — 서버가 어차피 409로 튕길 걸 미리 걸러 헛수고를 없앤다.
  targetCellLocked: boolean
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

  const runSave = async (action: () => Promise<DraftSaveResult>) => {
    setFeedback(null)
    const result = await action()
    setFeedback(
      !result.persisted
        ? { kind: "error", text: "서버 저장에 실패해 로컬 임시 저장으로 대체됐습니다(장부 적용 불가) — 재연결 후 다시 저장하세요." }
        : result.deduped
          // 이중계상 가드(항목 3) — 같은 딜·같은 셀에 이미 열린 초안이 있어 새로 만들지 않고 그 초안을 갱신했다.
          ? { kind: "success", text: "이미 대기 초안 있음 — 수정으로 반영됩니다. 체크 큐에서 검수(체크 → 적용) 후 장부에 반영됩니다." }
          : result.duplicateWarning
            // 품질 웨이브 4, 항목 2 — new-row는 매트릭스 대응 행이 없어 자동 재지정할 수 없다.
            // 저장은 그대로 진행하고, 같은 고객·월에 이미 열린 신규 초안이 있다는 사실만 경고한다.
            ? { kind: "warning", text: "저장 완료 — 같은 고객·월에 이미 열린 신규 초안이 있습니다. 체크 큐에서 중복 여부를 확인하세요." }
            : { kind: "success", text: "저장 완료 — 체크 큐에서 검수(체크 → 적용) 후 장부에 반영됩니다." },
    )
  }

  // 편집 중이 아닐 때 Enter로 제출될 "기본" 저장 종류 — 선택된 행이 있어 수정 초안이 가능하면
  // 그쪽을, 없으면 신규 입력을 우선한다. 이 kind의 버튼만 type="submit"이라 브라우저가 텍스트
  // 필드에서 Enter를 눌렀을 때 그 버튼을 기본 제출 대상으로 인식한다(제출 버튼이 없으면 크롬은
  // Enter를 아예 무시한다 — 실측 확인됨). 나머지 버튼은 type="button"으로 자기 kind를 직접 저장한다.
  const primaryDraftKind: DraftKind = canCreateEditDraft ? "edit-row" : "new-row"

  // 품질 웨이브 7 — 항목 1: targetCellLocked는 부모가 이미 "지금 제출이 edit-row 경로로 가는지"
  // (editingDraft.kind==="edit-row" 또는 canCreateEditDraft)까지 반영해 계산해준다 — new-row
  // 저장·new-row 초안 편집은 대응 매트릭스 행이 없어 부모 쪽에서 항상 false로 내려온다. 여기서는
  // 그대로 소비만 한다(중복 판정 없음).
  const blockedByLock = targetCellLocked
  const LOCK_WARNING_TEXT =
    "이 딜의 해당 월 셀은 이미 잠겨 있습니다(시트 확정·장부 반영 등) — 수정 초안을 저장할 수 없습니다. 다른 월을 선택하거나 체크 큐에서 확인하세요."

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
