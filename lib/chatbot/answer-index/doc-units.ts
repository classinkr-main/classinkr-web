/**
 * 공개 문서 단위 나누기(요약·절·공개 가이드). 추출기(scripts/answer-index/lib/units.ts → units.json)와
 * 런타임(load.ts: 카드 문장 해시를 '지금 문서'와 대조, respond: 문장 다시 꺼내기)이 같은 함수를 쓴다.
 *
 * 범위(§4.2): 공개 챗봇 문서(isPublicChatbotDoc)이면서 status 가 없거나 published 인 문서의 요약·절,
 * 그리고 공개 화면 가이드(CS_FIGMA_GUIDES 가운데 내부 전용 slug 를 뺀 것)의 가이드 문서.
 * - 요약 단위 = 문서 설명 + 챗봇 요약.
 * - 절 단위 = 절 본문 + 단계. 절 번호는 doc.sections 의 위치(0부터).
 * - 가이드 단위 = 공개 가이드 문서 페이지에 실리는 글(요약 + 절 본문·단계).
 *
 * 영역(area)은 추출기의 표(scripts/answer-index/lib/areas.ts)가 정한다. 런타임은 영역이 필요 없어서 areaOf 를 받는다.
 * 이 파일은 lib/docs 를 직접 읽지 않는다(부르는 쪽이 문서 목록을 넘긴다).
 */
import { isPublicChatbotDoc } from "@/lib/chatbot/doc-outline"
import type { AnswerIndexArea, AnswerIndexUnit } from "@/lib/chatbot/answer-index/types"
import type { CsFigmaGuide } from "@/lib/cs-figma-guides"
import type { DocArticle } from "@/lib/docs"
import { buildUnitSentences } from "./sentences"

export const SUMMARY_HEADING = "요약"
export const GUIDE_HEADING = "사용 순서 안내"

export interface UnitSources {
  docs: DocArticle[]
  guides: CsFigmaGuide[]
}

/** 영역을 정하는 데 쓰는 단위 정보. */
export type UnitAreaContext =
  | { kind: "summary" | "section"; category: string; slug: string; sectionIndex: number | null; heading: string | null }
  | { kind: "guide"; title: string; category: string }

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

/** 문서 목록 → 단위 목록. 같은 문서면 같은 순서·같은 문장·같은 해시다. */
export function buildUnitsFromSources(sources: UnitSources, areaOf: (context: UnitAreaContext) => AnswerIndexArea): AnswerIndexUnit[] {
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
      area: areaOf({ kind: "summary", category: doc.category, slug: doc.slug, sectionIndex: null, heading: null }),
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
        area: areaOf({ kind: "section", category: doc.category, slug: doc.slug, sectionIndex, heading: section.heading }),
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
      area: areaOf({ kind: "guide", title: guide.title, category: guide.category }),
      docCategory: guide.docCategory,
      docSlug: guide.docSlug,
      guideSlug: guide.slug,
      sentences: buildUnitSentences(blocks),
    })
  }
  return units
}
