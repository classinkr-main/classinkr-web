"use client"

// 하드웨어 인벤토리 클러스터 공유 심볼 — HardwareInventoryClient(부모)와 inventory/* 자식 섹션이
// 함께 쓰는 타입·상수·헬퍼·소형 컴포넌트를 물리적으로 모아 부모↔자식 순환 import를 제거한다.
// 이 파일은 부모(HardwareInventoryClient)를 import하지 않는다(순환 금지).

import type { ReactNode } from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

import type { AdminListPaginationResult } from "@/lib/admin-list-pagination"

export type HardwareMovementType = "inbound" | "outbound" | "return" | "transfer" | "repair" | "adjust"

export interface HardwareItem {
  id: string
  name: string
  sku: string | null
  category: string | null
  reorder_point: number
  lead_time_days: number
  active: boolean
  source_aliases: string[]
}

export interface HardwareMovement {
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
  // 대시보드 payload에 그대로 실려 오는 원본 레코드 — 구조화 CRM 링크(raw.crmLink)를 여기서 읽는다.
  raw?: unknown
  created_by: string | null
  created_at: string
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  converted_from_movement_id: string | null
  converted_to_movement_id: string | null
}

export interface HardwareStockRow {
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

export interface HardwareAlert {
  id: string
  severity: "critical" | "warning" | "info"
  product: string
  title: string
  detail: string
  // 취급 중단·미가동 품목(창고 0·예정 0·최근 출고 0)의 상시 부족 알림 — 접힌 그룹으로 강등 표시.
  muted?: boolean
}

export interface HardwareDashboard {
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

export interface HardwareCrmOrderCandidate {
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

export interface HardwareMovementDraft {
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
  // UI 판별 전용 — 출고 라인이 실제(false)/예정(true)인지. 서버 전송 직전 deriveStatus로
  // status에 반영하고 payload에서는 제외한다(서버 status 규약은 status 문자열만 본다).
  isPlanned?: boolean
}

export type HardwareTab = "home" | "entry" | "history"

export type HardwareSectionKey = "stock" | "outbound" | "alerts"

export const MOVEMENT_LABEL: Record<HardwareMovementType, string> = {
  inbound: "입고",
  outbound: "출고",
  return: "반납",
  transfer: "이동",
  repair: "수리",
  adjust: "조정",
}

export const MOVEMENT_TONE: Record<HardwareMovementType, string> = {
  inbound: "bg-[#ECFDF5] text-[#084734]",
  outbound: "bg-[#FCE9E9] text-[#B43E3E]",
  return: "bg-[#ECFDF5] text-[#084734]",
  transfer: "bg-[#F6F5F4] text-[#31302E]",
  repair: "bg-[#FBF1E0] text-[#A8741A]",
  adjust: "bg-[#F6F5F4] text-[#31302E]",
}

export const ALERT_TONE: Record<HardwareAlert["severity"], string> = {
  critical: "border-[#F2B8B8] bg-[#FCE9E9] text-[#8F2C2C]",
  warning: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]",
  info: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]",
}

export type PeriodGranularity = "month" | "quarter" | "year"

export const UNSPECIFIED_CUSTOMER = "고객(미지정)"

// 매출 장부(REV 렌즈) 딥링크 — 하드웨어 상품 필터 + 고객명 검색으로 진입한다.
// 금액은 링크에 싣지 않는다(하드웨어 원장은 USD, 장부는 CNY라 직접 비교가 안 됨).
export function ledgerHref(customer: string): string {
  return `/admin/branch/ledger?lens=rev&prod=hardware&q=${encodeURIComponent(customer)}`
}

// 출고 판매유형 — 시트 "유형"(Sales/Sample/Promotion/A/S)에서 파생. import는 memo를
// `{유형} · {remarks}` 형태로 남기므로 앞 토큰을 읽는다. 매출 집계는 판매(sales)만 잡는다.
export type OutboundSaleType = "sales" | "sample" | "promotion" | "as"

export const SALE_TYPE_META: Record<OutboundSaleType, { label: string; tone: string }> = {
  sales: { label: "판매", tone: "bg-[#ECFDF5] text-[#084734]" },
  sample: { label: "샘플", tone: "bg-[#F6F5F4] text-[#615D59]" },
  promotion: { label: "프로모션", tone: "bg-[#FBF1E0] text-[#7A520F]" },
  as: { label: "A/S", tone: "bg-[#FCE9E9] text-[#B43E3E]" },
}

export function outboundSaleType(movement: HardwareMovement): OutboundSaleType | null {
  if (movement.movement_type !== "outbound") return null
  const token = (movement.memo ?? "").split("·")[0].trim().toLowerCase()
  if (token === "a/s" || token === "as") return "as"
  if (token === "promotion") return "promotion"
  if (token === "sample" || movement.to_location === "샘플") return "sample"
  return "sales"
}

// ---------------------------------------------------------------------------
// 샘플 유닛 트래킹 (개체 단위) — 서버 저장소(lib/repositories/hardware-samples)와 필드 규약 동일.
// 클라이언트 섹션·시트·부모가 함께 쓰는 타입/라벨만 여기 둔다(server-only 모듈 import 금지).

export type SampleUnitStatus = "office" | "loaned" | "repair" | "converted" | "retired"

export type SampleEventType = "assign" | "loan" | "return" | "repair" | "convert" | "adjust" | "memo" | "retire"

export interface HardwareSampleUnit {
  id: string
  item_id: string | null
  product_name: string
  asset_code: string
  serial_no: string | null
  status: SampleUnitStatus
  current_customer: string | null
  current_owner: string | null
  loaned_at: string | null
  expected_return_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface HardwareSampleEvent {
  id: string
  unit_id: string
  event_type: SampleEventType
  occurred_at: string
  customer: string | null
  from_location: string | null
  to_location: string | null
  memo: string | null
  movement_ref: string | null
  created_by: string | null
  created_at: string
}

export const SAMPLE_STATUS_META: Record<SampleUnitStatus, { label: string; tone: string }> = {
  office: { label: "사무실", tone: "bg-[#F6F5F4] text-[#31302E]" },
  loaned: { label: "대여중", tone: "bg-[#FCE9E9] text-[#B43E3E]" },
  repair: { label: "수리", tone: "bg-[#FBF1E0] text-[#A8741A]" },
  converted: { label: "판매 전환", tone: "bg-[#ECFDF5] text-[#084734]" },
  retired: { label: "폐기", tone: "bg-[#F6F5F4] text-[#A39E98]" },
}

export const SAMPLE_EVENT_META: Record<SampleEventType, { label: string; dot: string }> = {
  assign: { label: "등록·배정", dot: "#084734" },
  loan: { label: "대여", dot: "#B43E3E" },
  return: { label: "반환", dot: "#084734" },
  repair: { label: "수리", dot: "#A8741A" },
  convert: { label: "판매 전환", dot: "#084734" },
  adjust: { label: "정정", dot: "#615D59" },
  memo: { label: "메모", dot: "#A39E98" },
  retire: { label: "폐기", dot: "#615D59" },
}

// 대여 경과일 — loaned 유닛 목록·시트 공용. 날짜만 비교(UTC 자정 기준).
export function loanElapsedDays(loanedAt: string | null): number | null {
  if (!loanedAt) return null
  const start = new Date(`${loanedAt.slice(0, 10)}T00:00:00Z`).getTime()
  if (Number.isNaN(start)) return null
  const today = new Date(`${todayKey()}T00:00:00Z`).getTime()
  return Math.max(0, Math.round((today - start) / 86400000))
}

// 경과일(일반) — 예상 출고 큐 방치 표시, 이관 신선도 등 날짜 문자열 기반 경과 계산 공용.
export function elapsedDaysSince(dateKey: string | null): number | null {
  return loanElapsedDays(dateKey)
}

// ---- 카테고리 카드 단일 분류 ----
// 제품 분류 정규식이 화면마다 제각각이면 카드·집계·위치맵 수치가 서로 어긋난다(브라켓이 카메라
// 대수로 계상되는 식). 카드 축은 이 함수 하나만 보고, 서술 명칭("카메라"·"스탠드") 매칭 대신
// 장비 코드(T1·S1·STD1)로만 판별한다. STDM1(110")·110/65" 보드·터치펜(A1/B1/D2)·OPS/POE/
// 케이블·브라켓 등 나머지는 전부 "etc"(기타 요약)로 모아 비가시 재고를 없앤다.
export type HardwareCardGroup = "ifp86" | "ifp75" | "camera" | "stand" | "etc"

export function isPromotedProduct(product: string): boolean {
  return /\(\s*promoted\s*\)/i.test(product)
}

export function isCoreIfpProduct(product: string, size: "75" | "86"): boolean {
  return new RegExp(`^${size}["”]?\\s*IFP`, "i").test(product)
}

export function hardwareCardGroup(product: string): HardwareCardGroup {
  if (isCoreIfpProduct(product, "86")) return "ifp86"
  if (isCoreIfpProduct(product, "75")) return "ifp75"
  if (/\bT1\b|\bS1\b/i.test(product)) return "camera"
  if (/\bSTD1\b/i.test(product)) return "stand"
  return "etc"
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

export function formatDate(value: string | null) {
  if (!value) return "-"
  return value.slice(0, 10)
}

// 배송 예정(예약) 출고 판별 — 서버 집계 isPlannedStatus와 같은 규약(예정/예약/대기/planned).
// 상세 로그에서 실제 출고와 시각적으로 구분하기 위한 표시 전용 헬퍼.
// 주의: DB에서 온 HardwareMovement에는 isPlanned 필드가 없으므로 status 정규식만 본다.
export function isPlannedMovement(movement: HardwareMovement): boolean {
  return movement.movement_type === "outbound" && /예정|예약|대기|planned/i.test(movement.status ?? "")
}

// 기술 메타 전용 mono/tabular 유틸 토큰 — lot 코드·YYYY-MM-DD 날짜·'마지막 이관'·스냅샷 해시 같은
// 원장 메타데이터에만 쓴다(본문은 sans 유지). 값·포맷은 불변, 시각 위계만 부여한다.
export const MONO_META_CLASS = "font-mono tabular-nums tracking-[-0.01em]"

// "FY24-25"는 H1~H8 물량번호 체계가 생기기 전 시트의 placeholder 값이다.
// 그룹핑·검색은 원본 값을 그대로 쓰고, 배지 표시만 H-넘버링과 나란히 보이도록 "H0"으로 맞춘다.
export function formatLotLabel(lot: string | null | undefined): string | null {
  if (!lot) return null
  const trimmed = lot.trim()
  if (!trimmed) return null
  if (/^FY24-25$/i.test(trimmed)) return "H0"
  return trimmed
}

export function lotFifoRank(lot: string): number | null {
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

export function previewFifoLots(lots: HardwareStockRow["lotBalances"], quantity: number) {
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

export function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value)
}

const CURRENCY_FORMAT: Record<"KRW" | "USD" | "CNY", { locale: string; symbol: string; fractionDigits: number }> = {
  KRW: { locale: "ko-KR", symbol: "₩", fractionDigits: 0 },
  USD: { locale: "en-US", symbol: "$", fractionDigits: 2 },
  CNY: { locale: "zh-CN", symbol: "¥", fractionDigits: 2 },
}

export function formatCurrency(value: number | null, currency: "KRW" | "USD" | "CNY" = "KRW") {
  if (value == null) return "-"
  const { locale, symbol, fractionDigits } = CURRENCY_FORMAT[currency]
  const amount = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
  // KRW keeps the original trailing-원 form; USD/CNY use a leading symbol.
  return currency === "KRW" ? `${amount}원` : `${symbol}${amount}`
}

export function formatAvg(value: number) {
  if (value === 0) return "0"
  if (value < 1) return value.toFixed(1)
  return String(Math.round(value * 10) / 10)
}

export function statusCopy(row: HardwareStockRow) {
  if (row.low) return "부족"
  if (row.orderRecommended) return "주문 검토"
  return "정상"
}

export function statusClass(row: HardwareStockRow) {
  if (row.low) return "bg-[#FCE9E9] text-[#B43E3E]"
  if (row.orderRecommended) return "bg-[#FBF1E0] text-[#A8741A]"
  return "bg-[#ECFDF5] text-[#084734]"
}

export type ProductFilterKey = "" | "ifp86" | "ifp75" | "t1" | "std1" | "promotion"

export function confidenceCopy(value: HardwareCrmOrderCandidate["confidence"]) {
  if (value === "high") return "높음"
  if (value === "medium") return "보통"
  return "검토"
}

export function confidenceClass(value: HardwareCrmOrderCandidate["confidence"]) {
  if (value === "high") return "bg-[#ECFDF5] text-[#084734]"
  if (value === "medium") return "bg-[#FBF1E0] text-[#A8741A]"
  return "bg-[#F6F5F4] text-[#615D59]"
}

export function SectionHeader({
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

export function PaginationControls<T>({
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

export function QuickMoveButton({
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
