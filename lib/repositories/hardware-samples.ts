import "server-only"

import { revalidateTag, unstable_cache } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { shareInFlight, shareInFlightByArgs } from "@/lib/server/share-in-flight"

// 샘플 개체(유닛) 트래킹 저장소 — 원장(hardware_movements)은 수량의 진실로 유지하고,
// 유닛은 그 위의 생애 레이어다. movement 연결은 soft 참조(movement_ref)만 둔다
// (시트 가져오기가 원장을 교체하므로 FK 금지 — supabase/migrations/20260727_hardware_sample_tracking.sql).
//
// admin-performance-round3-2026-09-10.md §3.3 — 이 저장소는 app/api/admin/hardware/
// samples/route.ts 전용이고(다른 소비처 없음), GET 경로에 캐시가 전혀 없어 콜드 1.1초였다.
// 쓰기(등록/이벤트기록)는 저장 직후 같은 화면에서 바로 재조회하므로({expire:0} — 아래
// registerSampleUnits/recordSampleUnitEvents) 다음 조회가 반드시 새 값을 보게 한다.
export const HARDWARE_SAMPLES_CACHE_TAG = "hardware-samples"

// 사무실·샘플 재고 풀(운영자 결정 2026-09-15) — 유닛 기준으로 센다.
//   office   = 사무실 보관 = 가용(대여할 때 여기서 고른다)
//   showroom = 전시·사내 사용(쇼룸·KC인증 등) = 사무실이 보유하지만 가용 아님
//   loaned   = 대여 = 나간 샘플
// showroom·showcase·store 는 supabase/migrations/20260915_hardware_sample_showroom_status.sql 적용 뒤에만
// DB check 를 통과한다. 적용 전에는 check 위반(23514)을 SAMPLE_SHOWROOM_SCHEMA_PENDING_MESSAGE 로 바꾼다.
export const SAMPLE_UNIT_STATUSES = ["office", "showroom", "loaned", "repair", "converted", "retired"] as const
export type SampleUnitStatus = (typeof SAMPLE_UNIT_STATUSES)[number]

export const SAMPLE_EVENT_TYPES = [
  "assign",
  "loan",
  "return",
  "showcase",
  "store",
  "repair",
  "convert",
  "adjust",
  "memo",
  "retire",
] as const
export type SampleEventType = (typeof SAMPLE_EVENT_TYPES)[number]

export const SAMPLE_SHOWROOM_SCHEMA_PENDING_MESSAGE = "전시 상태는 DB 업데이트 적용 후 사용할 수 있습니다."

// 규칙 위반(입력 누락·허용되지 않는 전이·DB 제약 미적용)을 읽을 수 있는 문구와 HTTP 상태로 싣는다.
// 샘플 라우트가 status 를 그대로 응답한다. plain Error 는 toErrorResponse 정규식에 걸리지 않으면 500 이었다.
export class SampleUnitRuleError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "SampleUnitRuleError"
    this.status = status
  }
}

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

export interface RegisterSampleUnitsInput {
  itemId?: string | null
  productName: string
  count: number
  status?: Extract<SampleUnitStatus, "office" | "loaned">
  customer?: string | null
  owner?: string | null
  occurredAt?: string | null
  memo?: string | null
  movementRef?: string | null
  createdBy?: string | null
}

export interface RecordSampleEventInput {
  unitIds: string[]
  eventType: Exclude<SampleEventType, "assign">
  occurredAt?: string | null
  customer?: string | null
  owner?: string | null
  memo?: string | null
  serialNo?: string | null
  expectedReturnAt?: string | null
  movementRef?: string | null
  // adjust(정정) 전용 — 운영 데이터 정리용 상태 정정. 주면 그 상태로 바꾸고 사유 메모를 필수로 한다.
  // 없으면 기존처럼 상태를 바꾸지 않는다(고객·시리얼·회수 예정일만 고친다).
  nextStatus?: SampleUnitStatus | null
  createdBy?: string | null
}

