// 담당자 표(internal_team_contacts, 2026-11-26)의 행 모양·입력 검사 — 순수 모듈(서버 API·어드민 화면 공용).
//
// 칸 뜻은 supabase/migrations/20261126_internal_team_contacts.sql 머리 주석이 정본이다. 여기서는
//  - 영역 키가 그 조직(KR: KR_TOPICS 키, HQ: HQ_DOMAINS 키)에 있는지 — 허용 목록은 서버가 넘긴다(lib/team-contacts/areas.ts)
//  - 연락처 값(전화·이메일)을 어느 칸에도 넣지 않았는지 — 연락 방법 칸은 "종류"만(위컴 1:1, KR 운영방 …)
//  - 길이·형식(어드민 링크는 /admin…, 확인일은 YYYY-MM-DD)
// 을 본다. DB 제약(길이·형식)과 같은 값을 쓴다.

import { maskContactText } from "@/lib/ops-tools/redact"

export const TEAM_CONTACT_ORGS = ["KR", "HQ"] as const
export type TeamContactOrg = (typeof TEAM_CONTACT_ORGS)[number]

export const TEAM_CONTACT_ORG_LABEL: Record<TeamContactOrg, string> = {
  KR: "한국 지사",
  HQ: "본사",
}

export interface TeamContactRecord {
  id: string
  org: TeamContactOrg
  /** KR: KR_TOPICS 키, HQ: HQ_DOMAINS 키. */
  area: string
  role: string | null
  name: string | null
  deputy: string | null
  /** 연락 방법 종류(값 없음). */
  channel: string | null
  prep: string[]
  adminLink: string | null
  note: string | null
  /** 사람이 확인한 날(YYYY-MM-DD). */
  confirmedAt: string | null
  confirmedBy: string | null
  active: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** 만들기·고치기 입력(검사를 거친 값). */
export interface TeamContactInput {
  org: TeamContactOrg
  area: string
  role: string | null
  name: string | null
  deputy: string | null
  channel: string | null
  prep: string[]
  adminLink: string | null
  note: string | null
  confirmedAt: string | null
  sortOrder: number
}

export interface TeamContactAreaOption {
  key: string
  label: string
  /** 안내(resolveContact)가 이 영역의 행을 쓰는가. KR 의 본사 에스컬레이션·HQ 영역은 저장만 한다. */
  usedInAnswers: boolean
}

export type TeamContactAreaOptions = Record<TeamContactOrg, TeamContactAreaOption[]>

export const TEAM_CONTACT_LIMITS = {
  role: 80,
  name: 60,
  deputy: 60,
  channel: 60,
  adminLink: 200,
  note: 500,
  prepItems: 10,
  prepItem: 80,
  sortOrderMax: 9999,
} as const

export const CONTACT_VALUE_ERROR =
  "전화번호·이메일 같은 연락처 값은 넣지 않습니다 — 연락 방법은 종류만 적어 주세요(예: 위컴 1:1, KR 운영방)."

/** 글에 전화번호·이메일 꼴 값이 있는가(가림 함수가 글을 바꾸면 있다). */
export function containsContactValue(text: string): boolean {
  return maskContactText(text) !== text
}

/** 주소(웹훅·외부 링크) 꼴 — 연락 방법 칸에는 넣지 않는다. */
function containsUrl(text: string): boolean {
  return /https?:\/\/|www\.[a-z0-9-]+\./i.test(text)
}

export function isTeamContactOrg(value: unknown): value is TeamContactOrg {
  return typeof value === "string" && (TEAM_CONTACT_ORGS as readonly string[]).includes(value)
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** 한국 날짜(YYYY-MM-DD) — 확인일 찍기. */
export function kstDateString(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** 준비물 — 배열이거나 ·;|줄바꿈·쉼표로 나눈 글. */
export function splitPrep(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[·;|,\n]/) : []
  return items
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
}

type Validated = { ok: true; value: TeamContactInput } | { ok: false; error: string }

const TEXT_FIELDS = [
  ["role", "역할", TEAM_CONTACT_LIMITS.role],
  ["name", "1차 담당", TEAM_CONTACT_LIMITS.name],
  ["deputy", "대리 담당", TEAM_CONTACT_LIMITS.deputy],
  ["channel", "연락 방법", TEAM_CONTACT_LIMITS.channel],
  ["note", "비고", TEAM_CONTACT_LIMITS.note],
] as const

function readText(raw: Record<string, unknown>, key: string, base: string | null): { value: string | null } | { error: string } {
  if (!(key in raw)) return { value: base }
  const value = raw[key]
  if (value == null) return { value: null }
  if (typeof value !== "string") return { error: `${key} 값은 글이어야 합니다.` }
  const trimmed = value.trim()
  return { value: trimmed ? trimmed : null }
}

/**
 * 만들기(base 없음)·고치기(base = 지금 행, 보낸 키만 바꾼다) 입력 검사.
 * areas — 조직별 허용 영역 키(서버가 KR_TOPICS·HQ_DOMAINS 로 만든다).
 */
export function validateTeamContactInput(
  input: unknown,
  areas: Record<TeamContactOrg, ReadonlySet<string>>,
  base?: TeamContactRecord | null
): Validated {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "요청 본문이 올바르지 않습니다." }
  const raw = input as Record<string, unknown>

  const org = "org" in raw ? raw.org : base?.org
  if (!isTeamContactOrg(org)) return { ok: false, error: "조직은 KR(한국 지사) 또는 HQ(본사)여야 합니다." }
  const areaRaw = "area" in raw ? raw.area : base?.area
  const area = typeof areaRaw === "string" ? areaRaw.trim() : ""
  if (!area || !areas[org].has(area)) return { ok: false, error: `모르는 업무 영역입니다(${TEAM_CONTACT_ORG_LABEL[org]}).` }

  const texts: Record<string, string | null> = {}
  for (const [key, label, limit] of TEXT_FIELDS) {
    const read = readText(raw, key, (base?.[key] as string | null | undefined) ?? null)
    if ("error" in read) return { ok: false, error: read.error }
    if (read.value && read.value.length > limit) return { ok: false, error: `${label}은(는) ${limit}자 이하로 적어 주세요.` }
    if (read.value && containsContactValue(read.value)) return { ok: false, error: `${label}: ${CONTACT_VALUE_ERROR}` }
    texts[key] = read.value
  }
  if (texts.channel && containsUrl(texts.channel)) {
    return { ok: false, error: "연락 방법에는 주소(웹훅·링크)를 넣지 않습니다 — 방 이름이나 종류만 적어 주세요." }
  }
  if (!texts.name && !texts.role) return { ok: false, error: "역할이나 1차 담당 중 하나는 적어 주세요." }

  const prep = "prep" in raw ? splitPrep(raw.prep) : base?.prep ?? []
  if (prep.length > TEAM_CONTACT_LIMITS.prepItems) return { ok: false, error: `준비물은 ${TEAM_CONTACT_LIMITS.prepItems}개 이하로 적어 주세요.` }
  for (const item of prep) {
    if (item.length > TEAM_CONTACT_LIMITS.prepItem) return { ok: false, error: `준비물 한 항목은 ${TEAM_CONTACT_LIMITS.prepItem}자 이하로 적어 주세요.` }
    if (containsContactValue(item)) return { ok: false, error: `준비물: ${CONTACT_VALUE_ERROR}` }
  }

  const linkRead = readText(raw, "adminLink", base?.adminLink ?? null)
  if ("error" in linkRead) return { ok: false, error: linkRead.error }
  const adminLink = linkRead.value
  if (adminLink && (!adminLink.startsWith("/admin") || adminLink.startsWith("//") || /\s/.test(adminLink) || adminLink.length > TEAM_CONTACT_LIMITS.adminLink)) {
    return { ok: false, error: "어드민 링크는 /admin 으로 시작하는 상대 경로만 넣습니다." }
  }

  const confirmedRead = readText(raw, "confirmedAt", base?.confirmedAt ?? null)
  if ("error" in confirmedRead) return { ok: false, error: confirmedRead.error }
  const confirmedAt = confirmedRead.value
  if (confirmedAt && !isIsoDate(confirmedAt)) return { ok: false, error: "확인일은 YYYY-MM-DD 로 적어 주세요." }

  const sortRaw = "sortOrder" in raw ? raw.sortOrder : base?.sortOrder ?? 0
  // 화면 입력은 글로 온다 — 빈 칸은 0.
  const sortOrder = typeof sortRaw === "string" ? (sortRaw.trim() ? Number(sortRaw) : 0) : sortRaw ?? 0
  if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > TEAM_CONTACT_LIMITS.sortOrderMax) {
    return { ok: false, error: `정렬 순서는 0~${TEAM_CONTACT_LIMITS.sortOrderMax} 정수여야 합니다.` }
  }

  return {
    ok: true,
    value: {
      org,
      area,
      role: texts.role,
      name: texts.name,
      deputy: texts.deputy,
      channel: texts.channel,
      prep,
      adminLink,
      note: texts.note,
      confirmedAt,
      sortOrder,
    },
  }
}
