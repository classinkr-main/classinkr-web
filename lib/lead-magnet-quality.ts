// 자료 퍼널(리드마그넷) 품질 기준 — 순수 모듈.
//
// 어드민 편집기(클라이언트 컴포넌트)와 테스트가 같이 쓴다. 그래서 server-only를 붙이지 않고,
// 자료 배열(data/lead-magnets.json)도 가져오지 않는다 — 타입은 lib/lead-magnets에서 type으로만,
// 카운트 헬퍼는 lib/lead-magnets-helpers에서만 가져온다.
//
// 기준은 "그 칸이 실제로 어디에 보이는가"에 맞춘다(2026-11 코드 확인).
// - 블로그 신청 상자(components/blog/LeadMagnetGate.tsx): ctaCopy.eyebrow·title·buttonLabel,
//   summary(본문), formatLabel, deliverables 앞 4개. ctaCopy.body는 상자에 보이지 않는다.
// - 자료 페이지(app/resources/[slug]/page.tsx): title(h1·<title>), pdfGuide.outcome ?? summary(첫 문단),
//   summary(페이지 설명), audience, formatLabel, deliverables 전부, sections, scoreBands, actionPlan,
//   pdfGuide 사용 안내 세 칸·expertNote, sourceLinks, relatedMagnets, consultationPrep.
// - 자료실 카드(app/resources/ResourcesHubClient.tsx): title, outcome ?? summary(두 줄까지만 보임).
// - PDF: 위 내용 + storyGuide, worksheet, caseCards, scriptSamples, pdfGuide.subtitle(없으면 summary).
// checklistBullets는 공개 화면에 그려지지 않으므로 기준을 두지 않는다.
//
// area는 편집기에서 열 칸 묶음이다.
// - copy: summary, ctaCopy.*, blogTone, guideTone
// - page: title, audience, formatLabel, estimatedMinutes, pdfGuide.outcome, deliverables, consultationPrep
// - content: sections, scoreBands, redFlags, actionPlan
// - pdf: pdfGuide(outcome 제외), storyGuide, worksheet, caseCards, scriptSamples, expertVoice, sourceLinks
// - sales: salesPlaybook.*
// - routing: sourceDetail, resourceUrl, storagePath, gate, suggestedPlacements
import type { LeadMagnet } from "@/lib/lead-magnets"
import { getLeadMagnetItemCount } from "@/lib/lead-magnets-helpers"

export type LeadMagnetQualityArea = "copy" | "page" | "content" | "pdf" | "sales" | "routing"

export interface LeadMagnetQualityIssue {
  /** 기준 id(케밥 표기, 바뀌지 않는다). 같은 기준이 칸마다 여러 번 나올 수 있으니 화면 key는 id + field로 잡는다. */
  id: string
  /** fix = 비었거나 깨짐, improve = 고치면 더 잘 읽힘 */
  severity: "fix" | "improve"
  area: LeadMagnetQualityArea
  /** LeadMagnet 안의 점 경로. 배열 위치는 숫자 마디(sections.2.items). */
  field?: string
  /** 팀원용 한 문장. */
  message: string
  /** 공개 화면 이름. */
  where?: string
}

/** 5분 이하 자료는 일부러 짧게 만든 빠른 점검표다 — 분량 기준을 낮춰 잔소리하지 않는다. */
const QUICK_CHECK_MAX_MINUTES = 5

const LIMITS = {
  /** 블로그 신청 상자 본문 + 페이지 설명. 세 줄 남짓. */
  summaryChars: 120,
  /** 자료실 카드는 두 줄까지만 보여 준다. */
  outcomeChars: 80,
  /** 자료 페이지 h1 · 브라우저 탭 제목. */
  titleChars: 30,
  /** 블로그 신청 상자 제목. 좁은 화면에서 두세 줄. */
  ctaTitleChars: 32,
  /** 신청 상자 버튼 한 줄. */
  ctaButtonChars: 18,
  /** 블로그 신청 상자가 보여 주는 포함 자료 줄 수. */
  gateDeliverables: 4,
  checklistItems: 10,
  quickChecklistItems: 5,
  sections: 3,
  quickSections: 1,
  sectionItems: 3,
  quickSectionItems: 1,
  scoreBands: 2,
  actionPlan: 3,
  followUps: 3,
  placements: 2,
} as const

const WHERE = {
  gate: "블로그 신청 상자",
  page: "자료 페이지",
  hub: "자료실 카드",
  pdf: "PDF",
  download: "자료 받기",
} as const

