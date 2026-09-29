"use client"

// 빠른 기록 시트 — HardwareInventoryClient(오케스트레이터)의 5,481줄 중 가장 큰 단일 블록(1,481줄)을
// 그대로 잘라낸 구조 분해다(감사 2026-09-07 #6). activeTab과 무관하게(홈·입출고 어디서든) 열리는
// 모달이라 탭 파일이 아니라 기존 CrmConfirmModal 등과 같은 "상시 오버레이" 관례로 다룬다.
// 순수 구조 분해 원칙 — state는 전부 부모 소유 그대로 props로 받는다(동작 변경 없음). JSX 본문은
// 원본에서 문자 그대로 옮겼고(diff 확인 완료), 아래 destructuring도 원본과 동일한 이름을 그대로 쓴다.
import type { Dispatch, FormEvent, KeyboardEvent as ReactKeyboardEvent, RefObject, SetStateAction } from "react"
import { motion } from "framer-motion"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  FileSpreadsheet,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  ShoppingCart,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react"

import CustomerPicker from "./CustomerPicker"
import ProductPicker from "./ProductPicker"
import {
  customerLabel,
  DETAIL_PRESET_KEYS,
  ENTRY_PRESETS,
  formatLotLabel,
  formatNumber,
  isDraftPlanned,
  isSampleOutbound,
  MOVEMENT_LABEL,
  MOVEMENT_TONE,
  presetTone,
  quickCartLineKey,
  SAMPLE_SOURCE_OPTIONS,
  todayKey,
  yesterdayKey,
  type HardwareDashboard,
  type HardwareItem,
  type HardwareMovement,
  type HardwareMovementDraft,
  type HardwareMovementType,
  type HardwareSampleUnit,
  type HardwareStockRow,
  type QuickCartSaveSummary,
  type SampleSource,
} from "./shared"

// 시트 전용 옵션·클래스 토큰 — 구조 분해(#6) 전 HardwareInventoryClient.tsx 모듈 스코프에 있었으나
// 이 시트에서만 쓰여 함께 옮겼다. 값 그대로.
const LOCATION_OPTIONS = ["고객", "창고", "샘플", "사무실", "수리"] as const
const QUICK_QUANTITIES = [1, 2, 5, 10]
// 15회 이상 반복되던 인풋/라벨 클래스의 드리프트 방지.
// 타이포 위계: 섹션 제목(13px bold #111110) > 필드 라벨(12px semibold #615D59) > 보조(11px #A39E98).
// 콤보박스(고객사)는 바깥 래퍼가 여백을 갖고 안쪽 input 은 여백이 없어야 한다 — 드롭다운이
// 그 래퍼 기준으로 뜨기 때문이다. 두 토큰의 값이 갈라지지 않게 한쪽에서 합성한다.
const SHEET_FIELD_INPUT_CLASS =
  "h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
const SHEET_INPUT_CLASS = `mt-1 ${SHEET_FIELD_INPUT_CLASS}`
const SHEET_LABEL_CLASS = "text-[12px] font-semibold text-[#615D59]"
const SHEET_SECTION_TITLE_CLASS = "text-[13px] font-bold text-[#111110]"

interface QuickRecordSheetProps {
  formRef: RefObject<HTMLFormElement | null>
  sheetPanelRef: RefObject<HTMLElement | null>
  reduceMotion: boolean | null
  editingId: string | null
  activePresetKey: string
  movementType: HardwareMovementType
  sheetMode: "single" | "batch"
  setSheetMode: Dispatch<SetStateAction<"single" | "batch">>
  sheetView: "quick" | "detail"
  quickCart: HardwareMovementDraft[]
  quickCartTotals: { count: number; quantity: number }
  quickCartLineErrors: Record<string, string>
  quickCartSaveSummary: QuickCartSaveSummary | null
  busy: string | null
  // 감사(2026-09-07 #8) — CRM 후보 조회 중(openCrmConfirmation)에는 busy가 아직 안 걸린다.
  // 제출 버튼을 이 창에서도 잠가 중복 저장을 막는다(그 조회 결과에 따라 모달 없이 곧장 저장될
  // 수도 있어졌기 때문에 이 창의 의미가 더 커졌다).
  crmLoading: boolean
  error: string | null
  notice: string | null
  data: HardwareDashboard | null
  customProduct: string
  setCustomProduct: Dispatch<SetStateAction<string>>
  showCustomInput: boolean
  setShowCustomInput: Dispatch<SetStateAction<boolean>>
  selectedItemId: string
  setSelectedItemId: Dispatch<SetStateAction<string>>
  selectedItem: HardwareItem | null
  activePreset: (typeof ENTRY_PRESETS)[number]
  isCustomerDestination: boolean
  outboundMode: "actual" | "planned" | "sample"
  quickPickGroups: { featured: HardwareStockRow[]; etc: HardwareStockRow[] }
  // kitMultiplier(원본값)는 이 시트에서 직접 렌더하지 않는다 — 표시는 항상 파생값
  // cartSetMultiplier(부모가 계산)를 쓰고, 조작은 setKitMultiplier만 호출한다.
  setKitMultiplier: Dispatch<SetStateAction<number>>
  cartSetMultiplier: number
  kitPresetSummaries: Array<{
    key: string
    label: string
    description: string
    icon: LucideIcon
    lines: Array<{
      label: string
      quantity: number
      match: (row: HardwareStockRow) => boolean
      row: HardwareStockRow | null
      required: number
      shortage: number
    }>
    missing: Array<{ label: string; row: HardwareStockRow | null }>
  }>
  quotePasteText: string
  setQuotePasteText: Dispatch<SetStateAction<string>>
  inboundBatchLayout: boolean
  quickCartEnabled: boolean
  lotNo: string
  setLotNo: Dispatch<SetStateAction<string>>
  occurredAt: string
  setOccurredAt: Dispatch<SetStateAction<string>>
  nextLotSuggestion: string
  lastManualMovement: HardwareMovement | null
  quantity: string
  setQuantity: Dispatch<SetStateAction<string>>
  fromLocation: string
  setFromLocation: Dispatch<SetStateAction<string>>
  toLocation: string
  setToLocation: Dispatch<SetStateAction<string>>
  sampleSource: SampleSource
  sampleCustomer: string
  setSampleCustomer: Dispatch<SetStateAction<string>>
  sampleUnitSelection: string[]
  sampleLoanNeed: number
  sampleLoanPool: HardwareSampleUnit[]
  draftQuantityNumber: number
  sampleReturnNeed: number
  sampleReturnPool: HardwareSampleUnit[]
  availabilityWarning: string | null
  status: string
  setStatus: Dispatch<SetStateAction<string>>
  fifoPreview: { plan: Array<{ lot: string; quantity: number }>; shortage: number } | null
  inboundDraftWarnings: string[]
  unitPrice: string
  setUnitPrice: Dispatch<SetStateAction<string>>
  amountUsd: string
  setAmountUsd: Dispatch<SetStateAction<string>>
  amountCny: string
  setAmountCny: Dispatch<SetStateAction<string>>
  storageLocation: string
  setStorageLocation: Dispatch<SetStateAction<string>>
  importer: string
  setImporter: Dispatch<SetStateAction<string>>
  serialsText: string
  setSerialsText: Dispatch<SetStateAction<string>>
  owner: string
  setOwner: Dispatch<SetStateAction<string>>
  referenceNo: string
  setReferenceNo: Dispatch<SetStateAction<string>>
  memo: string
  setMemo: Dispatch<SetStateAction<string>>
  lotOptions: string[]
  historyCustomers: string[]
  stayOpenAfterSave: boolean
  requestCloseSheet: () => void
  submitMovement: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  trapTab: (event: ReactKeyboardEvent<HTMLElement>) => void
  applyPreset: (presetKey: string) => void
  exitDetailView: () => void
  enterDetailView: () => void
  duplicateLastMovement: () => void
  selectMovementAxis: (axis: "inbound" | "outbound") => void
  selectOutboundMode: (mode: "actual" | "planned" | "sample") => void
  adjustQuantity: (delta: number) => void
  applySampleSource: (source: SampleSource) => void
  toggleSampleUnit: (unitId: string, cap: number) => void
  addDraftToQuickCart: () => void
  addKitPresetToCart: (presetKey: string) => void
  importQuoteLinesToCart: () => void
  copyLatestInboundLotToCart: () => void
  toggleQuickCartLinePlanned: (index: number) => void
  removeQuickCartItem: (index: number) => void
  clearQuickCart: () => void
  submitQuickCart: () => void | Promise<void>
  previewFifoForDraft: (draft: HardwareMovementDraft) => { plan: Array<{ lot: string; quantity: number }>; shortage: number } | null
  toggleStayOpenAfterSave: () => void
}

