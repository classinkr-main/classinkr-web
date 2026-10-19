// 본인 사이드바 편집(상시·기타·숨김)의 클라이언트 계약 — 이벤트 이름·저장 호출·저장 직후 핀.
//
// 사이드바(AdminSidebar)·본인 편집 드로어(settings/MyNavEditorDrawer)·셸(AdminShell)이 공유한다.
// 배치 판정 자체는 admin-nav-access.ts 가 정본이다. 이 파일은 "어떻게 저장하고, 저장한 값을
// 서버 캐시의 옛 값이 덮지 못하게 하느냐"만 다룬다.
import { normalizeNavOverrides, type NavOverrideValue } from "./admin-nav-access"
import { adminFetchJson } from "@/lib/admin-client"

/**
 * 사이드바가 듣는 "편집기 열기" 이벤트. ⌘K 명령(AdminCommandPalette)이 이 이름으로
 * `window.dispatchEvent(new Event(...))` 한다 — 이름을 바꾸면 두 쪽이 조용히 끊긴다.
 */
export const ADMIN_OPEN_NAV_EDITOR_EVENT = "admin:open-nav-editor"

export const MY_NAV_ENDPOINT = "/api/admin/me/nav"

export const NAV_OVERRIDES_STORAGE_KEY = "admin_nav_overrides"
/** lib/admin-client.ts 의 로그아웃 정리 목록에도 들어 있다. */
export const NAV_OVERRIDES_PIN_STORAGE_KEY = "admin_nav_overrides_pinned_until"

/**
 * 저장 직후 로컬 값을 우선하는 시간. 서버 셸 세션 캐시 TTL(60초, lib/admin-auth.ts)보다
 * 조금 길다 — 저장 라우트는 자기 인스턴스 캐시만 비우므로, 다른 인스턴스가 router.refresh 때
 * 옛 값을 내려보내도 셸이 되돌아가지 않게 한다.
 */
export const NAV_OVERRIDES_PIN_MS = 65_000

export interface NavStorageReader {
  getItem(key: string): string | null
}

export interface NavStorageWriter {
  setItem(key: string, value: string): void
}

function parseStoredOverrides(raw: string | null): Record<string, string> | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") result[key] = value
    }
    return result
  } catch {
    return null
  }
}

/**
 * 서버가 준 오버라이드와 로컬 저장값 중 무엇을 셸에 쓸지 고른다(순수 함수).
 *
 * 핀 창(저장 시각 + NAV_OVERRIDES_PIN_MS) 안이고 로컬 값이 읽히면 로컬 값, 아니면 서버 값을
 * **같은 참조로** 돌려준다(셸이 같은 객체면 리렌더를 건너뛴다). 핀이 비정상적으로 먼 미래면
 * (시계 이상·손상) 무시한다 — 로컬 값이 영구히 서버를 이기는 일을 막는다.
 */
export function mergePinnedNavOverrides(
  server: Record<string, string>,
  storage: NavStorageReader | null | undefined,
  now: number
): Record<string, string> {
  if (!storage) return server

  const pinnedUntil = Number(storage.getItem(NAV_OVERRIDES_PIN_STORAGE_KEY))
  if (!Number.isFinite(pinnedUntil) || pinnedUntil <= now) return server
  if (pinnedUntil - now > NAV_OVERRIDES_PIN_MS * 2) return server

  return parseStoredOverrides(storage.getItem(NAV_OVERRIDES_STORAGE_KEY)) ?? server
}

/** 방금 저장한 값을 로컬에 쓰고 핀을 건다. */
export function pinNavOverrides(
  storage: NavStorageWriter,
  overrides: Record<string, string>,
  now: number
) {
  storage.setItem(NAV_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides))
  storage.setItem(NAV_OVERRIDES_PIN_STORAGE_KEY, String(now + NAV_OVERRIDES_PIN_MS))
}

/**
 * 본인 사이드바 선호를 저장한다 — 전체 상태를 보낸다(부분 병합 아님).
 * 서버가 정규화한 값을 돌려주므로 호출부는 그 값을 셸에 반영한다.
 */
export async function saveMyNavOverrides(
  next: Record<string, NavOverrideValue>
): Promise<Record<string, NavOverrideValue>> {
  const data = await adminFetchJson<{ navOverrides?: unknown }>(MY_NAV_ENDPOINT, {
    method: "PATCH",
    body: JSON.stringify({ navOverrides: next }),
  })
  return normalizeNavOverrides(data?.navOverrides)
}
