// 리드마그넷 PDF 글꼴 — Pretendard 정적 TTF 를 런타임에 fs 로 읽어 부분 집합만 심는다.
// 배포(Vercel) 번들에는 아래 리터럴 경로를 Turbopack 이 추적해 넣고, next.config.ts 의
// outputFileTracingIncludes 가 같은 파일을 한 번 더 보장한다 — 목록을 바꾸면 두 곳을 같이 바꾼다
// (tests/lead-magnets/pdf-tracing.test.ts 가 대조).
//
// OTF(CFF) 대신 TTF 를 쓰는 이유: @pdf-lib/fontkit 1.1.1 이 Pretendard OTF 를 부분 집합으로
// 만들 때 "Not a CFF Font" 로 실패한다.
import "server-only"

import { readFile } from "fs/promises"
import path from "path"

import fontkit from "@pdf-lib/fontkit"
import type { PDFDocument } from "pdf-lib"

export const LEAD_MAGNET_PDF_FONT_DIR = "node_modules/pretendard/dist/public/static/alternative"

export const LEAD_MAGNET_PDF_FONT_FILES = {
  regular: "Pretendard-Regular.ttf",
  semibold: "Pretendard-SemiBold.ttf",
} as const

export type LeadMagnetPdfFontWeight = keyof typeof LEAD_MAGNET_PDF_FONT_FILES

/** pdf-lib 가 registerFontkit 으로 받는 모양(pdf-lib 는 이 타입을 루트에서 내보내지 않는다). */
type Fontkit = Parameters<PDFDocument["registerFontkit"]>[0]

const fontBytesCache = new Map<LeadMagnetPdfFontWeight, Promise<Uint8Array>>()

/**
 * 글꼴 파일 절대 경로. 경로를 리터럴로 적어 번들러가 이 두 파일만 추적하게 한다 —
 * 디렉터리 + 변수로 조립하면 Turbopack 이 alternative/ 의 TTF 9개(약 25MB)를 통째로 함수 번들에 넣는다.
 * LEAD_MAGNET_PDF_FONT_FILES 와 같은 파일인지는 tests/lead-magnets/pdf-tracing.test.ts 가 대조한다.
 */
export function leadMagnetPdfFontPath(weight: LeadMagnetPdfFontWeight) {
  switch (weight) {
    case "regular":
      return path.join(process.cwd(), "node_modules/pretendard/dist/public/static/alternative/Pretendard-Regular.ttf")
    case "semibold":
      return path.join(process.cwd(), "node_modules/pretendard/dist/public/static/alternative/Pretendard-SemiBold.ttf")
  }
}

/** 글꼴 바이트는 인스턴스 수명 동안 한 번만 읽는다(실패는 캐시하지 않는다). */
export function loadLeadMagnetPdfFont(weight: LeadMagnetPdfFontWeight): Promise<Uint8Array> {
  const cached = fontBytesCache.get(weight)
  if (cached) return cached
  const pending = readFile(leadMagnetPdfFontPath(weight)).then((buffer) => new Uint8Array(buffer))
  fontBytesCache.set(weight, pending)
  pending.catch(() => fontBytesCache.delete(weight))
  return pending
}

interface SubsetInternals {
  loca?: { version?: number | null }
  _addGlyph?: (gid: number) => number
}

/**
 * fontkit 1.1.1 의 TTF 부분 집합 버그 우회.
 * 원본 Pretendard TTF 는 long loca 에 홀수 길이 글리프가 섞여 있는데, fontkit 은 부분 집합 glyf 가
 * 64KB 미만이면 short loca(오프셋 ÷ 2)로 다시 써서 홀수 오프셋이 잘리고 글리프가 깨진다
 * (한글 대부분이 빈 칸으로 찍힌다). loca 를 long 형식으로 고정해 오프셋을 그대로 둔다.
 */
function keepLongLoca(subset: SubsetInternals) {
  const addGlyph = subset._addGlyph
  if (typeof addGlyph !== "function") return subset
  subset._addGlyph = function patchedAddGlyph(this: SubsetInternals, gid: number) {
    if (this.loca && this.loca.version == null) this.loca.version = 1
    return addGlyph.call(this, gid)
  }
  return subset
}

export const leadMagnetPdfFontkit: Fontkit = {
  create(buffer: Uint8Array, postscriptName?: string) {
    const font = fontkit.create(buffer, postscriptName)
    const createSubset = font.createSubset.bind(font)
    font.createSubset = () => keepLongLoca(createSubset() as unknown as SubsetInternals) as unknown as ReturnType<typeof createSubset>
    // 글자 → 글리프를 cmap 으로 바로 잇는다. fontkit 의 한글 셰이퍼가 줄마다 ~2ms 를 써서
    // 렌더 시간 대부분을 차지했다. pdf-lib 는 layout 결과의 glyphs 만 쓰고 위치(GPOS)는 버리므로
    // 완성형 한글·라틴 본문에서는 결과가 같다(합자·문맥 대체만 빠진다 — 입력한 글자 그대로 찍힌다).
    font.layout = ((text: string) => ({
      glyphs: Array.from(text, (char) => font.glyphForCodePoint(char.codePointAt(0) ?? 0)),
      positions: [],
    })) as unknown as typeof font.layout
    return font
  },
}
