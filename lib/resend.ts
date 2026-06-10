import { Resend } from "resend"

const apiKey = process.env.RESEND_API_KEY

// 미설정 경고는 모듈 로드 시점이 아니라 실제 발송 시점(sendViaResend)에서 처리한다.
export const resend = apiKey ? new Resend(apiKey) : null
