import { ALPHA_DB_MIGRATIONS } from "@/lib/chatbot/alpha-db-contract"

export type ChatbotAlphaReadinessStatus = "ok" | "warning" | "blocked"

export interface ChatbotAlphaReadinessInput {
  hasSupabaseEnv: boolean
  hasGeminiApiKey: boolean
  docsArticleCount: number
  docsChunkCount: number
  embeddedChunkCount: number
  recommendedQuestionCount: number
  unresolvedGapCount: number
  zeroResultSearchCount: number
  generatedAt?: string
  warnings?: string[]
}

export interface ChatbotAlphaReadinessCheck {
  key: string
  label: string
  status: ChatbotAlphaReadinessStatus
  detail: string
  action?: string
  artifacts?: string[]
}

export interface ChatbotAlphaReadinessSummary {
  ok: number
  warning: number
  blocked: number
}

export interface ChatbotAlphaReadinessReport {
  generatedAt: string
  overallStatus: ChatbotAlphaReadinessStatus
  summary: ChatbotAlphaReadinessSummary
  checks: ChatbotAlphaReadinessCheck[]
  warnings: string[]
}

function clampCount(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

function summarize(checks: ChatbotAlphaReadinessCheck[]): ChatbotAlphaReadinessSummary {
  return checks.reduce<ChatbotAlphaReadinessSummary>(
    (acc, check) => {
      acc[check.status] += 1
      return acc
    },
    { ok: 0, warning: 0, blocked: 0 }
  )
}

function getOverallStatus(summary: ChatbotAlphaReadinessSummary): ChatbotAlphaReadinessStatus {
  if (summary.blocked > 0) return "blocked"
  if (summary.warning > 0) return "warning"
  return "ok"
}

export function buildChatbotAlphaReadiness(input: ChatbotAlphaReadinessInput): ChatbotAlphaReadinessReport {
  const docsArticleCount = clampCount(input.docsArticleCount)
  const docsChunkCount = clampCount(input.docsChunkCount)
  const embeddedChunkCount = Math.min(clampCount(input.embeddedChunkCount), docsChunkCount)
  const recommendedQuestionCount = clampCount(input.recommendedQuestionCount)
  const unresolvedGapCount = clampCount(input.unresolvedGapCount)
  const zeroResultSearchCount = clampCount(input.zeroResultSearchCount)
  const warnings = input.warnings ?? []

  const checks: ChatbotAlphaReadinessCheck[] = [
    input.hasSupabaseEnv
      ? {
          key: "supabase_env",
          label: "Supabase 운영 연결",
          status: "ok",
          detail: "문서, 검색, 질문 클러스터를 운영 DB에서 읽을 수 있습니다.",
        }
      : {
          key: "supabase_env",
          label: "Supabase 운영 연결",
          status: "blocked",
          detail: "서버 Supabase 환경 변수가 없어 정적 폴백만 동작합니다.",
          action:
            "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY 설정",
        },
    buildDatabaseShapeCheck(input.hasSupabaseEnv, warnings),
    input.hasGeminiApiKey
      ? {
          key: "gemini_key",
          label: "Gemini 인식 엔진",
          status: "ok",
          detail: "LLM 답변, 임베딩, 문서 초안 생성에 필요한 키가 설정되어 있습니다.",
        }
      : {
          key: "gemini_key",
          label: "Gemini 인식 엔진",
          status: "blocked",
          detail: "GEMINI_API_KEY가 없어 의미 검색, 답변 보강, 초안 생성이 제한됩니다.",
          action: "운영 env에 GEMINI_API_KEY 설정",
        },
    docsArticleCount > 0
      ? {
          key: "docs_articles",
          label: "공개 문서 원본",
          status: "ok",
          detail: `${docsArticleCount}개 문서를 운영 문서 테이블에서 확인했습니다.`,
        }
      : {
          key: "docs_articles",
          label: "공개 문서 원본",
          status: "blocked",
          detail: "챗봇이 근거로 삼을 published 문서가 없습니다.",
          action: "docs_articles에 공개 문서를 게시하거나 supabase/migrations/20260421_docs_center.sql 이후 문서 seed 적용",
        },
    docsChunkCount > 0
      ? {
          key: "docs_chunks",
          label: "RAG 문서 청크",
          status: "ok",
          detail: `${docsChunkCount}개 문서 청크를 확인했습니다.`,
        }
      : {
          key: "docs_chunks",
          label: "RAG 문서 청크",
          status: "blocked",
          detail: "docs_ai_chunks가 비어 있어 챗봇이 문서 근거를 찾기 어렵습니다.",
          action: "관리자 문서 화면에서 reindex 실행 또는 문서 청크 생성 스크립트 실행",
        },
    buildEmbeddingCheck(docsChunkCount, embeddedChunkCount),
    buildRecommendedQuestionCheck(recommendedQuestionCount),
    buildGapBacklogCheck(unresolvedGapCount, zeroResultSearchCount),
  ]

  const summary = summarize(checks)

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    overallStatus: getOverallStatus(summary),
    summary,
    checks,
    warnings,
  }
}

