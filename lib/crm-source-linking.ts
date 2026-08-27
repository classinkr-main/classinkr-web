export interface BranchRevSourceRecord {
  sheet_row: number
  customer_name: string
  first_payment: string | null
  contract_target: number | null
}

export interface CrmMatchAliasInput {
  alias: string
  canonicalName?: string | null
  targetType?: string | null
  targetId?: string | null
  managerName?: string | null
  confidenceBoost?: number | null
}

export interface CrmEntityMatchInput {
  sourceName: string
  targetName: string
  sourceOwner?: string | null
  targetOwner?: string | null
  targetType?: string | null
  targetId?: string | null
  aliases?: CrmMatchAliasInput[]
}

export interface CrmEntityMatchScore {
  score: number
  strategy: "exact" | "contains" | "alias" | "owner_name" | "token_overlap" | "char_overlap"
  evidence: string[]
}

const CRM_NAME_TOKEN_TRANSLATIONS: Array<[RegExp, string]> = [
  [/\bclass\s*in\b/gi, "클래스인"],
  [/\bclassin\b/gi, "클래스인"],
  [/\bcastle\b/gi, "캐슬"],
  [/\bmetius\b/gi, "메티우스"],
  [/\bmath\b/gi, "수학"],
  [/\benglish\b/gi, "영어"],
  [/\bedu(?:cation)?\b/gi, "에듀"],
  [/\bacademy\b/gi, "학원"],
  [/\binstitute\b/gi, "학원"],
  [/\bschool\b/gi, "스쿨"],
  [/\bcampus\b/gi, "캠퍼스"],
  [/\bcenter\b/gi, "센터"],
  [/\bcentre\b/gi, "센터"],
  [/\bplus\b/gi, "플러스"],
  [/\bjunior\b/gi, "주니어"],
  [/\bmkt\b/gi, "마케팅"],
  [/\bhw\b/gi, "하드웨어"],
  [/\bsw\b/gi, "소프트웨어"],
]

// 시트에 임시로 넣어둔 placeholder 고객 판별 — (1) HW/SW/MKT 접두, (2) "New Software N" /
// "New Hardware N" 같은 계획 자리표시자(하단에 미래 계약 자리로 몇 줄 미리 만들어 둔 행).
// "SW어학원"처럼 실제 상호가 hw/sw/mkt로 시작하는 경우는 제외해야 하므로 접두 토큰 뒤에
// 구분자(공백·기호) 또는 문자열 끝을 요구한다. "New Software"/"New Hardware"는 뒤에 자리표시자
// 번호(숫자)가 붙어 있을 때만 placeholder로 본다 — 숫자가 없는 "New Software"만으로는 실제
// 상호일 가능성을 배제할 수 없어(오탐 방지) placeholder로 취급하지 않는다.
const CRM_PLACEHOLDER_NAME_PATTERN =
  /^\s*(?:(?:hw|sw|mkt)(?=$|[\s\-_~·/(),.:])|new\s+(?:software|hardware)\s*\d+(?=$|[\s\-_~·/(),.:]))/i

export function isPlaceholderCrmName(value: string | null | undefined) {
  return CRM_PLACEHOLDER_NAME_PATTERN.test(value ?? "")
}

// REV 시트에서 취소·해지된 행 판별 — 후보 생성과 커버리지 집계가 같은 규칙을 써야
// "매칭 대상" 분모가 화면마다 어긋나지 않는다.
const SHEET_INACTIVE_STATUS_PATTERN = /취소|해지|드랍|드롭|중단|보류|cancel|drop|lost/i

export function isInactiveSheetStatus(status: string | null | undefined) {
  return SHEET_INACTIVE_STATUS_PATTERN.test(status ?? "")
}

export function normalizeCrmName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/주식회사|유한회사|\(주\)|㈜|학원|어학원|캠퍼스|센터|본원|분원/g, "")
    .replace(/[()（）\[\]{}·._-]/g, "")
}

export function normalizeCrmOwnerName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）\[\]{}·._-]/g, "")
}

// 고객 식별력이 없는 일반어 별칭은 어떤 원천에도 90% 후보를 만들면 안 된다.
// 특히 과거 `class`/`classin` 별칭은 source.includes(alias) 역방향 비교와 결합해
// 무관한 Neo 레코드 수백 건을 내부 테스트 계정으로 끌어올렸다.
const UNSAFE_GENERIC_CRM_ALIASES = new Set([
  "class",
  "classin",
  "클래스인",
  "math",
  "수학",
  "english",
  "영어",
  "academy",
  "school",
  "edu",
  "교육",
])

export function isUnsafeGenericCrmAlias(value: string | null | undefined) {
  const normalized = normalizeCrmName(value)
  return !normalized || UNSAFE_GENERIC_CRM_ALIASES.has(normalized)
}

/** 내부 테스트용 타깃은 운영 원천의 자동/수동 후보가 될 수 없다. */
export function isUnsafeCrmTargetLabel(value: string | null | undefined) {
  const compact = (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_./·-]+/g, "")
  if (!compact) return false
  return (
    compact.includes("내부테스트") ||
    compact.includes("internaltest") ||
    compact.includes("클래스인테스트") ||
    compact.includes("classintest") ||
    /^(?:테스트|test)(?:딜|deal|고객|customer|계정|account)/.test(compact)
  )
}

