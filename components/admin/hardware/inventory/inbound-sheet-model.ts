// 한 화면 입고표(InboundSheet) 순수 모델 — React·DOM·네트워크를 쓰지 않는다.
// 화면 컴포넌트는 입력 상태만 들고, 물량번호 추천·후보 목록·붙여넣기 해석·검증·전송 형식은 전부 여기서
// 계산한다(vitest node 환경에서 그대로 검증하기 위해서다).
//
// 날짜는 전부 로컬 날짜 기준이다. toISOString 으로 날짜를 자르면 한국 00~09시에 전날이 된다.

import type { HardwareItem, HardwareMovement, HardwareMovementDraft } from "./shared"
import { shouldSubmitComposerOnKeyDown } from "@/components/admin/cs-chat/composer-keyboard"
import { isCoreIfpProduct, isPromotedProduct } from "@/lib/hardware/product"

// ---------------------------------------------------------------------------
// 상수 — 서버 상한과 운영 기본 후보

// app/api/admin/hardware/movements/route.ts readMovementBodies 의 배치 상한.
export const INBOUND_MAX_LINES = 50
// lib/repositories/hardware-samples.ts MAX_UNITS_PER_REGISTER — 한 번의 등록 요청 상한.
export const SAMPLE_REGISTER_MAX_UNITS = 60

export const OFFICE_STORAGE_LABEL = "클래스인 사무실"
export const CUSTOMER_STORAGE_LABEL = "고객사 직송"
// 보관처가 비었을 때 서버로 보내는 안전값. 비워 보내면 to_location 이 null 이 돼 재고 어디에도 잡히지 않는다.
export const FALLBACK_STORAGE_LABEL = "창고"

// 운영 보관처(2026-09 확인): 오산 창고, 인천 더조은(FPL 창고), 클래스인 본사 사무실, 고객사 직송.
export const DEFAULT_STORAGE_CHOICES: readonly string[] = ["오산 창고", "인천 더조은", OFFICE_STORAGE_LABEL, CUSTOMER_STORAGE_LABEL]
export const DEFAULT_IMPORTER_CHOICES: readonly string[] = ["클래스인", "헥토", "Learnways"]

// ---------------------------------------------------------------------------
// 타입

export type InboundHistoryMovement = Pick<
  HardwareMovement,
  | "item_id"
  | "product_name"
  | "movement_type"
  | "quantity"
  | "occurred_at"
  | "created_at"
  | "lot_no"
  | "reference_no"
  | "source"
  | "voided_at"
  | "unit_price"
  | "storage_location"
  | "importer"
  | "to_location"
>

export interface InboundLotChoice {
  lot: string
  // 그 물량의 가장 이른 입고일 — 칩에 보이는 날짜이자 최신순 정렬 기준.
  firstDate: string | null
  lastDate: string | null
  totalQuantity: number
  productCount: number
}

export interface InboundDraftRow {
  key: string
  // 없으면 새 품목 — 서버가 이름으로 품목을 만든다.
  itemId?: string
  productName: string
  // 입력 원문. 빈 문자열이면 저장 대상이 아니다.
  quantity: string
  unitPrice: string
  // true 면 최근 입고 단가로 미리 채운 값(흐리게 표시). 수정하면 false.
  unitPriceSuggested: boolean
  // "" 이면 기본 보관처를 따른다.
  storage: string
  // 쉼표·공백·줄바꿈 구분 원문.
  serials: string
  // 주요 품목 슬롯 — 삭제하지 않고 수량만 비운다.
  pinned: boolean
}

export interface InboundDraft {
  lot: string
  occurredAt: string
  importer: string
  defaultStorage: string
  owner?: string
  rows: InboundDraftRow[]
}

export interface InboundDraftValidation {
  headerErrors: string[]
  rowErrors: Record<string, string>
  // 저장은 막지 않는 안내(새 품목 생성, 재고 위치로 인식되지 않는 보관처).
  rowWarnings: Record<string, string>
}

export interface InboundDraftSummary {
  productCount: number
  lineCount: number
  units: number
  totalUsd: number
  pricedLines: number
  officeUnits: number
}

// 서버 입력(readMovementInput)과 같은 모양 — HardwareInventoryClient toServerDraft 의 출력 형식과 동일하다.
export type InboundMovementPayload = Omit<HardwareMovementDraft, "isPlanned"> & { movementType: "inbound" }

export interface InboundSubmission {
  // movements[i] 가 어느 행에서 왔는지 — 서버 lineResults[].index 를 행으로 되돌리는 데 쓴다.
  rowKeys: string[]
  movements: InboundMovementPayload[]
}

export interface InboundPasteRow {
  lineNumber: number
  productName: string
  quantity: number
  unitPrice: number | null
  // 단가 칸이 있었는데 읽지 못함 — 표에 넣으면 최근 입고 단가가 대신 들어간다(미리보기가 알린다).
  priceUnreadable?: boolean
  priceText?: string | null
}

export interface InboundPasteUnmatched {
  lineNumber: number
  text: string
  reason: "product" | "quantity"
}

export interface InboundPasteResult {
  rows: InboundPasteRow[]
  unmatched: InboundPasteUnmatched[]
}

