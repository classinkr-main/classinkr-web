import { GoogleGenerativeAI } from "@google/generative-ai"
import { NextRequest } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { buildBlogAiPrompt, readBlogAiRequest, type BlogAiAction } from "@/lib/blog-ai-prompts"
import { BLOG_AI_STREAM_ERROR_MARKER } from "@/lib/blog-types"
import { DEFAULT_GEMINI_MODEL, resolveGeminiModel } from "@/lib/marketing/gemini-model"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 60 // 1분으로 타임아웃 연장

const AI_RATE_LIMIT = { windowMs: 5 * 60_000, max: 8 }

// Google 오류 원문(영어, 긴 URL 포함)을 편집자가 할 일로 바꾼다. 2026-10-27 로컬 키에서 402·404 를 실제로 봤다.
function describeGeminiError(err: unknown, model: string) {
  const raw = err instanceof Error ? err.message : String(err)
  if (/\[402|prepayment|credits are depleted/i.test(raw)) {
    return "AI 사용 크레딧이 바닥났습니다. Google AI Studio 의 결제(선불 크레딧)를 확인해 주세요."
  }
  if (/\[404|no longer available|not found/i.test(raw)) {
    return `AI 모델(${model})을 쓸 수 없습니다. 서버의 GEMINI_MODEL 설정을 바꿔야 합니다.`
  }
  if (/\[429|quota|rate limit|RESOURCE_EXHAUSTED/i.test(raw)) {
    return "AI 사용량 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요."
  }
  if (/\[503|overloaded|unavailable/i.test(raw)) {
    return "AI 서버가 붐빕니다. 잠시 뒤 다시 시도해 주세요."
  }
  return `AI 생성에 실패했습니다. (${raw.slice(0, 160)})`
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

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await req.json()
    if (!parsed || typeof parsed !== "object") throw new Error("not an object")
    body = parsed as Record<string, unknown>
  } catch {
    return new Response(JSON.stringify({ error: "요청 형식이 올바르지 않습니다." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const action = body.action as BlogAiAction
  const validActions: BlogAiAction[] = [
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

  const { title, content, category, extra } = readBlogAiRequest(body)
  const prompt = buildBlogAiPrompt(action, title, content, category, extra)
  // 다른 어드민 AI 와 같은 GEMINI_MODEL 설정을 따른다(모델이 막히면 env 하나로 바꾼다).
  const modelName = resolveGeminiModel("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({ model: modelName })

  let streamResult: Awaited<ReturnType<typeof model.generateContentStream>>
  try {
    streamResult = await model.generateContentStream(prompt)
  } catch (err) {
    return new Response(JSON.stringify({ error: describeGeminiError(err, modelName) }), {
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
        // 본문에 섞이지 않게 표식 뒤에 싣는다(편집기가 표식을 보고 결과를 버린다).
        controller.enqueue(encoder.encode(`${BLOG_AI_STREAM_ERROR_MARKER}${describeGeminiError(err, modelName)}`))
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
