/**
 * 문서 보강 큐(B5) + AI 초안 생성(B6) — 콘텐츠 자가증식 루프의 "갭 → 초안" 구간.
 *
 * B5 listDocGapBacklog: 매핑 문서가 없는 질문 클러스터 + zero-result 검색어를
 *   actionable 백로그로 묶는다. (신규 수집 없음 — 기존 question_clusters / docs_search_events 활용)
 * B6 generateDocDraft: 갭 질문에 대해 기존 문서를 근거(RAG)로 Gemini 초안을 만든다.
 *   ※ 자동 저장하지 않는다 — 어드민이 검토 후 기존 문서 생성 플로우로 게시한다.
 *
 * 서버 전용. 어드민 API(app/api/admin/docs/gaps)에서만 호출.
 */

import "server-only"

import { unstable_cache } from "next/cache"
import { assertJsonSafeInDev } from "@/lib/server/json-safe"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { DOC_GAP_BACKLOG_CACHE_TAG } from "@/lib/chatbot/cache-tags"
import { resolveModelChain } from "./llm"
import { evaluateChatbotQuery } from "./service"

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const DOC_CATEGORIES = ["start", "software", "admin", "teacher", "student", "hardware", "board"]

export interface DocGapCluster {
  id: string
  label: string
  question: string
  category: string | null
  sampleCount: number
  lastSeenAt: string
  status: string
  /**
   * 유입 출처(계약 1·2) — UI 의 소스 배지/필터와 내부 CS 대화 딥링크가 소비한다.
   * 기존 데이터에는 없을 수 있어 옵셔널이다.
   */
  metadata?: {
    source?: string
    internalCs?: Array<{ conversationId: string; messageId: string }>
    notHelpfulCount?: number
    occurrenceCount?: number
  }
}

export interface ZeroResultSearch {
  query: string
  count: number
  lastSeenAt: string
}

export interface DocGapBacklog {
  gapClusters: DocGapCluster[]
  zeroResultSearches: ZeroResultSearch[]
  warning?: string
}

interface ClusterRow {
  id: string
  label: string
  canonical_question: string
  category: string | null
  status: string
  last_seen_at: string
  sample_questions: string[] | null
  metadata: Record<string, unknown> | null
}

interface SearchEventRow {
  normalized_query: string | null
  created_at: string
}

interface MappedClusterRow {
  label: string | null
  canonical_question: string | null
}

function normalizeGapQuery(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase()
}

// metadata 는 jsonb 자유형이므로 UI 계약(source/internalCs)에 맞는 값만 통과시킨다.
function normalizeGapClusterMetadata(value: unknown): DocGapCluster["metadata"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>

  const source =
    typeof record.source === "string" && record.source.trim() ? record.source : undefined
  const internalCs = Array.isArray(record.internalCs)
    ? record.internalCs.filter(
        (entry): entry is { conversationId: string; messageId: string } => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false
          const candidate = entry as Record<string, unknown>
          return (
            typeof candidate.conversationId === "string" &&
            typeof candidate.messageId === "string"
          )
        }
      )
    : undefined
  const notHelpfulCount =
    typeof record.notHelpfulCount === "number" &&
    Number.isFinite(record.notHelpfulCount) &&
    record.notHelpfulCount > 0
      ? Math.floor(record.notHelpfulCount)
      : undefined
  const occurrenceCount =
    typeof record.occurrenceCount === "number" &&
    Number.isFinite(record.occurrenceCount) &&
    record.occurrenceCount > 0
      ? Math.floor(record.occurrenceCount)
      : undefined

  if (
    !source &&
    (!internalCs || internalCs.length === 0) &&
    notHelpfulCount === undefined &&
    occurrenceCount === undefined
  ) {
    return undefined
  }
  return {
    ...(source ? { source } : {}),
    ...(internalCs && internalCs.length > 0 ? { internalCs } : {}),
    ...(notHelpfulCount !== undefined ? { notHelpfulCount } : {}),
    ...(occurrenceCount !== undefined ? { occurrenceCount } : {}),
  }
}

export function filterMappedZeroResultSearches(
  searches: ZeroResultSearch[],
  mappedQuestions: string[]
) {
  const mapped = new Set(
    mappedQuestions
      .map(normalizeGapQuery)
      .filter(Boolean)
  )

  if (mapped.size === 0) return searches
  return searches.filter((search) => !mapped.has(normalizeGapQuery(search.query)))
}

