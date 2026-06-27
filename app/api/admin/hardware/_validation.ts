import { NextRequest, NextResponse } from "next/server"

type JsonObject = Record<string, unknown>

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export class HardwareApiValidationError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "HardwareApiValidationError"
    this.status = status
  }
}

export async function readRequestBody(req: NextRequest): Promise<JsonObject> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new HardwareApiValidationError("잘못된 JSON 요청입니다.")
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HardwareApiValidationError("JSON 객체 본문이 필요합니다.")
  }

  return body as JsonObject
}

export function readRequiredString(body: JsonObject, key: string, label: string) {
  const value = body[key]
  if (typeof value !== "string") {
    throw new HardwareApiValidationError(`${label}은(는) 문자열이어야 합니다.`)
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw new HardwareApiValidationError(`${label}은(는) 필수입니다.`)
  }
  return trimmed
}

export function readOptionalString(body: JsonObject, key: string, label: string) {
  const value = body[key]
  if (value == null || value === "") return undefined
  if (typeof value !== "string") {
    throw new HardwareApiValidationError(`${label}은(는) 문자열이어야 합니다.`)
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

export function readOptionalBoolean(body: JsonObject, key: string, label: string) {
  const value = body[key]
  if (value == null) return undefined
  if (typeof value !== "boolean") {
    throw new HardwareApiValidationError(`${label}은(는) true/false여야 합니다.`)
  }
  return value
}

export function readRequiredPositiveInt(body: JsonObject, key: string, label: string) {
  const value = body[key]
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HardwareApiValidationError(`${label}은(는) 1 이상 정수여야 합니다.`)
  }
  return parsed
}

export function readOptionalNonNegativeInt(body: JsonObject, key: string, label: string) {
  const value = body[key]
  if (value == null || value === "") return undefined
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HardwareApiValidationError(`${label}은(는) 0 이상 정수여야 합니다.`)
  }
  return parsed
}

export function readRequiredEnum<T extends string>(
  body: JsonObject,
  key: string,
  label: string,
  allowed: readonly T[]
) {
  const value = readRequiredString(body, key, label)
  if (!allowed.includes(value as T)) {
    throw new HardwareApiValidationError(`${label} 값이 올바르지 않습니다.`)
  }
  return value as T
}

export function readOptionalDate(body: JsonObject, key: string, label: string) {
  const value = readOptionalString(body, key, label)
  if (!value) return undefined

  if (!DATE_REGEX.test(value)) {
    throw new HardwareApiValidationError(`${label} 형식은 YYYY-MM-DD여야 합니다.`)
  }
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HardwareApiValidationError(`${label} 날짜가 올바르지 않습니다.`)
  }
  return value
}

export function readStringArray(body: JsonObject, key: string, label: string) {
  const value = body[key]
  if (value == null) return []
  if (!Array.isArray(value)) {
    throw new HardwareApiValidationError(`${label}은(는) 배열이어야 합니다.`)
  }
  return value
    .map((item) => {
      if (typeof item !== "string") {
        throw new HardwareApiValidationError(`${label} 항목은 문자열이어야 합니다.`)
      }
      return item.trim()
    })
    .filter(Boolean)
}

export function readOptionalStringArray(body: JsonObject, key: string, label: string) {
  if (!(key in body) || body[key] == null) return undefined
  return readStringArray(body, key, label)
}

export function toErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof HardwareApiValidationError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  return NextResponse.json({
    error: error instanceof Error ? error.message : fallbackMessage,
  }, { status: 500 })
}
