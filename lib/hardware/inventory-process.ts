// 하드웨어 재고관리 프로세스 정의서(2026-10-27) 규칙 — 서버 검증·화면·판매대시보드·알림이 같은 규칙을 쓴다.
// 결정과 구현 계약: docs/active/hardware-inventory-process-gap-2026-10-28.md §6·§7.
// 순수 함수만 둔다(DB·Next 의존 없음) — 클라이언트 컴포넌트도 import 할 수 있다.

// ── 출고 유형 ───────────────────────────────────────────────────────────────────
export const HARDWARE_OUTBOUND_TYPES = ["sales", "promotion", "as", "sample"] as const
export type HardwareOutboundType = (typeof HARDWARE_OUTBOUND_TYPES)[number]

export const HARDWARE_OUTBOUND_TYPE_LABELS: Record<HardwareOutboundType, string> = {
  sales: "세일즈",
  promotion: "프로모션",
  as: "A/S",
  sample: "샘플",
}

export function isHardwareOutboundType(value: unknown): value is HardwareOutboundType {
  return typeof value === "string" && (HARDWARE_OUTBOUND_TYPES as readonly string[]).includes(value)
}

/** 판매대시보드가 세는 유형 — 세일즈 + 프로모션(A/S·샘플 제외). */
export const SALES_COUNTED_OUTBOUND_TYPES: readonly HardwareOutboundType[] = ["sales", "promotion"]

// ── 진행 상태(고정 3종) ─────────────────────────────────────────────────────────
// 원장 status 칸은 자유 텍스트였다. 새 어드민 기록은 아래 셋만 쓴다. 예정 판정 정규식(예정|예약|대기|planned)은
// 시트 가져오기 행 때문에 그대로 둔다 — "배송 예정"은 그 정규식에도 걸린다.
export const HARDWARE_PROGRESS_STATUS = {
  planned: "배송 예정",
  installed: "설치 완료",
  returned: "회수",
} as const
export type HardwareProgressStatus = (typeof HARDWARE_PROGRESS_STATUS)[keyof typeof HARDWARE_PROGRESS_STATUS]

const PLANNED_STATUS_PATTERN = /예정|예약|대기|planned/i

/** 시트·어드민 공통 예정 판정 — 저장소 isPlannedStatus 와 같은 규칙. */
export function isPlannedProgressStatus(status: string | null | undefined): boolean {
  return PLANNED_STATUS_PATTERN.test(status ?? "")
}

// ── 보고 묶음(판매대시보드 고정 행) ───────────────────────────────────────────────
export const HARDWARE_REPORT_GROUPS = ["board", "camera", "stand", "accessory", "pen"] as const
export type HardwareReportGroup = (typeof HARDWARE_REPORT_GROUPS)[number]

export const HARDWARE_REPORT_GROUP_LABELS: Record<HardwareReportGroup, string> = {
  board: "전자칠판",
  camera: "카메라",
  stand: "스탠드",
  accessory: "액세서리",
  pen: "터치펜",
}

/** 판매대시보드가 0대여도 늘 보이는 묶음(정의서: 전자칠판·카메라·스탠드 고정 행). */
export const HARDWARE_FIXED_REPORT_GROUPS: readonly HardwareReportGroup[] = ["board", "camera", "stand"]

// ── 시트 행의 유형 추정 ───────────────────────────────────────────────────────────
// 시트 가져오기 행은 outbound_type 칸이 비어 있다. 시트 "유형" 열은 memo 앞머리("유형 · 비고")와
// raw.values[11] 에 남는다. 새 칸이 비어 있으면 이 텍스트로 추정한다(추정 실패 = null).
const SAMPLE_TEXT = /샘플|대여|데모|demo|sample/i
const AS_TEXT = /a\s*\/\s*s|(?:^|[^a-z])as(?:$|[^a-z])|교체|불량|rma|수리(?!\s*(?:학원|논술))/i
const PROMOTION_TEXT = /프로모|promo|판촉|증정|무상|무료/i
const SALES_TEXT = /세일즈|판매|sales|매출|납품/i

export function inferOutboundTypeFromText(...values: Array<string | null | undefined>): HardwareOutboundType | null {
  const text = values.filter((value): value is string => typeof value === "string" && value.trim() !== "").join(" ")
  if (!text) return null
  if (SAMPLE_TEXT.test(text)) return "sample"
  if (AS_TEXT.test(text)) return "as"
  if (PROMOTION_TEXT.test(text)) return "promotion"
  if (SALES_TEXT.test(text)) return "sales"
  return null
}

function sheetTypeCell(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const values = (raw as { values?: unknown }).values
  if (!Array.isArray(values)) return null
  const cell = values[11]
  return typeof cell === "string" ? cell : null
}

export interface OutboundTypeSource {
  movement_type: string
  outbound_type?: string | null
  memo?: string | null
  status?: string | null
  to_location?: string | null
  raw?: unknown
}

/**
 * 출고·회수 행의 유형. 칸이 채워져 있으면 그 값, 비어 있으면(시트 행·이전 어드민 행) 시트 유형 열 →
 * 메모 → 상태 → 도착지 순서로 추정한다. 끝까지 모르면 null — 판매대시보드는 null 을 세일즈로 센다
 * (§6 D10: 시트 판매대시보드가 유형 없는 출고를 판매로 세어 왔다).
 */
export function resolveOutboundType(movement: OutboundTypeSource): HardwareOutboundType | null {
  if (movement.movement_type !== "outbound" && movement.movement_type !== "return") return null
  if (isHardwareOutboundType(movement.outbound_type)) return movement.outbound_type
  return inferOutboundTypeFromText(sheetTypeCell(movement.raw), movement.memo, movement.status, movement.to_location)
}

