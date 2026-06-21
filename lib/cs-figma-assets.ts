import { CS_FIGMA_ASSET_PATHS } from "@/lib/cs-figma-assets.generated"
import { getCsFigmaGuideDocPath, type CsFigmaGuide } from "@/lib/cs-figma-guides"

export interface CsFigmaGuideMedia {
  type: "image"
  src: string
  alt: string
  caption: string
}

export interface MissingCsFigmaAsset {
  guideTitle: string
  docPath: string
  sourceImageFile: string
}

export interface CsFigmaAssetRequirement {
  assetKey: string
  sourceImageFile: string
  expectedPublicPath: string
  docPaths: string[]
  guideTitles: string[]
}

export interface CsFigmaAssetImportItem {
  assetKey: string
  sourcePath: string
  sourceImageFile: string
  targetPublicPath: string
  docPaths: string[]
}

export interface CsFigmaAssetImportPlan {
  matched: CsFigmaAssetImportItem[]
  unmatchedSourcePaths: string[]
  missingRequirements: CsFigmaAssetRequirement[]
}

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|avif)$/i

function getPathBasename(value: string) {
  return value.split("/").filter(Boolean).at(-1) ?? value
}

function stripImageExtension(value: string) {
  return value.replace(IMAGE_EXTENSION_PATTERN, "")
}

function getImageExtension(value: string) {
  const match = value.match(IMAGE_EXTENSION_PATTERN)
  return match?.[0].toLowerCase() ?? ".png"
}

