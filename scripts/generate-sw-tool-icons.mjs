/**
 * /product/sw — "30+ 수업 도구" 타일 아이콘 생성 (Gemini 3.1 Flash Image)
 *
 * 사용법:
 *   set -a && . ./.env.local && set +a && node scripts/generate-sw-tool-icons.mjs
 *   ... --only=timer,dice        // 일부만
 *   ... --force                  // 이미 있어도 재생성
 *
 * 출력: public/images/product/sw/tool-icons/<slug>.png
 *   - 512px 원본(scripts/assets/sw-tool-icons-raw)에서 잉크만 추출
 *   - 투명 배경 + DESIGN.md Green Muted(#6EE7B7)로 채색
 *   - 다크 카드(radial #615D59→#111110) 위에 바로 얹을 수 있는 상태
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
const OUT_DIR = path.join(process.cwd(), "public/images/product/sw/tool-icons")
// 512px 원본은 public/ 밖에 둔다 — 배포에 실리지 않게, 다만 --reink 재처리를 위해 보관한다
const RAW_DIR = path.join(process.cwd(), "scripts/assets/sw-tool-icons-raw")
const STYLE_REF = path.join(process.cwd(), "public/images/product/sw/activity-icons/quiz-mono.png")
const INK = { r: 0x6e, g: 0xe7, b: 0xb7 } // DESIGN.md — Green Muted, 보조 아이콘 색

/* ── 공통 스타일 계약 ─────────────────────────────────────────
   26개가 한 세트로 보이려면 선 굵기·여백·기하가 흔들리면 안 된다.
   수치를 말로 못 박고, 참조 이미지는 "스타일만" 쓰도록 명시한다. */
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

