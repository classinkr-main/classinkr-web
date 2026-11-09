// 리드마그넷 PDF 렌더러 — 어드민에서 고친 내용(lead_magnets 저장소)을 요청 시점에 PDF 로 그린다.
// 오프라인 생성기 scripts/generate-lead-magnet-pdfs.py 의 런타임 대체본이다(public/ 정적 PDF 는 폴백으로만 남는다).
import "server-only"

import { PDFDocument } from "pdf-lib"

import type { LeadMagnet } from "@/lib/lead-magnets"
import { leadMagnetPdfFontkit, loadLeadMagnetPdfFont } from "@/lib/lead-magnet-pdf/fonts"
import {
  drawActionPlan,
  drawCaseCards,
  drawChecklist,
  drawCover,
  drawDeliverables,
  drawLinks,
  drawScoring,
  drawScriptSamples,
  drawStory,
  drawUsage,
  drawWorksheet,
  type SectionContext,
} from "@/lib/lead-magnet-pdf/sections"
import { cleanText } from "@/lib/lead-magnet-pdf/text"
import { PdfWriter } from "@/lib/lead-magnet-pdf/writer"

export interface RenderLeadMagnetPdfOptions {
  /** 관련 자료 링크를 찾을 전체 자료 목록(slug → 자료). */
  magnetsBySlug: ReadonlyMap<string, LeadMagnet>
  /** PDF 안 내부 링크의 기준 주소(예: https://classin.co.kr). */
  siteUrl: string
}

function siteHost(siteUrl: string) {
  try {
    return new URL(siteUrl).host.replace(/^www\./, "")
  } catch {
    return siteUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  }
}

export async function renderLeadMagnetPdf(
  magnet: LeadMagnet,
  options: RenderLeadMagnetPdfOptions
): Promise<Uint8Array> {
  const [regularBytes, semiboldBytes] = await Promise.all([
    loadLeadMagnetPdfFont("regular"),
    loadLeadMagnetPdfFont("semibold"),
  ])

  const doc = await PDFDocument.create()
  doc.registerFontkit(leadMagnetPdfFontkit)
  const [regular, semibold] = await Promise.all([
    doc.embedFont(regularBytes, { subset: true }),
    doc.embedFont(semiboldBytes, { subset: true }),
  ])

  const title = cleanText(magnet.title) || "ClassIn 자료"
  doc.setTitle(title, { showInWindowTitleBar: true })
  doc.setAuthor("ClassIn Korea")
  doc.setCreator("ClassIn Korea Resource Library")
  doc.setProducer("ClassIn Korea Resource Library")
  doc.setLanguage("ko-KR")
  const subject = cleanText(magnet.pdfGuide?.subtitle) || cleanText(magnet.summary)
  if (subject) doc.setSubject(subject)

  const siteUrl = options.siteUrl.replace(/\/+$/, "")
  const w = new PdfWriter(doc, { regular, semibold }, {
    title,
    footerNote: `ClassIn Korea Resource Library · ${siteHost(siteUrl)}`,
  })
  const ctx: SectionContext = { w, magnet, magnetsBySlug: options.magnetsBySlug, siteUrl }

  // 절 순서는 오프라인 생성기와 같다(표지 → 판단 흐름 → 사용법 → 계산표·사례·멘트 → 구성 → 체크리스트 → 점수 → 실행 → 링크).
  // 생성기는 체크리스트·점수 해석 앞에서 무조건 쪽을 넘겼지만, 여기서는 구분선만 긋고
  // 각 절 머리가 「제목 + 첫 본문」이 들어갈 자리를 재서 모자랄 때만 넘긴다(빈 쪽 방지).
  drawCover(ctx)
  if (drawStory(ctx)) w.divider()
  if (drawUsage(ctx)) w.divider()
  drawWorksheet(ctx)
  drawCaseCards(ctx)
  drawScriptSamples(ctx)
  if (drawDeliverables(ctx)) w.divider()
  if (drawChecklist(ctx)) w.divider()
  if (drawScoring(ctx)) w.divider()
  if (drawActionPlan(ctx)) w.divider()
  drawLinks(ctx)

  w.finalize()
  return doc.save()
}
