import { describe, expect, it } from "vitest"

import { stripImageMetadata } from "@/lib/storage/image-metadata"

function riffChunk(type: string, data: Buffer) {
  const head = Buffer.alloc(8)
  head.write(type, 0, "ascii")
  head.writeUInt32LE(data.length, 4)
  return Buffer.concat([head, data, data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)])
}

function webp(chunks: Buffer[]) {
  const body = Buffer.concat([Buffer.from("WEBP"), ...chunks])
  const head = Buffer.alloc(8)
  head.write("RIFF", 0, "ascii")
  head.writeUInt32LE(body.length, 4)
  return Buffer.concat([head, body])
}

function jpegSegment(marker: number, payload: Buffer) {
  const length = payload.length + 2
  return Buffer.concat([Buffer.from([0xff, marker, length >> 8, length & 0xff]), payload])
}

describe("stripImageMetadata", () => {
  it("removes EXIF and XMP chunks from WebP, clears the VP8X flags, and fixes the RIFF size", () => {
    const vp8x = Buffer.alloc(10)
    vp8x[0] = 0x08 | 0x04 | 0x10
    const input = webp([
      riffChunk("VP8X", vp8x),
      riffChunk("VP8 ", Buffer.from([1, 2, 3])),
      riffChunk("EXIF", Buffer.from("GPS-SECRET")),
      riffChunk("XMP ", Buffer.from("xmp-secret")),
    ])
    const out = stripImageMetadata(input, "image/webp")
    expect(out).not.toBeNull()
    const buffer = Buffer.from(out as Uint8Array)
    expect(buffer.includes("GPS-SECRET")).toBe(false)
    expect(buffer.includes("xmp-secret")).toBe(false)
    expect(buffer.readUInt32LE(4)).toBe(buffer.length - 8)
    expect(buffer.includes("VP8 ")).toBe(true)
    const flagsOffset = buffer.indexOf("VP8X") + 8
    expect(buffer[flagsOffset] & (0x08 | 0x04)).toBe(0)
    expect(buffer[flagsOffset] & 0x10).toBe(0x10)
  })

  it("keeps only the orientation of a JPEG EXIF block", () => {
    // big-endian TIFF, IFD0 에 Orientation=6, 뒤에 GPS 자리 표시 문자열
    const tiff = Buffer.from([
      0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
      0x00, 0x01,
      0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ])
    const exif = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff, Buffer.from("GPS-SECRET")])
    const input = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      jpegSegment(0xe1, exif),
      jpegSegment(0xfe, Buffer.from("comment-secret")),
      jpegSegment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
      Buffer.from([0x11, 0x22, 0xff, 0xd9]),
    ])
    const out = Buffer.from(stripImageMetadata(input, "image/jpeg") as Uint8Array)
    expect(out.includes("GPS-SECRET")).toBe(false)
    expect(out.includes("comment-secret")).toBe(false)
    const marker = out.indexOf(Buffer.from([0xff, 0xe1]))
    expect(marker).toBeGreaterThan(0)
    expect(out.readUInt16BE(marker + 2)).toBe(2 + 6 + 8 + 2 + 12 + 4)
    expect(out[marker + 4 + 6 + 8 + 2 + 9]).toBe(6)
  })

  it("returns null for data it cannot parse", () => {
    expect(stripImageMetadata(Buffer.from([0xff, 0xd8, 0x00]), "image/jpeg")).toBeNull()
  })
})
