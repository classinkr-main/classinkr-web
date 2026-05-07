import "server-only"

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]
const JPEG_MAGIC = [0xff, 0xd8, 0xff]
const GIF87_MAGIC = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]
const GIF89_MAGIC = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]
const WEBP_RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46]
const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50]

type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif"

interface ValidateImageFileOptions {
  allowedTypes: readonly ImageMime[]
  maxBytes: number
}

export type ImageValidationError = "bad_type" | "too_large" | "bad_signature"

function hasPrefix(buffer: Uint8Array, prefix: readonly number[]) {
  return prefix.every((byte, index) => buffer[index] === byte)
}

export function detectImageMime(buffer: Uint8Array): ImageMime | null {
  if (hasPrefix(buffer, JPEG_MAGIC)) return "image/jpeg"
  if (hasPrefix(buffer, PNG_MAGIC)) return "image/png"
  if (hasPrefix(buffer, GIF87_MAGIC) || hasPrefix(buffer, GIF89_MAGIC)) return "image/gif"
  if (
    buffer.length >= 12 &&
    hasPrefix(buffer, WEBP_RIFF_MAGIC) &&
    WEBP_MAGIC.every((byte, index) => buffer[index + 8] === byte)
  ) {
    return "image/webp"
  }
  return null
}

export async function validateImageFile(
  file: File,
  { allowedTypes, maxBytes }: ValidateImageFileOptions
): Promise<{ ok: true; buffer: Uint8Array } | { ok: false; error: ImageValidationError }> {
  if (!allowedTypes.includes(file.type as ImageMime)) {
    return { ok: false, error: "bad_type" }
  }
  if (file.size > maxBytes) return { ok: false, error: "too_large" }

  const buffer = new Uint8Array(await file.arrayBuffer())
  const detectedType = detectImageMime(buffer)
  if (!detectedType || detectedType !== file.type || !allowedTypes.includes(detectedType)) {
    return { ok: false, error: "bad_signature" }
  }

  return { ok: true, buffer }
}

export function decodePngDataUrl(
  value: unknown,
  maxBytes: number
): { ok: true; buffer: Buffer } | { ok: false; error: "missing" | "bad_type" | "too_large" } {
  if (typeof value !== "string" || !value.trim()) return { ok: false, error: "missing" }

  const trimmed = value.trim()
  const match = trimmed.match(/^data:image\/png;base64,([a-z0-9+/=\s]+)$/i)
  const base64 = match ? match[1] : trimmed
  const buffer = Buffer.from(base64, "base64")

  if (buffer.length === 0 || detectImageMime(buffer) !== "image/png") {
    return { ok: false, error: "bad_type" }
  }
  if (buffer.length > maxBytes) return { ok: false, error: "too_large" }

  return { ok: true, buffer }
}