export interface InboundCompositionLine {
  itemId?: string
  productName: string
  quantity: number
  unitPrice: number | null
  // "" 이면 기본 보관처를 따른다.
  storage: string
}

export interface InboundLineInput {
  itemId?: string
  productName: string
  quantity: number
  // null·undefined 면 기존 값 유지, 비어 있으면 최근 단가 제안.
  unitPrice?: number | null
  // undefined 면 기존 행의 보관처 유지.
  storage?: string
}

export interface InboundLineResult {
  index: number
  ok: boolean
  error?: string
  movement?: { id?: string | null; item_id?: string | null } | null
}

export interface InboundSavedLine {
  rowKey: string
  itemId?: string
  productName: string
  quantity: number
  storage: string
  movementId?: string
}

export interface InboundSaveOutcome {
  savedLines: InboundSavedLine[]
  failedErrors: Record<string, string>
  savedUnits: number
}

export interface SampleRegisterPayload {
  action: "register"
  itemId?: string
  productName: string
  count: number
  status: "office"
  occurredAt: string
  movementRef?: string
  memo: string
  owner?: string
}

// ---------------------------------------------------------------------------
// 날짜

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function localDateKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function parseDateKey(key: string): { year: number; month: number; day: number } | null {
  const match = DATE_KEY_PATTERN.exec(key.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  // 정오로 만든다 — 자정은 일광절약시간 전환 지역에서 전날로 밀릴 수 있다.
  const probe = new Date(year, month - 1, day, 12)
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return null
  return { year, month, day }
}

export function isValidDateKey(key: string): boolean {
  return parseDateKey(key) != null
}

// 형식이 틀린 키는 그대로 돌려준다(입력 중인 값을 지우지 않기 위해서다).
export function shiftDateKey(key: string, days: number): string {
  const parsed = parseDateKey(key)
  if (!parsed || !Number.isFinite(days)) return key
  return localDateKey(new Date(parsed.year, parsed.month - 1, parsed.day + Math.trunc(days), 12))
}

// "2026-09-08" → "9/8"
export function formatMonthDay(key: string | null | undefined): string {
  const parsed = key ? parseDateKey(key) : null
  return parsed ? `${parsed.month}/${parsed.day}` : "날짜 없음"
}

// 입고 이동의 날짜. 시트 이관 행은 occurred_at 이 없으면 날짜를 모르는 것으로 둔다 — created_at 은 가져오기
// 실행 시각이라 오래된 물량이 "최신"으로 올라온다(lib/repositories/hardware-inventory.ts outboundTrendTime 과 같은 판단).
export function inboundMovementDateKey(movement: Pick<HardwareMovement, "occurred_at" | "created_at" | "source">): string | null {
  const occurred = (movement.occurred_at ?? "").trim()
  if (occurred) {
    const head = occurred.slice(0, 10)
    if (isValidDateKey(head)) return head
  }
  if (movement.source === "admin_manual" && movement.created_at) {
    const created = new Date(movement.created_at)
    if (!Number.isNaN(created.getTime())) return localDateKey(created)
  }
  return null
}

function compareDateDesc(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  return a < b ? 1 : -1
}

// ---------------------------------------------------------------------------
// 물량번호(lot)

// HardwareInventoryClient movementLot · 서버 movementLotKey 와 같은 규칙: 수기 행은 lot_no, 시트 이관 행은 reference_no.
export function inboundMovementLot(movement: Pick<HardwareMovement, "lot_no" | "source" | "reference_no">): string | null {
  const direct = (movement.lot_no ?? "").trim()
  if (direct) return direct
  if (movement.source === "sheet_import") {
    const reference = (movement.reference_no ?? "").trim()
    if (reference) return reference
  }
  return null
}

function isLiveInbound(movement: Pick<HardwareMovement, "movement_type" | "voided_at" | "quantity">): boolean {
  return movement.movement_type === "inbound" && !movement.voided_at && movement.quantity > 0
}

// limit 이 0 이하이거나 유한수가 아니면 전부 돌려준다.
export function buildInboundLotChoices(movements: readonly InboundHistoryMovement[], limit = 6): InboundLotChoice[] {
  const groups = new Map<string, { lot: string; firstDate: string | null; lastDate: string | null; totalQuantity: number; products: Set<string> }>()
  for (const movement of movements) {
    if (!isLiveInbound(movement)) continue
    const lot = inboundMovementLot(movement)
    if (!lot) continue
    let group = groups.get(lot)
    if (!group) {
      group = { lot, firstDate: null, lastDate: null, totalQuantity: 0, products: new Set() }
      groups.set(lot, group)
    }
    group.totalQuantity += movement.quantity
    group.products.add(inboundProductMatchKey(movement.product_name))
    const date = inboundMovementDateKey(movement)
    if (date) {
      if (!group.firstDate || date < group.firstDate) group.firstDate = date
      if (!group.lastDate || date > group.lastDate) group.lastDate = date
    }
  }
  const choices = Array.from(groups.values())
    .map((group) => ({
      lot: group.lot,
      firstDate: group.firstDate,
      lastDate: group.lastDate,
      totalQuantity: group.totalQuantity,
      productCount: group.products.size,
    }))
    .sort(
      (a, b) =>
        compareDateDesc(a.firstDate, b.firstDate) ||
        compareDateDesc(a.lastDate, b.lastDate) ||
        b.lot.localeCompare(a.lot, "ko", { numeric: true })
    )
  return Number.isFinite(limit) && limit > 0 ? choices.slice(0, Math.floor(limit)) : choices
}

const SERIAL_LOT_PATTERN = /^([A-Za-z]+)(\d+)$/
const LOT_CODE_PATTERN = /^([A-Za-z]+)(\d+)/

// 날짜가 가장 최근인 "영문+숫자" 물량의 번호를 올린다(C2 → C3, H8 → H9).
// "H7(과사람)"·"FY24-25"·"Sample" 은 올리기 기준에서 빠지지만, "H7(과사람)" 의 H7 처럼 앞 코드가 이미 쓰인 번호는
// 건너뛴다 — 추천한 번호가 기존 물량과 겹치면 다른 물량에 조용히 섞인다.
export function suggestNextLot(choices: ReadonlyArray<Pick<InboundLotChoice, "lot" | "firstDate" | "lastDate">>): string | null {
  const taken = new Set<string>()
  let latest: { prefix: string; digits: number; number: number; firstDate: string | null; lastDate: string | null } | null = null
  for (const choice of choices) {
    const lot = choice.lot.trim()
    const code = LOT_CODE_PATTERN.exec(lot)
    if (code) taken.add(`${code[1].toUpperCase()}${Number(code[2])}`)
    const match = SERIAL_LOT_PATTERN.exec(lot)
    if (!match) continue
    const candidate = {
      prefix: match[1],
      digits: match[2].length,
      number: Number(match[2]),
      firstDate: choice.firstDate,
      lastDate: choice.lastDate,
    }
    if (
      !latest ||
      (compareDateDesc(candidate.firstDate, latest.firstDate) ||
        compareDateDesc(candidate.lastDate, latest.lastDate) ||
        latest.number - candidate.number) < 0
    ) {
      latest = candidate
    }
  }
  if (!latest) return null
  for (let next = latest.number + 1, guard = 0; guard < 1000; next += 1, guard += 1) {
    if (!taken.has(`${latest.prefix.toUpperCase()}${next}`)) {
      return `${latest.prefix}${String(next).padStart(latest.digits, "0")}`
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// 보관처·수입자 후보

function compactKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "")
}

// 서버 normalizeLocationName 의 사무실 규칙(OFFICE_LOCATION_PATTERN)과 같은 표기 — 클래스인·사무실·ClassIn·office.
const OFFICE_STORAGE_PATTERN = /사무실|office|클래스인|class\s*in/i

export function isOfficeStorage(label: string | null | undefined): boolean {
  const text = (label ?? "").trim()
  return text.length > 0 && OFFICE_STORAGE_PATTERN.test(text)
}

export type InboundStorageKind = "office" | "warehouse" | "customer" | "other"

// 경고 문구 전용 요약 판정이다(저장 판정은 서버 normalizeLocationName). 창고·사무실·고객사로 읽히지 않는 보관처는
// 도착 위치가 그 이름 그대로 저장돼 창고 재고에 잡히지 않는다.
export function inboundStorageKind(label: string | null | undefined): InboundStorageKind | null {
  const text = (label ?? "").trim()
  if (!text) return null
  if (isOfficeStorage(text)) return "office"
  if (/창고|warehouse|인천\s*더조은|\bfpl\b/i.test(text)) return "warehouse"
  if (/^외부\/?고객$|^고객$|고객사|직송/i.test(text)) return "customer"
  return "other"
}

function canonicalStorageLabel(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim()
  if (!text) return null
  const kind = inboundStorageKind(text)
  if (kind === "office") return OFFICE_STORAGE_LABEL
  if (kind === "customer") return CUSTOMER_STORAGE_LABEL
  // 정규화된 위치 이름 "창고" 는 오산·인천 중 어디인지 알 수 없어 후보로 쓰지 않는다.
  if (text === "창고" || text === "샘플" || text === "수리") return null
  return text
}

function canonicalImporterLabel(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim()
  if (!text) return null
  if (/^class\s*in$/i.test(text)) return "클래스인"
  return text
}

function rankHistoryValues(
  movements: readonly InboundHistoryMovement[],
  pick: (movement: InboundHistoryMovement) => string | null
): string[] {
  const stats = new Map<string, { label: string; count: number; lastDate: string | null }>()
  for (const movement of movements) {
    if (!isLiveInbound(movement)) continue
    const label = pick(movement)
    if (!label) continue
    const key = compactKey(label)
    const date = inboundMovementDateKey(movement)
    const current = stats.get(key)
    if (!current) {
      stats.set(key, { label, count: 1, lastDate: date })
      continue
    }
    current.count += 1
    if (date && (!current.lastDate || date > current.lastDate)) current.lastDate = date
  }
  return Array.from(stats.values())
    .sort((a, b) => compareDateDesc(a.lastDate, b.lastDate) || b.count - a.count || a.label.localeCompare(b.label, "ko"))
    .map((entry) => entry.label)
}

function mergeChoices(defaults: readonly string[], history: readonly string[]): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const label of [...defaults, ...history]) {
    const key = compactKey(label)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(label)
  }
  return merged
}

