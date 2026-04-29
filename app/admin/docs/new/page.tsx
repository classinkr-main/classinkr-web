import DocsArticleEditor from "@/components/admin/docs/DocsArticleEditor"
import { docsCategories } from "@/lib/docs"

export default function AdminDocsNewPage() {
  const categories = docsCategories.map((category) => ({
    id: category.id,
    title: category.title,
  }))

  return <DocsArticleEditor mode="create" categories={categories} article={null} />
}
