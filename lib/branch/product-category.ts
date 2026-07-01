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

  if (hardwareScore < MIN_CATEGORY_SCORE && softwareScore < MIN_CATEGORY_SCORE) return "unknown"
  if (hardwareScore === softwareScore) return "unknown"
  return hardwareScore > softwareScore ? "hardware" : "software"
}

export function classifySalesLedgerProductCategoryFromText(
  ...values: unknown[]
): SalesLedgerProductCategory {
  return classifySalesLedgerProductCategory({ rawText: values })
}
