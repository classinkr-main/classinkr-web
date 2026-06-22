/**
 * CS 합성 캡처(Figma 보드 export)를 패널 단위로 분할한다.
 *
 * 방식: 배경(흰 캔버스/투명)을 기준으로 행 → 열 2단계 whitespace 투영 컷.
 *  - 전체 너비를 가로지르는 빈 띠(가터)로 행을 나누고, 각 행 안에서 전체 높이를
 *    가로지르는 빈 띠로 열을 나눈다. (격자/세로 스택/단일 모두 커버)
 *  - 주석 화살표가 가터를 살짝 지나도 끊기지 않게 EPS 여유를 둔다.
 *  - 각 셀은 sharp.trim 으로 주변 여백을 제거한다.
 *
 * CLI:  node scripts/segment-cs-figma.mjs <imagePath> [--out <dir>] [--json]
 *   --json  : 패널 박스(원본 좌표)만 JSON 으로 출력(파일 미저장)
 *   --out   : 패널 PNG 저장 디렉터리(기본: 미저장)
 */
import sharp from "sharp"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const PROJ_MAX = 1100 // 투영 계산용 다운스케일 최대 변
const BG_DIST = 26 // 배경과의 RGB 거리 임계(이상이면 content)
const EPS = 0.006 // 가터 판정: content 비율이 이 값 미만이면 빈 줄로 간주(얇은 화살표 허용)
const MIN_GUT_FRAC = 0.012 // 최소 가터 두께(해당 축 길이 대비)
const MIN_PANEL_FRAC = 0.04 // 최소 패널 변 길이(해당 축 대비) — 라벨 조각 방지
const MIN_CONTENT_FRAC = 0.012 // 셀이 패널로 인정되려면 최소 이만큼은 content

export async function segmentComposite(imagePath) {
  const meta = await sharp(imagePath).metadata()
  const W = meta.width
  const H = meta.height
  const scale = Math.min(1, PROJ_MAX / Math.max(W, H))
  const sw = Math.max(1, Math.round(W * scale))
  const sh = Math.max(1, Math.round(H * scale))

  const { data, info } = await sharp(imagePath)
    .resize(sw, sh, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const ch = info.channels
  const width = info.width
  const height = info.height

  // 배경색 = 네 모서리 평균
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ]
  let br = 0, bg = 0, bb = 0
  for (const [x, y] of corners) {
    const i = (y * width + x) * ch
    br += data[i]; bg += data[i + 1]; bb += data[i + 2]
  }
  br /= 4; bg /= 4; bb /= 4

  const isContent = (x, y) => {
    const i = (y * width + x) * ch
    const a = ch === 4 ? data[i + 3] : 255
    if (a < 128) return false // 투명 = 배경
    const dr = data[i] - br, dg = data[i + 1] - bg, db = data[i + 2] - bb
    return Math.abs(dr) + Math.abs(dg) + Math.abs(db) > BG_DIST
  }

  // 주어진 사각형 안에서 axis 방향 가터로 분할 구간을 찾는다.
  // axis="row": y 를 스캔, 각 행의 [x0,x1) content 비율로 빈 띠 탐색.
  const splitBands = (x0, y0, x1, y1, axis) => {
    const start = axis === "row" ? y0 : x0
    const end = axis === "row" ? y1 : x1
    const span = (axis === "row" ? x1 - x0 : y1 - y0)
    const minGut = Math.max(3, Math.round((end - start) * MIN_GUT_FRAC))
    const minPanel = Math.max(3, Math.round((end - start) * MIN_PANEL_FRAC))

    const empty = new Array(end - start)
    for (let p = start; p < end; p++) {
      let content = 0
      if (axis === "row") {
        for (let x = x0; x < x1; x++) if (isContent(x, p)) content++
      } else {
        for (let y = y0; y < y1; y++) if (isContent(p, y)) content++
      }
      empty[p - start] = content / span < EPS
    }

    // content 구간(밴드) 추출: 빈 줄이 minGut 이상 연속이면 분리자
    const bands = []
    let runStart = -1
    let gap = 0
    for (let k = 0; k < empty.length; k++) {
      if (empty[k]) {
        gap++
      } else {
        if (runStart < 0) runStart = k
        gap = 0
      }
      // content 밴드 종료 판정
      if (runStart >= 0 && gap >= minGut) {
        bands.push([start + runStart, start + (k - gap) + 1])
        runStart = -1
      }
    }
    if (runStart >= 0) bands.push([start + runStart, end])

    // 너무 작은 밴드는 버린다
    return bands.filter(([a, b]) => b - a >= minPanel)
  }

  const cellContentFrac = (x0, y0, x1, y1) => {
    let c = 0
    const total = (x1 - x0) * (y1 - y0)
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) if (isContent(x, y)) c++
    return c / Math.max(1, total)
  }

  // 행 → 열 2단계 컷
  const panels = []
  const rowBands = splitBands(0, 0, width, height, "row")
  const rows = rowBands.length > 0 ? rowBands : [[0, height]]
  for (const [ry0, ry1] of rows) {
    const colBands = splitBands(0, ry0, width, ry1, "col")
    const cols = colBands.length > 0 ? colBands : [[0, width]]
    for (const [cx0, cx1] of cols) {
      if (cellContentFrac(cx0, ry0, cx1, ry1) < MIN_CONTENT_FRAC) continue
      // 다운스케일 좌표 → 원본 좌표
      panels.push({
        left: Math.round(cx0 / scale),
        top: Math.round(ry0 / scale),
        width: Math.round((cx1 - cx0) / scale),
        height: Math.round((ry1 - ry0) / scale),
      })
    }
  }

  // 원본 좌표 클램프
  const clamped = panels.map((p) => {
    const left = Math.max(0, Math.min(p.left, W - 1))
    const top = Math.max(0, Math.min(p.top, H - 1))
    return {
      left,
      top,
      width: Math.max(1, Math.min(p.width, W - left)),
      height: Math.max(1, Math.min(p.height, H - top)),
    }
  })

  return { width: W, height: H, background: { r: Math.round(br), g: Math.round(bg), b: Math.round(bb) }, panels: clamped }
}

