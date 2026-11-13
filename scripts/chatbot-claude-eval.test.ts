/**
 * 사이트 챗봇 Claude 제공자 실호출 평가 — 과금이 생기므로 CHATBOT_CLAUDE_EVAL=1 일 때만 돈다.
 * `npm test`(--dir tests)에는 포함되지 않는다.
 *
 *   CHATBOT_CLAUDE_EVAL=1 CHATBOT_CLAUDE_EVAL_MODELS=claude-sonnet-5-5,claude-opus-5-5 \
 *     npx vitest run scripts/chatbot-claude-eval.test.ts
 *
 * 실제 스트림 라우트(POST /api/chatbot/query/stream)를 CHATBOT_PROVIDER=claude 로 부르고 NDJSON
 * (delta → replace → meta)를 그대로 읽는다. 라벨은 requestClaudeLabel(기본 Haiku)로 붙인다.
 * 결과는 tmp/chatbot-claude-eval.json 에 남긴다(키 값·연락처는 남기지 않는다).
 */
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

const QUESTIONS: Array<{ id: string; q: string; note: string }> = [
  { id: "Q1", q: "줌이랑 클래스인 뭐가 달라요?", note: "비교 — 수업 전·중·후" },
  { id: "Q2", q: "학원비 결제도 클래스인에서 되나요?", note: "미제공 선언, segment 추정 금지" },
  { id: "Q3", q: "저희 학원에서 데모 받아보고 싶어요. 어떻게 신청해요?", note: "데모 의도 → 상담 버튼, 연락처 미요구" },
  { id: "Q4", q: "수업 중에 카메라가 안 보여요", note: "지원 → 채널톡, 영업 권유 금지" },
  { id: "Q5", q: "혼자 과외하는데 요금제 뭐 써야 해요?", note: "요금 — 연락처 요구 0" },
  { id: "Q6", q: "학원에서 이미 쓰고 있는데 녹화가 안 보여요", note: "existing_customer + support" },
  { id: "Q7", q: "학교 정보부장인데 내년 예산 잡으려면 어떻게 해야 하나요?", note: "school, 예산 질문만으로 demo 아님" },
  { id: "Q8", q: "전자칠판만 사면 되나요?", note: "구성 질문, 기관 추정 금지" },
  { id: "Q9", q: "너무 비싸요", note: "가격 거부감 → cold" },
  { id: "Q10", q: "학부모인데 아이 수업 다시보기 어디서 봐요?", note: "parent, existing_customer 아님" },
  // 큐레이션 직답이 없는 열린 질문 — AI 최종 답변(Claude) 경로를 실제로 타는지 본다.
  { id: "Q11", q: "클래스인으로 미술 수업도 할 수 있나요?", note: "기능 범위 — 지어내기 금지" },
  { id: "Q12", q: "대형 입시학원인데 기존 LMS랑 같이 써도 되나요?", note: "academy, 연동 범위 단정 금지" },
  { id: "Q13", q: "오프라인 수업이랑 온라인 수업을 같이 하는 학원은 어떻게 운영해요?", note: "하이브리드 운영 흐름" },
  { id: "Q14", q: "원장인데 관리자 화면에서 어떤 데이터를 볼 수 있나요?", note: "admin 데이터, 지어내기 금지" },
  { id: "Q15", q: "견적 받아보고 싶은데 교실이 8개예요", note: "명시적 견적 요청 → 상담 버튼" },
  { id: "Q16", q: "태블릿으로도 수업 들을 수 있나요?", note: "기기 지원 — 확인된 범위만" },
]

type Row = {
  id: string
  model: string
  question: string
  note: string
  answer: string
  deltaCount: number
  provider: "claude" | "deterministic"
  handoffIntent?: unknown
  usage: Array<{ kind: string; model: string; inputTokens: number; outputTokens: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number; usd: number }>
  label: unknown
  /** 라우트가 결정형(큐레이션) 답을 냈을 때, 같은 초안을 Claude 비스트림 경로로 다시 써 본 결과 */
  claudeDirect?: { answer: string | null; checks: { tokenLeak: boolean; asksContact: boolean } }
  checks: { tokenLeak: boolean; asksContact: boolean }
}

async function readNdjson(response: Response) {
  const text = await response.text()
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>)
}

const CONTACT_ASK = /(연락처|전화번호|휴대폰 번호|성함).{0,12}(알려|남겨|주시|부탁|입력)/

