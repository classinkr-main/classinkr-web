/**
 * /product/ai-report — "우리 학원에 무엇이 남는가" 섹션 일러스트 생성 (Gemini Flash Image)
 *
 * 사용법:
 *   set -a && . ./.env.local && set +a && node scripts/generate-ai-report-illustrations.mjs
 *   ... --only=archive            // 일부만
 *   ... --force                   // 이미 있어도 재생성
 *   ... --reink                   // API 없이 원본만 다시 잉크 추출 (색·알파 조정용)
 *
 * 출력: public/images/product/ai-report/<slug>.png
 *   - 1024px 원본(scripts/assets/ai-report-illustrations-raw)에서 잉크만 추출
 *   - 투명 배경 + DESIGN.md Classin Green(#084734)으로 채색
 *   - 민트 서피스(#ECFDF5) 위에 얹는 전제
 *
 * scripts/generate-sw-tool-icons.mjs 의 스타일 계약·잉크 추출 방식을 따른다.
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
const OUT_DIR = path.join(process.cwd(), "public/images/product/ai-report")
const RAW_DIR = path.join(process.cwd(), "scripts/assets/ai-report-illustrations-raw")
const STYLE_REF = path.join(process.cwd(), "public/images/product/sw/activity-icons/quiz-mono.png")
const INK = { r: 0x08, g: 0x47, b: 0x34 } // DESIGN.md — Classin Green

/* ── 스타일 계약 ───────────────────────────────────────────────
   같은 페이지의 커스텀 SVG 아이콘(48pt·1.5 스트로크·기하 도형)과 한 세트로 보여야 한다.
   아이콘보다는 크게 쓰이므로 형태 수를 조금 더 허용하되, 선 굵기는 고정한다. */
const STYLE = `STRICT LINE-ART CONTRACT — follow every rule exactly:
- Flat monochrome LINE illustration. Pure #14213A strokes on a pure #FFFFFF background. No other color anywhere.
- Canvas 1:1. The artwork occupies the CENTER 76% of the canvas with even margin on all four sides.
- Stroke weight is CONSTANT at exactly 26px on a 1024px canvas. Every line is the same weight.
- Rounded caps, rounded joins, corner radius ~28px on a 1024px canvas.
- Geometry only: circles, straight lines, arcs, rounded rectangles. Aligned to a clean grid.
- Allowed fills: at most THREE small solid dots/shapes as accents. Everything else is outline.
- FORBIDDEN: gradients, shadows, 3D, perspective, texture, hatching, color, background shapes,
  frames or borders around the artwork, text, letters, numbers, watermarks, human faces, facial features.
- Maximum 8 distinct shapes. Calm and editorial, not busy. Legible at 200x200 pixels.

The attached image is a STYLE REFERENCE ONLY — copy its stroke weight, corner radius, density and
flat line-art language. Do NOT copy its subject matter, and do NOT reuse its sparkle/star accent.`

/* ── 3종 정의 (page.tsx의 BENEFITS 순서와 1:1) ────────────────── */
const tasks = [
    {
        slug: "benefit-archive",
        label: "좋은 수업이 학원에 남는다",
        subject:
            "an accumulating lesson archive: four horizontal rounded-rectangle record cards stacked in a neat vertical pile with even gaps, each card containing two short ruled lines, and one more identical card hovering directly above the pile aligned to settle into it, with two short motion lines beside the hovering card",
    },
    {
        slug: "benefit-evidence",
        label: "상담이 근거로 바뀐다",
        subject:
            "a consultation backed by a record: two plain outline circles representing two people seated facing each other, one on the left and one on the right, separated by a single long horizontal table line between them, and one rounded-rectangle document sheet lying flat on that table line at the center containing three short ruled lines. No faces, no facial features",
    },
    {
        slug: "benefit-time",
        label: "반복 업무가 사라지고 시간이 돌아온다",
        subject:
            "time given back: a large clock circle with two straight clock hands from its center and one small solid dot at the center, and a single curved arrow sweeping counter-clockwise around the OUTSIDE of the clock circle, the arrow ending in a clear arrowhead",
    },
]

