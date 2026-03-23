import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"

const DUMMY_PAYLOAD = {
  source: "demo_modal",
  name: "테스트 사용자",
  org: "테스트 학원",
  role: "원장",
  size: "100",
  email: "test@classin.kr",
  phone: "010-0000-0000",
  timestamp: new Date().toISOString(),
  _test: true,
}

export async function POST(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err

  const { type, url } = await req.json()

  if (!url) {
    return NextResponse.json({ ok: false, message: "URL이 설정되지 않았습니다." })
  }

  try {
    let body: Record<string, unknown> = DUMMY_PAYLOAD

    if (type === "channelTalk") {
      body = {
        event: "new_lead",
        source: "demo_modal",
        name: "테스트 사용자",
        org: "테스트 학원",
        phone: "010-0000-0000",
        email: "test@classin.kr",
        message: "원장 / 원생 100명",
        timestamp: new Date().toISOString(),
        _test: true,
      }
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })

    if (res.ok) {
      return NextResponse.json({ ok: true, status: res.status, message: `연결 성공 (HTTP ${res.status})` })
    } else {
      return NextResponse.json({ ok: false, status: res.status, message: `서버 응답 오류 (HTTP ${res.status})` })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류"
    return NextResponse.json({ ok: false, message: `연결 실패: ${msg}` })
  }
}
