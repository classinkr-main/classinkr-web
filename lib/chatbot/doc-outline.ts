/**
 * 공개 도움말 목차(문서 제목 + 절 제목). 못 찾았을 때의 두 번째 검색(service.ts applySecondChanceRetrieval)이 쓴다.
 *
 * 낱말 검색은 묻는 낱말과 문서 낱말이 다르면("채팅만 막을 수 있나요" ↔ 문서의 "채팅 금지") 0건을 낸다. 두 번째 검색은
 * 이 목차를 모델에게 보여 주고 답이 있을 만한 절을 고르게 한 뒤, 그 절의 문장으로 기존 근거 선별을 다시 돌린다.
 * 모델은 번호만 고르고, 나가는 글은 문서 문장 그대로다.
 *
 * - 범위: 공개 챗봇 정적 검색(service.ts getFallbackDocs*)과 같은 필터(isPublicChatbotDoc)를 쓴다. 내부 문서(visibility=internal)와
 *   색인 제외 문서(noindex, CS 운영 가이드 등)는 목차에 들어가지 않는다.
 * - 크기(2026-11-18): 공개 문서 77개, 절 555개 + 문서마다 '요약' 1줄. 제목·절 제목에 절마다 본문의 화면 이름(버튼·메뉴 이름)을
 *   5개까지만 붙이고, 본문·키워드는 싣지 않는다(문서 키워드까지 실으면 글자 수가 두 배를 넘는다). 크기는 테스트가 지킨다.
 * - 목차는 정적 문서(lib/docs.ts)로 만든다. 운영에서 Supabase 문서를 쓰더라도 두 번째 검색은 이 정적 목차와 정적 본문을 쓴다.
 */

import { listDocs, type DocArticle } from "@/lib/docs"

/** 공개 챗봇 검색이 쓰는 정적 문서 범위. 내부 문서·색인 제외 문서는 뺀다. */
export function isPublicChatbotDoc(doc: Pick<DocArticle, "noindex" | "visibility">) {
  return !doc.noindex && (doc.visibility ?? "public") !== "internal"
}

export interface DocOutlineEntry {
  /** 목차 번호(1부터). 모델은 이 번호만 고른다. */
  id: number
  doc: DocArticle
  /** doc.sections 의 위치. null 이면 문서 요약(설명 + 챗봇 요약). */
  sectionIndex: number | null
}

export interface DocOutline {
  /** 모델에게 보여 줄 목차 문자열. "# 문서 제목" 아래에 "번호 절 제목" 줄이 이어진다. */
  text: string
  entries: Map<number, DocOutlineEntry>
}

export const DOC_OUTLINE_SUMMARY_HEADING = "요약"

// 절마다 본문에 나오는 화면 이름(버튼·메뉴·설정 이름: [멤버 삭제], '전체 학생 채팅 금지')을 몇 개 붙인다.
// 절 제목만으로는 그 절이 어떤 설정을 다루는지 드러나지 않는 경우가 많다("코스 설정에서 정할 것"에 채팅 금지가 있다).
const MAX_LABELS_PER_SECTION = 5
const MAX_LABEL_LENGTH = 24
const SECTION_LABEL_RE = /\[([^[\]\n]{1,40})\]|'([^'\n]{2,40})'/g

function cleanLine(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

/** 절 본문에 나오는 화면 이름(대괄호·작은따옴표 안의 짧은 이름)을 나온 순서대로 몇 개 뽑는다. */
export function extractSectionLabels(text: string, heading = "") {
  const labels: string[] = []
  for (const match of text.matchAll(SECTION_LABEL_RE)) {
    const label = cleanLine(match[1] ?? match[2] ?? "")
    if (!label || label.length > MAX_LABEL_LENGTH || /^[\d\s.,]+$/.test(label)) continue
    if (labels.includes(label) || heading.includes(label)) continue
    labels.push(label)
    if (labels.length >= MAX_LABELS_PER_SECTION) break
  }
  return labels
}

export function buildDocOutline(docs: DocArticle[]): DocOutline {
  const lines: string[] = []
  const entries = new Map<number, DocOutlineEntry>()
  let nextId = 1
  for (const doc of docs) {
    if (!isPublicChatbotDoc(doc)) continue
    lines.push(`# ${cleanLine(doc.title)}`)
    entries.set(nextId, { id: nextId, doc, sectionIndex: null })
    lines.push(`${nextId} ${DOC_OUTLINE_SUMMARY_HEADING}`)
    nextId += 1
    doc.sections.forEach((section, sectionIndex) => {
      entries.set(nextId, { id: nextId, doc, sectionIndex })
      const heading = cleanLine(section.heading)
      const labels = extractSectionLabels([section.body, ...(section.steps ?? [])].join(" "), heading)
      lines.push(labels.length > 0 ? `${nextId} ${heading} (${labels.join(", ")})` : `${nextId} ${heading}`)
      nextId += 1
    })
  }
  return { text: lines.join("\n"), entries }
}

let publicOutline: DocOutline | null = null

/** 공개 정적 문서의 목차. 프로세스에서 한 번만 만든다. */
export function getPublicDocOutline(): DocOutline {
  if (!publicOutline) publicOutline = buildDocOutline(listDocs())
  return publicOutline
}
