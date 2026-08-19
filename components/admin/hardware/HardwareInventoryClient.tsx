"use client"

import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Camera,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileSpreadsheet,
  Filter,
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

import { adminFetch, adminFetchJson, adminFetchJsonCached, clearAdminRequestCache } from "@/lib/admin-client"
import { paginateAdminList } from "@/lib/admin-list-pagination"
import { fiscalQuarter } from "@/lib/branch/fiscal"
import CategoryCardsSection from "@/components/admin/hardware/inventory/CategoryCardsSection"
import ImportFreshnessStrip from "@/components/admin/hardware/inventory/ImportFreshnessStrip"
import SalesPeriodSummary from "@/components/admin/hardware/inventory/SalesPeriodSummary"
import HardwareSearchPanel from "@/components/admin/hardware/inventory/HardwareSearchPanel"
import LocationMapSection from "@/components/admin/hardware/inventory/LocationMapSection"
import PlannedOutboundPanel from "@/components/admin/hardware/inventory/PlannedOutboundPanel"
import StockLevelsSection from "@/components/admin/hardware/inventory/StockLevelsSection"
import AlertsOutboundSections from "@/components/admin/hardware/inventory/AlertsOutboundSections"
import MovementDetailSheet from "@/components/admin/hardware/inventory/MovementDetailSheet"
import CustomerHistorySheet from "@/components/admin/hardware/inventory/CustomerHistorySheet"
import SampleTrackerSection from "@/components/admin/hardware/inventory/SampleTrackerSection"
import SampleUnitSheet from "@/components/admin/hardware/inventory/SampleUnitSheet"
import {
  elapsedDaysSince,
  formatCurrency,
  formatDate,
  formatLotLabel,
  formatNumber,
  hardwareCardGroup,
  isCoreIfpProduct,
  isPlannedMovement,
  isPromotedProduct,
  lotFifoRank,
  MOVEMENT_LABEL,
  MOVEMENT_TONE,
  outboundSaleType,
  previewFifoLots,
  SALE_TYPE_META,
  todayKey,
  UNSPECIFIED_CUSTOMER,
  type HardwareCardGroup,
  type HardwareCrmOrderCandidate,
  type HardwareDashboard,
  type HardwareItem,
  type HardwareMovement,
  type HardwareMovementDraft,
  type HardwareMovementType,
  type HardwareSampleEvent,
  type HardwareSampleUnit,
  type HardwareSectionKey,
  type HardwareStockRow,
  type HardwareTab,
  type OutboundSaleType,
  type PeriodGranularity,
  type ProductFilterKey,
} from "./inventory/shared"

interface HardwareCrmOrderCandidatesResponse {
  candidates: HardwareCrmOrderCandidate[]
  warnings: string[]
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
  // 샘플 모델(사용자 확정): 샘플 총량 = 사무실(남은 샘플) + 샘플(나간 샘플).
  //   샘플 배정(창고→사무실)으로 판매 재고를 샘플 재고로 전환 → 샘플 대여(사무실→샘플, 없으면 창고→샘플)로 내보냄 →
  //   샘플 반환(샘플→사무실)으로 회수. return은 repository에서 from −qty / to +qty라 위치 조합만으로 표현된다.
  { key: "sale", movementType: "outbound", label: "판매 출고", description: "고객 판매 완료", icon: ArrowUpFromLine, from: "창고", to: "", status: "출고" },
  { key: "planned", movementType: "outbound", label: "배송 예정", description: "가용에서 미리 차감", icon: Clock3, from: "창고", to: "", status: "배송 예정" },
  { key: "sample", movementType: "outbound", label: "샘플 대여", description: "사무실 샘플을 대여·데모로 반출", icon: ArrowUpFromLine, from: "사무실", to: "샘플", status: "샘플/대여" },
  { key: "sampleReturn", movementType: "return", label: "샘플 반환", description: "대여 샘플을 사무실로 회수", icon: RotateCcw, from: "샘플", to: "사무실", status: "샘플 반환" },
  { key: "sampleAssign", movementType: "transfer", label: "샘플 배정", description: "창고 재고를 샘플로 전환", icon: ArrowRightLeft, from: "창고", to: "사무실", status: "샘플 배정" },
  { key: "inbound", movementType: "inbound", label: "입고", description: "창고 재고 증가", icon: ArrowDownToLine, from: "", to: "창고", status: "입고" },
  { key: "return", movementType: "return", label: "고객 반납", description: "고객·현장에서 창고 회수", icon: RotateCcw, from: "고객", to: "창고", status: "반납" },
  { key: "repair", movementType: "repair", label: "수리", description: "예외 상태 처리", icon: Wrench, from: "창고", to: "수리", status: "수리중" },
  { key: "adjust", movementType: "adjust", label: "실사 조정", description: "창고 수량 보정", icon: Settings2, from: "", to: "창고", status: "재고 조정" },
]

// 빠른 기록 2축(입고|출고) 밖의 예외 처리 — 상세 모드(sheetView "detail")에서만 노출하는 5종.
// 이 키들은 상세 프리셋 그리드로만 진입하고, 큐(배치)는 지원하지 않는다.
const DETAIL_PRESET_KEYS = new Set(["sampleReturn", "sampleAssign", "return", "repair", "adjust"])

// 시트 헤더 배지 톤 — 저장될 기록이 원장에서 받을 배지(MOVEMENT_TONE·SALE_TYPE_META)와 같은 어휘.
// 예정=Warning, 샘플=중립, 그 외는 movementType 톤.
function presetTone(presetKey: string, movementType: HardwareMovementType): string {
  if (presetKey === "planned") return "bg-[#FBF1E0] text-[#A8741A]"
  if (presetKey === "sample") return "bg-[#F6F5F4] text-[#615D59]"
  return MOVEMENT_TONE[movementType]
}

// 샘플 대여 출처 선택지 — 기본은 사무실(남은 샘플). 사무실 재고가 없어 창고에서 바로 내보내는 실무도 있어 창고 허용.
const SAMPLE_SOURCE_OPTIONS = ["사무실", "창고"] as const
type SampleSource = (typeof SAMPLE_SOURCE_OPTIONS)[number]

const LOCATION_OPTIONS = ["고객", "창고", "샘플", "사무실", "수리"] as const

const QUICK_QUANTITIES = [1, 2, 5, 10]

const STOCK_PAGE_SIZE = 8
const OUTBOUND_PAGE_SIZE = 6
const ALERT_PAGE_SIZE = 5
const LOG_GROUP_PAGE_SIZE = 8
const PLANNED_PAGE_SIZE = 5

// 하위 탭은 지사 대시보드(BranchDashboardClient)와 같은 폴더형 규약을 쓴다 — 라벨 + 부제 2줄,
// 활성 탭은 본문 배경(#FAFAF8)으로 채워 #EBE8E2 스트립에서 앞으로 튀어나온 것처럼 보이게 한다.
// 아이콘은 부제가 역할을 대신하므로 두지 않는다(레퍼런스와 동일한 에디토리얼 톤).
const HARDWARE_TABS: Array<{ id: HardwareTab; label: string; description: string }> = [
  { id: "home", label: "홈", description: "현황 · 예상 출고" },
  { id: "entry", label: "입출고", description: "입고 · 출고 기록" },
  { id: "history", label: "내역", description: "전체 원장" },
]

const DEFAULT_OPEN_SECTIONS: Record<HardwareSectionKey, boolean> = {
  stock: true,
  outbound: true,
  alerts: true,
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

// 빠른 기록 기본 선택 품목 = 86" IFP(비프로모, 최빈 라인업). 없으면 첫 품목으로 폴백.
function defaultEntryItemId(items: HardwareItem[]): string {
  const board86 = items.find((item) => isCoreIfpProduct(item.name, "86") && !isPromotedProduct(item.name))
  return (board86 ?? items[0])?.id ?? ""
}

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

// 확정 판매·설치 출고만 남긴다(무효·예정·샘플·수리 제외) — 기간별 출고 집계(outboundBuckets)와
// 홈 판매·설치 요약(salesPeriodSummary)이 같은 모수를 쓰도록 필터를 SSOT로 뽑아둔다.
function confirmedSalesMovements(movements: HardwareMovement[]): HardwareMovement[] {
  return movements.filter(
    (movement) =>
      movement.movement_type === "outbound" &&
      !movement.voided_at &&
      !/예정|예약|대기/.test(movement.status ?? "") &&
      !/샘플|사무실|수리|sample|repair/i.test(`${movement.to_location ?? ""} ${movement.status ?? ""}`)
  )
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

export function customerLabel(value: string | null | undefined): string {
  const text = (value ?? "").trim()
  if (!text || GENERIC_LOCATIONS.has(text)) return UNSPECIFIED_CUSTOMER
  return text
}

// reference_no "deal:{dealId}(:line:{lineId})" → 딜 오더 딥링크. 그 외 형식은 내부 링크를 만들 수 없다.
function crmHrefFromReference(reference: string | null): string | null {
  const match = (reference ?? "").match(/^deal:([^:\s]+)/i)
  return match ? `/admin/crm/deals/orders?deal=${encodeURIComponent(match[1])}` : null
}

// movement에 연결된 CRM 참조를 best-effort로 추출. 구조화 raw.crmLink(저장 시점 후보의 href·라벨,
// app/api/admin/hardware/movements가 raw = { crmLink }로 영속)를 우선하고, 없으면 reference_no의
// deal:/xiaoshouyi: 또는 memo의 "CRM 연동:" 라인으로 되돌아간다.
export function extractCrmLink(movement: HardwareMovement): { label: string; reference: string | null; href: string | null } | null {
  const raw = movement.raw
  const crmLinkRaw = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).crmLink : null
  if (crmLinkRaw && typeof crmLinkRaw === "object" && !Array.isArray(crmLinkRaw)) {
    const record = crmLinkRaw as Record<string, unknown>
    const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)
    const label = [text(record.sourceLabel), text(record.title)].filter(Boolean).join(" · ") || "CRM 연동"
    const reference = text(record.referenceNo) ?? ((movement.reference_no ?? "").trim() || null)
    return { label, reference, href: text(record.href) ?? crmHrefFromReference(reference) }
  }
  const ref = (movement.reference_no ?? "").trim()
  if (/^deal:/i.test(ref) || /^xiaoshouyi:/i.test(ref)) {
    return { label: /^deal:/i.test(ref) ? "포털 딜" : "외부 CRM", reference: ref, href: crmHrefFromReference(ref) }
  }
  const memoLine = (movement.memo ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^CRM 연동:/.test(line))
  if (memoLine) {
    return { label: memoLine.replace(/^CRM 연동:\s*/, "") || "CRM 연동", reference: ref || null, href: crmHrefFromReference(ref || null) }
  }
  return null
}

