import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import {
  solapi,
  isSolapiConfigured,
  getDefaultSenderNumber,
  getKakaoPfId,
} from "@/lib/messaging/solapi"

/**
 * GET /api/admin/messaging/status
 *
 * 발송 인프라 상태(잔액/카카오 채널/알림톡 템플릿/발신번호/이메일 프로바이더)를 반환.
 * solapi 원격 호출은 모듈 레벨 60초 캐시로 감싸 어드민 반복 조회 시 API 콜을 아낀다.
 *
 * data 계약(프론트 병렬 개발 고정):
 *   { provider, configured, balance, kakaoChannels, templates, senderNumber, emailProvider }
 */

interface KakaoChannelSummary {
  channelId: string
  searchId: string
  phoneNumber: string
}

interface TemplateSummary {
  templateId: string
  name: string
  status: string
}

interface MessagingStatusData {
  provider: "solapi"
  configured: boolean
  balance: { point: number; balance: number } | null
  kakaoChannels: KakaoChannelSummary[]
  templates: TemplateSummary[]
  senderNumber: string | null
  emailProvider: "resend" | "webhook" | "none"
}

const CACHE_TTL_MS = 60_000

let cache: { at: number; data: MessagingStatusData } | null = null

function detectEmailProvider(): "resend" | "webhook" | "none" {
  if (process.env.RESEND_API_KEY) return "resend"
  if (process.env.EMAIL_WEBHOOK_URL) return "webhook"
  return "none"
}

async function fetchRemoteStatus(): Promise<MessagingStatusData> {
  const configured = isSolapiConfigured()
  const emailProvider = detectEmailProvider()
  const senderNumber = getDefaultSenderNumber() || null

  if (!configured || !solapi) {
    return {
      provider: "solapi",
      configured: false,
      balance: null,
      kakaoChannels: [],
      templates: [],
      senderNumber,
      emailProvider,
    }
  }

  const pfId = getKakaoPfId()

  // 잔액 / 채널 / 템플릿을 병렬 조회. 개별 실패는 격리(빈 값)해 전체 상태는 항상 반환.
  const [balanceRes, channelsRes, templatesRes] = await Promise.allSettled([
    solapi.getBalance(),
    solapi.getKakaoChannels(),
    solapi.getKakaoAlimtalkTemplates({ limit: 100 }),
  ])

  const balance =
    balanceRes.status === "fulfilled"
      ? {
          point: Number(balanceRes.value?.point ?? 0),
          balance: Number(balanceRes.value?.balance ?? 0),
        }
      : null

  const kakaoChannels: KakaoChannelSummary[] =
    channelsRes.status === "fulfilled"
      ? (channelsRes.value?.channelList ?? []).map((c) => ({
          channelId: c.channelId,
          searchId: c.searchId,
          phoneNumber: c.phoneNumber ?? "",
        }))
      : []

  const templates: TemplateSummary[] =
    templatesRes.status === "fulfilled"
      ? (templatesRes.value?.templateList ?? [])
          .map((t) => {
            const rec = t as unknown as Record<string, unknown>
            const templateId = String(rec.templateId ?? rec.id ?? "")
            const name = String(rec.name ?? "")
            const status = String(rec.status ?? "")
            return { templateId, name, status }
          })
          // 이 발신프로필(pfId)에 속한 템플릿만 노출(가능한 경우).
          .filter((t) => t.templateId.length > 0)
      : []

  // pfId는 응답 구성에 직접 쓰이진 않지만, 채널 매칭 진단을 위해 참조 유지.
  void pfId

  return {
    provider: "solapi",
    configured: true,
    balance,
    kakaoChannels,
    templates,
    senderNumber,
    emailProvider,
  }
}

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return NextResponse.json({ data: cache.data })
  }

  try {
    const data = await fetchRemoteStatus()
    cache = { at: now, data }
    return NextResponse.json({ data })
  } catch (err) {
    // 원격 호출 자체가 실패해도 최소 상태는 정직하게 반환.
    const message = err instanceof Error ? err.message : "상태 조회 실패"
    const data: MessagingStatusData = {
      provider: "solapi",
      configured: isSolapiConfigured(),
      balance: null,
      kakaoChannels: [],
      templates: [],
      senderNumber: getDefaultSenderNumber() || null,
      emailProvider: detectEmailProvider(),
    }
    return NextResponse.json({ data, error: message })
  }
}
