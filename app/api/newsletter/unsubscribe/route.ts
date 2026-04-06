/**
 * ─────────────────────────────────────────────────────────────
 * /api/newsletter/unsubscribe  —  뉴스레터 수신거부 (공개 API)
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-16] 수신거부 링크 처리
 *   모든 마케팅 이메일 하단에 수신거부 링크를 포함해야 함 (법적 의무).
 *   링크 형식: https://도메인/api/newsletter/unsubscribe?email=xxx
 *
 *   GET  → 이메일 파라미터로 즉시 수신거부 (이메일 내 원클릭)
 *   POST → JSON body로 수신거부 (프론트엔드 폼)
 */

import { NextRequest, NextResponse } from "next/server"
import { unsubscribe } from "@/lib/repositories/marketing"

/** GET: 이메일 링크에서 직접 수신거부 (원클릭) */
export async function GET(req: NextRequest) {
  const email = new URL(req.url).searchParams.get("email")

  if (!email) {
    return new NextResponse(
      renderUnsubscribePage("이메일 파라미터가 없습니다.", false),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    )
  }

  const success = await unsubscribe(email)

  return new NextResponse(
    renderUnsubscribePage(
      success
        ? "수신거부가 완료되었습니다. 더 이상 마케팅 이메일이 발송되지 않습니다."
        : "해당 이메일을 찾을 수 없습니다.",
      success
    ),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  )
}

/** POST: 프론트엔드 폼에서 수신거부 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json(
        { error: "이메일은 필수입니다." },
        { status: 400 }
      )
    }

    const success = await unsubscribe(email)

    return NextResponse.json({
      ok: success,
      message: success
        ? "수신거부가 완료되었습니다."
        : "해당 이메일을 찾을 수 없습니다.",
    })
  } catch {
    return NextResponse.json(
      { error: "잘못된 요청입니다." },
      { status: 400 }
    )
  }
}

/**
 * [NOTE-16] 수신거부 확인 HTML 페이지
 * 이메일 내 수신거부 링크 클릭 시 보여주는 결과 페이지.
 * 별도의 프론트엔드 페이지 없이 API에서 직접 HTML 반환.
 */
function renderUnsubscribePage(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>수신거부 - Classin</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh; margin: 0;
      background: #FAFAF8; color: #111110;
    }
    .card {
      text-align: center; padding: 48px 32px;
      background: white; border-radius: 16px;
      border: 1px solid #e8e8e4;
      max-width: 420px; width: 90%;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; margin-bottom: 12px; }
    p { color: #666; line-height: 1.6; }
    a { color: #084734; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? "✅" : "⚠️"}</div>
    <h1>${success ? "수신거부 완료" : "처리 실패"}</h1>
    <p>${message}</p>
    <p style="margin-top: 24px;"><a href="/">Classin 홈으로 돌아가기</a></p>
  </div>
</body>
</html>`
}
