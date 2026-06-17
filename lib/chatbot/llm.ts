/**
 * Chatbot LLM 답변 생성 — Google Gemini (RAG)
 *
 * 검색으로 찾은 내부 정보(sources)를 참고해 한국어 답변을 생성한다.
 * - GEMINI_API_KEY 가 없으면 null → 호출부가 기존 템플릿 답변으로 폴백한다.
 * - 네트워크 오류·타임아웃·빈 응답도 모두 null 로 처리해 챗봇이 절대 끊기지 않게 한다.
 * - 공개 답변에는 문서, 출처, URL, 이미지 경로를 드러내지 않는다.
 */

import "server-only"

import {
  CLASSIN_POSITIONING,
  getClassinChatbotReferenceContext,
  getClassinPositioningContext,
} from "@/lib/classin-positioning"
import type { ChatbotSource } from "./service"

export type ChatbotModelTier = "basic" | "reasoning" | "advanced"

// 챗봇 모델 티어별 기본 모델 설정
const DEFAULT_FAST_MODEL = "gemini-3.5-flash"
const DEFAULT_REASONING_MODEL = "gemini-2.0-flash-thinking-exp-01-21"
const DEFAULT_ADVANCED_MODEL = "gemini-2.5-pro"

const UNSUPPORTED_GEMINI_MODELS = new Set(["gemini-3.1-pro"])
const GEMINI_TIMEOUT_MS = 4500
const MAX_ANSWER_LENGTH = 520

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

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY?.trim() || null
}

const BASE_SYSTEM_INSTRUCTION = [
  "너는 Classin(학원·교육기관용 수업/운영 솔루션)의 친근하고 따뜻한 온라인 상담원이야. 딱딱한 안내봇이 아니라 곁에서 도와주는 사람처럼 말해.",
  `제품 정체성은 '${CLASSIN_POSITIONING.categoryName}'이다.`,
  getClassinPositioningContext(),
  getClassinChatbotReferenceContext(),
  `답변 원칙: ${CLASSIN_POSITIONING.chatbot.answerPrinciples.join(" ")}`,
  "필요하면 짧은 공감 한마디(예: '네, ~ 찾고 계시는군요')로 시작하되, 곧바로 핵심 답으로 이어가. 첫 문장에서 질문에 바로 답해.",
  "따뜻함은 단어와 어조로만 더하고 문장 수나 길이는 늘리지 마. 이모지는 쓰지 않는다.",
  "질문이 짧거나 넓으면(예: '어떤 모델 있어?') 핵심만 2~3줄로 답하고, '원하시면 사양/가격도 정리해드릴까요?'처럼 더 도울 거리를 한 번만 제안해.",
  "사양·사이즈·특정 모델을 콕 집어 물으면 그때 자세히 답해. 답은 필요한 만큼만, 길어도 핵심 위주로 끝내.",
  "한눈에 읽히게 짧은 문장과 줄바꿈으로 정리해. 모델·사양처럼 2개 이상 나열할 때는 '- '로 시작하는 불릿 목록을 쓰고, 순서가 중요한 절차에만 번호 목록을 써(최대 4개).",
  "'요약:', '권장 순서:', '확인 기준:' 같은 내부 보고서식 라벨은 쓰지 마.",
  "마지막에는 필요한 경우에만 확인 질문 1개를 붙여.",
  "가격·계약·장비 상태·도입 조건처럼 계정마다 달라지는 내용은 단정하지 마.",
  "Zoom, 일반 전자칠판, LMS와의 비교 질문은 기능표보다 수업 운영 흐름 차이로 설명해.",
  "결제, 오프라인 출석, 고급 리포트는 기본 제공처럼 말하지 말고 필요 시 API·외부 시스템·커스텀 리포트 범위로 분리해.",
  "답변에는 문서, 출처, 참고 자료, URL, 이미지 경로, 마크다운 링크를 드러내지 말고 자연스러운 문장으로만 답해.",
].join(" ")

