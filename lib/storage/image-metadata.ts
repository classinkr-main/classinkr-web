// 이미지 메타데이터(EXIF·GPS·XMP·IPTC·텍스트 청크) 제거.
//
// 내부 CS 캡처에는 휴대폰 사진이 섞일 수 있고, 그 EXIF 에는 촬영 위치·기기·시각이 들어 있다.
// 다시 인코딩하면 화질이 변하고 sharp 같은 네이티브 의존을 새로 들여야 하므로,
// 화소 데이터는 그대로 두고 메타데이터 구간만 잘라 내는 무손실 방식으로 같은 효과를 낸다.
// 구조를 읽지 못하면 null — 호출하는 쪽은 그 파일을 저장하지 않는다(메타데이터가 남은 채 저장하지 않는다).
//
// JPEG 의 회전 정보(EXIF Orientation)만은 화면이 눕지 않도록 최소 EXIF 구간 하나로 다시 넣는다.

export type StrippableImageMime = "image/jpeg" | "image/png" | "image/webp"

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
// 화면에 영향을 주는 보조 청크만 남기고 나머지(eXIf·tEXt·zTXt·iTXt·tIME·알 수 없는 것)는 뺀다.
const PNG_KEEP_ANCILLARY = new Set([
  "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "pHYs", "bKGD", "hIST", "sPLT", "acTL", "fcTL", "fdAT",
])

function ascii(bytes: Uint8Array, start: number, length: number) {
  let out = ""
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[start + i] ?? 0)
  return out
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function readOrientation(exif: Uint8Array): number | null {
  // exif: "Exif\0\0" 다음의 TIFF 헤더부터
  if (exif.length < 14) return null
  const little = exif[0] === 0x49 && exif[1] === 0x49
  const big = exif[0] === 0x4d && exif[1] === 0x4d
  if (!little && !big) return null
  const view = new DataView(exif.buffer, exif.byteOffset, exif.byteLength)
  const u16 = (offset: number) => view.getUint16(offset, little)
  const u32 = (offset: number) => view.getUint32(offset, little)
  if (u16(2) !== 0x2a) return null
  const ifd = u32(4)
  if (ifd + 2 > exif.length) return null
  const count = u16(ifd)
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > exif.length) return null
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8)
      return value >= 2 && value <= 8 ? value : null
    }
  }
  return null
}

function buildOrientationSegment(orientation: number) {
  // marker(2) + length(2) + "Exif\0\0"(6) + TIFF 헤더(8) + 항목 수(2) + 항목(12) + 다음 IFD(4)
  const tiff = new Uint8Array([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    0x00, 0x01,
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ])
  const header = new Uint8Array([0xff, 0xe1, 0x00, 0x00, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00])
  const length = 2 + 6 + tiff.length
  header[2] = (length >> 8) & 0xff
  header[3] = length & 0xff
  return concat([header, tiff])
}

