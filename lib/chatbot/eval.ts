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

import { evaluateChatbotQuery, listChatbotRegressionEvalCases } from "./service"

const ANSWER_MODES = new Set(["direct_answer", "doc_suggestion"])
const DEFAULT_JUDGE_MODEL = "gemini-3.5-flash"
const DEFAULT_JUDGE_TIMEOUT_MS = 8_000
const DEFAULT_EVAL_TIMEOUT_MS = 120_000

export interface GoldenEvalGateThresholds {
  categoryMatchRate: number
  modeOkRate: number
  sourceRate: number
  judgeCoverageRate: number
  faithfulRate: number
  hallucinationRate: number
}

const DEFAULT_GATE_THRESHOLDS: GoldenEvalGateThresholds = {
  categoryMatchRate: 0.92,
  modeOkRate: 0.95,
  sourceRate: 0.95,
  judgeCoverageRate: 0.95,
  faithfulRate: 0.97,
  hallucinationRate: 0.02,
} as const

interface GoldenCase {
  id: string
  question: string
  expectCategory: string
  expectMode: string[]
  expectPathIncludes?: string
  expectHeadingIncludes?: string
  expectSources?: boolean
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
  durationMs: number
  timedOutCases: number
  regressionCasesTimedOut: boolean
  deterministic: {
    categoryMatch: number
    modeOk: number
    sourceApplicable: number
    withSources: number
    categoryMatchRate: number
    modeOkRate: number
    sourceRate: number
  }
  judge: {
    enabled: boolean
    applicable: number
    judged: number
    coverageRate: number | null
    faithfulRate: number | null
    hallucinationRate: number | null
    addressesRate: number | null
    avgScore: number | null
  }
  gate: {
    passed: boolean
    thresholds: GoldenEvalGateThresholds
    checks: {
      categoryMatch: boolean
      mode: boolean
      sources: boolean
      noTimeouts: boolean
      regressionCasesLoaded: boolean
      judgeCoverage: boolean | null
      faithful: boolean | null
      hallucination: boolean | null
    }
    reasons: string[]
  }
  failures: GoldenEvalFailure[]
}

interface GoldenEvalCaseResult {
  categoryMatch: number
  modeOk: number
  sourceApplicable: number
  withSources: number
  judgeApplicable: number
  judged: number
  faithfulHits: number
  hallucinations: number
  addressesHits: number
  scoreSum: number
  timedOut: number
  failure: GoldenEvalFailure | null
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY?.trim() || null
}

function getJudgeModel() {
  return process.env.GEMINI_FAST_MODEL?.trim() || DEFAULT_JUDGE_MODEL
}

function boundedIntegerEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name])
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

function boundedRatioEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(1, Math.max(0, parsed))
}

function getJudgeTimeoutMs() {
  return boundedIntegerEnv(
    "CHATBOT_EVAL_JUDGE_TIMEOUT_MS",
    DEFAULT_JUDGE_TIMEOUT_MS,
    500,
    30_000
  )
}

function getEvalTimeoutMs() {
  return boundedIntegerEnv(
    "CHATBOT_EVAL_TIMEOUT_MS",
    DEFAULT_EVAL_TIMEOUT_MS,
    1_000,
    300_000
  )
}

function getGateThresholds(): GoldenEvalGateThresholds {
  return {
    categoryMatchRate: boundedRatioEnv(
      "CHATBOT_EVAL_MIN_CATEGORY_MATCH_RATE",
      DEFAULT_GATE_THRESHOLDS.categoryMatchRate
    ),
    modeOkRate: boundedRatioEnv(
      "CHATBOT_EVAL_MIN_MODE_OK_RATE",
      DEFAULT_GATE_THRESHOLDS.modeOkRate
    ),
    sourceRate: boundedRatioEnv(
      "CHATBOT_EVAL_MIN_SOURCE_RATE",
      DEFAULT_GATE_THRESHOLDS.sourceRate
    ),
    judgeCoverageRate: boundedRatioEnv(
      "CHATBOT_EVAL_MIN_JUDGE_COVERAGE_RATE",
      DEFAULT_GATE_THRESHOLDS.judgeCoverageRate
    ),
    faithfulRate: boundedRatioEnv(
      "CHATBOT_EVAL_MIN_FAITHFUL_RATE",
      DEFAULT_GATE_THRESHOLDS.faithfulRate
    ),
    hallucinationRate: boundedRatioEnv(
      "CHATBOT_EVAL_MAX_HALLUCINATION_RATE",
      DEFAULT_GATE_THRESHOLDS.hallucinationRate
    ),
  }
}

async function withTimeoutValue<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: () => T,
  onTimeout?: () => void
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      onTimeout?.()
      resolve(fallback())
    }, Math.max(1, timeoutMs))
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function loadGoldenCases(): GoldenCase[] {
  const file = path.join(process.cwd(), "data", "chatbot-golden-set.json")
  const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as { cases?: GoldenCase[] }
  return parsed.cases ?? []
}

