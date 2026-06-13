import type { MetadataRoute } from "next"

import { getDocCategoryPath, getDocPath } from "@/lib/docs"
import { getDocsContent, listListedDocsFromContent } from "@/lib/docs-content"
import { getPublishedPostsForStaticSitemap } from "@/lib/repositories/blog"
import { listCachedPublicEvents } from "@/lib/repositories/public-events"
import { SITE_URL } from "@/lib/seo"

const staticRoutes: Array<{
  path: string
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]
  priority: number
  lastModified: string
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1, lastModified: "2026-05-20" },
  { path: "/docs", changeFrequency: "weekly", priority: 1, lastModified: "2026-05-20" },
  { path: "/product", changeFrequency: "weekly", priority: 0.9, lastModified: "2026-05-20" },
  { path: "/product/sw", changeFrequency: "weekly", priority: 0.9, lastModified: "2026-05-20" },
  { path: "/product/hw", changeFrequency: "weekly", priority: 0.9, lastModified: "2026-05-20" },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-06-10" },
  { path: "/contact", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-04-01" },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.5, lastModified: "2026-04-01" },
  { path: "/terms", changeFrequency: "yearly", priority: 0.5, lastModified: "2026-04-01" },
  { path: "/data-deletion", changeFrequency: "yearly", priority: 0.5, lastModified: "2026-04-01" },
  { path: "/blog", changeFrequency: "daily", priority: 0.8, lastModified: "2026-04-01" },
  { path: "/events", changeFrequency: "weekly", priority: 0.7, lastModified: "2026-04-01" },
  { path: "/updates", changeFrequency: "weekly", priority: 0.7, lastModified: "2026-04-01" },
  { path: "/faq", changeFrequency: "monthly", priority: 0.7, lastModified: "2026-05-20" },
  { path: "/about", changeFrequency: "monthly", priority: 0.5, lastModified: "2026-04-01" },
]

function toAbsoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString()
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: toAbsoluteUrl(route.path),
    lastModified: new Date(route.lastModified),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  const [publishedPosts, docsContent, publicEvents] = await Promise.all([
    getPublishedPostsForStaticSitemap().catch((error) => {
      console.error("[sitemap] failed to load published posts", error)
      return []
    }),
    getDocsContent().catch((error) => {
      console.error("[sitemap] failed to load docs content", error)
      return null
    }),
    listCachedPublicEvents().catch((error) => {
      console.error("[sitemap] failed to load public events", error)
      return []
    }),
  ])

  const blogEntries: MetadataRoute.Sitemap = publishedPosts.map((post) => ({
    url: toAbsoluteUrl(`/blog/${post.slug}`),
    lastModified: post.updatedAt ?? post.publishedAt ?? undefined,
    changeFrequency: "weekly",
    priority: post.featured ? 0.8 : 0.7,
  }))

  const eventEntries: MetadataRoute.Sitemap = publicEvents
    .filter((event) => Boolean(event.slug))
    .map((event) => ({
      url: toAbsoluteUrl(`/events/${event.slug}`),
      lastModified: event.updatedAt ?? undefined,
      changeFrequency: "weekly",
      priority: 0.6,
    }))

  if (!docsContent) {
    return [...staticEntries, ...blogEntries, ...eventEntries]
  }

  const listedDocs = listListedDocsFromContent(docsContent)
  const docsCategoryEntries: MetadataRoute.Sitemap = docsContent.categories.map((category) => ({
    url: toAbsoluteUrl(getDocCategoryPath(category.id)),
    lastModified: new Date("2026-05-20"),
    changeFrequency: "monthly",
    priority: 0.75,
  }))

  const docsArticleEntries: MetadataRoute.Sitemap = listedDocs.map((doc) => ({
    url: toAbsoluteUrl(getDocPath(doc)),
    lastModified: new Date(doc.updatedAt),
    changeFrequency: "monthly",
    priority: doc.featured ? 0.8 : 0.65,
  }))

  return [...staticEntries, ...blogEntries, ...eventEntries, ...docsCategoryEntries, ...docsArticleEntries]
}
