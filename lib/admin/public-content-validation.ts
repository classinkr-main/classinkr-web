import { hasAttachmentImageReference } from "@/lib/admin/local-image-upload"
import { sanitizePublicImageUrl } from "@/lib/safe-public-url"

export const TEMP_ATTACHMENT_IMAGE_ERROR =
  "클립보드의 임시 이미지 주소는 공개 페이지에서 표시할 수 없습니다. 이미지를 업로드한 뒤 다시 삽입해주세요."

export const UNSAFE_IMAGE_URL_ERROR =
  "공개 페이지에서 표시할 수 없는 이미지 URL입니다. 사이트 내부 경로, Supabase Storage, Unsplash 이미지를 사용해주세요."

const MARKDOWN_IMAGE_URL_PATTERN =
  /!\[[^\]]*]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g
const HTML_IMAGE_SRC_PATTERN = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi

function extractPublicImageUrls(value: string) {
  const urls: string[] = []
  for (const match of value.matchAll(MARKDOWN_IMAGE_URL_PATTERN)) {
    urls.push(match[1])
  }
  for (const match of value.matchAll(HTML_IMAGE_SRC_PATTERN)) {
    urls.push(match[1])
  }
  return urls
}

export function validatePublicMarkdownContent(value: string | null | undefined) {
  if (typeof value !== "string" || !value) return null
  if (hasAttachmentImageReference(value)) return TEMP_ATTACHMENT_IMAGE_ERROR

  const unsafeImageUrl = extractPublicImageUrls(value).find((url) => !normalizePublicImageUrl(url))
  return unsafeImageUrl ? UNSAFE_IMAGE_URL_ERROR : null
}

export function normalizePublicImageUrl(value: string | null | undefined) {
  const safe = sanitizePublicImageUrl(value, "")
  return safe || null
}
