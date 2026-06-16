export type AlphaDbContractStatus = "ok" | "warning" | "blocked"

export interface AlphaDbTableProbe {
  table: string
  label: string
  columns: string[]
  migration: string
  minimumRows?: number
}

export interface AlphaDbRpcProbe {
  functionName: string
  label: string
  args: Record<string, unknown>
  migration: string
}

export interface AlphaDbProbeResult {
  table: string
  label: string
  count: number | null
  error: string | null
  minimumRows?: number
  migration?: string
}

export interface AlphaDbProbeIssue {
  table: string
  label: string
  message: string
  migration?: string
}

export interface AlphaDbProbeSummary {
  status: AlphaDbContractStatus
  ok: AlphaDbProbeResult[]
  warning: AlphaDbProbeIssue[]
  blocked: AlphaDbProbeIssue[]
}

export const ALPHA_DB_MIGRATIONS = [
  "supabase/migrations/20260614_alpha_admin_base_schema.sql",
  "supabase/migrations/20260421_docs_center.sql",
  "supabase/migrations/20260421_z_chatbot_analytics.sql",
  "supabase/migrations/20260520_chatbot_recommended_questions.sql",
  "supabase/migrations/20260614211500_chatbot_recommended_questions_alpha_seed.sql",
  "supabase/migrations/20260604_docs_article_drafts.sql",
  "supabase/migrations/20260613_docs_chunk_vector_search.sql",
  "supabase/migrations/20260615_public_material_downloads.sql",
  "supabase/migrations/20260616_public_material_downloads_hardening.sql",
  "supabase/migrations/20260616_docs_chunk_vector_rpc_text_compat.sql",
  "supabase/migrations/20260616_chatbot_channel_talk_handoffs.sql",
]

export const ALPHA_DB_TABLE_PROBES: AlphaDbTableProbe[] = [
  {
    table: "admin_profiles",
    label: "관리자 프로필",
    columns: ["user_id", "display_name", "role", "status"],
    migration: "supabase/migrations/20260614_alpha_admin_base_schema.sql",
  },
  {
    table: "leads",
    label: "리드 수집",
    columns: ["id", "name", "phone", "email", "source", "source_detail", "lead_magnet", "follow_up_at", "assigned_to"],
    migration: "supabase/migrations/20260614_alpha_admin_base_schema.sql",
  },
  {
    table: "audit_logs",
    label: "운영 감사 로그",
    columns: ["id", "actor_user_id", "action", "target_type", "target_id", "payload"],
    migration: "supabase/migrations/20260614_alpha_admin_base_schema.sql",
  },
  {
    table: "docs_articles",
    label: "공개 문서 원본",
    columns: ["id", "category_id", "slug", "status", "visibility", "noindex", "title", "content_markdown"],
    migration: "supabase/migrations/20260421_docs_center.sql",
    minimumRows: 1,
  },
  {
    table: "docs_article_versions",
    label: "문서 버전",
    columns: ["id", "article_id", "version_number", "title", "content_markdown"],
    migration: "supabase/migrations/20260421_docs_center.sql",
  },
  {
    table: "docs_ai_chunks",
    label: "RAG 문서 청크",
    columns: ["id", "article_id", "chunk_index", "heading", "content", "content_hash", "embedding", "embedding_model"],
    migration: "supabase/migrations/20260421_docs_center.sql",
    minimumRows: 1,
  },
  {
    table: "docs_search_events",
    label: "문서 검색 로그",
    columns: ["id", "query", "normalized_query", "result_count", "source", "created_at"],
    migration: "supabase/migrations/20260421_docs_center.sql",
  },
  {
    table: "question_clusters",
    label: "질문 클러스터",
    columns: ["id", "label", "canonical_question", "category", "mapped_article_id", "status", "sample_questions"],
    migration: "supabase/migrations/20260421_z_chatbot_analytics.sql",
  },
  {
    table: "chatbot_recommended_questions",
    label: "추천 질문",
    columns: ["id", "label", "prompt", "placement", "status", "order_index", "category", "mapped_article_id"],
    migration: "supabase/migrations/20260520_chatbot_recommended_questions.sql",
    minimumRows: 4,
  },
  {
    table: "chatbot_channel_handoffs",
    label: "채널톡 챗봇 상담 전환",
    columns: ["id", "answer_event_id", "session_id", "channel_user_chat_id", "status", "payload"],
    migration: "supabase/migrations/20260616_chatbot_channel_talk_handoffs.sql",
  },
  {
    table: "docs_article_drafts",
    label: "문서 편집 draft",
    columns: ["article_id", "draft_payload", "change_note", "updated_by", "updated_at"],
    migration: "supabase/migrations/20260604_docs_article_drafts.sql",
  },
  {
    table: "client_events",
    label: "웹 이벤트 식별자",
    columns: ["id", "event_name", "anonymous_id", "lead_id", "user_id", "session_id", "created_at"],
    migration: "supabase/migrations/20260615_public_material_downloads.sql",
  },
  {
    table: "user_profiles",
    label: "공개 사용자 프로필",
    columns: ["id", "email", "provider", "provider_id", "lead_id", "created_at"],
    migration: "supabase/migrations/20260615_public_material_downloads.sql",
  },
  {
    table: "material_downloads",
    label: "자료 다운로드 감사 로그",
    columns: ["id", "material_slug", "user_id", "lead_id", "anonymous_id", "gate_type", "created_at"],
    migration: "supabase/migrations/20260615_public_material_downloads.sql",
  },
]

function buildVectorProbeEmbedding(dimensions: number) {
  return JSON.stringify(Array.from({ length: dimensions }, (_, index) => (index === 0 ? 1 : 0)))
}

export const ALPHA_DB_RPC_PROBES: AlphaDbRpcProbe[] = [
  {
    functionName: "match_docs_ai_chunks",
    label: "문서 벡터 검색 RPC",
    args: {
      query_embedding: buildVectorProbeEmbedding(1536),
      match_count: 1,
    },
    migration: "supabase/migrations/20260616_docs_chunk_vector_rpc_text_compat.sql",
  },
]

export function buildAlphaDbProbeSelect(probe: Pick<AlphaDbTableProbe, "columns">) {
  return probe.columns.join(", ")
}

export function summarizeAlphaDbProbeResults(results: AlphaDbProbeResult[]): AlphaDbProbeSummary {
  const blocked: AlphaDbProbeIssue[] = []
  const warning: AlphaDbProbeIssue[] = []
  const ok: AlphaDbProbeResult[] = []

  for (const result of results) {
    if (result.error) {
      blocked.push({
        table: result.table,
        label: result.label,
        message: result.error,
        migration: result.migration,
      })
      continue
    }

    const minimumRows = result.minimumRows ?? 0
    const count = result.count ?? 0
    if (minimumRows > 0 && count < minimumRows) {
      warning.push({
        table: result.table,
        label: result.label,
        message: `${count}/${minimumRows} rows available`,
        migration: result.migration,
      })
      continue
    }

    ok.push(result)
  }

  return {
    status: blocked.length > 0 ? "blocked" : warning.length > 0 ? "warning" : "ok",
    ok,
    warning,
    blocked,
  }
}
