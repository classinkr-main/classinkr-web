/**
 * ClassIn Board HW 제품 페이지 — Gemini 이미지 생성 스크립트
 *
 * 사용법:
 *   GEMINI_API_KEY=your_key npx tsx scripts/generate-hw-images.ts
 *   GEMINI_API_KEY=your_key npx tsx scripts/generate-hw-images.ts --only hero
 *   GEMINI_API_KEY=your_key npx tsx scripts/generate-hw-images.ts --only hero,writing
 *
 * Gemini Imagen 3 API를 사용하여 이미지를 생성합니다.
 */

import fs from "fs"
import path from "path"

const API_KEY = process.env.GEMINI_API_KEY
if (!API_KEY) {
    console.error("❌ GEMINI_API_KEY 환경변수를 설정해주세요.")
    console.error("   GEMINI_API_KEY=your_key npx tsx scripts/generate-hw-images.ts")
    process.exit(1)
}

const BASE_DIR = path.join(process.cwd(), "public/images/product/hw")

/* ── 이미지 생성 프롬프트 정의 ──────────────────────────────────── */

interface ImageTask {
    folder: string
    filename: string
    prompt: string
    aspect?: "1:1" | "16:9" | "4:3" | "3:4" | "9:16"
    priority: 0 | 1 | 2
}

