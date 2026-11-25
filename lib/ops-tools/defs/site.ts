import "server-only"

import { readOptionalBoolean, readRequiredString } from "@/app/api/admin/hardware/_validation"
import { getCachedTrafficSummary } from "@/lib/admin/traffic-summary"
import { parseVisitorStatsRange } from "@/lib/admin-visitor-stats"
import { evaluateChatbotQuery } from "@/lib/chatbot/service"
import { hasScope } from "@/lib/ops-tools/actor"
import { schema } from "@/lib/ops-tools/defs/shared"
import { OpsToolError } from "@/lib/ops-tools/errors"
import type { ReadToolDef } from "@/lib/ops-tools/types"

export const chatbotAsk: ReadToolDef = {
  id: "knowledge.chatbot_ask",
  mcpName: "chatbot_ask",
  risk: "R0",
  requiredScope: "read",
  title: "챗봇 답 미리보기",
  description:
    "공개 챗봇에 질문을 넣어 실제 답·출처·상담 연결 판단을 본다. 분석 로그에 남지 않는다. internal=true 면 내부 CS 문서까지 근거로 쓴다(코파일럿과 같음).",
  inputSchema: schema({ question: { type: "string", maxLength: 1000 }, internal: { type: "boolean", default: false } }, ["question"]),
  async run(args, actor) {
    const question = readRequiredString(args, "question", "question")
    if (question.length > 1000) throw new OpsToolError("question 은 1000자까지.")
    const askedInternal = readOptionalBoolean(args, "internal", "internal") ?? false
    // 내부 CS 문서는 internal 범위가 있을 때만. 옛 형식 토큰은 범위에 internal 이 들어 있어 전과 같다
    const includeInternalDocs = askedInternal && hasScope(actor, "internal")
    const res = await evaluateChatbotQuery(question, { generateAnswer: true, includeInternalDocs })
    return {
      answer: res.answer,
      answerMode: res.answerMode,
      confidence: res.confidence,
      needsHandoff: res.needsHandoff,
      handoffIntent: res.handoffIntent,
      unresolved: res.unresolved,
      category: res.detectedCategory,
      intent: res.detectedIntent,
      sources: res.sources,
      suggestedQuestions: res.suggestedQuestions,
      warning: res.warning,
      ...(askedInternal && !includeInternalDocs
        ? { internal_ignored: "이 토큰에는 internal 범위가 없어 공개 문서만으로 답했다." }
        : {}),
    }
  },
}

export const siteTraffic: ReadToolDef = {
  id: "site.traffic",
  mcpName: "site_traffic",
  risk: "R0",
  requiredScope: "read",
  title: "사이트 방문·유입",
  description:
    "홈페이지 방문자·페이지뷰 일별, 홈 유입 흐름, 이벤트·버튼 클릭 수, 리드 전환. 어드민 Analytics 방문자 탭과 같은 값(60초 캐시).",
  inputSchema: schema({ range_days: { type: "integer", enum: [7, 14, 30, 90], default: 30 } }),
  async run(args) {
    const raw = args.range_days
    return getCachedTrafficSummary(parseVisitorStatsRange(raw == null ? null : String(raw)))
  },
}
