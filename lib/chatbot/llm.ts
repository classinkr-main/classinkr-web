/**
 * Chatbot LLM 답변 생성 — Google Gemini (RAG)
 *
 * 검색으로 찾은 가이드 문서 발췌(sources)를 근거로 한국어 답변을 생성한다.
 * - GEMINI_API_KEY 가 없으면 null → 호출부가 기존 템플릿 답변으로 폴백한다.
 * - 네트워크 오류·타임아웃·빈 응답도 모두 null 로 처리해 챗봇이 절대 끊기지 않게 한다.
 * - 근거 문서에 없는 내용은 추측하지 않도록 강하게 지시(그라운딩)한다.
 */

import "server-only"

import { CLASSIN_POSITIONING, getClassinPositioningContext } from "@/lib/classin-positioning"
import type { ChatbotSource } from "./service"

export type ChatbotModelTier = "basic" | "reasoning" | "advanced"

// 챗봇 모델 티어별 기본 모델 설정
const DEFAULT_FAST_MODEL = "gemini-3.5-flash"
const DEFAULT_REASONING_MODEL = "gemini-2.0-flash-thinking-exp-01-21"
const DEFAULT_ADVANCED_MODEL = "gemini-2.5-pro"

const UNSUPPORTED_GEMINI_MODELS = new Set(["gemini-3.1-pro"])
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_TIMEOUT_MS = 8000
const MAX_ANSWER_LENGTH = 1500

// 운영 docs_ai_chunks.embedding 은 현재 vector(1536). 768 전환 migration을 적용한 환경은
// GEMINI_EMBED_DIM=768로 맞춘다. 코사인 유사도는 스케일 불변이라 정규화는 생략한다.
export const CHATBOT_EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001"
export const CHATBOT_EMBED_DIM = Number(process.env.GEMINI_EMBED_DIM ?? "1536")
export type EmbedTaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"

function resolveModel(tier: ChatbotModelTier = "basic") {
  if (tier === "advanced") {
    const configured = process.env.GEMINI_MODEL?.trim()
    if (!configured || UNSUPPORTED_GEMINI_MODELS.has(configured)) return DEFAULT_ADVANCED_MODEL
    return configured
  }
  if (tier === "reasoning") {
    const configured = process.env.GEMINI_REASONING_MODEL?.trim()
    if (!configured || UNSUPPORTED_GEMINI_MODELS.has(configured)) return DEFAULT_REASONING_MODEL
    return configured
  }
  // basic
  const configured = process.env.GEMINI_FAST_MODEL?.trim()
  if (!configured || UNSUPPORTED_GEMINI_MODELS.has(configured)) return DEFAULT_FAST_MODEL
  return configured
}

const SYSTEM_INSTRUCTION = [
  "너는 Classin(학원·교육기관용 수업/운영 솔루션)의 고객 상담 가이드야.",
  `제품 정체성은 '${CLASSIN_POSITIONING.categoryName}'이다.`,
  getClassinPositioningContext(),
  `답변 원칙: ${CLASSIN_POSITIONING.chatbot.answerPrinciples.join(" ")}`,
  "아래 '참고 문서'에 담긴 내용만 근거로 한국어로 간결하게 답해.",
  "답변 형식은 가능하면 '요약:', '권장 순서:', '확인 기준:' 3개 묶음으로 구성해.",
  "권장 순서는 실제 운영자가 바로 따라 할 수 있게 2~3단계로 써.",
  "확인 기준은 답변을 실행한 뒤 무엇이 되면 성공인지 한 문장으로 써.",
  "문서에 없는 내용은 추측하거나 지어내지 말고, 정확한 확인이 필요하면 상담 연결을 권해.",
  "가격·계약·장비 상태·도입 조건처럼 계정마다 달라지는 내용은 단정하지 마.",
  "Zoom, 일반 전자칠판, LMS와의 비교 질문은 기능표보다 수업 운영 흐름 차이로 설명해.",
  "결제, 오프라인 출석, 고급 리포트는 기본 제공처럼 말하지 말고 필요 시 API·외부 시스템·커스텀 리포트 범위로 분리해.",
  "답변에는 문서 번호나 URL을 나열하지 말고 자연스러운 문장으로만 답해. 출처는 시스템이 따로 덧붙인다.",
].join(" ")

interface GenerateArgs {
  /** PII 가 제거된 질문 텍스트 */
  question: string
  sources: ChatbotSource[]
  tier?: ChatbotModelTier
  history?: { role: "user" | "model"; parts: { text: string }[] }[]
}

export async function generateGeminiAnswer({
  question,
  sources,
  tier = "basic",
  history,
}: GenerateArgs): Promise<string | null> {
  if (!GEMINI_API_KEY || sources.length === 0 || !question.trim()) {
    return null
  }

  const context = sources
    .map((source, index) => {
      const heading = source.heading ? ` > ${source.heading}` : ""
      return `[문서 ${index + 1}] ${source.title}${heading}\n${source.excerpt}`
    })
    .join("\n\n")

  const prompt = `참고 문서:\n${context}\n\n고객 질문: ${question}\n\n위 참고 문서를 근거로 답변해줘.`

  const contents = history && history.length > 0
    ? [...history, { role: "user", parts: [{ text: prompt }] }]
    : [{ role: "user", parts: [{ text: prompt }] }]

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${resolveModel(tier)}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents,
          generationConfig: {
            temperature: 0.3,
            topP: 0.9,
            maxOutputTokens: 512,
          },
        }),
      }
    )

    if (!res.ok) return null

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim()

    if (!text) return null
    return text.slice(0, MAX_ANSWER_LENGTH)
  } catch {
    // 타임아웃·네트워크·파싱 오류 → 폴백
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Gemini 임베딩 생성. 키가 없거나 오류면 null → 호출부가 키워드 검색으로 폴백.
 * - 검색 질문: RETRIEVAL_QUERY, 문서 청크: RETRIEVAL_DOCUMENT (비대칭 검색 품질↑)
 */
export async function embedText(
  text: string,
  taskType: EmbedTaskType
): Promise<number[] | null> {
  if (!GEMINI_API_KEY || !text.trim()) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CHATBOT_EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: `models/${CHATBOT_EMBED_MODEL}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: CHATBOT_EMBED_DIM,
        }),
      }
    )

    if (!res.ok) return null

    const data = (await res.json()) as { embedding?: { values?: number[] } }
    const values = data.embedding?.values
    if (!Array.isArray(values) || values.length === 0) return null
    return values
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
