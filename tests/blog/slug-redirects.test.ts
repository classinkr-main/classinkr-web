import { describe, expect, it } from "vitest"

import { getBlogSlugRedirect, getCanonicalBlogSlug } from "@/lib/blog-slug-redirects"

describe("blog slug redirects", () => {
  it("maps the legacy AI forum slug to the published slug", () => {
    expect(getBlogSlugRedirect("2026-asia-ai-education-forum-busan")).toBe(
      "2026-asia-ai-education-forum-in-busan"
    )
    expect(getCanonicalBlogSlug("2026-asia-ai-education-forum-busan")).toBe(
      "2026-asia-ai-education-forum-in-busan"
    )
  })

  it("leaves unknown slugs unchanged", () => {
    expect(getBlogSlugRedirect("dual_device_update")).toBeUndefined()
    expect(getCanonicalBlogSlug("dual_device_update")).toBe("dual_device_update")
  })
})
