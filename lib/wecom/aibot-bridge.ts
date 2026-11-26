// 위컴 방 → 갈매봇 조율기 어댑터. 입출력은 deps 로 받는다(서버 연결은 aibot-server.ts, 시험은 가짜).
//
// 경계(총괄 기본값, docs/active/wecom-aibot-bridge.md §방에서 보이는 것):
//  - 연결표에 없는 사람: 자료 없이 "연결되지 않은 계정입니다 — 어드민에서 써 주세요"만.
//  - 연결된 사람: 그 어드민 계정의 역할로 조율기를 부른다. 비활성·역할 없음·갈매봇 역할 밖이면 거절.
//  - 단체방(chattype group): 답이 방 전체에 보인다 — 클래스인 정보 답·링크·사내 역할 담당 안내만. 조회 도구·쓰기 미리보기·
//    고객사 담당(CRM 담당·딜 담당·고객 키)은 "1:1 로 물어봐 주세요". 행위자 범위도 비운다(이중 잠금). 담당자 찾기는
//    행위자 범위를 보지 않으므로 deps 에서 따로 막는다(서버는 고객 조회를 끄고, 여기서 고객사 카드를 바꾼다).
//  - 1:1(single): 조회 도구까지. 쓰기(견적 초안·배송 예정)는 미리보기 요지와 "어드민에서 확인" 주소만 —
//    확인표를 발급하지 않으므로(ticketSecret null) 위컴에서 실행되는 길이 없다.
//  - 연락처 원문(pii 범위)은 위컴으로 내보내지 않는다 — 역할과 상관없이 가린 값.
import type { StaffIdentity } from "@/lib/admin-ai/server/actor"
import { GALMAE_CHAT_ROLES, staffActor } from "@/lib/admin-ai/server/actor"
import type { OrchestratorDeps, TurnInput, WriteTurnResult } from "@/lib/admin-ai/server/orchestrator"
import type { OpsDeps } from "@/lib/admin-ai/server/tools"
import type { AiBlock, OrderTicket } from "@/lib/admin-ai/types"
import { hasAdminApiRole } from "@/lib/admin-auth"
import type { ContactCard as InternalContactCard } from "@/lib/internal-cs-chat/contact"
import type { OpsActor } from "@/lib/ops-tools/actor"

import type { AdminAccountLookup } from "./aibot-accounts"
import { formatTurnMarkdown } from "./aibot-format"

export const NOT_LINKED_TEXT = "연결되지 않은 계정입니다 — 어드민에서 써 주세요."
export const ACCOUNT_DENIED_TEXT = "이 계정으로는 갈매봇을 쓸 수 없습니다(비활성이거나 역할이 없습니다) — 어드민 관리자에게 문의해 주세요."
export const LOOKUP_FAILED_TEXT = "계정을 확인하지 못했습니다. 잠시 뒤 다시 물어봐 주세요."
export const GROUP_SCOPE_TEXT = "단체방에서는 고객 자료 조회·상담 내역·견적을 다루지 않습니다(방 전체에 보입니다) — 1:1 로 물어봐 주세요."
export const UNSUPPORTED_TYPE_TEXT = "글로 물어봐 주세요. 그림·파일·음성은 아직 읽지 않습니다."
export const EMPTY_TEXT = "무엇을 도와드릴까요? 클래스인 정보, 담당자, 화면 링크를 물어볼 수 있습니다."
export const MAX_QUESTION_CHARS = 1000

export type ChatType = "group" | "single"

/** 위컴 콜백 평문 JSON 중 쓰는 칸(공식 100719). */
export interface WecomInboundMessage {
  msgid: string
  aibotid: string
  chatid?: string
  chattype: ChatType
  fromUserId: string
  msgtype: string
  responseUrl?: string
  text: string | null
  /**
   * 100719 compat_info.source("非普通回调时返回" — 예: ai_assistant·channel). 일반 콜백이면 없다. 처리는 일반 글과 같고
   * 로그에만 싣는다(실물에서 어떤 경로가 섞여 오는지 확인 전). 짧은 영문 소문자 값만 받고, 그 밖은 "other".
   */
  compatSource?: string
}

const str = (value: unknown) => (typeof value === "string" ? value : "")