const MAX_UNITS_PER_REGISTER = 60

// 이벤트 from·to 위치 표기 — assign·loan·return 이 써 온 관례를 따른다.
// 사무실 보관·전시는 둘 다 물리적으로 사무실에 있으므로 "사무실", 대여는 고객명이다.
const OFFICE_LOCATION = "사무실"
const REPAIR_LOCATION = "수리"
const UNKNOWN_CUSTOMER = "고객 미상"

// 관리번호 접두 — 제품명에서 짧은 코드를 뽑는다. "(promoted)" 변형은 본체와 같은 풀로 취급하지
// 않고 P 접미로 구분한다(재고 위치 맵과 같은 원칙 — 승격분은 별도 트래킹).
export function sampleAssetPrefix(productName: string): string {
  const promoted = /\(promoted\)/i.test(productName)
  const cleaned = productName.replace(/\(promoted\)/gi, "").replace(/[^0-9A-Za-z]/g, "").toUpperCase()
  const digits = /^(\d{2,3})/.exec(cleaned)?.[1]
  const base = digits ?? (cleaned.slice(0, 4) || "HW")
  return promoted ? `${base}P` : base
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function nextSeqFromCodes(codes: string[], prefix: string): number {
  let max = 0
  const pattern = new RegExp(`^S-${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`)
  for (const code of codes) {
    const match = pattern.exec(code)
    if (!match) continue
    const seq = Number(match[1])
    if (Number.isFinite(seq) && seq > max) max = seq
  }
  return max + 1
}

async function listSampleUnitsUncached(): Promise<{
  units: HardwareSampleUnit[]
  latestEvents: Record<string, HardwareSampleEvent>
}> {
  const sb = createSupabaseAdminClient()
  const [unitsRes, eventsRes] = await Promise.all([
    sb
      .from("hardware_sample_units")
      .select("*")
      .order("asset_code", { ascending: true }),
    // 목록 프리뷰용 최근 이벤트 — 유닛 수십 대 규모라 최근 400건이면 유닛당 최신 1건을 충분히 덮는다.
    sb
      .from("hardware_sample_events")
      .select("*")
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(400),
  ])
  if (unitsRes.error) throw unitsRes.error
  if (eventsRes.error) throw eventsRes.error

  const latestEvents: Record<string, HardwareSampleEvent> = {}
  for (const event of (eventsRes.data ?? []) as HardwareSampleEvent[]) {
    if (!latestEvents[event.unit_id]) latestEvents[event.unit_id] = event
  }
  return { units: (unitsRes.data ?? []) as HardwareSampleUnit[], latestEvents }
}

async function listSampleUnitEventsUncached(unitId: string): Promise<HardwareSampleEvent[]> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("hardware_sample_events")
    .select("*")
    .eq("unit_id", unitId)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300)
  if (error) throw error
  return (data ?? []) as HardwareSampleEvent[]
}

// 목록(units+latestEvents)은 인자가 없어 shareInFlight, 유닛별 타임라인은 unitId가 캐시
// 키에 들어가야 하므로 shareInFlightByArgs를 쓴다. 둘 다 콜드 인스턴스의 동시 미스를
// 합치고 dev·test에서 JSON 안전성을 검사한다. 60초는 이 저장소가 쓰이는 다른 admin
// 목록 캐시(compass-ads·branch-kpi 등)와 같은 기본값이고, 쓰기 쪽이 {expire:0}으로 즉시
// 하드 만료하므로 "아무 일도 없을 때의 상한"일 뿐이다.
export const listSampleUnits = unstable_cache(
  () => shareInFlight("hardware-samples-list-v1", listSampleUnitsUncached),
  ["hardware-samples-list-v1"],
  { revalidate: 60, tags: [HARDWARE_SAMPLES_CACHE_TAG] }
)

