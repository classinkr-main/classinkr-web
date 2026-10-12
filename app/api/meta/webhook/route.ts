import { createHmac, timingSafeEqual } from "crypto"
import { after, NextRequest, NextResponse } from "next/server"

import { fetchMetaLeadDetail } from "@/lib/meta/lead-ads-graph"
import {
  buildLeadCapturePayload,
  extractLeadValues,
  type MetaLeadDetail,
  type MetaLeadValue,
  type MetaWebhookPayload,
} from "@/lib/meta/lead-ads-payload"
import {
  isLeadgenOwnedByLedger,
  recordMetaLeadgenReceipts,
  resolveMetaLeadgenCutover,
  type MetaLeadgenCutover,
} from "@/lib/meta/leadgen-cutover"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// compass 모드의 after() 미러 시도(제출 행을 최대 20초 기다림)가 이 예산 안에서 돈다
// (Next 16.2 after "Duration" — 라우트 maxDuration 을 따른다). 설계 META-RECEIVER-FINAL §4-2 H5.
export const maxDuration = 30

/** webhook after() 경로가 Compass 제출 행을 기다리는 최대 시간 */
const COMPASS_MIRROR_WAIT_MS = 20_000

type SubmitLeadCapture = typeof import("@/lib/server/lead-capture").submitLeadCapture

