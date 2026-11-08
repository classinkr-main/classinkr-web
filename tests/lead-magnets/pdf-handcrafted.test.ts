// 따로 만든 PDF 는 서버 생성본으로 바꾸지 않는다 — 받는 사람의 내용이 줄지 않게(lib/lead-magnet-pdf/links.ts).
// 브라우저로 찍은 3종 + #81 의 워크북(WORKBOOK_SLUGS, 12쪽 누수 진단표).
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"

import { WORKBOOK_SLUGS } from "@/lib/lead-magnet-pdf/workbook-slugs.mjs"
import {
  HANDCRAFTED_LEAD_MAGNET_PDF_SLUGS,
  isHandcraftedLeadMagnetPdf,
  isLegacyGeneratedPdfUrl,
  legacyLeadMagnetPdfPath,
} from "@/lib/lead-magnet-pdf/links"

const PDF_DIR = path.join(process.cwd(), "public", "materials", "lead-magnets")

/** public/ 의 PDF 마다 생성기 정보. 파이썬 생성기(reportlab)가 만든 것만 서버 생성본으로 바꿔도 된다. */
async function producers() {
  const result = new Map<string, string>()
  for (const file of readdirSync(PDF_DIR).filter((name) => name.endsWith(".pdf"))) {
    const doc = await PDFDocument.load(readFileSync(path.join(PDF_DIR, file)), { updateMetadata: false })
    result.set(file.replace(/\.pdf$/, ""), doc.getProducer() ?? "")
  }
  return result
}

const isScriptGenerated = (producer: string) => /^ReportLab\b/.test(producer)

describe("따로 만든 PDF 예외", () => {
  it("워크북 템플릿 자료(#81)는 따로 만든 PDF 다 — 목록 정본은 하나", () => {
    expect(WORKBOOK_SLUGS.length).toBeGreaterThan(0)
    for (const slug of WORKBOOK_SLUGS) {
      expect(isHandcraftedLeadMagnetPdf(slug), slug).toBe(true)
      expect(isLegacyGeneratedPdfUrl(legacyLeadMagnetPdfPath(slug), slug), slug).toBe(false)
    }
    expect(isHandcraftedLeadMagnetPdf("academy-system-checklist")).toBe(true)
  })

  it("keeps the static file for handcrafted PDFs and rewrites only script-generated ones", async () => {
    for (const slug of HANDCRAFTED_LEAD_MAGNET_PDF_SLUGS) {
      expect(isLegacyGeneratedPdfUrl(legacyLeadMagnetPdfPath(slug), slug), slug).toBe(false)
    }
    const generated = [...(await producers())].filter(([, producer]) => isScriptGenerated(producer)).map(([slug]) => slug)
    expect(generated.length).toBeGreaterThan(0)
    for (const slug of generated) {
      expect(isLegacyGeneratedPdfUrl(legacyLeadMagnetPdfPath(slug), slug), slug).toBe(true)
    }
  })

  // 생성기 문구(HeadlessChrome·Chromium 같은 Creator)가 아니라 「파이썬 생성기가 만든 것인가」로 가른다 —
  // #81 워크북의 Creator 는 'Chromium' 이라 'HeadlessChrome' 검사로는 빠졌다.
  it("matches the PDFs in public/ that the generator script did not make", async () => {
    const handMade = [...(await producers())].filter(([, producer]) => !isScriptGenerated(producer)).map(([slug]) => slug)
    expect(handMade.sort()).toEqual([...HANDCRAFTED_LEAD_MAGNET_PDF_SLUGS].sort())
  })
})
