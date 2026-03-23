/**
 * ─────────────────────────────────────────────────────────────
 * /api/newsletter/subscribe  —  뉴스레터 구독 (공개 API)
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-14] 공개 엔드포인트 (인증 불필요)
 *   홈페이지 푸터, FinalCTA 등에서 이메일만으로 간편 구독.
 *   옵트인 동의 timestamp 자동 기록.
 *
 * [NOTE-15] 기존 리드 시스템과의 연동
 *   구독 완료 후 /api/lead에도 전달하여
 *   Google Sheets, Channel Talk 등 기존 웹훅에도 기록 유지.
 */

import { NextRequest, NextResponse } from "next/server"
import { upsertSubscriber, getSubscriberByEmail } from "@/lib/marketing-data"
import type { NewsletterSubscribeRequest } from "@/lib/marketing-types"

export async function POST(req: NextRequest) {
  try {
    const body: NewsletterSubscribeRequest = await req.json()

    if (!body.email) {
      return NextResponse.json(
        { error: "이메일은 필수입니다." },
        { status: 400 }
      )
    }

    // 이메일 형식 기본 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { error: "올바른 이메일 형식이 아닙니다." },
        { status: 400 }
      )
    }

    // [NOTE-6] 이미 active 상태면 중복 안내
    const existing = await getSubscriberByEmail(body.email)
    if (existing && existing.status === "active") {
      return NextResponse.json({
        ok: true,
        message: "이미 구독 중입니다.",
        alreadySubscribed: true,
      })
    }

    // 구독자 등록 (신규 또는 재구독)
    await upsertSubscriber({
      name: body.name || body.email.split("@")[0],
      email: body.email,
      tags: body.tags ?? [],
      source: "newsletter",
    })

    /**
     * [NOTE-15] 기존 리드 웹훅에도 전달 (선택적)
     * Google Sheets 등에 뉴스레터 구독 이벤트를 함께 기록.
     */
    const googleSheetUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL
    if (googleSheetUrl) {
      fetch(googleSheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "newsletter",
          email: body.email,
          name: body.name || "",
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => { /* 실패해도 구독 자체는 성공 처리 */ })
    }

    return NextResponse.json({
      ok: true,
      message: "구독이 완료되었습니다.",
    })
  } catch {
    return NextResponse.json(
      { error: "잘못된 요청입니다." },
      { status: 400 }
    )
  }
}