async function judge(
  question: string,
  answer: string,
  sources: { title: string; excerpt: string }[],
  deadline: number
): Promise<Judgement | null> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) return null

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
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) return null

    const controller = new AbortController()
    const res = await withTimeoutValue(
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${getJudgeModel()}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        }
      ),
      Math.min(getJudgeTimeoutMs(), remainingMs),
      () => null,
      () => controller.abort()
    )
    if (!res) return null
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => worker())
  )
  return results
}

async function evaluateGoldenCase(
  testCase: GoldenCase,
  useJudge: boolean,
  deadline: number
): Promise<GoldenEvalCaseResult> {
  const result = await evaluateChatbotQuery(testCase.question, { generateAnswer: useJudge })
  const isCategoryMatch = result.detectedCategory === testCase.expectCategory
  const isModeOk = testCase.expectMode.includes(result.answerMode)
  const hasSources = result.sources.length > 0
  const isExpectedPathOk =
    !testCase.expectPathIncludes ||
    result.sources.some((source) => source.urlPath.includes(testCase.expectPathIncludes ?? ""))
  const isExpectedHeadingOk =
    !testCase.expectHeadingIncludes ||
    result.sources.some((source) => (source.heading ?? "").includes(testCase.expectHeadingIncludes ?? ""))
  const sourceApplicable = Boolean(testCase.expectPathIncludes || testCase.expectHeadingIncludes)
    ? 1
    : testCase.expectSources === false
      ? 0
      : 1

  let judged = 0
  let judgeApplicable = 0
  let faithfulHits = 0
  let hallucinations = 0
  let addressesHits = 0
  let scoreSum = 0
  let judgement: Judgement | null = null

  if (useJudge && ANSWER_MODES.has(result.answerMode) && hasSources) {
    judgeApplicable = 1
    judgement = await judge(
      testCase.question,
      result.answer,
      result.sources.map((source) => ({ title: source.title, excerpt: source.excerpt })),
      deadline
    )
    if (judgement) {
      judged = 1
      if (judgement.faithful) faithfulHits = 1
      if (judgement.hallucinated) hallucinations = 1
      if (judgement.addresses) addressesHits = 1
      scoreSum = judgement.score
    }
  }

  const flags: string[] = []
  if (!isCategoryMatch) flags.push(`category:${result.detectedCategory}≠${testCase.expectCategory}`)
  if (!isModeOk) flags.push(`mode:${result.answerMode}`)
  if (!isExpectedPathOk) flags.push(`sourcePath:${testCase.expectPathIncludes}`)
  if (!isExpectedHeadingOk) flags.push(`sourceHeading:${testCase.expectHeadingIncludes}`)
  if (sourceApplicable && !hasSources) flags.push("source:missing")
  if (judgement?.hallucinated) flags.push("hallucinated")
  if (judgement && !judgement.faithful) flags.push("unfaithful")

  return {
    categoryMatch: isCategoryMatch ? 1 : 0,
    modeOk: isModeOk ? 1 : 0,
    sourceApplicable,
    withSources: sourceApplicable && hasSources ? 1 : 0,
    judgeApplicable,
    judged,
    faithfulHits,
    hallucinations,
    addressesHits,
    scoreSum,
    timedOut: 0,
    failure:
      flags.length > 0
        ? {
            id: testCase.id,
            question: testCase.question,
            detectedCategory: result.detectedCategory,
            expectCategory: testCase.expectCategory,
            answerMode: result.answerMode,
            flags,
          }
        : null,
  }
}

function timedOutCaseResult(testCase: GoldenCase): GoldenEvalCaseResult {
  return {
    categoryMatch: 0,
    modeOk: 0,
    sourceApplicable: testCase.expectSources === false ? 0 : 1,
    withSources: 0,
    judgeApplicable: 0,
    judged: 0,
    faithfulHits: 0,
    hallucinations: 0,
    addressesHits: 0,
    scoreSum: 0,
    timedOut: 1,
    failure: {
      id: testCase.id,
      question: testCase.question,
      detectedCategory: "timeout",
      expectCategory: testCase.expectCategory,
      answerMode: "timeout",
      flags: ["evaluation_timeout"],
    },
  }
}

function evaluateGoldenCaseWithinBudget(
  testCase: GoldenCase,
  useJudge: boolean,
  deadline: number
) {
  const remainingMs = deadline - Date.now()
  if (remainingMs <= 0) return Promise.resolve(timedOutCaseResult(testCase))
  return withTimeoutValue(
    evaluateGoldenCase(testCase, useJudge, deadline),
    remainingMs,
    () => timedOutCaseResult(testCase)
  )
}

