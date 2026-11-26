import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import {
  DEFAULT_GEMINI_FAST_MODEL,
  DEFAULT_GEMINI_MODEL,
  resolveGeminiModel as resolveSharedGeminiModel,
  thinkingConfigFor,
  withGeminiModelFallback,
} from "@/lib/marketing/gemini-model"

// KR Team AI 인사이트 — 모델 호출 공통부.
// 순서(2026-11-25 결정): Claude(Anthropic API) 먼저 → 실패하면 Gemini 한 번 더.
// Gemini는 Vertex AI로 부른다(GOOGLE_VERTEX_PROJECT가 있으면). Vertex 설정 전에는 예전 AI Studio 키(GEMINI_API_KEY)로 부른다.
// 두 모델 모두 같은 시스템 프롬프트·입력 JSON·응답 스키마를 쓴다 — 결과 모양은 호출부의 validate가 확인한다.

export type InsightMode = "quality" | "fast"
export type InsightProvider = "claude" | "gemini-vertex" | "gemini-studio"

export interface JsonSchema { [key: string]: unknown }

export interface StructuredCall<T> {
  system: string
  /** 사용자 턴 — 보통 입력 JSON 문자열 */
  user: string
  schema: JsonSchema
  mode: InsightMode
  /** 모양 검사 — 맞지 않으면 throw */
  validate: (value: unknown) => T
}

export interface StructuredResult<T> {
  result: T
  raw: unknown
  model: string
  provider: InsightProvider
  /** Claude가 실패해 Gemini로 넘어간 경우 그 이유 */
  fallbackReason?: string
}

const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5"

/**
 * Gemini 모델 이름 — 어드민 AI 공용 해석(lib/marketing/gemini-model.ts)을 그대로 쓴다.
 * 종료된 gemini-1.x/2.x 는 env 에 남아 있어도 무시하고 기본값(3.x)을 쓴다. 이 파일에 기본값을 따로 두지 않는다 —
 * 2.5 기본값을 들고 있으면 Claude 가 실패했을 때의 Gemini 대체 호출이 404 로 같이 죽는다.
 */
export function resolveGeminiModel(mode: InsightMode): string {
  return mode === "fast"
    ? resolveSharedGeminiModel("GEMINI_FAST_MODEL", DEFAULT_GEMINI_FAST_MODEL)
    : resolveSharedGeminiModel("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
}

export function resolveClaudeModel(): string {
  return process.env.BRANCH_INSIGHTS_CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_MODEL
}

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim())
}

const UNSUPPORTED_SCHEMA_KEYS = new Set(["maxLength", "minLength", "pattern", "minimum", "maximum", "multipleOf", "minItems", "maxItems"])

/**
 * Gemini용 응답 스키마 → Claude 구조화 출력 스키마.
 * Claude는 객체마다 additionalProperties:false가 필요하고 길이·개수·패턴 제약을 받지 않는다 —
 * 제약은 시스템 프롬프트 문장과 화면 쪽 검사로 지킨다.
 */
export function toClaudeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toClaudeSchema)
  if (!schema || typeof schema !== "object") return schema
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (UNSUPPORTED_SCHEMA_KEYS.has(key)) continue
    out[key] = key === "enum" || key === "required" ? value : toClaudeSchema(value)
  }
  if (out.type === "object") out.additionalProperties = false
  return out
}

let anthropicClient: Anthropic | null = null
function getAnthropic(): Anthropic {
  // 요청 한 번이 길어질 수 있어 타임아웃을 넉넉히, 재시도는 1회(실패하면 Gemini로 넘어간다).
  if (!anthropicClient) anthropicClient = new Anthropic({ maxRetries: 1, timeout: 180_000 })
  return anthropicClient
}

