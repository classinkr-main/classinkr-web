// lib/marketing/creative-suggest.ts
// AI 소재 제안 Gemini 호출 — lib/marketing/insights/gemini-runner.ts 와 같은 호출 규약
// (v1beta generateContent, responseSchema 로 JSON 강제, temperature 0.4, GEMINI_MODEL 해석 +
// 미지원 모델 방어)을 따른다. gemini-runner.ts 를 그대로 재사용하지 않는 이유는 그 모듈이
// 주간 브리핑 타입(MarketingInsightInput/Result)에 결합돼 있어서다 — 호출 방식만 미러하고
// 타입·프롬프트·스키마는 소재 제안 도메인 것으로 새로 둔다.
//
// 정직 규칙: 입력에는 소재별 광고비·CPL·ROAS 가 없다(리드·전환 건수뿐) — 시스템 프롬프트가
// 이 제약을 명시하고, 스키마도 그 수치를 담을 자리를 아예 주지 않는다.

import "server-only"

import type { AdCreativePerf } from "@/lib/marketing/creative-input"

export interface CreativeSuggestion {
  headline: string
  body: string
  rationale: string
}

export interface CreativeSuggestResult {
  patterns: string[]
  suggestions: CreativeSuggestion[]
}

export interface CreativeSuggestIntentContext {
  label: string
  lift: number
}

export interface CreativeSuggestInput {
  period: "30d" | "90d"
  top: AdCreativePerf[]
  bottom: AdCreativePerf[]
  /** 구매 의도 라벨 참고 컨텍스트 — lib/crm/lead-attribution 의 META_INTENT_RULES 를
   *  getMetaIntent 로 파생한, 이번 기간에 실제로 감지된 라벨만. 없으면 빈 배열. */
  intentContext: CreativeSuggestIntentContext[]
}

const SYSTEM_PROMPT = `너는 클래스인 KR 지사의 퍼포먼스 마케터다.
아래 JSON 데이터는 Meta 광고 소재(광고명) 단위로 집계한 리드·전환 "건수" 랭킹이다 — 이번 기간
상위(top) 소재와 하위(bottom, 리드 2건 이상인 것만) 소재, 그리고 캠페인·소재명 텍스트에서
감지된 구매 의도 라벨(intentContext, 참고용)이 함께 주어진다.

규칙:
- 입력에는 광고비·CPL·ROAS·매출이 없다. 어떤 형태로든 이 수치를 만들어내거나 언급하지 않는다.
- 오직 "리드 수"와 "전환 수" 만으로 판단한다. 리드가 적은(특히 5건 미만) 소재의 전환율은
  표본이 작아 신뢰도가 낮다는 점을 감안해서 말한다.
- 잘 전환되는 소재의 공통 패턴을 먼저 뽑는다(patterns, 최대 5개) — 어투·소구점·타깃 키워드 등
  소재명 텍스트에서 실제로 드러나는 특징만 쓴다. 근거 없는 일반론 금지.
- 다음에 집행할 신규 소재 제안 3~5개(suggestions)를 쓴다. 각 제안은
  headline(광고 문구 헤드라인 한 줄), body(본문 1~2문장), rationale(입력의 어떤 소재·패턴을
  근거로 했는지)로 구성한다.
- rationale 은 반드시 top/bottom 의 실제 소재명이나 patterns 를 근거로 든다.
- 결론 우선, 감정 표현·과장·이모지 금지. 한국어로만 작성한다.`

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    patterns: { type: "array", items: { type: "string" } },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          headline: { type: "string" },
          body: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["headline", "body", "rationale"],
      },
    },
  },
  required: ["patterns", "suggestions"],
} as const

const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro"
// 존재하지 않거나 이 호출 형태를 지원하지 않는 모델이 env 에 박혀도 404 로 죽지 않게 방어한다
// (gemini-runner.ts 의 UNSUPPORTED_GEMINI_MODELS 미러).
const UNSUPPORTED_GEMINI_MODELS = new Set(["gemini-3.1-pro"])

function resolveModel(): string {
  const configured = process.env.GEMINI_MODEL?.trim()
  if (!configured || UNSUPPORTED_GEMINI_MODELS.has(configured)) return DEFAULT_GEMINI_MODEL
  return configured
}

export async function callCreativeSuggestGemini(
  input: CreativeSuggestInput
): Promise<{ result: CreativeSuggestResult; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not set")

  const model = resolveModel()
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.4,
    },
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Connection: "close" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini ${res.status}: ${text}`)
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  const parsed = JSON.parse(text) as CreativeSuggestResult
  if (!Array.isArray(parsed.patterns) || !Array.isArray(parsed.suggestions)) {
    throw new Error("invalid Gemini response shape")
  }

  return { result: parsed, model }
}
