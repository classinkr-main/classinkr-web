import { parseLeadMessage } from "@/lib/crm/lead-message"
import { deriveLeadRegionLabel } from "@/lib/crm/lead-message"

// 리드 라벨 SSOT — 지역·과목·유형(고객 성격)을 기존 레코드에서 파생한다.
//
// 원칙 (지역 SSOT lib/regions/korea-regions.ts와 동일):
//  - 확신 가능한 매핑만 라벨을 붙인다. 모호하면 null — 틀린 라벨이 없는 라벨보다 해롭다.
//  - 입력을 강제하지 않는다. 폼에 과목 질문이 없어도(2026-08 실측: Meta 폼에 과목 필드 없음)
//    상호명·폼 응답에서 보수적으로 추론하고, 추론값임을 화면에서 구분한다.
//
// 실측 근거(2026-08-09, 리드 122건): 과목은 org 상호명("정용휘국어독해학원", "피엠피수학",
// "신디쌤english")과 폼 응답에만 존재. 유형은 학원 외에 대학(전주비전대)·기업(세마스포츠마케팅,
// MIAT항공)·개인(프리랜서, ○○쌤)·비교육 자영업(카페·스파·증권)이 섞여 들어온다.

// ─── 과목 ─────────────────────────────────────────────────────

export type LeadSubject =
  | "korean"
  | "english"
  | "math"
  | "science"
  | "social"
  | "foreign_lang"
  | "hanja"
  | "coding"
  | "arts_pe"
  | "reading_essay"
  | "comprehensive"

export const LEAD_SUBJECT_LABELS: Record<LeadSubject, string> = {
  korean: "국어",
  english: "영어",
  math: "수학",
  science: "과학",
  social: "사회",
  foreign_lang: "외국어",
  hanja: "한자·한문",
  coding: "코딩·IT",
  arts_pe: "예체능",
  reading_essay: "독서·논술",
  comprehensive: "종합·보습",
}

// 상호명 토큰 → 과목. 뒤에 오는 규칙일수록 우선순위가 낮다(첫 매치 승).
// "영어수학학원"처럼 복수 과목이면 종합으로 접는다 — 하나를 고르면 절반은 틀린다.
const SUBJECT_RULES: Array<{ subject: LeadSubject; pattern: RegExp }> = [
  { subject: "comprehensive", pattern: /(종합|보습|전과목|입시\s*학원|재수|기숙)/i },
  { subject: "reading_essay", pattern: /(독서|논술|글쓰기|독해\s*논술)/i },
  // "외국어"의 "국어" 부분열 오인 방지 — 앞이 "외"면 국어가 아니다.
  { subject: "korean", pattern: /((?<!외)국어|국문|독해)/i },
  { subject: "english", pattern: /(영어|english|잉글리시|토익|토플|회화)/i },
  { subject: "math", pattern: /(수학|수리|math|매쓰)/i },
  { subject: "science", pattern: /(과학|물리|화학|생명|지구과학)/i },
  { subject: "social", pattern: /(사회|한국사|역사)/i },
  { subject: "hanja", pattern: /(한자|한문|서예)/i },
  { subject: "coding", pattern: /(코딩|프로그래밍|컴퓨터|로봇|sw\s*교육|메이커)/i },
  {
    subject: "arts_pe",
    pattern: /(음악|피아노|보컬|미술|화실|발레|무용|체육|태권도|축구|농구|수영|필라테스|요가|골프|바둑)/i,
  },
  // "어학원"은 영어 전유가 아니라 언어 교습 일반 — 외국어로 정직하게 접는다(브랜드 사전이 더 구체적).
  { subject: "foreign_lang", pattern: /(외국어|어학원|중국어|일본어|일어|중어|스페인어|프랑스어|독일어|베트남어)/i },
]

// 과목이 상호에 안 드러나는 프랜차이즈 브랜드 사전 — 확실한 것만.
const SUBJECT_BRANDS: Array<{ subject: LeadSubject; pattern: RegExp }> = [
  { subject: "english", pattern: /(gnb|지앤비|정상어학원|청담어학원|파고다|yb[m]?|시사영어)/i },
  { subject: "math", pattern: /(씨앤씨수학|매쓰플랫)/i },
  { subject: "hanja", pattern: /(장원한자)/i },
]

// 폼 응답에서 과목을 직접 물었을 때의 키 후보(웹훅이 구조화하지 않아 message.answers에만 남는다).
const SUBJECT_ANSWER_KEYS = ["과목", "운영과목", "운영 과목", "담당과목", "subject", "교과"]

function matchSubject(text: string): LeadSubject | null {
  // 브랜드 사전이 토큰 규칙보다 먼저다 — "지앤비외국어학원"은 외국어가 아니라 GnB(영어)다.
  for (const brand of SUBJECT_BRANDS) {
    if (brand.pattern.test(text)) return brand.subject
  }
  // 복수 과목 매치는 종합으로 — 하나를 고르면 절반은 틀린다.
  const hits = new Set<LeadSubject>()
  for (const rule of SUBJECT_RULES) {
    if (rule.pattern.test(text)) hits.add(rule.subject)
    if (hits.size > 2) break
  }
  if (hits.size === 1) return hits.values().next().value ?? null
  if (hits.size > 1) {
    if (hits.has("comprehensive")) return "comprehensive"
    if (hits.has("reading_essay") && hits.size === 2 && hits.has("korean")) return "reading_essay"
    return "comprehensive"
  }
  return null
}

