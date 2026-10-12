// 통합 고객 행 키(`lead:<id>` · `neo:<accountId>` · `customer:<id>`) → 쓰기 대상({ targetType, targetId }).
//
// 순수 함수만 담는다(서버·클라이언트·테스트 공용). 행 키 형식의 정본은 통합 목록 조립부
// (lib/repositories/crm-unified-customers.ts — `lead:${lead.id}` · `neo:${account.accountId}` ·
// `customer:${customer.id}`)이고, targetType 값은 crm_customer_tags·crm_tasks 의 target_type CHECK 가
// 둘 다 허용하는 세 값(lead · neo_account · customer)으로만 옮긴다 — 'unknown'·'deal' 은 만들지 않는다.
//
// 고객 360 의 parseUnifiedCustomerKey(lib/repositories/crm-customer-360.ts)는 `customer:` 를 거부한다
// (360 이 전환 고객을 아직 그리지 않기 때문). 일괄 태그·할 일은 전환 고객 행에도 걸려야 하므로
// 같은 형식을 받되 customer 도 허용하는 별도 파서를 둔다.
//
// 식별자 규칙:
//  - lead·customer 의 id 는 Supabase uuid 컬럼이라 UUID 형식만 받고 소문자로 맞춘다. 대문자 UUID 로
//    태그를 저장하면 target_id(TEXT) 비교가 어긋나 통합 목록 태그 맵(`lead:<소문자 uuid>`)에서 빠진다.
//  - neo 계정 id 는 외부 CRM 문자열이라 형식을 강제하지 않는다(첫 ':' 이후 전부 — id 안의 ':' 허용).
//    단 PostgREST 필터 값으로 안전하지 않은 큰따옴표·역슬래시·제어 문자와 과도한 길이는 거부한다.

export type UnifiedCustomerTargetType = "lead" | "neo_account" | "customer"

export interface UnifiedCustomerTarget {
  /** 정규화된 행 키(`lead:<uuid>` 등) — 응답에 되돌려 줄 때 쓰는 값. */
  key: string
  targetType: UnifiedCustomerTargetType
  targetId: string
}

const PREFIX_TO_TARGET_TYPE: Record<string, UnifiedCustomerTargetType> = {
  lead: "lead",
  neo: "neo_account",
  customer: "customer",
}

const TARGET_TYPE_TO_PREFIX: Record<UnifiedCustomerTargetType, string> = {
  lead: "lead",
  neo_account: "neo",
  customer: "customer",
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// 큰따옴표·역슬래시·제어 문자(U+0000–U+001F, U+007F).
const UNSAFE_EXTERNAL_ID_PATTERN = /["\\\u0000-\u001f\u007f]/
const MAX_EXTERNAL_ID_LENGTH = 200
/** invalid 목록에 되돌려 주는 원본 키의 최대 길이 — 거대한 문자열을 그대로 메아리치지 않는다. */
const MAX_ECHOED_KEY_LENGTH = 200

/** 행 키 하나를 해석한다. 형식이 맞지 않으면 null. */
export function parseUnifiedCustomerTargetKey(raw: unknown): UnifiedCustomerTarget | null {
  if (typeof raw !== "string") return null
  const key = raw.trim()
  const idx = key.indexOf(":")
  if (idx <= 0) return null
  const targetType = PREFIX_TO_TARGET_TYPE[key.slice(0, idx)]
  if (!targetType) return null
  const rawId = key.slice(idx + 1).trim()
  if (!rawId) return null

  let targetId: string
  if (targetType === "neo_account") {
    if (rawId.length > MAX_EXTERNAL_ID_LENGTH || UNSAFE_EXTERNAL_ID_PATTERN.test(rawId)) return null
    targetId = rawId
  } else {
    if (!UUID_PATTERN.test(rawId)) return null
    targetId = rawId.toLowerCase()
  }

  return { key: `${TARGET_TYPE_TO_PREFIX[targetType]}:${targetId}`, targetType, targetId }
}

/**
 * 저장 대상 키(`${targetType}:${targetId}`) — 통합 목록 태그 맵(getAllCustomerTagsMap)과 같은 키.
 * 행 키(`neo:`)가 아니라 target_type(`neo_account:`)을 쓴다는 점에 주의.
 */
export function unifiedCustomerStorageKey(target: Pick<UnifiedCustomerTarget, "targetType" | "targetId">): string {
  return `${target.targetType}:${target.targetId}`
}

export type UnifiedCustomerKeyListResult =
  | {
      ok: true
      /** 해석된 대상 — 같은 대상(대상 타입+id)을 가리키는 키는 하나로 합친다. 입력 순서 유지. */
      targets: UnifiedCustomerTarget[]
      /** 해석하지 못한 키(원본, 앞뒤 공백 제거·길이 제한). */
      invalid: string[]
      /** 중복 제거 후 요청 키 수(상한 판정 기준). */
      requested: number
    }
  | { ok: false; reason: "not_array" | "empty" | "too_many"; error: string; limit: number }

function echoInvalidKey(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : String(value)
  return text.length > MAX_ECHOED_KEY_LENGTH ? `${text.slice(0, MAX_ECHOED_KEY_LENGTH)}…` : text
}

/**
 * 요청 본문의 keys 배열을 검증·해석한다.
 *  - 배열이 아니면 not_array, 중복 제거 후 0개면 empty, 상한 초과면 too_many(→ 라우트가 400).
 *  - 중복 제거는 앞뒤 공백을 뗀 원본 문자열 기준(문자열이 아닌 원소는 각각 별개로 센다).
 *  - 해석 실패 키는 invalid 로 모으고, 해석된 키는 대상 단위로 한 번 더 합친다
 *    (예: `lead:<UUID 대문자>` 와 `lead:<uuid 소문자>`).
 */
export function parseUnifiedCustomerKeyList(raw: unknown, limit: number): UnifiedCustomerKeyListResult {
  if (!Array.isArray(raw)) {
    return { ok: false, reason: "not_array", error: "keys 는 고객 키 배열이어야 합니다.", limit }
  }

  const seenRaw = new Set<string>()
  const unique: unknown[] = []
  for (const value of raw) {
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (!trimmed || seenRaw.has(trimmed)) continue
      seenRaw.add(trimmed)
      unique.push(trimmed)
    } else {
      unique.push(value)
    }
  }

  if (unique.length === 0) {
    return { ok: false, reason: "empty", error: "선택한 고객이 없습니다.", limit }
  }
  if (unique.length > limit) {
    return {
      ok: false,
      reason: "too_many",
      error: `한 번에 처리할 수 있는 고객은 최대 ${limit.toLocaleString("ko-KR")}명입니다.`,
      limit,
    }
  }

  const targets: UnifiedCustomerTarget[] = []
  const invalid: string[] = []
  const seenTargets = new Set<string>()
  for (const value of unique) {
    const parsed = parseUnifiedCustomerTargetKey(value)
    if (!parsed) {
      invalid.push(echoInvalidKey(value))
      continue
    }
    const storageKey = unifiedCustomerStorageKey(parsed)
    if (seenTargets.has(storageKey)) continue
    seenTargets.add(storageKey)
    targets.push(parsed)
  }

  return { ok: true, targets, invalid, requested: unique.length }
}
