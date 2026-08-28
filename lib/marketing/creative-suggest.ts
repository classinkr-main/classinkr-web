// lib/marketing/creative-suggest.ts
// AI 소재 제안 Gemini 호출 — lib/marketing/insights/gemini-runner.ts 와 같은 호출 규약
// (v1beta generateContent, responseSchema 로 JSON 강제, temperature 0.4)을 따른다. 모델명
// 해석·미지원 모델 방어·thinkingConfig 판정은 lib/marketing/gemini-model.ts 를 함께 쓴다
// (예전엔 이 파일이 그 상수들을 복제하고 있었다).
// gemini-runner.ts 를 그대로 재사용하지 않는 이유는 그 모듈이
// 주간 브리핑 타입(MarketingInsightInput/Result)에 결합돼 있어서다 — 호출 방식만 미러하고
// 타입·프롬프트·스키마는 소재 제안 도메인 것으로 새로 둔다.
//
// 정직 규칙(2026-08-28 갱신): 입력에는 소재별 광고비·CPL 이 있다 — Compass 브리지(ad 레벨
// Meta insights)에서 광고명으로 조인한 실측값이다. 매칭 실패는 null(미집계)이지 0 이 아니다.
// 여전히 없는 것은 매출·ROAS 뿐이며, 시스템 프롬프트가 그 제약과 두 리드 축(우리 leads 테이블
// vs Meta 리포트)의 차이를 명시한다. 스키마는 어느 수치도 담을 자리를 주지 않는다(문장만 받는다).

import "server-only"

import type { RankedCreativeWithSpend } from "@/lib/marketing/compass-creative"
// 모델명 해석·thinkingConfig 판정은 브리핑 호출과 공유하는 SSOT 에서 온다.
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_FETCH_TIMEOUT_MS,
  resolveGeminiModel,
  rethrowGeminiFetchError,
  thinkingConfigFor,
} from "@/lib/marketing/gemini-model"

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
  top: RankedCreativeWithSpend[]
  bottom: RankedCreativeWithSpend[]
  /** 구매 의도 라벨 참고 컨텍스트 — lib/crm/lead-attribution 의 META_INTENT_RULES 를
   *  getMetaIntent 로 파생한, 이번 기간에 실제로 감지된 라벨만. 없으면 빈 배열. */
  intentContext: CreativeSuggestIntentContext[]
  /** 지출/CPL 이 붙은 소재 수 — 프롬프트가 "몇 개나 금액을 아는지"를 사실대로 말하게 한다. */
  spendMatchedCount: number
}

const SYSTEM_PROMPT = `너는 클래스인 KR 지사의 퍼포먼스 마케터다.
아래 JSON 데이터는 Meta 광고 소재(광고명) 단위 랭킹이다 — 이번 기간 상위(top) 소재와
하위(bottom, 리드 2건 이상인 것만) 소재, 그리고 캠페인·소재명 텍스트에서 감지된 구매 의도
라벨(intentContext, 참고용)이 함께 주어진다.

각 소재 행의 필드:
- leads / converted: 우리 리드 DB 기준 유입·전환 "건수".
- compass_leads: Meta 리포트가 센 리드 수(Compass 수집분). leads 와 모집단이 달라 값이 다르다.
- spend_usd: 그 소재의 광고비(USD, Compass 수집분). null 이면 금액 미집계다.
- cpl_usd: spend_usd ÷ compass_leads. 즉 Meta 리포트 축끼리 나눈 CPL이다.
- spend_matched: false 면 금액을 못 붙였다는 뜻.

규칙:
- spend_usd·cpl_usd 는 입력에 있는 값만 인용한다. null 인 소재는 "광고비 0" 이 아니라
  "미집계"다 — 0 으로 말하지 않는다. 직접 나눗셈해서 새 CPL 을 만들지 않는다.
- 매출·ROAS 는 입력에 없다. 어떤 형태로도 만들어내거나 언급하지 않는다.
- CPL 을 비교할 때는 cpl_usd 끼리만 비교한다. spend_usd 를 leads(우리 DB 축)로 나눈 값을
  만들지 않는다 — 분자와 분모의 모집단이 다르다.
- 리드가 적은(특히 5건 미만) 소재의 전환율·CPL 은 표본이 작아 신뢰도가 낮다는 점을 감안해 말한다.
- USD 를 원화로 환산하지 않는다.
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

export async function callCreativeSuggestGemini(
  input: CreativeSuggestInput
): Promise<{ result: CreativeSuggestResult; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not set")

  const model = resolveGeminiModel("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  // 기본 모델(2.5-pro)에서는 undefined — env 가 flash·3 계열을 가리킬 때만 붙는다.
  const thinking = thinkingConfigFor(model)
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.4,
      ...(thinking ? { thinkingConfig: thinking } : {}),
    },
  }

  // 라우트 maxDuration(60)에만 기대면 플랫폼이 함수를 죽여 에러 응답조차 못 돌려준다.
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Connection: "close" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GEMINI_FETCH_TIMEOUT_MS),
  }).catch((e: unknown) => rethrowGeminiFetchError(e, model))
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