function translateCrmNameTokens(value: string) {
  return CRM_NAME_TOKEN_TRANSLATIONS.reduce((current, [pattern, replacement]) => {
    return current.replace(pattern, replacement)
  }, value)
}

function getCrmNameVariants(value: string | null | undefined) {
  const raw = value ?? ""
  const variants = new Set<string>()
  const translated = translateCrmNameTokens(raw)
  for (const item of [raw, translated]) {
    const normalized = normalizeCrmName(item)
    if (normalized) variants.add(normalized)
  }
  return Array.from(variants)
}

export function getBranchRevSourceRecordKey(deal: BranchRevSourceRecord) {
  const normalizedName = normalizeCrmName(deal.customer_name) || "unknown"
  const firstPayment = deal.first_payment ?? "no-first-payment"
  const targetAmount = Math.round(Number(deal.contract_target ?? 0))
  return `rev:${deal.sheet_row}:${normalizedName}:${firstPayment}:${targetAmount}`
}

function scoreNormalizedNamePair(source: string, target: string): { score: number; strategy: CrmEntityMatchScore["strategy"] } {
  if (!source || !target) return { score: 0, strategy: "char_overlap" }
  if (source === target) return { score: 0.96, strategy: "exact" }
  if (source.length >= 3 && target.includes(source)) return { score: 0.9, strategy: "contains" }
  if (target.length >= 3 && source.includes(target)) return { score: 0.86, strategy: "contains" }

  const sourceChars = new Set(Array.from(source))
  const targetChars = new Set(Array.from(target))
  const overlap = Array.from(sourceChars).filter((char) => targetChars.has(char)).length
  const union = new Set([...sourceChars, ...targetChars]).size

  return { score: union === 0 ? 0 : overlap / union, strategy: "char_overlap" }
}

export function scoreCrmNameMatch(sourceName: string, targetName: string) {
  return scoreCrmEntityMatch({ sourceName, targetName }).score
}

export function scoreCrmEntityMatch(input: CrmEntityMatchInput): CrmEntityMatchScore {
  const evidence: string[] = []
  let bestScore = 0
  let bestStrategy: CrmEntityMatchScore["strategy"] = "char_overlap"
  const sourceOwner = normalizeCrmOwnerName(input.sourceOwner)
  const targetOwner = normalizeCrmOwnerName(input.targetOwner)

  for (const source of getCrmNameVariants(input.sourceName)) {
    for (const target of getCrmNameVariants(input.targetName)) {
      const scored = scoreNormalizedNamePair(source, target)
      if (scored.score > bestScore) {
        bestScore = scored.score
        bestStrategy = scored.strategy
      }
    }
  }
  if (bestScore > 0) evidence.push(`name:${bestStrategy}:${bestScore.toFixed(2)}`)

  for (const alias of input.aliases ?? []) {
    const aliasVariants = getCrmNameVariants(alias.alias)
    // 일반어 별칭은 정확 일치조차 고객을 식별하지 못한다. 2자 이하 별칭은 담당 범위가
    // 있을 때의 정확 일치만 허용해 `alias.includes(source)` 광역 승격을 막는다.
    if (isUnsafeGenericCrmAlias(alias.alias)) continue
    const canonicalVariants = getCrmNameVariants(alias.canonicalName ?? "")
    const sourceVariants = getCrmNameVariants(input.sourceName)
    const targetVariants = getCrmNameVariants(input.targetName)
    const aliasManager = normalizeCrmOwnerName(alias.managerName)
    const aliasMatchesSource = aliasVariants.some((aliasValue) => {
      const shortUnscoped = aliasValue.length < 3 && !aliasManager
      if (shortUnscoped) return false
      return sourceVariants.some(
        (source) =>
          source === aliasValue ||
          (aliasValue.length >= 3 && source.includes(aliasValue)) ||
          (source.length >= 3 && aliasValue.includes(source))
      )
    })
    const aliasTargetScoped =
      !alias.targetId ||
      (alias.targetType === input.targetType && alias.targetId === input.targetId)
    const aliasManagerScoped = !aliasManager || aliasManager === sourceOwner || aliasManager === targetOwner
    const canonicalMatchesTarget =
      canonicalVariants.length === 0 ||
      canonicalVariants.some((canonical) =>
        targetVariants.some((target) => target === canonical || target.includes(canonical) || canonical.includes(target))
      )

    if (aliasMatchesSource && aliasTargetScoped && aliasManagerScoped && canonicalMatchesTarget) {
      const boosted = Math.max(bestScore + Number(alias.confidenceBoost ?? 0.1), 0.9)
      bestScore = Math.min(0.99, boosted)
      bestStrategy = "alias"
      evidence.push(`alias:${alias.alias}`)
      if (aliasManager) evidence.push("alias_manager:matched")
    }
  }

  if (sourceOwner && targetOwner) {
    if (sourceOwner === targetOwner) {
      bestScore = Math.min(0.99, bestScore + 0.18)
      bestStrategy = bestScore >= 0.72 ? "owner_name" : bestStrategy
      evidence.push("owner:exact")
    } else if (sourceOwner.length >= 2 && targetOwner.includes(sourceOwner)) {
      bestScore = Math.min(0.99, bestScore + 0.1)
      evidence.push("owner:contains")
    }
  }

  return {
    score: Number(bestScore.toFixed(4)),
    strategy: bestStrategy,
    evidence,
  }
}