const tasks: ImageTask[] = [
    // ── HERO ────────────────────────────────────────────────────
    {
        folder: "hero",
        filename: "hero-board-front.png",
        prompt: `Professional product photo of a modern interactive smart board (digital whiteboard) for classrooms.
The board has ultra-thin bezels, sleek minimalist design, matte black frame, and a large 86-inch 4K display.
The screen shows colorful math equations and diagrams being drawn.
Clean white studio background with soft gradient lighting.
Product photography style, high-end, Apple-like aesthetic. No people. No text overlays.`,
        aspect: "16:9",
        priority: 0,
    },
    {
        folder: "hero",
        filename: "hero-board-angle.png",
        prompt: `Professional 3/4 angle product photo of a large interactive smart board (digital whiteboard).
Emphasize the slim profile and thin bezels. Premium matte finish.
Screen displays a clean educational interface with colorful icons.
Clean white background, studio lighting with subtle shadow.
Product photography, premium tech aesthetic. No people.`,
        aspect: "16:9",
        priority: 1,
    },
    {
        folder: "hero",
        filename: "hero-bg-classroom.jpg",
        prompt: `Modern bright classroom interior, no people. Clean wooden desks arranged in rows.
Large windows with natural light streaming in. White walls, warm wood floor.
A large interactive display/smart board mounted on the front wall, turned off.
Minimalist Scandinavian-inspired educational space. Architectural photography style.
Bright, airy, aspirational atmosphere. No text.`,
        aspect: "16:9",
        priority: 1,
    },

    // ── BOARD DETAIL ────────────────────────────────────────────
    {
        folder: "board",
        filename: "board-front.png",
        prompt: `Clean front-view product photo of a large flat-panel interactive smart board / digital whiteboard.
Ultra-thin bezels, premium matte black aluminum frame, elegant minimalist design.
Screen shows a subtle gradient background (no text, no UI).
Isolated on pure white background. Professional product photography.`,
        aspect: "4:3",
        priority: 1,
    },
    {
        folder: "board",
        filename: "board-side.png",
        prompt: `Side profile view of a slim interactive smart board showing its thin depth (about 11cm).
Emphasize the sleek thinness. Premium matte finish, visible ports on the side.
Clean white background, studio product photography.
Show the slim profile from a dramatic angle. No people. No text.`,
        aspect: "4:3",
        priority: 1,
    },
    {
        folder: "board",
        filename: "board-bezel-detail.png",
        prompt: `Extreme close-up detail shot of an interactive smart board's edge/bezel.
Show the premium build quality — thin aluminum bezel meets the display panel.
Macro product photography, shallow depth of field.
Clean, technical, Apple-like product detail shot. No text.`,
        aspect: "1:1",
        priority: 2,
    },

    // ── WRITING EXPERIENCE ──────────────────────────────────────
    {
        folder: "writing",
        filename: "writing-teacher.jpg",
        prompt: `A teacher writing mathematical equations on a large interactive smart board in a modern classroom.
Natural writing posture, using a digital stylus pen. The board displays handwritten equations in white on dark background.
Bright classroom with students visible in soft background blur.
Warm lighting, candid educational photography. Professional, editorial style.`,
        aspect: "4:3",
        priority: 0,
    },
    {
        folder: "writing",
        filename: "writing-closeup.jpg",
        prompt: `Extreme close-up of a hand writing on an interactive touch screen / smart board surface.
A stylus pen tip touching the screen with digital ink appearing immediately beneath it.
Show the precision and zero-latency feel. The surface has a subtle matte anti-glare texture.
Macro photography, shallow depth of field, warm lighting. No text overlay.`,
        aspect: "1:1",
        priority: 1,
    },
    {
        folder: "writing",
        filename: "writing-multitouch.jpg",
        prompt: `Multiple hands (3-4 students and a teacher) simultaneously drawing and writing on a large interactive smart board.
Collaborative learning scene. The board shows colorful mind maps and diagrams drawn by different people.
Shot from slight angle showing both the board and the engaged participants.
Bright, energetic educational atmosphere. Editorial photography style.`,
        aspect: "4:3",
        priority: 1,
    },

    // ── DISPLAY QUALITY ─────────────────────────────────────────
    {
        folder: "display",
        filename: "display-viewing-angle.png",
        prompt: `Technical diagram illustration showing a 178-degree viewing angle of a display panel.
Clean infographic style with a top-down view of a screen and angle lines spreading out to 178 degrees.
Minimalist design, use blue and white color scheme. Professional tech diagram.
No photo, illustration/vector style. Clean background.`,
        aspect: "16:9",
        priority: 1,
    },
    {
        folder: "display",
        filename: "display-lamination-compare.png",
        prompt: `Side-by-side comparison diagram: regular display vs full-lamination display.
Left: "Air gap" between glass and LCD panel, showing light reflection and distortion.
Right: "Full lamination" with glass bonded directly to LCD, showing clear crisp image.
Clean technical illustration style, labeled cross-section diagram. Blue and orange accent colors.`,
        aspect: "16:9",
        priority: 1,
    },

    // ── SHARING ─────────────────────────────────────────────────
    {
        folder: "sharing",
        filename: "sharing-student-tablet.jpg",
        prompt: `A student in a modern classroom looking at a tablet that displays the same content as the large smart board in the background.
The tablet shows handwritten notes and diagrams mirrored from the board.
Real-time sync concept. Clean, bright classroom. Student appears focused and engaged.
Editorial education photography. Warm natural lighting.`,
        aspect: "4:3",
        priority: 1,
    },
    {
        folder: "sharing",
        filename: "sharing-sync-flow.png",
        prompt: `Clean infographic illustration showing data flow from a smart board to multiple devices.
Center: large display/board icon. Arrows flowing outward to: tablet, laptop, smartphone icons.
Each device shows the same content. Wireless/cloud sync symbols.
Flat design style, orange and slate color scheme. White background. Professional tech infographic.`,
        aspect: "16:9",
        priority: 2,
    },

    // ── CAMERA & HYBRID ─────────────────────────────────────────
    {
        folder: "camera",
        filename: "camera-ai-unit.png",
        prompt: `Product photo of a sleek AI-powered 4K camera designed for classrooms.
Compact cylindrical or bar-shaped design, matte black finish, subtle LED indicator.
Camera is mounted on a magnetic base. Modern, premium design.
Clean white background, studio product photography. No text.`,
        aspect: "4:3",
        priority: 1,
    },
    {
        folder: "camera",
        filename: "camera-hybrid-class.jpg",
        prompt: `A modern hybrid classroom scene. A teacher stands at a large interactive smart board teaching.
On the smart board screen, remote students are visible in video tiles alongside the lesson content.
In the physical classroom, students sit at desks engaged in the lesson.
The concept is "same class, different locations." Bright, professional educational photography.`,
        aspect: "4:3",
        priority: 0,
    },
    {
        folder: "camera",
        filename: "camera-tracking.jpg",
        prompt: `A classroom scene where an AI camera is tracking the teacher with a subtle highlight/glow effect.
The teacher is presenting at a smart board. A semi-transparent bounding box or tracking indicator
follows the teacher. Shot from the back of the classroom showing the full scene.
Modern tech-enhanced classroom. Clean, editorial photography with subtle VFX overlay.`,
        aspect: "16:9",
        priority: 2,
    },

    // ── ECOSYSTEM ───────────────────────────────────────────────
    {
        folder: "ecosystem",
        filename: "ecosystem-board-ui.png",
        prompt: `A large interactive smart board displaying an educational software interface.
The UI shows: attendance list on left sidebar, main whiteboard canvas in center with handwritten notes,
toolbar at bottom with drawing tools, timer, and quiz icons. Modern, clean UI design.
Shot straight-on showing the full board. Classroom environment slightly visible.
Clean, professional product screenshot style.`,
        aspect: "16:9",
        priority: 0,
    },
    {
        folder: "ecosystem",
        filename: "ecosystem-flow-diagram.png",
        prompt: `A horizontal flow diagram showing an integrated education workflow:
Attendance → Class → Assignment → Grading → Parent Notification.
Each step is a rounded rectangle with a simple icon inside, connected by arrows.
Clean flat design, orange (#E05024) accent color on white background.
Minimal, modern infographic style. Professional and clean.`,
        aspect: "16:9",
        priority: 2,
    },

    // ── LINEUP ──────────────────────────────────────────────────
    {
        folder: "lineup",
        filename: "lineup-all-sizes.png",
        prompt: `Product comparison photo showing 4 interactive smart boards of different sizes side by side.
From left to right: 65 inch, 75 inch, 86 inch, and 110 inch.
All have identical design but different sizes, clearly showing the scale difference.
A small human silhouette for scale reference. Clean white background.
Professional product lineup photography. No text labels.`,
        aspect: "16:9",
        priority: 1,
    },

    // ── SPACES ──────────────────────────────────────────────────
    {
        folder: "spaces",
        filename: "space-classroom.jpg",
        prompt: `A modern school classroom with an 86-inch interactive smart board mounted on the front wall.
20-30 student desks arranged in rows, bright natural lighting from windows.
The smart board displays a colorful lesson. Clean, bright, aspirational educational space.
Warm wood tones, white walls. Professional architectural/interior photography.`,
        aspect: "4:3",
        priority: 0,
    },
    {
        folder: "spaces",
        filename: "space-lecture-hall.jpg",
        prompt: `A large university lecture hall or auditorium with a massive 110-inch interactive smart board at front.
Tiered seating, modern architecture, sleek design. The board shows presentation content.
50+ seats visible. Clean, professional, modern educational facility.
Wide angle architectural photography. Bright lighting.`,
        aspect: "4:3",
        priority: 2,
    },
    {
        folder: "spaces",
        filename: "space-seminar.jpg",
        prompt: `A modern seminar room or corporate meeting room with a 75-inch interactive smart board on the wall.
8-12 person conference table, ergonomic chairs, clean minimalist interior design.
The board shows a brainstorming mind map. Glass walls, modern office aesthetic.
Professional interior photography. Bright, clean, premium feeling.`,
        aspect: "4:3",
        priority: 2,
    },
    {
        folder: "spaces",
        filename: "space-study-room.jpg",
        prompt: `A small cozy study room or tutoring room with a 65-inch interactive smart board on the wall.
4-6 students at a round table, intimate learning environment.
The board shows detailed study content. Warm, focused atmosphere.
Modern education center interior. Professional photography, warm lighting.`,
        aspect: "4:3",
        priority: 2,
    },
]