// 보관처 이력은 storage_location 을 먼저 보고, 시트 이관 행처럼 비어 있으면 도착 위치로 대신한다
// (시트의 보관처 "클래스인" 이 도착 위치에 남아 있다). 이력 "클래스인" 은 "클래스인 사무실" 로 합친다.
function storageHistoryLabel(movement: InboundHistoryMovement): string | null {
  return canonicalStorageLabel(movement.storage_location) ?? canonicalStorageLabel(movement.to_location)
}

export function buildStorageChoices(movements: readonly InboundHistoryMovement[]): string[] {
  return mergeChoices(DEFAULT_STORAGE_CHOICES, rankHistoryValues(movements, storageHistoryLabel))
}

export function buildImporterChoices(movements: readonly InboundHistoryMovement[]): string[] {
  return mergeChoices(DEFAULT_IMPORTER_CHOICES, rankHistoryValues(movements, (movement) => canonicalImporterLabel(movement.importer)))
}

// 새 입고표의 기본 수입자 — 가장 최근 입고의 수입자. 이력이 없으면 "".
export function recentInboundImporter(movements: readonly InboundHistoryMovement[]): string {
  return rankHistoryValues(movements, (movement) => canonicalImporterLabel(movement.importer))[0] ?? ""
}

// 새 입고표의 기본 보관처 — 보관처를 명시해 저장한 최근 입고(storage_location)만 본다. 도착 위치 "창고" 로는
// 오산·인천을 가를 수 없어서다. 이력이 없으면 "" (사용자가 한 번 고른다).
export function recentInboundStorage(movements: readonly InboundHistoryMovement[]): string {
  return rankHistoryValues(movements, (movement) => canonicalStorageLabel(movement.storage_location))[0] ?? ""
}

