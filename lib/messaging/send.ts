import "server-only"

import {
  solapi,
  getDefaultSenderNumber,
  getKakaoPfId,
  isDryRun,
  normalizePhoneNumber,
} from "@/lib/messaging/solapi"
import { insertMessageLogs } from "@/lib/messaging/message-log-repository"
import type {
  MessageChannel,
  MessageContext,
  MessageLogStatus,
  RecipientSendResult,
  SendAlimtalkParams,
  SendResult,
  SendSmsParams,
} from "@/lib/messaging/types"

/**
 * ─────────────────────────────────────────────────────────────
 * messaging/send.ts  —  실발송 오케스트레이션
 * ─────────────────────────────────────────────────────────────
 *
 * [원칙] 발송 결과를 절대 부풀리지 않는다.
 *   - solapi 응답의 groupInfo.count / failedMessageList를 해석해
 *     sent/failed를 정확히 집계한다.
 *   - 클라이언트 null(자격증명 없음) 또는 MESSAGING_DRY_RUN=1 이면
 *     실발송 없이 status "simulated"로 기록하고 정직한 결과를 반환한다.
 *   - 모든 발송은 per-recipient로 message_logs에 기록한다.
 */

// solapi send() 응답 형태(부분). SDK 타입에 직접 의존하지 않고 방어적으로 해석한다.
interface SolapiGroupCount {
  total?: number
  registeredSuccess?: number
  registeredFailed?: number
  sentSuccess?: number
  sentFailed?: number
}
interface SolapiFailedMessage {
  to?: string
  statusCode?: string
  statusMessage?: string
  messageId?: string
}
interface SolapiSendResponse {
  groupInfo?: {
    groupId?: string
    count?: SolapiGroupCount
  }
  failedMessageList?: SolapiFailedMessage[]
  messageList?: Array<{
    messageId?: string
    statusCode?: string
    statusMessage?: string
  }>
}

/** solapi 에러 객체에서 사람이 읽을 메시지를 안전하게 추출. */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const anyErr = err as { errorMessage?: string; message?: string }
    return anyErr.errorMessage || anyErr.message || String(err)
  }
  if (typeof err === "object" && err !== null) {
    const anyErr = err as { errorMessage?: string; message?: string }
    return anyErr.errorMessage || anyErr.message || JSON.stringify(err)
  }
  return String(err)
}

/**
 * MessageNotReceivedError(모든 접수 실패)에서 failedMessageList를 안전 추출.
 * SDK가 이 에러에 failedMessageList를 담아준다.
 */
function extractFailedList(err: unknown): SolapiFailedMessage[] {
  if (typeof err === "object" && err !== null) {
    const list = (err as { failedMessageList?: unknown }).failedMessageList
    if (Array.isArray(list)) return list as SolapiFailedMessage[]
  }
  return []
}

/**
 * dry-run/미설정 시 요청 전체를 simulated로 기록·반환.
 */
async function simulate(
  channel: MessageChannel,
  recipients: string[],
  opts: { templateId?: string | null; context?: MessageContext }
): Promise<SendResult> {
  const results: RecipientSendResult[] = recipients.map((to) => ({
    to,
    status: "simulated" as MessageLogStatus,
  }))

  await insertMessageLogs(
    recipients.map((to) => ({
      channel,
      provider: "solapi" as const,
      recipient: to,
      templateId: opts.templateId ?? null,
      groupId: null,
      status: "simulated" as MessageLogStatus,
      context: { ...(opts.context ?? {}), dryRun: true },
    }))
  )

  return {
    provider: "solapi",
    channel,
    requested: recipients.length,
    sent: 0,
    failed: 0,
    simulated: recipients.length,
    results,
  }
}

/**
 * solapi send() 응답을 per-recipient 결과 + 집계로 해석한다.
 * 성공/실패 판정은 오직 응답 데이터에 근거한다(부풀리기 금지).
 */
function interpretResponse(
  channel: MessageChannel,
  recipients: string[],
  response: SolapiSendResponse
): SendResult {
  const groupId = response.groupInfo?.groupId
  const failedList = response.failedMessageList ?? []

  // 실패한 수신자 집합(전화번호 기준). solapi는 정규화된 번호를 돌려줄 수 있어 정규화 비교.
  const failedMap = new Map<string, SolapiFailedMessage>()
  for (const f of failedList) {
    if (f.to) failedMap.set(normalizePhoneNumber(f.to), f)
  }

  const results: RecipientSendResult[] = recipients.map((to) => {
    const failed = failedMap.get(normalizePhoneNumber(to))
    if (failed) {
      return {
        to,
        status: "failed",
        statusCode: failed.statusCode,
        error: failed.statusMessage || failed.statusCode,
        messageId: failed.messageId,
      }
    }
    return { to, status: "sent" }
  })

  const failedCount = results.filter((r) => r.status === "failed").length
  const sentCount = results.length - failedCount

  return {
    provider: "solapi",
    channel,
    requested: recipients.length,
    sent: sentCount,
    failed: failedCount,
    simulated: 0,
    groupId,
    results,
    ...(failedCount > 0 && sentCount === 0
      ? { error: failedList[0]?.statusMessage || failedList[0]?.statusCode || "전체 발송 실패" }
      : {}),
  }
}

