import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { verifyAdmin } from "@/lib/admin-auth"

export const runtime = "nodejs"

interface RecipientContext {
  name?: string
  org?: string
  role?: string
  phone?: string
  size?: string
  source?: string
  tags?: string[]
}

interface AiPersonalizeRequest {
  /** 전체 이메일 생성 모드: 캠페인 목표/톤 설명 */
  brief?: string
  /** AI 블록 모드: 템플릿의 {ai: ...} 프롬프트 */
  promptOverride?: string
  recipient: RecipientContext
}

function buildEmailPrompt(brief: string, r: RecipientContext): string {
  return `
당신은 학원 관리 소프트웨어 클래스인의 마케팅 담당자입니다.
아래 수신자에게 개인화된 이메일을 작성해주세요.

수신자 정보:
- 이름: ${r.name || "알 수 없음"}
- 학원명: ${r.org || "알 수 없음"}
- 직책: ${r.role || "알 수 없음"}
- 학원 규모: ${r.size || "알 수 없음"}
- 유입 경로: ${r.source || "알 수 없음"}
- 태그: ${r.tags?.join(", ") || "없음"}

캠페인 목표: ${brief}

다음 형식으로 작성해주세요:
첫 줄: 이메일 제목 (35~60자, 수신자 이름/상황 포함)
두 번째 줄: ---
나머지: 이메일 본문 (HTML, <p> 태그 사용, 3~4단락)

규칙:
- 수신자의 직책과 학원 규모에 맞는 언어 (원장 = 경영/운영, 강사 = 수업/학생)
- 따뜻하고 전문적인 톤
- 클래스인의 구체적인 가치 언급 (수업 관리, 학부모 소통, 운영 효율)
- 마지막 단락에 명확한 CTA (무료 상담 신청 유도)
- 모든 텍스트 한국어
`.trim()
}

function buildBlockPrompt(prompt: string, r: RecipientContext): string {
  return `
당신은 학원 관리 소프트웨어 클래스인의 마케팅 담당자입니다.
아래 수신자 정보를 바탕으로 요청된 내용을 작성해주세요.

수신자 정보:
- 이름: ${r.name || "알 수 없음"}
- 학원명: ${r.org || "알 수 없음"}
- 직책: ${r.role || "알 수 없음"}
- 학원 규모: ${r.size || "알 수 없음"}

요청: ${prompt}

규칙:
- 한국어로 작성
- 수신자의 상황을 자연스럽게 반영
- 1~3문장으로 간결하게
- HTML 태그 없이 순수 텍스트
`.trim()
}

export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY가 설정되지 않았습니다." },
      { status: 500 }
    )
  }

  let body: AiPersonalizeRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (!body.brief && !body.promptOverride) {
    return NextResponse.json(
      { error: "brief 또는 promptOverride가 필요합니다." },
      { status: 400 }
    )
  }

  const prompt = body.promptOverride
    ? buildBlockPrompt(body.promptOverride, body.recipient)
    : buildEmailPrompt(body.brief!, body.recipient)

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

  try {
    const result = await model.generateContent(prompt)
    const text   = result.response.text()

    // AI 블록 모드: 텍스트 그대로 반환
    if (body.promptOverride) {
      return NextResponse.json({ text: text.trim() })
    }

    // 이메일 모드: 제목 / --- / 본문 파싱
    const sepIdx = text.indexOf("\n---\n")
    if (sepIdx !== -1) {
      return NextResponse.json({
        subject: text.slice(0, sepIdx).replace(/^제목:\s*/i, "").trim(),
        body:    text.slice(sepIdx + 5).trim(),
      })
    }

    // fallback: 첫 줄 = 제목
    const lines = text.trim().split("\n")
    return NextResponse.json({
      subject: lines[0].replace(/^제목:\s*/i, "").trim() || "클래스인 안내",
      body:    lines.slice(1).join("\n").trim() || text,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI 처리 중 오류가 발생했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
