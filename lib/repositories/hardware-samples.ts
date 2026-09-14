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

export const SAMPLE_UNIT_STATUSES = ["office", "loaned", "repair", "converted", "retired"] as const
export type SampleUnitStatus = (typeof SAMPLE_UNIT_STATUSES)[number]

export const SAMPLE_EVENT_TYPES = ["assign", "loan", "return", "repair", "convert", "adjust", "memo", "retire"] as const
export type SampleEventType = (typeof SAMPLE_EVENT_TYPES)[number]

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
  createdBy?: string | null
}

const MAX_UNITS_PER_REGISTER = 60

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

// 상태 전이 규약 — 유효하지 않은 전이는 저장 전에 사람이 읽을 수 있는 에러로 막는다.
const EVENT_TRANSITIONS: Record<Exclude<SampleEventType, "assign">, { from: SampleUnitStatus[]; to: SampleUnitStatus | null }> = {
  loan: { from: ["office", "repair"], to: "loaned" },
  return: { from: ["loaned"], to: "office" },
  repair: { from: ["office", "loaned"], to: "repair" },
  convert: { from: ["loaned", "office"], to: "converted" },
  retire: { from: ["office", "loaned", "repair"], to: "retired" },
  adjust: { from: [...SAMPLE_UNIT_STATUSES], to: null },
  memo: { from: [...SAMPLE_UNIT_STATUSES], to: null },
}

const EVENT_LABEL: Record<Exclude<SampleEventType, "assign">, string> = {
  loan: "대여",
  return: "반환",
  repair: "수리",
  convert: "판매 전환",
  retire: "폐기",
  adjust: "정정",
  memo: "메모",
}

export async function recordSampleUnitEvents(input: RecordSampleEventInput): Promise<HardwareSampleUnit[]> {
  const unitIds = Array.from(new Set(input.unitIds.map((id) => id.trim()).filter(Boolean)))
  if (unitIds.length === 0) throw new Error("대상 유닛을 선택하세요.")
  if (unitIds.length > MAX_UNITS_PER_REGISTER) throw new Error(`한 번에 최대 ${MAX_UNITS_PER_REGISTER}대까지 처리할 수 있습니다.`)
  const transition = EVENT_TRANSITIONS[input.eventType]
  if (!transition) throw new Error("이벤트 유형이 올바르지 않습니다.")
  const customer = input.customer?.trim() || null
  if (input.eventType === "loan" && !customer) throw new Error("대여 기록에는 고객명이 필요합니다.")
  if (input.eventType === "memo" && !input.memo?.trim()) throw new Error("메모 내용을 입력하세요.")
  const occurredAt = input.occurredAt ?? new Date().toISOString().slice(0, 10)

  const sb = createSupabaseAdminClient()
  const { data: unitsData, error: unitsError } = await sb
    .from("hardware_sample_units")
    .select("*")
    .in("id", unitIds)
  if (unitsError) throw unitsError
  const units = (unitsData ?? []) as HardwareSampleUnit[]
  if (units.length !== unitIds.length) throw new Error("일부 유닛을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.")

  for (const unit of units) {
    if (!transition.from.includes(unit.status)) {
      throw new Error(
        `${unit.asset_code}은(는) 현재 상태에서 ${EVENT_LABEL[input.eventType]} 처리할 수 없습니다.`
      )
    }
  }

  const events = units.map((unit) => ({
    unit_id: unit.id,
    event_type: input.eventType,
    occurred_at: occurredAt,
    customer: customer ?? (input.eventType === "return" ? unit.current_customer : null),
    from_location:
      input.eventType === "loan" ? "사무실" : input.eventType === "return" ? unit.current_customer ?? "고객" : null,
    to_location: input.eventType === "loan" ? customer : input.eventType === "return" ? "사무실" : null,
    memo: input.memo?.trim() || null,
    movement_ref: input.movementRef ?? null,
    created_by: input.createdBy ?? null,
  }))
  const eventsRes = await sb.from("hardware_sample_events").insert(events)
  if (eventsRes.error) throw eventsRes.error
  // 이벤트는 memo 등 상태 무변 케이스를 포함해 이 지점 이후 항상 기록된 것이므로, 아래
  // 패치 분기와 무관하게 여기서 한 번만 무효화한다. {expire:0}인 이유는 registerSampleUnits와
  // 같다 — 저장 직후 같은 탭이 목록/타임라인을 다시 그린다.
  revalidateTag(HARDWARE_SAMPLES_CACHE_TAG, { expire: 0 })

  // 상태 반영 — memo는 상태 무변, adjust는 전달된 필드만 패치.
  const patch: Record<string, unknown> = {}
  if (transition.to) patch.status = transition.to
  if (input.eventType === "loan") {
    patch.current_customer = customer
    patch.loaned_at = occurredAt
    patch.expected_return_at = input.expectedReturnAt ?? null
  }
  if (input.eventType === "return") {
    patch.current_customer = null
    patch.loaned_at = null
    patch.expected_return_at = null
  }
  if (input.eventType === "adjust") {
    if (customer) patch.current_customer = customer
    if (input.serialNo !== undefined) patch.serial_no = input.serialNo?.trim() || null
    if (input.expectedReturnAt !== undefined) patch.expected_return_at = input.expectedReturnAt
  }
  if (input.owner !== undefined && input.owner !== null) patch.current_owner = input.owner.trim() || null

  if (Object.keys(patch).length > 0) {
    const updateRes = await sb.from("hardware_sample_units").update(patch).in("id", unitIds).select("*")
    if (updateRes.error) throw updateRes.error
    return (updateRes.data ?? []) as HardwareSampleUnit[]
  }
  return units
}
