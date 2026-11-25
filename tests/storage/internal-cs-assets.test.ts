import { createHash } from "crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  createSignedUrls: vi.fn(),
  remove: vi.fn(),
  from: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: mocks.from,
    },
  }),
}))

import {
  createInternalCsAssetSignedUrls,
  INTERNAL_CS_ASSETS_BUCKET,
  uploadInternalCsAssetBuffer,
} from "@/lib/storage/internal-cs-assets"

const CONVERSATION_ID = "5df88f98-b2cc-4e56-b1b1-384fc33ebde9"

function pngChunk(type: string, data: Buffer = Buffer.alloc(0)) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, "ascii")
  return Buffer.concat([head, data, Buffer.alloc(4)]) // CRC 는 검사하지 않는다
}

function jpegSegment(marker: number, payload: Buffer) {
  const head = Buffer.from([0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff])
  return Buffer.concat([head, payload])
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_BYTES = Buffer.concat([
  PNG_SIGNATURE,
  pngChunk("IHDR", Buffer.alloc(13)),
  pngChunk("IDAT", Buffer.from([1, 2, 3])),
  pngChunk("IEND"),
])
const GPS_MARKER = "GPSLatitude-37.5665"
const JPEG_WITH_GPS = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  jpegSegment(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")),
  jpegSegment(0xe1, Buffer.from(`Exif\0\0MM\0*${GPS_MARKER}`, "latin1")),
  jpegSegment(0xdb, Buffer.alloc(65, 1)),
  jpegSegment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
  Buffer.from([0x12, 0x34, 0x56]),
  Buffer.from([0xff, 0xd9]),
])

describe("internal CS private asset storage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.from.mockReturnValue({
      upload: mocks.upload,
      createSignedUrls: mocks.createSignedUrls,
      remove: mocks.remove,
    })
    mocks.upload.mockResolvedValue({ error: null })
  })

  it("validates image bytes and stores them in a deterministic private path", async () => {
    const sha256 = createHash("sha256").update(PNG_BYTES).digest("hex")
    const result = await uploadInternalCsAssetBuffer({
      buffer: PNG_BYTES,
      conversationId: CONVERSATION_ID,
      fileName: " capture.png ",
      mimeType: "image/png",
    })

    expect(result).toEqual({
      ok: true,
      path: `${CONVERSATION_ID}/${sha256}.png`,
      fileName: "capture.png",
      mimeType: "image/png",
      sizeBytes: PNG_BYTES.length,
      sha256,
      reused: false,
    })
    expect(mocks.from).toHaveBeenCalledWith(INTERNAL_CS_ASSETS_BUCKET)
    expect(mocks.upload).toHaveBeenCalledWith(
      `${CONVERSATION_ID}/${sha256}.png`,
      expect.any(Uint8Array),
      { contentType: "image/png", upsert: false }
    )
  })

  it("stores a JPEG without its EXIF/GPS segment and hashes the cleaned bytes", async () => {
    expect(JPEG_WITH_GPS.includes(GPS_MARKER)).toBe(true)
    const result = await uploadInternalCsAssetBuffer({
      buffer: JPEG_WITH_GPS,
      conversationId: CONVERSATION_ID,
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
    })

    expect(result.ok).toBe(true)
    const stored = Buffer.from(mocks.upload.mock.calls[0][1] as Uint8Array)
    expect(stored.includes(GPS_MARKER)).toBe(false)
    expect(stored.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
    expect(stored.subarray(stored.length - 2)).toEqual(Buffer.from([0xff, 0xd9]))
    expect(stored.includes(Buffer.from("JFIF"))).toBe(true)
    if (result.ok) {
      expect(result.sha256).toBe(createHash("sha256").update(stored).digest("hex"))
      expect(result.sizeBytes).toBe(stored.length)
    }
  })

  it("drops PNG text/exif chunks but keeps the pixel chunks", async () => {
    const png = Buffer.concat([
      PNG_SIGNATURE,
      pngChunk("IHDR", Buffer.alloc(13)),
      pngChunk("eXIf", Buffer.from(GPS_MARKER)),
      pngChunk("tEXt", Buffer.from("Comment\0owner")),
      pngChunk("IDAT", Buffer.from([1, 2, 3])),
      pngChunk("IEND"),
    ])
    await uploadInternalCsAssetBuffer({
      buffer: png,
      conversationId: CONVERSATION_ID,
      fileName: "shot.png",
      mimeType: "image/png",
    })
    const stored = Buffer.from(mocks.upload.mock.calls[0][1] as Uint8Array)
    expect(stored.includes(GPS_MARKER)).toBe(false)
    expect(stored.includes("tEXt")).toBe(false)
    expect(stored.includes("IDAT")).toBe(true)
  })

  it("refuses an image whose structure cannot be cleaned instead of storing it as is", async () => {
    const result = await uploadInternalCsAssetBuffer({
      buffer: Buffer.concat([PNG_SIGNATURE, Buffer.from([0, 0, 0, 5])]),
      conversationId: CONVERSATION_ID,
      fileName: "broken.png",
      mimeType: "image/png",
    })
    expect(result).toEqual({ ok: false, error: { kind: "bad_signature" } })
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it("rejects a MIME/signature mismatch before touching storage", async () => {
    const result = await uploadInternalCsAssetBuffer({
      buffer: PNG_BYTES,
      conversationId: CONVERSATION_ID,
      fileName: "capture.jpg",
      mimeType: "image/jpeg",
    })

    expect(result).toEqual({ ok: false, error: { kind: "bad_signature" } })
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it("treats an existing content-addressed object as a reusable upload", async () => {
    mocks.upload.mockResolvedValue({ error: { statusCode: 409, message: "Already exists" } })
    const result = await uploadInternalCsAssetBuffer({
      buffer: PNG_BYTES,
      conversationId: CONVERSATION_ID,
      fileName: "capture.png",
      mimeType: "image/png",
    })

    expect(result).toMatchObject({ ok: true, reused: true })
  })

  it("signs unique paths in one storage roundtrip", async () => {
    mocks.createSignedUrls.mockResolvedValue({
      data: [
        { path: "a.png", signedUrl: "https://signed.test/a" },
        { path: "b.png", signedUrl: "https://signed.test/b" },
      ],
      error: null,
    })

    const result = await createInternalCsAssetSignedUrls(["a.png", "a.png", "b.png"], 120)

    expect(mocks.createSignedUrls).toHaveBeenCalledOnce()
    expect(mocks.createSignedUrls).toHaveBeenCalledWith(["a.png", "b.png"], 120)
    expect(result).toEqual(new Map([
      ["a.png", "https://signed.test/a"],
      ["b.png", "https://signed.test/b"],
    ]))
  })
})
