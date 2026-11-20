import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { buildDocsSummaryChunkContent } from "@/lib/admin-docs"
import { isPublicChatbotDoc } from "@/lib/chatbot/doc-outline"
import {
  attachGroundingText,
  buildEvidenceSentences,
  getGroundingText,
  trimToCompleteSentences,
} from "@/lib/chatbot/source-grounding"
import { listDocs, type DocArticle } from "@/lib/docs"

/**
 * 근거 본문 모양: 운영(Supabase 청크)과 측정(정적 문서)이 같은 문장 목록을 보는지(2026-11-20 조사 G5).
 *
 * 운영 청크는 lib/admin-docs.ts 가 "## 절 제목\n\n본문\n\n- 단계" 와 "문서 제목\n\n설명\n\n요약\n\n키워드: …" 모양으로 만든다.
 * 줄을 공백으로 그냥 이으면 제목이 첫 문장에 붙고 마침표 없는 단계가 한 문장으로 뭉쳐, 근거 선별(select)이 그 문장을 그대로 답으로 냈다.
 * 측정(scripts/chatbot-live-eval.ts)은 정적 문서 모양만 보므로 이 차이가 드러나지 않았다.
 */

const docs = listDocs().filter(isPublicChatbotDoc)

type Section = DocArticle["sections"][number]

// lib/admin-docs.ts sectionToChunkContent 와 같은 형식(내보내지 않는 함수라 옮겨 적는다). 아래 시험이 원본 형식을 확인한다.
function sectionToChunkContent(section: Section) {
  const steps = section.steps?.map((step) => `- ${step}`).join("\n")
  return [`## ${section.heading}`, section.body, steps].filter(Boolean).join("\n\n")
}

// service.ts buildDocSectionSource 와 같은 정적 출처 본문.
function staticSectionText(section: Section) {
  return [section.body, ...(section.steps ?? [])].join(" ")
}

function staticSummaryText(doc: DocArticle) {
  return [doc.description, doc.chatbotSummary].join(" ")
}

