const BLOG_SLUG_REDIRECTS: Record<string, string> = {
  "2026-asia-ai-education-forum-busan": "2026-asia-ai-education-forum-in-busan",
}

export function getBlogSlugRedirect(slug: string) {
  return BLOG_SLUG_REDIRECTS[slug]
}

export function getCanonicalBlogSlug(slug: string) {
  return getBlogSlugRedirect(slug) ?? slug
}
