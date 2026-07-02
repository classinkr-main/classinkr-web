export type SalesLedgerProductCategory = "software" | "hardware" | "unknown"

export interface SalesLedgerProductCategoryInput {
  product?: unknown
  account?: unknown
  rawText?: unknown
}

interface WeightedText {
  value: unknown
  weight: number
}

interface PatternScore {
  pattern: RegExp
  score: number
}

const MIN_CATEGORY_SCORE = 3

const HARDWARE_PATTERNS: PatternScore[] = [
  { pattern: /(^|[^a-z0-9])(hw|hardware|ifp|ops|s1|t1)([^a-z0-9]|$)/i, score: 3 },
  { pattern: /(board|whiteboard|smart\s*board|display|monitor|camera|terminal|tablet|device|panel|pc\s*module)/i, score: 3 },
  {
    // Korean keywords are escaped so this shared helper stays ASCII-safe.
    pattern:
      /(\uD558\uB4DC\uC6E8\uC5B4|\uC804\uC790\uCE60\uD310|\uCE60\uD310|\uBCF4\uB4DC|\uB514\uC2A4\uD50C\uB808\uC774|\uBAA8\uB2C8\uD130|\uCE74\uBA54\uB77C|\uD0DC\uBE14\uB9BF|\uD328\uB4DC|\uB2E8\uB9D0|\uC7A5\uBE44|\uAE30\uAE30|\uBCBD\uAC78\uC774|\uC2A4\uD0E0\uB4DC)/,
    score: 3,
  },
]

const SOFTWARE_PATTERNS: PatternScore[] = [
  { pattern: /(^|[^a-z0-9])(sw|software|saas)([^a-z0-9]|$)/i, score: 3 },
  {
    pattern:
      /(subscription|license|licence|learning\s*space|business\s*plan|cloud|platform|online\s*(class|lesson|school)|annual\s*(plan|seat)?|seat)/i,
    score: 3,
  },
  {
    pattern:
      /(\uC18C\uD504\uD2B8\uC6E8\uC5B4|\uAD6C\uB3C5|\uB77C\uC774\uC120\uC2A4|\uB77C\uC774\uC13C\uC2A4|\uB7EC\uB2DD\uC2A4\uD398\uC774\uC2A4|\uD074\uB77C\uC6B0\uB4DC|\uD50C\uB7AB\uD3FC|\uC628\uB77C\uC778|\uACC4\uC815|\uD50C\uB79C|\uC5F0\uAC04|\uC88C\uC11D)/,
    score: 3,
  },
  { pattern: /(classin|\uD074\uB798\uC2A4\uC778)/i, score: 2 },
]

function collectText(value: unknown, depth = 0): string[] {
  if (value == null || depth > 2) return []
  if (typeof value === "string") return [value]
  if (typeof value === "number" || typeof value === "boolean") return [String(value)]
  if (Array.isArray(value)) return value.flatMap((item) => collectText(item, depth + 1))
  if (typeof value === "object") return Object.values(value).flatMap((item) => collectText(item, depth + 1))
  return []
}

function normalizeText(value: unknown): string {
  return collectText(value)
    .join(" ")
    .normalize("NFKC")
    .replace(/[_/|+()[\]{}.,:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function scoreText(text: string, patterns: PatternScore[]): number {
  return patterns.reduce((total, item) => total + (item.pattern.test(text) ? item.score : 0), 0)
}

export function classifySalesLedgerProductCategory(
  input: SalesLedgerProductCategoryInput,
): SalesLedgerProductCategory {
  const texts: WeightedText[] = [
    { value: input.product, weight: 2 },
    { value: input.account, weight: 1 },
    { value: input.rawText, weight: 1 },
  ]

  let hardwareScore = 0
  let softwareScore = 0

  for (const item of texts) {
    const text = normalizeText(item.value)
    if (!text) continue
    hardwareScore += scoreText(text, HARDWARE_PATTERNS) * item.weight
    softwareScore += scoreText(text, SOFTWARE_PATTERNS) * item.weight
  }

  // Operating rule: only rows with a clear hardware signal are hardware; everything
  // else is software (subscription/recharge variants are still software revenue).
  // "unknown" stays in the type union only for legacy stored metadata.
  if (hardwareScore >= MIN_CATEGORY_SCORE && hardwareScore > softwareScore) return "hardware"
  return "software"
}

export function classifySalesLedgerProductCategoryFromText(
  ...values: unknown[]
): SalesLedgerProductCategory {
  return classifySalesLedgerProductCategory({ rawText: values })
}

// Software subtypes: subscription vs recharge/consumption billing rhythms.
// Non-hardware revenue is all software, but the product numbers view splits
// these rhythms apart. Falls back to "other" when signals are absent or tied.
export type SalesLedgerSoftwareSubtype = "subscription" | "recharge" | "other"

const SUBSCRIPTION_PATTERNS: PatternScore[] = [
  { pattern: /(subscription|annual\s*(plan|seat)?|yearly|license|licence|seat|learning\s*space|business\s*plan)/i, score: 3 },
  {
    // Korean: subscription/annual/license/licence/seat/recurring/plan keywords, ASCII-escaped.
    pattern:
      /(\uAD6C\uB3C5|\uC5F0\uAC04|\uB77C\uC774\uC120\uC2A4|\uB77C\uC774\uC13C\uC2A4|\uC88C\uC11D|\uC815\uAE30|\uD50C\uB79C)/,
    score: 3,
  },
]

const RECHARGE_PATTERNS: PatternScore[] = [
  { pattern: /(consumption|recharge|prepaid|top\s*-?up|credit|coin|point|pay\s*as\s*you\s*go)/i, score: 3 },
  {
    // Korean: recharge/consumption/point/credit/prepaid/metered keywords, ASCII-escaped.
    pattern:
      /(\uCDA9\uC804|\uC18C\uBE44|\uD3EC\uC778\uD2B8|\uD06C\uB808\uB527|\uC120\uBD88|\uC885\uB7C9)/,
    score: 3,
  },
]

export function classifySalesLedgerSoftwareSubtype(
  input: SalesLedgerProductCategoryInput,
): SalesLedgerSoftwareSubtype {
  const texts: WeightedText[] = [
    { value: input.product, weight: 2 },
    { value: input.account, weight: 1 },
    { value: input.rawText, weight: 1 },
  ]

  let subscriptionScore = 0
  let rechargeScore = 0

  for (const item of texts) {
    const text = normalizeText(item.value)
    if (!text) continue
    subscriptionScore += scoreText(text, SUBSCRIPTION_PATTERNS) * item.weight
    rechargeScore += scoreText(text, RECHARGE_PATTERNS) * item.weight
  }

  if (subscriptionScore < MIN_CATEGORY_SCORE && rechargeScore < MIN_CATEGORY_SCORE) return "other"
  if (subscriptionScore === rechargeScore) return "other"
  return subscriptionScore > rechargeScore ? "subscription" : "recharge"
}