/* ── Gemini API 호출 ─────────────────────────────────────────── */

async function generateImage(task: ImageTask): Promise<Buffer | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${API_KEY}`

    const body = {
        instances: [{ prompt: task.prompt }],
        parameters: {
            sampleCount: 1,
            aspectRatio: task.aspect ?? "4:3",
            safetyFilterLevel: "BLOCK_MEDIUM_AND_ABOVE",
        },
    }

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const errText = await res.text()
        console.error(`  ❌ API 에러 (${res.status}): ${errText.slice(0, 200)}`)
        return null
    }

    const data = await res.json()
    const b64 = data.predictions?.[0]?.bytesBase64Encoded
    if (!b64) {
        console.error(`  ❌ 이미지 데이터 없음`)
        return null
    }

    return Buffer.from(b64, "base64")
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

    console.log(`\n🎨 ClassIn Board 이미지 생성`)
    console.log(`   총 ${filtered.length}장 (P0~P${maxPriority})`)
    if (onlyFolders) console.log(`   폴더 필터: ${onlyFolders.join(", ")}`)
    console.log(`${"─".repeat(50)}\n`)

    let success = 0
    let fail = 0

    for (const task of filtered) {
        const outDir = path.join(BASE_DIR, task.folder)
        const outPath = path.join(outDir, task.filename)

        // 이미 존재하면 스킵
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

        // rate limit 방지
        await new Promise((r) => setTimeout(r, 2000))
    }

    console.log(`\n${"─".repeat(50)}`)
    console.log(`✅ 성공: ${success}장 / ❌ 실패: ${fail}장`)
    console.log(`📁 저장 위치: ${BASE_DIR}\n`)
}

main().catch(console.error)
