"use client"

// 하드웨어 인벤토리 클러스터 공유 심볼 — HardwareInventoryClient(부모)와 inventory/* 자식 섹션이
// 함께 쓰는 타입·상수·헬퍼·소형 컴포넌트를 물리적으로 모아 부모↔자식 순환 import를 제거한다.
// 이 파일은 부모(HardwareInventoryClient)를 import하지 않는다(순환 금지).

import type { ReactNode } from "react"
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RotateCcw,
  Settings2,
  Wrench,
  type LucideIcon,
} from "lucide-react"

import type { AdminListPaginationResult } from "@/lib/admin-list-pagination"
import { fiscalQuarter } from "@/lib/branch/fiscal"
// 아래 "export { ... } from" 재수출과 별개로, 이 파일 자체(PRODUCT_FILTER_OPTIONS)가 로컬에서
// 써야 해서 일반 import도 함께 둔다 — re-export만으로는 이 모듈 스코프에 바인딩이 생기지 않는다.
import { isCoreIfpProduct } from "@/lib/hardware/product"

export type HardwareMovementType = "inbound" | "outbound" | "return" | "transfer" | "repair" | "adjust"

// /api/admin/hardware 응답의 item 형태(lib HardwareItemView) — 화면이 읽지 않는 sku/active/created_at/
// updated_at은 서버가 싣지 않는다(T5-A). 활성 필터는 서버 stock 집계에서 이미 끝난 상태.
export interface HardwareItem {
  id: string
  name: string
  category: string | null
  reorder_point: number
  lead_time_days: number
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
  // 대시보드 payload의 raw는 서버가 { crmLink }만 남긴 투영(lib HardwareMovementView) — 구조화 CRM 링크를
  // 여기서 읽는다. 시트 원본 행 등 나머지 raw는 응답에 실리지 않는다(T5-A).
  raw?: unknown
  // 서버 isPlannedStatus 판정(예정/예약/대기/planned) — isPlannedMovement가 status 정규식보다 먼저 본다.
  planned?: boolean
  created_at: string
  voided_at: string | null
  // 대시보드 payload는 voided 행을 싣지 않으므로 취소 메타(voided_by·void_reason·created_by)도 내려오지 않는다.
  // 취소 정보 표시 분기는 전체 원장 행을 받는 경로를 위해 남겨 두고, 여기서는 선택 필드로만 둔다.
  voided_by?: string | null
  void_reason?: string | null
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
  // 알림이 가리키는 품목의 id — 알림 카드의 QuickMoveButton이 prepareQuickEntry(itemId, presetKey)로
  // 바로 빠른 기록 시트를 여는 데 쓴다.
  itemId: string
  product: string
  title: string
  detail: string
  // 취급 중단·미가동 품목(창고 0·예정 0·최근 출고 0)의 상시 부족 알림 — 접힌 그룹으로 강등 표시.
  muted?: boolean
}

export interface HardwareImportRunSummary {
  id: string
  status: string
  started_at: string
  finished_at: string | null
  rows_imported: number | null
  rows_skipped: number | null
  error: string | null
  // 가져올 때의 미러 행 수(2026-09-23 이후 이관만) — 지금 미러와 비교해 "가져오기 대기"를 판정한다.
  mirror_rows?: HardwareMirrorRowCounts | null
  // "sheet"(시트 싱크) · "ledger_file"(원장 파일 업로드). 이전 이관은 없음.
  origin?: string | null
}

export interface HardwareMirrorRowCounts {
  inbound: number
  outbound: number
  stock: number
}

export interface HardwareMirrorState {
  syncedAt: string | null
  rows: HardwareMirrorRowCounts
}

