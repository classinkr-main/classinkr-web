"use client"

import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react"
import dynamic from "next/dynamic"
import { use, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, useReducedMotion } from "framer-motion"
import {
  Camera,
  ChevronRight,
  Clock3,
  FileSpreadsheet,
  Monitor,
  Plus,
  Projector,
  RefreshCw,
  UploadCloud,
  type LucideIcon,
} from "lucide-react"

import DeleteConfirmDialog from "@/components/admin/DeleteConfirmDialog"
import { SyncOutcomeNotice } from "@/components/admin/branch/SyncOutcomeNotice"
import { adminFetch, adminFetchJson, adminFetchJsonCached, clearAdminRequestCache, isAdminTimeoutError } from "@/lib/admin-client"
import { readSyncOutcomeResponse, type SyncOutcomeNotice as SyncOutcomeNoticeValue } from "@/lib/admin/sync-outcome"
import { describeHardwareImportOutcome, type HardwareImportResponse } from "@/lib/hardware/import-outcome"
import { paginateAdminList } from "@/lib/admin-list-pagination"
import { isPrefetchFresh } from "@/lib/admin/prefetch-freshness"
import {
  clearStoredDraft,
  QUICK_CART_DRAFT_KEY,
  QUICK_CART_DRAFT_VERSION,
  readStoredQuickCartDrafts,
  writeStoredDraft,
} from "./inventory/draft-storage"
import {
  customerLabel,
  DETAIL_PRESET_KEYS,
  elapsedDaysSince,
  ENTRY_PRESETS,
  formatCurrency,
  formatDate,
  formatLotLabel,
  formatNumber,
  hardwareCardGroup,
  isCoreIfpProduct,
  isDraftPlanned,
  isPlannedMovement,
  isPromotedProduct,
  isSampleOutbound,
  lotFifoRank,
  matchesProductFilter,
  MOVEMENT_LABEL,
  MOVEMENT_TONE,
  normalizeHardwareText,
  outboundSaleType,
  periodKey,
  previewFifoLots,
  type PlannedSelectionConfirmProgress,
  type PlannedSelectionConfirmResult,
  PRODUCT_FILTER_OPTIONS,
  quickCartLineKey,
  SALE_TYPE_META,
  SectionLoadingFallback,
  shouldSkipCrmConfirmation,
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
  type QuickCartSaveSummary,
  type SampleSource,
} from "./inventory/shared"
import { describeMirrorDelta, judgeImportFreshness, judgeMirrorPending } from "./inventory/ImportFreshnessStrip"
import { compareInboundLotGroups, sortLotsByRecency } from "./inventory/lot-order"
import { sampleUnitMatchesItem } from "./inventory/office-sample-pool"
import {
  customerFromDestination,
  matchStockRowByText,
  parseHardwareLineText,
  pickLatestManualOutbound,
} from "./inventory/quick-record-model"

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

// QuickCartSaveSummary·ENTRY_PRESETS·DETAIL_PRESET_KEYS·presetTone·SAMPLE_SOURCE_OPTIONS·
// SampleSource는 구조 분해(#6)로 inventory/shared.tsx로 옮겼다(QuickRecordSheet 전용 상수는
// LOCATION_OPTIONS·QUICK_QUANTITIES처럼 그 파일에서 직접 정의 — 아래 shared import 참고).
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

const STOCK_PAGE_SIZE = 8
const OUTBOUND_PAGE_SIZE = 6
const ALERT_PAGE_SIZE = 5
const LOG_GROUP_PAGE_SIZE = 8
const PLANNED_PAGE_SIZE = 5
const RECENT_OUTBOUND_LIMIT = 30

// 서버는 movements 한 벌만 내려준다(voided 제외 · 처리일 내림차순 · 2000건 캡). 최근 출고와
// 예정 큐는 그 배열의 부분집합이라 응답에 중복으로 싣지 않고 여기서 같은 규칙으로 파생한다.
export type HardwareDashboardResponse = Omit<HardwareDashboard, "recentOutbound" | "plannedMovements">

/**
 * 페이지 서버 프리페치(app/admin/hardware/page.tsx)가 내려주는 첫 화면 wrapper.
 * generatedAt은 이 프리페치가 서버에서 만들어진(=레인이 열린) 시각(ms epoch) — isPrefetchFresh
 * 판정용(T3). HardwareDashboardResponse 자체(=/api/admin/hardware 응답과 같은 shape)에 얹지
 * 않고 따로 감싼 이유: 그 타입은 실제 API 응답 shape을 그대로 미러링해야 하는데, generatedAt은
 * 그 응답이 아니라 "이 프리페치 호출"에만 속하는 메타데이터라서다.
 *
 * 횡단 인프라 개편(2026-09-10 스트리밍 전환) — data(동기 값)가 promise로 바뀌었다. page.tsx가
 * openPrefetchLane(lib/admin/prefetch-budget.ts)으로 이 레인을 열고 await하지 않는다 — 이
 * 컴포넌트가 아래에서 React use()로 직접 풀어야 값을 얻는다. 모양은 그 모듈의
 * DeferredPrefetch<T>와 동일하지만 타입을 그대로 import하지 않고 여기 다시 선언한다 —
 * lib/admin/prefetch-budget.ts는 "server-only"라 이 "use client" 파일이 (타입 전용이라도)
 * 그 모듈을 직접 참조하지 않게 하려는 것이다(이 저장소의 기존 관례 — types.ts류의 순수
 * 데이터 타입만 클라이언트 파일이 가져다 쓰고, server-only 표시가 있는 lib 모듈은 값이든
 * 타입이든 그대로 참조하지 않는다).
 */
export interface HardwareDashboardPrefetch {
  promise: Promise<HardwareDashboardResponse | null>
  generatedAt: number
}

function withDerivedMovementViews(response: HardwareDashboardResponse): HardwareDashboard {
  const outbound = response.movements.filter((movement) => movement.movement_type === "outbound")
  return {
    ...response,
    recentOutbound: outbound.slice(0, RECENT_OUTBOUND_LIMIT),
    // 예정 큐는 확정을 기다리는 할 일 목록 — 최근 N건이 아니라 전량이 원칙이다(상한은 2000건 캡).
    plannedMovements: outbound.filter(isPlannedMovement),
  }
}

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

function locationQuantity(row: HardwareStockRow, location: string): number {
  if (location === "창고") return row.warehouseStock
  if (location === "배송 예정") return row.plannedOut
  return row.locationBalances.find((balance) => balance.location === location)?.quantity ?? 0
}

// "총 입고" 상단 집계 대상 품목(사용자 지정): 86"/75" 전자칠판 + T1 (프로모 변형 포함).
// lot별 상세 목록은 전 품목 그대로 두고, 헤더 총계(대수·매입액)만 이 3종으로 좁힌다.
const isInboundTallyProduct = (product: string) =>
  /86["”]?\s*IFP/i.test(product) || /75["”]?\s*IFP/i.test(product) || /\bT1\b/i.test(product)

// 빠른 기록 기본 선택 품목 = 86" IFP(비프로모, 최빈 라인업). 없으면 첫 품목으로 폴백.
function defaultEntryItemId(items: HardwareItem[]): string {
  const board86 = items.find((item) => isCoreIfpProduct(item.name, "86") && !isPromotedProduct(item.name))
  return (board86 ?? items[0])?.id ?? ""
}

// 출고 기간 집계 버킷 키/라벨 — shared.periodKey로 이동(분기·연간 회계연도 SSOT, 테스트 포함).

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

// customerLabel(+GENERIC_LOCATIONS)은 구조 분해(#6)로 inventory/shared.tsx로 옮겼다 —
// QuickRecordSheet(직전 기록 복제 미리보기)도 직접 참조해서다. 판정 로직은 그대로.

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

// yesterdayKey·historyDateRange(+HistoryDateRangeKey)는 구조 분해(#6)로 inventory/shared.tsx로
// 옮겼다 — 각각 QuickRecordSheet·HistoryTabPanel 전용이라 이 오케스트레이터에는 더 필요 없다.

// 빠른 기록 반복 입력 기억 — 담당자·"저장 후 시트 유지" 토글을 세션을 넘어 기억한다.
// SSR 프리렌더 중에는 window가 없으므로 항상 가드하고, storage 접근 불가 환경에선 조용히 비활성화한다.
const QUICK_RECORD_OWNER_KEY = "hw.quickRecord.owner"
const QUICK_RECORD_STAY_OPEN_KEY = "hw.quickRecord.stayOpen"
// 저장 대기 바구니 — 새로고침·탭 폐기로 담아 둔 작업건을 잃지 않게 한다(입력 가속 P3-1).
// 입고표와 달리 조용히 되살린다: 시트가 "저장 대기 바구니 N건"으로 이미 보여 주기 때문에
// 사람이 모르는 상태가 생기지 않는다. 키·스키마 검사는 draft-storage 가 가진다.

// 시트 공용 클래스 토큰(SHEET_INPUT_CLASS 등)·LOCATION_OPTIONS·QUICK_QUANTITIES는 구조 분해(#6)로
// QuickRecordSheet.tsx로 이전했다 — 그 시트에서만 쓰여 이 오케스트레이터에는 더 필요 없다.

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

// isDraftPlanned·isSampleOutbound는 구조 분해(#6)로 inventory/shared.tsx로 옮겼다(QuickRecordSheet도
// 직접 참조해서다) — 아래 deriveStatus는 이제 shared에서 import해 쓴다. 판정 로직 자체는 그대로.

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

// 상세내역 "제품" 필터 정의(PRODUCT_FILTER_OPTIONS)·판정(matchesProductFilter)은 탭 구조 분해(#6)로
// components/admin/hardware/inventory/shared.tsx로 옮겼다 — HistoryTabPanel과 이 파일의
// activeHistoryFilterChips 메모가 같은 정의를 참조해야 해서다. 값·동작은 그대로, import만 재사용.

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

// normalizeHardwareText·quickCartLineKey는 구조 분해(#6)로 inventory/shared.tsx로 옮겼다 —
// QuickRecordSheet가 카트 라인 렌더에서 quickCartLineKey를 직접 참조해서다. 아래는 shared에서
// import해 그대로 쓴다(라인 식별 키 포맷 불변 — 같은 구분자 사용).
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

const CrmConfirmModal = dynamic(() => import("@/components/admin/hardware/inventory/CrmConfirmModal"), { loading: () => null })
const VoidConfirmModal = dynamic(() => import("@/components/admin/hardware/inventory/VoidConfirmModal"), { loading: () => null })
// 상시 마운트 오버레이 3종 — 열리기 전까지 null만 그리므로 지연 분리해도 잃는 상태·화면이 없다.
// 첫 페인트 번들에서 시트 3종(타임라인·거래이력·유닛 시트) 코드를 뺀다(모달 관례와 동일).
const MovementDetailSheet = dynamic(() => import("@/components/admin/hardware/inventory/MovementDetailSheet"), { loading: () => null })
const CustomerHistorySheet = dynamic(() => import("@/components/admin/hardware/inventory/CustomerHistorySheet"), { loading: () => null })
const SampleUnitSheet = dynamic(() => import("@/components/admin/hardware/inventory/SampleUnitSheet"), { loading: () => null })
// 빠른 기록 시트 — 5,481줄 중 가장 큰 단일 블록(1,481줄)을 별도 파일로 뺐다(감사 2026-09-07 #6).
// 열리기 전까지(sheetOpen=false) 마운트되지 않으므로 위 오버레이 3종과 같은 관례로 null 로딩.
const QuickRecordSheet = dynamic(() => import("@/components/admin/hardware/inventory/QuickRecordSheet"), { loading: () => null })
// 한 화면 입고표(시안 A, 2026-09-15) — 새 입고는 전부 이 시트로 연다. 기존 입고 기록 수정은 빠른 기록 시트(단건) 그대로.
const InboundSheet = dynamic(() => import("@/components/admin/hardware/inventory/InboundSheet"), { loading: () => null })