/** 평문 JSON → 쓰는 칸. 필수 칸(msgid·aibotid·chattype·from.userid·msgtype)이 없으면 null. */
export function parseInboundMessage(raw: unknown): WecomInboundMessage | null {
  if (!raw || typeof raw !== "object") return null
  const data = raw as Record<string, unknown>
  const from = data.from && typeof data.from === "object" ? (data.from as Record<string, unknown>) : {}
  const msgid = str(data.msgid).trim()
  const aibotid = str(data.aibotid).trim()
  const chattype = str(data.chattype).trim()
  const fromUserId = str(from.userid).trim()
  const msgtype = str(data.msgtype).trim()
  if (!msgid || !aibotid || !fromUserId || !msgtype || (chattype !== "group" && chattype !== "single")) return null
  let text: string | null = null
  if (msgtype === "text") {
    const t = data.text && typeof data.text === "object" ? str((data.text as Record<string, unknown>).content) : ""
    text = t
  } else if (msgtype === "mixed") {
    const mixed = data.mixed && typeof data.mixed === "object" ? (data.mixed as Record<string, unknown>).msg_item : null
    if (Array.isArray(mixed)) {
      text = mixed
        .map((item) => (item && typeof item === "object" && (item as Record<string, unknown>).msgtype === "text" ? str(((item as Record<string, unknown>).text as Record<string, unknown> | undefined)?.content) : ""))
        .filter(Boolean)
        .join(" ")
    }
  }
  const compat = data.compat_info && typeof data.compat_info === "object" ? (data.compat_info as Record<string, unknown>) : null
  const compatRaw = compat ? str(compat.source).trim() : ""
  const compatSource = compat ? (/^[a-z_]{1,32}$/.test(compatRaw) ? compatRaw : "other") : ""
  return {
    msgid,
    aibotid,
    chattype,
    fromUserId,
    msgtype,
    ...(str(data.chatid).trim() ? { chatid: str(data.chatid).trim() } : {}),
    ...(str(data.response_url).trim() ? { responseUrl: str(data.response_url).trim() } : {}),
    text,
    ...(compatSource ? { compatSource } : {}),
  }
}

/** 앞의 "@로봇이름" 멘션을 걷어 낸다(단체방 글은 로봇 멘션으로 시작한다, 100719 예시 "@RobotA hello robot"). */
export function stripMentions(text: string): string {
  return text.replace(/^(?:\s*@\S+)+\s*/u, "").replace(/\s+/g, " ").trim()
}

class GroupScopeError extends Error {
  constructor() {
    super("group_scope")
    this.name = "GroupScopeError"
  }
}

const groupDeny = (label: string): AiBlock => ({
  kind: "deny",
  card: { title: "1:1 로 물어봐 주세요", target: { label, meta: "단체방" }, text: GROUP_SCOPE_TEXT },
})

/** 단체방에서 고객사 담당 카드 대신 내는 카드 — 담당 이름·고객 이름·고객 키·후보를 싣지 않는다. */
export const GROUP_CUSTOMER_CONTACT: InternalContactCard = {
  kind: "customer_owner",
  who: "고객사 담당 — 1:1 로 물어봐 주세요",
  backup: null,
  prepare: ["고객사 이름"],
  channel: { label: "갈매봇 1:1 대화", href: null },
  evidence: [],
  verifiedAt: null,
  reason: GROUP_SCOPE_TEXT,
  alternatives: [],
  gaps: [],
}

/**
 * 단체방 담당자 찾기 — 열린 고객을 넘기지 않고, 고객사 담당 카드(CRM 담당·딜 담당·같은 이름 고객 키)는 1:1 안내로 바꾼다.
 * 서버 연결은 단체방에서 고객 조회(통합 고객 목록·고객 360) 자체를 끄고(aibot-server.ts), 여기서 한 번 더 막는다(이중 잠금).
 * 담당자 갈래뿐 아니라 근거를 못 찾은 묻기 갈래의 담당자 대체 길도 이 함수를 지난다.
 */
async function groupResolveContact(base: OrchestratorDeps, question: string): Promise<InternalContactCard> {
  const card = await base.resolveContact(question, null)
  // 고객 이름·후보 고객은 고객사 갈래 카드에만 실린다(contact.ts customerCard). 다른 갈래는 사내 역할 안내라 그대로.
  return card.kind === "customer_owner" ? GROUP_CUSTOMER_CONTACT : card
}

/** 단체방 — 조회 도구·쓰기 미리보기·고객 담당 조회를 막는 deps. */
export function groupScopedDeps(base: OrchestratorDeps): OrchestratorDeps {
  const ops: OpsDeps = {
    ...base.ops,
    run: async () => {
      throw new GroupScopeError()
    },
    present: async () => {
      throw new GroupScopeError()
    },
    preview: async () => {
      throw new GroupScopeError()
    },
    describeError: async (error) => (error instanceof GroupScopeError ? GROUP_SCOPE_TEXT : base.ops.describeError(error)),
  }
  return {
    ...base,
    ops,
    resolveContact: (question) => groupResolveContact(base, question),
    previewWrite: async () => ({ blocks: [groupDeny("오더")] }),
  }
}

