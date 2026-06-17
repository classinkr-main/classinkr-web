import { NextResponse } from "next/server"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"

export const dynamic = "force-dynamic"

const fallbackQuestions = [
    ...CLASSIN_POSITIONING.chatbot.starterQuestions,
]

interface RecommendedQuestionRow {
    prompt: string | null
}

function hasSupabaseServerEnv() {
    return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() &&
            (process.env.SUPABASE_SECRET_KEY?.trim() ||
                process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
    )
}

function fallbackResponse(warning: string) {
    return NextResponse.json({
        questions: fallbackQuestions,
        warning,
    })
}

export async function GET() {
    if (!hasSupabaseServerEnv()) {
        return fallbackResponse("Supabase 환경변수가 없어 기본 질문을 반환했습니다.")
    }

    try {
        const supabase = createSupabaseAdminClient()
        const { data, error } = await supabase
            .from("chatbot_recommended_questions")
            .select("prompt")
            .eq("placement", "starter")
            .eq("status", "published")
            .order("order_index", { ascending: true })
            .order("updated_at", { ascending: false })
            .limit(3)

        if (error) throw error

        const questions = (data ?? [])
            .map((question) => (question as RecommendedQuestionRow).prompt?.trim())
            .filter((question): question is string => Boolean(question))
            .slice(0, 3)

        if (questions.length === 0) {
            return fallbackResponse("게시된 추천 질문이 없어 기본 질문을 반환했습니다.")
        }

        return NextResponse.json({ questions })
    } catch (error) {
        console.warn(
            "[GET /api/chatbot/recommended-questions] fallback:",
            error instanceof Error ? error.message : error
        )
        return fallbackResponse("추천 질문을 불러오지 못해 기본 질문을 반환했습니다.")
    }
}
