import { revalidatePath } from "next/cache"

import { invalidateDocsContentCache } from "@/lib/docs-content"
import type { DocsArticleDetail } from "@/lib/repositories/docs-articles"

type RevalidatableDocsArticle =
  | Pick<DocsArticleDetail, "categoryId" | "publicPath">
  | null
  | undefined

// 경로 재검증(Next 페이지 캐시)과 함께 lib/docs-content.ts 의 인스턴스 메모(TTL 60초)도 비운다 —
// 그렇지 않으면 발행한 관리자가 같은 인스턴스에서 최대 60초 동안 옛 문서 목록을 본다.
export function revalidateDocsIndexPaths() {
  invalidateDocsContentCache()
  revalidatePath("/docs")
  revalidatePath("/docs/search")
  revalidatePath("/updates")
  revalidatePath("/sitemap.xml")
}

export function revalidateDocsArticlePaths(...articles: RevalidatableDocsArticle[]) {
  invalidateDocsContentCache()
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
