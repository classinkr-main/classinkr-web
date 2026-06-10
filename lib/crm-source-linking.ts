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
    const canonicalVariants = getCrmNameVariants(alias.canonicalName ?? "")
    const sourceVariants = getCrmNameVariants(input.sourceName)
    const targetVariants = getCrmNameVariants(input.targetName)
    const aliasMatchesSource = aliasVariants.some((aliasValue) =>
      sourceVariants.some((source) => source === aliasValue || source.includes(aliasValue) || aliasValue.includes(source))
    )
    const aliasTargetScoped =
      !alias.targetId ||
      (alias.targetType === input.targetType && alias.targetId === input.targetId)
    const aliasManager = normalizeCrmOwnerName(alias.managerName)
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
