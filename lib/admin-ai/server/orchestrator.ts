// 갈매봇 조율기 — 한 턴(사용자 메시지 하나)을 블록 흐름으로 바꾼다. 화면과 무관하다(위컴 방 어댑터도 같은 함수를 부른다).
//
// ① 결정형 갈래(router.ts): 메시지를 질문 조각으로 나누고 조각마다 갈래를 정한다.
// ② 되묻기 후보가 가까우면 모델 어댑터(있으면)가 두 후보 중 하나만 고른다. 없거나 실패하면 되묻기 카드.
// ③ 갈래별 처리: 묻기(knowledge.ts) · 담당자/링크(contact.ts) · 조회(tools.ts) · 쓰기(writes — preview 까지) · 모름.
// 블록은 조각 순서대로 낸다. 오더는 한 턴에 하나만(위젯 상태가 턴마다 오더 하나를 받는다).
// 이 함수는 도구 execute 를 부르지 않는다 — 실행은 사람이 확인한 POST /api/admin/ai/orders/confirm 에서만.
import type { ContactCard as InternalContactCard, CustomerRef } from "@/lib/internal-cs-chat/contact"
import type { OpsActor } from "@/lib/ops-tools/actor"

import type { AdminAiStreamEvent } from "../stream-protocol"
import type { AdminAiPageContext, AiBlock, OrderTicket } from "../types"
import { CONSULTATION_INBOX_LINK_ID, consultationsBlock, type ConsultationSearchResult } from "./consultations"
import { contactBlock, linksBlock, openCustomerOf } from "./contact"
import { CUSTOMER_HISTORY_LINK_ID, customerHistoryBlocks, type CustomerHistoryResult } from "./customer-history"
import { answerKnowledge, type KnowledgeDeps } from "./knowledge"
import { askModelRoute, type AdminAiModelAdapter } from "./llm/adapter"
import { BRANCH_LABEL, routeMessageDetailed, type AskBranch, type RouteDecision, type WriteKind } from "./router"
import { hrefOf, notReadyBlock, readBlocks, TOOL_SCREEN, type OpsDeps, type ToolTurnContext } from "./tools"

export interface WriteTurnResult {
  blocks: AiBlock[]
  order?: OrderTicket
}

export interface OrchestratorDeps {
  knowledge: Omit<KnowledgeDeps, "contact">
  resolveContact: (question: string, openCustomer: CustomerRef | null) => Promise<InternalContactCard>
  ops: OpsDeps
  model: AdminAiModelAdapter | null
  /**
   * 상담 내역 찾기(consultations.ts findConsultations 를 행위자 권한과 함께 묶은 것). 없으면 상담 화면 안내만 낸다.
   * 질문·상담 글을 로그나 모델 입력으로 보내지 않는다.
   */
  consultations?: (question: string, openCustomer: CustomerRef | null, now: number) => Promise<ConsultationSearchResult>
  /**
   * 상담 내역 갈래를 통째로 막을 때 대신 낼 카드(위컴 단체방 — 답이 방 전체에 보인다). 있으면 consultations 를 부르지 않는다.
   * 묻기 답의 "관련 상담 n건" 줄은 knowledge.consultationCount 를 빼서 따로 막는다.
   */
  consultationsDenied?: AiBlock
  /**
   * 고객 이력(customer-history.ts findCustomerHistory 를 행위자 권한과 함께 묶은 것) — 고객 하나의 결제·견적·AS·API·CS 케이스 기록과
   * 담당 영업. 없으면 고객 화면 안내만 낸다. 질문·기록 글을 로그나 모델 입력으로 보내지 않는다.
   */
  customerHistory?: (question: string, openCustomer: CustomerRef | null, now: number) => Promise<CustomerHistoryResult>
  /** 고객 이력 갈래를 통째로 막을 때 대신 낼 카드(위컴 단체방). 있으면 customerHistory 를 부르지 않는다. */
  customerHistoryDenied?: AiBlock
  /** 쓰기(견적 초안·HW 배송 예정) 미리보기 — 없으면 쓰기는 모두 "아직 준비 중" 카드. */
  previewWrite?: (kind: "quote_draft" | "hw_plan", ctx: ToolTurnContext) => Promise<WriteTurnResult>
  /** 조각 하나(근거 찾기·조회·미리보기)의 시간 상한. 기본 15초 — 넘으면 "시간이 넘었습니다 — 화면에서" 카드. */
  segmentTimeoutMs?: number
}