// 어제(로컬 자정 기준) YYYY-MM-DD — 처리일 퀵칩용. UTC 슬라이스가 아니라 로컬 날짜로 계산해 KST 새벽에도 어제가 정확하다.
function yesterdayKey() {
  const now = new Date()
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const month = String(local.getMonth() + 1).padStart(2, "0")
  const day = String(local.getDate()).padStart(2, "0")
  return `${local.getFullYear()}-${month}-${day}`
}

function dateKeyOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

// 내역 탭 기간 퀵칩 — 로컬 자정 기준으로 이번 달/지난 달/최근 30일 범위를 계산한다.
type HistoryDateRangeKey = "thisMonth" | "lastMonth" | "last30"

function historyDateRange(key: HistoryDateRangeKey): { from: string; to: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  if (key === "thisMonth") {
    return { from: dateKeyOf(new Date(year, month, 1)), to: dateKeyOf(now) }
  }
  if (key === "lastMonth") {
    return { from: dateKeyOf(new Date(year, month - 1, 1)), to: dateKeyOf(new Date(year, month, 0)) }
  }
  return { from: dateKeyOf(new Date(year, month, now.getDate() - 29)), to: dateKeyOf(now) }
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

export function movementLot(movement: HardwareMovement): string | null {
  if (movement.lot_no && movement.lot_no.trim()) return movement.lot_no.trim()
  if (movement.source === "sheet_import" && movement.reference_no && movement.reference_no.trim()) {
    return movement.reference_no.trim()
  }
  return null
}

// 클라이언트 드래프트의 예정 여부 — 신규 UI(isPlanned 세그먼트/토글)가 우선하고, 값이 없으면
// (키트·붙여넣기·직전 복제·레거시 드래프트) status 정규식으로 하위호환 폴백한다.
function isDraftPlanned(draft: HardwareMovementDraft): boolean {
  return draft.isPlanned ?? /예정|예약|대기/.test(draft.status)
}

// 샘플 대여 라인 판별 — status 문자열(가변)이 아니라 경로/프리셋 기반 안정 신호로 고정한다.
// 샘플 프리셋의 도착지는 항상 "샘플"(ENTRY_PRESETS의 to)이라, 실제↔예정 토글이나 status 편집으로
// 문자열이 바뀌어도 이 판별은 흔들리지 않는다. 샘플은 실제/예정 개념이 없는 사무실→샘플 경로다.
function isSampleOutbound(draft: HardwareMovementDraft): boolean {
  return draft.movementType === "outbound" && draft.toLocation.trim() === "샘플"
}

// 서버 전송 직전 status 파생 — 출고 라인만 실제/예정으로 status를 정규화한다.
//   샘플(toLocation "샘플")   → "샘플/대여" 보존(실제/예정 파생을 적용하지 않음)
//   예정(isPlanned=true)      → "배송 예정"
//   실제(isPlanned=false)     → 수리 등 특수 상태는 보존, 그 밖은 "출고"
// 입고/반환/이동/수리/조정 등 다른 유형은 프리셋이 정한 status를 그대로 둔다.
function deriveStatus(draft: HardwareMovementDraft): string {
  if (draft.movementType !== "outbound") return draft.status
  // 샘플 대여는 사무실→샘플 경로라 실제/예정 개념이 없다 — 프리셋 status("샘플/대여")를 보존한다.
  if (isSampleOutbound(draft)) return draft.status
  if (isDraftPlanned(draft)) return "배송 예정"
  // 수리 등 실제 출고의 특수 상태는 유지한다.
  if (/수리|repair/i.test(draft.status)) return draft.status
  return "출고"
}

// 서버 전송용 드래프트 정규화 — status를 파생하고 UI 전용 isPlanned 필드를 제거한다.
function toServerDraft(draft: HardwareMovementDraft): Omit<HardwareMovementDraft, "isPlanned"> {
  return {
    itemId: draft.itemId,
    productName: draft.productName,
    movementType: draft.movementType,
    quantity: draft.quantity,
    occurredAt: draft.occurredAt,
    fromLocation: draft.fromLocation,
    toLocation: draft.toLocation,
    owner: draft.owner,
    status: deriveStatus(draft),
    referenceNo: draft.referenceNo,
    memo: draft.memo,
    lotNo: draft.lotNo,
    unitPrice: draft.unitPrice,
    amountUsd: draft.amountUsd,
    amountCny: draft.amountCny,
    storageLocation: draft.storageLocation,
    importer: draft.importer,
    serials: draft.serials,
  }
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

// 상세내역 "제품" 필터 — 실데이터에 액세서리(OPS/POE/케이블/터치펜 등)까지 섞여 칩이 20개 가까이
// 늘어났다. 자주 찾는 핵심 라인업만 고정 5종으로 좁히고, 나머지는 검색으로 찾도록 한다.
// (110"/65"/S1/액세서리 등은 후순위 — 칩에서 제외.)
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
    description: "T1/카메라 1대",
    icon: Camera,
    lines: [
      // T1이 사실상 표준 카메라 — S1은 거의 나가지 않는 구형이라 기본값에서 제외.
      // S1은 "제품 빠른 선택" 기타 칩(QUICK_PICK_ETC)으로 여전히 개별 선택 가능.
      { label: "카메라", quantity: 1, match: (row) => /^T1$/i.test(row.product.trim()) },
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
    // 실제/예정은 status가 같아도 별개 라인 — 병합되면 예정 토글이 서로를 덮어쓴다.
    isDraftPlanned(draft) ? "planned" : "actual",
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

const CrmConfirmModal = dynamic(() => import("@/components/admin/hardware/inventory/CrmConfirmModal"), { loading: () => null })
const VoidConfirmModal = dynamic(() => import("@/components/admin/hardware/inventory/VoidConfirmModal"), { loading: () => null })

// 비기본 탭 섹션 코드 스플릿 — 입고/출고 집계(entry)·상세 내역(history)은 첫 페인트("home" 탭)에
// 없으므로 지연 로드한다. 세 섹션 모두 내부 useState가 없는 프레젠테이션 컴포넌트(검색어·페이지 등
// 상태는 전부 부모 소유)라 지연 마운트로 잃는 폼 상태가 없다. ssr:false + 가벼운 스켈레톤은
// 장부 워크벤치의 검증된 관례를 따른다.
const SectionLoadingFallback = () => (
  <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-5 py-10 text-center text-[12px] font-semibold text-[#A39E98]">
    섹션을 불러오는 중…
  </section>
)
const InboundLotsSection = dynamic(() => import("@/components/admin/hardware/inventory/InboundLotsSection"), {
  ssr: false,
  loading: () => <SectionLoadingFallback />,
})
const OutboundPeriodSection = dynamic(() => import("@/components/admin/hardware/inventory/OutboundPeriodSection"), {
  ssr: false,
  loading: () => <SectionLoadingFallback />,
})
const HistoryLogSection = dynamic(() => import("@/components/admin/hardware/inventory/HistoryLogSection"), {
  ssr: false,
  loading: () => <SectionLoadingFallback />,
})

// 기존 기록에서 편집/복제 시 복원할 프리셋 키 — 상태를 읽지 않는 순수 함수라 컴포넌트 밖에 둔다
// (editMovement useCallback의 의존에서 빼기 위함).
function presetKeyForMovement(movement: HardwareMovement): string {
  switch (movement.movement_type) {
    case "inbound":
      return "inbound"
    case "return":
      // 샘플→사무실 회수는 "샘플 반환", 그 밖(고객·현장→창고)은 "고객 반납"으로 되살린다.
      return movement.from_location === "샘플" || movement.to_location === "사무실" ? "sampleReturn" : "return"
    case "transfer":
      return "sampleAssign"
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
  // 샘플 대여 출처 — 기본 사무실(남은 샘플), 사무실 재고가 없으면 창고에서 바로 반출.
  const [sampleSource, setSampleSource] = useState<SampleSource>("사무실")
  // 샘플 유닛 트래커 연계 — 대여 고객사 + 나갈/돌아올 유닛 선택(단건 시트 전용).
  const [sampleCustomer, setSampleCustomer] = useState("")
  const [sampleUnitSelection, setSampleUnitSelection] = useState<string[]>([])
  const [openSections, setOpenSections] = useState<Record<HardwareSectionKey, boolean>>(() => ({ ...DEFAULT_OPEN_SECTIONS }))
  const [stockPage, setStockPage] = useState(1)
  const [outboundPage, setOutboundPage] = useState(1)
  const [alertsPage, setAlertsPage] = useState(1)
  const [movementsPage, setMovementsPage] = useState(1)
  const [expandedLogGroups, setExpandedLogGroups] = useState<Set<string>>(() => new Set())
  const [plannedPage, setPlannedPage] = useState(1)
  const [activeTab, setActiveTab] = useState<HardwareTab>("home")
  // 하위 탭 roving tabindex — 지사 대시보드와 동일한 키보드 규약(←/→/Home/End).
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
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
  // 시트 뷰 — "quick": 입고|출고 2축 빠른 기록(기본), "detail": 상세 5종(반환·샘플 배정·수리·조정)
  // 을 같은 시트 안에서 처리하는 상세 모드. 상세 모드는 항상 단건(배치 아님).
  const [sheetView, setSheetView] = useState<"quick" | "detail">("quick")
  // 출고 실제|예정 2차 세그먼트 — UI 판별 전용. status 파생(deriveStatus)과 드래프트 isPlanned로만 흐른다.
  const [isPlanned, setIsPlanned] = useState(false)
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
  // 내역 탭 보조 필터 축 — 상태(완료/배송 예정/취소 포함), 판매유형(출고 전용), 기간(occurred_at 기준).
  const [historyStatus, setHistoryStatus] = useState<"all" | "done" | "planned">("all")
  const [includeVoided, setIncludeVoided] = useState(false)
  const [saleTypeFilter, setSaleTypeFilter] = useState<OutboundSaleType | "">("")
  const [historyDateFrom, setHistoryDateFrom] = useState("")
  const [historyDateTo, setHistoryDateTo] = useState("")
  // 내역 탭 상세 필터 패널 — 상태/판매유형/기간/제품/물류No/고객사는 기본 접힘, 검색·유형만 상시 노출.
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [customerDetail, setCustomerDetail] = useState<string | null>(null)
  const [locationMapExpanded, setLocationMapExpanded] = useState(false)
  const sheetPanelRef = useRef<HTMLElement>(null)
  const detailPanelRef = useRef<HTMLElement>(null)
  const ledgerFileRef = useRef<HTMLInputElement>(null)
  // 상세 모드 진입 직전의 출고 세그먼트(sale/planned/sample)를 기억해 빠른 기록 복귀 시 복원한다.
  const detailReturnPresetRef = useRef<string | null>(null)
  const reduceMotion = useReducedMotion()
  const plannedConfirmLocked = busy != null || confirmingId != null || confirmingGroupKey != null
  const quickCartSaving = busy === "movement"

  // URL 상태 동기화(탭·고객만 최소로) — 장부 워크벤치와 같은 window 기반 접근.
  // useSearchParams는 Suspense 경계를 요구해 피하고, 마운트 시 한 번 읽은 뒤(urlReady 전에는
  // 쓰지 않음) 변경마다 replaceState로 반영해 링크 공유가 가능하다(히스토리 오염 없음).
  // 계약: ?tab=home|entry|history (생략=home), &customer=<고객명> → 내역 탭 고객 필터 프리필
  // + 거래이력 슬라이드오버 오픈(tab 생략 시 history로 간주).
  // 왕복 충실성: customer는 슬라이드오버가 열린 상태만 기록한다(필터만 건 상태를 customer로
  // 쓰면 새로고침 시 슬라이드오버가 원치 않게 열린다). customer 기록 시 tab은 home이어도
  // 항상 명시해, 홈 탭에서 연 슬라이드오버 링크가 내역 탭으로 착지하지 않게 한다.
  const [urlReady, setUrlReady] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get("tab")
    const customer = (params.get("customer") ?? "").trim()
    if (tab === "home" || tab === "entry" || tab === "history") setActiveTab(tab)
    else if (customer) setActiveTab("history")
    if (customer) {
      setCustomerFilter(customer)
      setCustomerDetail(customer)
    }
    setUrlReady(true)
  }, [])

  useEffect(() => {
    if (!urlReady) return
    const params = new URLSearchParams()
    const customer = (customerDetail ?? "").trim()
    if (customer) {
      params.set("tab", activeTab)
      params.set("customer", customer)
    } else if (activeTab !== "home") {
      params.set("tab", activeTab)
    }
    const search = params.toString()
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (nextUrl !== currentUrl) window.history.replaceState(null, "", nextUrl)
  }, [urlReady, activeTab, customerDetail])

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

  const load = useCallback(async (options: { force?: boolean } = {}) => {
    setLoading(true)
    setError(null)
    try {
      // 재방문·뒤로가기는 공용 클라이언트 캐시(45s TTL + stale-while-revalidate)로 즉시 페인트한다
      // (서버도 이미 max-age=30/swr=120을 보낸다). 새로고침·저장 후 재조회는 force로 우회한다 —
      // CRM 화면들의 load({ force: true }) 관례와 동일.
      const next = await adminFetchJsonCached<HardwareDashboard>("/api/admin/hardware", undefined, {
        force: options.force,
      })
      setData(next)
      setSelectedItemId((current) => current || defaultEntryItemId(next.items))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 저장/확정 후 재조회 — 확정 핸들러들(useCallback)의 의존이라 load 바로 아래에 선언한다(TDZ).
  // 전역 캐시 전체 삭제 대신 하드웨어 스코프만 무효화한다 — 키 포함 매칭이라 다른 소비처의
  // branch:* /api/admin/hardware 캐시도 함께 지워지고, 무관한 어드민 탭 캐시는 살아남는다(감사 #13).
  const refresh = useCallback(async () => {
    clearAdminRequestCache("/api/admin/hardware")
    await load({ force: true })
  }, [load])

  // 샘플 유닛 트래커 — 대시보드와 별도 수명주기(작은 테이블, 캐시 없음). 부모가 소유해야
  // 입출고 시트(대여 유닛 선택)와 홈 섹션·상세 시트가 같은 데이터를 본다.
  const [sampleUnits, setSampleUnits] = useState<HardwareSampleUnit[] | null>(null)
  const [sampleLatestEvents, setSampleLatestEvents] = useState<Record<string, HardwareSampleEvent>>({})
  const [sampleUnitsLoading, setSampleUnitsLoading] = useState(false)
  const [sampleUnitsError, setSampleUnitsError] = useState<string | null>(null)
  const [sampleUnitSheetId, setSampleUnitSheetId] = useState<string | null>(null)

  const loadSampleUnits = useCallback(async () => {
    setSampleUnitsLoading(true)
    try {
      const result = await adminFetchJson<{
        units: HardwareSampleUnit[]
        latestEvents: Record<string, HardwareSampleEvent>
      }>("/api/admin/hardware/samples")
      setSampleUnits(result.units)
      setSampleLatestEvents(result.latestEvents ?? {})
      setSampleUnitsError(null)
    } catch (err) {
      setSampleUnitsError(err instanceof Error ? err.message : String(err))
    } finally {
      setSampleUnitsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSampleUnits()
  }, [loadSampleUnits])

  const selectedSampleUnit = useMemo(
    () => sampleUnits?.find((unit) => unit.id === sampleUnitSheetId) ?? null,
    [sampleUnits, sampleUnitSheetId]
  )

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

  // 도착지가 고객사인가 — 판매·배송예정 출고만 해당. 샘플 대여(→"샘플" 위치)는 고객 자동완성이 아니라 위치 입력.
  const isCustomerDestination = movementType === "outbound" && activePresetKey !== "sample"

  // 출고 하위 세그먼트 현재 상태 — 샘플 서브토글이 우선하고, 나머지는 예정/실제로 가른다.
  const outboundMode: "actual" | "planned" | "sample" =
    activePresetKey === "sample" ? "sample" : isPlanned ? "planned" : "actual"

  const fifoPreview = useMemo(() => {
    const qty = Number(quantity)
    if (movementType !== "outbound" || lotNo.trim() || !selectedStockRow || !Number.isFinite(qty) || qty <= 0) {
      return null
    }
    // FIFO 자동 배정은 창고 lot에서 나갈 때만 의미가 있다 — 사무실(남은 샘플) 반출에는 창고 lot 미리보기를 띄우지 않는다.
    const source = fromLocation.trim()
    if (source && source !== "창고") return null
    return previewFifoLots(selectedStockRow.lotBalances, qty)
  }, [fromLocation, lotNo, movementType, quantity, selectedStockRow])

  // 출발 위치 잔량 초과 경고 — lot 지정 여부와 무관하게, 나가는(감소하는) 위치의 잔량을 넘으면 알린다.
  // 판매/배송예정/창고발 샘플은 가용(창고−예정)을, 사무실발 샘플 대여는 남은 샘플(사무실)을,
  // 샘플 반환은 나간 샘플(샘플)을 기준으로 본다. return은 from에서 −qty라 from 잔량으로 판단.
  // 저장은 막지 않는다(오프라인 실측 보정 등 정당한 초과가 있으므로 경고만).
  const availabilityWarning = useMemo(() => {
    const qty = Number(quantity)
    if (!selectedStockRow || !Number.isFinite(qty) || qty <= 0) return null
    // 수량이 빠져나가는(잔량이 줄어드는) 이동만 검사: 출고(sale/planned/sample) + 반환(from −qty).
    if (movementType !== "outbound" && movementType !== "return") return null
    const source = fromLocation.trim()
    // 창고발(판매·배송예정·창고 샘플 대여)은 예정 차감까지 반영한 가용을 본다.
    if (source === "창고" || (!source && movementType === "outbound")) {
      if (qty <= selectedStockRow.availableStock) return null
      return `가용 ${formatNumber(selectedStockRow.availableStock)}대를 ${formatNumber(qty - selectedStockRow.availableStock)}대 초과합니다. 저장은 가능하지만 재고가 음수가 될 수 있어요.`
    }
    // 그 외 위치(사무실=남은 샘플, 샘플=나간 샘플 등)는 해당 위치 잔량 기준.
    const sourceQty = locationQuantity(selectedStockRow, source)
    if (qty <= sourceQty) return null
    return `${source} 잔량 ${formatNumber(sourceQty)}대를 ${formatNumber(qty - sourceQty)}대 초과합니다. 저장은 가능하지만 재고가 음수가 될 수 있어요.`
  }, [fromLocation, movementType, quantity, selectedStockRow])

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
    if (!includeVoided) rows = rows.filter((movement) => !movement.voided_at)
    if (historyType === "sample") {
      // 샘플: 출고 중 판매유형이 샘플(대여/데모)로 분류된 건만.
      rows = rows.filter((movement) => outboundSaleType(movement) === "sample")
    } else if (historyType !== "all") {
      rows = rows.filter((movement) => movement.movement_type === historyType)
    }
    // 상태 축(완료/배송 예정)은 유형 축과 별개 — 배송 예정은 출고 중 status가 예정/예약/대기인 건만.
    if (historyStatus === "planned") rows = rows.filter((movement) => isPlannedMovement(movement))
    else if (historyStatus === "done") rows = rows.filter((movement) => !isPlannedMovement(movement))
    if (saleTypeFilter) rows = rows.filter((movement) => outboundSaleType(movement) === saleTypeFilter)
    if (productFilter) rows = rows.filter((movement) => matchesProductFilter(movement.product_name, productFilter))
    if (lotFilter) rows = rows.filter((movement) => (movementLot(movement) ?? "") === lotFilter)
    if (customerFilter) rows = rows.filter((movement) => customerLabel(movement.to_location) === customerFilter)
    if (historyDateFrom || historyDateTo) {
      rows = rows.filter((movement) => {
        const dateKey = movement.occurred_at ? movement.occurred_at.slice(0, 10) : null
        // 날짜가 없는 행은 기간 필터가 걸려 있으면(전체가 아니면) 제외한다.
        if (!dateKey) return false
        if (historyDateFrom && dateKey < historyDateFrom) return false
        if (historyDateTo && dateKey > historyDateTo) return false
        return true
      })
    }
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
    // 예정(예약) 건은 항상 확정 기록 아래 티어로 — 내역의 기본 질문은 "무슨 일이 있었나"라
    // 아직 안 일어난 예정이 최신 날짜라는 이유로 상단을 점유하면 안 된다(예정만 볼 땐 상태 칩).
    const sorted = [...rows].sort((a, b) => {
      const aPlanned = isPlannedMovement(a)
      const bPlanned = isPlannedMovement(b)
      if (aPlanned !== bPlanned) return aPlanned ? 1 : -1
      const aTime = a.occurred_at ? new Date(a.occurred_at).getTime() : null
      const bTime = b.occurred_at ? new Date(b.occurred_at).getTime() : null
      if (aTime == null && bTime == null) return 0
      if (aTime == null) return 1
      if (bTime == null) return -1
      return historySort === "asc" ? aTime - bTime : bTime - aTime
    })
    return sorted
  }, [
    data?.movements,
    includeVoided,
    historyType,
    historyStatus,
    saleTypeFilter,
    productFilter,
    lotFilter,
    customerFilter,
    historyDateFrom,
    historyDateTo,
    search,
    historySort,
  ])

  const hasHistoryFilter =
    historyType !== "all" ||
    historyStatus !== "all" ||
    includeVoided ||
    saleTypeFilter !== "" ||
    productFilter !== "" ||
    lotFilter !== "" ||
    customerFilter !== "" ||
    historyDateFrom !== "" ||
    historyDateTo !== "" ||
    search.trim() !== ""

  // 상세 필터 패널(기본 접힘) 안에 있는 축만 센 카운트 — 접혔을 때도 토글 배지로 존재를 알려준다.
  const advancedHistoryFilterCount = [
    historyStatus !== "all",
    includeVoided,
    saleTypeFilter !== "",
    productFilter !== "",
    lotFilter !== "",
    customerFilter !== "",
    historyDateFrom !== "" || historyDateTo !== "",
  ].filter(Boolean).length

  // 내역 탭 필터 축 전체 초기화 — "전체 초기화" 버튼과 필터 칩 미사용 시 공유.
  const resetHistoryFilters = useCallback(() => {
    setHistoryType("all")
    setHistoryStatus("all")
    setIncludeVoided(false)
    setSaleTypeFilter("")
    setProductFilter("")
    setLotFilter("")
    setCustomerFilter("")
    setHistoryDateFrom("")
    setHistoryDateTo("")
    setSearch("")
    setMovementsPage(1)
  }, [])

  // 현재 걸린 필터를 칩으로 나열 — 개별 X로 그 축만 해제할 수 있게 onRemove를 함께 들고 있다.
  const activeHistoryFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = []
    if (historyType !== "all") {
      chips.push({
        key: "type",
        label: `유형: ${historyType === "sample" ? "샘플" : MOVEMENT_LABEL[historyType]}`,
        onRemove: () => {
          setHistoryType("all")
          setMovementsPage(1)
        },
      })
    }
    if (historyStatus !== "all") {
      chips.push({
        key: "status",
        label: `상태: ${historyStatus === "planned" ? "배송 예정" : "완료"}`,
        onRemove: () => {
          setHistoryStatus("all")
          setMovementsPage(1)
        },
      })
    }
    if (includeVoided) {
      chips.push({
        key: "voided",
        label: "취소 포함",
        onRemove: () => {
          setIncludeVoided(false)
          setMovementsPage(1)
        },
      })
    }
    if (saleTypeFilter) {
      chips.push({
        key: "saleType",
        label: `판매유형: ${SALE_TYPE_META[saleTypeFilter].label}`,
        onRemove: () => {
          setSaleTypeFilter("")
          setMovementsPage(1)
        },
      })
    }
    if (productFilter) {
      const option = PRODUCT_FILTER_OPTIONS.find((entry) => entry.key === productFilter)
      chips.push({
        key: "product",
        label: `제품: ${option?.label ?? productFilter}`,
        onRemove: () => {
          setProductFilter("")
          setMovementsPage(1)
        },
      })
    }
    if (lotFilter) {
      chips.push({
        key: "lot",
        label: `물량번호: ${formatLotLabel(lotFilter) ?? lotFilter}`,
        onRemove: () => {
          setLotFilter("")
          setMovementsPage(1)
        },
      })
    }
    if (customerFilter) {
      chips.push({
        key: "customer",
        label: `고객사: ${customerFilter}`,
        onRemove: () => {
          setCustomerFilter("")
          setMovementsPage(1)
        },
      })
    }
    if (historyDateFrom || historyDateTo) {
      const label =
        historyDateFrom && historyDateTo
          ? `기간: ${historyDateFrom} ~ ${historyDateTo}`
          : historyDateFrom
            ? `기간: ${historyDateFrom} 이후`
            : `기간: ${historyDateTo} 이전`
      chips.push({
        key: "date",
        label,
        onRemove: () => {
          setHistoryDateFrom("")
          setHistoryDateTo("")
          setMovementsPage(1)
        },
      })
    }
    if (search.trim()) {
      chips.push({
        key: "search",
        label: `검색: ${search.trim()}`,
        onRemove: () => {
          setSearch("")
          setMovementsPage(1)
        },
      })
    }
    return chips
  }, [historyType, historyStatus, includeVoided, saleTypeFilter, productFilter, lotFilter, customerFilter, historyDateFrom, historyDateTo, search])

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

  // 예정일로부터 30일 이상 미확정으로 방치된 딜 수 — 큐가 묵으면 판매 요약이 0으로 보이는
  // 원인이 되므로 패널 헤더에서 바로 드러낸다(페이지가 아닌 전체 큐 기준).
  const plannedStaleGroupCount = useMemo(
    () => plannedGroups.filter((group) => (elapsedDaysSince(group.date) ?? 0) >= 30).length,
    [plannedGroups]
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

  // 미가동 품목 소음(muted)은 목록·페이징에서 분리 — 실신호만 페이지네이션에 태우고
  // muted는 섹션 하단 접힌 그룹으로 넘긴다.
  const activeAlerts = useMemo(() => (data?.alerts ?? []).filter((alert) => !alert.muted), [data?.alerts])
  const mutedAlerts = useMemo(() => (data?.alerts ?? []).filter((alert) => alert.muted), [data?.alerts])
  const alertsPagination = useMemo(
    () => paginateAdminList(activeAlerts, { currentPage: alertsPage, pageSize: ALERT_PAGE_SIZE }),
    [activeAlerts, alertsPage]
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
  // useMemo — 배열 항등성이 흔들리면 toggleAllPageLogGroups·HistoryLogSection memo가 매 렌더 무효화된다.
  const pageLogGroupKeys = useMemo(
    () => logGroupsPagination.pageItems.filter((group) => group.movements.length > 1).map((group) => group.key),
    [logGroupsPagination.pageItems]
  )
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
  // 상태는 setDetailId(안정 setter)만 캡처 — HistoryLogSection memo가 유지되도록 항등성을 고정한다.
  const renderMovementRow = useCallback((movement: HardwareMovement, nested = false) => {
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
  }, [])

  const categoryCards = useMemo(() => {
    const stockRows = data?.stock ?? []
    // 분류는 hardwareCardGroup 단일 기준(shared) — 서술 명칭 매칭으로 브라켓이 카메라 대수에
    // 계상되던 문제를 막고, 4축 밖 품목은 전부 "기타" 요약으로 모아 비가시 재고를 없앤다.
    const emptyBucket = () => ({ available: 0, warehouse: 0, planned: 0, count: 0, promoted: 0, hasPromoted: false })
    const buckets: Record<HardwareCardGroup, ReturnType<typeof emptyBucket>> = {
      ifp86: emptyBucket(),
      ifp75: emptyBucket(),
      camera: emptyBucket(),
      stand: emptyBucket(),
      etc: emptyBucket(),
    }
    const etcRows: Array<{ product: string; warehouse: number }> = []
    for (const row of stockRows) {
      const groupKey = hardwareCardGroup(row.product)
      const bucket = buckets[groupKey]
      bucket.count += 1
      // 판촉(promoted) 라인은 헤드라인과 분리 — 실판매분과 합산하면 promoted 원장 이상(음수)이
      // 카드 전체를 오염시킨다(STD1 35 + 판촉 −16 = 19로 보이던 문제). 기타 묶음은 분리 없이 합산.
      if (groupKey !== "etc" && isPromotedProduct(row.product)) {
        bucket.promoted += row.warehouseStock
        bucket.hasPromoted = true
        continue
      }
      bucket.available += row.availableStock
      bucket.warehouse += row.warehouseStock
      bucket.planned += row.plannedOut
      if (groupKey === "etc") etcRows.push({ product: row.product, warehouse: row.warehouseStock })
    }
    // 아이콘 칩은 웜 뉴트럴 고정 — 카테고리 구분에 상태색(그린/앰버)을 쓰면 실제 신호(음수·부족)와
    // 경쟁한다(DESIGN.md: 장식·카테고리 구분엔 웜 뉴트럴). 색은 수치·칩의 상태 표시에만 남긴다.
    const NEUTRAL_TONE = { bg: "#F6F5F4", fg: "#615D59" }
    const toCard = (bucket: ReturnType<typeof emptyBucket>) => ({
      available: bucket.available,
      warehouse: bucket.warehouse,
      planned: bucket.planned,
      count: bucket.count,
      promoted: bucket.hasPromoted ? bucket.promoted : null,
    })
    const cards = [
      { key: "ifp86", label: "86인치 전자칠판", icon: Monitor, tone: NEUTRAL_TONE, ...toCard(buckets.ifp86) },
      { key: "ifp75", label: "75인치 전자칠판", icon: Monitor, tone: NEUTRAL_TONE, ...toCard(buckets.ifp75) },
      { key: "camera", label: "카메라 (T1·S1)", icon: Camera, tone: NEUTRAL_TONE, ...toCard(buckets.camera) },
      { key: "stand", label: "스탠드 (STD1)", icon: Projector, tone: NEUTRAL_TONE, ...toCard(buckets.stand) },
    ]
    const etcSummary =
      buckets.etc.count > 0
        ? {
            warehouse: buckets.etc.warehouse,
            planned: buckets.etc.planned,
            available: buckets.etc.available,
            count: buckets.etc.count,
            chips: etcRows
              .filter((row) => row.warehouse > 0)
              .sort((a, b) => b.warehouse - a.warehouse)
              .slice(0, 8)
              .map((row) => ({ label: row.product, qty: row.warehouse })),
          }
        : null
    return { cards, etcSummary }
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
      // 핵심 3종 밖 품목(A1·OPS·케이블 등)까지 포함한 전 품목 대수 — 헤더에서 병기해
      // "집계에 안 잡히는 재고"가 생기지 않게 한다(2026-08-08 데이터 판단 문서 #7).
      totalQtyAll: inbound.reduce((total, movement) => total + movement.quantity, 0),
      totalAmount: tally.reduce((total, movement) => total + (movement.amount_usd ?? 0), 0),
      hasAnyAmount: tally.some((movement) => movement.amount_usd != null),
      totalCny: tally.reduce((total, movement) => total + (movement.amount_cny ?? 0), 0),
      hasAnyCny: tally.some((movement) => movement.amount_cny != null),
    }
  }, [data?.movements, inboundSearch])

  const outboundBuckets = useMemo(() => {
    const sales = confirmedSalesMovements(data?.movements ?? [])
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

  // 홈 탭 판매·설치 요약 — 이번 달/이번 분기(회계)/올해를 한 줄에 같이 본다. 모수·매출 규약은
  // 기간별 출고 집계와 동일: 대수는 확정 출고 전체(샘플·수리 제외), 매출은 실판매(sales) USD만.
  const salesPeriodSummary = useMemo(() => {
    const sales = confirmedSalesMovements(data?.movements ?? [])
    const today = todayKey()
    // 직전 기간 앵커 날짜 — 월초로 고정한 뒤 월/분기(3개월)/연 단위로 되돌린다.
    // (fiscal 분기는 월 경계라 3개월 전 날짜가 항상 직전 분기에 떨어진다.)
    const prevAnchor = (granularity: PeriodGranularity): string => {
      const anchor = new Date(`${today.slice(0, 7)}-01T00:00:00Z`)
      if (granularity === "month") anchor.setUTCMonth(anchor.getUTCMonth() - 1)
      if (granularity === "quarter") anchor.setUTCMonth(anchor.getUTCMonth() - 3)
      if (granularity === "year") anchor.setUTCFullYear(anchor.getUTCFullYear() - 1)
      return anchor.toISOString().slice(0, 10)
    }
    const TITLES: Record<PeriodGranularity, { title: string; prevTitle: string }> = {
      month: { title: "이번 달", prevTitle: "지난 달" },
      quarter: { title: "이번 분기", prevTitle: "지난 분기" },
      year: { title: "연간", prevTitle: "지난해" },
    }
    return (["month", "quarter", "year"] as const).map((granularity) => {
      const current = periodKey(today, granularity)
      const previous = periodKey(prevAnchor(granularity), granularity)
      let qty = 0
      let revenue = 0
      let hasRevenue = false
      let prevQty = 0
      const byProduct = new Map<string, number>()
      for (const movement of sales) {
        const date = movement.occurred_at?.slice(0, 10) ?? movement.created_at.slice(0, 10)
        const key = periodKey(date, granularity).key
        if (key === previous.key) {
          prevQty += movement.quantity
          continue
        }
        if (key !== current.key) continue
        qty += movement.quantity
        const saleType = outboundSaleType(movement) ?? "sales"
        if (saleType === "sales" && movement.amount_usd != null) {
          revenue += movement.amount_usd
          hasRevenue = true
        }
        byProduct.set(movement.product_name, (byProduct.get(movement.product_name) ?? 0) + movement.quantity)
      }
      return {
        granularity,
        ...TITLES[granularity],
        label: current.label,
        qty,
        revenue,
        hasRevenue,
        prevQty,
        chips: Array.from(byProduct.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([product, chipQty]) => ({ product: shortProductName(product), qty: chipQty })),
      }
    })
  }, [data?.movements])

  // 홈 요약 → 입출고 탭 "출고 · 기간 집계" 딥링크(버킷 전체·고객사 펼침은 그쪽이 담당).
  const openOutboundDetail = useCallback(() => {
    setActiveTab("entry")
    setEntrySub("outbound")
  }, [])

  const historyCustomers = useMemo(() => {
    const set = new Set<string>()
    for (const movement of data?.movements ?? []) {
      if (movement.movement_type !== "outbound") continue
      const label = customerLabel(movement.to_location)
      if (label !== "고객(미지정)") set.add(label)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"))
  }, [data?.movements])

  // 직전 기록 복제용 — 손으로 남긴(admin_manual) 최신 유효 기록. 시트 임포트 행은 복제 후보에서 제외한다.
  const lastManualMovement = useMemo(() => {
    let latest: HardwareMovement | null = null
    let latestTime = -Infinity
    for (const movement of data?.movements ?? []) {
      if (movement.voided_at || movement.source !== "admin_manual") continue
      const time = new Date(movement.occurred_at ?? movement.created_at).getTime()
      if (Number.isFinite(time) && time >= latestTime) {
        latestTime = time
        latest = movement
      }
    }
    return latest
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

  // MovementDetailSheet memo 유지용 — 시트가 닫혀 있어도 매 렌더 새 배열/객체가 만들어져 memo를 깨던 파생값.
  const detailFacts = useMemo(() => detailMovement
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
    : [], [detailMovement])
  const detailCrm = useMemo(() => (detailMovement ? extractCrmLink(detailMovement) : null), [detailMovement])
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

  const toggleSection = useCallback((section: HardwareSectionKey) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }))
  }, [])

  // 프리셋 적용 — editingId는 건드리지 않는다(수정 중 프리셋 클릭이 조용히 신규 기록으로
  // 둔갑하던 버그의 원인). 신규 열기 경로는 resetSheetDraft가 명시적으로 초기화한다.
  // 출발/도착 보존은 같은 이동 유형 내 전환(판매↔예정 등)에만 적용한다 — 유형이 바뀌면
  // (예: 출고→입고) 고객사명이 입고 도착지로 끌려가 창고 집계에서 새는 사고를 막기 위해 하드 리셋.
  const applyPreset = useCallback((presetKey: string) => {
    const preset = ENTRY_PRESETS.find((item) => item.key === presetKey)
    if (!preset) return
    const typeChanged = preset.movementType !== movementType
    setActivePresetKey(preset.key)
    setMovementType(preset.movementType)
    // 샘플 대여로 진입하면 출처를 기본(사무실)로 초기화한다. 창고 반출은 아래 출처 토글로 전환.
    // (state 클로저의 stale 값을 읽지 않도록 프리셋 진입 시엔 항상 사무실로 리셋)
    setSampleSource("사무실")
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
    // 예정 세그먼트를 프리셋과 동기화 — 배송 예정 프리셋만 예정, 그 밖은 실제.
    // (편집·복제·상세 프리셋 진입에서도 실제/예정 상태가 status와 어긋나지 않게 유지)
    setIsPlanned(preset.key === "planned")
  }, [movementType])

  // 샘플 대여 출처 토글 — 프리셋을 유지한 채 출발 위치만 사무실↔창고로 바꾼다.
  const applySampleSource = (source: SampleSource) => {
    setSampleSource(source)
    setFromLocation(source)
  }

  // 빠른 기록 2축 IA — 입고|출고 최상위 세그먼트.
  //   입고 = inbound 프리셋
  //   출고 = 하위 실제|예정 세그먼트 + 샘플 서브토글(sale/planned/sample 프리셋으로 직결)
  // 상세 5종(반환·샘플 배정·수리·조정)은 sheetView "detail"에서만 노출한다.
  const selectMovementAxis = (axis: "inbound" | "outbound") => {
    if (axis === "inbound") {
      // 입고는 lot 단위 다품목이 실무 기본 — 여러 품목을 담아 한 번에 저장하는 장바구니(작업건) 흐름으로 연다.
      if (!editingId) setSheetMode("batch")
      applyPreset("inbound")
      return
    }
    // 출고로 전환하면 기본은 판매(실제) — 예정/샘플은 하위 세그먼트로 다시 고른다.
    // 출고 진입은 단건이 기본 — 단건 저장만 CRM 오더 확인 게이트를 타므로, 입고 batch에서 넘어온
    // 판매가 게이트를 우회하지 않게 단건으로 복귀시킨다. 이미 출고 축에서 헤더 토글로 batch를
    // 켠 세션은 존중하고(재클릭 무해), 다품목은 언제든 헤더 토글로 다시 승격한다.
    if (!editingId && movementType !== "outbound") setSheetMode("single")
    applyPreset(isPlanned && activePresetKey !== "sample" ? "planned" : "sale")
  }

  const selectOutboundMode = (mode: "actual" | "planned" | "sample") => {
    if (mode === "actual") applyPreset("sale")
    else if (mode === "planned") applyPreset("planned")
    else applyPreset("sample")
  }

  // 상세 모드 진입/복귀 — 같은 시트를 상세 프리셋 5종으로 전환한다. 상세는 항상 단건.
  const enterDetailView = () => {
    // 빠른 기록 복귀 시 실제/예정/샘플 세그먼트를 되살리도록 현재 출고 프리셋을 기억한다.
    detailReturnPresetRef.current =
      movementType === "outbound" ? activePresetKey : movementType === "inbound" ? "inbound" : null
    setSheetView("detail")
    setSheetMode("single")
    applyPreset("return")
  }

  const exitDetailView = () => {
    setSheetView("quick")
    // 진입 전 세그먼트를 복원한다 — 기억된 값이 없으면 기존 기본(입고→inbound, 그 외 sale).
    const remembered = detailReturnPresetRef.current
    detailReturnPresetRef.current = null
    applyPreset(remembered ?? (movementType === "inbound" ? "inbound" : "sale"))
  }

  // 시트 열기 공통 초기화 — 진입점(FAB/헤더/행 퀵버튼/예정 등록)이 어디든 같은 클리어 셋을 보장한다.
  // 직전 기록의 lot·금액·시리얼·메모가 새 기록에 오염되는 것을 차단한다.
  // 담당자(owner)는 같은 사람이 연속 기록하는 실무 패턴이라 유지하고,
  // 기록 바구니는 어떤 진입점에서도 조용히 파괴하지 않는다(바구니 헤더의 '비우기'로만 명시적 삭제).
  const resetSheetDraft = useCallback((presetKey: string, itemId?: string) => {
    setEditingId(null)
    setFromLocation("")
    setToLocation("")
    setSampleSource("사무실")
    // 상세 5종으로 직접 열면 상세 모드로, 빠른 2축(입고/출고/샘플)이면 빠른 모드로 시작한다.
    setSheetView(DETAIL_PRESET_KEYS.has(presetKey) ? "detail" : "quick")
    applyPreset(presetKey)
    setSelectedItemId(itemId ?? defaultEntryItemId(data?.items ?? []))
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
  }, [applyPreset, data?.items])

  const openSheet = useCallback((presetKey: string, itemId?: string, mode?: "single" | "batch") => {
    resetSheetDraft(presetKey, itemId)
    // 상세 5종은 항상 단건. 입고만 lot 다품목이 실무 기본이라 배치로 열고,
    // 출고(판매·예정·샘플)는 단건이 기본 — CRM 오더 확인 게이트는 단건 저장(submitMovement)에만
    // 있어 batch로 열면 판매가 crmLink 없이 저장(출고↔딜 대사 누락)되기 때문. 다품목은 헤더 토글로 승격.
    setSheetMode(DETAIL_PRESET_KEYS.has(presetKey) ? "single" : mode ?? (presetKey === "inbound" ? "batch" : "single"))
    setSheetOpen(true)
    // 이미 열린 상태에서 다른 행 퀵버튼을 눌렀을 때를 위해 패널 자체를 맨 위로.
    // (scrollIntoView는 sticky 헤더 높이만큼 폼 상단을 가리는 문제가 있어 사용하지 않는다.)
    window.requestAnimationFrame(() => {
      sheetPanelRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" })
    })
  }, [resetSheetDraft, reduceMotion])

  const prepareQuickEntry = useCallback((itemId: string, presetKey: string) => {
    openSheet(presetKey, itemId)
  }, [openSheet])

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

  const editMovement = useCallback((movement: HardwareMovement) => {
    const hasKnownItem = Boolean(data?.items.some((item) => item.id === movement.item_id))
    // 바구니는 비우지 않는다 — 편집 중에는 UI만 숨고(quickCartEnabled=false), 편집 후 배치 작업을 이어갈 수 있다.
    setQuickCartLineErrors({})
    setQuickCartSaveSummary(null)
    // 직전 작업의 배너(성공/에러)가 수정 시트에 남아 혼동·자동 스크롤을 유발하지 않도록 클리어.
    setError(null)
    setNotice(null)
    const editPresetKey = presetKeyForMovement(movement)
    setSheetView(DETAIL_PRESET_KEYS.has(editPresetKey) ? "detail" : "quick")
    applyPreset(editPresetKey)
    setSelectedItemId(hasKnownItem ? movement.item_id : data?.items[0]?.id ?? "")
    setCustomProduct(hasKnownItem ? "" : movement.product_name)
    setShowCustomInput(!hasKnownItem)
    setQuantity(String(Math.max(1, movement.quantity)))
    setOccurredAt(movement.occurred_at?.slice(0, 10) || todayKey())
    setFromLocation(movement.from_location ?? "")
    setToLocation(movement.to_location ?? "")
    // 샘플 대여 수정 시 출처 토글이 실제 출발지(사무실/창고)와 어긋나지 않도록 동기화.
    if (movement.from_location === "창고") setSampleSource("창고")
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
  }, [applyPreset, data?.items])

  // 직전 기록 복제 — 편집이 아니라 새 기록으로 채운다(editingId 미설정). 같은 고객·경로·품목의
  // 연속 입력을 빠르게 하기 위한 것이라 처리일은 오늘로 리셋하고, 건 단위 값(참조·시리얼·금액)은 비운다.
  const duplicateLastMovement = () => {
    const movement = lastManualMovement
    if (!movement || editingId) return
    const hasKnownItem = Boolean(data?.items.some((item) => item.id === movement.item_id))
    setEditingId(null)
    setQuickCartLineErrors({})
    setQuickCartSaveSummary(null)
    setError(null)
    applyPreset(presetKeyForMovement(movement))
    setSelectedItemId(hasKnownItem ? movement.item_id : data?.items[0]?.id ?? "")
    setCustomProduct(hasKnownItem ? "" : movement.product_name)
    setShowCustomInput(!hasKnownItem)
    setQuantity(String(Math.max(1, movement.quantity)))
    setOccurredAt(todayKey())
    setFromLocation(movement.from_location ?? "")
    setToLocation(movement.to_location ?? "")
    if (movement.from_location === "창고") setSampleSource("창고")
    setOwner((current) => current || movement.owner || "")
    setStatus(movement.status ?? "")
    // 건 단위 값은 복제하지 않는다 — 참조번호·시리얼·금액·메모·lot이 새 기록에 잘못 상속되면 원장이 오염된다.
    setReferenceNo("")
    setMemo("")
    setLotNo("")
    setUnitPrice("")
    setAmountUsd("")
    setAmountCny("")
    setStorageLocation("")
    setImporter("")
    setSerialsText("")
    setNotice(`직전 기록(${movement.product_name})을 복제했습니다. 수량·경로를 확인하고 저장하세요.`)
  }

  const readPlannedConfirmInput = useCallback((
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
  }, [confirmQtys, confirmDates])

  const confirmPlannedMovementRequest = useCallback(async (
    movement: HardwareMovement,
    override: { quantity?: number; occurredAt?: string } = {}
  ) => {
    const { qty, occurredAt } = readPlannedConfirmInput(movement, override)
    await adminFetchJson(`/api/admin/hardware/movements/${movement.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "confirm-planned", occurredAt, confirmQty: qty }),
    })
    return qty
  }, [readPlannedConfirmInput])

  const confirmPlannedMovement = useCallback(async (
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
  }, [busy, confirmingGroupKey, confirmingId, confirmPlannedMovementRequest, refresh])

  const confirmPlannedGroup = useCallback(async (group: { key: string; customer: string; items: HardwareMovement[] }) => {
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
  }, [plannedConfirmLocked, readPlannedConfirmInput, confirmPlannedMovementRequest, refresh])

  const voidMovement = useCallback((movement: HardwareMovement) => {
    if (movement.voided_at) return
    setVoidReason("")
    setVoidTarget(movement)
  }, [])

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

  const startPlannedEntry = useCallback(() => {
    openSheet("planned")
  }, [openSheet])

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

  // 샘플 프리셋 ↔ 유닛 트래커 연계 — 현재 폼 품목 기준 선택 풀과 필요 선택 수.
  // 필요 수 = min(수량, 풀 크기): 풀이 수량보다 작으면 있는 만큼 선택하고 부족분은 저장 시 자동 발급.
  const draftProductName = customProduct.trim() || selectedItem?.name || ""
  const draftQuantityNumber = Math.max(0, Math.floor(Number(quantity) || 0))
  const sampleLoanPool = useMemo(
    () => (sampleUnits ?? []).filter((unit) => unit.status === "office" && unit.product_name === draftProductName),
    [sampleUnits, draftProductName]
  )
  const sampleReturnPool = useMemo(
    () => (sampleUnits ?? []).filter((unit) => unit.status === "loaned" && unit.product_name === draftProductName),
    [sampleUnits, draftProductName]
  )
  const sampleLoanNeed = sampleSource === "사무실" ? Math.min(draftQuantityNumber, sampleLoanPool.length) : 0
  const sampleReturnNeed = Math.min(draftQuantityNumber, sampleReturnPool.length)

  const toggleSampleUnit = (unitId: string, cap: number) => {
    setSampleUnitSelection((current) => {
      if (current.includes(unitId)) return current.filter((id) => id !== unitId)
      if (current.length >= cap) return current
      return [...current, unitId]
    })
  }

  // 품목·프리셋이 바뀌면 기존 유닛 선택은 무효 — 시트가 닫히면 고객명도 함께 리셋.
  useEffect(() => {
    setSampleUnitSelection([])
  }, [activePresetKey, draftProductName])
  useEffect(() => {
    if (!sheetOpen) {
      setSampleCustomer("")
      setSampleUnitSelection([])
    }
  }, [sheetOpen])

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
      // 출고의 판매 금액(USD) 필드는 단건·비샘플에서만 노출된다 — 숨겨진 상태(샘플 전환·배치)에
      // 남은 입력값이 조용히 저장되지 않도록 비노출 케이스는 null 강제(보이는 값=저장 값).
      // 입고 원가 경로(amountUsd 공유 상태)는 기존 그대로.
      amountUsd:
        movementType === "outbound" && (outboundMode === "sample" || sheetMode !== "single")
          ? null
          : parseOptionalNumber(amountUsd),
      amountCny: parseOptionalNumber(amountCny),
      storageLocation: storageLocation.trim(),
      importer: importer.trim(),
      serials: serialsText.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean),
      // 예정 여부는 출고에만 의미가 있다 — 다른 유형은 undefined로 두어 status 폴백만 쓴다.
      isPlanned: movementType === "outbound" ? isPlanned : undefined,
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

  // 입고 재설계 분기 — lot 단위 다품목 입력 루프(공유 헤더 → 품목 담기 → 리스트 → 저장)는 입고+작업건+신규에서만 적용.
  // 출고 작업건·단건·상세·편집 레이아웃은 이 분기 밖에서 현행 유지한다.
  const inboundBatchLayout = movementType === "inbound" && sheetMode === "batch" && !editingId && quickCartEnabled

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

  // 스테이징 라인별 실제/예정 토글 — draft.isPlanned를 뒤집고 status 파생을 즉시 반영한다.
  // (출고 라인 전용. 저장 시 toServerDraft가 다시 파생하지만, 큐 표시도 바로 맞춘다.)
  const toggleQuickCartLinePlanned = (index: number) => {
    setQuickCart((current) =>
      current.map((draft, itemIndex) => {
        // 샘플 대여(사무실→샘플)는 실제/예정 개념이 없다 — status를 덮어쓰지 않고 보존한다.
        if (itemIndex !== index || draft.movementType !== "outbound" || isSampleOutbound(draft)) return draft
        const nextPlanned = !isDraftPlanned(draft)
        const nextDraft: HardwareMovementDraft = { ...draft, isPlanned: nextPlanned }
        return { ...nextDraft, status: deriveStatus(nextDraft) }
      })
    )
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
        // status 파생·isPlanned 제거는 서버 전송 직전에만 적용 — 큐에는 UI 판별용 원본을 남긴다.
        body: JSON.stringify({ movements: submittedCart.map(toServerDraft) }),
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

  // 원장 저장 성공 후 샘플 유닛 트래커 동기화 — 대여(loan)/반환(return)/배정(register).
  // movement와는 soft 참조(movementRef)로만 잇는다. 실패해도 원장은 이미 저장된 상태이므로
  // 호출부에서 별도 에러로 알린다(원장 실패와 구분).
  const syncSampleTracker = async (draft: HardwareMovementDraft, movementRef: string | null) => {
    const common = {
      occurredAt: draft.occurredAt || todayKey(),
      movementRef: movementRef ?? undefined,
      memo: draft.memo.trim() || undefined,
    }
    if (activePresetKey === "sampleAssign") {
      await adminFetchJson("/api/admin/hardware/samples", {
        method: "POST",
        body: JSON.stringify({
          action: "register",
          itemId: draft.itemId,
          productName: draft.productName,
          count: draft.quantity,
          status: "office",
          owner: draft.owner.trim() || undefined,
          ...common,
        }),
      })
    } else if (activePresetKey === "sample") {
      const customer = sampleCustomer.trim()
      const selected = sampleUnitSelection.slice(0, draft.quantity)
      if (selected.length > 0) {
        await adminFetchJson("/api/admin/hardware/samples", {
          method: "POST",
          body: JSON.stringify({
            action: "event",
            eventType: "loan",
            unitIds: selected,
            customer,
            owner: draft.owner.trim() || undefined,
            ...common,
          }),
        })
      }
      const mint = draft.quantity - selected.length
      if (mint > 0) {
        await adminFetchJson("/api/admin/hardware/samples", {
          method: "POST",
          body: JSON.stringify({
            action: "register",
            itemId: draft.itemId,
            productName: draft.productName,
            count: mint,
            status: "loaned",
            customer,
            owner: draft.owner.trim() || undefined,
            ...common,
            memo: [draft.memo.trim(), "대여 반출 시 자동 발급"].filter(Boolean).join(" · "),
          }),
        })
      }
    } else if (activePresetKey === "sampleReturn" && sampleUnitSelection.length > 0) {
      await adminFetchJson("/api/admin/hardware/samples", {
        method: "POST",
        body: JSON.stringify({
          action: "event",
          eventType: "return",
          unitIds: sampleUnitSelection,
          ...common,
        }),
      })
    }
    setSampleCustomer("")
    setSampleUnitSelection([])
    await loadSampleUnits()
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

      // status 파생·isPlanned 제거를 전송 직전에 적용한다.
      const serverDraft = toServerDraft(draft)

      const saveResult = await adminFetchJson<{ movement?: HardwareMovement }>("/api/admin/hardware/movements", {
        method: "POST",
        body: JSON.stringify({
          ...serverDraft,
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
      // 성공 노티스에 경로(출발→도착)를 병기해 방금 기록한 이동을 즉시 확인할 수 있게 한다.
      const routeHint = `${draft.fromLocation || "-"} → ${draft.toLocation || (draft.movementType === "outbound" ? "고객" : "-")}`
      setNotice(
        `${draft.productName} · ${activePreset.label} ${formatNumber(draft.quantity)}대 (${routeHint})를 기록했습니다.${
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
      // 샘플 프리셋이면 유닛 트래커도 함께 기록 — 원장은 이미 저장됐으므로 실패는 별도 문구로 알린다.
      if (activePresetKey === "sample" || activePresetKey === "sampleReturn" || activePresetKey === "sampleAssign") {
        try {
          await syncSampleTracker(draft, saveResult?.movement?.id ?? null)
        } catch (syncErr) {
          setError(
            `원장은 저장됐지만 샘플 트래커 기록에 실패했습니다: ${
              syncErr instanceof Error ? syncErr.message : String(syncErr)
            } — 샘플 트래커에서 수동으로 정정하세요.`
          )
        }
      }
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
      // 수정은 status 필드를 직접 편집하므로 파생하지 않고, UI 전용 isPlanned만 제거한다.
      // toServerDraft는 status를 파생하므로, 사용자가 입력한 원본 status로 되돌린다.
      const editPayload = { ...toServerDraft(draft), status: draft.status }
      await adminFetchJson(`/api/admin/hardware/movements/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "update", ...editPayload }),
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
    // 샘플 트래커 연계 검증 — 원장 저장 전에 막아야 원장·트래커가 어긋나지 않는다.
    if (activePresetKey === "sample") {
      if (!sampleCustomer.trim()) {
        setError("샘플 대여에는 고객사명이 필요합니다 — 트래커가 유닛 행방을 기록합니다.")
        return
      }
      if (sampleSource === "사무실" && sampleUnitSelection.length !== sampleLoanNeed) {
        setError(`대여 나갈 유닛 ${formatNumber(sampleLoanNeed)}대를 선택하세요 (사무실 보유 ${formatNumber(sampleLoanPool.length)}대).`)
        return
      }
    }
    if (activePresetKey === "sampleReturn" && sampleReturnNeed > 0 && sampleUnitSelection.length !== sampleReturnNeed) {
      setError(`반환할 유닛 ${formatNumber(sampleReturnNeed)}대를 선택하세요 (대여중 ${formatNumber(sampleReturnPool.length)}대).`)
      return
    }
    const planned = isDraftPlanned(draft)
    // CRM 오더 확인은 단건 실제 "판매" 출고에만 뜬다 — 샘플 대여(사무실→샘플)는 CRM 연동 없이 바로 저장한다.
    if (draft.movementType === "outbound" && !planned && !isSampleOutbound(draft)) {
      await openCrmConfirmation(draft)
      return
    }
    await createMovementFromDraft(draft, null)
  }

  const activeTabId = `hardware-tab-${activeTab}`
  const activePanelId = `hardware-tabpanel-${activeTab}`

  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = HARDWARE_TABS.length - 1
    let nextIndex: number | null = null

    if (event.key === "ArrowRight") nextIndex = index === lastIndex ? 0 : index + 1
    if (event.key === "ArrowLeft") nextIndex = index === 0 ? lastIndex : index - 1
    if (event.key === "Home") nextIndex = 0
    if (event.key === "End") nextIndex = lastIndex

    if (nextIndex == null) return
    event.preventDefault()
    setActiveTab(HARDWARE_TABS[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] pb-24">
      <header className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 pb-5 pt-6 sm:px-6 lg:px-9 lg:pt-8">
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
              onClick={() => {
                void refresh()
                void loadSampleUnits()
              }}
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

      </header>

      {/* Sub-tabs — 지사 대시보드와 동일한 폴더형 스트립(#EBE8E2 위에 활성 탭만 본문색으로 채움) */}
      <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#EBE8E2] px-2 sm:px-4 lg:px-9">
        <div className="admin-scroll-snap-x no-scrollbar -mb-px flex flex-nowrap gap-0 overflow-x-auto" role="tablist" aria-label="하드웨어 하위 탭">
          {HARDWARE_TABS.map((tab, index) => {
            const active = activeTab === tab.id
            const plannedCount = data?.plannedMovements.length ?? 0
            return (
              <button
                key={tab.id}
                id={`hardware-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`hardware-tabpanel-${tab.id}`}
                tabIndex={active ? 0 : -1}
                ref={(node) => { tabRefs.current[index] = node }}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={`relative mt-1 flex shrink-0 cursor-pointer flex-col items-start gap-0.5 rounded-t-lg px-4 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 sm:px-5 sm:py-3 ${
                  active
                    ? "bg-[#FAFAF8] text-[#111110]"
                    : "bg-transparent text-[#615D59] hover:text-[#111110]"
                }`}
              >
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold tracking-[-0.01em]">
                  {tab.label}
                  {tab.id === "home" && plannedCount > 0 ? (
                    <span className="rounded-full bg-[#FBF1E0] px-1.5 py-0.5 text-[10.5px] font-bold text-[#A8741A]">
                      {formatNumber(plannedCount)}
                    </span>
                  ) : null}
                </span>
                <span className="hidden whitespace-nowrap text-[10.5px] font-medium text-[#615D59] min-[420px]:block">{tab.description}</span>
                {active && (
                  <span className="absolute inset-x-3 -bottom-px h-[2.5px] rounded-sm bg-[#084734]" />
                )}
              </button>
            )
          })}
        </div>
      </div>

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
          // 콜드로드 스켈레톤 — 딥링크(?tab=…) 직행 시 레이아웃 점프가 없도록 활성 탭 레이아웃과 일치시킨다(HW-8).
          activeTab === "history" ? (
            <div className="space-y-4" aria-hidden>
              <div className="h-[72px] animate-pulse rounded-xl bg-[#F6F5F4]" />
              <div className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white">
                <div className="h-10 animate-pulse bg-[#F6F5F4]" />
                {Array.from({ length: 7 }).map((_, index) => (
                  <div key={index} className="border-t border-[rgba(0,0,0,0.06)] px-5 py-3.5">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-[#F6F5F4]" />
                    <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-[#F6F5F4]" />
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === "entry" ? (
            <div className="space-y-5" aria-hidden>
              <div className="h-10 w-full max-w-[340px] animate-pulse rounded-lg bg-[#F6F5F4]" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-20 animate-pulse rounded-xl bg-[#F6F5F4]" />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4" aria-hidden>
              <div className="grid gap-4 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-32 animate-pulse rounded-xl bg-[#F6F5F4]" />
                ))}
              </div>
              <div className="h-14 animate-pulse rounded-xl bg-[#F6F5F4]" />
              <div className="h-72 animate-pulse rounded-xl bg-[#F6F5F4]" />
            </div>
          )
        ) : (
          <>
            {activeTab === "home" && (
            <motion.div
              id={activePanelId}
              role="tabpanel"
              aria-labelledby={activeTabId}
              className="space-y-5"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            >
            {/* 위계: 이관 신선도 → 현황 요약(카드·판매) → 검색 → 대기 작업(예상 출고) → 재고 상세(위치·표) → 샘플 → 알림·로그.
                예상 출고는 확정을 기다리는 할 일이라 재고 상세보다 위, 샘플 트래커는 참조 성격이라 아래에 둔다. */}
            <ImportFreshnessStrip importRun={data?.importRun ?? null} />

            <CategoryCardsSection categoryCards={categoryCards.cards} etcSummary={categoryCards.etcSummary} />

            <SalesPeriodSummary summary={salesPeriodSummary} onOpenDetail={openOutboundDetail} />

            <HardwareSearchPanel
              hardwareSearch={hardwareSearch}
              setHardwareSearch={setHardwareSearch}
              hardwareSearchResults={hardwareSearchResults}
              prepareQuickEntry={prepareQuickEntry}
              setActiveTab={setActiveTab}
              setHistoryType={setHistoryType}
              setProductFilter={setProductFilter}
              setCustomerFilter={setCustomerFilter}
              setSearch={setSearch}
              setLotFilter={setLotFilter}
              setMovementsPage={setMovementsPage}
              confirmPlannedMovement={confirmPlannedMovement}
              plannedConfirmLocked={plannedConfirmLocked}
              setCustomerDetail={setCustomerDetail}
            />

            <PlannedOutboundPanel
              data={data}
              plannedMovementQuantity={plannedMovementQuantity}
              plannedStaleGroupCount={plannedStaleGroupCount}
              startPlannedEntry={startPlannedEntry}
              plannedConfirmLocked={plannedConfirmLocked}
              plannedPagination={plannedPagination}
              setPlannedPage={setPlannedPage}
              confirmQtys={confirmQtys}
              setConfirmQtys={setConfirmQtys}
              plannedConfirmResults={plannedConfirmResults}
              confirmDates={confirmDates}
              setConfirmDates={setConfirmDates}
              editMovement={editMovement}
              confirmingId={confirmingId}
              confirmingGroupKey={confirmingGroupKey}
              confirmPlannedGroup={confirmPlannedGroup}
              confirmPlannedMovement={confirmPlannedMovement}
            />

            <LocationMapSection
              locationMap={locationMap}
              locationMapExpanded={locationMapExpanded}
              setLocationMapExpanded={setLocationMapExpanded}
              prepareQuickEntry={prepareQuickEntry}
            />

            <StockLevelsSection
              openSections={openSections}
              toggleSection={toggleSection}
              data={data}
              stockPagination={stockPagination}
              setStockPage={setStockPage}
              prepareQuickEntry={prepareQuickEntry}
            />

            <SampleTrackerSection
              units={sampleUnits}
              latestEvents={sampleLatestEvents}
              loading={sampleUnitsLoading}
              error={sampleUnitsError}
              stock={data?.stock ?? null}
              onOpenUnit={setSampleUnitSheetId}
              onChanged={loadSampleUnits}
            />

            <AlertsOutboundSections
              openSections={openSections}
              toggleSection={toggleSection}
              alertsPagination={alertsPagination}
              setAlertsPage={setAlertsPage}
              mutedAlerts={mutedAlerts}
              outboundPagination={outboundPagination}
              setOutboundPage={setOutboundPage}
            />
            </motion.div>
            )}

            {activeTab === "entry" && (
            <motion.div
              id={activePanelId}
              role="tabpanel"
              aria-labelledby={activeTabId}
              className="space-y-5"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            >
              {/* 뷰 전환 줄 — 카드 없이 세그먼트+CTA만. 콘텐츠 카드(물량·집계)가 시각적 주인공이 되도록 한다. */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]" role="tablist" aria-label="입출고 보기">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={entrySub === "inbound"}
                    onClick={() => setEntrySub("inbound")}
                    className={`cursor-pointer rounded-md px-3.5 py-2 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 ${
                      entrySub === "inbound" ? "bg-[#ECFDF5] text-[#084734]" : "text-[#615D59] hover:text-[#111110]"
                    }`}
                  >
                    입고 · 물량번호
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={entrySub === "outbound"}
                    onClick={() => setEntrySub("outbound")}
                    className={`cursor-pointer rounded-md px-3.5 py-2 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 ${
                      entrySub === "outbound" ? "bg-[#ECFDF5] text-[#084734]" : "text-[#615D59] hover:text-[#111110]"
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

              {entrySub === "inbound" && (
                <InboundLotsSection inboundSearch={inboundSearch} setInboundSearch={setInboundSearch} inboundLots={inboundLots} />
              )}

              {entrySub === "outbound" && (
                <OutboundPeriodSection
                  outboundBuckets={outboundBuckets}
                  outPeriod={outPeriod}
                  setOutPeriod={setOutPeriod}
                  openPeriods={openPeriods}
                  setOpenPeriods={setOpenPeriods}
                  setCustomerDetail={setCustomerDetail}
                />
              )}

              <div className="flex justify-end">
                <button type="button" onClick={() => setActiveTab("history")} className="-mx-2 cursor-pointer rounded px-2 py-1 text-[11px] font-bold text-[#084734] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40">
                  전체 내역 →
                </button>
              </div>
            </motion.div>
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
                    {!editingId && sheetView === "quick" && (
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
                        반납·샘플 반환·샘플 배정·수리·조정은 배치 담기를 지원하지 않습니다 — 단건 기록 모드로 저장하세요.
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
                                {row.product} · 가용 {formatNumber(row.availableStock)}
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

                    <div className={`grid grid-cols-1 gap-3 ${inboundBatchLayout ? "" : "min-[400px]:grid-cols-2"}`}>
                      {inboundBatchLayout ? (
                      <div>
                        <span id="hardware-quantity-label" className={SHEET_LABEL_CLASS}>수량</span>
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
                        <label className="block">
                          <span className={SHEET_LABEL_CLASS}>대여 고객사</span>
                          <input
                            value={sampleCustomer}
                            onChange={(event) => setSampleCustomer(event.target.value)}
                            placeholder="예: 남명학원 — 트래커에 유닛 행방으로 기록됩니다"
                            list="hardware-customer-options"
                            className={SHEET_INPUT_CLASS}
                          />
                        </label>
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
                      <label className="block">
                        <span className={SHEET_LABEL_CLASS}>
                          {isCustomerDestination ? "도착 (고객사)" : "도착"}
                        </span>
                        <input
                          value={toLocation}
                          onChange={(event) => setToLocation(event.target.value)}
                          placeholder={isCustomerDestination ? "고객사명 — 예: 남명학원" : "창고/샘플/사무실"}
                          list={isCustomerDestination ? "hardware-customer-options" : "hardware-location-options"}
                          className={SHEET_INPUT_CLASS}
                        />
                      </label>
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

                    <datalist id="hardware-customer-options">
                      {historyCustomers.map((customer) => (
                        <option key={customer} value={customer} />
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
            <motion.div
              id={activePanelId}
              role="tabpanel"
              aria-labelledby={activeTabId}
              className="space-y-5"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            >
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
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setFiltersExpanded((current) => !current)}
                        aria-expanded={filtersExpanded}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 ${
                          filtersExpanded
                            ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                            : "border-[rgba(0,0,0,0.08)] bg-white text-[#615D59] hover:bg-[#F6F5F4]"
                        }`}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        상세 필터
                        {advancedHistoryFilterCount > 0 && (
                          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#084734] px-1 text-[10px] font-bold text-white">
                            {advancedHistoryFilterCount}
                          </span>
                        )}
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filtersExpanded ? "rotate-180" : ""}`} />
                      </button>
                      {hasHistoryFilter && (
                        <button
                          type="button"
                          onClick={resetHistoryFilters}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4]"
                        >
                          <X className="h-3.5 w-3.5" />
                          전체 초기화
                        </button>
                      )}
                    </div>
                  </div>
                  {hasHistoryFilter ? (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[rgba(0,0,0,0.06)] pt-3">
                      <span className="text-[11px] font-bold text-[#615D59]">적용된 필터</span>
                      {activeHistoryFilterChips.map((chip) => (
                        <button
                          key={chip.key}
                          type="button"
                          onClick={chip.onRemove}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#084734] transition hover:bg-[#d6f7e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45"
                        >
                          {chip.label}
                          <X className="h-3 w-3" />
                        </button>
                      ))}
                      <span className="ml-auto text-[11px] font-semibold text-[#615D59]">
                        필터 후 {formatNumber(filteredMovements.length)}건 / 전체 {formatNumber(data?.movements.length ?? 0)}건
                      </span>
                    </div>
                  ) : null}
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
                  {filtersExpanded && (
                  <>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className="w-12 shrink-0 text-[12px] font-bold text-[#111110]">상태</span>
                    {(
                      [
                        { key: "all", label: "전체" },
                        { key: "done", label: "완료" },
                        { key: "planned", label: "배송 예정" },
                      ] as const
                    ).map((option) => {
                      const active = historyStatus === option.key
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => {
                            setHistoryStatus(option.key)
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
                    <button
                      type="button"
                      onClick={() => {
                        setIncludeVoided((current) => !current)
                        setMovementsPage(1)
                      }}
                      aria-pressed={includeVoided}
                      className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                        includeVoided
                          ? "border-[#B43E3E] bg-[#FCE9E9] text-[#B43E3E]"
                          : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                      }`}
                    >
                      취소 포함
                    </button>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className="w-12 shrink-0 text-[12px] font-bold text-[#111110]">판매유형</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSaleTypeFilter("")
                        setMovementsPage(1)
                      }}
                      className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                        saleTypeFilter === ""
                          ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                          : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                      }`}
                    >
                      전체
                    </button>
                    {(Object.keys(SALE_TYPE_META) as OutboundSaleType[]).map((type) => {
                      const active = saleTypeFilter === type
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setSaleTypeFilter(active ? "" : type)
                            setMovementsPage(1)
                          }}
                          className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                            active
                              ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                              : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                          }`}
                        >
                          {SALE_TYPE_META[type].label}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className="w-12 shrink-0 text-[12px] font-bold text-[#111110]">기간</span>
                    {(
                      [
                        { key: "thisMonth", label: "이번 달" },
                        { key: "lastMonth", label: "지난 달" },
                        { key: "last30", label: "최근 30일" },
                      ] as const
                    ).map((option) => {
                      const range = historyDateRange(option.key)
                      const active = historyDateFrom === range.from && historyDateTo === range.to
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => {
                            setHistoryDateFrom(range.from)
                            setHistoryDateTo(range.to)
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
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryDateFrom("")
                        setHistoryDateTo("")
                        setMovementsPage(1)
                      }}
                      className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                        historyDateFrom === "" && historyDateTo === ""
                          ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                          : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                      }`}
                    >
                      전체
                    </button>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#615D59]">
                      시작
                      <input
                        type="date"
                        value={historyDateFrom}
                        max={historyDateTo || undefined}
                        onChange={(event) => {
                          setHistoryDateFrom(event.target.value)
                          setMovementsPage(1)
                        }}
                        aria-label="기간 시작일"
                        className="h-8 rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 text-[11px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#615D59]">
                      종료
                      <input
                        type="date"
                        value={historyDateTo}
                        min={historyDateFrom || undefined}
                        onChange={(event) => {
                          setHistoryDateTo(event.target.value)
                          setMovementsPage(1)
                        }}
                        aria-label="기간 종료일"
                        className="h-8 rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 text-[11px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                      />
                    </label>
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
                  </>
                  )}
                </section>

                <HistoryLogSection
                  filteredMovements={filteredMovements}
                  logGroups={logGroups}
                  pageLogGroupKeys={pageLogGroupKeys}
                  toggleAllPageLogGroups={toggleAllPageLogGroups}
                  allPageGroupsExpanded={allPageGroupsExpanded}
                  logGroupsPagination={logGroupsPagination}
                  expandedLogGroups={expandedLogGroups}
                  setDetailId={setDetailId}
                  toggleLogGroup={toggleLogGroup}
                  renderMovementRow={renderMovementRow}
                  setMovementsPage={setMovementsPage}
                />
            </motion.div>
            )}
          </>
        )}
      </main>

      <MovementDetailSheet
        detailMovement={detailMovement}
        setDetailId={setDetailId}
        reduceMotion={reduceMotion}
        detailPanelRef={detailPanelRef}
        detailLotLabel={detailLotLabel}
        detailFacts={detailFacts}
        detailCrm={detailCrm}
        detailCanEdit={detailCanEdit}
        editMovement={editMovement}
        voidMovement={voidMovement}
      />

      <CustomerHistorySheet
        customerHistory={customerHistory}
        setCustomerDetail={setCustomerDetail}
        setDetailId={setDetailId}
        reduceMotion={reduceMotion}
      />

      <SampleUnitSheet
        unit={selectedSampleUnit}
        onClose={() => setSampleUnitSheetId(null)}
        onChanged={loadSampleUnits}
        reduceMotion={reduceMotion}
      />

      {!sheetOpen && !pendingMovement && !voidTarget && !detailId && !customerDetail && !sampleUnitSheetId && (
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
        <VoidConfirmModal
          voidTarget={voidTarget}
          voidingId={voidingId}
          setVoidTarget={setVoidTarget}
          voidReason={voidReason}
          setVoidReason={setVoidReason}
          confirmVoid={confirmVoid}
        />
      )}

      {pendingMovement && (
        <CrmConfirmModal
          pendingMovement={pendingMovement}
          closeCrmConfirmation={closeCrmConfirmation}
          crmAutoReflect={crmAutoReflect}
          setCrmAutoReflect={setCrmAutoReflect}
          crmCandidates={crmCandidates}
          crmLoading={crmLoading}
          crmError={crmError}
          crmWarnings={crmWarnings}
          selectedCrmCandidateId={selectedCrmCandidateId}
          setSelectedCrmCandidateId={setSelectedCrmCandidateId}
          selectedCrmCandidate={selectedCrmCandidate}
          busy={busy}
          createMovementFromDraft={createMovementFromDraft}
        />
      )}
    </div>
  )
}
