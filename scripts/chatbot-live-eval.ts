/**
 * 질문 묶음을 공개 챗봇 경로에 실제 모델(Gemini)로 돌려 답을 JSONL 로 남기는 측정 스크립트.
 *
 * 실행:
 *   npx tsx scripts/chatbot-live-eval.ts --in <questions.json> --out <results.jsonl> [--concurrency 4] [--mode select|generate|off] [--gate on|off] [--second-chance on|off] [--router legacy|shadow|compiled] [--allow-model-errors]
 *
 * - 입력: [{ id, question, group?, expectTopic? }] 또는 { cases: [...] }(data/chatbot-first-contact-set.json).
 * - 질문마다 세션 없이 evaluateChatbotQuery(공개 경로 코어, 말투·후속 질문 포함)를 독립 실행한다.
 * - 데이터베이스 없이 돈다: Supabase env 를 import 전에 지워 정적 문서 검색으로 고정한다.
 *   evaluateChatbotQuery 는 persistExchange 를 부르지 않는다(lib/chatbot/service.ts 의 handleChatbotQuery 만 부른다).
 * - GEMINI_API_KEY 는 환경(또는 .env.local)의 값을 쓴다. 키가 없으면 모델 경로가 조용히 꺼지므로 시작 전에 중단한다.
 * - --gate 는 정해 둔 답 확인 관문(CHATBOT_ANSWER_GATE, lib/chatbot/answer-gate.ts)을 켜고 끈다. 기본은 on.
 *   결과 줄의 gate 는 kept(판정 후 유지)·rejected(버리고 문서 경로)·skipped(꺼짐·실패로 판정 없이 유지)·none(대상 아님),
 *   gateOriginal 은 판정 대상이던 정해 둔 답의 출처(버려졌으면 버려진 답), gateMs 는 판정에 쓴 시간이다.
 *   gateSkipReason 은 skipped 의 이유다(off·no_key·timeout·error·model_unavailable 등).
 * - secondChance 는 못 찾았을 때 목차에서 다시 고르는 두 번째 검색(CHATBOT_SECOND_CHANCE, lib/chatbot/service.ts)의 결과다.
 *   hit(목차에서 고른 절의 문장으로 답함)·miss(돌렸지만 못 찾음 유지)·none(대상 아님·꺼짐), secondChanceMs 는 그 시간,
 *   secondChanceReason 은 miss·none 의 이유다. --second-chance on|off 로 켜고 끈다(기본 on).
 * - --router 는 답 라우터(CHATBOT_ANSWER_ROUTER: legacy·shadow·compiled, 답 색인 사양 §3.8)를 정한다. 주면 서비스 모듈을
 *   불러오기 전에 환경변수를 그 값으로 둔다. 결과 줄의 router 는 그 값(안 주면 환경변수, 그것도 없으면 legacy)이다.
 *   코어가 답 색인 흔적(answerIndex)을 내면 결과 줄에 그대로 싣고, 색인이 답을 정한 줄의 decidedBy 는
 *   index:<카드>·index-partial:<카드>·index-gap:<카드>·index-abstain·index-clarify 다(사양 §3.7, scripts/lib/chatbot-live-eval-checks.ts).
 * - 무효 측정 알아채기: 결과 줄의 modelError 는 그 줄의 답에 쓰이는 Gemini 호출(관문·근거 선별·목차 고르기·답 생성)이
 *   401·402·403(결제 크레딧 소진·키 인증 실패)을 받았거나, 그 때문에 열린 차단기(lib/chatbot/llm.ts)가 그 호출을 막았거나
 *   (geminiBlocked: 관문이 차단기를 보고 판정 없이 넘긴 것 포함), 관문·두 번째 검색이 model_unavailable 로 넘어간 경우 true 다.
 *   모델 단계(--mode·--gate·--second-chance)를 모두 끈 측정은 모델을 일부러 끈 것이라 modelError 가 늘 false 다.
 *   임베딩(embedContent)은 세지 않는다: 이 스크립트에는 벡터 검색이 없어 임베딩이 실패해도 답이 같다.
 *   답 글에 고정 문구(MODEL_UNAVAILABLE_ANSWER)가 있다는 것만으로는 modelError 가 아니다.
 *   modelError 줄이 전체의 5% 를 넘으면 "측정 무효"를 찍고 종료 코드 2 로 끝나고, 처음 끝난 20줄에서 모델을 부른 줄이
 *   모두 그렇다면 거기서 멈춘다. 2026-11-18 크레딧 소진 때 모든 호출이 402 였는데도 '오류 0'으로 끝나 무효 측정이 채점까지 갔다.
 *   모델이 죽은 상태의 동작을 일부러 잴 때만 --allow-model-errors 를 준다.
 * - 모델 없는 측정(--mode off --gate off --second-chance off)은 질문당 Gemini 호출이 0 이어야 한다(사양 §2.2). 호출이 나갔거나
 *   차단기에 막힌 줄이 있으면 router=compiled 는 "측정 무효"로 종료 코드 3, 그 밖은 경고와 줄 수만 찍는다.
 * - 종료 코드: 0 정상, 1 그 밖의 실패, 2 무효 측정(모델 호출 실패)·사용법 오류, 3 모델 없는 compiled 측정에서 Gemini 호출이 나감.
 */

