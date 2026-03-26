import { NextRequest } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { verifyAdmin } from "@/lib/admin-auth"

export const runtime = "nodejs"

type AiAction = "card-news" | "reels" | "optimize"

const PROMPTS: Record<AiAction, (title: string, content: string, category: string) => string> = {
  "card-news": (title, content, category) => `
당신은 SNS 카드뉴스 전문 에디터입니다.
아래 블로그 글을 카드뉴스 슬라이드 구성안으로 변환해주세요.

블로그 제목: ${title}
카테고리: ${category}
본문:
${content}

다음 형식으로 작성해주세요:

---
## 🃏 카드뉴스 구성안

**[표지 - 1장]**
- 헤드라인: (임팩트 있는 한 줄, 20자 이내)
- 서브: (부제목, 30자 이내)
- 시각 가이드: (배경/색상/분위기 제안)

**[슬라이드 2장]**
- 제목:
- 본문: (2~3줄 핵심 내용)
- 시각 가이드:

(슬라이드 3~6장도 동일 형식으로)

**[마무리 - 마지막 장]**
- CTA 문구:
- 계정 태그: @classin_official
---

총 6~8장으로 구성하고, 각 슬라이드는 스크롤을 멈추게 하는 한 가지 핵심 포인트만 담아주세요.
모든 텍스트는 한국어로 작성해주세요.
`.trim(),

  "reels": (title, content, category) => `
당신은 인스타그램·유튜브 쇼츠 스크립트 전문가입니다.
아래 블로그 글을 60초 이내 릴스/쇼츠 스크립트로 변환해주세요.

블로그 제목: ${title}
카테고리: ${category}
본문:
${content}

다음 형식으로 작성해주세요:

---
## 🎬 릴스 스크립트

**[Hook - 0~3초]**
> (시청자가 스크롤을 멈추게 하는 첫 마디. 질문이나 충격적인 사실로 시작)
자막: ""
행동: (제스처/화면 전환 등)

**[본론 - 4~45초]**
포인트 1 (4~15초)
> 자막: ""
행동:

포인트 2 (16~30초)
> 자막: ""
행동:

포인트 3 (31~45초)
> 자막: ""
행동:

**[CTA - 46~60초]**
> 자막: ""
행동: (팔로우/저장/댓글 유도)

---

**해시태그 추천** (15개 이내):

**영상 제목 3개 제안**:
1.
2.
3.
---

모든 자막은 한 줄에 15자 이내로, 말하듯 자연스럽게 작성해주세요.
`.trim(),

  "optimize": (title, content, category) => `
당신은 한국 SEO 전문가이자 콘텐츠 에디터입니다.
아래 블로그 글을 분석하고 구체적인 개선안을 제안해주세요.

블로그 제목: ${title}
카테고리: ${category}
본문:
${content}

다음 형식으로 작성해주세요:

---
## ✨ 블로그 최적화 제안

### 제목 개선안 (3개)
현재: "${title}"

1. (SEO 최적화 버전)
2. (클릭율 최적화 버전)
3. (감성/공감 버전)

### SEO 키워드 추천
**메인 키워드** (1개):
**서브 키워드** (3~5개):
**LSI 키워드** (연관 검색어, 5개):

### 구조 개선 제안
(현재 구조의 문제점과 개선 방향을 구체적으로 3가지)
1.
2.
3.

### 첫 단락 개선
현재 첫 단락을 아래처럼 수정하면 이탈률을 낮출 수 있습니다:
> (개선된 첫 단락 직접 작성)

### 내부 링크 기회
(이 글과 연결하면 좋을 주제/섹션 제안 3가지)

### 메타 설명 제안
> (120~160자 이내, 클릭을 유도하는 메타 설명)
---
`.trim(),
}

export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  if (!process.env.GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }

  let body: { action: AiAction; title: string; content: string; category: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { action, title, content, category } = body

  if (!action || !PROMPTS[action]) {
    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const prompt = PROMPTS[action](title || "제목 없음", content || "", category || "인사이트")

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        const result = await model.generateContentStream(prompt)
        for await (const chunk of result.stream) {
          const text = chunk.text()
          if (text) controller.enqueue(encoder.encode(text))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI 처리 중 오류가 발생했습니다."
        controller.enqueue(encoder.encode(`\n\n[오류: ${msg}]`))
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
    },
  })
}
