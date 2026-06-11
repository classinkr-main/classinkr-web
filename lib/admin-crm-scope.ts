type TeamManagerRow = {
  team: string | null
  manager: string | null
}

const KOREA_TEXT_MARKERS = ["한국", "대한민국", "코리아", "韩国", "韓国"]
const KOREA_TEAM_CODES = new Set(["bd", "mkt", "csm"])
const KOREA_MANAGER_ALIASES = [
  "박한",
  "박 한",
  "han",
  "park han",
  "parkhan",
  "han park",
  "이왕찬",
  "왕찬",
  "wangchan",
  "wang chan",
  "lee wangchan",
  "leewangchan",
  "문준혁",
  "준혁",
  "junhyuk",
  "jun hyuk",
  "moon junhyuk",
  "moonjunhyuk",
  "정규성",
  "규성",
  "gyusung",
  "gyu sung",
  "jeong gyusung",
  "jeonggyusung",
  "신희성",
  "희성",
  "heesung",
  "hee sung",
  "shin heesung",
  "shinheesung",
  "황찬우",
  "찬우",
  "chanwoo",
  "chan woo",
  "hwang chanwoo",
  "hwangchanwoo",
  "new 1",
  "new1",
  "진소망",
  "소망",
  "somang",
  "jin somang",
  "jinsomang",
  "김민재",
  "민재",
  "minjae",
  "min jae",
  "kim minjae",
  "kimminjae",
  "new 2",
  "new2",
]
const TEAM_HINT_KEY_PATTERN =
  /team|dept|department|branch|region|country|office|owner|manager|group|조직|팀|부서|지사|국가|지역|담당|매니저/i

export function normalizeCrmScopeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s._()/\\-]+/g, "")
}

export function isKoreaTeamLabel(value: string | null | undefined) {
  const text = value?.normalize("NFKC").trim()
  if (!text) return false

  const normalized = normalizeCrmScopeText(text)
  if (KOREA_TEAM_CODES.has(normalized)) return true
  if (KOREA_TEXT_MARKERS.some((marker) => normalized.includes(normalizeCrmScopeText(marker)))) {
    return true
  }

  const lower = text.toLowerCase()
  return /\b(korea|korean|kr|kor)\b/.test(lower) || normalized.includes("southkorea")
}

export function getKoreaTeamManagerSet(rows: TeamManagerRow[]) {
  const managers = new Set(KOREA_MANAGER_ALIASES.map(normalizeCrmScopeText).filter(Boolean))

  rows
    .filter((row) => isKoreaTeamLabel(row.team))
    .map((row) => normalizeCrmScopeText(row.manager))
    .filter(Boolean)
    .forEach((manager) => managers.add(manager))

  return managers
}

export function isKoreaScopedOwner(ownerName: string | null | undefined, koreaManagers: Set<string>) {
  const owner = normalizeCrmScopeText(ownerName)
  if (!owner) return false
  if (isKoreaTeamLabel(ownerName)) return true
  if (koreaManagers.has(owner)) return true

  for (const manager of koreaManagers) {
    if (manager.length >= 2 && (owner.includes(manager) || manager.includes(owner))) {
      return true
    }
  }

  return false
}

function payloadHasKoreaScopeValue(value: unknown, depth = 0, parentLooksScoped = false): boolean {
  if (depth > 4 || value == null) return false

  if (typeof value === "string" || typeof value === "number") {
    return parentLooksScoped && isKoreaTeamLabel(String(value))
  }

  if (Array.isArray(value)) {
    return value.some((item) => payloadHasKoreaScopeValue(item, depth + 1, parentLooksScoped))
  }

  if (typeof value !== "object") return false

  return Object.entries(value as Record<string, unknown>).some(([key, item]) => {
    const keyLooksScoped = parentLooksScoped || TEAM_HINT_KEY_PATTERN.test(key)
    if ((typeof item === "string" || typeof item === "number") && keyLooksScoped && isKoreaTeamLabel(String(item))) {
      return true
    }
    return payloadHasKoreaScopeValue(item, depth + 1, keyLooksScoped)
  })
}

export function payloadHasKoreaTeamScope(payload: Record<string, unknown> | null | undefined) {
  return payloadHasKoreaScopeValue(payload)
}

// 현재 Xiaoshouyi 인스턴스는 한국지사 전용 CRM이라(동기화된 계정명이 전부 한국 학원)
// 모든 외부 레코드를 한국팀으로 본다. 또한 owner_name이 ownerId 숫자로만 들어와
// 매니저명 매칭이 불가능하므로 owner/payload 휴리스틱은 신뢰할 수 없다.
// 본사 통합(다국가) 인스턴스로 바뀌면 false로 돌려 아래 휴리스틱을 복구한다.
export const EXTERNAL_CRM_KOREA_ONLY = true

export function isKoreaScopedExternalRecord(
  record: { owner_name: string | null; payload: Record<string, unknown> | null },
  koreaManagers: Set<string>
) {
  if (EXTERNAL_CRM_KOREA_ONLY) return true
  return isKoreaScopedOwner(record.owner_name, koreaManagers) || payloadHasKoreaTeamScope(record.payload)
}
