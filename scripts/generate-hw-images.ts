/**
 * ClassIn Board HW 제품 페이지 — Gemini 3.1 Flash 이미지 생성 스크립트
 *
 * 사용법:
 *   GEMINI_API_KEY=your_key npx tsx scripts/generate-hw-images.ts
 *   GEMINI_API_KEY=your_key npx tsx scripts/generate-hw-images.ts --only hero
 *   GEMINI_API_KEY=your_key npx tsx scripts/generate-hw-images.ts --priority=0
 *
 * Gemini 3.1 Flash Image (Nano Banana 2)
 */

import fs from "fs"
import path from "path"

const API_KEY = process.env.GEMINI_API_KEY
if (!API_KEY) {
    console.error("❌ GEMINI_API_KEY 환경변수를 설정해주세요.")
    process.exit(1)
}

const BASE_DIR = path.join(process.cwd(), "public/images/product/hw")
const MODEL = "gemini-3.1-flash-image-preview"

/* ── 실제 제품 정확 묘사 공통 프리픽스 ──────────────────────── */
const PRODUCT_DESC = `The product is a ClassIn Smart Board — an 86-inch 4K interactive whiteboard.

CRITICAL PRODUCT DETAILS (must match exactly):
- BEZELS: WHITE MATTE finish (NOT silver, NOT metallic, NOT brushed aluminum — pure matte white plastic/painted aluminum)
- STAND: A-frame / easel-style stand with TWO pairs of angled legs that splay OUTWARD in a V-shape from each side, with small caster wheels at the tip of each leg. The stand legs are WHITE. It does NOT have a central column or pedestal — the legs angle outward like a traditional easel/flip chart stand.
- PEN TRAY: A small ORANGE/BROWN pen holder/tray is attached at the BOTTOM CENTER of the bezel frame.
- CAMERA: A small camera module sits at the TOP CENTER of the board frame.
- BRANDING: "Classin" text is printed at the bottom center of the white bezel frame.
- CORNERS: Gently rounded corners with moderate radius.
- DEPTH: Ultra-slim 95.5mm profile.
- DISPLAY: Large 16:9 aspect ratio screen with thin black border between white bezel and display panel.`

const CINEMATIC = `Cinematic advertising photography style. Dramatic studio lighting with rim light and subtle volumetric haze. Ultra-sharp details, 8K quality.`

const KOREAN_PEOPLE = `All people shown must be KOREAN/EAST ASIAN. Korean school environment with Korean-style uniforms or casual Korean fashion. Modern Korean classroom or academy setting.`

/* ── 이미지 생성 프롬프트 정의 ──────────────────────────────────── */

interface ImageTask {
    folder: string
    filename: string
    prompt: string
    priority: 0 | 1 | 2
}

