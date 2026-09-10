import { getRecentPublishedPosts } from "@/lib/repositories/blog"
import offices from "@/data/offices.json"
import press from "@/data/press.json"
import AboutPageClient from "./AboutPageClient"

export const revalidate = 3600

export default async function AboutPage() {
  const posts = await getRecentPublishedPosts(3).catch(() => [])
  const recentPosts = posts.map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    category: p.category,
    date: p.date,
    imageUrl: p.imageUrl,
    readTime: p.readTime,
  }))

  return (
    <AboutPageClient
      offices={offices}
      press={press}
      recentPosts={recentPosts}
    />
  )
}
