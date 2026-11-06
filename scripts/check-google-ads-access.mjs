/**
 * Google Ads API 접근 상태 확인 — 읽기만 한다. 아무것도 바꾸지 않는다.
 *
 *   npm run check:google-ads            (고객 ID: GOOGLE_ADS_CUSTOMER_ID, 없으면 395)
 *   node scripts/check-google-ads-access.mjs 3951743288
 *
 * lib/google/ads.ts 의 기본 인증(공용 서비스 계정)으로 찔러 보고, 막힌 곳이 연동 절차
 * (docs/active/google-ads-accounts-2026-11-03.md §5)의 몇 번째 단계인지 말해 준다.
 * 배포·크론을 기다리지 않고 콘솔 작업이 먹었는지 바로 확인하는 용도다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { google } from "googleapis"

const API = "https://googleads.googleapis.com/v25" // lib/google/ads.ts 의 API_VERSION 과 맞춘다

function loadEnvLocal() {
  try {
    const text = readFileSync(join(process.cwd(), ".env.local"), "utf-8")
    for (const line of text.split("\n")) {
      const m = /^([A-Z_0-9]+)=(.*)$/.exec(line.trim())
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
  } catch {
    // .env.local 이 없으면 이미 주입된 환경변수를 쓴다
  }
}

/** 오류 본문 → 다음에 할 단계. 문자열로 찾는다 — 상태 코드는 셋 다 403 이라 못 가른다. */
function nextStep(body) {
  if (body.includes("SERVICE_DISABLED")) return "① GCP 프로젝트에서 Google Ads API 를 사용 설정하세요 (설정 직후 몇 분 걸림)"
  if (body.includes("NOT_APPROVED") || body.includes("TEST_ACCOUNT")) return "① Google Ads API 개요 페이지에서 Explorer 등급을 신청하세요 (아직 Test 등급)"
  if (body.includes("USER_PERMISSION_DENIED") || body.includes("CUSTOMER_NOT_FOUND") || body.includes("NOT_ADS_USER"))
    return "② 광고 계정 › 관리자 › 액세스 및 보안에 서비스 계정을 읽기 전용으로 추가하세요"
  return "알 수 없는 오류 — 위 본문을 확인하세요"
}

loadEnvLocal()
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")
if (!email || !key) {
  console.error("GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY 가 없습니다 (.env.local 확인)")
  process.exit(1)
}
const customerId = (process.argv[2] ?? process.env.GOOGLE_ADS_CUSTOMER_ID ?? "3951743288").replace(/[^0-9]/g, "")
console.log(`서비스 계정: ${email}\n고객 ID: ${customerId}`)

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: email, private_key: key },
  scopes: ["https://www.googleapis.com/auth/adwords"],
})
const headers = { Authorization: `Bearer ${await auth.getAccessToken()}`, "Content-Type": "application/json" }

const res = await fetch(`${API}/customers/${customerId}/googleAds:search`, {
  method: "POST",
  headers,
  body: JSON.stringify({ query: "SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1" }),
})
const body = await res.text()
if (res.ok) {
  const customer = JSON.parse(body).results?.[0]?.customer ?? {}
  console.log(`✓ 읽기 성공 — ${customer.descriptiveName ?? "(이름 없음)"} · ${customer.currencyCode ?? "통화 미상"}`)
  console.log("→ ③ Vercel 에 GOOGLE_ADS_CUSTOMER_ID 를 넣고 재배포하면 다음 크론(05:35 KST)부터 쌓입니다")
} else {
  // 본문은 길다 — 상태·오류 코드·메시지 앞부분만 보인다(판정은 전체 본문으로 한다).
  let reason = body.slice(0, 300)
  try {
    const error = JSON.parse(body).error
    const codes = (error.details ?? []).flatMap((d) => (d.errors ?? []).map((e) => JSON.stringify(e.errorCode)))
    reason = `${error.status} ${codes.join(", ")} — ${String(error.message ?? "").slice(0, 160)}`
  } catch {
    // JSON 이 아니면 본문 앞부분을 그대로 보인다
  }
  console.log(`✗ ${res.status} ${reason}`)
  console.log(`→ ${nextStep(body)}`)
  process.exitCode = 1
}
