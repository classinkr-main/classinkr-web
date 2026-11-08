/**
 * 자료 퍼널(/admin/lead-magnets) 편집 모델 — 화면 부품이 같이 쓰는 순수 함수.
 *
 * 초안은 LeadMagnet 객체 그대로 고친다(미리보기 위 인라인 편집이 구조를 직접 바꾼다).
 * 한 칸에 여러 줄을 쓰는 묶음(점수 해석·실행 플랜·링크·사례 카드·멘트 예시 등)은
 * 「## 머리 / - 항목」 꼴 글로 주고받는다 — 예전 편집기의 형식을 그대로 이어받는다.
 */
import type {
  LeadMagnet,
  LeadMagnetActionStep,
  LeadMagnetCaseCard,
  LeadMagnetPdfGuide,
  LeadMagnetScoreBand,
  LeadMagnetScriptSample,
  LeadMagnetSection,
  LeadMagnetSourceLink,
  LeadMagnetStoryGuide,
  LeadMagnetWorksheetRow,
} from "@/lib/lead-magnets"

export interface LeadMagnetMetricRow {
  slug: string
  impressions: number
  views: number
  submissions: number
  downloads: number
  ctaClicks: number
  leads: number
  convertedLeads: number
  conversionRate: number
  leadConversionRate: number
  lastEventAt: string | null
}

export interface LeadMagnetMetricsResponse {
  days: number
  since: string
  generatedAt: string
  truncated: boolean
  totals: {
    impressions: number
    views: number
    submissions: number
    downloads: number
    ctaClicks: number
    leads: number
    convertedLeads: number
    conversionRate: number
    leadConversionRate: number
  }
  byLeadMagnet: LeadMagnetMetricRow[]
  recentEvents: Array<{
    eventName: string
    leadMagnet: string
    createdAt: string
    page: string | null
    source: string | null
  }>
  warning?: string
}

export const EMPTY_METRIC_ROW: Omit<LeadMagnetMetricRow, "slug"> = {
  impressions: 0,
  views: 0,
  submissions: 0,
  downloads: 0,
  ctaClicks: 0,
  leads: 0,
  convertedLeads: 0,
  conversionRate: 0,
  leadConversionRate: 0,
  lastEventAt: null,
}

export function cloneLeadMagnet(magnet: LeadMagnet): LeadMagnet {
  return JSON.parse(JSON.stringify(magnet)) as LeadMagnet
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function emptyLeadMagnet(): LeadMagnet {
  const slug = "new-resource"
  return {
    slug,
    title: "새 리드마그넷",
    audience: "학원 원장, 운영팀",
    status: "draft",
    gate: "email",
    tier: "basic",
    category: "operations",
    published: false,
    sourceDetail: `lead_magnet:${slug}`,
    summary: "",
    formatLabel: "10문항 자료 + 실행 플랜",
    estimatedMinutes: 10,
    blogTone: "",
    guideTone: "",
    checklistBullets: [],
    sections: [
      {
        title: "점검 영역",
        description: "이 영역에서 확인할 기준을 적어주세요.",
        items: ["첫 번째 점검 문항", "두 번째 점검 문항"],
      },
    ],
    scoreBands: [{ range: "0-3점", label: "보완 필요", description: "먼저 기준 정리가 필요합니다." }],
    redFlags: [],
    actionPlan: [{ day: "Day 1", title: "현재 상태 정리", tasks: ["현재 쓰는 자료와 운영 흐름을 모읍니다."] }],
    deliverables: [],
    consultationPrep: [],
    sourceLinks: [],
    salesPlaybook: {
      intentScore: 15,
      intentLabel: "자료 관심 리드",
      ownerNote: "",
      firstResponse: "",
      qualificationQuestions: [],
      followUpSequence: [{ day: "D+0", title: "첫 응대", tasks: ["자료 신청 맥락을 확인하고 상담 CTA를 제안합니다."] }],
      nextCtas: [],
    },
    ctaCopy: { eyebrow: "무료 자료", title: "새 자료를 확인하세요", body: "", buttonLabel: "자료 보기" },
    resourceUrl: `/resources/${slug}`,
    storagePath: "",
    suggestedPlacements: [],
  }
}

export function emptyPdfGuide(): LeadMagnetPdfGuide {
  return {
    subtitle: "",
    outcome: "",
    bestUsedWhen: [],
    howToUse: [],
    discussionPrompts: [],
    relatedMagnets: [],
    consultationCtas: [],
    expertNote: "",
  }
}

export function emptyStoryGuide(): LeadMagnetStoryGuide {
  return { eyebrow: "", title: "", body: "", beats: [], takeaway: "" }
}

// ── 줄 글 ↔ 구조 ────────────────────────────────────────────────

export function arrayToText(items: readonly string[] | undefined) {
  return (items ?? []).join("\n")
}

export function textToArray(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter(Boolean)
}

export function sectionsToText(sections: readonly LeadMagnetSection[]) {
  return sections
    .map((section) => [`## ${section.title}`, section.description, ...section.items.map((item) => `- ${item}`)].join("\n"))
    .join("\n\n")
}

export function textToSections(value: string): LeadMagnetSection[] {
  const sections: LeadMagnetSection[] = []
  let current: { title: string; description: string; items: string[] } | null = null
  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith("## ")) {
      if (current && current.items.length > 0) sections.push(current)
      current = { title: line.replace(/^##\s*/, "").trim(), description: "", items: [] }
      continue
    }
    if (!current) current = { title: "점검 영역", description: "", items: [] }
    if (line.startsWith("- ")) current.items.push(line.replace(/^-\s*/, "").trim())
    else if (!current.description) current.description = line
    else current.items.push(line)
  }
  if (current && current.items.length > 0) sections.push(current)
  return sections
}

export function scoreBandsToText(scoreBands: readonly LeadMagnetScoreBand[]) {
  return scoreBands.map((band) => `${band.range} | ${band.label} | ${band.description}`).join("\n")
}

export function textToScoreBands(value: string): LeadMagnetScoreBand[] {
  return value
    .split("\n")
    .map((line) => {
      const [range, label, ...rest] = line.split("|").map((item) => item.trim())
      return { range, label, description: rest.join(" | ") }
    })
    .filter((item) => item.range && item.label)
}

export function actionPlanToText(actionPlan: readonly LeadMagnetActionStep[]) {
  return actionPlan
    .map((step) => [`## ${step.day} | ${step.title}`, ...step.tasks.map((task) => `- ${task}`)].join("\n"))
    .join("\n\n")
}

export function textToActionPlan(value: string): LeadMagnetActionStep[] {
  const steps: LeadMagnetActionStep[] = []
  let current: { day: string; title: string; tasks: string[] } | null = null
  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith("## ")) {
      if (current) steps.push(current)
      const [day, ...titleParts] = line.replace(/^##\s*/, "").split("|").map((item) => item.trim())
      current = { day, title: titleParts.join(" | ") || "실행 단계", tasks: [] }
      continue
    }
    if (!current) current = { day: "Day 1", title: "실행 단계", tasks: [] }
    current.tasks.push(line.replace(/^-\s*/, "").trim())
  }
  if (current) steps.push(current)
  return steps
}

