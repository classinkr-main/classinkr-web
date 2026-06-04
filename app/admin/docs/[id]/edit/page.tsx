import { notFound } from "next/navigation"

import DocsArticleEditor from "@/components/admin/docs/DocsArticleEditor"
import { docsCategories } from "@/lib/docs"
import { getDocsArticleById, listDocsCategories } from "@/lib/repositories/docs-articles"

interface PageProps {
  params: Promise<{ id: string }>
}

async function getCategoryOptions() {
  try {
    const categories = await listDocsCategories()
    if (categories.length > 0) {
      return categories.map((category) => ({
        id: category.id,
        title: category.title,
      }))
    }
  } catch {
    // Editor remains usable with static categories when Supabase is not configured.
  }

  return docsCategories.map((category) => ({
    id: category.id,
    title: category.title,
  }))
}

export default async function AdminDocsEditPage({ params }: PageProps) {
  const { id } = await params
  const article = await getDocsArticleById(id)
  if (!article) notFound()

  const categories = await getCategoryOptions()

  return <DocsArticleEditor mode="edit" categories={categories} article={article} />
}