// ---------------------------------------------------------------------------
// 품목 이름·매칭

// 서버 normalizeProductName 과 같은 공백 정리 — 새 품목 이름을 보낼 때 쓴다.
export function normalizeInboundProductName(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

// 붙여넣기·중복 판정용 키. 공백·대소문자·인치 표기(86", 86”, 86inch, 86인치, 86 IFP)만 무시한다.
// 부분 포함은 허용하지 않는다 — "T1" 이 "DT1"·"T1(promoted)" 에 붙으면 다른 품목 재고가 늘어난다.
export function inboundProductMatchKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[”“″〃]/g, '"')
    .replace(/''/g, '"')
    .replace(/\s+/g, "")
    .replace(/(\d)(?:"|inches|inch|인치)/g, '$1"')
    .replace(/(^|\D)(\d{2,3})(?=ifp)/g, '$1$2"')
}

export function matchInboundProductName(text: string, productNames: readonly string[]): string | null {
  const key = inboundProductMatchKey(text)
  if (!key) return null
  const matches = productNames.filter((name) => inboundProductMatchKey(name) === key)
  if (matches.length === 0) return null
  const trimmed = text.trim()
  return matches.find((name) => name.trim() === trimmed) ?? matches[0]
}

export function findInboundItem(items: readonly HardwareItem[], productOrId: string | null | undefined): HardwareItem | null {
  const text = (productOrId ?? "").trim()
  if (!text) return null
  const byId = items.find((item) => item.id === text)
  if (byId) return byId
  const name = matchInboundProductName(text, items.map((item) => item.name))
  return name ? items.find((item) => item.name === name) ?? null : null
}

// 주요 품목 순서(운영 확정): 86" IFP → 75" IFP → STD1 → T1 → S1. 판촉형(promoted)은 주요 품목이 아니다.
const FEATURED_INBOUND_RULES: ReadonlyArray<(name: string) => boolean> = [
  (name) => isCoreIfpProduct(name, "86") && !isPromotedProduct(name),
  (name) => isCoreIfpProduct(name, "75") && !isPromotedProduct(name),
  (name) => /^STD1$/i.test(name.trim()),
  (name) => /^T1$/i.test(name.trim()),
  (name) => /^S1$/i.test(name.trim()),
]

export function featuredInboundRank(productName: string): number | null {
  const index = FEATURED_INBOUND_RULES.findIndex((rule) => rule(productName))
  return index === -1 ? null : index
}

// "품목 추가" 목록의 그룹 — 판촉형과 액세서리(터치펜·OPS·케이블·브라켓 등)는 "판촉·기타" 로 접는다.
export function inboundPickerGroup(productName: string): "main" | "promoEtc" {
  if (isPromotedProduct(productName)) return "promoEtc"
  if (/IFP/i.test(productName) || /^(?:T1|S1|STD1|STDM1)\b/i.test(productName.trim())) return "main"
  return "promoEtc"
}

// ---------------------------------------------------------------------------
// 단가·이전 구성

// 키: inboundProductMatchKey(제품명). 조회는 lookupLastUnitPrice 로 한다.
export function lastUnitPriceByProduct(movements: readonly InboundHistoryMovement[]): Record<string, number> {
  const best = new Map<string, { price: number; date: string | null }>()
  for (const movement of movements) {
    if (!isLiveInbound(movement)) continue
    const price = movement.unit_price
    // 0 원 입고(판촉·무상 물량)는 단가 기준이 아니다.
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) continue
    const key = inboundProductMatchKey(movement.product_name)
    const date = inboundMovementDateKey(movement)
    const current = best.get(key)
    if (!current || compareDateDesc(date, current.date) < 0) best.set(key, { price, date })
  }
  const result: Record<string, number> = {}
  for (const [key, entry] of best) result[key] = entry.price
  return result
}

