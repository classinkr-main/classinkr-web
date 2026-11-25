/**
 * 내부 CS 코파일럿의 모델 연결 한 곳(IC-03).
 *
 * 생성(gemini.ts)·이미지(vision.ts)·상담 임베딩(consultation-search.ts)·승격 임베딩(internal-article-writer.ts)·
 * 회귀 심판(regression-eval.ts) 다섯 곳이 모두 여기를 지나간다. GEMINI_API_KEY 를 읽는 곳은 이 파일뿐이다.
 *
 * 연결
 * - 기본은 공개 챗봇과 같은 연결이다(lib/chatbot/gemini-transport.ts 의 getChatbotGeminiConnection — import 만 한다).
 *   CHATBOT_GEMINI_PROVIDER=vertex 이면 내부도 Vertex 로 나간다.
 * - INTERNAL_CS_GEMINI_PROVIDER 로 바꿀 수 있다: chatbot(기본, 공개 챗봇 따름) | developer(GEMINI_API_KEY) | vertex(공개 챗봇의 Vertex 설정이 있을 때만).
 * - 개발자 키는 주소에 싣지 않고 x-goog-api-key 헤더로 보낸다. 공개 챗봇의 postChatbotGemini 는 개발자 연결일 때 키를
 *   주소에 싣기 때문에, 개발자 연결은 여기서 직접 헤더로 보내고 Vertex 연결만 postChatbotGemini 를 쓴다.
 *
 * 실패
 * - 이 모듈의 호출 함수는 절대 던지지 않는다. 결과의 kind 로 실패 종류를 돌려준다:
 *   auth(401·403·Vertex 토큰·키 없음) · quota(402) · rate(429) · timeout · shape(응답 형태·그 밖 4xx) · server(5xx·네트워크).
 * - auth·quota 는 같은 요청의 다음 모델로 넘어가도 같은 결과이므로 호출부가 사슬을 멈춘다(stopsModelChain).
 *   단, 실호출로 확인하지 않은 모델(UNVERIFIED_MODELS)의 403 은 그 모델만 못 쓰는 것일 수 있어 다음 모델로 넘긴다.
 * - 로그에는 모델 이름·HTTP 상태·종류·지연만 남긴다. 키·질문·응답 본문은 남기지 않는다.
 */

import "server-only"

import {
  getChatbotGeminiConnection,
  isVertexAuthError,
  postChatbotGemini,
  type GeminiConnection,
  type GeminiOperation,
} from "@/lib/chatbot/gemini-transport"

export type ModelFailureKind = "auth" | "quota" | "rate" | "timeout" | "shape" | "server"

export interface ModelAttempt {
  model: string
  ok: boolean
  /** 실패했을 때의 종류. 성공이면 없다. */
  kind?: ModelFailureKind
  status?: number
  latencyMs: number
}

export type ModelCallResult =
  | { ok: true; data: unknown; status: number; latencyMs: number }
  | { ok: false; kind: ModelFailureKind; status?: number; latencyMs: number }

export type InternalCsProviderSetting = "chatbot" | "developer" | "vertex"

/** 실호출로 확인하지 않은 모델. 이 모델의 403 은 다음 모델로 넘긴다(공개 챗봇 llm.ts 와 같은 규칙). */
export const UNVERIFIED_MODELS: ReadonlySet<string> = new Set(["gemini-4-hydrogen"])

const DEVELOPER_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"

export function getInternalCsProviderSetting(): InternalCsProviderSetting {
  const raw = process.env.INTERNAL_CS_GEMINI_PROVIDER?.trim().toLowerCase()
  return raw === "developer" || raw === "vertex" ? raw : "chatbot"
}

/** 지금 설정에서 쓸 연결. 없으면 null(키 없음·설정 오류). */
export function resolveInternalCsConnection(): GeminiConnection | null {
  const setting = getInternalCsProviderSetting()
  if (setting === "developer") {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    return apiKey ? { provider: "developer", apiKey } : null
  }
  const connection = getChatbotGeminiConnection()
  if (setting === "vertex") return connection?.provider === "vertex" ? connection : null
  return connection
}

export function classifyHttpStatus(status: number): ModelFailureKind {
  if (status === 401 || status === 403) return "auth"
  if (status === 402) return "quota"
  if (status === 429) return "rate"
  if (status === 408 || status === 504) return "timeout"
  if (status >= 500) return "server"
  return "shape"
}

/** 같은 요청의 다음 모델로 넘어가도 소용없는 실패인지. */
export function stopsModelChain(kind: ModelFailureKind, model: string, status?: number) {
  if (kind === "quota") return true
  if (kind === "auth") return !(status === 403 && UNVERIFIED_MODELS.has(model))
  return false
}

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
}