// 이번 수정 전의 normalizeGroundingText. 정적 출처(제목 줄·요약 꼬리표가 없는 본문)는 지금도 이 결과와 같아야 한다.
function legacyNormalize(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/(?:^|(?<=[.!?]["'”’)]?\s))>\s*/g, "")
    .trim()
}

function sentencesOf(title: string, heading: string, text: string) {
  return buildEvidenceSentences([attachGroundingText({ title, heading, excerpt: text.slice(0, 220) }, text)]).map(
    (sentence) => sentence.text
  )
}

const TERMINAL_RE = /[.!?。]["'”’)\]]*$/
// 정적 본문이 줄 모양에 기대는 절: 목록·표 줄이 있거나, 마침표 없이 끝나는 줄·단계가 있다. 정적 쪽은 이 줄들을 공백으로
// 이어 한 문장으로 뭉치므로(정적 쪽의 같은 약점), 줄을 문장 경계로 보는 운영 쪽과 문장 목록이 다를 수밖에 없다.
// 가림 표시("세**")가 든 줄도 그렇다: 정적 쪽은 줄을 이은 뒤 굵게 표시(**…**)를 떼서, 다른 줄의 "**"와 짝지어 지운다.
function dependsOnLineShape(section: Section) {
  const bodyLines = section.body.split(/\n/).map((line) => line.trim()).filter(Boolean)
  const lines = [...bodyLines, ...(section.steps ?? []).map((step) => step.trim())]
  return (
    bodyLines.some((line) => /^(?:>\s*)?(?:[-*•]|\d+[.)])\s|^\|/.test(line) || !TERMINAL_RE.test(line)) ||
    (section.steps ?? []).some((step) => !TERMINAL_RE.test(step.trim())) ||
    lines.some((line) => (line.match(/\*\*/g)?.length ?? 0) % 2 === 1)
  )
}

function compactForContainment(value: string) {
  return value.replace(/[\s.\-*•>]/g, "")
}

describe("grounding text shape: production chunks vs static docs", () => {
  it("copies the chunk format that lib/admin-docs.ts writes", () => {
    const source = readFileSync(join(process.cwd(), "lib/admin-docs.ts"), "utf8")
    expect(source).toContain("section.steps?.map((step) => `- ${step}`).join(\"\\n\")")
    expect(source).toContain("[`## ${section.heading}`, section.body, steps].filter(Boolean).join(\"\\n\\n\")")
  })

  it("keeps the static grounding text exactly as before", () => {
    let checked = 0
    for (const doc of docs) {
      const texts = [staticSummaryText(doc), ...doc.sections.map(staticSectionText)]
      for (const text of texts) {
        const grounded = getGroundingText(attachGroundingText({ title: doc.title, excerpt: "" }, text))
        expect(grounded, `${doc.slug}: ${text.slice(0, 40)}`).toBe(trimToCompleteSentences(legacyNormalize(text)) || null)
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(300)
  })

  it("gives the same evidence sentences for a chunk and its static section when the section does not depend on line shape", () => {
    let same = 0
    let lineShaped = 0
    for (const doc of docs) {
      for (const section of doc.sections) {
        const fromStatic = sentencesOf(doc.title, section.heading, staticSectionText(section))
        const fromChunk = sentencesOf(doc.title, section.heading, sectionToChunkContent(section))
        if (dependsOnLineShape(section)) {
          lineShaped += 1
          continue
        }
        expect(fromChunk, `${doc.category}/${doc.slug} / ${section.heading}`).toEqual(fromStatic)
        same += 1
      }
    }
    // 2026-11-20 공개 문서 555절: 같은 절 440, 줄 모양에 기대는 절 115(목록·인용 본문, 마침표 없는 줄·단계, 가림 표시).
    expect(same).toBeGreaterThan(lineShaped * 3)
  })

  it("never glues the heading, a list marker, a table row or a summary tag into a chunk sentence", () => {
    for (const doc of docs) {
      for (const section of doc.sections) {
        const chunk = sectionToChunkContent(section)
        const fromChunk = sentencesOf(doc.title, section.heading, chunk)
        const staticCompact = compactForContainment(legacyNormalize(staticSectionText(section)))
        for (const sentence of fromChunk) {
          const where = `${doc.slug} / ${section.heading}: ${sentence.slice(0, 60)}`
          expect(sentence, where).not.toMatch(/^(?:#|[-*•]\s|\|)/)
          // 운영 문장은 정적 본문에 있던 글만 담는다(제목·표시를 붙이지 않는다). 붙인 마침표·목록 표시는 빼고 비교한다.
          expect(staticCompact.includes(compactForContainment(sentence)), where).toBe(true)
        }
        if (section.body.trim() && !section.body.trim().startsWith(section.heading)) {
          expect(fromChunk[0]?.startsWith(`${section.heading} `) ?? false, `${doc.slug} / ${section.heading}`).toBe(false)
        }
      }
    }
  })

  it("drops the title line and the keyword, symptom and audience lines of a summary chunk", () => {
    let same = 0
    for (const doc of docs) {
      const chunk = buildDocsSummaryChunkContent({
        title: doc.title,
        description: doc.description,
        chatbot_summary: doc.chatbotSummary,
        keywords: doc.keywords,
        symptoms: ["화면이 안 보여요", "소리가 안 나요"],
        audience: [doc.audience],
      })
      const fromChunk = sentencesOf(doc.title, "요약", chunk)
      for (const sentence of fromChunk) {
        expect(sentence, doc.slug).not.toMatch(/^(?:키워드|증상|대상)\s*:/)
        expect(sentence.startsWith(`${doc.title} `), doc.slug).toBe(false)
      }
      const simple = [doc.description, doc.chatbotSummary].every((text) => !text.includes("\n") && TERMINAL_RE.test(text.trim()))
      if (simple) {
        expect(fromChunk, doc.slug).toEqual(sentencesOf(doc.title, "요약", staticSummaryText(doc)))
        same += 1
      }
    }
    expect(same).toBeGreaterThan(docs.length / 2)
  })

  it("splits unterminated steps into their own sentences and adds the period", () => {
    const chunk = [
      "## 먼저 확인할 것",
      "녹화 문제는 대부분 설정에서 생깁니다.",
      ["- 경로: [기관 관리] > [녹화 설정]", "- 모바일은 앱 설정에서 바꿉니다", "1. 저장 위치를 고릅니다."].join("\n"),
      "| 항목 | 값 |\n| --- | --- |\n| 화질 | 720p |",
    ].join("\n\n")

    expect(sentencesOf("녹화가 안 될 때", "먼저 확인할 것", chunk)).toEqual([
      "녹화 문제는 대부분 설정에서 생깁니다.",
      "경로: [기관 관리] > [녹화 설정].",
      "모바일은 앱 설정에서 바꿉니다.",
      "저장 위치를 고릅니다.",
    ])
  })
})
