import { NextRequest, NextResponse } from "next/server"

import type {
  PartnerActivityLogStatus,
  DealStage,
  DocumentKind,
  DocumentStatus,
  PartnerChannel,
  PartnerInstallStatus,
  PartnerIssueSeverity,
  PartnerIssueStatus,
  PartnerQuoteWorkflowStatus,
  PartnerStatus,
  QuoteBillingMode,
  QuoteLineItemStatus,
  QuoteLineItemType,
  ScheduleKind,
  ScheduleStatus,
  PartnerTodoStatus,
} from "@/lib/partners-types"

type JsonObject = Record<string, unknown>

export const PARTNER_STATUS_VALUES = ["lead", "active", "paused", "churn_risk"] as const satisfies readonly PartnerStatus[]
export const PARTNER_CHANNEL_VALUES = ["direct", "reseller", "referral", "branch"] as const satisfies readonly PartnerChannel[]
export const DEAL_STAGE_VALUES = [
  "discovery",
  "quoted",
  "contract_sent",
  "active",
  "closed_won",
  "closed_lost",
] as const satisfies readonly DealStage[]
export const DOCUMENT_KIND_VALUES = ["quote", "contract", "receipt"] as const satisfies readonly DocumentKind[]
export const DOCUMENT_STATUS_VALUES = [
  "draft",
  "sent",
  "signed",
  "paid",
  "overdue",
  "archived",
] as const satisfies readonly DocumentStatus[]
export const QUOTE_WORKFLOW_STATUS_VALUES = [
  "draft",
  "ready",
  "sent",
  "viewed",
  "revised",
  "accepted",
  "rejected",
  "expired",
  "converted",
  "archived",
] as const satisfies readonly PartnerQuoteWorkflowStatus[]
export const QUOTE_LINE_ITEM_TYPE_VALUES = [
  "hardware",
  "installation",
  "shipping",
  "service",
  "discount",
  "note_only",
] as const satisfies readonly QuoteLineItemType[]
export const QUOTE_LINE_ITEM_STATUS_VALUES = [
  "priced",
  "pending_price",
  "separate_billing",
  "informational",
] as const satisfies readonly QuoteLineItemStatus[]
export const QUOTE_BILLING_MODE_VALUES = [
  "included_in_quote",
  "separate_invoice",
  "tbd",
] as const satisfies readonly QuoteBillingMode[]
export const SCHEDULE_KIND_VALUES = ["meeting", "follow_up", "deadline", "renewal"] as const satisfies readonly ScheduleKind[]
export const SCHEDULE_STATUS_VALUES = ["planned", "completed", "canceled"] as const satisfies readonly ScheduleStatus[]
export const TODO_STATUS_VALUES = [
  "open",
  "waiting_partner",
  "waiting_internal",
  "blocked",
  "done",
  "canceled",
] as const satisfies readonly PartnerTodoStatus[]
export const INSTALL_STATUS_VALUES = [
  "planned",
  "ordered",
  "delivered",
  "installed",
  "verified",
  "issue",
] as const satisfies readonly PartnerInstallStatus[]
export const ISSUE_STATUS_VALUES = ["open", "waiting", "blocked", "resolved"] as const satisfies readonly PartnerIssueStatus[]
export const ISSUE_SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const satisfies readonly PartnerIssueSeverity[]
export const ACTIVITY_LOG_STATUS_VALUES = [
  "recorded",
  "follow_up_needed",
  "waiting_partner",
  "waiting_internal",
  "blocked",
  "resolved",
  "canceled",
] as const satisfies readonly PartnerActivityLogStatus[]

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/
const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

export class PartnerApiValidationError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "PartnerApiValidationError"
    this.status = status
  }
}

export async function readRequestBody(req: NextRequest): Promise<JsonObject> {
  let body: unknown

  try {
    body = await req.json()
  } catch {
    throw new PartnerApiValidationError("잘못된 JSON 요청입니다.")
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PartnerApiValidationError("JSON 객체 본문이 필요합니다.")
  }

  return body as JsonObject
}

export function hasField(body: JsonObject, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key)
}

export function readRequiredString(body: JsonObject, key: string, label: string) {
  const value = body[key]

  if (typeof value !== "string") {
    throw new PartnerApiValidationError(`${label}은(는) 문자열이어야 합니다.`)
  }

  const trimmed = value.trim()
  if (!trimmed) {
    throw new PartnerApiValidationError(`${label}은(는) 필수입니다.`)
  }

  return trimmed
}

export function readOptionalString(
  body: JsonObject,
  key: string,
  label: string,
  options?: { emptyAsUndefined?: boolean }
) {
  const value = body[key]

  if (value == null) return undefined
  if (typeof value !== "string") {
    throw new PartnerApiValidationError(`${label}은(는) 문자열이어야 합니다.`)
  }

  const trimmed = value.trim()
  if (!trimmed && options?.emptyAsUndefined !== false) {
    return undefined
  }

  return trimmed
}