const tasks: ImageTask[] = [
    // ── HERO ────────────────────────────────────────────────────
    {
        folder: "hero",
        filename: "hero-board-front.png",
        prompt: `${CINEMATIC} ${PRODUCT_DESC}
Full front view of the smart board on its WHITE A-frame easel stand with angled splayed legs and caster wheels.
Screen is powered off (deep black). The WHITE MATTE bezels are clearly visible. Orange pen tray at bottom center.
Dark charcoal studio background with dramatic top-down spotlight creating a pool of light on the floor.
The white frame contrasts beautifully against the dark background. Floor reflection visible.
Product hero shot — centered, powerful. No people, no text overlays.`,
        priority: 0,
    },
    {
        folder: "hero",
        filename: "hero-board-angle.png",
        prompt: `${CINEMATIC} ${PRODUCT_DESC}
3/4 angle view of the smart board on its WHITE A-frame easel stand. Screen displays a vibrant cosmic nebula.
Dark studio background. Dramatic side lighting emphasizing the slim 95.5mm profile.
WHITE MATTE bezels clearly visible. Orange pen tray at bottom center. Camera module at top center.
Slight low angle for an impressive grand feel. No people, no text.`,
        priority: 1,
    },

    // ── BOARD DETAIL ────────────────────────────────────────────
    {
        folder: "board",
        filename: "board-bezel-detail.png",
        prompt: `${CINEMATIC} ${PRODUCT_DESC}
Extreme close-up macro shot of the smart board's top-left corner.
The bezel is WHITE MATTE finish — smooth, non-reflective white surface. NOT metallic, NOT silver, NOT brushed metal.
Gently rounded corner with moderate radius. A visible seam/gap between the white bezel frame and the black display panel.
Shallow depth of field. Light gray/white wall background.
Macro product detail photography. No text, no people.`,
        priority: 0,
    },
    {
        folder: "board",
        filename: "board-side-profile.png",
        prompt: `${CINEMATIC} ${PRODUCT_DESC}
Side profile view showing the slim 95.5mm depth of the smart board, wall-mounted.
The WHITE MATTE bezel frame is visible from the side as a thin white line.
Clean light wall background. Show how thin and elegant the board is.
Product photography emphasizing thinness. No people, no text.`,
        priority: 1,
    },

    // ── WRITING EXPERIENCE ──────────────────────────────────────
    {
        folder: "writing",
        filename: "writing-teacher.jpg",
        prompt: `Cinematic editorial photography. ${KOREAN_PEOPLE}
A KOREAN female teacher in her 30s writing mathematical equations with a digital stylus on a large 86-inch ClassIn smart board with WHITE MATTE bezels in a modern Korean classroom.
The board displays handwritten equations in white and orange on dark background.
The board has WHITE bezels, orange pen tray at bottom, and is on a WHITE A-frame easel stand.
Natural writing posture, mid-stroke. Dramatic window light from side. Shallow depth of field.
Korean students visible in soft background blur. Warm color grading. Professional editorial style.`,
        priority: 0,
    },
    {
        folder: "writing",
        filename: "writing-closeup.jpg",
        prompt: `Extreme close-up of a Korean person's hand holding a digital stylus writing on an interactive smart board surface.
The stylus tip touches the screen with digital ink appearing immediately — zero latency.
The WHITE MATTE bezel edge is partially visible at the border of the frame.
Matte anti-glare surface texture visible. Shallow depth of field.
Dramatic warm side lighting. Macro photography style.`,
        priority: 1,
    },
    {
        folder: "writing",
        filename: "writing-multitouch.jpg",
        prompt: `${KOREAN_PEOPLE}
Bird's eye view looking down at a large ClassIn smart board with WHITE MATTE bezels.
Multiple hands (4-5 Korean students) simultaneously drawing colorful mind maps and diagrams.
Each person's strokes in different colors — orange, blue, green, purple.
The board has WHITE bezels visible at the edges. Bright, energetic atmosphere.
Creative overhead photography. Modern Korean academy/hagwon setting.`,
        priority: 1,
    },

    // ── DISPLAY QUALITY ─────────────────────────────────────────
    {
        folder: "display",
        filename: "display-wall-cinematic.jpg",
        prompt: `${CINEMATIC} ${PRODUCT_DESC}
The smart board is wall-mounted, displaying a stunning 4K cosmic scene — a swirling orange-gold black hole with blue energy jets.
WHITE MATTE bezels frame the display. Orange pen tray visible at bottom center. "Classin" branding at bottom.
Dark room, the display is the sole light source, illuminating the wall with colored light.
The white bezels glow subtly in the display's light. 178-degree viewing angle implied by slight off-axis position.
Dramatic, cinematic composition. No people, no text overlay.`,
        priority: 0,
    },

    // ── CAMERA & HYBRID ─────────────────────────────────────────
    {
        folder: "camera",
        filename: "camera-hybrid-class.jpg",
        prompt: `Cinematic wide shot of a modern Korean hybrid classroom. ${KOREAN_PEOPLE}
A Korean female teacher in her 30s-40s stands at a large ClassIn smart board with WHITE MATTE bezels on a WHITE A-frame easel stand.
On the board screen: lesson content on the left 2/3, remote Korean students in video tiles on the right.
In the physical classroom: 15-20 Korean students at desks, engaged. Modern Korean school/academy interior.
Dramatic natural light from windows. Warm color grading. The board's WHITE bezels and orange pen tray are clearly visible.
Professional editorial photography.`,
        priority: 0,
    },
    {
        folder: "camera",
        filename: "camera-ai-unit.png",
        prompt: `${CINEMATIC}
Product shot of a sleek AI-powered 4K classroom camera designed for ClassIn smart boards.
Compact bar-shaped design, matte black finish with subtle blue LED indicator.
Dark studio background with dramatic rim lighting. Premium product photography.
No people, no text.`,
        priority: 1,
    },

    // ── ECOSYSTEM ───────────────────────────────────────────────
    {
        folder: "ecosystem",
        filename: "ecosystem-board-ui.png",
        prompt: `${CINEMATIC} ${PRODUCT_DESC}
The smart board on its WHITE A-frame easel stand displays the ClassIn educational software interface.
UI layout: attendance list sidebar on left (dark theme), main whiteboard canvas with handwritten Korean math notes,
bottom toolbar with drawing tools, timer widget. Round dial control interface on right side of screen.
WHITE MATTE bezels. Orange pen tray at bottom center. "Classin" text on bottom bezel.
Dimly lit Korean classroom, screen glowing. Shot straight-on. No people visible.`,
        priority: 1,
    },

    // ── LINEUP ──────────────────────────────────────────────────
    {
        folder: "lineup",
        filename: "lineup-all-sizes.png",
        prompt: `${CINEMATIC} ${PRODUCT_DESC}
Four ClassIn smart boards of different sizes in a dark studio, each on its own WHITE A-frame easel stand.
From left to right: 65-inch, 75-inch, 86-inch, 110-inch.
ALL have identical design: WHITE MATTE bezels, orange pen tray, A-frame stands with angled splayed white legs.
A subtle human silhouette (175cm Korean male) for scale near the 86-inch model.
Each screen shows its size number subtly. Dark studio floor with reflections.
Clean product lineup photography. No text overlay.`,
        priority: 1,
    },

    // ── SPACES ──────────────────────────────────────────────────
    {
        folder: "spaces",
        filename: "space-classroom.jpg",
        prompt: `${KOREAN_PEOPLE}
Modern Korean school classroom with an 86-inch ClassIn smart board with WHITE MATTE bezels wall-mounted on the front wall.
The board displays a colorful science lesson in Korean. Orange pen tray visible.
20-25 Korean students in school uniforms seated at modern desks.
Bright natural lighting, white walls, clean modern Korean classroom interior.
Green chalkboard visible on side walls. Professional architectural photography. Bright, inviting.`,
        priority: 1,
    },
    {
        folder: "spaces",
        filename: "space-lecture-hall.jpg",
        prompt: `${KOREAN_PEOPLE}
Large Korean university lecture hall with a 110-inch ClassIn smart board with WHITE MATTE bezels at the front wall.
Tiered seating, modern Korean university architecture. 50+ seats visible.
The board displays presentation content in Korean. WHITE bezels clearly visible.
Professional architectural photography. Modern Korean educational facility.`,
        priority: 2,
    },

    // ── SHARING ─────────────────────────────────────────────────
    {
        folder: "sharing",
        filename: "sharing-student-tablet.jpg",
        prompt: `${KOREAN_PEOPLE}
A Korean high school student holding a tablet in a modern Korean classroom.
The tablet mirrors handwritten notes visible on the large ClassIn smart board in background (soft focus).
The board in background has WHITE MATTE bezels on a WHITE A-frame stand.
Real-time sync — same handwriting on both screens.
Warm natural lighting, shallow depth of field. Korean school environment.`,
        priority: 2,
    },
]