export function lookupLastUnitPrice(prices: Readonly<Record<string, number>>, productName: string): number | null {
  const price = prices[inboundProductMatchKey(productName)]
  return typeof price === "number" ? price : null
}

// 지정 물량(없으면 날짜가 가장 최근인 물량)의 품목 구성. 같은 품목·단가·보관처는 한 줄로 합친다.
// 보관처는 storage_location, 없으면 도착 위치에서 사무실·고객사만 되살린다. "창고" 는 기본 보관처를 따른다("").
export function previousLotComposition(movements: readonly InboundHistoryMovement[], lot?: string | null): InboundCompositionLine[] {
  const target = (lot ?? "").trim() || buildInboundLotChoices(movements, 0)[0]?.lot
  if (!target) return []
  const lines = new Map<string, InboundCompositionLine>()
  for (const movement of movements) {
    if (!isLiveInbound(movement) || inboundMovementLot(movement) !== target) continue
    const storage = storageHistoryLabel(movement) ?? ""
    const unitPrice = typeof movement.unit_price === "number" && Number.isFinite(movement.unit_price) ? movement.unit_price : null
    const key = [inboundProductMatchKey(movement.product_name), unitPrice ?? "", compactKey(storage)].join(" ")
    const current = lines.get(key)
    if (current) {
      current.quantity += movement.quantity
      continue
    }
    lines.set(key, {
      ...(movement.item_id ? { itemId: movement.item_id } : {}),
      productName: movement.product_name,
      quantity: movement.quantity,
      unitPrice,
      storage,
    })
  }
  const rankOf = (line: InboundCompositionLine) => featuredInboundRank(line.productName) ?? FEATURED_INBOUND_RULES.length
  return Array.from(lines.values()).sort((a, b) => rankOf(a) - rankOf(b) || a.productName.localeCompare(b.productName, "ko"))
}

// ---------------------------------------------------------------------------
// 숫자

// 전각 숫자(`４０`)·단위(`40대`)도 받는다(하드웨어 라운드 2 I-13) — 붙여넣기는 이미 단위를 떼고 읽었는데 직접 입력은 거부했다.
export function parseInboundQuantity(text: string): number | null {
  const cleaned = text
    .normalize("NFKC")
    .trim()
    .replace(/\s*(?:대|개|ea|pcs)$/i, "")
    .replace(/,(?=\d{3}(?!\d))/g, "")
  if (!/^\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) && value >= 1 ? value : null
}

// "2,500"·"$2,500.00"·"2500 USD" 를 허용한다. 음수·문자는 null.
export function parseInboundPrice(text: string): number | null {
  const cleaned = text
    .normalize("NFKC")
    .trim()
    .replace(/^(?:us)?\$\s*/i, "")
    .replace(/\s*(?:usd|달러)$/i, "")
    .replace(/,(?=\d{3}(?!\d))/g, "")
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value >= 0 ? value : null
}

// 소수 둘째 자리 반올림. 부동소수 오차(1.005 × 100 = 100.49999…)를 지수 표기로 피한다.
export function roundUsd(value: number): number {
  if (!Number.isFinite(value)) return 0
  const text = String(value)
  if (/e/i.test(text)) return Math.round(value * 100) / 100
  return Number(`${Math.round(Number(`${text}e2`))}e-2`)
}