const NO_TICKET_TAIL = /\s*(?:카드에서 확인하면 실행합니다\.|확인 설정\(서명·확인 저장소\)이 없어 여기서는 실행하지 않습니다 — 화면에서 직접 등록해 주세요\.)\s*$/u

/** 1:1 — 쓰기는 미리보기까지, 안내 문구를 위컴용으로 바꾼다. 확인표는 붙이지 않는다(ticket 을 지운다). */
export function singleScopedDeps(base: OrchestratorDeps): OrchestratorDeps {
  if (!base.previewWrite) return base
  const previewWrite = base.previewWrite
  return {
    ...base,
    previewWrite: async (kind, ctx): Promise<WriteTurnResult> => {
      const result = await previewWrite(kind, ctx)
      const blocks = result.blocks.map((block) =>
        block.kind === "text" && NO_TICKET_TAIL.test(block.text) ? { kind: "text" as const, text: block.text.replace(NO_TICKET_TAIL, "") } : block
      )
      const order: OrderTicket | undefined = result.order
        ? { ...result.order, server: result.order.server ? { ...result.order.server, ticket: undefined } : undefined }
        : undefined
      return { blocks, ...(order ? { order } : {}) }
    },
  }
}

/** 위컴에서 부르는 행위자 — 단체방은 범위 없음, 1:1 은 역할 범위에서 pii 를 뺀다. */
export function wecomActor(admin: StaffIdentity, chatType: ChatType): OpsActor {
  const base = staffActor(admin)
  const scopes = chatType === "group" ? [] : base.scopes.filter((scope) => scope !== "pii")
  return { ...base, name: `${base.name}-wecom`.slice(0, 120), scopes }
}

export interface BridgeDeps {
  /** 위컴 userid → 어드민 이메일(연결표). */
  userMap: ReadonlyMap<string, string>
  lookupAdmin: (email: string) => Promise<AdminAccountLookup>
  /** 조율기 deps — 계정 키(sub)로 만든다. 서버는 buildServerOrchestratorDeps(ticketSecret 없이), 단체방은 고객 조회를 끈 담당자 찾기. */
  orchestratorDeps: (admin: StaffIdentity, chatType: ChatType) => OrchestratorDeps
  collectTurn: (input: TurnInput, deps: OrchestratorDeps) => Promise<{ blocks: AiBlock[]; orders: OrderTicket[] }>
  siteUrl: string
  now: () => number
}

export type BridgeOutcome = "answered" | "not_linked" | "account_denied" | "lookup_failed" | "unsupported" | "empty" | "failed"

export interface BridgeReply {
  markdown: string
  outcome: BridgeOutcome
}

/** 한 글을 답 글로. 던지지 않는다(조율기 실패도 고정 문구). */
export async function answerWecomMessage(message: WecomInboundMessage, deps: BridgeDeps): Promise<BridgeReply> {
  const email = deps.userMap.get(message.fromUserId)
  if (!email) return { markdown: NOT_LINKED_TEXT, outcome: "not_linked" }
  if (message.text == null) return { markdown: UNSUPPORTED_TYPE_TEXT, outcome: "unsupported" }
  const question = stripMentions(message.text).slice(0, MAX_QUESTION_CHARS)
  if (!question) return { markdown: EMPTY_TEXT, outcome: "empty" }

  const account = await deps.lookupAdmin(email).catch((): AdminAccountLookup => ({ ok: false, reason: "lookup_failed" }))
  if (!account.ok) {
    return account.reason === "lookup_failed"
      ? { markdown: LOOKUP_FAILED_TEXT, outcome: "lookup_failed" }
      : { markdown: ACCOUNT_DENIED_TEXT, outcome: "account_denied" }
  }
  if (!hasAdminApiRole(account.admin.role, GALMAE_CHAT_ROLES)) return { markdown: ACCOUNT_DENIED_TEXT, outcome: "account_denied" }

  try {
    const base = deps.orchestratorDeps(account.admin, message.chattype)
    const orchestrator = message.chattype === "group" ? groupScopedDeps(base) : singleScopedDeps(base)
    const { blocks, orders } = await deps.collectTurn(
      { text: question, context: null, actor: wecomActor(account.admin, message.chattype), now: deps.now() },
      orchestrator
    )
    return { markdown: formatTurnMarkdown({ blocks, orders: message.chattype === "group" ? [] : orders, siteUrl: deps.siteUrl }), outcome: "answered" }
  } catch {
    return { markdown: "답을 만들지 못했습니다. 잠시 뒤 다시 물어봐 주세요.", outcome: "failed" }
  }
}
