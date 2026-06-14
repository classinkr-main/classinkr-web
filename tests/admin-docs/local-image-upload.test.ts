import { describe, expect, it } from "vitest"

import {
  MAX_LOCAL_IMAGE_BYTES,
  normalizeLocalImageFiles,
} from "@/lib/admin/local-image-upload"

function fileLike(name: string, type: string, size: number) {
  return { name, type, size }
}

describe("admin docs local image uploads", () => {
  it("accepts supported local image files in the original order", () => {
    const result = normalizeLocalImageFiles([
      fileLike("first.png", "image/png", 1200),
      fileLike("second.webp", "image/webp", 2400),
    ])

    expect(result).toEqual({
      ok: true,
      files: [
        fileLike("first.png", "image/png", 1200),
        fileLike("second.webp", "image/webp", 2400),
      ],
    })
  })

  it("rejects non-supported files before upload", () => {
    const result = normalizeLocalImageFiles([fileLike("guide.pdf", "application/pdf", 1200)])

    expect(result).toEqual({
      ok: false,
      message: "guide.pdf은 JPEG, PNG, WebP, GIF 이미지만 올릴 수 있습니다.",
    })
  })

  it("rejects images larger than the admin upload limit", () => {
    const result = normalizeLocalImageFiles([
      fileLike("large.png", "image/png", MAX_LOCAL_IMAGE_BYTES + 1),
    ])

    expect(result).toEqual({
      ok: false,
      message: "large.png은 5MB 이하로 올려주세요.",
    })
  })
})
