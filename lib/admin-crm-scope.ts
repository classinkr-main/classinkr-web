type TeamManagerRow = {
  team: string | null
  manager: string | null
}

const KOREA_TEXT_MARKERS = ["한국", "대한민국", "코리아", "韩国", "韓国"]
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
  if (KOREA_TEXT_MARKERS.some((marker) => normalized.includes(normalizeCrmScopeText(marker)))) {
    return true
  }

  const lower = text.toLowerCase()
  return /\b(korea|korean|kr|kor)\b/.test(lower) || normalized.includes("southkorea")
}

export function getKoreaTeamManagerSet(rows: TeamManagerRow[]) {
  return new Set(
    rows
      .filter((row) => isKoreaTeamLabel(row.team))
      .map((row) => normalizeCrmScopeText(row.manager))
      .filter(Boolean)
  )
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

export function isKoreaScopedExternalRecord(
  record: { owner_name: string | null; payload: Record<string, unknown> | null },
  koreaManagers: Set<string>
) {
  return isKoreaScopedOwner(record.owner_name, koreaManagers) || payloadHasKoreaTeamScope(record.payload)
}
