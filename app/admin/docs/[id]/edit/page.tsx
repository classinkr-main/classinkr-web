import { notFound } from "next/navigation"

import DocsArticleEditor from "@/components/admin/docs/DocsArticleEditor"
import { docsCategories } from "@/lib/docs"
import { getDocsArticleById } from "@/lib/repositories/docs-articles"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminDocsEditPage({ params }: PageProps) {
  const { id } = await params
  const article = await getDocsArticleById(id)
  if (!article) notFound()

  const categories = docsCategories.map((category) => ({
    id: category.id,
    title: category.title,
  }))

  return <DocsArticleEditor mode="edit" categories={categories} article={article} />
}
