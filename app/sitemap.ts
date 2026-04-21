import type { MetadataRoute } from "next"

import { getDocCategoryPath, getDocPath } from "@/lib/docs"
import { getDocsContent, listListedDocsFromContent } from "@/lib/docs-content"

const SITE_URL = "https://classin.co.kr"

const staticRoutes = [
  "",
  "/about",
  "/blog",
  "/contact",
  "/docs",
  "/events",
  "/faq",
  "/product/sw",
  "/product/hw",
  "/updates",
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const docsContent = await getDocsContent()
  const listedDocs = listListedDocsFromContent(docsContent)
  const now = new Date()

  const staticPages = staticRoutes.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "/updates" ? "weekly" : "monthly",
    priority: path === "" || path === "/docs" ? 1 : 0.7,
  })) satisfies MetadataRoute.Sitemap

  const docsCategoryPages = docsContent.categories.map((category) => ({
    url: `${SITE_URL}${getDocCategoryPath(category.id)}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.75,
  })) satisfies MetadataRoute.Sitemap

  const docsArticlePages = listedDocs.map((doc) => ({
    url: `${SITE_URL}${getDocPath(doc)}`,
    lastModified: new Date(doc.updatedAt),
    changeFrequency: doc.category === "updates" ? "weekly" : "monthly",
    priority: doc.category === "troubleshooting" || doc.featured ? 0.8 : 0.65,
  })) satisfies MetadataRoute.Sitemap

  return [...staticPages, ...docsCategoryPages, ...docsArticlePages]
}
