/**
 * Figma 안내 화면 원본(public/docs/files/cs-figma/*.png)의 개인정보를 제자리에서 가린다.
 *
 * 이 원본들은 비공개(unlisted) 사용법 문서와 챗봇 답변에 그대로 붙고, URL 로도 바로 열린다.
 * 고객 학원 계정에서 찍은 화면이라 학원명·사람 이름·연락처·계정 ID·재생 링크·잔액이 남아 있을 수 있어
 * scripts/cs-figma-capture-masks/*.json 에 적은 영역을 흐리거나 덮어 쓴다.
 * 원본 기준 0~1 분수 좌표를 쓴다. 이미 가린 곳을 다시 가려도 결과는 같다(멱등에 가깝다).
 *
 * 사용법
 *   node scripts/sanitize-cs-figma-captures.mjs [--only <파일명 일부>] [--preview <dir>]
 */
import sharp from "sharp"
import { mkdirSync, readFileSync, readdirSync, renameSync } from "node:fs"
import path from "node:path"

const SPEC_DIR = "scripts/cs-figma-capture-masks"

const clamp01 = (v) => Math.max(0, Math.min(1, v))

function fracBox(box, width, height) {
  const left = Math.round(clamp01(box.x) * width)
  const top = Math.round(clamp01(box.y) * height)
  return {
    left,
    top,
    width: Math.max(1, Math.min(width - left, Math.round(clamp01(box.w) * width))),
    height: Math.max(1, Math.min(height - top, Math.round(clamp01(box.h) * height))),
  }
}

async function sanitize(entry, previewDir) {
  const file = entry.file
  const input = readFileSync(file)
  const meta = await sharp(input).metadata()
  const base = sharp(input).ensureAlpha()
  const composites = []
  for (const mask of entry.masks ?? []) {
    const box = fracBox(mask, meta.width, meta.height)
    if (mask.style === "fill") {
      composites.push({
        input: { create: { width: box.width, height: box.height, channels: 4, background: mask.color ?? "#E9E9E6" } },
        left: box.left,
        top: box.top,
      })
      continue
    }
    const sigma = Math.max(8, Math.round(Math.min(box.width, box.height) / 3))
    const blurred = await sharp(input).ensureAlpha().extract(box).blur(sigma).png().toBuffer()
    composites.push({ input: blurred, left: box.left, top: box.top })
  }
  if (composites.length === 0) return { file, masks: 0 }

  const output = await base.composite(composites).png({ compressionLevel: 9 }).toBuffer()
  // 다른 작업이 같은 원본을 읽는 중일 수 있어 임시 파일에 쓴 뒤 이름을 바꾼다.
  const tmp = `${file}.tmp-${process.pid}`
  await sharp(output).toFile(tmp)
  renameSync(tmp, file)
  if (previewDir) {
    mkdirSync(previewDir, { recursive: true })
    await sharp(output)
      .resize({ width: 1400, withoutEnlargement: true })
      .png()
      .toFile(path.join(previewDir, path.basename(file)))
  }
  return { file, masks: composites.length }
}

async function main() {
  const args = process.argv.slice(2)
  const onlyIndex = args.indexOf("--only")
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined
  const previewIndex = args.indexOf("--preview")
  const previewDir = previewIndex >= 0 ? args[previewIndex + 1] : undefined

  const specFiles = readdirSync(SPEC_DIR).filter((name) => name.endsWith(".json")).sort()
  for (const specFile of specFiles) {
    const spec = JSON.parse(readFileSync(path.join(SPEC_DIR, specFile), "utf8"))
    for (const entry of spec.files ?? []) {
      if (only && !entry.file.includes(only)) continue
      console.log(JSON.stringify(await sanitize(entry, previewDir)))
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
