// 생성 digest 가이드(lib/cs-figma-guides.generated.ts) 공개 게이트 — 초안.
//
// 이번 단계는 "규칙과 제외 후보 목록"만 만든다. 이 모듈은 아직 공개 목록(CS_FIGMA_GUIDES)이나
// 검색·챗봇에 연결하지 않는다. 대량 제외·삭제는 승인 후에 INTERNAL_ONLY 목록이나 생성기에 반영한다.
// 보고서: `DIGEST_GATE_REPORT=1 npx vitest run scripts/report-digest-publish-gate.test.ts`
// → docs/active/docs-digest-publish-gate-draft.md

import type { CsFigmaGuide } from "@/lib/cs-figma-guides"

/** 문서 단위 — 공개 목록에서 빼는 후보 */
export type DigestExcludeReason =
  | "internal_only" // 이미 INTERNAL_ONLY 목록에 있음(현재도 비공개)
  | "test_title" // 테스트·임시·샘플 제목
  | "empty_capture" // 빈 이미지·내용 없음
  | "dated_title" // 특정 날짜에 묶인 공지성 제목(~4/23, 6/16 (화))
  | "non_guide_title" // 질문·지시문이 제목(“Q :”, “따라와 주세요!”)
  | "screen_only" // 단계 없이 화면 설명만 있음
  | "internal_tool" // 번역 툴·CS 진단 화면 등 고객용이 아님
  | "duplicate_title" // 같은 제목(괄호 속 기기·화면 구분 포함)의 앞선 digest 가 있음 → 대표 문서로 통합 후보

/** 섹션 단위 — 공개 전 고쳐야 하는 부분(문서는 남김) */
export type DigestSectionFix =
  | "raw_capture_section" // “CS 주의사항과 원본 캡처” 섹션(원본 파일명·주석)
  | "capture_annotation" // “빨간 박스”, “스텝 N:” 같은 캡처 판독 문장이 본문에 남음
  | "typo" // 생성 과정 오타(요요합니다, 설졍 등)

export interface DigestGateResult {
  slug: string
  docCategory: CsFigmaGuide["docCategory"]
  title: string
  exclude: DigestExcludeReason[]
  sectionFixes: DigestSectionFix[]
  duplicateOf?: string
}

const TEST_TITLE = /테스트|임시|샘플|untitled|제목\s*없음|복사본|^\s*test\b/i
const EMPTY_CAPTURE = /빈\s*이미지|내용\s*없음/
const DATED_TITLE = /(?:^|[\s~(])\d{1,2}\/\d{1,2}(?:\s*\([월화수목금토일]\))?/
const NON_GUIDE_TITLE = /^\s*Q\s*[:：]|\?\s*$|따라와\s*주세요|^\s*\d+\.\s/
const SCREEN_ONLY = /순수\s*UI\s*스크린샷|별도의\s*안내\s*문구나\s*단계/
const INTERNAL_TOOL = /Crowdin|CS\s*팀|품질\s*진단|데이터\s*로그\s*보고|내부\s*비밀번호|OMR\s*CS/i
const RAW_CAPTURE_SECTION_TITLE = /CS\s*주의사항과\s*원본\s*캡처/
const CAPTURE_ANNOTATION = /빨간\s*(?:박스|글씨)|화살표\s*주석|강조됨|스텝\s*\d+\s*[:：]|썸네일/
const TYPO = /요요합니다|주세요요|설졍/

export function normalizeDigestTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/설졍/g, "설정")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function evaluateDigestGuide(
  guide: CsFigmaGuide,
  options: { internalOnly?: ReadonlySet<string> } = {}
): DigestGateResult {
  const exclude: DigestExcludeReason[] = []
  const sectionFixes: DigestSectionFix[] = []
  const deepDiveText = guide.deepDive.map((d) => [d.title, d.body, ...d.checks].join("\n")).join("\n")

  if (options.internalOnly?.has(guide.docSlug)) exclude.push("internal_only")
  if (TEST_TITLE.test(guide.title)) exclude.push("test_title")
  if (EMPTY_CAPTURE.test(guide.title) || EMPTY_CAPTURE.test(guide.summary)) exclude.push("empty_capture")
  if (DATED_TITLE.test(guide.title)) exclude.push("dated_title")
  if (NON_GUIDE_TITLE.test(guide.title)) exclude.push("non_guide_title")
  if (guide.steps.length === 0 || SCREEN_ONLY.test(guide.summary)) exclude.push("screen_only")
  if (INTERNAL_TOOL.test(guide.title) || INTERNAL_TOOL.test(guide.summary)) exclude.push("internal_tool")

  if (guide.deepDive.some((d) => RAW_CAPTURE_SECTION_TITLE.test(d.title))) sectionFixes.push("raw_capture_section")
  const publicSectionText = guide.deepDive
    .filter((d) => !RAW_CAPTURE_SECTION_TITLE.test(d.title))
    .map((d) => [d.body, ...d.checks].join("\n"))
    .join("\n")
  if (CAPTURE_ANNOTATION.test(publicSectionText) || guide.steps.some((s) => CAPTURE_ANNOTATION.test(s)))
    sectionFixes.push("capture_annotation")
  if (TYPO.test([guide.title, guide.summary, ...guide.steps, deepDiveText].join("\n"))) sectionFixes.push("typo")

  return { slug: guide.docSlug, docCategory: guide.docCategory, title: guide.title, exclude, sectionFixes }
}

/** 전체 digest 를 평가한다. 같은 제목은 처음 나온 것만 남기고 뒤의 것을 duplicate_title 로 표시한다. */
export function evaluateDigestPublishGate(
  guides: readonly CsFigmaGuide[],
  options: { internalOnly?: ReadonlySet<string> } = {}
): DigestGateResult[] {
  const firstByTitle = new Map<string, string>()
  return guides.map((guide) => {
    const result = evaluateDigestGuide(guide, options)
    const key = normalizeDigestTitle(guide.title)
    const first = firstByTitle.get(key)
    if (key && first && first !== guide.docSlug) {
      result.exclude.push("duplicate_title")
      result.duplicateOf = first
    } else if (key && !first && !result.exclude.length) {
      firstByTitle.set(key, guide.docSlug)
    }
    return result
  })
}

export function summarizeDigestGate(results: readonly DigestGateResult[]) {
  const excludeCounts: Partial<Record<DigestExcludeReason, number>> = {}
  const fixCounts: Partial<Record<DigestSectionFix, number>> = {}
  for (const r of results) {
    for (const reason of r.exclude) excludeCounts[reason] = (excludeCounts[reason] ?? 0) + 1
    for (const fix of r.sectionFixes) fixCounts[fix] = (fixCounts[fix] ?? 0) + 1
  }
  const excluded = results.filter((r) => r.exclude.length > 0)
  return {
    total: results.length,
    excludeCandidates: excluded.length,
    newExcludeCandidates: excluded.filter((r) => !r.exclude.includes("internal_only")).length,
    publishable: results.length - excluded.length,
    excludeCounts,
    fixCounts,
  }
}
