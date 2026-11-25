// 직전 대화 목록 — 새 대화로 비운 대화의 "제목과 시각"만 sessionStorage 에 남긴다(새 대화 설계 N5 1단계).
//
// 대화 원문은 저장하지 않는다. 원문에는 고객 정보가 들어가므로 서버 저장·열람 범위·보관 기간을 정하는
// 결정 12("결정 대기", 추천: 본인만·30일)가 나기 전에는 브라우저 탭 안에서도 본문을 남기지 않는다.
// 제목은 대화의 "종류"다(예: "문자 1건 발송", "담당자 질문"). 사용자가 친 글에서 만들지 않는다 —
// 전화번호·사람 이름·고객명이 sessionStorage 에 남지 않게 하려는 것이다(2026-11 검토 F2).
// 탭을 닫으면 사라진다(sessionStorage).
import { ORDER_CATALOG } from "./order-catalog"
import type { AiBlock, AiMessage, OrderTicket } from "./types"

export interface RecentThread {
  id: string
  /** 대화 종류 이름(사용자 글이 아니다). */
  title: string
  /** 대화를 비운 시각(ms). */
  at: number
}

export const RECENT_THREADS_KEY = "admin-ai:recent-threads:v1"
export const RECENT_THREADS_MAX = 5
export const RECENT_TITLE_MAX = 24

const BLOCK_TITLES: Partial<Record<AiBlock["kind"], string>> = {
  contact: "담당자 질문",
  answer: "정책 질문",
  links: "링크 질문",
  read: "조회",
  deny: "실행하지 않은 요청",
  choice: "고객 선택 질문",
}

function orderKindLabel(order: Pick<OrderTicket, "type"> | undefined): string {
  return ORDER_CATALOG.find((entry) => entry.id === order?.type)?.label ?? "오더"
}

/**
 * 대화의 제목 — 오더가 있으면 첫 오더의 종류(카탈로그 이름)와 건수, 없으면 답 카드의 종류.
 * 사용자 말풍선의 글은 쓰지 않는다. 사용자 말이 없으면 null.
 */
export function recentThreadTitle(
  messages: readonly AiMessage[],
  orders: Readonly<Record<string, Pick<OrderTicket, "type">>> = {}
): string | null {
  const userCount = messages.filter((message) => message.role === "user" && message.text?.trim()).length
  if (userCount === 0) return null

  const blocks = messages.flatMap((message) => (message.role === "assistant" ? message.blocks : []))
  const orderIds = blocks.flatMap((block) => (block.kind === "order" ? [block.orderId] : []))
  let title: string
  if (orderIds.length > 0) {
    const first = orderKindLabel(orders[orderIds[0]])
    title = orderIds.length > 1 ? `${first} 외 ${orderIds.length - 1}건` : first
  } else {
    const kind = blocks.map((block) => BLOCK_TITLES[block.kind]).find((value) => value !== undefined)
    title = kind ?? `질문 ${userCount}건`
  }
  return Array.from(title).slice(0, RECENT_TITLE_MAX).join("")
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