export const SEGMENT_TIMEOUT_MS = 15_000

export interface TurnInput {
  text: string
  /** 앞선 사용자 메시지(최근 것이 뒤). 짧은 되물음("그럼 담당은?")의 대상을 잇는 데만 쓴다. */
  history?: string[]
  context: AdminAiPageContext | null
  actor: OpsActor
  now: number
}

export type Emit = (event: AdminAiStreamEvent) => void

const UNKNOWN_TEXT =
  "무엇을 도와드릴까요? 클래스인 정보 질문, 재고·견적·딜 조회, 상담 내역 찾기, 담당자·링크 찾기, 견적 초안·배송 예정 등록을 할 수 있습니다."

const STEP_LABEL: Record<RouteDecision["branch"], string> = {
  knowledge: "근거 문서 찾기",
  contact: "담당표 찾기",
  link: "링크 목록 찾기",
  read: "데이터 조회",
  consultations: "상담 내역 찾기",
  customer_history: "고객 이력 찾기",
  write: "오더 미리보기",
  unknown: "질문 확인",
}

/** "그럼 그건 누구한테 물어?" 처럼 대상이 빠진 짧은 조각이면 앞 질문을 맥락으로 붙인다. */
export function withFollowUpContext(text: string, history: readonly string[] | undefined): string {
  const previous = history?.filter((h) => h.trim()).at(-1)
  if (!previous) return text
  if (text.length <= 14 && /^(?:그럼|그러면|그건|그거|거기|이건|이거|그\s)/.test(text.trim())) return `${previous} ${text}`
  return text
}

async function askBranchBlocks(branch: AskBranch, decision: RouteDecision, input: TurnInput, deps: OrchestratorDeps): Promise<AiBlock[]> {
  const text = decision.text
  const resolveContact = (question: string) => contactBlock(question, deps.resolveContact, input.context)
  switch (branch) {
    case "knowledge":
      return answerKnowledge(text, {
        ...deps.knowledge,
        contact: async (question) => {
          const block = await resolveContact(question)
          if (block.kind !== "contact") throw new Error("contact_block_expected")
          return block.card
        },
      })
    case "contact":
      return [await resolveContact(text)]
    case "link": {
      const block = linksBlock(text)
      if (block) return [block]
      // 링크 목록에 맞는 화면이 없으면 근거 문서로 "어디서 하는지"를 답한다(없으면 담당자 + 코파일럿).
      return askBranchBlocks("knowledge", { ...decision, branch: "knowledge" }, input, deps)
    }
    case "read":
      if (!decision.read) return [{ kind: "text", text: "무엇을 조회할지 알아듣지 못했습니다." }]
      return readBlocks(decision.read, { text, actor: input.actor, context: input.context, now: input.now }, deps.ops)
    case "consultations": {
      if (deps.consultationsDenied) return [deps.consultationsDenied]
      if (!deps.consultations) {
        return [
          { kind: "text", text: "상담 내역 찾기가 아직 연결되지 않았습니다. 상담 화면에서 찾아 주세요." },
          { kind: "links", card: { title: "상담 화면", target: { label: "상담 Inbox", meta: "채널톡 상담" }, items: [{ linkId: CONSULTATION_INBOX_LINK_ID }] } },
        ]
      }
      return [consultationsBlock(await deps.consultations(text, openCustomerOf(input.context), input.now))]
    }
    case "customer_history": {
      if (deps.customerHistoryDenied) return [deps.customerHistoryDenied]
      if (!deps.customerHistory) {
        return [
          { kind: "text", text: "고객 이력 찾기가 아직 연결되지 않았습니다. 고객 화면의 활동 기록에서 확인해 주세요." },
          { kind: "links", card: { title: "고객 화면", target: { label: "통합 고객", meta: "CRM" }, items: [{ linkId: CUSTOMER_HISTORY_LINK_ID }] } },
        ]
      }
      return customerHistoryBlocks(await deps.customerHistory(text, openCustomerOf(input.context), input.now))
    }
  }
}