export function linksToText(links: readonly LeadMagnetSourceLink[] | undefined) {
  return (links ?? [])
    .map((link) => [link.label, link.href, link.description ?? ""].join(" | ").replace(/\s+\|\s+$/, ""))
    .join("\n")
}

export function textToLinks(value: string): LeadMagnetSourceLink[] {
  return value
    .split("\n")
    .map((line) => {
      const [label, href, ...rest] = line.split("|").map((item) => item.trim())
      return { label, href, description: rest.join(" | ") }
    })
    .filter((item) => item.label && item.href)
}

/** 계산표 줄 — 「라벨 | 힌트」, 맨 앞 * 는 합계·결과 줄 강조 */
export function worksheetRowsToText(rows: readonly LeadMagnetWorksheetRow[]) {
  return rows.map((row) => `${row.highlight ? "* " : ""}${row.label}${row.hint ? ` | ${row.hint}` : ""}`).join("\n")
}

export function textToWorksheetRows(value: string): LeadMagnetWorksheetRow[] {
  return value
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((line) => {
      const highlight = line.startsWith("*")
      const [label, ...hint] = line.replace(/^\*\s*/, "").split("|").map((part) => part.trim())
      const row: LeadMagnetWorksheetRow = { label }
      if (hint.join(" | ")) row.hint = hint.join(" | ")
      if (highlight) row.highlight = true
      return row
    })
    .filter((row) => row.label)
}

const CASE_KEYS: Array<[keyof LeadMagnetCaseCard, string]> = [
  ["challenge", "고민"],
  ["change", "변화"],
  ["quote", "인용"],
]

/** 사례 카드 — 「## 라벨 | 과목·유형」 다음 줄에 「고민: …」「변화: …」「인용: …」 */
export function caseCardsToText(cards: readonly LeadMagnetCaseCard[] | undefined) {
  return (cards ?? [])
    .map((card) =>
      [
        `## ${card.label}${card.profile ? ` | ${card.profile}` : ""}`,
        ...CASE_KEYS.filter(([key]) => card[key]).map(([key, label]) => `${label}: ${card[key]}`),
      ].join("\n")
    )
    .join("\n\n")
}