const FINAL_SYSTEM_INSTRUCTION = [
  BASE_SYSTEM_INSTRUCTION,
  "너는 내부 검색 정보와 Classin 기본 지식을 참고하되, 최종 고객 답변은 직접 작성한다.",
  "내부 정보가 질문과 조금 어긋나면 그대로 요약하지 말고 고객 의도에 맞는 Classin 답변으로 재정리해.",
  "문서가 부족해도 도입, 수업 운영, 제품 소개처럼 안전한 범위는 합리적으로 유추해 답해.",
  "다만 가격, 계약, 환불, 계정, 장애, 설치 가능 여부, 장비 상태는 확정하지 말고 확인할 정보와 다음 행동을 짧게 안내해.",
  "클래스인 칠판, 보드, 전자칠판 종류를 묻는 질문은 Classin Board 라인업과 교실 규모 기준으로 답해. AI 칠판, AI 채점, 릴리즈노트와 혼동하지 마.",
  "넓은 질문은 2~3문장으로, 사양·상세 질문은 '- ' 불릿으로 정리하되 길어도 450자 안팎으로 끝내.",
].join("\n")

const RAG_SYSTEM_INSTRUCTION = [
  BASE_SYSTEM_INSTRUCTION,
  "아래 내부 검증 정보에 담긴 내용 중심으로 한국어로 답해.",
  "내부 정보에 없는 계정별·계약별 내용은 확정하지 말고, 정확한 확인이 필요하면 상담 연결을 권해.",
].join("\n")

const INFERENCE_SYSTEM_INSTRUCTION = [
  BASE_SYSTEM_INSTRUCTION,
  "내부 검색 정보가 부족한 제품 소개, 도입, 수업 운영 질문은 위 Classin 기본 지식과 합리적인 추론으로 답해.",
  "단, 가격, 계약, 환불, 계정, 장애, 장비 상태, 설치 가능 여부, 법적·개인정보 관련 내용은 추론하지 말고 상담 확인이 필요하다고 말해.",
  "모르는 세부 기능을 있는 것처럼 단정하지 말고, 고객이 선택할 수 있는 다음 질문을 하나만 제안해.",
].join("\n")

interface GenerateArgs {
  /** PII 가 제거된 질문 텍스트 */
  question: string
  sources: ChatbotSource[]
  tier?: ChatbotModelTier
  history?: { role: "user" | "model"; parts: { text: string }[] }[]
}

interface InferredGenerateArgs {
  /** PII 가 제거된 질문 텍스트 */
  question: string
  category: string
  tier?: ChatbotModelTier
  history?: { role: "user" | "model"; parts: { text: string }[] }[]
}

interface FinalGenerateArgs {
  /** PII 가 제거된 질문 텍스트 */
  question: string
  category: string
  answerMode: string
  draftAnswer: string
  sources?: ChatbotSource[]
  tier?: ChatbotModelTier
  history?: { role: "user" | "model"; parts: { text: string }[] }[]
}

export function sanitizePublicAnswerText(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\((?:https?:\/\/|\/)[^)]+\)/g, "$1")
    .replace(/https?:\/\/[^\s)]+/g, "")
    .replace(/(?:\/docs|\/images|\/resources)\/[^\s)]+/g, "")
    .replace(/\[image[_\-\s]?\d*]/gi, "")
    .replace(/^\s*(?:출처|참고\s*문서|근거\s*자료|문서\s*보기)\s*:.*$/gim, "")
    .replace(/[^\S\r\n]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function sanitizeInternalContextText(value: string) {
  return sanitizePublicAnswerText(value)
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 520)
}

function formatInternalContext(sources: ChatbotSource[] = []) {
  return sources
    .slice(0, 2)
    .map((source, index) => {
      const heading = source.heading ? ` / ${source.heading}` : ""
      return `[내부 정보 ${index + 1}] ${sanitizeInternalContextText(`${source.title}${heading}`)}\n${sanitizeInternalContextText(source.excerpt)}`
    })
    .join("\n\n")
}

