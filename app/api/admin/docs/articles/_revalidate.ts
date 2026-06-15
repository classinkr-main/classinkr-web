import { revalidatePath } from "next/cache"

import type { DocsArticleDetail } from "@/lib/repositories/docs-articles"

type RevalidatableDocsArticle =
  | Pick<DocsArticleDetail, "categoryId" | "publicPath">
  | null
  | undefined

export function revalidateDocsIndexPaths() {
  revalidatePath("/docs")
  revalidatePath("/docs/search")
}

export function revalidateDocsArticlePaths(...articles: RevalidatableDocsArticle[]) {
  const paths = new Set<string>(["/docs", "/docs/search"])

  for (const article of articles) {
    if (!article) continue
    if (article.categoryId) paths.add(`/docs/${article.categoryId}`)
    if (article.publicPath) paths.add(article.publicPath)
  }

  for (const path of paths) {
    revalidatePath(path)
  }
}
