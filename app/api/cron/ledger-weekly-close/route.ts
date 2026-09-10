import { NextRequest, NextResponse } from "next/server"

import { captureWeeklyCloseSnapshot } from "@/lib/repositories/sales-ledger-weekly-close"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// 주간 마감 스냅샷 자동화: 매주 금요일 14:30 UTC(= 23:30 KST, 한국 영업주 마감)에 현재
// REV 상태를 스냅샷 run으로 남긴다(vercel.json crons: 30 14 * * 5). 캡처는 checksum 기반
// 멱등이라 직전과 같은 상태면 기존 run을 재사용(unchanged=true)하고, 워크벤치의 수동
// "지금 스냅샷" 버튼과 같은 저장 경로를 쓴다 — 임시 재실행/수동 병행이 안전하다.
export async function GET(req: NextRequest) {
  // 인증은 아래 CRON_SECRET Bearer 하나뿐이다 — Vercel 이 크론에 붙이는 건 그 헤더이지
  // x-vercel-cron 이 아니다. 근거는 app/api/cron/sync-branch/route.ts 주석 참조. (2026-08-28)
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    const result = await captureWeeklyCloseSnapshot("cron:ledger-weekly-close")
    return NextResponse.json({ ok: true, unchanged: result.unchanged, run: result.run })
  } catch (error) {
    console.error("[GET /api/cron/ledger-weekly-close]", error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
