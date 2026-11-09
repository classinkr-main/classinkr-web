import { describe, expect, it } from "vitest"

import leadMagnetsData from "@/data/lead-magnets.json"
import type { LeadMagnet } from "@/lib/lead-magnets"
import {
  LEAD_MAGNET_QUALITY_RULES,
  getLeadMagnetQualityIssues,
  type LeadMagnetQualityIssue,
} from "@/lib/lead-magnet-quality"

type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T
type Draft = Mutable<LeadMagnet>

const OTHER_SLUGS = ["other-guide", "third-guide", "fourth-guide"]

/** 기준을 모두 통과하는 자료. 각 테스트는 이걸 한 칸만 망가뜨린다. */
function goodMagnet(): Draft {
  const items = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => `${prefix} 점검 문항 ${index + 1}번을 확인했다.`)
  return {
    slug: "good-guide",
    title: "좋은 자료 진단표",
    audience: "학원 원장, 실장",
    status: "review",
    gate: "email",
    tier: "basic",
    category: "operations",
    published: true,
    sourceDetail: "lead_magnet:good-guide",
    summary: "수업 운영이 어디서 끊기는지 먼저 보는 진단표입니다. 12문항으로 정리합니다.",
    formatLabel: "12문항 진단표 + 실행 플랜",
    estimatedMinutes: 12,
    blogTone: "차분하게",
    guideTone: "차분하게",
    checklistBullets: [],
    sections: [
      { title: "첫 영역", description: "첫 영역 설명", items: items("첫", 4) },
      { title: "둘째 영역", description: "둘째 영역 설명", items: items("둘째", 4) },
      { title: "셋째 영역", description: "셋째 영역 설명", items: items("셋째", 4) },
    ],
    scoreBands: [
      { range: "0-6점", label: "시작", description: "기본부터" },
      { range: "7-12점", label: "준비", description: "다음 단계" },
    ],
    redFlags: ["첫 신호", "둘째 신호"],
    actionPlan: [
      { day: "Day 1", title: "첫날", tasks: ["할 일 하나"] },
      { day: "Day 2", title: "둘째 날", tasks: ["할 일 둘"] },
      { day: "Day 3", title: "셋째 날", tasks: ["할 일 셋"] },
    ],
    deliverables: ["진단표", "점수 해석", "실행 플랜", "상담 질문"],
    consultationPrep: ["대표 수업 자료 1개"],
    sourceLinks: [
      { label: "공식 가이드", href: "https://www.classin.com/kr/guide/", description: "설명" },
      { label: "다른 자료", href: "/resources/other-guide", description: "설명" },
    ],
    pdfGuide: {
      subtitle: "부제",
      outcome: "이 자료로 운영 병목의 우선순위를 정합니다.",
      bestUsedWhen: ["도입을 검토할 때"],
      howToUse: ["12개 문항을 1점/0점으로 표시합니다."],
      discussionPrompts: ["가장 손이 많이 가는 업무는?"],
      relatedMagnets: ["other-guide", "third-guide"],
      consultationCtas: [
        { label: "도입 상담", href: "/contact#contact-form", description: "상담" },
        { label: "넷째 자료 보기", href: "/resources/fourth-guide#download", description: "설명" },
      ],
      expertNote: "낮은 영역부터 보세요.",
    },
    salesPlaybook: {
      intentScore: 20,
      intentLabel: "관심 리드",
      ownerNote: "메모",
      firstResponse: "자료 신청 감사합니다.",
      qualificationQuestions: ["질문"],
      followUpSequence: [
        { day: "D+0", title: "확인", tasks: ["연락"] },
        { day: "D+1", title: "자료", tasks: ["전달"] },
        { day: "D+3", title: "제안", tasks: ["제안"] },
      ],
      nextCtas: ["쇼룸 예약"],
    },
    ctaCopy: {
      eyebrow: "운영 진단 자료",
      title: "우리 학원 운영 누수를 먼저 확인하세요",
      body: "12문항으로 점검하는 원장용 자료입니다.",
      buttonLabel: "진단표 받기",
    },
    resourceUrl: "/materials/lead-magnets/good-guide.pdf",
    storagePath: "",
    suggestedPlacements: ["자료실", "블로그 하단"],
  }
}

