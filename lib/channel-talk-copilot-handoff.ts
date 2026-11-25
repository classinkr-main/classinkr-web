// 상담 Inbox(/admin/channel-talk)에서 내부 CS 코파일럿으로 넘길 맥락을 만드는 순수 함수.
// 고객 이름·이메일·전화번호는 넘기지 않는다(연락처가 있는지만 표시). 글은 전화·이메일·사업자번호·카드번호를 가린다.
// 코파일럿의 상담 맥락 칸(customer_context)은 브리지·Inbox 가 같은 모양으로 채운다(docs/active/cs-admin-console-ia-2026-07-27.md).
import { redactPii } from "@/lib/chatbot/pii"

export const CHANNEL_TALK_COPILOT_TAG = "bridge:channel-talk"
export const CHANNEL_TALK_COPILOT_SOURCE = "channel-talk"

const MAX_TEXT = 400
const MAX_RECENT_MESSAGES = 6

export interface HandoffConversation {
  id: string
  state?: string
  tags?: string[]
  messageCount?: number
  firstQuestion?: string
  lastMessageText?: string
  lastMessageAt?: string
  matchedLeadId?: string
  matchedLeadOrg?: string
  // 아래 세 칸은 받아도 쓰지 않는다 — 넘기지 않는다는 것을 시험이 단정할 수 있게 타입에만 둔다.
  name?: string
  email?: string
  phone?: string
}

export interface HandoffMessage {
  author: "customer" | "agent" | "bot"
  text: string
  at?: string
}

export interface CopilotHandoffRequest {
  title: string
  priority: "normal"
  tags: string[]
  customerContext: Record<string, unknown>
  initialMessage?: string
}

function clean(value: string | undefined | null, max = MAX_TEXT) {
  const text = redactPii((value ?? "").replace(/\s+/g, " ").trim())
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function buildCopilotHandoffRequest(
  conversation: HandoffConversation,
  transcript: readonly HandoffMessage[] = []
): CopilotHandoffRequest {
  const firstQuestion = clean(conversation.firstQuestion)
  const lastMessage = clean(conversation.lastMessageText)
  const recentMessages = transcript
    .slice(-MAX_RECENT_MESSAGES)
    .map((message) => ({ author: message.author, text: clean(message.text) }))
    .filter((message) => message.text)

  const customerContext: Record<string, unknown> = {
    source: CHANNEL_TALK_COPILOT_SOURCE,
    channelTalkChatId: conversation.id,
    ...(conversation.state ? { state: conversation.state } : {}),
    ...(conversation.tags?.length ? { channelTags: conversation.tags.slice(0, 20) } : {}),
    ...(conversation.messageCount != null ? { messageCount: conversation.messageCount } : {}),
    ...(firstQuestion ? { firstQuestion } : {}),
    ...(lastMessage ? { lastMessage } : {}),
    ...(conversation.lastMessageAt ? { lastMessageAt: conversation.lastMessageAt } : {}),
    ...(conversation.matchedLeadId ? { leadId: conversation.matchedLeadId } : {}),
    ...(conversation.matchedLeadOrg ? { organization: clean(conversation.matchedLeadOrg, 120) } : {}),
    ...(recentMessages.length ? { recentMessages } : {}),
    contactOnFile: Boolean(conversation.email || conversation.phone),
  }

  const titleSource = firstQuestion || lastMessage
  return {
    title: titleSource ? `채널톡 상담: ${titleSource.slice(0, 40)}` : "채널톡 상담",
    priority: "normal",
    tags: ["internal_cs", CHANNEL_TALK_COPILOT_TAG],
    customerContext,
    ...(firstQuestion ? { initialMessage: firstQuestion } : {}),
  }
}

export function copilotConversationHref(conversationId: string) {
  return `/admin/cs-chatbot?conversation=${encodeURIComponent(conversationId)}`
}
