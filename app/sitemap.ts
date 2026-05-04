import type { MetadataRoute } from "next"

import { getDocCategoryPath, getDocPath } from "@/lib/docs"
import { getDocsContent, listListedDocsFromContent } from "@/lib/docs-content"
import { getPublishedPostsForStaticSitemap } from "@/lib/repositories/blog"
import { SITE_URL } from "@/lib/seo"

const staticRoutes: Array<{
  path: string
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]
  priority: number
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/docs", changeFrequency: "weekly", priority: 1 },
  { path: "/product/sw", changeFrequency: "weekly", priority: 0.9 },
  { path: "/product/hw", changeFrequency: "weekly", priority: 0.9 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.8 },
  { path: "/blog", changeFrequency: "daily", priority: 0.8 },
  { path: "/events", changeFrequency: "weekly", priority: 0.7 },
  { path: "/updates", changeFrequency: "weekly", priority: 0.7 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.6 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
]

function toAbsoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString()
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: toAbsoluteUrl(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  const [publishedPosts, docsContent] = await Promise.all([
    getPublishedPostsForStaticSitemap().catch((error) => {
      console.error("[sitemap] failed to load published posts", error)
      return []
    }),
    getDocsContent().catch((error) => {
      console.error("[sitemap] failed to load docs content", error)
      return null
    }),
  ])

  const blogEntries: MetadataRoute.Sitemap = publishedPosts.map((post) => ({
    url: toAbsoluteUrl(`/blog/${post.slug}`),
    lastModified: post.updatedAt ?? post.publishedAt ?? undefined,
    changeFrequency: "weekly",
    priority: post.featured ? 0.8 : 0.7,
  }))

  if (!docsContent) {
    return [...staticEntries, ...blogEntries]
  }

  const listedDocs = listListedDocsFromContent(docsContent)
  const docsCategoryEntries: MetadataRoute.Sitemap = docsContent.categories.map((category) => ({
    url: toAbsoluteUrl(getDocCategoryPath(category.id)),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.75,
  }))

  const docsArticleEntries: MetadataRoute.Sitemap = listedDocs.map((doc) => ({
    url: toAbsoluteUrl(getDocPath(doc)),
    lastModified: new Date(doc.updatedAt),
    changeFrequency: doc.category === "updates" ? "weekly" : "monthly",
    priority: doc.category === "troubleshooting" || doc.featured ? 0.8 : 0.65,
  }))

  return [...staticEntries, ...blogEntries, ...docsCategoryEntries, ...docsArticleEntries]
}