async function send(
  connection: GeminiConnection,
  model: string,
  operation: GeminiOperation,
  body: string,
  signal: AbortSignal
) {
  if (connection.provider === "vertex") return postChatbotGemini(connection, model, operation, body, signal)
  return fetch(`${DEVELOPER_ENDPOINT}/${encodeURIComponent(model)}:${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": connection.apiKey },
    body,
    signal,
  })
}

/**
 * 모델 한 번 호출. timeoutMs 안에 끝나지 않으면 끊고 kind "timeout" 으로 돌려준다.
 * 던지지 않는다. 호출부가 시도 기록(ModelAttempt)과 사슬 중단 여부를 판단한다.
 */
export async function callInternalCsModel(input: {
  connection: GeminiConnection
  model: string
  operation: GeminiOperation
  body: unknown
  timeoutMs: number
}): Promise<ModelCallResult> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1, input.timeoutMs))
  const elapsed = () => Date.now() - startedAt
  try {
    const response = await send(
      input.connection,
      input.model,
      input.operation,
      JSON.stringify(input.body),
      controller.signal
    )
    if (!response.ok) {
      return { ok: false, kind: classifyHttpStatus(response.status), status: response.status, latencyMs: elapsed() }
    }
    try {
      const data = (await response.json()) as unknown
      return { ok: true, data, status: response.status, latencyMs: elapsed() }
    } catch (error) {
      return { ok: false, kind: isAbortError(error) ? "timeout" : "shape", status: response.status, latencyMs: elapsed() }
    }
  } catch (error) {
    if (isVertexAuthError(error)) {
      return { ok: false, kind: "auth", status: error.status, latencyMs: elapsed() }
    }
    if (isAbortError(error) || controller.signal.aborted) {
      return { ok: false, kind: "timeout", latencyMs: elapsed() }
    }
    return { ok: false, kind: "server", latencyMs: elapsed() }
  } finally {
    clearTimeout(timeout)
  }
}

export function toModelAttempt(model: string, result: ModelCallResult): ModelAttempt {
  return result.ok
    ? { model, ok: true, status: result.status, latencyMs: result.latencyMs }
    : { model, ok: false, kind: result.kind, status: result.status, latencyMs: result.latencyMs }
}

/** 실패 종류를 중복 없이 시도 순서대로. */
export function failureKindsOf(attempts: readonly ModelAttempt[]): ModelFailureKind[] {
  const kinds: ModelFailureKind[] = []
  for (const attempt of attempts) {
    if (attempt.kind && !kinds.includes(attempt.kind)) kinds.push(attempt.kind)
  }
  return kinds
}

/**
 * 요청 하나당 한 번 남기는 실패 로그. 키·질문·응답 본문은 넣지 않는다.
 * finalFailure 이면 console.error(요청이 결국 실패), 중간 실패 뒤 복구했으면 console.warn.
 */
export function logModelFailures(
  scope: string,
  provider: GeminiConnection["provider"] | "none",
  attempts: readonly ModelAttempt[],
  finalFailure: boolean
) {
  const failed = attempts.filter((attempt) => !attempt.ok)
  if (failed.length === 0 && !(finalFailure && attempts.length === 0)) return
  const summary = failed.map((attempt) =>
    `${attempt.model}:${attempt.kind ?? "unknown"}${attempt.status ? `/${attempt.status}` : ""}/${attempt.latencyMs}ms`
  )
  const line = `[internal-cs] model ${finalFailure ? "failed" : "recovered"} scope=${scope} provider=${provider} attempts=[${
    summary.join(", ") || "no-connection"
  }]`
  if (finalFailure) console.error(line)
  else console.warn(line)
}

// ─── 임베딩 ───────────────────────────────────────────────

export type EmbedTaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"

export type EmbedResult =
  | { ok: true; values: number[] }
  | { ok: false; kind: ModelFailureKind; status?: number }

/**
 * 임베딩 한 번. 개발자 연결은 embedContent 형식, Vertex 는 predict 형식(instances·predictions)으로 같은 모델·차원을 요청하고
 * 차원이 다른 벡터는 버린다(shape). 던지지 않는다.
 */
export async function embedWithInternalCsModel(input: {
  text: string
  model: string
  dim: number
  taskType: EmbedTaskType
  timeoutMs: number
}): Promise<EmbedResult> {
  const connection = resolveInternalCsConnection()
  if (!connection) return { ok: false, kind: "auth" }
  const body = connection.provider === "vertex"
    ? {
      instances: [{ content: input.text, task_type: input.taskType }],
      parameters: { outputDimensionality: input.dim },
    }
    : {
      model: `models/${input.model}`,
      content: { parts: [{ text: input.text }] },
      taskType: input.taskType,
      outputDimensionality: input.dim,
    }
  const result = await callInternalCsModel({
    connection,
    model: input.model,
    operation: "embedContent",
    body,
    timeoutMs: input.timeoutMs,
  })
  if (!result.ok) return { ok: false, kind: result.kind, status: result.status }
  const data = result.data as {
    embedding?: { values?: number[] }
    predictions?: { embeddings?: { values?: number[] } }[]
  }
  const values = connection.provider === "vertex" ? data.predictions?.[0]?.embeddings?.values : data.embedding?.values
  if (!Array.isArray(values) || values.length === 0) return { ok: false, kind: "shape" }
  if (connection.provider === "vertex" && (values.length !== input.dim || !values.every(Number.isFinite))) {
    return { ok: false, kind: "shape" }
  }
  return { ok: true, values }
}
