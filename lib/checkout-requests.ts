/**
 * checkout-requests — 결제창 "무결제 신청(도입 신청)" 파이프라인.
 *
 * 흐름(불변식):
 *  ① 구조화 신청 행(checkout_requests) 저장이 1순위 — 이게 실패해야만 500 이다.
 *  ② WeCom ops 알림은 신청당 정확히 1건(checkout.request_created). 리드 미러링이
 *     만드는 lead.created 알림은 suppressLeadCreatedNotification 로 끈다.
 *  ③ 같은 신청을 leads 로 미러링해 어드민 리드 큐(기존 동선)에서 발견되게 한다.
 *     source=contact_page 라서 응대 SLA(미응답 24/48h) 집계에도 그대로 올라탄다.
 *  ④ 리드 미러링·알림은 전부 best-effort — 실패해도 신청 저장은 성공으로 남는다.
 *
 * 저장 이후 작업(리드 미러 → lead_id 링크 → 알림)은 deferTask(after())로 응답 뒤에
 * 돌린다. 사용자는 신청 행이 남는 즉시 성공을 받는다.
 */

import "server-only"

import { getBusinessDateParts } from "@/lib/business-time"
import { HARDWARE_CURRENCY, getHardwareItem } from "@/lib/billing/hardware-catalog"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import type { NotificationChannel } from "@/lib/notifications/types"
import { submitLeadCapture } from "@/lib/server/lead-capture"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const CHECKOUT_REQUEST_KINDS = ["hardware", "software"] as const
export type CheckoutRequestKind = (typeof CHECKOUT_REQUEST_KINDS)[number]

export const CHECKOUT_REQUEST_CURRENCIES = ["KRW", "USD"] as const
export type CheckoutRequestCurrency = (typeof CHECKOUT_REQUEST_CURRENCIES)[number]

const KIND_LABEL: Record<CheckoutRequestKind, string> = {
  hardware: "하드웨어",
  software: "소프트웨어",
}

const CURRENCY_SYMBOL: Record<CheckoutRequestCurrency, string> = {
  KRW: "₩",
  USD: "$",
}

const MIN_ITEMS = 1
const MAX_ITEMS = 20
const MIN_QTY = 1
const MAX_QTY = 99

/** 소프트웨어 주문 라인 sku 접두사 — 구독형/충전형 패널이 만드는 라인만 통과시킨다. */
const SOFTWARE_SKU_PREFIX = "sw-"

/**
 * 소프트웨어 단가 상한(원/달러). 하드웨어와 달리 서버가 카탈로그 값으로 핀할 수 없다 —
 * 충전형 Business 는 고객이 직접 입력한 원화 충전액이고 구독형은 계정 수 × 실시간 환율이라
 * 금액이 매 요청 달라지기 때문이다.
 * 따라서 소프트웨어 라인만 상한 클램프로 numeric 범위·장난 입력을 흡수한다(거부 아님).
 * 이 값은 lib/billing/recharge 의 BUSINESS_RECHARGE.maxKrw 와 같은 수를 유지한다 —
 * 충전형 상한을 올리려면 두 곳을 함께 올려야 신청 금액이 잘리지 않는다.
 * 한계: 이 상한을 넘는 라인은 합계가 상한으로 줄어든 채 접수된다
 * (원 금액은 라인 이름에 남아 있어 담당자가 상담에서 바로잡을 수 있다).
 */
const MAX_SOFTWARE_UNIT_AMOUNT = 50_000_000

const MAX_ORG_LENGTH = 200
const MAX_ADDRESS_LENGTH = 200
const MAX_NAME_LENGTH = 200
const MAX_PHONE_LENGTH = 40
const MAX_EMAIL_LENGTH = 254
const MAX_MEMO_LENGTH = 2000
const MAX_SOURCE_PAGE_LENGTH = 500
const MAX_ITEM_NAME_LENGTH = 200
const MAX_SKU_LENGTH = 120

// TLD 2자 이상 강제 — lead-capture 와 같은 기준(가짜 이메일 차단)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

// WeCom 텍스트에 그대로 펼칠 품목 줄 수. 넘치면 "외 N건"으로 접는다.
const NOTIFICATION_ITEM_LINE_LIMIT = 10

