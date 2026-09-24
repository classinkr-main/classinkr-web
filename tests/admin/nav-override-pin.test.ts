import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { ADMIN_OPEN_NAV_EDITOR_EVENT as PALETTE_EVENT } from "@/components/admin/AdminCommandPalette"
import {
  ADMIN_OPEN_NAV_EDITOR_EVENT,
  mergePinnedNavOverrides,
  NAV_OVERRIDES_PIN_MS,
  NAV_OVERRIDES_PIN_STORAGE_KEY,
  NAV_OVERRIDES_STORAGE_KEY,
  pinNavOverrides,
} from "@/components/admin/my-nav-preferences"

// 사이드바 편집 저장 직후의 핀 — 서버 셸 세션은 인스턴스별 60초 캐시라, 저장 라우트가 비우지
// 못한 인스턴스가 router.refresh 때 옛 nav_overrides 를 내려줄 수 있다. 셸은 65초 동안 로컬
// 값을 우선해 방금 고친 사이드바가 되돌아가지 않게 한다(components/admin/AdminShell.tsx).
function storageOf(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  }
}

const NOW = 1_800_000_000_000
const SERVER = { "/admin/crm": "primary" }
const LOCAL = { "/admin/quotes": "hidden" }

describe("mergePinnedNavOverrides", () => {
  it("저장소가 없으면 서버 값을 같은 참조로 돌려준다", () => {
    expect(mergePinnedNavOverrides(SERVER, null, NOW)).toBe(SERVER)
  })

  it("핀이 없으면 서버 값", () => {
    const storage = storageOf({ [NAV_OVERRIDES_STORAGE_KEY]: JSON.stringify(LOCAL) })
    expect(mergePinnedNavOverrides(SERVER, storage, NOW)).toBe(SERVER)
  })

  it("핀 창 안이면 로컬 값", () => {
    const storage = storageOf({
      [NAV_OVERRIDES_STORAGE_KEY]: JSON.stringify(LOCAL),
      [NAV_OVERRIDES_PIN_STORAGE_KEY]: String(NOW + 30_000),
    })
    expect(mergePinnedNavOverrides(SERVER, storage, NOW)).toEqual(LOCAL)
  })

  it("핀이 지났으면 서버 값", () => {
    const storage = storageOf({
      [NAV_OVERRIDES_STORAGE_KEY]: JSON.stringify(LOCAL),
      [NAV_OVERRIDES_PIN_STORAGE_KEY]: String(NOW - 1),
    })
    expect(mergePinnedNavOverrides(SERVER, storage, NOW)).toBe(SERVER)
  })

  it("핀이 비정상적으로 먼 미래면 무시한다 — 로컬이 영구히 이기지 않게", () => {
    const storage = storageOf({
      [NAV_OVERRIDES_STORAGE_KEY]: JSON.stringify(LOCAL),
      [NAV_OVERRIDES_PIN_STORAGE_KEY]: String(NOW + NAV_OVERRIDES_PIN_MS * 10),
    })
    expect(mergePinnedNavOverrides(SERVER, storage, NOW)).toBe(SERVER)
  })

  it.each(["{깨진", "[]", "null", "\"문자열\""])("로컬 값이 객체가 아니면(%s) 서버 값", (raw) => {
    const storage = storageOf({
      [NAV_OVERRIDES_STORAGE_KEY]: raw,
      [NAV_OVERRIDES_PIN_STORAGE_KEY]: String(NOW + 30_000),
    })
    expect(mergePinnedNavOverrides(SERVER, storage, NOW)).toBe(SERVER)
  })

  it("로컬 값의 문자열이 아닌 값은 버린다", () => {
    const storage = storageOf({
      [NAV_OVERRIDES_STORAGE_KEY]: JSON.stringify({ "/admin/quotes": "hidden", "/admin/blog": 3 }),
      [NAV_OVERRIDES_PIN_STORAGE_KEY]: String(NOW + 30_000),
    })
    expect(mergePinnedNavOverrides(SERVER, storage, NOW)).toEqual({ "/admin/quotes": "hidden" })
  })
})

describe("pinNavOverrides", () => {
  it("값과 만료 시각(지금 + 65초)을 함께 쓴다", () => {
    const storage = storageOf({})
    pinNavOverrides(storage, LOCAL, NOW)

    expect(storage.map.get(NAV_OVERRIDES_STORAGE_KEY)).toBe(JSON.stringify(LOCAL))
    expect(storage.map.get(NAV_OVERRIDES_PIN_STORAGE_KEY)).toBe(String(NOW + 65_000))
    expect(mergePinnedNavOverrides(SERVER, storage, NOW + 64_999)).toEqual(LOCAL)
    expect(mergePinnedNavOverrides(SERVER, storage, NOW + 65_000)).toBe(SERVER)
  })

  it("핀 창은 서버 셸 세션 캐시 TTL(60초)보다 길다", () => {
    const auth = readFileSync(join(process.cwd(), "lib/admin-auth.ts"), "utf8")
    const ttl = Number(auth.match(/const ADMIN_SHELL_SESSION_TTL_MS = ([\d_]+)/)?.[1]?.replace(/_/g, ""))
    expect(ttl).toBeGreaterThan(0)
    expect(NAV_OVERRIDES_PIN_MS).toBeGreaterThan(ttl)
  })
})

describe("정리·이벤트 계약", () => {
  it("핀 키가 로그아웃 정리 목록(lib/admin-client.ts STORAGE_KEYS)에 있다", () => {
    const client = readFileSync(join(process.cwd(), "lib/admin-client.ts"), "utf8")
    const block = client.slice(client.indexOf("const STORAGE_KEYS = ["), client.indexOf("] as const"))
    expect(block).toContain(`"${NAV_OVERRIDES_PIN_STORAGE_KEY}"`)
    expect(block).toContain(`"${NAV_OVERRIDES_STORAGE_KEY}"`)
  })

  it("사이드바가 듣는 이벤트 이름과 ⌘K 명령이 보내는 이름이 같다", () => {
    expect(ADMIN_OPEN_NAV_EDITOR_EVENT).toBe("admin:open-nav-editor")
    expect(PALETTE_EVENT).toBe(ADMIN_OPEN_NAV_EDITOR_EVENT)
  })
})