function clarifyBlock(decision: RouteDecision, pair: [AskBranch, AskBranch]): AiBlock {
  return {
    kind: "choice",
    card: {
      title: "무엇을 원하시나요?",
      target: { label: decision.text.length > 30 ? `${decision.text.slice(0, 29)}…` : decision.text, meta: "후보 2개" },
      options: pair.map((branch) => ({ label: BRANCH_LABEL[branch], meta: CLARIFY_HINT[branch] })),
      note: "원하는 쪽을 넣어 다시 물어봐 주세요.",
    },
  }
}

const CLARIFY_HINT: Record<AskBranch, string> = {
  knowledge: "예: \"… 은 어떻게 해?\"",
  contact: "예: \"… 은 누구한테 물어?\"",
  link: "예: \"… 화면 링크 알려 줘\"",
  read: "예: \"… 현황 보여 줘\"",
  consultations: "예: \"… 상담 최근에 있었나?\"",
  customer_history: "예: \"가나학원 결제 문제 있었나?\"",
}

async function segmentBlocks(decision: RouteDecision, input: TurnInput, deps: OrchestratorDeps, state: { orderTaken: boolean }): Promise<WriteTurnResult> {
  if (decision.branch === "unknown") return { blocks: [{ kind: "text", text: UNKNOWN_TEXT }] }

  if (decision.branch === "write") {
    const kind = decision.write ?? "other"
    if ((kind === "quote_draft" || kind === "hw_plan") && deps.previewWrite) {
      if (state.orderTaken) return { blocks: [{ kind: "text", text: "오더는 한 번에 하나만 만듭니다. 앞 오더를 확인한 뒤 다시 요청해 주세요." }] }
      // 오더를 받았다는 표시(state.orderTaken)는 runTurn 이 오더를 실제로 내보낼 때 한다(시간이 넘어 버린 미리보기는 세지 않는다).
      return deps.previewWrite(kind, { text: decision.text, actor: input.actor, context: input.context, now: input.now })
    }
    return { blocks: [notReadyBlock(kind as Exclude<WriteKind, "quote_draft" | "hw_plan">)] }
  }

  let branch: AskBranch = decision.branch
  if (decision.clarify) {
    const picked = await askModelRoute(deps.model, decision.text, decision.clarify)
    if (!picked) return { blocks: [clarifyBlock(decision, decision.clarify)] }
    branch = picked as AskBranch
  }
  return { blocks: await askBranchBlocks(branch, { ...decision, branch }, input, deps) }
}

class SegmentTimeout extends Error {}

/** 시간 상한을 넘은 조각의 카드 — 조회면 그 화면 링크를 단다. 늦게 끝난 결과(오더 포함)는 버린다. */
function timeoutBlock(decision: RouteDecision, seconds: number): AiBlock {
  const screen = decision.branch === "read" && decision.read?.kind === "tool" ? TOOL_SCREEN[decision.read.tool] : undefined
  const href = screen ? hrefOf(screen.linkId) : undefined
  return {
    kind: "deny",
    card: {
      title: "시간이 넘었습니다 — 화면에서",
      target: { label: decision.text.length > 30 ? `${decision.text.slice(0, 29)}…` : decision.text, meta: `${seconds}초 안에 답하지 못함` },
      text: `${STEP_LABEL[decision.branch]} 시간이 넘었습니다(${seconds}초). 화면에서 확인하거나 잠시 뒤 다시 물어봐 주세요.`,
      ...(screen && href ? { openLabel: screen.label, openHref: href } : {}),
    },
  }
}

async function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([task, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new SegmentTimeout()), ms)))])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** 대상 없이 담당만 묻는 짧은 조각 — "누가 맡아?", "담당은 누구야?". 고객 이름(기관 꼴)이 있으면 제 대상이 있다. */
const BARE_OWNER_ASK = /누가|누구|담당/
const HAS_OWN_CUSTOMER = /[가-힣A-Za-z0-9]{2,}(?:학원|어학원|에듀|교육|스쿨|센터|학교|아카데미|교습소)|(?:이|해당)\s*(?:고객|학원|기관|곳)/