/* ── 생성 ─────────────────────────────────────────────────────── */
const styleRef = fs.readFileSync(STYLE_REF).toString("base64")

async function generate(task) {
    const body = {
        contents: [{
            parts: [
                { inlineData: { mimeType: "image/png", data: styleRef } },
                { text: `Generate a single flat line-art illustration of ${task.subject}.\n\n${STYLE}` },
            ],
        }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    }
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    )
    if (!res.ok) {
        console.error(`  ❌ ${task.slug} — API ${res.status}: ${(await res.text()).slice(0, 200)}`)
        return null
    }
    const data = await res.json()
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.mimeType?.startsWith("image/"))
    if (!part) {
        console.error(`  ❌ ${task.slug} — 이미지 파트 없음`)
        return null
    }
    return Buffer.from(part.inlineData.data, "base64")
}

/* 흰 배경 + 진한 잉크 → 잉크만 알파로 뽑고 브랜드 그린으로 채색 */
async function inkify(buf, size = 512) {
    const base = sharp(buf).resize(size, size, { fit: "contain", background: "#ffffff" })
    const { data, info } = await base.clone().greyscale().negate().raw().toBuffer({ resolveWithObject: true })
    const alpha = Buffer.alloc(data.length)
    for (let i = 0; i < data.length; i++) {
        const v = data[i]
        if (v < 30) { alpha[i] = 0; continue }
        if (v > 200) { alpha[i] = 255; continue }
        alpha[i] = Math.round(255 * Math.pow((v - 30) / 170, 0.55))
    }
    return sharp({
        create: { width: info.width, height: info.height, channels: 3, background: INK },
    })
        .joinChannel(alpha, { raw: { width: info.width, height: info.height, channels: 1 } })
        .png({ compressionLevel: 9 })
        .toBuffer()
}

async function main() {
    const onlyArg = process.argv.find((a) => a.startsWith("--only"))
    const only = onlyArg ? onlyArg.split("=")[1].split(",").map((s) => s.trim()) : null
    const force = process.argv.includes("--force")
    const list = only ? tasks.filter((t) => only.includes(t.slug)) : tasks

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.mkdirSync(RAW_DIR, { recursive: true })

    if (process.argv.includes("--reink")) {
        for (const task of list) {
            const rawPath = path.join(RAW_DIR, `${task.slug}.png`)
            if (!fs.existsSync(rawPath)) { console.log(`  ⏭️  ${task.slug} — 원본 없음`); continue }
            fs.writeFileSync(path.join(OUT_DIR, `${task.slug}.png`), await inkify(fs.readFileSync(rawPath)))
            console.log(`  ♻️  ${task.slug}`)
        }
        console.log("\n✅ 잉크 재추출 완료\n")
        return
    }

    console.log(`\n🎨 AI 리포트 이득 섹션 일러스트 ${list.length}종 — ${MODEL}\n${"─".repeat(48)}`)
    let ok = 0, fail = 0

    for (const task of list) {
        const outPath = path.join(OUT_DIR, `${task.slug}.png`)
        if (!force && fs.existsSync(outPath)) {
            console.log(`  ⏭️  ${task.slug} — 이미 존재`)
            continue
        }
        const raw = await generate(task)
        if (!raw) { fail++; continue }
        fs.writeFileSync(path.join(RAW_DIR, `${task.slug}.png`), raw)
        fs.writeFileSync(outPath, await inkify(raw))
        console.log(`  ✅ ${task.slug} (${task.label})`)
        ok++
        await new Promise((r) => setTimeout(r, 1500))
    }

    console.log(`${"─".repeat(48)}\n✅ ${ok}종 / ❌ ${fail}종 → ${path.relative(process.cwd(), OUT_DIR)}\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
