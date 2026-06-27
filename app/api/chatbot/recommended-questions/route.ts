import { NextResponse } from "next/server"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"

export const dynamic = "force-dynamic"

const STARTER_QUESTION_LIMIT = 4
const MAX_STARTER_QUESTION_LENGTH = 120

const fallbackQuestions = [
    ...CLASSIN_POSITIONING.chatbot.starterQuestions,
].slice(0, STARTER_QUESTION_LIMIT)

const legacyStarterQuestionMap = new Map([
    ["우리 학원에 맞는 도입 방식이 궁금해요", "Classin이 Zoom이나 일반 전자칠판과 뭐가 다른가요?"],
    ["수업 중 집중도와 출석 관리를 개선하고 싶어요", "우리 학원 90일 도입 순서를 어떻게 잡으면 좋을까요?"],
    ["결제, 영수증, 계정 문제를 상담받고 싶어요", "전자칠판·녹화·EDB·LMS를 수업 흐름으로 쓰는 방법이 궁금해요"],
    ["전자칠판 설치나 A/S는 어떻게 진행되나요?", "요금/견적은 어떤 항목으로 구성되나요?"],
])

interface RecommendedQuestionRow {
    prompt: unknown
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

function normalizeQuestions(questions: unknown[]) {
    return Array.from(
        new Set(
            questions
                .map((question) => (typeof question === "string" ? question.trim() : null))
                .map((question) => question ? legacyStarterQuestionMap.get(question) ?? question : question)
                .filter((question): question is string =>
                    Boolean(question && question.length <= MAX_STARTER_QUESTION_LENGTH)
                )
        )
    ).slice(0, STARTER_QUESTION_LIMIT)
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
            .limit(STARTER_QUESTION_LIMIT)

        if (error) throw error

        const dbQuestions = (data ?? []).map(
            (question) => (question as RecommendedQuestionRow).prompt
        )
        const questions = normalizeQuestions([...dbQuestions, ...fallbackQuestions])

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
