import DocsArticleEditor from "@/components/admin/docs/DocsArticleEditor"
import { docsCategories } from "@/lib/docs"
import { listDocsCategories } from "@/lib/repositories/docs-articles"

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

export default async function AdminDocsNewPage() {
  const categories = await getCategoryOptions()
  return <DocsArticleEditor mode="create" categories={categories} article={null} />
}
