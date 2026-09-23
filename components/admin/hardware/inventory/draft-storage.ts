// 작성 중 입력 보관 — 새로고침·탭 폐기·네트워크 실패로 한 물량을 다시 치는 일을 막는다.
//
// 브라우저에만 남는 값이고 원장이 아니다. 그래서 규칙은 셋이다.
//   1) 스키마 버전이 다르면 버린다(앱이 바뀌면 옛 초안은 읽지 않는다).
//   2) 오래되면 버린다(기본 24시간) — 어제 입력이 오늘 저장으로 새는 것을 막는다.
//   3) storage 접근이 막힌 환경(프라이빗 모드 등)에서는 조용히 기능만 포기한다.
// 저장·복구 여부를 사람이 정하는 곳(입고표 배너)과 조용히 복구하는 곳(바구니 — 화면에
// "저장 대기 N건"으로 이미 보인다)이 갈리므로, 이 모듈은 읽기/쓰기/지우기만 제공한다.

import type { HardwareMovementDraft } from "./shared"

export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** 저장 대기 바구니 보관 키·스키마 버전 — 읽기는 아래 readStoredQuickCartDrafts 하나만 쓴다. */
export const QUICK_CART_DRAFT_KEY = "hw.quickRecord.cart"
export const QUICK_CART_DRAFT_VERSION = 1

interface StoredDraftEnvelope {
  version: number
  savedAt: number
  value: unknown
}

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">

export interface DraftReadOptions {
  maxAgeMs?: number
  now?: number
  storage?: StorageLike | null
}

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage
  try {
    if (typeof window === "undefined") return null
    return window.localStorage
  } catch {
    return null
  }
}

export function readStoredDraft<T>(key: string, version: number, options: DraftReadOptions = {}): T | null {
  const storage = resolveStorage(options.storage)
  if (!storage) return null

  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraftEnvelope | null
    if (!parsed || typeof parsed !== "object") return null
    if (parsed.version !== version) return null
    // 저장 시각이 없거나 숫자가 아니면 옛 포맷이다 — 나이를 알 수 없으므로 읽지 않는다.
    const savedAt = typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : null
    if (savedAt == null) return null
    const maxAgeMs = options.maxAgeMs ?? DRAFT_MAX_AGE_MS
    const now = options.now ?? Date.now()
    if (now - savedAt > maxAgeMs) return null
    return (parsed.value ?? null) as T | null
  } catch {
    return null
  }
}

export function writeStoredDraft<T>(
  key: string,
  version: number,
  value: T,
  options: { now?: number; storage?: StorageLike | null } = {}
): void {
  const storage = resolveStorage(options.storage)
  if (!storage) return
  try {
    const envelope: StoredDraftEnvelope = { version, savedAt: options.now ?? Date.now(), value }
    storage.setItem(key, JSON.stringify(envelope))
  } catch {
    // 용량 초과·프라이빗 모드 — 기억 기능만 포기한다.
  }
}

export function clearStoredDraft(key: string, options: { storage?: StorageLike | null } = {}): void {
  const storage = resolveStorage(options.storage)
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // 위와 같다.
  }
}

/**
 * 보관된 저장 대기 바구니.
 *
 * 앱이 바뀐 뒤 남은 옛 값이 그대로 저장 요청에 실리면 원장이 틀어진다. 그래서 스키마 버전·보관
 * 기한을 통과한 뒤에도 **줄마다 최소 형태**를 다시 본다 — 품목명·유형·양수 수량·시리얼 배열.
 * 통과하지 못한 줄은 조용히 버린다(부분 복구가 전부 잃는 것보다 낫다).
 */
const MOVEMENT_TYPES = new Set(["inbound", "outbound", "return", "transfer", "repair", "adjust"])
const DRAFT_STRING_FIELDS = [
  "occurredAt",
  "fromLocation",
  "toLocation",
  "owner",
  "status",
  "referenceNo",
  "memo",
  "lotNo",
  "storageLocation",
  "importer",
] as const

export function readStoredQuickCartDrafts(options: DraftReadOptions = {}): HardwareMovementDraft[] {
  const saved = readStoredDraft<unknown>(QUICK_CART_DRAFT_KEY, QUICK_CART_DRAFT_VERSION, options)
  if (!Array.isArray(saved)) return []
  const restored: HardwareMovementDraft[] = []
  for (const line of saved) {
    if (!line || typeof line !== "object") continue
    const draft = line as Partial<HardwareMovementDraft>
    // 유형은 허용 목록, 수량은 양의 정수 — 옛 값·손상된 값이 저장 요청에 실리지 않게(하드웨어 라운드 2 Q-25).
    if (
      typeof draft.productName !== "string" ||
      draft.productName.trim().length === 0 ||
      typeof draft.movementType !== "string" ||
      !MOVEMENT_TYPES.has(draft.movementType) ||
      typeof draft.quantity !== "number" ||
      !Number.isInteger(draft.quantity) ||
      draft.quantity <= 0 ||
      !Array.isArray(draft.serials)
    ) {
      continue
    }
    // 화면이 문자열 메서드를 바로 부르는 칸(도착·lot 등)이 빠졌거나 문자열이 아니면 빈 문자열로 채운다 — 시트가 깨지지 않게.
    const normalized = { ...draft } as HardwareMovementDraft
    for (const field of DRAFT_STRING_FIELDS) {
      if (typeof normalized[field] !== "string") (normalized as unknown as Record<string, unknown>)[field] = ""
    }
    normalized.serials = draft.serials.filter((serial): serial is string => typeof serial === "string")
    restored.push(normalized)
  }
  return restored
}
