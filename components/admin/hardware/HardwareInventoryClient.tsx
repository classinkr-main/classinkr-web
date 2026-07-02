"use client"

import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Camera,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  LayoutDashboard,
  Link2,
  ListChecks,
  Minus,
  Monitor,
  Plus,
  Projector,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShoppingCart,
  Trash2,
  UploadCloud,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react"

import { adminFetch, adminFetchJson, clearAdminRequestCache } from "@/lib/admin-client"
import { paginateAdminList, type AdminListPaginationResult } from "@/lib/admin-list-pagination"
import { fiscalQuarter } from "@/lib/branch/fiscal"

type HardwareMovementType = "inbound" | "outbound" | "return" | "transfer" | "repair" | "adjust"

interface HardwareItem {
  id: string
  name: string
  sku: string | null
  category: string | null
  reorder_point: number
  lead_time_days: number
  active: boolean
  source_aliases: string[]
}

interface HardwareMovement {
  id: string
  item_id: string
  product_name: string
  movement_type: HardwareMovementType
  quantity: number
  occurred_at: string | null
  from_location: string | null
  to_location: string | null
  owner: string | null
  status: string | null
  reference_no: string | null
  memo: string | null
  serials: string[]
  lot_no: string | null
  unit_price: number | null
  amount_usd: number | null
  amount_cny: number | null
  storage_location: string | null
  importer: string | null
  source: "admin_manual" | "sheet_import"
  created_by: string | null
  created_at: string
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  converted_from_movement_id: string | null
  converted_to_movement_id: string | null
}

interface HardwareStockRow {
  itemId: string
  product: string
  category: string | null
  reorderPoint: number
  leadTimeDays: number
  warehouseStock: number
  plannedOut: number
  availableStock: number
  outbound30d: number
  weeklyOutboundAvg: number
  trendOrderPoint: number
  daysUntilStockout: number | null
  low: boolean
  orderRecommended: boolean
  locationBalances: Array<{ location: string; quantity: number }>
  lotBalances: Array<{ lot: string; quantity: number }>
}

interface HardwareAlert {
  id: string
  severity: "critical" | "warning" | "info"
  product: string
  title: string
  detail: string
}

interface HardwareDashboard {
  items: HardwareItem[]
  stock: HardwareStockRow[]
  movements: HardwareMovement[]
  recentOutbound: HardwareMovement[]
  plannedMovements: HardwareMovement[]
  alerts: HardwareAlert[]
  totals: {
    warehouseStock: number
    availableStock: number
    plannedOut: number
    outbound30d: number
    lowItems: number
    orderRecommended: number
  }
  importRun: {
    id: string
    status: string
    started_at: string
    finished_at: string | null
    rows_imported: number | null
    rows_skipped: number | null
    error: string | null
  } | null
}

interface HardwareCrmOrderCandidate {
  id: string
  source: "portal_deal" | "portal_quote" | "legacy_quote" | "external_crm"
  sourceLabel: string
  referenceNo: string
  title: string
  productName: string | null
  quantity: number | null
  amount: number | null
  customerName: string | null
  owner: string | null
  status: string | null
  occurredAt: string | null
  syncedAt: string | null
  href: string | null
  confidence: "high" | "medium" | "low"
  reason: string
}

interface HardwareCrmOrderCandidatesResponse {
  candidates: HardwareCrmOrderCandidate[]
  warnings: string[]
}

interface HardwareMovementDraft {
  itemId?: string
  productName: string
  movementType: HardwareMovementType
  quantity: number
  occurredAt: string
  fromLocation: string
  toLocation: string
  owner: string
  status: string
  referenceNo: string
  memo: string
  lotNo: string
  unitPrice: number | null
  amountUsd: number | null
  amountCny: number | null
  storageLocation: string
  importer: string
  serials: string[]
}

interface HardwareMovementBatchLineResult {
  index: number
  ok: boolean
  productName: string
  quantity: number | null
  movement?: HardwareMovement
  movements?: HardwareMovement[]
  error?: string
}

interface HardwareMovementBatchResponse {
  movements: HardwareMovement[]
  lineResults: HardwareMovementBatchLineResult[]
  summary: { success: number; failed: number; created?: number }
}

interface QuickCartSaveSummary {
  success: number
  failed: number
  savedQuantity: number
  failedQuantity: number
}

interface HardwareKitPreset {
  key: string
  label: string
  description: string
  icon: LucideIcon
  lines: Array<{
    label: string
    quantity: number
    match: (row: HardwareStockRow) => boolean
  }>
}

const ENTRY_PRESETS: Array<{
  key: string
  movementType: HardwareMovementType
  label: string
  description: string
  icon: LucideIcon
  from: string
  to: string
  status: string
}> = [
  // sale/planned의 to는 비워 둔다 — "고객" 리터럴이 그대로 저장되면 고객사 집계가 "고객(미지정)"으로 뭉개진다.
  // 도착 입력은 최근 고객사 datalist + 출고 필수 검증으로 실명 입력을 유도한다.
  { key: "sale", movementType: "outbound", label: "판매 출고", description: "고객 판매 완료", icon: ArrowUpFromLine, from: "창고", to: "", status: "출고" },
  { key: "planned", movementType: "outbound", label: "배송 예정", description: "가용에서 미리 차감", icon: Clock3, from: "창고", to: "", status: "배송 예정" },
  { key: "sample", movementType: "outbound", label: "샘플 대여", description: "판매 재고 제외", icon: ArrowRightLeft, from: "창고", to: "샘플", status: "샘플/대여" },
  { key: "inbound", movementType: "inbound", label: "입고", description: "창고 재고 증가", icon: ArrowDownToLine, from: "", to: "창고", status: "입고" },
  { key: "return", movementType: "return", label: "반납", description: "외부에서 창고 회수", icon: RotateCcw, from: "고객", to: "창고", status: "반납" },
  { key: "office", movementType: "transfer", label: "사무실 이동", description: "비가용 위치 이동", icon: ArrowRightLeft, from: "창고", to: "사무실", status: "이동" },
  { key: "repair", movementType: "repair", label: "수리", description: "예외 상태 처리", icon: Wrench, from: "창고", to: "수리", status: "수리중" },
  { key: "adjust", movementType: "adjust", label: "실사 조정", description: "창고 수량 보정", icon: Settings2, from: "", to: "창고", status: "재고 조정" },
]

const LOCATION_OPTIONS = ["고객", "창고", "샘플", "사무실", "수리"] as const

const QUICK_QUANTITIES = [1, 2, 5, 10]

const STOCK_PAGE_SIZE = 8
const OUTBOUND_PAGE_SIZE = 6
const ALERT_PAGE_SIZE = 5
const LOG_GROUP_PAGE_SIZE = 8
const PLANNED_PAGE_SIZE = 5

type HardwareTab = "home" | "entry" | "history"

const HARDWARE_TABS: Array<{ id: HardwareTab; label: string; icon: LucideIcon; description: string }> = [
  { id: "home", label: "홈", icon: LayoutDashboard, description: "현황 · 예상 출고" },
  { id: "entry", label: "입출고", icon: ArrowRightLeft, description: "입고 · 출고 기록" },
  { id: "history", label: "내역", icon: ListChecks, description: "전체 원장" },
]

type HardwareSectionKey = "stock" | "outbound" | "alerts"

const DEFAULT_OPEN_SECTIONS: Record<HardwareSectionKey, boolean> = {
  stock: true,
  outbound: true,
  alerts: true,
}

const MOVEMENT_LABEL: Record<HardwareMovementType, string> = {
  inbound: "입고",
  outbound: "출고",
  return: "반납",
  transfer: "이동",
  repair: "수리",
  adjust: "조정",
}

const MOVEMENT_TONE: Record<HardwareMovementType, string> = {
  inbound: "bg-[#ECFDF5] text-[#084734]",
  outbound: "bg-[#FCE9E9] text-[#B43E3E]",
  return: "bg-[#ECFDF5] text-[#084734]",
  transfer: "bg-[#F6F5F4] text-[#31302E]",
  repair: "bg-[#FBF1E0] text-[#A8741A]",
  adjust: "bg-[#F6F5F4] text-[#31302E]",
}

const ALERT_TONE: Record<HardwareAlert["severity"], string> = {
  critical: "border-[#F2B8B8] bg-[#FCE9E9] text-[#8F2C2C]",
  warning: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]",
  info: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]",
}

// 재고 위치 맵 — 칠판(장비) 기준 핵심 상태만 노출한다. 표시 요소(사용자 지정):
//   창고     = 판매용 재고(warehouseStock)
//   가용     = 창고 − 배송 예정(availableStock)
//   예정     = 배송 예정 차감분(plannedOut)
//   남은 샘플 = 사무실 보관 중인 샘플 재고(locationBalances "사무실")
//   나간 샘플 = 대여·데모로 나가 있는 샘플(locationBalances "샘플")
// 샘플 총량 = 남은(사무실) + 나간. 사무실=샘플 보관소라는 실무 모델(사용자 확인)에 따라 파생.
const BOARD_ELEMENTS = [
  { key: "warehouse", label: "창고", desc: "판매용 재고", tone: "#31302E" },
  { key: "available", label: "가용", desc: "창고 − 예정", tone: "#084734" },
  { key: "planned", label: "예정", desc: "배송 예정(차감분)", tone: "#A8741A" },
  { key: "sampleStock", label: "남은 샘플", desc: "사무실 보관", tone: "#615D59" },
  { key: "sampleOut", label: "나간 샘플", desc: "대여·데모 중", tone: "#B43E3E" },
] as const

function locationQuantity(row: HardwareStockRow, location: string): number {
  if (location === "창고") return row.warehouseStock
  if (location === "배송 예정") return row.plannedOut
  return row.locationBalances.find((balance) => balance.location === location)?.quantity ?? 0
}

// 칠판 기준 위치별 수량.
function boardValue(row: HardwareStockRow, key: (typeof BOARD_ELEMENTS)[number]["key"]): number {
  if (key === "warehouse") return row.warehouseStock
  if (key === "available") return row.availableStock
  if (key === "planned") return row.plannedOut
  if (key === "sampleStock") return locationQuantity(row, "사무실")
  return locationQuantity(row, "샘플") // sampleOut
}

// 재고 위치 맵에서 숨길 품목(내부 코드/비주력 — 사용자 지정). 품목명 정확 일치, 대소문자 무시.
const LOCATION_MAP_HIDDEN_PRODUCTS = new Set(["A1", "B1", "D2"])
const isPromotedProduct = (product: string) => /\(\s*promoted\s*\)/i.test(product)

// 위치 맵 기본 노출(펼침) 품목 순서(사용자 지정): 86" → 75" → T1 → T1(promo) → STD1 → STD1(promo).
// 여기 해당하면 rank(0~5), 아니면 null → "상세보기"로 접히는 나머지(65"/110"/S1/OPS/액세서리 등).
function featuredRank(product: string): number | null {
  const promo = isPromotedProduct(product)
  if (/86["”]?\s*IFP/i.test(product) && !promo) return 0
  if (/75["”]?\s*IFP/i.test(product) && !promo) return 1
  if (/\bT1\b/i.test(product) && !promo) return 2
  if (/\bT1\b/i.test(product) && promo) return 3
  if (/\bSTD1\b/i.test(product) && !promo) return 4
  if (/\bSTD1\b/i.test(product) && promo) return 5
  return null
}

// "총 입고" 상단 집계 대상 품목(사용자 지정): 86"/75" 전자칠판 + T1 (프로모 변형 포함).
// lot별 상세 목록은 전 품목 그대로 두고, 헤더 총계(대수·매입액)만 이 3종으로 좁힌다.
const isInboundTallyProduct = (product: string) =>
  /86["”]?\s*IFP/i.test(product) || /75["”]?\s*IFP/i.test(product) || /\bT1\b/i.test(product)

// 전자칠판 인치 수(예: 110" IFP → 110). 접힘("상세보기") 영역에서 보드끼리 먼저 배치하는 데 쓴다.
function boardInch(product: string): number | null {
  const match = /(\d{2,3})\s*["”]?\s*IFP/i.exec(product)
  return match ? Number(match[1]) : null
}

type PeriodGranularity = "month" | "quarter" | "year"

// 출고 기간 집계 버킷 키/라벨. occurred_at(YYYY-MM-DD) 문자열 기준.
function periodKey(date: string, granularity: PeriodGranularity): { key: string; label: string } {
  const year = date.slice(0, 4)
  const yearNum = Number(year) || 0
  const month = Number(date.slice(5, 7)) || 1
  if (granularity === "year") return { key: year, label: `${year}년` }
  if (granularity === "quarter") {
    // 회계연도(4월 시작~3월 종료) 기준 분기 — lib/branch/fiscal SSOT.
    // 4~6월=1분기, 7~9월=2분기, 10~12월=3분기, 1~3월=4분기(직전 4월 시작 회계연도에 귀속).
    const quarter = fiscalQuarter(month)
    const fyStartYear = month >= 4 ? yearNum : yearNum - 1
    const fyLabel = `${String(fyStartYear % 100).padStart(2, "0")}-${String((fyStartYear + 1) % 100).padStart(2, "0")}`
    return { key: `${fyStartYear}Q${quarter}`, label: `${fyLabel} 회계연도 ${quarter}분기` }
  }
  return { key: date.slice(0, 7), label: `${year}년 ${month}월` }
}

// 제품 칩용 단축명 (기간 집계 칩에서 길이 절약).
function shortProductName(name: string): string {
  return name
    .replace(/\s*전자칠판/g, "")
    .replace(/\s*추적 카메라/g, "")
    .replace(/\s*광각 카메라/g, "")
    .replace(/\s*이동형 스탠드/g, " 스탠드")
    .replace(/\s*윈도우 모듈/g, "")
    .trim()
}

// 출고 도착지를 고객 라벨로 환원한다. 일반 위치(고객/창고/샘플/사무실/수리)는 "고객(미지정)"으로 묶는다.
const GENERIC_LOCATIONS = new Set<string>(["고객", "창고", "샘플", "사무실", "수리", "외부/고객"])

function customerLabel(value: string | null | undefined): string {
  const text = (value ?? "").trim()
  if (!text || GENERIC_LOCATIONS.has(text)) return "고객(미지정)"
  return text
}

// movement에 연결된 CRM 참조를 best-effort로 추출 (reference_no의 deal:/xiaoshouyi: 또는 memo의 "CRM 연동:" 라인).
function extractCrmLink(movement: HardwareMovement): { label: string; reference: string | null } | null {
  const ref = (movement.reference_no ?? "").trim()
  if (/^deal:/i.test(ref) || /^xiaoshouyi:/i.test(ref)) {
    return { label: /^deal:/i.test(ref) ? "포털 딜" : "외부 CRM", reference: ref }
  }
  const memoLine = (movement.memo ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^CRM 연동:/.test(line))
  if (memoLine) {
    return { label: memoLine.replace(/^CRM 연동:\s*/, "") || "CRM 연동", reference: ref || null }
  }
  return null
}

// 출고 판매유형 — 시트 "유형"(Sales/Sample/Promotion/A/S)에서 파생. import는 memo를
// `{유형} · {remarks}` 형태로 남기므로 앞 토큰을 읽는다. 매출 집계는 판매(sales)만 잡는다.
type OutboundSaleType = "sales" | "sample" | "promotion" | "as"

const SALE_TYPE_META: Record<OutboundSaleType, { label: string; tone: string }> = {
  sales: { label: "판매", tone: "bg-[#ECFDF5] text-[#084734]" },
  sample: { label: "샘플", tone: "bg-[#F6F5F4] text-[#615D59]" },
  promotion: { label: "프로모션", tone: "bg-[#FBF1E0] text-[#7A520F]" },
  as: { label: "A/S", tone: "bg-[#FCE9E9] text-[#B43E3E]" },
}

function outboundSaleType(movement: HardwareMovement): OutboundSaleType | null {
  if (movement.movement_type !== "outbound") return null
  const token = (movement.memo ?? "").split("·")[0].trim().toLowerCase()
  if (token === "a/s" || token === "as") return "as"
  if (token === "promotion") return "promotion"
  if (token === "sample" || movement.to_location === "샘플") return "sample"
  return "sales"
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

// 빠른 기록 반복 입력 기억 — 담당자·"저장 후 시트 유지" 토글을 세션을 넘어 기억한다.
// SSR 프리렌더 중에는 window가 없으므로 항상 가드하고, storage 접근 불가 환경에선 조용히 비활성화한다.
const QUICK_RECORD_OWNER_KEY = "hw.quickRecord.owner"
const QUICK_RECORD_STAY_OPEN_KEY = "hw.quickRecord.stayOpen"

// 시트 공용 클래스 토큰 — 15회 이상 반복되던 인풋/라벨 클래스의 드리프트 방지.
// 타이포 위계: 섹션 제목(13px bold #111110) > 필드 라벨(12px semibold #615D59) > 보조(11px #A39E98).
const SHEET_INPUT_CLASS =
  "mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
const SHEET_LABEL_CLASS = "text-[12px] font-semibold text-[#615D59]"
const SHEET_SECTION_TITLE_CLASS = "text-[13px] font-bold text-[#111110]"

function readLocalString(key: string): string {
  if (typeof window === "undefined") return ""
  try {
    return window.localStorage.getItem(key) ?? ""
  } catch {
    return ""
  }
}

function writeLocalString(key: string, value: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 프라이빗 모드 등 storage 불가 — 기억 기능만 포기.
  }
}

function formatDate(value: string | null) {
  if (!value) return "-"
  return value.slice(0, 10)
}

// 기간 버킷 안에서 고객사 출고일을 짧게 표기. YYYY-MM-DD → "M.D" (연도는 버킷 헤더가 이미 표시).
function formatShortDate(date: string): string {
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  if (!month || !day) return "-"
  return `${month}.${day}`
}

// 단일일이면 "M.D", 여러 날에 걸치면 "M.D~M.D".
function formatDateSpan(first: string | null, last: string | null): string {
  if (!first && !last) return "-"
  if (!first) return formatShortDate(last!)
  if (!last || first === last) return formatShortDate(first)
  return `${formatShortDate(first)}~${formatShortDate(last)}`
}

function movementLot(movement: HardwareMovement): string | null {
  if (movement.lot_no && movement.lot_no.trim()) return movement.lot_no.trim()
  if (movement.source === "sheet_import" && movement.reference_no && movement.reference_no.trim()) {
    return movement.reference_no.trim()
  }
  return null
}

// 배송 예정(예약) 출고 판별 — 서버 집계 isPlannedStatus와 같은 규약(예정/예약/대기/planned).
// 상세 로그에서 실제 출고와 시각적으로 구분하기 위한 표시 전용 헬퍼.
function isPlannedMovement(movement: HardwareMovement): boolean {
  return movement.movement_type === "outbound" && /예정|예약|대기|planned/i.test(movement.status ?? "")
}

// "FY24-25"는 H1~H8 물량번호 체계가 생기기 전 시트의 placeholder 값이다.
// 그룹핑·검색은 원본 값을 그대로 쓰고, 배지 표시만 H-넘버링과 나란히 보이도록 "H0"으로 맞춘다.
function formatLotLabel(lot: string | null | undefined): string | null {
  if (!lot) return null
  const trimmed = lot.trim()
  if (!trimmed) return null
  if (/^FY24-25$/i.test(trimmed)) return "H0"
  return trimmed
}

function lotFifoRank(lot: string): number | null {
  const label = formatLotLabel(lot) ?? lot
  if (/^H0$/i.test(label)) return 0
  const match = /^H(\d+)/i.exec(label)
  return match ? Number(match[1]) : null
}

function sortLotBalancesFifo(lots: HardwareStockRow["lotBalances"]) {
  return lots.slice().sort((a, b) => {
    const aRank = lotFifoRank(a.lot)
    const bRank = lotFifoRank(b.lot)
    if (aRank != null && bRank != null && aRank !== bRank) return aRank - bRank
    if (aRank != null && bRank == null) return -1
    if (aRank == null && bRank != null) return 1
    return (formatLotLabel(a.lot) ?? a.lot).localeCompare(formatLotLabel(b.lot) ?? b.lot, "ko")
  })
}

function previewFifoLots(lots: HardwareStockRow["lotBalances"], quantity: number) {
  let remaining = Math.max(0, Math.floor(quantity))
  const plan: Array<{ lot: string; quantity: number }> = []
  for (const lot of sortLotBalancesFifo(lots)) {
    if (remaining <= 0) break
    const next = Math.min(remaining, lot.quantity)
    if (next > 0) plan.push({ lot: lot.lot, quantity: next })
    remaining -= next
  }
  return { plan, shortage: remaining }
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value)
}

const CURRENCY_FORMAT: Record<"KRW" | "USD" | "CNY", { locale: string; symbol: string; fractionDigits: number }> = {
  KRW: { locale: "ko-KR", symbol: "₩", fractionDigits: 0 },
  USD: { locale: "en-US", symbol: "$", fractionDigits: 2 },
  CNY: { locale: "zh-CN", symbol: "¥", fractionDigits: 2 },
}

function formatCurrency(value: number | null, currency: "KRW" | "USD" | "CNY" = "KRW") {
  if (value == null) return "-"
  const { locale, symbol, fractionDigits } = CURRENCY_FORMAT[currency]
  const amount = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
  // KRW keeps the original trailing-원 form; USD/CNY use a leading symbol.
  return currency === "KRW" ? `${amount}원` : `${symbol}${amount}`
}

function formatAvg(value: number) {
  if (value === 0) return "0"
  if (value < 1) return value.toFixed(1)
  return String(Math.round(value * 10) / 10)
}

function statusCopy(row: HardwareStockRow) {
  if (row.low) return "부족"
  if (row.orderRecommended) return "주문 검토"
  return "정상"
}

function statusClass(row: HardwareStockRow) {
  if (row.low) return "bg-[#FCE9E9] text-[#B43E3E]"
  if (row.orderRecommended) return "bg-[#FBF1E0] text-[#A8741A]"
  return "bg-[#ECFDF5] text-[#084734]"
}

function isCoreIfpProduct(product: string, size: "75" | "86") {
  return new RegExp(`^${size}["”]?\\s*IFP`, "i").test(product)
}

// 상세내역 "제품" 필터 — 실데이터에 액세서리(OPS/POE/케이블/터치펜 등)까지 섞여 칩이 20개 가까이
// 늘어났다. 자주 찾는 핵심 라인업만 고정 5종으로 좁히고, 나머지는 검색으로 찾도록 한다.
// (110"/65"/S1/액세서리 등은 후순위 — 칩에서 제외.)
type ProductFilterKey = "" | "ifp86" | "ifp75" | "t1" | "std1" | "promotion"

const PRODUCT_FILTER_OPTIONS: Array<{ key: Exclude<ProductFilterKey, "">; label: string; test: (product: string) => boolean }> = [
  { key: "ifp86", label: '86" IFP', test: (product) => isCoreIfpProduct(product, "86") },
  { key: "ifp75", label: '75" IFP', test: (product) => isCoreIfpProduct(product, "75") },
  { key: "t1", label: "T1", test: (product) => /^T1$/i.test(product.trim()) },
  { key: "std1", label: "STD1", test: (product) => /^STD1$/i.test(product.trim()) },
  { key: "promotion", label: "프로모션", test: (product) => /\(promoted\)/i.test(product) },
]

function matchesProductFilter(product: string, filter: ProductFilterKey): boolean {
  if (!filter) return true
  return PRODUCT_FILTER_OPTIONS.find((option) => option.key === filter)?.test(product) ?? false
}

// "제품 빠른 선택" 칩 추천 순위.
// 상단 추천(아래 순서대로) → 기타(110"/DT1/S1) → 그 외 제품은 칩에서 숨김(품목 드롭다운으로 선택 가능).
// (promoted) 변형도 같은 SKU로 묶이도록 정규식으로 매칭한다.
const QUICK_PICK_FEATURED: RegExp[] = [/86["”]?\s*IFP/i, /75["”]?\s*IFP/i, /\bSTD1\b/i, /\bT1\b/i]
const QUICK_PICK_ETC: RegExp[] = [/110["”]?\s*IFP/i, /\bDT1\b/i, /\bS1\b/i]

function quickPickRank(product: string): { group: "featured" | "etc"; rank: number } | null {
  const featured = QUICK_PICK_FEATURED.findIndex((re) => re.test(product))
  if (featured !== -1) return { group: "featured", rank: featured }
  const etc = QUICK_PICK_ETC.findIndex((re) => re.test(product))
  if (etc !== -1) return { group: "etc", rank: etc }
  return null
}

const HARDWARE_KIT_PRESETS: HardwareKitPreset[] = [
  {
    key: "classroom-86",
    label: '86" 교실 세트',
    description: '86" IFP + T1 + STD1',
    icon: Monitor,
    lines: [
      { label: '86" IFP', quantity: 1, match: (row) => isCoreIfpProduct(row.product, "86") },
      { label: "T1", quantity: 1, match: (row) => /^T1$/i.test(row.product.trim()) },
      { label: "STD1", quantity: 1, match: (row) => /^STD1$/i.test(row.product.trim()) },
    ],
  },
  {
    key: "classroom-75",
    label: '75" 교실 세트',
    description: '75" IFP + T1 + STD1',
    icon: Monitor,
    lines: [
      { label: '75" IFP', quantity: 1, match: (row) => isCoreIfpProduct(row.product, "75") },
      { label: "T1", quantity: 1, match: (row) => /^T1$/i.test(row.product.trim()) },
      { label: "STD1", quantity: 1, match: (row) => /^STD1$/i.test(row.product.trim()) },
    ],
  },
  {
    key: "camera",
    label: "카메라 추가",
    description: "S1/카메라 1대",
    icon: Camera,
    lines: [
      { label: "카메라", quantity: 1, match: (row) => /\bS1\b|camera|카메라/i.test(row.product) },
    ],
  },
  {
    key: "stand",
    label: "스탠드 추가",
    description: "STD1 1대",
    icon: Projector,
    lines: [
      { label: "STD1", quantity: 1, match: (row) => /^STD1$/i.test(row.product.trim()) },
    ],
  },
]

function normalizeHardwareText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]+/gu, "")
}

function quickCartLineKey(draft: HardwareMovementDraft) {
  return [
    draft.itemId ?? normalizeHardwareText(draft.productName),
    draft.movementType,
    draft.occurredAt,
    draft.fromLocation,
    draft.toLocation,
    draft.owner,
    draft.status,
    draft.referenceNo,
    draft.memo,
    draft.lotNo,
    draft.unitPrice ?? "",
    draft.amountUsd ?? "",
    draft.amountCny ?? "",
    draft.storageLocation,
    draft.importer,
    draft.serials.join("\u0001"),
  ].join("\u0000")
}

function mergeQuickCartDrafts(current: HardwareMovementDraft[], incoming: HardwareMovementDraft[]) {
  const next = [...current]
  for (const draft of incoming) {
    const key = quickCartLineKey(draft)
    const existingIndex = next.findIndex((item) => quickCartLineKey(item) === key)
    if (existingIndex === -1) {
      next.push(draft)
    } else {
      next[existingIndex] = {
        ...next[existingIndex],
        quantity: next[existingIndex].quantity + draft.quantity,
        amountUsd:
          next[existingIndex].amountUsd != null || draft.amountUsd != null
            ? (next[existingIndex].amountUsd ?? 0) + (draft.amountUsd ?? 0)
            : null,
        amountCny:
          next[existingIndex].amountCny != null || draft.amountCny != null
            ? (next[existingIndex].amountCny ?? 0) + (draft.amountCny ?? 0)
            : null,
        serials: [...next[existingIndex].serials, ...draft.serials],
      }
    }
  }
  return next
}

function parseHardwareLineText(line: string) {
  const cleaned = line.replace(/[•·]/g, " ").replace(/\s+/g, " ").trim()
  if (!cleaned) return null
  const quantityMatch =
    cleaned.match(/(?:^|\s)(?:x|\*)\s*(\d+)\s*$/i) ??
    cleaned.match(/(?:^|\s)(\d+)\s*(?:대|ea|EA|개)\s*$/) ??
    cleaned.match(/[,\t]\s*(\d+)\s*$/)
  const quantity = quantityMatch ? Math.max(1, Number(quantityMatch[1])) : 1
  const productText = (quantityMatch ? cleaned.slice(0, quantityMatch.index).trim() : cleaned)
    .replace(/[-–—:|]+$/g, "")
    .trim()
  return productText ? { productText, quantity } : null
}

function confidenceCopy(value: HardwareCrmOrderCandidate["confidence"]) {
  if (value === "high") return "높음"
  if (value === "medium") return "보통"
  return "검토"
}

function confidenceClass(value: HardwareCrmOrderCandidate["confidence"]) {
  if (value === "high") return "bg-[#ECFDF5] text-[#084734]"
  if (value === "medium") return "bg-[#FBF1E0] text-[#A8741A]"
  return "bg-[#F6F5F4] text-[#615D59]"
}

function SectionHeader({
  title,
  description,
  open,
  onToggle,
  actions,
  meta,
}: {
  title: string
  description?: string
  open: boolean
  onToggle: () => void
  actions?: ReactNode
  meta?: ReactNode
}) {
  const ToggleIcon = open ? ChevronDown : ChevronRight

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#F6F5F4] text-[#615D59] transition group-hover:bg-[#ECFDF5] group-hover:text-[#084734]">
          <ToggleIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-bold tracking-[-0.01em] text-[#111110]">{title}</span>
          {description ? <span className="mt-1 block text-[12px] text-[#615D59]">{description}</span> : null}
        </span>
      </button>
      {actions || meta ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {meta}
          {actions}
        </div>
      ) : null}
    </div>
  )
}

function PaginationControls<T>({
  pagination,
  label,
  onPageChange,
}: {
  pagination: AdminListPaginationResult<T>
  label: string
  onPageChange: (page: number) => void
}) {
  if (pagination.totalItems === 0) return null

  const pageText = pagination.totalPages > 0 ? `${pagination.currentPage} / ${pagination.totalPages}` : "0 / 0"

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(0,0,0,0.08)] px-5 py-3">
      <p className="text-[11px] font-semibold text-[#615D59]">
        {formatNumber(pagination.startDisplayNumber)}-{formatNumber(pagination.endDisplayNumber)} / {formatNumber(pagination.totalItems)} {label}
      </p>
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(pagination.currentPage - 1)}
          disabled={pagination.currentPage <= 1}
          aria-label="이전 페이지"
          title="이전 페이지"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] cursor-pointer bg-white text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[52px] text-center text-[12px] font-bold text-[#31302E]">{pageText}</span>
        <button
          type="button"
          onClick={() => onPageChange(pagination.currentPage + 1)}
          disabled={pagination.currentPage >= pagination.totalPages}
          aria-label="다음 페이지"
          title="다음 페이지"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] cursor-pointer bg-white text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// 재고행·위치맵·검색결과 3곳에서 같은 문법으로 쓰는 퀵액션 버튼.