/**
 * 희망 날짜 계약 — 프론트 캘린더(components/checkout/request-date.ts)와 같은 진실.
 * 하한: KST 기준 내일부터(당일 설치 약속은 하지 않는다).
 * 상한: 오늘 + 365일. 프론트 캘린더(180일)보다 넓게 잡아, UI 범위를 조정해도
 * 서버가 곧바로 400 을 내지 않게 한다(프론트 범위 ⊂ 서버 범위).
 */
export const MIN_DESIRED_DATE_ADVANCE_DAYS = 1
export const MAX_DESIRED_DATE_ADVANCE_DAYS = 365

// 신청 1건 = ops 방 알림 1건. in_app 은 emitNotificationEvent 가 항상 만든다.
const NOTIFICATION_CHANNELS: NotificationChannel[] = ["wecom_webhook"]

/**
 * 같은 신청의 더블 클릭/재시도를 흡수하는 인스턴스 메모리 창(서버리스 인스턴스별 독립).
 *
 * 한계(수용): 동시 요청이 서로 다른 인스턴스로 갈라지면 Map 이 공유되지 않아 흡수되지 않는다.
 * DB 유니크 제약이나 분산 락을 붙이지 않은 이유는 이 경로가 저볼륨 문의 퍼널이라
 * 최악의 결과가 "위컴 알림 1건 중복"이기 때문이다(결제·과금 부작용 없음).
 */
const DUPLICATE_WINDOW_MS = 60_000

export interface CheckoutRequestItem {
  /** 하드웨어는 카탈로그 sku, 소프트웨어는 'sw-' 접두 sku. 둘 다 필수다. */
  sku: string
  name: string
  qty: number
  unitAmount: number
  currency: CheckoutRequestCurrency
  /** 서버가 재계산한 줄 금액(unitAmount × qty). 클라이언트 값은 신뢰하지 않는다. */
  lineAmount: number
}

export interface NormalizedCheckoutRequest {
  kind: CheckoutRequestKind
  items: CheckoutRequestItem[]
  /** 통화별 소계 — 혼합 통화 신청을 손실 없이 표기하기 위한 값. */
  totals: Array<{ currency: CheckoutRequestCurrency; amount: number }>
  /** 대표 통화(소계가 가장 큰 통화)의 합계. checkout_requests.total_amount 에 저장. */
  totalAmount: number
  currency: CheckoutRequestCurrency
  org: string
  name: string
  phone: string
  email: string | null
  /** 설치/배송 주소 — 하드웨어 신청만 필수(장비가 실제로 가는 곳), 소프트웨어는 null. */
  address: string | null
  desiredDate: string
  memo: string | null
  sourcePage: string | null
}

export type CheckoutRequestValidation =
  | { ok: true; value: NormalizedCheckoutRequest }
  | { ok: false; field?: string }

export type CheckoutRequestResult =
  | { status: 200; body: { ok: true; requestId: string } }
  | { status: 400; body: { ok: false; error: "validation"; field?: string } }
  | { status: 500; body: { ok: false } }

export interface CheckoutRequestContext {
  /** Next.js after() 처럼 응답 이후로 미루는 훅. 없으면 floating promise 로 돈다. */
  deferTask?: (task: () => Promise<void>) => void
}

/* ─── 정규화 · 검증 (순수) ─── */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null
  const trimmed = value.replace(/\s+/g, " ").trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

/** 줄바꿈을 보존해야 하는 자유 입력(메모)용. */
function normalizeMultilineText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function roundAmount(amount: number, currency: CheckoutRequestCurrency) {
  // KRW 는 소수점이 없다. USD 는 센트까지.
  if (currency === "KRW") return Math.round(amount)
  return Math.round(amount * 100) / 100
}

/** 한국형 번호를 관대하게 판정 — +82/공백/하이픈 허용, 숫자 9~11자리면 통과. */
export function normalizeKoreanPhoneDigits(value: string) {
  let digits = value.replace(/\D/g, "")
  if (digits.startsWith("0082")) digits = digits.slice(4)
  if (digits.startsWith("82")) digits = `0${digits.slice(2)}`
  return digits
}

function isPlausibleKoreanPhone(value: string) {
  const digits = normalizeKoreanPhoneDigits(value)
  return digits.length >= 9 && digits.length <= 11
}

