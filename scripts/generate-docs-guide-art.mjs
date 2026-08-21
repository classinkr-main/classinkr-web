/**
 * /docs — 가이드 랜딩 인텐트 카드 스팟 일러스트 생성 (Gemini 3.1 Flash Image)
 *
 * 사용법:
 *   set -a && . ./.env.local && set +a && node scripts/generate-docs-guide-art.mjs
 *   ... --only=start,teacher      // 일부만
 *   ... --force                   // 이미 있어도 재생성
 *
 * 출력: public/images/docs/guide/intent-<key>.png       (Classin Green #084734)
 *       public/images/docs/guide/intent-<key>-ink.png   (Warm Dark #31302E)
 *   - 512px 원본에서 잉크만 추출 → 투명 배경, 흰 카드 위에 바로 얹는 상태
 *   - 스타일 계약은 /product/sw 수업 도구 아이콘 세트와 동일 (사이트 전체 라인아트 일관성)
 */

import fs from "fs"
import path from "path"
import sharp from "sharp"

const API_KEY = process.env.GEMINI_API_KEY
if (!API_KEY) {
    console.error("❌ GEMINI_API_KEY 없음. `set -a && . ./.env.local && set +a` 후 실행.")
    process.exit(1)
}

const MODEL = process.env.ICON_MODEL || "gemini-3.1-flash-image"
const OUT_DIR = path.join(process.cwd(), "public/images/docs/guide")
const RAW_DIR = path.join(OUT_DIR, "_raw")
const STYLE_REF = path.join(process.cwd(), "public/images/product/sw/activity-icons/quiz-mono.png")
const GREEN = { r: 0x08, g: 0x47, b: 0x34 } // DESIGN.md — Classin Green
const INK = { r: 0x31, g: 0x30, b: 0x2e }   // DESIGN.md — Warm Dark

const STYLE = `STRICT ICON STYLE CONTRACT — follow every rule exactly:
- Flat monochrome LINE icon. Pure #14213A strokes on a pure #FFFFFF background. No other color anywhere.
- Canvas 1:1. The artwork occupies the CENTER 72% of the canvas with even margin on all four sides.
- Stroke weight is CONSTANT at exactly 34px on a 512px canvas. Every line in the icon is the same weight.
- Rounded caps, rounded joins, corner radius ~24px on a 512px canvas.
- Geometry only: circles, straight lines, arcs, rounded rectangles. Aligned to a clean grid.
- Allowed fills: at most TWO small solid dots/shapes as accents. Everything else is outline.
- FORBIDDEN: gradients, shadows, 3D, perspective, texture, hatching, color, background shapes,
  frames, borders around the icon, text, letters, numbers, watermarks, drop caps.
- Maximum 6 distinct shapes. Simple enough to stay legible at 24x24 pixels.

The attached image is a STYLE REFERENCE ONLY — copy its stroke weight, corner radius, density and
flat line-art language. Do NOT copy its subject matter, and do NOT reuse its sparkle/star accent.`

/* ── 인텐트 4종 (가이드 랜딩 카드와 1:1) ───────────────────────── */
const tasks = [
    { key: "start",   label: "도입 검토",  subject: "a review checklist: a portrait rounded-rectangle paper sheet with three short horizontal lines inside, and a large magnifying glass (circle plus straight handle) overlapping the sheet's bottom-right corner" },
    { key: "admin",   label: "학원 운영",  subject: "an operations dashboard: a landscape rounded-rectangle panel containing two vertical bars of different heights side by side, with a simple six-tooth gear outline overlapping the panel's top-right corner" },
    { key: "teacher", label: "수업 진행",  subject: "a classroom board on a stand: a landscape rounded-rectangle board standing on two short splayed easel legs, with one solid play triangle centered on the board and one short horizontal chalk line under the triangle" },
    { key: "student", label: "수업 참여",  subject: "a student's tablet: a portrait rounded-rectangle tablet with a raised open hand outline centered inside the screen, and two short diagonal cheer lines above the tablet's top-right corner" },
]

const styleRef = fs.readFileSync(STYLE_REF).toString("base64")

async function generate(task) {
    const body = {
        contents: [{
            parts: [
                { inlineData: { mimeType: "image/png", data: styleRef } },
                { text: `Generate a single app icon of ${task.subject}.\n\n${STYLE}` },
            ],
        }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    }
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    )
    if (!res.ok) {
        console.error(`  ❌ ${task.key} — API ${res.status}: ${(await res.text()).slice(0, 200)}`)
        return null
    }
    const data = await res.json()
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.mimeType?.startsWith("image/"))
    if (!part) {
        console.error(`  ❌ ${task.key} — 이미지 파트 없음`)
        return null
    }
    return Buffer.from(part.inlineData.data, "base64")
}

/* 흰 배경 + 진한 잉크 → 잉크만 알파로 뽑고 지정 색으로 채색 */
async function inkify(buf, tint, size = 240) {
    const base = sharp(buf).resize(size, size, { fit: "contain", background: "#ffffff" })
    const { data, info } = await base.clone().greyscale().negate().raw().toBuffer({ resolveWithObject: true })
    const alpha = Buffer.alloc(data.length)
    for (let i = 0; i < data.length; i++) {
        const v = data[i]
        alpha[i] = v < 24 ? 0 : v > 224 ? 255 : Math.round(((v - 24) / 200) * 255)
    }
    return sharp({
        create: { width: info.width, height: info.height, channels: 3, background: tint },
    })
        .joinChannel(alpha, { raw: { width: info.width, height: info.height, channels: 1 } })
        .png({ compressionLevel: 9 })
        .toBuffer()
}

async function main() {
    const onlyArg = process.argv.find((a) => a.startsWith("--only"))
    const only = onlyArg ? onlyArg.split("=")[1].split(",").map((s) => s.trim()) : null
    const force = process.argv.includes("--force")

    const list = only ? tasks.filter((t) => only.includes(t.key)) : tasks
    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.mkdirSync(RAW_DIR, { recursive: true })

    console.log(`\n🎨 가이드 인텐트 일러스트 ${list.length}종 — ${MODEL}\n${"─".repeat(48)}`)
    let ok = 0, fail = 0

    for (const task of list) {
        const outPath = path.join(OUT_DIR, `intent-${task.key}.png`)
        if (!force && fs.existsSync(outPath)) {
            console.log(`  ⏭️  ${task.key} — 이미 존재`)
            continue
        }
        const raw = await generate(task)
        if (!raw) { fail++; continue }
        fs.writeFileSync(path.join(RAW_DIR, `intent-${task.key}.png`), raw)
        fs.writeFileSync(outPath, await inkify(raw, GREEN))
        fs.writeFileSync(path.join(OUT_DIR, `intent-${task.key}-ink.png`), await inkify(raw, INK))
        console.log(`  ✅ ${task.key} (${task.label})`)
        ok++
        await new Promise((r) => setTimeout(r, 1500))
    }

    console.log(`${"─".repeat(48)}\n✅ ${ok}종 / ❌ ${fail}종 → ${path.relative(process.cwd(), OUT_DIR)}\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