export function normalizeCsFigmaAssetKey(value: string) {
  return stripImageExtension(value)
    .toLowerCase()
    .replace(/설졍/g, "설정")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function slugifyCsFigmaAssetLabel(value: string) {
  return normalizeCsFigmaAssetKey(value)
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function getKnownCsFigmaAssetAliasKeys(label: string) {
  const normalizedLabel = normalizeCsFigmaAssetKey(label)
  const aliasesByKey: Record<string, string[]> = {
    "ai 기능 비활성화": ["classin ai 비활성화 안내"],
    "웹 라이브 사용 방법 안내 대시보드": ["웹 라이브 생성 방법 대시보드"],
    "웹 라이브 사용 방법 안내 앱": ["웹 라이브 생성 방법 앱"],
    "클래스인 마이크 활성화 비활성화 pc": [
      "클래스인 마이크 설정",
      "클래스인 교실 내 카메라 마이크 설정 확인",
      "클래스인 교실 내 카메라 마이크 설정 확인 pc",
    ],
    "클래스인 학생 대리등록 코스 초대": ["클래스인 학생 대리등록 코스 입장"],
  }

  return aliasesByKey[normalizedLabel] ?? []
}

export function suggestCsFigmaAssetPath(sourceImageFile: string) {
  const slug = slugifyCsFigmaAssetLabel(sourceImageFile)
  const extension = getImageExtension(sourceImageFile)
  return `/docs/files/cs-figma/${slug || "cs-figma-capture"}${extension}`
}

function getCsFigmaAssetPathLabels(value: string) {
  const pathParts = value.split("/").filter(Boolean)
  const basename = stripImageExtension(getPathBasename(value))
  const labels = new Set([basename])

  for (let length = 2; length <= Math.min(3, pathParts.length); length += 1) {
    const suffixParts = pathParts.slice(-length)
    labels.add([...suffixParts.slice(0, -1), basename].join(" "))
  }

  return labels
}

function addCommonCsFigmaAssetVariants(label: string, variants: Set<string>) {
  variants.add(label)
  variants.add(label.replace(/@\d+x$/i, ""))
  variants.add(label.replace(/\s*\(\d+\)$/i, ""))
  variants.add(label.replace(/\s+copy$/i, ""))
  variants.add(label.replace(/\s+복사본$/i, ""))
}

function normalizeCsFigmaAssetPathOwnKeys(value: string) {
  const variants = new Set<string>()
  for (const label of getCsFigmaAssetPathLabels(value)) {
    addCommonCsFigmaAssetVariants(label, variants)
  }

  return [...new Set([...variants].map(normalizeCsFigmaAssetKey).filter(Boolean))]
}

export function normalizeCsFigmaAssetPathKeys(value: string) {
  const variants = new Set<string>()
  for (const label of getCsFigmaAssetPathLabels(value)) {
    addCommonCsFigmaAssetVariants(label, variants)
    for (const aliasKey of getKnownCsFigmaAssetAliasKeys(label)) {
      variants.add(aliasKey)
    }
  }

  return [...new Set([...variants].map(normalizeCsFigmaAssetKey).filter(Boolean))]
}

function getAssetPathByKey(assetPaths: readonly string[]) {
  const assetPathByKey = new Map<string, string>()

  for (const assetPath of assetPaths) {
    for (const key of normalizeCsFigmaAssetPathOwnKeys(assetPath)) {
      if (!assetPathByKey.has(key)) assetPathByKey.set(key, assetPath)
    }
  }

  for (const assetPath of assetPaths) {
    for (const key of normalizeCsFigmaAssetPathKeys(assetPath)) {
      if (!assetPathByKey.has(key)) assetPathByKey.set(key, assetPath)
    }
  }
  return assetPathByKey
}

export function buildCsFigmaMediaForGuide(
  guide: CsFigmaGuide,
  assetPaths: readonly string[] = CS_FIGMA_ASSET_PATHS
): CsFigmaGuideMedia[] {
  const assetPathByKey = getAssetPathByKey(assetPaths)
  const media: CsFigmaGuideMedia[] = []

  for (const sourceImageFile of guide.sourceImageFiles) {
    const key = normalizeCsFigmaAssetKey(sourceImageFile)
    const src = assetPathByKey.get(key)
    if (!src) continue

    media.push({
      type: "image",
      src,
      alt: `${guide.title} 원본 캡처 - ${sourceImageFile}`,
      caption: `Figma 원본 캡처: ${sourceImageFile}`,
    })
  }

  return media
}

export function findMissingCsFigmaAssetLabels(
  guides: readonly CsFigmaGuide[],
  assetPaths: readonly string[] = CS_FIGMA_ASSET_PATHS
): MissingCsFigmaAsset[] {
  const assetPathByKey = getAssetPathByKey(assetPaths)
  const missing: MissingCsFigmaAsset[] = []

  for (const guide of guides) {
    for (const sourceImageFile of guide.sourceImageFiles) {
      const key = normalizeCsFigmaAssetKey(sourceImageFile)
      if (key && assetPathByKey.has(key)) continue
      missing.push({
        guideTitle: guide.title,
        docPath: getCsFigmaGuideDocPath(guide),
        sourceImageFile,
      })
    }
  }

  return missing
}

export function getCsFigmaAssetRequirements(guides: readonly CsFigmaGuide[]) {
  const requirementsByKey = new Map<string, CsFigmaAssetRequirement>()

  for (const guide of guides) {
    const docPath = getCsFigmaGuideDocPath(guide)

    for (const sourceImageFile of guide.sourceImageFiles) {
      const assetKey = normalizeCsFigmaAssetKey(sourceImageFile)
      if (!assetKey) continue

      const existing = requirementsByKey.get(assetKey)
      if (existing) {
        if (!existing.docPaths.includes(docPath)) existing.docPaths.push(docPath)
        if (!existing.guideTitles.includes(guide.title)) existing.guideTitles.push(guide.title)
        continue
      }

      requirementsByKey.set(assetKey, {
        assetKey,
        sourceImageFile,
        expectedPublicPath: suggestCsFigmaAssetPath(sourceImageFile),
        docPaths: [docPath],
        guideTitles: [guide.title],
      })
    }
  }

  return [...requirementsByKey.values()]
}

export function buildCsFigmaAssetImportPlan(
  guides: readonly CsFigmaGuide[],
  sourcePaths: readonly string[]
): CsFigmaAssetImportPlan {
  const requirements = getCsFigmaAssetRequirements(guides)
  const requirementByKey = new Map(requirements.map((item) => [item.assetKey, item]))
  const matchedKeys = new Set<string>()
  const matched: CsFigmaAssetImportItem[] = []
  const unmatchedSourcePaths: string[] = []

  for (const sourcePath of sourcePaths) {
    let matchedSource = false
    for (const candidateKey of normalizeCsFigmaAssetPathKeys(sourcePath)) {
      const candidateRequirement = requirementByKey.get(candidateKey)
      if (!candidateRequirement) continue
      matchedSource = true
      if (matchedKeys.has(candidateKey)) continue

      matchedKeys.add(candidateKey)
      matched.push({
        assetKey: candidateKey,
        sourcePath,
        sourceImageFile: candidateRequirement.sourceImageFile,
        targetPublicPath: candidateRequirement.expectedPublicPath,
        docPaths: candidateRequirement.docPaths,
      })
    }
    if (!matchedSource) unmatchedSourcePaths.push(sourcePath)
  }

  return {
    matched,
    unmatchedSourcePaths,
    missingRequirements: requirements.filter((item) => !matchedKeys.has(item.assetKey)),
  }
}

export { CS_FIGMA_ASSET_PATHS }