const KNOWN = new Set(["good-guide", ...OTHER_SLUGS])

function issuesOf(magnet: Draft, knownSlugs: ReadonlySet<string> | null = KNOWN) {
  return getLeadMagnetQualityIssues(magnet as LeadMagnet, knownSlugs ? { knownSlugs } : undefined)
}

function idsOf(issues: readonly LeadMagnetQualityIssue[]) {
  return issues.map((issue) => issue.id)
}

interface RuleCase {
  id: string
  severity: "fix" | "improve"
  field: string
  break: (magnet: Draft) => void
}

const RULE_CASES: RuleCase[] = [
  { id: "summary-missing", severity: "fix", field: "summary", break: (m) => { m.summary = "  " } },
  { id: "summary-too-long", severity: "improve", field: "summary", break: (m) => { m.summary = "가".repeat(121) } },
  { id: "cta-copy-incomplete", severity: "fix", field: "ctaCopy.title", break: (m) => { m.ctaCopy.title = "" } },
  { id: "cta-copy-incomplete", severity: "fix", field: "ctaCopy.eyebrow", break: (m) => { m.ctaCopy.eyebrow = "" } },
  { id: "cta-copy-incomplete", severity: "fix", field: "ctaCopy.body", break: (m) => { m.ctaCopy.body = "" } },
  { id: "cta-copy-incomplete", severity: "fix", field: "ctaCopy.buttonLabel", break: (m) => { m.ctaCopy.buttonLabel = "" } },
  { id: "cta-title-too-long", severity: "improve", field: "ctaCopy.title", break: (m) => { m.ctaCopy.title = "가".repeat(33) } },
  { id: "cta-button-too-long", severity: "improve", field: "ctaCopy.buttonLabel", break: (m) => { m.ctaCopy.buttonLabel = "가".repeat(19) } },
  { id: "title-missing", severity: "fix", field: "title", break: (m) => { m.title = "" } },
  { id: "title-too-long", severity: "improve", field: "title", break: (m) => { m.title = "가".repeat(31) } },
  { id: "outcome-missing", severity: "fix", field: "pdfGuide.outcome", break: (m) => { m.pdfGuide!.outcome = "" } },
  { id: "outcome-missing", severity: "fix", field: "pdfGuide.outcome", break: (m) => { delete m.pdfGuide } },
  { id: "outcome-too-long", severity: "improve", field: "pdfGuide.outcome", break: (m) => { m.pdfGuide!.outcome = "가".repeat(81) } },
  { id: "audience-missing", severity: "fix", field: "audience", break: (m) => { m.audience = "" } },
  { id: "format-label-missing", severity: "fix", field: "formatLabel", break: (m) => { m.formatLabel = "" } },
  { id: "item-count-mismatch", severity: "fix", field: "formatLabel", break: (m) => { m.formatLabel = "13문항 진단표" } },
  { id: "item-count-mismatch", severity: "fix", field: "pdfGuide.howToUse", break: (m) => { m.pdfGuide!.howToUse = ["13개 문항을 표시합니다."] } },
  { id: "item-count-mismatch", severity: "fix", field: "deliverables", break: (m) => { m.deliverables = ["11문항 진단표", "b", "c", "d"] } },
  { id: "deliverables-too-few", severity: "improve", field: "deliverables", break: (m) => { m.deliverables = ["a", "b", "c"] } },
  { id: "deliverables-too-few", severity: "fix", field: "deliverables", break: (m) => { m.deliverables = [] } },
  { id: "consultation-prep-missing", severity: "fix", field: "consultationPrep", break: (m) => { m.consultationPrep = [] } },
  {
    id: "checklist-items-too-few",
    severity: "improve",
    field: "sections",
    break: (m) => {
      m.sections = m.sections.map((section) => ({ ...section, items: section.items.slice(0, 3) }))
      m.scoreBands = [
        { range: "0-4점", label: "a", description: "" },
        { range: "5-9점", label: "b", description: "" },
      ]
      m.formatLabel = "진단표"
      m.summary = "요약"
      m.pdfGuide!.howToUse = ["문항을 표시합니다."]
      m.ctaCopy.body = "본문"
    },
  },
  { id: "checklist-items-too-few", severity: "fix", field: "sections", break: (m) => { m.sections = [] } },
  {
    id: "sections-too-few",
    severity: "improve",
    field: "sections",
    break: (m) => {
      m.sections = m.sections.slice(0, 2).map((section) => ({ ...section, items: [...section.items, "추가 1", "추가 2"] }))
    },
  },
  {
    id: "section-items-too-few",
    severity: "improve",
    field: "sections.2.items",
    break: (m) => {
      m.sections[0].items = [...m.sections[0].items, "옮긴 1", "옮긴 2"]
      m.sections[2].items = m.sections[2].items.slice(0, 2)
    },
  },
  { id: "section-description-missing", severity: "improve", field: "sections.1.description", break: (m) => { m.sections[1].description = "" } },
  { id: "score-bands-too-few", severity: "improve", field: "scoreBands", break: (m) => { m.scoreBands = [{ range: "0-12점", label: "전체", description: "" }] } },
  { id: "score-bands-too-few", severity: "fix", field: "scoreBands", break: (m) => { m.scoreBands = [] } },
  { id: "score-range-mismatch", severity: "fix", field: "scoreBands", break: (m) => { m.scoreBands[1].range = "7-14점" } },
  { id: "score-range-mismatch", severity: "fix", field: "scoreBands", break: (m) => { m.scoreBands[0].range = "1-6점" } },
  { id: "score-range-mismatch", severity: "fix", field: "scoreBands", break: (m) => { m.scoreBands[1].range = "8-12점" } },
  { id: "action-plan-too-few", severity: "improve", field: "actionPlan", break: (m) => { m.actionPlan = m.actionPlan.slice(0, 2) } },
  { id: "action-plan-too-few", severity: "fix", field: "actionPlan", break: (m) => { m.actionPlan = [] } },
  { id: "duplicate-lines", severity: "fix", field: "deliverables", break: (m) => { m.deliverables = ["진단표", "점수 해석", " 진단표 ", "상담 질문"] } },
  { id: "duplicate-lines", severity: "fix", field: "sections.0.items", break: (m) => { m.sections[0].items[3] = m.sections[0].items[0] } },
  { id: "duplicate-lines", severity: "fix", field: "actionPlan", break: (m) => { m.actionPlan[2].day = "Day 1" } },
  {
    id: "checklist-item-repeated",
    severity: "improve",
    field: "sections.0.items",
    break: (m) => { m.sections[2].items[3] = m.sections[0].items[1] },
  },
  { id: "pdf-subtitle-missing", severity: "improve", field: "pdfGuide.subtitle", break: (m) => { m.pdfGuide!.subtitle = "" } },
  { id: "pdf-usage-incomplete", severity: "fix", field: "pdfGuide.discussionPrompts", break: (m) => { m.pdfGuide!.discussionPrompts = [] } },
  { id: "expert-note-missing", severity: "improve", field: "pdfGuide.expertNote", break: (m) => { m.pdfGuide!.expertNote = "" } },
  { id: "unknown-resource-slug", severity: "fix", field: "pdfGuide.relatedMagnets", break: (m) => { m.pdfGuide!.relatedMagnets = ["other-guide", "gone-guide"] } },
  { id: "unknown-resource-slug", severity: "fix", field: "sourceLinks.1.href", break: (m) => { m.sourceLinks![1].href = "/resources/gone-guide" } },
  { id: "related-self", severity: "fix", field: "pdfGuide.relatedMagnets", break: (m) => { m.pdfGuide!.relatedMagnets = ["good-guide", "other-guide"] } },
  { id: "related-self", severity: "fix", field: "sourceLinks.1.href", break: (m) => { m.sourceLinks![1].href = "/resources/good-guide#download" } },
  {
    id: "related-duplicate-link",
    severity: "improve",
    field: "pdfGuide.consultationCtas.1.href",
    break: (m) => { m.pdfGuide!.consultationCtas[1].href = "/resources/third-guide#download" },
  },
  { id: "source-links-missing", severity: "improve", field: "sourceLinks", break: (m) => { m.sourceLinks = [] } },
  { id: "link-href-invalid", severity: "fix", field: "sourceLinks.0.href", break: (m) => { m.sourceLinks![0].href = "" } },
  { id: "link-href-invalid", severity: "fix", field: "sourceLinks.0.href", break: (m) => { m.sourceLinks![0].href = "www.classin.com/kr" } },
  { id: "link-href-invalid", severity: "fix", field: "sourceLinks.0.label", break: (m) => { m.sourceLinks![0].label = "" } },
  { id: "link-href-invalid", severity: "fix", field: "pdfGuide.consultationCtas.0.href", break: (m) => { m.pdfGuide!.consultationCtas[0].href = "contact" } },
  { id: "link-href-invalid", severity: "fix", field: "resourceUrl", break: (m) => { m.resourceUrl = "materials/x.pdf" } },
  { id: "first-response-missing", severity: "fix", field: "salesPlaybook.firstResponse", break: (m) => { m.salesPlaybook!.firstResponse = "" } },
  { id: "follow-up-too-few", severity: "improve", field: "salesPlaybook.followUpSequence", break: (m) => { m.salesPlaybook!.followUpSequence = m.salesPlaybook!.followUpSequence.slice(0, 2) } },
  { id: "resource-url-missing", severity: "fix", field: "resourceUrl", break: (m) => { m.resourceUrl = "" } },
  { id: "login-gate-storage-missing", severity: "fix", field: "storagePath", break: (m) => { m.gate = "login" } },
  { id: "source-detail-mismatch", severity: "fix", field: "sourceDetail", break: (m) => { m.sourceDetail = "lead_magnet:old-guide" } },
  { id: "placements-too-few", severity: "improve", field: "suggestedPlacements", break: (m) => { m.suggestedPlacements = ["자료실"] } },
]

