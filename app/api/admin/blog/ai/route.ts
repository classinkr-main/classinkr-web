import { GoogleGenerativeAI } from "@google/generative-ai"
import { NextRequest } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { BLOG_AI_STREAM_ERROR_MARKER } from "@/lib/blog-types"
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

// 키는 편집기 선택지 값(한글) 그대로다. 예전엔 영어 키라 어떤 톤을 골라도 기본 톤으로 떨어졌다.
const TONE_GUIDE: Record<string, string> = {
  전문적:
    "Use a polished, trustworthy voice suitable for an education SaaS brand. Do not state numbers, prices, or product capabilities that are not given in the input.",
  친근한:
    "Use a clear, friendly, approachable voice with plain language and short sentences.",
  스토리텔링:
    "Use a narrative structure with concrete classroom situations and natural pacing.",
  설득형:
    "Use benefit-led framing and a clear problem/solution structure, ending with a soft call to action. Do not exaggerate.",
  정보형:
    "Use an organized, practical, concise tone focused on clarity and utility.",
}
const DEFAULT_TONE = "전문적"

// 분량은 편집기 선택지와 같은 단위(한국어 글자 수, 공백 포함)로 지시한다. 예전엔 화면은 '자', 프롬프트는 'words'였다.
const LENGTH_GUIDE: Record<string, { chars: string; sections: string }> = {
  short: {
    chars: "about 1,500 Korean characters including spaces",
    sections: "intro + 2 body sections + closing",
  },
  medium: {
    chars: "about 3,000 Korean characters including spaces",
    sections: "intro + 4 body sections + closing",
  },
  long: {
    chars: "about 5,000 Korean characters including spaces",
    sections: "intro + 6 body sections + closing + summary",
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
  { topic = "", tone = DEFAULT_TONE, length = "medium", reference = "" }: DraftParams
) {
  const toneGuide = TONE_GUIDE[tone] ?? TONE_GUIDE[DEFAULT_TONE]
  const lengthGuide = LENGTH_GUIDE[length] ?? LENGTH_GUIDE.medium
  const referenceBlock = reference.trim()
    ? `\nReference material to reflect:\n---\n${reference.trim()}\n---\n`
    : ""

  return `
You are a Korean blog writer for an education operations platform.
Write a full markdown draft from scratch.

Requested topic: ${topic || title || "education operations insight"}
Category: ${category || "insight"}
Target length: ${lengthGuide.chars}
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
    return new Response(JSON.stringify({ error: "AI 요청이 몰렸습니다. 5분쯤 뒤에 다시 시도해 주세요." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!process.env.GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "AI 키(GEMINI_API_KEY)가 서버에 설정돼 있지 않습니다." }),
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
    return new Response(JSON.stringify({ error: "요청 형식이 올바르지 않습니다." }), {
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
    return new Response(JSON.stringify({ error: "지원하지 않는 AI 작업입니다." }), {
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

  // 편집기가 창을 닫거나 다시 생성하면 요청을 끊는다. 그때 생성도 멈춰 쿼터를 아낀다.
  let cancelled = false
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      try {
        for await (const chunk of streamResult.stream) {
          if (cancelled || req.signal.aborted) break
          const text = chunk.text()
          if (text) controller.enqueue(encoder.encode(text))
        }
      } catch (err) {
        if (cancelled) return
        const message =
          err instanceof Error ? err.message : "AI 생성이 중간에 실패했습니다."
        // 본문에 섞이지 않게 표식 뒤에 싣는다(편집기가 표식을 보고 결과를 버린다).
        controller.enqueue(encoder.encode(`${BLOG_AI_STREAM_ERROR_MARKER}${message}`))
      } finally {
        if (!cancelled) controller.close()
      }
    },
    cancel() {
      cancelled = true
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
