/**
 * people.ts — 캘린더 담당자 이름 정규화
 *
 * 소스마다 사람을 다르게 부른다:
 *   노션(people 속성) → "GyusungJung", "Heesung Shin", "Minjae Kim"
 *   쇼룸 ICS(ATTENDEE) → "han.park@classin.com"
 *   팀원 캘린더/팀 일정  → "정규성", "박한"
 *
 * 담당자 필터와 담당자 스윔레인은 행이 곧 사람이라, 이 표기 차이를 그대로 두면
 * 한 사람이 세 행으로 쪼개진다. 그래서 서버에서 한 번만 캐논 이름(한글)으로 눕히고
 * 클라이언트로는 정규화된 값만 내려보낸다 — 화면 쪽에는 매핑 지식이 없다.
 *
 * 캐논 원천은 data/team-calendars.json(또는 env TEAM_CALENDAR_MEMBERS)의 name/email 이다.
 * 이 명부는 팀원 개인 구글 캘린더 연동이 이미 쓰던 것으로, 새 명부를 만들지 않는다.
 *
 * 명부에 없는 사람(외부 참석자, 퇴사자, 공용 계정)은 원문을 그대로 돌려준다 —
 * 매칭 실패가 담당자를 사라지게 만들면 안 된다.
 */
import "server-only"

import fs from "fs"
import path from "path"

export interface TeamRosterMember {
  name: string
  email: string
  role?: string
}

const CONFIG_FILE = path.join(process.cwd(), "data", "team-calendars.json")

function isMember(value: unknown): value is TeamRosterMember {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { email?: unknown }).email === "string" &&
      typeof (value as { name?: unknown }).name === "string"
  )
}

/** env(JSON) 우선, 없으면 data/team-calendars.json. 둘 다 없으면 빈 명부(= 정규화 없음). */
export function readTeamRoster(): TeamRosterMember[] {
  const envRaw = process.env.TEAM_CALENDAR_MEMBERS?.trim()
  if (envRaw) {
    try {
      const parsed = JSON.parse(envRaw)
      if (Array.isArray(parsed)) return parsed.filter(isMember)
    } catch {
      /* env 파싱 실패 시 파일로 폴백 */
    }
  }
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"))
      if (Array.isArray(parsed)) return parsed.filter(isMember)
    }
  } catch {
    /* 파일 파싱 실패 시 빈 명부 */
  }
  return []
}

/**
 * 로마자 표기를 순서·구분자와 무관한 토큰 키로 만든다.
 *
 * "GyusungJung" / "gyusung.jung" / "Jung Gyusung" 이 모두 "gyusung|jung" 이 되도록:
 *   1) 이메일이면 로컬 파트만 취한다
 *   2) camelCase 경계를 쪼갠다 (GyusungJung → Gyusung, Jung)
 *   3) 영숫자가 아닌 문자로 쪼개고 소문자화한 뒤 정렬한다
 *
 * 한국 이름은 소스마다 성-이름 순서가 뒤집히므로 정렬이 핵심이다.
 * "CHASUJIN" 처럼 경계가 없는 표기는 한 토큰으로 남아 매칭에 실패하는데,
 * 그건 의도한 결과다 — 근거 없이 붙이느니 원문을 남기는 편이 낫다.
 */
function toRomanKey(value: string): string {
  const localPart = value.includes("@") ? value.slice(0, value.indexOf("@")) : value
  return localPart
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|")
}

function hasHangul(value: string): boolean {
  return /[가-힣]/.test(value)
}

/**
 * 명부로부터 "표기 → 캐논 이름" 해석기를 만든다.
 * 명부를 인자로 받는 이유는 테스트 때문 — 파일을 읽지 않고 순수 함수로 검증할 수 있다.
 */
export function buildAssigneeResolver(members: TeamRosterMember[]) {
  const byExact = new Map<string, string>()
  const byRomanKey = new Map<string, string>()

  for (const member of members) {
    const name = member.name.trim()
    if (!name) continue
    byExact.set(name.toLowerCase(), name)
    byExact.set(member.email.trim().toLowerCase(), name)
    // 먼저 등록된 멤버가 이긴다 — 명부 순서가 곧 우선순위라 결과가 결정적이다.
    const key = toRomanKey(member.email)
    if (key && !byRomanKey.has(key)) byRomanKey.set(key, name)
  }

  return function resolve(raw: string | null | undefined): string | null {
    const value = raw?.trim()
    if (!value) return null

    const exact = byExact.get(value.toLowerCase())
    if (exact) return exact

    // 한글 표기인데 명부에 없으면 로마자 키로 헛돌 이유가 없다 — 원문 유지.
    if (hasHangul(value)) return value

    return byRomanKey.get(toRomanKey(value)) ?? value
  }
}

let cachedResolver: ReturnType<typeof buildAssigneeResolver> | null = null

function getResolver() {
  if (!cachedResolver) cachedResolver = buildAssigneeResolver(readTeamRoster())
  return cachedResolver
}

/** 테스트/명부 변경 후 캐시를 비운다. */
export function resetAssigneeResolverCache() {
  cachedResolver = null
}

export function normalizeAssigneeName(raw: string | null | undefined): string | null {
  return getResolver()(raw)
}

/** 빈 값 제거 + 캐논화 + 중복 제거(순서 보존). */
export function normalizeAssigneeNames(
  raw: readonly (string | null | undefined)[] | null | undefined
): string[] {
  if (!raw?.length) return []
  const resolve = getResolver()
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of raw) {
    const name = resolve(item)
    if (!name || seen.has(name)) continue
    seen.add(name)
    result.push(name)
  }
  return result
}