/** 'YYYY-MM-DD' + N일. UTC 자정 기준으로만 계산해 서버 TZ 에 흔들리지 않는다. */
function shiftIsoDate(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return [
    shifted.getUTCFullYear().toString().padStart(4, "0"),
    (shifted.getUTCMonth() + 1).toString().padStart(2, "0"),
    shifted.getUTCDate().toString().padStart(2, "0"),
  ].join("-")
}

function isRealCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

/**
 * 품목 정규화 — 공개 무인증 POST 라서 클라이언트가 보낸 가격·이름은 신뢰하지 않는다.
 *
 * 하드웨어: sku 를 lib/billing/hardware-catalog(SSOT)와 대조해 미등록이면 거부하고,
 *   name·unitAmount·currency 는 카탈로그 값으로 **강제 교체**한다(₩1 신청 위조 차단).
 * 소프트웨어: 금액이 동적(충전액 직접 입력·계정 수×환율)이라 핀할 수 없다 —
 *   sku 접두사만 검사하고 단가는 상한 클램프로 흡수한다.
 */
function normalizeItems(
  raw: unknown,
  kind: CheckoutRequestKind
): CheckoutRequestItem[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.length < MIN_ITEMS || raw.length > MAX_ITEMS) return null

  const items: CheckoutRequestItem[] = []

  for (const entry of raw) {
    const record = asRecord(entry)
    if (!record) return null

    const sku = normalizeText(record.sku, MAX_SKU_LENGTH)

    const rawQty = normalizeNumber(record.qty)
    if (rawQty === null) return null
    // 수량은 거부가 아니라 클램프 — 프론트 상태 오차로 신청 자체가 날아가지 않게 한다.
    const qty = Math.min(MAX_QTY, Math.max(MIN_QTY, Math.round(rawQty)))

    if (kind === "hardware") {
      const catalogItem = sku ? getHardwareItem(sku) : null
      if (!catalogItem) return null

      items.push({
        sku: catalogItem.sku,
        name: catalogItem.name,
        qty,
        unitAmount: catalogItem.priceKrw,
        currency: HARDWARE_CURRENCY,
        lineAmount: roundAmount(catalogItem.priceKrw * qty, HARDWARE_CURRENCY),
      })
      continue
    }

    if (!sku || !sku.startsWith(SOFTWARE_SKU_PREFIX)) return null

    const name = normalizeText(record.name, MAX_ITEM_NAME_LENGTH)
    if (!name) return null

    const currency = record.currency
    if (
      typeof currency !== "string" ||
      !CHECKOUT_REQUEST_CURRENCIES.includes(currency as CheckoutRequestCurrency)
    ) {
      return null
    }
    const itemCurrency = currency as CheckoutRequestCurrency

    const rawUnitAmount = normalizeNumber(record.unitAmount)
    if (rawUnitAmount === null) return null

    const unitAmount = roundAmount(
      Math.min(MAX_SOFTWARE_UNIT_AMOUNT, Math.max(0, rawUnitAmount)),
      itemCurrency
    )

    items.push({
      sku,
      name,
      qty,
      unitAmount,
      currency: itemCurrency,
      lineAmount: roundAmount(unitAmount * qty, itemCurrency),
    })
  }

  return items
}

function summarizeTotals(items: CheckoutRequestItem[]) {
  const byCurrency = new Map<CheckoutRequestCurrency, number>()

  for (const item of items) {
    const current = byCurrency.get(item.currency) ?? 0
    byCurrency.set(item.currency, roundAmount(current + item.lineAmount, item.currency))
  }

  // 신청서에 먼저 등장한 통화 순서를 유지한다(대표 통화 동점 시의 tie-break 이기도 하다).
  const ordered: Array<{ currency: CheckoutRequestCurrency; amount: number }> = []
  for (const item of items) {
    if (ordered.some((total) => total.currency === item.currency)) continue
    ordered.push({ currency: item.currency, amount: byCurrency.get(item.currency) ?? 0 })
  }

  const primary = ordered.reduce((best, total) => (total.amount > best.amount ? total : best), ordered[0])

  return { totals: ordered, totalAmount: primary.amount, currency: primary.currency }
}

/**
 * 공개 요청 본문을 검증·정규화한다. 순수 함수 — `now` 를 주입해 KST 경계를 테스트한다.
 * 실패 시 어떤 필드가 문제인지 field 로 돌려준다(응답 계약: 400 { error:'validation', field? }).
 */
