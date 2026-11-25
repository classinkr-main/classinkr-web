/**
 * 질문 묶음을 공개 챗봇 경로에 실제 모델(Gemini)로 돌려 답을 JSONL 로 남기는 측정 스크립트.
 *
 * 실행:
 *   npx tsx scripts/chatbot-live-eval.ts --in <questions.json> --out <results.jsonl> [--concurrency 4] [--mode select|generate|off] [--gate on|off] [--second-chance on|off] [--router legacy|shadow|compiled] [--assist off|band|always] [--repeat N] [--simulate-gemini 402|hang|429] [--allow-model-errors]
 *
 * - 입력: [{ id, question, group?, expectTopic?, pagePath? }] 또는 { cases: [...] }(data/chatbot-first-contact-set.json).
 *   대화 형식 { id, turns:[질문 문자열 또는 {question}], pagePath? } 도 받는다. 앞 턴의 질문과 답으로 previousTurn 을 만들어
 *   다음 턴에 넘기고(DB 없음), 결과 줄은 턴마다 하나(id 는 `<id>#t<순번>`)다. 자세한 형식과 플래그는 scripts/chatbot-persona-loop/README.md.
 * - 결과 줄의 firstAttempt 는 재시도 전 첫 시도(답·decidedBy·modelState), attemptLog 는 시도마다의 기록이다.
 *   --repeat N 은 입력마다 N 번 돌려 답이 갈린 비율을, --simulate-gemini 는 Gemini fetch 를 가짜로 바꿔(실제 호출 0) 장애 동작을 잰다.
 *   --simulate-gemini 는 Vertex 토큰 발급도 내보내지 않도록 연결을 developer(자리표시 키)로 고정하고, Google 인증 주소 요청은 거절한다.
 *   --repeat 가 2 이상이면 답 캐시·관문 판정 캐시를 끈다(CHATBOT_ANSWER_CACHE=off): 켜 두면 앞 실행의 답이 캐시에서 나와 갈림이 0 으로 찍힌다.
 * - 질문마다 세션 없이 evaluateChatbotQuery(공개 경로 코어, 말투·후속 질문 포함)를 독립 실행한다.
 * - 데이터베이스 없이 돈다: Supabase env 를 import 전에 지워 정적 문서 검색으로 고정한다.
 *   evaluateChatbotQuery 는 persistExchange 를 부르지 않는다(lib/chatbot/service.ts 의 handleChatbotQuery 만 부른다).
 * - Gemini 연결은 환경(또는 .env.local)의 값을 쓴다: developer 는 GEMINI_API_KEY, CHATBOT_GEMINI_PROVIDER=vertex 면 CHATBOT_VERTEX_* 설정
 *   (lib/chatbot/gemini-transport.ts). 쓸 수 있는 연결이 없으면(hasChatbotGeminiConnection) 모델 경로가 조용히 꺼지므로 시작 전에 중단한다.
 *   추적·가짜 응답은 두 연결의 Gemini 주소(generativelanguage·aiplatform·<지역>-aiplatform) 모두에 걸린다.
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
 *   답 색인 자료 폴더는 ANSWER_INDEX_DATA_DIR(작업 폴더 자료를 잴 때, 없으면 data/answer-index)이고, 흔적의 version 이 그 폴더의 판이다.
 * - --assist 는 답 색인 모델 선택 층(CHATBOT_ANSWER_ASSIST: off·band·always, lib/chatbot/answer-index/assist.ts, 사양 §10)을 정한다.
 *   안 주면 환경변수, 그것도 없으면 off. compiled 라우터에서만 일한다. off 가 아니면 모델 단계가 켜진 측정이라(모델 없는 측정 확인을
 *   하지 않는다) Gemini 연결이 있어야 하고, --simulate-gemini 와 함께 쓰면 가짜 응답으로 돈다(실제 호출 0). 호출은 다른 단계와 같이
 *   질문별로 세고(geminiCalls·geminiKinds), 결과 줄의 assist 는 answerIndex.assist(mode·used·pick·pickCard·model·ms·accepted·
 *   rejectReason·original)다. decidedBy 는 최종 카드 기준이다.
 * - 탐침 칸(결과 줄에 칸만 더한다): 입력 줄의 expectFragments(복합 질문 조각 기대)·single(질문 하나)·decoy(낱말 미끼)를 읽어
 *   결과 줄에 fragments(조각 기록: segments·answeredCards·notice·perFragment)·outcome(결정 표시)을 더하고, 끝에 조각 답 비율·모든 조각 답·
 *   소리 없는 누락·거짓 알림·쏠림 방향·과분할·미끼 장치별 걸림을 요약해 찍는다. --summary-out <경로> 면 같은 요약을 JSON 으로도 쓴다.
 *   조각 기록은 흔적의 segments 배열이 있으면 그것을, 없으면(지금 코드는 조각 수만 준다) 같은 자료·같은 질문으로 결정형 판정을 다시 계산해
 *   쓴다(source: trace|probe|count). compiled 라우터에서만 일한다. 입력 꼴과 판정 정의는 scripts/lib/chatbot-live-eval-probes.ts.
 * - 무효 측정 알아채기: 결과 줄의 modelError 는 그 줄의 답에 쓰이는 Gemini 호출(관문·근거 선별·목차 고르기·답 생성)이
 *   401·402·403(결제 크레딧 소진·키 인증 실패)을 받았거나, 그 때문에 열린 차단기(lib/chatbot/llm.ts)가 그 호출을 막았거나
 *   (geminiBlocked: 관문이 차단기를 보고 판정 없이 넘긴 것 포함), Vertex 토큰 발급이 실패해 그 호출을 못 보냈거나
 *   (geminiAuthFailedKinds), 관문·두 번째 검색이 model_unavailable 로 넘어간 경우 true 다. 1순위 gemini-4-hydrogen 처럼
 *   실호출로 확인하지 않은 모델 하나의 403 은 차단기와 같이 다음 모델로 넘어가므로 세지 않는다.
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
  answerDivergence,
  checkModelFreeRun,
  classifyBlockedGeminiCall,
  countAnswerModelCalls,
  decidedByFromAnswerIndex,
  deriveModelState,
  geminiCallKind,
  geminiCallModel,
  hasModelError,
  isGeminiEndpointUrl,
  isGoogleAuthUrl,
  isTransientGeminiFailure,
  parseAnswerRouter,
  parseAssistMode,
  parseEvalCases,
  parseSimulateMode,
  repeatRunEnv,
  runConversationTurns,
  simulateGeminiFetch,
  summarizeAssistRows,
  summarizeRows,
  turnRowId,
  type AnswerRouter,
  type AssistMode,
  type AttemptRecord,
  type EvalCase,
  type GeminiCallRecord,
  type TurnRequest,
} from "./lib/chatbot-live-eval-checks"
import {
  buildFragmentRecord,
  outcomeSignature,
  summarizeDecoys,
  summarizeFragments,
  type FragmentRecord,
  type SoloProbe,
} from "./lib/chatbot-live-eval-probes"

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

interface GeminiTrace {
  calls: number
  statuses: number[]
  /** 나간 호출마다 종류와 상태(modelError 판정용). */
  records: GeminiCallRecord[]
  /** 결제·인증 실패 차단기 때문에 보내지 않은 호출 수. */
  blocked: number
  /** 차단기가 막은 호출의 종류별 수(embedContent·generateContent). */
  blockedKinds: Record<string, number>
  /** Vertex 토큰 발급이 실패해 보내지 못한 호출의 종류별 수(네트워크로 나가지 않아 fetch 감싸기로는 보이지 않는다). */
  authFailedKinds: Record<string, number>
  /** 호출 종류별 횟수(generateContent=답·선별 생성, embedContent=검색 임베딩). */
  kinds: Record<string, number>
}

