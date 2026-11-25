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
import { contactBlock, linksBlock } from "./contact"
import { answerKnowledge, type KnowledgeDeps } from "./knowledge"
import { askModelRoute, type AdminAiModelAdapter } from "./llm/adapter"
import { BRANCH_LABEL, routeMessage, type AskBranch, type RouteDecision, type WriteKind } from "./router"
import { notReadyBlock, readBlocks, type OpsDeps, type ToolTurnContext } from "./tools"

export interface WriteTurnResult {
  blocks: AiBlock[]
  order?: OrderTicket
}

export interface OrchestratorDeps {
  knowledge: Omit<KnowledgeDeps, "contact">
  resolveContact: (question: string, openCustomer: CustomerRef | null) => Promise<InternalContactCard>
  ops: OpsDeps
  model: AdminAiModelAdapter | null
  /** 쓰기(견적 초안·HW 배송 예정) 미리보기 — 없으면 쓰기는 모두 "아직 준비 중" 카드. */
  previewWrite?: (kind: "quote_draft" | "hw_plan", ctx: ToolTurnContext) => Promise<WriteTurnResult>
}

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
  "무엇을 도와드릴까요? 클래스인 정보 질문, 재고·견적·딜 조회, 담당자·링크 찾기, 견적 초안·배송 예정 등록을 할 수 있습니다."

const STEP_LABEL: Record<RouteDecision["branch"], string> = {
  knowledge: "근거 문서 찾기",
  contact: "담당표 찾기",
  link: "링크 목록 찾기",
  read: "데이터 조회",
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
}

async function segmentBlocks(decision: RouteDecision, input: TurnInput, deps: OrchestratorDeps, state: { orderTaken: boolean }): Promise<WriteTurnResult> {
  if (decision.branch === "unknown") return { blocks: [{ kind: "text", text: UNKNOWN_TEXT }] }

  if (decision.branch === "write") {
    const kind = decision.write ?? "other"
    if ((kind === "quote_draft" || kind === "hw_plan") && deps.previewWrite) {
      if (state.orderTaken) return { blocks: [{ kind: "text", text: "오더는 한 번에 하나만 만듭니다. 앞 오더를 확인한 뒤 다시 요청해 주세요." }] }
      const result = await deps.previewWrite(kind, { text: decision.text, actor: input.actor, context: input.context, now: input.now })
      if (result.order) state.orderTaken = true
      return result
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

/** 한 턴을 돌린다. 이벤트는 step → block/order … 순서로 emit 하고, 끝은 호출자가 done 으로 닫는다. */
export async function runTurn(input: TurnInput, deps: OrchestratorDeps, emit: Emit): Promise<void> {
  const text = withFollowUpContext(input.text.trim(), input.history)
  emit({ type: "step", label: "질문 나누기" })
  const decisions = routeMessage(text)
  const state = { orderTaken: false }
  for (const decision of decisions) {
    emit({ type: "step", label: STEP_LABEL[decision.branch] })
    let result: WriteTurnResult
    try {
      result = await segmentBlocks(decision, input, deps, state)
    } catch {
      result = { blocks: [{ kind: "text", text: "이 질문은 처리하지 못했습니다. 잠시 뒤 다시 물어봐 주세요." }] }
    }
    if (result.order) emit({ type: "order", order: result.order })
    for (const block of result.blocks) emit({ type: "block", block })
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
