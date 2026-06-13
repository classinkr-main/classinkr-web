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

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { evaluateChatbotQuery } from "./service"

const DRAFT_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-pro"
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
}

interface SearchEventRow {
  normalized_query: string | null
  created_at: string
}

export async function listDocGapBacklog(options: { limit?: number } = {}): Promise<DocGapBacklog> {
  const limit = options.limit ?? 30

  try {
    const supabase = createSupabaseAdminClient()

    // 매핑 문서가 없는 클러스터 = 문서가 없는 질문
    const { data: clusterRows, error: clusterError } = await supabase
      .from("question_clusters")
      .select("id, label, canonical_question, category, status, last_seen_at, sample_questions")
      .is("mapped_article_id", null)
      .in("status", ["candidate", "approved"])
      .order("last_seen_at", { ascending: false })
      .limit(limit)

    if (clusterError) throw new Error(clusterError.message)

    const gapClusters: DocGapCluster[] = ((clusterRows ?? []) as ClusterRow[]).map((row) => ({
      id: row.id,
      label: row.label,
      question: row.canonical_question,
      category: row.category,
      sampleCount: Array.isArray(row.sample_questions) ? row.sample_questions.length : 0,
      lastSeenAt: row.last_seen_at,
      status: row.status,
    }))

    // zero-result 검색어 — 최근 이벤트를 JS에서 집계
    const { data: eventRows, error: eventError } = await supabase
      .from("docs_search_events")
      .select("normalized_query, created_at")
      .eq("result_count", 0)
      .order("created_at", { ascending: false })
      .limit(500)

    if (eventError) throw new Error(eventError.message)

    const counts = new Map<string, { count: number; lastSeenAt: string }>()
    for (const event of (eventRows ?? []) as SearchEventRow[]) {
      const query = (event.normalized_query ?? "").trim()
      if (!query) continue
      const current = counts.get(query)
      if (current) current.count += 1
      else counts.set(query, { count: 1, lastSeenAt: event.created_at })
    }

    const zeroResultSearches: ZeroResultSearch[] = [...counts.entries()]
      .map(([query, value]) => ({ query, count: value.count, lastSeenAt: value.lastSeenAt }))
      .sort((left, right) => right.count - left.count)
      .slice(0, limit)

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

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${DRAFT_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null
    const parsed = JSON.parse(text) as {
      title?: string
      contentMarkdown?: string
      suggestedCategory?: string
    }
    if (!parsed.title || !parsed.contentMarkdown) return null

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
    return null
  }
}
