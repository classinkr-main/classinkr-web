export const MAX_LOCAL_IMAGE_BYTES = 5 * 1024 * 1024

export const ALLOWED_LOCAL_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const

export const LOCAL_IMAGE_ACCEPT = ALLOWED_LOCAL_IMAGE_TYPES.join(",")

const ATTACHMENT_IMAGE_REFERENCE_PATTERN =
  /(?:<img\b[^>]*\bsrc=["']\s*attachment:|!\[[^\]]*]\(\s*attachment:)/i

export interface LocalImageFileLike {
  name: string
  type: string
  size: number
}

export type LocalImageFilesResult<T extends LocalImageFileLike> =
  | { ok: true; files: T[] }
  | { ok: false; message: string }

export function normalizeLocalImageFiles<T extends LocalImageFileLike>(
  files: Iterable<T>
): LocalImageFilesResult<T> {
  const imageFiles = Array.from(files)
  const badFile = imageFiles.find(
    (file) => !ALLOWED_LOCAL_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_LOCAL_IMAGE_TYPES)[number])
  )
  if (badFile) {
    return {
      ok: false,
      message: `${badFile.name}은 JPEG, PNG, WebP, GIF 이미지만 올릴 수 있습니다.`,
    }
  }

  const oversized = imageFiles.find((file) => file.size > MAX_LOCAL_IMAGE_BYTES)
  if (oversized) {
    return {
      ok: false,
      message: `${oversized.name}은 5MB 이하로 올려주세요.`,
    }
  }

  return { ok: true, files: imageFiles }
}

export function hasAttachmentImageReference(value: string) {
  return ATTACHMENT_IMAGE_REFERENCE_PATTERN.test(value)
}