export const listSampleUnitEvents = unstable_cache(
  shareInFlightByArgs("hardware-samples-events-v1", listSampleUnitEventsUncached),
  ["hardware-samples-events-v1"],
  { revalidate: 60, tags: [HARDWARE_SAMPLES_CACHE_TAG] }
)

// 유닛 등록(채번) — 배정(창고→사무실) 저장·백필 초기 등록에서 쓴다. status=loaned로 바로
// 등록하면(백필: 이미 나가있는 샘플) assign 이벤트의 도착지가 고객으로 남는다.
export async function registerSampleUnits(input: RegisterSampleUnitsInput): Promise<HardwareSampleUnit[]> {
  const count = Math.floor(input.count)
  if (!Number.isFinite(count) || count <= 0) throw new Error("등록 수량은 1 이상이어야 합니다.")
  if (count > MAX_UNITS_PER_REGISTER) throw new Error(`한 번에 최대 ${MAX_UNITS_PER_REGISTER}대까지 등록할 수 있습니다.`)
  const productName = input.productName.trim()
  if (!productName) throw new Error("제품명은 필수입니다.")
  const status: SampleUnitStatus = input.status ?? "office"
  const customer = input.customer?.trim() || null
  const occurredAt = input.occurredAt ?? new Date().toISOString().slice(0, 10)

  const sb = createSupabaseAdminClient()
  const prefix = sampleAssetPrefix(productName)
  const { data: existing, error: existingError } = await sb
    .from("hardware_sample_units")
    .select("asset_code")
    .like("asset_code", `S-${prefix}-%`)
  if (existingError) throw existingError

  let seq = nextSeqFromCodes((existing ?? []).map((row) => (row as { asset_code: string }).asset_code), prefix)

  // 동시 채번 레이스는 unique 제약이 잡는다 — 충돌 시 시퀀스를 밀고 재시도(어드민 단독 사용 전제의 보수 가드).
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rows = Array.from({ length: count }, (_, index) => ({
      item_id: input.itemId ?? null,
      product_name: productName,
      asset_code: `S-${prefix}-${pad2(seq + index)}`,
      status,
      current_customer: status === "loaned" ? customer ?? "고객 미상" : null,
      current_owner: input.owner?.trim() || null,
      loaned_at: status === "loaned" ? occurredAt : null,
      created_by: input.createdBy ?? null,
    }))
    const inserted = await sb.from("hardware_sample_units").insert(rows).select("*")
    if (!inserted.error) {
      const units = (inserted.data ?? []) as HardwareSampleUnit[]
      const events = units.map((unit) => ({
        unit_id: unit.id,
        event_type: "assign" as const,
        occurred_at: occurredAt,
        customer: status === "loaned" ? unit.current_customer : null,
        from_location: "창고",
        to_location: status === "loaned" ? unit.current_customer ?? "고객 미상" : "사무실",
        memo: input.memo?.trim() || null,
        movement_ref: input.movementRef ?? null,
        created_by: input.createdBy ?? null,
      }))
      const eventsRes = await sb.from("hardware_sample_events").insert(events)
      if (eventsRes.error) throw eventsRes.error
      // 등록 화면은 저장 직후 같은 탭에서 목록을 다시 그린다 — {expire:0}으로 다음 조회가
      // 반드시 새로 채번된 유닛을 보게 한다("max"면 SWR이라 방금 등록한 유닛이 한 번 더
      // 안 보일 수 있다).
      revalidateTag(HARDWARE_SAMPLES_CACHE_TAG, { expire: 0 })
      return units
    }
    if (inserted.error.code !== "23505") throw inserted.error
    seq += count
  }
  throw new Error("관리번호 채번이 반복 충돌했습니다. 다시 시도하세요.")
}

export type RecordableSampleEventType = Exclude<SampleEventType, "assign">

