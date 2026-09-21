/**
 * customer-receipt — 접수 확인을 고객에게 알린다(문자 / 알림톡).
 *
 * 지금까지 접수 후속 처리는 전부 내부용이었다 — 리드 미러 + WeCom ops 알림. 고객이 받는
 * 것은 모달 안 1회성 화면과 "담당자가 연락드립니다" 한 문장뿐이고, 그 화면을 닫으면
 * 아무 흔적도 남지 않았다.
 *
 * 채널을 문자·알림톡으로 잡은 이유: `phone` 은 쇼룸 예약·도입 신청 **양쪽 폼 모두
 * 필수 항목**이라 커버리지가 100% 다. 이메일은 둘 다 선택 필드여서 받은 사람에게만
 * 보낼 수 있었다.
 *
 * 알림톡 템플릿은 카카오 비즈니스 채널에서 사전 승인이 필요하다. 승인 전에는 문자로
 * 나가고, 템플릿 ID 환경변수가 채워지는 순간 알림톡으로 바뀐다 — 코드 변경 없이.
 *
 * 발송 실패는 접수를 되돌리지 않는다. `lib/messaging/send.ts` 는 미설정·dry-run 을
 * 시뮬레이션으로 흡수하고 예외를 던지지 않으며, 모든 시도를 `message_logs` 에 남긴다.
 */

import "server-only"

import { sendKakaoAlimtalk, sendSmsMessages } from "@/lib/messaging/send"
import type { MessageContext, SendResult } from "@/lib/messaging/types"

/**
 * 알림톡 템플릿 ID. 비어 있으면 문자로 보낸다.
 *
 * 승인된 템플릿의 본문 변수와 아래 `variables` 키가 맞아야 하므로, 템플릿을 등록할 때는
 * 이 파일의 변수 이름을 그대로 쓴다.
 */
function readTemplateId(envKey: string): string | null {
  const value = process.env[envKey]?.trim()
  return value && value.length > 0 ? value : null
}

/** `2026-09-24` → `9/24(목)`. 문자 길이를 아끼려고 짧게 쓴다. */
function formatShortDate(iso: string): string {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!parsed) return iso
  const [, year, month, day] = parsed
  const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay()
  return `${Number(month)}/${Number(day)}(${"일월화수목금토"[weekday]})`
}

function formatAmount(amount: number, currency: string): string {
  if (currency === "KRW") return `₩${amount.toLocaleString("ko-KR")}`
  if (currency === "USD") return `$${amount.toLocaleString("en-US")}`
  return `${amount.toLocaleString("ko-KR")} ${currency}`
}

/**
 * 품목 요약 한 줄. 문자에 전 품목을 펼치면 LMS 로 넘어가고 읽히지도 않는다.
 * "86" 전자칠판 외 2건" 형태로 접는다.
 */
function summarizeItems(items: ReadonlyArray<{ name: string }>): string {
  if (items.length === 0) return "구성 미지정"
  if (items.length === 1) return items[0].name
  return `${items[0].name} 외 ${items.length - 1}건`
}

/**
 * 알림톡 템플릿이 있으면 알림톡, 없으면 문자.
 *
 * 알림톡의 `disableSms` 는 기본값(true, 대체발송 차단)을 그대로 쓴다 — 대체발송은 별도
 * 과금·설정 대상이라 여기서 조용히 켜지 않는다. 대신 발송 결과를 그대로 돌려주므로
 * 호출부가 실패를 로그로 남길 수 있다.
 */
async function sendReceipt(params: {
  templateEnvKey: string
  to: string
  smsText: string
  variables: Record<string, string>
  context: MessageContext
}): Promise<SendResult> {
  const templateId = readTemplateId(params.templateEnvKey)

  if (templateId) {
    return sendKakaoAlimtalk({
      to: params.to,
      templateId,
      variables: params.variables,
      context: params.context,
    })
  }

  return sendSmsMessages({
    messages: [{ to: params.to, text: params.smsText }],
    context: params.context,
  })
}

export interface ShowroomBookingReceipt {
  bookingId: string
  phone: string
  visitDate: string
  visitTime: string
}

/**
 * 쇼룸 예약 접수 확인.
 *
 * 1차가 **요청형**이라(담당자가 확인 후 확정) 문구가 "확정"으로 읽히면 안 된다 —
 * 화면과 같은 약속만 적는다.
 */
export async function sendShowroomBookingReceipt(
  receipt: ShowroomBookingReceipt
): Promise<SendResult> {
  const when = `${formatShortDate(receipt.visitDate)} ${receipt.visitTime}`

  return sendReceipt({
    templateEnvKey: "SOLAPI_TEMPLATE_SHOWROOM_BOOKING",
    to: receipt.phone,
    smsText: [
      "[클래스인] 목동 쇼룸 방문 예약이 접수되었습니다.",
      `희망 일시: ${when}`,
      "담당자가 확인 후 확정 연락을 드립니다. 확정 전까지 일정은 조정될 수 있습니다.",
    ].join("\n"),
    variables: { "#{일시}": when },
    context: { source: "showroom_booking", refId: receipt.bookingId },
  })
}

export interface CheckoutRequestReceipt {
  requestId: string
  phone: string
  desiredDate: string
  items: ReadonlyArray<{ name: string }>
  totalAmount: number
  currency: string
}

/** 도입 신청 접수 확인. 금액은 화면이 마지막으로 보여준 값과 같은 기준(부가세 별도)이다. */
export async function sendCheckoutRequestReceipt(
  receipt: CheckoutRequestReceipt
): Promise<SendResult> {
  const desired = formatShortDate(receipt.desiredDate)
  const summary = summarizeItems(receipt.items)
  const total = formatAmount(receipt.totalAmount, receipt.currency)

  return sendReceipt({
    templateEnvKey: "SOLAPI_TEMPLATE_CHECKOUT_REQUEST",
    to: receipt.phone,
    smsText: [
      "[클래스인] 도입 신청이 접수되었습니다.",
      `구성: ${summary} / ${total} (부가세 별도)`,
      `희망일: ${desired}`,
      "담당자가 1영업일 내에 연락드려 결제·설치 일정을 함께 잡아드립니다.",
    ].join("\n"),
    variables: { "#{구성}": summary, "#{합계}": total, "#{희망일}": desired },
    context: { source: "checkout_request", refId: receipt.requestId },
  })
}