export function normalizeCheckoutRequest(
  raw: unknown,
  now: Date = new Date()
): CheckoutRequestValidation {
  const body = asRecord(raw)
  if (!body) return { ok: false }

  if (body.consent !== true) return { ok: false, field: "consent" }

  const kind = body.kind
  if (
    typeof kind !== "string" ||
    !CHECKOUT_REQUEST_KINDS.includes(kind as CheckoutRequestKind)
  ) {
    return { ok: false, field: "kind" }
  }

  const items = normalizeItems(body.items, kind as CheckoutRequestKind)
  if (!items) return { ok: false, field: "items" }

  const org = normalizeText(body.org, MAX_ORG_LENGTH)
  if (!org) return { ok: false, field: "org" }

  const name = normalizeText(body.name, MAX_NAME_LENGTH)
  if (!name) return { ok: false, field: "name" }

  const phone = normalizeText(body.phone, MAX_PHONE_LENGTH)
  if (!phone || !isPlausibleKoreanPhone(phone)) return { ok: false, field: "phone" }

  // 이메일은 선택 — 값이 있을 때만 형식을 본다.
  let email: string | null = null
  if (body.email !== undefined && body.email !== null && body.email !== "") {
    const candidate = normalizeText(body.email, MAX_EMAIL_LENGTH)?.toLowerCase() ?? null
    if (!candidate || !EMAIL_REGEX.test(candidate)) return { ok: false, field: "email" }
    email = candidate
  }

  const desiredDate = typeof body.desiredDate === "string" ? body.desiredDate.trim() : ""
  if (!DATE_REGEX.test(desiredDate) || !isRealCalendarDate(desiredDate)) {
    return { ok: false, field: "desiredDate" }
  }
  // KST 기준 내일~+365일만 허용 — 서버 TZ 와 무관하게 판정하고, 프론트 캘린더와 같은 계약이다.
  const todayKst = getBusinessDateParts(now).date
  if (
    desiredDate < shiftIsoDate(todayKst, MIN_DESIRED_DATE_ADVANCE_DAYS) ||
    desiredDate > shiftIsoDate(todayKst, MAX_DESIRED_DATE_ADVANCE_DAYS)
  ) {
    return { ok: false, field: "desiredDate" }
  }

  // 설치/배송 주소 — 하드웨어는 필수, 소프트웨어 신청은 받지 않는다(보내와도 무시).
  let address: string | null = null
  if (kind === "hardware") {
    address = normalizeText(body.address, MAX_ADDRESS_LENGTH)
    if (!address) return { ok: false, field: "address" }
  }

  const { totals, totalAmount, currency } = summarizeTotals(items)

  return {
    ok: true,
    value: {
      kind: kind as CheckoutRequestKind,
      items,
      totals,
      totalAmount,
      currency,
      org,
      name,
      phone,
      email,
      address,
      desiredDate,
      memo: normalizeMultilineText(body.memo, MAX_MEMO_LENGTH),
      sourcePage: normalizeText(body.sourcePage, MAX_SOURCE_PAGE_LENGTH),
    },
  }
}

/* ─── 표시 문자열 (순수) ─── */