/**
 * 고객 이력 바로 뒤의 짧은 담당 질문은 앞 조각의 고객을 잇는다 — "가나학원 결제 문제 있었나? 누가 맡아?"의 두 번째 조각이
 * 대상 없는 담당자 찾기("담당표에 없음")가 되지 않게. 다른 갈래 뒤의 조각은 그대로다(기존 판정을 바꾸지 않는다).
 */
export function inheritCustomerSubject(decision: RouteDecision, previous: RouteDecision | undefined): RouteDecision {
  if (!previous || previous.branch !== "customer_history" || decision.branch !== "contact") return decision
  const text = decision.text.trim()
  if (text.length > 14 || !BARE_OWNER_ASK.test(text) || HAS_OWN_CUSTOMER.test(text)) return decision
  return { ...decision, text: `${previous.text} ${text}` }
}

/** 한 턴 안에서 같은 담당자·링크 카드는 한 번만 낸다(복합 질문에서 근거 없는 조각마다 같은 카드가 겹치지 않게, 검토 동작-8). */
const cardKey = (block: AiBlock) => (block.kind === "contact" || block.kind === "links" ? `${block.kind}:${JSON.stringify(block.card)}` : null)

/** 한 턴을 돌린다. 이벤트는 step → block/order … 순서로 emit 하고, 끝은 호출자가 done 으로 닫는다. */
export async function runTurn(input: TurnInput, deps: OrchestratorDeps, emit: Emit): Promise<void> {
  const text = withFollowUpContext(input.text.trim(), input.history)
  emit({ type: "step", label: "질문 나누기" })
  const { decisions, dropped } = routeMessageDetailed(text)
  const state = { orderTaken: false }
  const timeoutMs = deps.segmentTimeoutMs ?? SEGMENT_TIMEOUT_MS
  const seen = new Set<string>()
  for (const [index, routed] of decisions.entries()) {
    const decision = inheritCustomerSubject(routed, decisions[index - 1])
    emit({ type: "step", label: STEP_LABEL[decision.branch] })
    let result: WriteTurnResult
    try {
      result = await withTimeout(segmentBlocks(decision, input, deps, state), timeoutMs)
    } catch (error) {
      result =
        error instanceof SegmentTimeout
          ? { blocks: [timeoutBlock(decision, Math.round(timeoutMs / 1000))] }
          : { blocks: [{ kind: "text", text: "이 질문은 처리하지 못했습니다. 잠시 뒤 다시 물어봐 주세요." }] }
    }
    // 뒤 조각이 담당자를 따로 물으면, 근거 없는 답에 붙는 담당자 카드는 빼고 뒤 조각의 카드만 낸다.
    const contactLater = decisions.slice(index + 1).some((later) => later.branch === "contact")
    const blocks = result.blocks.filter((block) => {
      if (contactLater && decision.branch !== "contact" && block.kind === "contact") return false
      const key = cardKey(block)
      if (!key) return true
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (result.order) {
      state.orderTaken = true
      emit({ type: "order", order: result.order })
    }
    for (const block of blocks) emit({ type: "block", block })
  }
  if (dropped.length) {
    emit({
      type: "block",
      block: { kind: "text", text: `질문이 많아 앞의 ${decisions.length}개만 답했습니다. 나머지(${dropped.join(" ")})는 다시 물어봐 주세요.` },
    })
  }
}

/** 시험·위컴 방 어댑터용 — 이벤트를 모아 블록 목록과 오더로 돌려준다. */
export async function collectTurn(input: TurnInput, deps: OrchestratorDeps): Promise<{ steps: string[]; blocks: AiBlock[]; orders: OrderTicket[] }> {
  const steps: string[] = []
  const blocks: AiBlock[] = []
  const orders: OrderTicket[] = []
  await runTurn(input, deps, (event) => {
    if (event.type === "step") steps.push(event.label)
    if (event.type === "block") blocks.push(event.block)
    if (event.type === "order") orders.push(event.order)
  })
  return { steps, blocks, orders }
}