async function requestGeminiContent({
  systemInstruction,
  contents,
  tier,
  temperature,
}: {
  systemInstruction: string
  contents: { role: "user" | "model"; parts: { text: string }[] }[]
  tier: ChatbotModelTier
  temperature: number
}) {
  const apiKey = getGeminiApiKey()
  if (!apiKey) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${resolveModel(tier)}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: {
            temperature,
            topP: 0.9,
            maxOutputTokens: 256,
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
    const sanitized = sanitizePublicAnswerText(text)
    if (!sanitized) return null
    return sanitized.slice(0, MAX_ANSWER_LENGTH)
  } catch {
    // 타임아웃·네트워크·파싱 오류 → 폴백
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function generateGeminiAnswer({
  question,
  sources,
  tier = "basic",
  history,
}: GenerateArgs): Promise<string | null> {
  if (!getGeminiApiKey() || sources.length === 0 || !question.trim()) {
    return null
  }

  const context = formatInternalContext(sources)

  const prompt = `내부 검증 정보:\n${context}\n\n고객 질문: ${question}\n\n위 내부 정보를 바탕으로 답변해줘.`

  const userContent = { role: "user" as const, parts: [{ text: prompt }] }
  const contents = history && history.length > 0
    ? [...history, userContent]
    : [userContent]

  return requestGeminiContent({
    systemInstruction: RAG_SYSTEM_INSTRUCTION,
    contents,
    tier,
    temperature: 0.2,
  })
}

export async function generateGeminiFinalAnswer({
  question,
  category,
  answerMode,
  draftAnswer,
  sources = [],
  tier = "basic",
  history,
}: FinalGenerateArgs): Promise<string | null> {
  if (!getGeminiApiKey() || !question.trim()) return null

  const context = formatInternalContext(sources)
  const prompt = [
    `분류: ${category}`,
    `현재 응답 모드: ${answerMode}`,
    context ? `내부 검증 정보(사용자에게 직접 언급 금지):\n${context}` : "내부 검증 정보: 없음",
    `안전 초안(필요하면 고쳐 쓰기):\n${sanitizeInternalContextText(draftAnswer)}`,
    `고객 질문: ${question}`,
    "최종 고객 답변만 작성해줘. 문서, 출처, URL, 이미지 경로는 쓰지 마.",
  ].join("\n\n")

  const userContent = { role: "user" as const, parts: [{ text: prompt }] }
  const contents = history && history.length > 0
    ? [...history, userContent]
    : [userContent]

  return requestGeminiContent({
    systemInstruction: FINAL_SYSTEM_INSTRUCTION,
    contents,
    tier,
    temperature: 0.25,
  })
}

export async function generateGeminiInferredAnswer({
  question,
  category,
  tier = "basic",
  history,
}: InferredGenerateArgs): Promise<string | null> {
  if (!getGeminiApiKey() || !question.trim()) return null

  const prompt = [
    `분류: ${category}`,
    `고객 질문: ${question}`,
    "내부 검색 결과가 부족하다. Classin 기본 지식으로 안전하게 답변해줘.",
  ].join("\n")

  const userContent = { role: "user" as const, parts: [{ text: prompt }] }
  const contents = history && history.length > 0
    ? [...history, userContent]
    : [userContent]

  return requestGeminiContent({
    systemInstruction: INFERENCE_SYSTEM_INSTRUCTION,
    contents,
    tier,
    temperature: 0.25,
  })
}

/**
 * Gemini 임베딩 생성. 키가 없거나 오류면 null → 호출부가 키워드 검색으로 폴백.
 * - 검색 질문: RETRIEVAL_QUERY, 문서 청크: RETRIEVAL_DOCUMENT (비대칭 검색 품질↑)
 */
export async function embedText(
  text: string,
  taskType: EmbedTaskType
): Promise<number[] | null> {
  const apiKey = getGeminiApiKey()
  if (!apiKey || !text.trim()) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CHATBOT_EMBED_MODEL}:embedContent?key=${apiKey}`,
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
