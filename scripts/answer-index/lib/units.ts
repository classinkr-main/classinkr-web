/**
 * 공개 문서 단위(units.json) 만들기.
 *
 * 범위(§4.2): listDocs() 가운데 공개 챗봇 문서(isPublicChatbotDoc)이면서 status 가 없거나 published 인 문서의
 * 요약·절, 그리고 공개 화면 가이드(CS_FIGMA_GUIDES, 내부 전용 slug 제외 — 목록 자체가 이미 뺀 것)의 가이드 문서.
 *
 * - 요약 단위 = 문서 설명 + 챗봇 요약(doc-outline 의 '요약'과 같다).
 * - 절 단위 = 절 본문 + 단계. 절 번호는 doc.sections 의 위치(0부터).
 * - 가이드 단위 = 공개 가이드 문서 페이지에 실리는 글(요약 + 절 본문·단계).
 *
 * 나누는 함수는 lib/chatbot/answer-index/doc-units.ts 에 있다(런타임 load·respond 가 지금 문서에서 같은 문장·해시를 만들어야 해서).
 * 이 파일은 문서 목록 읽기와 영역 표(areas.ts)만 더한다.
 */
import { sha16 } from "@/lib/chatbot/answer-index/hash"
import { buildUnitsFromSources, type UnitAreaContext, type UnitSources } from "@/lib/chatbot/answer-index/doc-units"
import {
  ANSWER_INDEX_AREAS,
  type AnswerIndexArea,
  type AnswerIndexUnit,
  type AnswerIndexUnitsFile,
  type UnitKind,
} from "@/lib/chatbot/answer-index/types"
import { areaForDocSection, areaForGuide } from "./areas"

// 단위 나누기 정본은 lib/chatbot/answer-index/doc-units.ts(런타임 load·respond 와 같은 함수). 여기서는 영역 표만 더한다.
export {
  GUIDE_HEADING,
  SUMMARY_HEADING,
  docPathOf,
  guideUnitId,
  isIndexedDoc,
  sectionUnitId,
  summaryUnitId,
  type UnitSources,
} from "@/lib/chatbot/answer-index/doc-units"

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

/** 단위의 영역(§4.1): 문서 단위는 절·문서·분류 표, 가이드는 제목·분류 표. */
export function areaOfUnit(context: UnitAreaContext): AnswerIndexArea {
  return context.kind === "guide"
    ? areaForGuide(context.title, context.category)
    : areaForDocSection(context.category, context.slug, context.sectionIndex, context.heading)
}

export function buildUnits(sources: UnitSources): AnswerIndexUnit[] {
  return buildUnitsFromSources(sources, areaOfUnit)
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
