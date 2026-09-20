"use client"

// 한 화면 입고표(시안 A) — 물량번호·입고일·수입자·기본 보관처를 칩으로 고르고, 품목 표에 수량·단가·보관처를
// 적어 물량 하나를 한 번에 저장한다. 추천·검증·전송 형식 계산은 inbound-sheet-model.ts 가 맡고, 이 파일은
// 입력 상태·키보드·네트워크만 다룬다.
//
// 연결은 HardwareInventoryClient 가 한다. 이 파일은 부모를 import 하지 않는다(shared.tsx 순환 금지 원칙과 같다).
// 열릴 때마다 입력이 새로 시작되도록 본문(InboundSheetPanel)은 open 동안만 마운트한다.

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowDownToLine, ChevronDown, ClipboardPaste, Plus, RotateCcw, Search, Trash2, X } from "lucide-react"

import { adminFetch, adminFetchJson } from "@/lib/admin-client"
import {
  applyLinesToRows,
  buildFeaturedInboundRows,
  buildImporterChoices,
  buildInboundLotChoices,
  buildInboundSubmission,
  buildSampleRegisterPayloads,
  buildStorageChoices,
  createInboundRow,
  effectiveInboundStorage,
  featuredInboundRank,
  findInboundItem,
  formatMonthDay,
  inboundGridKeyIntent,
  inboundPickerGroup,
  inboundProductMatchKey,
  inboundRowAmount,
  isOfficeStorage,
  lastUnitPriceByProduct,
  localDateKey,
  lookupLastUnitPrice,
  normalizeInboundProductName,
  parseInboundPaste,
  parseInboundPrice,
  parseInboundQuantity,
  previousLotComposition,
  recentInboundImporter,
  recentInboundStorage,
  resolveInboundSaveOutcome,
  shiftDateKey,
  splitInboundSerials,
  suggestNextLot,
  summarizeInboundDraft,
  validateInboundDraft,
  type InboundDraft,
  type InboundDraftRow,
  type InboundLineResult,
  type InboundLotChoice,
  type InboundSavedLine,
} from "./inbound-sheet-model"
import { clearStoredDraft, readStoredDraft, writeStoredDraft } from "./draft-storage"
import { formatCurrency, formatNumber, MONO_META_CLASS, type HardwareItem, type HardwareMovement } from "./shared"

export interface InboundSheetSavedResult {
  lot: string
  savedLines: number
  savedUnits: number
  // 0 이 아니면 실패한 줄이 시트에 남아 있다(시트는 열린 채로 둔다).
  failedLines: number
  // 저장된 줄 중 사무실 보관 대수.
  officeUnits: number
  registeredSampleUnits: number
  sampleRegisterError: string | null
}

export interface InboundSheetProps {
  open: boolean
  onClose: () => void
  items: HardwareItem[]
  // 대시보드 이동 이력 — 물량번호·단가·보관처·수입자 후보를 여기서 만든다.
  movements: HardwareMovement[]
  // 품목 id 또는 정확한 품목 이름. 그 품목 행의 수량 칸에서 시작한다.
  initialProduct?: string | null
  canWrite: boolean
  // 한 줄이라도 저장되면 부른다(부분 실패 포함). 전부 저장되고 샘플 등록도 문제없으면 시트가 onClose 까지 부른다.
  onSaved: (result: InboundSheetSavedResult) => void
  // 대시보드 items 에는 비활성 품목도 섞여 있다(active 필드 없음). stock 행의 itemId 를 넘기면 주요 품목 슬롯과
  // "품목 추가" 목록을 활성 품목으로 좁힌다. 생략하면 전부 활성으로 본다.
  activeItemIds?: readonly string[] | null
  // 원장 담당자(owner) 칸에 남길 이름. 생략하면 비워 보낸다(작성자는 서버가 세션으로 기록한다).
  owner?: string | null
  // 시트 이관이 오래돼 최신 물량번호가 원장에 없을 수 있을 때 물량번호 아래에 붙이는 안내. 부모가 이관 신선도로 만든다.
  lotStaleNote?: string | null
}

interface MovementBatchResponse {
  lineResults?: InboundLineResult[]
  summary?: { success: number; failed: number }
  error?: string
  message?: string
}

type LotMode = "new" | "existing" | "custom"

type PickerOption = { kind: "item"; item: HardwareItem } | { kind: "new"; name: string }

// 작성 중 입고표 보관 — 새로고침·탭 폐기로 한 물량을 다시 치지 않게 한다(입력 가속 P3-1).
// 조용히 되살리지 않는다: 어제 쓰다 만 물량번호가 오늘 저장으로 새면 원장이 틀어진다. 배너로 사람이 고른다.
const INBOUND_DRAFT_KEY = "hw.inboundSheet.draft"
const INBOUND_DRAFT_VERSION = 1

const RECENT_LOT_LIMIT = 6
const RECENT_LOT_LIMIT_PHONE = 3

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// 표 열 — 품목 | 수량 | 단가 USD | 금액 | 보관처. 640px 미만은 행마다 쌓는다.
const TABLE_GRID_CLASS = "sm:grid-cols-[minmax(0,1fr)_72px_88px_96px_minmax(0,160px)]"

// 색·타이포 토큰 — DESIGN.md 캐논. 그린은 선택 칩 외곽선·주 버튼·액센트 바에만 쓴다(파스텔 채움 금지).
const CHIP_CLASS =
  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border bg-white px-3 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50"
const CHIP_IDLE_CLASS = "border-[rgba(0,0,0,0.08)] text-[#31302E] hover:border-[rgba(0,0,0,0.2)] hover:text-[#111110]"
const CHIP_ACTIVE_CLASS = "border-[#084734] text-[#084734] shadow-[inset_0_0_0_1px_#084734]"
// 글자색은 넣지 않는다 — 같은 요소에 text-[색] 유틸이 둘이면 이기는 쪽이 클래스 순서가 아니라 CSS 생성 순서로 정해진다.
const INPUT_BASE_CLASS =
  "h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 text-[13px] outline-none transition placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 disabled:cursor-not-allowed disabled:opacity-60"
