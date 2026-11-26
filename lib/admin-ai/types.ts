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
  /** 서버 오더의 확인표가 이미 쓰였다(같은 표를 다시 보냄) — 실행하지 않았고, 결과는 화면에서 본다. */
  | "processed"

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
  | "link"

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
  /**
   * 서버(실제 모드)가 낸 오더. ticket 은 서버가 서명한 일회용 확인 표 — 카드의 확인 버튼이 이 값을 그대로
   * POST /api/admin/ai/orders/confirm 에 보낸다. 서명 비밀이 없으면 ticket 이 없고 directHref(화면에서 직접 등록)만 있다.
   * 시안 오더에는 없다.
   */
  server?: OrderServerTicket
  /** 확인 요청을 서버에 보내 답을 기다리는 중(버튼을 막는다). */
  submitting?: boolean
}

export interface OrderServerTicket {
  ticket?: string
  /** 화면에서 직접 하는 주소 — 링크 목록(links.ts)에 있는 어드민 주소만 그려진다. */
  directHref?: string
  directLabel?: string
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
  /** 사내 자료(CRM 활동 기록 등)라 그대로 보내면 안 된다 — 위컴 글은 맨 앞에 "내부용" 줄을 단다. */
  internalOnly?: boolean
}

export interface DenyCard {
  title: string
  target: OrderTarget
  text: string
  openLabel?: string
  /** 해당 화면 주소 — 링크 목록(links.ts)에 있는 어드민 주소만 그려진다. */
  openHref?: string
}

// ── 묻기(R0) 블록 — 오더가 아니라 답·링크·담당자를 카드로 낸다(기획 §11.9) ──

/** 근거 문서의 상태. "confirmed" 는 사람이 확정한 내용, "needs-check" 는 초안·오래됨·충돌 등 확인이 필요한 내용. */
export type AnswerConfidence = "confirmed" | "needs-check"

/** 출처의 성격 — public: 공개 문서, internal: 사내 문서, consultation: 상담 사례(원문은 싣지 않는다). */
export type AnswerSourceKind = "public" | "internal" | "consultation"

export interface AnswerSource {
  /** 문서 이름(상담 사례는 "상담 사례 N건" 같은 요약). */
  title: string
  /** 문서 안의 위치(절·항목). */
  where?: string
  kind: AnswerSourceKind
  status: AnswerConfidence
  /** 고객에게 그대로 전해도 되는 문서인가. 사내 문서·상담 사례는 false. */
  externalUse: boolean
  /** 열 수 있는 화면 — 링크 목록의 id 만 쓴다. */
  linkId?: string
}

export interface AnswerCard {
  title: string
  target: OrderTarget
  /** 바로 답 — 결론 한 문장(두괄식). */
  answer: string
  /** 방법 — 한 단계 한 줄. */
  steps?: string[]
  /** 조건·주의 — 있을 때만. */
  cautions?: string[]
  confidence: AnswerConfidence
  sources: AnswerSource[]
  /**
   * 고객용 문안 — 공개 챗봇 답 색인 카드의 고객 말투 그대로(매니저 답과 따로 둔다, 점검 R18).
   * 정책 결정 대기 카드면 status 가 needs-check 이고 note 에 결정 번호가 들어간다.
   */
  customerDraft?: { text: string; status: AnswerConfidence; note?: string }
  /** 근거를 못 찾았을 때 등의 보충 한 줄. */
  note?: string
}

export interface LinksCardItem {
  /** 링크 목록의 id. 목록에 없으면 그리지 않는다. */
  linkId: string
  note?: string
}

export interface LinksCard {
  title: string
  target: OrderTarget
  items: LinksCardItem[]
  note?: string
}

export interface ContactPerson {
  /** 역할 이름 — "카메라 담당(본사)" 처럼. 사람 이름은 사내 담당표(서버)에서만 온다. */
  role: string
  /** 담당표에 이름이 있을 때만(사내 전용). */
  name?: string
  /** 연락 채널(사내 메신저 방·메일 등). 전화번호는 두지 않는다. */
  channel?: string
}

export interface ContactCard {
  title: string
  target: OrderTarget
  primary?: ContactPerson
  backup?: ContactPerson
  /** 연락하기 전에 준비해 갈 것. */
  prepare?: string[]
  /** 담당표 행을 마지막으로 확인한 날(YYYY-MM-DD). 없으면 확인일 미입력. */
  checkedAt?: string
  note?: string
}

export interface ChoiceCard {
  title: string
  target: OrderTarget
  options: Array<{ label: string; meta: string }>
  note?: string
}

// ── 상담 내역 찾기(R0) — 채널톡 상담·내부 CS 대화 목록과 그 상담으로 가는 링크 ──

export type ConsultationSource = "channel_talk" | "internal_cs"

export interface ConsultationListItem {
  id: string
  source: ConsultationSource
  /** 날짜(YYYY-MM-DD, KST). 없으면 "날짜 없음". */
  date?: string
  /** 고객·기관 표시 — 상담 글을 볼 수 있는 역할에만 싣는다. */
  who?: string
  /** 한 줄 요지 — 가린 글. 상담 글을 볼 수 있는 역할에만 싣는다. */
  summary?: string
  /** 상태 이름(진행 중·종료…). */
  status: string
  /** 그 상담을 여는 어드민 주소 — 링크 관문(isAllowedAdminHref)을 지난 주소만 그려진다. */
  href?: string
}

export interface ConsultationsCard {
  title: string
  target: OrderTarget
  /** 맨 위 결론 한 줄(두괄식) — "… 상담 3건을 찾았습니다(최근 30일)." / "찾지 못했습니다 — 조건: …". */
  headline: string
  items: ConsultationListItem[]
  /** 보인 것보다 더 있는 건수(0 이면 없음). */
  moreCount?: number
  /** 무엇으로 찾았는지 — "고객 · 낱말 · 기간 · 최근 N건 안에서". */
  basis: string
  /** 상담 글을 볼 수 없는 역할 — 건수만 보이고 CS 담당 안내를 단다. */
  restricted?: boolean
  note?: string
  /** 상담 Inbox 등 화면 바로가기 — 링크 목록 id. */
  openLinkId?: string
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
  | { kind: "answer"; card: AnswerCard }
  | { kind: "links"; card: LinksCard }
  | { kind: "contact"; card: ContactCard }
  | { kind: "consultations"; card: ConsultationsCard }

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