// 상태 전이 규약 — 유효하지 않은 전이는 저장 전에 사람이 읽을 수 있는 에러로 막는다.
// 클라이언트 사전 안내(components/admin/hardware/inventory/office-sample-pool.ts의
// OFFICE_POOL_BULK_ACTION_FROM)는 이 표의 일부를 옮긴 것이다. 최종 판정은 여기서 한다.
export const SAMPLE_EVENT_TRANSITIONS: Readonly<
  Record<RecordableSampleEventType, { from: readonly SampleUnitStatus[]; to: SampleUnitStatus | null }>
> = {
  // showroom 에서 바로 대여는 막는다(resolveSampleEventTarget 이 전용 안내 문구로 거절).
  loan: { from: ["office", "repair"], to: "loaned" },
  return: { from: ["loaned"], to: "office" },
  showcase: { from: ["office"], to: "showroom" },
  store: { from: ["showroom", "repair"], to: "office" },
  repair: { from: ["office", "loaned", "showroom"], to: "repair" },
  convert: { from: ["loaned", "office", "showroom"], to: "converted" },
  retire: { from: ["office", "loaned", "repair", "showroom"], to: "retired" },
  // adjust 는 nextStatus 가 있을 때만 상태를 바꾼다. memo 는 상태를 바꾸지 않는다.
  adjust: { from: SAMPLE_UNIT_STATUSES, to: null },
  memo: { from: SAMPLE_UNIT_STATUSES, to: null },
}

const EVENT_LABEL: Record<RecordableSampleEventType, string> = {
  loan: "대여",
  return: "반환",
  showcase: "전시 전환",
  store: "사무실 보관",
  repair: "수리",
  convert: "판매 전환",
  retire: "폐기",
  adjust: "정정",
  memo: "메모",
}

const STATUS_LABEL: Record<SampleUnitStatus, string> = {
  office: "사무실 보관",
  showroom: "전시·사내 사용",
  loaned: "대여중",
  repair: "수리",
  converted: "판매 전환",
  retired: "폐기",
}

function isRecordableEventType(value: unknown): value is RecordableSampleEventType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SAMPLE_EVENT_TRANSITIONS, value)
}

function isSampleUnitStatus(value: unknown): value is SampleUnitStatus {
  return typeof value === "string" && (SAMPLE_UNIT_STATUSES as readonly string[]).includes(value)
}

// 유닛 하나에 이벤트를 적용했을 때의 도착 상태. 허용되지 않는 전이는 SampleUnitRuleError(409)로 거절한다.
// DB 없이 전이 표 전체를 검증할 수 있게 순수 함수로 둔다.
export function resolveSampleEventTarget(
  unit: Pick<HardwareSampleUnit, "asset_code" | "status">,
  eventType: RecordableSampleEventType,
  nextStatus?: SampleUnitStatus | null
): SampleUnitStatus {
  if (!isRecordableEventType(eventType)) throw new SampleUnitRuleError("이벤트 유형이 올바르지 않습니다.")
  const transition = SAMPLE_EVENT_TRANSITIONS[eventType]
  if (eventType === "loan" && unit.status === "showroom") {
    throw new SampleUnitRuleError(
      `${unit.asset_code}은(는) 전시·사내 사용 중입니다. 전시 중인 유닛은 먼저 사무실 보관으로 옮기세요.`,
      409
    )
  }
  if (!transition.from.includes(unit.status)) {
    const statusLabel = STATUS_LABEL[unit.status] ?? unit.status
    throw new SampleUnitRuleError(
      `${unit.asset_code}은(는) 현재 상태(${statusLabel})에서 ${EVENT_LABEL[eventType]} 처리할 수 없습니다.`,
      409
    )
  }
  if (eventType === "adjust" && nextStatus) return nextStatus
  return transition.to ?? unit.status
}