export function readRequiredEmail(body: JsonObject, key: string, label: string) {
  const email = readRequiredString(body, key, label).toLowerCase()
  if (!EMAIL_REGEX.test(email)) {
    throw new PartnerApiValidationError(`${label} 형식이 올바르지 않습니다.`)
  }
  return email
}

export function readStringArray(body: JsonObject, key: string, label: string) {
  const value = body[key]
  if (value == null) return []

  if (!Array.isArray(value)) {
    throw new PartnerApiValidationError(`${label}는 배열이어야 합니다.`)
  }

  const seen = new Set<string>()
  const result: string[] = []

  for (const item of value) {
    if (typeof item !== "string") {
      throw new PartnerApiValidationError(`${label} 항목은 문자열이어야 합니다.`)
    }

    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed)) continue

    seen.add(trimmed)
    result.push(trimmed)
  }

  return result
}

export function readRequiredEnum<T extends string>(
  body: JsonObject,
  key: string,
  label: string,
  allowedValues: readonly T[]
) {
  const value = body[key]

  if (typeof value !== "string") {
    throw new PartnerApiValidationError(`${label} 값이 올바르지 않습니다.`)
  }

  if (!allowedValues.includes(value as T)) {
    throw new PartnerApiValidationError(`${label} 값이 올바르지 않습니다.`)
  }

  return value as T
}

export function readOptionalEnum<T extends string>(
  body: JsonObject,
  key: string,
  label: string,
  allowedValues: readonly T[]
) {
  if (!hasField(body, key) || body[key] == null) return undefined
  return readRequiredEnum(body, key, label, allowedValues)
}

export function readOptionalNumber(
  body: JsonObject,
  key: string,
  label: string,
  options?: { defaultValue?: number; integer?: boolean; min?: number }
) {
  const value = body[key]

  if (value == null || value === "") {
    return options?.defaultValue
  }

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN

  if (!Number.isFinite(parsed)) {
    throw new PartnerApiValidationError(`${label}은(는) 숫자여야 합니다.`)
  }

  if (options?.integer && !Number.isInteger(parsed)) {
    throw new PartnerApiValidationError(`${label}은(는) 정수여야 합니다.`)
  }

  if (options?.min != null && parsed < options.min) {
    throw new PartnerApiValidationError(`${label}은(는) ${options.min} 이상이어야 합니다.`)
  }

  return parsed
}

export function readOptionalDate(body: JsonObject, key: string, label: string) {
  const value = readOptionalString(body, key, label)
  if (!value) return undefined

  if (!DATE_REGEX.test(value)) {
    throw new PartnerApiValidationError(`${label} 형식은 YYYY-MM-DD여야 합니다.`)
  }

  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new PartnerApiValidationError(`${label} 날짜가 올바르지 않습니다.`)
  }

  return value
}

export function readRequiredDateTime(body: JsonObject, key: string, label: string) {
  const value = readRequiredString(body, key, label)
  return normalizeDateTime(value, label)
}

export function readOptionalDateTime(body: JsonObject, key: string, label: string) {
  const value = readOptionalString(body, key, label)
  if (!value) return undefined
  return normalizeDateTime(value, label)
}

export function readRequiredMonth(body: JsonObject, key: string, label: string) {
  const value = readRequiredString(body, key, label)
  if (!MONTH_REGEX.test(value)) {
    if (DATE_REGEX.test(value)) {
      return value.slice(0, 7)
    }
    throw new PartnerApiValidationError(`${label} 형식은 YYYY-MM이어야 합니다.`)
  }
  return value
}

export function ensureOrderedDates(
  startValue: string | undefined,
  endValue: string | undefined,
  startLabel: string,
  endLabel: string
) {
  if (!startValue || !endValue) return

  const start = toComparableDate(startValue)
  const end = toComparableDate(endValue)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new PartnerApiValidationError(`${startLabel} 또는 ${endLabel} 값이 올바르지 않습니다.`)
  }

  if (start.getTime() > end.getTime()) {
    throw new PartnerApiValidationError(`${endLabel}은(는) ${startLabel} 이후여야 합니다.`)
  }
}

export function toErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof PartnerApiValidationError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  return NextResponse.json({ error: fallbackMessage }, { status: 500 })
}

function normalizeDateTime(value: string, label: string) {
  const normalized = value.replace(" ", "T")

  if (!DATE_TIME_REGEX.test(normalized)) {
    throw new PartnerApiValidationError(`${label} 형식은 YYYY-MM-DDTHH:mm이어야 합니다.`)
  }

  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    throw new PartnerApiValidationError(`${label} 날짜/시간이 올바르지 않습니다.`)
  }

  return normalized
}

function toComparableDate(value: string) {
  if (value.includes("T") || value.includes(" ")) {
    return new Date(value.replace(" ", "T"))
  }

  return new Date(`${value}T00:00:00Z`)
}