export function splitInboundSerials(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// 붙여넣기

const HEADER_PRODUCT_PATTERN = /^(?:품목|제품|품명|모델|product|item|name)$/i
const HEADER_QUANTITY_PATTERN = /^(?:수량|대수|qty|quantity)$/i

function isNumericCell(cell: string): boolean {
  return parseInboundPrice(cell) != null
}

function stripQuantityDecorations(token: string): string {
  return token.trim().replace(/^[x×*]\s*/i, "").replace(/\s*(?:대|개|ea|pcs)$/i, "")
}

function splitPasteLine(line: string): { productText: string; quantityText: string; priceText: string } {
  const text = line.replace(/ /g, " ")
  if (text.includes("\t") || text.includes(",")) {
    // 공백 뒤의 천 단위 숫자("2,500")는 쉼표 구분자가 아니다. 쉼표 바로 뒤 숫자("T1,100,470")는 구분자로 둔다.
    // 쉼표+공백 구분(`86" IFP, 1,200, 2,500`)의 천 단위도 보호한다(I-9) — 예전엔 뒤에 공백·끝만 봐서 1대 · $200으로 읽혔다.
    const protectedText = text.includes("\t") ? text : text.replace(/(^|\s)(\d{1,3}(?:,\d{3})+(?:\.\d+)?)(?=\s|$|,\s)/g, (_, lead: string, number: string) => `${lead}${number.replace(/,/g, "")}`)
    const separator = text.includes("\t") ? "\t" : ","
    if (separator === "\t" || protectedText.includes(",")) {
      const cells = protectedText.split(separator).map((cell) => cell.trim())
      // 앞쪽 빈 칸·행 번호는 건너뛴다.
      let productIndex = 0
      while (productIndex < cells.length && (!cells[productIndex] || isNumericCell(cells[productIndex]))) productIndex += 1
      return {
        productText: cells[productIndex] ?? "",
        quantityText: stripQuantityDecorations(cells[productIndex + 1] ?? ""),
        priceText: cells[productIndex + 2] ?? "",
      }
    }
    return splitWhitespaceLine(protectedText)
  }
  return splitWhitespaceLine(text)
}

function splitWhitespaceLine(text: string): { productText: string; quantityText: string; priceText: string } {
  const tokens = text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !/^(?:\$|usd|달러)$/i.test(token))
  let firstNumeric = tokens.length
  while (firstNumeric > 0 && isNumericCell(stripQuantityDecorations(tokens[firstNumeric - 1]))) firstNumeric -= 1
  return {
    productText: tokens.slice(0, firstNumeric).join(" "),
    quantityText: stripQuantityDecorations(tokens[firstNumeric] ?? ""),
    priceText: tokens[firstNumeric + 1] ?? "",
  }
}

// 엑셀·메모 붙여넣기 — 한 줄에 "품목 수량 [단가]". 탭·쉼표·공백 구분을 받는다.
export function parseInboundPaste(text: string, productNames: readonly string[]): InboundPasteResult {
  const rows: InboundPasteRow[] = []
  const unmatched: InboundPasteUnmatched[] = []
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (!line) return
    const lineNumber = index + 1
    const { productText, quantityText, priceText } = splitPasteLine(line)
    const quantity = parseInboundQuantity(quantityText)
    // 머리글 줄("품목 수량 단가")은 조용히 건너뛴다.
    const firstWord = productText.split(/\s+/)[0] ?? ""
    if (HEADER_QUANTITY_PATTERN.test(quantityText) || (quantity == null && HEADER_PRODUCT_PATTERN.test(firstWord))) return
    const productName = productText ? matchInboundProductName(productText, productNames) : null
    if (!productName) {
      unmatched.push({ lineNumber, text: line, reason: "product" })
      return
    }
    if (quantity == null) {
      unmatched.push({ lineNumber, text: line, reason: "quantity" })
      return
    }
    const unitPrice = priceText ? parseInboundPrice(priceText) : null
    // 단가 칸이 있는데 못 읽었으면(`2500원`·`¥17,500`) 조용히 최근 단가로 대체되지 않게 표시한다(I-4).
    const priceUnreadable = Boolean(priceText.trim()) && unitPrice == null
    rows.push({ lineNumber, productName, quantity, unitPrice, ...(priceUnreadable ? { priceUnreadable, priceText: priceText.trim() } : {}) })
  })
  return { rows, unmatched }
}

// ---------------------------------------------------------------------------
// 행 만들기·반영

export function createInboundRow(input: {
  key: string
  itemId?: string
  productName: string
  lastPrices?: Readonly<Record<string, number>>
  pinned?: boolean
}): InboundDraftRow {
  const suggested = input.lastPrices ? lookupLastUnitPrice(input.lastPrices, input.productName) : null
  return {
    key: input.key,
    ...(input.itemId ? { itemId: input.itemId } : {}),
    productName: input.productName,
    quantity: "",
    unitPrice: suggested != null ? String(suggested) : "",
    unitPriceSuggested: suggested != null,
    storage: "",
    serials: "",
    pinned: input.pinned ?? false,
  }
}

// 주요 품목 슬롯 — 활성 품목에서 규칙별 첫 품목. activeItemIds 가 없으면 전부 활성으로 본다.
export function buildFeaturedInboundRows(
  items: readonly HardwareItem[],
  options: { activeItemIds?: readonly string[] | null; lastPrices?: Readonly<Record<string, number>> } = {}
): InboundDraftRow[] {
  const active = options.activeItemIds ? new Set(options.activeItemIds) : null
  const rows: InboundDraftRow[] = []
  FEATURED_INBOUND_RULES.forEach((rule) => {
    const item = items.find((candidate) => (!active || active.has(candidate.id)) && rule(candidate.name))
    if (!item || rows.some((row) => row.itemId === item.id)) return
    rows.push(createInboundRow({ key: `featured:${item.id}`, itemId: item.id, productName: item.name, lastPrices: options.lastPrices, pinned: true }))
  })
  return rows
}

function sameProduct(row: Pick<InboundDraftRow, "itemId" | "productName">, itemId: string | undefined, productName: string): boolean {
  if (row.itemId && itemId) return row.itemId === itemId
  return inboundProductMatchKey(row.productName) === inboundProductMatchKey(productName)
}