export interface HardwareDashboard {
  items: HardwareItem[]
  stock: HardwareStockRow[]
  movements: HardwareMovement[]
  // 감사(2026-09-07 #7) — 무효 아닌 전체 이동 건수. movements.length보다 크면 2000건 캡에 걸려
  // 잘린 상태(내역 탭 "더 불러오기"로 그 너머를 받아올 수 있다). optional은 구버전 응답·테스트
  // 픽스처 호환용.
  movementsTotal?: number
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
  importRun: HardwareImportRunSummary | null
  // 하드웨어 라운드 2 S-5 — 최신 이관이 성공이 아니면 마지막 성공 이관(경과일 기준). 구응답은 필드가 없다.
  importRunLastSuccess?: HardwareImportRunSummary | null
  // 하드웨어 라운드 2 S-9 — 시트 미러 행 수·교체 시각. 조회 실패·구응답은 null/없음.
  mirror?: HardwareMirrorState | null
  // 감사(2026-09-07 #1) — 시트 이관 RPC가 구버전(20260630 마이그레이션 미적용)이면 금액 컬럼이
  // raw JSON 백업에서 복구된다. recoveredFromRawCount > 0이면 그 상태가 지금도 살아 있다는 뜻.
  // 구버전 응답·테스트 픽스처는 이 필드가 없을 수 있어 optional로 둔다(ImportFreshnessStrip이 가드).
  importCosting?: {
    recoveredFromRawCount: number
  }
  // 요청자별 필드 — API 라우트가 캐시된 대시보드 밖에서 매 요청 계산해 붙인다(Cache-Control private).
  // 없으면(구버전 응답·테스트) UI는 열어두고 서버 게이트만 믿는다.
  viewer?: {
    canFinalize: boolean
    // 기록을 만들 수 있는 역할인지(HARDWARE_EDITOR_ADMIN_API_ROLES). 표시용 — 강제는 서버 게이트다.
    canWrite?: boolean
    // 로그인한 관리자의 표시 이름(admin_profiles.display_name) — "내 담당" 칩이 movement.owner와
    // 비교하는 정본. 세션에 이름이 없으면(레거시 세션 등) null — 그 경우 "내 담당"은 아무 것도
    // 매칭하지 않는다(담당자 배정된 모든 건을 보여주던 예전 버그로 되돌아가지 않기 위함).
    name: string | null
  }
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

// 구조 분해(#6)로 HardwareInventoryClient.tsx에서 이전 — QuickRecordSheet(빠른 기록 시트)와
// 부모(프리셋 적용·바구니 병합 핸들러) 양쪽이 참조해야 해서 shared로 옮겼다. 값·판정 그대로.
export interface QuickCartSaveSummary {
  success: number
  failed: number
  savedQuantity: number
  failedQuantity: number
}

export const ENTRY_PRESETS: Array<{
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
export const DETAIL_PRESET_KEYS = new Set(["sampleReturn", "sampleAssign", "return", "repair", "adjust"])

// 시트 헤더 배지 톤 — 저장될 기록이 원장에서 받을 배지(MOVEMENT_TONE·SALE_TYPE_META)와 같은 어휘.
// 예정=Warning, 샘플=중립, 그 외는 movementType 톤.
export function presetTone(presetKey: string, movementType: HardwareMovementType): string {
  if (presetKey === "planned") return "bg-[#FBF1E0] text-[#A8741A]"
  if (presetKey === "sample") return "bg-[#F6F5F4] text-[#615D59]"
  return MOVEMENT_TONE[movementType]
}

// 샘플 대여 출처 선택지 — 기본은 사무실(남은 샘플). 사무실 재고가 없어 창고에서 바로 내보내는 실무도 있어 창고 허용.
export const SAMPLE_SOURCE_OPTIONS = ["사무실", "창고"] as const
export type SampleSource = (typeof SAMPLE_SOURCE_OPTIONS)[number]

// 텍스트 정규화 — 공백/대소문자/구두점 차이를 무시하고 품목명·검색어를 비교한다.
export function normalizeHardwareText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]+/gu, "")
}

// 클라이언트 드래프트의 예정 여부 — 신규 UI(isPlanned 세그먼트/토글)가 우선하고, 값이 없으면
// (키트·붙여넣기·직전 복제·레거시 드래프트) status 정규식으로 하위호환 폴백한다.
export function isDraftPlanned(draft: HardwareMovementDraft): boolean {
  return draft.isPlanned ?? /예정|예약|대기/.test(draft.status)
}

