/**
 * checkout-requests-admin.ts — 결제창 무결제 "도입 신청" 어드민 저장소 (Supabase)
 *
 * 마이그레이션: supabase/migrations/20260727_checkout_requests.sql
 *   + _address.sql(설치/배송 주소) + _install_type.sql(설치 유형)
 *
 * 테이블은 RLS deny-all + service_role 전용이라 반드시 createSupabaseAdminClient() 로만
 * 닿는다(anon/authenticated 는 정책이 0개라 어떤 행도 못 본다).
 *
 * 왜 이 파일이 필요한가: 공개 접수(lib/checkout-requests.ts)는 신청 행을 만들고 leads 로
 * 미러링만 한다 — status 는 항상 'new' 로 남는다. 신청 건이 leads 미러링으로만 발견되고
 * 담당자가 응대 상태(new→contacted→scheduled→done|canceled)를 올릴 경로가 없으면 신청은
 * 영원히 미확인으로 남는다. 상태 전이는 여기 한 곳에서만 일어난다.
 * (패턴은 직전에 같은 문제를 푼 lib/repositories/showroom-bookings.ts 를 그대로 따른다.)
 *
 * lib/checkout-requests.ts(공개 접수 경로)는 참고용으로만 읽고 이 파일에서 import 하지
 * 않는다 — 그 파일은 lib/billing/** 을 물고 있고 지금 다른 작업이 동시에 그 경로들을
 * 건드리고 있어, 타입/상수를 여기서 독립적으로 다시 선언해 컴파일 의존을 끊는다.
 * (kind/status 값은 스키마 CHECK 와, currency/품목 모양은 공개 경로의 계약과 같아야 한다.)
 */
import "server-only"

import { addDays } from "@/lib/admin-calendar/range"
import { BUSINESS_UTC_OFFSET } from "@/lib/business-time"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const TABLE = "checkout_requests"

const COLUMNS =
  "id, kind, items, total_amount, currency, org, name, phone, email, install_type, " +
  "address, desired_date, memo, source_page, lead_id, status, created_at, updated_at"

/** 신청 종류 — 마이그레이션 CHECK(kind in ('hardware','software'))와 같은 목록. */
export const CHECKOUT_REQUEST_KINDS = ["hardware", "software"] as const
export type CheckoutRequestKind = (typeof CHECKOUT_REQUEST_KINDS)[number]

export function isCheckoutRequestKind(value: unknown): value is CheckoutRequestKind {
  return typeof value === "string" && (CHECKOUT_REQUEST_KINDS as readonly string[]).includes(value)
}

/**
 * 허용 상태 — 마이그레이션의 CHECK 제약과 같은 목록이어야 한다.
 * 여기서 늘리면 DB 가 거부하고, DB 에서 늘리면 여기서 400 이 난다.
 */
export const CHECKOUT_REQUEST_STATUSES = [
  "new",
  "contacted",
  "scheduled",
  "done",
  "canceled",
] as const

export type CheckoutRequestStatus = (typeof CHECKOUT_REQUEST_STATUSES)[number]

export function isCheckoutRequestStatus(value: unknown): value is CheckoutRequestStatus {
  return (
    typeof value === "string" &&
    (CHECKOUT_REQUEST_STATUSES as readonly string[]).includes(value)
  )
}

/** 품목·합계 통화. currency 컬럼은 DB CHECK 가 없어(앱 계약만) 여기서만 좁혀 쓴다. */
const CHECKOUT_REQUEST_CURRENCIES = ["KRW", "USD"] as const
export type CheckoutRequestCurrency = (typeof CHECKOUT_REQUEST_CURRENCIES)[number]

function isCheckoutRequestCurrency(value: unknown): value is CheckoutRequestCurrency {
  return (
    typeof value === "string" &&
    (CHECKOUT_REQUEST_CURRENCIES as readonly string[]).includes(value)
  )
}