function verifyMetaSignature(payload: string, signature: string | null) {
  const appSecret = process.env.META_APP_SECRET?.trim()
  // 시크릿이 미설정일 때만 로컬 개발 우회를 허용한다(FAIL CLOSED).
  // Vercel(프리뷰 포함)에서는 VERCEL이 항상 설정되므로 절대 우회 불가.
  if (!appSecret) {
    return process.env.NODE_ENV === "development" && !process.env.VERCEL
  }

  // 시크릿이 설정돼 있으면 서명 헤더 부재를 허용으로 처리하지 않는다.
  if (!signature?.startsWith("sha256=")) {
    return false
  }

  try {
    const received = Buffer.from(signature.slice("sha256=".length), "hex")
    const expected = Buffer.from(
      createHmac("sha256", appSecret).update(payload).digest("hex"),
      "hex"
    )

    return received.length === expected.length && timingSafeEqual(received, expected)
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim()

  if (mode === "subscribe" && token && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: "Meta webhook verification failed." }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const { submitLeadCapture } = await import("@/lib/server/lead-capture")
  const rawBody = await req.text()
  const signature = req.headers.get("x-hub-signature-256")

  if (!verifyMetaSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid Meta signature." }, { status: 403 })
  }

  let payload: MetaWebhookPayload
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }

  if (payload.object !== "page") {
    return NextResponse.json({ ok: true, ignored: payload.object ?? "unknown" })
  }

  const leads = extractLeadValues(payload)

  // 여기서부터 모드 분기(설계 META-RECEIVER-FINAL §2-1). 위의 검증·서명·JSON·object 확인은 모드와 무관하다.
  // 모드를 못 읽거나 env META_LEADGEN_FORCE_ADMIN=1 이면 admin(지금 경로)이다.
  // leadgen 이 없는 이벤트는 모드를 읽지 않는다 — 지금 본문이 received 0 을 그대로 돌려준다.
  const resolution = leads.length ? await resolveMetaLeadgenCutover() : null

  if (resolution?.mode === "compass") {
    return handleCompassMode(leads, resolution.cutover, submitLeadCapture)
  }

  if (resolution?.mode === "shadow") {
    // 측정용 증인 — 실패해도 지금 경로는 그대로 돈다
    try {
      await recordMetaLeadgenReceipts(leads, "shadow")
    } catch (error) {
      console.warn("[meta/webhook] shadow 수신 증인 기록 실패(무시):", errorMessage(error))
    }
  }

  // admin·shadow: 지금 본문. 단 mirror_since 가 있으면(한 번이라도 compass 였음) 원장이 이미 가진
  // leadgen 은 건너뛴다 — 롤백 직후 미러·폴백과의 경합 중복 차단. 원장이 비어 있는 동안에는 동작 불변.
  const owned = await ledgerOwnedLeadgens(leads, resolution?.cutover ?? null)
  const pending = owned.size ? leads.filter((lead) => !owned.has(lead.leadgen_id!)) : leads
  const skipped = leads.length - pending.length

  const results = await Promise.allSettled(
    pending.map(async (lead) => {
      let detail: MetaLeadDetail | undefined

      try {
        detail = await fetchMetaLeadDetail(lead.leadgen_id!)
      } catch (error) {
        console.error("[meta/webhook] lead detail fetch failed:", error)
      }

      const result = await submitLeadCapture(buildLeadCapturePayload(lead, detail))
      if (result.status >= 400) {
        throw new Error(JSON.stringify(result.body))
      }

      return result.body
    })
  )

  const failed = results.filter((result) => result.status === "rejected").length

  return NextResponse.json({
    ok: true,
    received: leads.length,
    processed: pending.length - failed,
    failed,
    ...(skipped ? { skipped } : {}),
  })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function ledgerOwnedLeadgens(leads: MetaLeadValue[], cutover: MetaLeadgenCutover | null) {
  if (!cutover?.mirrorSince || !leads.length) return new Set<string>()
  return isLeadgenOwnedByLedger(
    leads.map((lead) => lead.leadgen_id!),
    cutover
  )
}

/**
 * compass 모드 — Compass 가 Meta 에서 가져와 저장한다. 어드민은 Graph 를 부르지 않고 증인만 적는다.
 * 증인 RPC 성공 → after() 로 미러 시도 → 200.
 * 증인 RPC 실패 → 그 자리에서 옛 경로로 저장(Graph 상세 필수). 하나라도 실패하면 500 → Meta 재전송.
 */
async function handleCompassMode(
  leads: MetaLeadValue[],
  cutover: MetaLeadgenCutover | null,
  submitLeadCapture: SubmitLeadCapture
) {
  const leadgenIds = [...new Set(leads.map((lead) => lead.leadgen_id!))]

  try {
    await recordMetaLeadgenReceipts(leads, "compass")
  } catch (error) {
    console.error("[meta/webhook] compass 수신 증인 기록 실패 — 옛 경로로 인라인 저장:", errorMessage(error))
    return captureInline(leads, cutover, submitLeadCapture)
  }

  after(async () => {
    try {
      const { runMetaLeadMirror } = await import("@/lib/server/meta-lead-mirror")
      await runMetaLeadMirror({
        trigger: "webhook",
        leadgenIds,
        waitForCompassMs: COMPASS_MIRROR_WAIT_MS,
      })
    } catch (error) {
      // 미러 크론이 다시 한다 — 응답은 이미 나갔다
      console.error("[meta/webhook] after() 미러 시도 실패:", errorMessage(error))
    }
  })

  return NextResponse.json({ ok: true, mode: "compass", received: leads.length })
}

async function captureInline(
  leads: MetaLeadValue[],
  cutover: MetaLeadgenCutover | null,
  submitLeadCapture: SubmitLeadCapture
) {
  // 미러·폴백이 이미 행을 만든 leadgen(재전송)은 다시 저장하지 않는다. 원장을 못 읽으면 전부 저장한다.
  const owned = await ledgerOwnedLeadgens(leads, cutover)
  const pending = owned.size ? leads.filter((lead) => !owned.has(lead.leadgen_id!)) : leads
  const skipped = leads.length - pending.length

  const results = await Promise.allSettled(
    pending.map(async (lead) => {
      // 상세 필수 — 빈 껍데기 행을 만들지 않는다. 실패는 500 → Meta 재전송으로 다시 받는다.
      const detail = await fetchMetaLeadDetail(lead.leadgen_id!)
      if (!detail || typeof detail !== "object") {
        throw new Error("Meta lead detail is empty.")
      }

      const result = await submitLeadCapture(buildLeadCapturePayload(lead, detail))
      if (result.status >= 400) {
        throw new Error(`submitLeadCapture ${result.status}: ${JSON.stringify(result.body)}`)
      }

      return result.body
    })
  )

  const failed = results.filter((result) => result.status === "rejected").length
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[meta/webhook] compass 인라인 저장 실패:", errorMessage(result.reason))
    }
  }

  const body = {
    ok: failed === 0,
    mode: "compass" as const,
    inline: true,
    received: leads.length,
    processed: pending.length - failed,
    failed,
    ...(skipped ? { skipped } : {}),
  }

  return NextResponse.json(body, { status: failed ? 500 : 200 })
}