// 탭 본문 코드 스플릿(#6) — 홈/입출고/내역은 activeTab이 바뀔 때만 필요하고, InboundLotsSection·
// OutboundPeriodSection·HistoryLogSection의 지연 로드는 각 탭 파일이 스스로 소유한다(이 파일은
// 더 이상 그 하위 섹션들을 직접 import하지 않는다). ssr:false + 스켈레톤은 기존 관례 그대로.
const HomeTabPanel = dynamic(() => import("@/components/admin/hardware/inventory/HomeTabPanel"), {
  ssr: false,
  loading: () => <SectionLoadingFallback />,
})
const EntryTabPanel = dynamic(() => import("@/components/admin/hardware/inventory/EntryTabPanel"), {
  ssr: false,
  loading: () => <SectionLoadingFallback />,
})
const HistoryTabPanel = dynamic(() => import("@/components/admin/hardware/inventory/HistoryTabPanel"), {
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

// initialData = 페이지(app/admin/hardware/page.tsx)가 GET /api/admin/hardware와 같은 검증·
// 같은 lib 함수로 서버에서 연 프리페치 레인(promise, 아직 settle 여부 불명). 이 컴포넌트
// 전체가 아래 use()로 그 promise를 풀 때까지 부모(page.tsx)의 <Suspense>가 대신 대기한다 —
// settle 결과가 있으면(신선도와 무관하게) 그 값으로 그리고, 없으면(비인증·역할 부족·프리페치
// 실패·ceilingMs 초과) 지금까지와 동일하게 마운트 후 load()가 채운다. 왕복을 실제로 건너뛸지는
// 아래 skipInitialLoadRef가 신선도까지 본다(T3). initialData 자체가 없을 때(prop 생략 — 예:
// 프리페치 없이 이 컴포넌트를 단독 렌더하는 호출부)는 use()를 아예 부르지 않아 그런 호출부를
// Suspense 없이도 그대로 지원한다.
export default function HardwareInventoryClient({
  initialData,
}: {
  initialData?: HardwareDashboardPrefetch | null
}) {
  const prefetched = initialData ? use(initialData.promise) : null
  const formRef = useRef<HTMLFormElement | null>(null)
  // 재조회 순번 — 겹친 재검증에서 늦게 온 옛 응답을 버린다(load 참고).
  const loadSeqRef = useRef(0)
  // CRM 후보 조회 순번 — 조회 중 시트를 닫거나 다시 열면 늦게 온 응답을 버린다(하드웨어 라운드 2 Q-5).
  // 예전엔 닫은 뒤 후보가 없으면 확인 없이 저장됐고, 새로 연 폼이 그 저장 성공 처리로 비워졌다.
  const crmLookupSeqRef = useRef(0)
  // 기록 수정으로 들어가기 전의 담당자 — 수정 대상의 담당자가 다음 새 기록과 기억값에 새지 않게 되돌린다(Q-4).
  const ownerBeforeEditRef = useRef<string | null>(null)
  const [data, setData] = useState<HardwareDashboard | null>(() =>
    prefetched ? withDerivedMovementViews(prefetched) : null
  )
  const [loading, setLoading] = useState(prefetched == null)
  // error = 사람이 누른 동작(저장·확정·가져오기)의 실패. loadError = 대시보드 조회 실패 — 둘을 가른다
  // (하드웨어 라운드 2 Q-12·H-1). 예전엔 배경 재검증 실패가 빠른 기록 시트의 저장 오류 자리에 떠
  // 방금 성공한 저장을 실패로 오인했고, 재검증이 시작될 때마다 동작 오류를 지웠다.
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // 가져오기·업로드 결과(설계 §7.2 결과 계약) — 성공·안내·경고 톤을 SyncOutcomeNotice로 그린다.
  const [importNotice, setImportNotice] = useState<SyncOutcomeNoticeValue | null>(null)
  // 가져오기 확인 다이얼로그(하드웨어 라운드 2 S-3) — 원장 교체·어드민 확정 취소를 한 번 묻는다.
  const [importConfirmOpen, setImportConfirmOpen] = useState(false)
  const [pendingMovement, setPendingMovement] = useState<HardwareMovementDraft | null>(null)
  const [quickCart, setQuickCart] = useState<HardwareMovementDraft[]>([])
  // 보관된 바구니를 읽었는지 — 읽기 전에는 자동 보관이 저장분을 지우지 않게 한다(효과 실행 순서).
  const quickCartRestoredRef = useRef(false)
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
  // load()가 첫 응답에서 하는 기본 품목 선택(defaultEntryItemId)을 프리페치 경로에서도 동일하게 건다.
  const [selectedItemId, setSelectedItemId] = useState(() =>
    prefetched ? defaultEntryItemId(prefetched.items) : ""
  )
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
  // 풀 선택 담기 요청(P-8) — 아래 openSampleQuickRecord·담기 효과 주석 참고.
  const sampleUnitPrefillRef = useRef<string[] | null>(null)
  const [sampleUnitPrefillSeq, setSampleUnitPrefillSeq] = useState(0)
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
  // 일괄 체크(감사 2026-09-14) 진행률 — null이면 유휴, 값이 있으면 "N/M 확정 중"이 패널 하단
  // 고정 바에 표시된다. confirmingId·confirmingGroupKey와 같은 층위의 잠금 신호라
  // plannedConfirmLocked에도 합류시킨다(아래).
  const [selectionConfirmProgress, setSelectionConfirmProgress] = useState<PlannedSelectionConfirmProgress | null>(null)
  // 예정 출고 일괄 체크 선택 개수 — 선택 중엔 "빠른 기록" 떠 있는 버튼을 내린다(하단 작업 바를 가림).
  const [plannedSelectionCount, setPlannedSelectionCount] = useState(0)
  const [plannedConfirmResults, setPlannedConfirmResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [confirmDates, setConfirmDates] = useState<Record<string, string>>({})
  const [voidingId, setVoidingId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  // 한 화면 입고표 — product 는 품목 id(행 퀵버튼에서 연 경우) 또는 null.
  const [inboundSheet, setInboundSheet] = useState<{ open: boolean; product: string | null; lot?: string | null }>({ open: false, product: null })
  // 시트 모드 — "single": 빠른 단건 기록, "batch": 작업건(다품목) 구성. 단건과 대량이
  // 한 폼에 섞여 있던 15섹션 구조를 업무 단위로 가른다. 수정(editingId)은 항상 single.
  const [sheetMode, setSheetMode] = useState<"single" | "batch">("single")
  // 시트 뷰 — "quick": 입고|출고 2축 빠른 기록(기본), "detail": 상세 5종(반환·샘플 배정·수리·조정)
  // 을 같은 시트 안에서 처리하는 상세 모드. 상세 모드는 항상 단건(배치 아님).
  const [sheetView, setSheetView] = useState<"quick" | "detail">("quick")
  // 출고 실제|예정 2차 세그먼트 — UI 판별 전용. status 파생(deriveStatus)과 드래프트 isPlanned로만 흐른다.
  const [isPlanned, setIsPlanned] = useState(false)
  const [voidTarget, setVoidTarget] = useState<HardwareMovement | null>(null)
  const [voidError, setVoidError] = useState<string | null>(null)
  // 거래이력 → 상세로 넘어간 경우 상세를 닫으면 거래이력으로 돌아간다(하드웨어 라운드 2 L-12).
  const returnToCustomerRef = useRef<string | null>(null)
  const [voidReason, setVoidReason] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmQtys, setConfirmQtys] = useState<Record<string, string>>({})
  const [entrySub, setEntrySub] = useState<"inbound" | "outbound">("inbound")
  const [outPeriod, setOutPeriod] = useState<PeriodGranularity>("month")
  const [openPeriods, setOpenPeriods] = useState<Record<string, boolean>>({})
  const [inboundSearch, setInboundSearch] = useState("")
  const [hardwareSearch, setHardwareSearch] = useState("")
  const [search, setSearch] = useState("")
  // 검색 디바운스 — 키 입력마다 2,000행 정렬·전 데이터 순회가 돌지 않게 무거운 파생만 지연값을 본다.
  // 입력창 자체는 즉시값(search/hardwareSearch)을 유지해 타이핑 반응성은 그대로다.
  const deferredSearch = useDeferredValue(search)
  const deferredHardwareSearch = useDeferredValue(hardwareSearch)
  // 확정·취소 권한(hardware.finalize) — 표시용. viewer가 없으면(구응답·로딩) 열어두고 서버 게이트만 믿는다.
  const canFinalize = data?.viewer?.canFinalize ?? true
  // 기록 생성 권한 — 없으면 쓰기 버튼을 미리 내린다(강제는 서버 게이트). 구응답·로딩 중에는 열어 둔다.
  const canWriteHardware = data?.viewer?.canWrite ?? true
  const [customerFilter, setCustomerFilter] = useState("")
  const [lotFilter, setLotFilter] = useState("")
  // 내역 탭 보조 필터 축 — 상태(완료/배송 예정/취소 포함), 판매유형(출고 전용), 기간(occurred_at 기준).
  const [historyStatus, setHistoryStatus] = useState<"all" | "done" | "planned">("all")
  const [includeVoided, setIncludeVoided] = useState(false)
  // 취소 기록 — "취소 포함"을 켰을 때만 따로 읽는다(하드웨어 라운드 2 L-1). 대시보드는 취소 행을 싣지 않는다.
  const [voidedMovements, setVoidedMovements] = useState<HardwareMovement[] | null>(null)
  const [voidedState, setVoidedState] = useState<{ loading: boolean; error: string | null; limit: number | null }>({
    loading: false,
    error: null,
    limit: null,
  })
  const [saleTypeFilter, setSaleTypeFilter] = useState<OutboundSaleType | "">("")
  const [historyDateFrom, setHistoryDateFrom] = useState("")
  const [historyDateTo, setHistoryDateTo] = useState("")
  // 내역 탭 상세 필터 패널 — 상태/판매유형/기간/제품/물류No/고객사는 기본 접힘, 검색·유형만 상시 노출.
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  // 샘플 유닛 목록·열린 유닛 시트 — URL 동기화(unit=)가 읽으므로 그 effect 보다 먼저 선언한다.
  const [sampleUnits, setSampleUnits] = useState<HardwareSampleUnit[] | null>(null)
  const [sampleUnitSheetId, setSampleUnitSheetId] = useState<string | null>(null)
  // 딥링크로 들어온 대상(하드웨어 라운드 2 L-4·P-10) — 데이터가 도착한 뒤 파생값으로 확인·해석한다.
  // unit= 딥링크의 관리번호 — 유닛 목록이 오면 그 유닛 시트로 연다(상태라서 목록 조회도 부른다). 닫으면 비운다.
  const [linkedUnitCode, setLinkedUnitCode] = useState<string | null>(null)
  const [customerDetail, setCustomerDetail] = useState<string | null>(null)
  const sheetPanelRef = useRef<HTMLElement>(null)
  const detailPanelRef = useRef<HTMLElement>(null)
  const ledgerFileRef = useRef<HTMLInputElement>(null)
  // 상세 모드 진입 직전의 출고 세그먼트(sale/planned/sample)를 기억해 빠른 기록 복귀 시 복원한다.
  const detailReturnPresetRef = useRef<string | null>(null)
  const reduceMotion = useReducedMotion()
  // 일괄 체크 실행 중(selectionConfirmProgress != null)에도 다른 확정 경로(단건·그룹·체크박스
  // 조작)를 전부 잠근다(요청사항 ①.7) — 순차 실행 중간에 다른 확정이 끼어들면 FIFO 배정이
  // 로트 잔량을 놓고 경쟁해 예측 불가능해진다.
  const plannedConfirmLocked = busy != null || confirmingId != null || confirmingGroupKey != null || selectionConfirmProgress != null
  // quickCartSaving(busy === "movement")은 구조 분해(#6)로 QuickRecordSheet.tsx가 자체 계산한다 —
  // 그 시트만 쓰던 파생값이라 여기 남겨두면 미사용 변수가 된다.

  // URL 상태 동기화 — 장부 워크벤치와 같은 window 기반 접근(useSearchParams는 Suspense 경계를
  // 요구해 피한다). 마운트 시 한 번 읽고(urlReady 전에는 쓰지 않음) 변경마다 replaceState로
  // 반영해 링크 공유가 가능하다(히스토리 오염 없음).
  //
  // 감사(2026-09-07 #10): 예전엔 tab·customer 두 값만 왕복해 내역 탭 필터 8종(검색·유형·상태·
  // 취소포함·판매유형·제품·물류No·기간)이 새로고침·공유에서 전부 유실됐다. 아래로 전부 왕복한다.
  // 계약: ?tab=home|entry|history(생략=home)
  //   &customer=<고객명>  → 고객 필터 프리필 + 거래이력 슬라이드오버 오픈(왕복 충실성: 슬라이드오버가
  //                          "열린" 상태만 이 키로 기록 — 필터만 건 상태까지 여기 실으면 새로고침 시
  //                          슬라이드오버가 원치 않게 열린다)
  //   &custFilter=<고객명> → 슬라이드오버 없이 고객 필터만(목록 드롭다운에서 고른 경우)
  //   &q=<검색어> &type=<유형> &status=<상태> &voided=1 &saleType=<유형> &product=<필터키>
  //   &lot=<물류No> &from=<YYYY-MM-DD> &to=<YYYY-MM-DD> &sort=asc(기본 desc는 생략)
  //   &hq=<홈 탭 통합검색어> — 내역 탭 q와 별개 상태(hardwareSearch)라 키를 분리한다(감사 2026-09-11).
  //   하드웨어 라운드 2(L-4·E-5·P-10) — 되돌아오기·공유·새로고침에서 위치를 잃지 않게 더한 키:
  //   &m=<이동 id>(내역 상세 시트) &page=<내역 묶음 페이지, 1은 생략> &sub=outbound(입출고 하위 보기, 입고는 생략)
  //   &iq=<입고 물량 검색어> &period=quarter|year(출고 집계 기간, 월은 생략) &unit=<샘플 관리번호>(유닛 시트)
  // 값이 기본값이면 파라미터 자체를 쓰지 않는다 — URL을 깨끗하게 유지하고, 필터를 하나도 안 걸었을
  // 때는 예전과 동일하게 ?tab=history 정도로 짧다.
  const HISTORY_TYPE_URL_VALUES = new Set(["all", "sample", "inbound", "outbound", "return", "transfer", "repair", "adjust"])
  const HISTORY_STATUS_URL_VALUES = new Set(["all", "done", "planned"])
  const SALE_TYPE_URL_VALUES = new Set(["sales", "sample", "promotion", "as"])
  const PRODUCT_FILTER_URL_VALUES = new Set<string>(PRODUCT_FILTER_OPTIONS.map((option) => option.key))
  const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/

  const [urlReady, setUrlReady] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get("tab")
    const customer = (params.get("customer") ?? "").trim()
    const custFilterOnly = (params.get("custFilter") ?? "").trim()
    if (tab === "home" || tab === "entry" || tab === "history") setActiveTab(tab)
    else if (customer || custFilterOnly) setActiveTab("history")
    if (customer) {
      setCustomerFilter(customer)
      setCustomerDetail(customer)
    } else if (custFilterOnly) {
      setCustomerFilter(custFilterOnly)
    }

    const type = params.get("type")
    if (type && HISTORY_TYPE_URL_VALUES.has(type)) setHistoryType(type as typeof historyType)
    const status = params.get("status")
    if (status && HISTORY_STATUS_URL_VALUES.has(status)) setHistoryStatus(status as typeof historyStatus)
    if (params.get("voided") === "1") setIncludeVoided(true)
    const saleType = params.get("saleType")
    if (saleType && SALE_TYPE_URL_VALUES.has(saleType)) setSaleTypeFilter(saleType as typeof saleTypeFilter)
    const product = params.get("product")
    if (product && PRODUCT_FILTER_URL_VALUES.has(product)) setProductFilter(product as typeof productFilter)
    const lot = params.get("lot")
    if (lot) setLotFilter(lot)
    const from = params.get("from")
    if (from && DATE_PARAM_PATTERN.test(from)) setHistoryDateFrom(from)
    const to = params.get("to")
    if (to && DATE_PARAM_PATTERN.test(to)) setHistoryDateTo(to)
    if (params.get("sort") === "asc") setHistorySort("asc")
    const q = params.get("q")
    if (q) setSearch(q)
    const hq = params.get("hq")
    if (hq) setHardwareSearch(hq)

    const movementId = (params.get("m") ?? "").trim()
    if (movementId) {
      if (!tab) setActiveTab("history")
      setDetailId(movementId)
    }
    const page = Number(params.get("page"))
    if (Number.isInteger(page) && page > 1) setMovementsPage(page)
    if (params.get("sub") === "outbound") setEntrySub("outbound")
    const iq = params.get("iq")
    if (iq) setInboundSearch(iq)
    const period = params.get("period")
    if (period === "quarter" || period === "year") setOutPeriod(period)
    const unitCode = (params.get("unit") ?? "").trim()
    if (unitCode) setLinkedUnitCode(unitCode)

    setUrlReady(true)
    // 마운트 1회 전용 — 의도적으로 의존성 없음(urlReady 판정용 useEffect 관례, 아래 쓰기 effect와 동일).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!urlReady) return
    const params = new URLSearchParams()
    const customer = (customerDetail ?? "").trim()
    const filterOnlyCustomer = (customerFilter ?? "").trim()
    if (customer) {
      params.set("tab", activeTab)
      params.set("customer", customer)
    } else {
      if (activeTab !== "home") params.set("tab", activeTab)
      if (filterOnlyCustomer) params.set("custFilter", filterOnlyCustomer)
    }
    if (search.trim()) params.set("q", search.trim())
    if (hardwareSearch.trim()) params.set("hq", hardwareSearch.trim())
    if (historyType !== "all") params.set("type", historyType)
    if (historyStatus !== "all") params.set("status", historyStatus)
    if (includeVoided) params.set("voided", "1")
    if (saleTypeFilter) params.set("saleType", saleTypeFilter)
    if (productFilter) params.set("product", productFilter)
    if (lotFilter) params.set("lot", lotFilter)
    if (historyDateFrom) params.set("from", historyDateFrom)
    if (historyDateTo) params.set("to", historyDateTo)
    if (historySort === "asc") params.set("sort", "asc")
    if (detailId) params.set("m", detailId)
    if (activeTab === "history" && movementsPage > 1) params.set("page", String(movementsPage))
    if (entrySub === "outbound") params.set("sub", "outbound")
    if (inboundSearch.trim()) params.set("iq", inboundSearch.trim())
    if (outPeriod !== "month") params.set("period", outPeriod)
    // 유닛 시트는 관리번호로 — id 보다 사람이 읽고 말하기 쉽다. 목록이 아직 없으면 들어온 값을 그대로 유지한다.
    const unitCodeForUrl = sampleUnitSheetId
      ? sampleUnits?.find((unit) => unit.id === sampleUnitSheetId)?.asset_code ?? null
      : linkedUnitCode
    if (unitCodeForUrl) params.set("unit", unitCodeForUrl)

    const queryString = params.toString()
    const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (nextUrl !== currentUrl) window.history.replaceState(null, "", nextUrl)
  }, [
    urlReady,
    activeTab,
    customerDetail,
    customerFilter,
    search,
    hardwareSearch,
    historyType,
    historyStatus,
    includeVoided,
    saleTypeFilter,
    productFilter,
    lotFilter,
    historyDateFrom,
    historyDateTo,
    historySort,
    detailId,
    movementsPage,
    entrySub,
    inboundSearch,
    outPeriod,
    sampleUnitSheetId,
    sampleUnits,
    linkedUnitCode,
  ])

  const requestCloseSheet = useCallback(() => {
    if (busy === "movement") return
    // CRM 후보 조회 중에 닫으면 그 조회는 버린다 — 늦게 온 응답이 확인 없이 저장하지 않게(Q-5).
    crmLookupSeqRef.current += 1
    setCrmLoading(false)
    if (
      !editingId &&
      quickCart.length > 0 &&
      !window.confirm(`저장하지 않은 기록 바구니 ${quickCart.length}건이 있습니다. 닫아도 바구니는 유지됩니다. 닫을까요?`)
    )
      return
    setSheetOpen(false)
  }, [busy, editingId, quickCart.length])

  useEffect(() => {
    const unitSheetOpen = sampleUnitSheetId != null || linkedUnitCode != null
    if (!sheetOpen && pendingMovement == null && voidTarget == null && detailId == null && customerDetail == null && !unitSheetOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      // 안쪽에서 먼저 처리한 Escape(고객사 목록 닫기 등)는 시트까지 닫지 않는다 — 입고표와 같은 규약.
      if (event.defaultPrevented) return
      if (pendingMovement) {
        if (busy !== "movement") setPendingMovement(null)
      } else if (voidTarget) {
        if (voidingId == null) setVoidTarget(null)
      } else if (customerDetail) {
        setCustomerDetail(null)
      } else if (detailId) {
        setDetailId(null)
      } else if (unitSheetOpen) {
        // 유닛 시트도 Esc 로 닫는다(하드웨어 라운드 2 P-11) — aria-modal 인데 Esc 가 없었다.
        setSampleUnitSheetId(null)
        setLinkedUnitCode(null)
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
  }, [sheetOpen, pendingMovement, voidTarget, detailId, customerDetail, sampleUnitSheetId, linkedUnitCode, busy, voidingId, requestCloseSheet])

  // 상세·거래이력·유닛 시트 포커스(하드웨어 라운드 2 L-2·P-11) — 열리면 그 시트의 닫기 버튼으로 옮기고, Tab 은 맨 위
  // 대화상자 안에서 돌고, 닫히면 연 자리로 돌려준다. 예전엔 포커스가 블러 뒤 목록에 남아 Tab 이 가려진 배경을 돌았다.
  // (빠른 기록 시트·입고표·확인 다이얼로그는 각자 한다.)
  const overlayFocusKey = detailId
    ? `detail:${detailId}`
    : customerDetail
      ? `customer:${customerDetail}`
      : sampleUnitSheetId != null || linkedUnitCode != null
        ? `unit:${sampleUnitSheetId ?? linkedUnitCode}`
        : null
  useEffect(() => {
    if (!overlayFocusKey) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const topDialog = () => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
      return dialogs.length > 0 ? dialogs[dialogs.length - 1] : null
    }
    let frame = 0
    let handle = 0
    const focusIn = () => {
      const dialog = topDialog()
      if (!dialog) {
        if (frame++ < 20) handle = window.requestAnimationFrame(focusIn)
        return
      }
      if (dialog.contains(document.activeElement)) return
      const target = dialog.querySelector<HTMLElement>('[aria-label="닫기"]') ?? dialog.querySelector<HTMLElement>("button:not([disabled])")
      target?.focus({ preventScroll: true })
    }
    focusIn()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      const dialog = topDialog()
      if (!dialog) return
      const items = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!dialog.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      window.cancelAnimationFrame(handle)
      document.removeEventListener("keydown", onKey)
      // 다른 시트로 넘어가는 중(거래이력 → 상세)이면 다음 effect 가 다시 옮긴다. 아니면 연 자리로.
      if (previous && previous.isConnected && !topDialog()) previous.focus({ preventScroll: true })
    }
  }, [overlayFocusKey])

  useEffect(() => {
    if (!sheetOpen) return
    const previousFocus = document.activeElement as HTMLElement | null
    // 첫 포커스는 닫기 버튼이 아니라 이번에 칠 칸 — 품목은 진입점이 미리 채우므로 고객사(판매·예정)나 대여 고객사(샘플)로,
    // 그 칸이 없는 모드(상세·입고 수정)는 첫 컨트롤로(하드웨어 라운드 2 Q-15). 시트 청크가 늦게 붙는 첫 열기를 위해 몇 프레임 기다린다.
    let frame = 0
    let handle = 0
    const focusFirst = () => {
      const panel = sheetPanelRef.current
      if (!panel) {
        if (frame++ < 20) handle = window.requestAnimationFrame(focusFirst)
        return
      }
      const preferred = panel.querySelector<HTMLElement>("[data-sheet-autofocus] input:not([disabled]), [data-sheet-autofocus] button:not([disabled])")
      const fallback = panel.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      ;(preferred ?? fallback)?.focus({ preventScroll: true })
    }
    focusFirst()
    return () => {
      window.cancelAnimationFrame(handle)
      // FAB 로 열었으면 FAB 가 시트 동안 사라졌다가 다시 생긴다 — 원래 요소가 문서에 없으면 FAB 를 찾아 돌려준다.
      if (previousFocus && previousFocus.isConnected) previousFocus.focus?.()
      else document.querySelector<HTMLElement>('[data-hardware-fab="true"]')?.focus()
    }
  }, [sheetOpen])

  const load = useCallback(async (options: { force?: boolean } = {}) => {
    // 저장 후 재검증을 기다리지 않게 되면서(applySavedMovements) 재조회가 겹칠 수 있다.
    // 늦게 도착한 옛 응답이 새 응답을 덮어쓰면 방금 저장한 줄이 화면에서 사라져 보인다 — 순번으로 막는다.
    const seq = loadSeqRef.current + 1
    loadSeqRef.current = seq
    setLoading(true)
    try {
      // 재방문·뒤로가기는 공용 클라이언트 캐시(45s TTL + stale-while-revalidate)로 즉시 페인트한다
      // (서버도 이미 max-age=30/swr=120을 보낸다). 새로고침·저장 후 재조회는 force로 우회한다 —
      // CRM 화면들의 load({ force: true }) 관례와 동일.
      const next = withDerivedMovementViews(
        await adminFetchJsonCached<HardwareDashboardResponse>("/api/admin/hardware", undefined, {
          force: options.force,
        })
      )
      if (seq !== loadSeqRef.current) return
      setData(next)
      setLoadError(null)
      setSelectedItemId((current) => current || defaultEntryItemId(next.items))
    } catch (err) {
      if (seq !== loadSeqRef.current) return
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      if (seq === loadSeqRef.current) setLoading(false)
    }
  }, [])

  // 서버 프리페치가 첫 화면을 이미 채웠고 *또한* 아직 신선할 때만 마운트 1회 왕복을
  // 건너뛴다(T3) — staleTimes.dynamic(180초)로 재사용된 RSC 프리페치는 initialData가
  // 있어도 최대 180초 전 값일 수 있다. generatedAt은 레인을 연 시각(initialData, promise
  // 밖의 동기 필드)이지 값이 실제로 도착한 시각이 아니지만, 기존 T3 규약과 동일하게 다룬다.
  // 신선하지 않으면 위 data state는 여전히 prefetched로 채워 스켈레톤 없이 그리되(위 useState
  // 초기값), 아래 load()가 정상 수행돼 캐시/네트워크가 최신 여부를 정한다(load 내부는
  // loading && !data로 게이트되므로 이미 data가 있으면 스피너만 돌고 스켈레톤은 뜨지 않는다).
  // 이후 새로고침·저장 후 재조회(refresh)는 그대로 load({ force: true })를 탄다.
  const skipInitialLoadRef = useRef(prefetched != null && isPrefetchFresh(initialData?.generatedAt))
  useEffect(() => {
    if (skipInitialLoadRef.current) {
      skipInitialLoadRef.current = false
      return
    }
    void load()
  }, [load])

  // 저장/확정 후 재조회 — 확정 핸들러들(useCallback)의 의존이라 load 바로 아래에 선언한다(TDZ).
  // 전역 캐시 전체 삭제 대신 하드웨어 스코프만 무효화한다 — 키 포함 매칭이라 다른 소비처의
  // branch:* /api/admin/hardware 캐시도 함께 지워지고, 무관한 어드민 탭 캐시는 살아남는다(감사 #13).
  const refresh = useCallback(async () => {
    clearAdminRequestCache("/api/admin/hardware")
    await load({ force: true })
  }, [load])

  const loadVoidedMovements = useCallback(async () => {
    setVoidedState((current) => ({ ...current, loading: true, error: null }))
    try {
      const result = await adminFetchJson<{ movements: HardwareMovement[]; limit: number }>("/api/admin/hardware?scope=voided")
      setVoidedMovements(result.movements ?? [])
      setVoidedState({ loading: false, error: null, limit: result.limit ?? null })
    } catch (err) {
      setVoidedState({ loading: false, error: err instanceof Error ? err.message : String(err), limit: null })
    }
  }, [])
  // 켜질 때 한 번 읽고, 켜진 채 원장이 바뀌면(취소·가져오기) 다시 읽는다.
  const voidedLedgerVersion = `${data?.importRun?.id ?? ""}:${data?.movementsTotal ?? ""}`
  useEffect(() => {
    if (!includeVoided) return
    void loadVoidedMovements()
  }, [includeVoided, loadVoidedMovements, voidedLedgerVersion])

  // 바구니 자동 보관 — 담을 때마다 남기고, 저장·비우기로 비면 지운다.
  // 원장이 아니라 작성 중 입력이고, 24시간이 지나면 읽지 않는다(draft-storage 규칙).
  useEffect(() => {
    if (!quickCartRestoredRef.current) return
    if (quickCart.length === 0) clearStoredDraft(QUICK_CART_DRAFT_KEY)
    else writeStoredDraft(QUICK_CART_DRAFT_KEY, QUICK_CART_DRAFT_VERSION, quickCart)
  }, [quickCart])

  /**
   * 저장 직후 화면 — 서버가 돌려준 **원장 줄만** 즉시 끼워 넣는다.
   *
   * 재고·가용·알림 같은 파생 숫자는 손대지 않는다. 그 계산은 서버(computeHardwareStockRow)가 정본이고,
   * 화면에서 흉내 내면 가용이 틀린다. 숫자는 이어지는 재검증(void refresh)이 도착할 때 한 번에 바뀐다.
   * 정렬 키는 서버와 같다(occurred_at ?? created_at 내림차순) — 어제 날짜로 적은 기록이 맨 위로 튀지 않게.
   */
  const applySavedMovements = useCallback((saved: readonly HardwareMovement[]) => {
    const rows = saved.filter((movement): movement is HardwareMovement => Boolean(movement?.id))
    if (rows.length === 0) return
    setData((current) => {
      if (!current) return current
      const seen = new Set(current.movements.map((movement) => movement.id))
      const appended = rows.filter((movement) => !seen.has(movement.id))
      if (appended.length === 0) return current
      const sortKey = (movement: HardwareMovement) => {
        const time = new Date(movement.occurred_at ?? movement.created_at).getTime()
        return Number.isFinite(time) ? time : 0
      }
      const movements = [...appended, ...current.movements].sort((a, b) => sortKey(b) - sortKey(a))
      return withDerivedMovementViews({
        ...current,
        movements,
        // 서버가 세는 전체 건수 — 값이 없으면 지어내지 않는다("N건 중 M건" 표기가 틀어진다).
        movementsTotal: current.movementsTotal == null ? current.movementsTotal : current.movementsTotal + appended.length,
      })
    })
  }, [])

  // 감사(2026-09-07 #7) — 기본 응답은 최신 2000건까지만 싣는다. 그 너머(더 오래된 이동)는
  // 지금까지 화면에서 닿을 방법이 전혀 없었다 — 내역 탭의 "더 불러오기"가 이 왕복으로 다음
  // 페이지를 받아 이미 있는 movements 뒤에 이어 붙인다(둘 다 최신순 정렬이라 재정렬 불필요).
  // 캐시(adminFetchJsonCached)를 쓰지 않는다 — 오프셋이 매번 달라 같은 URL로 재사용될 일이 없다.
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false)
  const [loadMoreHistoryError, setLoadMoreHistoryError] = useState<string | null>(null)
  const loadMoreHistory = useCallback(async () => {
    if (loadingMoreHistory) return
    setLoadingMoreHistory(true)
    setLoadMoreHistoryError(null)
    try {
      const offset = data?.movements.length ?? 0
      const page = await adminFetchJson<{ movements: HardwareMovement[]; movementsTotal: number }>(
        `/api/admin/hardware?movementsOffset=${offset}&movementsLimit=1000`
      )
      setData((current) => {
        if (!current) return current
        // id 중복 방지 — 그 사이 새 기록이 생겨 오프셋이 살짝 밀려도 같은 행을 두 번 넣지 않는다.
        const seen = new Set(current.movements.map((movement) => movement.id))
        const appended = page.movements.filter((movement) => !seen.has(movement.id))
        const mergedMovements = [...current.movements, ...appended]
        return {
          ...current,
          movements: mergedMovements,
          movementsTotal: page.movementsTotal,
          recentOutbound: mergedMovements.filter((movement) => movement.movement_type === "outbound").slice(0, RECENT_OUTBOUND_LIMIT),
          plannedMovements: mergedMovements.filter((movement) => movement.movement_type === "outbound").filter(isPlannedMovement),
        }
      })
    } catch (err) {
      setLoadMoreHistoryError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingMoreHistory(false)
    }
  }, [data?.movements.length, loadingMoreHistory])

  // 샘플 유닛 트래커 — 대시보드와 별도 수명주기(작은 테이블, 캐시 없음). 부모가 소유해야
  // 입출고 시트(대여 유닛 선택)와 홈 섹션·상세 시트가 같은 데이터를 본다.
  const [sampleLatestEvents, setSampleLatestEvents] = useState<Record<string, HardwareSampleEvent>>({})
  const [sampleUnitsLoading, setSampleUnitsLoading] = useState(false)
  const [sampleUnitsError, setSampleUnitsError] = useState<string | null>(null)
  const sampleUnitsRequestedRef = useRef(false)

  const loadSampleUnits = useCallback(async () => {
    sampleUnitsRequestedRef.current = true
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

  // 샘플 유닛을 읽는 화면은 홈 탭 트래커와 빠른 기록 시트(대여/반환 유닛 선택)뿐이다.
  // ?tab=history·?tab=entry 딥링크로 들어오면 왕복을 아예 쓰지 않고, 탭 전환이나 시트 열기로
  // 처음 필요해지는 순간 한 번만 받아온다(이후 갱신은 저장 후 loadSampleUnits 재호출).
  // urlReady를 함께 보는 이유: activeTab 초기값이 "home"이라, URL의 tab을 반영하기 전에
  // 판단하면 내역 탭 딥링크도 첫 커밋에서 한 번 받아버린다.
  const sampleUnitsNeeded = urlReady && (activeTab === "home" || sheetOpen || linkedUnitCode != null)
  useEffect(() => {
    if (!sampleUnitsNeeded || sampleUnitsRequestedRef.current) return
    void loadSampleUnits()
  }, [sampleUnitsNeeded, loadSampleUnits])

  const selectedSampleUnit = useMemo(
    () =>
      sampleUnits?.find((unit) => unit.id === sampleUnitSheetId) ??
      // unit= 딥링크 — 관리번호로 찾는다(대소문자 무시). 못 찾으면 시트를 열지 않고 아래 안내가 맡는다.
      (sampleUnitSheetId == null && linkedUnitCode
        ? sampleUnits?.find((unit) => unit.asset_code.toUpperCase() === linkedUnitCode.toUpperCase()) ?? null
        : null) ??
      null,
    [sampleUnits, sampleUnitSheetId, linkedUnitCode]
  )

  // 반복 입력 기억 복원 — 하이드레이션 불일치를 피하려고 마운트 후 1회만 읽는다.
  // 저장 대기 바구니도 같은 자리에서 되살린다(시트가 "저장 대기 N건"으로 보여 주므로 조용히 되살려도 된다).
  useEffect(() => {
    const savedOwner = readLocalString(QUICK_RECORD_OWNER_KEY)
    if (savedOwner) setOwner((current) => current || savedOwner)
    if (readLocalString(QUICK_RECORD_STAY_OPEN_KEY) === "1") setStayOpenAfterSave(true)
    const savedCart = readStoredQuickCartDrafts()
    quickCartRestoredRef.current = true
    if (savedCart.length > 0) {
      setQuickCart(savedCart)
      // 시트가 닫힌 채 되살아나면 화면에 아무 표시가 없다 — 보이지 않는 바구니가 저장 동작을
      // 바꾸고(저장 후 시트가 닫히지 않는다), Cmd+Enter 가 어제 날짜 줄을 그대로 원장에 넣는다.
      setNotice(
        `저장하지 않은 기록 바구니 ${formatNumber(savedCart.length)}건을 되살렸습니다 — 빠른 기록에서 확인하거나 비우세요.`
      )
    }
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
    else if (voidedMovements && voidedMovements.length > 0) {
      const seen = new Set(rows.map((movement) => movement.id))
      rows = [...rows, ...voidedMovements.filter((movement) => !seen.has(movement.id))]
    }
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
    const query = deferredSearch.trim().toLowerCase()
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
          // "이 시리얼은 어디 갔나"에 답한다(하드웨어 라운드 2 L-14) — 시리얼·출발지·보관처·수입자도 찾는다.
          (movement.serials ?? []).join(" "),
          movement.from_location,
          movement.storage_location,
          movement.importer,
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
    voidedMovements,
    historyType,
    historyStatus,
    saleTypeFilter,
    productFilter,
    lotFilter,
    customerFilter,
    historyDateFrom,
    historyDateTo,
    deferredSearch,
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
    const rawQuery = deferredHardwareSearch.trim()
    if (!rawQuery) return null

    const normalized = normalizeHardwareText(rawQuery)
    const today = todayKey()
    const lowIntent = /부족|주문|low/i.test(rawQuery)
    const todayIntent = /오늘|today/i.test(rawQuery)
    const oldLotIntent = /오래|FIFO|선입|first/i.test(rawQuery)
    const myIntent = /내 담당|담당/i.test(rawQuery)
    // "내 담당"은 담당자가 배정된 모든 건이 아니라 로그인한 관리자 본인 건만 — viewer.name과
    // movement.owner를 비교한다(공백·대소문자 차이는 관용). 이름을 모르면(레거시 세션 등)
    // 아무 것도 매칭하지 않는다 — 예전 버그(담당자 있는 모든 건 표시)로 되돌아가지 않기 위함.
    const viewerName = (data?.viewer?.name ?? "").trim().toLowerCase()
    const isMine = (owner: string | null | undefined) =>
      viewerName.length > 0 && (owner ?? "").trim().toLowerCase() === viewerName

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
        if (myIntent) return isMine(movement.owner)
        if (!normalized) return false
        return matchesText(movement.product_name, movement.to_location, movement.owner, movement.reference_no, movement.status, movementLot(movement))
      })
      .sort((a, b) => new Date(a.occurred_at ?? a.created_at).getTime() - new Date(b.occurred_at ?? b.created_at).getTime())
      .slice(0, 6)

    const customerAgg = new Map<string, { customer: string; planned: number; outbound: number; lastDate: string | null }>()
    for (const movement of data?.movements ?? []) {
      if (movement.movement_type !== "outbound" || movement.voided_at) continue
      const customer = customerLabel(movement.to_location)
      // 의도 칩(오늘 출고·내 담당)은 문자열 매칭을 하지 않는다(하드웨어 라운드 2 H-12) — "오늘 출고"가 "오늘출고"로
      // 정규화돼 고객명과 비교되면서 고객 칸이 늘 비었다. 의도가 조건이다.
      const intentQuery = todayIntent || myIntent
      if (!normalized && !intentQuery) continue
      if (!intentQuery && normalized && !matchesText(customer, movement.product_name, movement.owner, movement.reference_no)) continue
      if (todayIntent && movement.occurred_at?.slice(0, 10) !== today) continue
      if (myIntent && !isMine(movement.owner)) continue
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
  }, [data?.items, data?.movements, data?.plannedMovements, data?.stock, data?.viewer?.name, deferredHardwareSearch])

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
      // 입고는 유형으로 묶는다(하드웨어 라운드 2 L-5) — 입고의 도착은 늘 보관처(창고)라 "고객(미지정)"으로 보였고,
      // 같은 날 도착 없는 출고와 한 묶음이 됐다.
      const customer =
        movement.movement_type === "inbound"
          ? "매입 입고"
          : movement.to_location
            ? customerLabel(movement.to_location)
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

  // 입고표의 주요 품목 슬롯·"품목 추가" 목록을 활성 품목으로 좁힌다 — 대시보드 items 에는 비활성 품목도 섞여 있고
  // active 필드가 없어서, 재고 행이 있는 품목(= 활성)을 기준으로 삼는다.
  const inboundActiveItemIds = useMemo(() => (data?.stock ?? []).map((row) => row.itemId), [data?.stock])
  // 새 물량번호 추천은 원장 입고 이력으로 만든다 — 시트 이관이 밀려 있으면 그 뒤에 들어온 물량(예: 9/8 C2)이 원장에 없어
  // 이미 쓰인 번호를 추천한다(2026-09-15 실측). 신선도 판정은 홈 스트립과 같은 함수(judgeImportFreshness)를 쓴다.
  const inboundLotStaleNote = useMemo(() => {
    const importRun = data?.importRun ?? null
    const lastSuccess = data?.importRunLastSuccess ?? null
    // 시트 미러에 원장보다 입고 행이 많으면(가져오기 대기, 라운드 2 S-9) 경과일과 무관하게 알린다 — 그 행이 새 물량일 수 있다.
    const basis = importRun?.status === "success" ? importRun : lastSuccess
    const pending = judgeMirrorPending(basis, data?.mirror ?? null)
    if (pending?.delta && pending.delta.inbound > 0) {
      return `시트에 원장에 아직 없는 입고 ${formatNumber(pending.delta.inbound)}행이 있어요 — 추천 번호가 이미 쓰였을 수 있으니 시트의 최신 번호를 확인하거나 먼저 가져오세요.`
    }
    const freshness = judgeImportFreshness(importRun, { lastSuccess })
    if (freshness.level === "ok" || freshness.level === "none" || freshness.daysAgo == null) return null
    return `시트 이관이 ${formatNumber(freshness.daysAgo)}일 전이라 그 뒤에 들어온 물량번호가 추천에 빠져 있을 수 있어요. 시트의 최신 번호를 확인하세요.`
  }, [data?.importRun, data?.importRunLastSuccess, data?.mirror])

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
    // 최신 입고가 위로 — 입고일(lot 의 첫 입고) 내림차순, 같은 날이면 H 번호 내림차순, 그다음 가나다(하드웨어 라운드 2 E-1).
    // 예전엔 H 번호를 먼저 세워 지금 쓰는 C1·C2·방금 저장한 C3가 H8~H0 뒤 맨 아래로 갔고, "직전 구성 복사"가 H8을 썼다.
    const allLots = Array.from(groups.values()).sort(compareInboundLotGroups)
    let lots = allLots
    const query = inboundSearch.trim().toLowerCase()
    if (query) {
      // 표시 lot(H0 = FY24-25)·수입자로도 찾는다(E-6) — 배지에 보이는 이름으로 검색되지 않았다.
      lots = lots.filter(
        (group) =>
          group.lot.toLowerCase().includes(query) ||
          group.displayLot.toLowerCase().includes(query) ||
          (group.importer ?? "").toLowerCase().includes(query) ||
          group.items.some((item) => item.product_name.toLowerCase().includes(query) || (item.importer ?? "").toLowerCase().includes(query))
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

  // 고객사 제안 — movements 가 최신순이라 Set 삽입 순서가 곧 "최근 출고 순"이다.
  // 가나다순으로 다시 정렬하지 않는다: 고를 때 위에 있어야 하는 것은 자음 순서가 아니라 최근 거래다.
  const historyCustomers = useMemo(() => {
    const set = new Set<string>()
    for (const movement of data?.movements ?? []) {
      if (movement.movement_type !== "outbound") continue
      const label = customerLabel(movement.to_location)
      if (label !== UNSPECIFIED_CUSTOMER) set.add(label)
    }
    return Array.from(set)
  }, [data?.movements])

  // 직전 기록 복제용 — 손으로 남긴(admin_manual) 최신 유효 기록. 시트 임포트 행은 복제 후보에서 제외한다.
  // 직전 기록 복제 후보 — 출고 계열만, 같은 날이면 늦게 만든 것(하드웨어 라운드 2 Q-7·Q-8, quick-record-model).
  const lastManualMovement = useMemo(() => pickLatestManualOutbound(data?.movements ?? []), [data?.movements])

  const historyLots = useMemo(() => {
    // 최근 움직인 lot 이 위로(입고 목록과 같은 규칙, lot-order.ts) — 예전 H 우선 정렬은 C 계열을 맨 아래로 보냈다(E-1).
    const lastDate = new Map<string, string>()
    for (const movement of data?.movements ?? []) {
      const lot = movementLot(movement)
      if (!lot) continue
      const date = movement.occurred_at?.slice(0, 10) ?? ""
      if (!lastDate.has(lot) || date > (lastDate.get(lot) ?? "")) lastDate.set(lot, date)
    }
    return sortLotsByRecency(lastDate.keys(), lastDate)
  }, [data?.movements])

  const detailMovement = useMemo(
    () =>
      (data?.movements ?? []).find((movement) => movement.id === detailId) ??
      // 취소 기록(L-1)은 대시보드 원장에 없다 — "취소 포함"으로 읽은 목록에서 찾는다(취소 사유·취소자 표시).
      voidedMovements?.find((movement) => movement.id === detailId) ??
      null,
    [data?.movements, voidedMovements, detailId]
  )

  const customerHistory = useMemo(() => {
    if (!customerDetail) return null
    const rows = (data?.movements ?? [])
      .filter((movement) => !movement.voided_at && customerLabel(movement.to_location) === customerDetail)
      .sort((a, b) => new Date(b.occurred_at ?? b.created_at).getTime() - new Date(a.occurred_at ?? a.created_at).getTime())
    // 총 수량은 확정 출고만 — 예정(아직 안 나감)은 따로 센다(하드웨어 라운드 2 L-11). 예전엔 예정·샘플 대여까지 한 숫자에 섞였다.
    const totalQty = rows
      .filter((movement) => movement.movement_type === "outbound" && !isPlannedMovement(movement))
      .reduce((total, movement) => total + movement.quantity, 0)
    const plannedQty = rows
      .filter((movement) => movement.movement_type === "outbound" && isPlannedMovement(movement))
      .reduce((total, movement) => total + movement.quantity, 0)
    const totalRevenue = rows.reduce(
      (total, movement) => total + (outboundSaleType(movement) === "sales" && movement.amount_usd != null ? movement.amount_usd : 0),
      0
    )
    const hasRevenue = rows.some((movement) => outboundSaleType(movement) === "sales" && movement.amount_usd != null)
    const partialRange = (data?.movementsTotal ?? 0) > (data?.movements.length ?? 0)
    return { name: customerDetail, rows, totalQty, plannedQty, totalRevenue, hasRevenue, count: rows.length, partialRange }
  }, [data?.movements, data?.movementsTotal, customerDetail])

  // 거래이력에서 연 상세를 닫으면 거래이력으로 돌아간다(L-12) — 드릴다운에서 되돌아갈 길이 없었다.
  useEffect(() => {
    if (detailId != null) return
    const customer = returnToCustomerRef.current
    if (!customer) return
    returnToCustomerRef.current = null
    // 상세에서 "수정"으로 빠른 기록 시트를 열었으면 거래이력을 그 위에 다시 띄우지 않는다.
    if (sheetOpen) return
    setCustomerDetail(customer)
  }, [detailId, sheetOpen])

  // MovementDetailSheet memo 유지용 — 시트가 닫혀 있어도 매 렌더 새 배열/객체가 만들어져 memo를 깨던 파생값.
  const detailFacts = useMemo(() => detailMovement
    ? [
        { label: "날짜", value: formatDate(detailMovement.occurred_at) },
        { label: "수량", value: `${formatNumber(detailMovement.quantity)}대` },
        { label: "담당자", value: detailMovement.owner ?? "-" },
        { label: "경로", value: `${detailMovement.from_location ?? "-"} → ${detailMovement.to_location ?? "-"}` },
        // 참조번호(딜·견적·시트 물류No)는 다른 시스템에서 찾는 열쇠라 복사할 수 있게 보인다(L-10).
        ...(detailMovement.reference_no?.trim() ? [{ label: "참조번호", value: detailMovement.reference_no.trim() }] : []),
        // 받기만 하고 안 보여주던 필드(write-only) 해소 — 값이 있을 때만 노출해 소음을 막는다.
        ...(detailMovement.storage_location ? [{ label: "보관 장소", value: detailMovement.storage_location }] : []),
        ...(detailMovement.serials.length > 0 ? [{ label: `시리얼 (${detailMovement.serials.length})`, value: detailMovement.serials.join(", ") }] : []),
        ...(detailMovement.voided_at
          ? [
              {
                label: "취소 정보",
                value: `${detailMovement.void_reason?.trim() || "사유 미기재"} · ${detailMovement.voided_by ?? "-"} · ${formatDate(detailMovement.voided_at)}`,
              },
            ]
          : []),
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
    !detailMovement.converted_to_movement_id &&
    // 실현(비예정) 기록 수정은 finalize 권한 필요 — 서버 게이트와 같은 기준으로 버튼을 내린다.
    (isPlannedMovement(detailMovement) || canFinalize)

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

  // 완전일치(품목명·별칭) 먼저, 부분일치는 네 글자 이상 — T1 이 DT1 로 담기지 않게(Q-3).
  const findStockRowByText = (text: string) => matchStockRowByText(data?.stock ?? [], data?.items ?? [], text)

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
    const parsedLines = quotePasteText
      .split(/\r?\n/)
      .map(parseHardwareLineText)
      .filter((line): line is NonNullable<ReturnType<typeof parseHardwareLineText>> => Boolean(line))
    const guessedCount = parsedLines.filter((line) => line.quantityGuessed).length
    const drafts = parsedLines
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
    // 수량을 못 읽은 줄은 1로 담았다는 것을 숨기지 않는다(Q-9).
    if (guessedCount > 0) {
      setNotice(`견적/CRM 라인 ${formatNumber(drafts.length)}개를 담았습니다 — 수량을 읽지 못한 ${formatNumber(guessedCount)}줄은 1대로 담았으니 확인하세요.`)
    }
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
      // 새 입고는 한 화면 입고표로 넘긴다(2026-09-15). 바구니는 닫아도 유지되므로 담아 둔 출고 줄은 사라지지 않는다.
      // 기존 기록 수정(editingId)은 이 시트에서 단건으로 계속한다.
      if (!editingId) {
        setSheetOpen(false)
        openInboundSheet(selectedItemId || null)
        return
      }
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

  // 출고 세그먼트 전환 — 값이 **의미가 같은 칸**으로 옮겨 가게 한다(하드웨어 라운드 2 Q-1).
  // 샘플 판정은 도착 == "샘플"이라, 판매에서 친 고객사가 도착 칸에 남으면 샘플이 판매(sales)로 저장되고
  // CRM 게이트·상태가 판매로 갔다. 샘플로 가면 고객사를 대여 고객사로 옮기고 도착은 "샘플"로, 돌아오면 되돌린다.
  const selectOutboundMode = (mode: "actual" | "planned" | "sample") => {
    const presetLocations = new Set<string>(["", ...ENTRY_PRESETS.flatMap((item) => [item.from, item.to])])
    if (mode === "sample") {
      const carried = customerFromDestination(toLocation, presetLocations)
      applyPreset("sample")
      setToLocation("샘플")
      if (carried && !sampleCustomer.trim()) setSampleCustomer(carried)
      // 샘플은 단건 전용(Q-2) — 작업건 화면에서 넘어와도 단건으로.
      setSheetMode("single")
      return
    }
    const fromSample = activePresetKey === "sample"
    applyPreset(mode === "actual" ? "sale" : "planned")
    if (fromSample && sampleCustomer.trim()) setToLocation(sampleCustomer.trim())
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
    // 수정에서 가져온 담당자를 걷어내고 원래 담당자로(Q-4). 진행 중이던 CRM 조회는 버린다(Q-5).
    if (ownerBeforeEditRef.current != null) {
      setOwner(ownerBeforeEditRef.current)
      ownerBeforeEditRef.current = null
    }
    crmLookupSeqRef.current += 1
    setCrmLoading(false)
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

  const openInboundSheet = useCallback((itemId?: string | null, lot?: string | null) => {
    setInboundSheet({ open: true, product: itemId || null, lot: lot || null })
  }, [])

  /**
   * 기록 단축키 — i 입고표, o 출고 시트.
   *
   * 데스크톱 연속 입력이 마우스(우하단 FAB)에 묶여 있었다. 오버레이가 하나라도 열려 있거나 글자를
   * 입력하는 중에는 잡지 않는다(수정 키 조합·한글 조합 포함) — 화면을 보고 있을 때만 동작한다.
   */
  useEffect(() => {
    const busyWithAnotherSurface =
      sheetOpen || inboundSheet.open || pendingMovement != null || voidTarget != null ||
      detailId != null || customerDetail != null || sampleUnitSheetId != null || linkedUnitCode != null ||
      // 예정 출고를 고르는 중에는 하단 작업 바가 그 화면의 주 작업면이다 — FAB 와 같은 기준으로 물러난다.
      plannedSelectionCount > 0
    if (busyWithAnotherSurface) return

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      // 자식 컴포넌트가 가진 확인창(스냅샷 복원·샘플 백필 등)은 부모 state 로 보이지 않는다.
      // 열려 있는 모달이 하나라도 있으면 물러난다 — 모달 뒤로 시트가 열려 두 면이 겹치지 않게.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return

      const key = event.key.toLowerCase()
      if (key !== "i" && key !== "o") return
      event.preventDefault()
      if (key === "i") openInboundSheet()
      else openSheet("sale")
    }

    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [
    sheetOpen,
    inboundSheet.open,
    pendingMovement,
    voidTarget,
    detailId,
    customerDetail,
    sampleUnitSheetId,
    linkedUnitCode,
    plannedSelectionCount,
    openInboundSheet,
    openSheet,
  ])

  // 사무실·샘플 풀에서 고른 유닛을 담아 빠른 기록을 연다(하드웨어 라운드 3 P-8). 수량은 고른 대수, 유닛 선택은 그 유닛들 —
  // 대여는 고객사·담당자, 반납은 처리일만 채우면 된다. 고른 유닛이 없으면 예전 행 버튼과 같다(빈 선택으로 연다).
  const openSampleQuickRecord = useCallback((itemId: string, kind: "loan" | "return", unitIds: readonly string[]) => {
    openSheet(kind === "loan" ? "sample" : "sampleReturn", itemId)
    if (unitIds.length === 0) return
    setQuantity(String(unitIds.length))
    sampleUnitPrefillRef.current = [...unitIds]
    setSampleUnitPrefillSeq((seq) => seq + 1)
  }, [openSheet])

  const prepareQuickEntry = useCallback((itemId: string, presetKey: string) => {
    // 새 입고는 한 화면 입고표로 연다 — 재고 표·알림·검색의 "입고" 퀵버튼이 모두 여기를 거친다.
    if (presetKey === "inbound") {
      openInboundSheet(itemId)
      return
    }
    openSheet(presetKey, itemId)
  }, [openInboundSheet, openSheet])

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
    setOwner((current) => {
      if (ownerBeforeEditRef.current == null) ownerBeforeEditRef.current = current
      return movement.owner ?? ""
    })
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
      // 비운 날짜 입력("")은 오늘로 본다 — 패널의 행 표시(confirmDates[id] || today)와 같은 규칙.
      occurredAt: override.occurredAt || confirmDates[movement.id] || todayKey(),
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

  // 확정이 성공한 행의 수량·확정일 입력을 지운다(하드웨어 라운드 2 H-8) — 부분 확정 뒤 잔여 2대 행에 "3"이 남아
  // max 로만 잘려 전송되던 잔재를 없앤다. 결과 문구는 부분 확정이면 잔여를 함께 말한다.
  const clearConfirmInputs = useCallback((ids: readonly string[]) => {
    if (ids.length === 0) return
    const drop = <T,>(current: Record<string, T>) => {
      if (!ids.some((id) => id in current)) return current
      const next = { ...current }
      for (const id of ids) delete next[id]
      return next
    }
    setConfirmQtys(drop)
    setConfirmDates(drop)
  }, [])
  const confirmedMessage = (movement: HardwareMovement, qty: number) =>
    qty < movement.quantity
      ? `직전 ${formatNumber(qty)}대 확정 · 잔여 ${formatNumber(movement.quantity - qty)}대 예정`
      : `${formatNumber(qty)}대 확정 완료`

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
        [movement.id]: { ok: true, message: confirmedMessage(movement, qty) },
      }))
      clearConfirmInputs([movement.id])
      setNotice(
        `${movement.product_name} ${formatNumber(qty)}대를 실제 출고로 확정했습니다.${
          qty < movement.quantity ? ` 잔여 ${formatNumber(movement.quantity - qty)}대는 예정으로 유지됩니다.` : ""
        }`
      )
      await refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      // 그룹·선택 확정처럼 실패 사유를 그 행에도 남긴다(H-7) — 상단 배너는 스크롤 밖일 수 있다.
      setPlannedConfirmResults((current) => ({ ...current, [movement.id]: { ok: false, message } }))
    } finally {
      setConfirmingId(null)
    }
  }, [busy, confirmingGroupKey, confirmingId, confirmPlannedMovementRequest, refresh, clearConfirmInputs])

  // 확인은 호출부(PlannedOutboundPanel 의 PlannedConfirmDialog)가 확정일·행별 배정과 함께 받는다(하드웨어 라운드 3 H-9) —
  // 예전 window.confirm 은 품목 수만 말했다. 거절이 확실한 행(지정 lot 잔량 부족)은 호출부가 빼고 넘긴다.
  const confirmPlannedGroup = useCallback(async (group: { key: string; customer: string; items: HardwareMovement[] }) => {
    if (group.items.length === 0 || plannedConfirmLocked) return
    const plannedSnapshot = group.items.map((movement) => ({
      movement,
      ...readPlannedConfirmInput(movement),
    }))
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
          nextResults[entry.movement.id] = { ok: true, message: confirmedMessage(entry.movement, qty) }
        } catch (err) {
          failed += 1
          nextResults[entry.movement.id] = {
            ok: false,
            message: err instanceof Error ? err.message : "출고 확정에 실패했습니다.",
          }
        }
      }
      setPlannedConfirmResults((current) => ({ ...current, ...nextResults }))
      clearConfirmInputs(Object.keys(nextResults).filter((id) => nextResults[id].ok))
      setNotice(
        failed > 0
          ? `${group.customer} 출고 확정: ${formatNumber(success)}건 성공, ${formatNumber(failed)}건 실패`
          : `${group.customer} 예정 출고 ${formatNumber(success)}건을 모두 확정했습니다.`
      )
      if (success > 0) await refresh()
    } finally {
      setConfirmingGroupKey(null)
    }
  }, [plannedConfirmLocked, readPlannedConfirmInput, confirmPlannedMovementRequest, refresh, clearConfirmInputs])

  // 일괄 체크(감사 2026-09-14) — PlannedOutboundPanel이 여러 딜을 가로질러 고른 예정 출고를
  // 한 번에 확정하는 전용 핸들러. confirmPlannedGroup의 루프 패턴(성공/실패 집계 →
  // plannedConfirmResults → 알림 → 성공이 있으면 refresh() 한 번)을 그대로 따르되, 대상이
  // 한 딜(group.items)이 아니라 패널이 골라 넘긴 임의의 movement 배열이라는 점만 다르다.
  // 새 API를 만들지 않고 confirmPlannedMovementRequest를 순차(for await)로 재사용한다 — 각
  // 확정이 로트 잔량을 바꾸므로 다음 건의 FIFO 배정이 앞 건을 반영해야 하고, 서버 권한 검사
  // (hardware.finalize)와 건별 감사 로그도 그대로 유지된다(병렬 실행 시 이 순서 보장이 깨진다).
  // 수량은 호출부가 이미 확정 수량 입력(confirmQtys)을 반영해 넘기고, 확정일은 패널의 공통
  // 입력(bulkConfirmDate) 하나를 전체에 적용한다.
  const confirmPlannedSelection = useCallback(
    async (
      entries: Array<{ movement: HardwareMovement; quantity: number }>,
      occurredAt: string
    ): Promise<PlannedSelectionConfirmResult> => {
      if (entries.length === 0 || plannedConfirmLocked) return { successIds: [], failedIds: [] }
      setNotice(null)
      setError(null)
      const nextResults: Record<string, { ok: boolean; message: string }> = {}
      const successIds: string[] = []
      const failedIds: string[] = []
      setSelectionConfirmProgress({ index: 0, total: entries.length })
      try {
        for (let i = 0; i < entries.length; i += 1) {
          const { movement, quantity } = entries[i]
          // 몇 번째 건을 처리 중인지 매 반복마다 갱신 — 패널 하단 바의 "N / M 확정 중" 표시가
          // 이 값을 그대로 읽는다(요청사항 ①.5 진행 표시).
          setSelectionConfirmProgress({ index: i + 1, total: entries.length })
          try {
            const qty = await confirmPlannedMovementRequest(movement, { quantity, occurredAt })
            successIds.push(movement.id)
            nextResults[movement.id] = { ok: true, message: confirmedMessage(movement, qty) }
          } catch (err) {
            // 한 건 실패가 전체를 멈추지 않는다 — 사유를 그 행에 남기고 다음 건을 계속 진행한다.
            failedIds.push(movement.id)
            nextResults[movement.id] = {
              ok: false,
              message: err instanceof Error ? err.message : "출고 확정에 실패했습니다.",
            }
          }
        }
        // plannedConfirmResults는 단건·그룹 확정과 공유하는 같은 맵이다 — 행 아래 결과 문구
        // 렌더링(PlannedOutboundPanel)을 새로 만들지 않고 그대로 재사용한다.
        setPlannedConfirmResults((current) => ({ ...current, ...nextResults }))
        clearConfirmInputs(successIds)
        setNotice(
          failedIds.length > 0
            ? `선택 출고 확정: ${formatNumber(successIds.length)}건 성공, ${formatNumber(failedIds.length)}건 실패`
            : `선택한 예정 출고 ${formatNumber(successIds.length)}건을 모두 확정했습니다.`
        )
        if (successIds.length > 0) await refresh()
      } finally {
        setSelectionConfirmProgress(null)
      }
      return { successIds, failedIds }
    },
    [plannedConfirmLocked, confirmPlannedMovementRequest, refresh, clearConfirmInputs]
  )

  const voidMovement = useCallback((movement: HardwareMovement) => {
    if (movement.voided_at) return
    setVoidReason("")
    setVoidError(null)
    setVoidTarget(movement)
  }, [])

  const confirmVoid = async () => {
    const movement = voidTarget
    if (!movement) return
    setVoidingId(movement.id)
    setNotice(null)
    setError(null)
    setVoidError(null)
    try {
      await adminFetchJson(`/api/admin/hardware/movements/${movement.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "void", reason: voidReason.trim() || undefined }),
      })
      setNotice(`${movement.product_name} ${MOVEMENT_LABEL[movement.movement_type]} 기록을 취소했습니다.`)
      setVoidTarget(null)
      // 상세 위에서 연 취소면 성공할 때만 상세를 닫는다(L-12) — 닫기를 누르면 상세로 돌아간다.
      setDetailId((current) => (current === movement.id ? null : current))
      await refresh()
    } catch (err) {
      // 실패는 모달 안에 둔다(L-3) — 모달이 열린 채라 상단 배너는 가려진다.
      setVoidError(err instanceof Error ? err.message : String(err))
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
    if (activeTab === "entry" && entrySub === "inbound") {
      openInboundSheet()
      return
    }
    openSheet("sale")
  }

  const adjustQuantity = (delta: number) => {
    setQuantity((current) => String(Math.max(1, Number(current || 0) + delta)))
  }

  const selectedCrmCandidate = useMemo(
    () => crmCandidates.find((candidate) => candidate.id === selectedCrmCandidateId) ?? null,
    [crmCandidates, selectedCrmCandidateId]
  )

  // 가져오기 확인 문구 — 지금 원장이 무엇을 기준으로 하는지(마지막 성공 이관·원천)와 시트에 쌓인 차이를 보여 준다.
  const importConfirmCopy = useMemo(() => {
    const latest = data?.importRun ?? null
    const basis = latest?.status === "success" ? latest : data?.importRunLastSuccess ?? null
    const pending = judgeMirrorPending(basis, data?.mirror ?? null)
    const basisLabel = basis?.finished_at ? formatDate(basis.finished_at) : null
    const description = [
      "구글 시트를 먼저 동기화하고 백업(스냅샷)을 뜬 뒤, 원장의 시트 이관분을 시트 기준으로 교체합니다.",
      basis?.rows_imported != null ? `지금 시트 이관분은 ${formatNumber(basis.rows_imported)}행${basisLabel ? `(${basisLabel} 이관)` : ""}입니다.` : "",
      pending?.changed && pending.delta ? `시트에 원장과 다른 행이 있습니다: ${describeMirrorDelta(pending.delta)}(행 수 기준).` : "",
      "시트가 같은 물량을 다시 실은 어드민 확정은 사유와 함께 취소되고, 홈 맨 아래 스냅샷 복원으로 되돌릴 수 있습니다. 어드민에서 직접 만든 기록은 건드리지 않습니다.",
    ]
      .filter(Boolean)
      .join(" ")
    const warning =
      basis?.origin === "ledger_file"
        ? `마지막 이관은 원장 파일 업로드${basisLabel ? `(${basisLabel})` : ""}였습니다 — 가져오면 업로드한 원장이 시트 기준으로 바뀝니다.`
        : latest && latest.status === "running"
          ? "다른 가져오기가 진행 중일 수 있습니다 — 진행 중이면 이번 요청은 실행되지 않습니다."
          : null
    return { description, warning }
  }, [data?.importRun, data?.importRunLastSuccess, data?.mirror])

  // 싱크·백업 후 가져오기 — 확인 다이얼로그(S-3) 뒤에만 부른다. 결과 계약(outcome·stage)을 한 함수로 읽고,
  // 잠김이 아니면 결과와 무관하게 다시 불러온다 — 실패·시간 초과여도 이관 기록이나 원장이 바뀌었을 수 있다(S-6).
  // 재전송은 하지 않는다.
  const importSheet = async () => {
    setImportConfirmOpen(false)
    setBusy("import")
    setNotice(null)
    setError(null)
    setImportNotice(null)
    let status: number | undefined
    let body: HardwareImportResponse | null = null
    try {
      const response = await adminFetch("/api/admin/hardware/import-sheet", {
        method: "POST",
        body: JSON.stringify({ sync: true }),
      })
      const read = await readSyncOutcomeResponse(response)
      status = read.status
      body = read.body as HardwareImportResponse | null
    } catch {
      body = null
    }
    try {
      if (body?.outcome !== "running") await refresh()
    } finally {
      const described = describeHardwareImportOutcome(body, { httpStatus: status })
      if (described.tone === "error") setError(described.message)
      else setImportNotice(described)
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
    setImportNotice(null)
    let changedOrUnknown = true
    try {
      const form = new FormData()
      form.append("file", file)
      const result = await adminFetchJson<{
        outcome?: HardwareImportResponse["outcome"]
        startedAt?: string
        file: string
        parsed: { lots: string[]; inboundRows: number; outboundRows: number; byType: Record<string, number> }
        import: { imported: number; skipped: number; snapshotId?: string }
        warnings: string[]
        importWarnings?: string[]
      }>("/api/admin/hardware/import-ledger", { method: "POST", body: form })
      if (result.outcome === "running") {
        changedOrUnknown = false
        setImportNotice(describeHardwareImportOutcome({ outcome: "running", startedAt: result.startedAt }))
        return
      }
      const snapshotHint = result.import?.snapshotId ? ` · 백업 ${result.import.snapshotId.slice(0, 8)}` : ""
      const typeHint = Object.entries(result.parsed.byType)
        .map(([key, value]) => `${key} ${formatNumber(value)}`)
        .join(" · ")
      const warnHint = result.warnings.length > 0 ? ` · 파서 경고 ${formatNumber(result.warnings.length)}건` : ""
      const importWarnings = result.importWarnings ?? []
      setImportNotice({
        tone: importWarnings.length > 0 ? "warning" : "success",
        message: `원장 파일 가져오기 완료: 물량번호 ${formatNumber(result.parsed.lots.length)}개 · 입고 ${formatNumber(result.parsed.inboundRows)} · 출고 ${formatNumber(result.parsed.outboundRows)} (${typeHint}) → 원장 ${formatNumber(result.import.imported)}건 반영${snapshotHint}${warnHint}.${importWarnings.length > 0 ? ` 확인할 것: ${importWarnings[0]}` : ""}`,
      })
    } catch (err) {
      setError(
        isAdminTimeoutError(err)
          ? "업로드 응답이 오래 걸려 화면에서 기다리기를 멈췄습니다 — 서버는 끝까지 처리했을 수 있어 화면을 다시 불러왔습니다. 스트립의 이관 시각으로 반영 여부를 확인하세요."
          : err instanceof Error ? err.message : String(err)
      )
    } finally {
      // 실패여도 미러·이관 기록이 바뀌었을 수 있다 — 잠김이 아니면 다시 불러온다(S-6).
      if (changedOrUnknown) await refresh().catch(() => undefined)
      setBusy(null)
    }
  }

  // 샘플 프리셋 ↔ 유닛 트래커 연계 — 현재 폼 품목 기준 선택 풀과 필요 선택 수.
  // 필요 수 = min(수량, 풀 크기): 풀이 수량보다 작으면 있는 만큼 선택하고 부족분은 저장 시 자동 발급.
  const draftProductName = customProduct.trim() || selectedItem?.name || ""
  const draftQuantityNumber = Math.max(0, Math.floor(Number(quantity) || 0))
  // 유닛 ↔ 품목은 풀·트래커와 같은 규칙으로 잇는다(하드웨어 라운드 3 P-5) — item_id 우선, 재고 행에 없는 id 는 이름으로.
  // 예전엔 이름 완전일치라 이름이 바뀐 품목의 유닛이 풀에는 있는데 여기엔 없었다.
  const draftItemId = customProduct.trim() ? null : selectedItemId || null
  const sampleKnownItemIds = useMemo(
    () => new Set((data?.stock ?? []).map((row) => row.itemId).filter(Boolean)),
    [data?.stock]
  )
  const sampleLoanPool = useMemo(
    () =>
      (sampleUnits ?? []).filter(
        (unit) =>
          unit.status === "office" &&
          sampleUnitMatchesItem(unit, { itemId: draftItemId, productName: draftProductName }, sampleKnownItemIds)
      ),
    [sampleUnits, draftItemId, draftProductName, sampleKnownItemIds]
  )
  const sampleReturnPool = useMemo(
    () =>
      (sampleUnits ?? []).filter(
        (unit) =>
          unit.status === "loaned" &&
          sampleUnitMatchesItem(unit, { itemId: draftItemId, productName: draftProductName }, sampleKnownItemIds)
      ),
    [sampleUnits, draftItemId, draftProductName, sampleKnownItemIds]
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
  // 사무실·샘플 풀에서 고른 유닛 담기(하드웨어 라운드 3 P-8) — 위 두 효과(품목·프리셋이 바뀌면 비우기)보다 **뒤에** 선언해
  // 같은 커밋에서 마지막으로 적용된다. 요청은 openSampleQuickRecord 가 ref 에 두고 순번으로 이 효과를 깨운다.
  useEffect(() => {
    const unitIds = sampleUnitPrefillRef.current
    if (!unitIds) return
    sampleUnitPrefillRef.current = null
    // 시트 목록에 보이는 유닛만 담는다 — 목록에 없는 유닛(비활성 품목 행 등)이 보이지 않는 선택으로 저장되지 않게.
    const pool = activePresetKey === "sampleReturn" ? sampleReturnPool : sampleLoanPool
    const visible = new Set(pool.map((unit) => unit.id))
    setSampleUnitSelection(unitIds.filter((id) => visible.has(id)))
  }, [sampleUnitPrefillSeq, activePresetKey, sampleLoanPool, sampleReturnPool])

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
  // 샘플 대여는 단건 전용 — 유닛(관리번호)을 사람이 골라야 하고 트래커 동기화가 단건 저장에만 있다.
  // 예전엔 바구니로 담으면 고객사·유닛 검증과 트래커를 건너뛰어 원장은 대여, 유닛은 사무실 가용으로 남았다(Q-2·P-1).
  const quickCartEnabled =
    !editingId && (movementType === "inbound" || movementType === "outbound") && activePresetKey !== "sample"

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
    if (!quickCartEnabled) {
      setError("샘플 대여는 유닛을 골라야 해서 단건으로만 저장합니다.")
      return
    }
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
    // 샘플 대여 줄은 바구니로 저장하지 않는다(Q-2) — 이전 버전에서 담아 되살아난 줄이 트래커를 건너뛰지 않게 막는다.
    const sampleLines = quickCart.filter((draft) => draft.movementType === "outbound" && isSampleOutbound(draft))
    if (sampleLines.length > 0) {
      setQuickCartLineErrors(
        Object.fromEntries(sampleLines.map((draft) => [quickCartLineKey(draft), "샘플 대여는 단건으로 저장하세요 — 유닛을 골라야 합니다."]))
      )
      setError(`샘플 대여 줄 ${formatNumber(sampleLines.length)}건은 바구니로 저장할 수 없습니다 — 빼고 단건 기록으로 저장하세요.`)
      return
    }
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
        applySavedMovements(result.movements ?? [])
        void refresh()
      }
    } catch (err) {
      if (isAdminTimeoutError(err)) {
        void refresh()
        setError("바구니 저장 응답이 오래 걸려 기다리기를 멈췄습니다 — 서버에 이미 저장됐을 수 있어 원장을 다시 불러왔습니다. 내역을 확인한 뒤에만 다시 저장하세요.")
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setBusy(null)
    }
  }

  // 감사(2026-09-07 #8): 가장 흔한 트랜잭션(실제 판매 출고 1건)마다 CRM 확인 모달이 강제로
  // 끼어들었다(실측 클릭 3 + 키 10 + 대기 2) — 매칭 후보도 경고도 없는, CRM에 없는 오프라인
  // 판매에서도 예외 없이 떴다. 이제 후보를 먼저 조회하고, 보여줄 것(후보 또는 경고)이 하나라도
  // 있을 때만 모달을 연다 — 후보가 있으면 지금까지처럼 반드시 사용자 확인을 거친다(자동 링크·
  // 무음 저장 없음). 조회 자체가 실패하면 안전한 쪽으로: 모달을 열어 에러를 보여주고 사용자가
  // "연동 없이 기록"으로 계속 진행할 수 있게 한다(조용한 실패로 CRM 링크를 놓치지 않게).
  const openCrmConfirmation = async (draft: HardwareMovementDraft) => {
    const seq = crmLookupSeqRef.current + 1
    crmLookupSeqRef.current = seq
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
      // 고객사도 함께 보낸다 — 같은 품목·수량의 딜이 여럿일 때 후보가 하나로 좁혀져 확인이 한 번에 끝난다.
      const draftCustomer = customerLabel(draft.toLocation)
      if (draftCustomer !== UNSPECIFIED_CUSTOMER) params.set("customer", draftCustomer)
      const result = await adminFetchJson<HardwareCrmOrderCandidatesResponse>(
        `/api/admin/hardware/crm-orders?${params.toString()}`,
        { cache: "no-cache" }
      )
      // 조회 중 시트를 닫았거나 다시 열었으면 이 응답으로 아무것도 하지 않는다(Q-5).
      if (seq !== crmLookupSeqRef.current) return
      setCrmCandidates(result.candidates)
      setCrmWarnings(result.warnings ?? [])
      if (shouldSkipCrmConfirmation(result.candidates, result.warnings ?? [])) {
        setCrmLoading(false)
        await createMovementFromDraft(draft, null)
        return
      }
      setSelectedCrmCandidateId(result.candidates[0]?.id ?? null)
      setCrmAutoReflect(result.candidates.length > 0)
      setPendingMovement(draft)
    } catch (err) {
      if (seq !== crmLookupSeqRef.current) return
      setCrmError(err instanceof Error ? err.message : String(err))
      setCrmAutoReflect(false)
      setPendingMovement(draft)
    } finally {
      if (seq === crmLookupSeqRef.current) setCrmLoading(false)
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
    // 연속 기록이면 대여 고객사는 남긴다 — 판매는 고객사를 유지하는데 샘플만 매번 비워 다시 쳐야 했다(Q-23).
    if (!stayOpenAfterSave) setSampleCustomer("")
    setSampleUnitSelection([])
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

      const saveResult = await adminFetchJson<{ movement?: HardwareMovement; movements?: HardwareMovement[] }>("/api/admin/hardware/movements", {
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
      applySavedMovements(saveResult?.movements ?? (saveResult?.movement ? [saveResult.movement] : []))
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
      let sampleSyncError: string | null = null
      if (activePresetKey === "sample" || activePresetKey === "sampleReturn" || activePresetKey === "sampleAssign") {
        try {
          await syncSampleTracker(draft, saveResult?.movement?.id ?? null)
        } catch (syncErr) {
          sampleSyncError = `원장은 저장됐지만 샘플 트래커 기록에 실패했습니다: ${
            syncErr instanceof Error ? syncErr.message : String(syncErr)
          } — 샘플 트래커에서 수동으로 정정하세요.`
        } finally {
          // 성공·부분 실패 모두 유닛 목록을 다시 받는다 — 대여 이벤트는 들어갔는데 발급이 실패한 경우에도
          // 풀이 이미 나간 유닛을 사무실 가용으로 보이지 않게(하드웨어 라운드 2 P-4).
          await loadSampleUnits()
        }
      }
      // 재검증은 기다리지 않는다 — 연속 기록에서 다음 건을 바로 받기 위해서다(감사 2026-09-20).
      // 방금 저장한 줄은 위에서 이미 원장에 들어갔고, 파생 숫자만 이 응답이 오면 바뀐다.
      void refresh()
      // 재검증(load)은 이제 동작 오류(error)를 지우지 않는다(조회 실패는 loadError) — 트래커 실패 문구가 그대로 남는다.
      if (sampleSyncError) setError(sampleSyncError)
    } catch (err) {
      // 45초 타임아웃은 "실패"가 아니라 "모름"이다 — 서버는 저장했을 수 있다. 다시 누르면 중복 기록이 되므로
      // 원장을 다시 불러오고 확인을 권한다(재전송 없음, 하드웨어 라운드 2 Q-11).
      const message = isAdminTimeoutError(err)
        ? "저장 응답이 오래 걸려 기다리기를 멈췄습니다 — 서버에 이미 저장됐을 수 있어 원장을 다시 불러왔습니다. 내역에 같은 기록이 있는지 확인한 뒤에만 다시 저장하세요."
        : err instanceof Error ? err.message : String(err)
      if (isAdminTimeoutError(err)) void refresh()
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
      if (ownerBeforeEditRef.current != null) {
        setOwner(ownerBeforeEditRef.current)
        ownerBeforeEditRef.current = null
      }
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
    // CRM 확인 모달이 떠 있거나 후보를 조회하는 중이면 다시 제출하지 않는다 — 예전엔 조회가 다시 돌며 후보 선택이 초기화됐다(Q-6).
    if (pendingMovement || crmLoading) return
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
    <div className="min-h-screen bg-[#FAFAF8] pb-24 [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-[#084734] [&_input:not([type=checkbox]):not([type=file])]:min-h-11 [&_input:not([type=checkbox]):not([type=file])]:focus-visible:outline-none [&_input:not([type=checkbox]):not([type=file])]:focus-visible:ring-2 [&_input:not([type=checkbox]):not([type=file])]:focus-visible:ring-[#084734] [&_select]:min-h-11 [&_select]:focus-visible:outline-none [&_select]:focus-visible:ring-2 [&_select]:focus-visible:ring-[#084734] [&_textarea]:min-h-11 [&_textarea]:focus-visible:outline-none [&_textarea]:focus-visible:ring-2 [&_textarea]:focus-visible:ring-[#084734] md:[&_button]:min-h-0 md:[&_button]:min-w-0 md:[&_input:not([type=checkbox]):not([type=file])]:min-h-0 md:[&_select]:min-h-0 md:[&_textarea]:min-h-0">
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
                // 샘플은 아직 한 번도 안 받았고 지금 필요하지도 않으면 굳이 받지 않는다
                // (내역 탭 딥링크에서 새로고침을 눌러도 왕복이 늘지 않게).
                if (sampleUnitsNeeded || sampleUnitsRequestedRef.current) void loadSampleUnits()
              }}
              disabled={loading || busy != null}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </button>
            <button
              type="button"
              onClick={() => setImportConfirmOpen(true)}
              disabled={busy != null}
              aria-haspopup="dialog"
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
        {/* 전역 배너 — 오류는 role=alert, 성공·안내는 role=status(하드웨어 라운드 2 S-8·H-19·L-3). 둘 다 닫을 수 있다.
            가져오기·업로드 결과는 결과 계약 톤(성공·안내·경고)을 그대로 쓰는 SyncOutcomeNotice로 그린다. */}
        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[13px] font-semibold text-[#8F2C2C]">
            <span className="min-w-0 flex-1 leading-relaxed">{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="오류 알림 닫기" className="-my-1 -mr-1 shrink-0 cursor-pointer rounded-md px-2 py-1 text-[12px] font-bold opacity-70 transition hover:bg-black/5 hover:opacity-100">
              닫기
            </button>
          </div>
        )}
        {notice && (
          <div role="status" aria-live="polite" className="mb-4 flex items-start gap-2 rounded-lg border border-[#BDEFD8] bg-[#ECFDF5] px-4 py-3 text-[13px] font-semibold text-[#084734]">
            <span className="min-w-0 flex-1 leading-relaxed">{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="알림 닫기" className="-my-1 -mr-1 shrink-0 cursor-pointer rounded-md px-2 py-1 text-[12px] font-bold opacity-70 transition hover:bg-black/5 hover:opacity-100">
              닫기
            </button>
          </div>
        )}
        <SyncOutcomeNotice notice={importNotice} onDismiss={() => setImportNotice(null)} className="mb-4" />
        {/* 딥링크 대상이 불러온 범위에 없을 때(하드웨어 라운드 2 L-4·P-10) — 시트를 조용히 안 여는 대신 이유와 다음 행동을 말한다. */}
        {detailId && data && !detailMovement && (
          <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-4 py-2.5 text-[12px] font-semibold text-[#31302E]">
            <span className="min-w-0 flex-1">
              링크한 기록을 불러온 최근 {formatNumber(data.movements.length)}건 안에서 찾지 못했습니다 — 취소된 기록이면 내역의 &lsquo;취소 포함&rsquo;을,
              오래된 기록이면 &lsquo;이전 이력 더 불러오기&rsquo;를 누르면 열립니다.
            </span>
            <button type="button" onClick={() => setDetailId(null)} className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-[12px] font-bold text-[#615D59] hover:bg-black/5">
              닫기
            </button>
          </div>
        )}
        {linkedUnitCode && sampleUnits && !selectedSampleUnit && (
          <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-4 py-2.5 text-[12px] font-semibold text-[#31302E]">
            <span className="min-w-0 flex-1">관리번호 {linkedUnitCode} 유닛을 찾지 못했습니다 — 샘플 트래커에서 확인하세요.</span>
            <button type="button" onClick={() => setLinkedUnitCode(null)} className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-[12px] font-bold text-[#615D59] hover:bg-black/5">
              닫기
            </button>
          </div>
        )}
        {/* 데이터가 이미 있는데 재검증이 실패했으면 화면은 직전 값이다 — 그 사실만 알리고 다시 불러오기를 준다(Q-12).
            데이터가 없으면 아래 오류 패널이 맡는다. */}
        {loadError && data && (
          <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-4 py-2.5 text-[12px] font-semibold text-[#7A520F]">
            <span className="min-w-0 flex-1">화면 갱신에 실패해 직전에 불러온 값을 보여 주고 있습니다 — {loadError}</span>
            <button type="button" onClick={() => void refresh()} disabled={loading} className="shrink-0 cursor-pointer rounded-md border border-[#ECD29C] bg-white px-2.5 py-1 text-[12px] font-bold text-[#7A520F] transition hover:bg-[#FBF1E0] disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? "불러오는 중" : "다시 불러오기"}
            </button>
          </div>
        )}

        {!data && loadError && !loading ? (
          // 첫 조회 실패 — 빈 원장처럼 그리면 "시트 가져오기를 먼저 실행하세요"가 떠 조회 오류에 파괴적 동작을 권한다
          // (하드웨어 라운드 2 H-1·S-10·L-8). 오류와 다시 불러오기만 보인다.
          <section role="alert" data-testid="hardware-load-error" className="rounded-xl border border-[#F2B8B8] bg-white px-5 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <p className="text-[15px] font-bold text-[#8F2C2C]">하드웨어 데이터를 불러오지 못했습니다</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#615D59]">
              {loadError} — 원장이 비어 있는 것이 아니라 조회가 실패한 상태입니다. 가져오기·업로드는 다시 불러온 뒤에 판단하세요.
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#084734] px-4 py-2 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              다시 불러오기
            </button>
          </section>
        ) : loading && !data ? (
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
            <HomeTabPanel
              activePanelId={activePanelId}
              activeTabId={activeTabId}
              reduceMotion={reduceMotion}
              data={data}
              categoryCards={categoryCards}
              salesPeriodSummary={salesPeriodSummary}
              openOutboundDetail={openOutboundDetail}
              hardwareSearch={hardwareSearch}
              setHardwareSearch={setHardwareSearch}
              hardwareSearchResults={hardwareSearchResults}
              prepareQuickEntry={prepareQuickEntry}
              openSampleQuickRecord={openSampleQuickRecord}
              setActiveTab={setActiveTab}
              setHistoryType={setHistoryType}
              setProductFilter={setProductFilter}
              setCustomerFilter={setCustomerFilter}
              setSearch={setSearch}
              setLotFilter={setLotFilter}
              setMovementsPage={setMovementsPage}
              confirmPlannedMovement={confirmPlannedMovement}
              plannedConfirmLocked={plannedConfirmLocked}
              canFinalize={canFinalize}
              setCustomerDetail={setCustomerDetail}
              plannedMovementQuantity={plannedMovementQuantity}
              plannedStaleGroupCount={plannedStaleGroupCount}
              startPlannedEntry={startPlannedEntry}
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
              confirmPlannedSelection={confirmPlannedSelection}
              selectionConfirmProgress={selectionConfirmProgress}
              onPlannedSelectionCountChange={setPlannedSelectionCount}
              openSections={openSections}
              toggleSection={toggleSection}
              stockPagination={stockPagination}
              setStockPage={setStockPage}
              sampleUnits={sampleUnits}
              sampleLatestEvents={sampleLatestEvents}
              sampleUnitsLoading={sampleUnitsLoading}
              sampleUnitsError={sampleUnitsError}
              setSampleUnitSheetId={setSampleUnitSheetId}
              loadSampleUnits={loadSampleUnits}
              alertsPagination={alertsPagination}
              setAlertsPage={setAlertsPage}
              mutedAlerts={mutedAlerts}
              outboundPagination={outboundPagination}
              setOutboundPage={setOutboundPage}
              setDetailId={setDetailId}
              refresh={refresh}
              canWriteHardware={canWriteHardware}
              importBusy={busy === "import" || busy === "ledger"}
              describePlannedConfirm={readPlannedConfirmInput}
              resetHistoryFilters={resetHistoryFilters}
            />
            )}

            {activeTab === "entry" && (
            <EntryTabPanel
              activePanelId={activePanelId}
              activeTabId={activeTabId}
              reduceMotion={reduceMotion}
              entrySub={entrySub}
              setEntrySub={setEntrySub}
              openFreshSheet={openFreshSheet}
              inboundSearch={inboundSearch}
              setInboundSearch={setInboundSearch}
              inboundLots={inboundLots}
              outboundBuckets={outboundBuckets}
              outPeriod={outPeriod}
              setOutPeriod={setOutPeriod}
              openPeriods={openPeriods}
              setOpenPeriods={setOpenPeriods}
              setCustomerDetail={setCustomerDetail}
              setActiveTab={setActiveTab}
              onShowLotHistory={(lot) => {
                resetHistoryFilters()
                setLotFilter(lot)
                setActiveTab("history")
              }}
              onAddToLot={(lot) => openInboundSheet(null, lot)}
              canWrite={canWriteHardware}
            />
            )}

            <AnimatePresence>
            {sheetOpen && (
              <QuickRecordSheet
                formRef={formRef}
                sheetPanelRef={sheetPanelRef}
                reduceMotion={reduceMotion}
                editingId={editingId}
                activePresetKey={activePresetKey}
                movementType={movementType}
                sheetMode={sheetMode}
                setSheetMode={setSheetMode}
                sheetView={sheetView}
                quickCart={quickCart}
                quickCartTotals={quickCartTotals}
                quickCartLineErrors={quickCartLineErrors}
                quickCartSaveSummary={quickCartSaveSummary}
                busy={busy}
                crmLoading={crmLoading}
                error={error}
                notice={notice}
                data={data}
                customProduct={customProduct}
                setCustomProduct={setCustomProduct}
                showCustomInput={showCustomInput}
                setShowCustomInput={setShowCustomInput}
                selectedItemId={selectedItemId}
                setSelectedItemId={setSelectedItemId}
                selectedItem={selectedItem}
                activePreset={activePreset}
                isCustomerDestination={isCustomerDestination}
                outboundMode={outboundMode}
                quickPickGroups={quickPickGroups}
                setKitMultiplier={setKitMultiplier}
                cartSetMultiplier={cartSetMultiplier}
                kitPresetSummaries={kitPresetSummaries}
                quotePasteText={quotePasteText}
                setQuotePasteText={setQuotePasteText}
                inboundBatchLayout={inboundBatchLayout}
                quickCartEnabled={quickCartEnabled}
                lotNo={lotNo}
                setLotNo={setLotNo}
                occurredAt={occurredAt}
                setOccurredAt={setOccurredAt}
                nextLotSuggestion={nextLotSuggestion}
                lastManualMovement={lastManualMovement}
                quantity={quantity}
                setQuantity={setQuantity}
                fromLocation={fromLocation}
                setFromLocation={setFromLocation}
                toLocation={toLocation}
                setToLocation={setToLocation}
                sampleSource={sampleSource}
                sampleCustomer={sampleCustomer}
                setSampleCustomer={setSampleCustomer}
                sampleUnitSelection={sampleUnitSelection}
                sampleLoanNeed={sampleLoanNeed}
                sampleLoanPool={sampleLoanPool}
                draftQuantityNumber={draftQuantityNumber}
                sampleReturnNeed={sampleReturnNeed}
                sampleReturnPool={sampleReturnPool}
                availabilityWarning={availabilityWarning}
                status={status}
                setStatus={setStatus}
                fifoPreview={fifoPreview}
                inboundDraftWarnings={inboundDraftWarnings}
                unitPrice={unitPrice}
                setUnitPrice={setUnitPrice}
                amountUsd={amountUsd}
                setAmountUsd={setAmountUsd}
                amountCny={amountCny}
                setAmountCny={setAmountCny}
                storageLocation={storageLocation}
                setStorageLocation={setStorageLocation}
                importer={importer}
                setImporter={setImporter}
                serialsText={serialsText}
                setSerialsText={setSerialsText}
                owner={owner}
                setOwner={setOwner}
                referenceNo={referenceNo}
                setReferenceNo={setReferenceNo}
                memo={memo}
                setMemo={setMemo}
                lotOptions={lotOptions}
                historyCustomers={historyCustomers}
                stayOpenAfterSave={stayOpenAfterSave}
                requestCloseSheet={requestCloseSheet}
                submitMovement={submitMovement}
                trapTab={trapTab}
                applyPreset={applyPreset}
                exitDetailView={exitDetailView}
                enterDetailView={enterDetailView}
                duplicateLastMovement={duplicateLastMovement}
                selectMovementAxis={selectMovementAxis}
                selectOutboundMode={selectOutboundMode}
                adjustQuantity={adjustQuantity}
                applySampleSource={applySampleSource}
                toggleSampleUnit={toggleSampleUnit}
                addDraftToQuickCart={addDraftToQuickCart}
                addKitPresetToCart={addKitPresetToCart}
                importQuoteLinesToCart={importQuoteLinesToCart}
                copyLatestInboundLotToCart={copyLatestInboundLotToCart}
                toggleQuickCartLinePlanned={toggleQuickCartLinePlanned}
                removeQuickCartItem={removeQuickCartItem}
                clearQuickCart={clearQuickCart}
                submitQuickCart={submitQuickCart}
                previewFifoForDraft={previewFifoForDraft}
                toggleStayOpenAfterSave={toggleStayOpenAfterSave}
              />
            )}
            </AnimatePresence>

            {activeTab === "history" && (
            <HistoryTabPanel
              activePanelId={activePanelId}
              activeTabId={activeTabId}
              reduceMotion={reduceMotion}
              data={data}
              search={search}
              setSearch={setSearch}
              setMovementsPage={setMovementsPage}
              filtersExpanded={filtersExpanded}
              setFiltersExpanded={setFiltersExpanded}
              advancedHistoryFilterCount={advancedHistoryFilterCount}
              hasHistoryFilter={hasHistoryFilter}
              resetHistoryFilters={resetHistoryFilters}
              activeHistoryFilterChips={activeHistoryFilterChips}
              filteredMovements={filteredMovements}
              historyType={historyType}
              setHistoryType={setHistoryType}
              historySort={historySort}
              setHistorySort={setHistorySort}
              historyStatus={historyStatus}
              setHistoryStatus={setHistoryStatus}
              includeVoided={includeVoided}
              voidedState={{ ...voidedState, count: voidedMovements?.length ?? null }}
              retryVoided={() => void loadVoidedMovements()}
              setIncludeVoided={setIncludeVoided}
              saleTypeFilter={saleTypeFilter}
              setSaleTypeFilter={setSaleTypeFilter}
              productFilter={productFilter}
              setProductFilter={setProductFilter}
              historyDateFrom={historyDateFrom}
              setHistoryDateFrom={setHistoryDateFrom}
              historyDateTo={historyDateTo}
              setHistoryDateTo={setHistoryDateTo}
              historyLots={historyLots}
              lotFilter={lotFilter}
              setLotFilter={setLotFilter}
              historyCustomers={historyCustomers}
              customerFilter={customerFilter}
              setCustomerFilter={setCustomerFilter}
              setCustomerDetail={setCustomerDetail}
              logGroups={logGroups}
              pageLogGroupKeys={pageLogGroupKeys}
              toggleAllPageLogGroups={toggleAllPageLogGroups}
              allPageGroupsExpanded={allPageGroupsExpanded}
              logGroupsPagination={logGroupsPagination}
              expandedLogGroups={expandedLogGroups}
              setDetailId={setDetailId}
              toggleLogGroup={toggleLogGroup}
              renderMovementRow={renderMovementRow}
              loadingMoreHistory={loadingMoreHistory}
              loadMoreHistoryError={loadMoreHistoryError}
              loadMoreHistory={loadMoreHistory}
            />
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
        canFinalize={canFinalize}
        editMovement={editMovement}
        voidMovement={voidMovement}
      />

      <CustomerHistorySheet
        customerHistory={customerHistory}
        setCustomerDetail={setCustomerDetail}
        setDetailId={setDetailId}
        reduceMotion={reduceMotion}
        onDrillDown={(customer) => {
          returnToCustomerRef.current = customer
        }}
      />

      <SampleUnitSheet
        unit={selectedSampleUnit}
        onClose={() => {
          setSampleUnitSheetId(null)
          setLinkedUnitCode(null)
        }}
        onChanged={loadSampleUnits}
        reduceMotion={reduceMotion}
      />

      {inboundSheet.open && (
        <InboundSheet
          open={inboundSheet.open}
          onClose={() => setInboundSheet({ open: false, product: null })}
          initialProduct={inboundSheet.product}
          initialLot={inboundSheet.lot ?? null}
          onUncertainFailure={() => void refresh()}
          items={data?.items ?? []}
          movements={data?.movements ?? []}
          activeItemIds={inboundActiveItemIds}
          lotStaleNote={inboundLotStaleNote}
          // VIEWER 는 저장 시 서버가 403 으로 막는다 — 대시보드에 편집 권한 플래그가 없어 입력 UI 는 열어 둔다(빠른 기록과 같은 관례).
          canWrite={canWriteHardware}
          owner={owner.trim() || data?.viewer?.name || null}
          onSaved={(result) => {
            const sampleNote =
              result.registeredSampleUnits > 0 ? ` · 사무실 샘플 유닛 ${formatNumber(result.registeredSampleUnits)}대 등록` : ""
            const failNote = result.failedLines > 0 ? ` · ${formatNumber(result.failedLines)}줄은 시트에 남아 있습니다` : ""
            setNotice(
              `${result.lot} 입고 ${formatNumber(result.savedLines)}줄 ${formatNumber(result.savedUnits)}대를 저장했습니다${sampleNote}${failNote}.`
            )
            void refresh()
            if (result.registeredSampleUnits > 0) void loadSampleUnits()
          }}
        />
      )}

      {/* 예정 출고를 선택 중이면 숨긴다 — 이 버튼(fixed bottom-6 right-6)이 하단 일괄 작업 바의
          "선택 확정" 버튼을 덮는다(1440px 실측). 선택 중엔 그 바가 이 화면의 주 작업면이다. */}
      {!sheetOpen && !inboundSheet.open && !pendingMovement && !voidTarget && !detailId && !customerDetail && !sampleUnitSheetId && !linkedUnitCode && plannedSelectionCount === 0 && (
        <button
          type="button"
          onClick={openFreshSheet}
          className="fixed bottom-6 right-6 z-30 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#084734] px-4 py-3 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition hover:bg-[#065c41] hover:shadow-[0_4px_14px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8] active:scale-95 motion-reduce:active:scale-100"
          aria-label="빠른 기록 열기 (단축키 o)"
          data-hardware-fab="true"
          title="빠른 기록 (o) · 입고표 (i)"
          style={{ bottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))" }}
        >
          <Plus className="h-4 w-4" />
          빠른 기록
        </button>
      )}

      {/* 가져오기 확인(하드웨어 라운드 2 S-3) — 원장의 시트 이관분을 교체하고 시트가 다시 실은 어드민 확정을
          취소하는 동작이라 한 번 묻는다. 업로드(window.confirm)·복원(모달)과 같은 층위. */}
      <DeleteConfirmDialog
        open={importConfirmOpen}
        onClose={() => setImportConfirmOpen(false)}
        onConfirm={() => void importSheet()}
        loading={busy === "import"}
        destructive={false}
        title="시트 싱크·백업 후 가져오기"
        description={importConfirmCopy.description}
        irreversibleNote={importConfirmCopy.warning ?? undefined}
        confirmLabel="백업 후 가져오기"
        confirmLoadingLabel="싱크·백업 중"
        cancelLabel="취소"
      />

      {voidTarget && (
        <VoidConfirmModal
          voidTarget={voidTarget}
          voidingId={voidingId}
          setVoidTarget={setVoidTarget}
          voidReason={voidReason}
          setVoidReason={setVoidReason}
          confirmVoid={confirmVoid}
          voidError={voidError}
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
