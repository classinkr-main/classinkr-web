import { NextRequest, NextResponse } from "next/server"

import { syncXiaoshouyiSnapshots } from "@/lib/external-crm/xiaoshouyi-sync"

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""

  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const result = await syncXiaoshouyiSnapshots("cron")
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
