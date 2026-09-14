import { NextRequest, NextResponse } from "next/server"
import { revalidateTag, unstable_cache } from "next/cache"

import { verifyAdmin } from "@/lib/admin-auth"
import { shareInFlight } from "@/lib/server/share-in-flight"
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
 * solapi 원격 호출은 Data Cache(60초)로 감싸 어드민 반복 조회 시 API 콜을 아낀다.
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

// admin-performance-round3-2026-09-10.md §3.2 — route-local Map(cache)은 Vercel Fluid 콜드
// 인스턴스마다 비어 있어 매번 solapi 원격 호출(잔액·채널·템플릿 3콜)을 다시 태웠다.
// unstable_cache(Data Cache)로 교체해 인스턴스 간 공유한다. TTL은 옛 CACHE_TTL_MS와 같은
// 60초로 유지한다.
//
// 무효화 배선은 없다 — 이 값은 solapi(외부 SaaS) 계정의 잔액/채널/템플릿 상태를 그대로
// 반사한 것이라 우리 쪽 쓰기 경로가 없다(메시지 발송이 잔액을 깎지만, 발송은 알림/캠페인
// 전 영역에서 초 단위로 일어날 수 있는 고빈도 이벤트라 여기에 걸면 캐시가 사실상 항상
// 미스로 돌아간다 — intake-today와 같은 이유). TTL만이 신선도 수단이고, Phase 4 원칙에
// 따라 60초를 그대로 둔다.
const MESSAGING_STATUS_CACHE_TAG = "messaging-status"

const getCachedMessagingStatus = unstable_cache(
  // 인자가 없는 조회 — shareInFlight로 콜드 인스턴스의 동시 미스를 합치고 dev·test에서
  // JSON 안전성을 검사한다. fetchRemoteStatus는 Promise.allSettled로 개별 원격 호출 실패를
  // 이미 흡수하므로 여기서 reject하는 경우는 드물지만, reject하면 unstable_cache가 그
  // 실패를 캐시하지 않아(perf 라우트와 동일 계약) 다음 호출이 자연히 재시도한다.
  () => shareInFlight("messaging-status-v1", fetchRemoteStatus),
  ["messaging-status-v1"],
  { revalidate: 60, tags: [MESSAGING_STATUS_CACHE_TAG] }
)

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const fresh = req.nextUrl.searchParams.get("fresh") === "1"
  try {
    // fresh=1: 태그를 먼저 하드 만료시킨 뒤(perf 라우트와 동일 패턴) 캐시된 함수를 불러
    // 재계산 + 재적재한다.
    if (fresh) revalidateTag(MESSAGING_STATUS_CACHE_TAG, { expire: 0 })
    const data = await getCachedMessagingStatus()
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
