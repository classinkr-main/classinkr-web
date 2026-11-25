// 직전 대화 목록 — 새 대화로 비운 대화의 "제목과 시각"만 sessionStorage 에 남긴다(새 대화 설계 N5 1단계).
//
// 대화 원문은 저장하지 않는다. 원문에는 고객 정보가 들어가므로 서버 저장·열람 범위·보관 기간을 정하는
// 결정 12("결정 대기", 추천: 본인만·30일)가 나기 전에는 브라우저 탭 안에서도 본문을 남기지 않는다.
// 제목은 첫 질문의 앞 24자다. 탭을 닫으면 사라진다(sessionStorage).
import type { AiMessage } from "./types"

export interface RecentThread {
  id: string
  /** 첫 질문 앞 24자. */
  title: string
  /** 대화를 비운 시각(ms). */
  at: number
}

export const RECENT_THREADS_KEY = "admin-ai:recent-threads:v1"
export const RECENT_THREADS_MAX = 5
export const RECENT_TITLE_MAX = 24

/** 대화의 제목 — 첫 사용자 말풍선을 한 줄로 줄여 24자까지. 사용자 말이 없으면 null. */
export function recentThreadTitle(messages: readonly AiMessage[]): string | null {
  const first = messages.find((message) => message.role === "user" && message.text?.trim())
  if (!first?.text) return null
  const flat = first.text.replace(/\s+/g, " ").trim()
  return Array.from(flat).slice(0, RECENT_TITLE_MAX).join("")
}

/** 새 항목을 맨 앞에 두고 최대 5개만 남긴다. */
export function addRecentThread(
  list: readonly RecentThread[],
  entry: RecentThread
): RecentThread[] {
  return [entry, ...list.filter((item) => item.id !== entry.id)].slice(0, RECENT_THREADS_MAX)
}

export function removeRecentThread(list: readonly RecentThread[], id: string): RecentThread[] {
  return list.filter((item) => item.id !== id)
}

/** 저장된 문자열을 목록으로 — 모양이 어긋난 값은 버린다(다른 배포가 쓴 값이 남아 있을 수 있다). */
export function parseRecentThreads(raw: string | null): RecentThread[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const list: RecentThread[] = []
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue
      const { id, title, at } = item as Record<string, unknown>
      if (typeof id !== "string" || typeof title !== "string" || typeof at !== "number") continue
      list.push({ id, title: title.slice(0, RECENT_TITLE_MAX), at })
    }
    return list.slice(0, RECENT_THREADS_MAX)
  } catch {
    return []
  }
}

type ReadableStorage = Pick<Storage, "getItem">
type WritableStorage = Pick<Storage, "setItem">

export function readRecentThreads(storage: ReadableStorage | null | undefined): RecentThread[] {
  try {
    return parseRecentThreads(storage?.getItem(RECENT_THREADS_KEY) ?? null)
  } catch {
    // 사생활 보호 모드·저장소 차단 — 목록이 비어 보일 뿐 동작에는 지장이 없다.
    return []
  }
}

export function writeRecentThreads(
  storage: WritableStorage | null | undefined,
  list: readonly RecentThread[]
) {
  try {
    storage?.setItem(RECENT_THREADS_KEY, JSON.stringify(list))
  } catch {
    // 위와 같음.
  }
}

/** 브라우저의 sessionStorage — 접근만 해도 던지는 환경이 있어 감싼다. 서버에서는 null. */
export function browserSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}