// listDocGapBacklog 는 기존에 서버 캐시가 전혀 없었다 — 문서 센터 "보강 큐" 탭과 알파 준비도
// 패널을 열 때마다(콜드 인스턴스 포함) question_clusters 조회 + docs_search_events 500행 읽기 +
// 매핑된 클러스터 1000행 읽기까지 3개 쿼리를 매번 다시 실행했다. unstable_cache(Next Data
// Cache)는 인스턴스 간 공유되고 stale-while-revalidate 로 응답하므로 60초 안에서는 재방문·
// 다른 콜드 인스턴스 모두 DB 왕복 없이 같은 값을 받는다. limit 은 호출자마다 달라
// (gaps 라우트=기본 30, alpha-readiness=100) 인자로 그대로 넘겨 캐시 키가 limit 별로 갈리게
// 한다. 실패 시의 warning 폴백도 함께 캐시되지만 os-summary(getCachedOsSummary)와 같은 의도적
// 선택이다 — 장애 중에도 60초 동안은 재조회를 막아 DB 부하를 늘리지 않는다.
async function computeDocGapBacklog(limit: number): Promise<DocGapBacklog> {
  try {
    const supabase = createSupabaseAdminClient()

    // 매핑 문서가 없는 클러스터 = 문서가 없는 질문
    const { data: clusterRows, error: clusterError } = await supabase
      .from("question_clusters")
      .select(
        "id, label, canonical_question, category, status, last_seen_at, sample_questions, metadata"
      )
      .is("mapped_article_id", null)
      .in("status", ["candidate", "approved"])
      .order("last_seen_at", { ascending: false })
      .limit(limit)

    if (clusterError) throw new Error(clusterError.message)

    const rawClusterRows = (clusterRows ?? []) as ClusterRow[]

    // zero-result 검색어 — 최근 이벤트를 JS에서 집계
    const { data: eventRows, error: eventError } = await supabase
      .from("docs_search_events")
      .select("normalized_query, created_at")
      .eq("result_count", 0)
      .order("created_at", { ascending: false })
      .limit(500)

    if (eventError) throw new Error(eventError.message)

    const { data: mappedRows, error: mappedError } = await supabase
      .from("question_clusters")
      .select("label, canonical_question")
      .not("mapped_article_id", "is", null)
      .limit(1000)

    if (mappedError) throw new Error(mappedError.message)

    const clusterEventCounts = new Map<string, number>()
    if (rawClusterRows.length > 0) {
      // sample_questions 는 5개 상한 + 문자열 중복 제거라 실제 누적 빈도를 반영하지 못한다.
      // question_cluster_events 건수를 합산해 동일 질문 50회 유입도 정확히 드러낸다.
      try {
        const { data: clusterEventRows, error: clusterEventError } = await supabase
          .from("question_cluster_events")
          .select("cluster_id")
          .in(
            "cluster_id",
            rawClusterRows.map((row) => row.id)
          )
          .limit(5000)

        if (!clusterEventError && Array.isArray(clusterEventRows)) {
          for (const row of clusterEventRows as Array<{ cluster_id?: unknown }>) {
            if (typeof row.cluster_id === "string" && row.cluster_id) {
              clusterEventCounts.set(row.cluster_id, (clusterEventCounts.get(row.cluster_id) ?? 0) + 1)
            }
          }
        }
      } catch {
        // 최소 모킹 테스트 환경에서 4번째 테이블 스텁이 없으면 sample_questions 길이로 폴백한다.
      }
    }

    const gapClusters: DocGapCluster[] = rawClusterRows.map((row) => {
      const metadata = normalizeGapClusterMetadata(row.metadata)
      const sampleQuestionsCount = Array.isArray(row.sample_questions) ? row.sample_questions.length : 0
      const eventCount = clusterEventCounts.get(row.id) ?? 0
      return {
        id: row.id,
        label: row.label,
        question: row.canonical_question,
        category: row.category,
        sampleCount: Math.max(sampleQuestionsCount, eventCount, metadata?.occurrenceCount ?? 0),
        lastSeenAt: row.last_seen_at,
        status: row.status,
        ...(metadata ? { metadata } : {}),
      }
    })

    const counts = new Map<string, { count: number; lastSeenAt: string }>()
    for (const event of (eventRows ?? []) as SearchEventRow[]) {
      const query = (event.normalized_query ?? "").trim()
      if (!query) continue
      const current = counts.get(query)
      if (current) current.count += 1
      else counts.set(query, { count: 1, lastSeenAt: event.created_at })
    }

    const mappedQuestions = ((mappedRows ?? []) as MappedClusterRow[]).flatMap((row) => [
      row.label ?? "",
      row.canonical_question ?? "",
    ])

    const zeroResultCandidates: ZeroResultSearch[] = [...counts.entries()]
      .map(([query, value]) => ({ query, count: value.count, lastSeenAt: value.lastSeenAt }))
      .sort((left, right) => right.count - left.count)
      .slice(0, limit)

    const zeroResultSearches = filterMappedZeroResultSearches(zeroResultCandidates, mappedQuestions)

    return { gapClusters, zeroResultSearches }
  } catch (error) {
    return {
      gapClusters: [],
      zeroResultSearches: [],
      warning:
        error instanceof Error
          ? `문서 보강 큐 조회 실패: ${error.message}`
          : "문서 보강 큐를 조회하지 못했습니다.",
    }
  }
}

