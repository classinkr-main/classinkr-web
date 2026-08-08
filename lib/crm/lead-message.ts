import { deriveCustomerRegion, REGION_UNSPECIFIED } from "@/lib/crm/region-label"

export interface LeadMessageItem {
  key: string
  label: string
  value: string
}

export interface ParsedLeadMessage {
  kind: "meta" | "plain"
  raw: string
  attribution: LeadMessageItem[]
  answers: LeadMessageItem[]
  identifiers: LeadMessageItem[]
  regionValue: string | null
}

const META_LINE_LABELS: Record<string, string> = {
  campaign: "캠페인",
  adset: "광고 세트",
  ad: "광고",
}

const IDENTIFIER_LABELS: Record<string, string> = {
  leadgen_id: "Lead ID",
  page_id: "Page ID",
  form_id: "Form ID",
}

const FIELD_LABELS: Record<string, string> = {
  full_name: "이름",
  name: "이름",
  company_name: "기관",
  company: "기관",
  organization: "기관",
  phone_number: "연락처",
  phone: "연락처",
  email: "이메일",
  email_address: "이메일",
  city: "지역 응답",
  region: "지역 응답",
  province: "지역 응답",
  job_title: "역할",
  role: "역할",
  student_count: "원생 수",
  number_of_students: "원생 수",
}

const REGION_FIELD_KEYS = new Set(["city", "region", "province", "지역", "주소"])

function cleanValue(value: string | undefined) {
  const cleaned = value?.trim()
  return cleaned && cleaned !== "-" ? cleaned : null
}

function splitPair(value: string, separator: "=" | ":") {
  const index = value.indexOf(separator)
  if (index <= 0) return null
  const key = value.slice(0, index).trim().toLowerCase()
  const item = cleanValue(value.slice(index + 1))
  return key && item ? { key, value: item } : null
}

export function parseLeadMessage(message: string | null | undefined): ParsedLeadMessage | null {
  const raw = message?.trim()
  if (!raw) return null

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines[0]?.toLowerCase() !== "meta lead ads") {
    return { kind: "plain", raw, attribution: [], answers: [], identifiers: [], regionValue: null }
  }

  const attribution: LeadMessageItem[] = []
  const identifiers: LeadMessageItem[] = []
  const answers: LeadMessageItem[] = []

  for (const line of lines.slice(1)) {
    const pair = splitPair(line, "=")
    if (!pair) continue

    if (pair.key === "fields") {
      for (const fieldText of pair.value.split(/\s+\/\s+/)) {
        const field = splitPair(fieldText, ":")
        if (!field) continue
        answers.push({
          key: field.key,
          label: FIELD_LABELS[field.key] ?? field.key.replaceAll("_", " "),
          value: field.value,
        })
      }
      continue
    }

    if (META_LINE_LABELS[pair.key]) {
      attribution.push({ key: pair.key, label: META_LINE_LABELS[pair.key], value: pair.value })
    } else if (IDENTIFIER_LABELS[pair.key]) {
      identifiers.push({ key: pair.key, label: IDENTIFIER_LABELS[pair.key], value: pair.value })
    }
  }

  const regionAnswer = answers.find((item) => REGION_FIELD_KEYS.has(item.key))
  return {
    kind: "meta",
    raw,
    attribution,
    answers,
    identifiers,
    regionValue: regionAnswer?.value ?? null,
  }
}

// Meta 폼은 영문 city 값을 남길 수 있다. 전역 지역 정규화 규칙의 범위를 넓히지 않고,
// 리드 수집 경계에서만 보수적으로 17개 시도 라벨로 접는다.
const ROMANIZED_CITY_REGION: Record<string, string> = {
  seoul: "서울", busan: "부산", daegu: "대구", incheon: "인천", gwangju: "광주",
  daejeon: "대전", ulsan: "울산", sejong: "세종", jeju: "제주", seogwipo: "제주",
  suwon: "경기", seongnam: "경기", yongin: "경기", goyang: "경기", bucheon: "경기",
  anyang: "경기", ansan: "경기", hwaseong: "경기", pyeongtaek: "경기",
  chuncheon: "강원", wonju: "강원", gangneung: "강원",
  cheongju: "충북", chungju: "충북", jecheon: "충북",
  cheonan: "충남", asan: "충남", gongju: "충남",
  jeonju: "전북", gunsan: "전북", iksan: "전북",
  mokpo: "전남", yeosu: "전남", suncheon: "전남",
  pohang: "경북", gyeongju: "경북", gumi: "경북", andong: "경북",
  changwon: "경남", jinju: "경남", gimhae: "경남", yangsan: "경남",
}

function romanizedRegion(value: string | null | undefined) {
  const key = value?.normalize("NFKC").toLowerCase().replace(/[^a-z]/g, "")
  return key ? ROMANIZED_CITY_REGION[key] ?? null : null
}

export function deriveLeadRegionLabel(input: {
  branch?: string | null
  message?: string | null
}): string | null {
  const parsed = parseLeadMessage(input.message)
  for (const candidate of [input.branch, parsed?.regionValue]) {
    if (!candidate) continue
    const derived = deriveCustomerRegion([candidate])
    if (derived.label !== REGION_UNSPECIFIED) return derived.label
    const romanized = romanizedRegion(candidate)
    if (romanized) return romanized
  }
  return null
}
