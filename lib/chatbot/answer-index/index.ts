/**
 * 답 색인 묶음(사양 §3.1 index.ts): 라우터 스위치, 프로세스 안 색인, 질문 판정, shadow 로그.
 *
 * - getAnswerRouter(): CHATBOT_ANSWER_ROUTER(legacy 기본 · shadow · compiled). 값이 없거나 모르는 값이면 legacy.
 *   판정할 때마다 읽는다(되돌리기는 값을 바꾸고 다시 시작, §3.9).
 * - getRouterAnswerIndex(): 첫 호출에 data/answer-index 를 읽고 컴파일해 둔다. KEEP 카드는 curated.ts 의 지금 옛 답 글 해시로 대조한다.
 * - routeAnswerIndex(question, ctx): 가린 질문 글 → 결정(decide.ts). 네트워크·모델 호출 없음.
 * - logShadowDecision(): shadow 로그. 질문 글은 남기지 않는다(질문 해시 sha256 앞 12자·길이·결정·상위 3 id·확신도·legacy decidedBy).
 */
import { createHash } from "node:crypto"
import { ANSWER_INDEX_COMPILER_VERSION, compileAnswerIndex, type CompiledAnswerIndex } from "./compile"
import { curatedTextHash } from "./curated"
import { decide, decideWithAnalysis, type DecideContext, type QuestionAnalysis } from "./decide"
import {
  answerIndexDataDir,
  answerIndexVersion,
  loadAnswerIndexData,
  resetAnswerIndexCache,
  type LoadedAnswerIndexData,
} from "./load"
import type { AnswerIndexDecision, AnswerIndexRouter, AnswerIndexTrace } from "./types"

export { ANSWER_INDEX_VERSION, answerIndexDataDir, answerIndexVersion } from "./load"

type Env = Record<string, string | undefined>

/** CHATBOT_ANSWER_ROUTER: legacy(기본) · shadow · compiled. */
export function getAnswerRouter(env: Env = process.env): AnswerIndexRouter {
  const value = env.CHATBOT_ANSWER_ROUTER?.trim().toLowerCase()
  return value === "compiled" || value === "shadow" ? value : "legacy"
}

// ─── 프로세스 안 색인 ────────────────────────────────────────────────────

let cached: { dir: string; index: CompiledAnswerIndex } | null = null
let failed: { dir: string; error: Error } | null = null
let override: CompiledAnswerIndex | null = null

/**
 * 읽기에서 빠진 것이 있으면 한 번 경고한다(파일 이름·개수만, 질문 글 없음). 조각을 합치지 않았거나 JSON 이 깨지면
 * 그 파일의 카드가 조용히 빠져 모든 질문이 못 찾음으로 가므로, 운영 로그에서 바로 보이게 한다.
 */
function warnLoadIssues(data: LoadedAnswerIndexData) {
  const stale = data.excluded.filter((item) => item.reason.startsWith("stale") || item.reason.startsWith("schema")).length
  if (data.problems.length === 0 && data.skipped.length === 0 && stale === 0) return
  console.warn(
    `[chatbot] answer-index loaded with issues ${JSON.stringify({
      cards: data.cards.length,
      staleOrBroken: stale,
      skipped: data.skipped.slice(0, 5),
      problems: data.problems.slice(0, 5),
    })}`
  )
}

/**
 * 라우터가 쓰는 색인. 같은 자료 폴더면 다시 만들지 않는다.
 * 컴파일이 예외를 내면 같은 자료 폴더에서는 다시 컴파일하지 않고 같은 예외를 낸다(요청마다 몇 초씩 다시 만들지 않게).
 * 자료를 고친 뒤에는 다시 시작하거나 resetRouterAnswerIndex() 를 부른다.
 */
export function getRouterAnswerIndex(): CompiledAnswerIndex {
  if (override) return override
  const dir = answerIndexDataDir()
  if (cached && cached.dir === dir) return cached.index
  if (failed && failed.dir === dir) throw failed.error
  try {
    const data = loadAnswerIndexData({ dir, curatedTextHash })
    warnLoadIssues(data)
    const index = compileAnswerIndex(data)
    cached = { dir, index }
    failed = null
    return index
  } catch (error) {
    failed = { dir, error: error instanceof Error ? error : new Error(String(error)) }
    throw failed.error
  }
}