// 구성 불러오기·붙여넣기 반영. 같은 품목 행이 있으면 그 행의 수량(과 준 값)을 덮어쓰고, 없으면 행을 더한다.
// 한 번의 반영에서 같은 품목 줄이 둘이면 두 번째 줄은 새 행이 된다. 반영하지 않은 행은 그대로 둔다.
export function applyLinesToRows(
  rows: readonly InboundDraftRow[],
  lines: readonly InboundLineInput[],
  options: { items: readonly HardwareItem[]; lastPrices?: Readonly<Record<string, number>>; makeKey: () => string }
): InboundDraftRow[] {
  const next = rows.map((row) => ({ ...row }))
  const claimed = new Set<string>()
  for (const line of lines) {
    const item = line.itemId
      ? options.items.find((candidate) => candidate.id === line.itemId) ?? null
      : findInboundItem(options.items, line.productName)
    const itemId = item?.id ?? line.itemId
    const productName = item?.name ?? normalizeInboundProductName(line.productName)
    if (!productName) continue
    const target = next.find((row) => !claimed.has(row.key) && sameProduct(row, itemId, productName))
    const row = target ?? createInboundRow({ key: options.makeKey(), itemId, productName, lastPrices: options.lastPrices })
    if (!target) next.push(row)
    claimed.add(row.key)
    row.quantity = String(line.quantity)
    if (line.unitPrice != null && Number.isFinite(line.unitPrice) && line.unitPrice >= 0) {
      row.unitPrice = String(line.unitPrice)
      row.unitPriceSuggested = false
    }
    if (line.storage !== undefined) row.storage = line.storage
  }
  return next
}

// ---------------------------------------------------------------------------
// 검증·요약·전송

export function effectiveInboundStorage(row: Pick<InboundDraftRow, "storage">, defaultStorage: string): string {
  return row.storage.trim() || defaultStorage.trim()
}

function activeRows(draft: InboundDraft): InboundDraftRow[] {
  return draft.rows.filter((row) => row.quantity.trim() !== "")
}

export function validateInboundDraft(draft: InboundDraft): InboundDraftValidation {
  const headerErrors: string[] = []
  const rowErrors: Record<string, string> = {}
  const rowWarnings: Record<string, string> = {}

  if (!draft.lot.trim()) headerErrors.push("물량번호를 정하세요.")
  if (!isValidDateKey(draft.occurredAt)) headerErrors.push("입고일을 YYYY-MM-DD 형식으로 입력하세요.")

  const lines = activeRows(draft)
  if (lines.length === 0) headerErrors.push("수량을 입력한 품목이 없습니다.")
  if (lines.length > INBOUND_MAX_LINES) headerErrors.push(`한 번에 최대 ${INBOUND_MAX_LINES}줄까지 저장할 수 있습니다.`)

  let missingStorage = false
  for (const row of lines) {
    const quantity = parseInboundQuantity(row.quantity)
    if (!normalizeInboundProductName(row.productName)) {
      rowErrors[row.key] = "품목 이름이 비어 있습니다."
    } else if (quantity == null) {
      rowErrors[row.key] = "수량은 1 이상 정수로 입력하세요."
    } else if (row.unitPrice.trim() && parseInboundPrice(row.unitPrice) == null) {
      rowErrors[row.key] = "단가는 0 이상 숫자로 입력하세요."
    } else {
      const serialCount = splitInboundSerials(row.serials).length
      if (serialCount > 0 && serialCount !== quantity) {
        rowErrors[row.key] = `시리얼 ${serialCount}개와 수량 ${quantity}대가 다릅니다.`
      }
    }

    const storage = effectiveInboundStorage(row, draft.defaultStorage)
    if (!storage) {
      missingStorage = true
    } else if (inboundStorageKind(storage) === "other") {
      rowWarnings[row.key] = `"${storage}"은(는) 창고·사무실·고객사로 인식되지 않아 창고 재고에 잡히지 않습니다.`
    }
    if (!row.itemId && !rowWarnings[row.key]) rowWarnings[row.key] = "새 품목 — 저장하면 품목이 새로 만들어집니다."
  }
  if (missingStorage) headerErrors.push("기본 보관처를 고르거나 행마다 보관처를 정하세요.")

  return { headerErrors, rowErrors, rowWarnings }
}

export function summarizeInboundDraft(draft: InboundDraft): InboundDraftSummary {
  const products = new Set<string>()
  let lineCount = 0
  let units = 0
  let totalUsd = 0
  let pricedLines = 0
  let officeUnits = 0
  for (const row of activeRows(draft)) {
    const quantity = parseInboundQuantity(row.quantity)
    if (quantity == null) continue
    lineCount += 1
    units += quantity
    products.add(row.itemId ?? inboundProductMatchKey(row.productName))
    const price = row.unitPrice.trim() ? parseInboundPrice(row.unitPrice) : null
    if (price != null) {
      totalUsd += roundUsd(quantity * price)
      pricedLines += 1
    }
    if (isOfficeStorage(effectiveInboundStorage(row, draft.defaultStorage))) officeUnits += quantity
  }
  return { productCount: products.size, lineCount, units, totalUsd: roundUsd(totalUsd), pricedLines, officeUnits }
}