// Mock server-only for non-Next.js CLI execution (scripts/run-chatbot-golden-eval.ts 와 같은 방식)
import Module from "node:module"
type RequireFn = (this: unknown, id: string) => unknown
const moduleProto = (Module as unknown as { prototype: { require: RequireFn } }).prototype
const originalRequire = moduleProto.require
moduleProto.require = function (this: unknown, id: string) {
  if (id === "server-only") return {}
  return originalRequire.call(this, id)
}

import { AsyncLocalStorage } from "node:async_hooks"
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import {
  checkModelFreeRun,
  classifyBlockedGeminiCall,
  countAnswerModelCalls,
  decidedByFromAnswerIndex,
  hasModelError,
  isTransientGeminiFailure,
  parseAnswerRouter,
  type AnswerRouter,
  type GeminiCallRecord,
} from "./lib/chatbot-live-eval-checks"

function loadEnvLocal() {
  const envPath = join(process.cwd(), ".env.local")
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!match) continue
    // 데이터베이스 설정은 읽지 않는다(정적 문서 경로로만 잰다).
    if (/SUPABASE/.test(match[1])) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[match[1]]) process.env[match[1]] = value
  }
}

interface EvalInput {
  id: string
  question: string
  group?: string
  expectTopic?: string | null
}

interface GeminiTrace {
  calls: number
  statuses: number[]
  /** 나간 호출마다 종류와 상태(modelError 판정용). */
  records: GeminiCallRecord[]
  /** 결제·인증 실패 차단기 때문에 보내지 않은 호출 수. */
  blocked: number
  /** 차단기가 막은 호출의 종류별 수(embedContent·generateContent). */
  blockedKinds: Record<string, number>
  /** 호출 종류별 횟수(generateContent=답·선별 생성, embedContent=검색 임베딩). */
  kinds: Record<string, number>
}

const newTrace = (): GeminiTrace => ({ calls: 0, statuses: [], records: [], blocked: 0, blockedKinds: {}, kinds: {} })

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index !== -1 ? process.argv[index + 1] : undefined
}

function usage(message?: string): never {
  if (message) console.error(`오류: ${message}`)
  console.error(
    "사용법: npx tsx scripts/chatbot-live-eval.ts --in <questions.json> --out <results.jsonl> [--concurrency 4] [--mode select|generate|off] [--gate on|off] [--second-chance on|off] [--router legacy|shadow|compiled] [--allow-model-errors]"
  )
  process.exit(2)
}

function readInputs(path: string): EvalInput[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown
  const list = Array.isArray(raw) ? raw : (raw as { cases?: unknown })?.cases
  if (!Array.isArray(list)) usage("입력은 배열 또는 {cases:[...]} 형태여야 합니다.")
  const seen = new Set<string>()
  return list.map((item, index) => {
    const row = item as Partial<EvalInput>
    if (typeof row?.question !== "string" || !row.question.trim()) usage(`${index + 1}번째 항목에 question 이 없습니다.`)
    const id = typeof row.id === "string" && row.id ? row.id : `q${String(index + 1).padStart(3, "0")}`
    if (seen.has(id)) usage(`id 가 중복됩니다: ${id}`)
    seen.add(id)
    return { id, question: row.question, group: row.group, expectTopic: row.expectTopic ?? null }
  })
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function tally(values: string[]) {
  const counts: Record<string, number> = {}
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]))
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