const INPUT_CLASS = `${INPUT_BASE_CLASS} text-[#111110]`
const GHOST_BUTTON_CLASS =
  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12.5px] font-semibold text-[#31302E] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:pointer-events-none disabled:opacity-50"
const SECONDARY_BUTTON_CLASS =
  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md bg-[rgba(0,0,0,0.05)] px-3 text-[12.5px] font-bold text-[#111110] transition hover:bg-[rgba(0,0,0,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:pointer-events-none disabled:opacity-50"
const PRIMARY_BUTTON_CLASS =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-[#084734] px-4 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
const ROW_TEXT_BUTTON_CLASS =
  "cursor-pointer rounded px-1 py-0.5 text-[11px] font-semibold text-[#615D59] underline-offset-2 transition hover:text-[#111110] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:pointer-events-none disabled:opacity-50"
const TEXTAREA_CLASS =
  "w-full resize-y rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-2 font-mono text-[12px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"

// 행 키 — 이벤트 핸들러에서만 만든다(렌더 중 호출 금지).
let rowKeySeq = 0
function nextRowKey() {
  rowKeySeq += 1
  return `row:${rowKeySeq}`
}

function compactText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "")
}

// 정수 금액은 센트를 생략해 표 칸에 맞춘다($100,000 / $466.65).
function formatUsd(value: number) {
  return Number.isInteger(value) ? `$${formatNumber(value)}` : formatCurrency(value, "USD")
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback
}

function keyIntentOf(event: ReactKeyboardEvent<HTMLElement>) {
  return inboundGridKeyIntent({
    key: event.key,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    isComposing: event.nativeEvent.isComposing,
    keyCode: event.keyCode,
  })
}

function byFeaturedThenName(a: HardwareItem, b: HardwareItem) {
  const rankA = featuredInboundRank(a.name) ?? Number.MAX_SAFE_INTEGER
  const rankB = featuredInboundRank(b.name) ?? Number.MAX_SAFE_INTEGER
  return rankA - rankB || a.name.localeCompare(b.name, "ko", { numeric: true })
}

function FieldSection({ label, labelId, hint, children }: { label: string; labelId: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={labelId} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 id={labelId} className="text-[12px] font-semibold text-[#615D59]">
          {label}
        </h3>
        {hint ? <span className="text-[11.5px] text-[#A39E98]">{hint}</span> : null}
      </div>
      {children}
    </section>
  )
}

function ChoiceChip({ active, onClick, className = "", children }: { active: boolean; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`${CHIP_CLASS} ${active ? CHIP_ACTIVE_CLASS : CHIP_IDLE_CLASS} ${className}`}>
      {children}
    </button>
  )
}

export default function InboundSheet(props: InboundSheetProps) {
  const reduceMotion = useReducedMotion()
  return <AnimatePresence>{props.open ? <InboundSheetPanel key="inbound-sheet" {...props} reduceMotion={reduceMotion} /> : null}</AnimatePresence>
}

