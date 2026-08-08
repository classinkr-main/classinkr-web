import { reindexDocsAiChunks } from "@/lib/admin-docs"
import type { DocsArticleStatus } from "@/lib/repositories/docs-articles"

/**
 * 변경 전/후 상태 중 하나라도 published를 스치면 챗봇 인덱스(docs_ai_chunks)에
 * 영향이 있으므로 재색인이 필요하다. (게시·게시 중 수정·게시 해제 → chunk 정리)
 * draft 저장처럼 공개본에 영향 없는 변경은 재색인하지 않는다.
 *
 * `contentAffectingChange`는 published→published(상태 유지) 패치에서만 의미가 있다.
 * order_index·featured·SEO 메타처럼 chunk 내용/포함 여부에 영향 없는 필드만 바뀐
 * 재정렬 저장은 카테고리 전체를 재임베딩(1536-dim)할 필요가 없다. 기본값은 true라
 * 세 번째 인자를 넘기지 않는 기존 호출자는 종전과 동일하게 동작한다(안전 우선).
 */
export function docsReindexNeeded(
  before: DocsArticleStatus | null | undefined,
  after: DocsArticleStatus | null | undefined,
  contentAffectingChange: boolean = true
): boolean {
  const touchesPublished = before === "published" || after === "published"
  if (!touchesPublished) return false
  // published↔비published 전이는 chunk 포함 여부가 바뀌므로 항상 재색인.
  if (before !== after) return true
  // 상태 유지(published→published): chunk에 영향을 주는 필드가 바뀐 경우에만 재색인.
  return contentAffectingChange
}

/**
 * 서버측 챗봇 인덱스 갱신 훅. 문서 쓰기가 이미 성공한 뒤에 호출되므로
 * 절대 throw 하지 않고, 실패 시 console.error + 경고 문자열을 반환한다.
 * 라우트는 반환값을 응답의 `reindexWarning` 필드(비파괴)로 내려보낸다.
 *
 * reindexDocsAiChunks(articleId)는 단일 문서 단위로 동작하며, 문서가
 * 게시/공개/색인 허용 상태가 아니면 해당 문서의 기존 chunk만 정리한다.
 */
export async function reindexDocsArticleServerSide(
  articleId: string,
  context: string
): Promise<string | undefined> {
  try {
    const result = await reindexDocsAiChunks(articleId)
    if (!result.configured) {
      return (
        result.warnings[0] ??
        "Supabase 환경이 없어 챗봇 문서 인덱스를 재생성하지 못했습니다."
      )
    }
    return undefined
  } catch (error) {
    console.error(`[${context}] docs reindex failed:`, error)
    return "문서는 저장됐지만 챗봇 검색 인덱스 갱신에 실패했습니다. /admin/docs의 재색인으로 다시 시도해 주세요."
  }
}

/** 여러 문서를 순차 재색인하고, 실패/미구성 경고를 하나로 합쳐 반환한다. */
export async function reindexDocsArticlesServerSide(
  articleIds: string[],
  context: string
): Promise<string | undefined> {
  const warnings: string[] = []
  for (const articleId of articleIds) {
    const warning = await reindexDocsArticleServerSide(articleId, context)
    if (warning && !warnings.includes(warning)) warnings.push(warning)
  }
  return warnings.length > 0 ? warnings.join(" ") : undefined
}
