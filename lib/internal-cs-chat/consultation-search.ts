import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * 과거 채널톡 상담 사례를 벡터 검색해 내부 CS 코파일럿의 3번째 근거 소스로 제공한다.
 *
 * 안전 규약(공개 리트리버 publicEvidence 패턴 준수):
 * - 절대 throw 하지 않는다. 키/환경/RPC/네트워크 실패는 모두 조용히 []를 돌린다.
 * - 3.5초 타임아웃 시 []를 돌린다(코파일럿 응답 흐름을 막지 않는다).
 *
 * 임베딩 차원 주의:
 * - channel_conversation_chunks.embedding 은 vector(768) 이다. 공개 docs(현재 vector(1536))와
 *   다른 공간이므로 lib/chatbot/llm.ts 의 embedText(운영 기본 1536)를 그대로 재사용하면 차원이
 *   어긋난다. 여기서는 청크 임베딩과 동일 모델(gemini-embedding-001)로 768차원 질문 임베딩을
 *   직접 생성한다(RETRIEVAL_QUERY, 비대칭 검색).
 */
export interface ConsultationEvidence {
  conversationId: string
  excerpt: string
  /** ChatbotCategory 값 또는 null (RPC가 조인해 준 chunks.category). */
  category: string | null
  tags: string[]
  matchedOrg: string | null
  occurredAt: string | null
  similarity: number
}

interface MatchChannelChunkRow {
  chunk_id: string
  conversation_id: string
  content: string
  category: string | null
  similarity: number
  tags: string[] | null
  first_question: string | null
  matched_org: string | null
  last_message_at: string | null
}

const DEFAULT_LIMIT = 4
const MAX_LIMIT = 8
const SEARCH_TIMEOUT_MS = 3_500
const EMBED_TIMEOUT_MS = 2_000
// 공개 vectorSearch VECTOR_SIMILARITY_FLOOR 과 동일한 하한을 유지한다.
const MIN_SIMILARITY = 0.5

// 채널 상담 청크와 동일한 임베딩 모델. 차원은 vector(768) 컬럼에 맞춰 768로 고정하되,
// 백필 스크립트가 다른 차원을 쓰는 환경을 위해 전용 env로만 재정의할 수 있게 둔다.
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001"
const EMBED_DIM = Number(process.env.CHANNEL_CONVERSATION_EMBED_DIM ?? "768")

function hasSupabaseServerEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      (process.env.SUPABASE_SECRET_KEY?.trim() ||
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  )
}

async function embedConsultationQuery(question: string): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey || !question.trim()) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS)

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text: question }] },
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: EMBED_DIM,
        }),
      }
    )

    if (!res.ok) return null
    const data = (await res.json()) as { embedding?: { values?: number[] } }
    const values = data.embedding?.values
    return Array.isArray(values) && values.length > 0 ? values : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function toEvidence(row: MatchChannelChunkRow): ConsultationEvidence {
  const category = typeof row.category === "string" ? row.category.trim() : ""
  return {
    conversationId: row.conversation_id,
    excerpt: typeof row.content === "string" ? row.content.trim() : "",
    category: category || null,
    tags: Array.isArray(row.tags)
      ? row.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim()))
      : [],
    matchedOrg: typeof row.matched_org === "string" && row.matched_org.trim() ? row.matched_org : null,
    occurredAt: typeof row.last_message_at === "string" && row.last_message_at ? row.last_message_at : null,
    similarity: typeof row.similarity === "number" && Number.isFinite(row.similarity) ? row.similarity : 0,
  }
}

async function runSearch(question: string, limit: number): Promise<ConsultationEvidence[]> {
  if (!hasSupabaseServerEnv()) return []

  const embedding = await embedConsultationQuery(question)
  if (!embedding) return []

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc("match_channel_conversation_chunks", {
    // pgvector 인자는 "[..]" 문자열로 넘긴다(배열 직접 전달 시 Postgres 배열로 직렬화돼 거부됨).
    query_embedding: JSON.stringify(embedding),
    match_count: limit,
    min_similarity: MIN_SIMILARITY,
  })

  if (error) {
    console.warn("[internal-cs] consultation search failed:", error.message)
    return []
  }

  return ((data ?? []) as MatchChannelChunkRow[])
    .filter(
      (row) =>
        row &&
        typeof row.conversation_id === "string" &&
        typeof row.content === "string" &&
        Boolean(row.content.trim())
    )
    .map(toEvidence)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit)
}

/**
 * 질문과 유사한 과거 상담 사례를 반환한다. 실패·지연 시 조용히 []를 돌린다(never-throw).
 */
export async function searchConsultationEvidence(
  question: string,
  opts: { limit?: number } = {}
): Promise<ConsultationEvidence[]> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(opts.limit ?? DEFAULT_LIMIT)))
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    const timeout = new Promise<ConsultationEvidence[]>((resolve) => {
      timeoutId = setTimeout(() => resolve([]), SEARCH_TIMEOUT_MS)
    })
    return await Promise.race([
      runSearch(question, limit).catch(() => []),
      timeout,
    ])
  } catch {
    return []
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