function InboundSheetPanel({
  onClose,
  items,
  movements,
  initialProduct,
  canWrite,
  onSaved,
  activeItemIds,
  owner,
  lotStaleNote,
  reduceMotion,
}: InboundSheetProps & { reduceMotion: boolean | null }) {
  const titleId = useId()
  const lotLabelId = useId()
  const lotListId = useId()
  const dateLabelId = useId()
  const importerLabelId = useId()
  const storageLabelId = useId()
  const tableLabelId = useId()
  const rowMessageIdPrefix = useId()
  const pastePanelId = useId()
  const pickerPanelId = useId()
  const pickerListId = useId()
  const promoGroupLabelId = useId()
  const panelRef = useRef<HTMLElement | null>(null)

  // 열린 순간의 초기값 — 주요 품목 슬롯, 시작 포커스 행, 오늘, 최근 수입자·보관처.
  const [boot] = useState(() => {
    const prices = lastUnitPriceByProduct(movements)
    const rows = buildFeaturedInboundRows(items, { activeItemIds, lastPrices: prices })
    let focusKey = rows[0]?.key ?? null
    const target = findInboundItem(items, initialProduct)
    if (target) {
      const existing = rows.find((row) => row.itemId === target.id)
      if (existing) {
        focusKey = existing.key
      } else {
        const added = createInboundRow({ key: `initial:${target.id}`, itemId: target.id, productName: target.name, lastPrices: prices })
        rows.push(added)
        focusKey = added.key
      }
    }
    return {
      rows,
      focusKey,
      today: localDateKey(),
      importer: recentInboundImporter(movements),
      storage: recentInboundStorage(movements),
    }
  })
  const today = boot.today
  const yesterday = shiftDateKey(today, -1)

  const lotChoices = useMemo(() => buildInboundLotChoices(movements, 0), [movements])
  // 이번에 저장한 물량 — 부모가 원장을 다시 받기 전에도 같은 번호를 또 추천하지 않게 한다.
  const [savedLots, setSavedLots] = useState<InboundLotChoice[]>([])
  const suggestedLot = useMemo(() => suggestNextLot([...lotChoices, ...savedLots]), [lotChoices, savedLots])
  const recentLots = useMemo(() => lotChoices.slice(0, RECENT_LOT_LIMIT), [lotChoices])
  const latestLot = lotChoices[0] ?? null
  const storageChoices = useMemo(() => buildStorageChoices(movements), [movements])
  const importerChoices = useMemo(() => buildImporterChoices(movements), [movements])
  const lastPrices = useMemo(() => lastUnitPriceByProduct(movements), [movements])
  const itemNames = useMemo(() => items.map((item) => item.name), [items])
  const activeItems = useMemo(() => {
    if (!activeItemIds) return items
    const active = new Set(activeItemIds)
    return items.filter((item) => active.has(item.id))
  }, [activeItemIds, items])

  const [lotMode, setLotMode] = useState<LotMode>("new")
  const [existingLot, setExistingLot] = useState("")
  const [customLot, setCustomLot] = useState("")
  const [occurredAt, setOccurredAt] = useState(today)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [importer, setImporter] = useState(boot.importer)
  const [importerInputOpen, setImporterInputOpen] = useState(false)
  const [defaultStorage, setDefaultStorage] = useState(boot.storage)
  const [storageInputOpen, setStorageInputOpen] = useState(false)
  const [rows, setRows] = useState<InboundDraftRow[]>(boot.rows)
  const [serialOpenKeys, setSerialOpenKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState("")
  const [pickerActive, setPickerActive] = useState(0)
  const [promoOpen, setPromoOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [registerSamples, setRegisterSamples] = useState(true)
  const [saving, setSaving] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [serverRowErrors, setServerRowErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [doneBanner, setDoneBanner] = useState<{ lot: string; lines: number; units: number; sampleError: string | null } | null>(null)

  // 추천 번호가 없으면(영문+숫자 물량 이력 없음) 직접 입력으로 시작한다.
  const effectiveLotMode: LotMode = lotMode === "new" && !suggestedLot ? "custom" : lotMode
  const lot = effectiveLotMode === "new" ? suggestedLot ?? "" : effectiveLotMode === "existing" ? existingLot : customLot.trim()
  const matchedLot = useMemo(() => {
    const key = lot.toUpperCase()
    return key ? [...lotChoices, ...savedLots].find((choice) => choice.lot.toUpperCase() === key) ?? null : null
  }, [lot, lotChoices, savedLots])

  const draft = useMemo<InboundDraft>(
    () => ({ lot, occurredAt, importer, defaultStorage, owner: owner ?? "", rows }),
    [defaultStorage, importer, lot, occurredAt, owner, rows]
  )
  const validation = useMemo(() => validateInboundDraft(draft), [draft])

  // ---- 작성 중 입력 보관 ----
  // 수량을 적은 줄이 하나라도 있으면 "쓰던 중"으로 본다. 빈 표는 저장하지도, 보관된 초안을 지우지도
  // 않는다 — 시트를 열자마자 빈 상태가 전날 초안을 덮어쓰면 복구할 것이 사라진다.
  const draftHasContent = rows.some((row) => row.quantity.trim() !== "") && Boolean(lot.trim())
  const [restorable, setRestorable] = useState(() => {
    const saved = readStoredDraft<InboundDraft>(INBOUND_DRAFT_KEY, INBOUND_DRAFT_VERSION)
    if (!saved || !Array.isArray(saved.rows)) return null
    const filled = saved.rows.filter((row) => typeof row?.quantity === "string" && row.quantity.trim() !== "")
    if (filled.length === 0) return null
    return { ...saved, rows: saved.rows }
  })

  useEffect(() => {
    if (!draftHasContent) return
    writeStoredDraft(INBOUND_DRAFT_KEY, INBOUND_DRAFT_VERSION, draft)
  }, [draft, draftHasContent])

  const restoreDraft = () => {
    if (!restorable) return
    setLotMode("custom")
    setCustomLot(restorable.lot)
    setOccurredAt(restorable.occurredAt)
    setImporter(restorable.importer)
    setDefaultStorage(restorable.defaultStorage)
    setRows(restorable.rows)
    setRestorable(null)
    setNotice(`작성 중이던 ${restorable.lot} 입고표를 되살렸습니다. 수량을 확인하고 저장하세요.`)
  }

  const discardRestorable = () => {
    clearStoredDraft(INBOUND_DRAFT_KEY)
    setRestorable(null)
  }
  const summary = useMemo(() => summarizeInboundDraft(draft), [draft])
  const pastePreview = useMemo(() => (pasteText.trim() ? parseInboundPaste(pasteText, itemNames) : null), [itemNames, pasteText])

  const pickerModel = useMemo(() => {
    const query = pickerQuery.trim()
    const searchKey = compactText(query)
    const matchKey = query ? inboundProductMatchKey(query) : ""
    const visible = activeItems.filter(
      (item) => !searchKey || compactText(item.name).includes(searchKey) || inboundProductMatchKey(item.name).includes(matchKey)
    )
    const exact = query ? findInboundItem(items, query) : null
    // 정확히 적은 이름이 비활성 품목이면 목록에 없더라도 그 품목으로 고르게 한다(같은 이름의 새 품목을 만들지 않게).
    if (exact && !visible.some((item) => item.id === exact.id)) visible.push(exact)
    const main = visible.filter((item) => inboundPickerGroup(item.name) === "main").sort(byFeaturedThenName)
    const promoEtc = visible.filter((item) => inboundPickerGroup(item.name) === "promoEtc").sort(byFeaturedThenName)
    const showPromo = Boolean(query) || promoOpen
    const newName = query && !exact ? normalizeInboundProductName(query) : null
    const options: PickerOption[] = [
      ...main.map((item) => ({ kind: "item" as const, item })),
      ...(showPromo ? promoEtc.map((item) => ({ kind: "item" as const, item })) : []),
      ...(newName ? [{ kind: "new" as const, name: newName }] : []),
    ]
    return { query, main, promoEtc, showPromo, newName, options }
  }, [activeItems, items, pickerQuery, promoOpen])
  const activeOptionIndex = Math.min(pickerActive, Math.max(0, pickerModel.options.length - 1))

  const dirty =
    pasteText.trim() !== "" ||
    rows.some((row) => row.quantity.trim() !== "" || row.serials.trim() !== "" || (!row.unitPriceSuggested && row.unitPrice.trim() !== ""))

  const requestClose = useCallback(() => {
    if (saving) return
    if (dirty && !window.confirm("입력한 입고 내용이 사라집니다. 닫을까요?")) return
    onClose()
  }, [dirty, onClose, saving])

  const focusField = useCallback((rowKey: string, field: "qty" | "price") => {
    const input = panelRef.current?.querySelector<HTMLInputElement>(`[data-inbound-field="${field}"][data-row-key="${CSS.escape(rowKey)}"]`)
    if (!input) return
    input.focus()
    input.select()
  }, [])

  // Escape 로 닫기 — 품목 검색처럼 안쪽에서 먼저 처리한 Escape(preventDefault)와 한글 조합 중 Escape 는 넘긴다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return
      event.preventDefault()
      requestClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [requestClose])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  // 열리면 첫 수량 칸(또는 진입한 품목의 수량 칸)에 포커스, 닫히면 원래 자리로 돌려준다.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => {
      if (boot.focusKey) focusField(boot.focusKey, "qty")
      else panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()
    })
    return () => {
      window.cancelAnimationFrame(frame)
      previous?.focus?.()
    }
  }, [boot.focusKey, focusField])

  // ---- 행 편집 ----
  const clearServerRowError = (key: string) => {
    setServerRowErrors((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const updateRow = (key: string, patch: Partial<InboundDraftRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
    clearServerRowError(key)
  }

  const removeRow = (key: string) => {
    setRows((current) => current.filter((row) => row.key !== key))
    clearServerRowError(key)
  }

  const openSerial = (key: string, open: boolean) => {
    setSerialOpenKeys((current) => {
      if (current.has(key) === open) return current
      const next = new Set(current)
      if (open) next.add(key)
      else next.delete(key)
      return next
    })
  }

  // ---- 품목 추가 ----
  // 목록이 표 맨 아래에서 열려 하단 바에 가려지므로, 열 때 검색칸과 목록이 함께 보이게 올린다.
  const openPicker = () => {
    setPickerOpen(true)
    window.requestAnimationFrame(() => {
      document.getElementById(pickerPanelId)?.scrollIntoView({ block: "nearest" })
    })
  }

  const closePicker = () => {
    setPickerOpen(false)
    setPickerQuery("")
    setPickerActive(0)
  }

  const addProduct = (option: PickerOption) => {
    const item = option.kind === "item" ? option.item : findInboundItem(items, option.name)
    const productName = item?.name ?? (option.kind === "new" ? option.name : "")
    if (!productName) return
    const matchKey = inboundProductMatchKey(productName)
    const emptyRow = rows.find(
      (row) => !row.quantity.trim() && (item ? row.itemId === item.id : inboundProductMatchKey(row.productName) === matchKey)
    )
    let focusKey = emptyRow?.key
    if (!focusKey) {
      const created = createInboundRow({ key: nextRowKey(), itemId: item?.id, productName, lastPrices })
      setRows((current) => [...current, created])
      focusKey = created.key
    }
    closePicker()
    const targetKey = focusKey
    window.requestAnimationFrame(() => focusField(targetKey, "qty"))
  }

  const movePickerHighlight = (nextIndex: number) => {
    setPickerActive(nextIndex)
    window.requestAnimationFrame(() => {
      document.getElementById(`${pickerListId}-option-${nextIndex}`)?.scrollIntoView({ block: "nearest" })
    })
  }

  const onPickerKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const count = pickerModel.options.length
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (count > 0) movePickerHighlight((activeOptionIndex + (event.key === "ArrowDown" ? 1 : count - 1)) % count)
      return
    }
    if (event.key === "Escape") {
      if (event.nativeEvent.isComposing) return
      event.preventDefault()
      event.stopPropagation()
      closePicker()
      return
    }
    if (keyIntentOf(event) !== "next") return
    event.preventDefault()
    const option = pickerModel.options[activeOptionIndex]
    if (option) addProduct(option)
  }

  // ---- 구성 불러오기·붙여넣기 ----
  const loadComposition = () => {
    if (!latestLot) return
    const lines = previousLotComposition(movements, latestLot.lot)
    if (lines.length === 0) {
      setNotice(`${latestLot.lot} 구성을 찾지 못했습니다.`)
      return
    }
    if (
      rows.some((row) => row.quantity.trim() !== "") &&
      !window.confirm(`입력한 수량을 ${latestLot.lot} 구성으로 덮어쓸까요? 구성에 없는 품목은 그대로 둡니다.`)
    ) {
      return
    }
    setRows(applyLinesToRows(rows, lines, { items, lastPrices, makeKey: nextRowKey }))
    setServerRowErrors({})
    setError(null)
    setNotice(`${latestLot.lot} 구성 ${formatNumber(lines.length)}줄을 불러왔습니다. 수량·단가를 확인하세요.`)
  }

  const applyPaste = () => {
    if (!pastePreview || pastePreview.rows.length === 0) return
    setRows(
      applyLinesToRows(
        rows,
        pastePreview.rows.map((line) => ({ productName: line.productName, quantity: line.quantity, unitPrice: line.unitPrice })),
        { items, lastPrices, makeKey: nextRowKey }
      )
    )
    const sourceLines = pasteText.split(/\r?\n/)
    const remaining = pastePreview.unmatched.map((line) => sourceLines[line.lineNumber - 1] ?? line.text).join("\n")
    setPasteText(remaining)
    if (!remaining.trim()) setPasteOpen(false)
    setError(null)
    setNotice(
      `붙여넣기 ${formatNumber(pastePreview.rows.length)}줄을 표에 반영했습니다.` +
        (pastePreview.unmatched.length > 0 ? ` 매칭 실패 ${formatNumber(pastePreview.unmatched.length)}줄은 입력칸에 남겨 두었습니다.` : "")
    )
  }

  // ---- 저장 ----
  const registerOfficeSampleUnits = async (lines: readonly InboundSavedLine[], lotValue: string, occurredOn: string) => {
    let registered = 0
    let failure: string | null = null
    for (const payload of buildSampleRegisterPayloads(lines, { lot: lotValue, occurredAt: occurredOn, owner })) {
      try {
        const result = await adminFetchJson<{ units?: unknown[] }>("/api/admin/hardware/samples", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        registered += Array.isArray(result?.units) ? result.units.length : payload.count
      } catch (err) {
        failure ??= errorMessage(err, "샘플 유닛 등록에 실패했습니다.")
      }
    }
    return { registered, failure }
  }

  const focusFirstInvalidRow = () => {
    const invalid = rows.find((row) => validation.rowErrors[row.key])
    if (!invalid) return
    if (parseInboundQuantity(invalid.quantity) == null) focusField(invalid.key, "qty")
    else if (invalid.unitPrice.trim() && parseInboundPrice(invalid.unitPrice) == null) focusField(invalid.key, "price")
    else openSerial(invalid.key, true)
  }

  const save = async () => {
    if (saving || !canWrite) return
    setAttempted(true)
    setError(null)
    setNotice(null)
    setDoneBanner(null)
    if (validation.headerErrors.length > 0 || Object.keys(validation.rowErrors).length > 0) {
      focusFirstInvalidRow()
      return
    }

    const submission = buildInboundSubmission(draft)
    const lotValue = draft.lot.trim()
    setSaving(true)
    try {
      const response = await adminFetch("/api/admin/hardware/movements", {
        method: "POST",
        body: JSON.stringify({ movements: submission.movements }),
      })
      const result = (await response.json().catch(() => null)) as MovementBatchResponse | null
      if (!result?.lineResults || !result.summary) {
        const fallback = `${response.status} ${response.statusText}`.trim()
        throw new Error(result?.error ?? result?.message ?? (fallback || "저장에 실패했습니다."))
      }

      const outcome = resolveInboundSaveOutcome(submission, result.lineResults)
      const failedKeys = new Set(Object.keys(outcome.failedErrors))
      if (outcome.savedLines.length === 0) {
        setServerRowErrors(outcome.failedErrors)
        setError("저장된 줄이 없습니다. 줄마다 표시된 오류를 고친 뒤 다시 저장하세요.")
        return
      }

      const officeLines = outcome.savedLines.filter((line) => isOfficeStorage(line.storage))
      const officeUnits = officeLines.reduce((total, line) => total + line.quantity, 0)
      // 입고가 저장된 뒤에만 유닛을 등록한다. 등록이 실패해도 입고 저장은 되돌리지 않는다.
      const samples =
        registerSamples && officeLines.length > 0
          ? await registerOfficeSampleUnits(officeLines, lotValue, draft.occurredAt)
          : { registered: 0, failure: null }

      // 저장된 줄은 원장에 있다 — 보관 초안은 여기서 지운다(부분 실패면 남은 줄이 다시 보관된다).
      clearStoredDraft(INBOUND_DRAFT_KEY)
      setSavedLots((current) => [
        ...current,
        { lot: lotValue, firstDate: draft.occurredAt, lastDate: draft.occurredAt, totalQuantity: outcome.savedUnits, productCount: outcome.savedLines.length },
      ])
      onSaved({
        lot: lotValue,
        savedLines: outcome.savedLines.length,
        savedUnits: outcome.savedUnits,
        failedLines: failedKeys.size,
        officeUnits,
        registeredSampleUnits: samples.registered,
        sampleRegisterError: samples.failure,
      })

      if (failedKeys.size === 0 && !samples.failure) {
        onClose()
        return
      }

      if (failedKeys.size === 0) {
        // 입고는 전부 저장됐고 샘플 등록만 실패 — 입력을 새로 시작하되 실패 문구를 남긴다.
        setRows(buildFeaturedInboundRows(items, { activeItemIds, lastPrices }))
        setSerialOpenKeys(new Set())
        setServerRowErrors({})
        setAttempted(false)
        setLotMode("new")
        setCustomLot("")
        setDoneBanner({ lot: lotValue, lines: outcome.savedLines.length, units: outcome.savedUnits, sampleError: samples.failure })
        return
      }

      // 일부 실패(207) — 실패한 줄만 남기고, 같은 물량번호로 다시 저장하게 고정한다.
      setRows((current) => current.filter((row) => failedKeys.has(row.key)))
      setServerRowErrors(outcome.failedErrors)
      setLotMode("custom")
      setCustomLot(lotValue)
      setError(
        `${formatNumber(outcome.savedLines.length)}줄 · ${formatNumber(outcome.savedUnits)}대는 저장했고 ${formatNumber(failedKeys.size)}줄은 실패했습니다. 남은 줄을 고쳐 다시 저장하세요.` +
          (samples.failure ? ` 샘플 유닛 등록도 실패했습니다: ${samples.failure}` : "")
      )
    } catch (err) {
      setError(errorMessage(err, "저장에 실패했습니다."))
    } finally {
      setSaving(false)
    }
  }

  // ---- 키보드 ----
  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Tab") {
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
      return
    }
    if (keyIntentOf(event) === "save") {
      event.preventDefault()
      void save()
    }
  }

  // 수량·단가 칸 Enter — 다음(Shift 는 이전) 행의 같은 칸으로. Cmd/Ctrl+Enter 는 패널이 저장으로 받는다.
  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>, rowIndex: number, field: "qty" | "price") => {
    const intent = keyIntentOf(event)
    if (intent !== "next" && intent !== "previous") return
    event.preventDefault()
    const target = rows[rowIndex + (intent === "next" ? 1 : -1)]
    if (target) focusField(target.key, field)
  }

  // ---- 표시용 파생값 ----
  const dateCustomActive = datePickerOpen || (occurredAt !== today && occurredAt !== yesterday)
  const importerMatches = importerChoices.some((choice) => compactText(choice) === compactText(importer))
  const importerCustomActive = importerInputOpen || (importer.trim() !== "" && !importerMatches)
  const storageMatches = storageChoices.some((choice) => compactText(choice) === compactText(defaultStorage))
  const storageCustomActive = storageInputOpen || (defaultStorage.trim() !== "" && !storageMatches)
  const storageMissing = attempted && !defaultStorage.trim() && rows.some((row) => row.quantity.trim() !== "" && !row.storage.trim())
  const lotStatus = !lot
    ? "물량번호를 고르거나 입력하세요."
    : matchedLot
      ? `기존 물량 ${lot}에 추가 입고합니다 · 지금 ${formatNumber(matchedLot.totalQuantity)}대 · ${formatNumber(matchedLot.productCount)}개 품목`
      : `새 물량번호 ${lot} · 이 번호로 새로 입고합니다.`
  const summaryParts =
    summary.lineCount === 0
      ? []
      : [
          `${formatNumber(summary.productCount)}품목`,
          `${formatNumber(summary.units)}대`,
          ...(summary.pricedLines > 0 ? [formatUsd(summary.totalUsd)] : []),
          ...(summary.officeUnits > 0 ? [`사무실 ${formatNumber(summary.officeUnits)}대`] : []),
        ]
  const storageOptionsFor = (row: InboundDraftRow) => {
    const options = [...storageChoices]
    for (const extra of [defaultStorage.trim(), row.storage.trim()]) {
      if (extra && !options.some((option) => compactText(option) === compactText(extra))) options.push(extra)
    }
    return options
  }

  const renderPickerOption = (option: PickerOption, optionIndex: number) => {
    const highlighted = optionIndex === activeOptionIndex
    const inTable = option.kind === "item" && rows.some((row) => row.itemId === option.item.id)
    const price = option.kind === "item" ? lookupLastUnitPrice(lastPrices, option.item.name) : null
    return (
      <div
        key={option.kind === "item" ? option.item.id : `new:${option.name}`}
        id={`${pickerListId}-option-${optionIndex}`}
        role="option"
        aria-selected={highlighted}
        // 강조는 키보드로만 옮긴다. 마우스 진입으로 옮기면 목록이 커서 아래에 새로 그려질 때 생기는 가짜 진입 이벤트가
        // 방향키로 고른 강조를 되돌려, Enter 가 다른 품목을 담는다(미리보기 실측).
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => addProduct(option)}
        className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 border-l-2 px-3 text-[12.5px] transition hover:bg-[#F6F5F4] md:min-h-9 ${
          highlighted ? "border-[#084734] bg-[#F6F5F4] text-[#111110]" : "border-transparent text-[#31302E]"
        }`}
      >
        {option.kind === "item" ? (
          <>
            <span className="min-w-0 truncate font-semibold">{option.item.name}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-[#A39E98]">
              {inTable ? "표에 있음" : price != null ? `최근 ${formatUsd(price)}` : ""}
            </span>
          </>
        ) : (
          <span className="min-w-0 truncate">
            새 품목으로 추가 <span className="font-semibold text-[#111110]">“{option.name}”</span>
          </span>
        )}
      </div>
    )
  }

  const promoStartIndex = pickerModel.main.length
  const newOptionIndex = pickerModel.options.length - 1

  return (
    <motion.div
      className="fixed inset-0 z-40 flex justify-end bg-black/35 backdrop-blur-[2px]"
      onClick={requestClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.16 }}
    >
      <motion.aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onPanelKeyDown}
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full flex-col border-l border-[rgba(0,0,0,0.08)] bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.05)] sm:max-w-[680px]"
        initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
        animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-4 pb-3 pt-4 sm:px-5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#615D59]">
              <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
              하드웨어 입고
            </p>
            <h2 id={titleId} className="mt-1 text-[17px] font-bold tracking-[-0.01em] text-[#111110]">
              입고 등록
            </h2>
            <p className="mt-0.5 text-[12px] text-[#615D59]">물량번호 하나로 들어온 품목의 수량·단가·보관처를 한 번에 기록합니다.</p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="입고 등록 닫기"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#FAFAF8]">
          <fieldset disabled={saving} className="m-0 min-w-0 space-y-5 border-0 px-4 py-4 sm:px-5">
            {restorable ? (
              // 조용히 되살리지 않는다 — 어제 쓰다 만 물량번호가 오늘 저장으로 새면 원장이 틀어진다.
              <div role="status" className="border-l-2 border-[#A8741A] bg-white py-2 pl-3 pr-2">
                <p className="text-[12.5px] font-semibold text-[#111110]">
                  작성 중이던 입고표가 있습니다 — <span className={MONO_META_CLASS}>{restorable.lot || "물량번호 없음"}</span>{" "}
                  {formatNumber(restorable.rows.filter((row) => row.quantity.trim() !== "").length)}줄
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button type="button" onClick={restoreDraft} className={GHOST_BUTTON_CLASS}>
                    이어서 작성
                  </button>
                  <button type="button" onClick={discardRestorable} className={GHOST_BUTTON_CLASS}>
                    새로 시작
                  </button>
                </div>
              </div>
            ) : null}

            {doneBanner ? (
              <div role="status" className="border-l-2 border-[#084734] bg-white py-2 pl-3 pr-2">
                <p className="text-[12.5px] font-semibold text-[#111110]">
                  {doneBanner.lot} 입고 {formatNumber(doneBanner.lines)}줄 · {formatNumber(doneBanner.units)}대를 저장했습니다.
                </p>
                {doneBanner.sampleError ? (
                  <p className="mt-1 text-[12px] font-semibold text-[#8F2C2C]">
                    샘플 유닛 등록은 실패했습니다: {doneBanner.sampleError} — 홈 › 샘플 유닛의 ‘원장 차이 확인’에서 다시 등록할 수 있습니다.
                  </p>
                ) : null}
              </div>
            ) : null}

            <FieldSection label="물량번호" labelId={lotLabelId}>
              <div role="group" aria-labelledby={lotLabelId} className="flex flex-wrap gap-1.5">
                {suggestedLot ? (
                  <ChoiceChip active={effectiveLotMode === "new"} onClick={() => setLotMode("new")}>
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    <span className={MONO_META_CLASS}>{suggestedLot}</span>
                    <span>새 물량</span>
                  </ChoiceChip>
                ) : null}
                {recentLots.map((choice, choiceIndex) => (
                  <ChoiceChip
                    key={choice.lot}
                    // 휴대폰에서는 최근 3개만 — 나머지는 직접 입력 목록(datalist)에 있다. 고른 칩은 숨기지 않는다.
                    className={choiceIndex >= RECENT_LOT_LIMIT_PHONE && !(effectiveLotMode === "existing" && existingLot === choice.lot) ? "max-sm:hidden" : ""}
                    active={effectiveLotMode === "existing" && existingLot === choice.lot}
                    onClick={() => {
                      setLotMode("existing")
                      setExistingLot(choice.lot)
                    }}
                  >
                    <span className={MONO_META_CLASS}>{choice.lot}</span>
                    <span className="font-medium tabular-nums text-[#615D59]">
                      · {formatMonthDay(choice.firstDate)} · {formatNumber(choice.totalQuantity)}대
                    </span>
                  </ChoiceChip>
                ))}
                <ChoiceChip active={effectiveLotMode === "custom"} onClick={() => setLotMode("custom")}>
                  직접 입력
                </ChoiceChip>
              </div>
              {effectiveLotMode === "custom" ? (
                <>
                  <input
                    value={customLot}
                    onChange={(event) => setCustomLot(event.target.value)}
                    list={lotListId}
                    placeholder={suggestedLot ? `예: ${suggestedLot}` : "예: C3"}
                    aria-label="물량번호 직접 입력"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    className={`${INPUT_CLASS} max-w-[240px] ${MONO_META_CLASS}`}
                  />
                  <datalist id={lotListId}>
                    {lotChoices.map((choice) => (
                      <option key={choice.lot} value={choice.lot} />
                    ))}
                  </datalist>
                </>
              ) : null}
              <p className={`border-l-2 pl-2.5 text-[12px] ${lot ? "border-[#084734] text-[#31302E]" : "border-[rgba(0,0,0,0.12)] text-[#615D59]"}`}>
                {lotStatus}
              </p>
              {lotStaleNote && !matchedLot ? (
                <p className="border-l-2 border-[#A8741A] pl-2.5 text-[12px] text-[#7A520F]">{lotStaleNote}</p>
              ) : null}
            </FieldSection>

            <FieldSection label="입고일" labelId={dateLabelId}>
              <div role="group" aria-labelledby={dateLabelId} className="flex flex-wrap items-center gap-1.5">
                <ChoiceChip
                  active={!dateCustomActive && occurredAt === today}
                  onClick={() => {
                    setOccurredAt(today)
                    setDatePickerOpen(false)
                  }}
                >
                  오늘 <span className="tabular-nums">{formatMonthDay(today)}</span>
                </ChoiceChip>
                <ChoiceChip
                  active={!dateCustomActive && occurredAt === yesterday}
                  onClick={() => {
                    setOccurredAt(yesterday)
                    setDatePickerOpen(false)
                  }}
                >
                  어제
                </ChoiceChip>
                <ChoiceChip active={dateCustomActive} onClick={() => setDatePickerOpen(true)}>
                  날짜 선택
                </ChoiceChip>
                {dateCustomActive ? (
                  <input
                    type="date"
                    value={occurredAt}
                    onChange={(event) => setOccurredAt(event.target.value)}
                    aria-label="입고일 선택"
                    className={`${INPUT_CLASS} w-auto tabular-nums`}
                  />
                ) : null}
              </div>
            </FieldSection>

            <FieldSection label="수입자" labelId={importerLabelId}>
              <div role="group" aria-labelledby={importerLabelId} className="flex flex-wrap gap-1.5">
                {importerChoices.map((choice) => (
                  <ChoiceChip
                    key={choice}
                    active={!importerCustomActive && compactText(importer) === compactText(choice)}
                    onClick={() => {
                      setImporter(choice)
                      setImporterInputOpen(false)
                    }}
                  >
                    {choice}
                  </ChoiceChip>
                ))}
                <ChoiceChip
                  active={importerCustomActive}
                  onClick={() => {
                    if (importerMatches) setImporter("")
                    setImporterInputOpen(true)
                  }}
                >
                  직접 입력
                </ChoiceChip>
              </div>
              {importerCustomActive ? (
                <input
                  value={importer}
                  onChange={(event) => setImporter(event.target.value)}
                  placeholder="수입자 이름"
                  aria-label="수입자 직접 입력"
                  autoComplete="off"
                  className={`${INPUT_CLASS} max-w-[280px]`}
                />
              ) : null}
            </FieldSection>

            <FieldSection
              label="기본 보관처"
              labelId={storageLabelId}
              hint={storageMissing ? <span className="font-semibold text-[#B43E3E]">보관처를 골라 주세요</span> : "행마다 바꿀 수 있어요"}
            >
              <div role="group" aria-labelledby={storageLabelId} className="flex flex-wrap gap-1.5">
                {storageChoices.map((choice) => (
                  <ChoiceChip
                    key={choice}
                    active={!storageCustomActive && compactText(defaultStorage) === compactText(choice)}
                    onClick={() => {
                      setDefaultStorage(choice)
                      setStorageInputOpen(false)
                    }}
                  >
                    {choice}
                  </ChoiceChip>
                ))}
                <ChoiceChip
                  active={storageCustomActive}
                  onClick={() => {
                    if (storageMatches) setDefaultStorage("")
                    setStorageInputOpen(true)
                  }}
                >
                  직접 입력
                </ChoiceChip>
              </div>
              {storageCustomActive ? (
                <input
                  value={defaultStorage}
                  onChange={(event) => setDefaultStorage(event.target.value)}
                  placeholder="보관처 이름"
                  aria-label="기본 보관처 직접 입력"
                  autoComplete="off"
                  className={`${INPUT_CLASS} max-w-[280px]`}
                />
              ) : null}
            </FieldSection>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {latestLot ? (
                  <button type="button" onClick={loadComposition} className={GHOST_BUTTON_CLASS}>
                    <RotateCcw className="h-3.5 w-3.5 text-[#615D59]" aria-hidden />
                    <span className={MONO_META_CLASS}>{latestLot.lot}</span> 구성 불러오기
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPasteOpen((current) => !current)}
                  aria-expanded={pasteOpen}
                  aria-controls={pastePanelId}
                  className={GHOST_BUTTON_CLASS}
                >
                  <ClipboardPaste className="h-3.5 w-3.5 text-[#615D59]" aria-hidden />
                  엑셀에서 붙여넣기
                  <ChevronDown className={`h-3.5 w-3.5 text-[#A39E98] transition ${pasteOpen ? "rotate-180" : ""}`} aria-hidden />
                </button>
              </div>

              {pasteOpen ? (
                <div id={pastePanelId} className="space-y-2.5 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                  <label className="block">
                    <span className="text-[12px] font-semibold text-[#615D59]">엑셀에서 품목 · 수량 · 단가 열을 복사해 붙여넣으세요</span>
                    <textarea
                      value={pasteText}
                      onChange={(event) => setPasteText(event.target.value)}
                      rows={4}
                      spellCheck={false}
                      placeholder={'86" IFP\t40\t2500\nSTD1\t40\t155'}
                      className={`mt-1.5 ${TEXTAREA_CLASS}`}
                    />
                  </label>
                  {pastePreview ? (
                    <div className="space-y-1.5">
                      <p className="text-[11.5px] font-semibold tabular-nums text-[#615D59]">
                        미리보기 · 인식 {formatNumber(pastePreview.rows.length)}줄
                        {pastePreview.unmatched.length > 0 ? ` · 매칭 실패 ${formatNumber(pastePreview.unmatched.length)}줄` : ""}
                      </p>
                      {pastePreview.rows.length > 0 ? (
                        <ul className="divide-y divide-[rgba(0,0,0,0.06)] rounded-md border border-[rgba(0,0,0,0.08)]">
                          {pastePreview.rows.map((line) => (
                            <li key={line.lineNumber} className="flex items-center justify-between gap-3 px-2.5 py-1.5 text-[12px]">
                              <span className="min-w-0 truncate font-semibold text-[#111110]">{line.productName}</span>
                              <span className="shrink-0 tabular-nums text-[#31302E]">
                                {formatNumber(line.quantity)}대{line.unitPrice != null ? ` · ${formatUsd(line.unitPrice)}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {pastePreview.unmatched.length > 0 ? (
                        <ul className="space-y-1">
                          {pastePreview.unmatched.map((line) => (
                            <li key={line.lineNumber} className="border-l-2 border-[#B43E3E] pl-2 text-[11.5px] text-[#8F2C2C]">
                              <span className="font-semibold tabular-nums">{line.lineNumber}줄</span>{" "}
                              <span className="break-all font-mono">{line.text}</span> —{" "}
                              {line.reason === "product" ? "품목 이름이 정확히 맞지 않습니다" : "수량을 1 이상 정수로 읽지 못했습니다"}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPasteOpen(false)
                        setPasteText("")
                      }}
                      className={GHOST_BUTTON_CLASS}
                    >
                      닫기
                    </button>
                    <button type="button" onClick={applyPaste} disabled={!pastePreview || pastePreview.rows.length === 0} className={SECONDARY_BUTTON_CLASS}>
                      표에 적용{pastePreview && pastePreview.rows.length > 0 ? ` ${formatNumber(pastePreview.rows.length)}줄` : ""}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <section aria-labelledby={tableLabelId} className="overflow-hidden rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 pb-2 pt-3 sm:px-4">
                <h3 id={tableLabelId} className="text-[13px] font-bold text-[#111110]">
                  품목
                </h3>
                <span className="text-[11.5px] text-[#A39E98]">수량을 적은 줄만 저장합니다 · Enter 다음 줄</span>
              </div>
              <div
                aria-hidden
                className={`hidden gap-2 border-y border-[rgba(0,0,0,0.06)] bg-[#F6F5F4] px-4 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#615D59] sm:grid ${TABLE_GRID_CLASS}`}
              >
                <span>품목</span>
                <span className="text-right">수량</span>
                <span className="text-right">단가 USD</span>
                <span className="text-right">금액</span>
                <span>보관처</span>
              </div>

              {rows.length === 0 ? (
                <p className="border-t border-[rgba(0,0,0,0.06)] px-4 py-6 text-center text-[12.5px] text-[#615D59] sm:border-t-0">
                  아래 ‘품목 추가’로 입고할 품목을 고르세요.
                </p>
              ) : (
                <ul className="divide-y divide-[rgba(0,0,0,0.06)] border-t border-[rgba(0,0,0,0.06)] sm:border-t-0">
                  {rows.map((row, index) => {
                    const amount = inboundRowAmount(row)
                    const quantity = parseInboundQuantity(row.quantity)
                    const rowError = serverRowErrors[row.key] ?? validation.rowErrors[row.key] ?? null
                    const rowWarning = validation.rowWarnings[row.key] ?? null
                    const active = row.quantity.trim() !== ""
                    const office = active && isOfficeStorage(effectiveInboundStorage(row, defaultStorage))
                    const serialCount = splitInboundSerials(row.serials).length
                    const serialOpen = serialOpenKeys.has(row.key)
                    const messageId = `${rowMessageIdPrefix}-${index}`
                    const newProductTag = !row.itemId && !active
                    // 시리얼·삭제 — 넓은 화면은 품목 이름 아래, 휴대폰은 보관처 옆에 둔다(44px 버튼 줄 하나를 아낀다).
                    const rowActions = (
                      <>
                        <button type="button" onClick={() => openSerial(row.key, !serialOpen)} aria-expanded={serialOpen} className={ROW_TEXT_BUTTON_CLASS}>
                          시리얼{serialCount > 0 ? <span className="tabular-nums"> {formatNumber(serialCount)}</span> : null}
                        </button>
                        {!row.pinned ? (
                          <button
                            type="button"
                            onClick={() => removeRow(row.key)}
                            aria-label={`${row.productName} 줄 삭제`}
                            className={`${ROW_TEXT_BUTTON_CLASS} inline-flex items-center justify-center hover:text-[#B43E3E]`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        ) : null}
                      </>
                    )
                    return (
                      <li key={row.key} className="relative px-3 py-2.5 sm:px-4">
                        <span
                          aria-hidden
                          className={`absolute inset-y-2 left-0 w-[3px] rounded-r ${rowError ? "bg-[#B43E3E]" : active ? "bg-[#084734]" : "bg-transparent"}`}
                        />
                        <div className={`grid grid-cols-2 gap-2 sm:items-center ${TABLE_GRID_CLASS}`}>
                          <div className="col-span-2 min-w-0 sm:col-span-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p title={row.productName} className="min-w-0 truncate text-[13px] font-semibold text-[#111110]">
                                {row.productName}
                              </p>
                              <span className="shrink-0 whitespace-nowrap text-[13px] font-semibold tabular-nums text-[#111110] sm:hidden">
                                {amount != null ? formatUsd(amount) : "—"}
                              </span>
                            </div>
                            <div className={`mt-0.5 flex-wrap items-center gap-x-1.5 text-[11px] ${newProductTag || office ? "flex" : "hidden sm:flex"}`}>
                              {newProductTag ? <span className="font-semibold text-[#A8741A]">새 품목</span> : null}
                              {office ? <span className="font-semibold text-[#615D59]">사무실 보관</span> : null}
                              <span className="hidden items-center gap-x-1.5 sm:inline-flex">{rowActions}</span>
                            </div>
                          </div>
                          <label className="block min-w-0">
                            <span className="mb-1 block text-[11px] font-semibold text-[#615D59] sm:hidden">수량</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              enterKeyHint="next"
                              autoComplete="off"
                              data-inbound-field="qty"
                              data-row-key={row.key}
                              value={row.quantity}
                              onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                              onKeyDown={(event) => onGridKeyDown(event, index, "qty")}
                              aria-label={`${row.productName} 수량`}
                              aria-invalid={rowError ? true : undefined}
                              aria-describedby={rowError || rowWarning ? messageId : undefined}
                              placeholder="0"
                              className={`${INPUT_CLASS} text-right font-semibold tabular-nums`}
                            />
                          </label>
                          <label className="block min-w-0">
                            <span className="mb-1 block text-[11px] font-semibold text-[#615D59] sm:hidden">단가 USD</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              enterKeyHint="next"
                              autoComplete="off"
                              data-inbound-field="price"
                              data-row-key={row.key}
                              value={row.unitPrice}
                              onChange={(event) => updateRow(row.key, { unitPrice: event.target.value, unitPriceSuggested: false })}
                              onKeyDown={(event) => onGridKeyDown(event, index, "price")}
                              aria-label={`${row.productName} 단가(USD)${row.unitPriceSuggested ? " — 최근 입고 단가로 채움" : ""}`}
                              title={row.unitPriceSuggested ? "최근 입고 단가 — 그대로 두면 이 값으로 저장됩니다" : undefined}
                              placeholder="—"
                              className={`${INPUT_BASE_CLASS} text-right tabular-nums ${row.unitPriceSuggested ? "text-[#A39E98]" : "font-semibold text-[#111110]"}`}
                            />
                          </label>
                          <span className="hidden whitespace-nowrap text-right text-[13px] font-semibold tabular-nums text-[#111110] sm:block">
                            {amount != null ? formatUsd(amount) : "—"}
                          </span>
                          <div className="col-span-2 flex min-w-0 items-end gap-1 sm:col-span-1 sm:block">
                            <label className="block min-w-0 flex-1">
                              <span className="mb-1 block text-[11px] font-semibold text-[#615D59] sm:hidden">보관처</span>
                              <select
                                value={row.storage}
                                onChange={(event) => updateRow(row.key, { storage: event.target.value })}
                                aria-label={`${row.productName} 보관처`}
                                className={`${INPUT_BASE_CLASS} truncate pr-7 ${row.storage ? "font-semibold text-[#111110]" : "text-[#615D59]"}`}
                              >
                                <option value="">{defaultStorage.trim() ? `기본 · ${defaultStorage.trim()}` : "기본 보관처"}</option>
                                {storageOptionsFor(row).map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div className="flex shrink-0 items-center sm:hidden">{rowActions}</div>
                          </div>
                        </div>
                        {rowError ? (
                          <p id={messageId} className="mt-1.5 text-[11.5px] font-semibold text-[#B43E3E]">
                            {rowError}
                          </p>
                        ) : rowWarning ? (
                          <p id={messageId} className="mt-1.5 text-[11.5px] font-medium text-[#A8741A]">
                            {rowWarning}
                          </p>
                        ) : null}
                        {serialOpen ? (
                          <label className="mt-2 block">
                            <span className="text-[11px] font-semibold text-[#615D59]">
                              시리얼 번호 · 쉼표·공백·줄바꿈 구분{" "}
                              <span className="tabular-nums">
                                ({formatNumber(serialCount)}/{quantity != null ? formatNumber(quantity) : "—"})
                              </span>
                            </span>
                            <textarea
                              value={row.serials}
                              onChange={(event) => updateRow(row.key, { serials: event.target.value })}
                              rows={2}
                              spellCheck={false}
                              aria-label={`${row.productName} 시리얼 번호`}
                              className={`mt-1 ${TEXTAREA_CLASS}`}
                            />
                          </label>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}

              <div className="border-t border-[rgba(0,0,0,0.06)] p-3 sm:px-4">
                {pickerOpen ? (
                  <div id={pickerPanelId} className="scroll-mb-3 space-y-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" aria-hidden />
                      <input
                        autoFocus
                        role="combobox"
                        aria-expanded="true"
                        aria-controls={pickerListId}
                        aria-autocomplete="list"
                        aria-activedescendant={pickerModel.options.length > 0 ? `${pickerListId}-option-${activeOptionIndex}` : undefined}
                        aria-label="추가할 품목 검색"
                        value={pickerQuery}
                        onChange={(event) => {
                          setPickerQuery(event.target.value)
                          setPickerActive(0)
                        }}
                        onKeyDown={onPickerKeyDown}
                        placeholder="품목 검색 · 목록에 없으면 새 품목 이름"
                        autoComplete="off"
                        className={`${INPUT_CLASS} pl-8`}
                      />
                    </div>
                    <div id={pickerListId} role="listbox" aria-label="추가할 품목" className="max-h-64 overflow-y-auto rounded-md border border-[rgba(0,0,0,0.08)] bg-white">
                      {pickerModel.options.length === 0 ? (
                        <p className="px-3 py-3 text-[12px] text-[#615D59]">추가할 수 있는 품목이 없습니다.</p>
                      ) : null}
                      {pickerModel.main.length > 0 ? (
                        <div role="group" aria-label="주요 품목">
                          {pickerModel.main.map((item, itemIndex) => renderPickerOption({ kind: "item", item }, itemIndex))}
                        </div>
                      ) : null}
                      {pickerModel.showPromo && pickerModel.promoEtc.length > 0 ? (
                        <div role="group" aria-labelledby={promoGroupLabelId}>
                          <p
                            id={promoGroupLabelId}
                            className="border-y border-[rgba(0,0,0,0.06)] bg-[#F6F5F4] px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#615D59]"
                          >
                            판촉·기타
                          </p>
                          {pickerModel.promoEtc.map((item, itemIndex) => renderPickerOption({ kind: "item", item }, promoStartIndex + itemIndex))}
                        </div>
                      ) : null}
                      {pickerModel.newName ? renderPickerOption({ kind: "new", name: pickerModel.newName }, newOptionIndex) : null}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {!pickerModel.query && pickerModel.promoEtc.length > 0 ? (
                        <button type="button" onClick={() => setPromoOpen((current) => !current)} aria-expanded={promoOpen} className={GHOST_BUTTON_CLASS}>
                          판촉·기타 <span className="tabular-nums">{formatNumber(pickerModel.promoEtc.length)}</span>
                          <ChevronDown className={`h-3.5 w-3.5 text-[#A39E98] transition ${promoOpen ? "rotate-180" : ""}`} aria-hidden />
                        </button>
                      ) : (
                        <span />
                      )}
                      <button type="button" onClick={closePicker} className={GHOST_BUTTON_CLASS}>
                        닫기
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={openPicker} className={`${GHOST_BUTTON_CLASS} w-full justify-center`}>
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    품목 추가
                  </button>
                )}
              </div>
            </section>
          </fieldset>
        </div>

        <footer
          className="shrink-0 border-t border-[rgba(0,0,0,0.08)] bg-white px-4 pt-3 sm:px-5"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {error ? (
            <p role="alert" className="mb-2 border-l-2 border-[#B43E3E] pl-2.5 text-[12px] font-semibold text-[#8F2C2C]">
              {error}
            </p>
          ) : null}
          {attempted && validation.headerErrors.length > 0 ? (
            <ul role="alert" className="mb-2 space-y-0.5 border-l-2 border-[#B43E3E] pl-2.5 text-[12px] font-semibold text-[#8F2C2C]">
              {validation.headerErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
          {notice && !error ? (
            <p role="status" className="mb-2 border-l-2 border-[#084734] pl-2.5 text-[12px] font-semibold text-[#31302E]">
              {notice}
            </p>
          ) : null}
          {canWrite && summary.officeUnits > 0 ? (
            <label className="mb-2.5 flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-[#31302E]">
              <input
                type="checkbox"
                checked={registerSamples}
                onChange={(event) => setRegisterSamples(event.target.checked)}
                disabled={saving}
                className="h-4 w-4 cursor-pointer rounded-[3px] accent-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
              />
              <span>
                사무실 입고분 <span className="tabular-nums">{formatNumber(summary.officeUnits)}</span>대를 샘플 유닛으로 등록
              </span>
            </label>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="min-w-0 text-[12.5px] font-semibold tabular-nums text-[#31302E]">
              {summaryParts.length > 0 ? summaryParts.join(" · ") : <span className="font-medium text-[#A39E98]">수량을 입력하면 합계가 보입니다</span>}
            </p>
            {canWrite ? (
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || summary.lineCount === 0}
                aria-keyshortcuts="Meta+Enter Control+Enter"
                className={`${PRIMARY_BUTTON_CLASS} max-sm:w-full`}
              >
                <ArrowDownToLine className="h-4 w-4" aria-hidden />
                {saving ? "저장 중…" : `${lot ? `${lot} ` : ""}입고 저장`}
                <span aria-hidden className="hidden text-[11px] font-semibold text-white/70 md:inline">
                  ⌘/Ctrl ↵
                </span>
              </button>
            ) : (
              <p className="text-[12px] font-semibold text-[#A8741A]">입고 저장 권한이 없습니다. 하드웨어 편집 권한이 있는 관리자에게 요청하세요.</p>
            )}
          </div>
        </footer>
      </motion.aside>
    </motion.div>
  )
}