export function inboundRowAmount(row: Pick<InboundDraftRow, "quantity" | "unitPrice">): number | null {
  const quantity = parseInboundQuantity(row.quantity)
  const price = row.unitPrice.trim() ? parseInboundPrice(row.unitPrice) : null
  return quantity != null && price != null ? roundUsd(quantity * price) : null
}

// 수기 입고는 toLocation 이 재고 위치를 정하고 storageLocation 은 라벨로 남는다 — 보관처 라벨을 양쪽에 싣는다.
export function buildInboundSubmission(draft: InboundDraft): InboundSubmission {
  const rowKeys: string[] = []
  const movements: InboundMovementPayload[] = []
  const lot = draft.lot.trim()
  const importer = draft.importer.trim()
  const owner = (draft.owner ?? "").trim()
  for (const row of activeRows(draft)) {
    const quantity = parseInboundQuantity(row.quantity)
    const productName = normalizeInboundProductName(row.productName)
    if (quantity == null || !productName) continue
    const unitPrice = row.unitPrice.trim() ? parseInboundPrice(row.unitPrice) : null
    const storage = effectiveInboundStorage(row, draft.defaultStorage) || FALLBACK_STORAGE_LABEL
    rowKeys.push(row.key)
    movements.push({
      ...(row.itemId ? { itemId: row.itemId } : {}),
      productName,
      movementType: "inbound",
      quantity,
      occurredAt: draft.occurredAt,
      fromLocation: "",
      toLocation: storage,
      owner,
      status: "입고",
      referenceNo: "",
      memo: "",
      lotNo: lot,
      unitPrice,
      amountUsd: unitPrice != null ? roundUsd(quantity * unitPrice) : null,
      amountCny: null,
      storageLocation: storage,
      importer,
      serials: splitInboundSerials(row.serials),
    })
  }
  return { rowKeys, movements }
}

export function buildInboundMovements(draft: InboundDraft): InboundMovementPayload[] {
  return buildInboundSubmission(draft).movements
}

// 서버 lineResults(index 기준)를 행으로 되돌린다. 결과가 빠진 줄은 실패로 본다(성공으로 숨기지 않는다).
export function resolveInboundSaveOutcome(submission: InboundSubmission, lineResults: readonly InboundLineResult[]): InboundSaveOutcome {
  const byIndex = new Map(lineResults.map((line) => [line.index, line]))
  const savedLines: InboundSavedLine[] = []
  const failedErrors: Record<string, string> = {}
  let savedUnits = 0
  submission.movements.forEach((movement, index) => {
    const rowKey = submission.rowKeys[index]
    const result = byIndex.get(index)
    if (!result?.ok) {
      failedErrors[rowKey] = result?.error?.trim() || (result ? "저장에 실패했습니다." : "서버 응답에 이 줄의 결과가 없습니다.")
      return
    }
    savedUnits += movement.quantity
    const itemId = result.movement?.item_id ?? movement.itemId
    const movementId = result.movement?.id ?? undefined
    savedLines.push({
      rowKey,
      ...(itemId ? { itemId } : {}),
      productName: movement.productName,
      quantity: movement.quantity,
      storage: movement.storageLocation,
      ...(movementId ? { movementId } : {}),
    })
  })
  return { savedLines, failedErrors, savedUnits }
}

// 사무실 보관으로 저장된 줄을 샘플 유닛 등록 요청으로 바꾼다(줄마다, 서버 상한 60대씩 나눔).
export function buildSampleRegisterPayloads(
  lines: readonly InboundSavedLine[],
  context: { lot: string; occurredAt: string; owner?: string | null }
): SampleRegisterPayload[] {
  const payloads: SampleRegisterPayload[] = []
  const owner = (context.owner ?? "").trim()
  const memo = [context.lot.trim() ? `${context.lot.trim()} 입고` : "입고", "사무실 보관분 자동 등록"].join(" · ")
  for (const line of lines) {
    if (!isOfficeStorage(line.storage)) continue
    for (let remaining = line.quantity; remaining > 0; remaining -= SAMPLE_REGISTER_MAX_UNITS) {
      payloads.push({
        action: "register",
        ...(line.itemId ? { itemId: line.itemId } : {}),
        productName: line.productName,
        count: Math.min(SAMPLE_REGISTER_MAX_UNITS, remaining),
        status: "office",
        occurredAt: context.occurredAt,
        ...(line.movementId ? { movementRef: line.movementId } : {}),
        memo,
        ...(owner ? { owner } : {}),
      })
    }
  }
  return payloads
}

// ---------------------------------------------------------------------------
// 키보드

// 수량·단가 칸의 Enter 의도. 한글 조합 중 Enter 는 무시한다(cs-chat 컴포저와 같은 IME 판정).
export function inboundGridKeyIntent(event: {
  key: string
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  isComposing: boolean
  keyCode: number
}): "save" | "next" | "previous" | null {
  if (event.key !== "Enter") return null
  const imeIdle = shouldSubmitComposerOnKeyDown({ key: "Enter", shiftKey: false, isComposing: event.isComposing, keyCode: event.keyCode })
  if (!imeIdle) return null
  if (event.metaKey || event.ctrlKey) return "save"
  return event.shiftKey ? "previous" : "next"
}
