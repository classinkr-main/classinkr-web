import { hasAttachmentImageReference } from "@/lib/admin/local-image-upload"
import { sanitizePublicUrl } from "@/lib/safe-public-url"

export const TEMP_ATTACHMENT_IMAGE_ERROR =
  "클립보드의 임시 이미지 주소는 공개 페이지에서 표시할 수 없습니다. 이미지를 업로드한 뒤 다시 삽입해주세요."

export const UNSAFE_IMAGE_URL_ERROR =
  "공개 페이지에서 표시할 수 없는 이미지 URL입니다. http(s) 또는 사이트 내부 경로를 사용해주세요."

export function validatePublicMarkdownContent(value: string | null | undefined) {
  if (typeof value !== "string" || !value) return null
  return hasAttachmentImageReference(value) ? TEMP_ATTACHMENT_IMAGE_ERROR : null
}

export function normalizePublicImageUrl(value: string | null | undefined) {
  const safe = sanitizePublicUrl(value, "")
  return safe || null
}
