import { revalidatePath, revalidateTag } from "next/cache"

import { invalidateDocsContentCache } from "@/lib/docs-content"
import type { DocsArticleDetail } from "@/lib/repositories/docs-articles"
import { ADMIN_DOCS_LIST_CACHE_TAG } from "@/app/api/admin/docs/_admin-list-cache"

type RevalidatableDocsArticle =
  | Pick<DocsArticleDetail, "categoryId" | "publicPath">
  | null
  | undefined

// 경로 재검증(Next 페이지 캐시)과 함께 lib/docs-content.ts 의 인스턴스 메모(TTL 60초)도 비운다 —
// 그렇지 않으면 발행한 관리자가 같은 인스턴스에서 최대 60초 동안 옛 문서 목록을 본다.
//
// admin-performance-round3-2026-09-10.md §3.3 — 어드민 문서 목록(GET /api/admin/docs)도
// 같은 docs_articles를 읽어 ADMIN_DOCS_LIST_CACHE_TAG로 캐시하므로 함께 무효화한다.
// {expire:0}이 아니라 "max"(SWR)를 쓴 이유: 이 함수를 부르는 기사 CRUD 화면은 공개
// /docs 재검증(revalidatePath, 즉시 반영)에는 이미 의존하지 않고 자체 낙관적 갱신으로
// 응답을 반영하며, 어드민 목록 탭은 별도 화면이라 몇십 초 SWR 지연이 무해하다.
export function revalidateDocsIndexPaths() {
  invalidateDocsContentCache()
  revalidateTag(ADMIN_DOCS_LIST_CACHE_TAG, "max")
  revalidatePath("/docs")
  revalidatePath("/docs/search")
  revalidatePath("/updates")
  revalidatePath("/sitemap.xml")
}

export function revalidateDocsArticlePaths(...articles: RevalidatableDocsArticle[]) {
  invalidateDocsContentCache()
  revalidateTag(ADMIN_DOCS_LIST_CACHE_TAG, "max")
  const paths = new Set<string>(["/docs", "/docs/search", "/updates", "/sitemap.xml"])

  for (const article of articles) {
    if (!article) continue
    if (article.categoryId) paths.add(`/docs/${article.categoryId}`)
    if (article.publicPath) paths.add(article.publicPath)
  }

  for (const path of paths) {
    revalidatePath(path)
  }
}