export const LEAD_MAGNET_QUALITY_RULES: ReadonlyArray<{ id: string; label: string }> = [
  // copy
  { id: "summary-missing", label: "요약 채우기" },
  { id: "summary-too-long", label: `요약 ${LIMITS.summaryChars}자 안쪽` },
  { id: "cta-copy-incomplete", label: "신청 상자 문구 네 칸 채우기" },
  { id: "cta-title-too-long", label: `신청 상자 제목 ${LIMITS.ctaTitleChars}자 안쪽` },
  { id: "cta-button-too-long", label: `버튼 문구 ${LIMITS.ctaButtonChars}자 안쪽` },
  // page
  { id: "title-missing", label: "제목 채우기" },
  { id: "title-too-long", label: `제목 ${LIMITS.titleChars}자 안쪽` },
  { id: "outcome-missing", label: "자료 페이지 첫 문단 채우기" },
  { id: "outcome-too-long", label: `첫 문단 ${LIMITS.outcomeChars}자 안쪽` },
  { id: "audience-missing", label: "추천 대상 채우기" },
  { id: "format-label-missing", label: "포맷 라벨 채우기" },
  { id: "item-count-mismatch", label: "적힌 문항 수와 실제 문항 수 일치" },
  { id: "deliverables-too-few", label: `포함 자료 ${LIMITS.gateDeliverables}개 이상` },
  { id: "consultation-prep-missing", label: "상담 전 준비물 채우기" },
  // content
  { id: "checklist-items-too-few", label: `점검 문항 ${LIMITS.checklistItems}개 이상(빠른 점검 ${LIMITS.quickChecklistItems}개)` },
  { id: "sections-too-few", label: `본문 섹션 ${LIMITS.sections}개 이상(빠른 점검 ${LIMITS.quickSections}개)` },
  { id: "section-items-too-few", label: `섹션마다 문항 ${LIMITS.sectionItems}개 이상` },
  { id: "section-description-missing", label: "섹션 설명 채우기" },
  { id: "score-bands-too-few", label: `점수 해석 ${LIMITS.scoreBands}구간 이상` },
  { id: "score-range-mismatch", label: "점수 구간이 0점부터 문항 수까지 빈틈없이 이어짐" },
  { id: "action-plan-too-few", label: `실행 플랜 ${LIMITS.actionPlan}단계 이상` },
  { id: "duplicate-lines", label: "한 목록 안에 같은 줄 없음" },
  { id: "checklist-item-repeated", label: "다른 섹션에 같은 문항 없음" },
  // pdf
  { id: "pdf-subtitle-missing", label: "PDF 표지 부제 채우기" },
  { id: "pdf-usage-incomplete", label: "사용 안내 세 칸 채우기" },
  { id: "expert-note-missing", label: "사용 안내 머리글 채우기" },
  { id: "unknown-resource-slug", label: "없는 자료로 가는 연결 없음" },
  { id: "related-self", label: "자기 자신으로 가는 연결 없음" },
  { id: "related-duplicate-link", label: "함께 볼 자료와 상담 버튼이 같은 자료로 가지 않음" },
  { id: "source-links-missing", label: "참고 링크 1개 이상" },
  { id: "link-href-invalid", label: "링크 주소 형식" },
  // sales
  { id: "first-response-missing", label: "첫 응대 문구 채우기" },
  { id: "follow-up-too-few", label: `후속 시퀀스 ${LIMITS.followUps}단계 이상` },
  // routing
  { id: "resource-url-missing", label: "자료 URL 채우기" },
  { id: "login-gate-storage-missing", label: "로그인 게이트는 비공개 파일 경로 연결" },
  { id: "source-detail-mismatch", label: "추적값 기본형 유지" },
  { id: "placements-too-few", label: `추천 배치 ${LIMITS.placements}곳 이상` },
]

const RULE_ORDER = new Map(LEAD_MAGNET_QUALITY_RULES.map((rule, index) => [rule.id, index]))

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function lineKey(value: unknown) {
  return text(value).replace(/\s+/g, " ")
}

function charCount(value: string) {
  return Array.from(value).length
}

/** 같은 줄이 두 번 이상 나온 값(정리한 형태) 목록. 빈 줄은 세지 않는다. */
function repeatedLines(values: readonly unknown[]) {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const value of values) {
    const key = lineKey(value)
    if (!key) continue
    if (seen.has(key)) repeated.add(key)
    seen.add(key)
  }
  return Array.from(repeated)
}

function preview(value: string, max = 24) {
  const chars = Array.from(value)
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : value
}