// 모델 호출 실패 줄이 이 비율을 넘으면 측정 무효로 본다.
const MODEL_ERROR_MAX_RATIO = 0.05
// 처음 이만큼이 모두 모델 호출 실패면 남은 질문을 돌리지 않고 멈춘다.
const MODEL_ERROR_EARLY_STOP_ROWS = 20

// 모델 없는 측정에서 Gemini 를 부르려 한 줄이 있으면 compiled 측정은 무효다(종료 코드 3).
const EXIT_MODEL_FREE_VIOLATION = 3

async function main() {
  const inPath = argValue("--in")
  const outPathArg = argValue("--out")
  if (!inPath || !outPathArg) usage()
  const outPath: string = outPathArg
  const concurrency = Math.max(1, Math.min(16, Math.trunc(Number(argValue("--concurrency") ?? 4)) || 4))
  const mode = (argValue("--mode") ?? "select").toLowerCase()
  if (mode !== "select" && mode !== "generate" && mode !== "off") usage(`--mode 는 select|generate|off 중 하나여야 합니다: ${mode}`)
  const gateSwitch = (argValue("--gate") ?? "on").toLowerCase()
  if (gateSwitch !== "on" && gateSwitch !== "off") usage(`--gate 는 on|off 중 하나여야 합니다: ${gateSwitch}`)
  const secondChanceSwitch = (argValue("--second-chance") ?? "on").toLowerCase()
  if (secondChanceSwitch !== "on" && secondChanceSwitch !== "off") {
    usage(`--second-chance 는 on|off 중 하나여야 합니다: ${secondChanceSwitch}`)
  }

  const routerArg = argValue("--router")
  const routerFlag = routerArg === undefined ? null : parseAnswerRouter(routerArg)
  if (routerArg !== undefined && !routerFlag) usage(`--router 는 legacy|shadow|compiled 중 하나여야 합니다: ${routerArg}`)

  const allowModelErrors = process.argv.includes("--allow-model-errors")
  // 답에 모델을 쓰는 단계가 하나라도 켜져 있는지. 모두 끈 측정은 모델 없는 측정이다(Gemini 호출 0 이어야 함).
  const modelStagesEnabled = mode !== "off" || gateSwitch === "on" || secondChanceSwitch === "on"
  const modelFree = !modelStagesEnabled
  const inputs = readInputs(resolve(inPath))

  // 1) 환경 정리 — lib/chatbot 을 import 하기 전에 해야 한다.
  loadEnvLocal()
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ]) {
    delete process.env[name]
  }
  // NODE_ENV=test 면 모델 호출 보조 동작(실패 로그 등)이 꺼진다. 측정에서는 test 로 두지 않는다.
  if (process.env.NODE_ENV === "test") (process.env as Record<string, string>).NODE_ENV = "development"
  process.env.CHATBOT_FINAL_ANSWER_LLM = mode
  process.env.CHATBOT_ANSWER_GATE = gateSwitch
  process.env.CHATBOT_SECOND_CHANCE = secondChanceSwitch
  if (routerFlag) process.env.CHATBOT_ANSWER_ROUTER = routerFlag
  const envRouter = process.env.CHATBOT_ANSWER_ROUTER
  if (!routerFlag && envRouter?.trim() && !parseAnswerRouter(envRouter)) {
    console.error(`경고: CHATBOT_ANSWER_ROUTER 값을 알 수 없습니다(${envRouter}). 결과 줄의 router 는 legacy 로 적습니다.`)
  }
  const router: AnswerRouter = routerFlag ?? parseAnswerRouter(envRouter) ?? "legacy"
  if (mode !== "off" && !process.env.GEMINI_API_KEY?.trim()) {
    usage("GEMINI_API_KEY 가 없습니다. 모델 경로가 조용히 꺼지므로 중단합니다(--mode off 는 키 없이 가능).")
  }

  // 2) 질문별 Gemini 호출 추적 — lib 를 고치지 않고 fetch 를 감싸 질문 단위(AsyncLocalStorage)로 센다.
  const traceStore = new AsyncLocalStorage<GeminiTrace>()
  const realFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const trace = url.includes("generativelanguage.googleapis.com") ? traceStore.getStore() : undefined
    if (!trace) return realFetch(input, init)
    trace.calls += 1
    const kind = url.match(/:(\w+)(?:\?|$)/)?.[1] ?? "other"
    trace.kinds[kind] = (trace.kinds[kind] ?? 0) + 1
    try {
      const res = await realFetch(input, init)
      trace.statuses.push(res.status)
      trace.records.push({ kind, status: res.status })
      return res
    } catch (error) {
      trace.statuses.push(0)
      trace.records.push({ kind, status: 0 })
      throw error
    }
  }) as typeof fetch

  const { setModelCircuitBlockedListener } = await import("../lib/chatbot/llm")
  // 차단기가 막은 호출도 그 질문의 추적에 센다(네트워크로 나가지 않아 fetch 감싸기로는 보이지 않는다).
  // 알림에는 URL 이 없어, 임베딩인지는 호출 스택으로 가린다(임베딩 차단은 modelError 로 세지 않는다).
  setModelCircuitBlockedListener(() => {
    const trace = traceStore.getStore()
    if (!trace) return
    trace.blocked += 1
    const kind = classifyBlockedGeminiCall(new Error().stack)
    trace.blockedKinds[kind] = (trace.blockedKinds[kind] ?? 0) + 1
  })
  const { evaluateChatbotQuery, WEAK_SOURCE_DRAFT_ANSWER, NO_SOURCE_FACT_ANSWER, MODEL_UNAVAILABLE_ANSWER, redactPii } =
    await import("../lib/chatbot/service")
  const { findBasicQuickAnswers } = await import("../lib/chatbot/quick-answers-basics")
  const { findFieldQuickAnswer } = await import("../lib/chatbot/quick-answers-field")
  const { resolveSymptomTriage } = await import("../lib/chatbot/symptom-triage")
  const { glossForRouting } = await import("../lib/chatbot/tone")

  const firstLine = (text: string) => text.split("\n").find((line) => line.trim())?.trim() ?? ""
  const isWeakSourceAnswer = (answer: string) => answer.includes(firstLine(WEAK_SOURCE_DRAFT_ANSWER))
  // 출처 없는 사실 질문의 못 찾음 고정 문구. 출처가 없어 예전에는 policy 로 적혔다.
  const isNoSourceAnswer = (answer: string) => answer.includes(firstLine(NO_SOURCE_FACT_ANSWER))

  // 이미 export 된 판별 함수를 따로 불러, 최종 답에 그 답의 첫 문장이 들어 있는지로 어느 경로가 답했는지 가린다.
  // (앞선 정책 가드 등이 먼저 답했는데 질문만 우연히 맞는 경우를 걸러 내려는 확인이다.)
  function decideBy(
    question: string,
    result: {
      answer: string
      sources: unknown[]
      answerMode: string
      answerGate: { gate: string; gateOriginal?: string }
      secondChance: { secondChance: string }
      answerIndex?: unknown
    },
    trace: GeminiTrace
  ): string {
    // 답 색인(compiled)이 정한 답이면 그 결정이다. 범위 밖(scope=out)·shadow 는 아래 기존 판별을 쓴다.
    const indexDecision = decidedByFromAnswerIndex(result.answerIndex)
    if (indexDecision) return indexDecision
    // 답에 쓰이는 모델 호출(임베딩 제외)이 나갔거나 차단기에 막혔는지.
    const answerModel = countAnswerModelCalls(trace.kinds, trace.blockedKinds)
    const usedAnswerModel = answerModel.calls > 0 || answerModel.blocked > 0
    // 못 찾음 뒤 목차에서 다시 골라 답했으면 그 경로다(관문이 버린 뒤의 문서 경로에서도 돌 수 있다).
    if (result.secondChance.secondChance === "hit") return "second_chance"
    // 근거 선별 호출이 실패해 확인 안 된 조각 대신 고정 문구를 냈다.
    if (result.answer.includes(firstLine(MODEL_UNAVAILABLE_ANSWER))) return "model_unavailable"
    // 관문이 정해 둔 답을 버렸으면 문서 경로(근거 선별) 답이다. 버린 답과 질문이 같은 판별 함수에 다시 걸리지 않게 먼저 본다.
    if (result.answerGate.gate === "rejected") {
      if (isWeakSourceAnswer(result.answer)) return "not_found"
      return result.sources.length > 0 ? "gate_evidence_select" : "gate_not_found"
    }
    // 관문이 유지한 틀 답·정책 답·상담 연결·운영 가이드 답은 관문 호출 때문에 모델 호출이 있어도 그 답의 출처로 적는다.
    const kept = result.answerGate.gateOriginal
    if (kept && result.answerGate.gate !== "none" && !/^(?:field|basics|symptom):/.test(kept)) return kept

    const text = redactPii(question.replace(/\s+/g, " ").trim()).toLowerCase()
    const answer = result.answer

    const field = findFieldQuickAnswer(text)
    if (field && field.answer[0] && answer.includes(field.answer[0])) return `field:${field.id}`

    const basics = findBasicQuickAnswers(text)
    if (basics[0]?.answer[0] && answer.includes(basics[0].answer[0])) return `basics:${basics[0].id}`

    const routingText = glossForRouting(redactPii(question.replace(/\s+/g, " ").trim()))
    for (const compact of [false, true]) {
      const triage = resolveSymptomTriage(routingText, { compact })
      const head = triage ? firstLine(triage.answer) : ""
      if (head && answer.includes(head)) return "symptom"
    }

    if (isWeakSourceAnswer(answer) || isNoSourceAnswer(answer)) return "not_found"

    if (result.sources.length > 0) {
      if (mode === "off" || !usedAnswerModel) return "draft"
      return mode === "generate" ? "generate" : "evidence_select"
    }
    // 출처가 없고 답에 쓰이는 모델도 부르지 않았다(차단기가 막은 호출도 없음) → 정책 가드·인사·상담 연결 등 코드에 박힌 지름길.
    if (!usedAnswerModel) return "policy"
    return "unknown"
  }

  const isTransientFailure = (trace: GeminiTrace) => isTransientGeminiFailure(trace.records)

  const modelErrorOf = (trace: GeminiTrace, skipReasons: Array<string | null | undefined> = []) =>
    hasModelError({ modelStagesEnabled, calls: trace.records, blockedKinds: trace.blockedKinds, skipReasons })

  async function runOne(item: EvalInput) {
    const maxAttempts = 3
    let lastError = ""
    let lastTrace: GeminiTrace = newTrace()
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const trace: GeminiTrace = newTrace()
      lastTrace = trace
      const startedAt = Date.now()
      try {
        const result = await traceStore.run(trace, () => evaluateChatbotQuery(item.question))
        // 모델 호출이 전부 429/5xx 로 끝나 초안으로 떨어진 경우는 일시 오류로 보고 다시 시도한다.
        if (isTransientFailure(trace) && attempt < maxAttempts) {
          lastError = `gemini transient status ${trace.statuses.join(",")}`
          await sleep(1500 * attempt)
          continue
        }
        // 답 색인 흔적은 코어가 낼 때만 싣는다(응답에는 실리지 않는 측정 필드, 사양 §3.7).
        const answerIndex = (result as { answerIndex?: unknown }).answerIndex
        return {
          id: item.id,
          group: item.group ?? null,
          question: item.question,
          expectTopic: item.expectTopic ?? null,
          router,
          answer: result.answer,
          answerMode: result.answerMode,
          confidence: result.confidence,
          unresolved: result.unresolved,
          needsHandoff: result.needsHandoff,
          handoffIntent: result.handoffIntent ?? null,
          detectedCategory: result.detectedCategory,
          detectedIntent: result.detectedIntent,
          warning: result.warning ?? null,
          sources: result.sources.map((source) => ({
            title: source.title,
            path: source.urlPath,
            heading: source.heading ?? null,
            score: source.score,
          })),
          decidedBy: decideBy(item.question, { ...result, answerIndex }, trace),
          ...(answerIndex !== undefined ? { answerIndex } : {}),
          gate: result.answerGate.gate,
          gateOriginal: result.answerGate.gateOriginal ?? null,
          gateMs: result.answerGate.gateMs ?? null,
          gateSkipReason: result.answerGate.skipReason ?? null,
          secondChance: result.secondChance.secondChance,
          secondChanceMs: result.secondChance.secondChanceMs ?? null,
          secondChanceReason: result.secondChance.reason ?? null,
          latencyMs: Date.now() - startedAt,
          geminiCalls: trace.calls,
          geminiStatuses: trace.statuses,
          geminiBlocked: trace.blocked,
          geminiBlockedKinds: trace.blockedKinds,
          modelError: modelErrorOf(trace, [result.answerGate.skipReason, result.secondChance.reason]),
          geminiKinds: trace.kinds,
          attempts: attempt,
          error: isTransientFailure(trace) ? lastError : null,
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        const retryable = /429|rate|quota|timeout|timed out|ECONNRESET|ETIMEDOUT|fetch failed|50\d/i.test(lastError)
        if (!retryable || attempt === maxAttempts) break
        await sleep(1500 * attempt)
      }
    }
    return {
      id: item.id,
      group: item.group ?? null,
      question: item.question,
      expectTopic: item.expectTopic ?? null,
      router,
      answer: null,
      answerMode: null,
      confidence: null,
      unresolved: null,
      needsHandoff: null,
      handoffIntent: null,
      detectedCategory: null,
      detectedIntent: null,
      warning: null,
      sources: [],
      decidedBy: "unknown",
      gate: null,
      gateOriginal: null,
      gateMs: null,
      gateSkipReason: null,
      secondChance: null,
      secondChanceMs: null,
      secondChanceReason: null,
      latencyMs: 0,
      geminiCalls: lastTrace.calls,
      geminiStatuses: lastTrace.statuses,
      geminiBlocked: lastTrace.blocked,
      geminiBlockedKinds: lastTrace.blockedKinds,
      modelError: modelErrorOf(lastTrace),
      geminiKinds: lastTrace.kinds,
      attempts: maxAttempts,
      error: lastError || "unknown error",
    }
  }

  mkdirSync(dirname(resolve(outPath)), { recursive: true })
  writeFileSync(resolve(outPath), "")

  console.error(
    `질문 ${inputs.length}개 / 동시 ${concurrency} / 모드 ${mode} / 관문 ${gateSwitch} / 두 번째 검색 ${secondChanceSwitch} / 라우터 ${router}` +
      ` / Gemini 키 ${process.env.GEMINI_API_KEY ? "있음" : "없음"}` +
      (modelFree ? " / 모델 없는 측정(Gemini 호출 0 이어야 함)" : "") +
      (allowModelErrors ? " / 모델 호출 실패 허용(--allow-model-errors)" : "")
  )

  type Row = Awaited<ReturnType<typeof runOne>>
  const rows: (Row | undefined)[] = new Array(inputs.length)
  let nextIndex = 0
  let flushed = 0
  let stoppedEarly = false
  const startedAll = Date.now()

  // 동시 실행이어도 줄 순서는 입력 순서다: 앞 순번이 끝난 만큼만 이어서 쓴다.
  function flush() {
    while (flushed < rows.length && rows[flushed]) {
      appendFileSync(resolve(outPath), `${JSON.stringify(rows[flushed])}\n`)
      flushed += 1
    }
  }

  // 처음 끝난 20줄에서 모델을 부른 줄이 모두 모델 호출 실패면 남은 질문을 돌리지 않는다(키·결제 문제를 먼저 고쳐야 한다).
  // 정해 둔 답·정책 답처럼 답에 쓰이는 모델을 부르지 않는 줄(임베딩만 부른 줄 포함)은 실패도 성공도 아니라 뺀다.
  // 첫 질문은 준비 때문에 늦게 끝나므로 끝난 순서로 본다.
  const completed: Row[] = []
  function checkEarlyStop(row: Row) {
    completed.push(row)
    if (allowModelErrors || stoppedEarly || completed.length !== MODEL_ERROR_EARLY_STOP_ROWS) return
    const usedModel = completed.filter((item) => {
      const answerModel = countAnswerModelCalls(item.geminiKinds, item.geminiBlockedKinds)
      return item.modelError || answerModel.calls + answerModel.blocked > 0
    })
    if (usedModel.length > 0 && usedModel.every((item) => item.modelError)) {
      stoppedEarly = true
      console.error(
        `\n처음 끝난 ${MODEL_ERROR_EARLY_STOP_ROWS}줄에서 모델을 부른 ${usedModel.length}줄이 모두 모델 호출 실패(HTTP 401·402·403)라 측정을 멈춥니다.`
      )
    }
  }

  async function worker() {
    while (!stoppedEarly) {
      const index = nextIndex
      nextIndex += 1
      if (index >= inputs.length) return
      const row = await runOne(inputs[index])
      rows[index] = row
      checkEarlyStop(row)
      flush()
      if ((index + 1) % 10 === 0 || index + 1 === inputs.length) {
        console.error(`  진행 ${flushed}/${inputs.length}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker))
  flush()

  const done = rows.filter((row): row is Row => Boolean(row))
  const errors = done.filter((row) => row.error)
  console.error("\n==== 요약 ====")
  console.error(`전체 ${done.length}개, 소요 ${((Date.now() - startedAll) / 1000).toFixed(1)}초, 라우터 ${router}`)
  console.error(`answerMode 분포: ${JSON.stringify(tally(done.map((row) => row.answerMode ?? "error")))}`)
  console.error(
    `decidedBy 분포: ${JSON.stringify(tally(done.map((row) => (row.decidedBy.includes(":") ? row.decidedBy.split(":")[0] : row.decidedBy))))}`
  )
  const indexed = done.filter((row) => "answerIndex" in row)
  if (indexed.length > 0) {
    const decisionOf = (row: Row) => {
      const trace = "answerIndex" in row ? (row.answerIndex as { scope?: unknown; decision?: unknown } | null) : null
      if (trace?.scope === "out") return "scope_out"
      return typeof trace?.decision === "string" ? trace.decision : "unknown"
    }
    console.error(`답 색인 흔적이 있는 줄: ${indexed.length}개, 결정 분포: ${JSON.stringify(tally(indexed.map(decisionOf)))}`)
  }
  console.error(`Gemini 생성(generateContent) 호출이 있었던 질문: ${done.filter((row) => (row.geminiKinds.generateContent ?? 0) > 0).length}개`)
  const gated = done.filter((row) => row.gate === "kept" || row.gate === "rejected")
  const gateTimes = gated.map((row) => row.gateMs ?? 0).sort((a, b) => a - b)
  console.error(`관문 분포: ${JSON.stringify(tally(done.map((row) => row.gate ?? "error")))}`)
  if (gateTimes.length > 0) {
    console.error(
      `관문 판정 시간: 중앙값 ${median(gateTimes)}ms, 95번째 ${gateTimes[Math.min(gateTimes.length - 1, Math.floor(gateTimes.length * 0.95))]}ms`
    )
  }
  const ran = done.filter((row) => row.secondChance === "hit" || row.secondChance === "miss")
  console.error(`두 번째 검색 분포: ${JSON.stringify(tally(done.map((row) => row.secondChance ?? "error")))}`)
  if (ran.length > 0) {
    const times = ran.map((row) => row.secondChanceMs ?? 0).sort((a, b) => a - b)
    console.error(
      `두 번째 검색 시간: 중앙값 ${median(times)}ms, 95번째 ${times[Math.min(times.length - 1, Math.floor(times.length * 0.95))]}ms`
    )
  }
  console.error(`오류: ${errors.length}개`)
  const modelErrorRows = done.filter((row) => row.modelError)
  console.error(`모델 호출 실패 줄: ${modelErrorRows.length} / ${done.length}`)
  console.error(`질문당 Gemini 호출 수 중앙값: ${median(done.map((row) => row.geminiCalls))}`)
  console.error(`지연 중앙값: ${median(done.filter((row) => !row.error).map((row) => row.latencyMs))}ms`)
  console.error(`결과: ${resolve(outPath)}`)
  const modelFreeCheck = checkModelFreeRun({ modelFree, router, rows: done })
  if (modelFreeCheck.status !== "ok") {
    const detail = `Gemini 를 부르거나 부르려 한(차단기에 막힘) 줄 ${modelFreeCheck.rows}개, 종류별 ${JSON.stringify(modelFreeCheck.kinds)}`
    if (modelFreeCheck.status === "invalid") {
      console.error(`\n측정 무효: 모델 없는 compiled 측정인데 ${detail}`)
      process.exit(EXIT_MODEL_FREE_VIOLATION)
    }
    console.error(`\n경고: 모델 없는 측정(${router})인데 ${detail}. 답에는 쓰이지 않는 호출인지 확인하세요.`)
  }
  if (!allowModelErrors && (stoppedEarly || modelErrorRows.length > done.length * MODEL_ERROR_MAX_RATIO)) {
    console.error(`\n측정 무효: 모델 호출 실패(HTTP 4xx) 줄이 ${modelErrorRows.length}개`)
    process.exit(2)
  }
  process.exit(0)
}

main().catch((error) => {
  console.error("측정 실패:", error)
  process.exit(1)
})
