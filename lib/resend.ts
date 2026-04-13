import { Resend } from "resend"

const apiKey = process.env.RESEND_API_KEY

if (!apiKey) {
  console.warn("[RESEND] RESEND_API_KEY 환경변수가 설정되지 않았습니다.")
}

export const resend = apiKey ? new Resend(apiKey) : null
