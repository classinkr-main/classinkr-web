/**
 * 문서센터 가이드 사진 빌더.
 *
 * Figma 캡처(public/docs/files/cs-figma/*.png)나 공식 PDF 매뉴얼에서 필요한 화면만 잘라
 * 개인정보 영역을 가린 뒤 webp로 저장한다. 어떤 원본의 어디를 잘랐고 무엇을 가렸는지는
 * scripts/docs-guide-shots/<그룹>.json 에 남겨 다시 만들고 검토할 수 있게 한다.
 *
 * 사용법
 *   node scripts/build-docs-guide-shots.mjs <spec.json> [--only <out 경로 일부>] [--preview <dir>]
 *   node scripts/build-docs-guide-shots.mjs --grid <원본> <out.png>   # 10% 눈금을 그린 확인용 이미지
 *   node scripts/build-docs-guide-shots.mjs --panels <원본>           # 흰 여백 기준 패널 박스(분수 좌표)
 *
 * 원본 표기
 *   "public/docs/files/cs-figma/수업-삭제-방법.png"
 *   "public/docs/files/classin-signup-pc.pdf#2"   (2쪽, pdftoppm 필요)
 *
 * spec 형식
 *   {
 *     "shots": [{
 *       "out": "/docs/files/guides/signup/01-signup-button.webp",  // public 기준 경로
 *       "source": "...",
 *       "crop": { "x": 0.1, "y": 0.2, "w": 0.5, "h": 0.3 },        // 원본 기준 0~1 분수. 생략하면 전체
 *       "masks": [{ "x": 0.1, "y": 0.1, "w": 0.2, "h": 0.05, "style": "blur" | "fill", "reason": "학원명" }],
 *                                                                   // 잘라낸 화면 기준 0~1 분수
 *       "maxWidth": 1200
 *     }]
 *   }
 */
import sharp from "sharp"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const PUBLIC_DIR = "public"
const DEFAULT_MAX_WIDTH = 1200
const PDF_DPI = 200

const pdfCache = new Map()

function renderPdfPage(pdfPath, page) {
  const key = `${pdfPath}#${page}`
  if (pdfCache.has(key)) return pdfCache.get(key)
  const dir = mkdtempSync(path.join(os.tmpdir(), "docs-shot-pdf-"))
  const prefix = path.join(dir, "page")
  execFileSync("pdftoppm", ["-r", String(PDF_DPI), "-png", "-f", String(page), "-l", String(page), "-singlefile", pdfPath, prefix])
  const out = `${prefix}.png`
  pdfCache.set(key, out)
  return out
}

function resolveSource(source) {
  const [file, pageRaw] = source.split("#")
  if (!existsSync(file)) throw new Error(`원본이 없습니다: ${file}`)
  if (file.toLowerCase().endsWith(".pdf")) {
    const page = Number(pageRaw || 1)
    return renderPdfPage(file, page)
  }
  return file
}

const clamp01 = (v) => Math.max(0, Math.min(1, v))

function fracBox(box, width, height) {
  const x = Math.round(clamp01(box.x) * width)
  const y = Math.round(clamp01(box.y) * height)
  const w = Math.max(1, Math.min(width - x, Math.round(clamp01(box.w) * width)))
  const h = Math.max(1, Math.min(height - y, Math.round(clamp01(box.h) * height)))
  return { left: x, top: y, width: w, height: h }
}

async function applyMasks(buffer, masks) {
  if (!masks?.length) return buffer
  const meta = await sharp(buffer).metadata()
  const composites = []
  for (const mask of masks) {
    const box = fracBox(mask, meta.width, meta.height)
    if (mask.style === "fill") {
      composites.push({
        input: {
          create: { width: box.width, height: box.height, channels: 4, background: mask.color ?? "#E9E9E6" },
        },
        left: box.left,
        top: box.top,
      })
      continue
    }
    // 블러: 영역을 잘라 강하게 흐린 뒤 제자리에 덮는다. 글자를 읽을 수 없게 sigma 를 넉넉히 준다.
    const sigma = Math.max(8, Math.round(Math.min(box.width, box.height) / 3))
    const blurred = await sharp(buffer).extract(box).blur(sigma).toBuffer()
    composites.push({ input: blurred, left: box.left, top: box.top })
  }
  return sharp(buffer).composite(composites).png().toBuffer()
}