/** 신청 시점 품목 스냅샷 한 줄 — lib/checkout-requests.ts 의 CheckoutRequestItem 과 같은 계약. */
export interface CheckoutRequestItem {
  sku: string
  name: string
  qty: number
  unitAmount: number
  currency: CheckoutRequestCurrency
  lineAmount: number
}

interface CheckoutRequestRow {
  id: string
  kind: CheckoutRequestKind
  /** jsonb — PostgREST 가 파싱은 해 주지만 모양은 보장하지 않는다. toCheckoutRequestItems() 로 검증. */
  items: unknown
  total_amount: number
  currency: CheckoutRequestCurrency
  org: string
  name: string
  phone: string
  email: string | null
  install_type: "stand" | "wall" | null
  address: string | null
  desired_date: string
  memo: string | null
  source_page: string | null
  lead_id: string | null
  status: CheckoutRequestStatus
  created_at: string
  updated_at: string
}

/** 도메인 표기(camelCase). 화면·API 는 snake_case 행을 직접 보지 않는다. */
export interface CheckoutRequestRecord {
  id: string
  kind: CheckoutRequestKind
  items: CheckoutRequestItem[]
  totalAmount: number
  currency: CheckoutRequestCurrency
  org: string
  name: string
  phone: string
  email: string | null
  installType: "stand" | "wall" | null
  address: string | null
  desiredDate: string
  memo: string | null
  sourcePage: string | null
  leadId: string | null
  status: CheckoutRequestStatus
  createdAt: string
  updatedAt: string
}

/**
 * jsonb 품목 한 줄을 검증한다. 저장 경로(lib/checkout-requests.ts)가 항상 이 모양으로
 * 쓰지만, jsonb 는 컬럼 자체에 스키마가 없어 DB 가 모양을 보장하지 않는다 — 수기 insert
 * 나 훗날의 스키마 드리프트로 어그러진 원소가 섞여도 화면이 죽지 않게 방어적으로 거른다.
 * 느슨한 강제 변환(coercion)이 아니라 모양이 틀리면 그 원소만 통째로 버린다 — 부분적으로
 * 잘못된 값(예: qty 가 문자열)을 조용히 숫자로 밀어넣는 쪽이 더 위험하다고 본다.
 */
function toCheckoutRequestItem(value: unknown): CheckoutRequestItem | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>

  const { sku, name, qty, unitAmount, currency, lineAmount } = record
  if (typeof sku !== "string" || typeof name !== "string") return null
  if (typeof qty !== "number" || typeof unitAmount !== "number" || typeof lineAmount !== "number") {
    return null
  }
  if (!isCheckoutRequestCurrency(currency)) return null

  return { sku, name, qty, unitAmount, currency, lineAmount }
}

function toCheckoutRequestItems(value: unknown): CheckoutRequestItem[] {
  if (!Array.isArray(value)) return []
  return value
    .map(toCheckoutRequestItem)
    .filter((item): item is CheckoutRequestItem => item !== null)
}

