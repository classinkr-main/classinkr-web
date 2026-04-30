import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { verifyAdmin } from "@/lib/admin-auth"

export const runtime = "nodejs"
export const maxDuration = 60 // 1분으로 타임아웃 연장

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
  /** ?꾩껜 ?대찓???앹꽦 紐⑤뱶: 罹좏럹??紐⑺몴/???ㅻ챸 */
  brief?: string
  /** AI 釉붾줉 紐⑤뱶: ?쒗뵆由우쓽 {ai: ...} ?꾨＼?꾪듃 */
  promptOverride?: string
  recipient: RecipientContext
}

function buildEmailPrompt(brief: string, r: RecipientContext): string {
  return `
?뱀떊? ?숈썝 愿由??뚰봽?몄썾???대옒?ㅼ씤??留덉????대떦?먯엯?덈떎.
?꾨옒 ?섏떊?먯뿉寃?媛쒖씤?붾맂 ?대찓?쇱쓣 ?묒꽦?댁＜?몄슂.

?섏떊???뺣낫:
- ?대쫫: ${r.name || "?????놁쓬"}
- ?숈썝紐? ${r.org || "?????놁쓬"}
- 吏곸콉: ${r.role || "?????놁쓬"}
- ?숈썝 洹쒕え: ${r.size || "?????놁쓬"}
- ?좎엯 寃쎈줈: ${r.source || "?????놁쓬"}
- ?쒓렇: ${r.tags?.join(", ") || "?놁쓬"}

罹좏럹??紐⑺몴: ${brief}

?ㅼ쓬 ?뺤떇?쇰줈 ?묒꽦?댁＜?몄슂:
泥?以? ?대찓???쒕ぉ (35~60?? ?섏떊???대쫫/?곹솴 ?ы븿)
??踰덉㎏ 以? ---
?섎㉧吏: ?대찓??蹂몃Ц (HTML, <p> ?쒓렇 ?ъ슜, 3~4?⑤씫)

洹쒖튃:
- ?섏떊?먯쓽 吏곸콉怨??숈썝 洹쒕え??留욌뒗 ?몄뼱 (?먯옣 = 寃쎌쁺/?댁쁺, 媛뺤궗 = ?섏뾽/?숈깮)
- ?곕쑜?섍퀬 ?꾨Ц?곸씤 ??
- ?대옒?ㅼ씤??援ъ껜?곸씤 媛移??멸툒 (?섏뾽 愿由? ?숇?紐??뚰넻, ?댁쁺 ?⑥쑉)
- 留덉?留??⑤씫??紐낇솗??CTA (臾대즺 ?곷떞 ?좎껌 ?좊룄)
- 紐⑤뱺 ?띿뒪???쒓뎅??
`.trim()
}

function buildBlockPrompt(prompt: string, r: RecipientContext): string {
  return `
?뱀떊? ?숈썝 愿由??뚰봽?몄썾???대옒?ㅼ씤??留덉????대떦?먯엯?덈떎.
?꾨옒 ?섏떊???뺣낫瑜?諛뷀깢?쇰줈 ?붿껌???댁슜???묒꽦?댁＜?몄슂.

?섏떊???뺣낫:
- ?대쫫: ${r.name || "?????놁쓬"}
- ?숈썝紐? ${r.org || "?????놁쓬"}
- 吏곸콉: ${r.role || "?????놁쓬"}
- ?숈썝 洹쒕え: ${r.size || "?????놁쓬"}

?붿껌: ${prompt}

洹쒖튃:
- ?쒓뎅?대줈 ?묒꽦
- ?섏떊?먯쓽 ?곹솴???먯뿰?ㅻ읇寃?諛섏쁺
- 1~3臾몄옣?쇰줈 媛꾧껐?섍쾶
- HTML ?쒓렇 ?놁씠 ?쒖닔 ?띿뒪??
`.trim()
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY媛 ?ㅼ젙?섏? ?딆븯?듬땲??" },
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
      { error: "brief ?먮뒗 promptOverride媛 ?꾩슂?⑸땲??" },
      { status: 400 }
    )
  }

  const prompt = body.promptOverride
    ? buildBlockPrompt(body.promptOverride, body.recipient)
    : buildEmailPrompt(body.brief!, body.recipient)

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" })

  try {
    const result = await model.generateContent(prompt)
    const text   = result.response.text()

    // AI 釉붾줉 紐⑤뱶: ?띿뒪??洹몃?濡?諛섑솚
    if (body.promptOverride) {
      return NextResponse.json({ text: text.trim() })
    }

    // ?대찓??紐⑤뱶: ?쒕ぉ / --- / 蹂몃Ц ?뚯떛
    const sepIdx = text.indexOf("\n---\n")
    if (sepIdx !== -1) {
      return NextResponse.json({
        subject: text.slice(0, sepIdx).replace(/^[^:]+:\s*/i, "").trim(),
        body: text.slice(sepIdx + 5).trim(),
      })
    }

    // fallback: 泥?以?= ?쒕ぉ
    const lines = text.trim().split("\n")
    return NextResponse.json({
      subject:
        lines[0].replace(/^[^:]+:\s*/i, "").trim() || "?대옒?ㅼ씤 ?덈궡",
      body: lines.slice(1).join("\n").trim() || text,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI 泥섎━ 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