/**
 * 비전 에이전트가 알려준 배치(예: "3 cols", "5 rows")로 정확히 K등분한다.
 * 임계값이 아니라 "가장 큰 빈 골짜기 K-1개"를 컷 지점으로 써서 얇은 가터도 안정적으로 자른다.
 */
export async function splitByCount(imagePath, axis, count) {
  const meta = await sharp(imagePath).metadata()
  const W = meta.width, H = meta.height
  const scale = Math.min(1, PROJ_MAX / Math.max(W, H))
  const sw = Math.max(1, Math.round(W * scale)), sh = Math.max(1, Math.round(H * scale))
  const { data, info } = await sharp(imagePath).resize(sw, sh, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const ch = info.channels, width = info.width, height = info.height
  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]
  let br = 0, bg = 0, bb = 0
  for (const [x, y] of corners) { const i = (y * width + x) * ch; br += data[i]; bg += data[i + 1]; bb += data[i + 2] }
  br /= 4; bg /= 4; bb /= 4
  const isContent = (x, y) => {
    const i = (y * width + x) * ch
    const a = ch === 4 ? data[i + 3] : 255
    if (a < 128) return false
    return Math.abs(data[i] - br) + Math.abs(data[i + 1] - bg) + Math.abs(data[i + 2] - bb) > BG_DIST
  }
  const n = axis === "rows" ? height : width
  const empty = new Array(n)
  for (let p = 0; p < n; p++) {
    let content = 0
    if (axis === "rows") { for (let x = 0; x < width; x++) if (isContent(x, p)) content++; empty[p] = content / width < EPS }
    else { for (let y = 0; y < height; y++) if (isContent(p, y)) content++; empty[p] = content / height < EPS }
  }
  // 빈 골짜기(run) 수집
  const valleys = []
  let s = -1
  for (let k = 0; k <= n; k++) {
    if (k < n && empty[k]) { if (s < 0) s = k }
    else if (s >= 0) { valleys.push({ start: s, end: k, len: k - s, mid: Math.round((s + k) / 2) }); s = -1 }
  }
  // 가장 큰 골짜기 count-1 개를 컷으로
  const cuts = valleys.sort((a, b) => b.len - a.len).slice(0, Math.max(0, count - 1)).map((v) => v.mid).sort((a, b) => a - b)
  const bounds = [0, ...cuts, n]
  const panels = []
  for (let k = 0; k < bounds.length - 1; k++) {
    const a = bounds[k], b = bounds[k + 1]
    if (axis === "rows") panels.push({ left: 0, top: Math.round(a / scale), width: W, height: Math.round((b - a) / scale) })
    else panels.push({ left: Math.round(a / scale), top: 0, width: Math.round((b - a) / scale), height: H })
  }
  return { width: W, height: H, panels }
}