const newTrace = (): GeminiTrace => ({
  calls: 0,
  statuses: [],
  records: [],
  blocked: 0,
  blockedKinds: {},
  authFailedKinds: {},
  kinds: {},
})

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index !== -1 ? process.argv[index + 1] : undefined
}

function usage(message?: string): never {
  if (message) console.error(`오류: ${message}`)
  console.error(
    "사용법: npx tsx scripts/chatbot-live-eval.ts --in <questions.json> --out <results.jsonl> [--concurrency 4] [--mode select|generate|off] [--gate on|off] [--second-chance on|off] [--router legacy|shadow|compiled] [--assist off|band|always] [--repeat N] [--simulate-gemini 402|hang|429] [--allow-model-errors] [--summary-out <요약.json>]"
  )
  process.exit(2)
}

function readInputs(path: string): EvalCase[] {
  try {
    return parseEvalCases(JSON.parse(readFileSync(path, "utf8")) as unknown)
  } catch (error) {
    return usage(error instanceof Error ? error.message : String(error))
  }
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

type ProbeRow = Parameters<typeof summarizeFragments>[0][number] & Parameters<typeof summarizeDecoys>[0][number]

/** 탐침 칸이 있는 줄만 모아 조각·과분할·미끼 요약을 만든다. 탐침 줄이 없으면 null. */
function summarizeProbeRows(rows: unknown[]) {
  const probeRows = (rows as ProbeRow[]).filter((row) => row.fragments || row.decoy)
  if (probeRows.length === 0) return null
  const fragments = probeRows.some((row) => row.fragments) ? summarizeFragments(probeRows) : null
  const decoys = probeRows.some((row) => row.decoy) ? summarizeDecoys(probeRows) : null
  return { fragments, decoys }
}

function printProbeSummary(summary: NonNullable<ReturnType<typeof summarizeProbeRows>>) {
  const { fragments, decoys } = summary
  if (fragments && fragments.multi.rows > 0) {
    const m = fragments.multi
    console.error(
      `복합 질문 ${m.rows}줄: 조각 답 ${m.answeredFragments}/${m.fragments} (${m.answeredRatio}%), 모든 조각 답 ${m.allAnswered}/${m.rows} (${m.allAnsweredRatio}%), ` +
        `한 조각도 못 답 ${m.noneAnswered}/${m.rows} (${m.noneAnsweredRatio}%, 그중 답 카드 없음 ${m.noCard}), 일부만 답 ${m.partialRows}줄`
    )
    console.error(
      `  쏠림 방향: 앞 조각만 ${m.lean.firstOnly}, 뒤 조각만 ${m.lean.laterOnly}, 답한 쪽이 혼자 물을 때 확신도 더 높음 ${m.lean.strongerSolo}/${m.lean.soloKnown}` +
        ` / 소리 없는 누락 ${m.silentMissing}/${m.partialRows} / 거짓 알림 ${m.falseNotice}/${m.noticeRows}(엄격 ${m.falseNoticeStrict}) / 나누지 못함 ${m.underSplit}`
    )
  }
  if (fragments && fragments.single.rows > 0) {
    const single = fragments.single
    console.error(`단일 질문 ${single.rows}줄: 과분할(2조각 이상) ${single.overSplit}/${single.rows} (${single.overSplitRatio}%)`)
  }
  if (decoys && decoys.total > 0) {
    console.error(`낱말 미끼 ${decoys.total}줄, 장치별(걸림/기대대로/그 밖/관찰 불가 · 줄 수):`)
    for (const [device, bucket] of Object.entries(decoys.devices)) {
      console.error(`  ${device}: 걸림 ${bucket.trapped} / 기대대로 ${bucket.expected} / 그 밖 ${bucket.other} / 관찰 불가 ${bucket.unobservable} · ${bucket.n}줄`)
    }
  }
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

  const assistArg = argValue("--assist")
  const assistFlag = assistArg === undefined ? null : parseAssistMode(assistArg)
  if (assistArg !== undefined && !assistFlag) usage(`--assist 는 off|band|always 중 하나여야 합니다: ${assistArg}`)

  const routerArg = argValue("--router")
  const routerFlag = routerArg === undefined ? null : parseAnswerRouter(routerArg)
  if (routerArg !== undefined && !routerFlag) usage(`--router 는 legacy|shadow|compiled 중 하나여야 합니다: ${routerArg}`)

  const allowModelErrors = process.argv.includes("--allow-model-errors")
  const repeatArg = argValue("--repeat")
  const repeat = repeatArg === undefined ? 1 : Math.trunc(Number(repeatArg))
  if (!Number.isFinite(repeat) || repeat < 1 || repeat > 50) usage(`--repeat 는 1~50 의 정수여야 합니다: ${repeatArg}`)
  const simulateArg = argValue("--simulate-gemini")
  const simulateMode = simulateArg === undefined ? null : parseSimulateMode(simulateArg)
  if (simulateArg !== undefined && !simulateMode) usage(`--simulate-gemini 는 402|hang|429 중 하나여야 합니다: ${simulateArg}`)
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
  if (assistFlag) process.env.CHATBOT_ANSWER_ASSIST = assistFlag
  // --repeat N(2 이상): 답 캐시·관문 판정 캐시를 끈다. 켜 두면 앞 실행의 답이 캐시에서 나와 갈림이 0 으로 찍힌다.
  Object.assign(process.env, repeatRunEnv(repeat))
  const envRouter = process.env.CHATBOT_ANSWER_ROUTER
  if (!routerFlag && envRouter?.trim() && !parseAnswerRouter(envRouter)) {
    console.error(`경고: CHATBOT_ANSWER_ROUTER 값을 알 수 없습니다(${envRouter}). 결과 줄의 router 는 legacy 로 적습니다.`)
  }
  const router: AnswerRouter = routerFlag ?? parseAnswerRouter(envRouter) ?? "legacy"
  const envAssist = process.env.CHATBOT_ANSWER_ASSIST
  if (!assistFlag && envAssist?.trim() && !parseAssistMode(envAssist)) {
    console.error(`경고: CHATBOT_ANSWER_ASSIST 값을 알 수 없습니다(${envAssist}). 모델 선택 층은 off 로 봅니다.`)
  }
  // 모델 선택 층은 compiled 라우터에서만 일한다.
  const assist: AssistMode = router === "compiled" ? (assistFlag ?? parseAssistMode(envAssist) ?? "off") : "off"
  if (router !== "compiled" && (assistFlag ?? parseAssistMode(envAssist) ?? "off") !== "off") {
    console.error("알림: 모델 선택 층(--assist)은 compiled 라우터에서만 일합니다. 이 측정에서는 off 로 봅니다.")
  }
  // 답에 모델을 쓰는 단계가 하나라도 켜져 있는지. 모두 끈 측정은 모델 없는 측정이다(Gemini 호출 0 이어야 함).
  const modelStagesEnabled = mode !== "off" || gateSwitch === "on" || secondChanceSwitch === "on" || assist !== "off"
  const modelFree = !modelStagesEnabled
  // 가짜 Gemini 측정은 네트워크로 나가지 않으므로 키가 없어도 돈다. Vertex 연결은 가짜 fetch 앞에서 토큰 발급(google-auth-library)이
  // 실제로 나가므로 쓰지 않는다: 연결을 developer 로 고정하고, 모델 단계가 가짜 응답을 받도록 자리표시 키를 둔다.
  if (simulateMode) {
    if (process.env.CHATBOT_GEMINI_PROVIDER?.trim() === "vertex") {
      console.error("알림: --simulate-gemini 는 Vertex 토큰 발급을 막으려고 developer 연결(자리표시 키)로 돕니다(차단기·체인 동작은 같다).")
    }
    process.env.CHATBOT_GEMINI_PROVIDER = "developer"
    if (!process.env.GEMINI_API_KEY?.trim()) process.env.GEMINI_API_KEY = "simulated-no-network"
  }

  const { hasChatbotGeminiConnection, isModelScopedAccessDenial, setModelCircuitBlockedListener, setVertexAuthFailureListener } =
    await import("../lib/chatbot/llm")
  // 서비스와 같은 기준(developer 키 또는 올바른 Vertex 설정)으로 본다. 연결이 없으면 모델 단계가 조용히 꺼진다.
  const geminiProvider = process.env.CHATBOT_GEMINI_PROVIDER?.trim() === "vertex" ? "vertex" : "developer"
  if ((mode !== "off" || assist !== "off") && !hasChatbotGeminiConnection()) {
    usage(
      geminiProvider === "vertex"
        ? "CHATBOT_GEMINI_PROVIDER=vertex 인데 Vertex 설정(CHATBOT_VERTEX_PROJECT_ID 등)이 틀렸거나 없습니다. 모델 경로가 조용히 꺼지므로 중단합니다(--mode off 는 연결 없이 가능)."
        : "GEMINI_API_KEY 가 없습니다. 모델 경로가 조용히 꺼지므로 중단합니다(--mode off·--assist off 는 키 없이 가능)."
    )
  }

  // 2) 질문별 Gemini 호출 추적 — lib 를 고치지 않고 fetch 를 감싸 질문 단위(AsyncLocalStorage)로 센다.
  //    developer(generativelanguage)·Vertex(aiplatform·<지역>-aiplatform) 호출 모두 센다.
  const traceStore = new AsyncLocalStorage<GeminiTrace>()
  const realFetch = globalThis.fetch.bind(globalThis)
  // --simulate-gemini: Gemini 호출만 가짜 응답으로 바꾼다(실제 호출 0, 비용 0). 추적·차단기는 그대로 거친다.
  const geminiFetch: typeof fetch = simulateMode ? simulateGeminiFetch(simulateMode) : realFetch
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (simulateMode && isGoogleAuthUrl(url)) {
      throw new Error("--simulate-gemini: Google 인증(토큰 발급) 요청은 보내지 않습니다")
    }
    if (!isGeminiEndpointUrl(url)) return realFetch(input, init)
    const trace = traceStore.getStore()
    // 질문 밖의 Gemini 호출은 세지 않지만, 가짜 측정이면 그것도 가짜 응답으로 받는다(실제 호출 0).
    if (!trace) return geminiFetch(input, init)
    trace.calls += 1
    const kind = geminiCallKind(url)
    const model = geminiCallModel(url)
    trace.kinds[kind] = (trace.kinds[kind] ?? 0) + 1
    try {
      const res = await geminiFetch(input, init)
      trace.statuses.push(res.status)
      trace.records.push({
        kind,
        status: res.status,
        ...(model && isModelScopedAccessDenial(model, res.status) ? { modelScopedDenial: true } : {}),
      })
      return res
    } catch (error) {
      trace.statuses.push(0)
      trace.records.push({ kind, status: 0 })
      throw error
    }
  }) as typeof fetch

  // 차단기가 막은 호출도 그 질문의 추적에 센다(네트워크로 나가지 않아 fetch 감싸기로는 보이지 않는다).
  // 알림에는 URL 이 없어, 임베딩인지는 호출 스택으로 가린다(임베딩 차단은 modelError 로 세지 않는다).
  setModelCircuitBlockedListener(() => {
    const trace = traceStore.getStore()
    if (!trace) return
    trace.blocked += 1
    const kind = classifyBlockedGeminiCall(new Error().stack)
    trace.blockedKinds[kind] = (trace.blockedKinds[kind] ?? 0) + 1
  })
  // Vertex 토큰 발급 실패로 보내지 못한 호출도 그 질문의 추적에 센다(modelError·모델 없는 측정 확인).
  setVertexAuthFailureListener((operation) => {
    const trace = traceStore.getStore()
    if (!trace) return
    trace.authFailedKinds[operation] = (trace.authFailedKinds[operation] ?? 0) + 1
  })
  const { evaluateChatbotQuery, WEAK_SOURCE_DRAFT_ANSWER, NO_SOURCE_FACT_ANSWER, MODEL_UNAVAILABLE_ANSWER, redactPii } =
    await import("../lib/chatbot/service")
  const { detectAskedSlot } = await import("../lib/chatbot/follow-up")
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
    hasModelError({
      modelStagesEnabled,
      calls: trace.records,
      blockedKinds: trace.blockedKinds,
      authFailedKinds: trace.authFailedKinds,
      skipReasons,
    })

  // 서버의 대화 입력 계약: evaluateChatbotQuery(message, { previousTurn?, pagePath? }). 옵션이 아직 없는 서비스 판이면 무시되므로
  // 좁은 어댑터로 넘기기만 한다(타입이 어긋나도 측정 도구가 막히지 않게).
  type EvaluateWithContext = (
    message: string,
    options?: { previousTurn?: TurnRequest["previousTurn"]; pagePath?: string }
  ) => ReturnType<typeof evaluateChatbotQuery>
  const evaluateWithContext = evaluateChatbotQuery as unknown as EvaluateWithContext
  const asEvalSlot = (answer: string) => detectAskedSlot(answer)

  /** 탐침 칸(expectFragments·single·decoy → fragments·outcome). 입력에 없으면 칸을 더하지 않는다. */
  function probeColumns(item: EvalCase, question: string, answer: string, decidedBy: string, answerIndex: unknown) {
    const fragments = fragmentRecordOf(item, question, answer, decidedBy, answerIndex)
    return {
      ...(item.expectFragments ? { expectFragments: item.expectFragments } : {}),
      ...(item.single ? { single: true } : {}),
      ...(item.decoy ? { decoy: item.decoy, outcome: outcomeSignature(answerIndex) } : {}),
      ...(fragments ? { fragments } : {}),
    }
  }

  /** 한 턴(= 한 질문)을 돌린다. 모델이 전부 일시 오류면 최대 3번까지 다시 돌리되, 시도마다 attemptLog 에 남기고 firstAttempt 는 첫 시도다. */
  async function runTurn(item: EvalCase, request: TurnRequest, turnIndex: number, repeatIndex: number) {
    const maxAttempts = 3
    const rowId = turnRowId(item, turnIndex)
    const attemptLog: AttemptRecord[] = []
    let lastError = ""
    let lastTrace: GeminiTrace = newTrace()
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const trace: GeminiTrace = newTrace()
      lastTrace = trace
      const startedAt = Date.now()
      try {
        const result = await traceStore.run(trace, () => evaluateWithContext(request.question, {
            ...(request.previousTurn ? { previousTurn: request.previousTurn } : {}),
            ...(request.pagePath ? { pagePath: request.pagePath } : {}),
          }))
        // 답 색인 흔적·서비스 측정 흔적은 코어가 낼 때만 싣는다(응답에는 실리지 않는 측정 필드, 사양 §3.7).
        const answerIndex = (result as { answerIndex?: unknown }).answerIndex
        const reportedModelState = (result as { modelState?: unknown }).modelState
        const contextExpandedTrace = (result as { contextExpanded?: unknown }).contextExpanded
        const decidedBy = decideBy(request.question, { ...result, answerIndex }, trace)
        const modelState = deriveModelState({ reported: reportedModelState, calls: trace.records, blockedKinds: trace.blockedKinds })
        attemptLog.push({
          attempt,
          answer: result.answer,
          decidedBy,
          modelState,
          geminiStatuses: [...trace.statuses],
          error: null,
        })
        // 모델 호출이 전부 429/5xx 로 끝나 초안으로 떨어진 경우는 일시 오류로 보고 다시 시도한다.
        if (isTransientFailure(trace) && attempt < maxAttempts) {
          lastError = `gemini transient status ${trace.statuses.join(",")}`
          attemptLog[attemptLog.length - 1].error = lastError
          await sleep(1500 * attempt)
          continue
        }
        return {
          id: rowId,
          conversationId: item.conversation ? item.id : null,
          turn: turnIndex + 1,
          repeatIndex,
          pagePath: request.pagePath ?? null,
          previousTurn: request.previousTurn ?? null,
          group: item.group ?? null,
          question: request.question,
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
          decidedBy,
          modelState,
          contextExpanded: typeof contextExpandedTrace === "boolean" ? contextExpandedTrace : null,
          ...(contextExpandedTrace !== undefined && typeof contextExpandedTrace !== "boolean" ? { contextTrace: contextExpandedTrace } : {}),
          firstAttempt: {
            answer: attemptLog[0].answer,
            decidedBy: attemptLog[0].decidedBy,
            modelState: attemptLog[0].modelState,
          },
          attemptLog,
          ...(answerIndex !== undefined ? { answerIndex } : {}),
          ...probeColumns(item, request.question, result.answer, decidedBy, answerIndex),
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
          geminiAuthFailedKinds: trace.authFailedKinds,
          modelError: modelErrorOf(trace, [result.answerGate.skipReason, result.secondChance.reason]),
          geminiKinds: trace.kinds,
          attempts: attempt,
          error: isTransientFailure(trace) ? lastError : null,
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        attemptLog.push({
          attempt,
          answer: null,
          decidedBy: "unknown",
          modelState: deriveModelState({ calls: lastTrace.records, blockedKinds: lastTrace.blockedKinds }),
          geminiStatuses: [...lastTrace.statuses],
          error: lastError,
        })
        const retryable = /429|rate|quota|timeout|timed out|ECONNRESET|ETIMEDOUT|fetch failed|50\d/i.test(lastError)
        if (!retryable || attempt === maxAttempts) break
        await sleep(1500 * attempt)
      }
    }
    return {
      id: rowId,
      conversationId: item.conversation ? item.id : null,
      turn: turnIndex + 1,
      repeatIndex,
      pagePath: request.pagePath ?? null,
      previousTurn: request.previousTurn ?? null,
      group: item.group ?? null,
      question: request.question,
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
      modelState: deriveModelState({ calls: lastTrace.records, blockedKinds: lastTrace.blockedKinds }),
      contextExpanded: null as boolean | null,
      firstAttempt: attemptLog[0]
        ? { answer: attemptLog[0].answer, decidedBy: attemptLog[0].decidedBy, modelState: attemptLog[0].modelState }
        : null,
      attemptLog,
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
      geminiAuthFailedKinds: lastTrace.authFailedKinds,
      modelError: modelErrorOf(lastTrace),
      geminiKinds: lastTrace.kinds,
      attempts: maxAttempts,
      error: lastError || "unknown error",
    }
  }

  // 탐침(조각 기록): 입력에 expectFragments·single 이 있고 compiled 라우터일 때만, 같은 자료로 결정형 판정을 다시 계산한다.
  const needsFragments = router === "compiled" && inputs.some((item) => item.expectFragments || item.single)
  let fragmentProbe: {
    decisionOf: (question: string) => { kind: string; card: string | null; conf: number; segments: Array<{ text: string; kind: string; card: string | null; conf?: number }> | null }
    soloOf: (text: string) => SoloProbe
    topicOf: (cardId: string) => string
  } | null = null
  if (needsFragments) {
    const { buildTopKIndex, topKForQuestion, topKDataDir } = await import("./answer-index/lib/topk-core")
    const { index } = buildTopKIndex({ dir: topKDataDir(null) })
    const topicOf = (cardId: string) => {
      const at = index.cardById.get(cardId)
      return at === undefined ? "" : String((index.cards[at].card as { topic?: string }).topic ?? "")
    }
    const rowOf = (text: string) => topKForQuestion(index, { id: "probe", q: text }, { k: 10, votes: true })
    fragmentProbe = {
      topicOf,
      decisionOf: (question) => {
        const decision = rowOf(question).decision
        return {
          kind: decision.kind,
          card: decision.card,
          conf: decision.conf,
          segments: decision.segments ? decision.segments.map((part) => ({ text: part.text, kind: part.kind, card: part.card, conf: part.conf })) : null,
        }
      },
      soloOf: (text) => {
        const row = rowOf(text)
        return { kind: row.decision.kind, card: row.decision.card, conf: row.decision.conf, top: row.top.map((item) => ({ id: item.id, topic: item.topic })) }
      },
    }
  }
  const fragmentRecordOf = (item: EvalCase, question: string, answer: string, decidedBy: string, answerIndex: unknown): FragmentRecord | null => {
    if (!fragmentProbe || !(item.expectFragments || item.single)) return null
    return buildFragmentRecord({
      question,
      answer,
      indexDecided: decidedBy.startsWith("index"),
      trace: answerIndex,
      probe: fragmentProbe.decisionOf(question),
      expect: item.expectFragments,
      solo: item.expectFragments?.map((fragment) => (fragment.text ? fragmentProbe!.soloOf(fragment.text) : null)),
      topicOf: fragmentProbe.topicOf,
    })
  }

  mkdirSync(dirname(resolve(outPath)), { recursive: true })
  writeFileSync(resolve(outPath), "")

  console.error(
    `질문 ${inputs.length}개(턴 ${inputs.reduce((sum, item) => sum + item.turns.length, 0)}개)${repeat > 1 ? ` x 반복 ${repeat}` : ""} / 동시 ${concurrency} / 모드 ${mode} / 관문 ${gateSwitch} / 두 번째 검색 ${secondChanceSwitch} / 라우터 ${router}` +
      ` / Gemini 연결 ${hasChatbotGeminiConnection() ? geminiProvider : "없음"}` +
      (router !== "legacy" ? ` / 답 색인 자료 ${process.env.ANSWER_INDEX_DATA_DIR?.trim() || "data/answer-index"}` : "") +
      (router === "compiled" ? ` / 모델 선택 층 ${assist}` : "") +
      (modelFree ? " / 모델 없는 측정(Gemini 호출 0 이어야 함)" : "") +
      (simulateMode ? ` / 가짜 Gemini ${simulateMode}(실제 호출 0)` : "") +
      (repeat > 1 ? " / 답·관문 캐시 끔(반복 측정)" : "") +
      (allowModelErrors ? " / 모델 호출 실패 허용(--allow-model-errors)" : "")
  )

  // 측정 작업 하나 = 입력 하나의 한 번 실행(대화면 턴 전체). --repeat N 이면 입력마다 N 개이며 입력 순서대로 묶어 쓴다.
  const jobs = inputs.flatMap((item) => Array.from({ length: repeat }, (_, repeatIndex) => ({ item, repeatIndex })))
  const runJob = ({ item, repeatIndex }: (typeof jobs)[number]) =>
    runConversationTurns({
      item,
      runTurn: (request, turnIndex) => runTurn(item, request, turnIndex, repeatIndex),
      askedSlotOf: asEvalSlot,
    })
  type Row = Awaited<ReturnType<typeof runTurn>>
  const rows: (Row[] | undefined)[] = new Array(jobs.length)
  let nextIndex = 0
  let flushed = 0
  let stoppedEarly = false
  const startedAll = Date.now()

  // 동시 실행이어도 줄 순서는 입력 순서다: 앞 순번이 끝난 만큼만 이어서 쓴다.
  function flush() {
    while (flushed < rows.length && rows[flushed]) {
      for (const row of rows[flushed] ?? []) appendFileSync(resolve(outPath), `${JSON.stringify(row)}\n`)
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
        `\n처음 끝난 ${MODEL_ERROR_EARLY_STOP_ROWS}줄에서 모델을 부른 ${usedModel.length}줄이 모두 모델 호출 실패(HTTP 401·402·403·Vertex 토큰 발급 실패)라 측정을 멈춥니다.`
      )
    }
  }

  async function worker() {
    while (!stoppedEarly) {
      const index = nextIndex
      nextIndex += 1
      if (index >= jobs.length) return
      const jobRows = await runJob(jobs[index])
      rows[index] = jobRows
      for (const row of jobRows) checkEarlyStop(row)
      flush()
      if ((index + 1) % 10 === 0 || index + 1 === jobs.length) {
        console.error(`  진행 ${flushed}/${jobs.length}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker))
  flush()

  const done = rows.flatMap((jobRows) => jobRows ?? [])
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
  if (assist !== "off") {
    const summary = summarizeAssistRows(done.map((row) => ("answerIndex" in row ? row.answerIndex : undefined)))
    console.error(
      `모델 선택 층(${assist}): 흔적 ${summary.traced}줄, 모델에 물은 줄 ${summary.used}, 따른 줄 ${summary.accepted}, 결정형과 달라진 줄 ${summary.changed}` +
        `, 이유 ${JSON.stringify(summary.rejectReasons)}, 고른 번호 ${JSON.stringify(summary.picks)}` +
        (summary.ms.length > 0 ? `, 호출 시간 중앙값 ${median(summary.ms)}ms` : "")
    )
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
  const ratios = summarizeRows(done)
  console.error(
    `첫 시도 기준: decidedBy ${JSON.stringify(ratios.firstAttempt.decidedBy)}, 첫 시도가 모델 장애였던 줄 ${ratios.firstAttempt.modelNotOk.count}/${ratios.total} (${ratios.firstAttempt.modelNotOk.ratio})`
  )
  console.error(`재시도가 있었던 줄: ${done.filter((row) => row.attemptLog.length > 1).length}개(결과 줄의 답·decidedBy 는 마지막 시도, firstAttempt 는 첫 시도)`)
  console.error(`gate skipped: ${ratios.gateSkipped.count}/${ratios.total} (${ratios.gateSkipped.ratio})`)
  console.error(`modelState 분포: ${JSON.stringify(ratios.modelState)}`)
  console.error(
    `contextExpanded: ${ratios.contextExpanded.count}/${ratios.contextExpanded.of} (${ratios.contextExpanded.ratio})` +
      (ratios.contextExpanded.of === 0 ? " — 서비스가 흔적을 내지 않음" : "")
  )
  if (repeat > 1) {
    const divergence = answerDivergence(done.map((row) => ({ key: row.id, answer: row.answer })))
    console.error(`--repeat ${repeat}: 답이 갈린 질문 ${divergence.diverged}/${divergence.groups} (${divergence.ratio})`)
  }
  const probeSummary = summarizeProbeRows(done)
  if (probeSummary) {
    printProbeSummary(probeSummary)
    const summaryOut = argValue("--summary-out")
    if (summaryOut) {
      mkdirSync(dirname(resolve(summaryOut)), { recursive: true })
      writeFileSync(resolve(summaryOut), `${JSON.stringify(probeSummary, null, 2)}\n`)
      console.error(`탐침 요약: ${resolve(summaryOut)}`)
    }
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
    console.error(`\n측정 무효: 모델 호출 실패(HTTP 401·402·403·Vertex 토큰 발급 실패) 줄이 ${modelErrorRows.length}개`)
    process.exit(2)
  }
  process.exit(0)
}

main().catch((error) => {
  console.error("측정 실패:", error)
  process.exit(1)
})