/* ── Gemini 3.1 Flash Image API ───────────────────────────── */

async function generateImage(task: ImageTask): Promise<Buffer | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`

    const body = {
        contents: [
            {
                parts: [
                    { text: `Generate this image: ${task.prompt}` }
                ]
            }
        ],
        generationConfig: {
            responseModalities: ["IMAGE", "TEXT"],
        },
    }

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const errText = await res.text()
        console.error(`  ❌ API 에러 (${res.status}): ${errText.slice(0, 300)}`)
        return null
    }

    const data = await res.json()
    const parts = data.candidates?.[0]?.content?.parts
    if (!parts) {
        console.error(`  ❌ 응답에 parts 없음`)
        return null
    }

    const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"))
    if (!imagePart) {
        console.error(`  ❌ 이미지 파트 없음`)
        return null
    }

    return Buffer.from(imagePart.inlineData.data, "base64")
}

/* ── 메인 실행 ───────────────────────────────────────────────── */

async function main() {
    const onlyArg = process.argv.find((a) => a.startsWith("--only"))
    const onlyFolders = onlyArg
        ? onlyArg.split("=")[1]?.split(",").map((s) => s.trim())
        : null

    const priorityArg = process.argv.find((a) => a.startsWith("--priority"))
    const maxPriority = priorityArg ? parseInt(priorityArg.split("=")[1]) : 2

    let filtered = tasks.filter((t) => t.priority <= maxPriority)
    if (onlyFolders) {
        filtered = filtered.filter((t) => onlyFolders.includes(t.folder))
    }

    console.log(`\n🎨 ClassIn Board 이미지 생성 v2 — 실제 제품 정확 반영`)
    console.log(`   모델: ${MODEL}`)
    console.log(`   총 ${filtered.length}장 (P0~P${maxPriority})`)
    if (onlyFolders) console.log(`   폴더 필터: ${onlyFolders.join(", ")}`)
    console.log(`   ✅ 화이트 무광 베젤 / A-frame 스탠드 / 오렌지 펜트레이`)
    console.log(`   ✅ 한국/동양인 인물`)
    console.log(`${"─".repeat(50)}\n`)

    let success = 0
    let fail = 0

    for (const task of filtered) {
        const outDir = path.join(BASE_DIR, task.folder)
        const outPath = path.join(outDir, task.filename)

        if (fs.existsSync(outPath)) {
            console.log(`  ⏭️  [${task.folder}] ${task.filename} — 이미 존재, 스킵`)
            continue
        }

        console.log(`  🖼️  [P${task.priority}] [${task.folder}] ${task.filename} 생성 중...`)

        const buf = await generateImage(task)
        if (buf) {
            fs.mkdirSync(outDir, { recursive: true })
            fs.writeFileSync(outPath, buf)
            console.log(`  ✅  저장됨 (${(buf.length / 1024).toFixed(0)}KB)`)
            success++
        } else {
            fail++
        }

        await new Promise((r) => setTimeout(r, 3000))
    }

    console.log(`\n${"─".repeat(50)}`)
    console.log(`✅ 성공: ${success}장 / ❌ 실패: ${fail}장`)
    console.log(`📁 저장 위치: ${BASE_DIR}\n`)
}

main().catch(console.error)
