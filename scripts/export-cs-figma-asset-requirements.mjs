import { writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { createJiti } from "jiti"

const repoRoot = process.cwd()
const outputPath = join(repoRoot, "docs/active/cs-figma-asset-requirements.md")
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": repoRoot,
  },
})

const { CS_FIGMA_GUIDES } = await jiti.import("../lib/cs-figma-guides.ts")
const {
  CS_FIGMA_ASSET_PATHS,
  findMissingCsFigmaAssetLabels,
  getCsFigmaAssetRequirements,
  normalizeCsFigmaAssetKey,
  normalizeCsFigmaAssetPathKeys,
} = await jiti.import("../lib/cs-figma-assets.ts")

const requirements = getCsFigmaAssetRequirements(CS_FIGMA_GUIDES)
const linkedKeys = new Set(CS_FIGMA_ASSET_PATHS.flatMap((path) => normalizeCsFigmaAssetPathKeys(path)))
const missing = findMissingCsFigmaAssetLabels(CS_FIGMA_GUIDES, CS_FIGMA_ASSET_PATHS)
const missingKeys = new Set(missing.map((item) => normalizeCsFigmaAssetKey(item.sourceImageFile)))
const totalSourceRefs = CS_FIGMA_GUIDES.reduce(
  (total, guide) => total + guide.sourceImageFiles.length,
  0
)
const linkedSourceRefs = totalSourceRefs - missing.length
const linkedRequirementCount = requirements.filter((item) => linkedKeys.has(item.assetKey)).length
const missingRequirements = requirements.filter((item) => missingKeys.has(item.assetKey))

function mdEscape(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim()
}

const lines = [
  "# CS Figma Asset Requirements",
  "",
  "이 문서는 Figma `CS용 캡쳐 모음` 기반 가이드에 연결해야 할 이미지 파일 목록입니다.",
  "",
  "## Summary",
  "",
  `- Source capture refs: ${linkedSourceRefs}/${totalSourceRefs} linked`,
  `- Unique required assets: ${linkedRequirementCount}/${requirements.length} linked`,
  `- Public image files detected: ${CS_FIGMA_ASSET_PATHS.length}`,
  "",
  "## How To Add Images",
  "",
  "1. Figma 원본 캡처를 PNG/WebP/JPG로 export합니다.",
  "2. export 폴더 파일명이 아래 라벨 또는 권장 파일명과 비슷하면 `npm run import:cs-figma-assets -- <export-folder>`로 자동 복사합니다.",
  "3. Figma/browser가 붙인 `@2x`, `(1)`, `copy`, `복사본` suffix는 import 단계에서 자동으로 무시합니다.",
  "4. 자동 매칭이 안 되는 파일은 아래 `Expected public path`와 같은 파일명으로 `public/docs/files/cs-figma/`에 저장합니다.",
  "5. 필요하면 `npm run sync:cs-figma-assets`를 실행해 `lib/cs-figma-assets.generated.ts`를 갱신합니다.",
  "6. `npm run check:cs-figma-assets`로 연결 수를 확인합니다.",
  "",
  "## Missing Assets",
  "",
  "| Expected public path | Source capture label | Used by docs |",
  "| --- | --- | --- |",
]

for (const item of missingRequirements) {
  lines.push(
    `| \`${mdEscape(item.expectedPublicPath)}\` | ${mdEscape(item.sourceImageFile)} | ${item.docPaths
      .map((docPath) => `\`${mdEscape(docPath)}\``)
      .join("<br>")} |`
  )
}

if (missingRequirements.length === 0) {
  lines.push("| - | All required assets are linked. | - |")
}

lines.push("")

writeFileSync(outputPath, `${lines.join("\n")}\n`)

console.log(
  `Exported ${missingRequirements.length} missing CS Figma asset requirements to ${relative(repoRoot, outputPath)}`
)
