/**
 * 팀원 캘린더 접근 상태 확인 — 읽기만 한다. 아무것도 바꾸지 않는다.
 *
 *   node scripts/check-team-calendar-access.mjs
 *
 * 팀원 캘린더는 두 길 중 하나로 열린다. 이 스크립트는 **둘 다** 찔러 보고 어느 쪽이
 * 살아 있는지 말해 준다(lib/team-member-calendars.ts 가 실제로 쓰는 순서와 같다):
 *
 *   ① 도메인 전체 위임 — 관리자가 관리 콘솔에서 1회. 팀원은 아무것도 안 한다.
 *   ② 개인별 공유      — 팀원이 각자 서비스 계정 주소에 캘린더를 공유한다.
 *
 * 왜 이게 필요한가: 화면에 "0건"으로 보일 때 그게 "일정이 없다"인지 "권한이 없다"인지
 * 구별이 안 된다. 실패 모양도 헷갈린다 — 위임 미부여는 403/404 가 아니라
 * **토큰 교환의 `unauthorized_client`(숫자 code 401)** 다. 숫자만 보면 못 잡는다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { google } from "googleapis"

const SCOPE = "https://www.googleapis.com/auth/calendar.readonly"

function loadEnvLocal() {
  try {
    const text = readFileSync(join(process.cwd(), ".env.local"), "utf-8")
    for (const line of text.split("\n")) {
      const m = /^([A-Z_0-9]+)=(.*)$/.exec(line.trim())
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
      }
    }
  } catch {
    // .env.local 이 없으면 이미 주입된 환경변수를 쓴다(CI 등)
  }
}

function members() {
  const raw = process.env.TEAM_CALENDAR_MEMBERS?.trim()
  if (raw) return JSON.parse(raw)
  return JSON.parse(readFileSync(join(process.cwd(), "data", "team-calendars.json"), "utf-8"))
}

function credentials() {
  const client_email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const private_key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")
  if (!client_email || !private_key) {
    console.error("GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY 가 없습니다 (.env.local 확인)")
    process.exit(1)
  }
  return { client_email, private_key }
}

function calendarClient(creds, subject) {
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [SCOPE],
    ...(subject ? { clientOptions: { subject } } : {}),
  })
  return google.calendar({ version: "v3", auth })
}

async function probe(creds, email, subject) {
  try {
    const cal = calendarClient(creds, subject)
    const res = await cal.events.list({ calendarId: email, maxResults: 1 })
    return { ok: true, events: res.data.items?.length ?? 0 }
  } catch (error) {
    const message = (error?.message ?? String(error)).split("\n")[0]
    return {
      ok: false,
      code: error?.code,
      message: message.slice(0, 120),
      delegationDenied: /unauthorized_client|access_denied|invalid_grant/i.test(message),
    }
  }
}

loadEnvLocal()

const creds = credentials()
const roster = members()

console.log(`서비스 계정 : ${creds.client_email}`)
console.log(`팀원        : ${roster.length}명`)
console.log("")

let viaDelegation = 0
let viaSharing = 0

for (const m of roster) {
  const delegated = await probe(creds, m.email, m.email)
  if (delegated.ok) {
    viaDelegation++
    console.log(`  ✅ ${m.name} (${m.email}) — 위임으로 읽힘`)
    continue
  }
  const shared = await probe(creds, m.email, null)
  if (shared.ok) {
    viaSharing++
    console.log(`  ✅ ${m.name} (${m.email}) — 개인 공유로 읽힘`)
    continue
  }
  const why = delegated.delegationDenied ? "위임 미부여" : `code ${delegated.code}`
  console.log(`  ❌ ${m.name} (${m.email}) — ${why} · 공유도 없음(code ${shared.code})`)
}

console.log("")
console.log(`위임으로 읽히는 인원  : ${viaDelegation}/${roster.length}`)
console.log(`개인 공유로 읽히는 인원: ${viaSharing}/${roster.length}`)

if (viaDelegation + viaSharing === 0) {
  console.log("")
  console.log("두 길이 다 막혀 있습니다. 둘 중 하나를 여세요:")
  console.log("  ① 도메인 전체 위임 (관리자 1회, 팀원은 아무것도 안 함)")
  console.log("     admin.google.com → 보안 → 액세스 및 데이터 제어 → API 제어")
  console.log("     → 도메인 전체 위임 관리 → 새로 추가")
  console.log("     클라이언트 ID = 서비스 계정의 고유 ID(21자리, Cloud Console 에서 확인)")
  console.log(`     OAuth 범위    = ${SCOPE}`)
  console.log("  ② 개인별 공유 (팀원 각자)")
  console.log("     구글 캘린더 → 내 캘린더 설정 → 특정 사용자와 공유 → 사용자 추가")
  console.log(`     ${creds.client_email} · 권한 "모든 이벤트 세부정보 보기"`)
}
