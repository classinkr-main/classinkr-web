// 갈매봇(어드민 AI 위젯)·원격 오더의 공용 타입.
// 기획 정본: docs/active/admin-ai-widget-remote-order-plan-2026-09-28.md
//
// 이 모듈은 순수 타입만 둔다. 화면(components/admin/ai)과 이후 붙을 서버 오더 엔진이
// 같은 모양을 공유해야 카드에 보이는 값과 실제 실행 값이 어긋나지 않는다.

/** 오더 등급(§4). 코드에 고정되며 LLM이 바꾸지 못한다. */
export type OrderRisk = "R0" | "R1" | "R2" | "R3" | "R4"

/** 오더 수명주기 상태(§5). "editing" 은 화면 전용 — 서버 티켓에는 없는 상태다. */
export type OrderState =
  | "draft"
  | "editing"
  | "grace"
  | "done"
  | "sent"
  | "aborted"
  | "undone"
  | "cancelled"
  | "expired"
  | "failed"

export type OrderIcon =
  | "task"
  | "note"
  | "lead"
  | "calendar"
  | "send"
  | "payment"
  | "stock"
  | "amount"
  | "search"
  | "lock"
  | "help"

/**
 * 되돌리기 방식.
 *  - window: 실행 뒤 10분 동안 이전 값으로 복원
 *  - previous-version: 새 버전을 만드는 오더라 이전 버전이 남는다(견적 금액 변경)
 *  - none: 되돌릴 수 없음(결제·입출고 확정, 발송)
 */
export type OrderUndoPolicy = "window" | "previous-version" | "none"

export type AdminAiCurrency = "KRW" | "CNY" | "USD"

export interface OrderField {
  key: string
  label: string
  value: string
  /** 있으면 "이전 → 이후" 로 그린다. */
  previous?: string
  /** 수정 모드에서 고칠 수 있는 값인지. 대상(target)은 필드가 아니라 고칠 수 없다. */
  editable?: boolean
  numeric?: boolean
  hint?: string
  /** 서버가 확인한 사실(예: 수신 동의 확인됨). */
  verified?: boolean
  /** 사람이 카드에서 고친 값. 갈매봇이 채운 값과 구분해 보여 준다. */
  edited?: boolean
}

export interface OrderAmount {
  label: string
  currency: AdminAiCurrency
  value: number
  /** 변경 오더일 때 이전 금액. 차액·변동률은 화면이 계산하지 않고 이 두 값에서 파생한다. */
  previous?: number
}

export interface OrderTarget {
  label: string
  meta: string
  href?: string
}

export interface OrderFailure {
  reason: string
  /** 무엇이 나갔고 안 나갔는지(예: "나간 메시지 없음"). */
  note?: string
}

export interface OrderTicket {
  id: string
  /** 오더 카탈로그 id — 예: "crm.task.create" */
  type: string
  risk: OrderRisk
  /** R2 중 돈·재고가 움직이는 민감 변경(§4.2). */
  sensitive?: boolean
  icon: OrderIcon
  title: string
  target: OrderTarget
  fields: OrderField[]
  amount?: OrderAmount
  /** 발송 오더의 본문 미리보기. */
  message?: { text: string; edited?: boolean }
  /** 이 오더가 바꾸지 않는 것. */
  untouched?: string
  confirmLabel: string
  doneText: string
  openLabel?: string
  capabilityLabel?: string
  undo: OrderUndoPolicy
  undoNote?: string

  state: OrderState
  createdAt: number
  /** 확인 대기 만료 시각. */
  expiresAt: number
  /** 수정 중에는 만료 시계를 멈춘다 — 멈춘 시점에 남아 있던 시간. */
  pausedRemainingMs?: number
  graceUntil?: number
  undoUntil?: number
  executedAt?: number
  failure?: OrderFailure
  /** 오더를 내린 화면 경로. */
  pagePath?: string
}

export interface ReadCardTable {
  head: string[]
  rows: string[][]
  /** 경고색으로 그릴 열(예: 배송예정). */
  warnColumn?: number
  /** 숫자 표가 아니면 true — 전 열을 왼쪽 정렬한다. */
  textual?: boolean
}

export interface ReadCard {
  icon: OrderIcon
  title: string
  target: OrderTarget
  table?: ReadCardTable
  log?: Array<{ when: string; text: string }>
  note?: string
  openLabel?: string
  openHref?: string
}

export interface DenyCard {
  title: string
  target: OrderTarget
  text: string
  openLabel?: string
  openHref?: string
}

export interface ChoiceCard {
  title: string
  target: OrderTarget
  options: Array<{ label: string; meta: string }>
  note?: string
}

export interface AiStep {
  label: string
  done: boolean
}

export type AiBlock =
  | { kind: "text"; text: string }
  | { kind: "steps"; steps: AiStep[] }
  | { kind: "order"; orderId: string }
  | { kind: "read"; card: ReadCard }
  | { kind: "deny"; card: DenyCard }
  | { kind: "choice"; card: ChoiceCard }

export interface AiMessage {
  id: string
  role: "user" | "assistant"
  /** user 메시지의 본문. assistant 는 blocks 를 쓴다. */
  text?: string
  blocks: AiBlock[]
  /** 답변이 아직 만들어지는 중. */
  pending?: boolean
}

export interface AdminAiEntity {
  type: "lead" | "customer" | "deal" | "quote" | "hardware_item" | "hardware_movement"
  id: string
  label: string
}

export interface AdminAiPageContext {
  path: string
  label: string
  entity?: AdminAiEntity
}

/** 갈매봇 한 턴의 결과 — 데모 어댑터와 이후 실제 API 가 같은 모양을 낸다. */
export interface AdminAiTurnResult {
  blocks: AiBlock[]
  order?: OrderTicket
}
