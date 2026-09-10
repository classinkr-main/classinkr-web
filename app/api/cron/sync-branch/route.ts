import { NextRequest, NextResponse } from "next/server"
import { runAll } from "@/lib/branch/sync/run-all"
import { runBranchRevLinkMaintenance } from "@/lib/repositories/crm-source-links"

export async function GET(req: NextRequest) {
  // 인증은 아래 CRON_SECRET Bearer 하나뿐이다. 예전에 그 앞에 x-vercel-cron 헤더를
  // 필수로 요구하는 게이트가 있었는데, Vercel 이 크론 요청에 실제로 붙이는 건
  // Authorization: Bearer $CRON_SECRET 이지 그 헤더가 아니다 — 그래서 크론 11종이
  // 본문 실행 전에 전부 401 로 잘렸다. 이 라우트만으로도 인과가 두 번 확인된다:
  // 게이트 추가(2026-06-24) 직후 정지 → 게이트 없는 배포(07-02) 에서 매일 부활 →
  // 재추가(07-07) 직후 다시 정지. 되살리지 말 것. (2026-08-28)
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const result = await runAll({ trigger: "cron" })
  const crmLinks = result.ok ? await runBranchRevLinkMaintenance() : undefined
  return NextResponse.json({ ...result, crmLinks })
}
