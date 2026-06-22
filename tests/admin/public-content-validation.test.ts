import { describe, expect, it } from "vitest"

import {
  normalizePublicImageUrl,
  TEMP_ATTACHMENT_IMAGE_ERROR,
  UNSAFE_IMAGE_URL_ERROR,
  validatePublicMarkdownContent,
} from "@/lib/admin/public-content-validation"
import { validateDocsArticlePatchForPublish } from "@/app/api/admin/docs/articles/_payload"

describe("admin public content validation", () => {
  it("blocks temporary clipboard attachment images in markdown content", () => {
    expect(validatePublicMarkdownContent("![image](attachment:abc:image.png)")).toBe(
      TEMP_ATTACHMENT_IMAGE_ERROR
    )
    expect(validatePublicMarkdownContent('<img src="attachment:abc:image.png">')).toBe(
      TEMP_ATTACHMENT_IMAGE_ERROR
    )
  })

  it("allows plain mentions and public image references", () => {
    expect(validatePublicMarkdownContent("attachment:abc is a note, not an image")).toBeNull()
    expect(validatePublicMarkdownContent("![image](/docs/files/image.png)")).toBeNull()
    expect(validatePublicMarkdownContent("![image](https://images.unsplash.com/photo.jpg)")).toBeNull()
    expect(
      validatePublicMarkdownContent(
        "![image](https://kfoaodkgvhvmfrankeyu.supabase.co/storage/v1/object/public/blog-images/image.png)"
      )
    ).toBeNull()
    expect(validatePublicMarkdownContent("![image](https://classin.ai.kr/image.png)")).toBeNull()
  })

  it("normalizes only safe public image URLs", () => {
    expect(normalizePublicImageUrl("/images/guide.png")).toBe("/images/guide.png")
    expect(normalizePublicImageUrl("https://classin.ai.kr/image.png")).toBe(
      "https://classin.ai.kr/image.png"
    )
    expect(normalizePublicImageUrl("https://images.unsplash.com/photo.jpg")).toBe(
      "https://images.unsplash.com/photo.jpg"
    )
    expect(normalizePublicImageUrl("attachment:abc:image.png")).toBeNull()
    expect(normalizePublicImageUrl("http://images.unsplash.com/photo.jpg")).toBeNull()
    expect(normalizePublicImageUrl("https://example.com/image.png")).toBeNull()
    expect(normalizePublicImageUrl("data:image/png;base64,abc")).toBeNull()
    expect(normalizePublicImageUrl("javascript:alert(1)")).toBeNull()
    expect(UNSAFE_IMAGE_URL_ERROR).toContain("표시할 수 없는")
  })

  it("blocks public markdown images from unsupported hosts", () => {
    expect(validatePublicMarkdownContent("![image](https://example.com/image.png)")).toBe(
      UNSAFE_IMAGE_URL_ERROR
    )
    expect(validatePublicMarkdownContent('<img src="https://example.com/image.png">')).toBe(
      UNSAFE_IMAGE_URL_ERROR
    )
  })

  it("blocks attachment images before docs articles are published", () => {
    expect(
      validateDocsArticlePatchForPublish(
        {
          status: "published",
          contentMarkdown: "![clipboard](attachment:123:image.png)",
        },
        {
          categoryId: "start",
          slug: "clipboard-test",
          title: "Clipboard test",
          description: "Temporary clipboard image should be rejected.",
          status: "draft",
          contentMarkdown: "",
        }
      )
    ).toBe(TEMP_ATTACHMENT_IMAGE_ERROR)
  })
})
