import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { dirname, extname, join, relative, sep } from "node:path"
import { execFileSync } from "node:child_process"
import { createJiti } from "jiti"

const repoRoot = process.cwd()
const args = process.argv.slice(2)
const sourceDir = args.find((arg) => !arg.startsWith("--"))
const dryRun = process.argv.includes("--dry-run")
const overwrite = process.argv.includes("--overwrite")
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"])

if (!sourceDir) {
  console.error("Usage: npm run import:cs-figma-assets -- <export-folder> [--dry-run] [--overwrite]")
  process.exit(1)
}

const absoluteSourceDir = sourceDir.startsWith("/") ? sourceDir : join(repoRoot, sourceDir)
if (!existsSync(absoluteSourceDir)) {
  console.error(`Source folder does not exist: ${absoluteSourceDir}`)
  process.exit(1)
}

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": repoRoot,
  },
})

const { CS_FIGMA_GUIDES } = await jiti.import("../lib/cs-figma-guides.ts")
const { buildCsFigmaAssetImportPlan } = await jiti.import("../lib/cs-figma-assets.ts")

function listImageFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listImageFiles(fullPath))
      continue
    }
    if (imageExtensions.has(extname(entry.name).toLowerCase())) files.push(fullPath)
  }
  return files
}

const sourcePaths = listImageFiles(absoluteSourceDir)
const importPlan = buildCsFigmaAssetImportPlan(CS_FIGMA_GUIDES, sourcePaths)
let copied = 0
let skippedExisting = 0

for (const item of importPlan.matched) {
  const targetPath = join(repoRoot, "public", item.targetPublicPath.replace(/^\//, "").split("/").join(sep))
  const exists = existsSync(targetPath)
  if (exists && !overwrite) {
    skippedExisting += 1
    continue
  }

  if (!dryRun) {
    mkdirSync(dirname(targetPath), { recursive: true })
    copyFileSync(item.sourcePath, targetPath)
  }
  copied += 1
}

console.log(`CS Figma import source files: ${sourcePaths.length}`)
console.log(`Matched required assets: ${importPlan.matched.length}`)
console.log(`${dryRun ? "Would copy" : "Copied"}: ${copied}`)
if (skippedExisting > 0) console.log(`Skipped existing files: ${skippedExisting} (use --overwrite to replace)`)
if (importPlan.unmatchedSourcePaths.length > 0) {
  console.log(`Unmatched source files: ${importPlan.unmatchedSourcePaths.length}`)
  for (const item of importPlan.unmatchedSourcePaths.slice(0, 20)) {
    console.log(`- ${relative(absoluteSourceDir, item)}`)
  }
  if (importPlan.unmatchedSourcePaths.length > 20) {
    console.log(`...and ${importPlan.unmatchedSourcePaths.length - 20} more`)
  }
}
console.log(`Still missing required assets after this import plan: ${importPlan.missingRequirements.length}`)

if (!dryRun) {
  execFileSync("node", ["scripts/generate-cs-figma-assets-manifest.mjs"], {
    cwd: repoRoot,
    stdio: "inherit",
  })
  execFileSync("node", ["scripts/export-cs-figma-asset-requirements.mjs"], {
    cwd: repoRoot,
    stdio: "inherit",
  })
}
