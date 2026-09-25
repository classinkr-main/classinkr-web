import { createJiti } from "jiti"

const repoRoot = process.cwd()
const strict = process.argv.includes("--strict")
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": repoRoot,
  },
})

// 공개 문서용 자산만 다룬다 — 내부 전용 가이드 캡처는 public/에 두지 않는다.
const { CS_FIGMA_PUBLIC_GUIDES: CS_FIGMA_GUIDES } = await jiti.import("../lib/cs-figma-guides.ts")
const {
  CS_FIGMA_ASSET_PATHS,
  findMissingCsFigmaAssetLabels,
  getCsFigmaAssetRequirements,
  normalizeCsFigmaAssetPathKeys,
} = await jiti.import("../lib/cs-figma-assets.ts")

const expectedCount = CS_FIGMA_GUIDES.reduce(
  (total, guide) => total + guide.sourceImageFiles.length,
  0
)
const missing = findMissingCsFigmaAssetLabels(CS_FIGMA_GUIDES, CS_FIGMA_ASSET_PATHS)
const requirements = getCsFigmaAssetRequirements(CS_FIGMA_GUIDES)
const linkedKeys = new Set(CS_FIGMA_ASSET_PATHS.flatMap((path) => normalizeCsFigmaAssetPathKeys(path)))
const linkedRequirementCount = requirements.filter((item) => linkedKeys.has(item.assetKey)).length
const linkedCount = expectedCount - missing.length

console.log(
  `CS Figma asset coverage: ${linkedCount}/${expectedCount} source captures linked (${CS_FIGMA_ASSET_PATHS.length} public image files).`
)
console.log(
  `CS Figma unique asset coverage: ${linkedRequirementCount}/${requirements.length} required image files linked.`
)

if (missing.length > 0) {
  console.log("Missing source captures:")
  for (const item of missing.slice(0, 40)) {
    console.log(`- ${item.docPath} :: ${item.sourceImageFile}`)
  }
  if (missing.length > 40) console.log(`...and ${missing.length - 40} more`)
  console.log("Run `npm run export:cs-figma-assets` for the full expected filename/path list.")
}

if (strict && missing.length > 0) {
  process.exitCode = 1
}
