// 따로 만든 PDF 3종은 서버 생성본으로 바꾸지 않는다 — 받는 사람의 내용이 줄지 않게(lib/lead-magnet-pdf/links.ts).
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"

import { HANDCRAFTED_LEAD_MAGNET_PDF_SLUGS, isLegacyGeneratedPdfUrl, legacyLeadMagnetPdfPath } from "@/lib/lead-magnet-pdf/links"

const PDF_DIR = path.join(process.cwd(), "public", "materials", "lead-magnets")

describe("따로 만든 PDF 예외", () => {
  it("keeps the static file for handcrafted PDFs and rewrites only script-generated ones", () => {
    for (const slug of HANDCRAFTED_LEAD_MAGNET_PDF_SLUGS) {
      expect(isLegacyGeneratedPdfUrl(legacyLeadMagnetPdfPath(slug), slug)).toBe(false)
    }
    expect(isLegacyGeneratedPdfUrl(legacyLeadMagnetPdfPath("academy-system-checklist"), "academy-system-checklist")).toBe(true)
  })

  it("matches the PDFs in public/ whose creator is a browser, not the generator script", async () => {
    const browserMade: string[] = []
    for (const file of readdirSync(PDF_DIR).filter((name) => name.endsWith(".pdf"))) {
      const doc = await PDFDocument.load(readFileSync(path.join(PDF_DIR, file)), { updateMetadata: false })
      if ((doc.getCreator() ?? "").includes("HeadlessChrome")) browserMade.push(file.replace(/\.pdf$/, ""))
    }
    expect(browserMade.sort()).toEqual([...HANDCRAFTED_LEAD_MAGNET_PDF_SLUGS].sort())
  })
})