// ─── 유형(고객 성격) ──────────────────────────────────────────

export type LeadCategory =
  | "academy"
  | "school_univ"
  | "company"
  | "individual"
  | "non_education"

export const LEAD_CATEGORY_LABELS: Record<LeadCategory, string> = {
  academy: "학원·교습소",
  school_univ: "학교·대학",
  company: "기업·기관",
  individual: "개인·강사",
  non_education: "교육 외",
}

// org가 라벨 판정에 쓸 수 없는 값인 경우 — "미정", "학원", 주소 문자열, 테스트 더미 등.
// 단어 전체 일치만 정크다 — "무적어학원"의 "무"처럼 접두 매치로 실명을 삼키면 안 된다.
const JUNK_ORG_PATTERN = /^(미정|없음|학원|무|x|없다|n\/a|-|\.)$|^문자|^test\b|^<test/i

const CATEGORY_RULES: Array<{ category: LeadCategory; pattern: RegExp }> = [
  // 교육 외를 먼저 — "필라테스 학원"처럼 겹치면 교육 시설로 보는 게 안전하므로
  // 교육 외 판정은 교육 키워드가 전혀 없을 때만 아래에서 재확인한다.
  { category: "school_univ", pattern: /(대학교|대학$|대\s*$|고등학교|중학교|초등학교|학교$|유치원|어린이집)/i },
  {
    category: "company",
    pattern: /(주식회사|\(주\)|㈜|회사|기업|산업|마케팅|컨설팅|연구원|연구소|재단|협회|센터$|항공|은행|증권|보험|병원|의원)/i,
  },
  { category: "individual", pattern: /(쌤$|선생님?$|강사|프리랜서|과외|개인|튜터)/i },
  {
    category: "academy",
    pattern: /(학원|교습소|공부방|아카데미|academy|스터디|에듀|edu|어학원|교육원|훈련원|학당|서당)/i,
  },
]

const NON_EDUCATION_PATTERN =
  /(카페|커피|coffee|cafe|식당|베이커리|스파|spa|미용|네일|뷰티|beauty|부동산|공인중개|펜션|호텔|쇼핑몰|유통|물류|건설|전자상거래|무역|자영업|tv$|채널)/i

const EDUCATION_HINT_PATTERN =
  /(학원|교습소|공부방|아카데미|academy|스터디|에듀|edu|교육|학교|대학|유치원|과외|학습|런닝|러닝|티칭|수학|영어|국어|과학|논술|코딩|음악|미술|체육)/i

export function deriveLeadCategory(lead: { org?: string | null; name?: string | null }): LeadCategory | null {
  const org = lead.org?.trim() ?? ""
  const name = lead.name?.trim() ?? ""
  const basis = org && !JUNK_ORG_PATTERN.test(org) ? org : ""
  if (!basis) {
    // org가 정크면 name의 강사 신호만 본다("김원용쌤") — 그 외 추측 금지.
    if (/(쌤|선생님)$/.test(name)) return "individual"
    return null
  }
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(basis)) return rule.category
  }
  // 교육 힌트가 전혀 없고 비교육 업종 패턴에 걸리면 "교육 외" — 우선순위 큐에서
  // 신규 응대 자리를 차지하지 않도록 스코어링이 이 라벨을 소비한다.
  if (!EDUCATION_HINT_PATTERN.test(basis) && NON_EDUCATION_PATTERN.test(basis)) return "non_education"
  return null
}

// ─── 종합 파생 ────────────────────────────────────────────────

export interface LeadLabels {
  /** 17개 시도 표준 라벨(lib/regions) — 실패 시 null. */
  region: string | null
  subject: LeadSubject | null
  subjectLabel: string | null
  category: LeadCategory | null
  categoryLabel: string | null
}

export function deriveLeadLabels(
  lead: { org?: string | null; name?: string | null; branch?: string | null; message?: string | null }
): LeadLabels {
  const region = deriveLeadRegionLabel({ branch: lead.branch, message: lead.message })

  // 과목 — ① 폼 응답(본인이 답한 값, 최우선) ② 상호명 추론.
  let subject: LeadSubject | null = null
  if (lead.message) {
    const answers = parseLeadMessage(lead.message)?.answers ?? []
    for (const answer of answers) {
      const key = answer.key?.trim().toLowerCase() ?? ""
      if (SUBJECT_ANSWER_KEYS.some((candidate) => key === candidate.toLowerCase())) {
        subject = matchSubject(answer.value ?? "")
        if (subject) break
      }
    }
  }
  if (!subject) {
    const org = lead.org?.trim() ?? ""
    if (org && !JUNK_ORG_PATTERN.test(org)) subject = matchSubject(org)
  }

  const category = deriveLeadCategory(lead)

  return {
    region,
    subject,
    subjectLabel: subject ? LEAD_SUBJECT_LABELS[subject] : null,
    category,
    categoryLabel: category ? LEAD_CATEGORY_LABELS[category] : null,
  }
}
