import { describe, expect, it } from "vitest"

import { ANSWER_INDEX_AREAS } from "@/lib/chatbot/answer-index/types"
import { sentenceHash } from "@/lib/chatbot/answer-index/hash"
import { stableJson } from "@/scripts/answer-index/lib/common"
import { buildInventory } from "@/scripts/answer-index/lib/inventory"
import { flagSentence, buildUnitSentences } from "@/scripts/answer-index/lib/sentences"
import { buildSiteFacts, extractSiteLines } from "@/scripts/answer-index/lib/site-facts"
import { buildUnits, buildUnitsFile, loadUnitSources } from "@/scripts/answer-index/lib/units"

// 답 색인 사양 §4.2 units·site-facts, §7.1 inventory, §12.1 I2 완료 기준(같은 입력 같은 출력).

describe("공개 문서 단위(units.json)", () => {
  it("같은 문서면 같은 바이트를 낸다", async () => {
    const first = stableJson(buildUnitsFile(buildUnits(await loadUnitSources())))
    const second = stableJson(buildUnitsFile(buildUnits(await loadUnitSources())))
    expect(second).toBe(first)
  })

  it("요약·절·공개 가이드를 단위로 나누고, id·영역·해시 꼴을 지킨다", async () => {
    const units = buildUnits(await loadUnitSources())
    const file = buildUnitsFile(units)
    expect(file.counts.byKind.summary).toBeGreaterThan(0)
    expect(file.counts.byKind.section).toBeGreaterThan(file.counts.byKind.summary)
    expect(file.counts.byKind.guide).toBeGreaterThan(0)
    expect(new Set(units.map((unit) => unit.unitId)).size).toBe(units.length)
    for (const unit of units) {
      expect(unit.unitId).toMatch(/^(?:doc:\/docs\/[a-z0-9-]+\/[a-z0-9-]+#(?:summary|\d+)|guide:[a-z0-9-]+)$/)
      expect(ANSWER_INDEX_AREAS).toContain(unit.area)
      expect(unit.sentences.length).toBeGreaterThan(0)
      unit.sentences.forEach((sentence, index) => {
        expect(sentence.i).toBe(index)
        expect(sentence.hash).toBe(sentenceHash(sentence.text))
        expect(sentence.hash).toMatch(/^[0-9a-f]{16}$/)
      })
    }
    // 절 번호는 doc.sections 의 위치(0부터)다.
    const memberSection = units.find((unit) => unit.unitId === "doc:/docs/teacher/course-members#4")
    expect(memberSection?.sectionIndex).toBe(4)
    expect(memberSection?.kind).toBe("section")
  })

  it("내부·색인 제외 문서와 내부 전용 가이드는 넣지 않는다", async () => {
    const sources = await loadUnitSources()
    const units = buildUnits(sources)
    const paths = new Set(units.filter((unit) => unit.kind !== "guide").map((unit) => unit.path))
    for (const doc of sources.docs) {
      const path = `/docs/${doc.category}/${doc.slug}`
      if (doc.noindex || doc.visibility === "internal" || (doc.status ?? "published") !== "published") expect(paths.has(path)).toBe(false)
    }
    const { INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS } = await import("@/lib/cs-figma-guides")
    for (const unit of units.filter((candidate) => candidate.kind === "guide")) {
      expect(INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS.has(unit.docSlug)).toBe(false)
    }
  })

  it("줄 단위로 먼저 나눠 경로 줄이 다음 문장과 붙지 않고, 링크·굵게·목록 표시를 지운다", () => {
    const sentences = buildUnitSentences([
      "설치 파일을 받습니다.\n경로: 공식 홈페이지 > [다운로드]\n- **[설치하기]**를 누릅니다. 자세한 내용은 [PC 설치](/docs/start/pc-install)를 보세요.",
    ])
    expect(sentences.map((sentence) => sentence.text)).toEqual([
      "설치 파일을 받습니다.",
      "경로: 공식 홈페이지 > [다운로드]",
      "[설치하기]를 누릅니다.",
      "자세한 내용은 PC 설치를 보세요.",
    ])
    expect(sentences[3].flags).toContain("nav")
    expect(sentences[0].flags).toEqual([])
  })

  it("캡션·메타·접속어·표 줄을 표시한다", () => {
    expect(flagSentence("빨간 박스로 표시된 버튼을 누릅니다.", { docLink: false, table: false })).toContain("caption")
    expect(flagSentence("아래 순서대로 따라 하시면 됩니다.", { docLink: false, table: false })).toContain("meta")
    expect(flagSentence("그래도 안 되면 앱을 다시 설치합니다.", { docLink: false, table: false })).toContain("connective")
    expect(flagSentence("옵션 | 켜면 달라지는 것", { docLink: false, table: true })).toContain("table")
    expect(flagSentence("[멤버 삭제]를 누릅니다.", { docLink: false, table: false })).toEqual([])
  })
})

describe("공개 페이지 사실(site-facts.json)", () => {
  it("같은 페이지면 같은 출력을 내고, id 는 site:<경로>:<줄> 꼴이다", () => {
    const first = buildSiteFacts()
    const second = buildSiteFacts()
    expect(stableJson(second)).toBe(stableJson(first))
    expect(new Set(first.map((fact) => fact.id)).size).toBe(first.length)
    for (const fact of first) {
      expect(fact.id).toMatch(new RegExp(`^site:${fact.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:${fact.line}(?:#\\d+)?$`))
      expect(fact.hash).toBe(sentenceHash(fact.text))
    }
    expect(first.some((fact) => fact.path === "app/privacy/page.tsx" && /^전화: /.test(fact.text))).toBe(true)
    // 개인정보처리방침의 개정 비교표(이전 판 글)는 넣지 않는다.
    expect(first.some((fact) => fact.path === "app/privacy/2026-06-14/page.tsx")).toBe(false)
  })

  it("같은 줄의 JSX 글 조각은 잇고, 같은 파일 문자열 상수는 값으로 바꾸며, 속성 값은 뺀다", () => {
    const source = [
      'const PHONE = "02-0000-0000"',
      "export function Footer() {",
      '  return <p className="text-sm">전화번호: <a href="tel:1">{PHONE}</a></p>',
      "}",
    ].join("\n")
    expect(extractSiteLines("components/x.tsx", source)).toEqual([{ line: 3, text: "전화번호: 02-0000-0000" }])
  })
})

describe("기존 정해 둔 답 목록(inventory.json)", () => {
  it("모든 출처를 §4.2 접두 id 로 모으고, 같은 코드면 같은 답 글 해시를 낸다", async () => {
    const first = await buildInventory({ computeHits: false })
    const second = await buildInventory({ computeHits: false })
    expect(stableJson(second)).toBe(stableJson(first))
    const ids = first.entries.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of first.entries) {
      expect(entry.id).toMatch(/^(?:field|basics|symptom|svc|template|self|guide):.+$/)
      expect(entry.id.startsWith(`${entry.module}:`)).toBe(true)
      expect(ANSWER_INDEX_AREAS).toContain(entry.area)
      expect(entry.text.length).toBeGreaterThan(0)
      expect(entry.textHash).toMatch(/^[0-9a-f]{16}$/)
      expect(entry.hits).toBeNull()
    }
    for (const name of ["field", "basics", "symptom", "svc", "template", "self", "guide"] as const) {
      expect(first.counts.byModule[name]).toBeGreaterThan(0)
    }
    const { FIELD_QUICK_ANSWERS } = await import("@/lib/chatbot/quick-answers-field")
    const { BASIC_QUICK_ANSWERS } = await import("@/lib/chatbot/quick-answers-basics")
    expect(first.counts.byModule.field).toBe(FIELD_QUICK_ANSWERS.length)
    expect(first.counts.byModule.basics).toBe(BASIC_QUICK_ANSWERS.length)
    // service.ts 안 고정 답은 판별 정규식 이름으로 id 를 붙인다.
    const showroom = first.entries.find((entry) => entry.id === "svc:showroom")
    expect(showroom?.match.source).toContain("SHOWROOM_RE")
    expect(showroom?.textAlternatives.length).toBeGreaterThan(0)
    expect(first.entries.find((entry) => entry.id === "svc:exam-answer")?.gateExempt).toBe(true)
    expect(first.entries.find((entry) => entry.id === "svc:policy-academy-payment")?.gateOriginal).toBe("policy:academy-payment")
    expect(first.entries.find((entry) => entry.id === "template:체험·파일럿 확인")?.gateOriginal).toBe("template:체험·파일럿 확인")
    expect(first.entries.find((entry) => entry.id === "field:logo-usage")?.match.regexes.length).toBeGreaterThan(0)
  }, 60_000)

  it("걸림 수는 질문 글 없이 숫자만 남긴다", async () => {
    const inventory = await buildInventory({
      devSets: [{ name: "fixture", questions: ["클래스인 대표는 누구인가요?"], sha: "0".repeat(16) }],
    })
    const ceo = inventory.entries.find((entry) => entry.id === "basics:basics-company-ceo")
    expect(ceo?.hits?.dev).toBe(1)
    expect(ceo?.wins?.dev).toBe(1)
    expect(JSON.stringify(inventory)).not.toContain("클래스인 대표는 누구인가요?")
    expect(inventory.evalSets.find((set) => set.name === "fixture")?.questions).toBe(1)
  }, 60_000)
})