// 쓰기 전에 끝내는 입력 검증 — DB 를 건드리기 전에 400 으로 거절한다.
function validateRecordEventInput(input: RecordSampleEventInput) {
  const unitIds = Array.from(new Set(input.unitIds.map((id) => id.trim()).filter(Boolean)))
  if (unitIds.length === 0) throw new SampleUnitRuleError("대상 유닛을 선택하세요.")
  if (unitIds.length > MAX_UNITS_PER_REGISTER) {
    throw new SampleUnitRuleError(`한 번에 최대 ${MAX_UNITS_PER_REGISTER}대까지 처리할 수 있습니다.`)
  }
  if (!isRecordableEventType(input.eventType)) throw new SampleUnitRuleError("이벤트 유형이 올바르지 않습니다.")
  const customer = input.customer?.trim() || null
  const memo = input.memo?.trim() || null
  const nextStatus = input.nextStatus ?? null
  if (input.eventType === "loan" && !customer) throw new SampleUnitRuleError("대여 기록에는 고객명이 필요합니다.")
  if (input.eventType === "memo" && !memo) throw new SampleUnitRuleError("메모 내용을 입력하세요.")
  if (nextStatus != null) {
    if (input.eventType !== "adjust") {
      throw new SampleUnitRuleError("상태 정정(nextStatus)은 정정(adjust) 이벤트에서만 쓸 수 있습니다.")
    }
    if (!isSampleUnitStatus(nextStatus)) throw new SampleUnitRuleError("정정할 상태 값이 올바르지 않습니다.")
    // 운영 데이터 정리는 사람이 이유를 남겨야 나중에 되짚을 수 있다.
    if (!memo) throw new SampleUnitRuleError("상태 정정에는 사유 메모가 필요합니다.")
  }
  return { unitIds, customer, memo, nextStatus }
}

function statusLocation(status: SampleUnitStatus, customer: string | null): string | null {
  if (status === "office" || status === "showroom") return OFFICE_LOCATION
  if (status === "loaned") return customer ?? UNKNOWN_CUSTOMER
  if (status === "repair") return REPAIR_LOCATION
  if (status === "converted") return customer
  return null
}

interface SampleEventPlanContext {
  target: SampleUnitStatus
  customer: string | null
  occurredAt: string
  nextStatus: SampleUnitStatus | null
}

// 유닛 행 패치 — 이벤트가 바꾸는 필드만 담는다.
function buildUnitPatch(
  unit: HardwareSampleUnit,
  input: RecordSampleEventInput,
  ctx: SampleEventPlanContext
): Record<string, unknown> {
  const { eventType } = input
  const patch: Record<string, unknown> = {}
  const changesStatus = SAMPLE_EVENT_TRANSITIONS[eventType].to != null || (eventType === "adjust" && ctx.nextStatus != null)
  if (changesStatus) patch.status = ctx.target

  if (eventType === "loan") {
    patch.current_customer = ctx.customer
    patch.loaned_at = ctx.occurredAt
    patch.expected_return_at = input.expectedReturnAt ?? null
  }
  // 사무실로 들어오는 전이(반환·전시·보관)는 대여 흔적을 지운다. 수리에서 돌아온 유닛이 수리 전 고객을
  // 계속 달고 있으면 사무실 풀에서 고객 행으로 잘못 읽힌다.
  if (eventType === "return" || eventType === "showcase" || eventType === "store") {
    patch.current_customer = null
    patch.loaned_at = null
    patch.expected_return_at = null
  }
  if (eventType === "adjust") {
    if (ctx.nextStatus === "office" || ctx.nextStatus === "showroom") {
      patch.current_customer = null
      patch.loaned_at = null
      patch.expected_return_at = null
    } else {
      if (ctx.customer) patch.current_customer = ctx.customer
      if (ctx.nextStatus === "loaned") {
        // register 와 같은 규약 — 대여 유닛의 고객이 비면 "고객 미상"으로 남긴다.
        if (!ctx.customer && !unit.current_customer) patch.current_customer = UNKNOWN_CUSTOMER
        // 이미 대여중이던 유닛은 원래 대여일을 지킨다. 새로 대여로 정정된 유닛만 처리일부터 센다.
        if (unit.status !== "loaned" || !unit.loaned_at) patch.loaned_at = ctx.occurredAt
      }
      if (input.expectedReturnAt !== undefined) patch.expected_return_at = input.expectedReturnAt
    }
    if (input.serialNo !== undefined) patch.serial_no = input.serialNo?.trim() || null
  }
  if (input.owner !== undefined && input.owner !== null) patch.current_owner = input.owner.trim() || null
  return patch
}