describe.skipIf(process.env.CHATBOT_CLAUDE_EVAL !== "1")("chatbot Claude live eval", () => {
  it("runs sample questions through the stream route", async () => {
    vi.stubEnv("CHATBOT_PROVIDER", "claude")
    vi.stubEnv("CHATBOT_LABELING_ENABLED", "1")
    vi.stubEnv("GEMINI_API_KEY", "")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "")
    const models = (process.env.CHATBOT_CLAUDE_EVAL_MODELS ?? "claude-sonnet-5-5").split(",").map((m) => m.trim()).filter(Boolean)
    const only = process.env.CHATBOT_CLAUDE_EVAL_ONLY?.split(",").map((s) => s.trim())

    const budget = await import("@/lib/chatbot/claude/budget")
    const { readChatbotClaudeConfig } = await import("@/lib/chatbot/claude/config")
    const { requestClaudeLabel } = await import("@/lib/chatbot/claude/labeling")
    const { generateChatbotFinalAnswer } = await import("@/lib/chatbot/answer-provider")
    const { POST } = await import("@/app/api/chatbot/query/stream/route")
    const rows: Row[] = []

    for (const model of models) {
      vi.stubEnv("CHATBOT_CLAUDE_MODEL", model)
      for (const [index, item] of QUESTIONS.entries()) {
        if (only && !only.includes(item.id)) continue
        const before = budget.getRecentClaudeUsage().length
        const res = await POST(
          new NextRequest("https://classin.kr/api/chatbot/query/stream", {
            method: "POST",
            headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${models.indexOf(model)}.${index + 1}` },
            body: JSON.stringify({ message: item.q }),
          })
        )
        const events = await readNdjson(res)
        const deltas = events.filter((e) => e.type === "delta")
        const replace = events.filter((e) => e.type === "replace").pop() as { answer?: string } | undefined
        const meta = events.find((e) => e.type === "meta") as { meta?: Record<string, unknown> } | undefined
        const answer = replace?.answer ?? ""
        const answerUsage = budget.getRecentClaudeUsage().slice(before)
        const config = readChatbotClaudeConfig()
        const label = answer
          ? await requestClaudeLabel(
              { sessionId: "eval", question: item.q, answer, category: String(meta?.meta?.category ?? ""), intent: String(meta?.meta?.intent ?? ""), handoffIntent: String(meta?.meta?.handoffIntent ?? "") },
              config
            )
          : null
        const provider = answerUsage.some((u) => u.kind === "answer") ? "claude" : "deterministic"
        let claudeDirect: Row["claudeDirect"]
        if (provider === "deterministic" && process.env.CHATBOT_CLAUDE_EVAL_DIRECT !== "0") {
          const direct = await generateChatbotFinalAnswer({
            question: item.q,
            category: String(meta?.meta?.category ?? "general"),
            intent: String(meta?.meta?.intent ?? ""),
            answerMode: "direct_answer",
            draftAnswer: answer,
            sources: [],
            handoffIntent: meta?.meta?.handoffIntent === "support" ? "support" : "demo",
          })
          claudeDirect = {
            answer: direct,
            checks: { tokenLeak: /LEAD_SUBMIT|\[CONTENT_SUGGEST/.test(direct ?? ""), asksContact: CONTACT_ASK.test(direct ?? "") },
          }
        }
        const usage = budget.getRecentClaudeUsage().slice(before)
        rows.push({
          id: item.id,
          model,
          question: item.q,
          note: item.note,
          answer,
          deltaCount: deltas.length,
          provider,
          claudeDirect,
          handoffIntent: meta?.meta?.handoffIntent,
          usage,
          label,
          checks: { tokenLeak: /LEAD_SUBMIT|\[CONTENT_SUGGEST/.test(answer), asksContact: CONTACT_ASK.test(answer) },
        })
        expect(res.status).toBe(200)
        expect(events.at(-1)?.type).toBe("meta")
      }
    }

    const out = path.join(process.cwd(), "tmp")
    mkdirSync(out, { recursive: true })
    const total = rows.flatMap((r) => r.usage).reduce((s, u) => s + u.usd, 0)
    writeFileSync(path.join(out, "chatbot-claude-eval.json"), JSON.stringify({ rows, totalUsd: total }, null, 2))
    console.log(`eval rows=${rows.length} totalUsd=${total.toFixed(4)}`)
  }, 600_000)
})
