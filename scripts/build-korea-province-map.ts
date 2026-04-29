/* eslint-disable */
/**
 * One-shot generator: kostat 2018 GeoJSON → lib/branch/korea-province-map.ts
 *
 * Run: npx tsx scripts/build-korea-province-map.ts
 *
 * Source: https://github.com/southkorea/southkorea-maps (MIT)
 *   tmp/skorea-provinces-2018-geo.json (downloaded manually, 7.5MB)
 *
 * Output: lib/branch/korea-province-map.ts (drop-in replacement,
 * preserves the existing KoreaProvinceShape interface and label vocabulary).
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

type Position = [number, number]
type Ring = Position[]
type Polygon = Ring[]
type MultiPolygon = Polygon[]

interface Feature {
  type: "Feature"
  properties: { name: string; code: string }
  geometry:
    | { type: "Polygon"; coordinates: Polygon }
    | { type: "MultiPolygon"; coordinates: MultiPolygon }
}
interface FC { type: "FeatureCollection"; features: Feature[] }

// 정식명 → 단축 라벨 (existing KOREA_PROVINCE_SHAPES vocabulary)
const SHORT_NAME: Record<string, string> = {
  "서울특별시": "서울",
  "부산광역시": "부산",
  "대구광역시": "대구",
  "인천광역시": "인천",
  "광주광역시": "광주",
  "대전광역시": "대전",
  "울산광역시": "울산",
  "세종특별자치시": "세종",
  "경기도": "경기",
  "강원도": "강원",
  "충청북도": "충북",
  "충청남도": "충남",
  "전라북도": "전북",
  "전라남도": "전남",
  "경상북도": "경북",
  "경상남도": "경남",
  "제주특별자치도": "제주",
}

// Target viewBox proportions — match the previous file so component
// styling constants (fontSize, strokeWidth, label offsets) stay valid.
const TARGET_WIDTH = 130

// Equirectangular projection with latitude correction. Korea is small enough
// that a proper conic isn't required for visual fidelity.
function projectFactory(allCoords: Position[]) {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const [lng, lat] of allCoords) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  const cx = (minLng + maxLng) / 2
  const cy = (minLat + maxLat) / 2
  const cosLat = Math.cos((cy * Math.PI) / 180)
  // Geographic span in projected units
  const projW = (maxLng - minLng) * cosLat
  const projH = maxLat - minLat
  const scale = TARGET_WIDTH / projW
  const targetHeight = projH * scale
  const project = ([lng, lat]: Position): Position => {
    const x = (lng - minLng) * cosLat * scale
    // SVG y increases downward; geo lat increases upward — invert.
    const y = (maxLat - lat) * scale
    return [x, y]
  }
  return { project, width: TARGET_WIDTH, height: targetHeight, cx, cy, cosLat, scale, minLng, maxLat }
}

// Douglas–Peucker simplification on a single ring.
function simplifyRing(ring: Ring, tolerance: number): Ring {
  if (ring.length < 4) return ring
  const sqTol = tolerance * tolerance
  const keep = new Uint8Array(ring.length)
  keep[0] = 1
  keep[ring.length - 1] = 1

  const stack: Array<[number, number]> = [[0, ring.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()!
    let maxSqDist = 0
    let index = 0
    const [ax, ay] = ring[first]
    const [bx, by] = ring[last]
    for (let i = first + 1; i < last; i++) {
      const [px, py] = ring[i]
      const sqDist = perpSqDist(px, py, ax, ay, bx, by)
      if (sqDist > maxSqDist) { maxSqDist = sqDist; index = i }
    }
    if (maxSqDist > sqTol) {
      keep[index] = 1
      stack.push([first, index])
      stack.push([index, last])
    }
  }
  const out: Ring = []
  for (let i = 0; i < ring.length; i++) if (keep[i]) out.push(ring[i])
  return out
}

function perpSqDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  let x = ax, y = ay
  let dx = bx - ax, dy = by - ay
  if (dx !== 0 || dy !== 0) {
    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    if (t > 1) { x = bx; y = by }
    else if (t > 0) { x = ax + dx * t; y = ay + dy * t }
  }
  dx = px - x; dy = py - y
  return dx * dx + dy * dy
}

function ringToPath(ring: Ring): string {
  if (ring.length === 0) return ""
  const parts: string[] = []
  parts.push(`M${fmt(ring[0][0])},${fmt(ring[0][1])}`)
  for (let i = 1; i < ring.length; i++) {
    parts.push(`L${fmt(ring[i][0])},${fmt(ring[i][1])}`)
  }
  parts.push("Z")
  return parts.join("")
}
function fmt(n: number) { return Number(n.toFixed(2)).toString() }

function ringArea(ring: Ring): number {
  let a = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % n]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}
function ringCentroid(ring: Ring): Position {
  let cx = 0, cy = 0, area = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % n]
    const f = x1 * y2 - x2 * y1
    area += f
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  area /= 2
  if (area === 0) {
    // degenerate — fall back to bbox center
    let xs = 0, ys = 0
    for (const [x, y] of ring) { xs += x; ys += y }
    return [xs / ring.length, ys / ring.length]
  }
  return [cx / (6 * area), cy / (6 * area)]
}

function main() {
  const fcPath = join(process.cwd(), "tmp/skorea-provinces-2018-geo.json")
  const fc: FC = JSON.parse(readFileSync(fcPath, "utf-8"))

  // Collect all coordinates for bbox
  const all: Position[] = []
  for (const f of fc.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const poly of polys) for (const ring of poly) for (const pt of ring) all.push(pt)
  }
  const { project, width, height } = projectFactory(all)

  // Tolerance in SVG units. Tuned: 0.18 gives crisp coastlines while
  // keeping the file under ~80KB. Lower = more detail, larger output.
  const TOLERANCE = 0.18

  const shapes: Array<{ label: string; path: string; x: number; y: number }> = []

  for (const f of fc.features) {
    const fullName = f.properties.name
    const label = SHORT_NAME[fullName]
    if (!label) {
      console.warn(`skipping unknown name: ${fullName}`)
      continue
    }
    const polys = f.geometry.type === "Polygon"
      ? [f.geometry.coordinates]
      : f.geometry.coordinates

    // Project + simplify each ring; build combined SVG path; compute area-weighted
    // centroid across all polygons (so multi-island provinces like 인천 don't
    // get their label dragged into the sea between islands).
    const pathParts: string[] = []
    let bestArea = 0
    let bestCentroid: Position | null = null
    let weightedX = 0, weightedY = 0, totalArea = 0

    for (const poly of polys) {
      // poly[0] = outer ring, poly[1..] = holes
      for (let ringIdx = 0; ringIdx < poly.length; ringIdx++) {
        const ring = poly[ringIdx]
        const projected = ring.map(project)
        const simplified = simplifyRing(projected, TOLERANCE)
        if (simplified.length < 3) continue
        pathParts.push(ringToPath(simplified))
        if (ringIdx === 0) {
          const area = ringArea(simplified)
          const centroid = ringCentroid(simplified)
          if (area > bestArea) { bestArea = area; bestCentroid = centroid }
          weightedX += centroid[0] * area
          weightedY += centroid[1] * area
          totalArea += area
        }
      }
    }
    // Weighted centroid is more honest for multi-polygon provinces; bestCentroid
    // is a safer fallback when polygons have wildly different sizes (a tiny
    // offshore island shouldn't tug the label into open water).
    const labelCx = totalArea > 0 ? weightedX / totalArea : (bestCentroid?.[0] ?? 0)
    const labelCy = totalArea > 0 ? weightedY / totalArea : (bestCentroid?.[1] ?? 0)

    shapes.push({
      label,
      path: pathParts.join(""),
      x: Number(labelCx.toFixed(2)),
      y: Number(labelCy.toFixed(2)),
    })
  }

  // Stable label order matching previous file (rough N→S, then 광역시, 제주)
  const ORDER = ["강원","경기","서울","인천","충북","충남","세종","대전","경북","대구","울산","경남","부산","전북","광주","전남","제주"]
  shapes.sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label))

  const w = Number(width.toFixed(2))
  const h = Number(height.toFixed(2))
  const ts = `export interface KoreaProvinceShape {
  label: string
  path: string
  x: number
  y: number
}

// Province shapes derived from kostat 2018 administrative boundaries
// (CC-BY, https://github.com/southkorea/southkorea-maps).
// Generated by scripts/build-korea-province-map.ts — do not edit by hand.
export const KOREA_PROVINCE_VIEWBOX = "0 0 ${w} ${h}"
export const KOREA_PROVINCE_WIDTH = ${w}
export const KOREA_PROVINCE_HEIGHT = ${h}

export const KOREA_PROVINCE_SHAPES: KoreaProvinceShape[] = [
${shapes.map((s) => `  { label: ${JSON.stringify(s.label)}, x: ${s.x}, y: ${s.y}, path: ${JSON.stringify(s.path)} },`).join("\n")}
]

export const KOREA_PROVINCE_BY_LABEL = new Map(
  KOREA_PROVINCE_SHAPES.map((shape) => [shape.label, shape]),
)
`

  const outPath = join(process.cwd(), "lib/branch/korea-province-map.ts")
  writeFileSync(outPath, ts, "utf-8")
  console.log(`✓ wrote ${outPath}`)
  console.log(`  viewBox: 0 0 ${w} ${h}`)
  console.log(`  shapes: ${shapes.length}`)
  const totalPathChars = shapes.reduce((acc, s) => acc + s.path.length, 0)
  console.log(`  total path chars: ${totalPathChars} (~${(totalPathChars/1024).toFixed(1)}KB)`)
}

main()