async function buildShot(shot, previewDir) {
  const sourcePath = resolveSource(shot.source)
  const meta = await sharp(sourcePath).metadata()
  const crop = shot.crop ? fracBox(shot.crop, meta.width, meta.height) : { left: 0, top: 0, width: meta.width, height: meta.height }
  let buffer = await sharp(sourcePath).extract(crop).flatten({ background: "#ffffff" }).png().toBuffer()
  buffer = await applyMasks(buffer, shot.masks)

  const maxWidth = shot.maxWidth ?? DEFAULT_MAX_WIDTH
  const resized = sharp(buffer).resize({ width: maxWidth, withoutEnlargement: true })
  const outPath = path.join(PUBLIC_DIR, shot.out.replace(/^\//, ""))
  mkdirSync(path.dirname(outPath), { recursive: true })
  const info = await resized.clone().webp({ quality: 82 }).toFile(outPath)
  if (previewDir) {
    mkdirSync(previewDir, { recursive: true })
    const previewName = shot.out.replace(/^\//, "").replace(/[\\/]/g, "__").replace(/\.webp$/, ".png")
    await resized.clone().png().toFile(path.join(previewDir, previewName))
  }
  return { out: shot.out, width: info.width, height: info.height, bytes: info.size }
}

async function drawGrid(source, outPng) {
  const sourcePath = resolveSource(source)
  const meta = await sharp(sourcePath).metadata()
  const scale = Math.min(1, 1600 / Math.max(meta.width, meta.height))
  const W = Math.round(meta.width * scale)
  const H = Math.round(meta.height * scale)
  const lines = []
  for (let i = 1; i < 20; i++) {
    const strong = i % 2 === 0
    const color = strong ? "rgba(255,0,0,0.75)" : "rgba(0,120,255,0.45)"
    const x = (W * i) / 20
    const y = (H * i) / 20
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${color}" stroke-width="1"/>`)
    lines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${color}" stroke-width="1"/>`)
    if (strong) {
      lines.push(`<text x="${x + 2}" y="12" font-size="12" fill="red" font-family="sans-serif">${(i / 20).toFixed(1)}</text>`)
      lines.push(`<text x="2" y="${y - 2}" font-size="12" fill="red" font-family="sans-serif">${(i / 20).toFixed(1)}</text>`)
    }
  }
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${lines.join("")}</svg>`)
  mkdirSync(path.dirname(outPng), { recursive: true })
  await sharp(sourcePath).resize(W, H).flatten({ background: "#ffffff" }).composite([{ input: svg }]).png().toFile(outPng)
  console.log(JSON.stringify({ source, width: meta.width, height: meta.height, grid: outPng }))
}

async function printPanels(source) {
  const { segmentComposite } = await import("./segment-cs-figma.mjs")
  const sourcePath = resolveSource(source)
  const meta = await sharp(sourcePath).metadata()
  const result = await segmentComposite(sourcePath)
  const panels = (result.panels ?? result).map((p, index) => ({
    index: index + 1,
    x: +(p.left / meta.width).toFixed(4),
    y: +(p.top / meta.height).toFixed(4),
    w: +(p.width / meta.width).toFixed(4),
    h: +(p.height / meta.height).toFixed(4),
  }))
  console.log(JSON.stringify({ source, width: meta.width, height: meta.height, panels }, null, 1))
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--grid") return drawGrid(args[1], args[2])
  if (args[0] === "--panels") return printPanels(args[1])

  const specPath = args[0]
  if (!specPath) {
    console.error("usage: node scripts/build-docs-guide-shots.mjs <spec.json> [--only <text>] [--preview <dir>]")
    process.exit(1)
  }
  const onlyIndex = args.indexOf("--only")
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined
  const previewIndex = args.indexOf("--preview")
  const previewDir = previewIndex >= 0 ? args[previewIndex + 1] : undefined

  const specs = specPath === "--all"
    ? readdirSync("scripts/docs-guide-shots").filter((f) => f.endsWith(".json")).map((f) => path.join("scripts/docs-guide-shots", f))
    : [specPath]

  for (const file of specs) {
    const spec = JSON.parse(readFileSync(file, "utf8"))
    for (const shot of spec.shots ?? []) {
      if (only && !shot.out.includes(only)) continue
      const result = await buildShot(shot, previewDir)
      console.log(JSON.stringify(result))
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