describe("lead magnet quality rules", () => {
  it("stays quiet on a magnet that meets every rule", () => {
    expect(issuesOf(goodMagnet())).toEqual([])
  })

  it.each(RULE_CASES.map((rule) => [`${rule.id} · ${rule.field}`, rule] as const))("fires %s", (_name, rule) => {
    const magnet = goodMagnet()
    rule.break(magnet)
    const issues = issuesOf(magnet)
    const hit = issues.find((issue) => issue.id === rule.id && issue.field === rule.field)
    expect(hit, JSON.stringify(issues, null, 2)).toBeTruthy()
    expect(hit?.severity).toBe(rule.severity)
    expect(hit?.message.trim().length).toBeGreaterThan(0)
  })

  it("covers every published rule with at least one breaking case", () => {
    const covered = new Set(RULE_CASES.map((rule) => rule.id))
    const missing = LEAD_MAGNET_QUALITY_RULES.map((rule) => rule.id).filter((id) => !covered.has(id))
    expect(missing).toEqual([])
  })

  it("publishes unique kebab-case rule ids with labels, and never emits an unlisted id", () => {
    const ids = LEAD_MAGNET_QUALITY_RULES.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const rule of LEAD_MAGNET_QUALITY_RULES) {
      expect(rule.id).toMatch(/^[a-z]+(?:-[a-z]+)*$/)
      expect(rule.label.trim().length).toBeGreaterThan(0)
    }
    const listed = new Set(ids)
    for (const rule of RULE_CASES) {
      const magnet = goodMagnet()
      rule.break(magnet)
      for (const issue of issuesOf(magnet)) expect(listed.has(issue.id), issue.id).toBe(true)
    }
  })

  it("writes messages for teammates — no field names or code words", () => {
    for (const rule of RULE_CASES) {
      const magnet = goodMagnet()
      rule.break(magnet)
      for (const issue of issuesOf(magnet)) {
        // camelCase(ctaCopy, pdfGuide, sourceLinks …)나 점 경로가 문장에 새면 안 된다.
        expect(issue.message, issue.id).not.toMatch(/\b[a-z]+[A-Z][A-Za-z]*\b/)
        expect(issue.message, issue.id).not.toMatch(/\b[a-z]+\.[a-z]+\b/i)
      }
    }
  })

  it("orders fix before improve", () => {
    const magnet = goodMagnet()
    magnet.summary = "가".repeat(130)
    magnet.suggestedPlacements = []
    magnet.resourceUrl = ""
    magnet.pdfGuide!.subtitle = ""
    const severities = issuesOf(magnet).map((issue) => issue.severity)
    expect(severities.length).toBeGreaterThanOrEqual(4)
    expect(severities).toEqual([...severities].sort((a, b) => (a === b ? 0 : a === "fix" ? -1 : 1)))
    expect(severities[0]).toBe("fix")
    expect(severities.at(-1)).toBe("improve")
  })

  it("relaxes item and section counts for quick checks (5 minutes or less)", () => {
    const quick = goodMagnet()
    quick.estimatedMinutes = 5
    quick.sections = [{ title: "빠른 점검", description: "설명", items: ["하나", "둘", "셋", "넷", "다섯", "여섯"] }]
    quick.scoreBands = [
      { range: "0~3개", label: "a", description: "" },
      { range: "4~6개", label: "b", description: "" },
    ]
    quick.formatLabel = "6문항 판단표"
    quick.summary = "빠른 판단표입니다."
    quick.ctaCopy.body = "6문항 판단표"
    quick.pdfGuide!.howToUse = ["6개 문항 중 해당하는 개수를 셉니다."]
    expect(idsOf(issuesOf(quick))).toEqual([])

    const regular = { ...quick, estimatedMinutes: 6 }
    const ids = idsOf(issuesOf(regular))
    expect(ids).toContain("checklist-items-too-few")
    expect(ids).toContain("sections-too-few")

    const tooThin = { ...quick, sections: [{ title: "빠른 점검", description: "설명", items: ["하나", "둘", "셋", "넷"] }] }
    tooThin.scoreBands = [
      { range: "0~2개", label: "a", description: "" },
      { range: "3~4개", label: "b", description: "" },
    ]
    tooThin.formatLabel = "4문항 판단표"
    tooThin.ctaCopy = { ...quick.ctaCopy, body: "4문항 판단표" }
    tooThin.pdfGuide = { ...quick.pdfGuide!, howToUse: ["4개 문항을 셉니다."] }
    const thinIssue = issuesOf(tooThin).find((issue) => issue.id === "checklist-items-too-few")
    expect(thinIssue?.severity).toBe("improve")
  })

  it("checks related slugs and resource links only when known slugs are given", () => {
    const magnet = goodMagnet()
    magnet.pdfGuide!.relatedMagnets = ["other-guide", "gone-guide"]
    magnet.sourceLinks![1].href = "/resources/also-gone"
    expect(idsOf(issuesOf(magnet, null))).not.toContain("unknown-resource-slug")
    const withKnown = issuesOf(magnet).filter((issue) => issue.id === "unknown-resource-slug")
    expect(withKnown.map((issue) => issue.field)).toEqual(["pdfGuide.relatedMagnets", "sourceLinks.1.href"])
    expect(withKnown[0].message).toContain("gone-guide")
  })

  it("tolerates half-filled editor payloads without throwing", () => {
    const magnet = goodMagnet() as unknown as Record<string, unknown>
    magnet.sections = [{ title: "빈 섹션" }]
    delete magnet.ctaCopy
    delete magnet.salesPlaybook
    delete magnet.sourceLinks
    magnet.scoreBands = [{ range: "점수 없음", label: "x" }]
    const issues = getLeadMagnetQualityIssues(magnet as unknown as LeadMagnet)
    expect(idsOf(issues)).toEqual(expect.arrayContaining(["checklist-items-too-few", "cta-copy-incomplete", "first-response-missing"]))
  })
})

describe("bundled lead magnet content", () => {
  const magnets = leadMagnetsData as unknown as LeadMagnet[]
  const knownSlugs = new Set(magnets.map((magnet) => magnet.slug))

  it("still bundles the 16 magnets this guard was written against", () => {
    expect(magnets.length).toBeGreaterThanOrEqual(16)
  })

  it.each(magnets.map((magnet) => [magnet.slug, magnet] as const))("%s has no fix-level issues", (_slug, magnet) => {
    const fixes = getLeadMagnetQualityIssues(magnet, { knownSlugs }).filter((issue) => issue.severity === "fix")
    expect(fixes).toEqual([])
  })
})