// ── 권한·소유 ───────────────────────────────────────────────────────────────────
/** 입고관리 권한 — 입고·재고 조정·남의 출고 수정·실현 기록 수정·취소. */
export const HARDWARE_INBOUND_CAPABILITY = "hardware.inbound"

export interface HardwareActor {
  userId: string | null
  name: string | null
  /** 입고관리 권한자(hardware.inbound 또는 hardware.finalize 보유, 또는 슈퍼 어드민). */
  isInventoryManager: boolean
}

export interface OwnedMovement {
  source: string
  owner?: string | null
  owner_user_id?: string | null
  created_by?: string | null
  created_by_user_id?: string | null
}

function sameName(a: string | null | undefined, b: string | null | undefined) {
  const left = (a ?? "").replace(/\s+/g, "").toLowerCase()
  const right = (b ?? "").replace(/\s+/g, "").toLowerCase()
  return left !== "" && left === right
}

/**
 * 본인 건인가. 계정 id 가 있으면 그것만 본다. 새 칸이 생기기 전 어드민 기록(계정 id 없음)은
 * 담당자·작성자 이름이 로그인 이름과 같을 때 본인 건으로 본다. 시트 가져오기 행은 누구의 건도 아니다.
 */
export function isOwnMovement(movement: OwnedMovement, actor: Pick<HardwareActor, "userId" | "name">): boolean {
  if (movement.source !== "admin_manual") return false
  const ownerUserId = movement.owner_user_id ?? null
  const creatorUserId = movement.created_by_user_id ?? null
  if (ownerUserId || creatorUserId) {
    return Boolean(actor.userId) && (ownerUserId === actor.userId || creatorUserId === actor.userId)
  }
  return sameName(movement.owner, actor.name) || sameName(movement.created_by, actor.name)
}

export type MovementAction = "edit_planned" | "confirm" | "edit_actual" | "void_planned" | "void_actual"

/**
 * 동작 권한 — 정의서 §권한 + §6 D2.
 * - 배송 예정 수정·확정·취소: 본인 건 또는 입고관리 권한자
 * - 실현 기록(설치 완료·회수·입고·조정) 수정·취소: 입고관리 권한자
 */
export function canActOnMovement(action: MovementAction, movement: OwnedMovement, actor: HardwareActor): boolean {
  if (actor.isInventoryManager) return true
  if (action === "edit_actual" || action === "void_actual") return false
  return isOwnMovement(movement, actor)
}

// ── 물류번호(로트) ──────────────────────────────────────────────────────────────
/** 신규 물류번호 형식 — 수입일 순 C1·C2·C3… (정의서). 기존 H·FY 번호는 그대로 쓴다. */
export const NEW_LOT_PATTERN = /^C(\d+)$/i

/** 다음 신규 물류번호. 기존 번호 중 가장 큰 C 번호 + 1 (없으면 C1). */
export function nextLotNo(existing: readonly (string | null | undefined)[]): string {
  let max = 0
  for (const lot of existing) {
    const match = NEW_LOT_PATTERN.exec((lot ?? "").trim())
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `C${max + 1}`
}

export interface LotRemaining {
  lotNo: string
  remaining: number
}

export class LotRuleError extends Error {}

/**
 * 물류번호 관리 품목의 출고(배송 예정 포함) 검사 — 물류번호를 직접 골라야 하고, 잔여를 넘으면 막는다.
 * remaining 은 저장소 resolveHardwareLotBalances 가 낸 잔여(배송 예정까지 뺀 값 — §6 D6 "가용 기준")다.
 */
export function assertLotSelectable(input: {
  productName: string
  lotTracked: boolean
  lotNo: string | null | undefined
  quantity: number
  lots: readonly LotRemaining[]
}): string | null {
  const lotNo = input.lotNo?.trim() || null
  if (!input.lotTracked) return lotNo
  if (!lotNo) {
    throw new LotRuleError(`${input.productName}은(는) 물류번호를 골라야 합니다.`)
  }
  const remaining = input.lots.find((lot) => lot.lotNo === lotNo)?.remaining ?? 0
  if (remaining < input.quantity) {
    throw new LotRuleError(
      `${input.productName} ${lotNo} 잔여는 ${remaining}대입니다(요청 ${input.quantity}대). 다른 물류번호를 고르거나 수량을 나누세요.`
    )
  }
  return lotNo
}

// ── 회수 ───────────────────────────────────────────────────────────────────────
/** 원 출고 건에서 아직 회수하지 않은 수량. */
export function returnableQuantity(original: { quantity: number }, returnedQuantities: readonly number[]): number {
  const returned = returnedQuantities.reduce((sum, quantity) => sum + quantity, 0)
  return Math.max(0, original.quantity - returned)
}

// ── 알림 기준 ───────────────────────────────────────────────────────────────────
/** 배송 예정이 이 일수를 넘기면 담당자에게 알린다(§6 D9). */
export const PLANNED_STALE_DAYS = 30

/**
 * 배송 예정 경과 기준일 — 예정일이 있으면 예정일, 없으면 등록일(§6 D9).
 * 지금 화면 배지는 날짜 없는 예정을 0일로 세서 영영 안 걸렸다.
 */
export function plannedAgeBasis(movement: { occurred_at: string | null; created_at: string }): string {
  return movement.occurred_at ?? movement.created_at
}

export function plannedAgeDays(movement: { occurred_at: string | null; created_at: string }, now: Date): number {
  const basis = new Date(plannedAgeBasis(movement)).getTime()
  if (!Number.isFinite(basis)) return 0
  return Math.max(0, Math.floor((now.getTime() - basis) / 86_400_000))
}