export default function QuickRecordSheet(props: QuickRecordSheetProps) {
  const {
    formRef,
    sheetPanelRef,
    reduceMotion,
    editingId,
    activePresetKey,
    movementType,
    sheetMode,
    setSheetMode,
    sheetView,
    quickCart,
    quickCartTotals,
    quickCartLineErrors,
    quickCartSaveSummary,
    busy,
    crmLoading,
    error,
    notice,
    data,
    customProduct,
    setCustomProduct,
    showCustomInput,
    setShowCustomInput,
    selectedItemId,
    setSelectedItemId,
    selectedItem,
    activePreset,
    isCustomerDestination,
    outboundMode,
    quickPickGroups,
    setKitMultiplier,
    cartSetMultiplier,
    kitPresetSummaries,
    quotePasteText,
    setQuotePasteText,
    inboundBatchLayout,
    quickCartEnabled,
    lotNo,
    setLotNo,
    occurredAt,
    setOccurredAt,
    nextLotSuggestion,
    lastManualMovement,
    quantity,
    setQuantity,
    fromLocation,
    setFromLocation,
    toLocation,
    setToLocation,
    sampleSource,
    sampleCustomer,
    setSampleCustomer,
    sampleUnitSelection,
    sampleLoanNeed,
    sampleLoanPool,
    draftQuantityNumber,
    sampleReturnNeed,
    sampleReturnPool,
    availabilityWarning,
    status,
    setStatus,
    fifoPreview,
    inboundDraftWarnings,
    unitPrice,
    setUnitPrice,
    amountUsd,
    setAmountUsd,
    amountCny,
    setAmountCny,
    storageLocation,
    setStorageLocation,
    importer,
    setImporter,
    serialsText,
    setSerialsText,
    owner,
    setOwner,
    referenceNo,
    setReferenceNo,
    memo,
    setMemo,
    lotOptions,
    historyCustomers,
    stayOpenAfterSave,
    requestCloseSheet,
    submitMovement,
    trapTab,
    applyPreset,
    exitDetailView,
    enterDetailView,
    duplicateLastMovement,
    selectMovementAxis,
    selectOutboundMode,
    adjustQuantity,
    applySampleSource,
    toggleSampleUnit,
    addDraftToQuickCart,
    addKitPresetToCart,
    importQuoteLinesToCart,
    copyLatestInboundLotToCart,
    toggleQuickCartLinePlanned,
    removeQuickCartItem,
    clearQuickCart,
    submitQuickCart,
    previewFifoForDraft,
    toggleStayOpenAfterSave,
  } = props
  // quickCartSaving은 busy 파생값 — 원본과 동일한 1줄 계산(추가 prop 없이 busy만으로 재구성).
  const quickCartSaving = busy === "movement"
  return (
              <motion.div
                key="quick-sheet"
                className="fixed inset-0 z-40 flex justify-end bg-black/35 backdrop-blur-[2px]"
                onClick={requestCloseSheet}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.16 }}
              >
                <motion.aside
                  ref={sheetPanelRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label="빠른 기록"
                  onKeyDown={trapTab}
                  onClick={(event) => event.stopPropagation()}
                  className="flex h-full w-full flex-col overflow-y-auto border-l border-[rgba(0,0,0,0.08)] bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.05)] sm:max-w-xl"
                  initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
                  animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
                  transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
                >
                  <div className="sticky top-0 z-10 border-b border-[rgba(0,0,0,0.08)] bg-white px-5 pb-3 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">
                          {editingId ? "기록 수정" : "빠른 기록"}
                        </p>
                        {/* 유형 배지 + 중립 경로 — 저장될 기록의 원장 배지 색을 미리 보여준다. */}
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[#615D59]">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-bold ${presetTone(activePresetKey, movementType)}`}>
                            {activePreset.label}
                          </span>
                          <span>{activePreset.from || "—"} → {activePreset.to || "고객사 입력"}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={requestCloseSheet}
                        aria-label="닫기"
                        className="flex h-10 w-10 items-center justify-center cursor-pointer rounded-md text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 sm:h-8 sm:w-8"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {/* 샘플 대여는 단건 전용이라(유닛을 골라야 한다, 라운드 2 Q-2) 작업건 탭을 보이지 않는다. */}
                    {!editingId && sheetView === "quick" && activePresetKey !== "sample" && (
                      <div className="mt-3 inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-0.5" role="tablist" aria-label="기록 모드">
                        {([["batch", "작업건 구성"], ["single", "단건 기록"]] as const).map(([mode, label]) => (
                          <button
                            key={mode}
                            type="button"
                            role="tab"
                            aria-selected={sheetMode === mode}
                            onClick={() => setSheetMode(mode)}
                            className={`cursor-pointer rounded-md px-3.5 py-1.5 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 ${
                              sheetMode === mode ? "bg-white text-[#084734] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#615D59] hover:text-[#111110]"
                            }`}
                          >
                            {label}
                            {mode === "batch" && quickCart.length > 0 ? (
                              <span className="ml-1.5 rounded-full bg-[#ECFDF5] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[#084734]">
                                {formatNumber(quickCart.length)}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* 상세 모드에는 모드 탭이 없어 바구니가 화면에서 사라진다 — 유실 오인을 막기 위해 대기 배지만 노출한다. */}
                    {sheetView === "detail" && quickCart.length > 0 && (
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2.5 py-1 text-[11px] font-semibold text-[#615D59]">
                        <ShoppingCart className="h-3.5 w-3.5 text-[#084734]" />
                        대기 중인 바구니 {formatNumber(quickCartTotals.count)}건 · {formatNumber(quickCartTotals.quantity)}대
                      </div>
                    )}
                  </div>
                  <form
                    ref={formRef}
                    onSubmit={(event) => void submitMovement(event)}
                    onKeyDown={(event) => {
                      // Cmd/Ctrl+Enter 저장 — 입고표와 같은 규약(inbound-sheet-model의 키 의도).
                      // 손을 키보드에 둔 채 연속 기록할 때 저장 버튼까지 가지 않아도 된다.
                      // IME 조합 중에는 저장으로 받지 않지만, 아래 배치 Enter 가드까지 건너뛰면
                      // 한글 조합 확정 Enter 가 단건 저장을 오발사한다(그 가드가 막으려던 바로 그것).
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
                        event.preventDefault()
                        if (busy != null || crmLoading) return
                        if (sheetMode === "batch" && !editingId) {
                          if (quickCart.length > 0) void submitQuickCart()
                          return
                        }
                        formRef.current?.requestSubmit()
                        return
                      }
                      // 작업건 모드에서 텍스트 input의 Enter가 암묵 폼 제출(단건 저장)을 오발사하지 않도록 차단.
                      // 버튼/textarea의 Enter는 그대로 — 키보드 사용자의 담기·저장 활성화를 막지 않는다.
                      if (event.key === "Enter" && sheetMode === "batch" && event.target instanceof HTMLInputElement) {
                        event.preventDefault()
                      }
                    }}
                    className="flex flex-1 flex-col"
                  >
                    <div className="flex-1 space-y-4 p-5">
                    {error && (
                      <div role="alert" className="rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[12px] font-semibold text-[#8F2C2C]">
                        {error}
                      </div>
                    )}
                    {notice && (
                      <div role="status" className="rounded-lg border border-[#BDEFD8] bg-[#ECFDF5] px-3 py-2 text-[12px] font-semibold text-[#084734]">
                        {notice}
                      </div>
                    )}
                    {/* 저장 대기 바구니 배너 — 경쟁 박스 대신 border-bottom 구분 한 줄(HW-5). */}
                    {sheetView === "quick" && sheetMode === "single" && quickCart.length > 0 && !editingId && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.08)] pb-3">
                        <span className="text-[12px] font-semibold text-[#615D59]">
                          저장 대기 바구니 {formatNumber(quickCart.length)}건 · {formatNumber(quickCartTotals.quantity)}대
                        </span>
                        <button
                          type="button"
                          onClick={() => setSheetMode("batch")}
                          className="cursor-pointer rounded-md px-2 py-1 text-[12px] font-bold text-[#084734] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                        >
                          작업건 모드에서 보기 →
                        </button>
                      </div>
                    )}
                    {editingId ? (
                      // 수정 중에는 프리셋 전환을 막는다 — 유형 변경은 기록 취소 후 재작성이 안전하다.
                      <div className="flex items-center gap-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-3 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${MOVEMENT_TONE[movementType]}`}>
                          {MOVEMENT_LABEL[movementType]}
                        </span>
                        <span className="text-[12px] font-semibold text-[#615D59]">
                          {activePreset.label} — 유형은 수정할 수 없습니다
                        </span>
                      </div>
                    ) : sheetView === "detail" ? (
                    // 상세 모드 — 빠른 2축 밖의 예외 처리 5종. 항상 단건, 큐 비활성.
                    <div className="space-y-2.5">
                      <button
                        type="button"
                        onClick={exitDetailView}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-[12px] font-bold text-[#084734] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                      >
                        ← 빠른 기록으로 돌아가기
                      </button>
                      <p className="text-[11px] font-semibold text-[#615D59]">
                        반환·샘플 배정·수리·조정 — 자주 쓰지 않는 예외 처리입니다. 한 건씩 저장하세요.
                      </p>
                      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                        {ENTRY_PRESETS.filter((option) => DETAIL_PRESET_KEYS.has(option.key)).map((option) => {
                          const Icon = option.icon
                          const active = activePresetKey === option.key
                          return (
                            <button
                              key={option.key}
                              type="button"
                              aria-pressed={active}
                              onClick={() => applyPreset(option.key)}
                              className={`cursor-pointer rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.99] motion-reduce:active:scale-100 ${
                                active
                                  ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                                  : "border-[rgba(0,0,0,0.08)] bg-white text-[#31302E] hover:bg-[#F6F5F4]"
                              }`}
                            >
                              <span className="flex items-center gap-2 text-[12px] font-bold">
                                <Icon className="h-3.5 w-3.5" />
                                {option.label}
                              </span>
                              <span className="mt-1 block text-[11px] text-[#615D59]">{option.description}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    ) : (
                    // 빠른 기록 2축 — 입고 | 출고. 출고는 하위 실제|예정|샘플 세그먼트.
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-1" role="tablist" aria-label="입출고 유형">
                        {([["outbound", "출고", ArrowUpFromLine], ["inbound", "입고", ArrowDownToLine]] as const).map(([axis, label, Icon]) => {
                          const active = axis === "inbound" ? movementType === "inbound" : movementType === "outbound"
                          // 활성 톤 = 원장 배지 색(출고 Danger·입고 Success) — 방향 오입력을 색으로도 잡는다.
                          const activeTone = axis === "inbound" ? "bg-[#ECFDF5] text-[#084734]" : "bg-[#FCE9E9] text-[#B43E3E]"
                          return (
                            <button
                              key={axis}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => selectMovementAxis(axis)}
                              className={`inline-flex min-h-[42px] cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 ${
                                active ? `${activeTone} shadow-[0_1px_2px_rgba(0,0,0,0.06)]` : "text-[#615D59] hover:text-[#111110]"
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                              {label}
                            </button>
                          )
                        })}
                      </div>
                      {movementType === "outbound" && (
                        // 경쟁 박스 대신 세그먼트+저대비 캡션 한 줄 — 앰버 틴트는 실제 경고에만 남긴다(HW-5).
                        <div className="space-y-2">
                          <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="출고 방식">
                            {([
                              // 활성 톤 = 저장 후 원장 배지 색(실제 Danger·예정 Warning·샘플 중립)과 같은 어휘.
                              ["actual", "실제", "즉시 재고 반영", "border-[#F2B8B8] bg-[#FCE9E9] text-[#B43E3E]"],
                              ["planned", "예정", "가용에서 미리 차감", "border-[#ECD29C] bg-[#FBF1E0] text-[#A8741A]"],
                              ["sample", "샘플", "사무실·창고 반출", "border-[rgba(0,0,0,0.16)] bg-[#F6F5F4] text-[#31302E]"],
                            ] as const).map(([mode, label, hint, activeTone]) => {
                              const active = outboundMode === mode
                              return (
                                <button
                                  key={mode}
                                  type="button"
                                  role="tab"
                                  aria-selected={active}
                                  onClick={() => selectOutboundMode(mode)}
                                  className={`flex min-h-[46px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-1.5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-[0.98] motion-reduce:active:scale-100 ${
                                    active ? activeTone : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#615D59] hover:bg-white"
                                  }`}
                                >
                                  <span className="text-[12px] font-bold">{label}</span>
                                  <span className={`text-[10px] leading-tight ${active ? "opacity-80" : "text-[#A39E98]"}`}>{hint}</span>
                                </button>
                              )
                            })}
                          </div>
                          <p className="px-0.5 text-[11px] font-semibold text-[#615D59]">
                            {outboundMode === "actual"
                              ? "실제 출고는 즉시 재고에 반영되고, 판매 건이면 저장 시 CRM 오더 확인이 뜹니다."
                              : outboundMode === "planned"
                                ? "예정은 가용(창고 − 예정)에서만 미리 차감합니다. 확정은 홈 › 예상 출고에서 하세요."
                                : "샘플 대여는 사무실·창고에서 반출되며 CRM 연동 없이 저장됩니다."}
                          </p>
                        </div>
                      )}
                    </div>
                    )}

                    {/* 입고 공유 헤더 — 물량번호(lot)·입고일은 한 lot의 모든 품목이 공유한다. 상단 고정 노출. */}
                    {inboundBatchLayout && (
                      <div className="sticky top-0 z-[5] -mx-5 border-y border-[#BDEFD8] bg-[#ECFDF5] px-5 py-3">
                        <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#084734]">
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                          입고 lot 공유 정보
                        </p>
                        <div className="mt-2 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                          <label className="block">
                            <span className="text-[12px] font-semibold text-[#31302E]">물량번호 (lot)</span>
                            <input
                              value={lotNo}
                              onChange={(event) => setLotNo(event.target.value)}
                              placeholder="신규 lot — 예: H9"
                              list="hardware-lot-options"
                              className="mt-1 h-10 w-full rounded-md border border-[#BDEFD8] bg-white px-3 text-[13px] font-semibold text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                            />
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => setLotNo(nextLotSuggestion)}
                                className="min-h-[32px] cursor-pointer rounded border border-[#BDEFD8] bg-white px-2 py-1 text-[11px] font-bold text-[#084734] transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100"
                              >
                                {nextLotSuggestion} 적용
                              </button>
                            </div>
                          </label>
                          <div>
                            <span className="text-[12px] font-semibold text-[#31302E]">입고일</span>
                            <input
                              type="date"
                              aria-label="입고일"
                              value={occurredAt}
                              onChange={(event) => setOccurredAt(event.target.value)}
                              className="mt-1 h-10 w-full rounded-md border border-[#BDEFD8] bg-white px-3 text-[13px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                            />
                            <div className="mt-1.5 grid grid-cols-2 gap-1">
                              {([
                                { label: "오늘", value: todayKey() },
                                { label: "어제", value: yesterdayKey() },
                              ] as const).map((chip) => (
                                <button
                                  key={chip.label}
                                  type="button"
                                  aria-pressed={occurredAt === chip.value}
                                  onClick={() => setOccurredAt(chip.value)}
                                  className={`min-h-[32px] cursor-pointer rounded border px-1.5 py-1 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                                    occurredAt === chip.value
                                      ? "border-[#084734] bg-white text-[#084734]"
                                      : "border-[#BDEFD8] bg-white/60 text-[#615D59] hover:bg-white"
                                  }`}
                                >
                                  {chip.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {sheetView === "quick" && sheetMode === "single" && !editingId && lastManualMovement && (
                      <button
                        type="button"
                        onClick={duplicateLastMovement}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5 text-left transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.99] motion-reduce:active:scale-100"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <RotateCcw className="h-3.5 w-3.5 shrink-0 text-[#084734]" />
                          <span className="min-w-0">
                            <span className="block text-[12px] font-bold text-[#111110]">직전 기록 복제</span>
                            <span className="mt-0.5 block truncate text-[11px] text-[#615D59]">
                              {lastManualMovement.product_name} · {MOVEMENT_LABEL[lastManualMovement.movement_type]} {formatNumber(lastManualMovement.quantity)}대
                              {lastManualMovement.to_location ? ` · ${customerLabel(lastManualMovement.to_location)}` : ""}
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] font-bold text-[#084734]">복제 →</span>
                      </button>
                    )}

                    {sheetMode === "batch" && !editingId && !quickCartEnabled && (
                      <p className="border-b border-[rgba(0,0,0,0.08)] pb-3 text-[12px] font-semibold text-[#615D59]">
                        샘플 대여·반납·샘플 반환·샘플 배정·수리·조정은 배치 담기를 지원하지 않습니다 — 단건 기록 모드로 저장하세요.
                      </p>
                    )}
                    {sheetMode === "batch" && quickCartEnabled && !inboundBatchLayout && (
                      <div className="space-y-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className={SHEET_SECTION_TITLE_CLASS}>작업건 빠른 구성</p>
                            <p className="mt-0.5 text-[11px] text-[#A39E98]">
                              세트·견적 라인을 바구니에 담고 한 번에 저장합니다.
                            </p>
                          </div>
                          <div className="inline-flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-[#615D59]">세트 배수</span>
                            <div className="grid h-9 grid-cols-[36px_40px_36px] overflow-hidden rounded-md border border-[rgba(0,0,0,0.08)] bg-white">
                              <button
                                type="button"
                                onClick={() => setKitMultiplier((current) => Math.max(1, current - 1))}
                                aria-label="세트 배수 줄이기"
                                className="flex cursor-pointer items-center justify-center text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="flex items-center justify-center border-x border-[rgba(0,0,0,0.08)] text-[13px] font-bold tabular-nums text-[#111110]">
                                x{formatNumber(cartSetMultiplier)}
                              </span>
                              <button
                                type="button"
                                onClick={() => setKitMultiplier((current) => Math.min(99, current + 1))}
                                aria-label="세트 배수 늘리기"
                                className="flex cursor-pointer items-center justify-center text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          {kitPresetSummaries.map((preset) => {
                            const Icon = preset.icon
                            const unavailable = preset.missing.length > 0
                            const shortage = preset.lines.reduce((total, line) => total + line.shortage, 0)
                            return (
                              <button
                                key={preset.key}
                                type="button"
                                onClick={() => addKitPresetToCart(preset.key)}
                                disabled={busy != null || unavailable}
                                className="cursor-pointer rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5 text-left transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.99] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <span className="flex items-center gap-2 text-[12px] font-bold text-[#111110]">
                                  <Icon className="h-3.5 w-3.5 text-[#084734]" />
                                  {preset.label}
                                </span>
                                <span className="mt-1 block text-[11px] text-[#615D59]">{preset.description}</span>
                                <span className={`mt-1 block text-[11px] font-bold ${shortage > 0 ? "text-[#A8741A]" : "text-[#084734]"}`}>
                                  {unavailable
                                    ? "품목 미매칭"
                                    : shortage > 0
                                      ? `예상 부족 ${formatNumber(shortage)}대`
                                      : "가용 재고 확인"}
                                </span>
                              </button>
                            )
                          })}
                        </div>

                        <div className="grid gap-2">
                          <label className="block">
                            <span className={SHEET_LABEL_CLASS}>견적/CRM 라인 붙여넣기</span>
                            <textarea
                              value={quotePasteText}
                              onChange={(event) => setQuotePasteText(event.target.value)}
                              rows={3}
                              placeholder={'예: 86" IFP x 2\nT1 2대\nSTD1, 2'}
                              className="mt-1 w-full resize-none rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[12px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={importQuoteLinesToCart}
                            disabled={busy != null || !quotePasteText.trim()}
                            className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#084734] bg-white px-3 text-[12px] font-bold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            견적 라인 담기
                          </button>
                        </div>
                      </div>
                    )}

                    {inboundBatchLayout && (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <p className={`inline-flex items-center gap-1.5 ${SHEET_SECTION_TITLE_CLASS}`}>
                          <Plus className="h-3.5 w-3.5 text-[#084734]" />
                          품목 추가
                        </p>
                        <p className="text-[11px] font-semibold text-[#615D59]">
                          담으면 lot·입고일은 유지됩니다
                        </p>
                      </div>
                    )}
                    <div className={customProduct.trim() ? "opacity-90" : undefined}>
                      <span className={SHEET_LABEL_CLASS}>
                        품목<RequiredMark />
                      </span>
                      {(quickPickGroups.featured.length > 0 || quickPickGroups.etc.length > 0) && (
                        <div role="group" aria-label="제품 빠른 선택" className="mt-1.5 flex flex-wrap gap-1.5">
                          {[...quickPickGroups.featured, ...quickPickGroups.etc].map((row) => {
                            const chipActive = selectedItemId === row.itemId && !customProduct.trim()
                            return (
                              <button
                                key={row.itemId}
                                type="button"
                                aria-pressed={chipActive}
                                onClick={() => {
                                  setSelectedItemId(row.itemId)
                                  setCustomProduct("")
                                }}
                                className={`min-h-[36px] cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                                  chipActive
                                    ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                                    : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                                }`}
                              >
                                {row.product} · 가용 {formatNumber(row.availableStock)}
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {/* 주요 칩 밖 품목은 검색으로 고른다 — 전 품목 select 를 훑지 않는다(입력 가속 P1-3). */}
                      <ProductPicker
                        items={data?.items ?? []}
                        value={selectedItemId}
                        onChange={(itemId) => {
                          setSelectedItemId(itemId)
                          setCustomProduct("")
                        }}
                        ariaLabel="전체 품목에서 선택"
                        disabled={Boolean(customProduct.trim())}
                      />
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            const visible = showCustomInput || Boolean(customProduct.trim())
                            if (visible) {
                              // 접기 = 직접 입력 취소 — 목록 선택으로 복귀.
                              setShowCustomInput(false)
                              setCustomProduct("")
                            } else {
                              setShowCustomInput(true)
                            }
                          }}
                          aria-expanded={showCustomInput || Boolean(customProduct.trim())}
                          className="cursor-pointer rounded-md text-[12px] font-bold text-[#084734] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                        >
                          {showCustomInput || customProduct.trim() ? "− 직접 입력 취소" : "+ 목록에 없는 품목 직접 입력"}
                        </button>
                        {(showCustomInput || Boolean(customProduct.trim())) && (
                          <>
                            <input
                              value={customProduct}
                              onChange={(event) => setCustomProduct(event.target.value)}
                              placeholder="예: OPS 케이블"
                              className={SHEET_INPUT_CLASS}
                            />
                            {customProduct.trim() ? (
                              <p className="mt-1 text-[11px] font-semibold text-[#084734]">직접 입력 사용 중 — 위 목록 선택은 무시됩니다.</p>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>

                    <div className={`grid grid-cols-1 gap-3 ${inboundBatchLayout ? "" : "min-[400px]:grid-cols-2"}`}>
                      {inboundBatchLayout ? (
                      <div>
                        <span id="hardware-quantity-label" className={SHEET_LABEL_CLASS}>
                          수량<RequiredMark />
                        </span>
                        {/* 입고 작업건 — 스테퍼 + 퀵칩을 한 줄로 압축. */}
                        <div className="mt-1 flex items-center gap-2">
                          <div className="grid h-9 w-[104px] shrink-0 grid-cols-[30px_minmax(0,1fr)_30px] rounded-md border border-[rgba(0,0,0,0.08)] bg-white">
                            <button
                              type="button"
                              onClick={() => adjustQuantity(-1)}
                              className="flex cursor-pointer items-center justify-center text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100"
                              aria-label="수량 줄이기"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              inputMode="numeric"
                              aria-labelledby="hardware-quantity-label"
                              value={quantity}
                              onChange={(event) => setQuantity(event.target.value)}
                              className="h-full w-full border-x border-[rgba(0,0,0,0.08)] px-1 text-center text-[13px] font-bold text-[#111110] outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => adjustQuantity(1)}
                              className="flex cursor-pointer items-center justify-center text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100"
                              aria-label="수량 늘리기"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="grid flex-1 grid-cols-4 gap-1">
                            {QUICK_QUANTITIES.map((nextQuantity) => (
                              <button
                                key={nextQuantity}
                                type="button"
                                aria-pressed={Number(quantity) === nextQuantity}
                                onClick={() => setQuantity(String(nextQuantity))}
                                className={`h-9 cursor-pointer rounded border text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                                  Number(quantity) === nextQuantity
                                    ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                                    : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#615D59] hover:bg-white"
                                }`}
                              >
                                {nextQuantity}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      ) : (
                      <div>
                        <span id="hardware-quantity-label" className={SHEET_LABEL_CLASS}>
                          수량<RequiredMark />
                        </span>
                        <div className="mt-1 grid h-11 grid-cols-[44px_minmax(0,1fr)_44px] rounded-md border border-[rgba(0,0,0,0.08)] bg-white sm:h-10 sm:grid-cols-[38px_minmax(0,1fr)_38px]">
                          <button
                            type="button"
                            onClick={() => adjustQuantity(-1)}
                            className="flex cursor-pointer items-center justify-center text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100"
                            aria-label="수량 줄이기"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            aria-labelledby="hardware-quantity-label"
                            value={quantity}
                            onChange={(event) => setQuantity(event.target.value)}
                            className="h-full w-full border-x border-[rgba(0,0,0,0.08)] px-2 text-center text-[14px] font-bold text-[#111110] outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => adjustQuantity(1)}
                            className="flex cursor-pointer items-center justify-center text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100"
                            aria-label="수량 늘리기"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-1.5 grid grid-cols-4 gap-1">
                          {QUICK_QUANTITIES.map((nextQuantity) => (
                            <button
                              key={nextQuantity}
                              type="button"
                              aria-pressed={Number(quantity) === nextQuantity}
                              onClick={() => setQuantity(String(nextQuantity))}
                              className={`min-h-[36px] cursor-pointer rounded border px-1.5 py-1 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                                Number(quantity) === nextQuantity
                                  ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                                  : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#615D59] hover:bg-white"
                              }`}
                            >
                              {nextQuantity}
                            </button>
                          ))}
                        </div>
                      </div>
                      )}
                      {/* 입고 작업건에서는 처리일을 상단 공유 헤더로 올렸으므로 여기서는 숨긴다(중복 방지). */}
                      {!inboundBatchLayout && (
                      <div>
                        <span id="hardware-date-label" className={SHEET_LABEL_CLASS}>처리일</span>
                        <input
                          type="date"
                          aria-labelledby="hardware-date-label"
                          value={occurredAt}
                          onChange={(event) => setOccurredAt(event.target.value)}
                          className={SHEET_INPUT_CLASS}
                        />
                        <div className="mt-1.5 grid grid-cols-2 gap-1">
                          {([
                            { label: "오늘", value: todayKey() },
                            { label: "어제", value: yesterdayKey() },
                          ] as const).map((chip) => (
                            <button
                              key={chip.label}
                              type="button"
                              aria-pressed={occurredAt === chip.value}
                              onClick={() => setOccurredAt(chip.value)}
                              className={`min-h-[36px] cursor-pointer rounded border px-1.5 py-1 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                                occurredAt === chip.value
                                  ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                                  : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#615D59] hover:bg-white"
                              }`}
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      )}
                    </div>
                    {/* 인라인 담기 — 품목·수량 바로 아래에 눈에 띄게. 저장은 리스트 근처/스티키 바에서. */}
                    {inboundBatchLayout && (
                      <button
                        type="button"
                        onClick={addDraftToQuickCart}
                        disabled={!quickCartEnabled || busy != null || (!customProduct.trim() && !selectedItem)}
                        className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-[#084734] bg-white px-3 text-[13px] font-bold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.99] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                        이 품목 담기
                      </button>
                    )}
                    {activePresetKey === "sample" && !editingId && (
                      // 다른 폼 필드와 같은 평면(무박스) — 필드 그룹에 경쟁 보더를 두지 않는다(HW-5).
                      <div>
                        <span className={SHEET_LABEL_CLASS}>샘플 출처</span>
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                          {SAMPLE_SOURCE_OPTIONS.map((source) => (
                            <button
                              key={source}
                              type="button"
                              aria-pressed={sampleSource === source}
                              onClick={() => applySampleSource(source)}
                              className={`min-h-[38px] cursor-pointer rounded-md border px-2 py-1.5 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-[0.98] motion-reduce:active:scale-100 ${
                                sampleSource === source
                                  ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                                  : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#615D59] hover:bg-white"
                              }`}
                            >
                              {source === "사무실" ? "사무실 (남은 샘플)" : "창고 (판매 재고)"}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[11px] text-[#A39E98]">
                          기본은 사무실 보관 샘플. 사무실 재고가 없으면 창고에서 바로 반출합니다.
                        </p>
                      </div>
                    )}
                    {/* 샘플 유닛 트래커 연계 — 대여: 고객사 + 나갈 유닛 선택 / 반환: 돌아올 유닛 선택.
                        원장 저장 시 loan/return 이벤트가 유닛 타임라인에 함께 남는다. */}
                    {activePresetKey === "sample" && !editingId && (
                      <div className="space-y-3">
                        <div>
                          <span className={SHEET_LABEL_CLASS}>
                            대여 고객사<RequiredMark />
                          </span>
                          <div className="mt-1" data-sheet-autofocus>
                            <CustomerPicker
                              value={sampleCustomer}
                              onChange={setSampleCustomer}
                              options={historyCustomers}
                              ariaLabel="대여 고객사"
                              placeholder="예: 남명학원 — 트래커에 유닛 행방으로 기록됩니다"
                              className={SHEET_FIELD_INPUT_CLASS}
                            />
                          </div>
                        </div>
                        {sampleSource === "사무실" && (
                          <div>
                            <span className={SHEET_LABEL_CLASS}>
                              나갈 유닛 선택 ({formatNumber(sampleUnitSelection.length)}/{formatNumber(sampleLoanNeed)})
                            </span>
                            {sampleLoanPool.length === 0 ? (
                              <p className="mt-1.5 text-[11px] text-[#A39E98]">
                                등록된 사무실 유닛이 없어 저장 시 관리번호가 자동 발급됩니다.
                              </p>
                            ) : (
                              <>
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {sampleLoanPool.map((unit) => {
                                    const selected = sampleUnitSelection.includes(unit.id)
                                    return (
                                      <button
                                        key={unit.id}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => toggleSampleUnit(unit.id, sampleLoanNeed)}
                                        className={`cursor-pointer rounded-md border px-2 py-1 text-[11.5px] font-bold tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 ${
                                          selected
                                            ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                                            : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#615D59] hover:bg-white"
                                        }`}
                                      >
                                        {unit.asset_code}
                                      </button>
                                    )
                                  })}
                                </div>
                                {draftQuantityNumber > sampleLoanPool.length && (
                                  <p className="mt-1.5 text-[11px] text-[#A39E98]">
                                    부족분 {formatNumber(draftQuantityNumber - sampleLoanPool.length)}대는 저장 시 자동 발급됩니다.
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        )}
                        {sampleSource === "창고" && (
                          <p className="text-[11px] text-[#A39E98]">
                            창고 반출은 저장 시 유닛 {formatNumber(Math.max(1, draftQuantityNumber))}대가 자동 발급되어 대여중으로 등록됩니다.
                          </p>
                        )}
                      </div>
                    )}
                    {activePresetKey === "sampleReturn" && !editingId && (
                      <div>
                        <span className={SHEET_LABEL_CLASS}>
                          반환 유닛 선택 ({formatNumber(sampleUnitSelection.length)}/{formatNumber(sampleReturnNeed)})
                        </span>
                        {sampleReturnPool.length === 0 ? (
                          <p className="mt-1.5 text-[11px] text-[#A39E98]">
                            이 품목의 대여중 유닛이 없습니다 — 트래커 미등록 반환은 원장에만 기록됩니다.
                          </p>
                        ) : (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {sampleReturnPool.map((unit) => {
                              const selected = sampleUnitSelection.includes(unit.id)
                              return (
                                <button
                                  key={unit.id}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => toggleSampleUnit(unit.id, sampleReturnNeed)}
                                  title={unit.current_customer ?? undefined}
                                  className={`cursor-pointer rounded-md border px-2 py-1 text-[11.5px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 ${
                                    selected
                                      ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                                      : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#615D59] hover:bg-white"
                                  }`}
                                >
                                  <span className="tabular-nums">{unit.asset_code}</span>
                                  <span className="ml-1 font-semibold text-[#A39E98]">{unit.current_customer ?? "미상"}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {availabilityWarning && (
                      <div className="rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[11px] font-bold text-[#7A520F]">
                        {availabilityWarning}
                      </div>
                    )}

                    {/* 입고 작업건은 출발(공급처)·도착(창고)이 고정이라 항목 자체를 숨긴다 — 프리셋 기본값(→창고)이 그대로 적용된다. */}
                    {!inboundBatchLayout && (
                    <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                      <label className="block">
                        <span className={SHEET_LABEL_CLASS}>출발</span>
                        <input
                          value={fromLocation}
                          onChange={(event) => setFromLocation(event.target.value)}
                          placeholder="창고"
                          list="hardware-location-options"
                          className={SHEET_INPUT_CLASS}
                        />
                      </label>
                      <div>
                        <span className={SHEET_LABEL_CLASS} id="hardware-destination-label">
                          {isCustomerDestination ? (
                            <>
                              도착 (고객사)
                              <RequiredMark />
                            </>
                          ) : (
                            "도착"
                          )}
                        </span>
                        {/* 고객사 칸만 고르는 입력으로 바꾼다 — 창고·샘플 같은 일반 위치는 기존 datalist 그대로. */}
                        {isCustomerDestination ? (
                          <div className="mt-1" data-sheet-autofocus>
                            <CustomerPicker
                              value={toLocation}
                              onChange={setToLocation}
                              options={historyCustomers}
                              ariaLabel="도착 고객사"
                              placeholder="고객사명 — 예: 남명학원"
                              className={SHEET_FIELD_INPUT_CLASS}
                            />
                          </div>
                        ) : activePresetKey === "sample" && !editingId ? (
                          // 샘플 대여의 도착은 "샘플" 고정이다 — 고객사는 아래 "대여 고객사"에 적는다. 도착에 고객사를 적으면
                          // 샘플 판정(도착 == 샘플)이 깨져 판매로 저장된다(라운드 2 Q-1).
                          <input
                            value="샘플"
                            readOnly
                            aria-labelledby="hardware-destination-label"
                            aria-describedby="hardware-destination-sample-hint"
                            className={`${SHEET_INPUT_CLASS} cursor-default bg-[#F6F5F4] text-[#615D59]`}
                          />
                        ) : (
                          <input
                            value={toLocation}
                            onChange={(event) => setToLocation(event.target.value)}
                            placeholder="창고/샘플/사무실"
                            aria-labelledby="hardware-destination-label"
                            list="hardware-location-options"
                            className={SHEET_INPUT_CLASS}
                          />
                        )}
                        {activePresetKey === "sample" && !editingId && (
                          <p id="hardware-destination-sample-hint" className="mt-1 text-[11px] font-semibold text-[#615D59]">
                            고객사는 아래 &lsquo;대여 고객사&rsquo;에 — 샘플 대여는 단건으로만 저장합니다.
                          </p>
                        )}
                      </div>
                    </div>
                    )}

                    {/* 상세 모드는 상태가 핵심 필드(수리중·재고 조정 등) — 자유 텍스트로 앞면에 노출. */}
                    {sheetView === "detail" && !editingId && (
                      <label className="block">
                        <span className={SHEET_LABEL_CLASS}>상태</span>
                        <input
                          value={status}
                          onChange={(event) => setStatus(event.target.value)}
                          placeholder="예: 수리중 · 재고 조정 · 반납"
                          className={SHEET_INPUT_CLASS}
                        />
                      </label>
                    )}

                    {movementType === "inbound" && !inboundBatchLayout && (
                      <label className="block">
                        <span className={SHEET_LABEL_CLASS}>물량번호 (lot)</span>
                        <input
                          value={lotNo}
                          onChange={(event) => setLotNo(event.target.value)}
                          placeholder="신규 lot — 예: H9"
                          list="hardware-lot-options"
                          className={SHEET_INPUT_CLASS}
                        />
                      </label>
                    )}
                    {/* 입고 lot 도우미 — 그린 틴트 박스 대신 접이식+border-bottom 구분(HW-5). 틴트는 상태 의미에만. */}
                    {movementType === "inbound" && !editingId && !inboundBatchLayout && (
                      <details className="border-b border-[rgba(0,0,0,0.08)] pb-3">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md py-1 text-[12px] font-bold text-[#31302E] transition hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40">
                          <span>입고 lot 도우미 — 다음 lot 적용 · 이전 구성 복사</span>
                          <ChevronDown className="h-3.5 w-3.5 text-[#A39E98]" />
                        </summary>
                        <p className="mt-1 text-[11px] font-semibold text-[#615D59]">
                          lot·입고일·수입자·보관 장소를 공유해 여러 품목을 담습니다.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setLotNo(nextLotSuggestion)}
                            className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 text-[11px] font-bold text-[#084734] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100"
                          >
                            {nextLotSuggestion} 적용
                          </button>
                          <button
                            type="button"
                            onClick={copyLatestInboundLotToCart}
                            className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 text-[11px] font-bold text-[#084734] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100"
                          >
                            이전 구성 복사
                          </button>
                        </div>
                      </details>
                    )}
                    {fifoPreview && (
                      <div className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${
                        fifoPreview.shortage > 0
                          ? "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]"
                          : "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]"
                      }`}>
                        <span className="font-bold">FIFO 자동 배정</span>{" "}
                        {fifoPreview.plan.length > 0
                          ? fifoPreview.plan.map((lot) => `${formatLotLabel(lot.lot) ?? lot.lot} ${formatNumber(lot.quantity)}대`).join(" · ")
                          : "배정 가능한 lot 없음"}
                        {fifoPreview.shortage > 0 ? ` · 부족 ${formatNumber(fifoPreview.shortage)}대` : ""}
                      </div>
                    )}

                    {movementType === "inbound" && inboundBatchLayout && (
                      // 입고 작업건 — 단가·매입액·시리얼·보관·수입자는 접이식으로 내려 기본은 간결하게.
                      <details className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8]">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[12px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40">
                          <span>추가 정보 — 단가 · 매입액(USD·CNY) · 시리얼 · 보관 · 수입자</span>
                          <span className="flex items-center gap-1.5">
                            {(unitPrice.trim() ? 1 : 0) + (amountUsd.trim() ? 1 : 0) + (amountCny.trim() ? 1 : 0) + (serialsText.trim() ? 1 : 0) + (storageLocation.trim() ? 1 : 0) + (importer.trim() ? 1 : 0) > 0 ? (
                              <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-[#084734]">
                                {(unitPrice.trim() ? 1 : 0) + (amountUsd.trim() ? 1 : 0) + (amountCny.trim() ? 1 : 0) + (serialsText.trim() ? 1 : 0) + (storageLocation.trim() ? 1 : 0) + (importer.trim() ? 1 : 0)}
                              </span>
                            ) : null}
                            <ChevronDown className="h-3.5 w-3.5 text-[#A39E98]" />
                          </span>
                        </summary>
                        <div className="space-y-3 border-t border-[rgba(0,0,0,0.06)] p-3">
                          {inboundDraftWarnings.length > 0 && (
                            <div className="rounded-md border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[11px] font-bold text-[#7A520F]">
                              {inboundDraftWarnings.join(" · ")}
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                              <span className="text-[11px] font-bold text-[#615D59]">단가 (USD)</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                value={unitPrice}
                                onChange={(event) => setUnitPrice(event.target.value)}
                                className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[11px] font-bold text-[#615D59]">금액 (USD)</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                value={amountUsd}
                                onChange={(event) => setAmountUsd(event.target.value)}
                                className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                              />
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                              <span className="text-[11px] font-bold text-[#615D59]">금액 (CNY)</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                value={amountCny}
                                onChange={(event) => setAmountCny(event.target.value)}
                                className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[11px] font-bold text-[#615D59]">보관 장소</span>
                              <input
                                value={storageLocation}
                                onChange={(event) => setStorageLocation(event.target.value)}
                                list="hardware-location-options"
                                placeholder="창고"
                                className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none placeholder:text-[#615D59] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                              />
                            </label>
                          </div>
                          <label className="block">
                            <span className="text-[11px] font-bold text-[#615D59]">수입자</span>
                            <input
                              value={importer}
                              onChange={(event) => setImporter(event.target.value)}
                              placeholder="예: Classin"
                              className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none placeholder:text-[#615D59] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[11px] font-bold text-[#615D59]">시리얼 번호 (쉼표·공백 구분)</span>
                            <input
                              value={serialsText}
                              onChange={(event) => setSerialsText(event.target.value)}
                              placeholder="예: SN001, SN002"
                              className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none placeholder:text-[#615D59] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                            />
                          </label>
                        </div>
                      </details>
                    )}

                    {movementType === "inbound" && !inboundBatchLayout && (
                      <div className="space-y-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
                        <p className="text-[11px] font-bold text-[#615D59]">입고 상세 (시트 필드)</p>
                        {inboundDraftWarnings.length > 0 && (
                          <div className="rounded-md border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[11px] font-bold text-[#7A520F]">
                            {inboundDraftWarnings.join(" · ")}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <span className="text-[11px] font-bold text-[#615D59]">단가 (USD)</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              value={unitPrice}
                              onChange={(event) => setUnitPrice(event.target.value)}
                              className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[11px] font-bold text-[#615D59]">금액 (USD)</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              value={amountUsd}
                              onChange={(event) => setAmountUsd(event.target.value)}
                              className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                            />
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <span className="text-[11px] font-bold text-[#615D59]">금액 (CNY)</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              value={amountCny}
                              onChange={(event) => setAmountCny(event.target.value)}
                              className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[11px] font-bold text-[#615D59]">보관 장소</span>
                            <input
                              value={storageLocation}
                              onChange={(event) => setStorageLocation(event.target.value)}
                              list="hardware-location-options"
                              placeholder="창고"
                              className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none placeholder:text-[#615D59] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                            />
                          </label>
                        </div>
                        <label className="block">
                          <span className="text-[11px] font-bold text-[#615D59]">수입자</span>
                          <input
                            value={importer}
                            onChange={(event) => setImporter(event.target.value)}
                            placeholder="예: Classin"
                            className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none placeholder:text-[#615D59] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] font-bold text-[#615D59]">시리얼 번호 (쉼표·공백 구분)</span>
                          <input
                            value={serialsText}
                            onChange={(event) => setSerialsText(event.target.value)}
                            placeholder="예: SN001, SN002"
                            className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none placeholder:text-[#615D59] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                          />
                        </label>
                      </div>
                    )}

                    {/* 출고 매출(USD) 수동 캡처 — money-mesh §2.2(운영 결정: 입력 통화 USD).
                        inbound 상세 블록과 동형. 대사 뷰(v_hardware_rev_matches)가 SUM(amount_usd)를
                        병기 집계하므로 입력만 열면 자동 반영된다. 샘플 대여는 매출이 아니라 제외,
                        작업건(배치) 경로는 범위 밖 — 단건 기록·수정에서만 노출. */}
                    {movementType === "outbound" && outboundMode !== "sample" && sheetMode === "single" && (
                      <div className="space-y-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
                        <p className="text-[11px] font-bold text-[#615D59]">판매 금액 (시트 필드)</p>
                        <label className="block">
                          <span className="text-[11px] font-bold text-[#615D59]">금액 (USD)</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            inputMode="decimal"
                            value={amountUsd}
                            onChange={(event) => setAmountUsd(event.target.value)}
                            placeholder="예: 12000"
                            className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                          />
                        </label>
                        <p className="text-[11px] leading-relaxed text-[#A39E98]">
                          달러(USD) 금액만 입력 — ¥(CNY)와 혼동 금지. 참고 병기 전용이며 REV 장부 매출(¥ SSOT)에는 합산되지 않습니다.
                        </p>
                      </div>
                    )}

                    {/* 자주 안 만지는 필드는 접어 둔다 — 담당자는 기억값 프리필, 상태는 프리셋이 채우고,
                        출고 lot은 FIFO 자동 배정이 기본이라 수동 지정만 여기로. */}
                    <details className="rounded-lg border border-[rgba(0,0,0,0.08)]">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[12px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40">
                        <span>추가 정보 — 담당자 · 상태 · 참조 · 메모{movementType === "outbound" ? " · lot 수동 지정" : ""}</span>
                        <span className="flex items-center gap-1.5">
                          {owner.trim() ? (
                            <span className="rounded-full bg-[#F6F5F4] px-2 py-0.5 text-[10.5px] font-bold text-[#615D59]">{owner.trim()}</span>
                          ) : null}
                          {(referenceNo.trim() ? 1 : 0) + (memo.trim() ? 1 : 0) + (movementType === "outbound" && lotNo.trim() ? 1 : 0) > 0 ? (
                            <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-[#084734]">
                              {(referenceNo.trim() ? 1 : 0) + (memo.trim() ? 1 : 0) + (movementType === "outbound" && lotNo.trim() ? 1 : 0)}
                            </span>
                          ) : null}
                          <ChevronDown className="h-3.5 w-3.5 text-[#A39E98]" />
                        </span>
                      </summary>
                      <div className="space-y-3 border-t border-[rgba(0,0,0,0.06)] p-3">
                        {/* 상세 모드(신규)에서는 상태를 앞면 필드로 이미 노출하므로 여기서는 중복 렌더하지 않는다. */}
                        <div className={`grid grid-cols-1 gap-3 ${sheetView === "detail" && !editingId ? "" : "min-[400px]:grid-cols-2"}`}>
                          <label className="block">
                            <span className={SHEET_LABEL_CLASS}>담당자</span>
                            <input
                              value={owner}
                              onChange={(event) => setOwner(event.target.value)}
                              placeholder="자동 기억됨"
                              className={SHEET_INPUT_CLASS}
                            />
                          </label>
                          {!(sheetView === "detail" && !editingId) && (
                            <label className="block">
                              <span className={SHEET_LABEL_CLASS}>상태</span>
                              <input
                                value={status}
                                onChange={(event) => setStatus(event.target.value)}
                                className={SHEET_INPUT_CLASS}
                              />
                            </label>
                          )}
                        </div>
                        {movementType === "outbound" && (
                          <label className="block">
                            <span className={SHEET_LABEL_CLASS}>물량번호 (lot) 수동 지정</span>
                            <input
                              value={lotNo}
                              onChange={(event) => setLotNo(event.target.value)}
                              placeholder="비우면 FIFO 자동 배정"
                              list="hardware-lot-options"
                              className={SHEET_INPUT_CLASS}
                            />
                          </label>
                        )}
                        <label className="block">
                          <span className={SHEET_LABEL_CLASS}>참조 번호</span>
                          <input
                            value={referenceNo}
                            onChange={(event) => setReferenceNo(event.target.value)}
                            placeholder="내부 번호 또는 CRM 참조"
                            className={SHEET_INPUT_CLASS}
                          />
                        </label>
                        <label className="block">
                          <span className={SHEET_LABEL_CLASS}>메모</span>
                          <textarea
                            value={memo}
                            onChange={(event) => setMemo(event.target.value)}
                            rows={3}
                            className="mt-1 w-full resize-none rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[13px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                          />
                        </label>
                      </div>
                    </details>

                    <datalist id="hardware-location-options">
                      {LOCATION_OPTIONS.map((location) => (
                        <option key={location} value={location} />
                      ))}
                    </datalist>

                    <datalist id="hardware-lot-options">
                      {lotOptions.map((lot) => (
                        <option key={lot} value={lot} />
                      ))}
                    </datalist>

                    {/* 입력 미리보기 — 박스 대신 border-top 구분으로 위→아래 단일 스캔 흐름 유지(HW-5). */}
                    {(sheetMode === "single" || Boolean(editingId)) && (
                      <div className="border-t border-[rgba(0,0,0,0.08)] pt-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#615D59]">입력 미리보기</p>
                        <p className="mt-1 text-[13px] font-bold text-[#111110]">
                          {customProduct.trim() || selectedItem?.name || "품목 선택"} · {activePreset.label} · {formatNumber(Number(quantity) || 0)}대
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-[#615D59]">
                          {fromLocation || "-"} → {toLocation || (isCustomerDestination ? "고객사 미입력" : "-")} · {status || "상태 미정"}
                          {owner.trim() ? ` · ${owner.trim()}` : ""}
                        </p>
                      </div>
                    )}

                    {sheetMode === "batch" && !editingId && (
                      <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
                        <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1.5 ${SHEET_SECTION_TITLE_CLASS}`}>
                            <ShoppingCart className="h-3.5 w-3.5 text-[#084734]" />
                            {inboundBatchLayout ? "담은 품목" : "기록 바구니"}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold tabular-nums text-[#615D59]">
                              {formatNumber(quickCartTotals.count)}건 · {formatNumber(quickCartTotals.quantity)}대
                            </span>
                            {quickCart.length > 0 && (
                              <button
                                type="button"
                                onClick={clearQuickCart}
                                disabled={quickCartSaving}
                                className="cursor-pointer rounded-md px-2 py-1 text-[11px] font-bold text-[#A39E98] transition hover:bg-[#F6F5F4] hover:text-[#B43E3E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:pointer-events-none disabled:opacity-40"
                              >
                                비우기
                              </button>
                            )}
                          </span>
                        </div>
                        {quickCart.length === 0 ? (
                          <p className="px-3 py-3 text-[12px] leading-relaxed text-[#615D59]">
                            {quickCartSaveSummary && quickCartSaveSummary.failed === 0
                              ? `저장 완료: ${formatNumber(quickCartSaveSummary.success)}건 · ${formatNumber(quickCartSaveSummary.savedQuantity)}대`
                              : inboundBatchLayout
                                ? "위에서 품목을 담아 한 번에 저장하세요. 담은 품목이 여기 쌓입니다."
                                : "키트·견적 라인 또는 하단 '현재 입력 담기'로 품목을 모아 한 번에 저장합니다."}
                          </p>
                        ) : (
                          <div className="max-h-56 divide-y divide-[rgba(0,0,0,0.06)] overflow-y-auto">
                            {quickCartSaveSummary && quickCartSaveSummary.failed > 0 && (
                              <div className="bg-[#FBF1E0] px-3 py-2 text-[11px] font-bold text-[#7A520F]">
                                저장 {formatNumber(quickCartSaveSummary.success)}건 성공 · 실패 {formatNumber(quickCartSaveSummary.failed)}건은 삭제 후 다시 담거나 재시도
                              </div>
                            )}
                            {quickCart.map((draft, index) => {
                              const cartFifoPreview = previewFifoForDraft(draft)
                              const lineError = quickCartLineErrors[quickCartLineKey(draft)]
                              const linePlanned = isDraftPlanned(draft)
                              const lineSample = isSampleOutbound(draft)
                              // 샘플 대여는 실제/예정 개념이 없다 — 판매·예정 출고 라인에만 토글을 노출한다.
                              const isOutboundLine = draft.movementType === "outbound" && !lineSample
                              return (
                                <div key={`${draft.productName}-${index}`} className={`grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2 ${lineError ? "bg-[#FCE9E9]/50" : ""}`}>
                                  <div className="min-w-0">
                                    <p className="truncate text-[12px] font-bold text-[#111110]">{draft.productName}</p>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[#615D59]">
                                      <span>{MOVEMENT_LABEL[draft.movementType]} · {formatNumber(draft.quantity)}대 · {draft.toLocation || "-"}</span>
                                      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                        lineSample
                                          ? "bg-[#F6F5F4] text-[#615D59]"
                                          : linePlanned
                                            ? "bg-[#FBF1E0] text-[#A8741A]"
                                            : "bg-[#F6F5F4] text-[#31302E]"
                                      }`}>
                                        {draft.status || MOVEMENT_LABEL[draft.movementType]}
                                      </span>
                                      {lineSample && (
                                        // 샘플 대여는 실제/예정이 없으므로 토글 대신 정적 "샘플" pill만 표시한다.
                                        <span className="inline-flex rounded-full bg-[#F6F5F4] px-1.5 py-0.5 text-[10px] font-bold text-[#615D59]">
                                          샘플
                                        </span>
                                      )}
                                      {isOutboundLine && (
                                        // 라인별 실제|예정 토글 — draft.isPlanned를 뒤집어 status를 즉시 파생한다.
                                        <span className="inline-flex overflow-hidden rounded-full border border-[rgba(0,0,0,0.08)]" role="group" aria-label="출고 방식">
                                          {([["actual", "실제"], ["planned", "예정"]] as const).map(([mode, label]) => {
                                            const modeActive = mode === "planned" ? linePlanned : !linePlanned
                                            return (
                                              <button
                                                key={mode}
                                                type="button"
                                                aria-pressed={modeActive}
                                                disabled={quickCartSaving}
                                                onClick={() => {
                                                  if (modeActive) return
                                                  toggleQuickCartLinePlanned(index)
                                                }}
                                                className={`flex min-h-[40px] cursor-pointer items-center px-2.5 py-0.5 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 disabled:pointer-events-none disabled:opacity-40 sm:min-h-[28px] ${
                                                  modeActive
                                                    ? mode === "planned"
                                                      ? "bg-[#FBF1E0] text-[#A8741A]"
                                                      : "bg-[#ECFDF5] text-[#084734]"
                                                    : "bg-white text-[#A39E98] hover:text-[#31302E]"
                                                }`}
                                              >
                                                {label}
                                              </button>
                                            )
                                          })}
                                        </span>
                                      )}
                                    </p>
                                    {lineError && (
                                      <p className="mt-1 text-[11px] font-bold text-[#8F2C2C]">{lineError}</p>
                                    )}
                                    {cartFifoPreview && (
                                      <p className={`mt-1 text-[11px] font-bold ${
                                        cartFifoPreview.shortage > 0 ? "text-[#7A520F]" : "text-[#084734]"
                                      }`}>
                                        FIFO 예상: {cartFifoPreview.plan.length > 0
                                          ? cartFifoPreview.plan.map((lot) => `${formatLotLabel(lot.lot) ?? lot.lot} ${formatNumber(lot.quantity)}대`).join(" · ")
                                          : "배정 없음"}
                                        {cartFifoPreview.shortage > 0 ? ` · 부족 ${formatNumber(cartFifoPreview.shortage)}대` : ""}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeQuickCartItem(index)}
                                    disabled={quickCartSaving}
                                    aria-label={`${draft.productName} 바구니에서 삭제`}
                                    className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-[#A39E98] transition hover:bg-[#F6F5F4] hover:text-[#B43E3E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {quickCart.some((draft) => draft.movementType === "outbound" && !isDraftPlanned(draft) && !isSampleOutbound(draft)) && (
                          <div className="border-t border-[rgba(0,0,0,0.06)] bg-[#FBF1E0] px-3 py-2 text-[11px] font-bold text-[#7A520F]">
                            완료 출고 배치 저장은 CRM 오더 연동·매출 금액 없이 저장됩니다 — 연동이 필요한 판매 건은 단건 기록으로 저장하세요.
                          </div>
                        )}
                        {/* 리스트 근처 저장 CTA — 담은 품목이 있을 때 리스트 하단에 크게 노출(스티키 바와 별개). */}
                        {inboundBatchLayout && quickCart.length > 0 && (
                          <div className="border-t border-[rgba(0,0,0,0.06)] p-3">
                            <button
                              type="button"
                              onClick={() => void submitQuickCart()}
                              disabled={busy != null}
                              className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-[#084734] px-3 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Save className="h-4 w-4" />
                              {busy === "movement"
                                ? "저장 중"
                                : quickCartSaveSummary?.failed
                                  ? "실패 항목 재시도"
                                  : `${formatNumber(quickCartTotals.count)}건 · ${formatNumber(quickCartTotals.quantity)}대 저장`}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 보조 도구 — 세트 담기·견적 붙여넣기·이전 lot 구성 복사. 기본 접힘, 파워유저만 펼침. */}
                    {inboundBatchLayout && (
                      <details className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4]">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[12px] font-bold text-[#31302E] transition hover:bg-[#EDEBEA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40">
                          <span className="inline-flex items-center gap-1.5">
                            <FileSpreadsheet className="h-3.5 w-3.5 text-[#615D59]" />
                            빠른 담기 — 세트 · 견적 붙여넣기 · 이전 구성 복사
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 text-[#A39E98]" />
                        </summary>
                        <div className="space-y-3 border-t border-[rgba(0,0,0,0.06)] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-[11px] text-[#615D59]">세트·견적 라인을 담고, 직전 lot 구성을 그대로 복사합니다.</p>
                            <div className="inline-flex items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-[#615D59]">세트 배수</span>
                              <div className="grid h-9 grid-cols-[36px_40px_36px] overflow-hidden rounded-md border border-[rgba(0,0,0,0.08)] bg-white">
                                <button
                                  type="button"
                                  onClick={() => setKitMultiplier((current) => Math.max(1, current - 1))}
                                  aria-label="세트 배수 줄이기"
                                  className="flex cursor-pointer items-center justify-center text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="flex items-center justify-center border-x border-[rgba(0,0,0,0.08)] text-[13px] font-bold tabular-nums text-[#111110]">
                                  x{formatNumber(cartSetMultiplier)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setKitMultiplier((current) => Math.min(99, current + 1))}
                                  aria-label="세트 배수 늘리기"
                                  className="flex cursor-pointer items-center justify-center text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {kitPresetSummaries.map((preset) => {
                              const Icon = preset.icon
                              const unavailable = preset.missing.length > 0
                              const shortage = preset.lines.reduce((total, line) => total + line.shortage, 0)
                              return (
                                <button
                                  key={preset.key}
                                  type="button"
                                  onClick={() => addKitPresetToCart(preset.key)}
                                  disabled={busy != null || unavailable}
                                  className="cursor-pointer rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5 text-left transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.99] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <span className="flex items-center gap-2 text-[12px] font-bold text-[#111110]">
                                    <Icon className="h-3.5 w-3.5 text-[#084734]" />
                                    {preset.label}
                                  </span>
                                  <span className="mt-1 block text-[11px] text-[#615D59]">{preset.description}</span>
                                  <span className={`mt-1 block text-[11px] font-bold ${shortage > 0 ? "text-[#A8741A]" : "text-[#084734]"}`}>
                                    {unavailable
                                      ? "품목 미매칭"
                                      : shortage > 0
                                        ? `예상 부족 ${formatNumber(shortage)}대`
                                        : "가용 재고 확인"}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                          <div className="grid gap-2">
                            <label className="block">
                              <span className={SHEET_LABEL_CLASS}>견적/CRM 라인 붙여넣기</span>
                              <textarea
                                value={quotePasteText}
                                onChange={(event) => setQuotePasteText(event.target.value)}
                                rows={3}
                                placeholder={'예: 86" IFP x 2\nT1 2대\nSTD1, 2'}
                                className="mt-1 w-full resize-none rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[12px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={importQuoteLinesToCart}
                              disabled={busy != null || !quotePasteText.trim()}
                              className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#084734] bg-white px-3 text-[12px] font-bold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FileSpreadsheet className="h-3.5 w-3.5" />
                              견적 라인 담기
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={copyLatestInboundLotToCart}
                            className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-[#BDEFD8] bg-white px-3 text-[12px] font-bold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            이전 구성 복사
                          </button>
                        </div>
                      </details>
                    )}

                    {/* 상세 처리 도달 경로 — 빠른 2축 밖의 반환·샘플 배정·수리·조정을 같은 시트 상세 모드로 연다. */}
                    {sheetView === "quick" && !editingId && (
                      <button
                        type="button"
                        onClick={enterDetailView}
                        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-[12px] font-semibold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#31302E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Settings2 className="h-3.5 w-3.5 text-[#A39E98]" />
                          다른 처리 — 반환 · 샘플 배정 · 수리 · 조정
                        </span>
                        <span className="shrink-0 font-bold text-[#084734]">→</span>
                      </button>
                    )}
                    </div>

                    {/* sticky 액션바 — 화면당 solid green CTA는 정확히 하나. */}
                    <div className="sticky bottom-0 z-10 border-t border-[rgba(0,0,0,0.08)] bg-white px-5 py-3">
                      {sheetMode === "batch" && !editingId ? (
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                          <button
                            type="button"
                            onClick={addDraftToQuickCart}
                            disabled={!quickCartEnabled || busy != null || (!customProduct.trim() && !selectedItem)}
                            className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-[rgba(0,0,0,0.05)] px-3 text-[12px] font-bold text-[#31302E] transition hover:bg-[rgba(0,0,0,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 sm:h-10"
                          >
                            <Plus className="h-4 w-4" />
                            {inboundBatchLayout ? "이 품목 담기" : "현재 입력 담기"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void submitQuickCart()}
                            disabled={quickCart.length === 0 || busy != null}
                            className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-[#084734] px-3 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 sm:h-10"
                          >
                            <Save className="h-4 w-4" />
                            {busy === "movement"
                              ? "저장 중"
                              : quickCartSaveSummary?.failed
                                ? "실패 항목 재시도"
                                : `바구니 ${formatNumber(quickCartTotals.count)}건 · ${formatNumber(quickCartTotals.quantity)}대 저장`}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          {!editingId && (
                            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-[#615D59]">
                              <input
                                type="checkbox"
                                checked={stayOpenAfterSave}
                                onChange={toggleStayOpenAfterSave}
                                className="h-4 w-4 cursor-pointer rounded-[3px] accent-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                              />
                              저장 후 계속
                            </label>
                          )}
                          <button
                            type="submit"
                            aria-keyshortcuts="Meta+Enter Control+Enter"
                            title="저장 (⌘/Ctrl + Enter)"
                            disabled={busy != null || crmLoading || (!customProduct.trim() && !selectedItem)}
                            className="inline-flex h-11 flex-1 items-center justify-center gap-2 cursor-pointer rounded-md bg-[#084734] px-4 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 sm:h-10"
                          >
                            <Save className="h-4 w-4" />
                            {crmLoading ? "CRM 확인 중" : busy === "movement" ? "저장 중" : editingId ? "수정 저장" : "기록 저장"}
                            {!crmLoading && busy !== "movement" && (
                              <kbd aria-hidden className="hidden rounded border border-white/30 px-1 font-sans text-[10.5px] font-semibold text-white/80 md:inline">
                                ⌘↵
                              </kbd>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </form>
                </motion.aside>
              </motion.div>
  )
}

// 필수 칸 표시(라운드 2 Q-14) — 글자 "*"는 보조기술에 "필수"로 읽힌다. 색만으로 뜻을 전하지 않는다.
function RequiredMark() {
  return (
    <span className="ml-0.5 text-[#B43E3E]">
      <span aria-hidden>*</span>
      <span className="sr-only">(필수)</span>
    </span>
  )
}
