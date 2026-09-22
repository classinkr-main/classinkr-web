import { NextRequest, NextResponse } from "next/server"

import { applyAutoTagRules } from "@/lib/repositories/crm-tag-rules"

// CRM 자동 태그 규칙(§11.3 T5) 일 1회 적용 — vercel.json "0 20 * * *"(KST 05:00).
// 인증은 CRON_SECRET Bearer 하나뿐이다 — Vercel이 크론에 붙이는 건 그 헤더이지
// x-vercel-cron이 아니다(app/api/cron/lead-response-alerts/route.ts와 동일 계약).
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET 환경변수가 설정되지 않았습니다." }, { status: 401 })
  }

  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1"

  try {
    const report = await applyAutoTagRules({ dryRun })
    return NextResponse.json({ ok: true, report })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[cron/crm-auto-tags] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
