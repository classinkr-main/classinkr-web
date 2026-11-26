import { NextRequest, NextResponse } from "next/server"

import { DistributorSettlementsNotReadyError } from "@/lib/repositories/distributor-settlements"
import { confirmDistributorQuote } from "@/lib/server/distributor-settlement-issue"

// 총판이 공유 링크에서 [견적 확인]을 누른다(2026-11-24).
//
// POST {name?} — 200 {confirmedAt, confirmedByName, alreadyConfirmed}. 처음 확인할 때만 총판에게 확인 메일,
// 사내에 알림이 간다(다시 눌러도 한 번뿐). 404 링크 없음·발행 전·취소. 503 마이그레이션 미적용.
// 토큰(48자 hex)이 곧 권한이다 — 고객 견적 동의 링크와 같은 방식.

type RouteParams = { params: Promise<{ token: string }> }

const TOKEN_RE = /^[0-9a-f]{48}$/

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { token } = await params
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "총판 견적서를 찾을 수 없습니다." }, { status: 404 })

  const body = (await req.json().catch(() => null)) as { name?: unknown } | null
  if (body !== null && (typeof body !== "object" || Array.isArray(body))) {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 })
  }
  const rawName = typeof body?.name === "string" ? body.name.trim() : ""
  if (rawName.length > 60) return NextResponse.json({ error: "이름은 60자까지 입력할 수 있습니다." }, { status: 400 })

  try {
    const outcome = await confirmDistributorQuote({
      token,
      confirmedByName: rawName || null,
      origin: req.nextUrl.origin,
    })
    if (outcome.status === "not_found") {
      return NextResponse.json({ error: "총판 견적서를 찾을 수 없습니다." }, { status: 404 })
    }
    return NextResponse.json({
      confirmedAt: outcome.settlement.confirmedAt,
      confirmedByName: outcome.settlement.confirmedByName,
      alreadyConfirmed: outcome.status === "already_confirmed",
    })
  } catch (error) {
    if (error instanceof DistributorSettlementsNotReadyError) {
      return NextResponse.json({ error: "지금은 확인을 받을 수 없습니다. 담당자에게 알려 주세요." }, { status: 503 })
    }
    console.error("[share/distributor-quote/confirm] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "확인을 저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요." }, { status: 500 })
  }
}