export async function callClaudeStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
  if (!claudeConfigured()) throw new Error("ANTHROPIC_API_KEY not set")
  const model = resolveClaudeModel()
  const response = await getAnthropic().beta.messages.create({
    model,
    max_tokens: 16000,
    // 안전 분류기가 거절하면 서버가 다른 Claude 모델로 같은 요청을 다시 돌린다.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: call.system,
    messages: [{ role: "user", content: call.user }],
    output_config: {
      effort: call.mode === "fast" ? "medium" : "high",
      format: { type: "json_schema", schema: toClaudeSchema(call.schema) as JsonSchema },
    },
  })
  if (response.stop_reason === "refusal") throw new Error(`Claude refusal${response.stop_details?.category ? ` (${response.stop_details.category})` : ""}`)
  if (response.stop_reason === "max_tokens") throw new Error("Claude max_tokens — 응답이 잘림")
  const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("")
  const parsed = call.validate(JSON.parse(text))
  return {
    result: parsed,
    raw: { id: response.id, model: response.model, stop_reason: response.stop_reason, usage: response.usage },
    model: response.model,
    provider: "claude",
  }
}

type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }

function vertexConfig() {
  const project = process.env.GOOGLE_VERTEX_PROJECT?.trim()
  if (!project) return null
  const location = process.env.GOOGLE_VERTEX_LOCATION?.trim() || "global"
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`
  return { project, location, host }
}

async function vertexAccessToken(): Promise<string> {
  // Vertex 전용 서비스 계정이 있으면 그것, 없으면 시트·캘린더와 같은 서비스 계정(IAM에 Vertex AI User 권한 필요).
  const email = process.env.GOOGLE_VERTEX_SERVICE_ACCOUNT_EMAIL?.trim() || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = (process.env.GOOGLE_VERTEX_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY)?.replace(/\\n/g, "\n")
  if (!email || !key) throw new Error("Vertex 서비스 계정(GOOGLE_VERTEX_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY 또는 GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY) 없음")
  const { google } = await import("googleapis")
  const auth = new google.auth.GoogleAuth({ credentials: { client_email: email, private_key: key }, scopes: ["https://www.googleapis.com/auth/cloud-platform"] })
  const token = await auth.getAccessToken()
  if (!token) throw new Error("Vertex access token 발급 실패")
  return token
}

export async function callGeminiStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
  const vertex = vertexConfig()
  const headers: Record<string, string> = { "Content-Type": "application/json", Connection: "close" }
  let provider: InsightProvider
  let urlFor: (model: string) => string
  if (vertex) {
    urlFor = (model) => `https://${vertex.host}/v1/projects/${vertex.project}/locations/${vertex.location}/publishers/google/models/${model}:generateContent`
    headers.Authorization = `Bearer ${await vertexAccessToken()}`
    provider = "gemini-vertex"
  } else {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error("GEMINI_API_KEY not set (Vertex 미설정)")
    urlFor = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    provider = "gemini-studio"
  }
  // 모델 없음(404)이면 공용 폴백 사슬로 한 번씩 넘어간다. 모델마다 URL·thinkingConfig 를 다시 만든다.
  return withGeminiModelFallback(resolveGeminiModel(call.mode), async (model) => {
    const thinking = thinkingConfigFor(model)
    const body = {
      systemInstruction: { parts: [{ text: call.system }] },
      contents: [{ role: "user", parts: [{ text: call.user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: call.schema,
        temperature: 0.4,
        ...(thinking ? { thinkingConfig: thinking } : {}),
      },
    }
    const res = await fetch(urlFor(model), { method: "POST", headers, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
    const json = (await res.json()) as GeminiResponse
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
    return { result: call.validate(JSON.parse(text)), raw: json, model, provider }
  })
}

/** Claude 먼저, 실패하면 Gemini. 둘 다 실패하면 두 이유를 함께 던진다. */
export async function generateStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
  let claudeError: string
  try {
    return await callClaudeStructured(call)
  } catch (error) {
    claudeError = error instanceof Error ? error.message : String(error)
    console.error("[branch insights] Claude failed, falling back to Gemini:", claudeError)
  }
  try {
    const out = await callGeminiStructured(call)
    return { ...out, fallbackReason: claudeError }
  } catch (error) {
    const geminiError = error instanceof Error ? error.message : String(error)
    throw new Error(`Claude: ${claudeError} / Gemini: ${geminiError}`)
  }
}
