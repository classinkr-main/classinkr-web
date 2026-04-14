import type { MetadataRoute } from "next"

import { getPublishedPosts } from "@/lib/repositories/blog"
import { SITE_URL } from "@/lib/seo"

const staticRoutes: Array<{
  path: string
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]
  priority: number
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/product/sw", changeFrequency: "weekly", priority: 0.9 },
  { path: "/product/hw", changeFrequency: "weekly", priority: 0.9 },
  { path: "/pricing", changeFrequency: "weekly", priority: 0.8 },
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
  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: toAbsoluteUrl(route.path),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  const publishedPosts = await getPublishedPosts().catch((error) => {
    console.error("[sitemap] failed to load published posts", error)
    return []
  })

  const blogEntries: MetadataRoute.Sitemap = publishedPosts.map((post) => ({
    url: toAbsoluteUrl(`/blog/${post.slug}`),
    lastModified: post.updatedAt ?? post.publishedAt ?? undefined,
    changeFrequency: "weekly",
    priority: post.featured ? 0.8 : 0.7,
  }))

  return [...staticEntries, ...blogEntries]
}