// 이벤트 행의 customer·from·to. 기존 assign·loan·return 관례를 따른다(사무실·전시 = "사무실", 대여 = 고객명).
function buildEventRoute(
  unit: HardwareSampleUnit,
  input: RecordSampleEventInput,
  ctx: SampleEventPlanContext
): { customer: string | null; from: string | null; to: string | null } {
  const currentCustomer = unit.current_customer ?? null
  switch (input.eventType) {
    case "loan":
      return { customer: ctx.customer, from: OFFICE_LOCATION, to: ctx.customer }
    case "return":
      return { customer: ctx.customer ?? currentCustomer, from: currentCustomer ?? "고객", to: OFFICE_LOCATION }
    case "showcase":
    case "store":
      return { customer: ctx.customer, from: statusLocation(unit.status, currentCustomer), to: OFFICE_LOCATION }
    case "adjust": {
      if (ctx.nextStatus == null) return { customer: ctx.customer, from: null, to: null }
      const nextCustomer =
        ctx.target === "loaned" || ctx.target === "converted" ? ctx.customer ?? currentCustomer : null
      return {
        customer: ctx.customer,
        from: statusLocation(unit.status, currentCustomer),
        to: statusLocation(ctx.target, nextCustomer),
      }
    }
    default:
      return { customer: ctx.customer, from: null, to: null }
  }
}

// DB check 위반(23514)을 운영자가 읽을 수 있는 문구로 바꾼다. 전시 관련 쓰기에서만 바꾼다 —
// 마이그레이션 20260915 가 적용되기 전에는 showroom·showcase·store 값이 status/event_type check 에 걸린다.
function toSampleWriteError(error: unknown, involvesShowroom: boolean): unknown {
  if (!involvesShowroom || !error || typeof error !== "object") return error
  if ((error as { code?: unknown }).code !== "23514") return error
  return new SampleUnitRuleError(SAMPLE_SHOWROOM_SCHEMA_PENDING_MESSAGE, 409)
}

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

// 이벤트는 들어갔는데 상태 반영이 실패하면 타임라인에 일어나지 않은 전이가 남는다(대표 사례: DB 미적용 상태에서
// adjust → showroom. adjust 이벤트는 통과하고 유닛 status 갱신만 23514 로 막힌다). 이 요청이 방금 넣었고
// 상태 반영까지 못 간 유닛의 이벤트만 되돌린다. 되돌리기가 실패해도 원래 오류를 우선해 올린다.
async function discardUnappliedEvents(
  sb: SupabaseAdminClient,
  insertedEvents: Array<{ id: string; unit_id: string }>,
  appliedUnitIds: Set<string>
) {
  const ids = insertedEvents.filter((event) => !appliedUnitIds.has(event.unit_id)).map((event) => event.id)
  if (ids.length === 0) return
  try {
    const res = await sb.from("hardware_sample_events").delete().in("id", ids)
    if (res.error) console.error("[hardware-samples] 반영 실패 이벤트 되돌리기 실패:", res.error.message)
  } catch (error) {
    console.error("[hardware-samples] 반영 실패 이벤트 되돌리기 실패:", error)
  }
  revalidateTag(HARDWARE_SAMPLES_CACHE_TAG, { expire: 0 })
}