function buildDatabaseShapeCheck(hasSupabaseEnv: boolean, warnings: string[]): ChatbotAlphaReadinessCheck {
  if (!hasSupabaseEnv) {
    return {
      key: "database_shape",
      label: "챗봇 DB 스키마",
      status: "blocked",
      detail: "Supabase 연결 정보가 없어 문서/챗봇 테이블 상태를 확인할 수 없습니다.",
      action: "Supabase 환경 변수 설정 후 아래 migration 적용 상태 확인",
      artifacts: ALPHA_DB_MIGRATIONS,
    }
  }

  if (warnings.length === 0) {
    return {
      key: "database_shape",
      label: "챗봇 DB 스키마",
      status: "ok",
      detail: "문서/챗봇 알파 점검에 필요한 테이블 조회가 정상입니다.",
    }
  }

  return {
    key: "database_shape",
    label: "챗봇 DB 스키마",
    status: "warning",
    detail: warnings.slice(0, 3).join(" · "),
    action: "아래 migration 목록을 운영 DB에 적용한 뒤 PostgREST schema cache를 새로고침",
    artifacts: ALPHA_DB_MIGRATIONS,
  }
}

function buildEmbeddingCheck(docsChunkCount: number, embeddedChunkCount: number): ChatbotAlphaReadinessCheck {
  if (docsChunkCount <= 0) {
    return {
      key: "embeddings",
      label: "임베딩 백필",
      status: "blocked",
      detail: "문서 청크가 없어 임베딩 백필을 실행할 수 없습니다.",
      action: "먼저 관리자 문서 reindex로 docs_ai_chunks를 생성",
    }
  }

  if (embeddedChunkCount >= docsChunkCount) {
    return {
      key: "embeddings",
      label: "임베딩 백필",
      status: "ok",
      detail: `${embeddedChunkCount}/${docsChunkCount}개 청크에 임베딩이 있습니다.`,
    }
  }

  if (embeddedChunkCount > 0) {
    return {
      key: "embeddings",
      label: "임베딩 백필",
      status: "warning",
      detail: `${embeddedChunkCount}/${docsChunkCount}개 청크만 임베딩되어 의미 검색 품질이 흔들릴 수 있습니다.`,
      action: "scripts/embed-docs-chunks.ts 실행 후 관리자 품질 평가 재실행",
    }
  }

  return {
    key: "embeddings",
    label: "임베딩 백필",
    status: "blocked",
    detail: `${docsChunkCount}개 청크가 있지만 임베딩이 없습니다.`,
    action: "scripts/embed-docs-chunks.ts 실행",
  }
}

function buildRecommendedQuestionCheck(recommendedQuestionCount: number): ChatbotAlphaReadinessCheck {
  if (recommendedQuestionCount >= 4) {
    return {
      key: "recommended_questions",
      label: "시작 추천 질문",
      status: "ok",
      detail: `${recommendedQuestionCount}개 추천 질문이 공개 상태입니다.`,
    }
  }

  if (recommendedQuestionCount > 0) {
    return {
      key: "recommended_questions",
      label: "시작 추천 질문",
      status: "warning",
      detail: `${recommendedQuestionCount}개만 공개되어 첫 질문 유도가 약합니다.`,
      action: "관리자 문서 화면의 추천 질문 탭에서 4개 이상 published로 설정",
    }
  }

  return {
    key: "recommended_questions",
    label: "시작 추천 질문",
    status: "blocked",
    detail: "챗봇 시작 화면에 노출할 추천 질문이 없습니다.",
    action: "supabase/migrations/20260520_chatbot_recommended_questions.sql 적용 또는 관리자에서 추천 질문 생성",
  }
}

function buildGapBacklogCheck(unresolvedGapCount: number, zeroResultSearchCount: number): ChatbotAlphaReadinessCheck {
  const total = unresolvedGapCount + zeroResultSearchCount
  if (total === 0) {
    return {
      key: "gap_backlog",
      label: "문서 보강 큐",
      status: "ok",
      detail: "미매핑 질문과 결과 없는 검색어가 없습니다.",
    }
  }

  return {
    key: "gap_backlog",
    label: "문서 보강 큐",
    status: "warning",
    detail: `미매핑 질문 ${unresolvedGapCount}개, 결과 없는 검색어 ${zeroResultSearchCount}개가 남아 있습니다.`,
    action: "문서 센터 > 보강 큐 탭에서 초안을 만들고 게시 또는 무시 처리",
  }
}
