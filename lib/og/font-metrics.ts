/**
 * 공유 카드 글줄 맞춤(lib/og/fit-text.ts)용 글꼴 전진폭 — 카드가 싣는 OTF 의 cmap·hmtx 표를 직접 읽는다.
 * 어림 표를 손으로 두지 않아, 글꼴에 있는 글자는 모두 실제 폭으로 잰다(1/1000 em). 글꼴에 없는 글자는 undefined.
 *
 * 읽는 표: head(unitsPerEm) · hhea(numberOfHMetrics) · hmtx(advanceWidth) · cmap(포맷 12 우선, 없으면 4).
 */

export interface FontMetrics {
  /** 코드 포인트의 전진폭(1/1000 em). 글꼴에 없으면 undefined */
  advance(codePoint: number): number | undefined
}

function tableOffsets(view: DataView): Map<string, number> {
  const tables = new Map<string, number>()
  const count = view.getUint16(4)
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16
    const tag = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3)
    )
    tables.set(tag, view.getUint32(record + 8))
  }
  return tables
}

function required(tables: Map<string, number>, tag: string): number {
  const offset = tables.get(tag)
  if (offset === undefined) throw new Error(`글꼴에 ${tag} 표가 없습니다`)
  return offset
}

/** cmap 하위 표 하나를 코드 포인트 → 글리프 번호로 펼친다 */
function readCmap(view: DataView, cmap: number): Map<number, number> {
  const glyphs = new Map<number, number>()
  const count = view.getUint16(cmap + 2)
  let format4: number | undefined
  let format12: number | undefined
  for (let i = 0; i < count; i++) {
    const record = cmap + 4 + i * 8
    const platform = view.getUint16(record)
    const encoding = view.getUint16(record + 2)
    const subtable = cmap + view.getUint32(record + 4)
    const format = view.getUint16(subtable)
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))
    if (!unicode) continue
    if (format === 12) format12 ??= subtable
    if (format === 4) format4 ??= subtable
  }

  if (format12 !== undefined) {
    const groups = view.getUint32(format12 + 12)
    for (let g = 0; g < groups; g++) {
      const group = format12 + 16 + g * 12
      const start = view.getUint32(group)
      const end = view.getUint32(group + 4)
      const firstGlyph = view.getUint32(group + 8)
      for (let c = start; c <= end; c++) glyphs.set(c, firstGlyph + (c - start))
    }
    return glyphs
  }

  if (format4 === undefined) throw new Error("글꼴에 유니코드 cmap(포맷 4·12)이 없습니다")
  const segments = view.getUint16(format4 + 6) / 2
  const ends = format4 + 14
  const starts = ends + segments * 2 + 2
  const deltas = starts + segments * 2
  const rangeOffsets = deltas + segments * 2
  for (let s = 0; s < segments; s++) {
    const end = view.getUint16(ends + s * 2)
    const start = view.getUint16(starts + s * 2)
    const delta = view.getInt16(deltas + s * 2)
    const rangeOffsetAt = rangeOffsets + s * 2
    const rangeOffset = view.getUint16(rangeOffsetAt)
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let glyph: number
      if (rangeOffset === 0) {
        glyph = (c + delta) & 0xffff
      } else {
        glyph = view.getUint16(rangeOffsetAt + rangeOffset + (c - start) * 2)
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff
      }
      if (glyph !== 0) glyphs.set(c, glyph)
    }
  }
  return glyphs
}

export function parseFontMetrics(data: Uint8Array): FontMetrics {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const tables = tableOffsets(view)
  const unitsPerEm = view.getUint16(required(tables, "head") + 18)
  const longMetrics = view.getUint16(required(tables, "hhea") + 34)
  const hmtx = required(tables, "hmtx")
  const glyphs = readCmap(view, required(tables, "cmap"))

  const advances = new Map<number, number>()
  for (const [codePoint, glyph] of glyphs) {
    // numberOfHMetrics 뒤 글리프는 마지막 전진폭을 공유한다
    const index = Math.min(glyph, longMetrics - 1)
    advances.set(codePoint, (view.getUint16(hmtx + index * 4) * 1000) / unitsPerEm)
  }
  return { advance: (codePoint) => advances.get(codePoint) }
}
