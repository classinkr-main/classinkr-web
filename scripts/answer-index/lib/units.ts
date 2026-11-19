/**
 * 공개 문서 단위(units.json) 만들기.
 *
 * 범위(§4.2): listDocs() 가운데 공개 챗봇 문서(isPublicChatbotDoc)이면서 status 가 없거나 published 인 문서의
 * 요약·절, 그리고 공개 화면 가이드(CS_FIGMA_GUIDES, 내부 전용 slug 제외 — 목록 자체가 이미 뺀 것)의 가이드 문서.
 *
 * - 요약 단위 = 문서 설명 + 챗봇 요약(doc-outline 의 '요약'과 같다).
 * - 절 단위 = 절 본문 + 단계. 절 번호는 doc.sections 의 위치(0부터).
 * - 가이드 단위 = 공개 가이드 문서 페이지에 실리는 글(요약 + 절 본문·단계).
 */
import { isPublicChatbotDoc } from "@/lib/chatbot/doc-outline"
import { sha16 } from "@/lib/chatbot/answer-index/hash"
import {
  ANSWER_INDEX_AREAS,
  type AnswerIndexArea,
  type AnswerIndexUnit,
  type AnswerIndexUnitsFile,
  type UnitKind,
} from "@/lib/chatbot/answer-index/types"
import type { DocArticle } from "@/lib/docs"
import type { CsFigmaGuide } from "@/lib/cs-figma-guides"
import { areaForDocSection, areaForGuide } from "./areas"
import { buildUnitSentences } from "./sentences"

export const SUMMARY_HEADING = "요약"
export const GUIDE_HEADING = "사용 순서 안내"

export interface UnitSources {
  docs: DocArticle[]
  guides: CsFigmaGuide[]
}

export function docPathOf(doc: Pick<DocArticle, "category" | "slug">) {
  return `/docs/${doc.category}/${doc.slug}`
}

export function summaryUnitId(path: string) {
  return `doc:${path}#summary`
}

export function sectionUnitId(path: string, sectionIndex: number) {
  return `doc:${path}#${sectionIndex}`
}

export function guideUnitId(slug: string) {
  return `guide:${slug}`
}

/** 공개 챗봇 범위의 published 문서인지. */
export function isIndexedDoc(doc: DocArticle) {
  return isPublicChatbotDoc(doc) && (doc.status ?? "published") === "published"
}

export async function loadUnitSources(): Promise<UnitSources> {
  const [{ listDocs }, { CS_FIGMA_GUIDES, INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS }] = await Promise.all([
    import("@/lib/docs"),
    import("@/lib/cs-figma-guides"),
  ])
  return {
    docs: listDocs(),
    guides: CS_FIGMA_GUIDES.filter((guide) => !INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS.has(guide.docSlug)),
  }
}

export function buildUnits(sources: UnitSources): AnswerIndexUnit[] {
  const units: AnswerIndexUnit[] = []
  for (const doc of sources.docs) {
    if (!isIndexedDoc(doc)) continue
    const path = docPathOf(doc)
    units.push({
      unitId: summaryUnitId(path),
      kind: "summary",
      path,
      docTitle: doc.title,
      heading: SUMMARY_HEADING,
      sectionIndex: null,
      area: areaForDocSection(doc.category, doc.slug, null, null),
      docCategory: doc.category,
      docSlug: doc.slug,
      sentences: buildUnitSentences([doc.description, doc.chatbotSummary]),
    })
    doc.sections.forEach((section, sectionIndex) => {
      units.push({
        unitId: sectionUnitId(path, sectionIndex),
        kind: "section",
        path,
        docTitle: doc.title,
        heading: section.heading,
        sectionIndex,
        area: areaForDocSection(doc.category, doc.slug, sectionIndex, section.heading),
        docCategory: doc.category,
        docSlug: doc.slug,
        sentences: buildUnitSentences([section.body, ...(section.steps ?? [])]),
      })
    })
  }

  const docsByKey = new Map(sources.docs.map((doc) => [`${doc.category}/${doc.slug}`, doc]))
  for (const guide of sources.guides) {
    const doc = docsByKey.get(`${guide.docCategory}/${guide.docSlug}`)
    const blocks = doc
      ? [doc.chatbotSummary || doc.description, ...doc.sections.flatMap((section) => [section.body, ...(section.steps ?? [])])]
      : [guide.summary, ...guide.steps]
    units.push({
      unitId: guideUnitId(guide.slug),
      kind: "guide",
      path: `/docs/${guide.docCategory}/${guide.docSlug}`,
      docTitle: doc?.title ?? guide.title,
      heading: GUIDE_HEADING,
      sectionIndex: null,
      area: areaForGuide(guide.title, guide.category),
      docCategory: guide.docCategory,
      docSlug: guide.docSlug,
      guideSlug: guide.slug,
      sentences: buildUnitSentences(blocks),
    })
  }
  return units
}

export function buildUnitsFile(units: AnswerIndexUnit[]): AnswerIndexUnitsFile {
  const byKind: Record<UnitKind, number> = { summary: 0, section: 0, guide: 0 }
  const byArea = Object.fromEntries(ANSWER_INDEX_AREAS.map((area) => [area, { units: 0, sentences: 0 }])) as Record<
    AnswerIndexArea,
    { units: number; sentences: number }
  >
  let sentences = 0
  for (const unit of units) {
    byKind[unit.kind] += 1
    byArea[unit.area].units += 1
    byArea[unit.area].sentences += unit.sentences.length
    sentences += unit.sentences.length
  }
  return {
    version: `units-${sha16(JSON.stringify(units)).slice(0, 12)}`,
    counts: { units: units.length, sentences, byKind, byArea },
    units,
  }
}

/** 단위 id → 단위. */
export function indexUnits(units: AnswerIndexUnit[]) {
  return new Map(units.map((unit) => [unit.unitId, unit]))
}