// DESIGN.md 규칙: 약한 행 액션은 중립 배경, 의도색(빨강/주황/그린)은 hover에서만.
const QUICK_MOVE_META: Record<"sale" | "planned" | "inbound", { label: string; hover: string }> = {
  sale: { label: "출고", hover: "hover:bg-[#FCE9E9] hover:text-[#B43E3E]" },
  planned: { label: "예정", hover: "hover:bg-[#FBF1E0] hover:text-[#A8741A]" },
  inbound: { label: "입고", hover: "hover:bg-[#ECFDF5] hover:text-[#084734]" },
}

function QuickMoveButton({
  kind,
  product,
  bare = false,
  onClick,
}: {
  kind: keyof typeof QUICK_MOVE_META
  product: string
  /** true면 배경 없이 렌더 — 세그먼트 컨테이너(재고 표) 안에서 사용 */
  bare?: boolean
  onClick: () => void
}) {
  const meta = QUICK_MOVE_META[kind]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${product} ${meta.label} 기록`}
      className={`cursor-pointer rounded-md px-2.5 py-1.5 text-[11px] font-bold text-[#31302E] transition ${
        bare ? "" : "bg-[#F6F5F4]"
      } ${meta.hover} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100`}
    >
      {meta.label}
    </button>
  )
}

export default function HardwareInventoryClient() {
  const formRef = useRef<HTMLFormElement | null>(null)
  const [data, setData] = useState<HardwareDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingMovement, setPendingMovement] = useState<HardwareMovementDraft | null>(null)
  const [quickCart, setQuickCart] = useState<HardwareMovementDraft[]>([])
  const [quickCartLineErrors, setQuickCartLineErrors] = useState<Record<string, string>>({})
  const [quickCartSaveSummary, setQuickCartSaveSummary] = useState<QuickCartSaveSummary | null>(null)
  const [quotePasteText, setQuotePasteText] = useState("")
  const [crmCandidates, setCrmCandidates] = useState<HardwareCrmOrderCandidate[]>([])
  const [crmWarnings, setCrmWarnings] = useState<string[]>([])
  const [crmError, setCrmError] = useState<string | null>(null)
  const [crmLoading, setCrmLoading] = useState(false)
  const [selectedCrmCandidateId, setSelectedCrmCandidateId] = useState<string | null>(null)
  const [crmAutoReflect, setCrmAutoReflect] = useState(true)

  const [activePresetKey, setActivePresetKey] = useState("sale")
  const [movementType, setMovementType] = useState<HardwareMovementType>("outbound")
  const [selectedItemId, setSelectedItemId] = useState("")
  const [customProduct, setCustomProduct] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [occurredAt, setOccurredAt] = useState(todayKey)
  const [fromLocation, setFromLocation] = useState("창고")
  const [toLocation, setToLocation] = useState("")
  const [owner, setOwner] = useState("")
  const [status, setStatus] = useState("출고")
  const [referenceNo, setReferenceNo] = useState("")
  const [memo, setMemo] = useState("")
  const [lotNo, setLotNo] = useState("")
  const [unitPrice, setUnitPrice] = useState("")
  const [amountUsd, setAmountUsd] = useState("")
  const [amountCny, setAmountCny] = useState("")
  const [storageLocation, setStorageLocation] = useState("")
  const [importer, setImporter] = useState("")
  const [serialsText, setSerialsText] = useState("")
  // 연속 기록: 저장 후 시트를 닫지 않고 다음 건을 바로 입력. 선택은 localStorage에 기억.
  const [stayOpenAfterSave, setStayOpenAfterSave] = useState(false)
  // "목록에 없는 품목 직접 입력" 펼침 — <details open>은 React 리렌더마다 되감겨서 state로 관리.
  const [showCustomInput, setShowCustomInput] = useState(false)
  // 키트(세트) 배수 — 단품 수량 스테퍼와 분리된 독립 값.
  const [kitMultiplier, setKitMultiplier] = useState(1)
  const [openSections, setOpenSections] = useState<Record<HardwareSectionKey, boolean>>(() => ({ ...DEFAULT_OPEN_SECTIONS }))
  const [stockPage, setStockPage] = useState(1)
  const [outboundPage, setOutboundPage] = useState(1)
  const [alertsPage, setAlertsPage] = useState(1)
  const [movementsPage, setMovementsPage] = useState(1)
  const [expandedLogGroups, setExpandedLogGroups] = useState<Set<string>>(() => new Set())
  const [plannedPage, setPlannedPage] = useState(1)
  const [activeTab, setActiveTab] = useState<HardwareTab>("home")
  const [productFilter, setProductFilter] = useState<ProductFilterKey>("")
  const [historyType, setHistoryType] = useState<HardwareMovementType | "all" | "sample">("all")
  const [historySort, setHistorySort] = useState<"desc" | "asc">("desc")
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [confirmingGroupKey, setConfirmingGroupKey] = useState<string | null>(null)
  const [plannedConfirmResults, setPlannedConfirmResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [confirmDates, setConfirmDates] = useState<Record<string, string>>({})
  const [voidingId, setVoidingId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  // 시트 모드 — "single": 빠른 단건 기록, "batch": 작업건(다품목) 구성. 단건과 대량이
  // 한 폼에 섞여 있던 15섹션 구조를 업무 단위로 가른다. 수정(editingId)은 항상 single.
  const [sheetMode, setSheetMode] = useState<"single" | "batch">("single")
  const [voidTarget, setVoidTarget] = useState<HardwareMovement | null>(null)
  const [voidReason, setVoidReason] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmQtys, setConfirmQtys] = useState<Record<string, string>>({})
  const [entrySub, setEntrySub] = useState<"inbound" | "outbound">("inbound")
  const [outPeriod, setOutPeriod] = useState<PeriodGranularity>("month")
  const [openPeriods, setOpenPeriods] = useState<Record<string, boolean>>({})
  const [inboundSearch, setInboundSearch] = useState("")
  const [hardwareSearch, setHardwareSearch] = useState("")
  const [search, setSearch] = useState("")
  const [customerFilter, setCustomerFilter] = useState("")
  const [lotFilter, setLotFilter] = useState("")
  const [detailId, setDetailId] = useState<string | null>(null)
  const [customerDetail, setCustomerDetail] = useState<string | null>(null)
  const [locationMapExpanded, setLocationMapExpanded] = useState(false)
  const sheetPanelRef = useRef<HTMLElement>(null)
  const detailPanelRef = useRef<HTMLElement>(null)
  const ledgerFileRef = useRef<HTMLInputElement>(null)
  const reduceMotion = useReducedMotion()
  const plannedConfirmLocked = busy != null || confirmingId != null || confirmingGroupKey != null
  const quickCartSaving = busy === "movement"

  const requestCloseSheet = useCallback(() => {
    if (busy === "movement") return
    if (
      !editingId &&
      quickCart.length > 0 &&
      !window.confirm(`저장하지 않은 기록 바구니 ${quickCart.length}건이 있습니다. 닫아도 바구니는 유지됩니다. 닫을까요?`)
    )
      return
    setSheetOpen(false)
  }, [busy, editingId, quickCart.length])

  useEffect(() => {
    if (!sheetOpen && pendingMovement == null && voidTarget == null && detailId == null && customerDetail == null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (pendingMovement) {
        if (busy !== "movement") setPendingMovement(null)
      } else if (voidTarget) {
        if (voidingId == null) setVoidTarget(null)
      } else if (customerDetail) {
        setCustomerDetail(null)
      } else if (detailId) {
        setDetailId(null)
      } else if (sheetOpen) {
        requestCloseSheet()
      }
    }
    document.addEventListener("keydown", onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [sheetOpen, pendingMovement, voidTarget, detailId, customerDetail, busy, voidingId, requestCloseSheet])

  useEffect(() => {
    if (!sheetOpen) return
    const previousFocus = document.activeElement as HTMLElement | null
    sheetPanelRef.current
      ?.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      ?.focus()
    return () => previousFocus?.focus?.()
  }, [sheetOpen])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await adminFetchJson<HardwareDashboard>("/api/admin/hardware", { cache: "no-cache" })
      setData(next)
      setSelectedItemId((current) => current || next.items[0]?.id || "")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 반복 입력 기억 복원 — 하이드레이션 불일치를 피하려고 마운트 후 1회만 읽는다.
  useEffect(() => {
    const savedOwner = readLocalString(QUICK_RECORD_OWNER_KEY)
    if (savedOwner) setOwner((current) => current || savedOwner)
    if (readLocalString(QUICK_RECORD_STAY_OPEN_KEY) === "1") setStayOpenAfterSave(true)
  }, [])

  // 검증 에러는 폼 상단에 뜬다 — 하단 저장 버튼을 누른 사용자에게 보이도록 시트를 위로 스크롤.
  useEffect(() => {
    if (error && sheetOpen) {
      sheetPanelRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" })
    }
  }, [error, sheetOpen, reduceMotion])

  const selectedItem = useMemo(
    () => data?.items.find((item) => item.id === selectedItemId) ?? null,
    [data?.items, selectedItemId]
  )

  const selectedStockRow = useMemo(() => {
    // 직접 입력 중에는 이름으로만 매칭 — selectedItemId가 남아 있어 FIFO/가용 경고가
    // 엉뚱한 품목 기준으로 뜨던 문제 방지. 미등록 품목이면 null(가용 미확인).
    const custom = customProduct.trim()
    if (custom) return data?.stock.find((row) => row.product === custom) ?? null
    const productName = selectedItem?.name ?? ""
    if (!productName && !selectedItemId) return null
    return data?.stock.find((row) => row.itemId === selectedItemId || row.product === productName) ?? null
  }, [customProduct, data?.stock, selectedItem?.name, selectedItemId])

  const activePreset = useMemo(
    () => ENTRY_PRESETS.find((preset) => preset.key === activePresetKey) ?? ENTRY_PRESETS[0],
    [activePresetKey]
  )

  const fifoPreview = useMemo(() => {
    const qty = Number(quantity)
    if (movementType !== "outbound" || lotNo.trim() || !selectedStockRow || !Number.isFinite(qty) || qty <= 0) {
      return null
    }
    return previewFifoLots(selectedStockRow.lotBalances, qty)
  }, [lotNo, movementType, quantity, selectedStockRow])

  // 가용 초과 상시 경고 — lot 지정 여부와 무관하게 출고 수량이 예상 가용을 넘으면 알린다.
  // (기존에는 FIFO 미리보기의 부족 표시에만 의존해 lot을 직접 지정하면 경고가 사라졌다.)
  const availabilityWarning = useMemo(() => {
    if (movementType !== "outbound") return null
    const qty = Number(quantity)
    if (!selectedStockRow || !Number.isFinite(qty) || qty <= 0) return null
    if (qty <= selectedStockRow.availableStock) return null
    return `예상 가용 ${formatNumber(selectedStockRow.availableStock)}대를 ${formatNumber(qty - selectedStockRow.availableStock)}대 초과합니다. 저장은 가능하지만 재고가 음수가 될 수 있어요.`
  }, [movementType, quantity, selectedStockRow])

  const stockPagination = useMemo(
    () => paginateAdminList(data?.stock ?? [], { currentPage: stockPage, pageSize: STOCK_PAGE_SIZE }),
    [data?.stock, stockPage]
  )

  const outboundPagination = useMemo(
    () => paginateAdminList(data?.recentOutbound ?? [], { currentPage: outboundPage, pageSize: OUTBOUND_PAGE_SIZE }),
    [data?.recentOutbound, outboundPage]
  )

  const filteredMovements = useMemo(() => {
    let rows = data?.movements ?? []
    if (historyType === "sample") {
      // 샘플: 출고 중 판매유형이 샘플(대여/데모)로 분류된 건만.
      rows = rows.filter((movement) => outboundSaleType(movement) === "sample")
    } else if (historyType !== "all") {
      rows = rows.filter((movement) => movement.movement_type === historyType)
    }
    if (productFilter) rows = rows.filter((movement) => matchesProductFilter(movement.product_name, productFilter))
    if (lotFilter) rows = rows.filter((movement) => (movementLot(movement) ?? "") === lotFilter)
    if (customerFilter) rows = rows.filter((movement) => customerLabel(movement.to_location) === customerFilter)
    const query = search.trim().toLowerCase()
    if (query) {
      rows = rows.filter((movement) =>
        [
          movement.product_name,
          movement.to_location,
          movement.reference_no,
          movementLot(movement),
          movement.owner,
          movement.memo,
          movement.status,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      )
    }
    // Sort by the real transaction date only. Rows whose date didn't parse (fuzzy
    // "3월초", malformed source dates) must NOT borrow the import timestamp — otherwise
    // they'd masquerade as the newest rows. Dateless rows always sink to the bottom.
    const sorted = [...rows].sort((a, b) => {
      const aTime = a.occurred_at ? new Date(a.occurred_at).getTime() : null
      const bTime = b.occurred_at ? new Date(b.occurred_at).getTime() : null
      if (aTime == null && bTime == null) return 0
      if (aTime == null) return 1
      if (bTime == null) return -1
      return historySort === "asc" ? aTime - bTime : bTime - aTime
    })
    return sorted
  }, [data?.movements, historyType, productFilter, lotFilter, customerFilter, search, historySort])

  const hasHistoryFilter = historyType !== "all" || productFilter !== "" || lotFilter !== "" || customerFilter !== "" || search.trim() !== ""

  const plannedMovementQuantity = useMemo(
    () => (data?.plannedMovements ?? []).reduce((total, movement) => total + movement.quantity, 0),
    [data?.plannedMovements]
  )

  // 예상 출고를 고객사 딜(고객사+담당자+예정일+물량번호) 단위로 묶어 위계를 만든다:
  // 고객사(딜) → 하위 품목들. 확정/수정은 품목별로 유지.
  const plannedGroups = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; customer: string; owner: string | null; date: string | null; lot: string | null; totalQty: number; items: HardwareMovement[] }
    >()
    for (const movement of data?.plannedMovements ?? []) {
      const customer = movement.to_location ?? "도착지 미정"
      const lot = movementLot(movement)
      const key = `${customer}|${movement.owner ?? ""}|${movement.occurred_at ?? ""}|${lot ?? ""}`
      let group = groups.get(key)
      if (!group) {
        group = { key, customer, owner: movement.owner, date: movement.occurred_at, lot, totalQty: 0, items: [] }
        groups.set(key, group)
      }
      group.totalQty += movement.quantity
      group.items.push(movement)
    }
    return Array.from(groups.values()).sort((a, b) => {
      const at = a.date ? new Date(a.date).getTime() : Number.NEGATIVE_INFINITY
      const bt = b.date ? new Date(b.date).getTime() : Number.NEGATIVE_INFINITY
      if (at !== bt) return bt - at
      return a.customer.localeCompare(b.customer, "ko")
    })
  }, [data?.plannedMovements])

  const plannedPagination = useMemo(
    () => paginateAdminList(plannedGroups, { currentPage: plannedPage, pageSize: PLANNED_PAGE_SIZE }),
    [plannedGroups, plannedPage]
  )

  const hardwareSearchResults = useMemo(() => {
    const rawQuery = hardwareSearch.trim()
    if (!rawQuery) return null

    const normalized = normalizeHardwareText(rawQuery)
    const today = todayKey()
    const lowIntent = /부족|주문|low/i.test(rawQuery)
    const todayIntent = /오늘|today/i.test(rawQuery)
    const oldLotIntent = /오래|FIFO|선입|first/i.test(rawQuery)
    const myIntent = /내 담당|담당/i.test(rawQuery)

    const matchesText = (...values: Array<string | null | undefined>) =>
      values.some((value) => value && normalizeHardwareText(value).includes(normalized))

    const products = (data?.stock ?? [])
      .filter((row) => {
        if (lowIntent) return row.low || row.orderRecommended || row.availableStock < 0
        if (!normalized) return false
        return matchesText(row.product, row.category, ...((data?.items.find((item) => item.id === row.itemId)?.source_aliases) ?? []))
      })
      .sort((a, b) => Number(b.low) - Number(a.low) || a.availableStock - b.availableStock)
      .slice(0, 6)

    const lotMap = new Map<string, { lot: string; total: number; products: string[]; rank: number | null }>()
    for (const row of data?.stock ?? []) {
      for (const lot of row.lotBalances) {
        const entry = lotMap.get(lot.lot) ?? { lot: lot.lot, total: 0, products: [], rank: lotFifoRank(lot.lot) }
        entry.total += lot.quantity
        if (!entry.products.includes(row.product)) entry.products.push(row.product)
        lotMap.set(lot.lot, entry)
      }
    }
    const lots = Array.from(lotMap.values())
      .filter((lot) => {
        if (oldLotIntent) return lot.rank != null
        if (!normalized) return false
        return matchesText(lot.lot, formatLotLabel(lot.lot), ...lot.products)
      })
      .sort((a, b) => {
        if (oldLotIntent) {
          if (a.rank != null && b.rank != null && a.rank !== b.rank) return a.rank - b.rank
          if (a.rank != null && b.rank == null) return -1
          if (a.rank == null && b.rank != null) return 1
        }
        return b.total - a.total
      })
      .slice(0, 5)

    const planned = (data?.plannedMovements ?? [])
      .filter((movement) => {
        if (todayIntent) return movement.occurred_at?.slice(0, 10) === today
        if (myIntent) return Boolean(movement.owner)
        if (!normalized) return false
        return matchesText(movement.product_name, movement.to_location, movement.owner, movement.reference_no, movement.status, movementLot(movement))
      })
      .sort((a, b) => new Date(a.occurred_at ?? a.created_at).getTime() - new Date(b.occurred_at ?? b.created_at).getTime())
      .slice(0, 6)

    const customerAgg = new Map<string, { customer: string; planned: number; outbound: number; lastDate: string | null }>()
    for (const movement of data?.movements ?? []) {
      if (movement.movement_type !== "outbound" || movement.voided_at) continue
      const customer = customerLabel(movement.to_location)
      if (!normalized && !todayIntent) continue
      if (normalized && !matchesText(customer, movement.product_name, movement.owner, movement.reference_no)) continue
      if (todayIntent && movement.occurred_at?.slice(0, 10) !== today) continue
      const entry = customerAgg.get(customer) ?? { customer, planned: 0, outbound: 0, lastDate: null }
      if (isPlannedMovement(movement)) entry.planned += movement.quantity
      else entry.outbound += movement.quantity
      const date = movement.occurred_at?.slice(0, 10) ?? movement.created_at.slice(0, 10)
      if (!entry.lastDate || date > entry.lastDate) entry.lastDate = date
      customerAgg.set(customer, entry)
    }

    return {
      products,
      lots,
      planned,
      customers: Array.from(customerAgg.values())
        .sort((a, b) => (b.planned + b.outbound) - (a.planned + a.outbound))
        .slice(0, 5),
    }
  }, [data?.items, data?.movements, data?.plannedMovements, data?.stock, hardwareSearch])

  const lotOptions = useMemo(() => {
    const lots = new Set<string>()
    for (const row of data?.stock ?? []) {
      for (const lot of row.lotBalances) lots.add(lot.lot)
    }
    for (const movement of data?.movements ?? []) {
      const lot = movementLot(movement)
      if (lot) lots.add(lot)
    }
    for (const movement of data?.plannedMovements ?? []) {
      const lot = movementLot(movement)
      if (lot) lots.add(lot)
    }
    return Array.from(lots).sort()
  }, [data?.movements, data?.plannedMovements, data?.stock])

  const nextLotSuggestion = useMemo(() => {
    const maxH = lotOptions.reduce((max, lot) => {
      const rank = lotFifoRank(lot)
      return rank != null ? Math.max(max, rank) : max
    }, 0)
    return `H${maxH + 1}`
  }, [lotOptions])

  const alertsPagination = useMemo(
    () => paginateAdminList(data?.alerts ?? [], { currentPage: alertsPage, pageSize: ALERT_PAGE_SIZE }),
    [data?.alerts, alertsPage]
  )

  // 상세 내역 로그를 "고객사 + 날짜(=배송/거래 건)" 단위로 묶어 아코디언으로 편다.
  // filteredMovements가 이미 날짜순 정렬이라 Map 삽입 순서가 그대로 그룹 정렬이 된다.
  const logGroups = useMemo(() => {
    type LogGroup = {
      key: string
      customer: string
      date: string | null
      owners: string[]
      products: string[]
      movements: HardwareMovement[]
      totalQty: number
      plannedQty: number
      types: Set<HardwareMovementType>
      lots: Set<string>
      hasMissingLot: boolean
      anyVoided: boolean
    }
    const groups = new Map<string, LogGroup>()
    for (const movement of filteredMovements) {
      const customer = movement.to_location
        ? customerLabel(movement.to_location)
        : movement.movement_type === "inbound"
          ? "매입 입고"
          : MOVEMENT_LABEL[movement.movement_type]
      const dateKey = movement.occurred_at ? movement.occurred_at.slice(0, 10) : "미상"
      const key = `${customer}|${dateKey}`
      let group = groups.get(key)
      if (!group) {
        group = {
          key,
          customer,
          date: movement.occurred_at,
          owners: [],
          products: [],
          movements: [],
          totalQty: 0,
          plannedQty: 0,
          types: new Set(),
          lots: new Set(),
          hasMissingLot: false,
          anyVoided: false,
        }
        groups.set(key, group)
      }
      group.movements.push(movement)
      group.totalQty += movement.quantity
      if (isPlannedMovement(movement)) group.plannedQty += movement.quantity
      if (movement.owner && !group.owners.includes(movement.owner)) group.owners.push(movement.owner)
      if (movement.product_name && !group.products.includes(movement.product_name)) group.products.push(movement.product_name)
      group.types.add(movement.movement_type)
      const lotLabel = formatLotLabel(movementLot(movement))
      if (lotLabel) group.lots.add(lotLabel)
      else group.hasMissingLot = true
      if (movement.voided_at) group.anyVoided = true
    }
    return Array.from(groups.values())
  }, [filteredMovements])

  const logGroupsPagination = useMemo(
    () => paginateAdminList(logGroups, { currentPage: movementsPage, pageSize: LOG_GROUP_PAGE_SIZE }),
    [logGroups, movementsPage]
  )

  const toggleLogGroup = useCallback((key: string) => {
    setExpandedLogGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // 펼치기/접기 대상은 하위 건이 2개 이상인(=아코디언이 있는) 묶음만. 단일 건은 제외.
  const pageLogGroupKeys = logGroupsPagination.pageItems.filter((group) => group.movements.length > 1).map((group) => group.key)
  const allPageGroupsExpanded =
    pageLogGroupKeys.length > 0 && pageLogGroupKeys.every((key) => expandedLogGroups.has(key))

  const toggleAllPageLogGroups = useCallback(() => {
    setExpandedLogGroups((prev) => {
      const next = new Set(prev)
      const everyExpanded = pageLogGroupKeys.length > 0 && pageLogGroupKeys.every((key) => next.has(key))
      if (everyExpanded) pageLogGroupKeys.forEach((key) => next.delete(key))
      else pageLogGroupKeys.forEach((key) => next.add(key))
      return next
    })
  }, [pageLogGroupKeys])

  // 상세 내역 한 행 렌더. nested=true면 그룹 아코디언 하위 행(들여쓰기·배경 구분).
  const renderMovementRow = (movement: HardwareMovement, nested = false) => {
    const lot = movementLot(movement)
    const lotLabel = formatLotLabel(lot)
    const custTitle = movement.to_location ?? (movement.movement_type === "inbound" ? "매입 입고" : MOVEMENT_LABEL[movement.movement_type])
    const refLabel = formatLotLabel(movement.reference_no)
    const custSub = refLabel && refLabel !== lotLabel ? refLabel : null
    const memoText = movement.memo?.trim() || ""
    const rowSaleType = outboundSaleType(movement)
    const planned = isPlannedMovement(movement)
    // nested(그룹 하위) 행은 왼쪽 들여쓰기·낮은 높이·살짝 작은 폰트로 위계를 구분한다.
    const sz = {
      cust: nested ? "text-[11.5px]" : "text-[12.5px]",
      sub: nested ? "text-[10px]" : "text-[11px]",
      prod: nested ? "text-[11px]" : "text-[12px]",
      qty: nested ? "text-[10.5px]" : "text-[11px]",
      meta: nested ? "text-[11px]" : "text-[11.5px]",
    }
    return (
      <div
        key={movement.id}
        role="button"
        tabIndex={0}
        onClick={() => setDetailId(movement.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            setDetailId(movement.id)
          }
        }}
        className={`grid cursor-pointer grid-cols-[84px_1.5fr_1.2fr_96px_84px_1.4fr_92px_22px] items-center gap-3 border-t border-[rgba(0,0,0,0.06)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 ${
          nested
            ? "border-l-[3px] border-l-[#BCD9CB] bg-[#F3F8F5] py-2 pl-10 pr-5 hover:bg-[#ECF3EF]"
            : "px-5 py-3 hover:bg-[#FAFAF8]"
        } ${movement.voided_at ? "opacity-55" : ""}`}
      >
        <span>
          <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-bold ${lot ? "bg-[#ECFDF5] text-[#084734]" : "border border-dashed border-[rgba(0,0,0,0.12)] bg-[#F6F5F4] text-[#A39E98]"}`}>
            {lotLabel ?? "미지정"}
          </span>
        </span>
        <span className="min-w-0">
          <span title={custTitle} className={`block truncate ${sz.cust} font-bold text-[#111110] ${movement.voided_at ? "line-through" : ""}`}>
            {custTitle}
          </span>
          {custSub ? (
            <span title={custSub} className={`mt-0.5 block truncate ${sz.sub} text-[#615D59]`}>
              {custSub}
            </span>
          ) : null}
        </span>
        <span className="min-w-0">
          <span title={movement.product_name} className={`block truncate ${sz.prod} font-semibold text-[#111110]`}>{movement.product_name}</span>
          <span className={`mt-0.5 block ${sz.qty} tabular-nums text-[#615D59]`}>
            {formatNumber(movement.quantity)}대 ·{" "}
            {planned ? (
              <span className="font-bold text-[#A8741A]">{movement.status ?? "배송 예정"}</span>
            ) : (
              movement.status ?? MOVEMENT_LABEL[movement.movement_type]
            )}
          </span>
        </span>
        <span className={`${sz.meta} text-[#31302E]`}>{formatDate(movement.occurred_at)}</span>
        <span title={movement.owner ?? undefined} className={`truncate ${sz.meta} text-[#31302E]`}>{movement.owner ?? "-"}</span>
        <span title={memoText || undefined} className={`truncate ${sz.meta} text-[#615D59]`}>{memoText || "—"}</span>
        <span className="flex flex-col items-end gap-1">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${MOVEMENT_TONE[movement.movement_type]}`}>
            {MOVEMENT_LABEL[movement.movement_type]} {formatNumber(movement.quantity)}
          </span>
          {planned ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-[#FBF1E0] px-1.5 py-0.5 text-[10px] font-bold text-[#A8741A]">
              <Clock3 className="h-2.5 w-2.5" />
              예정
            </span>
          ) : null}
          {rowSaleType && rowSaleType !== "sales" ? (
            <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold ${SALE_TYPE_META[rowSaleType].tone}`}>
              {SALE_TYPE_META[rowSaleType].label}
            </span>
          ) : null}
        </span>
        <span className="text-[#A39E98]">
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    )
  }

  const categoryCards = useMemo(() => {
    const stockRows = data?.stock ?? []
    const sumBy = (match: (row: HardwareStockRow) => boolean) => {
      const matched = stockRows.filter(match)
      return {
        available: matched.reduce((total, row) => total + row.availableStock, 0),
        warehouse: matched.reduce((total, row) => total + row.warehouseStock, 0),
        planned: matched.reduce((total, row) => total + row.plannedOut, 0),
        count: matched.length,
      }
    }
    const isCamera = (row: HardwareStockRow) =>
      /카메라|camera/i.test(`${row.category ?? ""} ${row.product}`) || /\bT1\b|\bS1\b/i.test(row.product)
    const isStand = (row: HardwareStockRow) =>
      /스탠드|stand/i.test(`${row.category ?? ""} ${row.product}`) || /\bSTD/i.test(row.product)
    return [
      { key: "ifp86", label: "86인치 전자칠판", icon: Monitor, tone: { bg: "#ECFDF5", fg: "#084734" }, ...sumBy((row) => isCoreIfpProduct(row.product, "86")) },
      { key: "ifp75", label: "75인치 전자칠판", icon: Monitor, tone: { bg: "#ECFDF5", fg: "#084734" }, ...sumBy((row) => isCoreIfpProduct(row.product, "75")) },
      { key: "camera", label: "카메라 (T1·S1)", icon: Camera, tone: { bg: "#FBF1E0", fg: "#A8741A" }, ...sumBy(isCamera) },
      { key: "stand", label: "스탠드 (STD1)", icon: Projector, tone: { bg: "#F6F5F4", fg: "#615D59" }, ...sumBy(isStand) },
    ]
  }, [data?.stock])

  const locationMap = useMemo(() => {
    const allRows = data?.stock ?? []
    // 숨김 품목(A1/B1/D2) 제외.
    const visible = allRows.filter((row) => !LOCATION_MAP_HIDDEN_PRODUCTS.has(row.product.trim().toUpperCase()))
    // 기본 노출(펼침) = featuredRank 순(86→75→T1→T1promo→STD1→STD1promo). 나머지(65"/110"/S1/OPS/액세서리)는
    // "상세보기"로 접힘 — 원본 재고 정렬 순서 유지.
    const featured = visible
      .map((row) => ({ row, rank: featuredRank(row.product) }))
      .filter((entry): entry is { row: HardwareStockRow; rank: number } => entry.rank != null)
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => entry.row)
    // 접힘 영역: 보드(65"/110" 등)를 먼저(인치 큰 순), 그 외(액세서리 등)는 원본 순서 유지.
    const rest = visible
      .filter((row) => featuredRank(row.product) == null)
      .map((row, index) => ({ row, index, inch: boardInch(row.product) }))
      .sort((a, b) => {
        const aBoard = a.inch != null ? 0 : 1
        const bBoard = b.inch != null ? 0 : 1
        if (aBoard !== bBoard) return aBoard - bBoard
        if (a.inch != null && b.inch != null && a.inch !== b.inch) return b.inch - a.inch
        return a.index - b.index
      })
      .map((entry) => entry.row)

    // 위치별 총량 = 노출 대상(펼침+접힘 전체) 합산.
    const totals: Record<string, number> = {}
    for (const el of BOARD_ELEMENTS) {
      totals[el.key] = visible.reduce((sum, row) => sum + boardValue(row, el.key), 0)
    }
    const maxTotal = Math.max(1, ...BOARD_ELEMENTS.map((el) => totals[el.key]))
    const locationTotals = BOARD_ELEMENTS.map((el) => ({
      name: el.label,
      desc: el.desc,
      quantity: totals[el.key],
      tone: el.tone,
      pct: totals[el.key] > 0 ? `${Math.max(4, Math.round((totals[el.key] / maxTotal) * 100))}%` : "0%",
    }))

    const toRow = (row: HardwareStockRow) => {
      const cells = BOARD_ELEMENTS.map((el) => ({ label: el.label, qty: boardValue(row, el.key), tone: el.tone }))
      const rowMax = Math.max(1, ...cells.map((cell) => cell.qty))
      return {
        itemId: row.itemId,
        product: row.product,
        sampleTotal: locationQuantity(row, "사무실") + locationQuantity(row, "샘플"),
        cells: cells.map((cell) => ({
          ...cell,
          pct: cell.qty > 0 ? `${Math.max(12, Math.round((cell.qty / rowMax) * 100))}%` : "0%",
        })),
      }
    }
    return { locationTotals, featuredRows: featured.map(toRow), restRows: rest.map(toRow) }
  }, [data?.stock])

  const inboundLots = useMemo(() => {
    const inbound = (data?.movements ?? []).filter((movement) => movement.movement_type === "inbound" && !movement.voided_at)
    const groups = new Map<
      string,
      { lot: string; displayLot: string; date: string; importer: string | null; items: HardwareMovement[]; totalQty: number; totalAmount: number; hasAmount: boolean; totalCny: number; hasCny: boolean }
    >()
    for (const movement of inbound) {
      const lot = movementLot(movement) ?? "미지정"
      if (!groups.has(lot)) {
        groups.set(lot, { lot, displayLot: formatLotLabel(lot) ?? lot, date: movement.occurred_at?.slice(0, 10) ?? "-", importer: movement.importer, items: [], totalQty: 0, totalAmount: 0, hasAmount: false, totalCny: 0, hasCny: false })
      }
      const group = groups.get(lot)!
      group.items.push(movement)
      group.totalQty += movement.quantity
      if (movement.amount_usd != null) {
        group.totalAmount += movement.amount_usd
        group.hasAmount = true
      }
      // 본사 책정 CNY(위안) — 기준점 병기용. USD와 별개로 집계한다.
      if (movement.amount_cny != null) {
        group.totalCny += movement.amount_cny
        group.hasCny = true
      }
      if (!group.importer && movement.importer) group.importer = movement.importer
      const date = movement.occurred_at?.slice(0, 10)
      if (date && (group.date === "-" || date < group.date)) group.date = date
    }
    // H물량번호는 최신 lot 먼저(H8→H1), 비-H(과사람 등)는 후순위로 맨 뒤에.
    const lotHNum = (lot: string): number | null => {
      const match = /^H(\d+)$/i.exec(formatLotLabel(lot) ?? lot)
      return match ? Number(match[1]) : null
    }
    const allLots = Array.from(groups.values()).sort((a, b) => {
      const na = lotHNum(a.lot)
      const nb = lotHNum(b.lot)
      if (na != null && nb != null) return nb - na
      if (na != null) return -1
      if (nb != null) return 1
      return (formatLotLabel(a.lot) ?? a.lot).localeCompare(formatLotLabel(b.lot) ?? b.lot, "ko")
    })
    let lots = allLots
    const query = inboundSearch.trim().toLowerCase()
    if (query) {
      lots = lots.filter(
        (group) => group.lot.toLowerCase().includes(query) || group.items.some((item) => item.product_name.toLowerCase().includes(query))
      )
    }
    // 헤더 총계는 86/75/T1만 집계(사용자 지정). lot별 상세 목록(lots)은 전 품목 그대로.
    const tally = inbound.filter((movement) => isInboundTallyProduct(movement.product_name))
    return {
      lots,
      latestLot: allLots[0] ?? null,
      totalQty: tally.reduce((total, movement) => total + movement.quantity, 0),
      totalAmount: tally.reduce((total, movement) => total + (movement.amount_usd ?? 0), 0),
      hasAnyAmount: tally.some((movement) => movement.amount_usd != null),
      totalCny: tally.reduce((total, movement) => total + (movement.amount_cny ?? 0), 0),
      hasAnyCny: tally.some((movement) => movement.amount_cny != null),
    }
  }, [data?.movements, inboundSearch])

  const outboundBuckets = useMemo(() => {
    const sales = (data?.movements ?? []).filter(
      (movement) =>
        movement.movement_type === "outbound" &&
        !movement.voided_at &&
        !/예정|예약|대기/.test(movement.status ?? "") &&
        !/샘플|사무실|수리|sample|repair/i.test(`${movement.to_location ?? ""} ${movement.status ?? ""}`)
    )
    type BucketAgg = {
      key: string
      label: string
      total: number
      revenue: number
      hasRevenue: boolean
      byProduct: Map<string, number>
      byCustomer: Map<string, { qty: number; revenue: number; firstDate: string | null; lastDate: string | null }>
      byType: Map<OutboundSaleType, number>
    }
    const buckets = new Map<string, BucketAgg>()
    for (const movement of sales) {
      const date = movement.occurred_at?.slice(0, 10) ?? movement.created_at.slice(0, 10)
      const { key, label } = periodKey(date, outPeriod)
      if (!buckets.has(key)) buckets.set(key, { key, label, total: 0, revenue: 0, hasRevenue: false, byProduct: new Map(), byCustomer: new Map(), byType: new Map() })
      const bucket = buckets.get(key)!
      const saleType = outboundSaleType(movement) ?? "sales"
      // 매출은 실판매(sales)만 잡는다. 프로모션/A/S는 $0이라 자연히 제외되지만 명시적으로 가드한다.
      const revenue = saleType === "sales" && movement.amount_usd != null ? movement.amount_usd : 0
      bucket.total += movement.quantity
      bucket.revenue += revenue
      if (saleType === "sales" && movement.amount_usd != null) bucket.hasRevenue = true
      bucket.byProduct.set(movement.product_name, (bucket.byProduct.get(movement.product_name) ?? 0) + movement.quantity)
      bucket.byType.set(saleType, (bucket.byType.get(saleType) ?? 0) + movement.quantity)
      const customer = customerLabel(movement.to_location)
      const entry = bucket.byCustomer.get(customer) ?? { qty: 0, revenue: 0, firstDate: null, lastDate: null }
      entry.qty += movement.quantity
      entry.revenue += revenue
      // date는 YYYY-MM-DD 문자열이라 사전식 비교가 곧 시간순 비교.
      if (!entry.firstDate || date < entry.firstDate) entry.firstDate = date
      if (!entry.lastDate || date > entry.lastDate) entry.lastDate = date
      bucket.byCustomer.set(customer, entry)
    }
    const list = Array.from(buckets.values()).sort((a, b) => (a.key < b.key ? 1 : -1))
    const maxTotal = Math.max(1, ...list.map((bucket) => bucket.total))
    return list.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      total: bucket.total,
      revenue: bucket.revenue,
      hasRevenue: bucket.hasRevenue,
      pct: `${Math.max(6, Math.round((bucket.total / maxTotal) * 100))}%`,
      chips: Array.from(bucket.byProduct.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([product, qty]) => ({ product: shortProductName(product), qty })),
      typeChips: (Object.keys(SALE_TYPE_META) as OutboundSaleType[])
        .map((type) => ({ type, label: SALE_TYPE_META[type].label, qty: bucket.byType.get(type) ?? 0 }))
        .filter((entry) => entry.qty > 0),
      customers: Array.from(bucket.byCustomer.entries())
        .sort((a, b) => b[1].revenue - a[1].revenue || b[1].qty - a[1].qty)
        .map(([name, value]) => ({ name, qty: value.qty, revenue: value.revenue, hasRevenue: value.revenue > 0, dateLabel: formatDateSpan(value.firstDate, value.lastDate) })),
    }))
  }, [data?.movements, outPeriod])

  const historyCustomers = useMemo(() => {
    const set = new Set<string>()
    for (const movement of data?.movements ?? []) {
      if (movement.movement_type !== "outbound") continue
      const label = customerLabel(movement.to_location)
      if (label !== "고객(미지정)") set.add(label)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"))
  }, [data?.movements])

  const historyLots = useMemo(() => {
    const set = new Set<string>()
    for (const movement of data?.movements ?? []) {
      const lot = movementLot(movement)
      if (lot) set.add(lot)
    }
    // H물량번호는 최신 lot 먼저(H8→H1) 내림차순, 비-H(과사람 등)는 맨 뒤로 몰아 배치.
    const hNum = (lot: string): number | null => {
      const match = /^H(\d+)$/i.exec(formatLotLabel(lot) ?? lot)
      return match ? Number(match[1]) : null
    }
    return Array.from(set).sort((a, b) => {
      const na = hNum(a)
      const nb = hNum(b)
      if (na != null && nb != null) return nb - na
      if (na != null) return -1
      if (nb != null) return 1
      return (formatLotLabel(a) ?? a).localeCompare(formatLotLabel(b) ?? b, "ko")
    })
  }, [data?.movements])

  const detailMovement = useMemo(
    () => (data?.movements ?? []).find((movement) => movement.id === detailId) ?? null,
    [data?.movements, detailId]
  )

  const customerHistory = useMemo(() => {
    if (!customerDetail) return null
    const rows = (data?.movements ?? [])
      .filter((movement) => !movement.voided_at && customerLabel(movement.to_location) === customerDetail)
      .sort((a, b) => new Date(b.occurred_at ?? b.created_at).getTime() - new Date(a.occurred_at ?? a.created_at).getTime())
    const totalQty = rows.reduce((total, movement) => total + movement.quantity, 0)
    const totalRevenue = rows.reduce(
      (total, movement) => total + (outboundSaleType(movement) === "sales" && movement.amount_usd != null ? movement.amount_usd : 0),
      0
    )
    const hasRevenue = rows.some((movement) => outboundSaleType(movement) === "sales" && movement.amount_usd != null)
    return { name: customerDetail, rows, totalQty, totalRevenue, hasRevenue, count: rows.length }
  }, [data?.movements, customerDetail])

  const detailFacts = detailMovement
    ? [
        { label: "날짜", value: formatDate(detailMovement.occurred_at) },
        { label: "수량", value: `${formatNumber(detailMovement.quantity)}대` },
        { label: "담당자", value: detailMovement.owner ?? "-" },
        { label: "경로", value: `${detailMovement.from_location ?? "-"} → ${detailMovement.to_location ?? "-"}` },
        ...(detailMovement.movement_type === "inbound"
          ? [
              { label: "단가 (USD)", value: detailMovement.unit_price != null ? formatCurrency(detailMovement.unit_price, "USD") : "-" },
              {
                label: "단가 (CNY)",
                value:
                  detailMovement.amount_cny != null && detailMovement.quantity
                    ? formatCurrency(detailMovement.amount_cny / detailMovement.quantity, "CNY")
                    : "-",
              },
              { label: "매입액 (USD)", value: detailMovement.amount_usd != null ? formatCurrency(detailMovement.amount_usd, "USD") : "-" },
              { label: "매입액 (CNY)", value: detailMovement.amount_cny != null ? formatCurrency(detailMovement.amount_cny, "CNY") : "-" },
            ]
          : []),
        ...(detailMovement.movement_type === "outbound"
          ? [
              { label: "판매유형", value: SALE_TYPE_META[outboundSaleType(detailMovement) ?? "sales"].label },
              { label: "매출 (USD)", value: detailMovement.amount_usd != null ? formatCurrency(detailMovement.amount_usd, "USD") : "-" },
            ]
          : []),
      ]
    : []
  const detailCrm = detailMovement ? extractCrmLink(detailMovement) : null
  const detailLotLabel = detailMovement ? formatLotLabel(movementLot(detailMovement)) : null
  const detailCanEdit =
    detailMovement != null &&
    detailMovement.source === "admin_manual" &&
    detailMovement.voided_at == null &&
    !detailMovement.converted_from_movement_id &&
    !detailMovement.converted_to_movement_id

  const quickPickGroups = useMemo(() => {
    const featured: Array<{ row: HardwareStockRow; rank: number }> = []
    const etc: Array<{ row: HardwareStockRow; rank: number }> = []
    for (const row of data?.stock ?? []) {
      const ranked = quickPickRank(row.product)
      if (!ranked) continue
      ;(ranked.group === "featured" ? featured : etc).push({ row, rank: ranked.rank })
    }
    const byRank = (a: { rank: number }, b: { rank: number }) => a.rank - b.rank
    return {
      featured: featured.sort(byRank).map((entry) => entry.row),
      etc: etc.sort(byRank).map((entry) => entry.row),
    }
  }, [data?.stock])

  // 키트 배수는 단품 수량 스테퍼와 독립 — 수량 필드가 세트 배수를 겸하던 오버로드를 해소.
  const cartSetMultiplier = Math.max(1, Math.floor(kitMultiplier) || 1)

  const kitPresetSummaries = useMemo(() => {
    return HARDWARE_KIT_PRESETS.map((preset) => {
      const lines = preset.lines.map((line) => {
        const row = data?.stock.find(line.match) ?? null
        const required = line.quantity * cartSetMultiplier
        return {
          ...line,
          row,
          required,
          shortage: Math.max(0, required - (row?.availableStock ?? 0)),
        }
      })
      return { ...preset, lines, missing: lines.filter((line) => !line.row) }
    })
  }, [cartSetMultiplier, data?.stock])

  const findStockRowByText = (text: string) => {
    const normalized = normalizeHardwareText(text)
    if (!normalized) return null
    return data?.stock.find((row) => {
      if (normalizeHardwareText(row.product) === normalized) return true
      if (normalizeHardwareText(row.product).includes(normalized) || normalized.includes(normalizeHardwareText(row.product))) return true
      const item = data.items.find((candidate) => candidate.id === row.itemId)
      return item?.source_aliases.some((alias) => {
        const normalizedAlias = normalizeHardwareText(alias)
        return normalizedAlias === normalized || normalizedAlias.includes(normalized) || normalized.includes(normalizedAlias)
      })
    }) ?? null
  }

  const buildCartDraft = (input: {
    productName: string
    itemId?: string
    quantity: number
    movementType?: HardwareMovementType
  }): HardwareMovementDraft => {
    const cartMovementType = input.movementType ?? (movementType === "inbound" ? "inbound" : "outbound")
    // 키트처럼 라인 유형이 고정(outbound)인데 활성 프리셋이 다른 유형(입고 등)이면,
    // 폼의 status/위치를 상속하지 않는다 — "상태 '입고'인 출고" 같은 오염 라인 방지.
    // toLocation을 비워 두면 outbound 검증(도착 필수)이 실명 입력을 강제한다.
    const typeMatchesForm = cartMovementType === movementType
    return {
      itemId: input.itemId,
      productName: input.productName,
      movementType: cartMovementType,
      quantity: input.quantity,
      occurredAt,
      fromLocation: cartMovementType === "inbound" ? (typeMatchesForm ? fromLocation : "") : typeMatchesForm ? fromLocation || "창고" : "창고",
      toLocation: cartMovementType === "inbound" ? (typeMatchesForm ? toLocation || "창고" : "창고") : typeMatchesForm ? toLocation : "",
      owner,
      // 활성 프리셋이 정한 상태를 그대로 따른다 — 예전의 강제 "배송 예정" 폴백은
      // 완료 출고를 배치로 담을 수 없게 만들던 원인이라 제거.
      status: cartMovementType === "inbound" ? (typeMatchesForm && status ? status : "입고") : typeMatchesForm && status ? status : "출고",
      // 키트/붙여넣기 라인이 단건 폼의 메모·참조·시리얼·금액을 통째로 상속하면
      // 전 라인 오염(FIFO 비활성, 시리얼 수량 불일치)이 생긴다 — 공유 필드는
      // 처리일·담당자·(입고 한정) lot/보관/수입자만으로 한정한다.
      referenceNo: "",
      memo: "",
      lotNo: cartMovementType === "inbound" ? lotNo.trim() : "",
      unitPrice: null,
      amountUsd: null,
      amountCny: null,
      storageLocation: cartMovementType === "inbound" ? storageLocation.trim() : "",
      importer: cartMovementType === "inbound" ? importer.trim() : "",
      serials: [],
    }
  }

  const pushDraftsToQuickCart = (drafts: HardwareMovementDraft[], sourceLabel: string): boolean => {
    const invalid = drafts.map(validateMovementDraft).find(Boolean)
    if (invalid) {
      setError(invalid)
      return false
    }
    setQuickCart((current) => mergeQuickCartDrafts(current, drafts))
    setQuickCartLineErrors({})
    setQuickCartSaveSummary(null)
    setError(null)
    setNotice(`${sourceLabel} ${formatNumber(drafts.length)}개 품목을 기록 바구니에 담았습니다.`)
    return true
  }

  const addKitPresetToCart = (presetKey: string) => {
    if (!quickCartEnabled) {
      setError("이 유형은 배치 담기를 지원하지 않습니다. 단건 기록으로 저장하세요.")
      return
    }
    const preset = kitPresetSummaries.find((item) => item.key === presetKey)
    if (!preset) return
    if (preset.missing.length > 0) {
      setError(`세트 품목을 찾을 수 없습니다: ${preset.missing.map((line) => line.label).join(", ")}`)
      return
    }
    const drafts = preset.lines
      .map((line) => line.row ? buildCartDraft({
        itemId: line.row.itemId,
        productName: line.row.product,
        quantity: line.required,
        movementType: "outbound",
      }) : null)
      .filter((draft): draft is HardwareMovementDraft => Boolean(draft))
    if (pushDraftsToQuickCart(drafts, preset.label)) {
      // 다음 세트가 의도치 않게 xN으로 담기지 않도록 배수는 담을 때마다 1로 복귀.
      setKitMultiplier(1)
    }
  }

  const copyLatestInboundLotToCart = () => {
    const latestLot = inboundLots.latestLot
    if (!latestLot) {
      setError("복사할 이전 입고 lot이 없습니다.")
      return
    }
    const targetLot = lotNo.trim() || nextLotSuggestion
    if (!lotNo.trim()) setLotNo(targetLot)
    const drafts = latestLot.items.map((item) => {
      const row = data?.stock.find((stockRow) => stockRow.itemId === item.item_id || stockRow.product === item.product_name)
      return {
        ...buildCartDraft({
          itemId: row?.itemId ?? item.item_id,
          productName: row?.product ?? item.product_name,
          quantity: item.quantity,
          movementType: "inbound",
        }),
        lotNo: targetLot,
        unitPrice: item.unit_price,
        amountUsd: item.amount_usd,
        amountCny: item.amount_cny,
        storageLocation: storageLocation.trim() || (item.storage_location ?? ""),
        importer: importer.trim() || (item.importer ?? ""),
        serials: [],
      }
    })
    if (pushDraftsToQuickCart(drafts, `${latestLot.displayLot} 구성 복사`)) {
      // 단건 모드에서 복사하면 담긴 바구니가 보이지 않아 저장 누락으로 이어진다 — 작업건 모드로 전환.
      setSheetMode("batch")
    }
  }

  const importQuoteLinesToCart = () => {
    if (!quickCartEnabled) {
      setError("이 유형은 배치 담기를 지원하지 않습니다. 단건 기록으로 저장하세요.")
      return
    }
    const drafts = quotePasteText
      .split(/\r?\n/)
      .map(parseHardwareLineText)
      .filter((line): line is { productText: string; quantity: number } => Boolean(line))
      .map((line) => {
        const row = findStockRowByText(line.productText)
        return buildCartDraft({
          itemId: row?.itemId,
          productName: row?.product ?? line.productText,
          quantity: line.quantity,
          movementType: movementType === "inbound" ? "inbound" : "outbound",
        })
      })
    if (drafts.length === 0) {
      setError("불러올 견적/CRM 라인을 찾지 못했습니다.")
      return
    }
    pushDraftsToQuickCart(drafts, "견적/CRM 라인")
    setQuotePasteText("")
  }

  const previewFifoForDraft = (draft: HardwareMovementDraft) => {
    if (draft.movementType !== "outbound" || draft.lotNo.trim()) return null
    const row =
      data?.stock.find((stockRow) => stockRow.itemId === draft.itemId || stockRow.product === draft.productName) ??
      findStockRowByText(draft.productName)
    if (!row) return null
    return previewFifoLots(row.lotBalances, draft.quantity)
  }

  const toggleSection = (section: HardwareSectionKey) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }))
  }

  // 프리셋 적용 — editingId는 건드리지 않는다(수정 중 프리셋 클릭이 조용히 신규 기록으로
  // 둔갑하던 버그의 원인). 신규 열기 경로는 resetSheetDraft가 명시적으로 초기화한다.
  // 출발/도착 보존은 같은 이동 유형 내 전환(판매↔예정 등)에만 적용한다 — 유형이 바뀌면
  // (예: 출고→입고) 고객사명이 입고 도착지로 끌려가 창고 집계에서 새는 사고를 막기 위해 하드 리셋.
  const applyPreset = (presetKey: string) => {
    const preset = ENTRY_PRESETS.find((item) => item.key === presetKey)
    if (!preset) return
    const typeChanged = preset.movementType !== movementType
    setActivePresetKey(preset.key)
    setMovementType(preset.movementType)
    if (typeChanged) {
      setFromLocation(preset.from)
      setToLocation(preset.to)
      // 입고↔출고 전환 시 수동 lot이 남아 FIFO를 조용히 끄는 것도 함께 차단.
      setLotNo("")
    } else {
      const presetDefaults = new Set<string>(["", ...ENTRY_PRESETS.flatMap((item) => [item.from, item.to])])
      setFromLocation((current) => (presetDefaults.has(current.trim()) ? preset.from : current))
      setToLocation((current) => (presetDefaults.has(current.trim()) ? preset.to : current))
    }
    setStatus(preset.status)
  }

  // 시트 열기 공통 초기화 — 진입점(FAB/헤더/행 퀵버튼/예정 등록)이 어디든 같은 클리어 셋을 보장한다.
  // 직전 기록의 lot·금액·시리얼·메모가 새 기록에 오염되는 것을 차단한다.
  // 담당자(owner)는 같은 사람이 연속 기록하는 실무 패턴이라 유지하고,
  // 기록 바구니는 어떤 진입점에서도 조용히 파괴하지 않는다(바구니 헤더의 '비우기'로만 명시적 삭제).
  const resetSheetDraft = (presetKey: string, itemId?: string) => {
    setEditingId(null)
    setFromLocation("")
    setToLocation("")
    applyPreset(presetKey)
    setSelectedItemId(itemId ?? data?.items[0]?.id ?? "")
    setCustomProduct("")
    setShowCustomInput(false)
    setQuantity("1")
    setOccurredAt(todayKey())
    setMemo("")
    setReferenceNo("")
    setLotNo("")
    setUnitPrice("")
    setAmountUsd("")
    setAmountCny("")
    setStorageLocation("")
    setImporter("")
    setSerialsText("")
    setQuickCartLineErrors({})
    setQuickCartSaveSummary(null)
    setQuotePasteText("")
    setError(null)
    setNotice(null)
    setKitMultiplier(1)
  }

  const openSheet = (presetKey: string, itemId?: string, mode?: "single" | "batch") => {
    resetSheetDraft(presetKey, itemId)
    // 입고는 lot 단위 다품목이 실무 기본이라 작업건 모드로 연다. 나머지는 단건 우선.
    setSheetMode(mode ?? (presetKey === "inbound" ? "batch" : "single"))
    setSheetOpen(true)
    // 이미 열린 상태에서 다른 행 퀵버튼을 눌렀을 때를 위해 패널 자체를 맨 위로.
    // (scrollIntoView는 sticky 헤더 높이만큼 폼 상단을 가리는 문제가 있어 사용하지 않는다.)
    window.requestAnimationFrame(() => {
      sheetPanelRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" })
    })
  }

  const prepareQuickEntry = (itemId: string, presetKey: string) => {
    openSheet(presetKey, itemId)
  }

  const rememberOwner = (value: string) => {
    const trimmed = value.trim()
    if (trimmed) writeLocalString(QUICK_RECORD_OWNER_KEY, trimmed)
  }

  const toggleStayOpenAfterSave = () => {
    setStayOpenAfterSave((current) => {
      writeLocalString(QUICK_RECORD_STAY_OPEN_KEY, current ? "" : "1")
      return !current
    })
  }

  const presetKeyForMovement = (movement: HardwareMovement): string => {
    switch (movement.movement_type) {
      case "inbound":
        return "inbound"
      case "return":
        return "return"
      case "transfer":
        return "office"
      case "repair":
        return "repair"
      case "adjust":
        return "adjust"
      default:
        if (/예정|예약|대기/.test(movement.status ?? "")) return "planned"
        if (/샘플|sample|대여/i.test(`${movement.status ?? ""} ${movement.to_location ?? ""}`)) return "sample"
        return "sale"
    }
  }

  const editMovement = (movement: HardwareMovement) => {
    const hasKnownItem = Boolean(data?.items.some((item) => item.id === movement.item_id))
    // 바구니는 비우지 않는다 — 편집 중에는 UI만 숨고(quickCartEnabled=false), 편집 후 배치 작업을 이어갈 수 있다.
    setQuickCartLineErrors({})
    setQuickCartSaveSummary(null)
    // 직전 작업의 배너(성공/에러)가 수정 시트에 남아 혼동·자동 스크롤을 유발하지 않도록 클리어.
    setError(null)
    setNotice(null)
    applyPreset(presetKeyForMovement(movement))
    setSelectedItemId(hasKnownItem ? movement.item_id : data?.items[0]?.id ?? "")
    setCustomProduct(hasKnownItem ? "" : movement.product_name)
    setShowCustomInput(!hasKnownItem)
    setQuantity(String(Math.max(1, movement.quantity)))
    setOccurredAt(movement.occurred_at?.slice(0, 10) || todayKey())
    setFromLocation(movement.from_location ?? "")
    setToLocation(movement.to_location ?? "")
    setOwner(movement.owner ?? "")
    setStatus(movement.status ?? "")
    setReferenceNo(movement.reference_no ?? "")
    setMemo(movement.memo ?? "")
    setLotNo(movement.lot_no ?? "")
    setUnitPrice(movement.unit_price != null ? String(movement.unit_price) : "")
    setAmountUsd(movement.amount_usd != null ? String(movement.amount_usd) : "")
    setAmountCny(movement.amount_cny != null ? String(movement.amount_cny) : "")
    setStorageLocation(movement.storage_location ?? "")
    setImporter(movement.importer ?? "")
    setSerialsText((movement.serials ?? []).join(", "))
    setEditingId(movement.id)
    setSheetMode("single")
    setSheetOpen(true)
  }

  const readPlannedConfirmInput = (
    movement: HardwareMovement,
    override: { quantity?: number; occurredAt?: string } = {}
  ) => {
    const rawQty = override.quantity != null ? String(override.quantity) : confirmQtys[movement.id]
    const qty = rawQty
      ? Math.max(1, Math.min(movement.quantity, Math.floor(Number(rawQty) || movement.quantity)))
      : movement.quantity
    return {
      qty,
      occurredAt: override.occurredAt ?? confirmDates[movement.id] ?? todayKey(),
    }
  }

  const confirmPlannedMovementRequest = async (
    movement: HardwareMovement,
    override: { quantity?: number; occurredAt?: string } = {}
  ) => {
    const { qty, occurredAt } = readPlannedConfirmInput(movement, override)
    await adminFetchJson(`/api/admin/hardware/movements/${movement.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "confirm-planned", occurredAt, confirmQty: qty }),
    })
    return qty
  }

  const confirmPlannedMovement = async (
    movement: HardwareMovement,
    override: { quantity?: number; occurredAt?: string } = {}
  ) => {
    if (busy != null || confirmingGroupKey || (confirmingId && confirmingId !== movement.id)) return
    setConfirmingId(movement.id)
    setNotice(null)
    setError(null)
    try {
      const qty = await confirmPlannedMovementRequest(movement, override)
      setPlannedConfirmResults((current) => ({
        ...current,
        [movement.id]: { ok: true, message: `${formatNumber(qty)}대 확정 완료` },
      }))
      setNotice(
        `${movement.product_name} ${formatNumber(qty)}대를 실제 출고로 확정했습니다.${
          qty < movement.quantity ? ` 잔여 ${formatNumber(movement.quantity - qty)}대는 예정으로 유지됩니다.` : ""
        }`
      )
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConfirmingId(null)
    }
  }

  const confirmPlannedGroup = async (group: { key: string; customer: string; items: HardwareMovement[] }) => {
    if (group.items.length === 0 || plannedConfirmLocked) return
    const plannedSnapshot = group.items.map((movement) => ({
      movement,
      ...readPlannedConfirmInput(movement),
    }))
    if (!window.confirm(`${group.customer} 예정 출고 ${formatNumber(group.items.length)}개 품목을 확정할까요?`)) return
    setConfirmingGroupKey(group.key)
    setNotice(null)
    setError(null)
    const nextResults: Record<string, { ok: boolean; message: string }> = {}
    let success = 0
    let failed = 0
    try {
      for (const entry of plannedSnapshot) {
        try {
          const qty = await confirmPlannedMovementRequest(entry.movement, {
            quantity: entry.qty,
            occurredAt: entry.occurredAt,
          })
          success += 1
          nextResults[entry.movement.id] = { ok: true, message: `${formatNumber(qty)}대 확정 완료` }
        } catch (err) {
          failed += 1
          nextResults[entry.movement.id] = {
            ok: false,
            message: err instanceof Error ? err.message : "출고 확정에 실패했습니다.",
          }
        }
      }
      setPlannedConfirmResults((current) => ({ ...current, ...nextResults }))
      setNotice(
        failed > 0
          ? `${group.customer} 출고 확정: ${formatNumber(success)}건 성공, ${formatNumber(failed)}건 실패`
          : `${group.customer} 예정 출고 ${formatNumber(success)}건을 모두 확정했습니다.`
      )
      if (success > 0) await refresh()
    } finally {
      setConfirmingGroupKey(null)
    }
  }

  const voidMovement = (movement: HardwareMovement) => {
    if (movement.voided_at) return
    setVoidReason("")
    setVoidTarget(movement)
  }

  const confirmVoid = async () => {
    const movement = voidTarget
    if (!movement) return
    setVoidingId(movement.id)
    setNotice(null)
    setError(null)
    try {
      await adminFetchJson(`/api/admin/hardware/movements/${movement.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "void", reason: voidReason.trim() || undefined }),
      })
      setNotice(`${movement.product_name} ${MOVEMENT_LABEL[movement.movement_type]} 기록을 취소했습니다.`)
      setVoidTarget(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setVoidingId(null)
    }
  }

  const trapTab = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return
    const panel = sheetPanelRef.current
    if (!panel) return
    const items = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const startPlannedEntry = () => {
    openSheet("planned")
  }

  // 입출고 탭의 하위 토글(입고|출고)에 맞는 프리셋으로 연다 — 입고 보던 중 '빠른 기록'이 sale로 열리는 불일치 해소.
  const openFreshSheet = () => {
    openSheet(activeTab === "entry" && entrySub === "inbound" ? "inbound" : "sale")
  }

  const adjustQuantity = (delta: number) => {
    setQuantity((current) => String(Math.max(1, Number(current || 0) + delta)))
  }

  const selectedCrmCandidate = useMemo(
    () => crmCandidates.find((candidate) => candidate.id === selectedCrmCandidateId) ?? null,
    [crmCandidates, selectedCrmCandidateId]
  )

  const refresh = async () => {
    clearAdminRequestCache()
    await load()
  }

  const importSheet = async () => {
    setBusy("import")
    setNotice(null)
    setError(null)
    try {
      const result = await adminFetchJson<{
        import: { imported: number; skipped: number; snapshotId?: string }
        sync: { inbound: number; outbound: number; stock: number; sales: number } | null
      }>("/api/admin/hardware/import-sheet", {
        method: "POST",
        body: JSON.stringify({ sync: true }),
      })
      const snapshotHint = result.import.snapshotId ? ` · 백업 ${result.import.snapshotId.slice(0, 8)}` : ""
      setNotice(
        `시트 강제 싱크와 백업 후 이관 완료: 원장 ${formatNumber(result.import.imported)}건 반영${snapshotHint}. 기존 시트 이관분은 최신 백업 기준으로 갱신되었습니다.`
      )
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const importLedgerFile = async (file: File) => {
    if (!/\.xlsx$/i.test(file.name)) {
      setError(".xlsx 파일만 업로드할 수 있습니다.")
      return
    }
    if (!window.confirm(`"${file.name}" 원장으로 하드웨어 입출고 내역을 교체합니다. (자동 백업 후 진행) 계속할까요?`)) {
      return
    }
    setBusy("ledger")
    setNotice(null)
    setError(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const result = await adminFetchJson<{
        file: string
        parsed: { lots: string[]; inboundRows: number; outboundRows: number; byType: Record<string, number> }
        import: { imported: number; skipped: number; snapshotId?: string }
        warnings: string[]
      }>("/api/admin/hardware/import-ledger", { method: "POST", body: form })
      const snapshotHint = result.import?.snapshotId ? ` · 백업 ${result.import.snapshotId.slice(0, 8)}` : ""
      const typeHint = Object.entries(result.parsed.byType)
        .map(([key, value]) => `${key} ${formatNumber(value)}`)
        .join(" · ")
      const warnHint = result.warnings.length > 0 ? ` · 경고 ${formatNumber(result.warnings.length)}건` : ""
      setNotice(
        `원장 가져오기 완료: 물량번호 ${formatNumber(result.parsed.lots.length)}개 · 입고 ${formatNumber(result.parsed.inboundRows)} · 출고 ${formatNumber(result.parsed.outboundRows)} (${typeHint}) → 원장 ${formatNumber(result.import.imported)}건 반영${snapshotHint}${warnHint}.`
      )
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const buildMovementDraft = (): HardwareMovementDraft => {
    const productName = customProduct.trim() || selectedItem?.name || ""
    return {
      itemId: customProduct.trim() ? undefined : selectedItemId,
      productName,
      movementType,
      quantity: Number(quantity),
      occurredAt,
      fromLocation,
      toLocation,
      owner,
      status,
      referenceNo,
      memo,
      lotNo: lotNo.trim(),
      unitPrice: parseOptionalNumber(unitPrice),
      amountUsd: parseOptionalNumber(amountUsd),
      amountCny: parseOptionalNumber(amountCny),
      storageLocation: storageLocation.trim(),
      importer: importer.trim(),
      serials: serialsText.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean),
    }
  }

  const validateMovementDraft = (draft: HardwareMovementDraft) => {
    if (!draft.productName.trim()) return "품목을 선택하거나 새 품목을 입력하세요."
    if (!Number.isInteger(draft.quantity) || draft.quantity <= 0) return "수량은 1 이상 정수여야 합니다."
    // 출고는 도착(고객사) 실명이 있어야 고객 집계·거래이력이 산다. "고객" 같은 일반 위치명은 미지정으로 취급.
    if (draft.movementType === "outbound" && !draft.toLocation.trim()) {
      return "도착(고객사)을 입력하세요. 최근 고객은 자동완성에서 고를 수 있습니다."
    }
    // 시리얼 입력 UI는 입고에만 있다 — 레거시 출고 기록(시리얼 보유)을 수정할 때
    // 보이지 않는 필드 때문에 저장이 막히지 않도록 검증도 입고로 한정.
    if (draft.movementType === "inbound" && draft.serials.length > 0 && draft.serials.length !== draft.quantity) {
      return `시리얼 번호 ${formatNumber(draft.serials.length)}개가 수량 ${formatNumber(draft.quantity)}대와 다릅니다.`
    }
    return null
  }

  // 바구니는 편집 모드만 아니면 입고·출고 전체에서 사용 가능 — 가장 잦은 판매 출고를
  // 배제하던 예전 조건(예정 출고만 허용)이 연속 기록 마찰의 주범이라 철폐.
  const quickCartEnabled = !editingId && (movementType === "inbound" || movementType === "outbound")

  const quickCartTotals = useMemo(
    () => ({
      count: quickCart.length,
      quantity: quickCart.reduce((total, draft) => total + draft.quantity, 0),
    }),
    [quickCart]
  )

  const inboundDraftWarnings = useMemo(() => {
    if (movementType !== "inbound") return []
    const warnings: string[] = []
    const draftQuantity = Math.max(0, Math.floor(Number(quantity) || 0))
    const serials = serialsText.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean)
    if (serials.length > 0 && draftQuantity > 0 && serials.length !== draftQuantity) {
      warnings.push(`시리얼 ${formatNumber(serials.length)}개 · 수량 ${formatNumber(draftQuantity)}대`)
    }
    const parsedUnitPrice = parseOptionalNumber(unitPrice)
    const parsedAmountUsd = parseOptionalNumber(amountUsd)
    if (parsedUnitPrice != null && parsedAmountUsd != null && draftQuantity > 0) {
      const expected = Math.round(parsedUnitPrice * draftQuantity * 100) / 100
      if (Math.abs(expected - parsedAmountUsd) > 0.01) {
        warnings.push(`USD 금액 계산값 ${formatCurrency(expected, "USD")}과 입력값이 다릅니다.`)
      }
    }
    return warnings
  }, [amountUsd, movementType, quantity, serialsText, unitPrice])

  const addDraftToQuickCart = () => {
    const draft = buildMovementDraft()
    const message = validateMovementDraft(draft)
    if (message) {
      setError(message)
      return
    }
    setQuickCart((current) => mergeQuickCartDrafts(current, [draft]))
    setQuickCartLineErrors({})
    setQuickCartSaveSummary(null)
    setError(null)
    setNotice(`${draft.productName} ${formatNumber(draft.quantity)}대를 기록 바구니에 담았습니다.`)
    setQuantity("1")
    setCustomProduct("")
    setUnitPrice("")
    setAmountUsd("")
    setAmountCny("")
    setSerialsText("")
    // 건 단위 필드는 다음 라인에 상속되지 않도록 리셋 (입고 lot은 공유 필드라 유지).
    if (movementType !== "inbound") setLotNo("")
    setMemo("")
    setReferenceNo("")
  }

  const removeQuickCartItem = (index: number) => {
    setQuickCart((current) => current.filter((_, itemIndex) => itemIndex !== index))
    setQuickCartLineErrors({})
  }

  // 바구니 명시적 비우기 — 진입점들은 바구니를 조용히 파괴하지 않으므로 이것이 유일한 전체 삭제 경로다.
  const clearQuickCart = () => {
    setQuickCart([])
    setQuickCartLineErrors({})
    setQuickCartSaveSummary(null)
  }

  const submitQuickCart = async () => {
    if (quickCart.length === 0 || busy === "movement") return
    const submittedCart = quickCart.map((draft) => ({ ...draft, serials: [...draft.serials] }))
    setBusy("movement")
    setNotice(null)
    setError(null)
    try {
      const response = await adminFetch("/api/admin/hardware/movements", {
        method: "POST",
        body: JSON.stringify({ movements: submittedCart }),
      })
      const result = await response.json().catch(() => null) as HardwareMovementBatchResponse | null
      if (!result?.lineResults || !result.summary) {
        const fallback = `${response.status} ${response.statusText}`.trim()
        throw new Error((result as { error?: string; message?: string } | null)?.error ?? (result as { error?: string; message?: string } | null)?.message ?? (fallback || "저장에 실패했습니다."))
      }
      const failedResults = result.lineResults.filter((line) => !line.ok)
      const failedIndexes = new Set(failedResults.map((line) => line.index))
      const failedDrafts = submittedCart.filter((_, index) => failedIndexes.has(index))
      const nextErrors: Record<string, string> = {}
      for (const line of failedResults) {
        const draft = submittedCart[line.index]
        if (draft) nextErrors[quickCartLineKey(draft)] = line.error ?? "저장에 실패했습니다."
      }
      setQuickCartSaveSummary({
        success: result.summary.success,
        failed: result.summary.failed,
        savedQuantity: submittedCart.reduce((total, draft, index) => failedIndexes.has(index) ? total : total + draft.quantity, 0),
        failedQuantity: failedDrafts.reduce((total, draft) => total + draft.quantity, 0),
      })
      setNotice(
        result.summary.failed > 0
          ? `기록 바구니 ${formatNumber(result.summary.success)}건 저장, ${formatNumber(result.summary.failed)}건은 수정 후 재시도하세요.`
          : `기록 바구니 ${formatNumber(submittedCart.length)}건 · ${formatNumber(submittedCart.reduce((total, draft) => total + draft.quantity, 0))}대를 저장했습니다.`
      )
      setQuickCartLineErrors(nextErrors)
      setQuickCart(failedDrafts)
      if (result.summary.failed === 0 && !stayOpenAfterSave) {
        setSheetOpen(false)
      }
      if (result.summary.success > 0) {
        rememberOwner(owner)
        await refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const openCrmConfirmation = async (draft: HardwareMovementDraft) => {
    setPendingMovement(draft)
    setCrmCandidates([])
    setCrmWarnings([])
    setCrmError(null)
    setSelectedCrmCandidateId(null)
    setCrmAutoReflect(true)
    setCrmLoading(true)

    try {
      const params = new URLSearchParams({
        productName: draft.productName,
        quantity: String(draft.quantity),
      })
      const result = await adminFetchJson<HardwareCrmOrderCandidatesResponse>(
        `/api/admin/hardware/crm-orders?${params.toString()}`,
        { cache: "no-cache" }
      )
      setCrmCandidates(result.candidates)
      setCrmWarnings(result.warnings ?? [])
      setSelectedCrmCandidateId(result.candidates[0]?.id ?? null)
      setCrmAutoReflect(result.candidates.length > 0)
    } catch (err) {
      setCrmError(err instanceof Error ? err.message : String(err))
      setCrmAutoReflect(false)
    } finally {
      setCrmLoading(false)
    }
  }

  const closeCrmConfirmation = () => {
    if (busy === "movement") return
    setPendingMovement(null)
    setCrmCandidates([])
    setCrmWarnings([])
    setCrmError(null)
    setSelectedCrmCandidateId(null)
  }

  const createMovementFromDraft = async (
    draft: HardwareMovementDraft,
    crmCandidate: HardwareCrmOrderCandidate | null
  ) => {
    setBusy("movement")
    setNotice(null)
    setError(null)
    try {
      const linkedMemo = crmCandidate
        ? [draft.memo, `CRM 연동: ${crmCandidate.sourceLabel} · ${crmCandidate.title}`].filter(Boolean).join("\n")
        : draft.memo

      await adminFetchJson("/api/admin/hardware/movements", {
        method: "POST",
        body: JSON.stringify({
          ...draft,
          referenceNo: crmCandidate && !draft.referenceNo ? crmCandidate.referenceNo : draft.referenceNo,
          memo: linkedMemo,
          crmLink: crmCandidate
            ? {
                id: crmCandidate.id,
                source: crmCandidate.source,
                sourceLabel: crmCandidate.sourceLabel,
                referenceNo: crmCandidate.referenceNo,
                title: crmCandidate.title,
                href: crmCandidate.href,
                confidence: crmCandidate.confidence,
              }
            : undefined,
        }),
      })
      setNotice(
        `${draft.productName} · ${activePreset.label} ${formatNumber(draft.quantity)}대를 기록했습니다.${
          crmCandidate ? " CRM 오더와 연결했습니다." : ""
        }`
      )
      rememberOwner(draft.owner)
      setQuantity("1")
      setMemo("")
      setUnitPrice("")
      setAmountUsd("")
      setAmountCny("")
      setSerialsText("")
      // lot·참조번호는 건 단위 값 — 연속 기록에서 다음 건에 상속되면 원장이 오염된다.
      setLotNo("")
      setReferenceNo("")
      // 연속 기록 모드면 시트를 유지 — 품목·고객은 남기고 수량/금액만 리셋해 다음 건을 바로 입력.
      // 저장 대기 바구니가 남아 있으면 시트를 닫지 않는다(조용한 저장 누락 방지).
      if (!stayOpenAfterSave && quickCart.length === 0) setSheetOpen(false)
      setPendingMovement(null)
      await refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setCrmError(message)
    } finally {
      setBusy(null)
    }
  }

  const submitEdit = async (draft: HardwareMovementDraft) => {
    if (!editingId) return
    setBusy("movement")
    setNotice(null)
    setError(null)
    try {
      await adminFetchJson(`/api/admin/hardware/movements/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "update", ...draft }),
      })
      setNotice(`${draft.productName} 기록을 수정했습니다.`)
      setEditingId(null)
      setSheetOpen(false)
      setQuantity("1")
      setMemo("")
      setUnitPrice("")
      setAmountUsd("")
      setAmountCny("")
      setSerialsText("")
      setLotNo("")
      setReferenceNo("")
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const submitMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const draft = buildMovementDraft()
    const validationError = validateMovementDraft(draft)
    if (validationError) {
      setError(validationError)
      return
    }
    if (editingId) {
      await submitEdit(draft)
      return
    }
    const planned = /예정|예약|대기/.test(draft.status)
    if (draft.movementType === "outbound" && !planned) {
      await openCrmConfirmation(draft)
      return
    }
    await createMovementFromDraft(draft, null)
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] pb-24">
      <header className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 pb-0 pt-6 sm:px-6 lg:px-9 lg:pt-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#615D59]">
              <span>ADMIN</span>
              <span className="opacity-50">›</span>
              <span>Operations</span>
            </div>
            <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#111110] sm:text-[30px]">
              하드웨어 재고
            </h1>
            <p className="mt-2 max-w-[760px] text-[13px] leading-relaxed text-[#615D59]">
              홈에서 예상 출고를 등록·확정하고, 입출고 탭에서 입고·출고를 기록하고, 내역 탭에서 전체 원장을 확인합니다. 시트 가져오기는 항상 먼저
              동기화·백업한 뒤 누적 데이터를 최신 백업 기준으로 교체합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || busy != null}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </button>
            <button
              type="button"
              onClick={() => void importSheet()}
              disabled={busy != null}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#084734] px-3 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UploadCloud className={`h-3.5 w-3.5 ${busy === "import" ? "animate-pulse" : ""}`} />
              {busy === "import" ? "싱크·백업 중" : "싱크·백업 후 가져오기"}
            </button>
            <input
              ref={ledgerFileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (file) void importLedgerFile(file)
              }}
            />
            <button
              type="button"
              onClick={() => ledgerFileRef.current?.click()}
              disabled={busy != null}
              title="Hardware Ledger 원장(.xlsx)을 업로드해 입출고 내역을 교체합니다"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#084734] bg-white px-3 py-2 text-[12px] font-bold text-[#084734] shadow-sm transition hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileSpreadsheet className={`h-3.5 w-3.5 ${busy === "ledger" ? "animate-pulse" : ""}`} />
              {busy === "ledger" ? "업로드 중" : "업로드"}
            </button>
          </div>
        </div>

        <nav className="-mb-px mt-5 flex gap-1 overflow-x-auto" aria-label="하드웨어 하위 탭">
          {HARDWARE_TABS.map((tab) => {
            const TabIcon = tab.icon
            const active = activeTab === tab.id
            const plannedCount = data?.plannedMovements.length ?? 0
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-t-md border-b-2 px-4 py-3 text-[13px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 ${
                  active
                    ? "border-[#084734] text-[#084734]"
                    : "border-transparent text-[#615D59] hover:text-[#111110]"
                }`}
              >
                <TabIcon className="h-4 w-4" />
                {tab.label}
                {tab.id === "home" && plannedCount > 0 ? (
                  <span className="rounded-full bg-[#FBF1E0] px-1.5 py-0.5 text-[11px] font-bold text-[#A8741A]">
                    {formatNumber(plannedCount)}
                  </span>
                ) : null}
              </button>
            )
          })}
        </nav>
      </header>

      <main className="px-4 pt-6 sm:px-6 lg:px-9">
        {error && (
          <div className="mb-4 rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[13px] font-semibold text-[#8F2C2C]">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-lg border border-[#BDEFD8] bg-[#ECFDF5] px-4 py-3 text-[13px] font-semibold text-[#084734]">
            {notice}
          </div>
        )}

        {loading && !data ? (
          <div className="grid gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-xl bg-[#F6F5F4]" />
            ))}
          </div>
        ) : (
          <>
            {activeTab === "home" && (
            <div className="space-y-4">
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {categoryCards.map((card) => {
                const CardIcon = card.icon
                return (
                  <div
                    key={card.key}
                    className="min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold tracking-[0.04em] text-[#615D59]">{card.label}</p>
                        <p className="mt-2 flex items-baseline gap-1.5">
                          <span className="text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[#111110]">{formatNumber(card.warehouse)}</span>
                          <span className="text-[13px] font-semibold text-[#615D59]">창고</span>
                        </p>
                      </div>
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: card.tone.bg, color: card.tone.fg }}
                      >
                        <CardIcon className="h-[18px] w-[18px]" />
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-[#FBF1E0] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#A8741A]">예정 {formatNumber(card.planned)}</span>
                      <span className="rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#084734]">가용 {formatNumber(card.available)}</span>
                    </div>
                  </div>
                )
              })}
            </section>

            <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A39E98]" />
                    <input
                      value={hardwareSearch}
                      onChange={(event) => setHardwareSearch(event.target.value)}
                      aria-label="하드웨어 통합 검색"
                      placeholder="제품·lot·고객·담당자 검색"
                      className="h-11 w-full rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] pl-9 pr-3 text-[13px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                    />
                  </label>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {["부족 품목", "오늘 출고", "오래된 lot", "내 담당"].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setHardwareSearch(chip)}
                        aria-pressed={hardwareSearch === chip}
                        className="cursor-pointer rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1 text-[11px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                      >
                        {chip}
                      </button>
                    ))}
                    {hardwareSearch && (
                      <button
                        type="button"
                        onClick={() => setHardwareSearch("")}
                        className="cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-bold text-[#A39E98] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                      >
                        검색 초기화
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-[12px] font-semibold text-[#615D59] lg:text-right">
                  <p>자주 묻는 질문형 검색</p>
                  <p className="mt-0.5 text-[#A39E98]">예: H8, 카메라, 86 재고, OO학원 출고</p>
                </div>
              </div>

              {hardwareSearchResults && (
                <div className="mt-4 grid gap-3 lg:grid-cols-4">
                  <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
                    <p className="text-[12px] font-bold text-[#111110]">제품</p>
                    <div className="mt-2 space-y-2">
                      {hardwareSearchResults.products.length === 0 ? (
                        <p className="text-[11px] text-[#A39E98]">결과 없음</p>
                      ) : hardwareSearchResults.products.map((row) => (
                        <div key={row.itemId} className="rounded-md bg-white px-2.5 py-2">
                          <p className="truncate text-[12px] font-bold text-[#111110]">{row.product}</p>
                          <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-[#615D59]">
                            가용 {formatNumber(row.availableStock)} · 예정 {formatNumber(row.plannedOut)} · 창고 {formatNumber(row.warehouseStock)}
                          </p>
                          <div className="mt-1.5 flex gap-1">
                            <QuickMoveButton kind="sale" product={row.product} onClick={() => prepareQuickEntry(row.itemId, "sale")} />
                            <QuickMoveButton kind="planned" product={row.product} onClick={() => prepareQuickEntry(row.itemId, "planned")} />
                            <QuickMoveButton kind="inbound" product={row.product} onClick={() => prepareQuickEntry(row.itemId, "inbound")} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
                    <p className="text-[12px] font-bold text-[#111110]">Lot</p>
                    <div className="mt-2 space-y-2">
                      {hardwareSearchResults.lots.length === 0 ? (
                        <p className="text-[11px] text-[#A39E98]">결과 없음</p>
                      ) : hardwareSearchResults.lots.map((lot) => (
                        <button
                          key={lot.lot}
                          type="button"
                          onClick={() => {
                            setActiveTab("history")
                            setHistoryType("all")
                            setProductFilter("")
                            setCustomerFilter("")
                            setSearch("")
                            setLotFilter(lot.lot)
                            setMovementsPage(1)
                          }}
                          className="block w-full cursor-pointer rounded-md bg-white px-2.5 py-2 text-left transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                        >
                          <p className="text-[12px] font-bold text-[#084734]">{formatLotLabel(lot.lot) ?? lot.lot}</p>
                          <p className="mt-0.5 truncate text-[11px] font-semibold text-[#615D59]">
                            {formatNumber(lot.total)}대 · {lot.products.slice(0, 2).join(", ")}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
                    <p className="text-[12px] font-bold text-[#111110]">예정 출고</p>
                    <div className="mt-2 space-y-2">
                      {hardwareSearchResults.planned.length === 0 ? (
                        <p className="text-[11px] text-[#A39E98]">결과 없음</p>
                      ) : hardwareSearchResults.planned.map((movement) => (
                        <div key={movement.id} className="rounded-md bg-white px-2.5 py-2">
                          <p className="truncate text-[12px] font-bold text-[#111110]">{movement.to_location ?? "도착지 미정"}</p>
                          <p className="mt-0.5 truncate text-[11px] font-semibold text-[#615D59]">
                            {movement.product_name} · {formatNumber(movement.quantity)}대 · {formatDate(movement.occurred_at)}
                          </p>
                          <button
                            type="button"
                            onClick={() => void confirmPlannedMovement(movement, {
                              quantity: movement.quantity,
                              occurredAt: todayKey(),
                            })}
                            disabled={plannedConfirmLocked}
                            className="mt-1.5 rounded bg-[#084734] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                          >
                            출고 확정
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
                    <p className="text-[12px] font-bold text-[#111110]">고객/작업</p>
                    <div className="mt-2 space-y-2">
                      {hardwareSearchResults.customers.length === 0 ? (
                        <p className="text-[11px] text-[#A39E98]">결과 없음</p>
                      ) : hardwareSearchResults.customers.map((customer) => (
                        <button
                          key={customer.customer}
                          type="button"
                          onClick={() => setCustomerDetail(customer.customer)}
                          className="block w-full cursor-pointer rounded-md bg-white px-2.5 py-2 text-left transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                        >
                          <p className="truncate text-[12px] font-bold text-[#111110]">{customer.customer}</p>
                          <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-[#615D59]">
                            예정 {formatNumber(customer.planned)} · 출고 {formatNumber(customer.outbound)} · {customer.lastDate ?? "-"}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
                <p className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">재고 위치 맵</p>
                <p className="mt-1 text-[12px] text-[#615D59]">칠판(장비) 기준으로 창고 · 가용 · 예정 · 샘플(남은/나간)을 봅니다. 핵심 품목만 펼쳐 두고 나머지는 상세보기로.</p>
              </div>
              <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
                <div className="border-b border-[rgba(0,0,0,0.08)] px-5 py-[18px] lg:border-b-0 lg:border-r">
                  <p className="text-[12px] font-bold text-[#111110]">위치별 총량</p>
                  <div className="mt-3.5 flex flex-col gap-3">
                    {locationMap.locationTotals.map((loc) => (
                      <div key={loc.name}>
                        <div className="flex items-center justify-between gap-3 text-[12px]">
                          <span className="min-w-0 truncate font-semibold text-[#31302E]" title={loc.desc}>{loc.name}</span>
                          <span className="font-bold tabular-nums text-[#111110]">{formatNumber(loc.quantity)}대</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#F6F5F4]">
                          <div className="h-full rounded-full" style={{ backgroundColor: loc.tone, width: loc.pct }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[700px]">
                    {[...locationMap.featuredRows, ...(locationMapExpanded ? locationMap.restRows : [])].map((row) => (
                      <div
                        key={row.itemId}
                        className="grid grid-cols-[200px_minmax(0,1fr)_150px] items-center gap-4 border-t border-[rgba(0,0,0,0.06)] px-5 py-3.5 first:border-t-0"
                      >
                        <div className="min-w-0">
                          <p title={row.product} className="truncate text-[13px] font-bold text-[#111110]">{row.product}</p>
                          {row.sampleTotal > 0 && (
                            <p className="mt-1 text-[11px] tabular-nums text-[#615D59]">샘플 총 {formatNumber(row.sampleTotal)}대</p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-5">
                          {row.cells.map((cell) => (
                            <div key={cell.label} className="min-w-0">
                              <div className="flex items-center justify-between gap-1 text-[11px]">
                                <span className="truncate font-semibold text-[#615D59]">{cell.label}</span>
                                <span className="font-bold tabular-nums text-[#111110]">{formatNumber(cell.qty)}</span>
                              </div>
                              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#F6F5F4]">
                                <div className="h-full rounded-full" style={{ backgroundColor: cell.tone, width: cell.pct }} />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-end gap-1.5">
                          <QuickMoveButton kind="sale" product={row.product} onClick={() => prepareQuickEntry(row.itemId, "sale")} />
                          <QuickMoveButton kind="planned" product={row.product} onClick={() => prepareQuickEntry(row.itemId, "planned")} />
                          <QuickMoveButton kind="inbound" product={row.product} onClick={() => prepareQuickEntry(row.itemId, "inbound")} />
                        </div>
                      </div>
                    ))}
                    {locationMap.restRows.length > 0 && (
                      <div className="border-t border-[rgba(0,0,0,0.06)] px-5 py-2.5">
                        <button
                          type="button"
                          onClick={() => setLocationMapExpanded((value) => !value)}
                          aria-expanded={locationMapExpanded}
                          className="inline-flex items-center gap-1 cursor-pointer rounded-md px-2 py-1 text-[12px] font-semibold text-[#615D59] transition hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                        >
                          {locationMapExpanded ? "접기" : `상세보기 (${formatNumber(locationMap.restRows.length)}개 더)`}
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${locationMapExpanded ? "rotate-180" : ""}`} />
                        </button>
                      </div>
                    )}
                    {locationMap.featuredRows.length === 0 && locationMap.restRows.length === 0 && (
                      <p className="px-5 py-10 text-center text-[13px] text-[#615D59]">재고 데이터가 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section
              data-testid="hardware-planned-info-panel"
              className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#FBF1E0] text-[#A8741A]">
                    <Clock3 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold tracking-[-0.01em] text-[#111110]">예상 출고</span>
                    <span className="mt-1 block text-[12px] text-[#615D59]">배송 예정 물량을 확정하면 현재 lot 재고를 기준으로 FIFO 배정 후 실제 출고로 전환됩니다.</span>
                  </span>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <span className="text-[11px] font-semibold text-[#615D59]">
                    {formatNumber(data?.plannedMovements.length ?? 0)}건 · {formatNumber(plannedMovementQuantity)}대
                  </span>
                  <button
                    type="button"
                    onClick={startPlannedEntry}
                    disabled={plannedConfirmLocked}
                    className="inline-flex items-center gap-1.5 cursor-pointer rounded-md bg-[#084734] px-3 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Clock3 className="h-3.5 w-3.5" />
                    예상 출고 등록
                  </button>
                </div>
              </div>
              {(data?.plannedMovements.length ?? 0) === 0 ? (
                <p className="px-5 py-10 text-center text-[13px] text-[#615D59]">
                  현재 배송 예정 기록이 없습니다. 예상 출고 등록으로 미리 차감할 물량을 잡아두세요.
                </p>
              ) : (
                <>
                  <div className="divide-y divide-[rgba(0,0,0,0.06)]">
                    {plannedPagination.pageItems.map((group) => (
                      <div key={group.key} data-testid="hardware-planned-info-group" className="px-5 py-3.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p title={group.customer} className="truncate text-[13.5px] font-bold text-[#111110]">{group.customer}</p>
                            <p className="mt-0.5 text-[11px] text-[#615D59]">
                              {group.date ? formatDate(group.date) : "일자 미정"} · {group.owner ?? "담당자 미정"}
                              {group.lot ? ` · ${formatLotLabel(group.lot) ?? group.lot}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                            <span className="rounded-full bg-[#FBF1E0] px-2.5 py-1 text-[11px] font-bold tabular-nums text-[#7A520F]">
                              {formatNumber(group.totalQty)}대 · {formatNumber(group.items.length)}품목
                            </span>
                            <button
                              type="button"
                              onClick={() => void confirmPlannedGroup(group)}
                              disabled={plannedConfirmLocked}
                              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md bg-[#084734] px-2.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <CheckCheck className="h-3.5 w-3.5" />
                              {confirmingGroupKey === group.key ? "확정 중" : "전체 확정"}
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 divide-y divide-[rgba(0,0,0,0.05)] overflow-hidden rounded-lg border border-[rgba(0,0,0,0.06)] bg-[#FAFAF8]">
                          {group.items.map((movement) => {
                            const confirmQty = Math.max(
                              1,
                              Math.min(movement.quantity, Math.floor(Number(confirmQtys[movement.id] ?? movement.quantity) || movement.quantity))
                            )
                            const stockRow = data?.stock.find((row) => row.itemId === movement.item_id || row.product === movement.product_name)
                            const plannedFifoPreview =
                              movement.lot_no || !stockRow ? null : previewFifoLots(stockRow.lotBalances, confirmQty)
                            const confirmResult = plannedConfirmResults[movement.id]
                            return (
                              <div
                                key={movement.id}
                                data-testid="hardware-planned-info-row"
                                data-movement-id={movement.id}
                                className="grid gap-2 px-3 py-2 md:grid-cols-[1fr_auto] md:items-center"
                              >
                                <div className="min-w-0">
                                  <p title={movement.product_name} className="truncate text-[12.5px] font-semibold text-[#111110]">
                                    {movement.product_name} <span className="tabular-nums text-[#7A520F]">· {formatNumber(movement.quantity)}대</span>
                                  </p>
                                  <p className="mt-1 truncate text-[11px] font-bold text-[#084734]">
                                    {movement.lot_no
                                      ? `지정 lot ${formatLotLabel(movement.lot_no) ?? movement.lot_no}`
                                      : plannedFifoPreview
                                        ? `FIFO 예상 ${plannedFifoPreview.plan.map((lot) => `${formatLotLabel(lot.lot) ?? lot.lot} ${formatNumber(lot.quantity)}대`).join(" · ")}${plannedFifoPreview.shortage > 0 ? ` · 부족 ${formatNumber(plannedFifoPreview.shortage)}대` : ""}`
                                        : "FIFO 예상 없음"}
                                  </p>
                                  {confirmResult && (
                                    <p className={`mt-1 truncate text-[11px] font-bold ${confirmResult.ok ? "text-[#084734]" : "text-[#8F2C2C]"}`}>
                                      {confirmResult.message}
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                  <input
                                    type="number"
                                    min={1}
                                    max={movement.quantity}
                                    value={confirmQtys[movement.id] ?? String(movement.quantity)}
                                    onChange={(event) => setConfirmQtys((current) => ({ ...current, [movement.id]: event.target.value }))}
                                    disabled={plannedConfirmLocked}
                                    aria-label="확정 수량"
                                    title="확정 수량 (부분 확정 가능)"
                                    className="h-8 w-14 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-center text-[11px] font-bold text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 disabled:cursor-not-allowed disabled:bg-[#F6F5F4] disabled:text-[#A39E98]"
                                  />
                                  <input
                                    type="date"
                                    value={confirmDates[movement.id] ?? todayKey()}
                                    onChange={(event) => setConfirmDates((current) => ({ ...current, [movement.id]: event.target.value }))}
                                    disabled={plannedConfirmLocked}
                                    aria-label="출고 확정일"
                                    title="출고 확정일"
                                    className="h-8 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[11px] font-semibold text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 disabled:cursor-not-allowed disabled:bg-[#F6F5F4] disabled:text-[#A39E98]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => editMovement(movement)}
                                    disabled={plannedConfirmLocked}
                                    className="cursor-pointer rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    수정
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void confirmPlannedMovement(movement)}
                                    disabled={plannedConfirmLocked}
                                    className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[#084734] px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <CheckCheck className="h-3.5 w-3.5" />
                                    {confirmingId === movement.id ? "확정 중" : "출고 확정"}
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <PaginationControls pagination={plannedPagination} label="딜" onPageChange={setPlannedPage} />
                </>
              )}
            </section>

            <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <SectionHeader
                title="현재 재고"
                description="최소재고와 최근 출고량을 같이 보고 주문 시점을 판단합니다."
                open={openSections.stock}
                onToggle={() => toggleSection("stock")}
                meta={
                  <div className="text-right text-[11px] text-[#615D59]">
                    <p>마지막 이관 {data?.importRun?.finished_at ? formatDate(data.importRun.finished_at) : "없음"}</p>
                    <p className="mt-0.5 font-semibold">{formatNumber(stockPagination.totalItems)}개 품목</p>
                  </div>
                }
              />
              {openSections.stock && (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-[860px] w-full border-collapse text-left">
                      <thead className="bg-[#F6F5F4] text-[11px] font-bold uppercase tracking-[0.05em] text-[#615D59]">
                        <tr>
                          <th scope="col" className="px-5 py-3">품목</th>
                          <th scope="col" className="px-4 py-3 text-right">실제</th>
                          <th scope="col" className="px-4 py-3 text-right">배송 예정</th>
                          <th scope="col" className="px-4 py-3 text-right">예상</th>
                          <th scope="col" className="px-4 py-3 text-right">30일</th>
                          <th scope="col" className="px-4 py-3 text-right">빠른 처리</th>
                          <th scope="col" className="px-5 py-3 text-right">상태</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[rgba(0,0,0,0.06)]">
                        {stockPagination.totalItems === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-5 py-10 text-center text-[13px] text-[#615D59]">
                              아직 하드웨어 원장 데이터가 없습니다. 시트 가져오기를 먼저 실행하세요.
                            </td>
                          </tr>
                        ) : (
                          stockPagination.pageItems.map((row) => (
                            <tr key={row.itemId} className="align-top transition-colors hover:bg-[#FAFAF8]">
                              <td className="px-5 py-3.5">
                                <p className="text-[13px] font-bold text-[#111110]">{row.product}</p>
                                <p className="mt-1 text-[11px] text-[#615D59]">
                                  {row.category ?? "미분류"} · 최소 {row.reorderPoint}대 · 리드타임 {row.leadTimeDays}일
                                </p>
                                {row.lotBalances.length > 0 && (
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {row.lotBalances.slice(0, 5).map((lot) => (
                                      <span key={lot.lot} className="rounded bg-[#F6F5F4] px-1.5 py-0.5 text-[11px] font-semibold text-[#31302E]">
                                        {formatLotLabel(lot.lot) ?? lot.lot} {formatNumber(lot.quantity)}
                                      </span>
                                    ))}
                                    {row.lotBalances.length > 5 && (
                                      <span className="rounded bg-[#ECFDF5] px-1.5 py-0.5 text-[11px] font-semibold text-[#084734]">
                                        +{row.lotBalances.length - 5}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-right text-[14px] font-bold tabular-nums text-[#111110]">
                                {formatNumber(row.warehouseStock)}
                              </td>
                              <td className="px-4 py-3.5 text-right text-[13px] font-semibold tabular-nums text-[#7A520F]">
                                {formatNumber(row.plannedOut)}
                              </td>
                              <td className="px-4 py-3.5 text-right text-[16px] font-bold tabular-nums tracking-[-0.02em] text-[#111110]">
                                {formatNumber(row.availableStock)}
                              </td>
                              <td className="px-4 py-3.5 text-right">
                                <p className="text-[13px] font-semibold tabular-nums text-[#111110]">{formatNumber(row.outbound30d)}</p>
                                <p className="mt-1 text-[11px] tabular-nums text-[#615D59]">주 {formatAvg(row.weeklyOutboundAvg)}대</p>
                              </td>
                              <td className="px-4 py-3.5 text-right">
                                <div className="inline-flex rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-0.5">
                                  <QuickMoveButton kind="sale" bare product={row.product} onClick={() => prepareQuickEntry(row.itemId, "sale")} />
                                  <QuickMoveButton kind="planned" bare product={row.product} onClick={() => prepareQuickEntry(row.itemId, "planned")} />
                                  <QuickMoveButton kind="inbound" bare product={row.product} onClick={() => prepareQuickEntry(row.itemId, "inbound")} />
                                </div>
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass(row)}`}>
                                  {statusCopy(row)}
                                </span>
                                {row.daysUntilStockout != null && (
                                  <p className="mt-1.5 text-[11px] text-[#615D59]">예상 {row.daysUntilStockout}일</p>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <PaginationControls pagination={stockPagination} label="품목" onPageChange={setStockPage} />
                </>
              )}
            </section>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <SectionHeader
                title="알림"
                description="부족, 주문 검토, 배송 예정 항목입니다."
                open={openSections.alerts}
                onToggle={() => toggleSection("alerts")}
                meta={<span className="text-[11px] font-semibold text-[#615D59]">{formatNumber(alertsPagination.totalItems)}건</span>}
              />
              {openSections.alerts && (
                <>
                  <div className="space-y-2 p-4">
                    {alertsPagination.totalItems === 0 ? (
                      <div className="rounded-lg bg-[#ECFDF5] px-4 py-3 text-[12px] font-semibold text-[#084734]">
                        현재 알림이 없습니다.
                      </div>
                    ) : (
                      alertsPagination.pageItems.map((alert) => (
                        <div key={alert.id} className={`rounded-lg border px-3 py-2.5 ${ALERT_TONE[alert.severity]}`}>
                          <p className="text-[12px] font-bold">{alert.product} · {alert.title}</p>
                          <p className="mt-1 text-[11px] opacity-95">{alert.detail}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <PaginationControls pagination={alertsPagination} label="건" onPageChange={setAlertsPage} />
                </>
              )}
            </section>

            <section className="min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <SectionHeader
                title="나간 기록"
                description="고객사 기준으로 최근 출고·배송 예정 물량이 어디로 갔는지 확인합니다."
                open={openSections.outbound}
                onToggle={() => toggleSection("outbound")}
                meta={<span className="text-[11px] font-semibold text-[#615D59]">{formatNumber(outboundPagination.totalItems)}건</span>}
              />
              {openSections.outbound && (
                <>
                  {outboundPagination.totalItems > 0 && (
                    <div className="hidden grid-cols-[1.1fr_1fr_120px] gap-3 border-b border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-[#615D59] md:grid">
                      <span>고객사</span>
                      <span>제품</span>
                      <span className="text-right">수량</span>
                    </div>
                  )}
                  <div className="divide-y divide-[rgba(0,0,0,0.06)]">
                    {outboundPagination.totalItems === 0 ? (
                      <p className="px-5 py-8 text-center text-[13px] text-[#615D59]">출고 기록이 없습니다.</p>
                    ) : (
                      outboundPagination.pageItems.map((movement) => (
                        <div key={movement.id} className="grid gap-3 px-5 py-3 md:grid-cols-[1.1fr_1fr_120px] md:items-center">
                          <div className="min-w-0">
                            <p title={movement.to_location ?? "도착지 미정"} className="truncate text-[13px] font-bold text-[#111110]">{movement.to_location ?? "도착지 미정"}</p>
                            <p className="mt-1 text-[11px] text-[#615D59]">
                              {formatDate(movement.occurred_at)} · {movement.owner ?? "담당자 미정"}
                            </p>
                          </div>
                          <p className="text-[12px] font-semibold text-[#31302E]">
                            {movement.product_name}
                            {movement.status ? <span className="ml-2 text-[#7A520F]">{movement.status}</span> : null}
                          </p>
                          <p className="text-right text-[14px] font-bold text-[#111110]">{formatNumber(movement.quantity)}대</p>
                        </div>
                      ))
                    )}
                  </div>
                  <PaginationControls pagination={outboundPagination} label="건" onPageChange={setOutboundPage} />
                </>
              )}
            </section>
            </div>
            </div>
            )}

            {activeTab === "entry" && (
            <div className="mt-6 space-y-5">
              <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-0.5">
                    <button
                      type="button"
                      onClick={() => setEntrySub("inbound")}
                      className={`cursor-pointer rounded-md px-3.5 py-1.5 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 ${
                        entrySub === "inbound" ? "bg-white text-[#084734] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#615D59] hover:text-[#111110]"
                      }`}
                    >
                      입고 · 물량번호
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntrySub("outbound")}
                      className={`cursor-pointer rounded-md px-3.5 py-1.5 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 ${
                        entrySub === "outbound" ? "bg-white text-[#084734] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#615D59] hover:text-[#111110]"
                      }`}
                    >
                      출고 · 기간 집계
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={openFreshSheet}
                    className="inline-flex items-center gap-1.5 cursor-pointer rounded-md bg-[#084734] px-3 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    빠른 기록
                  </button>
                </div>
              </section>

              {entrySub === "inbound" && (
                <section className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">입고 물량 (물량번호별)</p>
                      <p className="mt-1 text-[12px] text-[#615D59]">한 물량번호(lot)에 여러 품목이 함께 입고됩니다. 물량번호·품목으로 검색하세요. 매입 단가는 USD 기준이며, 본사 책정 CNY(위안)를 기준점으로 병기합니다.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="relative block">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
                        <input
                          value={inboundSearch}
                          onChange={(event) => setInboundSearch(event.target.value)}
                          aria-label="입고 lot 검색"
                          placeholder="물량번호·품목 검색"
                          className="h-9 w-full rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] pl-8 pr-3 text-[12.5px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 sm:w-[210px]"
                        />
                      </label>
                      <div className="flex gap-5">
                        <div className="text-right">
                          <p className="text-[11px] font-semibold text-[#615D59]">총 입고 <span className="font-normal text-[#A39E98]">(86·75·T1)</span></p>
                          <p className="mt-0.5 text-[17px] font-bold tracking-[-0.02em] tabular-nums text-[#111110]">{formatNumber(inboundLots.totalQty)}대</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-semibold text-[#615D59]">총 매입액 <span className="font-normal text-[#A39E98]">(86·75·T1)</span></p>
                          <p className="mt-0.5 text-[17px] font-bold tracking-[-0.02em] tabular-nums text-[#084734]">
                            {inboundLots.hasAnyAmount ? formatCurrency(inboundLots.totalAmount, "USD") : "-"}
                          </p>
                          {inboundLots.hasAnyCny ? (
                            <p className="mt-0.5 text-[11.5px] font-semibold tabular-nums text-[#A39E98]">{formatCurrency(inboundLots.totalCny, "CNY")}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    {inboundLots.lots.map((lot) => (
                      <div key={lot.lot} className="border-t border-[rgba(0,0,0,0.06)] px-5 py-4 first:border-t-0">
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="inline-flex rounded-md bg-[#ECFDF5] px-2.5 py-1 text-[14px] font-bold tracking-[0.02em] text-[#084734]">{lot.displayLot}</span>
                            <span className="text-[12px] text-[#615D59]">
                              {lot.date} · {lot.importer ?? "수입자 미상"} · {formatNumber(lot.items.length)}개 품목
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-[12px] font-semibold text-[#615D59]">
                              총 <span className="font-bold tabular-nums text-[#111110]">{formatNumber(lot.totalQty)}대</span>
                            </span>
                            <span className="flex flex-col items-end leading-tight tabular-nums">
                              <span className="text-[13px] font-bold text-[#084734]">{lot.hasAmount ? formatCurrency(lot.totalAmount, "USD") : "-"}</span>
                              {lot.hasCny ? <span className="mt-0.5 text-[11px] font-semibold text-[#A39E98]">{formatCurrency(lot.totalCny, "CNY")}</span> : null}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2.5 overflow-x-auto rounded-lg border border-[rgba(0,0,0,0.06)]">
                          <div className="min-w-[520px]">
                            <div className="grid grid-cols-[1.6fr_80px_110px_120px] gap-2.5 bg-[#F6F5F4] px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#615D59]">
                              <span>품목</span>
                              <span className="text-right">수량</span>
                              <span className="text-right">단가</span>
                              <span className="text-right">금액</span>
                            </div>
                            {lot.items.map((item) => (
                              <div key={item.id} className="grid grid-cols-[1.6fr_80px_110px_120px] items-center gap-2.5 border-t border-[rgba(0,0,0,0.05)] px-3.5 py-2">
                                <span title={item.product_name} className="truncate text-[12.5px] font-semibold text-[#111110]">{item.product_name}</span>
                                <span className="text-right text-[13px] font-bold tabular-nums text-[#111110]">{formatNumber(item.quantity)}대</span>
                                <span className="flex flex-col items-end leading-tight tabular-nums">
                                  <span className="text-[12px] text-[#615D59]">{item.unit_price != null ? formatCurrency(item.unit_price, "USD") : "-"}</span>
                                  {item.amount_cny != null && item.quantity ? (
                                    <span className="mt-0.5 text-[10.5px] text-[#A39E98]">{formatCurrency(item.amount_cny / item.quantity, "CNY")}</span>
                                  ) : null}
                                </span>
                                <span className="flex flex-col items-end leading-tight tabular-nums">
                                  <span className="text-[12.5px] font-bold text-[#084734]">{item.amount_usd != null ? formatCurrency(item.amount_usd, "USD") : "-"}</span>
                                  {item.amount_cny != null ? (
                                    <span className="mt-0.5 text-[10.5px] font-semibold text-[#A39E98]">{formatCurrency(item.amount_cny, "CNY")}</span>
                                  ) : null}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                    {inboundLots.lots.length === 0 && (
                      <p className="px-5 py-10 text-center text-[13px] text-[#615D59]">
                        {inboundSearch.trim() ? "검색 결과가 없습니다." : "입고 기록이 없습니다. 빠른 기록에서 입고를 등록하거나 시트를 가져오세요."}
                      </p>
                    )}
                  </div>
                </section>
              )}

              {entrySub === "outbound" && (
                <section className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
                    <div>
                      <p className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">기간별 출고 집계</p>
                      <p className="mt-1 text-[12px] text-[#615D59]">확정 출고(샘플·수리 제외) 기준 기간 집계. 행을 열면 고객사별 출고·매출이 펼쳐지고, 고객사를 누르면 거래이력이 열립니다. 매출은 실판매(Sales) 기준이며 시트 재가져오기 후 반영됩니다. 분기는 회계연도(4월 시작~3월 종료) 기준입니다.</p>
                    </div>
                    <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-0.5">
                      {([["month", "월"], ["quarter", "분기"], ["year", "연"]] as const).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setOutPeriod(key)}
                          className={`cursor-pointer rounded-md px-3.5 py-1.5 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 ${
                            outPeriod === key ? "bg-white text-[#084734] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#615D59] hover:text-[#111110]"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    {outboundBuckets.map((bucket) => {
                      const open = Boolean(openPeriods[bucket.key])
                      return (
                        <div key={bucket.key} className="border-t border-[rgba(0,0,0,0.06)] first:border-t-0">
                          <button
                            type="button"
                            onClick={() => setOpenPeriods((current) => ({ ...current, [bucket.key]: !current[bucket.key] }))}
                            className="block w-full cursor-pointer px-5 py-4 text-left transition hover:bg-[#FAFAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-[#A39E98] transition-transform ${open ? "rotate-90" : ""}`} />
                                <p className="text-[13px] font-bold text-[#111110]">{bucket.label}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-3">
                                <span className="text-[12px] font-semibold tabular-nums text-[#615D59]">{formatNumber(bucket.total)}대</span>
                                <span className="min-w-[64px] text-right text-[13px] font-bold tabular-nums text-[#084734]">{bucket.hasRevenue ? formatCurrency(bucket.revenue, "USD") : "-"}</span>
                              </div>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F6F5F4]">
                              <div className="h-full rounded-full bg-[#B43E3E]" style={{ width: bucket.pct }} />
                            </div>
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {bucket.chips.map((chip) => (
                                <span key={chip.product} className="inline-flex items-center gap-1.5 rounded-full bg-[#F6F5F4] px-2.5 py-1 text-[11px] font-semibold text-[#31302E]">
                                  {chip.product}
                                  <span className="font-bold tabular-nums text-[#111110]">{formatNumber(chip.qty)}</span>
                                </span>
                              ))}
                            </div>
                            {bucket.typeChips.length > 1 || (bucket.typeChips[0] && bucket.typeChips[0].type !== "sales") ? (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {bucket.typeChips.map((entry) => (
                                  <span key={entry.type} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${SALE_TYPE_META[entry.type].tone}`}>
                                    {entry.label}
                                    <span className="tabular-nums">{formatNumber(entry.qty)}</span>
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </button>
                          {open && (
                            <div className="px-5 pb-4">
                              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#615D59]">고객사별 모음</p>
                              <div className="overflow-hidden rounded-lg border border-[rgba(0,0,0,0.06)]">
                                <div className="grid grid-cols-[minmax(0,1fr)_58px_40px_88px] gap-2.5 bg-[#F6F5F4] px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#615D59]">
                                  <span>고객사</span>
                                  <span>날짜</span>
                                  <span className="text-right">수량</span>
                                  <span className="text-right">매출</span>
                                </div>
                                {bucket.customers.map((customer) => (
                                  <button
                                    key={customer.name}
                                    type="button"
                                    onClick={() => setCustomerDetail(customer.name)}
                                    className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_58px_40px_88px] items-center gap-2.5 border-t border-[rgba(0,0,0,0.05)] px-3.5 py-2 text-left transition hover:bg-[#FAFAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40"
                                  >
                                    <span title={customer.name} className="truncate text-[12.5px] font-semibold text-[#111110]">{customer.name}</span>
                                    <span className="truncate text-[12px] tabular-nums text-[#615D59]">{customer.dateLabel}</span>
                                    <span className="text-right text-[13px] font-bold tabular-nums text-[#111110]">{formatNumber(customer.qty)}대</span>
                                    <span className="text-right text-[12.5px] font-bold tabular-nums text-[#084734]">{customer.hasRevenue ? formatCurrency(customer.revenue, "USD") : "-"}</span>
                                  </button>
                                ))}
                                <div className="grid grid-cols-[minmax(0,1fr)_58px_40px_88px] items-center gap-2.5 border-t border-[rgba(0,0,0,0.1)] bg-[#FAFAF8] px-3.5 py-2.5">
                                  <span className="text-[12px] font-bold text-[#111110]">전체 합계</span>
                                  <span aria-hidden />
                                  <span className="text-right text-[13px] font-bold tabular-nums text-[#111110]">{formatNumber(bucket.total)}대</span>
                                  <span className="text-right text-[12.5px] font-bold tabular-nums text-[#084734]">{bucket.hasRevenue ? formatCurrency(bucket.revenue, "USD") : "-"}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {outboundBuckets.length === 0 && (
                      <p className="px-5 py-10 text-center text-[13px] text-[#615D59]">해당 기간 확정 출고 집계가 없습니다.</p>
                    )}
                  </div>
                </section>
              )}

              <div className="flex justify-end">
                <button type="button" onClick={() => setActiveTab("history")} className="-mx-2 cursor-pointer rounded px-2 py-1 text-[11px] font-bold text-[#084734] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40">
                  전체 내역 →
                </button>
              </div>
            </div>
            )}

            <AnimatePresence>
            {sheetOpen && (
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
                        <p className="mt-0.5 text-[11px] font-semibold text-[#084734]">
                          {activePreset.label} · {activePreset.from || "-"} → {activePreset.to || "고객사 입력"}
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
                    {!editingId && (
                      <div className="mt-3 inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-0.5" role="tablist" aria-label="기록 모드">
                        {([["single", "단건 기록"], ["batch", "작업건 구성"]] as const).map(([mode, label]) => (
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
                  </div>
                  <form
                    ref={formRef}
                    onSubmit={(event) => void submitMovement(event)}
                    onKeyDown={(event) => {
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
                    {sheetMode === "single" && quickCart.length > 0 && !editingId && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-3 py-2">
                        <span className="text-[12px] font-semibold text-[#615D59]">
                          저장 대기 바구니 {formatNumber(quickCart.length)}건 · {formatNumber(quickCartTotals.quantity)}대
                        </span>
                        <button
                          type="button"
                          onClick={() => setSheetMode("batch")}
                          className="cursor-pointer rounded-md px-2 py-1 text-[12px] font-bold text-[#084734] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
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
                    ) : (
                    <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                      {ENTRY_PRESETS.map((option) => {
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
                    )}

                    {sheetMode === "batch" && !editingId && !quickCartEnabled && (
                      <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-3 py-2.5 text-[12px] font-semibold text-[#615D59]">
                        반납·이동·수리·조정은 배치 담기를 지원하지 않습니다 — 단건 기록 모드로 저장하세요.
                      </div>
                    )}
                    {sheetMode === "batch" && quickCartEnabled && (
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

                    <div className={customProduct.trim() ? "opacity-90" : undefined}>
                      <span className={SHEET_LABEL_CLASS}>품목</span>
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
                                {row.product} · 예상 {formatNumber(row.availableStock)}
                              </button>
                            )
                          })}
                        </div>
                      )}
                      <select
                        value={selectedItemId}
                        onChange={(event) => {
                          setSelectedItemId(event.target.value)
                          setCustomProduct("")
                        }}
                        aria-label="전체 품목에서 선택"
                        disabled={Boolean(customProduct.trim())}
                        className="mt-2 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] font-semibold text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {(data?.items ?? []).map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
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

                    <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                      <div>
                        <span id="hardware-quantity-label" className={SHEET_LABEL_CLASS}>수량</span>
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
                      <label className="block">
                        <span className={SHEET_LABEL_CLASS}>처리일</span>
                        <input
                          type="date"
                          value={occurredAt}
                          onChange={(event) => setOccurredAt(event.target.value)}
                          className={SHEET_INPUT_CLASS}
                        />
                      </label>
                    </div>
                    {availabilityWarning && (
                      <div className="rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[11px] font-bold text-[#7A520F]">
                        {availabilityWarning}
                      </div>
                    )}

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
                      <label className="block">
                        <span className={SHEET_LABEL_CLASS}>
                          {movementType === "outbound" ? "도착 (고객사)" : "도착"}
                        </span>
                        <input
                          value={toLocation}
                          onChange={(event) => setToLocation(event.target.value)}
                          placeholder={movementType === "outbound" ? "고객사명 — 예: 남명학원" : "창고/샘플/사무실"}
                          list={movementType === "outbound" ? "hardware-customer-options" : "hardware-location-options"}
                          className={SHEET_INPUT_CLASS}
                        />
                      </label>
                    </div>

                    {movementType === "inbound" && (
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
                    {movementType === "inbound" && !editingId && (
                      <div className="rounded-lg border border-[#BDEFD8] bg-[#ECFDF5] px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-[12px] font-bold text-[#084734]">입고 lot 도우미</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-[#615D59]">
                              lot·입고일·수입자·보관 장소를 공유해 여러 품목을 담습니다.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => setLotNo(nextLotSuggestion)}
                              className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-[#BDEFD8] bg-white px-2.5 text-[11px] font-bold text-[#084734] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100"
                            >
                              {nextLotSuggestion} 적용
                            </button>
                            <button
                              type="button"
                              onClick={copyLatestInboundLotToCart}
                              className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-[#BDEFD8] bg-white px-2.5 text-[11px] font-bold text-[#084734] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100"
                            >
                              이전 구성 복사
                            </button>
                          </div>
                        </div>
                      </div>
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

                    {movementType === "inbound" && (
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
                        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                          <label className="block">
                            <span className={SHEET_LABEL_CLASS}>담당자</span>
                            <input
                              value={owner}
                              onChange={(event) => setOwner(event.target.value)}
                              placeholder="자동 기억됨"
                              className={SHEET_INPUT_CLASS}
                            />
                          </label>
                          <label className="block">
                            <span className={SHEET_LABEL_CLASS}>상태</span>
                            <input
                              value={status}
                              onChange={(event) => setStatus(event.target.value)}
                              className={SHEET_INPUT_CLASS}
                            />
                          </label>
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

                    <datalist id="hardware-customer-options">
                      {historyCustomers.map((customer) => (
                        <option key={customer} value={customer} />
                      ))}
                    </datalist>

                    {(sheetMode === "single" || Boolean(editingId)) && (
                      <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-3 py-2.5">
                        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#615D59]">입력 미리보기</p>
                        <p className="mt-1 text-[13px] font-bold text-[#111110]">
                          {customProduct.trim() || selectedItem?.name || "품목 선택"} · {activePreset.label} · {formatNumber(Number(quantity) || 0)}대
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-[#615D59]">
                          {fromLocation || "-"} → {toLocation || (movementType === "outbound" ? "고객사 미입력" : "-")} · {status || "상태 미정"}
                          {owner.trim() ? ` · ${owner.trim()}` : ""}
                        </p>
                      </div>
                    )}

                    {sheetMode === "batch" && !editingId && (
                      <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
                        <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1.5 ${SHEET_SECTION_TITLE_CLASS}`}>
                            <ShoppingCart className="h-3.5 w-3.5 text-[#084734]" />
                            기록 바구니
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
                              const linePlanned = /예정|예약|대기/.test(draft.status)
                              return (
                                <div key={`${draft.productName}-${index}`} className={`grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2 ${lineError ? "bg-[#FCE9E9]/50" : ""}`}>
                                  <div className="min-w-0">
                                    <p className="truncate text-[12px] font-bold text-[#111110]">{draft.productName}</p>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[#615D59]">
                                      <span>{MOVEMENT_LABEL[draft.movementType]} · {formatNumber(draft.quantity)}대 · {draft.toLocation || "-"}</span>
                                      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                        linePlanned ? "bg-[#FBF1E0] text-[#A8741A]" : "bg-[#F6F5F4] text-[#31302E]"
                                      }`}>
                                        {draft.status || MOVEMENT_LABEL[draft.movementType]}
                                      </span>
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
                        {quickCart.some((draft) => draft.movementType === "outbound" && !/예정|예약|대기/.test(draft.status)) && (
                          <div className="border-t border-[rgba(0,0,0,0.06)] bg-[#FBF1E0] px-3 py-2 text-[11px] font-bold text-[#7A520F]">
                            완료 출고 배치 저장은 CRM 오더 연동·매출 금액 없이 저장됩니다 — 연동이 필요한 판매 건은 단건 기록으로 저장하세요.
                          </div>
                        )}
                      </div>
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
                            현재 입력 담기
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
                            disabled={busy != null || (!customProduct.trim() && !selectedItem)}
                            className="inline-flex h-11 flex-1 items-center justify-center gap-2 cursor-pointer rounded-md bg-[#084734] px-4 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 sm:h-10"
                          >
                            <Save className="h-4 w-4" />
                            {busy === "movement" ? "저장 중" : editingId ? "수정 저장" : "기록 저장"}
                          </button>
                        </div>
                      )}
                    </div>
                  </form>
                </motion.aside>
              </motion.div>
            )}
            </AnimatePresence>

            {activeTab === "history" && (
            <div className="mt-6 space-y-4">
                <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="relative block min-w-[240px] flex-1 sm:max-w-[440px]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A39E98]" />
                      <input
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value)
                          setMovementsPage(1)
                        }}
                        aria-label="하드웨어 원장 검색"
                        placeholder="품목·고객사·물량번호·담당자·특이사항 검색"
                        className="h-10 w-full rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] pl-9 pr-3 text-[13px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                      />
                    </label>
                    {hasHistoryFilter && (
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryType("all")
                          setProductFilter("")
                          setLotFilter("")
                          setCustomerFilter("")
                          setSearch("")
                          setMovementsPage(1)
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4]"
                      >
                        <X className="h-3.5 w-3.5" />
                        필터 초기화
                      </button>
                    )}
                  </div>
                  <div className="mt-3.5 flex flex-wrap items-center gap-2">
                    <span className="inline-flex w-12 shrink-0 items-center gap-1.5 text-[12px] font-bold text-[#111110]">
                      <Filter className="h-3.5 w-3.5 text-[#615D59]" />
                      유형
                    </span>
                    {(["all", "inbound", "outbound", "sample", "return", "transfer", "repair", "adjust"] as const).map((type) => {
                      const active = historyType === type
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setHistoryType(type)
                            setMovementsPage(1)
                          }}
                          className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                            active
                              ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                              : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                          }`}
                        >
                          {type === "all" ? "전체" : type === "sample" ? "샘플" : MOVEMENT_LABEL[type]}
                        </button>
                      )
                    })}
                    <span className="ml-auto inline-flex items-center gap-1.5">
                      {(["desc", "asc"] as const).map((order) => {
                        const active = historySort === order
                        return (
                          <button
                            key={order}
                            type="button"
                            onClick={() => {
                              setHistorySort(order)
                              setMovementsPage(1)
                            }}
                            className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                              active
                                ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                                : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                            }`}
                          >
                            {order === "desc" ? "최신순" : "오래된순"}
                          </button>
                        )
                      })}
                    </span>
                  </div>
                  {(data?.stock ?? []).length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span className="w-12 shrink-0 text-[12px] font-bold text-[#111110]">제품</span>
                      <button
                        type="button"
                        onClick={() => {
                          setProductFilter("")
                          setMovementsPage(1)
                        }}
                        className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                          productFilter === ""
                            ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                            : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                        }`}
                      >
                        전체
                      </button>
                      {PRODUCT_FILTER_OPTIONS.map((option) => {
                        const active = productFilter === option.key
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => {
                              setProductFilter(active ? "" : option.key)
                              setMovementsPage(1)
                            }}
                            className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                              active
                                ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                                : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                            }`}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                  {historyLots.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span className="shrink-0 text-[12px] font-bold text-[#111110]">물류No</span>
                      <button
                        type="button"
                        onClick={() => {
                          setLotFilter("")
                          setMovementsPage(1)
                        }}
                        className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                          lotFilter === ""
                            ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                            : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                        }`}
                      >
                        전체
                      </button>
                      {historyLots.map((lot) => {
                        const active = lotFilter === lot
                        return (
                          <button
                            key={lot}
                            type="button"
                            onClick={() => {
                              setLotFilter(active ? "" : lot)
                              setMovementsPage(1)
                            }}
                            className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                              active
                                ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                                : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                            }`}
                          >
                            {formatLotLabel(lot) ?? lot}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                  {historyCustomers.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span className="w-12 shrink-0 text-[12px] font-bold text-[#111110]">고객사</span>
                      <div className="relative">
                        <select
                          value={customerFilter}
                          onChange={(event) => {
                            setCustomerFilter(event.target.value)
                            setMovementsPage(1)
                          }}
                          aria-label="고객사 필터"
                          className={`h-8 w-full min-w-[180px] max-w-[240px] cursor-pointer appearance-none rounded-full border pl-3 pr-8 text-[11px] font-bold outline-none transition focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 ${
                            customerFilter ? "border-[#084734] bg-[#ECFDF5] text-[#084734]" : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E]"
                          }`}
                        >
                          <option value="">전체 고객사 ({formatNumber(historyCustomers.length)})</option>
                          {historyCustomers.map((customer) => (
                            <option key={customer} value={customer}>
                              {customer}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className={`pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${customerFilter ? "text-[#084734]" : "text-[#615D59]"}`} />
                      </div>
                      {customerFilter ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setCustomerDetail(customerFilter)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2.5 py-1.5 text-[11px] font-bold text-[#084734] transition hover:bg-[#d6f7e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100"
                          >
                            <Users className="h-3 w-3" />
                            거래이력
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomerFilter("")
                              setMovementsPage(1)
                            }}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100"
                          >
                            <X className="h-3 w-3" />
                            해제
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <section className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">상세 내역 (로그)</p>
                      <p className="mt-1 text-[12px] text-[#615D59]">고객사·날짜(배송 건)로 묶었습니다. 여러 건은 헤더를 클릭하면 하위 품목이 펼쳐지고, 단일 건·하위 행은 클릭하면 상세와 CRM 연계가 열립니다.</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] font-semibold text-[#615D59]">{formatNumber(filteredMovements.length)}건 · {formatNumber(logGroups.length)}묶음</span>
                      {pageLogGroupKeys.length > 0 ? (
                        <button
                          type="button"
                          onClick={toggleAllPageLogGroups}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100"
                        >
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${allPageGroupsExpanded ? "rotate-180" : ""}`} />
                          {allPageGroupsExpanded ? "모두 접기" : "모두 펼치기"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="min-w-[940px]">
                      <div className="grid grid-cols-[84px_1.5fr_1.2fr_96px_84px_1.4fr_92px_22px] items-center gap-3 bg-[#F6F5F4] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#615D59]">
                        <span>물량번호</span>
                        <span>고객사</span>
                        <span>품목 · 수량</span>
                        <span>날짜</span>
                        <span>담당자</span>
                        <span>특이사항</span>
                        <span className="text-right">유형</span>
                        <span />
                      </div>
                      {logGroupsPagination.pageItems.map((group) => {
                        const isSingle = group.movements.length === 1
                        const expanded = !isSingle && expandedLogGroups.has(group.key)
                        const typeList = Array.from(group.types)
                        // 물량번호 배지: 모든 건이 같은 단일 lot이면 그 lot(예: H8), 섞였거나 미지정 포함이면 "N건".
                        const soleLot = !group.hasMissingLot && group.lots.size === 1 ? Array.from(group.lots)[0] : null
                        const singleMovement = group.movements[0]
                        return (
                          <div key={group.key} className="border-t border-[rgba(0,0,0,0.06)]">
                            <div
                              role="button"
                              tabIndex={0}
                              aria-expanded={isSingle ? undefined : expanded}
                              onClick={() => (isSingle ? setDetailId(singleMovement.id) : toggleLogGroup(group.key))}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault()
                                  if (isSingle) setDetailId(singleMovement.id)
                                  else toggleLogGroup(group.key)
                                }
                              }}
                              className={`grid cursor-pointer grid-cols-[84px_1.5fr_1.2fr_96px_84px_1.4fr_92px_22px] items-center gap-3 px-5 py-3 transition hover:bg-[#F1F0EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 ${
                                expanded ? "bg-[#F6F5F4]" : "bg-white"
                              }`}
                            >
                              <span>
                                {soleLot ? (
                                  <span className="inline-flex items-center rounded bg-[#ECFDF5] px-1.5 py-0.5 text-[11px] font-bold text-[#084734]">{soleLot}</span>
                                ) : (
                                  <span className="inline-flex items-center rounded bg-[#EDECEA] px-1.5 py-0.5 text-[11px] font-bold text-[#615D59]">{formatNumber(group.movements.length)}건</span>
                                )}
                              </span>
                              <span className="min-w-0">
                                <span title={group.customer} className="block truncate text-[12.5px] font-bold text-[#111110]">{group.customer}</span>
                                <span title={group.products.join(" · ")} className="mt-0.5 block truncate text-[11px] text-[#615D59]">{group.products.join(" · ")}</span>
                              </span>
                              <span className="min-w-0 text-[11px] tabular-nums text-[#615D59]">
                                {formatNumber(group.products.length)}품목 · 총 {formatNumber(group.totalQty)}대
                              </span>
                              <span className="text-[11.5px] text-[#31302E]">{formatDate(group.date)}</span>
                              <span title={group.owners.join(", ")} className="truncate text-[11.5px] text-[#31302E]">{group.owners.join(", ") || "-"}</span>
                              <span className="flex flex-wrap items-center gap-1">
                                {group.plannedQty > 0 ? (
                                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[#FBF1E0] px-1.5 py-0.5 text-[10px] font-bold text-[#A8741A]">
                                    <Clock3 className="h-2.5 w-2.5" />
                                    예정 {formatNumber(group.plannedQty)}
                                  </span>
                                ) : null}
                                {group.hasMissingLot ? (
                                  <span className="inline-flex rounded-full border border-dashed border-[rgba(0,0,0,0.12)] bg-[#F6F5F4] px-1.5 py-0.5 text-[10px] font-bold text-[#A39E98]">
                                    {isSingle ? "물량번호 미지정" : "미지정 포함"}
                                  </span>
                                ) : null}
                              </span>
                              <span className="flex flex-wrap items-center justify-end gap-1">
                                {typeList.map((type) => (
                                  <span key={type} className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${MOVEMENT_TONE[type]}`}>
                                    {MOVEMENT_LABEL[type]}
                                  </span>
                                ))}
                              </span>
                              <span className="text-[#615D59]">
                                {isSingle ? (
                                  <ChevronRight className="h-3.5 w-3.5 text-[#A39E98]" />
                                ) : (
                                  <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                                )}
                              </span>
                            </div>
                            {expanded ? group.movements.map((movement) => renderMovementRow(movement, true)) : null}
                          </div>
                        )
                      })}
                      {logGroupsPagination.totalItems === 0 && (
                        <p className="px-5 py-10 text-center text-[13px] text-[#615D59]">입출고 기록이 없습니다.</p>
                      )}
                    </div>
                  </div>
                  <PaginationControls pagination={logGroupsPagination} label="묶음" onPageChange={setMovementsPage} />
                </section>
            </div>
            )}
          </>
        )}
      </main>

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
                    {detailCrm.reference ? (
                      <p className="px-4 py-3 text-[12px] text-[#31302E]">
                        참조 <span className="font-bold text-[#111110]">{detailCrm.reference}</span>
                      </p>
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

      <AnimatePresence>
        {customerHistory && (
          <motion.div
            key="customer-sheet"
            className="fixed inset-0 z-[46] flex justify-end bg-black/35 backdrop-blur-[2px]"
            onClick={() => setCustomerDetail(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.16 }}
          >
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="고객사 거래이력"
              onClick={(event) => event.stopPropagation()}
              className="flex h-full w-full flex-col overflow-y-auto border-l border-[rgba(0,0,0,0.08)] bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.06)] sm:max-w-[480px]"
              initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
              animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
            >
              <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] bg-white px-5 py-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#615D59]">
                    <Users className="h-3.5 w-3.5" />
                    고객사 거래이력
                  </p>
                  <p className="mt-1 truncate text-[16px] font-bold tracking-[-0.01em] text-[#111110]">{customerHistory.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomerDetail(null)}
                  aria-label="닫기"
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-4 p-5">
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-[#615D59]">거래 건수</p>
                    <p className="mt-0.5 text-[16px] font-bold tabular-nums text-[#111110]">{formatNumber(customerHistory.count)}</p>
                  </div>
                  <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-[#615D59]">총 수량</p>
                    <p className="mt-0.5 text-[16px] font-bold tabular-nums text-[#111110]">{formatNumber(customerHistory.totalQty)}대</p>
                  </div>
                  <div className="rounded-lg border border-[#BDEFD8] bg-[#ECFDF5] px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-[#065c41]">총 매출</p>
                    <p className="mt-0.5 text-[15px] font-bold tabular-nums text-[#084734]">{customerHistory.hasRevenue ? formatCurrency(customerHistory.totalRevenue, "USD") : "-"}</p>
                  </div>
                </div>

                {!customerHistory.hasRevenue ? (
                  <p className="rounded-lg bg-[#F6F5F4] px-3 py-2 text-[11px] font-semibold text-[#615D59]">매출은 실판매 기준이며, 시트 재가져오기 후 반영됩니다.</p>
                ) : null}

                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#615D59]">거래 타임라인</p>
                  <div className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)]">
                    {customerHistory.rows.map((movement) => {
                      const saleType = outboundSaleType(movement)
                      return (
                        <button
                          key={movement.id}
                          type="button"
                          onClick={() => {
                            setCustomerDetail(null)
                            setDetailId(movement.id)
                          }}
                          className="grid w-full cursor-pointer grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-[rgba(0,0,0,0.06)] px-3.5 py-2.5 text-left transition first:border-t-0 hover:bg-[#FAFAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40"
                        >
                          <span className="text-[11px] font-semibold tabular-nums text-[#615D59]">{formatDate(movement.occurred_at)}</span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[12.5px] font-bold text-[#111110]">{movement.product_name}</span>
                              <span className={`inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${MOVEMENT_TONE[movement.movement_type]}`}>{MOVEMENT_LABEL[movement.movement_type]}</span>
                              {saleType && saleType !== "sales" ? (
                                <span className={`inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${SALE_TYPE_META[saleType].tone}`}>{SALE_TYPE_META[saleType].label}</span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block text-[11px] tabular-nums text-[#615D59]">
                              {formatNumber(movement.quantity)}대{movement.status ? ` · ${movement.status}` : ""}
                            </span>
                          </span>
                          <span className="text-right text-[12px] font-bold tabular-nums text-[#084734]">
                            {movement.movement_type === "outbound" && movement.amount_usd != null ? formatCurrency(movement.amount_usd, "USD") : ""}
                          </span>
                        </button>
                      )
                    })}
                    {customerHistory.rows.length === 0 ? (
                      <p className="px-3.5 py-8 text-center text-[12px] text-[#615D59]">거래 기록이 없습니다.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {!sheetOpen && !pendingMovement && !voidTarget && !detailId && !customerDetail && (
        <button
          type="button"
          onClick={openFreshSheet}
          className="fixed bottom-6 right-6 z-30 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#084734] px-4 py-3 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition hover:bg-[#065c41] hover:shadow-[0_4px_14px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8] active:scale-95 motion-reduce:active:scale-100"
          aria-label="빠른 기록 열기"
          style={{ bottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))" }}
        >
          <Plus className="h-4 w-4" />
          빠른 기록
        </button>
      )}

      {voidTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-3 py-4 backdrop-blur-[2px] sm:items-center"
          onClick={() => voidingId == null && setVoidTarget(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="기록 취소"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
          >
            <div className="border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
              <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">기록 취소</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-[#615D59]">
                {voidTarget.product_name} · {MOVEMENT_LABEL[voidTarget.movement_type]} {formatNumber(voidTarget.quantity)}대를 취소합니다. 되돌릴 수 없습니다.
              </p>
            </div>
            <div className="px-5 py-4">
              <label className="block">
                <span className="text-[11px] font-bold text-[#615D59]">취소 사유 (선택)</span>
                <input
                  value={voidReason}
                  onChange={(event) => setVoidReason(event.target.value)}
                  autoFocus
                  placeholder="예: 중복 입력"
                  className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                />
              </label>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                disabled={voidingId != null}
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-4 text-[13px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => void confirmVoid()}
                disabled={voidingId != null}
                className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-[#B43E3E] px-4 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#9A3434] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B43E3E]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {voidingId != null ? "취소 중" : "기록 취소"}
              </button>
            </div>
          </section>
        </div>
      )}

      {pendingMovement && (
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
                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => {
                            setSelectedCrmCandidateId(candidate.id)
                            setCrmAutoReflect(true)
                          }}
                          className={`w-full cursor-pointer rounded-lg border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.99] motion-reduce:active:scale-100 ${
                            selected
                              ? "border-[#084734] bg-[#ECFDF5]"
                              : "border-[rgba(0,0,0,0.08)] bg-white hover:bg-[#F6F5F4]"
                          }`}
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
                          <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#084734]">
                            <Link2 className="h-3.5 w-3.5" />
                            {candidate.reason}
                            {candidate.href ? (
                              <span className="inline-flex items-center gap-1 text-[#615D59]">
                                <ExternalLink className="h-3 w-3" />
                                CRM에서 확인 가능
                              </span>
                            ) : null}
                          </span>
                        </button>
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
      )}
    </div>
  )
}