function stripJpeg(input: Uint8Array): Uint8Array | null {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return null
  const parts: Uint8Array[] = [input.subarray(0, 2)]
  let orientation: number | null = null
  let orientationInserted = false
  let offset = 2

  const insertOrientation = () => {
    if (orientation && !orientationInserted) {
      parts.push(buildOrientationSegment(orientation))
      orientationInserted = true
    }
  }

  while (offset < input.length) {
    if (input[offset] !== 0xff) return null
    let markerOffset = offset
    while (input[markerOffset + 1] === 0xff) markerOffset += 1 // 채움 바이트
    const marker = input[markerOffset + 1]
    if (marker === undefined) return null
    offset = markerOffset + 2

    if (marker === 0xd9) {
      // EOI
      parts.push(new Uint8Array([0xff, 0xd9]))
      return concat(parts)
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      parts.push(new Uint8Array([0xff, marker]))
      continue
    }

    if (offset + 2 > input.length) return null
    const length = (input[offset] << 8) | input[offset + 1]
    if (length < 2 || offset + length > input.length) return null
    const segmentEnd = offset + length

    if (marker === 0xda) {
      // SOS — 헤더와 뒤따르는 압축 화소 데이터는 그대로 복사하되, 다음 마커(다중 스캔·EOI)까지만 읽는다.
      // EOI 뒤에 붙은 꼬리(MPF 보조 이미지·게인맵·덧붙은 XMP 안의 EXIF·GPS)는 버린다.
      insertOrientation()
      let scan = segmentEnd
      while (scan < input.length) {
        if (input[scan] !== 0xff) {
          scan += 1
          continue
        }
        const next = input[scan + 1]
        if (next === undefined) {
          scan = input.length
          break
        }
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          scan += 2 // 바이트 채움·RST 는 화소 데이터 안이다
          continue
        }
        if (next === 0xff) {
          scan += 1 // 채움 바이트
          continue
        }
        break // 마커
      }
      parts.push(input.subarray(markerOffset, scan))
      offset = scan
      continue
    }

    const isApp = marker >= 0xe0 && marker <= 0xef
    const keep =
      marker === 0xe0 || // JFIF
      marker === 0xee || // Adobe 색 변환
      (marker === 0xe2 && ascii(input, offset + 2, 11) === "ICC_PROFILE") ||
      (!isApp && marker !== 0xfe) // SOFn·DQT·DHT·DRI 등 화소 해석에 필요한 구간
    if (marker === 0xe1 && ascii(input, offset + 2, 4) === "Exif") {
      orientation = readOrientation(input.subarray(offset + 8, segmentEnd))
    }
    if (keep) parts.push(input.subarray(markerOffset, segmentEnd))
    offset = segmentEnd
  }
  return null
}

function stripPng(input: Uint8Array): Uint8Array | null {
  if (input.length < 8 || !PNG_SIGNATURE.every((byte, index) => input[index] === byte)) return null
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  const parts: Uint8Array[] = [input.subarray(0, 8)]
  let offset = 8
  let sawEnd = false
  while (offset + 12 <= input.length) {
    const length = view.getUint32(offset)
    const end = offset + 12 + length
    if (end > input.length) return null
    const type = ascii(input, offset + 4, 4)
    const critical = type.charCodeAt(0) >= 0x41 && type.charCodeAt(0) <= 0x5a
    if (critical || PNG_KEEP_ANCILLARY.has(type)) parts.push(input.subarray(offset, end))
    offset = end
    if (type === "IEND") {
      sawEnd = true
      break
    }
  }
  return sawEnd ? concat(parts) : null
}

function stripWebp(input: Uint8Array): Uint8Array | null {
  if (input.length < 12 || ascii(input, 0, 4) !== "RIFF" || ascii(input, 8, 4) !== "WEBP") return null
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  const parts: Uint8Array[] = []
  let offset = 12
  while (offset + 8 <= input.length) {
    const type = ascii(input, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const padded = size + (size % 2)
    const end = offset + 8 + padded
    if (offset + 8 + size > input.length) return null
    const chunkEnd = Math.min(end, input.length)
    if (type !== "EXIF" && type !== "XMP ") {
      const chunk = input.slice(offset, chunkEnd)
      if (type === "VP8X" && chunk.length >= 9) chunk[8] &= ~(0x08 | 0x04) // EXIF·XMP 표시 끄기
      parts.push(chunk)
    }
    offset = chunkEnd
  }
  const body = concat(parts)
  const out = new Uint8Array(12 + body.length)
  out.set(input.subarray(0, 12), 0)
  out.set(body, 12)
  new DataView(out.buffer).setUint32(4, out.length - 8, true)
  return out
}

/** 메타데이터를 뺀 새 바이트. 구조를 읽지 못하면 null. */
export function stripImageMetadata(input: Uint8Array, mime: StrippableImageMime): Uint8Array | null {
  try {
    if (mime === "image/jpeg") return stripJpeg(input)
    if (mime === "image/png") return stripPng(input)
    return stripWebp(input)
  } catch {
    return null
  }
}
