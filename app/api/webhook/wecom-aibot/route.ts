import { createHash, randomUUID } from "crypto"
import { after, NextRequest, NextResponse } from "next/server"

import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { answerWecomMessage, parseInboundMessage, type BridgeReply } from "@/lib/wecom/aibot-bridge"
import { readWecomAibotConfig, type WecomAibotConfig } from "@/lib/wecom/aibot-config"
import { buildEncryptedReply, decryptMessage, verifySignature, withinTimestampWindow } from "@/lib/wecom/aibot-crypto"
import { buildWecomBridgeDeps, getWecomDedupStore, sendResponseMarkdown } from "@/lib/wecom/aibot-server"

// 위컴(企业微信) 지능형 로봇 API 모드 URL 콜백 — 방에서 갈매봇에게 묻기. 정본: docs/active/wecom-aibot-bridge.md
// 스위치: WECOM_AIBOT_TOKEN·WECOM_AIBOT_ENCODING_AES_KEY·WECOM_AIBOT_ID·WECOM_AIBOT_USER_MAP 이 모두 있고
// msgid 중복 제거 저장소가 있어야 열린다(운영은 Upstash 필수). 아니면 없는 경로처럼 404.
// GET: URL 검증(msg_signature·timestamp·nonce·echostr → 1초 안에 평문, 101033).
// POST: {"encrypt"} 본문 → 서명·시각 창(±5분)·크기 상한·요청 제한 → 복호화 → msgid 중복 제거 → 보낸 사람 확인 →
//       조율기 → 위컴 글. 짧으면 바로(스트림 finish), 길면 "확인 중" 스트림으로 답하고 after 로 response_url 에 한 번.
// 로그에는 글 내용·userid 원문을 싣지 않는다(해시·결과 코드만).
export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 512 * 1024
const TIMESTAMP_WINDOW_SECONDS = 300
/** 콜백 응답 안에서 답을 기다리는 시간. 로봇 콜백의 응답 제한 시간은 문서에 숫자가 없다(자체 앱 콜백은 5초) — 넉넉히 짧게. */
export const INLINE_BUDGET_MS = 2500
const IP_RATE_LIMIT = { windowMs: 60_000, max: 300 }
const USER_RATE_LIMIT = { windowMs: 60_000, max: 20 }
export const PENDING_TEXT = "확인 중입니다 — 답이 준비되면 이 대화에 다시 올립니다."
export const RATE_LIMITED_TEXT = "요청이 너무 잦습니다. 잠시 뒤 다시 물어봐 주세요."

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 })
const emptyOk = () => new NextResponse(null, { status: 200 })
const hashOf = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 12)
const log = (line: string) => console.info(`[wecom-aibot] ${line}`)

type Gate = { ok: true; config: WecomAibotConfig; store: NonNullable<ReturnType<typeof getWecomDedupStore>> } | { ok: false }

function openGate(): Gate {
  const config = readWecomAibotConfig()
  if (!config.ok) return { ok: false }
  const store = getWecomDedupStore()
  if (!store) {
    log("closed reason=claim_store_missing")
    return { ok: false }
  }
  return { ok: true, config: config.config, store }
}

/** 쿼리의 base64 값 — URL 해독에서 "+" 가 공백으로 바뀐 것을 되돌린다(101033 "需要做Urldecode处理"). */
const queryValue = (req: NextRequest, name: string) => (req.nextUrl.searchParams.get(name) ?? "").replace(/ /g, "+")

