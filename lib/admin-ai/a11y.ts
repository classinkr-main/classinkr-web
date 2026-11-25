// 갈매봇 위젯의 키보드·스크린리더 규칙 — 화면 컴포넌트가 쓰는 순수 함수.
// DOM 없이 시험할 수 있도록 판정만 여기에 둔다(점검 R27).
import { remainingMs } from "./order-state"
import type { AdminAiState } from "./store"
import type { AiBlock, OrderState } from "./types"

/** 시트 안에서 Tab 으로 닿는 요소. 숨김·비활성·tabindex -1 은 뺀다. */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

/**
 * 모달 시트의 Tab 순환 — 다음에 포커스할 인덱스를 돌려준다. null 이면 브라우저 기본 이동에 맡긴다.
 * 시트 가장자리(마지막에서 Tab, 처음에서 Shift+Tab)와, 포커스가 시트 밖·없음일 때만 개입한다.
 * count 가 0 이면 -1(시트 자체에 포커스).
 */
export function nextTrapIndex(count: number, current: number, shift: boolean): number | null {
  if (count <= 0) return -1
  if (current < 0) return shift ? count - 1 : 0
  if (!shift && current === count - 1) return 0
  if (shift && current === 0) return count - 1
  return null
}

/** 탭 목록의 방향키 이동(roving tabindex). 처리하지 않는 키는 null. 처음·끝은 맞은편으로 돈다. */
export function nextTabIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count
    case "Home":
      return 0
    case "End":
      return count - 1
    default:
      return null
  }
}

const STATE_WORD: Record<OrderState, string> = {
  draft: "확인 대기",
  editing: "수정 중",
  grace: "발송 유예 중",
  done: "완료",
  sent: "발송됨",
  aborted: "발송 취소됨",
  undone: "되돌림",
  cancelled: "취소됨",
  expired: "만료됨",
  failed: "실패",
}

function describeBlock(block: AiBlock, state: AdminAiState): string | null {
  switch (block.kind) {
    case "text":
      return block.text
    case "order": {
      const order = state.orders[block.orderId]
      // 남은 시간은 읽지 않는다 — 상태 이름만.
      return order ? `${order.title} 오더, ${order.target.label}, ${STATE_WORD[order.state]}` : null
    }
    case "read":
      return `${block.card.title}, ${block.card.target.label}`
    case "deny":
      return `${block.card.title}. ${block.card.text}`
    case "choice":
      return `${block.card.title} ${block.card.options.map((option) => option.label).join(", ")}`
    case "answer":
      return `${block.card.title}. ${block.card.answer}`
    case "links":
      return `${block.card.title}, 링크 ${block.card.items.length}개`
    case "contact":
      return `${block.card.title}, ${block.card.primary?.role ?? "담당표 미입력"}`
    case "steps":
      return null
  }
}

/**
 * 스크린리더에 알릴 "새 답변" 한 줄. 마지막으로 끝난 갈매봇 답변만 읽는다 — 대화 전체를 live 영역으로
 * 두면 매초 바뀌는 카드 시계("14:32 뒤 만료")가 계속 읽힌다. 카운트다운은 이 글에 들어가지 않는다.
 */
export function buildAdminAiAnnouncement(state: AdminAiState): string {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index]
    if (message.role !== "assistant" || message.pending) continue
    const parts = message.blocks
      .map((block) => describeBlock(block, state))
      .filter((part): part is string => Boolean(part))
    return parts.length > 0 ? `갈매봇: ${parts.join(" ")}` : ""
  }
  return ""
}

/** 만료 1분 안으로 들어온 확인 대기 오더 — 들어올 때 한 번만 바뀌는 글(초 단위로 바뀌지 않는다). */
export const EXPIRY_WARNING_MS = 60 * 1000

export function buildExpiryWarning(state: AdminAiState): string {
  const names = state.orderIds
    .map((id) => state.orders[id])
    .filter((order) => {
      if (!order || order.state !== "draft") return false
      const left = remainingMs(order, state.now)
      return left !== null && left > 0 && left <= EXPIRY_WARNING_MS
    })
    .map((order) => `${order.title}(${order.target.label})`)
  return names.length > 0 ? `${names.join(", ")} 오더가 1분 안에 만료됩니다.` : ""
}