/** 사이트 안 경로(/...), http(s), mailto, tel만 링크로 인정한다. */
function isValidHref(href: string) {
  if (!href) return false
  if (/\s/.test(href)) return false
  if (href.startsWith("/")) return !href.startsWith("//")
  if (/^mailto:[^@]+@[^@]+$/i.test(href)) return true
  if (/^tel:\+?[\d-]+$/i.test(href)) return true
  if (!/^https?:\/\//i.test(href)) return false
  try {
    const url = new URL(href)
    return Boolean(url.hostname) && url.hostname.includes(".")
  } catch {
    return false
  }
}

function resourceSlugFromHref(href: string) {
  const match = /^\/resources\/([^/?#]+)/.exec(href)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

/** "0-12점", "13~21점", "0~2개" → [0, 12]. 숫자가 없으면 null. */
function parseRange(range: string): [number, number] | null {
  const numbers = range.match(/\d+/g)
  if (!numbers) return null
  const first = Number(numbers[0])
  const last = Number(numbers[numbers.length - 1])
  return [first, last]
}

const ITEM_COUNT_PATTERN = /(\d+)\s*(?:개\s*)?문항/g

function mentionedItemCounts(value: string) {
  return Array.from(value.matchAll(ITEM_COUNT_PATTERN), (match) => Number(match[1]))
}

interface RuleContext {
  magnet: LeadMagnet
  push: (issue: LeadMagnetQualityIssue) => void
  isQuick: boolean
  itemCount: number
  knownSlugs?: ReadonlySet<string>
}

function checkCopy({ magnet, push }: RuleContext) {
  const summary = text(magnet.summary)
  if (!summary) {
    push({
      id: "summary-missing",
      severity: "fix",
      area: "copy",
      field: "summary",
      message: "자료 요약이 비어 있습니다. 블로그 신청 상자 본문과 페이지 설명이 빈 채로 나갑니다.",
      where: WHERE.gate,
    })
  } else if (charCount(summary) > LIMITS.summaryChars) {
    push({
      id: "summary-too-long",
      severity: "improve",
      area: "copy",
      field: "summary",
      message: `요약이 ${charCount(summary)}자입니다. 블로그 신청 상자 본문과 자료 페이지 설명에 함께 쓰여서, 길면 상자가 길어지고 설명은 잘립니다. ${LIMITS.summaryChars}자 안쪽을 권합니다.`,
      where: WHERE.gate,
    })
  }

  const cta = magnet.ctaCopy ?? { eyebrow: "", title: "", body: "", buttonLabel: "" }
  const ctaFields = [
    { key: "eyebrow", label: "머리말" },
    { key: "title", label: "제목" },
    { key: "body", label: "본문" },
    { key: "buttonLabel", label: "버튼 문구" },
  ] as const
  const emptyCta = ctaFields.filter((item) => !text(cta[item.key]))
  if (emptyCta.length > 0) {
    push({
      id: "cta-copy-incomplete",
      severity: "fix",
      area: "copy",
      field: `ctaCopy.${emptyCta[0].key}`,
      message: `신청 상자 ${emptyCta.map((item) => item.label).join("·")}이 비어 있습니다. 네 칸을 모두 채워 주세요.`,
      where: WHERE.gate,
    })
  }

  const ctaTitle = text(cta.title)
  if (ctaTitle && charCount(ctaTitle) > LIMITS.ctaTitleChars) {
    push({
      id: "cta-title-too-long",
      severity: "improve",
      area: "copy",
      field: "ctaCopy.title",
      message: `신청 상자 제목이 ${charCount(ctaTitle)}자입니다. 좁은 화면에서 서너 줄로 꺾이니 ${LIMITS.ctaTitleChars}자 안쪽을 권합니다.`,
      where: WHERE.gate,
    })
  }

  const button = text(cta.buttonLabel)
  if (button && charCount(button) > LIMITS.ctaButtonChars) {
    push({
      id: "cta-button-too-long",
      severity: "improve",
      area: "copy",
      field: "ctaCopy.buttonLabel",
      message: `버튼 문구가 ${charCount(button)}자입니다. 버튼 한 줄을 넘기지 않게 ${LIMITS.ctaButtonChars}자 안쪽으로 줄여 주세요.`,
      where: WHERE.gate,
    })
  }
}

function checkPage({ magnet, push, itemCount }: RuleContext) {
  const title = text(magnet.title)
  if (!title) {
    push({
      id: "title-missing",
      severity: "fix",
      area: "page",
      field: "title",
      message: "자료 제목이 비어 있습니다.",
      where: WHERE.page,
    })
  } else if (charCount(title) > LIMITS.titleChars) {
    push({
      id: "title-too-long",
      severity: "improve",
      area: "page",
      field: "title",
      message: `제목이 ${charCount(title)}자입니다. 자료 페이지 큰 제목과 브라우저 탭에서 잘 읽히게 ${LIMITS.titleChars}자 안쪽을 권합니다.`,
      where: WHERE.page,
    })
  }

  const outcome = text(magnet.pdfGuide?.outcome)
  if (!outcome) {
    push({
      id: "outcome-missing",
      severity: "fix",
      area: "page",
      field: "pdfGuide.outcome",
      message: "자료 페이지 첫 문단(이 자료로 얻는 것)이 비어 있습니다. 지금은 긴 요약이 대신 나갑니다.",
      where: WHERE.page,
    })
  } else if (charCount(outcome) > LIMITS.outcomeChars) {
    push({
      id: "outcome-too-long",
      severity: "improve",
      area: "page",
      field: "pdfGuide.outcome",
      message: `첫 문단이 ${charCount(outcome)}자입니다. 자료실 카드는 두 줄까지만 보여서 좁은 화면에서 뒷부분이 잘립니다. ${LIMITS.outcomeChars}자 안쪽을 권합니다.`,
      where: WHERE.hub,
    })
  }

  if (!text(magnet.audience)) {
    push({
      id: "audience-missing",
      severity: "fix",
      area: "page",
      field: "audience",
      message: "추천 대상이 비어 있습니다. 자료 페이지에 '추천 대상'만 빈 채로 보입니다.",
      where: WHERE.page,
    })
  }

  if (!text(magnet.formatLabel)) {
    push({
      id: "format-label-missing",
      severity: "fix",
      area: "page",
      field: "formatLabel",
      message: "포맷 라벨이 비어 있습니다. 신청 상자, 자료실 카드, 자료 페이지에 자료 구성이 안 보입니다.",
      where: WHERE.page,
    })
  }

  // 공개 문구에 적힌 "N문항"이 실제 문항 수와 다르면 같은 화면에 두 숫자가 나란히 보인다.
  if (itemCount > 0) {
    const countFields: Array<{ field: string; value: string; area: LeadMagnetQualityArea; where: string }> = [
      { field: "title", value: text(magnet.title), area: "page", where: WHERE.page },
      { field: "formatLabel", value: text(magnet.formatLabel), area: "page", where: WHERE.page },
      { field: "summary", value: text(magnet.summary), area: "copy", where: WHERE.gate },
      { field: "pdfGuide.outcome", value: text(magnet.pdfGuide?.outcome), area: "page", where: WHERE.page },
      { field: "ctaCopy.title", value: text(magnet.ctaCopy?.title), area: "copy", where: WHERE.gate },
      { field: "ctaCopy.body", value: text(magnet.ctaCopy?.body), area: "copy", where: WHERE.gate },
      { field: "ctaCopy.buttonLabel", value: text(magnet.ctaCopy?.buttonLabel), area: "copy", where: WHERE.gate },
      { field: "deliverables", value: list(magnet.deliverables).map(text).join("\n"), area: "page", where: WHERE.page },
      { field: "pdfGuide.subtitle", value: text(magnet.pdfGuide?.subtitle), area: "pdf", where: WHERE.pdf },
      { field: "pdfGuide.howToUse", value: list(magnet.pdfGuide?.howToUse).map(text).join("\n"), area: "pdf", where: WHERE.page },
    ]
    for (const item of countFields) {
      const wrong = mentionedItemCounts(item.value).find((count) => count !== itemCount)
      if (wrong === undefined) continue
      push({
        id: "item-count-mismatch",
        severity: "fix",
        area: item.area,
        field: item.field,
        message: `문구에는 ${wrong}문항이라고 적혀 있는데 실제 점검 문항은 ${itemCount}개입니다. 숫자를 맞춰 주세요.`,
        where: item.where,
      })
    }
  }

  const deliverables = list(magnet.deliverables).map(text).filter(Boolean)
  if (deliverables.length === 0) {
    push({
      id: "deliverables-too-few",
      severity: "fix",
      area: "page",
      field: "deliverables",
      message: "포함 자료가 비어 있습니다. 신청 상자와 '이 PDF에 담긴 것'이 빈 채로 나갑니다.",
      where: WHERE.gate,
    })
  } else if (deliverables.length < LIMITS.gateDeliverables) {
    push({
      id: "deliverables-too-few",
      severity: "improve",
      area: "page",
      field: "deliverables",
      message: `포함 자료가 ${deliverables.length}개입니다. 블로그 신청 상자는 ${LIMITS.gateDeliverables}줄까지 보여 주니 ${LIMITS.gateDeliverables}개 이상 적어 주세요.`,
      where: WHERE.gate,
    })
  }

  if (list(magnet.consultationPrep).map(text).filter(Boolean).length === 0) {
    push({
      id: "consultation-prep-missing",
      severity: "fix",
      area: "page",
      field: "consultationPrep",
      message: "상담 전 준비물이 비어 있습니다. 자료 페이지 마지막 상담 안내 상자가 빈 채로 보입니다.",
      where: WHERE.page,
    })
  }
}

function checkContent({ magnet, push, isQuick, itemCount }: RuleContext) {
  const sections = list(magnet.sections) as LeadMagnet["sections"]
  const minItems = isQuick ? LIMITS.quickChecklistItems : LIMITS.checklistItems
  if (itemCount === 0) {
    push({
      id: "checklist-items-too-few",
      severity: "fix",
      area: "content",
      field: "sections",
      message: "점검 문항이 하나도 없습니다. 자료 페이지 '전체 점검 문항'이 빈 채로 나갑니다.",
      where: WHERE.page,
    })
  } else if (itemCount < minItems) {
    push({
      id: "checklist-items-too-few",
      severity: "improve",
      area: "content",
      field: "sections",
      message: isQuick
        ? `빠른 점검표라도 문항이 ${itemCount}개뿐입니다. ${minItems}개 이상이면 판단 근거가 섭니다.`
        : `점검 문항이 ${itemCount}개입니다. ${minItems}개 이상이면 진단 자료로서 무게가 섭니다.`,
      where: WHERE.page,
    })
  }

  const minSections = isQuick ? LIMITS.quickSections : LIMITS.sections
  if (sections.length > 0 && sections.length < minSections) {
    push({
      id: "sections-too-few",
      severity: "improve",
      area: "content",
      field: "sections",
      message: `본문 섹션이 ${sections.length}개입니다. ${minSections}개 이상으로 나누면 낮게 나온 영역이 잘 보입니다.`,
      where: WHERE.page,
    })
  }

  const minSectionItems = isQuick ? LIMITS.quickSectionItems : LIMITS.sectionItems
  sections.forEach((section, index) => {
    const count = list(section?.items).map(text).filter(Boolean).length
    const name = text(section?.title) || `${index + 1}번째 섹션`
    if (count < minSectionItems) {
      push({
        id: "section-items-too-few",
        severity: "improve",
        area: "content",
        field: `sections.${index}.items`,
        message: `'${preview(name)}' 섹션 문항이 ${count}개입니다. ${minSectionItems}개 이상이면 영역 점수가 의미를 가집니다.`,
        where: WHERE.page,
      })
    }
    if (!text(section?.description)) {
      push({
        id: "section-description-missing",
        severity: "improve",
        area: "content",
        field: `sections.${index}.description`,
        message: `'${preview(name)}' 섹션 설명이 비어 있습니다. 자료 페이지 섹션 제목 아래 한 줄이 빕니다.`,
        where: WHERE.page,
      })
    }
  })

  const bands = list(magnet.scoreBands) as LeadMagnet["scoreBands"]
  if (bands.length === 0) {
    push({
      id: "score-bands-too-few",
      severity: "fix",
      area: "content",
      field: "scoreBands",
      message: "점수 해석이 비어 있습니다. 자료 페이지 '점수 해석'이 빈 채로 나갑니다.",
      where: WHERE.page,
    })
  } else if (bands.length < LIMITS.scoreBands) {
    push({
      id: "score-bands-too-few",
      severity: "improve",
      area: "content",
      field: "scoreBands",
      message: `점수 해석 구간이 ${bands.length}개입니다. ${LIMITS.scoreBands}개 이상 준비해 주세요.`,
      where: WHERE.page,
    })
  }

  // 페이지 안내문은 "문항마다 1점/0점"이다 — 구간은 0점에서 시작해 문항 수에서 끝나야 한다.
  const ranges = bands.map((band) => parseRange(text(band?.range)))
  if (itemCount > 0 && bands.length > 0 && ranges.every((range) => range !== null)) {
    const parsed = ranges as Array<[number, number]>
    let problem = ""
    if (parsed[0][0] !== 0) {
      problem = `첫 구간이 ${parsed[0][0]}점에서 시작합니다. 0점부터 시작해 주세요.`
    } else if (parsed[parsed.length - 1][1] !== itemCount) {
      problem = `마지막 구간이 ${parsed[parsed.length - 1][1]}점에서 끝나는데 문항은 ${itemCount}개입니다.`
    } else {
      for (let index = 1; index < parsed.length; index += 1) {
        if (parsed[index][0] !== parsed[index - 1][1] + 1) {
          problem = `'${text(bands[index - 1].range)}' 다음 구간이 '${text(bands[index].range)}'입니다. 빈틈이나 겹침 없이 이어 주세요.`
          break
        }
      }
    }
    if (problem) {
      push({
        id: "score-range-mismatch",
        severity: "fix",
        area: "content",
        field: "scoreBands",
        message: `점수 구간이 문항 수와 맞지 않습니다. ${problem}`,
        where: WHERE.page,
      })
    }
  }

  const plan = list(magnet.actionPlan)
  if (plan.length === 0) {
    push({
      id: "action-plan-too-few",
      severity: "fix",
      area: "content",
      field: "actionPlan",
      message: "실행 플랜이 비어 있습니다. 자료 페이지 '7일 실행 플랜'이 빈 채로 나갑니다.",
      where: WHERE.page,
    })
  } else if (plan.length < LIMITS.actionPlan) {
    push({
      id: "action-plan-too-few",
      severity: "improve",
      area: "content",
      field: "actionPlan",
      message: `실행 플랜이 ${plan.length}단계입니다. ${LIMITS.actionPlan}단계 이상이면 상담으로 이어지기 쉽습니다.`,
      where: WHERE.page,
    })
  }

  // 다른 섹션에 같은 문항이 있으면 독자는 같은 질문을 두 번 채점한다.
  const ownerByItem = new Map<string, number>()
  const repeatedAcross = new Set<string>()
  sections.forEach((section, index) => {
    for (const item of list(section?.items)) {
      const key = lineKey(item)
      if (!key) continue
      const owner = ownerByItem.get(key)
      if (owner !== undefined && owner !== index) repeatedAcross.add(key)
      if (owner === undefined) ownerByItem.set(key, index)
    }
  })
  if (repeatedAcross.size > 0) {
    const first = Array.from(repeatedAcross)[0]
    push({
      id: "checklist-item-repeated",
      severity: "improve",
      area: "content",
      field: `sections.${ownerByItem.get(first)}.items`,
      message: `같은 문항이 다른 섹션에도 있습니다('${preview(first)}' 외 ${repeatedAcross.size - 1}개). 한 곳에만 두세요.`,
      where: WHERE.page,
    })
  }
}

/** 공개 화면이 줄 글을 그대로 key로 쓰는 목록들 — 같은 줄이 두 번이면 한 줄이 빠지거나 반복돼 보인다. */
function keyedLists(magnet: LeadMagnet) {
  const lists: Array<{ field: string; values: readonly unknown[]; area: LeadMagnetQualityArea; where: string }> = [
    { field: "deliverables", values: list(magnet.deliverables), area: "page", where: WHERE.page },
    { field: "consultationPrep", values: list(magnet.consultationPrep), area: "page", where: WHERE.page },
    { field: "redFlags", values: list(magnet.redFlags), area: "content", where: WHERE.page },
    {
      field: "sections",
      values: list(magnet.sections).map((section) => (section as LeadMagnet["sections"][number])?.title),
      area: "content",
      where: WHERE.page,
    },
    {
      field: "scoreBands",
      values: list(magnet.scoreBands).map((band) => (band as LeadMagnet["scoreBands"][number])?.range),
      area: "content",
      where: WHERE.page,
    },
    {
      field: "actionPlan",
      values: list(magnet.actionPlan).map((step) => (step as LeadMagnet["actionPlan"][number])?.day),
      area: "content",
      where: WHERE.page,
    },
    { field: "pdfGuide.bestUsedWhen", values: list(magnet.pdfGuide?.bestUsedWhen), area: "pdf", where: WHERE.page },
    { field: "pdfGuide.howToUse", values: list(magnet.pdfGuide?.howToUse), area: "pdf", where: WHERE.page },
    { field: "pdfGuide.discussionPrompts", values: list(magnet.pdfGuide?.discussionPrompts), area: "pdf", where: WHERE.page },
    { field: "pdfGuide.relatedMagnets", values: list(magnet.pdfGuide?.relatedMagnets), area: "pdf", where: WHERE.page },
    { field: "storyGuide.beats", values: list(magnet.storyGuide?.beats), area: "pdf", where: WHERE.page },
    { field: "caseCards", values: list(magnet.caseCards).map((card) => text((card as { label?: unknown })?.label)), area: "pdf", where: WHERE.page },
    {
      field: "scriptSamples",
      values: list(magnet.scriptSamples).map((sample) => text((sample as { scenario?: unknown })?.scenario)),
      area: "pdf",
      where: WHERE.page,
    },
    { field: "worksheet.columns", values: list(magnet.worksheet?.columns), area: "pdf", where: WHERE.page },
    {
      field: "worksheet.rows",
      values: list(magnet.worksheet?.rows).map((row) => text((row as { label?: unknown })?.label)),
      area: "pdf",
      where: WHERE.page,
    },
  ]
  list(magnet.sections).forEach((section, index) => {
    lists.push({
      field: `sections.${index}.items`,
      values: list((section as LeadMagnet["sections"][number])?.items),
      area: "content",
      where: WHERE.page,
    })
  })
  list(magnet.actionPlan).forEach((step, index) => {
    lists.push({
      field: `actionPlan.${index}.tasks`,
      values: list((step as LeadMagnet["actionPlan"][number])?.tasks),
      area: "content",
      where: WHERE.page,
    })
  })
  return lists
}

function checkDuplicates({ magnet, push }: RuleContext) {
  for (const item of keyedLists(magnet)) {
    const repeated = repeatedLines(item.values)
    if (repeated.length === 0) continue
    push({
      id: "duplicate-lines",
      severity: "fix",
      area: item.area,
      field: item.field,
      message: `같은 줄이 두 번 들어 있습니다('${preview(repeated[0])}'). 하나만 남겨 주세요.`,
      where: item.where,
    })
  }
}

function checkPdf({ magnet, push, knownSlugs }: RuleContext) {
  const guide = magnet.pdfGuide
  if (guide) {
    if (!text(guide.subtitle)) {
      push({
        id: "pdf-subtitle-missing",
        severity: "improve",
        area: "pdf",
        field: "pdfGuide.subtitle",
        message: "PDF 표지 부제가 비어 있습니다. 지금은 요약이 표지에 대신 들어갑니다.",
        where: WHERE.pdf,
      })
    }

    const usage = [
      { key: "bestUsedWhen", label: "언제 유용한가" },
      { key: "howToUse", label: "사용 순서" },
      { key: "discussionPrompts", label: "상담 질문" },
    ] as const
    for (const item of usage) {
      if (list(guide[item.key]).map(text).filter(Boolean).length > 0) continue
      push({
        id: "pdf-usage-incomplete",
        severity: "fix",
        area: "pdf",
        field: `pdfGuide.${item.key}`,
        message: `'${item.label}' 칸이 비어 있습니다. 자료 페이지 사용 안내에 제목만 남습니다.`,
        where: WHERE.page,
      })
    }

    if (!text(guide.expertNote)) {
      push({
        id: "expert-note-missing",
        severity: "improve",
        area: "pdf",
        field: "pdfGuide.expertNote",
        message: "사용 안내 머리글이 비어 있습니다. 자료 페이지와 PDF 표지의 안내 문단이 빕니다.",
        where: WHERE.page,
      })
    }

    const related = list(guide.relatedMagnets).map(text).filter(Boolean)
    if (related.includes(text(magnet.slug))) {
      push({
        id: "related-self",
        severity: "fix",
        area: "pdf",
        field: "pdfGuide.relatedMagnets",
        message: "함께 볼 자료에 이 자료 자신이 들어 있습니다. 빼 주세요.",
        where: WHERE.page,
      })
    }
    if (knownSlugs) {
      const unknown = related.filter((slug) => !knownSlugs.has(slug))
      if (unknown.length > 0) {
        push({
          id: "unknown-resource-slug",
          severity: "fix",
          area: "pdf",
          field: "pdfGuide.relatedMagnets",
          message: `함께 볼 자료 중 없는 자료가 있습니다(${unknown.join(", ")}). 자료 페이지와 PDF에서 조용히 빠집니다.`,
          where: WHERE.page,
        })
      }
    }
  }

  const sourceLinks = list(magnet.sourceLinks) as NonNullable<LeadMagnet["sourceLinks"]>
  if (sourceLinks.length < 1) {
    push({
      id: "source-links-missing",
      severity: "improve",
      area: "pdf",
      field: "sourceLinks",
      message: "자료 안 참고 링크가 없습니다. 1개 이상 연결하면 읽은 뒤 다음 행동이 분명해집니다.",
      where: WHERE.page,
    })
  }

  const links: Array<{ field: string; label: unknown; href: unknown }> = [
    ...sourceLinks.map((link, index) => ({ field: `sourceLinks.${index}`, label: link?.label, href: link?.href })),
    ...list(guide?.consultationCtas).map((link, index) => ({
      field: `pdfGuide.consultationCtas.${index}`,
      label: (link as { label?: unknown })?.label,
      href: (link as { href?: unknown })?.href,
    })),
  ]
  const ownSlug = text(magnet.slug)
  const relatedSlugs = new Set(list(guide?.relatedMagnets).map(text).filter(Boolean))
  for (const link of links) {
    const href = text(link.href)
    const name = text(link.label) || "이름 없는 링크"
    if (!text(link.label)) {
      push({
        id: "link-href-invalid",
        severity: "fix",
        area: "pdf",
        field: `${link.field}.label`,
        message: "링크 이름이 비어 있습니다. 이름 없는 링크는 화면에서 빠집니다.",
        where: WHERE.page,
      })
    }
    if (!isValidHref(href)) {
      push({
        id: "link-href-invalid",
        severity: "fix",
        area: "pdf",
        field: `${link.field}.href`,
        message: href
          ? `'${preview(name)}' 링크 주소 형식이 맞지 않습니다. 사이트 안은 /로, 밖은 https://로 시작해 주세요.`
          : `'${preview(name)}' 링크 주소가 비어 있습니다.`,
        where: WHERE.page,
      })
      continue
    }
    const slug = resourceSlugFromHref(href)
    if (!slug) continue
    if (slug === ownSlug) {
      push({
        id: "related-self",
        severity: "fix",
        area: "pdf",
        field: `${link.field}.href`,
        message: `'${preview(name)}' 링크가 지금 보고 있는 이 자료로 돌아옵니다. 다른 자료로 바꾸거나 빼 주세요.`,
        where: WHERE.page,
      })
    } else if (knownSlugs && !knownSlugs.has(slug)) {
      push({
        id: "unknown-resource-slug",
        severity: "fix",
        area: "pdf",
        field: `${link.field}.href`,
        message: `'${preview(name)}' 링크가 없는 자료(${slug})로 갑니다. 누르면 찾을 수 없는 페이지가 열립니다.`,
        where: WHERE.page,
      })
    } else if (link.field.startsWith("pdfGuide.consultationCtas.") && relatedSlugs.has(slug)) {
      // 자료 페이지 '다음에 함께 보면 좋은 자료'와 PDF 다음 단계는 함께 볼 자료와 상담 버튼을 한 묶음으로 그린다.
      push({
        id: "related-duplicate-link",
        severity: "improve",
        area: "pdf",
        field: `${link.field}.href`,
        message: `'${preview(name)}' 버튼이 함께 볼 자료에 이미 있는 자료로 갑니다. 자료 페이지 끝과 PDF에 같은 자료가 두 번 보입니다.`,
        where: WHERE.page,
      })
    }
  }
}

function checkSales({ magnet, push }: RuleContext) {
  if (!text(magnet.salesPlaybook?.firstResponse)) {
    push({
      id: "first-response-missing",
      severity: "fix",
      area: "sales",
      field: "salesPlaybook.firstResponse",
      message: "자료 신청 뒤 첫 응대 문구가 비어 있습니다. 전화·카카오 첫 문장을 적어 두세요.",
    })
  }
  const followUps = list(magnet.salesPlaybook?.followUpSequence).length
  if (followUps < LIMITS.followUps) {
    push({
      id: "follow-up-too-few",
      severity: "improve",
      area: "sales",
      field: "salesPlaybook.followUpSequence",
      message: `후속 시퀀스가 ${followUps}단계입니다. ${LIMITS.followUps}단계 이상이면 리드가 덜 샙니다.`,
    })
  }
}

function checkRouting({ magnet, push }: RuleContext) {
  const resourceUrl = text(magnet.resourceUrl)
  if (!resourceUrl) {
    push({
      id: "resource-url-missing",
      severity: "fix",
      area: "routing",
      field: "resourceUrl",
      message: "신청 뒤 열 자료 URL이 비어 있습니다.",
      where: WHERE.download,
    })
  } else if (!isValidHref(resourceUrl)) {
    push({
      id: "link-href-invalid",
      severity: "fix",
      area: "routing",
      field: "resourceUrl",
      message: "자료 URL 형식이 맞지 않습니다. 사이트 안은 /로, 밖은 https://로 시작해 주세요.",
      where: WHERE.download,
    })
  }

  if (magnet.gate === "login" && !text(magnet.storagePath)) {
    push({
      id: "login-gate-storage-missing",
      severity: "fix",
      area: "routing",
      field: "storagePath",
      message: "로그인 게이트 자료인데 비공개 파일 경로가 없습니다. 공개 링크로 열리지 않게 파일 경로를 연결해 주세요.",
      where: WHERE.download,
    })
  }

  const expected = `lead_magnet:${text(magnet.slug)}`
  if (text(magnet.sourceDetail) !== expected) {
    push({
      id: "source-detail-mismatch",
      severity: "fix",
      area: "routing",
      field: "sourceDetail",
      message: `추적값이 기본값과 다릅니다(기본값: ${expected}). 리드가 이 자료로 묶이지 않을 수 있습니다.`,
    })
  }

  const placements = list(magnet.suggestedPlacements).map(text).filter(Boolean).length
  if (placements < LIMITS.placements) {
    push({
      id: "placements-too-few",
      severity: "improve",
      area: "routing",
      field: "suggestedPlacements",
      message: `추천 배치가 ${placements}곳입니다. ${LIMITS.placements}곳 이상 적어 두면 어디에 붙일지 정하기 쉽습니다.`,
    })
  }
}

/**
 * 자료 한 건의 품질 점검 결과. fix가 먼저, 같은 등급 안에서는 LEAD_MAGNET_QUALITY_RULES 순서다.
 * knownSlugs(지금 있는 자료 slug 전부)를 넘기면 없는 자료로 가는 연결도 본다.
 */
export function getLeadMagnetQualityIssues(
  magnet: LeadMagnet,
  options?: { knownSlugs?: ReadonlySet<string> }
): LeadMagnetQualityIssue[] {
  const issues: LeadMagnetQualityIssue[] = []
  const minutes = Number(magnet.estimatedMinutes)
  const context: RuleContext = {
    magnet,
    push: (issue) => issues.push(issue),
    isQuick: Number.isFinite(minutes) && minutes > 0 && minutes <= QUICK_CHECK_MAX_MINUTES,
    // 편집 중인 값은 정리 전이라 items가 빠진 섹션이 올 수 있다.
    itemCount: getLeadMagnetItemCount({
      ...magnet,
      sections: (list(magnet.sections) as LeadMagnet["sections"]).map((section) => ({
        ...section,
        items: list(section?.items) as string[],
      })),
    }),
    knownSlugs: options?.knownSlugs,
  }

  checkCopy(context)
  checkPage(context)
  checkContent(context)
  checkDuplicates(context)
  checkPdf(context)
  checkSales(context)
  checkRouting(context)

  const severityRank = (issue: LeadMagnetQualityIssue) => (issue.severity === "fix" ? 0 : 1)
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort(
      (a, b) =>
        severityRank(a.issue) - severityRank(b.issue) ||
        (RULE_ORDER.get(a.issue.id) ?? 0) - (RULE_ORDER.get(b.issue.id) ?? 0) ||
        a.index - b.index
    )
    .map(({ issue }) => issue)
}