export async function GET(req: NextRequest) {
  const gate = openGate()
  if (!gate.ok) return notFound()
  const signature = queryValue(req, "msg_signature")
  const timestamp = queryValue(req, "timestamp")
  const nonce = queryValue(req, "nonce")
  const echostr = queryValue(req, "echostr")
  if (!signature || !timestamp || !nonce || !echostr) return NextResponse.json({ error: "Bad request" }, { status: 400 })
  if (!withinTimestampWindow(timestamp, Date.now(), TIMESTAMP_WINDOW_SECONDS)) return NextResponse.json({ error: "Stale" }, { status: 401 })
  if (!verifySignature({ token: gate.config.token, timestamp, nonce, encrypt: echostr, signature })) {
    log("verify rejected reason=signature")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const plain = decryptMessage(echostr, gate.config.key, "")
    // 따옴표·BOM·줄바꿈 없이 평문 그대로(101033).
    return new NextResponse(plain, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } })
  } catch {
    log("verify rejected reason=decrypt")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

function streamReply(config: WecomAibotConfig, nonce: string, content: string) {
  const plaintext = JSON.stringify({ msgtype: "stream", stream: { id: `galmae-${randomUUID()}`, finish: true, content } })
  const envelope = buildEncryptedReply({ plaintext, token: config.token, key: config.key, nonce, timestamp: Date.now() / 1000 })
  return NextResponse.json(envelope, { status: 200, headers: { "Cache-Control": "no-store" } })
}

export async function POST(req: NextRequest) {
  const gate = openGate()
  if (!gate.ok) return notFound()
  const { config, store } = gate

  const ip = getClientIp(req)
  const ipLimit = await checkRateLimitDistributed(ip, "wecom-aibot", IP_RATE_LIMIT)
  if (!ipLimit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const declared = Number(req.headers.get("content-length") ?? "0")
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 })
  const raw = await req.text().catch(() => "")
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 })

  const signature = queryValue(req, "msg_signature")
  const timestamp = queryValue(req, "timestamp")
  const nonce = queryValue(req, "nonce")
  if (!signature || !timestamp || !nonce) return NextResponse.json({ error: "Bad request" }, { status: 400 })
  if (!withinTimestampWindow(timestamp, Date.now(), TIMESTAMP_WINDOW_SECONDS)) {
    log("rejected reason=timestamp_window")
    return NextResponse.json({ error: "Stale" }, { status: 401 })
  }

  let encrypt = ""
  try {
    const body = JSON.parse(raw) as { encrypt?: unknown }
    encrypt = typeof body?.encrypt === "string" ? body.encrypt : ""
  } catch {
    encrypt = ""
  }
  if (!encrypt) return NextResponse.json({ error: "Bad request" }, { status: 400 })
  if (!verifySignature({ token: config.token, timestamp, nonce, encrypt, signature })) {
    log("rejected reason=signature")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let message: ReturnType<typeof parseInboundMessage> = null
  try {
    message = parseInboundMessage(JSON.parse(decryptMessage(encrypt, config.key, "")))
  } catch {
    log("rejected reason=decrypt")
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  if (!message) return NextResponse.json({ error: "Bad request" }, { status: 400 })
  if (message.aibotid !== config.botId) {
    log("ignored reason=other_bot")
    return emptyOk()
  }
  // 스트림 새로고침·이벤트 — 이 수신구는 첫 답에서 스트림을 끝내므로(finish true) 따로 답할 것이 없다.
  if (message.msgtype === "stream" || message.msgtype === "event") return emptyOk()
  if (message.chattype === "group" && config.allowedChatIds.size && !(message.chatid && config.allowedChatIds.has(message.chatid))) {
    log("ignored reason=chat_not_allowed")
    return emptyOk()
  }

  const msgKey = hashOf(message.msgid)
  try {
    if ((await store.claim(msgKey)) === "already_used") {
      log(`duplicate msg=${msgKey}`)
      return emptyOk()
    }
  } catch {
    // 저장소에 닿지 못하면 처리하지 않는다(닫힘) — 위컴이 다시 보내면 그때 처리한다.
    log("rejected reason=claim_store_error")
    return NextResponse.json({ error: "Unavailable" }, { status: 503 })
  }

  const userKey = hashOf(message.fromUserId)
  const userLimit = await checkRateLimitDistributed(userKey, "wecom-aibot-user", USER_RATE_LIMIT)
  if (!userLimit.allowed) return streamReply(config, nonce, RATE_LIMITED_TEXT)

  const started = Date.now()
  const inbound = message
  const answer: Promise<BridgeReply> = answerWecomMessage(inbound, buildWecomBridgeDeps(config))
  let timer: ReturnType<typeof setTimeout> | undefined
  const inline = await Promise.race([
    answer,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), INLINE_BUDGET_MS)
    }),
  ])
  if (timer) clearTimeout(timer)

  if (inline) {
    log(`answered chat=${inbound.chattype} user=${userKey} msg=${msgKey} outcome=${inline.outcome} mode=inline ms=${Date.now() - started}`)
    return streamReply(config, nonce, inline.markdown)
  }

  // 길면 — 응답을 돌려주기 전에 after 로 등록한다(응답이 닫힌 뒤 등록하면 돌지 않는다).
  const responseUrl = inbound.responseUrl
  after(async () => {
    const reply = await answer
    const sent = responseUrl ? await sendResponseMarkdown(responseUrl, reply.markdown) : { ok: false, status: null }
    log(
      `answered chat=${inbound.chattype} user=${userKey} msg=${msgKey} outcome=${reply.outcome} mode=response_url sent=${sent.ok ? "ok" : `fail:${sent.status ?? "none"}`} ms=${Date.now() - started}`
    )
  })
  return streamReply(config, nonce, responseUrl ? PENDING_TEXT : `${PENDING_TEXT} (답 주소가 없어 다시 올리지 못할 수 있습니다 — 어드민 갈매봇에서 물어봐 주세요.)`)
}
