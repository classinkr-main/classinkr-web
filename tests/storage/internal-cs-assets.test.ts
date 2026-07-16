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
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

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
      PNG_BYTES,
      { contentType: "image/png", upsert: false }
    )
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