function toRecord(row: CheckoutRequestRow): CheckoutRequestRecord {
  return {
    id: row.id,
    kind: row.kind,
    items: toCheckoutRequestItems(row.items),
    // numeric 컬럼 — 이 저장소가 닿는 다른 numeric 컬럼들(branch-sales-ledger-drafts.ts 등)과
    // 같은 방어적 관례로 Number() 를 한 번 더 통과시킨다(PostgREST 가 문자열로 돌려줘도 안전).
    totalAmount: Number(row.total_amount),
    currency: row.currency,
    org: row.org,
    name: row.name,
    phone: row.phone,
    email: row.email,
    installType: row.install_type,
    address: row.address,
    desiredDate: row.desired_date,
    memo: row.memo,
    sourcePage: row.source_page,
    leadId: row.lead_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface ListCheckoutRequestsOptions {
  /** 접수일(created_at) 하한(YYYY-MM-DD, 포함, KST 자정 기준) */
  from?: string
  /** 접수일(created_at) 상한(YYYY-MM-DD, 포함, KST 자정 기준) */
  to?: string
  status?: CheckoutRequestStatus
  kind?: CheckoutRequestKind
}

/**
 * 접수일 순 목록(최신 먼저). 필터는 전부 선택이며, 주지 않으면 전량이다.
 *
 * 필터 축 결정: from/to 는 desired_date 가 아니라 created_at 을 거른다.
 * showroom_bookings 의 visit_date 는 실제 방문 슬롯(캘린더 좌표)이라 그 축이 맞았지만,
 * checkout_requests 가 풀어야 하는 문제는 다르다 — "신청이 응대되지 않고 new 에 계속
 * 머문다"는 큐 적체이지, 특정 날짜의 예약을 관리하는 문제가 아니다. desired_date 는
 * 신청 시점에 고객이 적어낸 희망일 스냅샷일 뿐 status 가 scheduled 로 넘어가도 갱신되는
 * 별도 컬럼이 없어(스키마에 confirmed_date 류 컬럼 없음), 담당자가 실제로 처리해야 하는
 * 시점과 어긋날 수 있다. 반면 이 화면이 대신하는 기존 동선인 leads 큐는 created_at 기준
 * 응대 SLA(미응답 24/48h)로 움직인다 — 같은 큐 성격이므로 같은 축을 맞춘다.
 *
 * created_at 은 timestamptz 라 "YYYY-MM-DD" 문자열을 KST 자정 경계로 명시 변환해
 * 비교한다(lib/business-time.ts 와 같은 규칙 — 오프셋 없이 넣으면 UTC 자정으로 해석되어
 * KST 로는 하루가 밀린다). 상한은 배타적 다음날 KST 자정(`< to+1일 00:00 KST`)으로 걸어
 * 그날 09:00~23:59 KST에 들어온 신청을 lte 오차로 놓치지 않는다.
 */
export async function listCheckoutRequests(
  options: ListCheckoutRequestsOptions = {}
): Promise<CheckoutRequestRecord[]> {
  const supabase = createSupabaseAdminClient()

  let query = supabase.from(TABLE).select(COLUMNS).order("created_at", { ascending: false })

  if (options.from) {
    query = query.gte("created_at", `${options.from}T00:00:00${BUSINESS_UTC_OFFSET}`)
  }
  if (options.to) {
    query = query.lt("created_at", `${addDays(options.to, 1)}T00:00:00${BUSINESS_UTC_OFFSET}`)
  }
  if (options.status) query = query.eq("status", options.status)
  if (options.kind) query = query.eq("kind", options.kind)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as CheckoutRequestRow[]).map(toRecord)
}

export async function getCheckoutRequest(id: string): Promise<CheckoutRequestRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? toRecord(data as unknown as CheckoutRequestRow) : null
}

export interface UpdateCheckoutRequestStatusInput {
  status: CheckoutRequestStatus
}

/**
 * 상태 전이. 없는 id 면 null(호출부가 404).
 *
 * assignedTo 를 받지 않는다: showroom_bookings 와 달리 checkout_requests 마이그레이션
 * 3개(20260727_checkout_requests.sql + _address.sql + _install_type.sql) 어디에도
 * 담당자 컬럼이 없다. 없는 컬럼을 update 에 실으면 PostgREST 가 42703 으로 런타임에
 * 깨지므로, 이 저장소는 의도적으로 status 만 다룬다. 담당자 배정이 필요해지면 먼저
 * assigned_to 컬럼을 추가하는 마이그레이션을 만들어야 한다.
 */
export async function updateCheckoutRequestStatus(
  id: string,
  input: UpdateCheckoutRequestStatusInput
): Promise<CheckoutRequestRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: input.status })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? toRecord(data as unknown as CheckoutRequestRow) : null
}