/**
 * 전체 접수 실패(MessageNotReceivedError 등)를 결과로 변환.
 */
function buildFailureResult(
  channel: MessageChannel,
  recipients: string[],
  err: unknown
): SendResult {
  const failedList = extractFailedList(err)
  const failedMap = new Map<string, SolapiFailedMessage>()
  for (const f of failedList) {
    if (f.to) failedMap.set(normalizePhoneNumber(f.to), f)
  }
  const message = extractErrorMessage(err)

  const results: RecipientSendResult[] = recipients.map((to) => {
    const failed = failedMap.get(normalizePhoneNumber(to))
    return {
      to,
      status: "failed" as MessageLogStatus,
      statusCode: failed?.statusCode,
      error: failed?.statusMessage || failed?.statusCode || message,
    }
  })

  return {
    provider: "solapi",
    channel,
    requested: recipients.length,
    sent: 0,
    failed: recipients.length,
    simulated: 0,
    results,
    error: message,
  }
}

/** 결과를 message_logs에 per-recipient 기록. */
async function logResults(
  result: SendResult,
  opts: { templateId?: string | null; context?: MessageContext }
): Promise<void> {
  await insertMessageLogs(
    result.results.map((r) => ({
      channel: result.channel,
      provider: "solapi" as const,
      recipient: r.to,
      templateId: opts.templateId ?? null,
      groupId: result.groupId ?? null,
      status: r.status,
      statusCode: r.statusCode ?? null,
      error: r.error ?? null,
      context: opts.context ?? {},
    }))
  )
}

/* ─────────────────────────────────────────────────────────────
   SMS / LMS 발송
   ───────────────────────────────────────────────────────────── */

/**
 * SMS/LMS 발송. autoTypeDetect로 바이트 기준 SMS/LMS를 solapi가 자동 판별한다.
 * (90자 하드코딩 없음 — solapi가 처리)
 */
export async function sendSmsMessages(params: SendSmsParams): Promise<SendResult> {
  const from = params.from ? normalizePhoneNumber(params.from) : getDefaultSenderNumber()
  const recipients = params.messages.map((m) => normalizePhoneNumber(m.to))
  const context: MessageContext = { ...(params.context ?? {}) }

  // 발송할 게 없으면 빈 결과.
  if (params.messages.length === 0) {
    return {
      provider: "solapi",
      channel: "sms",
      requested: 0,
      sent: 0,
      failed: 0,
      simulated: 0,
      results: [],
    }
  }

  // dry-run / 미설정 → 시뮬레이션.
  if (!solapi || isDryRun()) {
    return simulate("sms", recipients, { context })
  }

  const payload = params.messages.map((m) => ({
    to: normalizePhoneNumber(m.to),
    from,
    text: m.text,
    autoTypeDetect: true,
  }))

  try {
    const response = (await solapi.send(payload)) as unknown as SolapiSendResponse
    const result = interpretResponse("sms", recipients, response)
    await logResults(result, { context })
    return result
  } catch (err) {
    const result = buildFailureResult("sms", recipients, err)
    await logResults(result, { context })
    return result
  }
}

/* ─────────────────────────────────────────────────────────────
   카카오 알림톡 발송
   ───────────────────────────────────────────────────────────── */

/**
 * 카카오 알림톡 발송(단건).
 * kakaoOptions: { pfId, templateId, variables, disableSms }.
 * pfId는 env SOLAPI_KAKAO_PF_ID 우선, 미설정 시 확정 채널 상수 폴백.
 */
export async function sendKakaoAlimtalk(params: SendAlimtalkParams): Promise<SendResult> {
  const to = normalizePhoneNumber(params.to)
  const from = params.from ? normalizePhoneNumber(params.from) : getDefaultSenderNumber()
  const pfId = getKakaoPfId()
  const context: MessageContext = { ...(params.context ?? {}) }
  const templateId = params.templateId

  // dry-run / 미설정 → 시뮬레이션.
  if (!solapi || isDryRun()) {
    return simulate("kakao_alimtalk", [to], { templateId, context })
  }

  const payload = {
    to,
    from,
    kakaoOptions: {
      pfId,
      templateId,
      variables: params.variables ?? {},
      // 기본 true: 알림톡 실패 시 SMS 대체발송 차단(의도치 않은 과금·발송 방지).
      disableSms: params.disableSms ?? true,
    },
  }

  try {
    const response = (await solapi.send(payload)) as unknown as SolapiSendResponse
    const result = interpretResponse("kakao_alimtalk", [to], response)
    await logResults(result, { templateId, context })
    return result
  } catch (err) {
    const result = buildFailureResult("kakao_alimtalk", [to], err)
    await logResults(result, { templateId, context })
    return result
  }
}
