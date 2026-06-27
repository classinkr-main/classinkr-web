import { GoogleGenerativeAI } from "@google/generative-ai"
import { NextRequest } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 60 // 1분으로 타임아웃 연장

const AI_RATE_LIMIT = { windowMs: 5 * 60_000, max: 8 }

type AiAction = "card-news" | "reels" | "optimize" | "draft"

type DraftParams = {
  topic?: string
  tone?: string
  length?: string
  reference?: string
}

const TONE_GUIDE: Record<string, string> = {
  professional:
    "Use a polished, evidence-driven voice suitable for an education SaaS brand.",
  casual:
    "Use a clear, friendly, approachable voice with plain language and short sentences.",
  storytelling:
    "Use a narrative structure with concrete examples and emotional pacing.",
  persuasive:
    "Use benefit-led framing, clear problem/solution structure, and a strong CTA.",
  informative:
    "Use an organized, practical, concise tone focused on clarity and utility.",
}

const LENGTH_GUIDE: Record<string, { words: string; sections: string }> = {
  short: {
    words: "about 500 words",
    sections: "intro + 2 body sections + closing",
  },
  medium: {
    words: "about 1200 words",
    sections: "intro + 4 to 5 body sections + closing",
  },
  long: {
    words: "about 2500 words",
    sections: "intro + 7 to 8 body sections + closing + summary",
  },
}

function buildCardNewsPrompt(title: string, content: string, category: string) {
  return `
You are a senior social content editor.
Turn the following blog post into a 6-8 slide card-news outline for Korean social media.

Title: ${title}
Category: ${category}
Content:
${content}

Output format:
- Slide 1: hook headline, subheadline, visual direction
- Slides 2-7: title, 2-3 key sentences, visual direction
- Final slide: CTA and account tag

Keep each slide focused on one idea and write all copy in Korean.
`.trim()
}

function buildReelsPrompt(title: string, content: string, category: string) {
  return `
You are a short-form video script writer.
Turn the following blog post into a Korean short-form script under 60 seconds.

Title: ${title}
Category: ${category}
Content:
${content}

Output format:
- Hook (0-3s)
- Main point 1 (4-15s)
- Main point 2 (16-30s)
- Main point 3 (31-45s)
- CTA (46-60s)
- 15 hashtags max
- 3 title options

Keep lines spoken naturally and concise.
`.trim()
}

function buildOptimizePrompt(title: string, content: string, category: string) {
  return `
You are a Korean blog editor and SEO copy editor.
Rewrite the following blog post body into a polished, publish-ready Korean markdown article.

Title: ${title}
Category: ${category}
Content:
${content}

Hard requirements:
- Return only the revised markdown body. Do not include explanations, checklists, title options, meta descriptions, or wrapping code fences.
- Preserve every markdown image, HTML media block, iframe, video, figure, and any [[CLASSIN_MEDIA_N]] placeholder exactly as provided.
- Keep existing media in the same order and near its original surrounding section.
- Do not invent, remove, rewrite, or replace image URLs, filenames, alt text, embeds, or media placeholders.
- Improve Korean grammar, flow, headings, paragraph rhythm, clarity, and SEO readability.
- Keep the article's original intent, facts, product names, and CTA direction.
- Write everything in Korean.
`.trim()
}

function buildDraftPrompt(
  title: string,
  content: string,
  category: string,
  { topic = "", tone = "professional", length = "medium", reference = "" }: DraftParams
) {
  const toneGuide = TONE_GUIDE[tone] ?? TONE_GUIDE.professional
  const lengthGuide = LENGTH_GUIDE[length] ?? LENGTH_GUIDE.medium
  const referenceBlock = reference.trim()
    ? `\nReference material to reflect:\n---\n${reference.trim()}\n---\n`
    : ""

  return `
You are a Korean blog writer for an education operations platform.
Write a full markdown draft from scratch.

Requested topic: ${topic || title || "education operations insight"}
Category: ${category || "insight"}
Target length: ${lengthGuide.words}
Recommended structure: ${lengthGuide.sections}
Tone guide: ${toneGuide}

Existing title hint: ${title || "none"}
Existing content hint:
${content || "none"}
${referenceBlock}

Requirements:
- Start with an H1 title
- Use H2 and H3 headings where helpful
- Use bold emphasis sparingly
- Keep the writing natural and publishable
- Write everything in Korean
- End with a practical takeaway or CTA
`.trim()
}

function buildPrompt(
  action: AiAction,
  title: string,
  content: string,
  category: string,
  extra: DraftParams
) {
  switch (action) {
    case "card-news":
      return buildCardNewsPrompt(title, content, category)
    case "reels":
      return buildReelsPrompt(title, content, category)
    case "optimize":
      return buildOptimizePrompt(title, content, category)
    case "draft":
      return buildDraftPrompt(title, content, category, extra)
  }
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const ip = getClientIp(req)
  const { allowed } = await checkRateLimitDistributed(ip, "admin-blog-ai", AI_RATE_LIMIT)
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Too many requests." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!process.env.GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is not configured." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  let body: {
    action: AiAction
    title: string
    content: string
    category: string
    topic?: string
    tone?: string
    length?: string
    reference?: string
  }

  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { action, title, content, category, topic, tone, length, reference } =
    body

  const validActions: AiAction[] = [
    "card-news",
    "reels",
    "optimize",
    "draft",
  ]
  if (!action || !validActions.includes(action)) {
    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const prompt = buildPrompt(action, title || "", content || "", category || "", {
    topic,
    tone,
    length,
    reference,
  })

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" })

  let streamResult: Awaited<ReturnType<typeof model.generateContentStream>>
  try {
    streamResult = await model.generateContentStream(prompt)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AI generation failed."
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      try {
        for await (const chunk of streamResult.stream) {
          const text = chunk.text()
          if (text) controller.enqueue(encoder.encode(text))
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "AI generation failed."
        controller.enqueue(encoder.encode(`\n\n[error: ${message}]`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  })
}