/* ── 26종 정의 (LESSON_TOOLS 순서와 1:1) ─────────────────────── */
const tasks = [
    { slug: "timer",            label: "타이머",              subject: "an hourglass timer: a symmetrical hourglass outline with sand narrowing at the waist and one small solid dot of falling sand" },
    { slug: "dice",             label: "주사위",              subject: "a single die: one rounded square seen flat-on with exactly five solid pips arranged in a quincunx" },
    { slug: "stopwatch",        label: "스톱워치",            subject: "a stopwatch: a circle with a small rounded push-button stem on top, two tiny side lugs, and two clock hands from the center" },
    { slug: "sub-board",        label: "보조 칠판",           subject: "a secondary whiteboard: a large rounded rectangle board on two short splayed easel legs, with a small rounded rectangle overlapping its top-right corner" },
    { slug: "trophy-rank",      label: "트로피 순위",         subject: "a ranking podium: three vertical bars of different heights side by side, tallest in the middle, with a small trophy cup outline sitting on the tallest bar" },
    { slug: "laser-pointer",    label: "레이저 포인터",       subject: "a laser pointer: a slim rounded-rectangle pen tilted 45 degrees pointing to the upper right, emitting one straight beam line ending in a small solid dot, with two short spark lines beside the dot" },
    { slug: "sub-camera",       label: "보조 카메라",         subject: "a secondary camera: a rounded rectangle camera body with a circular lens in the center and a small trapezoid viewfinder bump on top, plus a small plus sign in the top-right corner" },
    { slug: "browser",          label: "브라우저",            subject: "a browser window: a rounded rectangle with a horizontal title bar across the top and three small solid dots at the left of that bar" },
    { slug: "video-gallery",    label: "비디오 갤러리",       subject: "a video gallery: a 2 by 2 grid of four equal rounded rectangles, and one of them contains a small solid triangular play symbol" },
    { slug: "mirroring",        label: "미러링",              subject: "screen mirroring: a small rounded rectangle phone on the left and a larger rounded rectangle display on the right, connected by two concentric arc waves radiating from the phone toward the display" },
    { slug: "screen-share",     label: "화면 공유",           subject: "screen sharing: a rounded rectangle monitor on a short center stand and base, with an upward arrow rising out of the top edge of the screen" },
    { slug: "vnc",              label: "VNC",                 subject: "remote desktop control: a rounded rectangle monitor on a short center stand and base, with a single mouse-cursor arrow shape inside the screen and two small concentric signal arcs at the screen top-right corner" },
    { slug: "random-pick",      label: "랜덤 선택",           subject: "random selection: two crossing arrows that swap paths, each ending in an arrowhead, forming an X-shaped shuffle, with one small solid dot at the crossing point" },
    { slug: "personal-board",   label: "개인 칠판",           subject: "a personal writing board: a portrait rounded rectangle tablet with two short horizontal ruled lines inside, and a slim stylus pen resting diagonally across its lower-right corner" },
    { slug: "quiz-choice",      label: "객관식 퀴즈",         subject: "a multiple-choice quiz: three stacked rows, each a small circle on the left with a horizontal line to its right, and the top circle contains a solid checkmark" },
    { slug: "quiz-buzzer",      label: "선착순 퀴즈",         subject: "a first-to-answer buzzer: a large dome-shaped press buzzer on a flat base with a raised round button on top and two short motion lines above it" },
    { slug: "group-discussion", label: "그룹 토론",           subject: "a group discussion: two overlapping rounded speech bubbles of different sizes, the front one containing two short horizontal lines" },
    { slug: "multi-browser",    label: "다방향 브라우저",     subject: "a browser window with outward arrows: a rounded rectangle browser window with a horizontal title bar, and four separate short straight arrows placed OUTSIDE the window — one above pointing up, one below pointing down, one left pointing left, one right pointing right, each with a clear arrowhead at its far end" },
    { slug: "material-library", label: "수업 자료 라이브러리", subject: "a materials library: three upright books standing side by side on a horizontal shelf line, one book tilted slightly against the others" },
    { slug: "chemistry",        label: "화학 실험",           subject: "a chemistry experiment: an Erlenmeyer flask outline with a narrow neck, a horizontal liquid line inside, and two small solid bubble dots rising above the liquid" },
    { slug: "physics",          label: "물리 실험",           subject: "a physics experiment: a Newton's cradle — a horizontal top bar with three vertical strings, each ending in a circle, and the leftmost circle swung out to the side" },
    { slug: "geometry",         label: "기하도형",            subject: "three LARGE geometric outline shapes filling the artwork area edge to edge in a row, NOT overlapping: a big triangle on the left, a big circle in the middle, a big square on the right. Each shape is the same height and together they span the full width. Clean outlines only" },
    { slug: "measure",          label: "측정 도구",           subject: "a ruler: a long horizontal rounded-rectangle ruler bar with five evenly spaced short tick marks descending from its top edge, and a separate small right-angle set square triangle resting above its left end" },
    { slug: "go-board",         label: "바둑 칠판",           subject: "a Go board grid: a rounded square border containing exactly three straight vertical lines and three straight horizontal lines that each run fully from one inner edge to the opposite inner edge, forming an even grid; two solid filled circular stones sit exactly on two different line crossings" },
    { slug: "live-chat",        label: "실시간 채팅",         subject: "live chat: one rounded speech bubble with a tail at the bottom-left, containing three small solid dots in a horizontal row" },
    { slug: "collaboration",    label: "공동 작업",           subject: "collaboration: three circles arranged in a triangle formation, each connected to the other two by a straight line, with one circle slightly larger" },
]

/* ── 생성 ─────────────────────────────────────────────────────── */
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
async function inkify(buf, size = 192) {
    const base = sharp(buf).resize(size, size, { fit: "contain", background: "#ffffff" })
    const { data, info } = await base.clone().greyscale().negate().raw().toBuffer({ resolveWithObject: true })
    // 회색 안티에일리어싱 잔여는 잘라내고, 남은 중간톤은 감마로 끌어올린다.
    // 이걸 선형으로 두면 192px 원본을 28px로 줄일 때 획이 반투명해져 다크 카드 위에서 흐려진다.
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

    // --reink: API 호출 없이 _raw 원본만 다시 잉크 추출한다 (색·알파 커브 조정용)
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
    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.mkdirSync(RAW_DIR, { recursive: true })

    console.log(`\n🎨 수업 도구 아이콘 ${list.length}종 — ${MODEL}\n${"─".repeat(48)}`)
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