/** 시험용: 라우터가 쓸 색인을 바꿔 끼운다(null 이면 되돌린다). */
export function __setRouterAnswerIndexForTests(index: CompiledAnswerIndex | null) {
  override = index
}

/** 프로세스 안 색인을 버린다(다음 질문 때 다시 읽고 컴파일). */
export function resetRouterAnswerIndex() {
  cached = null
  failed = null
  resetAnswerIndexCache()
}

/** 흔적에 적을 색인 판: 그 색인의 자료 판 + 계산 규칙 판. 그 자료 폴더의 answerIndexVersion() 과 같다. */
export function answerIndexVersionOf(index: CompiledAnswerIndex) {
  return `${index.dataVersion}+c${ANSWER_INDEX_COMPILER_VERSION}`
}

// ─── 판정 ────────────────────────────────────────────────────────────────

export interface RouteContext extends DecideContext {
  /** 쓸 색인(없으면 getRouterAnswerIndex()). */
  index?: CompiledAnswerIndex
}

/** 질문 하나의 판정(§3.3). question 은 가린 글(question.redacted). */
export function routeAnswerIndex(question: string, ctx: RouteContext = {}): AnswerIndexDecision {
  const index = ctx.index ?? getRouterAnswerIndex()
  return decide(index, question, { votes: ctx.votes, isSymptomReport: ctx.isSymptomReport, env: ctx.env })
}

/**
 * routeAnswerIndex 와 같은 판정에 그 분석(질문 전체·조각의 순위·확신도)을 같이 돌려준다. 모델 선택 층(assist.ts)이 판정을 다시
 * 계산하지 않고 같은 순위에서 후보를 고른다. 판정은 routeAnswerIndex 와 같다(decide = decideWithAnalysis(...).decision).
 */
export function routeAnswerIndexWithAnalysis(question: string, ctx: RouteContext = {}): { decision: AnswerIndexDecision; analysis: QuestionAnalysis } {
  const index = ctx.index ?? getRouterAnswerIndex()
  return decideWithAnalysis(index, question, { votes: ctx.votes, isSymptomReport: ctx.isSymptomReport, env: ctx.env })
}

/** 색인 앞 단계가 답했거나 범위 밖이라 색인이 정하지 않은 질문의 흔적. */
export function preIndexTrace(router: AnswerIndexRouter, scope: "in" | "out", pre: AnswerIndexTrace["pre"] = null): AnswerIndexTrace {
  return {
    version: answerIndexVersion(),
    router,
    scope,
    decision: null,
    top: [],
    conf: null,
    unexplained: [],
    absentHit: null,
    segments: 0,
    card: null,
    partial: false,
    absentTail: null,
    pre,
  }
}

// ─── shadow 로그(§3.7) ───────────────────────────────────────────────────

export interface ShadowLogInput {
  /** 가린 질문 글(해시와 길이만 적는다). */
  question: string
  /** 색인 결정. 앞 단계가 답했거나 범위 밖이면 null. */
  decision: AnswerIndexDecision | null
  /** decision 이 null 일 때의 까닭(scope_out·greeting·policy_guard·exempt·english·handoff·tried). */
  skipped?: string | null
  /** legacy 답이 어디서 나왔는지(service.ts legacyDecidedBy). */
  legacyDecidedBy: string
}

export function shadowLogPayload(input: ShadowLogInput) {
  const decision = input.decision
  return {
    q: createHash("sha256").update(input.question, "utf8").digest("hex").slice(0, 12),
    len: input.question.replace(/\s+/g, "").length,
    decision: decision ? decision.kind : (input.skipped ?? "skipped"),
    top: decision ? decision.top.slice(0, 3).map((candidate) => candidate.id) : [],
    conf: decision ? Math.round(decision.conf * 1000) / 1000 : null,
    legacy: input.legacyDecidedBy,
  }
}

export function logShadowDecision(input: ShadowLogInput) {
  console.info(`[chatbot] answer-index shadow ${JSON.stringify(shadowLogPayload(input))}`)
}