/**
 * 규칙적 격자(rows×cols)를 균등 분할한다. (흰 배경 스크린샷도 안정적 — 투영 불필요)
 * 각 셀은 writePanels 에서 trim 으로 여백 제거. 읽기 순서(좌→우, 위→아래)로 반환.
 */
export async function splitGrid(imagePath, rows, cols) {
  const meta = await sharp(imagePath).metadata()
  const W = meta.width, H = meta.height
  const cw = Math.floor(W / cols), chh = Math.floor(H / rows)
  const panels = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const left = c * cw, top = r * chh
      panels.push({
        left,
        top,
        width: c === cols - 1 ? W - left : cw,
        height: r === rows - 1 ? H - top : chh,
      })
    }
  }
  return { width: W, height: H, rows, cols, panels }
}

export async function writePanels(imagePath, panels, outDir) {
  await mkdir(outDir, { recursive: true })
  const out = []
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i]
    const buf = await sharp(imagePath).extract(p).toBuffer()
    const trimmed = await sharp(buf).trim({ threshold: 12 }).toBuffer().catch(() => buf)
    const file = path.join(outDir, `panel-${i + 1}.png`)
    await sharp(trimmed).toFile(file)
    const m = await sharp(file).metadata()
    out.push({ file, width: m.width, height: m.height })
  }
  return out
}

// CLI (직접 실행할 때만; import 시에는 실행하지 않는다)
import { pathToFileURL } from "node:url"
const isMain = import.meta.url === pathToFileURL(process.argv[1] || "").href
const argv = process.argv.slice(2)
if (isMain && argv.length > 0 && !argv[0].startsWith("--")) {
  const imagePath = argv[0]
  const outIdx = argv.indexOf("--out")
  const outDir = outIdx >= 0 ? argv[outIdx + 1] : null
  const jsonOnly = argv.includes("--json")
  const colsIdx = argv.indexOf("--cols")
  const rowsIdx = argv.indexOf("--rows")
  const gridIdx = argv.indexOf("--grid")
  let result
  if (gridIdx >= 0) {
    const [r, c] = argv[gridIdx + 1].split("x").map(Number)
    result = await splitGrid(imagePath, r, c)
  } else if (colsIdx >= 0) result = await splitByCount(imagePath, "cols", Number(argv[colsIdx + 1]))
  else if (rowsIdx >= 0) result = await splitByCount(imagePath, "rows", Number(argv[rowsIdx + 1]))
  else result = await segmentComposite(imagePath)
  if (outDir) result.written = await writePanels(imagePath, result.panels, outDir)
  if (jsonOnly) {
    console.log(JSON.stringify({ image: imagePath, ...result }))
  } else {
    console.log(`${path.basename(imagePath)} (${result.width}x${result.height}) -> ${result.panels.length} panel(s)`)
    result.panels.forEach((p, i) => console.log(`  panel-${i + 1}: ${p.width}x${p.height} @ (${p.left},${p.top})`))
    if (result.written) result.written.forEach((w, i) => console.log(`  wrote panel-${i + 1}: ${w.width}x${w.height}`))
  }
}