// 샘플 대여 라인 판별 — status 문자열(가변)이 아니라 경로/프리셋 기반 안정 신호로 고정한다.
// 샘플 프리셋의 도착지는 항상 "샘플"(ENTRY_PRESETS의 to)이라, 실제↔예정 토글이나 status 편집으로
// 문자열이 바뀌어도 이 판별은 흔들리지 않는다. 샘플은 실제/예정 개념이 없는 사무실→샘플 경로다.
export function isSampleOutbound(draft: HardwareMovementDraft): boolean {
  return draft.movementType === "outbound" && draft.toLocation.trim() === "샘플"
}

// 기록 바구니 라인 식별 키 — 같은 키의 두 드래프트는 하나로 합쳐진다(mergeQuickCartDrafts).
export function quickCartLineKey(draft: HardwareMovementDraft) {
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
    draft.serials.join(""),
  ].join(" ")
}

export const ALERT_TONE: Record<HardwareAlert["severity"], string> = {
  critical: "border-[#F2B8B8] bg-[#FCE9E9] text-[#8F2C2C]",
  warning: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]",
  info: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]",
}

export type PeriodGranularity = "month" | "quarter" | "year"

export const UNSPECIFIED_CUSTOMER = "고객(미지정)"

// 출고 도착지를 고객 라벨로 환원한다. 일반 위치(고객/창고/샘플/사무실/수리)는 "고객(미지정)"으로 묶는다.
// 구조 분해(#6)로 HardwareInventoryClient.tsx에서 이전 — QuickRecordSheet도 직접 참조해서다.
const GENERIC_LOCATIONS = new Set<string>(["고객", "창고", "샘플", "사무실", "수리", "외부/고객"])

export function customerLabel(value: string | null | undefined): string {
  const text = (value ?? "").trim()
  if (!text || GENERIC_LOCATIONS.has(text)) return UNSPECIFIED_CUSTOMER
  return text
}

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

// showroom(전시·사내 사용) = 사무실이 보유하지만 가용이 아닌 유닛(쇼룸·KC인증 등). 운영자 결정 2026-09-15.
// DB 는 supabase/migrations/20260915_hardware_sample_showroom_status.sql 적용 뒤에 이 값을 받는다.
export type SampleUnitStatus = "office" | "showroom" | "loaned" | "repair" | "converted" | "retired"

// showcase = 사무실 보관 → 전시, store = 전시·수리 → 사무실 보관.
export type SampleEventType =
  | "assign"
  | "loan"
  | "return"
  | "showcase"
  | "store"
  | "repair"
  | "convert"
  | "adjust"
  | "memo"
  | "retire"

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
  // 사무실 보관(가용)과 한눈에 갈리도록 채움 대신 외곽선으로 구분한다(파스텔 채움 지양).
  showroom: { label: "전시·사내 사용", tone: "bg-white text-[#31302E] ring-1 ring-inset ring-[rgba(0,0,0,0.16)]" },
  loaned: { label: "대여중", tone: "bg-[#FCE9E9] text-[#B43E3E]" },
  repair: { label: "수리", tone: "bg-[#FBF1E0] text-[#A8741A]" },
  converted: { label: "판매 전환", tone: "bg-[#ECFDF5] text-[#084734]" },
  retired: { label: "폐기", tone: "bg-[#F6F5F4] text-[#A39E98]" },
}