export function formatCheckoutAmount(amount: number, currency: CheckoutRequestCurrency) {
  const fractionDigits = currency === "KRW" ? 0 : 2
  const formatted = amount.toLocaleString("ko-KR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
  return `${CURRENCY_SYMBOL[currency]}${formatted}`
}

/** 통화별 소계를 합친 합계 라벨. 혼합 통화면 "₩5,000,000 + $120.00". */
export function formatCheckoutTotals(request: NormalizedCheckoutRequest) {
  return request.totals
    .map((total) => formatCheckoutAmount(total.amount, total.currency))
    .join(" + ")
}

/** 품목 1줄 = "이름 (SKU) × 수량 = 줄금액". WeCom·리드 메시지가 공유한다. */
export function buildCheckoutItemLines(request: NormalizedCheckoutRequest) {
  return request.items.map((item) => {
    const label = item.sku ? `${item.name} (${item.sku})` : item.name
    return `${label} × ${item.qty} = ${formatCheckoutAmount(item.lineAmount, item.currency)}`
  })
}

export function getCheckoutRequestKindLabel(kind: CheckoutRequestKind) {
  return KIND_LABEL[kind]
}

/** 리드 큐/구글시트/채널톡이 그대로 읽을 수 있는 자기설명형 본문. */
export function buildCheckoutRequestLeadMessage(
  request: NormalizedCheckoutRequest,
  requestId: string
) {
  return [
    `[${getCheckoutRequestKindLabel(request.kind)} 도입 신청] 결제 없이 접수된 신청입니다.`,
    `희망 날짜: ${request.desiredDate}`,
    request.address ? `설치/배송 주소: ${request.address}` : null,
    "품목:",
    ...buildCheckoutItemLines(request).map((line) => `- ${line}`),
    `합계: ${formatCheckoutTotals(request)}`,
    request.memo ? `메모: ${request.memo}` : null,
    request.sourcePage ? `신청 경로: ${request.sourcePage}` : null,
    `신청 번호: ${requestId}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n")
}

interface CheckoutRequestNotificationArgs {
  request: NormalizedCheckoutRequest
  requestId: string
  leadId: string | null
}

/**
 * emitNotificationEvent 입력을 만든다(순수). WeCom 본문은 emit-event 의
 * checkout.request_created 빌더가 이 payload 를 읽어 조립한다.
 */
export function buildCheckoutRequestNotification({
  request,
  requestId,
  leadId,
}: CheckoutRequestNotificationArgs) {
  const itemLines = buildCheckoutItemLines(request)
  const kindLabel = getCheckoutRequestKindLabel(request.kind)
  const totalLabel = formatCheckoutTotals(request)

  return {
    eventType: "checkout.request_created" as const,
    notificationType: "action_required" as const,
    categoryTag: "lead" as const,
    severity: "info" as const,
    scopeTag: "org_admin" as const,
    title: `${kindLabel} 도입 신청: ${request.org}`,
    message: [
      request.name,
      request.phone,
      `희망 ${request.desiredDate}`,
      totalLabel,
    ].join(" / "),
    // 리드가 만들어졌으면 그 리드로 바로 열고, 아니면 미확인 큐로 보낸다.
    routeUrl: leadId
      ? `/admin/crm/customers/leads?lead=${leadId}`
      : "/admin/crm/customers/leads?filter=unconfirmed",
    source: "checkout_request",
    sourceId: requestId,
    payload: {
      requestId,
      leadId,
      kind: request.kind,
      kindLabel,
      org: request.org,
      name: request.name,
      phone: request.phone,
      email: request.email,
      address: request.address,
      desiredDate: request.desiredDate,
      memo: request.memo,
      sourcePage: request.sourcePage,
      itemCount: request.items.length,
      itemLines: itemLines.slice(0, NOTIFICATION_ITEM_LINE_LIMIT),
      itemOverflowCount: Math.max(0, itemLines.length - NOTIFICATION_ITEM_LINE_LIMIT),
      totalLabel,
      totalAmount: request.totalAmount,
      currency: request.currency,
    },
    channels: NOTIFICATION_CHANNELS,
  }
}

/* ─── 중복 창(인스턴스 메모리) ─── */

const recentRequests = new Map<string, { requestId: string; updatedAt: number }>()

/**
 * 품목 구성 지문 — "sku:qty" 를 정렬해 붙인다. 총액이 같아도 구성이 다르면 다른 신청이다
 * (86인치 2대 ↔ 75인치 1대 + 카메라 3대 처럼 합계만 같은 수정 신청이 흡수되지 않게 한다).
 */
function getItemsFingerprint(items: CheckoutRequestItem[]) {
  return items
    .map((item) => `${item.sku}:${item.qty}`)
    .sort()
    .join("|")
}

function getDedupeKey(request: NormalizedCheckoutRequest) {
  return [
    request.kind,
    normalizeKoreanPhoneDigits(request.phone),
    request.desiredDate,
    request.currency,
    String(request.totalAmount),
    String(request.items.length),
    getItemsFingerprint(request.items),
  ].join(":")
}

function getRecentRequestId(key: string) {
  const now = Date.now()
  for (const [staleKey, entry] of recentRequests) {
    if (now - entry.updatedAt > DUPLICATE_WINDOW_MS) recentRequests.delete(staleKey)
  }
  return recentRequests.get(key)?.requestId ?? null
}

function rememberRequest(key: string, requestId: string) {
  recentRequests.set(key, { requestId, updatedAt: Date.now() })
}

/* ─── 저장 · 후속 처리 ─── */

async function insertCheckoutRequest(request: NormalizedCheckoutRequest) {
  // 공개 무인증 경로 — RLS deny-all 테이블이므로 service role 클라이언트만 통한다.
  const supabase = createSupabaseAdminClient()

  const { data, error } = await supabase
    .from("checkout_requests")
    .insert({
      kind: request.kind,
      items: request.items,
      total_amount: request.totalAmount,
      currency: request.currency,
      org: request.org,
      name: request.name,
      phone: request.phone,
      email: request.email,
      address: request.address,
      desired_date: request.desiredDate,
      memo: request.memo,
      source_page: request.sourcePage,
      status: "new",
    })
    .select("id")
    .single()

  if (error || !data?.id) {
    throw new Error(`[checkout-request] 저장 실패: ${error?.message ?? "no row returned"}`)
  }

  return String(data.id)
}

async function linkLeadId(requestId: string, leadId: string) {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from("checkout_requests")
    .update({ lead_id: leadId })
    .eq("id", requestId)

  if (error) throw new Error(error.message)
}

/**
 * 어드민 리드 큐 미러링. lead-capture 를 재사용해 구글시트·채널톡·CRM 타임라인·
 * 서버 전환까지 기존 리드와 동일하게 흐르게 하고, lead.created 알림만 끈다
 * (알림은 checkout.request_created 1건으로 통일 — 불변식 ②).
 */
async function mirrorToLeadQueue(
  request: NormalizedCheckoutRequest,
  requestId: string
): Promise<string | null> {
  const { body } = await submitLeadCapture(
    {
      source: "contact_page",
      org: request.org,
      name: request.name,
      phone: request.phone,
      email: request.email ?? undefined,
      message: buildCheckoutRequestLeadMessage(request, requestId),
      // 도입 신청 동의는 연락 목적 — 마케팅 수신 동의로 승격하지 않는다.
      marketingConsent: false,
      sourceDetail: `checkout_request:${request.kind}`,
      currentPage: request.sourcePage ?? undefined,
    },
    { suppressLeadCreatedNotification: true }
  )

  return body.ok ? body.leadId ?? null : null
}

async function runSafely<T>(label: string, task: () => Promise<T>): Promise<T | null> {
  try {
    return await task()
  } catch (error) {
    // 후속 처리 실패는 로그만 — 신청 저장은 이미 성공했다(불변식 ④).
    console.error(`[checkout-request] ${label} failed:`, error)
    return null
  }
}

export async function submitCheckoutRequest(
  raw: unknown,
  context: CheckoutRequestContext = {}
): Promise<CheckoutRequestResult> {
  const validation = normalizeCheckoutRequest(raw)
  if (!validation.ok) {
    return {
      status: 400,
      body: {
        ok: false,
        error: "validation",
        ...(validation.field ? { field: validation.field } : {}),
      },
    }
  }

  const request = validation.value
  const dedupeKey = getDedupeKey(request)

  // 더블 클릭/재시도는 같은 requestId 를 그대로 돌려준다 — 신청 행도 알림도 늘지 않는다.
  const duplicated = getRecentRequestId(dedupeKey)
  if (duplicated) {
    return { status: 200, body: { ok: true, requestId: duplicated } }
  }

  let requestId: string
  try {
    requestId = await insertCheckoutRequest(request)
  } catch (error) {
    console.error("[checkout-request] insert failed:", error)
    return { status: 500, body: { ok: false } }
  }

  rememberRequest(dedupeKey, requestId)

  const followUp = async () => {
    const leadId = await runSafely("lead mirror", () =>
      mirrorToLeadQueue(request, requestId)
    )

    if (leadId) {
      await runSafely("lead link", () => linkLeadId(requestId, leadId))
    }

    // 신청당 정확히 1건 — 리드 미러가 실패해도(leadId null) 알림은 그대로 나간다.
    await runSafely("ops notification", () =>
      emitNotificationEvent(buildCheckoutRequestNotification({ request, requestId, leadId }))
    )
  }

  if (context.deferTask) {
    context.deferTask(followUp)
  } else {
    void followUp()
  }

  return { status: 200, body: { ok: true, requestId } }
}
