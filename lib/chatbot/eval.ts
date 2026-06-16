/**
 * 챗봇 품질 평가 — 골든 Q&A 셋을 실제 검색·답변 파이프라인(evaluateChatbotQuery)에 돌려 점수화.
 *
 * 서버 런타임에서만 동작(server-only). 어드민 API(app/api/admin/chatbot/eval)에서 호출한다.
 * evaluateChatbotQuery 는 분석 로그에 저장하지 않으므로 평가가 통계를 오염시키지 않는다.
 *
 * 결정적 지표: 카테고리 적중 / 답변 모드 적합 / 출처 확보.
 * LLM 심판(Gemini): 질문 충실 / 근거 충실 / 환각 / 1~5점.  GEMINI_API_KEY 없으면 심판 생략.
 *
 * 골든셋: data/chatbot-golden-set.json (운영팀 보강)
 */

import "server-only"

import fs from "node:fs"
import path from "node:path"

import { evaluateChatbotQuery } from "./service"

const JUDGE_MODEL = process.env.GEMINI_FAST_MODEL?.trim() || "gemini-3.5-flash"
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const ANSWER_MODES = new Set(["direct_answer", "doc_suggestion"])

interface GoldenCase {
  id: string
  question: string
  expectCategory: string
  expectMode: string[]
  expectPathIncludes?: string
}

interface Judgement {
  addresses: boolean
  faithful: boolean
  hallucinated: boolean
  score: number
}

export interface GoldenEvalFailure {
  id: string
  question: string
  detectedCategory: string
  expectCategory: string
  answerMode: string
  flags: string[]
}

export interface GoldenEvalReport {
  total: number
  deterministic: {
    categoryMatch: number
    modeOk: number
    withSources: number
    categoryMatchRate: number
    modeOkRate: number
    sourceRate: number
  }
  judge: {
    enabled: boolean
    judged: number
    faithfulRate: number | null
    hallucinationRate: number | null
    addressesRate: number | null
    avgScore: number | null
  }
  failures: GoldenEvalFailure[]
}

function loadGoldenCases(): GoldenCase[] {
  const file = path.join(process.cwd(), "data", "chatbot-golden-set.json")
  const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as { cases?: GoldenCase[] }
  return parsed.cases ?? []
}

async function judge(
  question: string,
  answer: string,
  sources: { title: string; excerpt: string }[]
): Promise<Judgement | null> {
  if (!GEMINI_API_KEY) return null

  const context = sources
    .map((source, index) => `[${index + 1}] ${source.title}: ${source.excerpt}`)
    .join("\n")

  const body = {
    systemInstruction: {
      parts: [
        {
          text: "너는 고객지원 답변 평가자다. 답변이 제공된 '근거'에만 기반하는지 엄격하게 채점한다. 근거에 없는 사실 주장이 있으면 hallucinated=true.",
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `질문:\n${question}\n\n근거:\n${context}\n\n답변:\n${answer}\n\n위 답변을 평가하라.`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          addresses: { type: "boolean" },
          faithful: { type: "boolean" },
          hallucinated: { type: "boolean" },
          score: { type: "integer" },
        },
        required: ["addresses", "faithful", "hallucinated", "score"],
      },
      temperature: 0,
    },
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${JUDGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null
    return JSON.parse(text) as Judgement
  } catch {
    return null
  }
}

export async function runGoldenEval(
  options: { judge?: boolean; limit?: number } = {}
): Promise<GoldenEvalReport> {
  const useJudge = options.judge !== false && Boolean(GEMINI_API_KEY)
  const allCases = loadGoldenCases()
  const cases = options.limit ? allCases.slice(0, options.limit) : allCases

  let categoryMatch = 0
  let modeOk = 0
  let withSources = 0
  let judged = 0
  let faithfulHits = 0
  let hallucinations = 0
  let addressesHits = 0
  let scoreSum = 0
  const failures: GoldenEvalFailure[] = []

  for (const testCase of cases) {
    const result = await evaluateChatbotQuery(testCase.question)
    const isCategoryMatch = result.detectedCategory === testCase.expectCategory
    const isModeOk = testCase.expectMode.includes(result.answerMode)
    const hasSources = result.sources.length > 0
    const isExpectedPathOk =
      !testCase.expectPathIncludes ||
      result.sources.some((source) => source.urlPath.includes(testCase.expectPathIncludes ?? ""))

    if (isCategoryMatch) categoryMatch += 1
    if (isModeOk) modeOk += 1
    if (hasSources) withSources += 1

    let judgement: Judgement | null = null
    if (useJudge && ANSWER_MODES.has(result.answerMode) && hasSources) {
      judgement = await judge(
        testCase.question,
        result.answer,
        result.sources.map((source) => ({ title: source.title, excerpt: source.excerpt }))
      )
      if (judgement) {
        judged += 1
        if (judgement.faithful) faithfulHits += 1
        if (judgement.hallucinated) hallucinations += 1
        if (judgement.addresses) addressesHits += 1
        scoreSum += judgement.score
      }
    }

    const flags: string[] = []
    if (!isCategoryMatch) flags.push(`category:${result.detectedCategory}≠${testCase.expectCategory}`)
    if (!isModeOk) flags.push(`mode:${result.answerMode}`)
    if (!isExpectedPathOk) flags.push(`sourcePath:${testCase.expectPathIncludes}`)
    if (judgement?.hallucinated) flags.push("hallucinated")
    if (judgement && !judgement.faithful) flags.push("unfaithful")
    if (flags.length > 0) {
      failures.push({
        id: testCase.id,
        question: testCase.question,
        detectedCategory: result.detectedCategory,
        expectCategory: testCase.expectCategory,
        answerMode: result.answerMode,
        flags,
      })
    }
  }

  const total = cases.length
  const rate = (value: number) => (total === 0 ? 0 : value / total)

  return {
    total,
    deterministic: {
      categoryMatch,
      modeOk,
      withSources,
      categoryMatchRate: rate(categoryMatch),
      modeOkRate: rate(modeOk),
      sourceRate: rate(withSources),
    },
    judge: {
      enabled: useJudge,
      judged,
      faithfulRate: judged === 0 ? null : faithfulHits / judged,
      hallucinationRate: judged === 0 ? null : hallucinations / judged,
      addressesRate: judged === 0 ? null : addressesHits / judged,
      avgScore: judged === 0 ? null : scoreSum / judged,
    },
    failures,
  }
}