const getCachedDocGapBacklog = unstable_cache(
  async (limit: number) => assertJsonSafeInDev("chatbot-doc-gap-backlog", await computeDocGapBacklog(limit)),
  ["chatbot-doc-gap-backlog-v1"],
  { revalidate: 60, tags: [DOC_GAP_BACKLOG_CACHE_TAG] }
)

export async function listDocGapBacklog(options: { limit?: number } = {}): Promise<DocGapBacklog> {
  const limit = options.limit ?? 30
  return getCachedDocGapBacklog(limit)
}

export interface DocDraft {
  title: string
  contentMarkdown: string
  suggestedCategory: string
  grounding: { title: string; urlPath: string }[]
}

export async function generateDocDraft(question: string): Promise<DocDraft | null> {
  if (!GEMINI_API_KEY || !question.trim()) return null

  // 기존 문서를 근거로 가져온다(없으면 빈 근거로 초안 — 갭이므로 자연스럽다).
  let grounding: { title: string; urlPath: string }[] = []
  let context = ""
  try {
    const retrieval = await evaluateChatbotQuery(question)
    grounding = retrieval.sources.map((source) => ({ title: source.title, urlPath: source.urlPath }))
    context = retrieval.sources
      .map((source, index) => {
        const heading = source.heading ? ` > ${source.heading}` : ""
        return `[${index + 1}] ${source.title}${heading}\n${source.excerpt}`
      })
      .join("\n\n")
  } catch {
    // 근거 검색 실패 시에도 초안은 생성한다
  }

  const body = {
    systemInstruction: {
      parts: [
        {
          text: [
            "너는 Classin 가이드 문서 작성자다. 고객 질문에 답하는 한국어 가이드 문서 초안을 작성한다.",
            "아래 '참고 문서'를 근거로 하되, 근거에 없는 사실은 지어내지 말고 본문에 '※ 확인 필요'로 표시한다.",
            "본문은 Markdown(제목 ## 단위, 단계는 목록)으로 쓴다. 이 초안은 어드민 검토 후 게시되므로 사실 확인 여지를 남긴다.",
          ].join(" "),
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `고객 질문:\n${question}\n\n참고 문서:\n${context || "(관련 문서 없음 — 초안에 확인 필요 항목을 표시)"}\n\n가이드 문서 초안을 작성하라.`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          contentMarkdown: { type: "string" },
          suggestedCategory: { type: "string", enum: DOC_CATEGORIES },
        },
        required: ["title", "contentMarkdown", "suggestedCategory"],
      },
      temperature: 0.4,
    },
  }

  // 초안 모델도 챗봇과 같은 체인을 쓴다. 종료된 모델이 env 에 남아 있거나 한 모델이 실패해도 다음 모델로 이어 간다.
  for (const model of resolveModelChain("advanced")) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )
      if (!res.ok) continue
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) continue
      const parsed = JSON.parse(text) as {
        title?: string
        contentMarkdown?: string
        suggestedCategory?: string
      }
      if (!parsed.title || !parsed.contentMarkdown) continue

      const suggestedCategory = DOC_CATEGORIES.includes(parsed.suggestedCategory ?? "")
        ? (parsed.suggestedCategory as string)
        : "start"

      return {
        title: parsed.title,
        contentMarkdown: parsed.contentMarkdown,
        suggestedCategory,
        grounding,
      }
    } catch {
      continue
    }
  }
  return null
}