export async function recordSampleUnitEvents(input: RecordSampleEventInput): Promise<HardwareSampleUnit[]> {
  const { unitIds, customer, memo, nextStatus } = validateRecordEventInput(input)
  const occurredAt = input.occurredAt ?? new Date().toISOString().slice(0, 10)

  const sb = createSupabaseAdminClient()
  const { data: unitsData, error: unitsError } = await sb
    .from("hardware_sample_units")
    .select("*")
    .in("id", unitIds)
  if (unitsError) throw unitsError
  const units = (unitsData ?? []) as HardwareSampleUnit[]
  if (units.length !== unitIds.length) {
    throw new SampleUnitRuleError("일부 유닛을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.", 404)
  }

  // 전이 판정은 쓰기 전에 전부 끝낸다 — 한 대라도 막히면 아무것도 기록하지 않는다.
  const plans = units.map((unit) => {
    const target = resolveSampleEventTarget(unit, input.eventType, nextStatus)
    const ctx: SampleEventPlanContext = { target, customer, occurredAt, nextStatus }
    return { unit, target, patch: buildUnitPatch(unit, input, ctx), route: buildEventRoute(unit, input, ctx) }
  })
  const involvesShowroom =
    input.eventType === "showcase" ||
    input.eventType === "store" ||
    plans.some((plan) => plan.target === "showroom" || plan.unit.status === "showroom")

  const events = plans.map(({ unit, route }) => ({
    unit_id: unit.id,
    event_type: input.eventType,
    occurred_at: occurredAt,
    customer: route.customer,
    from_location: route.from,
    to_location: route.to,
    memo,
    movement_ref: input.movementRef ?? null,
    created_by: input.createdBy ?? null,
  }))
  const eventsRes = await sb.from("hardware_sample_events").insert(events).select("id, unit_id")
  if (eventsRes.error) throw toSampleWriteError(eventsRes.error, involvesShowroom)
  // 이벤트는 memo 등 상태 무변 케이스를 포함해 이 지점 이후 항상 기록된 것이므로, 아래
  // 패치 분기와 무관하게 여기서 한 번만 무효화한다. {expire:0}인 이유는 registerSampleUnits와
  // 같다 — 저장 직후 같은 탭이 목록/타임라인을 다시 그린다.
  revalidateTag(HARDWARE_SAMPLES_CACHE_TAG, { expire: 0 })
  const insertedEvents = ((eventsRes.data ?? []) as Array<{ id: string; unit_id: string }>).filter(
    (event) => event && typeof event.id === "string"
  )

  // 상태 반영 — 같은 패치를 받는 유닛끼리 묶어 갱신한다. memo·필드 없는 adjust 는 패치가 비어 건너뛴다.
  // 대부분 한 묶음이고, adjust → loaned 만 "원래 대여중이던 유닛"과 "새로 대여로 정정된 유닛"이 갈린다.
  const groups = new Map<string, { patch: Record<string, unknown>; ids: string[] }>()
  for (const plan of plans) {
    if (Object.keys(plan.patch).length === 0) continue
    const key = JSON.stringify(plan.patch)
    const group = groups.get(key)
    if (group) group.ids.push(plan.unit.id)
    else groups.set(key, { patch: plan.patch, ids: [plan.unit.id] })
  }
  if (groups.size === 0) return units

  const updated: HardwareSampleUnit[] = []
  const appliedUnitIds = new Set<string>()
  try {
    for (const group of groups.values()) {
      const updateRes = await sb.from("hardware_sample_units").update(group.patch).in("id", group.ids).select("*")
      if (updateRes.error) throw updateRes.error
      updated.push(...((updateRes.data ?? []) as HardwareSampleUnit[]))
      for (const id of group.ids) appliedUnitIds.add(id)
    }
  } catch (error) {
    await discardUnappliedEvents(sb, insertedEvents, appliedUnitIds)
    throw toSampleWriteError(error, involvesShowroom)
  }
  return updated
}