export function textToCaseCards(value: string): LeadMagnetCaseCard[] {
  return parseBlocks(value)
    .map(({ head, lines }) => {
      const [label, ...profile] = head.split("|").map((part) => part.trim())
      const card: LeadMagnetCaseCard = { label, profile: profile.join(" | "), challenge: "", change: "" }
      for (const line of lines) {
        const match = /^(고민|변화|인용)\s*[:：]\s*(.*)$/.exec(line)
        if (!match) continue
        const key = CASE_KEYS.find(([, name]) => name === match[1])?.[0]
        if (key === "quote") card.quote = match[2].trim()
        else if (key) card[key] = match[2].trim()
      }
      return card
    })
    .filter((card) => card.label && card.change)
}

const SCRIPT_KEYS: Array<[keyof LeadMagnetScriptSample, string]> = [
  ["good", "권장"],
  ["avoid", "피하기"],
  ["why", "이유"],
]

/** 멘트 예시 — 「## 상황」 다음 줄에 「권장: …」「피하기: …」「이유: …」 */
export function scriptSamplesToText(samples: readonly LeadMagnetScriptSample[] | undefined) {
  return (samples ?? [])
    .map((sample) =>
      [`## ${sample.scenario}`, ...SCRIPT_KEYS.filter(([key]) => sample[key]).map(([key, label]) => `${label}: ${sample[key]}`)].join("\n")
    )
    .join("\n\n")
}

export function textToScriptSamples(value: string): LeadMagnetScriptSample[] {
  return parseBlocks(value)
    .map(({ head, lines }) => {
      const sample: LeadMagnetScriptSample = { scenario: head.trim(), good: "" }
      for (const line of lines) {
        const match = /^(권장|피하기|이유)\s*[:：]\s*(.*)$/.exec(line)
        if (!match) continue
        const key = SCRIPT_KEYS.find(([, name]) => name === match[1])?.[0]
        if (key === "good") sample.good = match[2].trim()
        else if (key === "avoid") sample.avoid = match[2].trim()
        else if (key === "why") sample.why = match[2].trim()
      }
      return sample
    })
    .filter((sample) => sample.scenario && sample.good)
}

function parseBlocks(value: string) {
  const blocks: Array<{ head: string; lines: string[] }> = []
  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith("## ")) {
      blocks.push({ head: line.replace(/^##\s*/, ""), lines: [] })
      continue
    }
    if (blocks.length === 0) blocks.push({ head: "", lines: [] })
    blocks[blocks.length - 1].lines.push(line)
  }
  return blocks
}

// ── 저장 직전 정리 ──────────────────────────────────────────────

/** 저장 직전 초안 정리 — 슬러그·추적값·자료 URL 기본값을 채운다(서버 normalizeLeadMagnet 과 같은 기본값). */
export function finalizeDraft(draft: LeadMagnet): LeadMagnet {
  const slug = slugify(draft.slug || draft.title) || "resource"
  const itemCount = draft.sections.reduce((total, section) => total + section.items.length, 0)
  return {
    ...draft,
    slug,
    sourceDetail: (draft.sourceDetail.trim() || `lead_magnet:${slug}`) as `lead_magnet:${string}`,
    resourceUrl: draft.resourceUrl?.trim() || `/resources/${slug}`,
    formatLabel: draft.formatLabel.trim() || `${itemCount}문항 자료`,
    salesPlaybook: draft.salesPlaybook
      ? { ...draft.salesPlaybook, intentScore: Math.max(0, Math.min(40, draft.salesPlaybook.intentScore ?? 15)) }
      : draft.salesPlaybook,
  }
}

/** 기준 대비 바뀐 맨 위 칸 이름들 — 「변경 N곳」 표시용 */
export function changedFields(draft: LeadMagnet, baseline: LeadMagnet): string[] {
  const keys = new Set([...Object.keys(draft), ...Object.keys(baseline)])
  const changed: string[] = []
  for (const key of keys) {
    const a = (draft as unknown as Record<string, unknown>)[key]
    const b = (baseline as unknown as Record<string, unknown>)[key]
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) changed.push(key)
  }
  return changed
}

// ── 링크 ───────────────────────────────────────────────────────

export function appendQueryParams(url: string, params: Record<string, string>) {
  const [withoutHash, hash = ""] = url.split("#")
  const separator = withoutHash.includes("?") ? "&" : "?"
  const query = new URLSearchParams(params).toString()
  return `${withoutHash}${separator}${query}${hash ? `#${hash}` : ""}`
}

export function toAbsoluteUrl(value: string) {
  const normalized = value.trim() || "/"
  if (/^https?:\/\//i.test(normalized)) return normalized
  if (typeof window === "undefined") return normalized
  return `${window.location.origin}${normalized.startsWith("/") ? normalized : `/${normalized}`}`
}

export function buildTrackedResourceUrl(resourceUrl: string, slug: string) {
  return appendQueryParams(toAbsoluteUrl(resourceUrl), {
    utm_source: "lead_magnet",
    utm_medium: "resource",
    utm_campaign: slug,
  })
}

export function formatPercent(value: number) {
  return `${(Math.round(value * 10) / 10).toLocaleString("ko-KR")}%`
}

export function rate(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null
}
