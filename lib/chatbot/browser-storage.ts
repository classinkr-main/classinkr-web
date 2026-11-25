/**
 * 브라우저 저장소(localStorage·sessionStorage)를 막혀도 깨지지 않게 읽고 쓰는 도우미. 브라우저 전용이고 던지지 않는다.
 *
 * Safari '모든 쿠키 차단'·일부 프라이빗 창·샌드박스 iframe 에서는 `window.localStorage` 에 손대기만 해도 SecurityError 가 난다.
 * 예전에는 챗봇 소리 설정(lib/chatbot/sound.ts)이 모듈을 읽는 순간 이 오류를 내 위젯 경계가 런처까지 지웠다(CX-19).
 * 실패하면 null·false 를 돌려주고, 부르는 쪽이 메모리 값으로 이어 간다.
 */

export type BrowserStorageKind = "local" | "session"

function resolveStorage(kind: BrowserStorageKind): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export function readBrowserStorage(kind: BrowserStorageKind, key: string): string | null {
  const storage = resolveStorage(kind)
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

/** 쓰면 true. 저장소가 막혔거나 가득 차면 false. */
export function writeBrowserStorage(kind: BrowserStorageKind, key: string, value: string): boolean {
  const storage = resolveStorage(kind)
  if (!storage) return false
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function removeBrowserStorage(kind: BrowserStorageKind, key: string): void {
  const storage = resolveStorage(kind)
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // 막힌 저장소 — 지울 것도 없다.
  }
}
