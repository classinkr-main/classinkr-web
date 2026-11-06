/**
 * 자료(리드 마그넷) 신청 정보를 이 브라우저에 기억한다.
 *
 * 예전에는 자료를 받을 때마다(같은 자료를 다시 받을 때도) 이름·이메일·학원명을 새로 적어야 했다.
 * 한 번 신청이 성공하면 이 기기의 localStorage 에 신청 정보와 받은 자료 슬러그를 남겨,
 * - 같은 자료는 입력 없이 바로 다시 받고(리드 행을 새로 만들지 않는다),
 * - 다른 자료는 저장된 정보로 한 번에 신청한다.
 *
 * 전화번호는 남기지 않는다(재신청에 꼭 필요하지 않다). 학원 공용 PC를 생각해 화면에는 이메일을
 * 가려서 보여 주고, '다른 정보로 받기'를 누르면 기억을 지운다. 180일이 지나면 다시 입력받는다.
 * 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 조용히 예전 흐름(매번 입력)으로 돌아간다.
 */

import { useMemo, useSyncExternalStore } from "react"

export const MATERIAL_ACCESS_STORAGE_KEY = "classin:material-access:v1"
const MATERIAL_ACCESS_CHANGE_EVENT = "classin:material-access-change"
export const MATERIAL_ACCESS_TTL_MS = 180 * 24 * 60 * 60 * 1000

const MAX_UNLOCKED_SLUGS = 100
const MAX_FIELD_LENGTH = 120
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface RememberedMaterialAccess {
  version: 1
  email: string
  name?: string
  org?: string
  role?: string
  size?: string
  /** 이 기기에서 이미 받은 자료 슬러그 — 다시 받을 때 리드를 새로 만들지 않는다. */
  unlockedSlugs: string[]
  savedAt: number
}

export interface MaterialAccessInput {
  email: string
  name?: string
  org?: string
  role?: string
  size?: string
}

function cleanField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const text = value.trim()
  if (!text) return undefined
  return text.slice(0, MAX_FIELD_LENGTH)
}

function cleanEmail(value: unknown): string | null {
  const email = cleanField(value)?.toLowerCase()
  return email && EMAIL_PATTERN.test(email) ? email : null
}

function cleanSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const slugs: string[] = []
  for (const item of value) {
    if (typeof item !== "string") continue
    const slug = item.trim()
    if (!slug || slug.length > MAX_FIELD_LENGTH || slugs.includes(slug)) continue
    slugs.push(slug)
  }
  return slugs.slice(-MAX_UNLOCKED_SLUGS)
}

function compact(value: RememberedMaterialAccess): RememberedMaterialAccess {
  const result: RememberedMaterialAccess = {
    version: 1,
    email: value.email,
    unlockedSlugs: value.unlockedSlugs,
    savedAt: value.savedAt,
  }
  if (value.name) result.name = value.name
  if (value.org) result.org = value.org
  if (value.role) result.role = value.role
  if (value.size) result.size = value.size
  return result
}

/** 저장된 문자열을 검증해 되살린다. 형식이 깨졌거나 기한이 지났으면 null. */
export function parseRememberedMaterialAccess(
  raw: string | null | undefined,
  now: number = Date.now()
): RememberedMaterialAccess | null {
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  const record = data as Record<string, unknown>
  if (record.version !== 1) return null

  const email = cleanEmail(record.email)
  const savedAt = typeof record.savedAt === "number" && Number.isFinite(record.savedAt) ? record.savedAt : null
  if (!email || savedAt === null) return null
  if (savedAt > now + 60_000 || now - savedAt > MATERIAL_ACCESS_TTL_MS) return null

  return compact({
    version: 1,
    email,
    name: cleanField(record.name),
    org: cleanField(record.org),
    role: cleanField(record.role),
    size: cleanField(record.size),
    unlockedSlugs: cleanSlugs(record.unlockedSlugs),
    savedAt,
  })
}

/**
 * 새 신청 정보를 기억에 합친다. 이메일이 바뀌면 다른 사람으로 보고 처음부터 다시 쓴다
 * (앞사람의 이름·학원명·받은 자료를 이어 붙이지 않는다).
 */
export function mergeRememberedMaterialAccess(
  previous: RememberedMaterialAccess | null,
  input: MaterialAccessInput,
  slug: string,
  now: number = Date.now()
): RememberedMaterialAccess | null {
  const email = cleanEmail(input.email)
  if (!email) return null
  const base = previous && previous.email === email ? previous : null

  return compact({
    version: 1,
    email,
    name: cleanField(input.name) ?? base?.name,
    org: cleanField(input.org) ?? base?.org,
    role: cleanField(input.role) ?? base?.role,
    size: cleanField(input.size) ?? base?.size,
    unlockedSlugs: cleanSlugs([...(base?.unlockedSlugs ?? []), slug]),
    savedAt: now,
  })
}

/** 저장된 정보만으로 /api/lead 신청(이름·학원명·이메일 필수)을 다시 보낼 수 있는가. */
export function canReuseForLeadRequest(memory: RememberedMaterialAccess | null): boolean {
  return Boolean(memory?.email && memory.name && memory.org)
}

export function hasUnlockedMaterial(memory: RememberedMaterialAccess | null, slug: string): boolean {
  return Boolean(memory?.unlockedSlugs.includes(slug))
}

/** 화면 표시용 — 공용 PC 에서 앞사람 주소가 그대로 보이지 않게 앞 두 글자만 남긴다. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!local || !domain) return email
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`
}

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

function readRawSnapshot(): string | null {
  try {
    return getStorage()?.getItem(MATERIAL_ACCESS_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

function notifyChange() {
  try {
    window.dispatchEvent(new Event(MATERIAL_ACCESS_CHANGE_EVENT))
  } catch {
    // 이벤트를 못 보내도 다음 렌더/방문에 반영된다.
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(MATERIAL_ACCESS_CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(MATERIAL_ACCESS_CHANGE_EVENT, onChange)
  }
}

/**
 * 기억된 신청 정보를 구독한다. 서버 렌더와 첫 하이드레이션은 null(폼)로 그리고, 그 직후
 * 이 기기의 값으로 바뀐다 — 하이드레이션 불일치가 없다.
 */
export function useRememberedMaterialAccess(): RememberedMaterialAccess | null {
  const raw = useSyncExternalStore(subscribe, readRawSnapshot, () => null)
  return useMemo(() => parseRememberedMaterialAccess(raw), [raw])
}

export function readRememberedMaterialAccess(): RememberedMaterialAccess | null {
  return parseRememberedMaterialAccess(readRawSnapshot())
}

export function rememberMaterialAccess(
  input: MaterialAccessInput,
  slug: string
): RememberedMaterialAccess | null {
  const next = mergeRememberedMaterialAccess(readRememberedMaterialAccess(), input, slug)
  if (!next) return null
  try {
    getStorage()?.setItem(MATERIAL_ACCESS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 저장소를 못 쓰면(용량·사생활 보호 모드) 기억 없이 진행한다 — 다음 방문에 다시 입력받는다.
  }
  notifyChange()
  return next
}

export function forgetRememberedMaterialAccess(): void {
  try {
    getStorage()?.removeItem(MATERIAL_ACCESS_STORAGE_KEY)
  } catch {
    // 지우지 못해도 화면 흐름은 폼 입력으로 이어진다.
  }
  notifyChange()
}
