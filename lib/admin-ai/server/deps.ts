import "server-only"

// 갈매봇 조율기의 서버 연결 — 실제 자료 함수를 deps 로 묶는다. 시험은 이 파일 대신 가짜 deps 를 쓴다.
//  - 묻기: buildInternalEvidence(정리 지식·선례·공개/내부 문서) + 공개 챗봇 답 색인(읽기 전용, 고객용 문안 칸)
//  - 담당자: resolveContact + buildContactDeps(상담 검색은 끈다 — 임베딩 검색이라 비용이 들고 R17 범위 결정 전)
//  - 도구: lib/ops-tools 레지스트리·실행기
//  - 모델: 연결 전(null) — 결정형만 돈다
//  - 쓰기: preview 까지(writes.ts) + 서명 표(ADMIN_AI_TICKET_SECRET 이 있을 때만)
import { randomUUID } from "crypto"

import { routeAnswerIndex, getRouterAnswerIndex } from "@/lib/chatbot/answer-index"
import { redactPii } from "@/lib/chatbot/pii"
import { resolveContact } from "@/lib/internal-cs-chat/contact"
import { buildContactDeps } from "@/lib/internal-cs-chat/contact-deps"
import { buildInternalEvidence } from "@/lib/internal-cs-chat/context"
import { hasScope } from "@/lib/ops-tools/actor"
import { classifyToolError, OpsToolError, UNKNOWN_TOOL_ERROR_TEXT } from "@/lib/ops-tools/errors"
import { findMaskedInput, maskContactText } from "@/lib/ops-tools/redact"
import { getOpsToolByMcpName } from "@/lib/ops-tools/registry"
import { presentOpsResult, runOpsTool } from "@/lib/ops-tools/run"
import { isWriteDef } from "@/lib/ops-tools/types"

import type { CustomerPhrasing } from "./knowledge"
import { getAdminAiModelAdapter } from "./llm/adapter"
import type { OrchestratorDeps } from "./orchestrator"
import { readConfirmSetup } from "./ticket-claims"
import type { OpsDeps } from "./tools"
import { previewWriteTurn } from "./writes"

/**
 * 답 색인 상위 카드 — 고객 말투 글이 카드에 그대로 있는 것(fixed 의 text, policy)만. 문서 문장 조립 카드(doc)·증상 안내(howto)는
 * 공개 챗봇 서비스의 조립 함수가 필요해 여기서 다시 만들지 않는다(서비스 파일은 고치지 않는다).
 */
export async function answerIndexPhrasing(question: string): Promise<CustomerPhrasing | null> {
  const decision = routeAnswerIndex(redactPii(question))
  if (decision.kind !== "answer" || !decision.card) return null
  const index = getRouterAnswerIndex()
  const at = index.cardById.get(decision.card)
  const card = at == null ? undefined : index.cards[at]?.card
  if (!card) return null
  if (card.kind === "policy") return { cardId: card.id, kind: "policy", text: card.answer.text, conf: decision.conf, policyRef: card.answer.policyRef }
  if (card.kind === "fixed" && "text" in card.answer) return { cardId: card.id, kind: "fixed", text: card.answer.text, conf: decision.conf }
  return null
}

export const serverOpsDeps: OpsDeps = {
  getTool: getOpsToolByMcpName,
  run: runOpsTool,
  present: presentOpsResult,
  // 실행기(runOpsTool)에는 preview 만 부르는 길이 없어 정의를 직접 부른다 — 실행기와 같은 범위·가린 값 검사를 먼저 한다.
  preview: async (def, args, actor) => {
    if (!isWriteDef(def)) throw new OpsToolError("쓰기 도구가 아니다.", "not_write")
    if (!hasScope(actor, def.requiredScope)) throw new OpsToolError("이 계정의 역할로는 이 오더를 만들 수 없습니다.", "scope_denied")
    if (findMaskedInput(args)) throw new OpsToolError("가린 연락처는 오더 값으로 쓰지 않습니다.", "masked_input")
    return def.preview(args, actor)
  },
  describeError: async (error) => {
    const classified = await classifyToolError(error)
    return classified.kind === "user" ? maskContactText(classified.message) : UNKNOWN_TOOL_ERROR_TEXT
  },
}

/** sub 는 행위자 키(actor.ts staffKey) — 쓰기 확인 표에 서명해 싣는다. */
export function buildServerOrchestratorDeps(options: { sub: string }): OrchestratorDeps {
  const contactDeps = buildContactDeps()
  // 카드에 표를 실을지(확인 버튼) — 표 비밀 + 일회용 저장소가 있을 때만(ticket-claims.ts 한 곳에서 판정).
  const ticketSecret = readConfirmSetup().cardSecret
  return {
    knowledge: {
      evidence: (question) => buildInternalEvidence(question, { includeInternalDocs: true }),
      customerPhrasing: answerIndexPhrasing,
    },
    resolveContact: (question, openCustomer) => resolveContact(question, contactDeps, { openCustomer }),
    ops: serverOpsDeps,
    model: getAdminAiModelAdapter(),
    previewWrite: (kind, ctx) => previewWriteTurn(kind, ctx, { ops: serverOpsDeps, ticketSecret, sub: options.sub, newId: randomUUID }),
  }
}
