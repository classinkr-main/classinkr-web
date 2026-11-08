// lib/lead-magnet-pdf/render.ts — 실제 자료(data/lead-magnets.json)로 PDF 를 그려 본다.
// 글꼴은 node_modules/pretendard 의 정적 TTF 를 그대로 읽는다(목 없음).
import { readFileSync } from "node:fs"
import path from "node:path"

import fontkit from "@pdf-lib/fontkit"
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFString,
} from "pdf-lib"
import { beforeAll, describe, expect, it } from "vitest"

import type { LeadMagnet } from "@/lib/lead-magnets"
import { renderLeadMagnetPdf } from "@/lib/lead-magnet-pdf/render"
import { normalizeLeadMagnet } from "@/lib/repositories/lead-magnets"

const SITE = "https://classin.co.kr"

const magnets: LeadMagnet[] = (
  JSON.parse(readFileSync(path.join(process.cwd(), "data/lead-magnets.json"), "utf8")) as unknown[]
).map(normalizeLeadMagnet)
const magnetsBySlug = new Map(magnets.map((magnet) => [magnet.slug, magnet]))

/** 선택 절(작업표·사례·멘트·이야기)이 가장 많은 공개 자료 + 첫 공개 자료. */
function pickSamples() {
  const published = magnets.filter((magnet) => magnet.published)
  const richness = (magnet: LeadMagnet) =>
    [magnet.worksheet, magnet.caseCards?.length, magnet.scriptSamples?.length, magnet.storyGuide].filter(Boolean).length
  const richest = [...published].sort((a, b) => richness(b) - richness(a))[0]
  const plain = published.find((magnet) => magnet.slug !== richest?.slug)
  return [richest, plain].filter((magnet): magnet is LeadMagnet => Boolean(magnet))
}

function linkUris(doc: PDFDocument) {
  const uris: string[] = []
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray)
    if (!annots) continue
    for (let index = 0; index < annots.size(); index += 1) {
      const annot = annots.lookup(index, PDFDict)
      const action = annot.lookupMaybe(PDFName.of("A"), PDFDict)
      const uri = action?.lookup(PDFName.of("URI"))
      if (uri instanceof PDFHexString || uri instanceof PDFString) uris.push(uri.decodeText())
    }
  }
  return uris
}

function embeddedFontPrograms(doc: PDFDocument) {
  const programs: Uint8Array[] = []
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict) || object.get(PDFName.of("Type")) !== PDFName.of("FontDescriptor")) continue
    const fontFile = object.lookup(PDFName.of("FontFile2"))
    if (fontFile instanceof PDFRawStream) programs.push(decodePDFRawStream(fontFile).decode())
  }
  return programs
}

describe("renderLeadMagnetPdf", () => {
  const samples = pickSamples()
  const rendered = new Map<string, { bytes: Uint8Array; doc: PDFDocument }>()

  beforeAll(async () => {
    expect(samples.length).toBeGreaterThanOrEqual(2)
    for (const magnet of samples) {
      const bytes = await renderLeadMagnetPdf(magnet, { magnetsBySlug, siteUrl: SITE })
      rendered.set(magnet.slug, { bytes, doc: await PDFDocument.load(bytes) })
    }
  }, 60_000)

  it("PDF 바이트·쪽수·제목 메타데이터", () => {
    for (const magnet of samples) {
      const { bytes, doc } = rendered.get(magnet.slug)!
      expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-")
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(2)
      expect(doc.getTitle()).toBe(magnet.title)
      expect(doc.getAuthor()).toBe("ClassIn Korea")
    }
  })

  it("내부 링크 주석에 PDF 유입 utm 이 붙고 URI 는 ASCII 다", () => {
    for (const magnet of samples) {
      const uris = linkUris(rendered.get(magnet.slug)!.doc)
      expect(uris.length).toBeGreaterThan(0)
      for (const uri of uris) expect(/^[\x20-\x7e]+$/.test(uri)).toBe(true)
      const contact = uris.find((uri) => uri.startsWith(`${SITE}/contact?`))
      expect(contact).toBeDefined()
      const params = new URL(contact!).searchParams
      expect(params.get("utm_source")).toBe("pdf")
      expect(params.get("utm_medium")).toBe("lead_magnet")
      expect(params.get("utm_campaign")).toBe(magnet.slug)
    }
  })

  // fontkit 1.1.1 의 short-loca 버그가 돌아오면 부분 집합 글리프가 깨져 한글이 빈 칸으로 찍힌다.
  it("심은 부분 집합 글꼴의 글리프 윤곽이 모두 온전하다", () => {
    for (const magnet of samples) {
      const programs = embeddedFontPrograms(rendered.get(magnet.slug)!.doc)
      expect(programs.length).toBe(2)
      for (const program of programs) {
        const font = fontkit.create(Buffer.from(program))
        expect(font.numGlyphs).toBeGreaterThan(100)
        let empty = 0
        for (let id = 0; id < font.numGlyphs; id += 1) {
          const glyph = font.getGlyph(id)
          if (glyph.path.toSVG() === "") empty += 1
          expect(glyph.bbox.maxY).toBeLessThan(font.unitsPerEm * 2)
        }
        // 윤곽 없는 글리프는 .notdef·공백 정도뿐이다.
        expect(empty).toBeLessThanOrEqual(3)
      }
    }
  })

  // 오프라인 생성기는 체크리스트·점수 해석 앞에서 무조건 쪽을 넘겨 거의 빈 쪽이 생겼다.
  it("짧은 자료는 절마다 쪽을 넘기지 않고 이어 쓴다", async () => {
    const short = normalizeLeadMagnet({
      title: "짧은 자료",
      slug: "short-sample",
      pdfGuide: { bestUsedWhen: ["도입 전 점검이 필요할 때"], howToUse: ["문항에 0·1점을 적습니다."] },
      deliverables: ["점검표", "실행 플랜"],
      sections: [{ title: "운영", description: "기본 운영", items: ["수업 자료가 남는다.", "녹화가 공유된다.", "과제가 이어진다."] }],
      scoreBands: [
        { range: "0-1점", label: "점검 필요", description: "흩어진 도구부터 정리합니다." },
        { range: "2-3점", label: "안정", description: "확장 계획을 세웁니다." },
      ],
      actionPlan: [{ day: "Day 1", title: "도구 지도", tasks: ["쓰는 도구를 적습니다."] }],
    })
    const bytes = await renderLeadMagnetPdf(short, { magnetsBySlug: new Map(), siteUrl: SITE })
    // 표지 1 + 본문 2쪽 안. 예전처럼 체크리스트·점수 앞에서 넘기면 4쪽 이상이 된다.
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeLessThanOrEqual(3)
  }, 30_000)

  it("선택 절이 없는 최소 초안도 그린다", async () => {
    const draft = normalizeLeadMagnet({ title: "제목만 있는 초안 😀", slug: "draft-only" })
    const bytes = await renderLeadMagnetPdf(draft, { magnetsBySlug: new Map(), siteUrl: SITE })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2)
    expect(doc.getTitle()).toBe("제목만 있는 초안 😀")
  }, 30_000)
})