export async function runGoldenEval(
  options: { judge?: boolean; limit?: number } = {}
): Promise<GoldenEvalReport> {
  const startedAt = Date.now()
  const deadline = startedAt + getEvalTimeoutMs()
  const useJudge = options.judge !== false && Boolean(getGeminiApiKey())
  const allCases = loadGoldenCases()
  let regressionCasesTimedOut = false
  const dbCases = await withTimeoutValue(
    listChatbotRegressionEvalCases(),
    Math.max(1, deadline - Date.now()),
    () => {
      regressionCasesTimedOut = true
      return []
    }
  )
  const casesById = new Map<string, GoldenCase>()

  for (const testCase of [...allCases, ...dbCases]) {
    if (!testCase) continue
    casesById.set(testCase.id, testCase)
  }

  const cases = options.limit
    ? Array.from(casesById.values()).slice(0, options.limit)
    : Array.from(casesById.values())
  const results = await mapWithConcurrency(
    cases,
    useJudge ? 1 : 4,
    (testCase) => evaluateGoldenCaseWithinBudget(testCase, useJudge, deadline)
  )
  const totals = results.reduce(
    (acc, result) => ({
      categoryMatch: acc.categoryMatch + result.categoryMatch,
      modeOk: acc.modeOk + result.modeOk,
      sourceApplicable: acc.sourceApplicable + result.sourceApplicable,
      withSources: acc.withSources + result.withSources,
      judgeApplicable: acc.judgeApplicable + result.judgeApplicable,
      judged: acc.judged + result.judged,
      faithfulHits: acc.faithfulHits + result.faithfulHits,
      hallucinations: acc.hallucinations + result.hallucinations,
      addressesHits: acc.addressesHits + result.addressesHits,
      scoreSum: acc.scoreSum + result.scoreSum,
      timedOut: acc.timedOut + result.timedOut,
    }),
    {
      categoryMatch: 0,
      modeOk: 0,
      sourceApplicable: 0,
      withSources: 0,
      judgeApplicable: 0,
      judged: 0,
      faithfulHits: 0,
      hallucinations: 0,
      addressesHits: 0,
      scoreSum: 0,
      timedOut: 0,
    }
  )
  const failures = results
    .map((result) => result.failure)
    .filter((failure): failure is GoldenEvalFailure => Boolean(failure))

  const total = cases.length
  const rate = (value: number) => (total === 0 ? 0 : value / total)
  const sourceRate =
    totals.sourceApplicable === 0 ? 0 : totals.withSources / totals.sourceApplicable
  const categoryMatchRate = rate(totals.categoryMatch)
  const modeOkRate = rate(totals.modeOk)
  const judgeCoverageRate =
    totals.judgeApplicable === 0 ? null : totals.judged / totals.judgeApplicable
  const faithfulRate = totals.judged === 0 ? null : totals.faithfulHits / totals.judged
  const hallucinationRate = totals.judged === 0 ? null : totals.hallucinations / totals.judged
  const thresholds = getGateThresholds()
  const checks = {
    categoryMatch: categoryMatchRate >= thresholds.categoryMatchRate,
    mode: modeOkRate >= thresholds.modeOkRate,
    sources: sourceRate >= thresholds.sourceRate,
    noTimeouts: totals.timedOut === 0,
    regressionCasesLoaded: !regressionCasesTimedOut,
    judgeCoverage: useJudge
      ? judgeCoverageRate !== null && judgeCoverageRate >= thresholds.judgeCoverageRate
      : null,
    faithful: useJudge
      ? faithfulRate !== null && faithfulRate >= thresholds.faithfulRate
      : null,
    hallucination: useJudge
      ? hallucinationRate !== null && hallucinationRate <= thresholds.hallucinationRate
      : null,
  }
  const reasons: string[] = []
  if (!checks.categoryMatch) reasons.push("category_match_below_threshold")
  if (!checks.mode) reasons.push("mode_rate_below_threshold")
  if (!checks.sources) reasons.push("source_rate_below_threshold")
  if (!checks.noTimeouts) reasons.push("evaluation_timeout")
  if (!checks.regressionCasesLoaded) reasons.push("regression_cases_timeout")
  if (checks.judgeCoverage === false) reasons.push("judge_coverage_below_threshold")
  if (checks.faithful === false) reasons.push("faithful_rate_below_threshold")
  if (checks.hallucination === false) reasons.push("hallucination_rate_above_threshold")

  return {
    total,
    durationMs: Date.now() - startedAt,
    timedOutCases: totals.timedOut,
    regressionCasesTimedOut,
    deterministic: {
      categoryMatch: totals.categoryMatch,
      modeOk: totals.modeOk,
      sourceApplicable: totals.sourceApplicable,
      withSources: totals.withSources,
      categoryMatchRate,
      modeOkRate,
      sourceRate,
    },
    judge: {
      enabled: useJudge,
      applicable: totals.judgeApplicable,
      judged: totals.judged,
      coverageRate: judgeCoverageRate,
      faithfulRate,
      hallucinationRate,
      addressesRate: totals.judged === 0 ? null : totals.addressesHits / totals.judged,
      avgScore: totals.judged === 0 ? null : totals.scoreSum / totals.judged,
    },
    gate: {
      passed: reasons.length === 0,
      thresholds,
      checks,
      reasons,
    },
    failures,
  }
}