export const SAMPLE_EVENT_META: Record<SampleEventType, { label: string; dot: string }> = {
  assign: { label: "등록·배정", dot: "#084734" },
  loan: { label: "대여", dot: "#B43E3E" },
  return: { label: "반환", dot: "#084734" },
  showcase: { label: "전시로", dot: "#615D59" },
  store: { label: "사무실 보관으로", dot: "#084734" },
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
// 정의는 서버(repositories)와 공유하는 lib/hardware/product.ts가 정본 — 여기서는 클라이언트
// 소비자용 재수출만 한다(shared는 "use client"라 서버 코드가 이 파일을 직접 import하지 않는다).
export {
  hardwareCardGroup,
  isCoreIfpProduct,
  isPromotedProduct,
  type HardwareCardGroup,
} from "@/lib/hardware/product"

// 출고 기간 집계 버킷 키/라벨 — 홈 판매 요약과 기간 집계가 같은 키를 쓰는 SSOT.
// 분기·연간 모두 회계연도(4월 시작~3월 종료) 기준으로 귀속한다(운영 결정 2026-08-19 —
// 연간만 달력연도라 분기 합과 연간이 어긋나던 혼합 해소).
export function periodKey(date: string, granularity: PeriodGranularity): { key: string; label: string } {
  const year = date.slice(0, 4)
  const yearNum = Number(year) || 0
  const month = Number(date.slice(5, 7)) || 1
  const fyStartYear = month >= 4 ? yearNum : yearNum - 1
  const fyLabel = `${String(fyStartYear % 100).padStart(2, "0")}-${String((fyStartYear + 1) % 100).padStart(2, "0")}`
  if (granularity === "year") return { key: `FY${fyStartYear}`, label: `${fyLabel} 회계연도` }
  if (granularity === "quarter") {
    // 4~6월=1분기, 7~9월=2분기, 10~12월=3분기, 1~3월=4분기(직전 4월 시작 회계연도에 귀속).
    const quarter = fiscalQuarter(month)
    return { key: `${fyStartYear}Q${quarter}`, label: `${fyLabel} 회계연도 ${quarter}분기` }
  }
  return { key: date.slice(0, 7), label: `${year}년 ${month}월` }
}

// 오늘(로컬 자정 기준) YYYY-MM-DD. 예전 UTC 슬라이스는 KST 00~09시에 전날을 돌려줘 입고일·처리일 기본값이
// 하루 밀리고 "오늘"·"어제" 칩이 같은 날짜가 됐다(2026-09-15 조사).
export function todayKey() {
  return dateKeyOf(new Date())
}

// 어제(로컬 자정 기준) YYYY-MM-DD — 처리일 퀵칩용. UTC 슬라이스가 아니라 로컬 날짜로 계산해 KST 새벽에도 어제가 정확하다.
// 구조 분해(#6)로 HardwareInventoryClient.tsx에서 이전 — QuickRecordSheet 전용이라 다른 소비처 없음.
export function yesterdayKey() {
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
// 구조 분해(#6)로 이전 — HistoryTabPanel 전용이라 다른 소비처 없음.
export type HistoryDateRangeKey = "thisMonth" | "lastMonth" | "last30"

export function historyDateRange(key: HistoryDateRangeKey): { from: string; to: string } {
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

export function formatDate(value: string | null) {
  if (!value) return "-"
  return value.slice(0, 10)
}

// 배송 예정(예약) 출고 판별 — 서버 집계 isPlannedStatus와 같은 규약(예정/예약/대기/planned).
// 대시보드 payload는 서버가 확정한 planned 플래그를 실어 보내므로 그 값을 먼저 쓰고, 없는 행
// (구버전 응답·테스트 픽스처)만 같은 규약의 status 정규식으로 판정한다.
export function isPlannedMovement(movement: HardwareMovement): boolean {
  if (movement.movement_type !== "outbound") return false
  return movement.planned ?? /예정|예약|대기|planned/i.test(movement.status ?? "")
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

// 예정 출고 행의 확정 수량 — 사용자가 수량 입력을 손대지 않았으면 전량, 손댔으면 1~원래 수량
// 사이로 clamp한 값이다. 행 표시(PlannedOutboundPanel 단건)와 일괄 확정 합계·요청 페이로드가
// 같은 규칙을 쓰도록 단일 함수로 뽑았다(감사 2026-09-14 — 일괄 체크 추가 전엔 이 clamp 식이
// 컴포넌트 안에 인라인으로만 있어 새 소비처마다 복붙될 뻔했다).
export function resolveConfirmQuantity(
  movement: Pick<HardwareMovement, "id" | "quantity">,
  confirmQtys: Record<string, string>
): number {
  const raw = confirmQtys[movement.id]
  if (raw == null || raw === "") return movement.quantity
  return Math.max(1, Math.min(movement.quantity, Math.floor(Number(raw) || movement.quantity)))
}

// 예정일로부터 dangerDays 이상 지난 예정 출고 id 목록 — 홈 "30일+ 미확정 선택" 퀵 액션 전용
// (감사 2026-09-14, 일괄 체크). 딜(그룹) 단위가 아니라 개별 확정 대상(HardwareMovement.id)
// 단위로 판정한다 — 그룹 키 자체가 고객+담당자+예정일+lot 조합이라 그룹의 date는 구성원 전체가
// 공유하는 값이므로, 개별 판정과 기존 그룹 판정(plannedStaleGroupCount)은 항상 같은 결과를 낸다.
export function collectStalePlannedMovementIds(
  movements: Array<Pick<HardwareMovement, "id" | "occurred_at">>,
  dangerDays: number
): string[] {
  return movements
    .filter((movement) => (elapsedDaysSince(movement.occurred_at) ?? 0) >= dangerDays)
    .map((movement) => movement.id)
}

// Shift+클릭 범위 선택(감사 2026-09-14, 일괄 체크) — 마지막으로 클릭한 체크박스(anchor)와 이번
// 클릭 대상(target) 사이를 화면에 보이는 순서(orderedIds, 현재 페이지 기준) 그대로 포함해서
// 돌려준다. 어느 한쪽이라도 목록에 없으면(페이지 이동 등으로 앵커가 화면에서 사라진 경우) 대상
// 하나만 돌려줘 — 예측 불가능한 범위가 잡히는 대신 안전하게 단일 선택으로 내려간다.
export function shiftSelectRange(orderedIds: string[], anchorId: string, targetId: string): string[] {
  const anchorIndex = orderedIds.indexOf(anchorId)
  const targetIndex = orderedIds.indexOf(targetId)
  if (anchorIndex === -1 || targetIndex === -1) return [targetId]
  const [start, end] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
  return orderedIds.slice(start, end + 1)
}

// 예정 출고 행의 FIFO 로트 미리보기 판정(감사 2026-09-14) — 신정책(로트가 모자라도 확정을 막지
// 않고 나머지를 "로트 미지정"으로 기록)에 맞춰 예전의 "부족"(막힘 인상) 문구를 없애고, 상태를
// 종류별로 나눠 순수 데이터로 돌려준다. 색·문구 렌더링은 호출부(PlannedOutboundPanel) 담당 —
// 이 함수는 판정만 하고 톤은 모른다(호출부가 kind별로 Success/Warning 톤을 고른다).
export type PlannedFifoPreview =
  // 이미 lot이 지정된 행 — FIFO 계산 자체가 필요 없다.
  | { kind: "assigned"; label: string }
  // 이 품목의 재고 행(stockRow)을 못 찾음 — 드문 데이터 불일치, 계산 불가.
  | { kind: "unavailable" }
  // 이 품목은 애초에 lot 잔량 기록이 없다(OPS·케이블 등 lot 미운영 품목) — "부족"이 아니라
  // 애초에 추적 대상이 아니라는 뜻이라 별도 케이스로 구분한다.
  | { kind: "no-lot-records" }
  // 정상 FIFO 계산 — matchedText는 실제 배정될 lot·수량 문자열, unassignedQty는 lot으로 못
  // 채워 "로트 미지정"으로 기록될 나머지 수량(0이면 전량 lot 배정됨).
  | { kind: "fifo"; matchedText: string; unassignedQty: number }

export function resolvePlannedFifoPreview(
  movement: Pick<HardwareMovement, "lot_no">,
  stockRow: HardwareStockRow | undefined,
  quantity: number
): PlannedFifoPreview {
  if (movement.lot_no) return { kind: "assigned", label: formatLotLabel(movement.lot_no) ?? movement.lot_no }
  if (!stockRow) return { kind: "unavailable" }
  if (stockRow.lotBalances.length === 0) return { kind: "no-lot-records" }
  const { plan, shortage } = previewFifoLots(stockRow.lotBalances, quantity)
  const matchedText = plan.map((lot) => `${formatLotLabel(lot.lot) ?? lot.lot} ${formatNumber(lot.quantity)}대`).join(" · ")
  return { kind: "fifo", matchedText, unassignedQty: shortage }
}

// 일괄 체크(감사 2026-09-14) 실행 결과·진행률 타입 — PlannedOutboundPanel(선택 UI 소유)과
// HardwareInventoryClient(네트워크 실행·refresh 소유) 둘 다 이 계약을 알아야 해서 shared에 둔다
// (이 파일 맨 위 주석의 "부모↔자식 순환 import 제거" 원칙과 동일한 이유).
export interface PlannedSelectionConfirmResult {
  successIds: string[]
  failedIds: string[]
}

export interface PlannedSelectionConfirmProgress {
  index: number
  total: number
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

// 내역 탭 "제품" 필터 칩 정의 — 원래 HardwareInventoryClient.tsx 모듈 스코프에 있었으나(구조
// 분해 #6), 탭 파일(HistoryTabPanel)과 부모의 activeHistoryFilterChips 메모 양쪽이 참조해야 해서
// 공용 shared로 옮겼다. 동작 변경 없음 — 값·순서 그대로 이전.
export const PRODUCT_FILTER_OPTIONS: Array<{ key: Exclude<ProductFilterKey, "">; label: string; test: (product: string) => boolean }> = [
  { key: "ifp86", label: '86" IFP', test: (product) => isCoreIfpProduct(product, "86") },
  { key: "ifp75", label: '75" IFP', test: (product) => isCoreIfpProduct(product, "75") },
  { key: "t1", label: "T1", test: (product) => /^T1$/i.test(product.trim()) },
  { key: "std1", label: "STD1", test: (product) => /^STD1$/i.test(product.trim()) },
  { key: "promotion", label: "프로모션", test: (product) => /\(promoted\)/i.test(product) },
]

export function matchesProductFilter(product: string, filter: ProductFilterKey): boolean {
  if (!filter) return true
  return PRODUCT_FILTER_OPTIONS.find((option) => option.key === filter)?.test(product) ?? false
}

// 감사(2026-09-07 #8) — CRM 확인 모달을 열지 않고 곧장 저장할지 판단하는 규칙을 순수 함수로
// 뽑아 단위 테스트 가능하게 했다(HardwareInventoryClient.openCrmConfirmation이 이 함수로 판단).
// 보여줄 후보도 경고도 없으면 모달은 사용자에게 새로 알려줄 것이 없다 — 그 경우만 건너뛴다.
// 후보가 하나라도 있으면 반드시 확인을 거친다(자동 링크·무음 저장 금지).
export function shouldSkipCrmConfirmation(candidates: unknown[], warnings: unknown[]): boolean {
  return candidates.length === 0 && warnings.length === 0
}

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

// 탭 단위 코드 스플릿(next/dynamic) 공용 로딩 폴백 — HomeTabPanel 밖 탭(입출고/내역)과 그
// 하위 섹션(InboundLotsSection·OutboundPeriodSection·HistoryLogSection)이 공유한다.
// 감사 2026-09-07 #6: 탭 경계를 파일로 나눈 뒤 각 탭 파일이 자기 하위 섹션의 dynamic()을
// 소유하므로, 로딩 자리표시자도 한 곳(shared)에서 관리해야 문구·스타일이 갈라지지 않는다.
export function SectionLoadingFallback() {
  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-5 py-10 text-center text-[12px] font-semibold text-[#A39E98]">
      섹션을 불러오는 중…
    </section>
  )
}
